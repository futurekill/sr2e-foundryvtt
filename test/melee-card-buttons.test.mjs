import { describe, it, expect } from "vitest";
import "./foundry-shim.mjs";
import { renderMeleeAttackCard } from "../module/documents/item.mjs";

// The damage-resist click handler binds to `.sr2e-resist-btn` and requires
// data-power. The Defend/Undefended buttons SHARE that class for styling but
// carry no data-power, so the handler skips them. If a future edit put data-power
// on an action button, clicking Undefended would re-open the bogus
// "Resist Damage: M (Power 0)" dialog that this guards against.
describe("melee attack card action buttons", () => {
  const card = renderMeleeAttackCard({
    attackerName: "Razor", weaponName: "Unarmed Strike (physical, ½ Power)",
    successes: 3, power: 5, level: "M", damageType: "physical", resolved: false
  });

  it("offers Defend and Undefended", () => {
    expect(card).toMatch(/sr2e-defend-btn/);
    expect(card).toMatch(/sr2e-undefended-btn/);
  });

  it("gives the action buttons NO data-power (so the resist handler skips them)", () => {
    // Isolate each <button> and assert none of the action buttons carry data-power.
    const buttons = card.match(/<button[^>]*>/g) ?? [];
    for (const b of buttons) {
      if (/sr2e-(defend|undefended)-btn/.test(b)) {
        expect(b, `action button must not carry data-power: ${b}`).not.toMatch(/data-power/);
      }
    }
  });

  it("shows the halved base damage in the card text", () => {
    expect(card).toMatch(/Base damage 5M/);
  });
});
