/**
 * The chase panel (docs/PLAN-vehicles-phase2.md 3a.2): one window per combat, opened from the combat tracker. The GM
 * sets up entries, drivers, aboard lists, groups, speeds, terrain and pursuit pairs (p.42 step 1); drivers roll Driver
 * Points and take vehicle actions; aboard characters relocate hidden vehicles. Every change is a GM op (chase.mjs).
 */
import { gmCall } from "../vehicle-play.mjs";
import { chaseOf } from "../chase-state.mjs";
import { hasChase, rollDriverPoints, chaseAction, vehicleStats, classOf, chaseResume, chaseApplyNow } from "../chase.mjs";
import { VEHICLE_POINTS, TERRAINS, R2_CLASS_LABELS } from "../rules/vehicle-combat-rules.mjs";
import { isRigger2 } from "../vehicle-mode.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const KIND = { dp: "Driver Points", accelerate: "Accelerate", brake: "Brake", position: "Positioning", hide: "Hiding", relocate: "Relocating" };
const nameOf = (uuid) => (uuid ? fromUuidSync(uuid)?.name ?? "?" : "—");
const warn = (err) => ui.notifications.warn(`SR2E | ${err?.message ?? err}`);
const call = (op, args) => gmCall(op, args).catch(warn);

export class ChasePanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sr2e-chase-{id}", classes: ["sr2e", "sr2e-chase"], tag: "div",
    window: { title: "Chase", icon: "fas fa-car-side", resizable: true },
    position: { width: 900, height: 640 },
    actions: {
      setup: ChasePanel.#setup, addEntry: ChasePanel.#addEntry, remove: ChasePanel.#remove, addPair: ChasePanel.#addPair,
      removePair: ChasePanel.#removePair, dp: ChasePanel.#dp, act: ChasePanel.#act, autonav: ChasePanel.#autonav,
      relocate: ChasePanel.#relocate, unboard: ChasePanel.#unboard, ram: ChasePanel.#ram, cancel: ChasePanel.#cancel, resume: ChasePanel.#resume, applyNow: ChasePanel.#applyNow
    }
  };
  static PARTS = { body: { template: "systems/sr2e/templates/apps/chase-panel.hbs", scrollable: [".chase-body"] } };

  static #open = new Map();
  /** Open (or focus) the panel for a combat. */
  static open(combat) {
    const existing = ChasePanel.#open.get(combat.id);
    if (existing) return existing.render({ force: true });
    const app = new ChasePanel(combat);
    ChasePanel.#open.set(combat.id, app);
    return app.render({ force: true });
  }

  constructor(combat, options = {}) {
    super({ ...options, id: `sr2e-chase-${combat.id}` });
    this.combat = combat;
    this._hooks = [
      ["updateCombat", Hooks.on("updateCombat", (c) => { if (c === this.combat) this.render(); })],
      ["updateActor", Hooks.on("updateActor", () => this.render())],
      ["deleteCombat", Hooks.on("deleteCombat", (c) => { if (c === this.combat) this.close(); })]
    ];
  }

  get title() { return `Chase — Combat Turn ${this.combat.round || "(not started)"}`; }

  async close(options) {
    for (const [h, id] of this._hooks) Hooks.off(h, id);
    ChasePanel.#open.delete(this.combat.id);
    return super.close(options);
  }

  async _prepareContext() {
    const c = this.combat, ch = chaseOf(c), gm = game.user.isGM, r = c.round;
    if (!hasChase(c)) return { gm, rigger2: isRigger2(), none: true };
    const owns = (uuid) => gm || !!fromUuidSync(uuid)?.isOwner;
    const turn = ch.turns?.[r] ?? {};
    const live = Object.entries(ch.actions ?? {}).filter(([, a]) => !["done", "cancelled", "stale"].includes(a.state));
    const entries = Object.entries(ch.entries ?? {}).map(([eid, e]) => {
      const doc = fromUuidSync(e.uuid), t = turn[eid] ?? {};
      const stats = e.kind === "vehicle" ? vehicleStats(doc) : null;
      const cls = e.kind === "vehicle" ? classOf(doc) : null;
      const mine = e.kind === "vehicle" && owns(e.driver);
      const joined = (e.joinedRound ?? 1) <= r;
      const dpBusy = t.dpSlot && live.some(([aid]) => aid === t.dpSlot);
      return {
        eid, kind: e.kind, name: doc?.name ?? "(missing)", img: doc?.img, driver: nameOf(e.driver), driverUuid: e.driver,
        aboard: (e.aboard ?? []).map(nameOf).join(", "), aboardChips: (e.aboard ?? []).map(u => ({ uuid: u, name: nameOf(u) })), group: e.group ?? "",
        speed: e.speed ?? 0, terrain: e.terrain, autonav: e.autonav, rating: stats?.speedRating, maxSpeed: stats ? Math.floor(stats.speedRating * 1.5) : null,
        cls: cls ? `${R2_CLASS_LABELS[cls]} ${VEHICLE_POINTS[cls] >= 0 ? "+" : ""}${VEHICLE_POINTS[cls]}` : (e.kind === "vehicle" ? "no class (drone: Part 5)" : "pedestrian"),
        noClass: e.kind === "vehicle" && !cls,
        ms: t.ms, msParts: t.pedestrian ? `Quickness ${t.ms}` : t.vp != null
          ? `VP ${t.vp} TP ${t.tp} SP ${t.sp} DP ${t.dp?.value ?? "?"}${t.positionBonus ? ` +${t.positionBonus} pos` : ""}${t.escapeBonus ? ` +${t.escapeBonus} escape` : ""}` : "",
        over: !!t.over, joined, joinsAt: e.joinedRound,
        canDp: mine && joined && c.started && t.vp != null && t.dp == null && !dpBusy,
        canAct: mine && joined && c.started && t.ms != null,
        terrains: TERRAINS.map(k => ({ k, sel: k === e.terrain }))
      };
    });
    const pairs = Object.entries(ch.pairs ?? {}).map(([pid, p]) => {
      const hidden = p.contact && p.contact !== true;
      const P = ch.entries[p.pursuer];
      const spotters = P ? [P.driver, ...(P.aboard ?? [])].filter(u => u && owns(u)).map(u => ({ uuid: u, name: nameOf(u) })) : [];
      const Q = ch.entries[p.quarry], t = ch.turns?.[c.round] ?? {};
      // Ram (p.47–48): either side of the pursuit may ram the other; the GM op checks distance or entitlement.
      const rams = c.started ? [[p.pursuer, p.quarry], [p.quarry, p.pursuer]]
        .filter(([me]) => ch.entries[me]?.kind === "vehicle" && owns(ch.entries[me].driver) && t[me]?.ms != null)
        .map(([me, them]) => ({ eid: me, target: them, label: `${nameOf(ch.entries[me].uuid)} rams` })) : [];
      return { pid, rams, pursuer: nameOf(P?.uuid), quarry: nameOf(Q?.uuid), distance: p.distance,
               contact: hidden ? `hidden (${p.contact.successes} successes${p.contact.npcTurns ? `, NPC search ${p.contact.npcTurns}/5` : ""})` : "in contact",
               hidden, spotters: hidden && c.started ? spotters : [] };
    });
    const t = c.getFlag("sr2e", "roundTransition");
    const waiting = live.map(([aid, a]) => ({ aid, label: `${KIND[a.kind]}: ${nameOf(ch.entries[a.eid]?.uuid)} (${a.state}, ${game.users.get(a.user)?.name ?? "?"})`,
      mine: gm || a.user === game.user.id,
      card: gm && a.state === "publishing" && game.messages.some(m => m.getFlag("sr2e", "chaseAction")?.aid === aid),
      force: gm && a.state === "publishing" }));
    const actorOpts = [...new Map([...c.combatants.map(cb => cb.actor), ...game.actors.filter(a => a.type === "character")]
      .filter(a => a && ["character", "npc"].includes(a.type)).map(a => [a.uuid, { uuid: a.uuid, name: a.name }])).values()];
    const vehicleOpts = [...new Map([...(canvas?.scene?.tokens?.contents ?? []).map(t => t.actor), ...game.actors.contents]
      .filter(a => a?.type === "vehicle").map(a => [a.uuid, { uuid: a.uuid, name: a.name + (a.isToken ? " (token)" : "") }])).values()];
    return { gm, entries, pairs, waiting, transition: t ? `${t.stage} (Combat Turn ${t.from} → ${t.to})` : null,
             started: c.started, actorOpts, vehicleOpts, pairOpts: entries.map(e => ({ eid: e.eid, name: e.name })),
             terrains: TERRAINS };
  }

  _onRender() {
    // GM edits: one field per input, written through the chase op.
    for (const el of this.element.querySelectorAll("[data-field]")) {
      el.addEventListener("change", () => {
        const eid = el.closest("[data-eid]")?.dataset.eid;
        const f = el.dataset.field;
        if (f === "distance") return call("chasePair", { combatId: this.combat.id, pid: el.closest("[data-pid]").dataset.pid,
          ...pairOf(this.combat, el.closest("[data-pid]").dataset.pid), distance: Number(el.value) });
        let v = el.value;
        if (f === "speed") v = Number(v);
        if (f === "aboardAdd") {
          if (!v) return;
          const cur = chaseOf(this.combat).entries[eid]?.aboard ?? [];
          return call("chaseEditEntry", { combatId: this.combat.id, eid, patch: { aboard: [...new Set([...cur, v])] } });
        }
        if (f === "group") v = v.trim() || null;
        call("chaseEditEntry", { combatId: this.combat.id, eid, patch: { [f]: v } });
      });
    }
  }

  static async #setup() { await call("chaseSetup", { combatId: this.combat.id }); }

  static async #addEntry() {
    const root = this.element;
    const kind = root.querySelector("[name=newKind]").value;
    const uuid = root.querySelector(kind === "vehicle" ? "[name=newVehicle]" : "[name=newPedestrian]").value;
    const driver = kind === "vehicle" ? root.querySelector("[name=newDriver]").value : "";
    const speed = Number(root.querySelector("[name=newSpeed]").value) || 0;
    const terrain = root.querySelector("[name=newTerrain]").value;
    if (!uuid) return warn("pick a vehicle or a character");
    await call("chaseAddEntry", { combatId: this.combat.id, kind, uuid, driver, speed, terrain });
  }

  static async #remove(ev, target) {
    const eid = target.closest("[data-eid]").dataset.eid;
    if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Remove from the chase" }, content: "<p>Remove this entry and its pursuit pairs?</p>" }))
      await call("chaseRemoveEntry", { combatId: this.combat.id, eid });
  }

  static async #addPair() {
    const root = this.element;
    await call("chasePair", { combatId: this.combat.id, pursuer: root.querySelector("[name=pairPursuer]").value,
      quarry: root.querySelector("[name=pairQuarry]").value, distance: Number(root.querySelector("[name=pairDistance]").value) || 0 });
  }

  static async #removePair(ev, target) {
    await call("chasePair", { combatId: this.combat.id, pid: target.closest("[data-pid]").dataset.pid, remove: true });
  }

  static async #dp(ev, target) { await rollDriverPoints(this.combat, target.closest("[data-eid]").dataset.eid); }

  static async #act(ev, target) {
    const eid = target.closest("[data-eid]").dataset.eid, kind = target.dataset.kind;
    let stopDistance = null;
    if (target.dataset.stop) {
      stopDistance = await foundry.applications.api.DialogV2.prompt({ window: { title: "Stop at a point (R2 p.47)" },
        content: `<p><label>How far away is the spot (m)? <input type="number" name="d" value="50" min="0"></label></p>`,
        ok: { callback: (e, b) => Math.max(0, Number(b.form.elements.d.value) || 0) }, rejectClose: false });
      if (stopDistance == null) return;
    }
    await chaseAction(this.combat, eid, kind, { stopDistance });
  }

  static async #autonav(ev, target) {
    const eid = target.closest("[data-eid]").dataset.eid;
    const on = !chaseOf(this.combat).entries[eid].autonav;
    const cost = await gmCall("chaseAutonav", { combatId: this.combat.id, eid, on }).catch(warn);
    if (cost) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: fromUuidSync(chaseOf(this.combat).entries[eid].uuid) }),
      content: `<div class="sr2e-item-card">Autonav ${on ? "on" : "off"} — a ${cost} (Rigger 2 p.45).</div>` });
  }

  static async #relocate(ev, target) {
    const pid = target.closest("[data-pid]").dataset.pid;
    const p = chaseOf(this.combat).pairs[pid];
    await chaseAction(this.combat, p.pursuer, "relocate", { target: pid, actorUuid: target.dataset.actor });
  }

  static async #ram(ev, target) {
    await chaseAction(this.combat, target.dataset.eid, "ram", { target: target.dataset.target });
  }

  static async #unboard(ev, target) {
    const eid = target.closest("[data-eid]").dataset.eid;
    const cur = chaseOf(this.combat).entries[eid]?.aboard ?? [];
    await call("chaseEditEntry", { combatId: this.combat.id, eid, patch: { aboard: cur.filter(u => u !== target.dataset.uuid) } });
  }

  static async #cancel(ev, target) {
    await call("chaseCancel", { combatId: this.combat.id, aid: target.dataset.aid, force: !!target.dataset.force });
  }

  static async #resume() { await chaseResume(this.combat); }

  static async #applyNow(ev, target) {
    try {
      const out = await chaseApplyNow(this.combat, target.dataset.aid);
      if (out?.refused) warn(out.refused);
      await chaseResume(this.combat);
    } catch (err) { warn(err); }
  }
}

const pairOf = (combat, pid) => {
  const p = chaseOf(combat).pairs[pid];
  return { pursuer: p.pursuer, quarry: p.quarry };
};

/** A "Chase" button in the combat tracker header (Rigger 2 only). */
export function registerChasePanel() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const combat = game.combat;
    if (!isRigger2() || !combat || (!game.user.isGM && !hasChase(combat))) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const header = root?.querySelector(".combat-tracker-header, header");
    if (!header || header.querySelector(".sr2e-chase-open")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sr2e-chase-open";
    btn.innerHTML = `<i class="fas fa-car-side"></i> Chase`;
    btn.title = "Rigger 2 vehicle combat (p.41–49)";
    btn.addEventListener("click", () => ChasePanel.open(combat));
    header.append(btn);
  });
}
