/**
 * Build compendium packs (LevelDB) from the JSON sources in packs-src/.
 *
 * This is the inverse of extract-packs.mjs. Run it after editing the JSON
 * sources to regenerate the LevelDB packs Foundry actually loads:
 *
 *   npm run build-packs            # all packs
 *   npm run build-packs cyberware  # one pack
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
    batch.push({ type: "put", key, value: JSON.stringify(doc) });
  }

  fs.rmSync(packPath, { recursive: true, force: true });
  const db = new ClassicLevel(packPath, { valueEncoding: "utf8" });
  await db.batch(batch);
  await db.close();
  console.log(`  ${packName}: ${batch.length} documents`);
  return batch.length;
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

console.log(`Building ${packs.length} pack(s) from packs-src/ …`);
let total = 0;
for (const pack of packs) total += await buildPack(pack);
console.log(`Done: ${total} documents written.`);
