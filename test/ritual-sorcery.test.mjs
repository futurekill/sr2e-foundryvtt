import { describe, it, expect } from "vitest";
import { ritualMaterialsCost, ritualLinkTN, ritualSendingTN, ritualStageHours, ritualTeamMax,
         ritualResistTN, ritualSustainHours, damageUpdateFor } from "../module/rules/sr2e-rules.mjs";

describe("ritual sorcery (SR2E p.133–137)", () => {
  it("materials by category (p.133); combat can't be ritually cast", () => {
    expect(ritualMaterialsCost("detection", 4)).toBe(400);
    expect(ritualMaterialsCost("health", 4)).toBe(2000);
    expect(ritualMaterialsCost("illusion", 4)).toBe(400);
    expect(ritualMaterialsCost("manipulation", 4)).toBe(4000);
    expect(ritualMaterialsCost("combat", 4)).toBeNull();
  });
  it("Material Link Table + modifiers (p.136)", () => {
    expect(ritualLinkTN({ location: "city" })).toBe(5);
    expect(ritualLinkTN({ location: "state" })).toBe(7);
    expect(ritualLinkTN({ location: "continent" })).toBe(9);
    expect(ritualLinkTN({ location: "unknown" })).toBe(11);
    expect(ritualLinkTN({ location: "city", spirit: true, barrier: 3, lodge: 2, staleTissue: true })).toBe(16);
  });
  it("Sending Table + modifiers (p.136)", () => {
    expect(ritualSendingTN({ targetType: "place" })).toBe(6);
    expect(ritualSendingTN({ targetType: "metahuman" })).toBe(6);
    expect(ritualSendingTN({ targetType: "object" })).toBe(8);
    expect(ritualSendingTN({ targetType: "spirit" })).toBe(8);
    expect(ritualSendingTN({ targetType: "metahuman", fastMoving: true, area: true })).toBe(7);
  });
  it("stage hours: Force ÷ successes, fractional; the sending's 1-hour minimum; an abort costs Force", () => {
    expect(ritualStageHours(5, 2)).toBe(2.5);
    expect(ritualStageHours(3, 6, { minimum: 1 })).toBe(1);
    expect(ritualStageHours(3, 6)).toBe(0.5);
    expect(ritualStageHours(5, 0)).toBe(5);
  });
  it("team size is the lowest Sorcery (p.135: Sorcery 4 → three others)", () => {
    expect(ritualTeamMax([6, 4, 5])).toBe(4);
  });
  it("resistance TN = max(Force, Ritual Sorcery) (p.137)", () => {
    expect(ritualResistTN(4, 6)).toBe(6);
    expect(ritualResistTN(7, 6)).toBe(7);
  });
  it("leftover dice sustain for leader Magic × dice hours (p.137)", () => {
    expect(ritualSustainHours(6, 3)).toBe(18);
  });
  it("damageUpdateFor: Stun spills into Physical, Physical into overflow", () => {
    const m = (p, s, o = 0) => ({ physical: { value: p, max: 10 }, stun: { value: s, max: 10 }, overflow: o });
    expect(damageUpdateFor(m(0, 0), "stun", 3)).toEqual({ physical: 0, stun: 3, overflow: 0 });
    expect(damageUpdateFor(m(2, 8), "stun", 6)).toEqual({ physical: 6, stun: 10, overflow: 0 });
    expect(damageUpdateFor(m(8, 0), "physical", 6)).toEqual({ physical: 10, stun: 0, overflow: 4 });
    expect(damageUpdateFor(m(9, 9), "stun", 3)).toEqual({ physical: 10, stun: 10, overflow: 1 });
  });
});
