#!/usr/bin/env node
/**
 * Diff compendium prices against the printed Street Gear table.
 *
 * The core book prints most gear TWICE and the two tables disagree in places
 * (see CLAUDE.md). An early import mixed them and invented a few values, which
 * is how player-visible prices drifted. `tools/data/street-gear-prices.tsv` is a
 * hand-verified transcription of the canonical list, read off rendered PDF pages
 * because the text layer mis-aligns these columns.
 *
 *   npm run audit-costs           # report drift
 *   npm run audit-costs -- --fix  # write the printed values into packs-src
 *
 * Only fields present in the reference are compared, so a partially transcribed
 * table is still useful — rows for items we do not ship are reported, not an error.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIX = process.argv.includes("--fix");
const REF = "tools/data/street-gear-prices.tsv";
const PACKS = "packs-src";

const rows = readFileSync(REF, "utf8").split("\n")
  .filter(l => l.trim() && !l.startsWith("#"))
  .map(l => {
    const [name, category, conceal, reach, damage, type, weight, avail, cost, streetIndex, pdfPage] = l.split("\t");
    return { name, category, conceal, reach, damage, type, weight, avail, cost, streetIndex, pdfPage };
  });

// Every item we ship, by name (packs-src is one JSON document per file).
const items = new Map();
for (const pack of readdirSync(PACKS)) {
  let files;
  try { files = readdirSync(join(PACKS, pack)); } catch { continue; }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const path = join(PACKS, pack, f);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if (doc.type === "Item" || !doc.system) continue;   // folders
    items.set(doc.name, { path, doc });
  }
}

// A formula price ("100*strMin") is carried by the Str-Min fields, not `cost`.
const isFormula = (c) => /\*/.test(c ?? "");
const num = (v) => (v === "" || v == null ? null : Number(v));

const drift = [];
const unshipped = [];
for (const r of rows) {
  const hit = items.get(r.name);
  if (!hit) { unshipped.push(r.name); continue; }
  const sys = hit.doc.system;
  const checks = [];

  if (isFormula(r.cost)) {
    const [per] = r.cost.split("*");
    checks.push(["costPerStrengthMin", Number(per), sys.costPerStrengthMin]);
  } else if (num(r.cost) !== null) {
    checks.push(["cost", num(r.cost), sys.cost]);
  }
  // A formula weapon (a bow) stores the value DERIVED from its rating, so its
  // stored damageCode is expected to differ from the printed formula.
  if (r.damage && !/StrMin/i.test(r.damage)) checks.push(["damageCode", r.damage, sys.damageCode]);
  if (r.type) checks.push(["damageType", r.type === "s" ? "stun" : "physical", sys.damageType]);
  if (num(r.conceal) !== null) checks.push(["concealability", num(r.conceal), sys.concealability]);
  // streetIndex omitted from the JSON still behaves as the schema default (1),
  // so compare against that rather than skipping — an unset index on a Katana
  // (printed 2) really does overcharge/undercharge at the shop.
  if (num(r.streetIndex) !== null) checks.push(["streetIndex", num(r.streetIndex), sys.streetIndex ?? 1]);

  for (const [field, want, got] of checks) {
    if (got === undefined) continue;              // field not modelled on this type
    if (String(want) === String(got)) continue;
    drift.push({ name: r.name, field, want, got, page: r.pdfPage, path: hit.path });
    if (FIX) {
      hit.doc.system[field] = want;
      writeFileSync(hit.path, JSON.stringify(hit.doc, null, 2) + "\n");
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
if (drift.length) {
  console.log(`${FIX ? "FIXED" : "DRIFT"} — ${drift.length} field(s) disagree with the printed table:\n`);
  console.log(`  ${pad("ITEM", 24)}${pad("FIELD", 16)}${pad("OURS", 14)}${pad("PRINTED", 14)}PDF p.`);
  for (const d of drift) {
    console.log(`  ${pad(d.name, 24)}${pad(d.field, 16)}${pad(d.got, 14)}${pad(d.want, 14)}${d.page}`);
  }
} else {
  console.log("No drift: every transcribed price matches what we ship.");
}
if (unshipped.length) console.log(`\nIn the table but not shipped (${unshipped.length}): ${unshipped.join(", ")}`);
console.log(`\n${rows.length} reference rows checked against ${items.size} compendium items.`);
if (drift.length && !FIX) {
  console.log("Re-run with --fix to write the printed values into packs-src.");
  process.exitCode = 1;
}
