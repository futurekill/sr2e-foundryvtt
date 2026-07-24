// Dice Pool refresh (SR2 p.84): Combat, Hacking, Magic and Control refresh to
// full; the Karma Pool does NOT (it isn't a dicePool). Committed Spell Defense
// releases when the Magic Pool refreshes (p.132).
import { describe, it, expect } from "vitest";
import { dicePoolRefreshUpdates } from "../module/rules/sr2e-rules.mjs";

const full = (max) => ({ value: max, max });
const spent = (value, max) => ({ value, max });

describe("dicePoolRefreshUpdates", () => {
  it("refreshes a spent pool back to its max", () => {
    expect(dicePoolRefreshUpdates({ combat: spent(1, 6) }))
      .toEqual({ "system.dicePools.combat.value": 6 });
  });

  it("refreshes all four refreshable pools", () => {
    const u = dicePoolRefreshUpdates({
      combat: spent(0, 5), hacking: spent(2, 4), magic: spent(1, 6), control: spent(3, 7)
    });
    expect(u).toEqual({
      "system.dicePools.combat.value": 5,
      "system.dicePools.hacking.value": 4,
      "system.dicePools.magic.value": 6,
      "system.dicePools.control.value": 7
    });
  });

  it("releases committed Spell Defense AND its free Shielding bonus (p.132/Grimoire p.45)", () => {
    // Both are set together on allocation and must both release on refresh, or
    // surviving Shielding dice keep getting rolled on Resist Spell.
    expect(dicePoolRefreshUpdates({ magic: full(6), spellDefense: 3, shieldingBonus: 2 }))
      .toEqual({ "system.dicePools.spellDefense": 0, "system.dicePools.shieldingBonus": 0 });
    // Shielding can survive even when spellDefense is already 0.
    expect(dicePoolRefreshUpdates({ magic: full(6), spellDefense: 0, shieldingBonus: 2 }))
      .toEqual({ "system.dicePools.shieldingBonus": 0 });
  });

  it("is a no-op when everything is already full — no needless update", () => {
    expect(dicePoolRefreshUpdates({ combat: full(6), magic: full(4), spellDefense: 0 })).toEqual({});
    expect(dicePoolRefreshUpdates({})).toEqual({});
  });

  it("only touches pools the actor actually has (an NPC has combat + magic)", () => {
    const u = dicePoolRefreshUpdates({ combat: spent(0, 4), magic: spent(0, 2) });
    expect(u).toEqual({
      "system.dicePools.combat.value": 4,
      "system.dicePools.magic.value": 2
    });
    expect(u).not.toHaveProperty("system.dicePools.hacking.value");
    expect(u).not.toHaveProperty("system.dicePools.control.value");
  });

  it("never touches the Karma Pool — it does not refresh this way", () => {
    // Karma is system.karma.pool, not a dicePool; even if passed in, it is ignored.
    const u = dicePoolRefreshUpdates({ combat: spent(0, 5), karma: spent(1, 8) });
    expect(u).toEqual({ "system.dicePools.combat.value": 5 });
    expect(Object.keys(u).some(k => /karma/i.test(k))).toBe(false);
  });
});
