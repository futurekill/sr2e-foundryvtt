/**
 * The Virtual Realities 2.0 Matrix at roll time (docs/PLAN-vr2-core.md). Reached only
 * when isVR2() — except resolution, which follows the CARD's ruleset, so a fight
 * started under one ruleset finishes under it.
 *
 * - Cybercombat (p.123–124): a flag-backed attack card (`flags.sr2e.matrix`, ruleset
 *   "vr2") snapshots the host, Power and Level; the defender resists it once.
 * - System Tests (p.19): the decker's Computer test against the host's Security Value
 *   dice; the host's successes go on the decker's per-session security tally
 *   (`flags.sr2e.vr2Session`), written by the decker's own client with receipts.
 * - Leaving the Matrix (p.124): one path for the sheet, a jackpoint and a crash; dump
 *   shock unless the decker completed a Graceful Logoff.
 */
import { cybercombatTN, icDamageLevel, dumpShockDamage, detectionFactor, matrixCombatOutcome,
         simsenseOverloadTN, systemTestVerdict, testTotalSuccesses, MATRIX_MONITOR_MAX } from "./rules/sr2e-rules.mjs";
import { isCardResolved } from "./astral-combat.mjs";
import { matrixQueue, sessionHost } from "./jackpoints.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";
import { firstTarget } from "./targeting.mjs";
import { miscDiceHTML, readMiscDice } from "./dialogs/roll-modifiers.mjs";
import { skillTnContext } from "./documents/actor.mjs";
import { commitDamage } from "./drugs.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "es"}`;
const LEVEL_NAMES = { L: "Light", M: "Moderate", S: "Serious", D: "Deadly" };
const codeLabel = (code) => game.i18n.localize(CONFIG.SR2E.securityCodes[code]?.label ?? code);
const RESIST_IN_FLIGHT = new Set();
const sessionQueue = (actor, fn) => enqueueAttack(`vr2session:${actor.uuid}`, fn);

/** Highest rating among the actor's LOADED programs whose name starts with `name` (0 if none). */
export function loadedUtility(actor, name) {
  const key = String(name).toLowerCase();
  return Math.max(0, ...actor.items.filter(i => i.type === "program" && i.system.loaded
    && i.name.toLowerCase().startsWith(key)).map(i => i.system.rating ?? 0));
}

const hostSnap = (host) => ({ hostUuid: host.uuid, hostName: host.name,
  securityCode: host.system.securityCode, securityValue: host.system.securityValue });

const hostOptions = (hosts, selected) => hosts.map(h =>
  `<option value="${h.id}" ${h.uuid === selected?.uuid ? "selected" : ""}>${esc(h.name)} (${esc(codeLabel(h.system.securityCode))}, Security Value ${h.system.securityValue})</option>`).join("");

// ── Sessions and the security tally ──────────────────────────────────────────

/** The decker's live VR2.0 session record, or null. */
export const liveSession = (actor) => { const s = actor?.flags?.sr2e?.vr2Session; return s?.id ? s : null; };

/** Replace the session records whole (a merge would carry old receipts along). */
async function replaceSessions(actor, live, last) {
  await actor.update({ "flags.sr2e.-=vr2Session": null, ...(last ? { "flags.sr2e.-=lastSession": null } : {}) });
  const set = {};
  if (live) set["flags.sr2e.vr2Session"] = live;
  if (last) set["flags.sr2e.lastSession"] = last;
  if (Object.keys(set).length) await actor.update(set);
}

/**
 * A new session for a decker entering the Matrix (the old one kept as lastSession);
 * the jackpoint's host if it names one. Every way in awaits it INSIDE matrixQueue
 * (the sheet toggle, a jackpoint), so a crash can tell this connection from a later one.
 */
export function startSession(actor) {
  return sessionQueue(actor, async () => {
    const h = sessionHost(actor);
    const next = { id: foundry.utils.randomID(), hostUuid: h?.uuid ?? "", hostName: h?.name ?? "", tally: 0, receipts: {} };
    await replaceSessions(actor, next, liveSession(actor));
    return next;
  });
}

/** Jack in from the sheet (VR2.0): decided in the queue, so a double click enters once. */
export function vr2EnterMatrix(actor) {
  return matrixQueue(actor, async () => {
    if (actor.system.matrixMode) return;
    await actor.update({ "system.matrixMode": true });
    await startSession(actor);
  });
}

/** The live session against `host`: a session with no host yet adopts it; another host starts a new one (the old kept as lastSession). */
export function sessionFor(actor, host) {
  return sessionQueue(actor, async () => {
    const s = liveSession(actor);
    if (s?.hostUuid === host.uuid) return s;
    if (s && !s.hostUuid) {
      await actor.update({ "flags.sr2e.vr2Session.hostUuid": host.uuid, "flags.sr2e.vr2Session.hostName": host.name });
      return { ...s, hostUuid: host.uuid, hostName: host.name };
    }
    const next = { id: foundry.utils.randomID(), hostUuid: host.uuid, hostName: host.name, tally: 0, receipts: {} };
    await replaceSessions(actor, next, s);
    return next;
  });
}

/** Add a System Test card's host successes to its session, once. Only the card's author (the decker's own client) writes. */
export function addTally(actor, message) {
  const st = message?.flags?.sr2e?.vr2SystemTest;
  if (!st || !actor?.isOwner || !message.isAuthor) return Promise.resolve(false);
  return sessionQueue(actor, async () => {
    const s = liveSession(actor);
    if (!s || s.id !== st.sessionId || s.receipts?.[message.id] != null) return false;
    await actor.update({ "flags.sr2e.vr2Session.tally": (s.tally ?? 0) + st.hostSuccesses,
      [`flags.sr2e.vr2Session.receipts.${message.id}`]: st.hostSuccesses });
    return true;
  });
}

/** On load: this client's own System Test cards that never reached their (still live) session. */
export async function reconcileTallies() {
  for (const m of game.messages ?? []) {
    const st = m.flags?.sr2e?.vr2SystemTest;
    if (!st || !m.isAuthor) continue;
    const actor = sync(st.actorUuid);
    if (actor && liveSession(actor)?.id === st.sessionId) await addTally(actor, m);
  }
}

// ── System Tests (p.19) ──────────────────────────────────────────────────────

/** The System Test card; `successes` is the decker's (Karma re-renders it), `hostSuccesses` never changes. */
export function renderSystemTestCard(st) {
  const v = systemTestVerdict(st.successes, st.hostSuccesses);
  return `<div class="sr2e-item-card sr2e-vr2-systest">
    <strong>${esc(st.actorName)} — ${esc(st.opLabel)}</strong>
    <br>vs ${esc(st.hostName)}: ${esc(st.subsystemLabel)} ${st.subsystem}${st.utility ? ` − ${esc(st.utilityName)} ${st.utility}` : ""} → TN ${st.tn}.
    <br>The host rolls Security Value ${st.securityValue} vs Detection Factor ${st.df}: ${plural(st.hostSuccesses, "success")}.
    <br>${v.success ? `<strong style="color:#7a8;">Succeeds</strong>` : `<strong style="color:#c44;">Fails</strong>`}
    (${st.successes} vs the host's ${st.hostSuccesses}; the decker needs more).
    <br><em>+${st.hostSuccesses} to the security tally (VR2.0 p.19).</em>
  </div>`;
}

/**
 * A VR2.0 System Test (p.19): Computer vs the subsystem's rating less the utility the
 * operation uses; the host rolls its Security Value against the decker's Detection
 * Factor once, here, and its successes go on the tally whether the decker wins or not.
 */
export async function vr2SystemTest(actor, host, operation, opts = {}) {
  const op = CONFIG.SR2E.vr2SystemOperations[operation];
  if (!op || host?.type !== "host") return ui.notifications.warn("Choose a host and a System Operation.");
  const computer = actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "computer");
  const trained = (computer?.system?.rating ?? 0) > 0;
  const dice = trained ? computer.system.rating : (actor.system.intelligence?.value ?? 1);
  const subsystem = host.system.subsystemRating(op.subsystem);
  const utility = loadedUtility(actor, op.utility);
  // Untrained: the Skill Web default to Intelligence, +4 TN (core p.84).
  const tn = Math.max(2, subsystem - utility) + (trained ? 0 : 4);
  const subsystemLabel = CONFIG.SR2E.vr2Subsystems[op.subsystem] ?? op.subsystem;
  const session = await sessionFor(actor, host);
  const res = await actor.rollSuccessTest(Math.max(1, dice), tn, {
    label: `${op.label} — Computer vs ${subsystemLabel} (TN ${tn})`, tnContext: skillTnContext("computer"),
    poolDice: opts.hacking ? { hacking: opts.hacking } : undefined,
    karmaDice: opts.karmaDice ?? 0, miscDice: opts.miscDice, miscLabel: opts.miscLabel
  });
  if (!res) return;
  const df = Math.max(2, detectionFactor(actor.system.matrixPersona?.masking ?? 0, loadedUtility(actor, "sleaze")));
  const securityValue = host.system.securityValue;
  const hostRoll = await SR2ESuccessRoll.successTest(securityValue, df);
  const st = { actorUuid: actor.uuid, actorName: actor.name, operation, opLabel: op.label, hostName: host.name,
    subsystemLabel, subsystem, utilityName: op.utility, utility, tn, df, securityValue,
    successes: res.successes, hostSuccesses: hostRoll.successes, sessionId: session.id, testMessageId: res.testMessageId };
  const msg = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderSystemTestCard(st),
    rolls: hostRoll.rolls, flags: { sr2e: { vr2SystemTest: st } } });
  await addTally(actor, msg);
  return res;
}

// ── Cybercombat (p.123–124) ──────────────────────────────────────────────────

/** The VR2.0 attack card (state in flags.sr2e.matrix, ruleset "vr2"). */
export function renderVR2MatrixCard(st) {
  const hit = (st.successes ?? 0) > 0;
  const button = !st.resolved && hit ? `
    <div class="sr2e-karma-actions">
      <button type="button" class="sr2e-matrixresist-btn"
              title="The target resists: IC rolls the host's Security Value, a persona its Bod, against TN = the Power (an Armor utility lowers it).">
        🖧 Resist (Matrix)
      </button>
    </div>` : "";
  return `<div class="sr2e-damage-result">
    <strong>${esc(st.attackerName)} attacks in the Matrix</strong> — ${plural(st.successes ?? 0, "success")}
    <br>${st.power}${st.level} on ${esc(st.hostName)} (${esc(codeLabel(st.securityCode))}, Security Value ${st.securityValue}); target ${st.status === "legitimate" ? "legitimate" : "intruding"}.
    ${hit ? `<br><em>Stages up 1 level per 2 successes; the target resists against TN ${st.power}, staging down 1 per 2.
      10 boxes crash the icon (VR2.0 p.123–124).</em>` : "<br><em>The attack misses.</em>"}
    ${st.resolution ?? ""}
    ${button}
  </div>`;
}

async function promptAttack(actor) {
  const isIC = actor.type === "ic";
  const hosts = game.actors.filter(a => a.type === "host");
  if (!hosts.length) { ui.notifications.warn("Create a Host actor first: VR2.0 cybercombat runs on its Security Code and Value."); return null; }
  const target = firstTarget()?.actor ?? null;
  const preHost = isIC ? sync(actor.system.hostUuid) : (sync(liveSession(actor)?.hostUuid) ?? sessionHost(actor));
  let programs = "";
  if (!isIC) {
    const list = actor.items.filter(i => i.type === "program" && i.system.loaded
      && (i.system.damageLevel || /attack|blaster/i.test(i.name))).sort((a, b) => b.system.rating - a.system.rating);
    if (!list.length) { ui.notifications.warn("Load an attack utility (e.g. Attack) to attack in the Matrix."); return null; }
    programs = list.map(p => `<option value="${p.id}">${esc(p.name)} (Rating ${p.system.rating}${p.system.damageLevel ? `, ${p.system.damageLevel}` : ", no level"})</option>`).join("");
  }
  const hackingMax = actor.system.dicePools?.hacking?.value ?? 0;
  const karma = actor.system.karma?.pool ?? 0;
  const legit = target?.type === "ic";
  let pick = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Matrix Attack (VR2.0)" }, rejectClose: false,
    content: `<div>
      <div class="form-group"><label>Host:</label><select name="host">${hostOptions(hosts, preHost)}</select></div>
      <div class="form-group"><label>Target icon:</label><select name="status">
        <option value="intruding" ${legit ? "" : "selected"}>Intruding</option>
        <option value="legitimate" ${legit ? "selected" : ""}>Legitimate (IC, or a valid passcode)</option></select></div>
      ${isIC ? `<p style="font-size:11px;color:#aaa1c0;">The IC rolls the host's Security Value; Power ${actor.system.rating}, Level by Security Code (VR2.0 p.40, p.124).</p>` : `
      <div class="form-group"><label>Attack utility:</label><select name="program">${programs}</select></div>
      <div class="form-group"><label>Level if unset <span style="font-size:10px;color:#958ba8;">(saved to it, p.98)</span>:</label>
        <select name="level"><option value="">—</option><option value="L">Light</option><option value="M">Moderate</option>
        <option value="S">Serious</option><option value="D">Deadly</option></select></div>
      <div class="form-group"><label>Hacking Pool dice <span style="font-size:10px;color:#958ba8;">(${hackingMax} left)</span>:</label>
        <input type="number" name="hacking" value="0" min="0" max="${hackingMax}" style="width:52px;text-align:center;"></div>`}
      ${karma > 0 ? `<div class="form-group"><label>Karma dice <span style="font-size:10px;color:#958ba8;">(pool ${karma})</span>:</label>
        <input type="number" name="karma_dice" value="0" min="0" max="${karma}" style="width:52px;text-align:center;"></div>` : ""}
      ${miscDiceHTML()}
    </div>`,
    buttons: [
      { action: "attack", label: "Attack", default: true, callback: (ev, b) => {
        const f = b.form.elements;
        pick = { hostId: f.host.value, status: f.status.value, programId: f.program?.value ?? null, level: f.level?.value ?? "",
          hacking: Math.max(0, Math.min(hackingMax, parseInt(f.hacking?.value) || 0)),
          karmaDice: Math.max(0, Math.min(karma, parseInt(f.karma_dice?.value) || 0)), ...readMiscDice(b.form) };
      } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "attack" ? pick : null;
}

/** A VR2.0 Matrix attack by a decker (attack utility) or IC (the host's Security Value). */
export async function vr2MatrixAttack(actor) {
  const o = await promptAttack(actor);
  if (!o) return;
  const host = game.actors.get(o.hostId);
  if (!host) return;
  const isIC = actor.type === "ic";
  const code = host.system.securityCode;
  const tn = cybercombatTN(code, o.status);
  let dice, power, level, tnContext;
  if (isIC) {
    // An IC with no host keeps the one picked, so its initiative uses it too.
    if (!actor.system.hostUuid && actor.isOwner) await actor.update({ "system.hostUuid": host.uuid });
    dice = host.system.securityValue; power = actor.system.rating; level = icDamageLevel(code);
    tnContext = { kind: "other" };
  } else {
    const prog = actor.items.get(o.programId);
    if (!prog) return;
    level = prog.system.damageLevel || o.level;
    if (!level) return ui.notifications.warn(`${prog.name} has no Damage Level: pick one (VR2.0 p.98).`);
    if (!prog.system.damageLevel && prog.isOwner) await prog.update({ "system.damageLevel": level });
    dice = prog.system.rating; power = prog.system.rating;
    tnContext = { ...skillTnContext("computer"), kind: "attack" };
    await sessionFor(actor, host);              // fighting on a host = logged on to it
  }
  const res = await actor.rollSuccessTest(Math.max(1, dice), tn, {
    label: `Matrix Attack ${power}${level} (TN ${tn}, ${codeLabel(code)} vs ${o.status})`,
    poolDice: !isIC && o.hacking ? { hacking: o.hacking } : undefined,
    karmaDice: o.karmaDice ?? 0, miscDice: o.miscDice, miscLabel: o.miscLabel, tnContext
  });
  if (!res) return;
  // Posted even at 0 successes (inert), so Karma can still bring it to life.
  const state = { ruleset: "vr2", attackerUuid: actor.uuid, attackerName: actor.name, attackerType: actor.type,
    icType: isIC ? actor.system.icType : "", targetUuid: firstTarget()?.actor?.uuid ?? "",
    ...hostSnap(host), status: o.status, power, level,
    successes: res.successes, testMessageId: res.testMessageId, resolved: false };
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderVR2MatrixCard(state),
    flags: { sr2e: { matrix: state } } });
  return res;
}

/** Fill Matrix boxes in a per-actor queue that re-reads the live value. Returns the new value. */
function matrixDamage(actor, boxes) {
  return enqueueAttack(`matrixmon:${actor.uuid}`, async () => {
    const path = actor.type === "ic" ? "system.conditionMonitor.value" : "system.matrixPersona.condition.value";
    const v = Math.min(MATRIX_MONITOR_MAX, (foundry.utils.getProperty(actor, path) ?? 0) + boxes);
    await actor.update({ [path]: v });
    return v;
  });
}

/**
 * Resist a VR2.0 Matrix attack card, once (p.124). IC: the card's Security Value dice;
 * a persona: Bod; both against TN = Power (less a loaded Armor utility). Simsense
 * overload for a decker hit by white or gray IC on a hot deck; a crash dumps the decker.
 */
export async function vr2MatrixResist(defender, message) {
  if (RESIST_IN_FLIGHT.has(message.id)) return;
  RESIST_IN_FLIGHT.add(message.id);
  try {
    const live = game.messages.get(message.id);
    const st = live?.flags?.sr2e?.matrix;
    if (!st || isCardResolved(live, "matrix")) return ui.notifications.warn("That attack has already been resisted.");
    if (!defender.isOwner) return ui.notifications.warn(`Only ${defender.name}'s owner or the GM can resist for them.`);
    const liveAtk = () => { const t = game.messages.get(st.testMessageId)?.flags?.sr2e?.test; return t ? testTotalSuccesses(t) : (st.successes ?? 0); };
    if (liveAtk() <= 0) return ui.notifications.warn("The attack missed: there is nothing to resist.");
    let dice, tn, what;
    if (defender.type === "ic") {
      dice = st.securityValue; tn = st.power; what = "host Security Value";
    } else if (defender.type === "character") {
      const armor = loadedUtility(defender, "armor");
      dice = defender.system.matrixPersona?.bod ?? 0; tn = st.power - armor;
      what = `persona Bod${armor ? `, Armor ${armor}` : ""}`;
    } else {
      return ui.notifications.warn("Only IC or a decker persona can resist a Matrix attack.");
    }
    tn = Math.max(2, tn);
    // Who and which session, captured as the defender resolves (the card may be untargeted).
    const sessionId = defender.type === "character" ? (liveSession(defender)?.id ?? null) : null;
    const res = await defender.rollSuccessTest(Math.max(1, dice), tn, {
      label: `Resist Matrix damage — ${what} (TN ${tn})`, isResistance: true, closed: true, tnContext: { kind: "other" }
    });
    if (!res) return;
    // The attack's CURRENT successes, from its own test (Karma may have moved them).
    const atkS = liveAtk();
    if (atkS <= 0) return ui.notifications.warn("The attack missed: there is nothing to resist.");
    if (isCardResolved(game.messages.get(message.id), "matrix")) {
      return ui.notifications.warn("That attack was resolved on another device while you rolled.");
    }
    const out = matrixCombatOutcome(st.level, atkS, res.successes);
    const closes = [st.testMessageId, res.testMessageId];
    const lines = [];
    let crashed = false, text;
    if (!out.level) {
      text = `${defender.name} resists the Matrix attack.`;
    } else {
      const filled = await matrixDamage(defender, out.boxes);
      crashed = filled >= MATRIX_MONITOR_MAX;
      text = `${defender.name} takes ${LEVEL_NAMES[out.level]} Matrix damage: ${out.boxes} box${out.boxes === 1 ? "" : "es"} (${filled}/${MATRIX_MONITOR_MAX}).`;
      const deck = defender.system.cyberdeck ?? {};
      if (defender.type === "character" && ["white", "gray"].includes(st.icType) && (deck.deckMode ?? "hot") === "hot") {
        if (out.level === "D") {
          crashed = true;
          lines.push("Deadly damage from white or gray IC on a hot deck: simsense overload crashes the persona (VR2.0 p.124).");
        } else {
          const otn = Math.max(2, simsenseOverloadTN(out.level) + (deck.dniOnly ? 2 : 0) - (deck.iccm ? 2 : 0));
          const ov = await defender.rollSuccessTest(Math.max(1, defender.system.willpower?.value ?? 1), otn, {
            label: `Simsense overload — Willpower (TN ${otn})`, isResistance: true, closed: true, tnContext: { kind: "other" }
          });
          if (ov?.testMessageId) closes.push(ov.testMessageId);
          if ((ov?.successes ?? 0) > 0) lines.push("The decker shrugs off the simsense overload.");
          else { await commitDamage(defender, "stun", 1); lines.push("Simsense overload: 1 box of Stun (VR2.0 p.124)."); }
        }
      }
      if (crashed) lines.push(defender.type === "ic" ? "The IC crashes, out of the fight." : `${defender.name}'s persona crashes: dumped from the Matrix.`);
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      content: `<div class="sr2e-damage-result"><strong>${esc(text)}</strong>
        <br><em>${plural(atkS, "attack success")} vs ${plural(res.successes, "resistance success")}.</em>
        ${lines.map(l => `<br>${esc(l)}`).join("")}</div>`,
      flags: { sr2e: { resolves: message.id, closesTests: closes, matrixResolution: `<br><strong>Resolved:</strong> ${esc(text)}` } }
    });
    if (crashed && defender.type === "character") {
      await vr2LeaveMatrix(defender, { crash: { securityCode: st.securityCode, securityValue: st.securityValue,
        hostName: st.hostName, sessionId } });
    }
    return res;
  } finally { RESIST_IN_FLIGHT.delete(message.id); }
}

// ── Leaving the Matrix (p.124) ───────────────────────────────────────────────

async function promptLeave(actor, known) {
  const hosts = known ? [] : game.actors.filter(a => a.type === "host");
  let pick = null;
  const done = (graceful) => (ev, b) => {
    const f = b.form.elements;
    pick = { graceful, hostId: f.host?.value ?? "", securityCode: f.code?.value ?? "",
      securityValue: Math.max(0, parseInt(f.sv?.value) || 0) };
  };
  // No host actor at all: the dump shock still needs a Security Code and Value (p.124).
  const manual = !known && !hosts.length ? `<div class="form-group"><label>Security Code:</label><select name="code">
      ${Object.keys(CONFIG.SR2E.securityCodes).map(k => `<option value="${k}">${esc(codeLabel(k))}</option>`).join("")}</select></div>
    <div class="form-group"><label>Security Value:</label><input type="number" name="sv" value="4" min="0" style="width:52px;text-align:center;"></div>` : "";
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Jack out — ${actor.name}` }, rejectClose: false,
    content: `<div><p>Did ${esc(actor.name)} complete a <strong>Graceful Logoff</strong>? Without one, jacking out
      causes dump shock (VR2.0 p.124).</p>
      ${hosts.length ? `<div class="form-group"><label>Host:</label><select name="host">${hostOptions(hosts, null)}</select></div>` : ""}${manual}</div>`,
    buttons: [
      { action: "graceful", label: "Graceful Logoff", callback: done(true) },
      { action: "dump", label: "Jack out (dump shock)", default: true, callback: done(false) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return action === "graceful" || action === "dump" ? pick : null;
}

/**
 * Leave the Matrix under VR2.0: the ONE path for the sheet toggle, a jackpoint
 * jack-out and a crash. The host is captured before `matrixMode` clears; the session
 * ends (kept as lastSession); dump shock follows unless graceful (or a tortoise).
 * @param {Actor} actor
 * @param {{crash?: {securityCode:string, securityValue:number, hostName:string, sessionId:string|null}}} [opts]
 *   a crash passes the ATTACK card's host snapshot and the session it happened in.
 */
export async function vr2LeaveMatrix(actor, { crash = null } = {}) {
  if (!actor?.isOwner) return;
  let graceful = false, host = crash;
  // The connection this exit is for: a dialog left open across a crash and a reconnect
  // must not end the NEW connection.
  const opened = liveSession(actor)?.id ?? null;
  if (!crash) {
    const known = sync(liveSession(actor)?.hostUuid) ?? sessionHost(actor);
    const pick = await promptLeave(actor, known);
    if (!pick) return;
    graceful = pick.graceful;
    const h = known ?? game.actors.get(pick.hostId);
    host = h ? { securityCode: h.system.securityCode, securityValue: h.system.securityValue, hostName: h.name }
      : pick.securityCode ? { securityCode: pick.securityCode, securityValue: pick.securityValue, hostName: "the host" } : null;
  }
  const left = await matrixQueue(actor, async () => {
    // Claimed in the queue: a second jack-out (a double click) finds the decker already out,
    // and a stale dialog finds another connection.
    if (!crash && (!actor.system.matrixMode || (liveSession(actor)?.id ?? null) !== opened)) return false;
    const s = liveSession(actor);
    // A decker who reconnected since the crash keeps the new connection (and still takes the shock).
    const reconnected = crash && s && s.id !== crash.sessionId;
    if (!reconnected) {
      await actor.update({ "system.matrixMode": false });
      await sessionQueue(actor, async () => { const cur = liveSession(actor); if (cur) await replaceSessions(actor, null, cur); });
    }
    return true;
  });
  if (!left) return;
  const deck = actor.system.cyberdeck ?? {};
  const dmg = !graceful && host ? dumpShockDamage(host.securityCode, host.securityValue,
    { coolDeck: deck.deckMode === "cool", iccm: !!deck.iccm, tortoise: deck.deckMode === "tortoise" }) : null;
  const name = esc(actor.name);
  let content;
  if (graceful) content = `<strong>⌁ ${name} logs off gracefully.</strong>`;
  else if (!dmg) content = `<strong>⌁ ${name} jacks out.</strong><br><em>No dump shock${host ? " (tortoise, or fully filtered by a cool deck and ICCM)" : ": no host known"}.</em>`;
  else content = `<strong>⌁ ${name} is ${crash ? "dumped" : "jacked out"} without a Graceful Logoff: dump shock.</strong>
    <br><em>${dmg.power}${dmg.level} Stun from ${esc(host.hostName)} (${esc(codeLabel(host.securityCode))}); resisted with Body, no armour (VR2.0 p.124).</em>
    <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn" data-power="${dmg.power}" data-level="${dmg.level}"
      data-damage-type="stun" data-armor-calc="none" data-target-uuid="${esc(actor.uuid)}">Resist dump shock (${dmg.power}${dmg.level} Stun)</button></div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">${content}</div>` });
}
