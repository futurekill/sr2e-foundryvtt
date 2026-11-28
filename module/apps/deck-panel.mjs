/**
 * The remote-control deck panel (docs/PLAN-vehicles-phase2.md Part 5a.8): one window per deck — its connection and
 * operator, subscribers and affiliation, reachability, each drone's mode, the primary, standing orders — with the
 * actions and their costs. Every change is a GM op in module/rc-net.mjs.
 */
import * as RCX from "../rc-net.mjs";
import { netOf, rc, vKey, deckFlux, droneModeOf, primaryOf, rigEligible, ivisBalance, hasIvisMaster, ivisPaths, nmpDice } from "../rc-net.mjs";
import { deckLimits, SKILL_SUCCESS_TABLE, comprehensionTest, groupPilot, ivisSplit, ccssMode, ccssComponentRefusal, ccssPerceptionTn, vigilanceCount, ccssNextStep } from "../rules/drone-rules.mjs";
import { RL } from "../util/roll-label.mjs";
import { fluxRange } from "../rules/vehicle-sensor-rules.mjs";
import * as EWX from "../ew.mjs";
import * as EWC from "../ew-contest.mjs";
import * as EW from "../rules/ew-rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const warn = (err) => ui.notifications.warn(`SR2E | ${err?.message ?? err}`);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const fmtRange = (m) => (m == null ? "no usable range" : m >= 1000 ? `${m / 1000} km` : `${m} m`);

export class DeckPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sr2e-deck"], tag: "div",
    window: { title: "Remote-control deck", icon: "fas fa-gamepad", resizable: true },
    position: { width: 640, height: 560 },
    actions: { ccssControl: DeckPanel.#ccssControl, ccssPerception: DeckPanel.#ccssPerception, ccssAccess: DeckPanel.#ccssAccess, ccssMark: DeckPanel.#ccssMark, rcombat: DeckPanel.#rcombat, connect: DeckPanel.#connect, disconnect: DeckPanel.#disconnect, subscribe: DeckPanel.#subscribe,
      unsubscribe: DeckPanel.#unsubscribe, affiliate: DeckPanel.#affiliate, jump: DeckPanel.#jump, ret: DeckPanel.#return,
      command: DeckPanel.#command, hardwire: DeckPanel.#hardwire, groupCommand: DeckPanel.#groupCommand, ivisEnd: DeckPanel.#ivisEnd,
      ewDecrypt: DeckPanel.#ewDecrypt, ewIntercept: DeckPanel.#ewIntercept, ewChoose: DeckPanel.#ewChoose, ewRead: DeckPanel.#ewRead,
      ewMiji: DeckPanel.#ewMiji, ewRegen: DeckPanel.#ewRegen, ewReconnect: DeckPanel.#ewReconnect, ewBlock: DeckPanel.#ewBlock, ewCommand: DeckPanel.#ewCommand,
      ewInterfere: DeckPanel.#ewInterfere }
  };
  static PARTS = { body: { template: "systems/sr2e/templates/apps/deck-panel.hbs", scrollable: [".deck-body"] } };

  static #open = new Map();
  static open(deck) {
    const app = DeckPanel.#open.get(deck.uuid) ?? new DeckPanel(deck);
    DeckPanel.#open.set(deck.uuid, app);
    return app.render({ force: true });
  }
  constructor(deck, options = {}) {
    super({ ...options, id: `sr2e-deck-${deck.id}-${foundry.utils.randomID(4)}` });
    this.deck = deck;
    const rerender = () => this.render();
    this._hooks = [["updateItem", Hooks.on("updateItem", rerender)], ["updateActor", Hooks.on("updateActor", rerender)],
      ["updateCombat", Hooks.on("updateCombat", rerender)]];
  }
  get title() { return `${RCX.isCcss(this.deck) ? "Security system" : "Remote-control deck"} — ${this.deck.name}`; }
  async close(options) {
    for (const [h, id] of this._hooks) Hooks.off(h, id);
    DeckPanel.#open.delete(this.deck.uuid);
    return super.close(options);
  }

  get holder() { return this.deck.parent; }

  async _prepareContext() {
    const d = this.deck, net = netOf(d) ?? {}, lim = deckLimits(d.system.rating);
    const op = net.operator ? fromUuidSync(net.operator) : null;
    const flux = deckFlux(d), r = fluxRange(flux);
    const c = game.combat?.started ? game.combat : null;
    const rows = (net.subscribers ?? []).map(uuid => {
      const v = fromUuidSync(uuid), k = vKey(uuid), a = net.affiliated?.[k];
      const order = net.standingOrders?.[k];
      return { uuid, name: v?.name ?? "(missing)", img: v?.img, affiliated: !!a, hardwired: !!a?.hardwired,
        pilot: v?.system?.effective?.pilot ?? v?.system?.pilot ?? 0, reachable: net.unreachable?.[k] !== true,
        mode: a && v ? droneModeOf(v) : null, primary: net.primary === k,
        sitsOut: !!(a?.since && c && a.since.combatId === c.id && a.since.round === c.round),   // R5-1
        order: order ? { text: order.text, successes: order.successes } : null };
    });
    const linked = (this.holder?.system?.linkedVehicles ?? []).map(u => fromUuidSync(u)).filter(v => v && !(net.subscribers ?? []).includes(v.uuid));
    return { name: d.name, rating: d.system.rating, flux, range: fmtRange(typeof r === "object" && r ? r.low : r),
      limits: lim, subscribed: rows.length, affiliatedCount: rows.filter(x => x.affiliated).length,
      connected: net.connection?.state === "connected", operator: op?.name ?? null, jacked: rigEligible(op ?? this.holder),
      hasPrimary: !!net.primary, rows,
      ivis: Object.entries(net.ivis ?? {}).map(([gid, g]) => {
        const vs = (g.drones ?? []).map(k => rows.find(r => vKey(r.uuid) === k)).filter(Boolean);
        return { gid, task: g.task, pool: g.pool, balance: vs.length ? ivisBalance(fromUuidSync(vs[0].uuid)) : 0, drones: vs.map(r => r.name).join(", ") };
      }),
      ew: RCX.isCcss(d) ? {} : this.#ewContext(net), ccss: this.#ccssContext(net), access: RCX.isCcss(d) ? [] : this.#accessContext(),
      onVehicle: this.holder?.type === "vehicle", holderName: this.holder?.name ?? "", hardwired: !!net.affiliated?.[vKey(this.holder?.uuid ?? "")]?.hardwired, linked: linked.map(v => ({ uuid: v.uuid, name: v.name })), gm: game.user.isGM };
  }

  /** The CCSS section (5d, R2 p.77–80): the rigger's mode, the components and what jumping into each needs. */
  #ccssContext(net) {
    const d = this.deck;
    if (!RCX.isCcss(d)) return null;
    const mode = ccssMode(net), s = d.system;
    const rcb = EWX.rcombatOf(d);
    return { combat: rcb ? this.#combatRow(d, rcb, "defender") : null, mode, modeLabel: mode === "body" ? "assuming the body (Karma Pool only)" : mode === "component"
      ? `jumped into ${RCX.ccssComponentOf(d)?.name || "a component"}` : "jumped into a drone",
      technicalRating: s.technicalRating, vigilance: s.vigilance, vigilanceCount: vigilanceCount(s.vigilance), encrypted: s.encrypted,
      decryptionRating: s.decryptionRating, onAlert: s.onAlert,
      components: (s.components ?? []).map(c => ({ ...c, current: net.ccssComponent === c.id && !net.primary, refusal: ccssComponentRefusal(c),
        unit: c.kind === "room" ? "m²" : c.kind === "corridor" ? "m" : "" })) };
  }
  /** Accessing a security system (5d, p.79–80): every CCSS in the world (and on this scene's tokens) and its next step. */
  #accessContext() {
    const op = this.#op, seen = new Set(), rows = [];
    const actors = [...(game.actors ?? []), ...(canvas?.scene?.tokens ?? []).filter(t => !t.actorLink).map(t => t.actor).filter(Boolean)];
    for (const a of actors) for (const c of a?.items ?? []) {
      if (!RCX.isCcss(c) || seen.has(c.uuid)) continue;
      seen.add(c.uuid);
      const st = EWX.ccssAccessOf(c, this.deck), next = ccssNextStep(c.system, st);
      const d = next === "combat" ? { dice: 0, need: "" } : EWX.ccssStepDice(next, op, this.deck);
      const rc = EWX.rcombatOf(c), mine = rc?.intruder?.deckUuid === this.deck.uuid ? rc : null;
      rows.push({ uuid: c.uuid, name: `${a.name} — ${c.name}`, next, combat: mine ? this.#combatRow(c, mine, "intruder") : null, label: { tap: "Tap into a dataline", decrypt: "Defeat encryption",
        protocols: "Adjust to system protocols", combat: "Rigger combat" }[next], dice: d.dice, need: d.need,
        tn: c.system.technicalRating, count: vigilanceCount(c.system.vigilance), protocolsKnown: !!st.protocolsKnown, slavePort: !!st.slavePort,
        blocked: next === "protocols" && !st.protocolsKnown ? "the GM must mark the protocols known first" : (next !== "combat" && !d.dice ? `needs ${d.need}` : "") });
    }
    return rows;
  }
  /** One side's view of a rigger combat (p.80): who, whether an attack waits for this side's defense. */
  #combatRow(ccss, c, side) {
    const other = side === "intruder" ? "defender" : "intruder";
    return { side, ccss: ccss.uuid, foe: fromUuidSync(c[other]?.actorUuid ?? "")?.name ?? "?",
      mustResist: c.pending?.side === side, pendingOther: !!c.pending && c.pending.side !== side,
      // The rigger combat's own Initiative order (p.80): whose action it is now; a used-up turn re-rolls on the next attack.
      canAttack: game.user.isGM || !(c.order ?? [])[Number(c.pos) || 0] || (c.order ?? [])[Number(c.pos) || 0] === side,
      mustDefend: !c.pending && !!c.exchange && c.exchange.attacker === other, waiting: !!c.exchange && c.exchange.attacker === side };
  }
  /** Rigger combat actions (p.80): engage, attack (Complex), defend, disengage (Free). */
  static async #rcombat(_e, el) {
    const { act, side } = el.dataset, ccss = fromUuidSync(el.dataset.ccss);
    if (act === "engage") return rc("rcombatStart", { intruderDeckUuid: this.deck.uuid, ccssUuid: ccss.uuid })
      .then(r => r?.took && ui.notifications.info("No security rigger was jacked in: the system is yours.")).catch(warn);
    if (act === "disengage") return rc("rcombatDisengage", { ccssUuid: ccss.uuid, side }).catch(warn);
    const c = EWX.rcombatOf(ccss);
    if (!c) return warn("no rigger combat here");
    const actor = fromUuidSync(c[side].actorUuid), foe = fromUuidSync(c[side === "intruder" ? "defender" : "intruder"].actorUuid);
    const resist = act === "resist", p = c.pending;
    const attr = resist ? "body" : "willpower";
    const tn = resist ? Math.max(2, (Number(p?.power) || 0)) : (Number(foe?.system?.willpower?.value) || 0);
    const cap = Math.min(EWX.rcombatCap(ccss, side, attr), actor?.system?.dicePools?.control?.value ?? 0);
    let control = 0;
    if (cap > 0) {
      control = await foundry.applications.api.DialogV2.prompt({ window: { title: "Rigger combat" },
        content: `<div class="form-group"><label>Control Pool dice (max ${cap})</label><input type="number" name="n" value="0" min="0" max="${cap}" style="width:52px"></div>`,
        ok: { label: "Roll", callback: (_e2, b) => Math.min(cap, Math.max(0, Number(b.form.elements.n.value) || 0)) }, rejectClose: false }).catch(() => null);
      if (control == null) return;
    }
    // Every card is bound to the combat, its side and exchange (or the hit it resists) — code review r1 #4.
    const bind = resist ? { kind: "rcombat-resist", ccss: ccss.uuid, combat: c.id, pending: p?.id }
      : { kind: "rcombat", ccss: ccss.uuid, combat: c.id, side, seq: act === "attack" ? (Number(c.seq) || 0) + 1 : c.exchange?.seq };
    const res = await actor.rollSuccessTest(Number(actor.system[attr]?.value) || 0, tn, {
      label: resist ? `Rigger combat — resist ${p?.power}${p?.level} Stun with Body (Rigger 2 p.80)`
        : `Rigger combat — ${act === "attack" ? "attack" : "defense"}: Willpower vs ${foe?.name}'s Willpower ${tn} (Rigger 2 p.80)`,
      ...(resist ? { isResistance: true } : {}), poolDice: control ? { control } : {}, flags: { sr2e: { ew: bind } } });
    if (!res?.testMessageId) return;
    const op = resist ? "rcombatResist" : act === "attack" ? "rcombatAttack" : "rcombatDefend";
    return rc(op, { ccssUuid: ccss.uuid, side, messageId: res.testMessageId }).catch(warn);
  }
  static async #ccssAccess(_e, el) {
    const ccss = fromUuidSync(el.dataset.uuid), op = this.#op;
    if (!op) return warn("connect the deck first");
    const st = EWX.ccssAccessOf(ccss, this.deck), step = ccssNextStep(ccss.system, st);
    const { dice } = EWX.ccssStepDice(step, op, this.deck);
    const label = `${{ tap: "Tap into a dataline", decrypt: "Defeat encryption", protocols: "Adjust to system protocols" }[step]} — ${ccss.parent?.name} (Rigger 2 p.80)`;
    const id = await EWX.rollEwCard(op, { kind: `ccss-${step}`, dice, tn: Number(ccss.system.technicalRating) || 2, label,
      extra: { ccss: ccss.uuid, deck: this.deck.uuid, try: Number(st.tries) || 0 } });
    if (id) return rc("ccssAccess", { intruderDeckUuid: this.deck.uuid, ccssUuid: ccss.uuid, step, messageId: id }).catch(warn);
  }
  static #ccssMark(_e, el) {
    const ccss = fromUuidSync(el.dataset.uuid), key = el.dataset.key;
    return rc("ccssMark", { intruderDeckUuid: this.deck.uuid, ccssUuid: ccss.uuid, key, on: !EWX.ccssAccessOf(ccss, this.deck)[key] }).catch(warn);
  }
  static #ccssControl(_e, el) { return rc("ccssControl", { deckUuid: this.deck.uuid, componentId: el.dataset.id }).catch(warn); }
  /** The GM's secret Rigger Perception Test (p.78): the operator's Intelligence vs the table's TN; a triggered alarm needs none. */
  static async #ccssPerception() {
    const net = netOf(this.deck), op = net?.operator ? fromUuidSync(net.operator) : null;
    if (!game.user.isGM) return;
    if (!op || net.connection?.state !== "connected") return warn("no security rigger is connected to this system");
    const events = { door: "Security door or gate opening/closing", "tamper-no-alarm": "Attempted lock tampering, no alarm",
      "tamper-success": "Successful lock tampering", destroyed: "Device destroyed", deactivated: "Device carefully deactivated" };
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: "Rigger Perception Test (Rigger 2 p.78)" },
      content: `<p>A triggered alarm or sensor needs no test: the rigger knows someone is there.</p>
        <div class="form-group"><label>Trigger</label><select name="event">${Object.entries(events).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div class="form-group"><label>Tamper successes</label><input type="number" name="n" value="1" min="1" style="width:52px"></div>
        <p>${this.deck.system.onAlert ? "System on alert: −2 TN." : ""}</p>`,
      ok: { label: "Roll", callback: (_e2, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
    if (!res) return;
    const tn = ccssPerceptionTn(res.event, { tamperSuccesses: res.n, onAlert: this.deck.system.onAlert });
    if (tn == null) return;
    return op.rollSuccessTest(op.system.intelligence?.value ?? 0, tn, { label: RL("CcssPerception", { event: events[res.event] }), whisperGM: true });
  }

  static #connect() {
    const op = this.holder?.type === "vehicle" ? game.user.character : this.holder;
    if (!op) return warn("choose your character (User configuration) to run a vehicle's deck");
    return rc("rcConnect", { deckUuid: this.deck.uuid, operatorUuid: op.uuid }).catch(warn);
  }
  static #hardwire(ev, btn) { return rc("rcHardwire", { deckUuid: this.deck.uuid, on: btn.dataset.on !== "0" }).catch(warn); }
  static #disconnect() { return rc("rcDisconnect", { deckUuid: this.deck.uuid }).catch(warn); }
  static #subscribe() {
    const sel = this.element.querySelector("select[name=newSub]");
    const targeted = [...(game.user.targets ?? [])].map(t => t.actor).filter(a => a?.type === "vehicle");
    const uuids = sel?.value ? [sel.value] : targeted.map(a => a.uuid);
    if (!uuids.length) return warn("pick a linked vehicle or target a vehicle's token");
    return Promise.all(uuids.map(u => rc("rcSubscribe", { deckUuid: this.deck.uuid, vehicleUuid: u, on: true }))).catch(warn);
  }
  static #unsubscribe(_e, el) { return rc("rcSubscribe", { deckUuid: this.deck.uuid, vehicleUuid: el.dataset.uuid, on: false }).catch(warn); }
  static #affiliate(_e, el) { return rc("rcAffiliate", { deckUuid: this.deck.uuid, vehicleUuid: el.dataset.uuid, on: el.dataset.on === "1" }).catch(warn); }
  static #jump(_e, el) { return rc("rcJump", { deckUuid: this.deck.uuid, vehicleUuid: el.dataset.uuid }).catch(warn); }
  static #return() { return rc("rcReturn", { deckUuid: this.deck.uuid }).catch(warn); }

  /** Issue a command (p.66–67; 5a.3): a Complex Action; the drone's Comprehension Test; the result is its standing order. */
  static #ivisEnd(_e, el) { return rc("rcIvisEnd", { deckUuid: this.deck.uuid, gid: el.dataset.gid }).catch(warn); }

  /** A group command (p.66–67): an identical command to several drones, one Comprehension Test; IVIS Test first. */
  static async #groupCommand() {
    const net = netOf(this.deck), op = net?.operator ? fromUuidSync(net.operator) : null;
    if (!op) return warn("connect the deck first");
    const drones = Object.entries(net.affiliated ?? {}).filter(([k]) => k !== net.primary).map(([, a]) => fromUuidSync(a.uuid)).filter(Boolean);
    if (drones.length < 1) return warn("no drones to command (the primary needs none)");
    const ivisOk = hasIvisMaster(this.deck), paths = ivisPaths(op);
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: "Group command" },
      content: `<p>One Complex Action; ONE Comprehension Test at the group's lowest Pilot, its result for every drone (Rigger 2 p.66).</p>
        ${drones.map(v => `<label style="display:block"><input type="checkbox" name="d_${v.id}" value="${v.uuid}" checked> ${esc(v.name)} (Pilot ${v.system.effective?.pilot ?? v.system.pilot ?? 0})</label>`).join("")}
        <div class="form-group"><label>Command</label><input name="text" style="flex:2"></div>
        <div class="form-group"><label>Complexity</label><select name="tn">${SKILL_SUCCESS_TABLE.map(r => `<option value="${r.tn}" ${r.key === "average" ? "selected" : ""}>${r.label} (${r.tn}${r.max ? `–${r.max}` : r.open ? "+" : ""})</option>`).join("")}</select></div>
        ${!ivisOk ? "<p><em>No IVIS master unit on this deck: no IVIS Test.</em></p>" : paths.length ? `<div class="form-group"><label title="Rigger 2 p.66; Skill Web defaults, SRComp p.48">IVIS Test</label><select name="ivis"><option value="">none</option>${paths.map((p, i) => `<option value="${i}" ${i ? "" : "selected"}>${esc(p.label)}: ${p.dice} dice vs TN ${p.tn}</option>`).join("")}</select></div>` : "<p><em>No Vehicle Tactics, Tactics or Military Theory: no IVIS Test.</em></p>"}`,
      ok: { label: "Roll", callback: (_e2, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
    if (!res) return;
    const group = Object.entries(res).filter(([k, v]) => k.startsWith("d_") && v).map(([k]) => drones.find(v => v.id === k.slice(2))).filter(Boolean);
    if (!group.length) return warn("choose at least one drone");
    let split = { test: 0, pool: 0 }, ivisMsg = "";
    const path = ivisOk && res.ivis !== "" && res.ivis != null ? paths[Number(res.ivis)] : null;
    if (path) {
      const ivisEw = EWX.netTestMod(this.deck, "ivis", ["command", "system"]);   // meaconing / command jamming (5b.3)
      const t = await op.rollSuccessTest(path.dice, path.tn, { label: "IVIS Test (Rigger 2 p.66)", tnContext: { kind: "skill", key: "tactics", skillCategory: "knowledge" },
        ...(ivisEw ? { extraTN: ivisEw, extraTNLabel: "signal degradation" } : {}),
        flags: { sr2e: { rcIvis: { deckUuid: this.deck.uuid } } } });
      if (!t) return;
      ivisMsg = t.testMessageId;
      const s = t.successes ?? 0;
      if (s > 0) {
        const n = await foundry.applications.api.DialogV2.prompt({ window: { title: "IVIS successes" },
          content: `<p>${s} success${s === 1 ? "" : "es"}: add how many to the Comprehension Test? The rest become the group's IVIS Pool (p.67).</p>
            <input type="number" name="n" value="0" min="0" max="${s}" style="width:52px">`,
          ok: { label: "Split", callback: (_e2, b) => Number(b.form.elements.n.value) || 0 } }).catch(() => 0);
        split = ivisSplit(s, n);
      }
    }
    const lead = group.reduce((m, v) => ((v.system.effective?.pilot ?? v.system.pilot ?? 0) < (m.system.effective?.pilot ?? m.system.pilot ?? 0) ? v : m));
    const pilot = groupPilot(group.map(v => v.system.effective?.pilot ?? v.system.pilot ?? 0));
    const jumpedElsewhere = !!primaryOf(op.uuid);   // jumped into a primary, commanding secondaries (p.65)
    const c = comprehensionTest({ pilot, specDice: nmpDice(op), ivis: split.test, tableTn: Number(res.tn) || 4, jumpedCommandingSecondary: jumpedElsewhere,
      degradation: EWX.netTestMod(this.deck, "comprehension", ["command"]) });   // command jamming (R2 p.71; 5b.3)
    const roll = await lead.rollSuccessTest(c.dice, c.tn, { label: `Group Comprehension Test: "${esc(res.text || "command")}" (${group.length} drones, Pilot ${pilot}${split.test ? `, +${split.test} IVIS` : ""}; Rigger 2 p.66)`,
      flags: { sr2e: { rcCommand: { deckUuid: this.deck.uuid, vehicleUuids: group.map(v => v.uuid), ivisMessageId: ivisMsg || "", ivisToTest: split.test } } } });
    if (!roll) return;
    // The op derives the IVIS Pool from the IVIS card itself (c5a r1 #13).
    return rc("rcGroupOrder", { deckUuid: this.deck.uuid, vehicleUuids: group.map(v => v.uuid), text: res.text ?? "", messageId: roll.testMessageId }).catch(warn);
  }

  /* ── Electronic warfare (Part 5b-1, R2 p.68–72) ── */

  #ewContext(net) {
    const nameOf = (deckUuid) => { const d = fromUuidSync(deckUuid); return d ? `${d.parent?.name ?? "?"} (${d.name})` : "an intruder"; };
    const channels = EW.CHANNELS.map(ch => {
      const m = net.monitors?.[ch], boxes = EW.channelBoxes(m), band = EW.signalBand(boxes);
      const byAttacker = {};
      for (const e of Object.values(m?.entries ?? {})) if (e.boxes > 0) byAttacker[e.attackerKey] = (byAttacker[e.attackerKey] ?? 0) + e.boxes;
      return { ch, boxes, band: band.level ? `${band.level} +${band.tn}` : "clear", lost: net.carriers?.[ch] === "lost",
        attackers: Object.entries(byAttacker).map(([key, n]) => ({ key, n, name: nameOf(key) })) };
    });
    const bogus = Object.entries(net.bogus ?? {}).map(([eid, b]) => ({ eid, channel: b.channel, net: b.net, cancelled: b.cancelled ?? 0, by: nameOf(b.attackerKey) }));
    const targets = net.operator ? RCX.rcIndex().decks.filter(d => d !== this.deck && netOf(d)?.connection?.state === "connected").map(d => {
      const rec = EWX.interceptOf(this.deck, d);
      const me = netOf(this.deck)?.operator;
      const held = EW.CHANNELS.filter(ch => EWX.channelAuthority(d, ch)?.actor?.uuid === me);
      const drones = held.includes("command") ? Object.values(netOf(d)?.affiliated ?? {}).map(a => fromUuidSync(a.uuid)).filter(Boolean)
        .map(v => ({ uuid: v.uuid, name: v.name })) : [];
      return { uuid: d.uuid, name: `${d.parent?.name ?? "?"} — ${d.name}`, encrypted: !!EWX.moduleRating(d, "rc-encryption"),
        channels: rec?.channels ?? [], gmChooses: rec?.gmChooses ?? 0, intercepted: !!rec?.channels?.length, held, drones,
        systemHeld: !!rec?.channels?.includes("system") };
    }) : [];
    const contests = EWC.contestRows(this.deck);
    return { channels, bogus, alert: net.alert ?? 0, targets, contests, any: channels.some(c => c.boxes || c.lost) || bogus.length > 0 || contests.length > 0 };
  }
  get #op() { const n = netOf(this.deck); return n?.operator ? fromUuidSync(n.operator) : null; }
  static async #ewDecrypt(_e, el) {
    const target = fromUuidSync(el.dataset.uuid), op = this.#op;
    if (!op) return warn("connect the deck first");
    const id = await EWX.rollEwCard(op, { kind: "decrypt", dice: EWX.ewMaxDice(op) + EWX.moduleRating(this.deck, "decryption"),   // with the passive dice
      tn: EW.decryptTn(EWX.moduleRating(target, "rc-encryption")), label: `Break ${target.parent?.name}'s encryption (Electronic Warfare; Rigger 2 p.69)`,
      extra: { freqGen: EWX.freqGen(netOf(target)), target: target.uuid } });
    if (id) return rc("ewDecrypt", { intruderDeckUuid: this.deck.uuid, targetDeckUuid: target.uuid, messageId: id })
      .then(r => ui.notifications.info(r.ok ? "Encryption broken." : "Failed — and they know someone is trying.")).catch(warn);
  }
  static async #ewIntercept(_e, el) {
    const target = fromUuidSync(el.dataset.uuid), op = this.#op;
    if (!op) return warn("connect the deck first");
    const named = await foundry.applications.api.DialogV2.prompt({ window: { title: "Signal interception" },
      content: `<p>Complex Action (Rigger 2 p.68–69): your deck's rating in dice vs TN ${EW.interceptTn({ deckRating: target.system.rating, alert: netOf(target)?.alert })}. Each success intercepts a channel — the ones you name first; otherwise the GM chooses.</p>
        ${EW.CHANNELS.map(c => `<label style="display:block"><input type="checkbox" name="${c}"> ${c}</label>`).join("")}`,
      ok: { label: "Roll", callback: (_e2, b) => EW.CHANNELS.filter(c => b.form.elements[c].checked) }, rejectClose: false }).catch(() => null);
    if (!named) return;
    const id = await EWX.rollEwCard(op, { kind: "intercept", dice: Number(this.deck.system.rating) || 0,
      tn: EW.interceptTn({ deckRating: target.system.rating, alert: netOf(target)?.alert }), label: `Signal interception — ${target.parent?.name} (Rigger 2 p.68)`,
      extra: { freqGen: EWX.freqGen(netOf(target)), target: target.uuid, named } });
    if (id) return rc("ewIntercept", { intruderDeckUuid: this.deck.uuid, targetDeckUuid: target.uuid, messageId: id }).catch(warn);
  }
  static async #ewChoose(_e, el) {
    const target = fromUuidSync(el.dataset.uuid), rec = EWX.interceptOf(this.deck, target);
    if (!rec?.gmChooses) return;
    const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: `Choose ${rec.gmChooses} channel(s)` },
      content: EW.CHANNELS.filter(c => !rec.channels.includes(c)).map(c => `<label style="display:block"><input type="checkbox" name="${c}"> ${c}</label>`).join(""),
      ok: { label: "Choose", callback: (_e2, b) => EW.CHANNELS.filter(c => b.form.elements[c]?.checked) }, rejectClose: false }).catch(() => null);
    if (pick) return rc("ewChooseChannels", { intruderDeckUuid: this.deck.uuid, targetDeckUuid: target.uuid, channels: pick }).catch(warn);
  }
  static async #ewRead(_e, el) {
    let vehicleUuid = null;
    if (el.dataset.channel === "system") {   // the system channel reports one drone (p.69)
      const drones = Object.values(netOf(fromUuidSync(el.dataset.uuid))?.affiliated ?? {}).map(a => fromUuidSync(a.uuid)).filter(Boolean);
      if (!drones.length) return warn("that network has no drones");
      vehicleUuid = await foundry.applications.api.DialogV2.prompt({ window: { title: "Read the system channel" },
        content: `<select name="v">${drones.map(v => `<option value="${v.uuid}">${esc(v.name)}</option>`).join("")}</select>`,
        ok: { label: "Read", callback: (_e2, b) => b.form.elements.v.value }, rejectClose: false }).catch(() => null);
      if (!vehicleUuid) return;
    }
    return rc("ewRead", { intruderDeckUuid: this.deck.uuid, targetDeckUuid: el.dataset.uuid, channel: el.dataset.channel, vehicleUuid }).catch(warn);
  }
  static async #ewMiji(_e, el) {
    const target = fromUuidSync(el.dataset.uuid), rec = EWX.interceptOf(this.deck, target), op = this.#op;
    if (!op || !rec?.channels?.length) return warn("intercept a channel first");
    const opts = Object.entries(EW.OP_CHANNELS).filter(([k]) => k !== "interference")
      .flatMap(([k, chs]) => chs.filter(c => rec.channels.includes(c)).map(c => `<option value="${k}:${c}">${k} — ${c}</option>`)).join("");
    const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: "MIJI attack" },
      content: `<p>Complex Action (Rigger 2 p.69–72): an opposed test — your device's Flux vs their deck rating; they resist with their deck's Flux.</p><select name="x">${opts}</select>`,
      ok: { label: "Start", callback: (_e2, b) => b.form.elements.x.value }, rejectClose: false }).catch(() => null);
    if (!pick) return;
    const [kind, channel] = pick.split(":");
    try {
      const { aid } = await rc("ewMijiStart", { op: kind, intruderDeckUuid: this.deck.uuid, targetDeckUuid: target.uuid, channel });
      const x = netOf(target).ew[aid];
      const id = await EWX.rollEwCard(op, { kind: "miji", dice: x.intruderFlux, tn: x.tns.intruder, label: `${kind} — ${target.parent?.name}'s ${channel} channel (Rigger 2 p.70–72)`,
        extra: { aid, side: "intruder" } });
      if (id) await rc("ewMijiRoll", { targetDeckUuid: target.uuid, aid, side: "intruder", messageId: id });
    } catch (err) { warn(err); }
  }
  static async #ewRegen(_e, el) {
    const op = this.#op, ch = el.dataset.channel, key = el.dataset.key;
    const m = netOf(this.deck)?.monitors?.[ch];
    const rating = Math.max(0, ...Object.values(m?.entries ?? {}).filter(e => e.attackerKey === key).map(e => e.attackerRating ?? 0));
    const id = await EWX.rollEwCard(op, { kind: "regen", dice: EWX.moduleRating(this.deck, "rc-eccm"), tn: EW.regenTn({ deckRating: rating }),
      label: `Regenerate the ${ch} channel (ECCM; Rigger 2 p.72)` });
    if (id) return rc("ewRegen", { deckUuid: this.deck.uuid, channel: ch, attackerKey: key, messageId: id }).catch(warn);
  }
  static async #ewReconnect(_e, el) {
    const op = this.#op, ch = el.dataset.channel, boxes = EWX.channelBoxesOf(netOf(this.deck), ch);
    const id = await EWX.rollEwCard(op, { kind: "reconnect", dice: EWX.controlSystemsMaxDice(op), tn: EW.reconnectTn({ boxes, damageMod: op?.system?.woundPenalty ?? 0 }),
      label: `Re-connect the ${ch} carrier (Control Systems; Rigger 2 p.72)` });
    if (id) return rc("ewReconnect", { deckUuid: this.deck.uuid, channel: ch, messageId: id })
      .then(r => ui.notifications.info(r.ok ? `The ${ch} carrier is back.` : "Not enough successes.")).catch(warn);
  }
  /** Command a drone through their captured command channel (p.70; 5b.0): the drone's Comprehension Test, your skills. */
  static async #ewCommand(_e, el) {
    const target = fromUuidSync(el.dataset.target), v = fromUuidSync(el.dataset.uuid), op = this.#op;
    if (!v || !op) return;
    const pilot = v.system.effective?.pilot ?? v.system.pilot ?? 0;
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: `Command — ${v.name} (captured channel)` },
      content: `<p>You hold their command channel (Rigger 2 p.70): the drone's Comprehension Test, Pilot ${pilot} + your Non-Matrix Programming.</p>
        <div class="form-group"><label>Command</label><input name="text" style="flex:2"></div>
        <div class="form-group"><label>Complexity</label><select name="tn">${SKILL_SUCCESS_TABLE.map(r => `<option value="${r.tn}" ${r.key === "average" ? "selected" : ""}>${r.label} (${r.tn})</option>`).join("")}</select></div>`,
      ok: { label: "Roll Comprehension", callback: (_e2, b) => new foundry.applications.ux.FormDataExtended(b.form).object }, rejectClose: false }).catch(() => null);
    if (!res) return;
    const auth = EWX.channelAuthority(target, "command");
    if (!auth) return warn("you no longer hold their command channel");
    const t = EWX.commandTest(op, target, v, Number(res.tn) || 4);
    const roll = await v.rollSuccessTest(t.dice, t.tn, { label: `Comprehension Test: "${esc(res.text || "command")}" (captured channel; Rigger 2 p.66, p.70)`, isResistance: false,
      flags: { sr2e: { rcCommand: { deckUuid: target.uuid, vehicleUuids: [v.uuid], authEvent: auth.auth.eventId, freqGen: EWX.freqGen(netOf(target)),
        orderRev: netOf(target)?.standingOrders?.[vKey(v.uuid)]?.rev ?? 0, tableTn: Number(res.tn) || 4 } } } });
    if (roll) return rc("ewCommand", { intruderDeckUuid: this.deck.uuid, targetDeckUuid: target.uuid, vehicleUuid: v.uuid, text: res.text ?? "", messageId: roll.testMessageId }).catch(warn);
  }
  /** Interference (p.72; 5b.4): open or continue the contest for their network. */
  static async #ewInterfere(_e, el) {
    const target = fromUuidSync(el.dataset.uuid);
    if (!target || !this.#op) return warn("connect the deck first");
    return EWC.interfere(this.deck, target).then(r => r?.void ? warn("the contest moved on before your roll counted") : null).catch(warn);
  }
  static async #ewBlock(_e, el) {
    const op = this.#op, b = netOf(this.deck)?.bogus?.[el.dataset.eid];
    if (!b) return;
    const id = await EWX.rollEwCard(op, { kind: "block", dice: EWX.moduleRating(this.deck, "rc-eccm"), tn: b.protocolEmulation,
      label: `Block the intrusion (ECCM; Rigger 2 p.71, p.31)` });
    if (id) return rc("ewBlock", { deckUuid: this.deck.uuid, eid: el.dataset.eid, messageId: id })
      .then(r => ui.notifications.info(r.ended ? "The bogus object is gone." : `${r.cancelled} of its successes cancelled so far.`)).catch(warn);
  }

  static async #command(_e, el) {
    const v = fromUuidSync(el.dataset.uuid), net = netOf(this.deck);
    const op = net?.operator ? fromUuidSync(net.operator) : null;
    if (!v || !op) return warn("connect the deck first");
    const pilot = v.system.effective?.pilot ?? v.system.pilot ?? 0;
    const spec = nmpDice(op);
    const jumpedElsewhere = !!primaryOf(op.uuid) && net.primary !== vKey(v.uuid);
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: `Command — ${v.name}` },
      content: `<p>A Complex Action (Rigger 2 p.66). The GM rates the command on the Skill Success Table (core p.68); you may
        simplify it first. Dice: Pilot ${pilot}${spec ? ` + Non-Matrix Programming ${Math.min(spec, pilot)}` : ""}${jumpedElsewhere ? "; +2 TN — you're jumped into another drone (p.65)" : ""}.</p>
        <div class="form-group"><label>Command</label><input name="text" style="flex:2" placeholder="e.g. hold the alley entrance"></div>
        <div class="form-group"><label>Complexity</label><select name="tn">${SKILL_SUCCESS_TABLE.map(r => `<option value="${r.tn}" ${r.key === "average" ? "selected" : ""}>${r.label} (${r.tn}${r.max ? `–${r.max}` : r.open ? "+" : ""})</option>`).join("")}</select></div>`,
      ok: { label: "Roll Comprehension", callback: (_e2, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
    if (!res) return;
    const t = comprehensionTest({ pilot, specDice: spec, tableTn: Number(res.tn) || 4, jumpedCommandingSecondary: jumpedElsewhere,
      degradation: EWX.netTestMod(this.deck, "comprehension", ["command"]) });
    const roll = await v.rollSuccessTest(t.dice, t.tn, { label: `Comprehension Test: "${esc(res.text || "command")}" (Rigger 2 p.66)`, isResistance: false,
      flags: { sr2e: { rcCommand: { deckUuid: this.deck.uuid, vehicleUuids: [v.uuid] } } } });
    if (!roll) return;
    return rc("rcOrder", { deckUuid: this.deck.uuid, vehicleUuid: v.uuid, text: res.text ?? "", messageId: roll.testMessageId }).catch(warn);
  }
}

