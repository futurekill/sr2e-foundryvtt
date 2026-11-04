// Matrix jackpoints — the pure decisions (docs/PLAN-matrix-jackpoints.md).
import { describe, it, expect } from "vitest";
import { winner, gmCleanup, tabDecision, bodyMarked, personaLit, desiredPersonas, rectInRegion, placePersona } from "../module/rules/jackpoint-rules.mjs";

const S = (since, extra = {}) => ({ jackpoint: "J", originToken: "Scene.o.Token.t", destScene: "matrix", user: "u", since, ...extra });

describe("arbitration", () => {
  it("the earliest session wins; ties by id", () => {
    expect(winner({ b: S(2), a: S(5) }).id).toBe("b");
    expect(winner({ z: S(1), y: S(1) }).id).toBe("y");
    expect(winner({})).toBeNull();
  });
  it("the GM deletes every non-winner, all keys when Matrix mode is off, and an invalid winner", () => {
    expect(gmCleanup({ sessions: { a: S(1), b: S(2), c: S(3) }, matrixMode: true }).sort()).toEqual(["b", "c"]);
    expect(gmCleanup({ sessions: { a: S(1), b: S(2) }, matrixMode: false }).sort()).toEqual(["a", "b"]);
    expect(gmCleanup({ sessions: { a: S(1) }, matrixMode: true, isValid: () => false })).toEqual(["a"]);
  });
});

describe("a tab's decision", () => {
  const rec = (phase, extra = {}) => ({ actorUuid: "Actor.x", session: "a", phase, originScene: "meat", destScene: "matrix", ...extra });
  it("pending and winning → enter; pending and losing → cancel its own key without moving", () => {
    expect(tabDecision({ record: rec("pending"), sessions: { a: S(1) }, matrixMode: true, currentScene: "meat" }))
      .toEqual({ action: "enter", scene: "matrix" });
    expect(tabDecision({ record: rec("pending"), sessions: { b: S(1), a: S(2) }, matrixMode: true, currentScene: "meat" }))
      .toEqual({ action: "cancel", deleteKey: "a" });
    expect(tabDecision({ record: rec("pending"), sessions: {}, matrixMode: true, currentScene: "meat" }))
      .toEqual({ action: "cancel", deleteKey: undefined });
  });
  it("termination first: Matrix mode off with a winning key returns (a reload after a dump, no GM)", () => {
    expect(tabDecision({ record: rec("entered"), sessions: { a: S(1) }, matrixMode: false, currentScene: "matrix" }))
      .toEqual({ action: "return", deleteKey: "a", scene: "meat" });
  });
  it("an entered tab that lost returns; one that wandered elsewhere just forgets", () => {
    expect(tabDecision({ record: rec("entered"), sessions: { b: S(0), a: S(1) }, matrixMode: true, currentScene: "matrix" }).action).toBe("return");
    expect(tabDecision({ record: rec("entered"), sessions: {}, matrixMode: false, currentScene: "elsewhere" }))
      .toEqual({ action: "clear", deleteKey: undefined });
  });
  it("a live session reloaded elsewhere re-enters; a gone origin falls back to the active scene", () => {
    expect(tabDecision({ record: rec("entered"), sessions: { a: S(1) }, matrixMode: true, currentScene: "meat", resume: true }))
      .toEqual({ action: "enter", scene: "matrix" });
    // An ordinary check leaves a player who navigated away where they are.
    expect(tabDecision({ record: rec("entered"), sessions: { a: S(1) }, matrixMode: true, currentScene: "meat" }))
      .toEqual({ action: "stay" });
    expect(tabDecision({ record: rec("entered"), sessions: {}, matrixMode: false, currentScene: "matrix", sceneExists: () => false }).scene).toBeNull();
    expect(tabDecision({ record: rec("entered"), sessions: { a: S(1) }, matrixMode: true, currentScene: "matrix" }).action).toBe("stay");
  });
  it("no canvas at all (the destination torn down) still recovers", () => {
    expect(tabDecision({ record: rec("entered"), sessions: {}, matrixMode: false, currentScene: undefined }).action).toBe("return");
    expect(tabDecision({ record: rec("entered"), sessions: {}, matrixMode: false, currentScene: "gone", sceneExists: (id) => id !== "gone" }).action).toBe("return");
  });
  it("an invalid destination terminates", () => {
    expect(tabDecision({ record: rec("entered"), sessions: { a: S(1) }, matrixMode: true, currentScene: "matrix", isValid: () => false }).action).toBe("return");
  });
  it("a returning record is kept until the return succeeds (the same decision repeats)", () => {
    const d = { record: rec("returning"), sessions: {}, matrixMode: false, currentScene: "matrix" };
    expect(tabDecision(d).action).toBe("return");
    expect(tabDecision(d).action).toBe("return");
  });
});

describe("markers", () => {
  it("only the live session's origin token is marked", () => {
    expect(bodyMarked({ tokenUuid: "Scene.o.Token.t", sessions: { a: S(1) }, matrixMode: true })).toBe(true);
    expect(bodyMarked({ tokenUuid: "Scene.o.Token.other", sessions: { a: S(1) }, matrixMode: true })).toBe(false);
    expect(bodyMarked({ tokenUuid: "Scene.o.Token.t", sessions: { a: S(1) }, matrixMode: false })).toBe(false);
  });
  it("a persona is lit only on its session's snapshot scene", () => {
    expect(personaLit({ sceneId: "matrix", sessions: { a: S(1) }, matrixMode: true })).toBe(true);
    expect(personaLit({ sceneId: "retargeted", sessions: { a: S(1) }, matrixMode: true })).toBe(false);
  });
});

// ── Persona tokens (docs/PLAN-matrix-persona-tokens.md) ──
describe("which personas a Matrix scene should have", () => {
  const T = (id, actorId, extra = {}) => ({ id, actorId, actorLink: true, managed: true, usable: true, ...extra });
  const live = (...ids) => new Set(ids);
  it("creates one when a live decker has none; none when the session ended", () => {
    expect(desiredPersonas({ tokens: [], live: live("a") })).toEqual({ create: ["a"], remove: [] });
    expect(desiredPersonas({ tokens: [T("t1", "a")], live: live() }).remove).toEqual([{ id: "t1", reason: "ended" }]);
  });
  it("a usable hand-placed persona wins: no create, and a managed one goes", () => {
    const hand = T("h", "a", { managed: false });
    expect(desiredPersonas({ tokens: [hand], live: live("a") })).toEqual({ create: [], remove: [] });
    expect(desiredPersonas({ tokens: [hand, T("m", "a")], live: live("a") }).remove).toEqual([{ id: "m", reason: "hand-placed" }]);
  });
  it("never removes a hand-placed persona, even with no session or unusable", () => {
    const hand = T("h", "a", { managed: false, usable: false, actorLink: false });
    expect(desiredPersonas({ tokens: [hand], live: live() }).remove).toEqual([]);
  });
  it("a hidden hand-placed persona doesn't block a managed one (R1 #6)", () => {
    const hand = T("h", "a", { managed: false, usable: false });
    expect(desiredPersonas({ tokens: [hand], live: live("a") }).create).toEqual(["a"]);
    expect(desiredPersonas({ tokens: [hand, T("m", "a")], live: live("a") })).toEqual({ create: [], remove: [] });
  });
  it("duplicates keep the lowest USABLE id; unusable or unlinked managed ones are replaced (R2 #4)", () => {
    expect(desiredPersonas({ tokens: [T("b", "a"), T("a1", "a")], live: live("a") }).remove).toEqual([{ id: "b", reason: "duplicate" }]);
    const r = desiredPersonas({ tokens: [T("a0", "a", { usable: false }), T("b", "a")], live: live("a") });
    expect(r).toEqual({ create: [], remove: [{ id: "a0", reason: "unusable" }] });
    const u = desiredPersonas({ tokens: [T("a0", "a", { actorLink: false })], live: live("a") });
    expect(u).toEqual({ create: ["a"], remove: [{ id: "a0", reason: "unlinked" }] });
  });
});

describe("managed personas that lost their flag or their session (code review R1)", () => {
  const T = (id, actorId, extra = {}) => ({ id, actorId, actorLink: true, managed: true, usable: true, marked: true, ...extra });
  it("a managed token with its persona flag cleared is removed, and doesn't count as the actor's persona", () => {
    expect(desiredPersonas({ tokens: [T("m", "a", { marked: false })], live: new Set(["a"]) }))
      .toEqual({ create: ["a"], remove: [{ id: "m", reason: "unmarked" }] });
    expect(desiredPersonas({ tokens: [T("m", "a", { marked: false })], live: new Set() }).remove).toEqual([{ id: "m", reason: "unmarked" }]);
  });
  it("a managed token made for an earlier session is replaced", () => {
    expect(desiredPersonas({ tokens: [T("m", "a", { stale: true })], live: new Set(["a"]) }))
      .toEqual({ create: ["a"], remove: [{ id: "m", reason: "stale" }] });
  });
  it("a hand-placed token with its flag cleared is not a persona and is never removed", () => {
    expect(desiredPersonas({ tokens: [T("h", "a", { managed: false, marked: false })], live: new Set(["a"]) }))
      .toEqual({ create: ["a"], remove: [] });
  });
});

describe("persona placement inside the entry area (R1 #8, R2 #5)", () => {
  // Even-odd point test over every ring, as a region with holes behaves.
  const evenOdd = (rings) => (x, y) => rings.reduce((inn, pts) => {
    let c = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return inn !== c;
  }, false);
  const rect = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h];
  it("a cell inside, on the boundary, and crossing it", () => {
    const rings = [rect(0, 0, 300, 300)];
    expect(rectInRegion({ x: 100, y: 100, w: 100, h: 100 }, rings, evenOdd(rings))).toBe(true);
    expect(rectInRegion({ x: 0, y: 0, w: 100, h: 100 }, rings, evenOdd(rings))).toBe(true);
    expect(rectInRegion({ x: 250, y: 0, w: 100, h: 100 }, rings, evenOdd(rings))).toBe(false);
    expect(rectInRegion({ x: 400, y: 0, w: 100, h: 100 }, rings, evenOdd(rings))).toBe(false);
  });
  it("a small hole that misses the cell's centre and corners still disqualifies it", () => {
    const rings = [rect(0, 0, 300, 300), rect(120, 120, 10, 10)];
    expect(rectInRegion({ x: 100, y: 100, w: 100, h: 100 }, rings, evenOdd(rings))).toBe(false);
    expect(rectInRegion({ x: 0, y: 0, w: 100, h: 100 }, rings, evenOdd(rings))).toBe(true);
  });
  it("an L-shaped region: a 2×2 token goes only where 2×2 fits; occupied cells are skipped, then stacked", () => {
    const L = [[0, 0, 400, 0, 400, 100, 200, 100, 200, 300, 0, 300]];
    const args = { bounds: { x: 0, y: 0, width: 400, height: 300 }, grid: 100, rings: L, inside: evenOdd(L) };
    expect(placePersona({ ...args, w: 100, h: 100 })).toEqual({ x: 0, y: 0 });
    expect(placePersona({ ...args, w: 200, h: 200 })).toEqual({ x: 0, y: 0 });
    expect(placePersona({ ...args, w: 100, h: 100, occupied: [{ x: 0, y: 0, w: 100, h: 100 }] })).toEqual({ x: 100, y: 0 });
    expect(placePersona({ ...args, w: 200, h: 200, occupied: [{ x: 0, y: 0, w: 100, h: 100 }] })).toEqual({ x: 0, y: 100 });
    expect(placePersona({ ...args, w: 200, h: 200, occupied: [{ x: 0, y: 0, w: 200, h: 300 }] })).toEqual({ x: 0, y: 0 }, "full: stacked");
    expect(placePersona({ ...args, w: 300, h: 300 })).toBeNull();
  });
});
