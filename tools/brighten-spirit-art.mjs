#!/usr/bin/env node
/**
 * Lift the darkest spirit portraits toward the creature-portrait baseline.
 *
 *   npm run brighten-spirits            # report
 *   npm run brighten-spirits -- --fix   # write
 *
 * WHY. Spirit portraits span mean luminance 0.098 (earth-1) to 0.436
 * (desert-3); the 40 creature portraits average 0.309. The dark end vanishes
 * against a dark battle map. A blanket lift is wrong — it would blow out the
 * desert set, which is already brighter than the baseline.
 *
 * HOW, and why it is not a naive in-place filter:
 *  - Originals are copied ONCE to tools/art-src/ (outside assets/, so the set
 *    is not shipped twice) and every output is derived from there. Re-running
 *    never re-encodes an already-encoded file, so quality cannot compound.
 *  - A manifest records each source's SHA-256 and the gamma applied. A file
 *    whose source hash is unchanged is skipped. A marker that is keyed to
 *    content cannot lie the way a bare "already done" flag can.
 *  - Gamma is solved per image from its own median, not a fixed factor, so a
 *    file already at or above target is left completely alone.
 */
import { readdirSync, existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

const FIX = process.argv.includes("--fix");
const OUT = "assets/spirit_portraits";
const SRC = "tools/art-src/spirit_portraits";
const MANIFEST = "tools/art-src/spirit-brightness.json";
const TARGET_MEDIAN = 0.26;   // a touch under the creature MEAN; medians run lower
const MAX_GAMMA = 2.2;        // beyond this, lifting only greys out the blacks

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16);
const stat = (f, key) => Number(execFileSync("magick", [f, "-colorspace", "Gray", "-format", `%[fx:${key}]`, "info:"], { encoding: "utf8" }).trim());

// Seed the immutable source copy on first run. Keyed on CONTENTS, not on the
// directory existing: a dry run used to mkdir an empty folder, after which the
// real run believed seeding was already done and processed nothing.
const seeded = existsSync(SRC) && readdirSync(SRC).some(f => f.endsWith(".webp"));
if (!seeded) {
  if (FIX) {
    mkdirSync(SRC, { recursive: true });
    for (const f of readdirSync(OUT).filter(x => x.endsWith(".webp"))) copyFileSync(join(OUT, f), join(SRC, f));
    console.log(`seeded ${SRC} with the current portraits as immutable sources`);
  } else {
    console.log(`(would seed ${SRC} from ${OUT} — ${readdirSync(OUT).filter(f => f.endsWith(".webp")).length} files)`);
  }
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const files = existsSync(SRC) ? readdirSync(SRC).filter(f => f.endsWith(".webp")).sort() : [];
const rows = [];

for (const f of files) {
  const src = join(SRC, f), out = join(OUT, f);
  const hash = sha(src);
  const median = stat(src, "median");

  // gamma g maps median m -> m^(1/g). Solve for the target, clamp, and skip
  // anything already bright enough (gamma <= 1 means no lift needed).
  let gamma = median > 0 ? Math.log(median) / Math.log(TARGET_MEDIAN) : MAX_GAMMA;
  gamma = Math.min(MAX_GAMMA, gamma);
  const skip = gamma <= 1.02;

  const done = manifest[f];
  const unchanged = done && done.sha === hash && done.gamma === Number(gamma.toFixed(3)) && existsSync(out);

  if (FIX && !unchanged) {
    if (skip) copyFileSync(src, out);
    else execFileSync("magick", [src, "-gamma", gamma.toFixed(3), "-quality", "92", out]);
    manifest[f] = { sha: hash, gamma: Number(gamma.toFixed(3)), skipped: skip };
  }

  rows.push({ f, median, gamma, skip, unchanged, after: existsSync(out) ? stat(out, "median") : null });
}

if (FIX) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

const pad = (s, n) => String(s).padEnd(n);
const lifted = rows.filter(r => !r.skip);
console.log(`\n${FIX ? "BRIGHTENED" : "WOULD BRIGHTEN"} ${lifted.length} of ${rows.length} portraits (target median ${TARGET_MEDIAN})\n`);
console.log(`${pad("portrait", 34)}${pad("median", 9)}${pad("gamma", 8)}${pad("after", 8)}note`);
for (const r of rows.sort((a, b) => a.median - b.median)) {
  console.log(`${pad(r.f.replace(/\.webp$/, ""), 34)}${pad(r.median.toFixed(3), 9)}` +
              `${pad(r.skip ? "—" : r.gamma.toFixed(2), 8)}${pad(r.after == null ? "—" : r.after.toFixed(3), 8)}` +
              `${r.skip ? "already bright enough" : r.unchanged ? "unchanged (hash match)" : ""}`);
}
if (!FIX) console.log("\nRe-run with --fix to write.");
