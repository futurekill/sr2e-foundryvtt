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
import { enqueueAttack } from "./engagement.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";
import { rcRuleOf, deckLimits, networkCapable, droneMode } from "./rules/drone-rules.mjs";
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

const mayRun = (user, deck) => !!(user?.isGM || deck?.isOwner || deckActor(deck)?.testUserPermission?.(user, "OWNER")
  || (netOf(deck)?.operator && fromUuidSync(netOf(deck).operator)?.testUserPermission?.(user, "OWNER")));
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
export function registerRcNet() {
  registerRcIndexHooks();
  import("./vehicle-sensors.mjs").then(m => { TX = m; });
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
  gmOp("rcAffiliate", ({ deckUuid, vehicleUuid, on }, user) => rcQueue(async () => {
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
    if (game.actors.some(a => a.type === "character" && (a.system.controlledVehicles ?? []).includes(v.uuid))) throw new Error(`${v.name} is under a crew's control (Rigger 2 p.64)`);
    if (!(await reachable(deck, v))) throw new Error(`${v.name} is out of the deck's range (Rigger 2 p.64)`);
    net.affiliated[k] = { since: combatNow(), at: Date.now(), hardwired: false, uuid: v.uuid };
    return save(deck, net);
  }));

  // Connect / disconnect (5.0): the only operator transitions. A disconnect keeps subscribers and affiliations and
  // clears the primary (the drones act on their last order or hold).
  gmOp("rcConnect", ({ deckUuid, operatorUuid }, user) => rcQueue(async () => {
    const deck = load(deckUuid, user), op = fromUuidSync(operatorUuid);
    if (!op || !["character", "npc"].includes(op.type)) throw new Error("the operator must be a character or an NPC");
    if (!user.isGM && !op.testUserPermission(user, "OWNER")) throw new Error("not your character");
    const holder = deckActor(deck);
    if (holder?.type !== "vehicle" && holder !== op) throw new Error("only its owner runs a carried or implanted deck");
    const net = freshNet(deck);
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
    const msg = game.messages.get(messageId), test = msg?.flags?.sr2e?.test;
    if (!test) throw new Error("no Comprehension Test card");
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    const successes = testTotalSuccesses(test);
    net.standingOrders[k] = { text: String(text).slice(0, 200), successes, obeyed: successes >= 1, messageId, rev: num(net.rev) + 1 };
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
    if (!user.isGM && !deck.isOwner && !deckActor(deck)?.testUserPermission?.(user, "OWNER")) throw new Error("not your deck");
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
  gmOp("rcHardwire", ({ deckUuid, on = true }, user) => rcQueue(async () => {
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
    if (game.actors.some(a => a.type === "character" && (a.system.controlledVehicles ?? []).includes(v.uuid))) throw new Error(`${v.name} is under a crew's control (Rigger 2 p.64)`);
    const lim = deckLimits(deck.system.rating);
    if (!net.subscribers.includes(v.uuid)) {
      if (net.subscribers.length >= lim.subscribers) throw new Error(`a Rating ${num(deck.system.rating)} deck holds ${lim.subscribers} subscribers (Rigger 2 p.62)`);
      net.subscribers.push(v.uuid);
    }
    if (!net.affiliated[k] && Object.keys(net.affiliated).length >= lim.affiliated) throw new Error(`a Rating ${num(deck.system.rating)} deck affiliates ${lim.affiliated} vehicles at once (Rigger 2 p.64)`);
    net.affiliated[k] = { ...(net.affiliated[k] ?? { since: combatNow(), at: Date.now() }), hardwired: true, uuid: v.uuid };
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
