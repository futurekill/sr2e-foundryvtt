// Astral movement — the pure decisions (docs/PLAN-astral-barriers.md; SR2 p.145–147,
// Corporate Security Handbook p.37–39, p.103).
import { describe, it, expect } from "vitest";
import { isOnAstralPlane, astralBarrierKind, astralEdgeDecision, sceneAstralWalls,
  isProjectingBody, desiredForms, bodyMovedWhileOut } from "../module/rules/astral-rules.mjs";

describe("who is on the astral plane", () => {
  it("an astral form or an astral-only token is; a body is not", () => {
    expect(isOnAstralPlane({ astralForm: "Scene.s.Token.body" })).toBe(true);
    expect(isOnAstralPlane({ astralOnly: true })).toBe(true);
    expect(isOnAstralPlane({ astralOnly: false })).toBe(false);
    expect(isOnAstralPlane({})).toBe(false);
    expect(isOnAstralPlane(undefined)).toBe(false);
  });
});

describe("wall barrier kinds", () => {
  it("reads the three kinds and ignores anything else", () => {
    for (const k of ["living", "fab", "ward"]) expect(astralBarrierKind({ astralBarrier: k })).toBe(k);
    expect(astralBarrierKind({ astralBarrier: "" })).toBeNull();
    expect(astralBarrierKind({ astralBarrier: "steel" })).toBeNull();
    expect(astralBarrierKind(undefined)).toBeNull();
  });
});

describe("the move sweep's edge decision", () => {
  it("physical movers always get Foundry's normal rule", () => {
    for (const kind of [null, "living", "fab", "ward"])
      expect(astralEdgeDecision({ astral: false, wallEdge: true, kind })).toBe("super");
  });
  it("astral movers pass ordinary walls (closed doors too), not living or FAB walls, and wards always block", () => {
    expect(astralEdgeDecision({ astral: true, wallEdge: true, kind: null })).toBe("exclude");
    expect(astralEdgeDecision({ astral: true, wallEdge: true, kind: "living" })).toBe("super");
    expect(astralEdgeDecision({ astral: true, wallEdge: true, kind: "fab" })).toBe("super");
    expect(astralEdgeDecision({ astral: true, wallEdge: true, kind: "ward" })).toBe("include");
  });
  it("scene boundaries are never bypassed", () => {
    expect(astralEdgeDecision({ astral: true, wallEdge: false, kind: null })).toBe("super");
  });
});

describe("per-scene switch", () => {
  it("the scene flag wins; unset falls back to the world default", () => {
    expect(sceneAstralWalls(false, true)).toBe(false);
    expect(sceneAstralWalls(true, false)).toBe(true);
    expect(sceneAstralWalls(undefined, true)).toBe(true);
    expect(sceneAstralWalls(null, false)).toBe(false);
  });
});

describe("projection: which tokens are bodies", () => {
  const T = (id, extra = {}) => ({ id, uuid: `Scene.s.Token.${id}`, actorLink: true, projecting: true, flags: {}, ...extra });
  it("a linked, projecting token is a body; forms, astral-only, personas and unlinked tokens are not", () => {
    expect(isProjectingBody(T("a"))).toBe(true);
    expect(isProjectingBody(T("a", { projecting: false }))).toBe(false);
    expect(isProjectingBody(T("a", { actorLink: false }))).toBe(false);
    expect(isProjectingBody(T("a", { flags: { astralForm: "x" } }))).toBe(false);
    expect(isProjectingBody(T("a", { flags: { astralOnly: true } }))).toBe(false);
    expect(isProjectingBody(T("a", { flags: { persona: true } }))).toBe(false);
  });
  it("a body with no form gets one; a form whose body stopped projecting is removed", () => {
    expect(desiredForms([T("b")])).toEqual({ create: ["Scene.s.Token.b"], remove: [] });
    const r = desiredForms([T("b", { projecting: false }), T("f", { flags: { astralForm: "Scene.s.Token.b", astralOnly: true } })]);
    expect(r).toEqual({ create: [], remove: [{ id: "f", bodyUuid: "Scene.s.Token.b", reason: "returned" }] });
  });
  it("a form whose body is gone is removed", () => {
    expect(desiredForms([T("f", { flags: { astralForm: "Scene.s.Token.gone" } })]).remove.map(x => x.id)).toEqual(["f"]);
  });
  it("duplicates: the lowest id survives, whichever order they arrive in", () => {
    const toks = [T("b"), T("z9", { flags: { astralForm: "Scene.s.Token.b" } }), T("a1", { flags: { astralForm: "Scene.s.Token.b" } })];
    expect(desiredForms(toks)).toEqual({ create: [], remove: [{ id: "z9", bodyUuid: "Scene.s.Token.b", reason: "duplicate" }] });
    expect(desiredForms([...toks].reverse()).remove.map(x => x.id)).toEqual(["z9"]);
  });
  it("a jackpoint persona of a projecting actor gets no form", () => {
    expect(desiredForms([T("p", { flags: { persona: true } })])).toEqual({ create: [], remove: [] });
  });
  it("the moved-body check", () => {
    expect(bodyMovedWhileOut({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(false);
    expect(bodyMovedWhileOut({ x: 1, y: 2 }, { x: 5, y: 2 })).toBe(true);
    expect(bodyMovedWhileOut(null, { x: 5, y: 2 })).toBe(false);
  });
});
