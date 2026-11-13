/**
 * The Customize window (docs/archive/plans/PLAN-vehicle-customization.md C3.1): the modifications an EXISTING vehicle can take by the
 * customization rules (Rigger 2 p.118–146), each with its parts price, Availability, Street Index, Installation Test
 * and room, and the vehicle's purchases in progress. Buying writes a request (module/vehicle-customize.mjs).
 */
import { customizationCatalog, customizeContext, quoteCustomization, requestCustomization, cancelCustomization, normalizeFamilies } from "../vehicle-customize.mjs";
import { installSkills } from "../rules/vehicle-custom.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const STATE_LABEL = { pending: "waiting for the GM", admitted: "approved: waiting for the payment", paid: "paid: being delivered",
  done: "delivered", rejected: "refused", unpaid: "not paid", cancelRequested: "cancelling: waiting for the payer's client", cancelled: "cancelled" };

export class VehicleCustomize extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sr2e-vehicle-customize-{id}", classes: ["sr2e", "sr2e-customize"], tag: "div",
    window: { title: "Customize", icon: "fas fa-wrench", resizable: true },
    position: { width: 980, height: 720 },
    actions: { buy: VehicleCustomize.#onBuy, cancel: VehicleCustomize.#onCancel, dismiss: VehicleCustomize.#onDismiss, fixFamilies: VehicleCustomize.#onFix }
  };
  static PARTS = { body: { template: "systems/sr2e/templates/apps/vehicle-customize.hbs", scrollable: [".vc-catalog"] } };

  constructor(vehicle, options = {}) {
    super(options);
    this.vehicle = vehicle;
    this.filter = "";
    this.levels = {};
    this.payer = null;
    this._hook = Hooks.on("updateActor", (a) => { if (a === this.vehicle || a.uuid === this.payer) this.render(); });
  }

  get title() { return `Customize: ${this.vehicle.name}`; }

  async close(options) { Hooks.off("updateActor", this._hook); return super.close(options); }

  /** Who may pay: characters this user owns (the vehicle's linked ones first); the GM also any character, or no charge. */
  payers() {
    const linked = game.actors.filter(a => a.type === "character" && (a.system.linkedVehicles ?? []).includes(this.vehicle.uuid));
    const mine = game.actors.filter(a => a.type === "character" && a.isOwner);
    const list = [...new Set([...linked.filter(a => a.isOwner), ...mine])];
    return list.map(a => ({ uuid: a.uuid, name: `${a.name} (${(a.system.nuyen ?? 0).toLocaleString()}¥)` }));
  }

  async _prepareContext() {
    const catalog = await customizationCatalog();
    const payers = this.payers();
    if (this.payer == null) this.payer = payers[0]?.uuid ?? (game.user.isGM ? "" : null);
    const ctx = customizeContext(this.vehicle, catalog);
    const f = this.filter.trim().toLowerCase();
    // Only mods printed with Customization Specifications (others are dragged onto the sheet as before).
    const hasSpecs = (c) => Object.keys(c.system.custom?.formulas ?? {}).length || (c.system.custom?.market ?? []).length;
    const rows = catalog.filter(c => hasSpecs(c) && c.system.custom.customizable !== false && (!f || c.name.toLowerCase().includes(f))).map(c => {
      const set = !!c.system.custom.formulas?.set;
      const rated = set || /R/.test(Object.values(c.system.custom.formulas ?? {}).join(" ")) || Object.keys(c.system.custom.max ?? {}).length;
      const lv = Math.max(1, Number(this.levels[c.uuid]) || 1);
      const q = quoteCustomization(this.vehicle, c, lv, catalog, { ctx });
      const skills = installSkills(q.skills.length ? q.skills : ["vehicleBR"], ctx.traits);
      return { uuid: c.uuid, name: c.name, rated, set, levels: lv, max: set ? c.system.custom.market.length : null,
        price: q.charged == null ? "—" : `${q.charged.toLocaleString()}¥`, list: q.price,
        market: [q.availability, q.streetIndex != null ? `SI ${q.streetIndex}` : q.restricted ? (q.restricted === "military" ? "military" : "unavailable") : ""].filter(Boolean).join(", "),
        test: q.procedure === "fixed" ? `no test, ${q.fixedHours} h` : `${skills.join(" + ")} (${q.tn ?? "?"})`,
        time: q.procedure === "fixed" ? "" : `${q.baseTime ?? "?"} ${q.baseUnit}${q.combine === "sum" ? " (successes summed)" : ""}`,
        room: `${q.cf} CF, ${q.load} kg`, equipment: q.equipment, blocked: q.ok ? "" : q.problems.join("; "),
        page: c.system.custom.pageCust };
    });
    const requests = Object.values(this.vehicle.getFlag("sr2e", "custRequests") ?? {}).sort((a, b) => b.created - a.created)
      .map(q => ({ ...q, price: q.price ? `${Number(q.price).toLocaleString()}¥` : "", quoted: q.quoted ? `${Number(q.quoted).toLocaleString()}¥` : "", label: STATE_LABEL[q.state] ?? q.state, open: !["done", "rejected", "cancelled"].includes(q.state),
        canCancel: game.user.isGM && ["pending", "admitted", "unpaid"].includes(q.state), canDismiss: ["rejected", "cancelled", "done", "unpaid"].includes(q.state) }));
    return { rows, filter: this.filter, payers, payer: this.payer, isGM: game.user.isGM, requests,
      vehicle: { name: this.vehicle.name, cargoFree: ctx.cargoFree, loadFree: ctx.loadFree, cost: Number(ctx.cost).toLocaleString(), plantCost: ctx.plantCost },
      unresolved: ctx.unresolved };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const search = this.element.querySelector("[data-filter]");
    search?.addEventListener("input", foundry.utils.debounce(() => { this.filter = search.value; this.render(); }, 250));
    this.element.querySelector("[data-payer]")?.addEventListener("change", (e) => { this.payer = e.target.value; this.render(); });
    for (const el of this.element.querySelectorAll("[data-levels]")) el.addEventListener("change", () => { this.levels[el.dataset.levels] = Number(el.value); this.render(); });
  }

  static async #onBuy(event, target) {
    const cat = (await customizationCatalog()).find(c => c.uuid === target.dataset.uuid);
    if (!cat) return;
    const payer = this.payer ? fromUuidSync(this.payer) : null;
    await requestCustomization(this.vehicle, cat, Math.max(1, Number(this.levels[cat.uuid]) || 1), payer);
    this.render();
  }

  static async #onFix() { const n = await normalizeFamilies(this.vehicle); ui.notifications.info(`${n ?? 0} modification(s) given their family.`); this.render(); }

  static async #onCancel(event, target) { await cancelCustomization(this.vehicle, target.dataset.id); this.render(); }

  static async #onDismiss(event, target) {
    await this.vehicle.update({ [`flags.sr2e.custRequests.-=${target.dataset.id}`]: null });
    this.render();
  }
}

export const openVehicleCustomize = (vehicle) => new VehicleCustomize(vehicle).render(true);
