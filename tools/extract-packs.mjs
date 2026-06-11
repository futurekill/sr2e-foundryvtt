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

/** Make a filesystem-safe filename fragment from a document name. */
function safeName(name) {
  return String(name ?? "unnamed")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "unnamed";
}

async function extractPack(packName) {
  const packPath = path.join(PACKS_DIR, packName);
  const outPath  = path.join(SRC_DIR, packName);

  const db = new ClassicLevel(packPath, { valueEncoding: "utf8" });
  const docs = [];
  for await (const [key, value] of db.iterator()) {
    const doc = JSON.parse(value);
    doc._key = key;   // preserve the full LevelDB key for the rebuild
    docs.push(doc);
  }
  await db.close();

  // Rewrite the source directory wholesale so deletions in Foundry propagate
  fs.rmSync(outPath, { recursive: true, force: true });
  fs.mkdirSync(outPath, { recursive: true });

  for (const doc of docs) {
    const file = `${safeName(doc.name)}_${doc._id ?? "noid"}.json`;
    fs.writeFileSync(path.join(outPath, file), JSON.stringify(doc, null, 2) + "\n");
  }
  console.log(`  ${packName}: ${docs.length} documents`);
  return docs.length;
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

console.log(`Extracting ${packs.length} pack(s) to packs-src/ …`);
let total = 0;
for (const pack of packs) total += await extractPack(pack);
console.log(`Done: ${total} documents extracted.`);
