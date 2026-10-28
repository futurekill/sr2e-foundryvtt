import { describe, it, expect } from "vitest";
import { permanentDamageResult, deadlyTransition, liveOutcomes, pendingEpisodes, foldPermLoss, woundPenalties,
         effectiveCeiling } from "../module/rules/permanent-damage-rules.mjs";
import { naturalHealingHours, naturalAttribute } from "../module/rules/sr2e-rules.mjs";

// SR2E core p.113–114, "Deadly Wounds and Permanent Damage".
describe("permanentDamageResult", () => {
  it("2+ successes: nothing; 1: a limb (ears/eyes get a side); 0: an attribute", () => {
    expect(permanentDamageResult(2, 3)).toEqual({ kind: "none" });
    expect(permanentDamageResult(1, 1)).toEqual({ kind: "limb", part: "right arm" });
    expect(permanentDamageResult(1, 6, 5)).toEqual({ kind: "limb", part: "eye", side: "left" });
    expect(permanentDamageResult(0, 6)).toEqual({ kind: "organ", attr: "reaction" });
    expect(permanentDamageResult(0, 1)).toEqual({ kind: "organ", attr: "body" });
  });
});

describe("episodes", () => {
  it("crossing into Deadly opens one episode with its wound; dropping out ends it; 0 starts a new wound", () => {
    let st = deadlyTransition(null, 6, 10, 10);
    expect(st.crossed).toEqual([{ g: 0, woundGen: 0 }]);
    expect(deadlyTransition(st, 10, 12, 10).crossed).toHaveLength(1);
    st = deadlyTransition(st, 10, 6, 10);
    expect(st.deadlyGen).toBe(1);
    st = deadlyTransition(st, 6, 10, 10);
    expect(st.crossed.map(c => c.g)).toEqual([0, 1]);
    st = deadlyTransition(deadlyTransition(st, 10, 3, 10), 3, 0, 10);
    expect(st.woundGen).toBe(1);
  });
  it("outcomes: only this actor's, voids re-open the episode, attempts count", () => {
    const recs = [
      { key: "permdmg:A:0:0", kind: "organ", attr: "body", woundGen: 0 },
      { key: "permdmg-void:A:0:0" },
      { key: "permdmg:A:0:1", kind: "limb", part: "eye", side: "left", woundGen: 0 },
      { key: "permdmg:B:0:0", kind: "organ", attr: "willpower", woundGen: 0 }   // inherited from another actor
    ];
    const o = liveOutcomes(recs, "A");
    expect(o.live.map(x => x.id)).toEqual(["0:1"]);
    expect(o.voidedCount(0)).toBe(1);
    expect(pendingEpisodes({ crossed: [{ g: 0, woundGen: 0 }, { g: 1, woundGen: 0 }] }, o).map(c => c.g)).toEqual([1]);
    expect(foldPermLoss(liveOutcomes(recs.slice(0, 1), "A").live)).toEqual({ body: 1 });
  });
  it("penalties of the current wound only", () => {
    const live = [{ id: "0:0", kind: "organ", woundGen: 0 }, { id: "1:0", kind: "limb", woundGen: 1 }];
    expect(woundPenalties(live, 1)).toMatchObject({ baseMult: 1.5, totalMult: 1, doctorRequired: false });
    expect(woundPenalties(live, 0)).toMatchObject({ baseMult: 1, totalMult: 2, doctorRequired: true });
  });
});

describe("healing time and the natural rating", () => {
  it("a limb raises the BASE time (before the minimum); an organ doubles the total", () => {
    expect(naturalHealingHours("D", 20)).toBe(72);
    expect(naturalHealingHours("D", 20, { baseMult: 1.5 })).toBe(72);          // 1080/20 = 54 → the 72 h minimum
    expect(naturalHealingHours("S", 2, { baseMult: 1.5 })).toBe(360);
    expect(naturalHealingHours("S", 2, { totalMult: 2 })).toBe(480);
  });
  it("loss subtracted once after the clamp; Exceptional Attribute raises the ceiling", () => {
    const nat = (base, max, bonus, loss) => Math.max(1, naturalAttribute(base, 0, 0, max, bonus) - loss);
    expect(nat(6, 6, 0, 1)).toBe(5);
    expect(nat(7, 6, 1, 1)).toBe(6);
    expect(effectiveCeiling(6, 1, 1)).toBe(6);
  });
});
