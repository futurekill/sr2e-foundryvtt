#!/usr/bin/env node
/**
 * Rewrite a VIA layout export so a Framework 16 macropad drives the SR2E macros.
 *
 *   1. In VIA: Configure → Save + Load → **Save Current Layout**  → my-pad.json
 *   2. node tools/via-layout.mjs my-pad.json > sr2e-pad.json
 *   3. In VIA: **Load Saved Layout** → sr2e-pad.json
 *
 * WHY IT WORKS FROM YOUR FILE RATHER THAN A CANNED ONE
 * ----------------------------------------------------
 * A VIA layout is keyed to the device: it carries `vendorProductId`, and the
 * `layers` arrays are in the board's own MATRIX order. Shipping a pre-made file
 * would mean inventing your VID/PID and guessing that order — VIA would either
 * refuse it or, worse, accept it and put every key in the wrong place. Starting
 * from your export means the device identity and key count are already correct
 * and this script only changes which keycode sits in each position.
 *
 * It refuses to guess: if the export does not have the expected number of keys,
 * it says so and stops rather than writing a layout that half-works.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Per-key RGB. VIA's layout file carries keycodes, not lighting — the Framework
 * pad's per-key colour is set through QMK/VIA's lighting controls, not here. The
 * colour scheme in docs/MACROS.md is a recommendation you apply by hand.
 */
import { readFileSync } from "node:fs";

const KEYS = 24;                    // Framework Laptop 16 RGB Macropad, 6 rows x 4

/**
 * Physical layout, row-major, top-left first. Twelve keys do real work; the rest
 * are left as KC_NO so nothing fires by accident from a pocket press.
 *
 * Row 1–3 are the ten hotbar digits plus the two page keys, which is everything
 * needed to reach all twenty macros. Rows 4–6 stay empty on purpose: bind them
 * yourself to native Foundry controls once you know which you actually reach for.
 */
const LAYOUT = [
  // row 1 — page-1 hot keys 1-4
  "KC_1", "KC_2", "KC_3", "KC_4",
  // row 2 — 5-8
  "KC_5", "KC_6", "KC_7", "KC_8",
  // row 3 — 9, 0, then the two page keys
  "KC_9", "KC_0", "KC_F13", "KC_F14",
  // rows 4-6 — deliberately unbound
  "KC_NO", "KC_NO", "KC_NO", "KC_NO",
  "KC_NO", "KC_NO", "KC_NO", "KC_NO",
  "KC_NO", "KC_NO", "KC_NO", "KC_NO"
];

const LEGEND = [
  ["1",  "Next Initiative Pass",              "green"],
  ["2",  "Refresh Pools (selected)",          "green"],
  ["3",  "Refresh Pools (whole combat)",      "green"],
  ["4",  "Apply Damage",                      "amber"],
  ["5",  "Recover Stun",                      "green"],
  ["6",  "Heal Physical",                     "green"],
  ["7",  "Toggle Astral Perception",          "blue"],
  ["8",  "Roll Initiative — All",             "green"],
  ["9",  "Clear Templates",                   "red"],
  ["0",  "Award Karma",                       "amber"],
  ["F13", "Hotbar page PREV",                 "white"],
  ["F14", "Hotbar page NEXT",                 "white"]
];

const file = process.argv[2];
if (!file) {
  console.error(`Usage: node tools/via-layout.mjs <exported-via-layout.json> > sr2e-pad.json

Export yours from VIA first: Configure → Save + Load → Save Current Layout.`);
  process.exit(1);
}

let src;
try { src = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error(`Could not read ${file} as JSON: ${e.message}`); process.exit(1); }

if (!Array.isArray(src.layers) || !src.layers.length) {
  console.error("That file has no `layers` array — it does not look like a VIA layout export.\n" +
                "In VIA use Save + Load → Save Current Layout (not the keyboard DEFINITION file).");
  process.exit(1);
}

const found = src.layers[0].length;
if (found !== KEYS) {
  console.error(
    `Expected ${KEYS} keys on layer 0 (Framework 16 macropad) but found ${found}.\n` +
    `Refusing to write a layout that would land keys in the wrong places.\n` +
    `If your pad genuinely has ${found} keys, edit KEYS and LAYOUT in this script.`);
  process.exit(1);
}

// Only layer 0 is rewritten. Any other layers you have set up are left untouched,
// because they are yours and this script has no idea what they are for.
const out = { ...src, layers: src.layers.map((layer, i) => i === 0 ? [...LAYOUT] : layer) };

process.stdout.write(JSON.stringify(out, null, 2) + "\n");

console.error(`\nRewrote layer 0 of ${file} (vendorProductId ${src.vendorProductId ?? "?"}).`);
console.error(`Load the result in VIA: Save + Load → Load Saved Layout.\n`);
console.error(`  key   macro                            suggested RGB`);
for (const [k, name, colour] of LEGEND) {
  console.error(`  ${k.padEnd(5)} ${name.padEnd(32)} ${colour}`);
}
console.error(`
Then in Foundry, Configure Controls → search "hotbar":
  bind Hotbar Page Previous → F13
  bind Hotbar Page Next     → F14

Rows 4-6 are left as KC_NO on purpose — bind them once you know which native
Foundry controls you actually reach for. Foundry only fires hotbar digits while
the CANVAS has focus; with the cursor in chat a key just types its digit.
`);
