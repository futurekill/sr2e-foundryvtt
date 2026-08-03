// Knockdown. TWO different rules, both read from 300dpi renders:
//   RANGED (p.91, "Stopping and Knockdown"): Body Test vs TN = 1/2 Power,
//     round down. Threshold = 1 Light / 2 Moderate / 3 Serious. No successes
//     -> prone; some but under threshold -> stagger 1 m.
//   MELEE (p.103, "Knockback and Knockdown"): same thresholds, but the TN is
//     "a target number equal to his opponent's Strength" — not Power at all.
import { describe, it, expect } from "vitest";
import { knockdownPrompt, knockdownTestTN, knockdownOutcome }
  from "../module/rules/sr2e-rules.mjs";

describe("knockdownPrompt — when NOT to ask for a roll", () => {
  const healthy = { value: 0, max: 10 };

  it("does not prompt on a Deadly wound — going down is automatic", () => {
    // The book's threshold list stops at Serious; a Deadly wound fills the
    // monitor. knockdownOutcome already returns "prone" for D regardless of
    // the dice, so a prompt asks for a roll that cannot change anything.
    const p = knockdownPrompt("D", healthy);
    expect(p.offer).toBe(false);
    expect(p.autoProne).toBe(true);
    expect(p.reason).toBe("deadly");
    expect(knockdownOutcome("D", 99)).toBe("prone");   // even on 99 successes
  });

  it("does not prompt when the monitor is already full", () => {
    const p = knockdownPrompt("M", { value: 10, max: 10 });
    expect(p.offer).toBe(false);
    expect(p.autoProne).toBe(true);
    expect(p.reason).toBe("incapacitated");
  });

  it("does not prompt when damage has overflowed", () => {
    expect(knockdownPrompt("L", healthy, 3).offer).toBe(false);
  });

  it("DOES prompt for Light, Moderate and Serious on a standing target", () => {
    for (const lvl of ["L", "M", "S"]) {
      expect(knockdownPrompt(lvl, healthy).offer, lvl).toBe(true);
    }
  });

  it("treats a partly-wounded but standing target as still testable", () => {
    expect(knockdownPrompt("M", { value: 6, max: 10 }).offer).toBe(true);
  });
});

describe("knockdownTestTN — ranged vs melee are different rules", () => {
  it("ranged is HALF Power, rounded down (p.91)", () => {
    expect(knockdownTestTN({ power: 9 })).toBe(4);    // 9/2 = 4.5 -> 4
    expect(knockdownTestTN({ power: 8 })).toBe(4);
  });

  it("gel rounds use the FULL Power — that is their whole point", () => {
    expect(knockdownTestTN({ power: 9, gel: true })).toBe(9);
  });

  it("melee uses the opponent's STRENGTH, not Power (p.103)", () => {
    // A troll with Strength 9 punching for Power 4 knocks you down on TN 9,
    // not TN 2. Using the ranged rule here understates it badly.
    expect(knockdownTestTN({ melee: true, attackerStrength: 9, power: 4 })).toBe(9);
    expect(knockdownTestTN({ melee: true, attackerStrength: 3, power: 20 })).toBe(3);
  });

  it("never returns a TN below 2", () => {
    expect(knockdownTestTN({ power: 1 })).toBe(2);
    expect(knockdownTestTN({ melee: true, attackerStrength: 0 })).toBe(2);
  });
});

describe("knockdownOutcome thresholds (p.91 / p.103)", () => {
  it("uses 1 / 2 / 3 for Light / Moderate / Serious", () => {
    expect(knockdownOutcome("M", 3)).toBe("none");     // beats threshold 2
    expect(knockdownOutcome("M", 2)).toBe("none");     // meets it
    expect(knockdownOutcome("M", 1)).toBe("stagger");
    expect(knockdownOutcome("M", 0)).toBe("prone");
  });

  it("no successes always drops you, whatever the wound", () => {
    for (const lvl of ["L", "M", "S"]) expect(knockdownOutcome(lvl, 0)).toBe("prone");
  });
});
