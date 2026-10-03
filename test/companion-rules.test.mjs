// Mobile companion mode — the pure decisions (docs/PLAN-companion.md).
import { describe, it, expect } from "vitest";
import { companionMode, overrideFromQuery, canvasPlan, companionActor } from "../module/rules/companion-rules.mjs";

describe("which devices get the companion", () => {
  const phone = { width: 375, height: 812, coarse: true };
  it("a touch device below Foundry's minimum does; a desktop window dragged narrow does not", () => {
    expect(companionMode(phone)).toBe(true);
    expect(companionMode({ width: 820, height: 1180, coarse: true })).toBe(true);     // tablet, portrait
    expect(companionMode({ width: 1366, height: 1024, coarse: true })).toBe(false);   // large tablet, landscape
    expect(companionMode({ width: 600, height: 500, coarse: false })).toBe(false);    // narrow desktop window
    expect(companionMode({ width: 1920, height: 1080, coarse: false })).toBe(false);
  });
  it("the device's stored choice wins either way", () => {
    expect(companionMode({ ...phone, override: "off" })).toBe(false);
    expect(companionMode({ width: 1920, height: 1080, coarse: false, override: "on" })).toBe(true);
  });
  it("reads the override from the address", () => {
    expect(overrideFromQuery("?companion=1")).toBe("on");
    expect(overrideFromQuery("?x=1&companion=off")).toBe("off");
    expect(overrideFromQuery("?companion=auto")).toBe("auto");
    expect(overrideFromQuery("?companion=maybe")).toBeUndefined();
    expect(overrideFromQuery("")).toBeUndefined();
  });
});

describe("the canvas switch", () => {
  it("entering: remembers the old value, turns the canvas off, reloads once", () => {
    expect(canvasPlan({ companion: true, noCanvas: false, remembered: null, reloaded: false }))
      .toEqual({ set: true, remember: true, reload: true });
    expect(canvasPlan({ companion: true, noCanvas: true, remembered: false, reloaded: true })).toEqual({ reload: false });
  });
  it("never loops: a second pass in the same tab carries on", () => {
    expect(canvasPlan({ companion: true, noCanvas: false, remembered: null, reloaded: true })).toEqual({ reload: false });
    expect(canvasPlan({ companion: false, noCanvas: true, remembered: false, reloaded: true })).toEqual({ forget: true, reload: false });
  });
  it("leaving: restores what the device had, and leaves a device we never touched alone", () => {
    expect(canvasPlan({ companion: false, noCanvas: true, remembered: false, reloaded: false }))
      .toEqual({ set: false, forget: true, reload: true });
    expect(canvasPlan({ companion: false, noCanvas: true, remembered: null, reloaded: false })).toEqual({ reload: false });
    expect(canvasPlan({ companion: false, noCanvas: true, remembered: true, reloaded: false })).toEqual({ forget: true, reload: false });
  });
});

describe("which character", () => {
  it("stored pick, then the assigned character, then a sole owned one; otherwise ask", () => {
    expect(companionActor({ storedId: "b", assignedId: "a", ownedIds: ["a", "b"] })).toBe("b");
    expect(companionActor({ storedId: "gone", assignedId: "a", ownedIds: ["a", "b"] })).toBe("a");
    expect(companionActor({ ownedIds: ["a"] })).toBe("a");
    expect(companionActor({ ownedIds: ["a", "b"] })).toBeNull();
    expect(companionActor({ ownedIds: [] })).toBeNull();
  });
});

import { shouldApplyTargets, targetChoices } from "../module/rules/companion-rules.mjs";

describe("shared targets between a player's devices", () => {
  it("ignores this device's own writes and anything older than what it has", () => {
    const rec = { seq: 10, by: "phone" };
    expect(shouldApplyTargets({ record: rec, mySocketId: "computer", lastSeq: 5 })).toBe(true);
    expect(shouldApplyTargets({ record: rec, mySocketId: "phone", lastSeq: 5 })).toBe(false);
    expect(shouldApplyTargets({ record: rec, mySocketId: "computer", lastSeq: 10 })).toBe(false);
    expect(shouldApplyTargets({ record: null, mySocketId: "computer" })).toBe(false);
  });
});

describe("the target list", () => {
  const rows = [
    { id: "me", name: "Me", own: true },
    { id: "h", name: "Hidden", hidden: true },
    { id: "s", name: "Spirit", astralOnly: true, distance: 2 },
    { id: "far", name: "Far ganger", distance: 30, inCombat: true },
    { id: "near", name: "Near ganger", distance: 5, inCombat: true },
    { id: "by", name: "Bystander", distance: 3 }
  ];
  it("drops self, hidden and astral-only; combatants first, then nearest", () => {
    expect(targetChoices(rows).map(r => r.id)).toEqual(["near", "far", "by"]);
  });
  it("an astrally active character also sees astral-only tokens", () => {
    expect(targetChoices(rows, { astralActive: true }).map(r => r.id)).toEqual(["near", "far", "s", "by"]);
  });
});
