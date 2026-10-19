// Increase Attribute and Increase Cybered Attribute (SR2E p.154–155, read from renders):
// four spells each, +1…+4, Drain [(F ÷ 2) + 1] / [(F ÷ 2) + 3] at L/M/S/D.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import "./foundry-shim.mjs";
import { parseDrainCode } from "../module/data/item-data.mjs";

const spells = readdirSync("packs-src/spells").filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(readFileSync(`packs-src/spells/${f}`, "utf8")));
const named = (n) => spells.find(s => s.name === n);

describe("Increase Attribute spells (p.154–155)", () => {
  for (const [prefix, mod, type] of [["Increase [Attribute]", 1, "mana"], ["Increase Cybered [Attribute]", 3, "physical"]]) {
    it(`${prefix} +1…+4: Drain (F/2)+${mod} at L/M/S/D, ${type}`, () => {
      ["L", "M", "S", "D"].forEach((level, i) => {
        const s = named(`${prefix} +${i + 1}`);
        expect(s, `${prefix} +${i + 1}`).toBeTruthy();
        expect(parseDrainCode(s.system.drainCode)).toEqual({ modifier: mod, level, levelFromWound: false });
        expect(s.system.type).toBe(type);
        expect(s.effects[0].changes[0].value).toBe(String(i + 1));
      });
    });
  }
  it("the old single spell is gone", () => expect(named("Increase [Attribute]")).toBeUndefined());
});
