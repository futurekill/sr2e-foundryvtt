/**
 * The Sensors panel (docs/PLAN-vehicles-phase2.md Part 4a): one window per vehicle, from its sheet (Rigger 2 only).
 * Shows each transmitter's Flux and range with its conditions, the ECM/ECCM/ED/ECD toggles, the GM's Flux boosts,
 * the sensor components and footage guidance, the vehicle's locks and the EW that bears on it. Every change is a GM op
 * (module/vehicle-sensors.mjs).
 */
import { gmCall } from "../vehicle-play.mjs";
import { transmitters, txFlux, componentsOf, lockOn, ewTermOf, edRuleOn, promptSensorTest, toggleEw, boostContext,
  hasSensors, BUILTIN } from "../vehicle-sensors.mjs";
import { boostProblems } from "../rules/vehicle-sensor-rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const warn = (err) => ui.notifications.warn(`SR2E | ${err?.message ?? err}`);
const KIND_LABEL = { sensor: "Sensors", ecm: "ECM", eccm: "ECCM", ed: "ED", ecd: "ECD", rcDeck: "Remote-control deck", radio: "Radio" };
const COMPONENT_LABEL = { rangefinder: "rangefinders", ultrasound: "ultrasound", laserProximity: "laser proximity detectors",
  proximity: "proximity detectors", video: "video cameras (2D)", radar: "basic radar", signatureRecognition: "signature-recognition software",
  lowLight: "low-light", telescopic: "telescopic magnification", thermographic: "thermographic imaging", flareCompensation: "flare compensation" };
const CONDITIONS = [["highElevation", "High elevation +4"], ["electricalStorm", "Electrical storm −2"], ["encryption", "Encryption −0.5"],
  ["humidAir", "Humid air −0.5"], ["urban", "Urban −1"]];
const fmtRange = (m) => (m == null ? "no usable range" : m >= 1000 ? `${m / 1000} km` : `${m} m`);

export class SensorPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sr2e-sensors"], tag: "div",
    window: { title: "Sensors", icon: "fas fa-satellite-dish", resizable: true },
    position: { width: 620, height: 640 },
    actions: { test: SensorPanel.#test, toggle: SensorPanel.#toggle, condition: SensorPanel.#condition, boosts: SensorPanel.#boosts,
      clear: SensorPanel.#clear, upgrade: SensorPanel.#upgrade }
  };
  static PARTS = { body: { template: "systems/sr2e/templates/apps/sensor-panel.hbs", scrollable: [".sensor-body"] } };

  static #open = new Map();
  static open(vehicle) {
    const app = SensorPanel.#open.get(vehicle.uuid) ?? new SensorPanel(vehicle);
    SensorPanel.#open.set(vehicle.uuid, app);
    return app.render({ force: true });
  }

  constructor(vehicle, options = {}) {
    super({ ...options, id: `sr2e-sensors-${vehicle.id}-${foundry.utils.randomID(4)}` });
    this.vehicle = vehicle;
    const rerender = () => this.render();
    this._hooks = [["updateActor", Hooks.on("updateActor", rerender)], ["updateItem", Hooks.on("updateItem", rerender)],
      ["updateCombat", Hooks.on("updateCombat", rerender)], ["updateToken", Hooks.on("updateToken", rerender)]];
  }

  get title() { return `Sensors — ${this.vehicle.name}`; }

  async close(options) {
    for (const [h, id] of this._hooks) Hooks.off(h, id);
    SensorPanel.#open.delete(this.vehicle.uuid);
    return super.close(options);
  }

  async _prepareContext() {
    const v = this.vehicle, gm = game.user.isGM, owner = v.isOwner;
    const alloc = v.getFlag("sr2e", "fluxBoosts") ?? {};
    const boostIssues = boostProblems(alloc, boostContext(v));
    const conds = v.getFlag("sr2e", "txConditions") ?? {};
    const rows = transmitters(v).map(t => {
      const f = txFlux(v, t);
      const toggled = ["ecm", "eccm", "ed", "ecd"].includes(t.kind);
      return { id: t.id, name: t.item?.name ?? "Sensors (stock)", kind: KIND_LABEL[t.kind] ?? t.kind, rating: t.rating, working: t.working,
        on: t.on, toggled, edOff: ["ed", "ecd"].includes(t.kind) && !edRuleOn(), ported: t.ported,
        base: f?.base, flux: f?.flux, range: fmtRange(f?.range), used: (f?.used ?? []).join(", "),
        conditions: CONDITIONS.map(([k, label]) => ({ k, label, checked: !!conds[t.id]?.[k] })),
        boost: { engine: alloc[t.id]?.engine ?? 0, amps: Object.values(alloc[t.id]?.amplifiers ?? {}).reduce((a, b) => a + (Number(b) || 0), 0) } };
    });
    const comp = componentsOf(v);
    const locks = Object.values(v.getFlag("sr2e", "locks") ?? {}).map(l => {
      const target = fromUuidSync(l.targetUuid);
      return { name: target?.name ?? "?", successes: l.successes, valid: !!(target && lockOn(v, target)), deviceId: l.deviceId, targetUuid: l.targetUuid };
    });
    const affecting = [];
    for (const l of locks) {
      const target = fromUuidSync(l.targetUuid);
      if (target) { const ew = ewTermOf(v, target); if (ew.total) affecting.push({ name: target.name, ecm: ew.ecm, ed: gm ? ew.ed : null }); }
    }
    const storage = v.items.filter(i => /memory|computer|recorder|remote.control/i.test(i.name)).map(i => i.name);
    return { gm, owner, rows, hasSensors: hasSensors(v), components: comp ? comp.components.map(k => COMPONENT_LABEL[k] ?? k) : [],
      magnification: comp?.magnification ?? 0, rating: v.system.effective?.sensor ?? v.system.sensor ?? 0,
      footage: { possible: (v.system.effective?.sensor ?? 0) >= 1, storage, enlarge: (v.system.effective?.sensor ?? 0) * 20 },
      locks, affecting, boostIssues, edRule: edRuleOn(), builtin: rows.some(r => r.id === BUILTIN) };
  }

  static #test() { return promptSensorTest(this.vehicle); }
  static #toggle(_e, el) { return toggleEw(this.vehicle, el.dataset.device, el.dataset.on === "1"); }
  static #condition(_e, el) {
    const id = el.dataset.device, row = this.element.querySelectorAll(`[data-cond-for="${id}"]`);
    const conditions = Object.fromEntries([...row].map(i => [i.dataset.cond, i.checked]));
    const gmRange = this.element.querySelector(`[data-gmrange-for="${id}"]`)?.value;
    if (gmRange) conditions.halfRange = Number(gmRange);
    return gmCall("txConditions", { vehicleUuid: this.vehicle.uuid, deviceId: id, conditions }).catch(warn);
  }
  static async #boosts() {
    const v = this.vehicle, ctx = boostContext(v), amps = Object.keys(ctx.amplifiers);
    const cur = v.getFlag("sr2e", "fluxBoosts") ?? {};
    const rows = transmitters(v).filter(t => t.working).map(t => `<tr><td>${foundry.utils.escapeHTML(t.item?.name ?? "Sensors (stock)")}</td>
      <td><input type="number" min="0" name="${t.id}.engine" value="${cur[t.id]?.engine ?? 0}" style="width:50px" ${t.ported ? "" : "disabled title='needs an Electronics Port'"}></td>
      ${amps.map(a => `<td><input type="number" min="0" name="${t.id}.amp.${a}" value="${cur[t.id]?.amplifiers?.[a] ?? 0}" style="width:50px"></td>`).join("")}</tr>`).join("");
    const res = await foundry.applications.api.DialogV2.prompt({ window: { title: `Flux boosts — ${v.name}` },
      content: `<p>Engine: ≤ ⌊Body ÷ 2⌋ = ${Math.floor(ctx.body / 2)} per device, ≤ Body ${ctx.body} in total, only through an Electronics
        Port. Amplifiers: each ≤ its rating (Rigger 2 p.30).</p><table><tr><th>Device</th><th>Engine</th>${amps.map(a => `<th>${foundry.utils.escapeHTML(v.items.get(a)?.name)} (${ctx.amplifiers[a]})</th>`).join("")}</tr>${rows}</table>`,
      ok: { label: "Save", callback: (_e, b) => new foundry.applications.ux.FormDataExtended(b.form).object } }).catch(() => null);
    if (!res) return;
    const alloc = {};
    for (const [k, val] of Object.entries(res)) {
      const n = Number(val) || 0;
      if (!n) continue;
      const [id, kind, amp] = k.split(".");
      alloc[id] ??= {};
      if (kind === "engine") alloc[id].engine = n;
      else (alloc[id].amplifiers ??= {})[amp] = n;
    }
    return gmCall("fluxBoost", { vehicleUuid: v.uuid, alloc }).catch(warn);
  }
  static #clear(_e, el) { return gmCall("ewClear", { vehicleUuid: this.vehicle.uuid, deviceId: el.dataset.device, recipientUuid: el.dataset.target }).catch(warn); }
  static async #upgrade() { return this.vehicle.sheet?.render?.(true) && ui.notifications.info("SR2E | Buy a \"Sensor Upgrade\" from the vehicle's Customize window (Rigger 2 p.27)."); }
}
