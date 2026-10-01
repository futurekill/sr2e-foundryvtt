// Astral movement — the pure decisions (docs/PLAN-astral-barriers.md; SR2 p.145–147,
// Corporate Security Handbook p.37–39, p.103).
import { describe, it, expect } from "vitest";
import { isOnAstralPlane, astralBarrierKind, astralEdgeDecision, sceneAstralWalls,
  isProjectingBody, desiredForms, bodyMovedWhileOut,
  fabSearchTN, fabSearchResult, fabRevealValid, astralCaps, chargeAstralMove, astralMoveDecision } from "../module/rules/astral-rules.mjs";

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

describe("FAB-UV search (CSH p.103)", () => {
  it("TN 6, +1 per 50 m² or part, −1 per two searchers, minimum 2", () => {
    expect(fabSearchTN(0, 1)).toBe(6);
    expect(fabSearchTN(50, 1)).toBe(7);
    expect(fabSearchTN(51, 1)).toBe(8);
    expect(fabSearchTN(100, 4)).toBe(6);
    expect(fabSearchTN(0, 20)).toBe(2);
  });
  it("attack penalty for net successes 0 through 6", () => {
    const p = n => fabSearchResult(n).penalty;
    expect([0, 1, 2, 3, 4, 5, 6].map(p)).toEqual([null, 4, 3, 2, 1, 0, 0]);
    expect(fabSearchResult(0).spotted).toBe(false);
  });
  it("an aware intruder's Stealth successes cancel searcher successes", () => {
    expect(fabSearchResult(3, 2)).toEqual({ net: 1, spotted: true, penalty: 4 });
    expect(fabSearchResult(2, 3)).toEqual({ net: 0, spotted: false, penalty: null });
  });
});

describe("FAB-UV reveal validity", () => {
  const behavior = { strain: "fabuv", uvLit: true, uvEpoch: 2, disabled: false };
  const record = { extra: 1, epoch: 2, gen: 0 };
  it("live only with UV on, the same epoch and exit generation, inside", () => {
    expect(fabRevealValid({ record, behavior, exitGen: 0, inside: true })).toBe(true);
    expect(fabRevealValid({ record, behavior: { ...behavior, uvLit: false }, inside: true })).toBe(false);
    expect(fabRevealValid({ record, behavior: { ...behavior, disabled: true }, inside: true })).toBe(false);
    expect(fabRevealValid({ record, behavior: { ...behavior, strain: "fab1" }, inside: true })).toBe(false);
    expect(fabRevealValid({ record, behavior: { ...behavior, uvEpoch: 3 }, inside: true })).toBe(false, "UV cycled");
    expect(fabRevealValid({ record, behavior, exitGen: 1, inside: true })).toBe(false, "left and came back");
    expect(fabRevealValid({ record, behavior, inside: false })).toBe(false);
    expect(fabRevealValid({ record, behavior: null, inside: true })).toBe(false);
  });
});

describe("astral speed (SR2 p.146) and FAB (CSH p.103)", () => {
  const caps = astralCaps({ astralQuickness: 6, magic: 5 });
  it("normal = Astral Quickness × 4; fast = Magic × 1000", () => {
    expect(caps).toEqual({ normal: 24, fast: 5000 });
  });
  it("fast 100 m outside, then 1 m into FAB, is legal; normal metres inside FAB over 24 are not", () => {
    let l = astralMoveDecision({}, chargeAstralMove({ metres: 100, fast: true }), caps);
    expect(l.allowed).toBe(true);
    l = astralMoveDecision(l, chargeAstralMove({ metres: 1, fabMetres: 1, fast: true }), caps);
    expect(l).toMatchObject({ allowed: true, normal: 1, fast: 100 });
    expect(astralMoveDecision({}, chargeAstralMove({ metres: 30, fabMetres: 30, fast: true }), caps).over).toBe("normal");
  });
  it("slowing down never re-charges earlier fast travel", () => {
    const l = astralMoveDecision({ normal: 0, fast: 100 }, chargeAstralMove({ metres: 1, fast: false }), caps);
    expect(l).toMatchObject({ allowed: true, normal: 1, fast: 100 });
  });
  it("a split route costs the same as the unsplit one", () => {
    const one = astralMoveDecision({}, chargeAstralMove({ metres: 20, fabMetres: 8, fast: true }), caps);
    let two = astralMoveDecision({}, chargeAstralMove({ metres: 12, fabMetres: 0, fast: true }), caps);
    two = astralMoveDecision(two, chargeAstralMove({ metres: 8, fabMetres: 8, fast: true }), caps);
    expect([two.normal, two.fast]).toEqual([one.normal, one.fast]);
  });
});
