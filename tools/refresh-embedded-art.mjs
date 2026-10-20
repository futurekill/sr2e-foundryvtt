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

// Keep in step with the directories under assets/item_icons/ — a type missing
// here is silently skipped, which is how the sample runners' Shaman contact and
// the critters' Unarmed Strike kept their placeholders after that art shipped.
const TYPE_DIR = {
  weapon: "weapons", armor: "armor", ammo: "ammo", focus: "foci",
  gear: "gear", cyberware: "cyberware", program: "programs", spell: "spells",
  contact: "contacts", race: "races"
};
const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isPlaceholder = (img) => !img || img.startsWith("icons/");

// Every pack that ships actors carrying embedded items, not just the runners —
// critters have an Unarmed Strike each, and vehicles/ic can hold gear.
const packs = process.argv.slice(2);
if (!packs.length) packs.push("runners", "critters", "vehicles", "ic", "contact-npcs");

// The compendium's own art by type + name: item art named unlike the slug
// ("Killing Hands (M)" → killing-hands-m.webp) and types not in TYPE_DIR
// (skills, adept powers, traditions) are found here.
const byName = new Map();
for (const pack of readdirSync("packs-src")) {
  const dir = `packs-src/${pack}`;
  for (const jf of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let d; try { d = JSON.parse(readFileSync(`${dir}/${jf}`, "utf8")); } catch { continue; }
    if (d.type && d.name && d.img && !isPlaceholder(d.img) && existsSync(d.img.replace(/^systems\/sr2e\//, ""))) {
      byName.set(`${d.type}|${d.name.toLowerCase()}`, d.img);
    }
  }
}

// Embedded names that differ from their art's item (type|name → asset path).
const ALIAS = {
  "skill|demolition": "skills/demolitions", "skill|negotiate": "skills/negotiation",
  "skill|computers (b/r)": "skills/computer", "skill|computer theory": "skills/computer",
  "cyberware|smartgun link": "cyberware/smartlink", "weapon|natural attack": "weapons/natural-attack"
};
for (const [k, v] of Object.entries(ALIAS)) {
  if (existsSync(`assets/item_icons/${v}.webp`)) byName.set(k, `systems/sr2e/assets/item_icons/${v}.webp`);
}

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
      if (!it.name || !isPlaceholder(it.img)) continue;
      const idir = TYPE_DIR[it.type];
      const rel = idir ? `assets/item_icons/${idir}/${slug(it.name)}.webp` : null;
      // "Etiquette (Street)" / "Attack (Rating 4)" fall back to their base item's art.
      const base = it.name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
      const img = rel && existsSync(rel) ? `systems/sr2e/${rel}`
        : byName.get(`${it.type}|${it.name.toLowerCase()}`) ?? byName.get(`${it.type}|${base}`);
      if (!img) continue;                          // art not generated yet — leave placeholder
      it.img = img;
      changed++;
    }
    if (changed) {
      writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
      touchedItems += changed; touchedDocs++;
    }
  }
}
console.log(`Updated ${touchedItems} embedded item icons across ${touchedDocs} actors (packs: ${packs.join(", ")}).`);
