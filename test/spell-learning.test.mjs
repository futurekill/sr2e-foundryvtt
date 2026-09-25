import { describe, it, expect } from "vitest";
import { spellLearningTN, spellLearningDays, teachingTN, canonicalSpellName, defenseAidApplies,
         planElementalTransition } from "../module/rules/sr2e-rules.mjs";

// SR2E p.132–133 (rendered): TN = twice the Force; a teacher's successes lower
// it; time = Force days ÷ successes (min 1, rounded up per the table); failure
// wastes Force days and costs no Karma.
describe("learning a spell", () => {
  it("TN is twice the Force, lowered by teacher successes, floor 2", () => {
    expect(spellLearningTN({ force: 4 })).toBe(8);
    expect(spellLearningTN({ force: 4, teacherSuccesses: 2 })).toBe(6);
    expect(spellLearningTN({ force: 1, teacherSuccesses: 5 })).toBe(2);
    expect(spellLearningTN({ force: 3, extraTN: 2 })).toBe(8);
  });
  it("days = Force ÷ successes, rounded up, at least one; null on failure", () => {
    expect(spellLearningDays(5, 2)).toBe(3);
    expect(spellLearningDays(6, 3)).toBe(2);
    expect(spellLearningDays(2, 9)).toBe(1);
    expect(spellLearningDays(5, 0)).toBe(null);
  });
  it("the teacher rolls against Force − the pupil's Intelligence, minimum 2", () => {
    expect(teachingTN(6, 4)).toBe(2);
    expect(teachingTN(8, 3)).toBe(5);
  });
  it("a particular spell is its name, however it is copied", () => {
    expect(canonicalSpellName("  Mana   Bolt ")).toBe(canonicalSpellName("mana bolt"));
  });
});

describe("Aid Study and Spell Defense aid (p.141)", () => {
  const el = (o = {}) => ({ force: 5, forceUsed: 1, services: 2, service: "", pendingExpireSpellUuid: "", ...o });
  it("Aid Study: its current Force in dice, one service, no depletion", () => {
    const r = planElementalTransition(el(), "aidStudy");
    expect(r.dice).toBe(4);
    expect(r.update).toEqual({ "system.services": 1 });
  });
  it("Aid Study refuses a busy, spent or owed-out elemental", () => {
    expect(planElementalTransition(el({ service: "aid" }), "aidStudy").refuse).toBeTruthy();
    expect(planElementalTransition(el({ forceUsed: 5 }), "aidStudy").refuse).toBeTruthy();
    expect(planElementalTransition(el({ services: 0 }), "aidStudy").refuse).toBeTruthy();
  });
  it("startAid charges one service and no Force, with a fresh identity", () => {
    expect(planElementalTransition(el(), "startAid", { instanceId: "A" }).update)
      .toEqual({ "system.service": "aid", "system.services": 1, "system.aidInstanceId": "A" });
    expect(planElementalTransition(el({ service: "aid", aidInstanceId: "A" }), "startAid").update).toEqual({});
    // An aid service from before 0.98.0 has no identity: it gets one, free.
    expect(planElementalTransition(el({ service: "aid" }), "startAid", { instanceId: "B" }).update)
      .toEqual({ "system.aidInstanceId": "B" });
  });
  it("a spent aid service loses its identity", () => {
    expect(planElementalTransition(el({ service: "aid", forceUsed: 4 }), "aid", { n: 1 }).update)
      .toMatchObject({ "system.service": "", "system.aidInstanceId": "" });
  });
  it("defense dice only against the elemental's own category", () => {
    expect(defenseAidApplies("fire", "combat")).toBe(true);
    expect(defenseAidApplies("fire", "illusion")).toBe(false);
  });
});
