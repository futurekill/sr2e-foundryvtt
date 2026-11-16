/**
 * Electronic warfare against remote-control networks — Part 5b-1 (Rigger 2 p.68–72; docs/PLAN-vehicles-phase2.md 5b.0–
 * 5b.3, 5b.5–5b.6). Rules arithmetic: module/rules/ew-rules.mjs. Everything here is a GM op run in `rc-control`.
 *   TARGET deck  `flags.sr2e.rcNet`: monitors.<channel>.entries.<eventId> { op, attackerKey, attackerRating, boxes, at },
 *     carriers.<channel> = "lost" (absent = connected), freqGen, alert, bogus.<eventId>, ew.<aid> (a MIJI exchange).
 *   INTRUDER deck `flags.sr2e.ewIntercepts.<netKey>` = { channels, gmChooses, freqGen } (valid only at the target's
 *     current freqGen), `flags.sr2e.ewDecrypted.<netKey>` = freqGen.
 * Every roll is a success-test card the player makes on their own client; the op checks it against the rules (its own
 * dice and base TN, no situational misc dice) and settles each card once (the target network's `usedCards`).
 * A filled channel's authority (5b.0) is `rcNet.channelAuthority.<channel>`; the interference contest (5b.4) is separate.
 */
import { gmOp, gmCall } from "./vehicle-play.mjs";
import * as RC from "./rc-net.mjs";
import * as EW from "./rules/ew-rules.mjs";
import { rcRuleOf } from "./rules/drone-rules.mjs";
import { fluxRange } from "./rules/vehicle-sensor-rules.mjs";
import { comprehensionTest, SKILL_SUCCESS_TABLE } from "./rules/drone-rules.mjs";
import { isRigger2 } from "./vehicle-mode.mjs";

const num = (n) => Number(n) || 0;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const netKey = (deck) => RC.vKey(deck.uuid);

/* ── Equipment and skills ─────────────────────────────────────────────────────────────────────────────────────── */

/** The rating of a deck module (`protocol-emulation`, `decryption`, `rc-encryption`, `rc-eccm`) bound to this deck. */
export function moduleRating(deck, rule) {
  const owner = RC.deckActor(deck);
  return (owner?.items ?? []).filter(i => rcRuleOf(i) === rule && (i.flags?.sr2e?.deckId ?? RC.soleDeckId(owner)) === deck.id)
    .reduce((m, i) => Math.max(m, num(i.system.rating)), 0);
}
/** The holder's working ECM suite rating (a vehicle's transmitters, Part 4a), else 0. */
export async function ecmOf(deck) {
  const owner = RC.deckActor(deck);
  if (owner?.type !== "vehicle") return 0;
  const { transmitters } = await import("./vehicle-sensors.mjs");
  return transmitters(owner).filter(t => t.kind === "ecm" && t.working).reduce((m, t) => Math.max(m, num(t.rating)), 0);
}
/**
 * A concentration's dice: the concentration's rating, or the general skill's (Companion p.48: no modifier for using
 * your own general skill). `electronicWarfare` and `controlSystems` are Electronics concentrations (R2 p.16).
 */
export function concentrationDice(actor, concRe, skillRe = /^electronics$/i) {
  let best = 0;
  for (const sk of actor?.items?.filter(i => i.type === "skill") ?? []) {
    if (concRe.test(sk.name)) best = Math.max(best, num(sk.system.rating));
    if (skillRe.test(sk.name)) {
      best = Math.max(best, num(sk.system.rating));
      if (concRe.test(sk.system.concentration?.name ?? "")) best = Math.max(best, num(sk.system.concentration.rating));
    }
  }
  return best;
}
export const ewSkillDice = (actor) => concentrationDice(actor, /electronic warfare/i);
export const controlSystemsDice = (actor) => concentrationDice(actor, /control systems/i);
/**
 * The most dice a player may roll on an Electronics-concentration test: the best of each eligible skill's OWN dice plus
 * its OWN passive dice (Improved Ability, Enhanced Articulation, a reflex recorder; Shadowtech p.27, p.34) — a skill's
 * bonus never rides on another skill's rating. Only the dice limit: as a TN or a Task Pool cap it stays the rating.
 */
function maxDiceWithPassive(actor, concRe) {
  let best = 0;
  for (const sk of actor?.items?.filter(i => i.type === "skill") ?? []) {
    const own = (rating, tier) => num(rating) > 0 ? num(rating) + (actor._passiveSkillDice?.(sk.name, tier) ?? 0) : 0;
    if (concRe.test(sk.name)) best = Math.max(best, own(sk.system.rating, "base"));
    if (/^electronics$/i.test(sk.name)) {
      best = Math.max(best, own(sk.system.rating, "base"));
      if (concRe.test(sk.system.concentration?.name ?? "")) best = Math.max(best, own(sk.system.concentration.rating, "concentration"));
    }
  }
  return Math.max(best, concentrationDice(actor, concRe));   // never below the rating-only dice
}
export const ewMaxDice = (actor) => maxDiceWithPassive(actor, /electronic warfare/i);
export const controlSystemsMaxDice = (actor) => maxDiceWithPassive(actor, /control systems/i);
/** Task Pool dice on an equipment-rolled test are capped at Electronics or the concentration in use (R5-7). */
export const taskCap = (actor) => concentrationDice(actor, /electronic warfare|control systems/i);

/* ── Records ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export const freqGen = (net) => num(net?.freqGen);
/** The intruder's live intercept of a network (valid only at the target's current frequency generation). */
export function interceptOf(intruderDeck, targetDeck) {
  const rec = intruderDeck?.flags?.sr2e?.ewIntercepts?.[netKey(targetDeck)];
  return rec && num(rec.freqGen) === freqGen(RC.netOf(targetDeck)) ? rec : null;
}
export const carrierLost = (net, channel) => net?.carriers?.[channel] === "lost";
export const channelBoxesOf = (net, channel) => EW.channelBoxes(net?.monitors?.[channel]);

/**
 * A filled channel's authority (p.70; 5b.0): a meaconing or intrusion entry that fills a channel to 10 lets its intruder
 * perform that channel's operations through their own deck. Valid only while the intruder's deck is still connected
 * under the same operator and its intercept still matches the target's frequencies; the owner's reconnection ends it.
 * Returns { actor, deck, auth } for the intruder, or null.
 */
export function channelAuthority(targetDeck, channel) {
  const net = RC.netOf(targetDeck), auth = net?.channelAuthority?.[channel];
  if (!auth || num(auth.freqGen) !== freqGen(net)) return null;
  const deck = fromUuidSync(auth.deckUuid ?? ""), inet = RC.netOf(deck);
  if (!deck || inet?.connection?.state !== "connected" || inet.operator !== auth.operator) return null;
  if (auth.connGen == null || num(inet.connection.gen) !== num(auth.connGen)) return null;   // the intruder exited since (c5b1 r1 #2)
  if (!interceptOf(deck, targetDeck)?.channels?.includes(channel)) return null;
  const actor = fromUuidSync(auth.operator);
  return actor ? { actor, deck, auth } : null;
}
/** Who performs a channel's operations (5b.0): the intruder while their authority stands, else the network's operator. */
export function channelActor(targetDeck, channel) {
  const a = channelAuthority(targetDeck, channel);
  if (a) return a.actor;
  const op = RC.netOf(targetDeck)?.operator;
  return op ? fromUuidSync(op) : null;
}

/** The degradation a drone's own test takes (5b.3): command and system channels, meaconing; not when it's the primary. */
export function droneTestMod(vehicle) {
  const net = RC.netOf(RC.networkOf(vehicle));
  if (!net?.monitors || RC.droneModeOf(vehicle) === "primary") return 0;
  return EW.degradationMod(net.monitors, "drone", ["command", "system"]);
}
/** A network's degradation for one kind of test (comprehension, ivis, indirect …) on the given channels. */
export const netTestMod = (deck, kind, channels) => !isRigger2() ? 0 : EW.degradationMod(RC.netOf(deck)?.monitors ?? {}, kind, channels);
/**
 * The remotely rigged drone's simsense jamming, on EVERY Success Test of the rigger like a damage modifier (p.72; 5b.3):
 * the rigger's live primary through a network, its simsense channel counted once.
 */
export function riggerSimsenseMod(actor) {
  if (!actor?.uuid || !isRigger2()) return 0;   // persisted monitors never reach core-rules tests (c5b1 r1 #6)
  for (const deck of RC.rcIndex().byOperator.get(actor.uuid) ?? []) {
    const net = RC.netOf(deck);
    if (net?.connection?.state !== "connected" || !net.primary) continue;
    return EW.degradationMod(net.monitors ?? {}, "riggerAll", ["simsense"]);
  }
  return 0;
}

/* ── Card checks ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A rolled card made by `actor` for this EW step: its own dice ≤ `maxDice`, Task Pool dice ≤ the Electronics cap,
 * its BASE TN ≥ `minTn`, no situational misc dice, settled once. Returns the test state.
 */
export function checkCard(net, messageId, { kind, actor, maxDice, minTn, bind = {} }) {
  const msg = game.messages.get(messageId), test = msg?.flags?.sr2e?.test, ew = msg?.flags?.sr2e?.ew;
  if (!test || ew?.kind !== kind || test.actorUuid !== actor?.uuid) throw new Error("that isn't this electronic-warfare test's card");
  // The card was rolled for THIS state (c5b1 r1 #3): a frequency switch, a new exchange or a changed authority voids it.
  for (const [k, v] of Object.entries(bind)) if (String(ew[k] ?? "") !== String(v ?? "")) throw new Error("that card was rolled before the network changed: not counted");
  const own = (test.dice ?? []).filter(d => d.sourceKey === "base").length;
  const task = (test.dice ?? []).filter(d => d.sourceKey === "pool:task").length;
  if ((test.dice ?? []).some(d => d.sourceKey === "misc") || own > maxDice || task > taskCap(actor) || test.baseTn == null || num(test.baseTn) < minTn)
    throw new Error(`that card wasn't rolled as the rules say: at most ${maxDice} dice (+ Task Pool up to Electronics) vs TN ${minTn} or more`);
  RC.useCard(net, messageId);
  return test;
}
const successesOf = async (test) => (await import("./rules/sr2e-rules.mjs")).testTotalSuccesses(test);
const whisperTo = (actor) => game.users.filter(u => u.isGM || (actor && actor.testUserPermission(u, "OWNER"))).map(u => u.id);
export const card = (content, actor, extra = {}) => ChatMessage.create({ content: `<div class="sr2e-damage-result">${content}</div>`,
  speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperTo(actor), ...extra });

/** Both decks within the LEAST powerful device's range (p.68; Part 4a.3). An unknown distance counts as in range. */
async function inRange(a, b) {
  const { distanceBetween } = await import("./vehicle-sensors.mjs");
  const d = distanceBetween(RC.deckActor(a), RC.deckActor(b));
  if (d == null) return true;
  const range = (deck) => { const r = fluxRange(RC.deckFlux(deck)); return typeof r === "object" && r ? r.low : r; };
  const ra = range(a), rb = range(b);
  if (ra == null || rb == null) return false;
  return d <= Math.min(ra, rb);
}

function loadPair(intruderDeckUuid, targetDeckUuid, user) {
  const intruder = fromUuidSync(intruderDeckUuid);
  if (!intruder || !RC.isRcDeck(intruder) || !RC.mayRun(user, intruder)) throw new Error("not your deck");   // a taken network answers to its taker (5b.4)
  const target = fromUuidSync(targetDeckUuid);
  if (!target || !RC.isRcDeck(target) || target === intruder) throw new Error("choose another network's deck");
  if (RC.isCcss(target) || RC.isCcss(intruder)) throw new Error(RC.CCSS_HARDWIRED);
  const op = RC.netOf(intruder)?.operator ? fromUuidSync(RC.netOf(intruder).operator) : null;
  if (!op) throw new Error("connect your deck first: its operator makes the tests");
  return { intruder, target, op };
}

/* ── Ops ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

export function registerEw() {
  // 5b.1a: break the target's encryption before intercepting (p.69; R5-2). A failure alerts the target (+2 per failure).
  gmOp("ewDecrypt", ({ intruderDeckUuid, targetDeckUuid, messageId }, user) => RC.rcQueue(async () => {
    const { intruder, target, op } = loadPair(intruderDeckUuid, targetDeckUuid, user);
    const enc = moduleRating(target, "rc-encryption");
    if (!enc) throw new Error("that network isn't encrypted");
    const net = RC.freshNet(target);
    const test = checkCard(net, messageId, { kind: "decrypt", actor: op, maxDice: ewMaxDice(op) + moduleRating(intruder, "decryption"), minTn: EW.decryptTn(enc),
      bind: { freqGen: freqGen(net), target: target.uuid } });
    const ok = EW.decryptOk(await successesOf(test), num(target.system.rating));
    if (!ok) net.alert = num(net.alert) + 1;
    await RC.save(target, net);
    if (ok) await intruder.update({ [`flags.sr2e.ewDecrypted.${netKey(target)}`]: freqGen(net) });
    else await card(`Someone failed to break this network's encryption — they know you're there too (Rigger 2 p.69).`, fromUuidSync(net.operator ?? ""));
    return { ok };
  }));

  // 5b.1: Signal interception — successes = channels, the named ones first; the GM chooses the rest.
  gmOp("ewIntercept", ({ intruderDeckUuid, targetDeckUuid, messageId }, user) => RC.rcQueue(async () => {
    const { intruder, target, op } = loadPair(intruderDeckUuid, targetDeckUuid, user);
    const net = RC.freshNet(target);
    if (net.connection?.state !== "connected") throw new Error("that network isn't transmitting (its deck isn't connected)");
    if (!(await inRange(intruder, target))) throw new Error("out of range: both decks must be within the weaker device's range (Rigger 2 p.68)");
    const dec = intruder.flags?.sr2e?.ewDecrypted?.[netKey(target)];
    if (moduleRating(target, "rc-encryption") && (dec == null || num(dec) !== freqGen(net)))
      throw new Error("the network is encrypted: break it first (Rigger 2 p.69)");
    const test = checkCard(net, messageId, { kind: "intercept", actor: op, maxDice: num(intruder.system.rating),
      minTn: EW.interceptTn({ deckRating: num(target.system.rating), alert: net.alert }), bind: { freqGen: freqGen(net), target: target.uuid } });
    // The channels named BEFORE the roll, as recorded on its card (p.69; c5b1 r1 #7).
    const named = game.messages.get(messageId)?.flags?.sr2e?.ew?.named;
    const res = EW.interceptedChannels(await successesOf(test), Array.isArray(named) ? named : []);
    await RC.save(target, net);
    await intruder.update({ [`flags.sr2e.ewIntercepts.${netKey(target)}`]: { target: target.uuid, channels: res.channels, gmChooses: res.gmChooses, freqGen: freqGen(net), at: Date.now() } });
    if (res.gmChooses) await card(`GM: ${esc(op.name)} intercepted ${res.gmChooses} more channel${res.gmChooses === 1 ? "" : "s"} of ${esc(target.name)}'s network — choose which on their deck panel (Rigger 2 p.69).`, null, { whisper: ChatMessage.getWhisperRecipients("GM") });
    return res;
  }));
  gmOp("ewChooseChannels", ({ intruderDeckUuid, targetDeckUuid, channels = [] }, user) => RC.rcQueue(async () => {
    if (!user.isGM) throw new Error("GM only");
    const intruder = fromUuidSync(intruderDeckUuid), target = fromUuidSync(targetDeckUuid);
    const rec = interceptOf(intruder, target);
    if (!rec?.gmChooses) return rec;
    const add = [...new Set(channels)].filter(c => EW.CHANNELS.includes(c) && !rec.channels.includes(c)).slice(0, rec.gmChooses);
    await intruder.update({ [`flags.sr2e.ewIntercepts.${netKey(target)}`]: { ...rec, channels: [...rec.channels, ...add], gmChooses: rec.gmChooses - add.length } });
    return true;
  }));

  // Reading a channel (p.69): each read, the network rolls detection (deck rating dice vs the intruder's Electronic
  // Warfare); success alerts it and switches frequencies — every intercept of it is void.
  gmOp("ewRead", ({ intruderDeckUuid, targetDeckUuid, channel, vehicleUuid }, user) => RC.rcQueue(async () => {
    const { intruder, target, op } = loadPair(intruderDeckUuid, targetDeckUuid, user);
    const rec = interceptOf(intruder, target);
    if (!rec?.channels?.includes(channel)) throw new Error(`you haven't intercepted its ${channel} channel`);
    const net = RC.freshNet(target);
    // The system channel reports ONE drone's position, heading, ammunition and damage (p.69; c5b1 r1 #5).
    const drone = channel === "system" ? fromUuidSync(vehicleUuid ?? "") : null;
    if (channel === "system" && (drone?.type !== "vehicle" || !net.affiliated?.[RC.vKey(drone.uuid)])) throw new Error("choose one of that network's drones");
    const { SR2ESuccessRoll } = await import("./dice/sr2e-roll.mjs");
    // A captured system channel delivers its data to the intruder freely (p.70; 5b.0): no detection roll.
    const free = channel === "system" && channelAuthority(target, "system")?.actor === op;
    const det = free ? { successes: 0 } : await SR2ESuccessRoll.successTest(num(target.system.rating), Math.max(2, ewSkillDice(op)));
    const what = channel === "system" ? systemData(drone)
      : channel === "command" ? Object.entries(net.standingOrders ?? {}).map(([, o]) => `“${esc(o.text)}”`).join("; ") || "no orders on record"
      : "what the drones sense (the GM describes it)";
    if (det.successes > 0) { net.alert = num(net.alert) + 1; net.freqGen = freqGen(net) + 1; delete net.channelAuthority; }   // every intercept and authority ends
    await RC.save(target, net);
    await card(`${esc(op.name)} reads ${esc(target.name)}'s ${channel} channel: ${what} (Rigger 2 p.69).`, op);
    if (!free) await card(`${esc(target.name)}'s network: detection ${det.successes} success${det.successes === 1 ? "" : "es"} vs TN ${Math.max(2, ewSkillDice(op))}${det.successes > 0 ? " — someone is listening: frequencies switched (every intercept is lost)." : "."}`,
      fromUuidSync(net.operator ?? ""));
    return { detected: det.successes > 0 };
  }));

  // 5b.2: a MIJI exchange — the intruder opens it; both sides roll; it resolves once both are recorded.
  gmOp("ewMijiStart", ({ op: kind, intruderDeckUuid, targetDeckUuid, channel }, user) => RC.rcQueue(async () => {
    const { intruder, target, op } = loadPair(intruderDeckUuid, targetDeckUuid, user);
    if (kind === "interference") throw new Error("interference is a contest: use Interfere on the deck panel (Rigger 2 p.72)");
    if (!EW.OP_CHANNELS[kind]?.includes(channel)) throw new Error(`${kind} can't hit the ${channel} channel (Rigger 2 p.70–72)`);
    if (!interceptOf(intruder, target)?.channels?.includes(channel)) throw new Error(`intercept its ${channel} channel first (Rigger 2 p.69)`);
    const net = RC.freshNet(target);
    if (net.connection?.state !== "connected") throw new Error("that network isn't transmitting");
    const pe = moduleRating(intruder, "protocol-emulation"), ecm = await ecmOf(intruder);
    if (kind === "jamming" ? !ecm : !pe) throw new Error(kind === "jamming" ? "jamming needs an ECM suite on the deck's vehicle (Rigger 2 p.71)" : "this needs a protocol emulation module on your deck (Rigger 2 p.70)");
    const tns = EW.mijiTns({ op: kind, targetDeckRating: num(target.system.rating), alert: net.alert, protocolEmulation: pe, ecm });
    const aid = foundry.utils.randomID(16);
    net.ew ??= {};
    net.ew[aid] = { op: kind, channel, intruderDeck: intruder.uuid, intruderOp: op.uuid, attackerRating: Math.max(num(intruder.system.rating), ecm),
      protocolEmulation: pe, freqGen: freqGen(net), stamp: mijiStamp(net, intruder), tns, intruderFlux: kind === "jamming" ? Math.ceil(ecm * 1.5) : RC.deckFlux(intruder),
      defenderFlux: RC.deckFlux(target), state: "open", at: Date.now() };
    await RC.save(target, net);
    const defender = fromUuidSync(net.operator ?? "");
    await card(`<strong>${esc(kind[0].toUpperCase() + kind.slice(1))}</strong> on ${esc(target.name)}'s ${channel} channel (Rigger 2 p.69–72). Resist: roll the deck's Flux (${RC.deckFlux(target)}) vs TN ${tns.defender}, + Task Pool.
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-ew-resist">Resist</button></div>`, defender,
      { flags: { sr2e: { ewResist: { targetDeckUuid: target.uuid, aid } } } });
    return { aid, tns };
  }));
  gmOp("ewMijiRoll", ({ targetDeckUuid, aid, side, messageId }, user) => RC.rcQueue(async () => {
    const target = fromUuidSync(targetDeckUuid), net = RC.freshNet(target), x = net.ew?.[aid];
    if (!x || x.state !== "open") throw new Error("that exchange is over");
    const actor = fromUuidSync(side === "intruder" ? x.intruderOp : net.operator ?? "");
    if (!actor || !(user.isGM || actor.testUserPermission(user, "OWNER"))) throw new Error("not your side of the exchange");
    if (x[side]) throw new Error("already rolled");
    if (!stampOk(net, x)) { x.state = "void"; await RC.save(target, net); return { void: true }; }
    const test = checkCard(net, messageId, { kind: "miji", actor, maxDice: side === "intruder" ? x.intruderFlux : x.defenderFlux,
      minTn: side === "intruder" ? x.tns.intruder : x.tns.defender, bind: { aid, side } });
    x[side] = { successes: await successesOf(test), messageId };
    const done = await settleMiji(target, net, aid);
    return done ?? { waiting: true };
  }));
  // The GM closes an exchange the rigger won't resist (0 successes on their side).
  gmOp("ewMijiResolve", ({ targetDeckUuid, aid }, user) => RC.rcQueue(async () => {
    if (!user.isGM) throw new Error("GM only");
    const target = fromUuidSync(targetDeckUuid), net = RC.freshNet(target), x = net.ew?.[aid];
    if (!x || x.state !== "open" || !x.intruder) throw new Error("the intruder hasn't rolled");
    x.defender ??= { successes: 0, messageId: "" };
    return settleMiji(target, net, aid);
  }));

  // A captured command channel (p.70; 5b.0): the intruder commands the network's drones with their own deck and skills;
  // the drone's Comprehension Test as usual. Re-validated here, in rc-control, at commit.
  gmOp("ewCommand", ({ intruderDeckUuid, targetDeckUuid, vehicleUuid, text = "", messageId }, user) => RC.rcQueue(async () => {
    const { target, op } = loadPair(intruderDeckUuid, targetDeckUuid, user);
    const auth = channelAuthority(target, "command");
    if (auth?.actor !== op) throw new Error("you don't hold their command channel (fill it with meaconing or intrusion, Rigger 2 p.70)");
    const v = fromUuidSync(vehicleUuid), net = RC.freshNet(target), k = RC.vKey(vehicleUuid);
    if (v?.type !== "vehicle" || !net.affiliated?.[k]) throw new Error("that drone isn't on their network");
    // The same live eligibility as the owner's command (c5b1 r1 #4): the drone the owner is jumped into is directly
    // controlled; a drone out of the network's range acts on its last order.
    if (net.primary === k) throw new Error("its rigger is jumped into it: it takes no network commands (Rigger 2 p.65)");
    if (!(await RC.reachable(target, v))) throw new Error(`${v.name} is out of the network's range (Rigger 2 p.64)`);
    const msg = game.messages.get(messageId), test = msg?.flags?.sr2e?.test, cmd = msg?.flags?.sr2e?.rcCommand;
    if (!test || cmd?.deckUuid !== target.uuid || test.actorUuid !== v.uuid || (cmd.vehicleUuids ?? []).join() !== v.uuid)
      throw new Error("that isn't this drone's Comprehension Test card");
    if (String(cmd.authEvent ?? "") !== String(auth.auth.eventId) || num(cmd.freqGen) !== freqGen(net))
      throw new Error("that card was rolled under an earlier hold on the channel: not counted");
    // Bound to the drone's order as it stood at the roll (c5b1 r2 #3): an older card can't overwrite a newer order.
    if (num(cmd.orderRev) !== num(net.standingOrders?.[k]?.rev)) throw new Error("the drone's orders changed since that roll: not counted");
    // The card's own table TN + the modifiers as they stand NOW (c5b1 r3 #1): a card rolled before the intruder jumped
    // into a drone is short of the +2 and refused.
    const tableTn = Math.max(SKILL_SUCCESS_TABLE[0].tn, num(cmd.tableTn) || SKILL_SUCCESS_TABLE[0].tn);
    const t = commandTest(op, target, v, tableTn);
    if ((test.dice ?? []).filter(d => d.sourceKey === "base").length > t.dice || (test.dice ?? []).some(d => d.sourceKey === "misc")
      || test.baseTn == null || num(test.baseTn) < t.tn)
      throw new Error(`that Comprehension Test wasn't rolled as the rules say: at most ${t.dice} dice vs TN ${t.tn} or more`);
    RC.useCard(net, messageId);
    const successes = await successesOf(test);
    net.standingOrders[k] = { text: String(text).slice(0, 200), successes, obeyed: successes >= 1, messageId, rev: num(net.rev) + 1, by: op.uuid };
    await RC.save(target, net);
    return { successes };
  }));

  // 5b.5: regenerate — ECCM rating dice vs that intruder's deck/ECM rating + 3; every 2 successes clear one of ITS boxes.
  gmOp("ewRegen", ({ deckUuid, channel, attackerKey, messageId }, user) => RC.rcQueue(async () => {
    const deck = ownDeck(deckUuid, user), net = RC.freshNet(deck), op = fromUuidSync(net.operator ?? "");
    const m = net.monitors?.[channel];
    const mine = Object.values(m?.entries ?? {}).filter(e => e.attackerKey === attackerKey && num(e.boxes) > 0);
    if (!mine.length) throw new Error("that intruder has no boxes on this channel");
    const rating = Math.max(...mine.map(e => num(e.attackerRating)));
    const eccm = moduleRating(deck, "rc-eccm");
    if (!eccm) throw new Error("regenerating needs an ECCM module on the deck (Rigger 2 p.72)");
    const test = checkCard(net, messageId, { kind: "regen", actor: op, maxDice: eccm, minTn: EW.regenTn({ deckRating: rating }) });
    const before = EW.channelBoxes(m);
    const cut = EW.regenerate(m, attackerKey, EW.regenBoxes(await successesOf(test)));
    for (const [id, b] of Object.entries(cut)) { if (b > 0) m.entries[id].boxes = b; else delete m.entries[id]; }
    await RC.save(deck, net);
    return { cleared: before - EW.channelBoxes(m) };
  }));

  // 5b.6: reconnect a lost carrier — Control Systems vs TN 4 + the channel's band + damage; successes > filled boxes.
  gmOp("ewReconnect", ({ deckUuid, channel, messageId }, user) => RC.rcQueue(async () => {
    const deck = ownDeck(deckUuid, user), net = RC.freshNet(deck), op = fromUuidSync(net.operator ?? "");
    if (!carrierLost(net, channel)) throw new Error("that carrier isn't lost");
    const boxes = channelBoxesOf(net, channel);
    if (!EW.reconnectAllowed(boxes)) throw new Error("clear at least one box first (regenerate, Rigger 2 p.72)");
    const test = checkCard(net, messageId, { kind: "reconnect", actor: op, maxDice: controlSystemsMaxDice(op),
      minTn: EW.reconnectTn({ boxes, damageMod: op?.system?.woundPenalty ?? 0 }) });
    const ok = EW.reconnectOk(await successesOf(test), boxes);
    if (ok) { delete net.carriers[channel]; if (net.channelAuthority) delete net.channelAuthority[channel]; }   // the intruder's authority ends (5b.0)
    await RC.save(deck, net);
    return { ok };
  }));

  // An intrusion's bogus object, blocked with ECCM (R5-6, p.31): ECCM rating vs the intruder's protocol emulation;
  // the intruder's protocol emulation vs the ECCM (rolled here); net successes cancel the intrusion's, cumulatively.
  gmOp("ewBlock", ({ deckUuid, eid, messageId }, user) => RC.rcQueue(async () => {
    const deck = ownDeck(deckUuid, user), net = RC.freshNet(deck), op = fromUuidSync(net.operator ?? "");
    const b = net.bogus?.[eid];
    if (!b) throw new Error("no such bogus object");
    const eccm = moduleRating(deck, "rc-eccm");
    if (!eccm) throw new Error("blocking an intrusion needs an ECCM module (Rigger 2 p.71, p.31)");
    const test = checkCard(net, messageId, { kind: "block", actor: op, maxDice: eccm, minTn: num(b.protocolEmulation) });
    const { SR2ESuccessRoll } = await import("./dice/sr2e-roll.mjs");
    const pe = await SR2ESuccessRoll.successTest(num(b.protocolEmulation), Math.max(2, eccm));
    b.cancelled = num(b.cancelled) + Math.max(0, (await successesOf(test)) - pe.successes);
    const ended = b.cancelled >= num(b.net);
    if (ended) delete net.bogus[eid];
    await RC.save(deck, net);
    return { cancelled: b.cancelled, ended };
  }));
}

/** The dependency stamp of an open MIJI exchange (plan 5b.0/5b.2; c5b1 r1 #3): who holds each side and the TN inputs. */
function mijiStamp(net, intruderDeck) {
  const inet = RC.netOf(intruderDeck);
  return { op: net.operator ?? "", conn: num(net.connection?.gen), alert: num(net.alert), freqGen: freqGen(net),
    iconn: num(inet?.connection?.gen), iop: inet?.operator ?? "" };
}
const stampOk = (net, x) => !!x.stamp && JSON.stringify(mijiStamp(net, fromUuidSync(x.intruderDeck ?? ""))) === JSON.stringify(x.stamp);

/**
 * The Comprehension Test an intruder makes through a captured command channel (p.66, p.70): the drone's Pilot + the
 * intruder's Non-Matrix Programming; +2 TN while the intruder is jumped into a drone of their own (p.65); the target
 * network's command jamming (5b.3).
 */
export function commandTest(op, targetDeck, v, tableTn) {
  return comprehensionTest({ pilot: v.system.effective?.pilot ?? v.system.pilot ?? 0, specDice: RC.nmpDice(op), tableTn,
    jumpedCommandingSecondary: !!RC.primaryOf(op.uuid), degradation: netTestMod(targetDeck, "comprehension", ["command"]) });
}

/** One drone's system-channel data (p.69): position, heading, ammunition, damage. */
function systemData(v) {
  const tok = v.token ?? v.getActiveTokens?.()?.[0]?.document ?? null;
  const pos = tok ? `at (${Math.round(tok.x / (tok.parent?.grid?.size || 100))}, ${Math.round(tok.y / (tok.parent?.grid?.size || 100))}) on ${esc(tok.parent?.name ?? "the scene")}, heading ${Math.round(num(tok.rotation))}°` : "position unknown (no token)";
  const ammo = (v.items ?? []).filter(i => i.type === "weapon" && num(i.system.ammo?.max) > 0)
    .map(i => `${esc(i.name)} ${num(i.system.ammo.current)}/${num(i.system.ammo.max)}`).join(", ") || "no ammunition-fed weapons";
  return `${esc(v.name)} ${pos}; ammunition: ${ammo}; damage ${v.system.conditionMonitor?.value ?? 0}/${v.system.conditionMonitor?.max ?? 10}`;
}

function ownDeck(deckUuid, user) {
  const deck = fromUuidSync(deckUuid);
  if (!deck || !RC.isRcDeck(deck)) throw new Error("not a remote-control deck");
  if (RC.isCcss(deck)) throw new Error(RC.CCSS_HARDWIRED);
  if (!RC.mayRun(user, deck)) throw new Error("not your deck");   // a taken network answers to its taker (5b.4)
  if (!RC.netOf(deck)?.operator) throw new Error("connect the deck first");
  return deck;
}

/**
 * Settle a MIJI exchange once both sides have rolled (in `rc-control`): void if the frequencies changed since it opened;
 * else the intruder's net successes go on the channel (capped); an intrusion leaves a bogus object; a full channel loses
 * its carrier, and a full simsense channel while jumped into a drone dumps the operator (p.72; 5a.6).
 */
async function settleMiji(target, net, aid) {
  const x = net.ew[aid];
  if (!x.intruder || !x.defender) { await RC.save(target, net); return null; }
  if (num(x.freqGen) !== freqGen(net) || !stampOk(net, x)) { x.state = "void"; await RC.save(target, net); return { void: true }; }
  const m = (net.monitors ??= {})[x.channel] ??= { entries: {} };
  const before = EW.channelBoxes(m);
  const boxes = EW.appliedBoxes(m, EW.mijiNet(x.intruder.successes, x.defender.successes));
  if (boxes > 0) m.entries[aid] = { op: x.op, attackerKey: x.intruderDeck, attackerRating: x.attackerRating, boxes, at: Date.now() };
  if (boxes > 0 && x.op === "intrusion") (net.bogus ??= {})[aid] = { channel: x.channel, net: boxes, cancelled: 0, attackerKey: x.intruderDeck,
    protocolEmulation: x.protocolEmulation, at: Date.now() };
  x.state = "done"; x.boxes = boxes;
  // Only THIS exchange taking the channel from below 10 to 10 fills it (c5b1 r1 #1): a zero-box result on an already
  // full channel takes nothing from the intruder who filled it.
  const full = boxes > 0 && before < EW.SIGNAL_BOXES && EW.channelBoxes(m) >= EW.SIGNAL_BOXES;
  let dumpOf = null;
  if (full) {
    (net.carriers ??= {})[x.channel] = "lost";
    // Meaconing or intrusion that fills the channel hands its operations to the intruder (p.70; 5b.0). Jamming's own
    // 10-box effects stand instead (specific over general).
    if (x.op === "meaconing" || x.op === "intrusion")
      (net.channelAuthority ??= {})[x.channel] = { deckUuid: x.intruderDeck, operator: x.intruderOp, eventId: aid, freqGen: freqGen(net),
        connGen: num(x.stamp?.iconn), at: Date.now() };
    const operator = fromUuidSync(net.operator ?? "");
    if (x.channel === "simsense" && net.primary && operator) {
      const { pendDump } = await import("./rig-dump.mjs");
      dumpOf = { operator, eid: await pendDump(operator, { cause: "simsense-lost", deck: target }) };
      net.primary = null;
    }
  }
  await RC.save(target, net);
  if (dumpOf) {
    const { reconcileDumps } = await import("./rig-dump.mjs");
    await dumpOf.operator.update({ [`flags.sr2e.rigDumps.${dumpOf.eid}.state`]: "open" });
    await reconcileDumps(dumpOf.operator);
  }
  await card(`${esc(x.op[0].toUpperCase() + x.op.slice(1))} on ${esc(target.name)}'s ${x.channel} channel: ${x.intruder.successes} vs ${x.defender.successes} — ${boxes ? `${boxes} box${boxes === 1 ? "" : "es"} (${EW.channelBoxes(m)}/10)` : "no effect"}${full ? `; the ${x.channel} carrier is LOST${dumpOf ? " and the jumped-in rigger is dumped" : ""}` : ""}.`,
    fromUuidSync(net.operator ?? ""));
  return { boxes, full };
}

/* ── Client: roll a step's card, then send it ────────────────────────────────────────────────────────────────── */

/** Ask for Task Pool dice (≤ Electronics), roll the card with its EW flag, return the message id (null = cancelled). */
export async function rollEwCard(actor, { kind, dice, tn, label, extra = {} }) {
  const cap = Math.min(taskCap(actor), actor?.system?.dicePools?.task?.value ?? 0);
  let task = 0;
  if (cap > 0) {
    task = await foundry.applications.api.DialogV2.prompt({ window: { title: label },
      content: `<div class="form-group"><label>Task Pool dice (max ${cap}; Rigger 2 p.16)</label><input type="number" name="n" value="0" min="0" max="${cap}" style="width:52px"></div>`,
      ok: { label: "Roll", callback: (_e, b) => Math.min(cap, Math.max(0, Number(b.form.elements.n.value) || 0)) }, rejectClose: false }).catch(() => null);
    if (task == null) return null;
  }
  const res = await actor.rollSuccessTest(dice, tn, { label, poolDice: task ? { task } : {}, tnContext: { kind: "skill", key: "electronics", skillCategory: "active", electronic: true },
    flags: { sr2e: { ew: { kind, ...extra } } } });
  return res?.testMessageId ?? null;
}

/** The resist button on a MIJI card: the defending operator rolls their deck's Flux. */
export function bindEwCard(message, html) {
  const r = message.flags?.sr2e?.ewResist;
  if (!r) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  root?.querySelector(".sr2e-ew-resist")?.addEventListener("click", async () => {
    try {
      const target = fromUuidSync(r.targetDeckUuid), x = RC.netOf(target)?.ew?.[r.aid];
      const op = fromUuidSync(RC.netOf(target)?.operator ?? "");
      if (!x || x.state !== "open" || x.defender) return ui.notifications.info("That exchange is already settled.");
      if (!op?.isOwner) return ui.notifications.warn("Only the network's operator resists.");
      const id = await rollEwCard(op, { kind: "miji", dice: x.defenderFlux, tn: x.tns.defender, label: `Resist ${x.op} (${x.channel}; Rigger 2 p.70–72)`,
        extra: { aid: r.aid, side: "defender" } });
      if (id) await gmCall("ewMijiRoll", { targetDeckUuid: target.uuid, aid: r.aid, side: "defender", messageId: id });
    } catch (err) { ui.notifications.warn(err.message); }
  });
}
