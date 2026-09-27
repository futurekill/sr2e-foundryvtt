// Matrix jackpoints — the pure decisions (docs/PLAN-matrix-jackpoints.md).
import { describe, it, expect } from "vitest";
import { winner, gmCleanup, tabDecision, bodyMarked, personaLit } from "../module/rules/jackpoint-rules.mjs";

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
