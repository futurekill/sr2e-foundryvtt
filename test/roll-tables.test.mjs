// Roll tables are hand-authored JSON with no schema to catch mistakes: a range
// gap silently makes a roll produce NOTHING at the table, and an overlap makes
// two results fight. Foundry will not complain about either.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const DIR = "packs-src/roll-tables";
const tables = readdirSync(DIR).filter(f => f.endsWith(".json"))
  .map(f => ({ file: f, doc: JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) }));

/** Min/max total of a dice formula like "2d6" or "1d20". */
function formulaRange(formula) {
  const m = /^(\d+)d(\d+)$/.exec(formula.trim());
  if (!m) return null;
  const [, n, sides] = m.map(Number);
  return [n, n * sides];
}

describe("shipped roll tables", () => {
  it("ships at least the five original tables plus downtime", () => {
    expect(tables.length).toBeGreaterThanOrEqual(6);
  });

  it.each(tables.map(t => [t.doc.name, t]))("%s covers its whole formula range", (_name, { doc }) => {
    const range = formulaRange(doc.formula);
    if (!range) return;                       // non-dice formula: nothing to check
    const [min, max] = range;
    const covered = new Map();
    for (const r of doc.results) {
      for (let i = r.range[0]; i <= r.range[1]; i++) {
        expect(covered.has(i), `${doc.name}: two results both claim ${i}`).toBe(false);
        covered.set(i, r.text);
      }
    }
    const gaps = [];
    for (let i = min; i <= max; i++) if (!covered.has(i)) gaps.push(i);
    expect(gaps, `${doc.name} (${doc.formula}) rolls nothing on ${gaps.join(",")}`).toEqual([]);
  });

  it.each(tables.map(t => [t.doc.name, t]))("%s has unique result ids and no empty text", (_name, { doc }) => {
    const ids = new Set(doc.results.map(r => r._id));
    expect(ids.size).toBe(doc.results.length);
    for (const r of doc.results) expect(r.text.trim().length).toBeGreaterThan(0);
  });
});

describe("Downtime table", () => {
  const doc = tables.find(t => t.doc.name.startsWith("Downtime")).doc;

  it("is a 2d6 spread across all 11 outcomes", () => {
    // Flat d6 would make the 10,000¥ score a 1-in-6 event per character; on 2d6
    // both tails sit at 1/36 and the quiet results carry the middle.
    expect(doc.formula).toBe("2d6");
    expect(doc.results).toHaveLength(11);
    expect(doc.results.map(r => r.range[0])).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const r of doc.results) expect(r.range[0]).toBe(r.range[1]);   // one slot each
  });

  it("is rollable by players", () => {
    // What actually grants access is the PACK declaration, not the document's
    // ownership field: "Compendium content ignores the ownership field in
    // favor of User role-based ownership" (Foundry v13 foundry.mjs:12335).
    const pack = JSON.parse(readFileSync("system.json", "utf8"))
      .packs.find(p => p.name === "roll-tables");
    expect(pack.ownership.PLAYER).toBe("OBSERVER");

    // `replacement: true` keeps a draw from writing back to the document.
    // With replacement false Foundry stamps `drawn` on the result, which a
    // non-owner cannot do — so this is what makes an observer's roll work.
    expect(doc.replacement).toBe(true);

    // Carried on the document too, for the copy a GM imports into the world:
    // there the field is honoured again and the pack declaration no longer
    // applies. 2 = OBSERVER.
    expect(doc.ownership.default).toBe(2);
  });

  it("caps the jackpot at 10,000¥ on the rarest result", () => {
    const jackpot = doc.results.find(r => r.range[0] === 12);
    expect(jackpot.text).toContain("[[1d10*1000]]");
  });

  it("rolls its own nuyen wherever it promises money", () => {
    // A result that says "gain nuyen" without an inline roll makes the GM stop
    // and improvise a number.
    for (const r of doc.results) {
      if (/gain |&yen;/i.test(r.text) && !/lifestyle still comes due/i.test(r.text)) {
        expect(r.text, `result ${r.range[0]} promises nuyen with no inline roll`).toMatch(/\[\[\d+d\d+\*\d+\]\]/);
      }
    }
  });
});
