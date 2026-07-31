#!/usr/bin/env node
/**
 * Downscale the generated dice textures and derive a bump map for each.
 *
 *   node tools/make-dice-bumps.mjs [--fix]
 *
 * Dice So Nice takes a colour `source` and an optional grayscale `bump` height
 * map. The bump is DERIVED from the colour map here rather than generated
 * separately: a separately generated bump would not line up with its own colour
 * map, which is the entire point of a bump map. Bright reads as raised — rivets,
 * circuit traces, glowing veins, grid lines all stand proud, which is what you
 * want in every one of these.
 *
 * Sources are generated at 1024 and shipped at 512. DSN's own textures are 256
 * (see modules/dice-so-nice/textures/standard.json), but those are packed into
 * an atlas; standalone files can afford the extra detail on a d20 face and the
 * whole set is still well under a megabyte.
 */
import { readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const FIX = process.argv.includes("--fix");
const DIR = "assets/dice_textures";
const SIZE = 512;

const sources = readdirSync(DIR)
  .filter(f => f.endsWith(".webp") && !f.endsWith(".bump.webp"))
  .sort();

const rows = [];
for (const f of sources) {
  const src = join(DIR, f);
  const bump = join(DIR, f.replace(/\.webp$/, ".bump.webp"));
  const before = statSync(src).size;

  if (FIX) {
    execFileSync("magick", [src, "-resize", `${SIZE}x${SIZE}`, "-quality", "92", src]);
    // Grayscale + auto-level: the height map is the colour map's luminance,
    // stretched to use the full range so shallow materials still emboss.
    execFileSync("magick", [src, "-colorspace", "Gray", "-auto-level",
      "-resize", `${SIZE}x${SIZE}`, "-quality", "92", bump]);
  }

  rows.push({
    f,
    dims: execFileSync("magick", [src, "-format", "%wx%h", "info:"], { encoding: "utf8" }).trim(),
    kb: Math.round(before / 1024),
    nowKb: FIX ? Math.round(statSync(src).size / 1024) : null,
    bumpKb: FIX ? Math.round(statSync(bump).size / 1024) : null
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${FIX ? "BUILT" : "WOULD BUILD"} ${rows.length} texture(s) + bump(s)\n`);
console.log(`${pad("texture", 26)}${pad("dims", 12)}${pad("was", 8)}${pad("now", 8)}bump`);
for (const r of rows) {
  console.log(`${pad(r.f, 26)}${pad(r.dims, 12)}${pad(r.kb + "K", 8)}${pad((r.nowKb ?? "-") + "K", 8)}${(r.bumpKb ?? "-")}K`);
}
if (FIX) {
  const total = readdirSync(DIR).reduce((n, f) => n + statSync(join(DIR, f)).size, 0);
  console.log(`\ntotal shipped: ${Math.round(total / 1024)}K`);
} else {
  console.log("\nRe-run with --fix to write.");
}
