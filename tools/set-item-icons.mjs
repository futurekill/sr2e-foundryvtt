#!/usr/bin/env node
/**
 * Point compendium items at their custom icons.
 *
 *   npm run item-icons              # report what would change
 *   npm run item-icons -- --fix     # write it into packs-src
 *
 * Item icons are 256x256 WebP with an OPAQUE dark background, living in
 * `assets/item_icons/<pack>/<kebab-name>.webp`. (Token art is different — 1024
 * and transparent — see tools/set-vehicle-tokens.mjs.)
 *
 * The mapping is name → kebab-slug, so no per-item table is needed: an item
 * called "Corp Security Chief" looks for `corp-security-chief.webp`. Items whose
 * icon file does not exist yet are reported and left alone, so this can be run
 * repeatedly while art is still being generated.
 *
 * Only packs listed in PACKS are touched, and only items still on a stock
 * Foundry icon (`icons/...`) or with no icon at all — an item already pointing at
 * custom art is never overwritten.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIX = process.argv.includes("--fix");
// Pack directory names, which double as the art subdirectory — so an art dir must
// match its pack dir EXACTLY. (assets/item_icons/adept_powers existed with an
// underscore while the pack is `adept-powers`; the mismatch meant every icon
// placed there would have been silently ignored.)
const PACKS = ["contacts", "races", "skills", "adept-powers", "traditions", "lifestyles"];
const SRC = "packs-src";
const ART = "assets/item_icons";

/** "Corp Security Chief" → "corp-security-chief" */
const slugify = (name) => name
  .toLowerCase()
  .replace(/['’.]/g, "")           // Mr. Johnson → mr-johnson
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const wired = [], missing = [], skipped = [];

for (const pack of PACKS) {
  const dir = join(SRC, pack);
  let files;
  try { files = readdirSync(dir); } catch { continue; }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if (!doc.system) continue;                       // folder entry

    const img = doc.img ?? "";
    // Never clobber art someone already chose.
    if (img.includes("/assets/")) { skipped.push(doc.name); continue; }

    const rel = `${ART}/${pack}/${slugify(doc.name)}.webp`;
    if (!existsSync(rel)) { missing.push(`${doc.name} (${rel})`); continue; }

    doc.img = `systems/sr2e/${rel}`;
    wired.push({ pack, name: doc.name, from: img || "(none)", to: rel });
    if (FIX) writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  }
}

const pad = (s, n) => String(s).padEnd(n);
if (wired.length) {
  console.log(`${FIX ? "WIRED" : "WOULD WIRE"} ${wired.length} item(s):\n`);
  console.log(`  ${pad("PACK", 10)}${pad("ITEM", 26)}${pad("WAS", 30)}NOW`);
  for (const w of wired) {
    console.log(`  ${pad(w.pack, 10)}${pad(w.name, 26)}${pad(w.from, 30)}${w.to.split("/").pop()}`);
  }
} else {
  console.log("Nothing to wire — every item either has custom art or is missing its file.");
}
if (missing.length) console.log(`\nIcon not generated yet (${missing.length}):\n  ${missing.join("\n  ")}`);
if (skipped.length) console.log(`\nAlready had custom art, left alone (${skipped.length}): ${skipped.join(", ")}`);
if (!FIX && wired.length) console.log("\nRe-run with --fix to write.");
