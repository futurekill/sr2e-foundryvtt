/**
 * Rigger 2 remote-control networks (R2 p.62–67; docs/PLAN-vehicles-phase2.md Part 5.0 / 5a). Under the Rigger 2 ruleset only.
 *   - A network = a deck item (rule `rc-deck`) + its record `flags.sr2e.rcNet = { rev, operator, connection: { state, gen },
 *     subscribers: [vehicleUuid], affiliated: { <vKey>: { since, hardwired } }, primary, standingOrders, … }`.
 *   - ONE control truth: an affiliated, reachable vehicle of a CONNECTED network is controlled by that network's operator
 *     (`controllerOf` in vehicle-play.mjs asks `networkControllerOf` first). Affiliation and Part 1 crew control exclude
 *     each other both ways.
 *   - Every write runs on the active GM in the world-wide queue `rc-control` (Part 1's `vehicle-control` op shares it);
 *     each op writes ONE deck update and bumps `rev`.
 */
import { gmOp, gmCall, followId } from "./vehicle-play.mjs";
import { enqueueAttack, setPhaseOwner } from "./engagement.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { rcRuleOf, deckLimits, networkCapable, droneMode, poolBalance } from "./rules/drone-rules.mjs";
import { baseFlux, fluxRange } from "./rules/vehicle-sensor-rules.mjs";

const RC = "rc-control";
export const rcQueue = (fn) => enqueueAttack(RC, fn);
export const vKey = (uuid) => followId(uuid);
export const netOf = (deck) => deck?.flags?.sr2e?.rcNet ?? null;
export const isRcDeck = (item) => rcRuleOf(item) === "rc-deck";
const num = (n) => Number(n) || 0;

/* ── The index (5.0): every deck with a record, by affiliated vehicle and by operator ─────────────────────────────── */

let INDEX = null;
const invalidate = () => { INDEX = null; };
function allActors() {
  const out = [...(game.actors ?? [])];
  for (const s of game.scenes ?? []) for (const t of s.tokens) if (!t.actorLink && t.actor) out.push(t.actor);
  return out;
}
/** `{ byVehicle: Map<vKey, deck>, byOperator: Map<actorUuid, deck[]>, decks: deck[] }`, rebuilt lazily after any change. */
export function rcIndex() {
  if (INDEX) return INDEX;
  const byVehicle = new Map(), byOperator = new Map(), decks = [];
  for (const a of allActors()) for (const i of a.items ?? []) {
    const net = netOf(i);
    if (!net || !isRcDeck(i)) continue;
    decks.push(i);
    for (const k of Object.keys(net.affiliated ?? {})) {
      // At most one network per vehicle: the earlier `since` wins (an imported duplicate is reported by the GM pass).
      const prior = byVehicle.get(k);
      if (!prior || sinceOrder(net.affiliated[k]) < sinceOrder(netOf(prior)?.affiliated?.[k])) byVehicle.set(k, i);
    }
    if (net.operator) byOperator.set(net.operator, [...(byOperator.get(net.operator) ?? []), i]);
  }
  return (INDEX = { byVehicle, byOperator, decks });
}
const sinceOrder = (a) => num(a?.at);
export function registerRcIndexHooks() {
  for (const h of ["createItem", "updateItem", "deleteItem", "createActor", "deleteActor", "updateActor", "createToken",
    "deleteToken", "updateToken", "createScene", "deleteScene", "canvasReady"]) Hooks.on(h, invalidate);
}

/* ── Derived reads ─────────────────────────────────────────────────────────────────────────────────────────────── */

const deckActor = (deck) => deck?.parent ?? null;
/** The deck's transmitter Flux (p.30; 5a.1): an RC deck is Flux 2, raised by a signal amplifier bound to it (R2 p.99). */
export function deckFlux(deck) {
  const owner = deckActor(deck);
  // A deck on a vehicle is one of its transmitters (4a.3): engine boosts through its Electronics Port (≤ ⌊Body ÷ 2⌋,
  // R2 p.64), amplifiers and conditions all come from the vehicle's one Flux reader.
  if (owner?.type === "vehicle" && TX) { const f = TX.txFlux(owner, TX.transmitterOf(owner, deck.id))?.flux; if (Number.isFinite(f)) return f; }
  const amp = (owner?.items ?? []).filter(i => rcRuleOf(i) === "signal-amplifier" && (i.flags?.sr2e?.deckId ?? soleDeckId(owner)) === deck.id)
    .reduce((m, i) => Math.max(m, num(i.system.rating)), 0);
  return baseFlux("rcDeck", num(deck?.system?.rating)) + amp;
}
const soleDeckId = (actor) => { const d = (actor?.items ?? []).filter(isRcDeck); return d.length === 1 ? d[0].id : null; };

/** Reachability (5a.1): the vehicle within the deck's range from its holder; an unknown distance counts as reachable. */
export async function reachable(deck, vehicle) {
  const holder = deckActor(deck);
  if (!holder || !vehicle || holder === vehicle) return true;
  const { distanceBetween } = await import("./vehicle-sensors.mjs");
  const d = distanceBetween(holder, vehicle);
  if (d == null) return true;
  const r = fluxRange(deckFlux(deck));
  const range = typeof r === "object" && r ? r.low : r;
  return range == null ? false : d <= range;
}
/** Synchronous variant for hot paths (controllerOf): the last value the GM's range sweep recorded, default reachable. */
const reachKnown = (deck, vehicle) => netOf(deck)?.unreachable?.[vKey(vehicle.uuid)] !== true;

/** The network a vehicle is affiliated with (any connection state), or null. */
export const networkOf = (vehicle) => (vehicle?.uuid ? rcIndex().byVehicle.get(vKey(vehicle.uuid)) ?? null : null);

/** The live controller through a network (5.0): the operator of the CONNECTED network, the vehicle reachable; else null. */
export function networkControllerOf(vehicle) {
  if (!isRigger2()) return null;
  const deck = networkOf(vehicle);
  const net = netOf(deck);
  if (!net || net.connection?.state !== "connected" || !net.operator || !reachKnown(deck, vehicle)) return null;
  return fromUuidSync(net.operator) ?? null;
}
/* ── BattleTac IVIS (5a.5, R2 p.66–67) ─────────────────────────────────────────────────────────────────────── */

/** The deck carries a bound IVIS master unit (a module counts for its `deckId` deck, or the actor's only deck). */
export const hasIvisMaster = (deck) => (deckActor(deck)?.items ?? []).some(i => rcRuleOf(i) === "ivis-master"
  && (i.flags?.sr2e?.deckId ?? soleDeckId(deckActor(deck))) === deck.id);
/** The drone carries a working IVIS receiver module. */
export const hasIvisReceiver = (v) => (v?.items ?? []).some(i => i.type === "vehicle_mod" && (i.system.modKey === "ivis-receiver" || rcRuleOf(i) === "ivis-receiver")
  && ["", "done", "factory"].includes(i.system.custom?.state ?? ""));
/** The IVIS group a drone belongs to: { deck, gid, group } or null. A drone is in at most one active group. */
export function ivisGroupOf(vehicle) {
  const deck = networkOf(vehicle), k = vehicle ? vKey(vehicle.uuid) : null;
  for (const [gid, g] of Object.entries(netOf(deck)?.ivis ?? {})) if (g?.drones?.includes(k)) return { deck, gid, group: g };
  return null;
}
/** The pool refreshes at the end of each Combat Turn: spends count under the current Turn (outside combat, per test). */
const ivisKey = () => { const c = game.combat; return c?.started ? `${c.id}:${c.round}` : null; };
/** IVIS Pool dice a drone may draw now (never while jumped into it, p.67). */
export function ivisBalance(vehicle) {
  const hit = ivisGroupOf(vehicle);
  if (!hit || droneModeOf(vehicle) === "primary") return 0;
  const key = ivisKey();
  return key ? poolBalance(hit.group.pool, hit.group.spends, key) : num(hit.group.pool);
}
/** Remove drones from every IVIS group of a network record (a new order or task, p.67); an emptied group ends. */
function leaveGroups(net, keys) {
  for (const [gid, g] of Object.entries(net.ivis ?? {})) {
    g.drones = (g.drones ?? []).filter(d => !keys.includes(d));
    if (!g.drones.length) delete net.ivis[gid];
  }
}

/**
 * Who fires a network drone's weapon (p.65; 5a.2/5a.8): its operator when it's the primary (rigged, Combat Pool through
 * the link); otherwise the DRONE itself on its Pilot — the captain's "Fire a weapon system" on any single drone, or a
 * secondary carrying out its command (the jumped-in rigger can't fire a secondary directly). Null for a vehicle not on
 * a connected network (the usual gunner rules apply). `{ gunner, note }` or `{ refused }`.
 */
export function networkGunner(vehicle) {
  const op = networkControllerOf(vehicle);
  if (!op) return null;
  if (sitsOut(vehicle) && !game.user.isGM) return { refused: `${vehicle.name}: ${SIT_OUT}` };
  const mode = droneModeOf(vehicle);
  if (mode === "primary") return { gunner: op, note: "" };
  if (mode === "secondary" && !netOf(networkOf(vehicle))?.standingOrders?.[vKey(vehicle.uuid)]?.obeyed && !game.user.isGM)
    return { refused: `${vehicle.name} is a secondary drone: command it first — a jumped-in rigger can't fire it directly (Rigger 2 p.65)` };
  return { gunner: vehicle, note: "the drone's Pilot (Rigger 2 p.65)" };
}

/** Is the vehicle hardwired to its network's deck (5a.7)? */
export const hardwiredTo = (vehicle) => !!netOf(networkOf(vehicle))?.affiliated?.[vKey(vehicle.uuid)]?.hardwired;
/** Is the vehicle affiliated with any network (Part 1 crew control is then refused, and vice versa)? */
export const isAffiliated = (vehicle) => isRigger2() && !!networkOf(vehicle);

/** The operator's primary drone key across every network they run (one primary per rigger, 5a.2), or null. */
export function primaryOf(operatorUuid) {
  for (const d of rcIndex().byOperator.get(operatorUuid) ?? []) if (netOf(d)?.primary) return netOf(d).primary;
  return null;
}
/** A drone's mode for its live operator (5a.2): primary / secondary / captain, or null when not network-controlled. */
export function droneModeOf(vehicle) {
  const op = networkControllerOf(vehicle);
  return op ? droneMode({ droneKey: vKey(vehicle.uuid), primaryKey: primaryOf(op.uuid) }) : null;
}
/** Rigged into a networked vehicle (5a.7 dispatch): it is the operator's primary AND the operator is still eligible. */
export function riggedIntoNetworked(character, vehicle) {
  const op = networkControllerOf(vehicle);
  return !!op && op === character && primaryOf(op.uuid) === vKey(vehicle.uuid) && rigEligible(op);
}
/** Jacked in with an active VCR (R2 p.16): what jumping and rigging need. */
export const rigEligible = (actor) => !!actor?.system?.rigging && num(actor.system.vehicleControlRig) > 0;

/* ── The ops (GM, queue `rc-control`) ──────────────────────────────────────────────────────────────────────────── */

// The REQUESTING user's permission (ops run on the GM's client, where `isOwner` is always true — c5a r1 #1).
const mayRun = (user, deck) => !!(user?.isGM || deck?.testUserPermission?.(user, "OWNER") || deckActor(deck)?.testUserPermission?.(user, "OWNER")
  || (netOf(deck)?.operator && fromUuidSync(netOf(deck).operator)?.testUserPermission?.(user, "OWNER")));
/** Lock order chase-membership → rc-control (5.0): affiliation and chase driver assignment can't interleave (c5a r1 #2). */
const membership = (fn) => enqueueAttack("chase-membership", fn);
/** A vehicle already has a crew controller: Part 1 control, or a chase entry with a driver (c5a r1 #2). */
async function crewControlled(v) {
  if (game.actors.some(a => a.type === "character" && (a.system.controlledVehicles ?? []).includes(v.uuid))) return true;
  const { findEntry } = await import("./chase-state.mjs");
  return !!findEntry(v.uuid)?.entry?.driver;
}
/** R5-1: a drone affiliated during THIS Combat Turn sits the rest of it out (c5a r1 #5: every drone action path asks). */
export function sitsOut(vehicle, c = game.combat) {   // c = the combat the drone acts in (a chase's own)
  const a = netOf(networkOf(vehicle))?.affiliated?.[vKey(vehicle.uuid)];
  return !!(a?.since && c?.started && a.since.combatId === c.id && a.since.round === c.round);
}
export const SIT_OUT = "affiliated this Combat Turn: it can't act until the next (ruling R5-1, Rigger 2 p.64)";
/** A card may settle one command only (c5a r1 #13). */
function useCard(net, ...ids) {
  net.usedCards ??= {};
  for (const id of ids.filter(Boolean)) {
    if (net.usedCards[id]) throw new Error("that card has already been applied");
    net.usedCards[id] = true;
  }
}
const freshNet = (deck) => foundry.utils.deepClone(netOf(deck) ?? { rev: 0, operator: null, connection: { state: "disconnected", gen: 0 },
  subscribers: [], affiliated: {}, primary: null, standingOrders: {} });
async function save(deck, net) {
  net.rev = num(net.rev) + 1;
  await deck.update({ "flags.sr2e.==rcNet": net });
  invalidate();
  return net;
}
function load(deckUuid, user) {
  const deck = fromUuidSync(deckUuid);
  if (!isRigger2()) throw new Error("remote-control networks are Rigger 2 rules");
  if (!deck || !isRcDeck(deck)) throw new Error("not a remote-control deck");
  if (!mayRun(user, deck)) throw new Error("not your deck");
  return deck;
}
const combatNow = () => { const c = game.combat; return c?.started ? { combatId: c.id, round: c.round } : null; };

/**
 * The range sweep (5a.1): when a deck's holder or one of its affiliated vehicles moves, the GM records which vehicles
 * are now out of the deck's range (`rcNet.unreachable.<vKey>`), so the synchronous control reads see it. Out of range
 * a drone can't be commanded or observed and acts on its last order or holds; no Signal Monitor changes.
 */
export async function rangeSweep(actor) {
  if (!game.users.activeGM?.isSelf || !isRigger2() || !actor) return;
  const decks = rcIndex().decks.filter(d => deckActor(d) === actor
    || Object.values(netOf(d)?.affiliated ?? {}).some(a => a.uuid === actor.uuid));
  for (const deck of decks) await rcQueue(async () => {
    const net = freshNet(deck), out = {};
    for (const [k, a] of Object.entries(net.affiliated)) {
      const v = fromUuidSync(a.uuid);
      if (v && !(await reachable(deck, v))) out[k] = true;
    }
    if (JSON.stringify(out) === JSON.stringify(net.unreachable ?? {})) return;
    net.unreachable = out;
    await save(deck, net);
  });
}

let TX = null;   // vehicle-sensors.mjs, loaded once (it imports the play layer; a static import would be circular)
/**
 * Eligibility and availability after any change to an actor or its items (c5a r1 #6, #7), on the active GM in
 * `rc-control`: an operator who lost an active VCR or jacked out returns to the captain's chair (primary cleared); an
 * implanted deck no longer installed disconnects (records kept); a changed transmitter re-runs the range sweep.
 * (A carried gear deck's `equipped` is not availability — it defaults to false for every carried item.)
 */
export async function rcValidate(actor) {
  if (!game.users.activeGM?.isSelf || !isRigger2() || !actor) return;
  const asOperator = rcIndex().byOperator.get(actor.uuid) ?? [];
  const held = rcIndex().decks.filter(d => deckActor(d) === actor);
  if (!asOperator.length && !held.length) return;
  await rcQueue(async () => {
    for (const deck of asOperator) {
      if (!netOf(deck)?.primary || rigEligible(actor)) continue;
      const net = freshNet(deck); net.primary = null; await save(deck, net);
    }
    for (const deck of held) {
      if (deck.type !== "cyberware" || deck.system.installed !== false || netOf(deck)?.connection?.state !== "connected") continue;
      const net = freshNet(deck); net.connection = { state: "disconnected", gen: num(net.connection.gen) + 1 }; net.primary = null;
      await save(deck, net);
    }
  });
  if (held.length) await rangeSweep(actor);
}

/** The operator's Vehicle Tactics specialization dice (Tactics Concentration, SRComp; R2 p.66), 0 when none. */
export function vehicleTacticsDice(actor) {
  for (const sk of actor?.items?.filter(i => i.type === "skill") ?? []) {
    const sp = sk.system?.specialization;
    if (/vehicle tactics/i.test(sp?.name ?? "")) return Number(sp.rating) || 0;
    if (/vehicle tactics/i.test(sk.name)) return Number(sk.system.rating) || 0;
  }
  return 0;
}

/** The operator's Non-Matrix Programming specialization dice (Computer skill; p.67), 0 when none. */
export function nmpDice(actor) {
  const sk = actor?.items?.find(i => i.type === "skill" && /^computer$/i.test(i.name));
  const sp = sk?.system?.specialization;
  return /non.?matrix programming/i.test(sp?.name ?? "") ? Number(sp.rating) || 0 : 0;
}
/**
 * The legal IVIS Test paths (R2 p.66: "Skill Web modifiers apply if the rigger must default to the Tactics
 * Concentration or Military Theory Skill"; SRComp p.48: a Specialization is half a dot (+1) from its Concentration, a
 * Concentration one dot (+2) from its general skill): Vehicle Tactics at TN 5, the Tactics Concentration at TN 6,
 * Military Theory at TN 8. R2's own instruction wins over p.48's "no modifier for your own general skill" (c5a r3 #1).
 */
export function ivisPaths(actor) {
  const paths = [], add = (label, dice, tn) => { if (dice > 0) paths.push({ label, dice, tn }); };
  add("Vehicle Tactics", vehicleTacticsDice(actor), 5);
  let conc = 0, gen = 0;
  for (const sk of actor?.items?.filter(i => i.type === "skill") ?? []) {
    const s = sk.system ?? {};
    if (/^tactics$/i.test(s.concentration?.name ?? "")) conc = Math.max(conc, Number(s.concentration.rating) || 0);
    if (/^tactics$/i.test(sk.name)) conc = Math.max(conc, Number(s.rating) || 0);
    if (/^military theory$/i.test(sk.name)) gen = Math.max(gen, Number(s.rating) || 0);
  }
  add("Tactics (default, +1 TN)", conc, 6);
  add("Military Theory (default, +3 TN)", gen, 8);
  return paths;
}
/** Is an IVIS Test card legal: its own dice and base TN fit one path, with no situational misc dice? */
// The path's TN is checked against the card's BASE TN: a wound or other modifier in the effective TN can't stand in for
// the Skill Web default (c5a r4). A card without baseTn (rolled before 0.156.0) can't prove its path: refused.
export const ivisCardLegal = (actor, test) => !tookMisc(test) && test?.baseTn != null
  && ivisPaths(actor).some(p => ownDice(test) <= p.dice && num(test.baseTn) >= p.tn);
/** A test card's own dice (not Karma Pool dice) and whether it took situational misc dice. */
const ownDice = (test) => (test?.dice ?? []).filter(d => d.sourceKey === "base").length;
const tookMisc = (test) => (test?.dice ?? []).some(d => d.sourceKey === "misc");

export function registerRcNet() {
  const validate = (a) => rcValidate(a).catch(err => console.error("SR2E | rc validate", err));
  Hooks.on("updateActor", (a) => validate(a));
  for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, (i) => { if (i.parent instanceof Actor) validate(i.parent); });
  registerRcIndexHooks();
  import("./vehicle-sensors.mjs").then(m => { TX = m; });
  setPhaseOwner((v) => networkControllerOf(v));
  // A non-robot network drone has no Initiative (p.65; 5a.4): it acts in its operator's phases. Players are refused;
  // the GM is warned and may add it anyway.
  Hooks.on("preCreateCombatant", (cb, data, options, userId) => {
    const a = cb.actor;
    if (a?.type !== "vehicle" || a.system.isRobot || !isAffiliated(a) || userId !== game.user.id) return;
    const msg = `${a.name} is a network drone: it has no Initiative and acts in its operator's phases (Rigger 2 p.65)`;
    if (!game.user.isGM) { ui.notifications.warn(msg); return false; }
    ui.notifications.warn(`${msg} — added on the GM's say-so.`);
  });
  Hooks.on("updateToken", (tok, ch) => {
    if (!("x" in ch || "y" in ch || "elevation" in ch)) return;
    rangeSweep(tok.actor).catch(err => console.error("SR2E | rc range sweep", err));
  });

  // Subscribe / unsubscribe (p.62): ≤ 2 × rating; editing the list is not an action. Unsubscribing disaffiliates.
  gmOp("rcSubscribe", ({ deckUuid, vehicleUuid, on }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), v = fromUuidSync(vehicleUuid);
    if (v?.type !== "vehicle") throw new Error("not a vehicle");
    const net = freshNet(deck), k = vKey(v.uuid);
    if (on) {
      if (net.subscribers.includes(v.uuid)) return net;
      if (net.subscribers.length >= deckLimits(deck.system.rating).subscribers) throw new Error(`a Rating ${num(deck.system.rating)} deck holds ${deckLimits(deck.system.rating).subscribers} subscribers (Rigger 2 p.62)`);
      net.subscribers.push(v.uuid);
    } else {
      if (net.affiliated[k]?.hardwired) throw new Error("a hardwired vehicle can't be removed (Rigger 2 p.64)");
      net.subscribers = net.subscribers.filter(u => u !== v.uuid);
      delete net.affiliated[k];
      if (net.primary === k) net.primary = null;
    }
    return save(deck, net);
  }));

  // Affiliate / disaffiliate (p.64): a Simple Action each; ≤ rating; network-capable; one network per vehicle; never a
  // vehicle under Part 1 crew control; R5-1 — affiliated this Combat Turn, it sits out the rest of the Turn.
  gmOp("rcAffiliate", ({ deckUuid, vehicleUuid, on }, user) => membership(() => rcQueue(async () => {
    const deck = load(deckUuid, user), v = fromUuidSync(vehicleUuid);
    if (v?.type !== "vehicle") throw new Error("not a vehicle");
    const net = freshNet(deck), k = vKey(v.uuid);
    if (!on) {
      if (!net.affiliated[k]) return net;
      if (net.affiliated[k].hardwired) throw new Error("a hardwired vehicle stays affiliated (Rigger 2 p.64)");
      delete net.affiliated[k];
      if (net.primary === k) net.primary = null;
      return save(deck, net);
    }
    if (net.affiliated[k]) return net;
    if (!net.subscribers.includes(v.uuid)) throw new Error("subscribe the vehicle first (Rigger 2 p.62)");
    if (Object.keys(net.affiliated).length >= deckLimits(deck.system.rating).affiliated) throw new Error(`a Rating ${num(deck.system.rating)} deck affiliates ${deckLimits(deck.system.rating).affiliated} vehicles at once (Rigger 2 p.64)`);
    const { riggerAdapted } = await import("./vehicle-play.mjs");
    if (!networkCapable({ adapted: riggerAdapted(v), pilot: v.system.effective?.pilot ?? v.system.pilot })) throw new Error(`${v.name} isn't network-capable: it needs rigger adaptation and a Pilot Rating (Rigger 2 p.65)`);
    const other = networkOf(v);
    if (other && other !== deck) throw new Error(`${v.name} is already affiliated with another network`);
    if (await crewControlled(v)) throw new Error(`${v.name} is under a crew's control or has a chase driver (Rigger 2 p.64)`);
    if (!(await reachable(deck, v))) throw new Error(`${v.name} is out of the deck's range (Rigger 2 p.64)`);
    net.affiliated[k] = { since: combatNow(), at: Date.now(), hardwired: false, uuid: v.uuid };
    return save(deck, net);
  })));

  // Connect / disconnect (5.0): the only operator transitions. A disconnect keeps subscribers and affiliations and
  // clears the primary (the drones act on their last order or hold).
  gmOp("rcConnect", ({ deckUuid, operatorUuid }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), op = fromUuidSync(operatorUuid);
    if (!op || !["character", "npc"].includes(op.type)) throw new Error("the operator must be a character or an NPC");
    if (!user.isGM && !op.testUserPermission(user, "OWNER")) throw new Error("not your character");
    const holder = deckActor(deck);
    if (holder?.type !== "vehicle" && holder !== op) throw new Error("only its owner runs a carried or implanted deck");
    const net = freshNet(deck);
    // A new operator never inherits the old one's primary; one primary per rigger stays true (c5a r1 #4).
    const primaryElsewhere = (rcIndex().byOperator.get(op.uuid) ?? []).some(d => d !== deck && netOf(d)?.primary);
    if (net.operator !== op.uuid || primaryElsewhere) net.primary = null;
    net.operator = op.uuid; net.connection = { state: "connected", gen: num(net.connection?.gen) + 1 };
    return save(deck, net);
  }));
  gmOp("rcDisconnect", ({ deckUuid }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), net = freshNet(deck);
    if (net.connection?.state !== "connected") return net;
    net.connection = { state: "disconnected", gen: num(net.connection.gen) + 1 }; net.primary = null;
    return save(deck, net);
  }));

  // Jump into a drone / return to the captain's chair (p.65): Simple Actions; one primary per rigger across all
  // networks; jumping needs the operator jacked in with a VCR.
  gmOp("rcJump", ({ deckUuid, vehicleUuid }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), v = fromUuidSync(vehicleUuid);
    if (v?.type !== "vehicle") throw new Error("not a vehicle");
    const net = freshNet(deck), k = vKey(v.uuid);
    if (net.connection?.state !== "connected" || !net.operator) throw new Error("connect the deck first");
    if (!net.affiliated[k]) throw new Error("affiliate the drone first");
    if (!(await reachable(deck, v))) throw new Error(`${v.name} is out of the deck's range (Rigger 2 p.64)`);
    const op = fromUuidSync(net.operator);
    if (!rigEligible(op)) throw new Error(`${op?.name} must be jacked in with a vehicle control rig to jump in (Rigger 2 p.65)`);
    const elsewhere = (rcIndex().byOperator.get(op.uuid) ?? []).find(d => d !== deck && netOf(d)?.primary);
    if (elsewhere) throw new Error(`${op.name} is already jumped into a drone on another network — return first (Rigger 2 p.65)`);
    net.primary = k;
    return save(deck, net);
  }));
  // A command's result (p.66–67; 5a.3): the drone's Comprehension Test card → its standing order (≥ 1 success obeys;
  // successes = latitude). The primary needs no command.
  gmOp("rcOrder", ({ deckUuid, vehicleUuid, text = "", messageId }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), v = fromUuidSync(vehicleUuid);
    if (v?.type !== "vehicle") throw new Error("not a vehicle");
    const net = freshNet(deck), k = vKey(v.uuid);
    if (net.connection?.state !== "connected" || !net.affiliated[k]) throw new Error("the drone must be affiliated with a connected network");
    if (net.primary === k) throw new Error("you're jumped into it: the primary needs no command (Rigger 2 p.65)");
    if (!(await reachable(deck, v))) throw new Error(`${v.name} is out of the deck's range: it acts on its last order or holds (Rigger 2 p.64)`);
    const msg = game.messages.get(messageId), test = msg?.flags?.sr2e?.test, cmd = msg?.flags?.sr2e?.rcCommand;
    // The card must be THIS drone's Comprehension Test for THIS deck, used once (c5a r1 #13).
    if (!test || test.actorUuid !== v.uuid || cmd?.deckUuid !== deck.uuid) throw new Error("that isn't this drone's Comprehension Test card");
    useCard(net, messageId);
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    const successes = testTotalSuccesses(test);
    net.standingOrders[k] = { text: String(text).slice(0, 200), successes, obeyed: successes >= 1, messageId, rev: num(net.rev) + 1 };
    if (net.ivis) leaveGroups(net, [k]);   // a new order for one drone takes it out of its IVIS group (p.67)
    return save(deck, net);
  }));

  // Eligibility loss is a control transition (5a.7, round 14 #2): jacking in or out runs here, so the primary is cleared
  // (a return to the captain's chair — a voluntary jack-out is never a dump, p.64) in the same queue as every jump.
  gmOp("rcEligibility", ({ operatorUuid, rigging }, user) => rcQueue(async () => {
    const op = fromUuidSync(operatorUuid);
    if (!op || !["character", "npc"].includes(op.type)) throw new Error("not a character");
    if (!user.isGM && !op.testUserPermission(user, "OWNER")) throw new Error("not your character");
    if (!rigging) for (const deck of rcIndex().byOperator.get(op.uuid) ?? []) {
      const net = freshNet(deck);
      if (!net.primary) continue;
      net.primary = null;
      await save(deck, net);
    }
    await op.update({ "system.rigging": !!rigging });
    return true;
  }));

  // Deleting a CONNECTED deck dumps its operator (5a.6, R2 p.64): the pending dump first, then the deletion, then the
  // GM's reconcile verifies the deck is gone and opens the dump (an interrupted deletion is retried there).
  gmOp("rcDeleteDeck", ({ deckUuid }, user) => rcQueue(async () => {
    const deck = fromUuidSync(deckUuid);
    if (!deck || !isRcDeck(deck)) return true;
    if (!user.isGM && !deck.testUserPermission(user, "OWNER") && !deckActor(deck)?.testUserPermission?.(user, "OWNER")) throw new Error("not your deck");   // the requester, not the GM running this (c5a r2 #1)
    const net = netOf(deck), op = net?.connection?.state === "connected" && net.operator ? fromUuidSync(net.operator) : null;
    const { pendDump, reconcileDumps } = await import("./rig-dump.mjs");
    if (op) await pendDump(op, { cause: "deck-removed", deck });
    await deck.delete({ sr2eRcDelete: true });
    invalidate();
    if (op) await reconcileDumps(op);
    return true;
  }));

  // Hardwiring (R2 p.64; 5a.7): a deck carried BY a rigger-adapted vehicle, connected through one of its Electronics
  // Ports, is permanently subscribed and affiliated with it (counted against both limits; never disaffiliated). The GM's
  // un-hardwire (or deleting the deck) ends it.
  gmOp("rcHardwire", ({ deckUuid, on = true }, user) => membership(() => rcQueue(async () => {
    const deck = load(deckUuid, user), v = deckActor(deck);
    if (v?.type !== "vehicle") throw new Error("hardwire a deck installed in the vehicle itself (Rigger 2 p.64)");
    const net = freshNet(deck), k = vKey(v.uuid);
    if (!on) {
      if (!user.isGM) throw new Error("GM only");
      if (!net.affiliated[k]?.hardwired) return net;
      delete net.affiliated[k];
      if (net.primary === k) net.primary = null;
      return save(deck, net);
    }
    if (net.affiliated[k]?.hardwired) return net;
    const { riggerAdapted } = await import("./vehicle-play.mjs"), { ported } = await import("./vehicle-sensors.mjs");
    if (!riggerAdapted(v)) throw new Error(`${v.name} must be adapted for rigger control (Rigger 2 p.64)`);
    if (!ported(v, deck.id)) throw new Error(`connect the deck through one of ${v.name}'s Electronics Ports first (Rigger 2 p.64, p.139)`);
    const other = networkOf(v);
    if (other && other !== deck) throw new Error(`${v.name} is already affiliated with another network`);
    if (await crewControlled(v)) throw new Error(`${v.name} is under a crew's control or has a chase driver (Rigger 2 p.64)`);
    const lim = deckLimits(deck.system.rating);
    if (!net.subscribers.includes(v.uuid)) {
      if (net.subscribers.length >= lim.subscribers) throw new Error(`a Rating ${num(deck.system.rating)} deck holds ${lim.subscribers} subscribers (Rigger 2 p.62)`);
      net.subscribers.push(v.uuid);
    }
    if (!net.affiliated[k] && Object.keys(net.affiliated).length >= lim.affiliated) throw new Error(`a Rating ${num(deck.system.rating)} deck affiliates ${lim.affiliated} vehicles at once (Rigger 2 p.64)`);
    net.affiliated[k] = { ...(net.affiliated[k] ?? { since: combatNow(), at: Date.now() }), hardwired: true, uuid: v.uuid };
    return save(deck, net);
  })));

  // A group command (p.66–67; 5a.3/5a.5): ONE Comprehension Test card for an identical command to several drones, its
  // result each drone's standing order; with an IVIS Test card, the unassigned successes become the group's IVIS Pool
  // and the drones a new group (any earlier group membership ends; a new task ends the old group).
  gmOp("rcGroupOrder", ({ deckUuid, vehicleUuids = [], text = "", messageId }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), net = freshNet(deck);
    if (net.connection?.state !== "connected") throw new Error("connect the deck first");
    const vs = vehicleUuids.map(u => fromUuidSync(u));
    if (!vs.length || vs.some(v => v?.type !== "vehicle")) throw new Error("choose the group's drones");
    const keys = vs.map(v => vKey(v.uuid));
    if (keys.some(k => !net.affiliated[k])) throw new Error("every drone must be affiliated with this network");
    if (keys.includes(net.primary)) throw new Error("the primary needs no command (Rigger 2 p.65)");
    if (keys.length > num(deck.system.rating)) throw new Error(`a group is at most ${num(deck.system.rating)} drones (the deck's rating)`);
    for (const v of vs) if (!(await reachable(deck, v))) throw new Error(`${v.name} is out of the deck's range (Rigger 2 p.64)`);
    // The card is bound to this deck and exactly these drones; the IVIS Pool is DERIVED from the operator's verified IVIS
    // Test card less what was put on this test — never a requested number — and each card settles once (c5a r1 #13).
    const msg = game.messages.get(messageId), test = msg?.flags?.sr2e?.test, cmd = msg?.flags?.sr2e?.rcCommand;
    if (!test || cmd?.deckUuid !== deck.uuid || !vs.some(v => v.uuid === test.actorUuid)
      || [...(cmd.vehicleUuids ?? [])].sort().join() !== vs.map(v => v.uuid).sort().join()) throw new Error("that isn't this group's Comprehension Test card");
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    const successes = testTotalSuccesses(test);
    let ivis = null;
    if (cmd.ivisMessageId) {
      const im = game.messages.get(cmd.ivisMessageId), it = im?.flags?.sr2e?.test;
      if (!it || im.flags.sr2e.rcIvis?.deckUuid !== deck.uuid || it.actorUuid !== net.operator) throw new Error("that isn't the operator's IVIS Test card");
      // Rolled as the rules say (c5a r2 #2, r3 #1): dice and TN together on one legal path, no situational misc dice.
      const opActor = fromUuidSync(net.operator);
      if (!ivisCardLegal(opActor, it)) throw new Error("that IVIS Test wasn't rolled on a legal path: Vehicle Tactics at TN 5, or a Skill Web default to Tactics (TN 6) or Military Theory (TN 8) (Rigger 2 p.66, SRComp p.48)");
      const toTest = Math.max(0, num(cmd.ivisToTest)), s = testTotalSuccesses(it);
      if (toTest > s) throw new Error("more IVIS successes on the test than the IVIS Test rolled");
      ivis = { pool: s - toTest, messageId: cmd.ivisMessageId };
    }
    // The Comprehension card holds no more dice than the group's Pilot (+ Non-Matrix Programming, up to Pilot) plus the
    // IVIS successes it declares — so IVIS dice can't be on the test AND in the pool (c5a r2 #2).
    const { comprehensionTest, groupPilot } = await import("./rules/drone-rules.mjs");
    const allowed = comprehensionTest({ pilot: groupPilot(vs.map(v => v.system.effective?.pilot ?? v.system.pilot ?? 0)),
      specDice: nmpDice(fromUuidSync(net.operator)), ivis: ivis ? num(cmd.ivisToTest) : 0 }).dice;
    if (ownDice(test) > allowed || tookMisc(test)) throw new Error("that Comprehension Test has more dice than the group's Pilot and its IVIS successes allow (Rigger 2 p.66)");
    useCard(net, messageId, cmd.ivisMessageId);
    for (const k of keys) net.standingOrders[k] = { text: String(text).slice(0, 200), successes, obeyed: successes >= 1, messageId, rev: num(net.rev) + 1, group: true };
    net.ivis ??= {};
    leaveGroups(net, keys);
    if (ivis && num(ivis.pool) > 0) {
      if (!hasIvisMaster(deck)) throw new Error("the deck needs a BattleTac IVIS master unit (Rigger 2 p.66)");
      const missing = vs.filter(v => !hasIvisReceiver(v));
      if (missing.length) throw new Error(`${missing.map(v => v.name).join(", ")} lack an IVIS receiver module (Rigger 2 p.66)`);
      net.ivis[foundry.utils.randomID(8)] = { drones: keys, task: String(text).slice(0, 200), pool: num(ivis.pool), spends: {}, messageId: ivis.messageId ?? "" };
    }
    return save(deck, net);
  }));
  // An IVIS Pool draw (any drone of the group, any action; p.67), receipted under the Turn's key.
  gmOp("rcIvisSpend", ({ vehicleUuid, n }, user) => rcQueue(async () => {
    const v = fromUuidSync(vehicleUuid), hit = ivisGroupOf(v);
    if (!hit) return { n: 0 };
    if (!user.isGM && !v.testUserPermission(user, "OWNER") && !(networkControllerOf(v)?.testUserPermission(user, "OWNER"))) throw new Error("not your drone");
    const spend = Math.min(Math.max(0, Math.floor(num(n))), ivisBalance(v));
    if (!spend) return { n: 0 };
    const net = freshNet(hit.deck), id = foundry.utils.randomID(16);
    net.ivis[hit.gid].spends[id] = { key: ivisKey() ?? `free:${id}`, n: spend, vehicle: vKey(v.uuid) };
    await save(hit.deck, net);
    return { n: spend, eventId: id };
  }));
  // The task is done (or abandoned): the group and its pool end (p.67).
  gmOp("rcIvisEnd", ({ deckUuid, gid }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), net = freshNet(deck);
    if (!net.ivis?.[gid]) return net;
    delete net.ivis[gid];
    return save(deck, net);
  }));

  gmOp("rcReturn", ({ deckUuid }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), net = freshNet(deck);
    if (!net.primary) return net;
    net.primary = null;
    return save(deck, net);
  }));
}

/** Client helpers. */
export const rc = (op, args) => gmCall(op, args);
