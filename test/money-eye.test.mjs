// docs/PLAN-money-queue-and-eye-accessories.md — the pure parts of the money queue and
// eye accessories (the queue itself and the Foundry writes are covered by Quench).
import { describe, it, expect } from "vitest";
import { eyeAccessoryKind, EYE_ACCESSORIES, withRowIds, rowsPaid, rowsListValue } from "../module/rules/ware-rules.mjs";
import { chargenItemCost } from "../module/rules/sr2e-rules.mjs";
import { nextBalance } from "../module/money.mjs";

const SYS = (id) => `Compendium.sr2e.cyberware.Item.${id}`;
const CT = (id) => `Compendium.sr2e-cybertechnology.ct-headware.Item.${id}`;

describe("eye accessory identity (Cybertechnology p.45)", () => {
  it("knows the core and Cybertechnology accessories and their slot kinds", () => {
    expect(eyeAccessoryKind({}, SYS("8wowabmno7q0ei3t"))).toBe("accessory");   // Low-Light
    expect(eyeAccessoryKind({}, SYS("144bdb840b3ae99b"))).toBe("camera");      // Eye Camera
    expect(eyeAccessoryKind({}, CT("f907f01feb12b228"))).toBe("weapon");       // Eye Gun
    expect(eyeAccessoryKind({}, CT("a3c6d19af545c440"))).toBe("toolLaser");    // Eye Tool Laser
    expect(eyeAccessoryKind({}, CT("27d05df8d5e89cd2"))).toBe("camera");       // Opticam
  });
  it("never the eyes themselves; unknown items stay ordinary drops; a rule flag wins", () => {
    expect(eyeAccessoryKind({}, SYS("wl7u7gj9e000jvwv"))).toBeNull();          // core Cybereyes
    expect(eyeAccessoryKind({}, CT("c34224fc4f8bcecb"))).toBeNull();           // CT Cybereyes
    expect(eyeAccessoryKind({}, "Compendium.x.y.Item.z")).toBeNull();
    expect(eyeAccessoryKind({ sr2e: { rule: "eye-accessory:camera" } })).toBe("camera");
    expect(eyeAccessoryKind({ sr2e: { rule: "eye-accessory:bogus" } })).toBe("accessory");
    expect(Object.values(EYE_ACCESSORIES).every(k => ["accessory", "weapon", "toolLaser", "camera"].includes(k))).toBe(true);
  });
});

describe("eye rows", () => {
  it("legacy rows get ids in order; rows that all have ids are left alone", () => {
    let n = 0;
    const fixed = withRowIds([{ name: "a" }, { id: "x", name: "b" }, { name: "c" }], () => `id${++n}`);
    expect(fixed.map(r => r.id)).toEqual(["id1", "x", "id2"]);
    expect(withRowIds([{ id: "x" }], () => "no")).toBeNull();
  });
  it("what rows refund and count in creation", () => {
    const rows = [{ paid: 3750, listValue: 3000 }, { paid: 0, listValue: 0 }, {}];
    expect([rowsPaid(rows), rowsListValue(rows)]).toEqual([3750, 3000]);
  });
  it("chargen counts bought accessories after the eye's own price", () => {
    expect(chargenItemCost({ type: "cyberware", cost: 5000, grade: "standard", moduleListValue: 3000 })).toBe(8000);
    expect(chargenItemCost({ type: "cyberware", cost: 5000, grade: "standard" })).toBe(5000);
  });
});

describe("the money queue's balance math", () => {
  it("moves the live balance; never below 0", () => {
    expect(nextBalance(1000, -400)).toBe(600);
    expect(nextBalance(1000, 250)).toBe(1250);
    expect(nextBalance(100, -101)).toBeNull();
    expect(nextBalance(undefined, 0)).toBe(0);
  });
});
