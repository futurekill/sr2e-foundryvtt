#!/usr/bin/env node
/**
 * Trim the empty margin off vehicle portraits and pick each token's texture fit.
 *
 *   npm run fit-vehicles          # report
 *   npm run fit-vehicles -- --fix # rewrite the .webp files and packs-src
 *
 * WHY. The portraits are square 1024x1024 canvases with the vehicle drawn
 * nose-up down the middle, so most of the image is empty air — the Mitsubishi
 * Nightsky uses 25% of its canvas, and the median across the set is 50%.
 * Foundry's `contain` scales the WHOLE canvas, margin included, to fit the token
 * box, so the vehicle rendered at roughly half the size of its own footprint.
 * Trimming makes the image the vehicle, so it fills the box it was given.
 *
 * FOOTPRINTS ARE NOT TOUCHED. `set-vehicle-tokens.mjs` sets width/height from
 * real-world dimensions of the closest equivalent craft, which is a better
 * source than an artist's framing. In particular rotorcraft are deliberately
 * SQUARE because the rotor disc is what occupies the ground, while the art is
 * drawn to the fuselage — stretching a helicopter to fill 14x14 would be wrong.
 * That is why most vehicles keep `contain` here and only the ones whose box
 * genuinely matches their art get `fill`.
 *
 * Requires ImageMagick (`magick`), same as the other art tooling.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const FIX = process.argv.includes("--fix");
const DIR = "packs-src/vehicles";
const MARGIN = 12;            // px kept around the vehicle so it clears the token border
const FILL_TOLERANCE = 0.08;  // stretch only when the box is within 8% of the art

const trimBox = (file) => {
  const out = execFileSync("magick", [file, "-trim", "-format", "%w %h", "info:"], { encoding: "utf8" });
  const [w, h] = out.trim().split(/\s+/).map(Number);
  return { w, h };
};

const rows = [];
for (const file of readdirSync(DIR).filter(f => f.endsWith(".json"))) {
  const path = join(DIR, file);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (!doc.system || !doc.img) continue;

  const rel = doc.img.replace(/^systems\/sr2e\//, "");
  if (!existsSync(rel)) { console.log(`  missing art: ${doc.name} -> ${rel}`); continue; }

  const before = statSync(rel).size;
  const box = trimBox(rel);
  const pt = doc.prototypeToken ?? {};
  const artAspect = box.w / box.h;
  const boxAspect = (pt.width ?? 1) / (pt.height ?? 1);
  const err = Math.abs(artAspect - boxAspect) / artAspect;
  const fit = err <= FILL_TOLERANCE ? "fill" : "contain";

  if (FIX) {
    // Skip anything already trimmed, so re-running does not shave 12px each time.
    const full = execFileSync("magick", [rel, "-format", "%w %h", "info:"], { encoding: "utf8" })
      .trim().split(/\s+/).map(Number);
    if (full[0] > box.w + 2 * MARGIN || full[1] > box.h + 2 * MARGIN) {
      execFileSync("magick", [rel, "-trim", "+repage",
        "-bordercolor", "none", "-border", String(MARGIN), "-quality", "95", rel]);
    }
    doc.prototypeToken.texture.fit = fit;
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  }

  rows.push({ name: doc.name, box: `${pt.width}x${pt.height}`, content: `${box.w}x${box.h}`,
              used: Math.round(100 * (box.w * box.h) / (1024 * 1024)), fit,
              kb: Math.round(before / 1024) });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${FIX ? "FITTED" : "WOULD FIT"} ${rows.length} vehicle(s)\n`);
console.log(`${pad("vehicle", 32)}${pad("token", 8)}${pad("art content", 13)}${pad("canvas used", 13)}fit`);
for (const r of rows.sort((a, b) => a.used - b.used)) {
  console.log(`${pad(r.name, 32)}${pad(r.box, 8)}${pad(r.content, 13)}${pad(r.used + "%", 13)}${r.fit}`);
}
console.log(`\nfill: ${rows.filter(r => r.fit === "fill").length}  contain: ${rows.filter(r => r.fit === "contain").length}`);
if (!FIX) console.log("\nRe-run with --fix to write.");
