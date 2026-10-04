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
    // A failed restore keeps the remembered value, so a fresh tab can try again.
    expect(canvasPlan({ companion: false, noCanvas: true, remembered: false, reloaded: true })).toEqual({ reload: false });
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

import { targetChoices } from "../module/rules/companion-rules.mjs";

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

describe("phone join (docs/PLAN-companion-join.md)", async () => {
  const R = await import("../module/rules/companion-rules.mjs");
  it("strips ?companion= once, keeping everything else", () => {
    expect(R.stripCompanionParam("http://h:30000/game?companion=1")).toBe("/game");
    expect(R.stripCompanionParam("http://h/pre/game?x=2&companion=on#y")).toBe("/pre/game?x=2#y");
    expect(R.stripCompanionParam("http://h/game?x=2")).toBeNull();
  });
  it("finds the route prefix from the page's exact path", () => {
    expect(R.pagePrefix("/systems/sr2e/companion-join.html")).toBe("");
    expect(R.pagePrefix("/foundry/systems/sr2e/companion-join.html")).toBe("/foundry");
    expect(R.pagePrefix("/systems/sr2e/other.html")).toBeNull();
  });
  it("accepts only a Foundry id, and keeps a hostile name as literal text", () => {
    expect(R.parseJoinFragment("#u=AbCdEfGh12345678&n=Alice")).toEqual({ userId: "AbCdEfGh12345678", name: "Alice" });
    expect(R.parseJoinFragment("#u=../../x&n=A")).toBeNull();
    expect(R.parseJoinFragment("#n=A")).toBeNull();
    const evil = "<img src=x onerror=alert(1)>";
    expect(R.parseJoinFragment("#" + new URLSearchParams({ u: "AbCdEfGh12345678", n: evil })).name).toBe(evil);
  });
  it("normalises the phone's address and refuses anything but an http(s) origin", () => {
    expect(R.normalizeAddress("http://192.168.1.20:30000/")).toEqual({ origin: "http://192.168.1.20:30000" });
    expect(R.normalizeAddress("https://vtt.example.com")).toEqual({ origin: "https://vtt.example.com" });
    expect(R.normalizeAddress("http://localhost:30000").warning).toMatch(/can't reach/);
    expect(R.normalizeAddress("http://127.0.0.1:30000").warning).toMatch(/can't reach/);
    expect(R.normalizeAddress("http://mac.local:30000").warning).toMatch(/may need/);
    for (const bad of ["ftp://h", "javascript:alert(1)", "http://u:p@h", "http://h/join", "http://h?x=1", "http://h#f", "nonsense"]) {
      expect(R.normalizeAddress(bad).error, bad).toBeTruthy();
    }
  });
  it("builds the link with the route prefix and an encoded fragment", () => {
    const link = R.joinLink({ origin: "http://h:30000", route: "/foundry/systems/sr2e/companion-join.html", userId: "AbCdEfGh12345678", name: "Mel & Co" });
    expect(link).toBe("http://h:30000/foundry/systems/sr2e/companion-join.html#u=AbCdEfGh12345678&n=Mel+%26+Co");
    expect(R.parseJoinFragment(new URL(link).hash).name).toBe("Mel & Co");
  });
  it("reads a join response strictly", () => {
    expect(R.joinResult({ status: 200, contentType: "application/json", body: '{"status":"success"}' })).toEqual({ ok: true });
    expect(R.joinResult({ status: 200, contentType: "text/html", body: "<html>" }).ok).toBe(false);
    expect(R.joinResult({ status: 200, contentType: "application/json", body: "{" }).ok).toBe(false);
    expect(R.joinResult({ status: 401, body: "JOIN.ErrorInvalidPassword" }).message).toBe("Wrong password.");
    expect(R.joinResult({ status: 401, body: "who knows" }).message).toMatch(/HTTP 401/);
    expect(R.joinResult({ status: 0 }).message).toBe("Couldn't reach the game. Is it running?");
  });
});
