/**
 * The remote-control deck panel (docs/PLAN-vehicles-phase2.md Part 5a.8): one window per deck — its connection and
 * operator, subscribers and affiliation, reachability, each drone's mode, the primary, standing orders — with the
 * actions and their costs. Every change is a GM op in module/rc-net.mjs.
 */
import { netOf, rc, vKey, deckFlux, droneModeOf, primaryOf, rigEligible, ivisBalance, hasIvisMaster } from "../rc-net.mjs";
import { deckLimits, SKILL_SUCCESS_TABLE, comprehensionTest, groupPilot, ivisSplit } from "../rules/drone-rules.mjs";
import { fluxRange } from "../rules/vehicle-sensor-rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const warn = (err) => ui.notifications.warn(`SR2E | ${err?.message ?? err}`);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const fmtRange = (m) => (m == null ? "no usable range" : m >= 1000 ? `${m / 1000} km` : `${m} m`);

export class DeckPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sr2e-deck"], tag: "div",
    window: { title: "Remote-control deck", icon: "fas fa-gamepad", resizable: true },
    position: { width: 640, height: 560 },
    actions: { connect: DeckPanel.#connect, disconnect: DeckPanel.#disconnect, subscribe: DeckPanel.#subscribe,
      unsubscribe: DeckPanel.#unsubscribe, affiliate: DeckPanel.#affiliate, jump: DeckPanel.#jump, ret: DeckPanel.#return,
      command: DeckPanel.#command, hardwire: DeckPanel.#hardwire, groupCommand: DeckPanel.#groupCommand, ivisEnd: DeckPanel.#ivisEnd }
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
  get title() { return `Remote-control deck — ${this.deck.name}`; }
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
      onVehicle: this.holder?.type === "vehicle", holderName: this.holder?.name ?? "", hardwired: !!net.affiliated?.[vKey(this.holder?.uuid ?? "")]?.hardwired, linked: linked.map(v => ({ uuid: v.uuid, name: v.name })), gm: game.user.isGM };
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
    const ivisOk = hasIvisMaster(this.deck), vt = vehicleTacticsDice(op);
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: "Group command" },
      content: `<p>One Complex Action; ONE Comprehension Test at the group's lowest Pilot, its result for every drone (Rigger 2 p.66).</p>
        ${drones.map(v => `<label style="display:block"><input type="checkbox" name="d_${v.id}" value="${v.uuid}" checked> ${esc(v.name)} (Pilot ${v.system.effective?.pilot ?? v.system.pilot ?? 0})</label>`).join("")}
        <div class="form-group"><label>Command</label><input name="text" style="flex:2"></div>
        <div class="form-group"><label>Complexity</label><select name="tn">${SKILL_SUCCESS_TABLE.map(r => `<option value="${r.tn}" ${r.key === "average" ? "selected" : ""}>${r.label} (${r.tn}${r.max ? `–${r.max}` : r.open ? "+" : ""})</option>`).join("")}</select></div>
        ${ivisOk ? `<div class="form-group"><label title="Vehicle Tactics specialization vs TN 5; if you must default to Tactics or Military Theory, enter the Skill Web dice (SRComp p.48)">IVIS Test dice (TN 5)</label><input type="number" name="ivis" value="${vt}" min="0" style="width:52px"></div>` : "<p><em>No IVIS master unit on this deck: no IVIS Test.</em></p>"}`,
      ok: { label: "Roll", callback: (_e2, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
    if (!res) return;
    const group = Object.entries(res).filter(([k, v]) => k.startsWith("d_") && v).map(([k]) => drones.find(v => v.id === k.slice(2))).filter(Boolean);
    if (!group.length) return warn("choose at least one drone");
    let split = { test: 0, pool: 0 }, ivisMsg = "";
    if (ivisOk && Number(res.ivis) > 0) {
      const t = await op.rollSuccessTest(Number(res.ivis), 5, { label: "IVIS Test (Rigger 2 p.66)", tnContext: { kind: "skill", key: "tactics", skillCategory: "knowledge" },
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
    const c = comprehensionTest({ pilot, specDice: nmpDice(op), ivis: split.test, tableTn: Number(res.tn) || 4, jumpedCommandingSecondary: jumpedElsewhere });
    const roll = await lead.rollSuccessTest(c.dice, c.tn, { label: `Group Comprehension Test: "${esc(res.text || "command")}" (${group.length} drones, Pilot ${pilot}${split.test ? `, +${split.test} IVIS` : ""}; Rigger 2 p.66)`,
      flags: { sr2e: { rcCommand: { deckUuid: this.deck.uuid, vehicleUuids: group.map(v => v.uuid), ivisMessageId: ivisMsg || "", ivisToTest: split.test } } } });
    if (!roll) return;
    // The op derives the IVIS Pool from the IVIS card itself (c5a r1 #13).
    return rc("rcGroupOrder", { deckUuid: this.deck.uuid, vehicleUuids: group.map(v => v.uuid), text: res.text ?? "", messageId: roll.testMessageId }).catch(warn);
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
    const t = comprehensionTest({ pilot, specDice: spec, tableTn: Number(res.tn) || 4, jumpedCommandingSecondary: jumpedElsewhere });
    const roll = await v.rollSuccessTest(t.dice, t.tn, { label: `Comprehension Test: "${esc(res.text || "command")}" (Rigger 2 p.66)`, isResistance: false,
      flags: { sr2e: { rcCommand: { deckUuid: this.deck.uuid, vehicleUuids: [v.uuid] } } } });
    if (!roll) return;
    return rc("rcOrder", { deckUuid: this.deck.uuid, vehicleUuid: v.uuid, text: res.text ?? "", messageId: roll.testMessageId }).catch(warn);
  }
}

/** The operator's Vehicle Tactics specialization dice (Tactics Concentration, SRComp; R2 p.66), 0 when none. */
function vehicleTacticsDice(actor) {
  for (const sk of actor?.items?.filter(i => i.type === "skill") ?? []) {
    const sp = sk.system?.specialization;
    if (/vehicle tactics/i.test(sp?.name ?? "")) return Number(sp.rating) || 0;
    if (/vehicle tactics/i.test(sk.name)) return Number(sk.system.rating) || 0;
  }
  return 0;
}

/** The operator's Non-Matrix Programming specialization dice (Computer skill; p.67), 0 when none. */
function nmpDice(actor) {
  const sk = actor?.items?.find(i => i.type === "skill" && /^computer$/i.test(i.name));
  const sp = sk?.system?.specialization;
  return /non.?matrix programming/i.test(sp?.name ?? "") ? Number(sp.rating) || 0 : 0;
}
