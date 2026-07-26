#!/usr/bin/env node
/**
 * List the documents still missing art, as ready-to-paste prompt lines.
 *
 *   node tools/art-todo.mjs            # everything still unwired
 *   node tools/art-todo.mjs weapon     # just one type
 *   node tools/art-todo.mjs weapon 12  # first 12 of that type
 *
 * Emits `  <path> — <name>: <notes>` so an image-generation prompt can be built
 * from the COMPENDIUM DATA rather than by hand. Typing paths by hand silently
 * produced an orphaned image in this module (an "IWS DLK MK 6.webp" that matched
 * neither the Armed Variant nor the Utility Machine), and the wiring tool
 * correctly skipped the real documents — so the miss only showed up as a short
 * count. Generating the paths removes that whole class of error.
 *
 * Uses the same slug rule as tools/set-art.mjs; keep them in step.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const [wantType, limitArg] = process.argv.slice(2);
const limit = Number(limitArg) || Infinity;
const SRC = "packs-src";

const slugify = (name) => name
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const strip = (html) => String(html ?? "")
  .replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ").trim();

const rows = [];
for (const pack of readdirSync(SRC)) {
  let files;
  try { files = readdirSync(join(SRC, pack)); } catch { continue; }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(SRC, pack, file), "utf8"));
    if (!doc.system) continue;
    if ((doc.img ?? "").includes("/assets/")) continue;       // already has art
    if (wantType && doc.type !== wantType) continue;

    const rel = doc.type === "vehicle"
      ? `assets/vehicle_portraits/${slugify(doc.name)}.webp`
      : `assets/item_icons/${doc.type}/${slugify(doc.name)}.webp`;
    if (existsSync(rel)) continue;                            // image already made
    rows.push({ rel, name: doc.name, type: doc.type, note: strip(doc.system.notes).slice(0, 90) });
  }
}

rows.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
const shown = rows.slice(0, limit);
for (const r of shown) console.log(`  ${r.rel} — ${r.name}${r.note ? `: ${r.note}` : ""}`);
console.error(`\n${shown.length} shown of ${rows.length} still missing art${wantType ? ` (type ${wantType})` : ""}.`);
