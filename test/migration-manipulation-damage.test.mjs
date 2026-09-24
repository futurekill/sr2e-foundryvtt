// 0.95.0: Spark and Flame Bomb shipped with an empty damageCode, so copies on
// characters could not deal their (F)M (SR2E p.158). The backfill is by value
// and by our exact names — never `=== undefined` (see CLAUDE.md, Migrations).
import { describe, it, expect } from "vitest";
import { MIGRATIONS } from "../module/migrations.mjs";

const migrate = MIGRATIONS.find(m => m.version === "0.95.0").migrateItem;
// Shaped like toObject() output: every schema default present, damageCode "".
const spell = (name, system = {}) => ({ type: "spell", name,
  system: { category: "manipulation", type: "physical", damageCode: "", isAreaEffect: false, ...system } });

describe("0.95.0 — fill the damage code on shipped damaging manipulation spells", () => {
  it("fills Spark and Flame Bomb", () => {
    expect(migrate(spell("Spark"))).toEqual({ "system.damageCode": "(F)M" });
    expect(migrate(spell("Flame Bomb", { isAreaEffect: true }))).toEqual({ "system.damageCode": "(F)M" });
  });
  it("leaves an authored code alone (re-running is harmless)", () => {
    expect(migrate(spell("Flamethrower", { damageCode: "(F)M" }))).toBe(null);
    expect(migrate(spell("Spark", { damageCode: "(F+1)M" }))).toBe(null);
  });
  it("never touches homebrew, other categories, or other item types", () => {
    expect(migrate(spell("Spark (custom)"))).toBe(null);
    expect(migrate(spell("Spark", { category: "combat" }))).toBe(null);
    expect(migrate({ type: "gear", name: "Spark", system: {} })).toBe(null);
  });
});
