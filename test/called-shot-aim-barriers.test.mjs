// Called shots (p.92), Take Aim (p.82) and Barriers (p.98). Every rule read
// from a 300 dpi render, not the text layer. Plan and the five-round Codex
// review that hardened it: PLAN.md / PLAN-REVIEW-LOG.md.
import { describe, it, expect } from "vitest";
import {
  CALLED_SHOT_TN, CALLED_SHOT_STEPS, canCallShot,
  maxAimActions, aimTnReduction, canAim,
  BARRIER_RATINGS, adjustedBarrierRating, barrierEffect, resolveBarrier
} from "../module/rules/sr2e-rules.mjs";

describe("called shots (SR2E p.92)", () => {
  it("costs +4 TN and stages damage up one level", () => {
    expect(CALLED_SHOT_TN).toBe(4);
    expect(CALLED_SHOT_STEPS).toBe(1);
  });

  it("allows single-shot, semi-auto and burst on a firearm", () => {
    const modes = { ss: true, sa: true, bf: true, fa: true };
    for (const m of ["ss", "sa", "bf"]) expect(canCallShot("firearm", m, modes)).toBe(true);
  });

  it("never allows full auto", () => {
    // "Only weapons that fire in single-shot, semi-automatic, and burst-fire
    // modes are eligible for called shots."
    expect(canCallShot("firearm", "fa", { fa: true })).toBe(false);
    expect(canCallShot("heavy", "fa", { fa: true })).toBe(false);
  });

  it("refuses a mode the weapon does not actually have", () => {
    // The attack path defaults a missing mode to "sa"; without this check a
    // mode-less weapon would look eligible.
    expect(canCallShot("firearm", "sa", { sa: false, fa: true })).toBe(false);
    expect(canCallShot("firearm", "bf", {})).toBe(false);
  });

  it("refuses weapon types that have no firing modes at all", () => {
    for (const t of ["melee", "throwing", "grenade", "projectile"]) {
      expect(canCallShot(t, "sa", { sa: true })).toBe(false);
    }
  });
});

describe("Take Aim (SR2E p.82)", () => {
  it("caps sequential aims at half the weapon skill, rounded down", () => {
    expect(maxAimActions(6)).toBe(3);
    expect(maxAimActions(5)).toBe(2);   // rounded DOWN
    expect(maxAimActions(1)).toBe(0);   // skill 1 cannot aim at all
    expect(maxAimActions(0)).toBe(0);
  });

  it("reduces the target number by 1 per aim action", () => {
    expect(aimTnReduction(3, 6)).toBe(3);
    expect(aimTnReduction(1, 6)).toBe(1);
  });

  it("clamps a claimed aim count to what the skill allows", () => {
    // The spinner is player-asserted, so the backend must not trust it.
    expect(aimTnReduction(99, 6)).toBe(3);
    expect(aimTnReduction(-5, 6)).toBe(0);
  });

  it("allows aim only for a READY ranged weapon", () => {
    // p.82: "a ready ranged weapon (firearm, bow, or throwing weapon)".
    for (const t of ["firearm", "heavy", "projectile", "throwing"]) {
      expect(canAim(t, true)).toBe(true);
      expect(canAim(t, false)).toBe(false);      // not equipped = not ready
    }
    for (const t of ["melee", "grenade"]) expect(canAim(t, true)).toBe(false);
  });
});

describe("Barrier Rating Table (SR2E p.98)", () => {
  it("carries the nine printed ratings", () => {
    expect(BARRIER_RATINGS.map(b => b.rating)).toEqual([2, 3, 4, 6, 8, 12, 16, 24, 32]);
  });

  it("marks the glass entries transparent", () => {
    // Transparency drives whether +8 Blind Fire applies at all.
    const byLabel = Object.fromEntries(BARRIER_RATINGS.map(b => [b.label, b.transparent]));
    expect(byLabel["Standard Glass"]).toBe(true);
    expect(byLabel["Average Material / Ballistic Glass"]).toBe(true);
    expect(byLabel["Reinforced / Armored Glass"]).toBe(true);
    expect(byLabel["Heavy Material"]).toBe(false);
  });
});

describe("adjusted barrier ratings (SR2E p.98)", () => {
  it("doubles against ranged attacks when the barrier is the target", () => {
    // "the barrier has twice its normal Barrier Rating against firearm rounds"
    expect(adjustedBarrierRating(6, { use: "damage", attackKind: "ranged" })).toBe(12);
  });

  it("keeps its normal rating when a bullet passes through it", () => {
    expect(adjustedBarrierRating(6, { use: "penetrate", attackKind: "ranged" })).toBe(6);
  });

  it("keeps normal vs blunt melee but doubles vs edged, when penetrating", () => {
    expect(adjustedBarrierRating(6, { use: "penetrate", attackKind: "meleeBlunt" })).toBe(6);
    expect(adjustedBarrierRating(6, { use: "penetrate", attackKind: "meleeEdged" })).toBe(12);
  });

  it("doubles a security door on top of everything else", () => {
    // "Security doors have twice the rating of the material."
    expect(adjustedBarrierRating(6, { use: "penetrate", doorType: "security" })).toBe(12);
    expect(adjustedBarrierRating(6, { use: "damage", doorType: "security" })).toBe(24);
    expect(adjustedBarrierRating(6, { use: "penetrate", doorType: "regular" })).toBe(6);
  });
});

describe("Barrier Effect Table (SR2E p.98)", () => {
  it("does nothing below half the rating", () => {
    expect(barrierEffect(5, 12)).toEqual({ tier: "none", ratingReduction: 0, holes: 0 });
  });

  it("damages it from half the rating up to the rating", () => {
    expect(barrierEffect(6, 12).tier).toBe("damaged");    // exactly half
    expect(barrierEffect(12, 12).tier).toBe("damaged");   // exactly the rating
    expect(barrierEffect(12, 12).ratingReduction).toBe(1);
  });

  it("opens a half-metre hole per half-rating increment above the rating", () => {
    // Rating 12: half is 6. Power 18 exceeds by 6 = one increment.
    expect(barrierEffect(18, 12)).toEqual({ tier: "breached", ratingReduction: 1, holes: 1 });
    // Power 24 exceeds by 12 = two increments.
    expect(barrierEffect(24, 12)).toEqual({ tier: "breached", ratingReduction: 2, holes: 2 });
  });
});

describe("resolveBarrier (SR2E p.98)", () => {
  it("stops a shot whose Power does not exceed the barrier", () => {
    const r = resolveBarrier({ baseRating: 12, comparisonPower: 9, barrierMode: "through" });
    expect(r.stopped).toBe(true);
    // "this may still damage the barrier" — assessed on the BREAK scale (x2).
    expect(r.effect).not.toBeNull();
  });

  it("lets a stronger shot through, reducing Power by the barrier only", () => {
    const r = resolveBarrier({ baseRating: 4, comparisonPower: 9, barrierMode: "through" });
    expect(r.stopped).toBe(false);
    expect(r.powerReduction).toBe(4);
    // A shot that penetrates does NOT also damage the barrier.
    expect(r.effect).toBeNull();
  });

  it("never subtracts armour — the resistance path already does", () => {
    // powerReduction must equal the barrier alone, whatever armour the target has.
    expect(resolveBarrier({ baseRating: 4, comparisonPower: 9 }).powerReduction).toBe(4);
  });

  it("treats break-through as terminal, with no Power passing on", () => {
    const r = resolveBarrier({ baseRating: 6, comparisonPower: 20, barrierMode: "break" });
    expect(r.stopped).toBe(true);
    expect(r.powerReduction).toBe(0);
    expect(r.effect.tier).toBe("breached");
  });

  it("opens a regular door at half rating and a security door only at 0", () => {
    // Regular door, base 4: one point of reduction takes it to 3, not yet half.
    expect(resolveBarrier({ baseRating: 4, comparisonPower: 5, barrierMode: "break", doorType: "regular" }).opensDoor).toBe(false);
    // Enough Power to strip it to <= 2 opens it.
    const big = resolveBarrier({ baseRating: 4, comparisonPower: 40, barrierMode: "break", doorType: "regular" });
    expect(big.newBaseRating).toBeLessThanOrEqual(2);
    expect(big.opensDoor).toBe(true);
    // A security door must reach exactly 0.
    const sec = resolveBarrier({ baseRating: 4, comparisonPower: 40, barrierMode: "break", doorType: "security" });
    expect(sec.opensDoor).toBe(sec.newBaseRating === 0);
  });

  it("reports the reduced BASE rating, not a doubled working value", () => {
    // The advisory number a GM writes down must be on the barrier's own scale.
    const r = resolveBarrier({ baseRating: 12, comparisonPower: 30, barrierMode: "break" });
    expect(r.newBaseRating).toBeLessThan(12);
    expect(r.newBaseRating).toBeGreaterThanOrEqual(0);
  });
});
