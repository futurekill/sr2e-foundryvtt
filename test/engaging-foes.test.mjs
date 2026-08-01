// Attacker In Melee Combat (SR2E p.90). The radius and the per-opponent
// modifier were both read from a 300 dpi render of the printed page, not the
// text layer: "...or if he is aware of another character attempting to block
// the attempt within two meters of him, the attack takes a +2 modifier per
// opponent present."
import { describe, it, expect } from "vitest";
import { countEngagingFoes, ENGAGEMENT_RANGE_M, ENGAGED_TN_PER_FOE,
         footprintDistance } from "../module/rules/sr2e-rules.mjs";

// Foundry's CONST.TOKEN_DISPOSITIONS, inlined so the test needs no Foundry.
const SECRET = -2, HOSTILE = -1, NEUTRAL = 0, FRIENDLY = 1;

const foe = (distanceM, extra = {}) => ({ disposition: HOSTILE, distanceM, ...extra });

describe("engagement radius (SR2E p.90)", () => {
  it("is two metres, not one", () => {
    expect(ENGAGEMENT_RANGE_M).toBe(2);
  });

  it("costs +2 per opponent", () => {
    expect(ENGAGED_TN_PER_FOE).toBe(2);
  });

  it("counts a foe exactly at two metres, and excludes one past it", () => {
    expect(countEngagingFoes(FRIENDLY, [foe(2)])).toBe(1);
    expect(countEngagingFoes(FRIENDLY, [foe(2.1)])).toBe(0);
  });

  it("counts every opponent present, not just the nearest", () => {
    expect(countEngagingFoes(FRIENDLY, [foe(1), foe(1.5), foe(2)])).toBe(3);
  });
});

describe("who counts as an opponent", () => {
  it("ignores allies and neutrals", () => {
    expect(countEngagingFoes(FRIENDLY, [
      { disposition: FRIENDLY, distanceM: 1 },
      { disposition: NEUTRAL,  distanceM: 1 }
    ])).toBe(0);
  });

  it("mirrors for a GM-side shooter: friendly tokens are its opponents", () => {
    expect(countEngagingFoes(HOSTILE, [{ disposition: FRIENDLY, distanceM: 1 }])).toBe(1);
    expect(countEngagingFoes(HOSTILE, [{ disposition: HOSTILE,  distanceM: 1 }])).toBe(0);
  });

  it("treats a SECRET token as opposed to a friendly shooter", () => {
    expect(countEngagingFoes(FRIENDLY, [{ disposition: SECRET, distanceM: 1 }])).toBe(1);
  });

  it("counts nobody for a NEUTRAL shooter", () => {
    expect(countEngagingFoes(NEUTRAL, [foe(1), { disposition: FRIENDLY, distanceM: 1 }])).toBe(0);
  });

  it("skips hidden tokens — the rule requires the attacker be AWARE of them", () => {
    // Also keeps the count from revealing a token the player cannot see.
    expect(countEngagingFoes(FRIENDLY, [foe(1, { hidden: true })])).toBe(0);
  });

  it("skips defeated tokens", () => {
    expect(countEngagingFoes(FRIENDLY, [foe(1, { defeated: true })])).toBe(0);
  });
});

describe("bad input is not counted", () => {
  it("survives an empty or missing list", () => {
    expect(countEngagingFoes(FRIENDLY)).toBe(0);
    expect(countEngagingFoes(FRIENDLY, [])).toBe(0);
  });

  it("skips entries with an unmeasurable distance rather than counting them", () => {
    // footprintDistance returns NaN on unusable geometry, and a NaN compare is
    // false either way — this pins the behaviour rather than trusting it.
    expect(countEngagingFoes(FRIENDLY, [
      foe(NaN), foe(undefined), null, foe(Infinity)
    ])).toBe(0);
  });
});

describe("footprintDistance — why not centre-to-centre (SR2E p.90)", () => {
  // 100 px per grid square, 1 m per square (the SR2E scene convention).
  const PX = 100;
  const sq = (col, row, size = 1) =>
    ({ x: col * 100, y: row * 100, width: size * 100, height: size * 100 });

  const attacker = sq(1, 1);                    // a 1x1 token in square (1,1)

  it("is 0 for two touching footprints", () => {
    expect(footprintDistance(attacker, sq(2, 1), PX)).toBe(0);
  });

  it("measures the GAP, so one empty square between them is 1 m", () => {
    expect(footprintDistance(attacker, sq(3, 1), PX)).toBeCloseTo(1);
  });

  it("counts a LARGE FOE that centre-to-centre would have missed", () => {
    // A 4x4 foe occupying cols 2-5, rows 0-3: its left edge abuts the attacker,
    // but its CENTRE is 2.9 m away — outside the 2 m radius.
    const bigFoe = sq(2, 0, 4);
    const centreToCentre = Math.hypot((bigFoe.x + 200) - (attacker.x + 50),
                                      (bigFoe.y + 200) - (attacker.y + 50)) / PX;
    expect(centreToCentre).toBeGreaterThan(ENGAGEMENT_RANGE_M);   // would be missed
    expect(footprintDistance(attacker, bigFoe, PX)).toBe(0);
    expect(countEngagingFoes(FRIENDLY,
      [{ disposition: HOSTILE, distanceM: footprintDistance(attacker, bigFoe, PX) }])).toBe(1);
  });

  it("counts for a LARGE ATTACKER too — the measurement is symmetric", () => {
    // The mirror case: a 4x4 shooter whose edge touches a 1x1 foe. Measuring
    // from the shooter's centre would have put the foe out of reach.
    const bigAttacker = sq(2, 0, 4);
    const smallFoe = sq(1, 1);
    expect(footprintDistance(bigAttacker, smallFoe, PX)).toBe(0);
    expect(footprintDistance(bigAttacker, smallFoe, PX))
      .toBe(footprintDistance(smallFoe, bigAttacker, PX));
  });

  it("still excludes something genuinely far away", () => {
    expect(footprintDistance(attacker, sq(10, 1), PX)).toBeCloseTo(8);
  });

  it("returns 0, never negative, for overlapping footprints", () => {
    expect(footprintDistance(attacker, sq(1, 1), PX)).toBe(0);
    expect(footprintDistance(sq(0, 0, 4), sq(1, 1), PX)).toBe(0);
  });

  it("returns NaN on unusable input rather than a misleading 0", () => {
    expect(footprintDistance(attacker, { ...sq(2, 1), x: NaN }, PX)).toBeNaN();
    expect(footprintDistance(attacker, sq(2, 1), 0)).toBeNaN();
    expect(footprintDistance(null, sq(2, 1), PX)).toBeNaN();
  });
});
