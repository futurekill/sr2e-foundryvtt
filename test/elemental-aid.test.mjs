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
    expect(a.update).toEqual({ "system.forceUsed": 2, "system.service": "aid", "system.services": 2 });
    const b = planElementalTransition(el({ forceUsed: 2, service: "aid", services: 2 }), "aid", { n: 1 });
    expect(b.update).toEqual({ "system.forceUsed": 3, "system.service": "aid" });
  });
  it("spending the last Force makes it vanish and ends the service", () => {
    const r = planElementalTransition(el({ forceUsed: 3, service: "aid" }), "aid", { n: 2 });
    expect(r.update).toEqual({ "system.forceUsed": 5, "system.service": "" });
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
    expect(r.update).toEqual({ "system.forceUsed": 0, "system.service": "", "system.services": 0 });
  });
  it("refuses when it still has Force or the binding is exhausted", () => {
    expect(planElementalTransition(el({ forceUsed: 2 }), "recall").refuse).toBeTruthy();
    expect(planElementalTransition(el({ forceUsed: 5, services: 0 }), "recall").refuse).toMatch(/exhausted/);
  });
});

describe("Spell Sustaining — one Combat Turn per point of Force (p.142)", () => {
  it("starts for one service and counts down", () => {
    expect(planElementalTransition(el(), "startSustain", { spellUuid: "S" }).update)
      .toEqual({ "system.service": "sustain", "system.sustainingSpellUuid": "S", "system.services": 2 });
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
      .toEqual({ "system.service": "", "system.sustainingSpellUuid": "" });
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
