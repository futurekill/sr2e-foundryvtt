import { describe, it, expect } from "vitest";
import { movementRates, runMultiplierForRace, RUN_MULTIPLIER }
  from "../module/rules/sr2e-rules.mjs";

// SR2E p.83 movement rates (per Combat Phase). Backs module/movement.mjs, whose
// ruler coloring + cap are canvas-layer and verified live in Foundry.
describe("Movement rates (SR2E p.83)", () => {
  it("Running Table modifiers: human/elf/ork ×3, dwarf/troll ×2", () => {
    expect(RUN_MULTIPLIER).toEqual({ human: 3, elf: 3, ork: 3, dwarf: 2, troll: 2 });
    expect(runMultiplierForRace("Troll")).toBe(2);   // case-insensitive
    expect(runMultiplierForRace("dwarf")).toBe(2);
    expect(runMultiplierForRace("elf")).toBe(3);
    expect(runMultiplierForRace("gnome")).toBe(3);   // unknown → human ×3
    expect(runMultiplierForRace(undefined)).toBe(3);
  });

  it("walk = Quickness, run = Quickness × modifier", () => {
    expect(movementRates(5, 3)).toEqual({ walk: 5, run: 15 });   // human Q5
    expect(movementRates(6, 2)).toEqual({ walk: 6, run: 12 });   // troll Q6
    expect(movementRates(0)).toEqual({ walk: 0, run: 0 });
    expect(movementRates(4.9, 3)).toEqual({ walk: 4, run: 12 }); // floored
  });
});
