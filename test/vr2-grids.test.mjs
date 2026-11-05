// VR2.0 part 7a: grid topology (docs/PLAN-vr2-part7-grids.md, "7a in detail").
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RTG_TABLE, easyGridRatings, variableShift, shifted, reachable, scopeOf, seedTally, carryAmount, wiredPlace,
  wiringFits, disconnectTarget, jackpointKind, halveUp, forgetSeconds } from "../module/rules/vr2-grids.mjs";

describe("RTG tables (p.26–27)", () => {
  it("the code copy matches tools/data/vr2-rtg-ratings.tsv row for row", () => {
    const rows = readFileSync(new URL("../tools/data/vr2-rtg-ratings.tsv", import.meta.url), "utf8")
      .split("\n").filter(l => l && !l.startsWith("#")).slice(1).map(l => l.split("\t"));
    expect(RTG_TABLE).toHaveLength(rows.length);
    rows.forEach((r, i) => {
      const t = RTG_TABLE[i];
      expect([t.group, t.name, t.kind, t.parent, t.code, t.sv, ...Object.values(t.subsystems), t.pltgEntry])
        .toEqual([r[0], r[1], r[2], r[3], r[4], ...r.slice(5, 11).map(Number), r[11] === "yes"]);
    });
  });
  it("spot checks: Aztlan Orange-3 8/8/6/7/7, Tír na nÓg Red-5 9/9/7/8/8, Saeder-Krupp a PLTG entry", () => {
    const by = (n) => RTG_TABLE.find(t => t.name === n);
    expect(by("Aztlan")).toMatchObject({ code: "orange", sv: 3, subsystems: { access: 8, control: 8, index: 6, files: 7, slave: 7 } });
    expect(by("Tír na nÓg")).toMatchObject({ code: "red", sv: 5, subsystems: { access: 9, control: 9, index: 7, files: 8, slave: 8 } });
    expect(by("Saeder-Krupp")).toMatchObject({ kind: "ltg", parent: "Rhine-Ruhr", pltgEntry: true });
  });
  it("an unlisted grid is Easy less 2: Security Value 2–4, subsystems 6–8 (p.26, p.31)", () => {
    expect(easyGridRatings([1, 1, 1, 1, 1, 1])).toEqual({ sv: 2, subsystems: { access: 6, control: 6, index: 6, files: 6, slave: 6 } });
    expect(easyGridRatings([3, 3, 2, 1, 3, 2])).toEqual({ sv: 4, subsystems: { access: 8, control: 7, index: 6, files: 8, slave: 7 } });
  });
  it("variable LTG ratings (p.28): 1–2 −1, 3–4 0, 5–6 +1; never below 1", () => {
    expect([1, 2, 3, 4, 5, 6].map(variableShift)).toEqual([-1, -1, 0, 0, 1, 1]);
    expect(shifted(6, -1)).toBe(5);
    expect(shifted(1, -1)).toBe(1);
  });
});

describe("jackpoints (p.28–29)", () => {
  it("the table; an unknown kind is illegal access", () => {
    expect(jackpointKind("legal")).toMatchObject({ trace: -2, access: -2 });
    expect(jackpointKind("workstation")).toMatchObject({ trace: -4, access: -4, device: true });
    expect(jackpointKind("remote")).toMatchObject({ trace: 4, access: 4 });
    expect(jackpointKind("console")).toMatchObject({ trace: -6, halve: true });
    expect(jackpointKind("satellite").access).toBe(2);
    expect(jackpointKind(undefined)).toMatchObject({ trace: 0, access: 0 });
  });
  it("console halving rounds up (user ruling)", () => {
    expect([7, 8, 5, 1].map(halveUp)).toEqual([4, 4, 3, 1]);
  });
  it("the failed-logon memory is 1D3 × 5 minutes", () => {
    expect([1, 2, 3].map(forgetSeconds)).toEqual([300, 600, 900]);
  });
});

// A small Matrix: Seattle RTG ← LTGs 2206 and 4206; a PLTG entered from 4206; open hosts on 2206;
// a tiered network (hub A ↔ B, C, D) on 4206; a host-host chain on 2206 (H1 ↔ H2 ↔ H3).
const P = (uuid, kind, extra = {}) => ({ uuid, name: uuid, kind, grid: null, links: [], entryPoints: [], unlisted: false, ...extra });
const topo = new Map([
  P("Actor.SEA", "rtg"), P("Actor.TIR", "rtg"),
  P("Actor.L2206", "ltg", { grid: "Actor.SEA" }), P("Actor.L4206", "ltg", { grid: "Actor.SEA" }), P("Actor.LX", "ltg"),
  P("Actor.SK", "pltg", { entryPoints: ["Actor.L4206"] }),
  P("Actor.Open1", "host", { grid: "Actor.L2206" }), P("Actor.Open2", "host", { grid: "Actor.L2206" }),
  P("Actor.Secret", "host", { grid: "Actor.L2206", unlisted: true }),
  P("Actor.A", "host", { grid: "Actor.L4206", links: ["Actor.B", "Actor.C"] }), P("Actor.B", "host"), P("Actor.C", "host"),
  P("Actor.D", "host", { links: ["Actor.A"] }),
  P("Actor.H1", "host", { grid: "Actor.L2206", links: ["Actor.H2"] }), P("Actor.H2", "host", { links: ["Actor.H3"] }), P("Actor.H3", "host"),
  P("Actor.SKH", "host", { grid: "Actor.SK" })
].map(p => [p.uuid, p]));
const R = (at, op, target, jack = { kind: "illegal", wired: null }, extra = {}) => reachable({ at, op, target, topo, jack, ...extra }).ok;

describe("reachable (p.14–15, p.29–30, p.116)", () => {
  it("trid jackpoint: only Logon to LTG, to its wired LTG (any LTG when unwired)", () => {
    expect(R(null, "logonLTG", "Actor.L2206")).toBe(true);
    expect(R(null, "logonLTG", "Actor.SK")).toBe(false);
    expect(R(null, "logonHost", "Actor.Open1")).toBe(false);
    expect(R(null, "logonRTG", "Actor.SEA")).toBe(false);
    const jack = { kind: "legal", wired: "Actor.L4206" };
    expect(R(null, "logonLTG", "Actor.L4206", jack)).toBe(true);
    expect(R(null, "logonLTG", "Actor.L2206", jack)).toBe(false);
    // Unwired (or wired to a deleted host): nothing (code R1 #4).
    expect(R(null, "logonHost", "Actor.B", { kind: "console", wired: null })).toBe(false);
    expect(R(null, "logonHost", "Actor.B", { kind: "console", wired: "Actor.Gone" })).toBe(false);
  });
  it("device jackpoint: only Logon to Host, onto its wired host", () => {
    const jack = { kind: "workstation", wired: "Actor.B" };
    expect(R(null, "logonHost", "Actor.B", jack)).toBe(true);
    expect(R(null, "logonHost", "Actor.A", jack)).toBe(false);
    expect(R(null, "logonLTG", "Actor.L2206", jack)).toBe(false);
  });
  it("legacy wiring: a trid jackpoint wired to a host reads as wired to its LTG (R1 #11)", () => {
    expect(wiredPlace({ kind: "illegal", wired: "Actor.Open1" }, topo)).toBe("Actor.L2206");
    expect(wiredPlace({ kind: "illegal", wired: "Actor.B" }, topo)).toBeNull();
    expect(wiredPlace({ kind: "console", wired: "Actor.L2206" }, topo)).toBeNull();
    expect(wiringFits({ kind: "illegal", wired: "Actor.Open1" }, topo)).toBe(false);
    expect(wiringFits({ kind: "illegal", wired: "Actor.L2206" }, topo)).toBe(true);
    expect(wiringFits({ kind: "remote", wired: "Actor.B" }, topo)).toBe(true);
    expect(wiringFits({ kind: "illegal", wired: null }, topo)).toBe(true);
  });
  it("on an LTG: its RTG, its hosts, a PLTG it is an entry point of; Redirect Datatrail only", () => {
    expect(R("Actor.L4206", "logonRTG", "Actor.SEA")).toBe(true);
    expect(R("Actor.L4206", "logonRTG", "Actor.TIR")).toBe(false);
    expect(R("Actor.L4206", "logonLTG", "Actor.L2206")).toBe(false);
    expect(R("Actor.L4206", "logonLTG", "Actor.SK")).toBe(true);
    expect(R("Actor.L2206", "logonLTG", "Actor.SK")).toBe(false);
    expect(R("Actor.L4206", "logonHost", "Actor.A")).toBe(true);
    expect(R("Actor.L4206", "logonHost", "Actor.B")).toBe(false);
    expect(R("Actor.L4206", "redirectDatatrail", "Actor.L4206")).toBe(true);
    expect(R("Actor.L4206", "locateAccessNode", "Actor.L4206")).toBe(false);
    expect(R("Actor.L4206", "analyzeHost", "Actor.L4206")).toBe(false);
  });
  it("on an RTG: its LTGs, any other RTG; Locate Access Node, Make Comcall, Redirect Datatrail; no hosts", () => {
    expect(R("Actor.SEA", "logonLTG", "Actor.L2206")).toBe(true);
    expect(R("Actor.SEA", "logonLTG", "Actor.LX")).toBe(false);
    expect(R("Actor.SEA", "logonRTG", "Actor.TIR")).toBe(true);
    expect(R("Actor.SEA", "logonRTG", "Actor.SEA")).toBe(false);
    expect(R("Actor.SEA", "logonHost", "Actor.Open1")).toBe(false);
    for (const op of ["locateAccessNode", "makeComcall", "redirectDatatrail"]) expect(R("Actor.SEA", op, "Actor.SEA")).toBe(true);
    expect(R("Actor.SEA", "locateAccessNode", "Actor.L2206")).toBe(false);
  });
  it("on a PLTG: its hosts, its entry points, any RTG, and every grid operation", () => {
    expect(R("Actor.SK", "logonHost", "Actor.SKH")).toBe(true);
    expect(R("Actor.SK", "logonLTG", "Actor.L4206")).toBe(true);
    expect(R("Actor.SK", "logonLTG", "Actor.L2206")).toBe(false);
    expect(R("Actor.SK", "logonRTG", "Actor.TIR")).toBe(true);
    expect(R("Actor.SK", "locateAccessNode", "Actor.SK")).toBe(true);
  });
  it("open access between hosts on one LTG; host operations only where you are", () => {
    expect(R("Actor.Open1", "logonHost", "Actor.Open2")).toBe(true);
    expect(R("Actor.Open1", "analyzeHost", "Actor.Open1")).toBe(true);
    expect(R("Actor.Open1", "analyzeHost", "Actor.Open2")).toBe(false);
    expect(R("Actor.Open1", "logonRTG", "Actor.SEA")).toBe(false);
  });
  it("tiered: B → C only back through the hub A (p.14)", () => {
    expect(R("Actor.B", "logonHost", "Actor.C")).toBe(false);
    expect(R("Actor.B", "logonHost", "Actor.A")).toBe(true);
    expect(R("Actor.A", "logonHost", "Actor.C")).toBe(true);
    expect(R("Actor.A", "logonHost", "Actor.D")).toBe(true);   // a link stored on the far end counts
  });
  it("host-host chain: LTG → H1 → H2 → H3, never skipping", () => {
    expect(R("Actor.L2206", "logonHost", "Actor.H1")).toBe(true);
    expect(R("Actor.L2206", "logonHost", "Actor.H2")).toBe(false);
    expect(R("Actor.H1", "logonHost", "Actor.H2")).toBe(true);
    expect(R("Actor.H1", "logonHost", "Actor.H3")).toBe(false);
    expect(R("Actor.H2", "logonHost", "Actor.H3")).toBe(true);
  });
  it("an unlisted address needs knowing (or the GM); its wired jackpoint doesn't", () => {
    expect(R("Actor.L2206", "logonHost", "Actor.Secret")).toBe(false);
    expect(R("Actor.L2206", "logonHost", "Actor.Secret", undefined, { known: new Set(["Actor.Secret"]) })).toBe(true);
    expect(R("Actor.L2206", "logonHost", "Actor.Secret", undefined, { gm: true })).toBe(true);
    expect(R(null, "logonHost", "Actor.Secret", { kind: "remote", wired: "Actor.Secret" })).toBe(true);
  });
  it("Graceful Logoff: from where you are; none at the jackpoint", () => {
    expect(R("Actor.Open1", "gracefulLogoff", "Actor.Open1")).toBe(true);
    expect(R(null, "gracefulLogoff", "Actor.Open1")).toBe(false);
  });
  it("Disconnect to grid: from a host with a grid only", () => {
    expect(disconnectTarget("Actor.Open1", topo)).toBe("Actor.L2206");
    expect(disconnectTarget("Actor.B", topo)).toBeNull();
    expect(disconnectTarget("Actor.L2206", topo)).toBeNull();
  });
});

describe("tally scopes and seeds (p.29, p.116)", () => {
  it("an RTG and its LTGs share one scope fired by the RTG's sheaf; PLTGs and hosts have their own", () => {
    expect(scopeOf("Actor.L2206", topo)).toEqual({ key: "rtg_SEA", owner: "Actor.SEA" });
    expect(scopeOf("Actor.SEA", topo)).toEqual({ key: "rtg_SEA", owner: "Actor.SEA" });
    expect(scopeOf("Actor.LX", topo)).toEqual({ key: "ltg_LX", owner: "Actor.LX" });
    expect(scopeOf("Actor.SK", topo).key).toBe("pltg_SK");
    expect(scopeOf("Actor.Open1", topo).key).toBe("host_Open1");
  });
  it("the p.29 example: 2 on 2206, +1 on the RTG, +2 on 4206 = 5; not to another RTG", () => {
    let tally = seedTally({ scope: "rtg_SEA", conn: 1 }) + 2;                                   // 2206
    tally = seedTally({ scope: "rtg_SEA", outgoing: { scope: "rtg_SEA", tally }, conn: 1 }) + 1; // the RTG
    tally = seedTally({ scope: "rtg_SEA", outgoing: { scope: "rtg_SEA", tally }, conn: 1 }) + 2; // 4206
    expect(tally).toBe(5);
    expect(seedTally({ scope: "rtg_TIR", outgoing: { scope: "rtg_SEA", tally }, ledger: { rtg_SEA: { conn: 1, tally } }, conn: 1 })).toBe(0);
    // Into the PLTG: it starts at 0, and the finished logon carries the 5 (plus what the attempt earned).
    expect(carryAmount(5, seedTally({ scope: "pltg_SK", conn: 1 }))).toBe(5);
    expect(carryAmount(5, 7)).toBe(0);   // a re-entry never lowers what the PLTG already holds
  });
  it("an expired failed-access memory doesn't ride along a same-scope switch (code R1 #2)", () => {
    expect(seedTally({ scope: "rtg_SEA", outgoing: { scope: "rtg_SEA", tally: 4, forgetAt: 100 }, conn: 1, now: 100 })).toBe(0);
    expect(seedTally({ scope: "rtg_SEA", outgoing: { scope: "rtg_SEA", tally: 4, forgetAt: 100 }, conn: 1, now: 99 })).toBe(4);
  });
  it("the outgoing same-scope session beats a stale ledger entry (R1 #6)", () => {
    expect(seedTally({ scope: "rtg_SEA", outgoing: { scope: "rtg_SEA", tally: 5 }, ledger: { rtg_SEA: { conn: 1, tally: 2 } }, conn: 1 })).toBe(5);
    expect(seedTally({ scope: "rtg_SEA", outgoing: { scope: "host_X", tally: 9 }, ledger: { rtg_SEA: { conn: 1, tally: 2 } }, conn: 1 })).toBe(2);
  });
  it("a failed logon is remembered until forgetAt, across a reconnect only from the same jackpoint (R1 #8)", () => {
    const ledger = { rtg_SEA: { conn: 1, jackpoint: "JP1", tally: 3, forgetAt: 1000 } };
    expect(seedTally({ scope: "rtg_SEA", ledger, conn: 1, now: 999 })).toBe(3);
    expect(seedTally({ scope: "rtg_SEA", ledger, conn: 1, now: 1000 })).toBe(0);
    expect(seedTally({ scope: "rtg_SEA", ledger, conn: 2, jackpoint: "JP1", now: 500 })).toBe(3);
    expect(seedTally({ scope: "rtg_SEA", ledger, conn: 2, jackpoint: "JP2", now: 500 })).toBe(0);
    expect(seedTally({ scope: "rtg_SEA", ledger, conn: 2, jackpoint: null, now: 500 })).toBe(0);
    // A tally that wasn't a failed-logon memory never crosses connections.
    expect(seedTally({ scope: "rtg_SEA", ledger: { rtg_SEA: { conn: 1, jackpoint: "JP1", tally: 3 } }, conn: 2, jackpoint: "JP1" })).toBe(0);
  });
});

// ── Part 7b ─────────────────────────────────────────────────────────────────
import { traceLostAt, traceClass, governsJackpoint, isNetworkMove, redirectTN } from "../module/rules/vr2-grids.mjs";
import { traceState } from "../module/rules/vr2ic-rules.mjs";

describe("7b: a trace's class and where it stops (p.36, p.47)", () => {
  const gridTrace = { seq: 10, ...traceClass("Actor.L2206", topo) };
  const hostTrace = { seq: 10, ...traceClass("Actor.A", topo) };
  const mv = (seq, place, extra = {}) => ({ seq, place, ...traceClass(place, topo), network: false, from: null, ...extra });
  it("classes: an LTG or RTG trace is a grid trace in its RTG scope; a PLTG or host trace isn't", () => {
    expect(gridTrace).toMatchObject({ grid: true, scope: "rtg_SEA" });
    expect(traceClass("Actor.SK", topo).grid).toBe(false);
    expect(traceClass("Actor.A", topo)).toMatchObject({ grid: false, scope: "host_A" });
  });
  it("a grid trace keeps hunting across its RTG's grids, and loses interest on a host, a PLTG or another RTG", () => {
    expect(traceLostAt(gridTrace, [mv(11, "Actor.SEA"), mv(12, "Actor.L4206")])).toBeNull();
    for (const p of ["Actor.Open1", "Actor.SK", "Actor.TIR"]) expect(traceLostAt(gridTrace, [mv(11, "Actor.SEA"), mv(12, p)])?.seq).toBe(12);
  });
  it("a departure then a return still ends it at the departure; a move before it started doesn't", () => {
    expect(traceLostAt(gridTrace, [mv(12, "Actor.Open1"), mv(13, "Actor.L2206")])?.seq).toBe(12);
    expect(traceLostAt(gridTrace, [mv(5, "Actor.Open1"), mv(11, "Actor.L2206")])).toBeNull();
  });
  it("a host trace ends only when a network move leaves its host; a Track and a complete trace never", () => {
    expect(traceLostAt(hostTrace, [mv(11, "Actor.Open1")])).toBeNull();
    expect(traceLostAt(hostTrace, [mv(11, "Actor.B", { network: true, from: "Actor.A" })])?.seq).toBe(11);
    expect(traceLostAt(hostTrace, [mv(11, "Actor.A", { network: true, from: "Actor.B" })])).toBeNull();
    expect(traceLostAt({ ...gridTrace, track: true }, [mv(11, "Actor.Open1")])).toBeNull();
  });
  it("the fold: a lost trace is dead before the next tick, frees its frozen point, and a complete one stays complete", () => {
    const tr = { type: "trace", conn: 1, icKey: "Actor.T:0", turns: 2, seq: 10, ...traceClass("Actor.L2206", topo) };
    const tick = (seq, b) => ({ type: "tick", conn: 1, icKey: "Actor.T:0", boundary: b, seq });
    const move = (seq, place) => ({ type: "move", conn: 1, seq, place, ...traceClass(place, topo), network: false });
    const lost = traceState(tr, [tick(11, "r2"), move(12, "Actor.Open1"), tick(13, "r3"), tick(14, "r4")]);
    expect(lost).toMatchObject({ complete: false, dead: true, lost: "grid", turnsLeft: 1 });
    const done = traceState(tr, [tick(11, "r2"), tick(12, "r3"), move(13, "Actor.Open1")]);
    expect(done).toMatchObject({ complete: true, dead: false, lost: null });
  });
});

describe("7b: dump on locate, network moves, redirects (p.36, p.47, p.117)", () => {
  const t = (place) => ({ ...traceClass(place, topo) });
  it("only a trace from the RTG governing the jackpoint, or one of its LTGs, can dump the decker", () => {
    const jack = { kind: "illegal", wired: "Actor.L4206" };
    expect(governsJackpoint(t("Actor.L2206"), jack, topo)).toBe(true);
    expect(governsJackpoint(t("Actor.SEA"), jack, topo)).toBe(true);
    expect(governsJackpoint(t("Actor.TIR"), jack, topo)).toBe(false);
    expect(governsJackpoint(t("Actor.A"), jack, topo)).toBe(false);
    expect(governsJackpoint(t("Actor.L2206"), { kind: "remote", wired: "Actor.B" }, topo)).toBe(false);
    expect(governsJackpoint(t("Actor.L2206"), { kind: "illegal", wired: null }, topo)).toBe(false);
    expect(governsJackpoint(t("Actor.LX"), { kind: "illegal", wired: "Actor.LX" }, topo)).toBe(false);
  });
  it("network moves are logons along host links, not open access", () => {
    expect(isNetworkMove("Actor.A", "Actor.B", topo)).toBe(true);
    expect(isNetworkMove("Actor.B", "Actor.A", topo)).toBe(true);
    expect(isNetworkMove("Actor.Open1", "Actor.Open2", topo)).toBe(false);
    expect(isNetworkMove("Actor.L4206", "Actor.A", topo)).toBe(false);
  });
  it("hub → second tier needs the connections found; never the way back, never open access", () => {
    const m = (mapped) => reachable({ at: "Actor.A", op: "logonHost", target: "Actor.B", topo, jack: { kind: "illegal" }, mapped }).ok;
    expect(m(new Set())).toBe(false);
    expect(m(new Set(["Actor.A"]))).toBe(true);
    expect(m(null)).toBe(true);
    expect(reachable({ at: "Actor.B", op: "logonHost", target: "Actor.A", topo, jack: {}, mapped: new Set() }).ok).toBe(true);
    expect(reachable({ at: "Actor.Open1", op: "logonHost", target: "Actor.Open2", topo, jack: {}, mapped: new Set() }).ok).toBe(true);
  });
  it("Redirect Datatrail's opposing TN: DF less the jackpoint's trace modifier (literal), min 2", () => {
    expect(redirectTN(5, "legal")).toBe(7);
    expect(redirectTN(5, "illegal")).toBe(5);
    expect(redirectTN(5, "remote")).toBe(2);
    expect(redirectTN(3, "remote")).toBe(2);
  });
});
