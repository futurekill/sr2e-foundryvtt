/**
 * build-spells.mjs
 *
 * Rebuilds the spells compendium pack from the CSV source file.
 * Health spells are preserved from existing pack data.
 * All other spells are replaced wholesale with CSV data.
 *
 * Usage:  node build-spells.mjs [path/to/spells.csv]
 */

import { ClassicLevel }  from "classic-level";
import { createReadStream } from "fs";
import { createInterface }  from "readline";
import { randomBytes }      from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath }    from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CSV_PATH  = process.argv[2] ?? resolve(__dirname, "../../shadowrun_2e_core_spells.csv");
const PACK_PATH = resolve(__dirname, "packs/spells");

// ── Helpers ────────────────────────────────────────────────────────────────

function newId() {
  return randomBytes(8).toString("hex");
}

/**
 * Convert CSV drain formula to stored "+N(L)" format.
 * Handles:
 *   (F / 2)L             → +0(L)
 *   ((F / 2) + 3)D       → +3(D)
 *   ((F / 2) - 1)S       → -1(S)
 *   ((F / 2) – 1)L       → -1(L)   (en-dash variant)
 */
function parseCsvDrain(s) {
  // With modifier: ((F / 2) ± N)Level
  const withMod = s.match(/\(\(F\s*\/\s*2\)\s*([+\-\u2013\u2014])\s*(\d+)\)\s*([LMSD])/);
  if (withMod) {
    const sign = withMod[1] === "+" ? 1 : -1;
    const mod  = sign * parseInt(withMod[2]);
    return `${mod >= 0 ? "+" : ""}${mod}(${withMod[3]})`;
  }
  // Without modifier: (F / 2)Level
  const noMod = s.match(/\(F\s*\/\s*2\)\s*([LMSD])/);
  if (noMod) return `+0(${noMod[1]})`;
  console.warn("  ⚠  Could not parse drain:", s);
  return "+0(M)";
}

/**
 * Map CSV Range column to internal key.
 */
function mapRange(r) {
  switch (r.trim().toLowerCase()) {
    case "los":     return "los";
    case "touch":   return "touch";
    case "limited": return "limited";
    case "self":    return "self";
    default:
      console.warn("  ⚠  Unknown range:", r);
      return "los";
  }
}

/**
 * Map CSV Duration column to internal key.
 */
function mapDuration(d) {
  switch (d.trim().toLowerCase()) {
    case "instant":   return "instant";
    case "sustained": return "sustained";
    case "permanent": return "permanent";
    default:
      console.warn("  ⚠  Unknown duration:", d);
      return "instant";
  }
}

/**
 * Detect whether a spell description or name implies area-of-effect.
 */
function detectAreaEffect(name, desc) {
  const text = (name + " " + (desc ?? "")).toLowerCase();
  return /area.effect|area of effect|area spell|area-effect/.test(text);
}

/**
 * Detect whether a spell requires a voluntary subject.
 */
function detectVoluntary(desc) {
  return /voluntary subject|willing subject/.test((desc ?? "").toLowerCase());
}

/**
 * Build the target field string, appending "(R)" if the spell is resisted.
 */
function buildTarget(tnRaw, resisted) {
  const tn = String(tnRaw).trim();
  if (resisted === "Y") return `${tn} (R)`;
  return tn;
}

// ── CSV parsing ────────────────────────────────────────────────────────────

async function readCsv(path) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(path) });
  let headers = null;
  for await (const line of rl) {
    const cols = parseCSVLine(line);
    if (!headers) { headers = cols; continue; }
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (cols[i] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

/** Minimal CSV line parser that handles quoted fields. */
function parseCSVLine(line) {
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Reading CSV from:", CSV_PATH);
  const rows = await readCsv(CSV_PATH);
  console.log(`  ${rows.length} spells read from CSV`);

  const db = new ClassicLevel(PACK_PATH, { valueEncoding: "json" });

  // ── 1. Snapshot existing health spells ──────────────────────────────────
  const keepEntries = {};
  for await (const [key, val] of db.iterator()) {
    if (val.system?.category === "health") {
      keepEntries[key] = val;
    }
  }
  console.log(`  ${Object.keys(keepEntries).length} health spells preserved`);

  // ── 2. Wipe the pack ────────────────────────────────────────────────────
  const allKeys = [];
  for await (const key of db.keys()) allKeys.push(key);
  if (allKeys.length) await db.batch(allKeys.map(k => ({ type: "del", key: k })));
  console.log(`  Wiped ${allKeys.length} existing entries`);

  // ── 3. Restore health spells ────────────────────────────────────────────
  for (const [key, val] of Object.entries(keepEntries)) {
    await db.put(key, val);
  }

  // ── 4. Insert CSV spells ─────────────────────────────────────────────────
  let imported = 0;
  for (const row of rows) {
    const name           = row["Name"];
    const classification = (row["Classification"] ?? "").toLowerCase();
    const subClass       = (row["Sub-classification"] ?? "").trim();
    const description    = row["Description"] ?? "";
    const type           = (row["Type"] ?? "physical").toLowerCase();
    const rangeRaw       = row["Range"] ?? "LOS";
    const tnRaw          = row["Target Number"] ?? "4";
    const resisted       = (row["Resisted?"] ?? "N").toUpperCase();
    const damageLevel    = row["Damage Level"] ?? "";
    const duration       = row["Duration"] ?? "Instant";
    const drainRaw       = row["Drain"] ?? "(F / 2)M";

    const category    = classification;
    const subcategory = subClass.toLowerCase() === "n/a" ? "" : subClass.toLowerCase();
    const range       = mapRange(rangeRaw);
    const target      = buildTarget(tnRaw, resisted);
    const damageCode  = damageLevel === "N/A" ? "" : damageLevel;
    const drainCode   = parseCsvDrain(drainRaw);
    const isAreaEffect = detectAreaEffect(name, description);
    const isVoluntary  = detectVoluntary(description);

    const key = `!items!${newId()}`;
    const entry = {
      _id:    key.replace("!items!", ""),
      name,
      type:   "spell",
      system: {
        category,
        subcategory,
        type,
        range,
        duration: mapDuration(duration),
        force:    1,
        drainCode,
        target,
        damageCode,
        isAreaEffect,
        isVoluntary,
        notes: description
      },
      img:    "icons/magic/symbols/rune-sigil-red-orange.webp",
      effects: [],
      folder:  null,
      sort:    0,
      ownership: { default: 0 },
      flags: {}
    };

    await db.put(key, entry);
    imported++;
    console.log(`  + ${name} (${category}${subcategory ? "/" + subcategory : ""}, ${range}, ${drainCode})`);
  }

  // ── 5. Force flush to .ldb ───────────────────────────────────────────────
  await db.compactRange("!", "~");
  await db.close();

  console.log(`\nDone. ${imported} CSV spells imported, ${Object.keys(keepEntries).length} health spells preserved.`);
}

main().catch(err => { console.error(err); process.exit(1); });
