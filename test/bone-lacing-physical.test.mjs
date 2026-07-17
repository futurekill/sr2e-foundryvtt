import { describe, it, expect } from "vitest";
import { appliesBoneLacingPhysical, unarmedPhysicalPower } from "../module/rules/sr2e-rules.mjs";

// Shadowtech p.42: "A character with bone lacing can also choose to have his
// unarmed blows do physical damage, but the Power Level of the attack is halved
// (round up)." It is a per-attack CHOICE, not a property of the weapon.
describe("bone-lacing physical option", () => {
  it("halves the Power, rounding up", () => {
    expect(unarmedPhysicalPower(9)).toBe(5);   // (Str 6 + titanium 3)
    expect(unarmedPhysicalPower(8)).toBe(4);   // (Str 5 + titanium 3)
    expect(unarmedPhysicalPower(7)).toBe(4);   // odd rounds up
    expect(unarmedPhysicalPower(1)).toBe(1);
  });

  it("applies only when chosen, with lacing, and Killing Hands is not in play", () => {
    expect(appliesBoneLacingPhysical({ boneLacingPhysical: true, killingHands: "", unarmedPowerBonus: 3 })).toBe(true);
    expect(appliesBoneLacingPhysical({ boneLacingPhysical: false, killingHands: "", unarmedPowerBonus: 3 })).toBe(false);
    // No lacing → no option (the +Power is what buys the physical choice).
    expect(appliesBoneLacingPhysical({ boneLacingPhysical: true, killingHands: "", unarmedPowerBonus: 0 })).toBe(false);
    // Killing Hands supplies physical under its own rule and is NOT halved.
    expect(appliesBoneLacingPhysical({ boneLacingPhysical: true, killingHands: "M", unarmedPowerBonus: 3 })).toBe(false);
  });

  it("does not infer the option from missing input", () => {
    expect(appliesBoneLacingPhysical()).toBe(false);
    expect(appliesBoneLacingPhysical({})).toBe(false);
  });
});
