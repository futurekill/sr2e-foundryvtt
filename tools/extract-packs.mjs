/**
 * Extract compendium packs (LevelDB) to per-document JSON source files.
 *
 * The JSON files in packs-src/ are the version-controlled, human-reviewable
 * canonical form of the compendium data. Run this after editing packs inside
 * Foundry to pull those edits back into the sources:
 *
 *   npm run extract-packs            # all packs
 *   npm run extract-packs cyberware  # one pack
 *
 * Storage format: Foundry stores embedded documents as SEPARATE LevelDB
 * records (e.g. !actors.items!<actorId>.<itemId>), with the parent holding
 * child _id references. For readable sources, the children are re-nested
 * into their parents here; build-packs.mjs splits them back out. Legacy
 * inline arrays are passed through unchanged.
 *
 * Each document becomes packs-src/<pack>/<Name>_<id>.json, keyed for rebuild
 * by its `_key` field. Foundry must NOT have the system loaded while this
 * runs (LevelDB allows only one writer/reader process).
 */

import { ClassicLevel } from "classic-level";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PACKS_DIR  = path.join(__dirname, "..", "packs");
const SRC_DIR    = path.join(__dirname, "..", "packs-src");

const EMBEDDED = {
  actors: ["items", "effects"],
  items:  ["effects"]
};

/** Make a filesystem-safe filename fragment from a document name. */
function safeName(name) {
  return String(name ?? "unnamed")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "unnamed";
}

/** Re-nest split child records into a parent document. */
function nestDoc(doc, key, records) {
  const [, collection, id] = key.split("!");
  for (const field of EMBEDDED[collection] ?? []) {
    const refs = doc[field];
    if (!Array.isArray(refs) || refs.length === 0) continue;
    if (typeof refs[0] !== "string") continue;   // legacy inline — keep as-is

    doc[field] = refs.map(cid => {
      const child = records.get(`!${collection}.${field}!${id}.${cid}`);
      if (!child) return null;
      // Effects of an actor's embedded items nest one level deeper
      if (collection === "actors" && field === "items" &&
          Array.isArray(child.effects) && child.effects.length &&
          typeof child.effects[0] === "string") {
        child.effects = child.effects
          .map(eid => records.get(`!actors.items.effects!${id}.${cid}.${eid}`))
          .filter(Boolean);
      }
      return child;
    }).filter(Boolean);
  }
}

async function extractPack(packName) {
  const packPath = path.join(PACKS_DIR, packName);
  const outPath  = path.join(SRC_DIR, packName);

  const db = new ClassicLevel(packPath, { valueEncoding: "utf8" });
  const records = new Map();
  for await (const [key, value] of db.iterator()) {
    records.set(key, JSON.parse(value));
  }
  await db.close();

  // Rewrite the source directory wholesale so deletions in Foundry propagate
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });

  let count = 0;
  for (const [key, doc] of records) {
    // Top-level documents only — child records are re-nested into parents
    const collection = key.split("!")[1];
    if (collection.includes(".")) continue;
    nestDoc(doc, key, records);
    doc._key = key;
    const file = `${safeName(doc.name)}_${doc._id ?? "noid"}.json`;
    fs.writeFileSync(path.join(outPath, file), JSON.stringify(doc, null, 2) + "\n");
    count++;
  }
  console.log(`  ${packName}: ${count} documents`);
  return count;
}

const only  = process.argv[2];
const packs = fs.readdirSync(PACKS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => !only || name === only);

if (packs.length === 0) {
  console.error(only ? `No pack named "${only}" in packs/` : "No packs found.");
  process.exit(1);
}

console.log(`Extracting ${packs.length} pack(s) to packs-src/ \u2026`);
let total = 0;
for (const pack of packs) total += await extractPack(pack);
console.log(`Done: ${total} documents extracted.`);
