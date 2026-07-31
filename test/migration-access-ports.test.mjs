// 0.72.0 taught the system to read `accessPorts` instead of guessing from an
// implant's name — but only items that DECLARE the field benefit, and an implant
// already embedded on a live PC does not. A player with a Level 4 Softlink was
// still told to "install a chipjack, datajack, or headware memory" after the fix.
// This pins the backfill migration.
import { describe, it, expect } from "vitest";
import { MIGRATIONS } from "../module/migrations.mjs";

const migrate = MIGRATIONS.find(m => m.version === "0.72.1").migrateItem;
const ware = (name, system = {}) => ({ type: "cyberware", name, system });

describe("0.72.1 — backfill accessPorts on existing chip readers", () => {
  it("gives a Softlink one port per Level", () => {
    // The reported case: Blackbriar's Level 4 Softlink (Shadowtech p.46).
    expect(migrate(ware("Softlink", { rating: 4 }))).toEqual({ "system.accessPorts": 4 });
  });

  it("floors an unrated Softlink at one port", () => {
    expect(migrate(ware("Softlink", {}))).toEqual({ "system.accessPorts": 1 });
  });

  it("gives a Chipjack exactly one port regardless of rating", () => {
    expect(migrate(ware("Chipjack", { rating: 3 }))).toEqual({ "system.accessPorts": 1 });
  });

  it("leaves an already-declared implant alone", () => {
    // Re-running must not re-derive over an authored value.
    expect(migrate(ware("Softlink", { rating: 4, accessPorts: 2 }))).toBe(null);
  });

  it("leaves unknown implants for their own sourcebook to declare", () => {
    expect(migrate(ware("Cybereyes", { rating: 0 }))).toBe(null);
    expect(migrate(ware("Datajack", {}))).toBe(null);   // already works by name
  });

  it("ignores non-cyberware", () => {
    expect(migrate({ type: "gear", name: "Softlink", system: {} })).toBe(null);
  });
});
