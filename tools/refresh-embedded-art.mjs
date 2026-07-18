// Re-point embedded item art on packs-src actors to the generated item icons.
// A character's items are COPIES made when the item was dropped, so they keep
// their old placeholder img even after the compendium item gets art. This walks
// each actor's embedded items and, when a matching generated icon exists and the
// current img is a core placeholder (icons/…), points it at the new art.
//
//   node tools/refresh-embedded-art.mjs [pack ...]     (default: runners)
//
// Idempotent and safe: never touches a non-placeholder img (user/custom art),
// and only sets a path whose file actually ships. Re-run after more art lands.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const TYPE_DIR = {
  weapon: "weapons", armor: "armor", ammo: "ammo", focus: "foci",
  gear: "gear", cyberware: "cyberware", program: "programs", spell: "spells"
};
const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isPlaceholder = (img) => !img || img.startsWith("icons/");

const packs = process.argv.slice(2);
if (!packs.length) packs.push("runners");

let touchedItems = 0, touchedDocs = 0;
for (const pack of packs) {
  const dir = `packs-src/${pack}`;
  if (!existsSync(dir)) { console.error(`(skip ${pack} — no such pack)`); continue; }
  for (const jf of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const p = `${dir}/${jf}`;
    const d = JSON.parse(readFileSync(p, "utf8"));
    if (!Array.isArray(d.items) || !d.items.length) continue;
    let changed = 0;
    for (const it of d.items) {
      const idir = TYPE_DIR[it.type];
      if (!idir || !it.name || !isPlaceholder(it.img)) continue;
      const rel = `assets/item_icons/${idir}/${slug(it.name)}.webp`;
      if (!existsSync(rel)) continue;              // art not generated yet — leave placeholder
      it.img = `systems/sr2e/${rel}`;
      changed++;
    }
    if (changed) {
      writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
      touchedItems += changed; touchedDocs++;
    }
  }
}
console.log(`Updated ${touchedItems} embedded item icons across ${touchedDocs} actors (packs: ${packs.join(", ")}).`);
