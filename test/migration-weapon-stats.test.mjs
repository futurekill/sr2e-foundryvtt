// 0.104.3: the Colt M22A2, H&K G12A3z and Mossberg CMDT shipped with pre-conversion
// combat stats; the core book's Sourcebook Updates (p.279) is canonical. Field by field,
// by exact shipped value.
import { describe, it, expect, beforeAll } from "vitest";
import "./foundry-shim.mjs";
import { MIGRATIONS } from "../module/migrations.mjs";

let migrate;
beforeAll(() => {
  globalThis.foundry ??= {};
  globalThis.foundry.utils ??= {};
  globalThis.foundry.utils.getProperty ??= (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
  migrate = MIGRATIONS.find(m => m.version === "0.104.3").migrateItem;
});
const gun = (name, system) => ({ type: "weapon", name, system: { ammo: { max: 30 }, firingModes: { ss: false, sa: true, bf: true, fa: false }, ...system } });

describe("0.104.3 — Sourcebook Updates gun stats", () => {
  it("corrects each field still at its shipped value", () => {
    expect(migrate(gun("HK G12A3Z", { damageCode: "8S", concealability: 99, ammo: { max: 33 } })))
      .toEqual({ "system.damageCode": "8M", "system.concealability": 2, "system.ammo.max": 32 });
    expect(migrate(gun("Mossberg CMDT", { damageCode: "8S", firingModes: { ss: false, sa: true, bf: false, fa: false } })))
      .toEqual({ "system.damageCode": "9S", "system.firingModes.bf": true });
    expect(migrate(gun("Colt M22A2", { damageCode: "8M" }))).toEqual({ "system.firingModes.fa": true });
  });
  it("keeps any field the GM changed, and is harmless to re-run", () => {
    expect(migrate(gun("HK G12A3Z", { damageCode: "9M", concealability: 99, ammo: { max: 33 } })))
      .toEqual({ "system.concealability": 2, "system.ammo.max": 32 });
    expect(migrate(gun("Mossberg CMDT", { damageCode: "9S", firingModes: { ss: false, sa: true, bf: true, fa: false } }))).toBe(null);
  });
  it("never touches other weapons", () => {
    expect(migrate(gun("AK-97", { damageCode: "8S" }))).toBe(null);
    expect(migrate({ type: "gear", name: "HK G12A3Z", system: { damageCode: "8S" } })).toBe(null);
  });
});
