// Street Gear prices a whole class of surveillance/security gear "x Rating"
// (book p.258). CLAUDE.md requires such entries stay FORMULAS rather than being
// flattened to one number — otherwise the price is silently correct at Rating 1
// and wrong at every higher rating, which is exactly how these shipped.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { derivedItemCost } from "../module/rules/sr2e-rules.mjs";

const gear = readdirSync("packs-src/gear")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`packs-src/gear/${f}`, "utf8")))
  .filter((d) => d.system);
const byName = (n) => gear.find((d) => d.name === n);

describe("derivedItemCost — per-Rating gear (p.258)", () => {
  const jammer = { type: "gear", category: "security", costPerRating: 1000 };

  it("scales with rating", () => {
    expect(derivedItemCost({ ...jammer, rating: 1 })).toBe(1000);
    expect(derivedItemCost({ ...jammer, rating: 6 })).toBe(6000);
    expect(derivedItemCost({ ...jammer, rating: 10 })).toBe(10000);
  });

  it("leaves ordinary flat-priced gear alone", () => {
    // costPerRating 0 (the default) must fall through to the stored cost, not
    // return 0 — a caller treats null as "use the snapshot".
    expect(derivedItemCost({ type: "gear", category: "security", cost: 500, rating: 4 })).toBeNull();
    expect(derivedItemCost({ type: "gear", category: "security", costPerRating: 0, rating: 4 })).toBeNull();
  });

  it("refuses to compute without a rating rather than returning NaN", () => {
    expect(derivedItemCost({ ...jammer })).toBeNull();
    expect(derivedItemCost({ ...jammer, rating: "6" })).toBeNull();
  });

  it("does not shadow the skillsoft branch", () => {
    // Skillsofts are priced off the Skill Memory Table, not per-Rating, and that
    // branch is checked first.
    const soft = derivedItemCost(
      { type: "gear", category: "skillsoft", grantedSkillCategory: "active", rating: 3, costPerRating: 999 },
      { authoredCost: 0 });
    expect(soft).not.toBe(999 * 3);
  });

  it("is idempotent — re-deriving never compounds", () => {
    const once = derivedItemCost({ ...jammer, rating: 5 });
    const twice = derivedItemCost({ ...jammer, rating: 5, cost: once });
    expect(twice).toBe(once);
  });
});

describe("the shipped per-Rating catalogue matches the printed table", () => {
  // costPerRating is the price of ONE point, per the Cost column on p.258.
  const PRINTED = {
    "Data Codebreaker": 10000, "Dataline Tap": 5000, "Laser Microphone": 1500,
    "Shotgun Microphone": 1000, "Signal Locator": 1000, "Voice Identifier": 2000,
    "Bug Scanner": 500, "Data Encryption System": 1000, "Dataline Scanner": 100,
    "Jammer": 1000, "Voice Mask": 3000, "White Noise Generator": 1500,
    "Thumbprint Scanner": 200, "Palmprint Scanner": 300, "Retinal Scanner": 1000,
    "Maglock": 100, "Maglock Passkey": 10000, "Chemsuit": 200
  };

  it.each(Object.entries(PRINTED))("%s is %i¥ x Rating", (name, cpr) => {
    const s = byName(name)?.system;
    expect(s, `${name} missing from the gear pack`).toBeTruthy();
    expect(s.costPerRating).toBe(cpr);
  });

  it("the two entries shipped above Rating 1 were undercharging", () => {
    // These are the only ones whose stored cost actually changed: the rest sit at
    // Rating 1, where per-point and total coincide — which is why the bug hid.
    const passkey = byName("Maglock Passkey").system;
    expect(passkey.rating).toBe(3);
    expect(passkey.cost).toBe(30000);          // was 10,000 — 20,000 short

    const wng = byName("White Noise Generator").system;
    expect(wng.rating).toBe(5);
    expect(wng.cost).toBe(7500);               // was 1,500 — 6,000 short
  });

  it("every entry's stored cost equals costPerRating x its rating", () => {
    for (const name of Object.keys(PRINTED)) {
      const s = byName(name).system;
      expect(s.cost, name).toBe(s.costPerRating * Math.max(1, s.rating || 1));
    }
  });
});

describe("Tracking Signal is priced by Concealability, not Rating (p.258)", () => {
  const s = () => byName("Tracking Signal").system;

  it("carries the printed Concealability 3 and the matching 300¥", () => {
    // Shipped as Concealability 2 with a note claiming "200 x Concealability".
    // The book prints 100¥ x Concealability at Concealability 3.
    expect(s().concealability).toBe(3);
    expect(s().cost).toBe(300);
    expect(s().streetIndex).toBe(2);
  });

  it("is deliberately NOT wired to the per-Rating mechanism", () => {
    // One item with a one-off formula does not justify a second pricing path;
    // the value is stored and the note states the real formula.
    expect(s().costPerRating ?? 0).toBe(0);
    expect(s().notes).toMatch(/100¥ x Concealability/);
  });
});
