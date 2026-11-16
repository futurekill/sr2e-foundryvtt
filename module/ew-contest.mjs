/**
 * Interference contests — Part 5b.4 (Rigger 2 p.72; docs/PLAN-vehicles-phase2.md 5b.4). A rigger with a protocol
 * emulation module fights for another network through its system channel; each opposed exchange puts the LOSER's net
 * successes as boxes on its OWN system channel; 10 boxes (or the other side exiting) hands the loser's network to the
 * winner.
 *
 * ONE authoritative journal: the hidden world setting `sr2e.rcContests` = { <cid>: contest }, written only by the active
 * GM inside `rc-control`. Every effect on a deck is a numbered journal STEP ({ decks: { <deckUuid>: { ops, snap } },
 * dumps }) written to the journal FIRST, then applied to each deck with that deck's receipt
 * (`rcNet.contestApplied.<cid>.<n>`) in the same deck update. `recover()` (run before every `rc-control` op) re-applies
 * any step a deck lacks; while one is unapplied, control reads use the step's `snap` (the journal's committed state).
 * Ops carry ABSOLUTE values computed when journalled, so a replay is idempotent.
 */
import { gmOp, gmCall } from "./vehicle-play.mjs";
import * as RC from "./rc-net.mjs";
import * as EW from "./rules/ew-rules.mjs";
import { checkCard, card, moduleRating, interceptOf, rollEwCard } from "./ew.mjs";

export const KEY = "rcContests";
const num = (n) => Number(n) || 0;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export function registerContestSetting() {
  game.settings.register("sr2e", KEY, { scope: "world", config: false, type: Object, default: {} });
}
const journal = () => foundry.utils.deepClone(game.settings.get("sr2e", KEY) ?? {});   // writers: a working copy
const peek = () => game.settings.get("sr2e", KEY) ?? {};   // readers (control reads run often): never mutate it
async function saveJournal(j) { await game.settings.set("sr2e", KEY, j); RC.invalidateIndex(); }

const live = (c) => c?.state === "open";
const sideOf = (c, deckUuid) => (c.a === deckUuid ? "a" : c.b === deckUuid ? "b" : null);
const otherOf = (c, deckUuid) => (c.a === deckUuid ? c.b : c.a);
export const contestsOf = (deckUuid, j = peek()) => Object.values(j).filter(c => c.a === deckUuid || c.b === deckUuid);
/** The live contest between two decks, either way round. */
export const contestBetween = (x, y, j = peek()) => Object.values(j).find(c => live(c) && ((c.a === x && c.b === y) || (c.a === y && c.b === x))) ?? null;

/* ── Steps: journal first, then each deck with its receipt ─────────────────────────────────────────────────────── */

const applied = (deck, cid, n) => !!RC.netOf(deck)?.contestApplied?.[cid]?.[n];
const unsetPath = (o, path) => { const ks = path.split("."); const last = ks.pop(); const p = ks.reduce((x, k) => x?.[k], o); if (p) delete p[last]; };
/** The control fields a step leaves on a deck (what reads see while it's unapplied). */
const snapOf = (net) => ({ operator: net.operator ?? null, connection: { ...(net.connection ?? {}) }, primary: net.primary ?? null });

/**
 * One journal write's working state: a deck's record AFTER the steps already built in this write, so a second step on the
 * same deck (a takeover then a void, two contests on one deck) starts from the first one's result, not the stale deck
 * (c5b4 r1 #3). Every op runs inside `rc-control`, one at a time, so a module-level map is safe.
 */
let WORK = null;
const withWork = async (fn) => { WORK = new Map(); try { return await fn(); } finally { WORK = null; } };
let SEQ = 0;
const nextSeq = () => Date.now() * 1000 + (SEQ = (SEQ + 1) % 1000);   // journal order across contests (one GM writer)

/**
 * Build a step from per-deck edits: `edits` = { <deckUuid>: (net) => void } run on a COPY of the deck's record as this
 * write has left it, from which the absolute ops and the after-snapshot are taken.
 */
function makeStep(c, kind, edits, dumps = []) {
  const n = (c.steps ?? []).length;
  const decks = {};
  for (const [uuid, edit] of Object.entries(edits)) {
    const deck = fromUuidSync(uuid);
    if (!deck) continue;
    const base = WORK?.get(uuid) ?? RC.freshNet(deck);
    const before = foundry.utils.deepClone(base), after = foundry.utils.deepClone(base);
    edit(after);
    WORK?.set(uuid, after);
    const ops = [];
    for (const path of ["operator", "connection", "primary", "contests", "carriers", "channelAuthority", "takenBy", "monitors.system"]) {
      const b = foundry.utils.getProperty(before, path), a = foundry.utils.getProperty(after, path);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      ops.push(a === undefined ? { path, del: true } : { path, value: foundry.utils.deepClone(a) });
    }
    decks[uuid] = { ops, snap: snapOf(after) };
  }
  const step = { n, kind, at: Date.now(), seq: nextSeq(), decks, dumps };
  (c.steps ??= []).push(step);
  c.rev = num(c.rev) + 1;
  return step;
}

async function applyStep(c, step) {
  for (const [uuid, d] of Object.entries(step.decks ?? {})) {
    const deck = fromUuidSync(uuid);
    if (!deck || applied(deck, c.id, step.n)) continue;   // a deleted deck has nothing to apply
    const net = RC.freshNet(deck);
    for (const op of d.ops) op.del ? unsetPath(net, op.path) : foundry.utils.setProperty(net, op.path, foundry.utils.deepClone(op.value));
    foundry.utils.setProperty(net, `contestApplied.${c.id}.${step.n}`, true);
    await RC.save(deck, net);
  }
  // A force-ejected operator who was jumped in is dumped (5a.6), once: the dump's id is the journal's. Resumed by its
  // STATE, so a crash between recording it and opening it still publishes it (c5b4 r1 #2).
  for (const dm of step.dumps ?? []) {
    const actor = fromUuidSync(dm.actor);
    if (!actor || !dumpUnfinished(actor, dm)) continue;
    const { pendDump, reconcileDumps } = await import("./rig-dump.mjs");
    if (!actor.flags?.sr2e?.rigDumps?.[dm.eid]) await pendDump(actor, { cause: "contest-lost", deck: fromUuidSync(dm.deck), eid: dm.eid });
    if (actor.flags.sr2e.rigDumps[dm.eid].state === "pending") await actor.update({ [`flags.sr2e.rigDumps.${dm.eid}.state`]: "open" });
    await reconcileDumps(actor);
  }
}
const dumpUnfinished = (actor, dm) => { const d = actor?.flags?.sr2e?.rigDumps?.[dm.eid]; return !d || d.state === "pending"; };

/** Every step with something left to apply, in journal order across contests. */
function pendingSteps(j) {
  const out = [];
  for (const c of Object.values(j)) for (const st of c.steps ?? []) {
    const missing = Object.keys(st.decks ?? {}).some(u => { const d = fromUuidSync(u); return d && !applied(d, c.id, st.n); });
    const dumpLeft = (st.dumps ?? []).some(dm => { const a = fromUuidSync(dm.actor); return a && dumpUnfinished(a, dm); });
    if (missing || dumpLeft) out.push([c, st]);
  }
  return out.sort((x, y) => num(x[1].seq ?? x[1].at) - num(y[1].seq ?? y[1].at));
}
/** Apply, in journal order, every step something still lacks. */
async function applyPending(j) { for (const [c, st] of pendingSteps(j)) await applyStep(c, st); }

/** Is any journal step still unapplied to this deck? */
function pendingStep(deck, j = peek()) {
  let best = null;
  for (const c of contestsOf(deck?.uuid, j)) for (const st of c.steps ?? [])
    if (st.decks?.[deck.uuid] && !applied(deck, c.id, st.n) && (!best || num(st.seq ?? st.at) >= num(best.seq ?? best.at))) best = st;
  return best;
}

/** Re-apply every journal step a deck lacks (idempotent by receipt). Runs before every `rc-control` op. */
export async function recover() { await applyPending(journal()); }

/** Control reads while a step is unapplied: the network as the journal committed it (5b.4 "Reads too"). */
export function view(deck) {
  const net = RC.netOf(deck);
  if (!net?.contests?.length) return net;   // a journal step always adds the contest id first and removes it last
  const st = pendingStep(deck);
  return st ? { ...net, ...st.decks[deck.uuid].snap } : net;
}

/* ── Ending and taking ────────────────────────────────────────────────────────────────────────────────────────── */

const dropContest = (cid) => (net) => { net.contests = (net.contests ?? []).filter(x => x !== cid); };

/** End a contest with no takeover (withdrawn or void): one step removing it from both decks. */
function endStep(c, state) {
  c.state = state;
  return makeStep(c, state, { [c.a]: dropContest(c.id), [c.b]: dropContest(c.id) });
}

/**
 * Taken (p.72): the loser's network gets the winner as its connected operator — deck, subscribers, affiliations and
 * recorded degradation unchanged, the system carrier re-established for the winner (boxes stay), primary cleared (the
 * winner starts in the captain's chair); a loser jumped into a drone is dumped. Every OTHER live contest of either deck
 * is void in the same journal write.
 */
function takeStep(j, c, winnerDeck, loserDeck) {
  const cur = (u) => WORK?.get(u) ?? RC.netOf(fromUuidSync(u));   // as this write has left them
  const wNet = cur(winnerDeck), lNet = cur(loserDeck);
  const winnerOp = wNet?.operator ?? null, loserOp = lNet?.operator ?? null;
  c.state = "taken"; c.winner = winnerDeck; c.loser = loserDeck;
  const dumps = loserOp && lNet?.primary && lNet?.connection?.state === "connected"
    ? [{ actor: loserOp, eid: `contest${c.id}`.slice(0, 16), deck: loserDeck }] : [];
  makeStep(c, "taken", {
    [loserDeck]: (net) => {
      dropContest(c.id)(net);
      net.operator = winnerOp; net.connection = { state: "connected", gen: num(net.connection?.gen) + 1 }; net.primary = null;
      if (net.carriers) delete net.carriers.system;
      delete net.channelAuthority;
      net.takenBy = { cid: c.id, operator: winnerOp, at: Date.now() };   // only the taker (or the GM) runs it now
    },
    [winnerDeck]: dropContest(c.id)
  }, dumps);
  for (const o of Object.values(j)) if (o !== c && live(o) && [o.a, o.b].some(u => u === winnerDeck || u === loserDeck)) endStep(o, "void");
}


/**
 * A deck's control changes (rc-net hooks, inside `rc-control`): an EXIT from a live contest hands this network to the
 * side that stays (connected) — then the caller's own disconnect is skipped; otherwise (the other side is gone too)
 * the contest is withdrawn. A TRANSFER (new operator) or REMOVAL voids every live contest of the deck.
 */
export const onControlChange = (deck, kind) => withWork(async () => {
  const j = journal(), mine = contestsOf(deck.uuid, j).filter(live);
  if (!mine.length) return { handled: false };
  let handled = false;
  for (const c of mine) {
    if (!live(c)) continue;   // voided by an earlier takeover in this same pass
    const other = otherOf(c, deck.uuid), oNet = RC.netOf(fromUuidSync(other) ?? null);
    if (kind === "exit" && oNet?.connection?.state === "connected" && oNet.operator) {
      takeStep(j, c, other, deck.uuid);
      handled = true;
    } else endStep(c, kind === "exit" ? "withdrawn" : "void");
  }
  await saveJournal(j);
  await applyPending(j);
  return { handled };
});

/* ── The exchange ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** Both networks' operators and connection generations (an exchange is bound to them and to the contest rev). */
function stampOf(c) {
  const a = RC.netOf(fromUuidSync(c.a)), b = RC.netOf(fromUuidSync(c.b));
  return JSON.stringify([a?.operator ?? "", num(a?.connection?.gen), b?.operator ?? "", num(b?.connection?.gen)]);
}

export function registerContest() {
  RC.setContestHooks({ view, recover, onControlChange });

  // Start (or continue) a contest: the initiator's Complex Action. Opening one needs a live intercept of the target's
  // system channel (5b.2); later exchanges either side may start (p.72). Interference uses protocol emulation (p.72).
  gmOp("ewContestStart", ({ intruderDeckUuid, targetDeckUuid }, user) => RC.rcQueue(() => withWork(async () => {
    const intruder = fromUuidSync(intruderDeckUuid), target = fromUuidSync(targetDeckUuid);
    if (!intruder || !RC.isRcDeck(intruder) || !RC.mayRun(user, intruder)) throw new Error("not your deck");
    if (!target || !RC.isRcDeck(target) || target === intruder) throw new Error("choose another network's deck");
    const iNet = RC.netOf(intruder), tNet = RC.netOf(target);
    if (iNet?.connection?.state !== "connected" || !iNet.operator) throw new Error("connect your deck first: its operator makes the tests");
    if (tNet?.connection?.state !== "connected") throw new Error("that network isn't transmitting");
    const pe = moduleRating(intruder, "protocol-emulation");
    if (!pe) throw new Error("interference needs a protocol emulation module on your deck (Rigger 2 p.72)");
    const j = journal();
    let c = contestBetween(intruder.uuid, target.uuid, j);
    if (!c) {
      if (!interceptOf(intruder, target)?.channels?.includes("system")) throw new Error("intercept its system channel first (Rigger 2 p.69, p.72)");
      const cid = foundry.utils.randomID(16);
      c = j[cid] = { id: cid, a: intruder.uuid, b: target.uuid, state: "open", rev: 0, exchanges: {}, usedCards: {}, steps: [], at: Date.now() };
      makeStep(c, "create", { [c.a]: (n) => { n.contests = [...new Set([...(n.contests ?? []), cid])]; },
                              [c.b]: (n) => { n.contests = [...new Set([...(n.contests ?? []), cid])]; } });
    }
    const op = fromUuidSync(iNet.operator), defOp = fromUuidSync(tNet.operator ?? "");
    const tns = EW.mijiTns({ op: "interference", targetDeckRating: num(target.system.rating), alert: tNet.alert, protocolEmulation: pe });
    const xid = foundry.utils.randomID(16);
    c.exchanges[xid] = { initiator: intruder.uuid, target: target.uuid, iop: op.uuid, top: tNet.operator ?? "", tns,
      iflux: RC.deckFlux(intruder), tflux: RC.deckFlux(target), pe, rev: c.rev, stamp: stampOf(c), state: "open", at: Date.now() };
    await saveJournal(j);
    await applyPending(j);
    await card(`<strong>Interference</strong> on ${esc(target.name)}'s network: ${esc(op.name)} is fighting for it (Rigger 2 p.72). Resist: roll the deck's Flux (${RC.deckFlux(target)}) vs TN ${tns.defender}, + Task Pool.
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-contest-resist">Resist</button></div>`, defOp,
      { flags: { sr2e: { ewContestResist: { cid: c.id, xid } } } });
    return { cid: c.id, xid, tns };
  })));

  gmOp("ewContestRoll", ({ cid, xid, side, messageId }, user) => RC.rcQueue(async () => {
    const j = journal(), c = j[cid], x = c?.exchanges?.[xid];
    if (!live(c) || !x || x.state !== "open") throw new Error("that exchange is over");
    const actor = fromUuidSync(side === "intruder" ? x.iop : x.top);
    if (!actor || !(user.isGM || actor.testUserPermission(user, "OWNER"))) throw new Error("not your side of the exchange");
    if (x[side]) throw new Error("already rolled");
    if (x.rev !== c.rev || x.stamp !== stampOf(c)) { x.state = "void"; await saveJournal(j); return { void: true }; }
    const test = checkCard(c, messageId, { kind: "contest", actor, maxDice: side === "intruder" ? x.iflux : x.tflux,
      minTn: side === "intruder" ? x.tns.intruder : x.tns.defender, bind: { cid, xid, side } });
    const { testTotalSuccesses } = await import("./rules/sr2e-rules.mjs");
    x[side] = { successes: testTotalSuccesses(test), messageId };
    return withWork(() => settle(j, c, xid));
  }));

  // The GM closes an exchange the other side won't resist (0 successes on its side).
  gmOp("ewContestResolve", ({ cid, xid }, user) => RC.rcQueue(async () => {
    if (!user.isGM) throw new Error("GM only");
    const j = journal(), c = j[cid], x = c?.exchanges?.[xid];
    if (!live(c) || !x || x.state !== "open" || !x.intruder) throw new Error("the initiator hasn't rolled");
    x.defender ??= { successes: 0, messageId: "" };
    return withWork(() => settle(j, c, xid));
  }));
}

/**
 * Settle an exchange once both sides are recorded (in `rc-control`): void if the contest moved on (rev) or either side's
 * operator/connection changed; else the LOSER takes the net successes as boxes on its own system channel (capped);
 * filling it to 10 is a takeover by the winner.
 */
async function settle(j, c, xid) {
  const x = c.exchanges[xid];
  if (!x.intruder || !x.defender) { await saveJournal(j); return { waiting: true }; }
  if (x.rev !== c.rev || x.stamp !== stampOf(c)) { x.state = "void"; await saveJournal(j); return { void: true }; }
  const i = num(x.intruder.successes), d = num(x.defender.successes);
  x.state = "done";
  let out = { boxes: 0, taken: false, loser: null };
  if (i !== d) {
    const loser = i > d ? x.target : x.initiator, winner = i > d ? x.initiator : x.target;
    const lDeck = fromUuidSync(loser), wDeck = fromUuidSync(winner);
    const mon = RC.netOf(lDeck)?.monitors?.system ?? { entries: {} };
    const before = EW.channelBoxes(mon), boxes = EW.appliedBoxes(mon, Math.abs(i - d));
    if (boxes > 0) makeStep(c, "exchange", { [loser]: (net) => {
      foundry.utils.setProperty(net, `monitors.system.entries.${xid}`, { op: "interference", attackerKey: winner,
        attackerRating: Math.max(num(wDeck?.system?.rating), 0), boxes, at: Date.now() });
    } });
    else c.rev = num(c.rev) + 1;
    const taken = boxes > 0 && before < EW.SIGNAL_BOXES && before + boxes >= EW.SIGNAL_BOXES;
    if (taken) takeStep(j, c, winner, loser);
    out = { boxes, taken, loser, winner };
  } else c.rev = num(c.rev) + 1;
  await saveJournal(j);
  await applyPending(j);
  const lName = out.loser ? fromUuidSync(out.loser)?.name : null;
  await card(`Interference: ${x.intruder.successes} vs ${x.defender.successes} — ${out.boxes ? `${esc(lName)} takes ${out.boxes} box${out.boxes === 1 ? "" : "es"} on its own system channel` : "no effect"}${out.taken ? `; <strong>its network is taken</strong> by ${esc(fromUuidSync(out.winner)?.parent?.name ?? "the winner")} (Rigger 2 p.72)` : ""}.`, null,
    { whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
  return out;
}

/* ── Client ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The initiator's roll: start the exchange on the GM, then roll Flux vs the TN it returns. */
export async function interfere(intruderDeck, targetDeck) {
  const op = fromUuidSync(RC.netOf(intruderDeck)?.operator ?? "");
  const { cid, xid, tns } = await gmCall("ewContestStart", { intruderDeckUuid: intruderDeck.uuid, targetDeckUuid: targetDeck.uuid });
  const id = await rollEwCard(op, { kind: "contest", dice: RC.deckFlux(intruderDeck), tn: tns.intruder,
    label: `Interference — ${targetDeck.parent?.name}'s network (Rigger 2 p.72)`, extra: { cid, xid, side: "intruder" } });
  if (id) return gmCall("ewContestRoll", { cid, xid, side: "intruder", messageId: id });
  return null;
}

/** The Resist button on an interference card: the other side's operator rolls their deck's Flux. */
export function bindContestCard(message, html) {
  const r = message.flags?.sr2e?.ewContestResist;
  if (!r) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  root?.querySelector(".sr2e-contest-resist")?.addEventListener("click", async () => {
    try {
      const c = peek()[r.cid], x = c?.exchanges?.[r.xid];
      if (!live(c) || !x || x.state !== "open" || x.defender) return ui.notifications.info("That exchange is already settled.");
      const op = fromUuidSync(x.top);
      if (!op?.isOwner) return ui.notifications.warn("Only the network's operator resists.");
      const id = await rollEwCard(op, { kind: "contest", dice: x.tflux, tn: x.tns.defender, label: "Resist interference (Rigger 2 p.72)",
        extra: { cid: r.cid, xid: r.xid, side: "defender" } });
      if (id) await gmCall("ewContestRoll", { cid: r.cid, xid: r.xid, side: "defender", messageId: id });
    } catch (err) { ui.notifications.warn(err.message); }
  });
}

/** For the deck panel: this deck's live contests, with each side's system boxes. */
export function contestRows(deck) {
  return contestsOf(deck?.uuid).filter(live).map(c => {
    const other = fromUuidSync(otherOf(c, deck.uuid));
    const boxes = (u) => EW.channelBoxes(RC.netOf(fromUuidSync(u))?.monitors?.system);
    return { cid: c.id, other: other?.uuid ?? "", name: `${other?.parent?.name ?? "?"} — ${other?.name ?? "?"}`,
      mine: boxes(deck.uuid), theirs: boxes(otherOf(c, deck.uuid)), side: sideOf(c, deck.uuid) };
  });
}
