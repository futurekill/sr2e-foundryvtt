/**
 * The remote-control deck panel (docs/PLAN-vehicles-phase2.md Part 5a.8): one window per deck — its connection and
 * operator, subscribers and affiliation, reachability, each drone's mode, the primary, standing orders — with the
 * actions and their costs. Every change is a GM op in module/rc-net.mjs.
 */
import { netOf, rc, vKey, deckFlux, droneModeOf, primaryOf, rigEligible } from "../rc-net.mjs";
import { deckLimits, SKILL_SUCCESS_TABLE, comprehensionTest } from "../rules/drone-rules.mjs";
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
      command: DeckPanel.#command }
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
      hasPrimary: !!net.primary, rows, linked: linked.map(v => ({ uuid: v.uuid, name: v.name })), gm: game.user.isGM };
  }

  static #connect() {
    const op = this.holder?.type === "vehicle" ? game.user.character : this.holder;
    if (!op) return warn("choose your character (User configuration) to run a vehicle's deck");
    return rc("rcConnect", { deckUuid: this.deck.uuid, operatorUuid: op.uuid }).catch(warn);
  }
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
    const roll = await v.rollSuccessTest(t.dice, t.tn, { label: `Comprehension Test: "${esc(res.text || "command")}" (Rigger 2 p.66)`, isResistance: false });
    if (!roll) return;
    return rc("rcOrder", { deckUuid: this.deck.uuid, vehicleUuid: v.uuid, text: res.text ?? "", messageId: roll.testMessageId }).catch(warn);
  }
}

/** The operator's Non-Matrix Programming specialization dice (Computer skill; p.67), 0 when none. */
function nmpDice(actor) {
  const sk = actor?.items?.find(i => i.type === "skill" && /^computer$/i.test(i.name));
  const sp = sk?.system?.specialization;
  return /non.?matrix programming/i.test(sp?.name ?? "") ? Number(sp.rating) || 0 : 0;
}
