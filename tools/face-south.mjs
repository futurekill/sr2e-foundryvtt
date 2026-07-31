#!/usr/bin/env node
/**
 * One-shot: rotate vehicle token art 180 degrees so it points SOUTH.
 *
 * Foundry's token rotation 0 faces SOUTH (v13 foundry.mjs:92045) and movement
 * sets `rotation = toDegrees(ray.angle) - 90` (foundry.mjs:54091). Our art was
 * drawn nose-UP, which is 180 degrees out: drive east and the nose points west,
 * so every vehicle looked like it was reversing.
 *
 * There is no field to compensate with. `texture.rotation` exists in the schema
 * but is never read — the token mesh only consumes fit/scaleX/scaleY/anchor/tint
 * (foundry.mjs:140299). So the pixels have to move.
 *
 * IDEMPOTENCE: a marker file records that a directory has been converted, since
 * running twice would rotate a full 360 and silently look "fine" while wasting a
 * re-encode. Delete the marker only if you are certain the art is nose-up again.
 *
 *   node face-south.mjs <art-dir> [--fix]
 */
import { readdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const dir = process.argv[2];
const FIX = process.argv.includes("--fix");
if (!dir || !existsSync(dir)) { console.error(`usage: face-south.mjs <art-dir> [--fix]`); process.exit(1); }

const MARKER = join(dir, ".orientation");
// First LINE only — the marker carries an explanatory body after it, and
// trim()ing the whole file never equalled "south", so the guard silently
// failed and rotated a full 360 on the second run.
const current = existsSync(MARKER) ? readFileSync(MARKER, "utf8").split(/\r?\n/)[0].trim() : "north";

if (current === "south") {
  console.log(`${dir}: already south-facing (marker present) — nothing to do.`);
  process.exit(0);
}

const files = readdirSync(dir).filter(f => f.endsWith(".webp"));
console.log(`${dir}: ${files.length} portrait(s) currently ${current}-facing`);

if (!FIX) { console.log("  (dry run — pass --fix to rotate)"); process.exit(0); }

for (const f of files) {
  const p = join(dir, f);
  execFileSync("magick", [p, "-rotate", "180", "-quality", "95", p]);
}
writeFileSync(MARKER,
  "south\n" +
  "\n" +
  "Vehicle token art in this directory points SOUTH (nose down).\n" +
  "Foundry's token rotation 0 faces south, and movement rotates a token to its\n" +
  "direction of travel — nose-up art renders every vehicle driving backwards.\n" +
  "Any NEW vehicle art added here must be nose-down too.\n");
console.log(`  rotated ${files.length}, marker written`);
