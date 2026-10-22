// Cybereyes, bioware with cyberware, social (docs/PLAN-cybertechnology-phase3b.md).
import { describe, it, expect } from "vitest";
import { wareRule, WARE_SOURCES, physicalLimbs, fullCyberlimbs, muscleFactor, pumpEfficiency, cyberPositions,
         containerEssence, eyeReports, socialTN, socialModifiers, contactReaction } from "../module/rules/ware-rules.mjs";
import { gradeEssenceCost } from "../module/rules/sr2e-rules.mjs";

const limb = (id, type, side = "none", installed = true) => ({ id, name: id, installed, system: { location: "cyberlimb", limbType: type, side }, flags: {}, source: null });
const model = (...ls) => physicalLimbs(ls);

describe("identity", () => {
  it("rule flag, then the legacy pump flag, then the source; limb rules are not ware rules", () => {
    expect(wareRule({ sr2e: { rule: "suprathyroid" } })).toBe("suprathyroid");
    expect(wareRule({ sr2e: { adrenalPump: true } })).toBe("adrenal-pump");
    const src = Object.keys(WARE_SOURCES).find(k => WARE_SOURCES[k] === "muscle-augmentation");
    expect(wareRule({}, src)).toBe("muscle-augmentation");
    expect(wareRule({ sr2e: { rule: "limb:arm" } }, null)).toBe(null);
    expect(wareRule({}, null)).toBe(null);
  });
});

describe("bioware with cyberware (p.56–57)", () => {
  it("the book's pump example: a cyberleg, a cyberhand and a cybertorso → 60%", () => {
    const m = model(limb("l", "leg", "left"), limb("h", "hand", "right"), limb("t", "torso"));
    const e = pumpEfficiency(m);
    expect(e).toBe(0.6);
    expect([2, 4].map(b => Math.floor(b * e))).toEqual([1, 2]);
  });
  it("Reaction Enhancer adds 50 (leg + enhancer = 35%); floor at 0", () => {
    expect(pumpEfficiency(model(limb("l", "leg", "left")), { enhancer: true })).toBe(0.35);
    const all = model(limb("a", "arm", "left"), limb("b", "arm", "right"), limb("c", "leg", "left"), limb("d", "leg", "right"), limb("t", "torso"));
    expect(pumpEfficiency(all, { enhancer: true })).toBe(0);
  });
  it("suprathyroid: only major replacements (user ruling); a hand keeps its +1s, an arm zeroes them", () => {
    expect(Math.floor(1 * pumpEfficiency(model(limb("h", "hand", "left")), { major: true }))).toBe(1);
    expect(Math.floor(1 * pumpEfficiency(model(limb("a", "arm", "left")), { major: true }))).toBe(0);
    expect(pumpEfficiency(model(limb("a", "forearm", "left")), { major: true, enhancer: true })).toBe(1);
  });
  it("physical model ignores uninstalled limbs and excludes overlaps", () => {
    expect(fullCyberlimbs(model(limb("a", "arm", "left"), limb("b", "arm", "right", false)))).toBe(1);
    expect(fullCyberlimbs(model(limb("a", "arm", "left"), limb("b", "arm", "left")))).toBe(0);
  });
  it("muscle factor: 20% per full limb", () => {
    expect([0, 1, 2, 3, 4, 5].map(muscleFactor)).toEqual([1, 0.8, 0.6, 0.4, 0.2, 0.2]);
  });
  it("articulation positions: known sides only, unknowns counted apart", () => {
    const p = cyberPositions(model(limb("h", "hand", "left"), limb("f", "forearm", "left"), limb("l", "foot", "right"), limb("u", "arm", "unknown")));
    expect(p).toEqual({ count: 2, unknown: 1 });
  });
});

describe("cybereyes (p.45)", () => {
  const g = (grade) => (e) => gradeEssenceCost(e, grade);
  it("a graded pair takes the grade before the allowance; standard is unchanged", () => {
    expect(containerEssence({ base: 0.2, rows: 0.9, capacity: 0.5, isEye: true, graded: false }, g("standard"))).toBeCloseTo(0.6, 9);
    // alpha 0.8: eye .16, rows .72 → over .22 → .38
    expect(containerEssence({ base: 0.2, rows: 0.9, capacity: 0.5, isEye: true, graded: true }, g("alpha"))).toBeCloseTo(0.38, 9);
    expect(containerEssence({ base: 0.2, rows: 0, capacity: 0.5, isEye: true, graded: true }, g("alpha"))).toBe(0.16);
    // a non-eye container keeps grade(base + over)
    expect(containerEssence({ base: 0.2, rows: 0.9, capacity: 0.5, isEye: false, graded: true }, g("alpha"))).toBe(0.48);
  });
  it("a single eye: .1 Essence and half the allowance", () => {
    expect(containerEssence({ base: 0.2, rows: 0.3, capacity: 0.5, eyes: "single", isEye: true }, g("standard"))).toBeCloseTo(0.15, 9);
  });
  it("reports: the cap, slots, the camera, unset eye, unclassified rows", () => {
    expect(eyeReports({ rows: [{ essenceCost: 0.7 }, { essenceCost: 0.6, kind: "camera" }] })[0]).toMatch(/over the 1.2/);
    const r = eyeReports({ rows: [{ name: "Gun", kind: "weapon", eye: "left", essenceCost: 0.1 }, { name: "Dart", kind: "weapon", eye: "left", essenceCost: 0.1 },
      { name: "Cam", kind: "camera", eye: "right", essenceCost: 0.1 }, { name: "Laser", kind: "toolLaser", eye: "right", essenceCost: 0.1 }] });
    expect(r.join("|")).toMatch(/left eye holds 2/);
    expect(r.join("|")).toMatch(/right eye has a camera/);
    expect(eyeReports({ rows: [{ name: "Gun", kind: "weapon", eye: "both", essenceCost: 0.1 }] }).join()).toMatch(/set which eye/);
    // a single eye is ONE eye whatever the labels say
    expect(eyeReports({ eyes: "single", rows: [{ kind: "weapon", eye: "left" }, { kind: "toolLaser", eye: "right" }] }).join()).toMatch(/holds 2/);
    expect(eyeReports({ rows: [{ essenceCost: 0.1 }] }).join()).toMatch(/1 row\(s\) unclassified/);
  });
});

describe("social (p.57–58)", () => {
  it("socialTN: the first .5 is free, then +1 per started 2 points; float-safe", () => {
    expect([0.5, 0.504, 0.6, 1, 2, 2.004, 2.4, 3.1].map(socialTN)).toEqual([0, 1, 1, 1, 1, 2, 2, 2]);
    const twenty = Array(20).fill(0.1).reduce((t, x) => t + x, 0);
    expect(socialTN(twenty)).toBe(1);
  });
  it("visibility: hidden counts only for contacts, datajacks/ignored never, flagrant +1, minimum +1 over 3", () => {
    const m = socialModifiers([{ essence: 1, visibility: "normal" }, { essence: 2, visibility: "hidden" }, { essence: 0.2, visibility: "ignored" }]);
    expect(m).toMatchObject({ visibleLoss: 1, totalLoss: 3, situationTN: 1, contactTN: 2, checkContacts: true });
    expect(socialModifiers([{ essence: 0.4, visibility: "flagrant" }]).situationTN).toBe(1);
    expect(socialModifiers([{ essence: 3.2, visibility: "hidden" }]).situationTN).toBe(1);
    expect(socialModifiers([{ essence: 0.5, visibility: "normal" }]).checkContacts).toBe(false);
  });
  it("the Contact Reactions Table", () => {
    expect([0, 1, 2, 3, 4, 7].map(n => contactReaction(n).key)).toEqual(["shuns", "avoidsAlways", "avoids", "aloof", "unaffected", "unaffected"]);
    expect(contactReaction(2).tnPlus).toBe(1);
  });
});
