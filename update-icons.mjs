/**
 * update-icons.mjs
 * Updates icons for lifestyles, traditions, and matrix programs compendia.
 * Usage: node update-icons.mjs
 */
import { ClassicLevel } from "classic-level";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Icon maps ───────────────────────────────────────────────────────────────

// Lifestyles: graduated from destitute → opulent
const LIFESTYLE_ICONS = {
  "streets":  "icons/environment/settlement/tent.webp",
  "squatter": "icons/environment/settlement/tent.webp",
  "low":      "icons/environment/settlement/house.webp",
  "middle":   "icons/environment/settlement/house.webp",
  "high":     "icons/environment/settlement/castle.webp",
  "luxury":   "icons/environment/settlement/castle.webp",
};

// Traditions: hermetic (academic) vs shamanic (nature) vs physical adept
function traditionIcon(name) {
  const n = name.toLowerCase();
  if (n.includes("hermetic"))       return "icons/magic/symbols/rune-sigil-red-orange.webp";
  if (n.includes("shaman"))         return "icons/magic/nature/leaf-oak-orange.webp";
  if (n.includes("physical adept")) return "icons/skills/melee/unarmed-punch.webp";
  return "icons/svg/magic-swirl.svg";
}

// Matrix programs: icon by program type (first word of name)
const PROGRAM_ICONS = {
  "attack":  "icons/skills/offense/sword.webp",
  "bod":     "icons/magic/defensive/shield-barrier-glowing-triangle-teal.webp",
  "evasion": "icons/magic/movement/trail-streak-zigzag-white.webp",
  "masking": "icons/magic/perception/eye-ringed-green.webp",
  "sensor":  "icons/tools/scribal/magnifying-glass.webp",
  "sleaze":  "icons/skills/social/theft-pickpocket.webp",
};

// ── Helper ──────────────────────────────────────────────────────────────────

async function updatePack(packName, iconFn) {
  const db = new ClassicLevel(resolve(__dirname, "packs", packName), { valueEncoding: "json" });
  let count = 0;
  const updates = [];
  for await (const [key, val] of db.iterator()) {
    if (!key.startsWith("!items!")) continue;
    const newImg = iconFn(val);
    if (newImg && newImg !== val.img) {
      updates.push([key, { ...val, img: newImg }]);
    }
  }
  for (const [key, val] of updates) {
    await db.put(key, val);
    console.log(`  ${packName} | ${val.name} → ${val.img}`);
    count++;
  }
  await db.compactRange("!", "~");
  await db.close();
  console.log(`  (${count} updated in ${packName})\n`);
}

// ── Main ────────────────────────────────────────────────────────────────────

await updatePack("lifestyles", v => LIFESTYLE_ICONS[v.name.toLowerCase()]);
await updatePack("traditions", v => traditionIcon(v.name));
await updatePack("programs",   v => {
  const type = v.name.toLowerCase().split(" ")[0];
  return PROGRAM_ICONS[type] ?? v.img;
});

console.log("Done.");
