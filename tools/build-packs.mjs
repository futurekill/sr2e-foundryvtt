/**
 * Build compendium packs (LevelDB) from the JSON sources in packs-src/.
 *
 * This is the inverse of extract-packs.mjs. Run it after editing the JSON
 * sources to regenerate the LevelDB packs Foundry actually loads:
 *
 *   npm run build-packs            # all packs
 *   npm run build-packs cyberware  # one pack
 *
 * Storage format: Foundry stores embedded documents as SEPARATE LevelDB
 * records — e.g. an actor's items live at !actors.items!<actorId>.<itemId>
 * (and their effects at !actors.items.effects!<actorId>.<itemId>.<effectId>),
 * with the parent record holding only the child _id strings. Inline arrays
 * of embedded documents are silently dropped when Foundry migrates a pack,
 * so the JSON sources (which nest children for readability) are split here.
 *
 * Each target pack directory is replaced wholesale. Foundry must NOT have
 * the system loaded while this runs.
 */

import { ClassicLevel } from "classic-level";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PACKS_DIR  = process.env.PACKS_OUT ?? path.join(__dirname, "..", "packs");
const SRC_DIR    = path.join(__dirname, "..", "packs-src");

/** Embedded collections per top-level document collection. */
const EMBEDDED = {
  actors: ["items", "effects"],
  items:  ["effects"]
};

/**
 * Split a document's embedded collections into child LevelDB records,
 * replacing the parent's arrays with child-id references.
 */
function splitDoc(doc, key, batch) {
  const [, collection, id] = key.split("!");
  for (const field of EMBEDDED[collection] ?? []) {
    const children = doc[field];
    if (!Array.isArray(children) || children.length === 0) continue;
    if (typeof children[0] === "string") continue;   // already references

    doc[field] = children.map(c => c._id);
    for (const child of children) {
      if (!child._id) throw new Error(`${key}: embedded ${field} entry missing _id`);
      // Effects on an actor's embedded items nest one level deeper
      if (collection === "actors" && field === "items" &&
          Array.isArray(child.effects) && child.effects.length &&
          typeof child.effects[0] !== "string") {
        for (const eff of child.effects) {
          batch.push({
            type: "put",
            key: `!actors.items.effects!${id}.${child._id}.${eff._id}`,
            value: JSON.stringify(eff)
          });
        }
        child.effects = child.effects.map(e => e._id);
      }
      batch.push({
        type: "put",
        key: `!${collection}.${field}!${id}.${child._id}`,
        value: JSON.stringify(child)
      });
    }
  }
}

async function buildPack(packName) {
  const srcPath  = path.join(SRC_DIR, packName);
  const packPath = path.join(PACKS_DIR, packName);

  const files = fs.readdirSync(srcPath).filter(f => f.endsWith(".json"));
  const batch = [];
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(srcPath, file), "utf8"));
    const key = doc._key;
    if (!key) throw new Error(`${packName}/${file} is missing its _key field`);
    delete doc._key;   // the key lives in LevelDB, not in the stored document
    splitDoc(doc, key, batch);
    batch.push({ type: "put", key, value: JSON.stringify(doc) });
  }

  fs.rmSync(packPath, { recursive: true, force: true });
  const db = new ClassicLevel(packPath, { valueEncoding: "utf8" });
  await db.batch(batch);
  await db.close();
  console.log(`  ${packName}: ${files.length} documents (${batch.length} records)`);
  return files.length;
}

const only  = process.argv[2];
const packs = fs.readdirSync(SRC_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => !only || name === only);

if (packs.length === 0) {
  console.error(only ? `No pack named "${only}" in packs-src/` : "No pack sources found.");
  process.exit(1);
}

console.log(`Building ${packs.length} pack(s) from packs-src/ \u2026`);
let total = 0;
for (const pack of packs) total += await buildPack(pack);
console.log(`Done: ${total} documents written.`);
