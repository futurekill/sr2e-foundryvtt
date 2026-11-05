/**
 * VR2.0 part 7a: grid topology, the pure decisions (docs/PLAN-vr2-part7-grids.md, "7a in detail").
 * No Foundry here. Places are Host actors with a `kind`; the caller hands a plain snapshot of them.
 */

/** Logon operations: the only way from one place to another. */
export const LOGON_OPS = new Set(["logonHost", "logonLTG", "logonRTG"]);
/** The other operations a grid runs (p.29–30); a PLTG runs both lists. Retrain/Tap Comcall aren't in the system. */
const GRID_OPS = {
  ltg: new Set(["redirectDatatrail"]),
  rtg: new Set(["locateAccessNode", "makeComcall", "redirectDatatrail"])
};
GRID_OPS.pltg = new Set([...GRID_OPS.ltg, ...GRID_OPS.rtg]);
export const GRID_KINDS = new Set(["ltg", "rtg", "pltg"]);

/** Jackpoints (p.28–29): Trace Factor and Access modifiers. Satellite's trace is p.30 (part 7c). */
export const JACKPOINT_KINDS = {
  legal:       { label: "Legal access",     trace: -2, access: -2 },
  illegal:     { label: "Illegal access",   trace: 0,  access: 0 },
  satellite:   { label: "Satellite uplink", trace: 0,  access: 2 },
  workstation: { label: "Workstation",      trace: -4, access: -4, device: true },
  remote:      { label: "Remote device",    trace: 4,  access: 4,  device: true },
  console:     { label: "Console",          trace: -6, access: 0,  device: true, halve: true }
};
export const jackpointKind = (k) => JACKPOINT_KINDS[k] ?? JACKPOINT_KINDS.illegal;
/** Console access halves Access Rating and Security Value in Access Tests, rounded up (user ruling 2026-11-04). */
export const halveUp = (n) => Math.ceil((Number(n) || 0) / 2);

/** North American (p.26) and Overseas (p.27) RTG System Ratings; tools/data/vr2-rtg-ratings.tsv is the source. */
const ROWS = [
  ["North America", "Aztlan", "rtg", "", "orange", 3, 8, 8, 6, 7, 7, false],
  ["California", "Free State", "rtg", "", "green", 4, 6, 8, 6, 6, 7, false],
  ["Caribbean League", "Bermuda", "rtg", "", "green", 2, 6, 6, 6, 6, 6, false],
  ["Caribbean League", "Cuba", "rtg", "", "orange", 3, 8, 8, 7, 8, 7, false],
  ["Caribbean League", "Grenada", "rtg", "", "orange", 4, 8, 8, 8, 8, 8, false],
  ["Caribbean League", "Jamaica", "rtg", "", "green", 3, 6, 7, 6, 6, 6, false],
  ["Caribbean League", "South Florida", "rtg", "", "green", 2, 6, 7, 6, 6, 6, false],
  ["Caribbean League", "Virgin Islands", "rtg", "", "green", 2, 6, 7, 6, 6, 6, false],
  ["North America", "CAS", "rtg", "", "green", 3, 6, 8, 7, 8, 8, false],
  ["NAN", "Algonkian-Manitou", "rtg", "", "green", 4, 7, 8, 7, 6, 6, false],
  ["NAN", "Athabascan", "rtg", "", "green", 3, 6, 8, 6, 6, 6, false],
  ["NAN", "Pueblo", "rtg", "", "orange", 4, 8, 8, 8, 8, 8, false],
  ["NAN", "Salish-Sidhe", "rtg", "", "green", 3, 6, 8, 7, 6, 6, false],
  ["NAN", "Sioux", "rtg", "", "orange", 3, 7, 8, 8, 7, 7, false],
  ["NAN", "Trans-Polar Aleut", "rtg", "", "green", 2, 6, 6, 6, 6, 6, false],
  ["NAN", "Ute", "rtg", "", "orange", 3, 7, 8, 7, 7, 7, false],
  ["North America", "Québec", "rtg", "", "green", 2, 6, 8, 8, 7, 7, false],
  ["North America", "Tir Tairngire", "rtg", "", "orange", 5, 7, 8, 8, 7, 7, false],
  ["North America", "Tsimshian", "rtg", "", "orange", 5, 8, 8, 8, 8, 8, false],
  ["North America", "UCAS", "rtg", "", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "Greater Frankfurt", "rtg", "", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "AG Chemie", "ltg", "Greater Frankfurt", "red", 5, 10, 10, 9, 9, 9, true],
  ["Germany", "Frankfurt", "ltg", "Greater Frankfurt", "orange", 3, 6, 8, 6, 7, 7, false],
  ["Germany", "Frankfurt Bank Assn.", "ltg", "Greater Frankfurt", "red", 5, 10, 10, 8, 9, 9, true],
  ["Germany", "Mainz/Wiesbaden", "ltg", "Greater Frankfurt", "green", 4, 6, 8, 6, 7, 7, false],
  ["Germany", "Mannheim/Ludwigshafen", "ltg", "Greater Frankfurt", "green", 4, 6, 8, 6, 7, 7, false],
  ["Germany", "Northern Germany", "rtg", "", "green", 3, 6, 8, 6, 7, 7, false],
  ["Germany", "Arkoblock 1-4", "ltg", "Northern Germany", "red", 4, 8, 10, 8, 8, 8, true],
  ["Germany", "Berlin", "ltg", "Northern Germany", "orange", 3, 6, 8, 7, 6, 6, false],
  ["Germany", "Bremen", "ltg", "Northern Germany", "green", 5, 6, 8, 6, 7, 7, false],
  ["Germany", "Hamburg", "ltg", "Northern Germany", "green", 4, 6, 8, 6, 7, 7, false],
  ["Germany", "Hannover", "ltg", "Northern Germany", "orange", 5, 6, 8, 7, 8, 8, false],
  ["Germany", "Rügen", "ltg", "Northern Germany", "orange", 5, 8, 10, 9, 9, 9, false],
  ["Germany", "Rhine-Ruhr", "rtg", "", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "Cologne", "ltg", "Rhine-Ruhr", "green", 3, 6, 8, 6, 6, 6, false],
  ["Germany", "Dortmund", "ltg", "Rhine-Ruhr", "green", 2, 6, 8, 6, 6, 6, false],
  ["Germany", "Düsseldorf", "ltg", "Rhine-Ruhr", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "Essen", "ltg", "Rhine-Ruhr", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "Ruhrmetall", "ltg", "Rhine-Ruhr", "orange", 5, 8, 9, 8, 9, 10, true],
  ["Germany", "Ruhr Uni.", "ltg", "Rhine-Ruhr", "orange", 4, 6, 8, 6, 7, 7, false],
  ["Germany", "Saeder-Krupp", "ltg", "Rhine-Ruhr", "red", 5, 8, 10, 9, 10, 10, true],
  ["Germany", "Southern Germany", "rtg", "", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "Heidelberg", "ltg", "Southern Germany", "green", 3, 6, 8, 6, 6, 6, false],
  ["Germany", "Munich", "ltg", "Southern Germany", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "Nuremberg", "ltg", "Southern Germany", "green", 3, 6, 8, 6, 6, 6, false],
  ["Germany", "Stuttgart", "ltg", "Southern Germany", "green", 4, 6, 8, 6, 6, 6, false],
  ["Germany", "SOX", "rtg", "", "red", 4, 9, 10, 8, 8, 8, true],
  ["Germany", "SOX-Öffnet", "ltg", "SOX", "green", 3, 6, 8, 6, 6, 6, false],
  ["Overseas", "Great Britain", "rtg", "", "orange", 5, 7, 8, 6, 7, 7, false],
  ["Overseas", "Tír na nÓg", "rtg", "", "red", 5, 9, 9, 7, 8, 8, false],
];
export const RTG_TABLE = ROWS.map(([group, name, kind, parent, code, sv, access, control, index, files, slave, pltgEntry]) =>
  ({ group, name, kind, parent, code, sv, subsystems: { access, control, index, files, slave }, pltgEntry }));

/**
 * A public grid not on the list (p.26): Intrusion Difficulty Easy (p.31: Security Value 1D3+3, subsystems 1D3+7)
 * less 2 from every rating. `d3s` = six 1D3 results: the Security Value's, then Access…Slave.
 */
export function easyGridRatings(d3s) {
  const [sv, ...subs] = d3s;
  const keys = ["access", "control", "index", "files", "slave"];
  return { sv: sv + 3 - 2, subsystems: Object.fromEntries(keys.map((k, i) => [k, subs[i] + 7 - 2])) };
}

/** Optional Variable LTG Ratings (p.28): 1D6 → 1–2: −1, 3–4: 0, 5–6: +1 to every System Rating. */
export const variableShift = (d6) => (d6 <= 2 ? -1 : d6 <= 4 ? 0 : 1);
/** A shifted rating never drops below 1. */
export const shifted = (rating, shift) => Math.max(1, (Number(rating) || 0) + (Number(shift) || 0));

/** Failed Logon to LTG (p.116): the public LTG remembers the attempt for 1D3 × 5 minutes, in seconds. */
export const forgetSeconds = (d3) => d3 * 5 * 60;

const idOf = (uuid) => String(uuid ?? "").split(".").pop();
const linked = (a, b) => (a.links ?? []).includes(b.uuid) || (b.links ?? []).includes(a.uuid);

/**
 * The tally scope of a place (p.29): an RTG and every LTG under it share one; a PLTG and a host have their own.
 * Keys use actor ids (a UUID's dots would split a flag path).
 * @returns {{key: string, owner: string}|null} owner = the place whose sheaf the tally fires
 */
export function scopeOf(uuid, topo) {
  const p = topo.get(uuid);
  if (!p) return null;
  if (p.kind === "ltg") {
    const r = topo.get(p.grid);
    return r?.kind === "rtg" ? { key: `rtg_${idOf(r.uuid)}`, owner: r.uuid } : { key: `ltg_${idOf(p.uuid)}`, owner: p.uuid };
  }
  const kind = GRID_KINDS.has(p.kind) ? p.kind : "host";
  return { key: `${kind}_${idOf(p.uuid)}`, owner: p.uuid };
}

/**
 * The place a jackpoint is wired to, read through legacy wiring (R1 #11): a trid jackpoint wired to a non-LTG reads
 * as wired to that place's grid when it's an LTG, else to none (any LTG); a device jackpoint reads a host or none.
 */
export function wiredPlace(jack, topo) {
  const w = topo.get(jack?.wired);
  if (!w) return null;
  if (jackpointKind(jack.kind).device) return GRID_KINDS.has(w.kind) ? null : w.uuid;
  if (w.kind === "ltg") return w.uuid;
  return topo.get(w.grid)?.kind === "ltg" ? w.grid : null;
}
/** Does a jackpoint's wiring fit its kind (the config warning, the topology-on list)? */
export function wiringFits(jack, topo) {
  const w = topo.get(jack?.wired);
  if (!jack?.wired) return true;
  if (!w) return false;
  return jackpointKind(jack.kind).device ? !GRID_KINDS.has(w.kind) : w.kind === "ltg";
}

/**
 * May the decker, on place `at` (null = at his jackpoint), run `op` against `target`? The p.29–30 table plus p.116,
 * open access / tiers / host-host links (p.14–15), and unlisted addresses (p.114).
 * @param {object} a
 * @param {string|null} a.at
 * @param {string} a.op           a vr2SystemOperations key
 * @param {string} a.target       the target place's uuid
 * @param {Map<string, object>} a.topo  uuid → {uuid, kind, grid, links, entryPoints, unlisted}
 * @param {{kind: string, wired: string|null}} a.jack
 * @param {Set<string>} [a.known] uuids whose address the decker knows
 * @param {boolean} [a.gm]        the GM always knows every address
 * @returns {{ok: boolean, why?: string}}
 */
export function reachable({ at, op, target, topo, jack, known = new Set(), gm = false }) {
  const P = at ? topo.get(at) : null;
  const T = topo.get(target);
  const no = (why) => ({ ok: false, why });
  if (!T) return no("Not a place on the Matrix.");
  if (op === "gracefulLogoff") return P && T.uuid === P.uuid ? { ok: true } : no(P ? "Log off from where you are." : "You aren't logged on to anything: just jack out.");
  if (!LOGON_OPS.has(op)) {
    if (!P) return no("Log on to a grid or host first.");
    if (T.uuid !== P.uuid) return no(`You're on ${P.name ?? "another place"}: operations run there.`);
    if (!GRID_KINDS.has(P.kind) || GRID_OPS[P.kind].has(op)) return { ok: true };
    return no("Grids run only logons, Locate Access Node, comcalls and Redirect Datatrail (p.29–30).");
  }
  const isHost = !GRID_KINDS.has(T.kind);
  let ok = false, why = "Not reachable from here.", wired = null;
  if (!P) {
    const k = jackpointKind(jack?.kind);
    wired = wiredPlace(jack, topo);
    if (k.device) { ok = op === "logonHost" && isHost && !!wired && T.uuid === wired; why = wired ? "This jackpoint reaches only the host controlling its device (p.29)." : "This jackpoint isn't wired to a host (GM: set its \"Wired to\")."; }
    else { ok = op === "logonLTG" && T.kind === "ltg" && (!wired || T.uuid === wired); why = wired ? "This jackpoint connects to its own LTG (p.29)." : "From a trid jackpoint, only Logon to LTG (p.29)."; }
  } else if (P.kind === "ltg") {
    ok = (op === "logonLTG" && T.kind === "pltg" && (T.entryPoints ?? []).includes(P.uuid))
      || (op === "logonRTG" && T.kind === "rtg" && T.uuid === P.grid)
      || (op === "logonHost" && isHost && T.grid === P.uuid);
  } else if (P.kind === "rtg") {
    ok = (op === "logonLTG" && T.kind === "ltg" && T.grid === P.uuid) || (op === "logonRTG" && T.kind === "rtg" && T.uuid !== P.uuid);
  } else if (P.kind === "pltg") {
    ok = (op === "logonLTG" && T.kind === "ltg" && (P.entryPoints ?? []).includes(T.uuid))
      || (op === "logonRTG" && T.kind === "rtg")
      || (op === "logonHost" && isHost && T.grid === P.uuid);
  } else {
    ok = op === "logonHost" && isHost && T.uuid !== P.uuid && ((!!P.grid && T.grid === P.grid) || linked(P, T));
    if (!ok && op !== "logonHost") why = "From a host, Disconnect to grid first (p.14).";
  }
  if (!ok) return no(why);
  // The place a jackpoint is physically wired to needs no address.
  if (T.unlisted && !gm && !known.has(T.uuid) && T.uuid !== wired) return no("You don't know its address: Locate Access Node (p.114).");
  return { ok: true };
}

/** Disconnect to grid (p.14): from a host with a grid, back onto it; no test. */
export function disconnectTarget(at, topo) {
  const P = topo.get(at);
  return P && !GRID_KINDS.has(P.kind) && topo.has(P.grid) ? P.grid : null;
}

/**
 * The tally a new session on `scope` starts at (§4): the outgoing session's when it's the same scope, else the
 * ledger's entry for this connection, else a failed-access memory from the same jackpoint, else 0.
 * Ledger entries: { conn, jackpoint, tally, forgetAt? } — forgetAt marks a failed-logon memory (p.116).
 */
export function seedTally({ scope, outgoing = null, ledger = {}, conn, jackpoint = null, now = 0 }) {
  if (outgoing && outgoing.scope === scope) return outgoing.forgetAt != null && now >= outgoing.forgetAt ? 0 : outgoing.tally ?? 0;
  const e = ledger[scope];
  if (!e) return 0;
  const live = e.forgetAt == null || now < e.forgetAt;
  if (e.conn === conn) return live ? e.tally ?? 0 : 0;
  return e.forgetAt != null && live && jackpoint && e.jackpoint === jackpoint ? e.tally ?? 0 : 0;
}

/** The PLTG carry (p.29): what a successful logon adds so the PLTG's tally is at least the public one. */
export const carryAmount = (carried, seeded) => Math.max(0, (carried ?? 0) - (seeded ?? 0));
