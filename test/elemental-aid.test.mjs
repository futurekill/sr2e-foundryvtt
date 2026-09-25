import { describe, it, expect } from "vitest";
import { elementalAidsCategory, elementalState, planElementalTransition, spellCastDice }
  from "../module/rules/sr2e-rules.mjs";

// SR2E p.141–142 (rendered): Aid Sorcery and Spell Sustaining.
describe("elementalAidsCategory — each element helps one category, none health", () => {
  it("maps fire/water/air/earth to combat/illusion/detection/manipulation", () => {
    expect(elementalAidsCategory("fire", "combat")).toBe(true);
    expect(elementalAidsCategory("water", "illusion")).toBe(true);
    expect(elementalAidsCategory("air", "detection")).toBe(true);
    expect(elementalAidsCategory("earth", "manipulation")).toBe(true);
    expect(elementalAidsCategory("fire", "illusion")).toBe(false);
    expect(elementalAidsCategory("earth", "health")).toBe(false);
    expect(elementalAidsCategory("forest", "combat")).toBe(false);
  });
});

describe("elementalState", () => {
  it("effective Force is Force less what was used, never below 0", () => {
    expect(elementalState({ force: 6, forceUsed: 2 })).toMatchObject({ effectiveForce: 4, depleted: false });
    expect(elementalState({ force: 3, forceUsed: 9 })).toMatchObject({ effectiveForce: 0, depleted: true });
  });
});

const el = (o = {}) => ({ force: 5, forceUsed: 0, services: 3, service: "", sustainingSpellUuid: "", pendingExpireSpellUuid: "", ...o });

describe("Aid Sorcery", () => {
  it("starting costs one service; continuing does not", () => {
    const a = planElementalTransition(el(), "aid", { n: 2 });
    expect(a.update).toMatchObject({ "system.forceUsed": 2, "system.service": "aid", "system.services": 2 });
    const b = planElementalTransition(el({ forceUsed: 2, service: "aid", services: 2, aidInstanceId: "A" }), "aid", { n: 1 });
    expect(b.update).toEqual({ "system.forceUsed": 3, "system.service": "aid" });
  });
  it("spending the last Force makes it vanish and ends the service", () => {
    const r = planElementalTransition(el({ forceUsed: 3, service: "aid" }), "aid", { n: 2 });
    expect(r.update).toMatchObject({ "system.forceUsed": 5, "system.service": "", "system.aidInstanceId": "" });
  });
  it("refuses more dice than Force left, no services, sustaining, junk", () => {
    expect(planElementalTransition(el({ forceUsed: 4, service: "aid" }), "aid", { n: 2 }).refuse).toMatch(/only 1/);
    expect(planElementalTransition(el({ services: 0 }), "aid", { n: 1 }).refuse).toMatch(/no more services/);
    expect(planElementalTransition(el({ service: "sustain" }), "aid", { n: 1 }).refuse).toMatch(/one service at a time/);
    expect(planElementalTransition(el(), "aid", { n: 1.5 }).refuse).toBeTruthy();
    expect(planElementalTransition(el(), "aid", { n: 0 }).refuse).toBeTruthy();
  });
});

describe("Re-call — one service, back at full Force, idle (p.141)", () => {
  it("resets a depleted elemental", () => {
    const r = planElementalTransition(el({ forceUsed: 5, services: 1 }), "recall");
    expect(r.update).toMatchObject({ "system.forceUsed": 0, "system.service": "", "system.services": 0 });
  });
  it("refuses when it still has Force or the binding is exhausted", () => {
    expect(planElementalTransition(el({ forceUsed: 2 }), "recall").refuse).toBeTruthy();
    expect(planElementalTransition(el({ forceUsed: 5, services: 0 }), "recall").refuse).toMatch(/exhausted/);
  });
});

describe("Spell Sustaining — one Combat Turn per point of Force (p.142)", () => {
  it("starts for one service and counts down", () => {
    expect(planElementalTransition(el(), "startSustain", { spellUuid: "S" }).update)
      .toMatchObject({ "system.service": "sustain", "system.sustainingSpellUuid": "S", "system.services": 2 });
    expect(planElementalTransition(el({ service: "sustain", sustainingSpellUuid: "S" }), "sustainTurn").update)
      .toEqual({ "system.forceUsed": 1 });
  });
  it("at 0 Force the spell ENDS, recorded as a pending expiry", () => {
    const r = planElementalTransition(el({ forceUsed: 4, service: "sustain", sustainingSpellUuid: "S" }), "sustainTurn");
    expect(r.expire).toBe("S");
    expect(r.update).toMatchObject({ "system.forceUsed": 5, "system.service": "", "system.pendingExpireSpellUuid": "S" });
  });
  it("the mage can take over only BEFORE the Force is spent", () => {
    expect(planElementalTransition(el({ service: "sustain", sustainingSpellUuid: "S", forceUsed: 3 }), "takeOver").update)
      .toMatchObject({ "system.service": "", "system.sustainingSpellUuid": "" });
    expect(planElementalTransition(el({ service: "sustain", sustainingSpellUuid: "S", forceUsed: 5 }), "takeOver").refuse)
      .toMatch(/spell ends/);
  });
  it("one service at a time; a pending expiry blocks everything but finishing it", () => {
    expect(planElementalTransition(el({ service: "aid" }), "startSustain", { spellUuid: "S" }).refuse).toMatch(/one service/);
    const pend = el({ forceUsed: 5, pendingExpireSpellUuid: "S" });
    for (const k of ["aid", "recall", "startSustain", "sustainTurn", "takeOver", "endService"]) {
      expect(planElementalTransition(pend, k, { n: 1, spellUuid: "T" }).refuse).toMatch(/finish expiring/);
    }
    expect(planElementalTransition(pend, "finishExpire").update).toEqual({ "system.pendingExpireSpellUuid": "" });
  });
});

describe("spellCastDice with Aid Sorcery", () => {
  it("aid shares the Magic Pool's ceiling on the spell test, after the caster's own pool", () => {
    const r = spellCastDice({ force: 4, poolReq: 3, poolAvail: 5, poolCap: 4, aidReq: 5, aidAvail: 5 });
    expect(r).toMatchObject({ pool: 3, aid: 1, baseDice: 5, total: 8 });
  });
  it("aid dice are not rating dice: the Karma cap stays at Force", () => {
    const r = spellCastDice({ force: 3, aidReq: 3, aidAvail: 6, karmaReq: 9, karmaAvail: 9 });
    expect(r.karma).toBe(3);
    expect(r.aid).toBe(3);
  });
  it("aid is capped by the elemental's Force", () => {
    expect(spellCastDice({ force: 6, aidReq: 5, aidAvail: 2 }).aid).toBe(2);
  });
});

// Automatic Combat Turn countdown (0.97.0). A boundary = one ended Combat Turn,
// identified by the combat's monotonic `seq`, never the editable round label.
describe("combatBoundary — the automatic Combat Turn countdown", () => {
  const sus = (o = {}) => el({ service: "sustain", sustainingSpellUuid: "S", force: 3,
    sustainCombatId: "C", sustainFreePending: true, sustainChargedSeq: 0, sustainInstanceId: "I", ...o });
  const b = (s, a) => planElementalTransition(s, "combatBoundary", { combatId: "C", seq: 1, round: 1, ...a });
  it("the turn it took the spell over in is free", () => {
    const r = b(sus());
    expect(r.outcome).toBe("free");
    expect(r.update).toEqual({ "system.sustainCombatId": "C", "system.sustainChargedSeq": 1, "system.sustainFreePending": false });
  });
  it("then each boundary charges one point of Force, once", () => {
    const s = sus({ sustainFreePending: false, sustainChargedSeq: 1 });
    expect(b(s, { seq: 1 }).skip).toBe(true);                         // retry of a processed boundary
    expect(b(s, { seq: 2, round: 2 }).update["system.forceUsed"]).toBe(1);
  });
  it("at 0 Force the spell ends and the clock is cleared", () => {
    const r = b(sus({ forceUsed: 2, sustainFreePending: false, sustainChargedSeq: 4 }), { seq: 5, round: 5 });
    expect(r.expire).toBe("S");
    expect(r.update).toMatchObject({ "system.forceUsed": 3, "system.service": "", "system.sustainInstanceId": "",
      "system.sustainCombatId": "", "system.sustainChargedSeq": 0, "system.pendingExpireSpellUuid": "S" });
  });
  it("round 0, no sustain, and a spell mid-ending are skipped", () => {
    expect(b(sus(), { round: 0 }).skip).toBe(true);
    expect(b(el()).skip).toBe(true);
    expect(b(sus({ pendingExpireSpellUuid: "S" })).skip).toBe(true);
  });
  it("another combat is ignored while the recorded one still runs with the mage; otherwise it adopts (no free turn)", () => {
    expect(b(sus(), { combatId: "D", timingAlive: true }).skip).toBe(true);
    const r = b(sus(), { combatId: "D", seq: 7, round: 3, timingAlive: false });
    expect(r.outcome).toBe("charged");
    expect(r.update).toMatchObject({ "system.sustainCombatId": "D", "system.sustainChargedSeq": 7, "system.forceUsed": 1 });
  });
  it("startSustain starts a fresh clock; every ending clears it", () => {
    expect(planElementalTransition(el(), "startSustain", { spellUuid: "S", instanceId: "I", combatId: "C" }).update)
      .toMatchObject({ "system.sustainInstanceId": "I", "system.sustainCombatId": "C", "system.sustainFreePending": true });
    expect(planElementalTransition(el(), "startSustain", { spellUuid: "S", instanceId: "I" }).update["system.sustainFreePending"]).toBe(false);
    expect(planElementalTransition(sus(), "takeOver").update).toMatchObject({ "system.sustainInstanceId": "", "system.sustainCombatId": "" });
  });
  it("consumeFree marks a missed free turn passed without spending Force", () => {
    expect(planElementalTransition(sus(), "consumeFree").update).toEqual({ "system.sustainFreePending": false });
    // With the combat's latest boundary: recorded as processed, so its card cannot charge.
    expect(planElementalTransition(sus(), "consumeFree", { combatId: "C", seq: 3 }).update)
      .toEqual({ "system.sustainFreePending": false, "system.sustainCombatId": "C", "system.sustainChargedSeq": 3 });
    expect(planElementalTransition(sus({ sustainFreePending: false }), "consumeFree").refuse).toBeTruthy();
  });
});
