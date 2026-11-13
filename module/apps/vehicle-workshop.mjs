/**
 * The Vehicle Workshop (docs/archive/plans/PLAN-vehicle-builder.md §1c): design a vehicle from scratch with Rigger 2's rules
 * (book p.108–146), step by step, with a live summary. Every number comes from module/rules/vehicle-design.mjs
 * (`designVehicle`); this file only holds the working design and writes the vehicle on Create / Update.
 *
 * The working design lives here until saved: nothing touches the actor while you click around.
 * Modifications installed by the Workshop are `vehicle_mod` items flagged `flags.sr2e.designMod`; the items ARE the
 * record (their ratings included). Mods added on the sheet later are customizations: shown read-only, counted for
 * capacity and mount points, never touched.
 */
import { designVehicle, evalCell, modDesignDP, modCf, modLoad, modProblems, isTransport } from "../rules/vehicle-design.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const STEPS = ["chassis", "plant", "options", "mods", "price", "review"];
const STEP_LABELS = { chassis: "Chassis", plant: "Power plant", options: "Design options", mods: "Modifications", price: "Price", review: "Review" };
const CATEGORIES = { bike: "Bikes", car: "Cars", hovercraft: "Hovercraft", boat: "Boats", fixedWing: "Fixed-wing", rotor: "Rotor craft", vector: "Vectored thrust", special: "Special" };
const ENGINES = { electric: "Electric", methane: "Methane", gasoline: "Gasoline", diesel: "Diesel", jetPropeller: "Jet propeller", jetTurbine: "Jet turbine", sail: "Sail" };

/** The vehicle type and driving skill a chassis category gives (CONFIG.SR2E.vehicleTypes). */
export function vehicleTypeFor(ch) {
  if (!ch) return { vehicleType: "ground", skill: "" };
  const t = { bike: "ground", car: "ground", hovercraft: "hovercraft", boat: "boat", fixedWing: "aircraft", rotor: "rotor", vector: "vectored_thrust" }[ch.category];
  if (t) return { vehicleType: ch.drone && t === "ground" ? "drone" : t, skill: ch.category === "bike" ? "bike" : "" };
  // Special: zeppelins and blimps fly; walkers and anthroforms are drones.
  return { vehicleType: /zeppelin|blimp/i.test(ch.name) ? "aircraft" : "drone", skill: "" };
}

/** Pictures a vehicle starts with before anyone picks one: these may be replaced by a chassis' exemplar. */
const DEFAULT_IMAGES = new Set(["", "icons/svg/car.svg", "icons/svg/mystery-man.svg"]);

/**
 * A chassis' default artwork (Rigger 2 module data `art: { img, aspect }`) as an actor update: the portrait and a token
 * of the house footprint (width from type and Body, length from the trimmed art's aspect; 1 square = 1 m), rotation
 * locked. Null when the chassis has none.
 */
export function chassisArt(ch) {
  if (!ch?.art?.img) return null;
  const b = Number(ch.body) || 0, t = vehicleTypeFor(ch).vehicleType;
  const w = ch.category === "bike" ? 1
    : t === "drone" ? (b <= 2 ? 1 : b <= 4 ? 2 : 3)
    : t === "rotor" ? (b <= 3 ? 8 : 12)
    : t === "aircraft" || t === "vectored_thrust" ? (/blimp|zeppelin/i.test(ch.name) ? Math.max(8, 4 * b) : 8)
    : b <= 4 ? 2 : b <= 6 ? 3 : 4;
  const h = Math.max(1, Math.round(w * (Number(ch.art.aspect) || 1)));
  return { img: ch.art.img, "prototypeToken.texture.src": ch.art.img, "prototypeToken.texture.fit": "contain",
    "prototypeToken.width": w, "prototypeToken.height": h, "prototypeToken.lockRotation": true };
}

/** Whether a vehicle's picture is still one nobody chose (a default, or any chassis' exemplar). */
export function hasDefaultArt(actor, tables) {
  const exemplars = new Set(Object.values(tables?.chassis ?? {}).map(c => c.art?.img).filter(Boolean));
  return DEFAULT_IMAGES.has(actor?.img ?? "") || exemplars.has(actor?.img);
}

/** A fresh, empty v2 design. */
const blankDesign = () => ({ chassisKey: "", powerPlantKey: "", speed: 0, acceleration: 0, load: 0, cargo: 0, handling: 0,
  handlingTrack: "onRoad", economySteps: 0, fuelSteps: 0, signature: 0, smartMaterials: false, takeoff: "", hydrofoil: false,
  amenities: { level: "", occupants: 1 }, medicalPatients: 0, structuralAgility: 0, engineCustom: { speed: 0, acceleration: 0, load: 0 },
  gmDP: 0, markUp: { base: 0, features: {}, multipliers: {}, round: 0 } });

/**
 * Map an old (version 1) Design-tab design onto the Workshop's, by the old keys' names. Returns the design and what
 * didn't carry over, for the owner to check before saving (plan §1c).
 */
export function convertV1(old = {}, tables = {}) {
  const d = blankDesign(), notes = [];
  const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const chName = String(old.chassisKey ?? "").replace(/^chassis-[^-]+-/, "");
  const ch = Object.values(tables.chassis ?? {}).find(c => slug(c.name).includes(slug(chName)) || slug(chName).includes(slug(c.name)));
  if (ch) d.chassisKey = ch.key; else if (old.chassisKey) notes.push(`The old chassis (${old.chassisKey}) has no match: pick it again.`);
  const m = /^pp-([a-z]+)-(.+)$/.exec(old.powerPlantKey ?? "");
  if (ch && m) {
    const engine = { electric: "electric", methane: "methane", gasoline: "gasoline", diesel: "diesel", jet: "jetPropeller", sail: "sail" }[m[1]] ?? m[1];
    const pp = Object.values(tables.powerPlants ?? {}).find(p => p.chassis.includes(ch.key) && (p.engine === engine || p.engine.toLowerCase().startsWith(m[1])));
    if (pp) d.powerPlantKey = pp.key; else notes.push("The old power plant has no match for this chassis: pick it again.");
  } else if (old.powerPlantKey) notes.push("Pick the power plant again.");
  const imp = old.improvements ?? {};
  for (const k of ["speed", "acceleration", "cargo"]) d[k] = num(imp[k]);
  d.load = Math.round(num(imp.load) / 10) * 10;
  if (num(imp.handling)) { d.handling = num(imp.handling); notes.push("The old Handling improvement is applied on-road; switch it to off-road if that's what you meant."); }
  if (num(imp.armor)) notes.push(`The old design bought ${imp.armor} Armor: add Standard Vehicle Armor at that rating in Modifications.`);
  for (const k of ["economy", "signature", "fuel"]) if (num(imp[k])) notes.push(`The old ${k} purchase (${imp[k]}) used a different rule: set it again in Design options.`);
  if (num(old.modDP)) { d.gmDP = num(old.modDP); notes.push(`The old manual "Extra DP" (${old.modDP}) is kept as GM-set design options.`); }
  if (num(old.markUp) && num(old.markUp) !== 1) notes.push(`The old Mark-Up was ${old.markUp}: set it again in Price.`);
  return { design: d, notes };
}

export class VehicleWorkshop extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Open one Workshop per vehicle (or a blank one for a new vehicle). */
  static open(actor = null, { linkTo = null } = {}) {
    const id = `sr2e-vehicle-workshop-${actor?.id ?? `new-${linkTo?.id ?? ""}`}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) { existing.bringToFront(); return existing; }
    return new VehicleWorkshop({ id, actor, linkTo }).render(true);
  }

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sr2e-workshop"],
    window: { title: "Vehicle Workshop", icon: "fas fa-screwdriver-wrench", resizable: true },
    position: { width: 1120, height: 780 },
    actions: {
      step: VehicleWorkshop.#onStep, pickChassis: VehicleWorkshop.#onPickChassis, pickPlant: VehicleWorkshop.#onPickPlant,
      bump: VehicleWorkshop.#onBump, toMax: VehicleWorkshop.#onToMax, addMod: VehicleWorkshop.#onAddMod,
      removeMod: VehicleWorkshop.#onRemoveMod, category: VehicleWorkshop.#onCategory, save: VehicleWorkshop.#onSave,
      next: VehicleWorkshop.#onNext, back: VehicleWorkshop.#onBack, classify: VehicleWorkshop.#onClassify
    }
  };

  static PARTS = { main: { template: "systems/sr2e/templates/apps/vehicle-workshop.hbs", scrollable: [".ws-step", ".ws-summary"] } };

  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
    this.linkTo = options.linkTo ?? null;   // a character to link a NEW vehicle to (their Vehicles tab)
    this.step = "chassis";
    this.category = "car";
    this.modFilter = "";
    this.notes = [];
    this.name = this.actor?.name ?? "New vehicle";
    const tables = this.tables;
    const stored = this.actor?.system?.design;
    if (stored?.version === 2) this.design = foundry.utils.mergeObject(blankDesign(), foundry.utils.deepClone(stored.choices ?? {}));
    else if (stored?.chassisKey) {   // an old Design-tab design: converted, then checked by the owner
      const c = convertV1(stored, tables);
      this.design = c.design;
      this.notes = ["This vehicle was designed with the old Design tab. The Workshop carried over what it could; check every step before saving.", ...c.notes];
      this.convertMods = true;
    } else this.design = blankDesign();
    if (this.design.chassisKey) {
      this.category = tables.chassis[this.design.chassisKey]?.category ?? "car";
      this.step = "review";
    }
    // Mods: the Workshop's own (flagged) items, and every other mod as a read-only customization. A converted old
    // design proposes its mods as design mods (the old tab counted them all); the owner marks any as a customization.
    this.mods = [];
    for (const i of this.actor?.items ?? []) if (i.type === "vehicle_mod") this.mods.push(this.#modFromItem(i, this.convertMods));
    // Drive-by-wire's split lives on its item (plan C1.5); the Workshop edits it as part of the design.
    const dbwItem = this.mods.find(m => !m.customization && m.system.modKey === "drive-by-wire" && Object.keys(m.system.custom?.choice ?? {}).length);
    if (dbwItem) this.design.dbwSplit = { ...dbwItem.system.custom.choice };
    this.catalog = null;
    this.removed = new Set();   // item ids removed here, deleted on save
  }

  #modFromItem(i, convert = false) {
    const mine = !!i.getFlag("sr2e", "designMod") || convert;
    return { uid: foundry.utils.randomID(), itemId: i.id, name: i.name, img: i.img, system: foundry.utils.deepClone(i.system),
      design: mine, customization: !mine, converted: convert && !i.getFlag("sr2e", "designMod"), loadedRating: num(i.system.rating),
      loadedSys: sansRating(i.system) };
  }

  /**
   * Before a save, catch up with the vehicle's items as they are NOW: items added or removed elsewhere join or leave,
   * and a rating changed on the sheet wins unless it was also changed here. Returns what was adopted, for a notice.
   */
  #refreshFromActor() {
    const actor = this.actor;
    if (!actor) return [];
    const adopted = [];
    const live = new Map(actor.items.filter(i => i.type === "vehicle_mod").map(i => [i.id, i]));
    for (const m of this.mods) if (m.itemId && !live.has(m.itemId)) adopted.push(`${m.name} removed`);
    this.mods = this.mods.filter(m => !m.itemId || live.has(m.itemId));
    for (const m of this.mods) {
      const item = m.itemId && live.get(m.itemId);
      if (!item) continue;
      const now = num(item.system.rating);
      if (now !== m.loadedRating) {
        if (num(m.system.rating) === m.loadedRating) { m.system.rating = now; adopted.push(`${m.name} is now ${now}`); }
        else adopted.push(`${m.name} was set to ${now} on the sheet; the Workshop's ${m.system.rating} is kept`);
      }
      // Everything but the Rating is edited only on the item's sheet: a change there is always taken in.
      const sys = sansRating(item.system);
      if (sys !== m.loadedSys) { m.system = { ...foundry.utils.deepClone(item.system), rating: m.system.rating }; if (!m.customization) adopted.push(`${m.name} was edited`); }
      if (m.customization) m.system = foundry.utils.deepClone(item.system);
      m.loadedRating = now;
      m.loadedSys = sys;
    }
    const known = new Set([...this.mods.map(m => m.itemId), ...this.removed]);
    for (const i of live.values()) if (!known.has(i.id)) { this.mods.push(this.#modFromItem(i)); adopted.push(i.name); }
    return adopted;
  }

  get title() { return this.actor ? `Vehicle Workshop: ${this.actor.name}` : "Vehicle Workshop: new vehicle"; }

  get tables() { return CONFIG.SR2E.vehicleDesignTables ?? { chassis: {}, powerPlants: {}, fuel: {}, markUp: {} }; }

  /** The engine's view of the mods: design mods as design, customizations as `design: false`. */
  engineMods() {
    // The design's own DBW split (this.design.dbwSplit) is the one being edited here, not the saved item's choice.
    return this.mods.map(m => ({ ...m.system, name: m.name, design: !m.customization,
      custom: { ...(m.system.custom ?? {}), choice: m.customization ? m.system.custom?.choice : {} } }));
  }

  result() { return designVehicle(this.design, this.tables, { mods: this.engineMods() }); }

  async _prepareContext() {
    const tables = this.tables, d = this.design, r = this.result();
    const ch = tables.chassis[d.chassisKey] ?? null, pp = tables.powerPlants[d.powerPlantKey] ?? null;
    const haveTables = Object.keys(tables.chassis).length > 0;
    const stepIndex = STEPS.indexOf(this.step);
    const ctx = {
      haveTables, name: this.name, isGM: game.user.isGM, notes: this.notes, step: this.step,
      steps: STEPS.map((s, i) => ({ key: s, label: STEP_LABELS[s], n: i + 1, active: s === this.step,
        done: (s === "chassis" && !!ch) || (s === "plant" && !!pp), locked: i > 0 && !ch || (i > 1 && !pp) })),
      first: stepIndex === 0, last: stepIndex === STEPS.length - 1,
      chassis: ch, plant: pp, result: r, summary: this.#summary(r, ch, pp),
      saveLabel: this.actor ? "Update vehicle" : "Create vehicle",
      canSave: haveTables && r.valid && !!ch && !!pp
    };
    if (this.step === "chassis") ctx.chassisStep = this.#chassisStep(tables);
    if (this.step === "plant") ctx.plantStep = this.#plantStep(tables, ch);
    if (this.step === "options") ctx.optionsStep = this.#optionsStep(r, ch, pp);
    if (this.step === "mods") ctx.modsStep = await this.#modsStep(r, ch, pp);
    if (this.step === "price") ctx.priceStep = this.#priceStep(r, ch);
    return ctx;
  }

  /* ── Step contexts ─────────────────────────────────────────────────────────────────────────────────────────── */

  #chassisStep(tables) {
    const rows = Object.values(tables.chassis).filter(c => c.category === this.category).map(c => ({
      key: c.key, name: c.name, dp: c.dp, drone: !!c.drone, selected: c.key === this.design.chassisKey,
      handling: typeof c.handling === "object" ? `${c.handling.onRoad}/${c.handling.offRoad}` : c.handling,
      body: c.body, armor: c.armor, cargo: `${c.cargo.start}–${c.cargo.max}`, seating: c.seating, entry: c.entry,
      pilot: c.pilot ?? "—", sensor: c.sensor, autonav: c.autonav ?? "—", lt: c.lt, accessories: (c.accessories ?? []).join(", "), page: c.page }));
    return { categories: Object.entries(CATEGORIES).map(([k, label]) => ({ key: k, label, active: k === this.category })), rows };
  }

  #plantStep(tables, ch) {
    if (!ch) return { groups: [] };
    const body = num(ch.body), cell = (v) => evalCell(v, body);
    const fmtSpeed = (s) => s.stall != null ? `${cell(s.stall)}/${cell(s.start)}–${cell(s.max)}` : `${cell(s.start)}–${cell(s.max)}`;
    const groups = {};
    for (const p of Object.values(tables.powerPlants)) {
      if (!p.chassis.includes(ch.key)) continue;
      (groups[p.engine] ??= []).push({ key: p.key, label: p.label, selected: p.key === this.design.powerPlantKey,
        speed: fmtSpeed(p.speed), accel: p.acceleration ? `${cell(p.acceleration.start)}–${cell(p.acceleration.max)}` : "NA",
        load: `${cell(p.load.start)}–${cell(p.load.max)} kg`, sig: cell(p.signature) ?? "—",
        economy: p.economy?.start != null ? `${cell(p.economy.start)}–${cell(p.economy.max)} ${p.economy.unit}` : "NA",
        idle: p.economy?.idle ? `idle ${[p.economy.idle.start, p.economy.idle.max].filter(Boolean).join(" / ")}` : "",
        fuel: p.fuel?.size != null ? `${cell(p.fuel.size)} ${p.fuel.unit}` : "NA", dp: cell(p.dp), page: p.page });
    }
    return { groups: Object.entries(groups).map(([e, rows]) => ({ engine: ENGINES[e] ?? e, rows })) };
  }

  #optionsStep(r, ch, pp) {
    if (!ch || !pp) return null;
    const d = this.design, lim = r.limits ?? {}, body = num(ch.body), cell = (v) => evalCell(v, body);
    // value = what the options bought (their limit applies to it); withMods = the stat once mods change it.
    const o = r.optionStats ?? {};
    const stat = (key, label, page, perStep, unit, withMods, start, max, step = 1) => ({
      key, label, page, perStep, unit, value: o[key], withMods: withMods !== o[key] ? withMods : null, start, hi: max, step, delta: num(d[key]),
      canUp: max == null || o[key] + step <= max, cost: Math.max(0, num(d[key])) / step * perStep });
    const ground = (ch.category === "bike" || ch.category === "car") && typeof ch.handling === "object";
    const orig = ground ? ch.handling[d.handlingTrack === "offRoad" ? "offRoad" : "onRoad"] : num(ch.handling);
    const floor = Math.ceil(orig / 2);
    const hNow = ground ? o.handling?.[d.handlingTrack === "offRoad" ? "offRoad" : "onRoad"] : o.handling;
    const ecoStart = cell(pp.economy?.start);
    return {
      rows: [
        stat("speed", "Speed", "p.117", 2, "", r.stats.speed, cell(pp.speed.start), lim.speed),
        ...(pp.acceleration ? [stat("acceleration", "Acceleration", "p.115", 2, "", r.stats.acceleration, cell(pp.acceleration.start), lim.acceleration)] : []),
        stat("load", "Load", "p.117", 1, "kg", r.stats.load, cell(pp.load.start), lim.load, 10),
        stat("cargo", "Cargo", "p.116", 5, "CF", r.stats.cargo, num(ch.cargo.start), lim.cargo)
      ],
      handling: { ground, track: d.handlingTrack, bought: Math.max(0, num(d.handling)), value: hNow, orig, floor,
        canUp: hNow - 1 >= floor, sm: !!d.smartMaterials },
      economy: { has: ecoStart != null, steps: num(d.economySteps), value: r.stats.economy == null ? "NA" : Math.round(r.stats.economy * 1000) / 1000,
        unit: pp.economy?.unit, hi: lim.economy, canUp: ecoStart != null && ecoStart * 1.05 ** (num(d.economySteps) + 1) <= (lim.economy ?? Infinity) + 1e-9 },
      fuel: { has: !!this.tables.fuel?.[pp.engine], steps: num(d.fuelSteps), value: r.stats.fuelSize, unit: r.stats.fuelUnit,
        row: this.tables.fuel?.[pp.engine] },
      signature: { levels: num(d.signature), value: r.stats.signature },
      smartMaterials: !!d.smartMaterials,
      tires: { has: ["bike", "car"].includes(ch.category), value: d.tires ?? "", fitted: r.tire ?? null },
      takeoff: { allowed: ch.category === "fixedWing", value: d.takeoff },
      hydrofoil: { allowed: ch.category === "boat" && ch.subtype !== "skiff" && pp.engine !== "sail", value: !!d.hydrofoil },
      amenities: d.amenities, medical: num(d.medicalPatients), agility: num(d.structuralAgility),
      engineCustom: { speed: num(d.engineCustom?.speed), acceleration: num(d.engineCustom?.acceleration), load: num(d.engineCustom?.load),
        hasAccel: !!pp.acceleration, loadStep: body * 50 },
      gmDP: num(d.gmDP)
    };
  }

  async #modsStep(r, ch, pp) {
    this.catalog ??= await VehicleWorkshop.loadCatalog();
    const build = { body: num(ch?.body), pilot: num(evalCell(ch?.pilot, num(ch?.body))), chassisDP: num(evalCell(ch?.dp, 0)),
      plantDP: num(evalCell(pp?.dp, num(ch?.body))) };
    const f = this.modFilter.trim().toLowerCase();
    const ctx = { category: ch?.category, engine: pp?.engine, drone: !!ch?.drone, body: num(ch?.body), sensor: num(ch?.sensor),
      keys: new Set(this.mods.map(m => m.system.modKey).filter(Boolean)), engineCustomLevels: Object.values(this.design.engineCustom ?? {}).reduce((t, l) => t + num(l), 0) };
    const catalog = this.catalog.filter(m => !f || m.name.toLowerCase().includes(f) || (m.system.modType ?? "").includes(f)).map(m => {
      const s = { ...m.system, rating: Math.max(1, num(m.system.rating) || 1) };
      const why = m.system.designable === false ? ["customization only (install it after the vehicle is built)"] : modProblems(s, build, ctx);
      return { uuid: m.uuid, name: m.name, type: m.system.modType, dp: m.system.designNuyen ? `${m.system.cost}¥` : modDesignDP(s, build),
        cf: modCf(s, build), load: modLoad(s, build), blocked: why.join("; "), page: (/Design specifications (p\.\d+)/.exec(m.system.notes ?? "") ?? [])[1] ?? "" };
    });
    const installed = this.mods.map(m => ({ uid: m.uid, name: m.name, rating: m.system.rating, customization: m.customization, converted: m.converted,
      rated: !!(m.system.dpPerLevel || m.system.dpTable?.length || m.system.cfPerLevel || /R/.test(`${m.system.dpFormula}${m.system.cfFormula}${m.system.loadFormula}`)),
      maxRating: m.system.maxRating, dp: m.customization ? "—" : (m.system.designNuyen ? `${m.system.cost}¥` : modDesignDP(m.system, build)),
      cf: modCf(m.system, build), load: modLoad(m.system, build) }));
    const dbw = this.mods.some(m => !m.customization && m.system.modKey === "drive-by-wire" && num(m.system.rating) > 0)
      ? Object.assign({ acceleration: 10, speed: 0, load: 0 }, this.design.dbwSplit ?? {}) : null;
    return { filter: this.modFilter, catalog, installed, budgets: r.budgets, dbw };
  }

  #priceStep(r, ch) {
    const t = this.tables.markUp ?? {}, mu = this.design.markUp ?? {};
    const range = (cell) => Array.isArray(cell) ? { lo: cell[0], hi: cell[1] } : null;
    return {
      base: r.markUp?.base, baseRange: range(t.base?.[ch?.category]), baseValue: num(mu.base) || (range(t.base?.[ch?.category])?.lo ?? 0),
      smart: !!this.design.smartMaterials,
      features: [
        { key: "ambulance", label: "Ambulance or medical treatment vehicle", fixed: t.features?.ambulance, value: !!mu.features?.ambulance },
        { key: "nonCombat", label: "Specialized non-combat vehicle (e.g. fire truck)", ...range(t.features?.nonCombat), value: num(mu.features?.nonCombat) },
        { key: "unusual", label: "Unusual or uncommon accessories and features", ...range(t.features?.unusual), value: num(mu.features?.unusual) }
      ],
      multipliers: [
        { key: "luxury", label: "Luxury vehicle", ...range(t.multipliers?.luxury), value: num(mu.multipliers?.luxury) },
        { key: "security", label: "Security grade", ...range(t.multipliers?.security), value: num(mu.multipliers?.security) },
        { key: "military", label: "Military grade", ...range(t.multipliers?.military), value: num(mu.multipliers?.military) },
        { key: "drone", label: "Drone", fixed: t.multipliers?.drone, value: !!mu.multipliers?.drone, suggest: !!ch?.drone }
      ],
      round: num(mu.round), markUp: r.markUp, price: r.price, dp: r.dp,
      militaryHint: this.mods.some(m => /RAM|Smart Armor/i.test(m.name)) ? "RAM and smart armor make a design military-grade (p.129–130)." : ""
    };
  }

  /** The live summary: the stat block in the book's format, the DP lines, the budgets, the price, the problems. */
  #summary(r, ch, pp) {
    const s = r.stats ?? {};
    const h = s.handling == null ? "—" : typeof s.handling === "object" ? `${s.handling.onRoad}/${s.handling.offRoad}` : s.handling;
    const speed = s.speed == null ? "—" : s.stallSpeed != null ? `${s.stallSpeed}/${s.speed}` : s.speed;
    const b = r.budgets;
    const bar = (used, total) => total > 0 ? Math.min(100, Math.round((used / total) * 100)) : (used > 0 ? 100 : 0);
    return {
      ready: !!(ch && pp), chassisName: ch?.name, plantName: pp?.label,
      stats: [["Handling", h], ["Speed", speed], ["Accel", s.acceleration ?? "NA"], ["Body", s.body ?? "—"], ["Armor", s.armor ?? "—"],
        ["Sig", s.signature ?? "—"], ["Autonav", s.autonav ?? "—"], ["Pilot", s.pilot ?? "—"], ["Sensor", s.sensor ?? "—"]].map(([k, v]) => ({ k, v })),
      seating: `${s.seating ?? ""}${s.seatingExtra ? ` +${s.seatingExtra}` : ""}`, entry: s.entryPoints, lt: s.ltProfile, setup: s.setupTime,
      economy: s.economy == null ? "NA" : `${Math.round(s.economy * 1000) / 1000} ${s.economyUnit}`, fuel: s.fuelSize == null ? "NA" : `${s.fuelType} ${s.fuelSize} ${s.fuelUnit}`,
      cf: b ? { used: b.cfUsed, total: b.cargo, free: b.modCfFree, pct: bar(b.cfUsed, b.cargo), over: b.modCfFree < 0, restricted: b.restrictedCf } : null,
      load: b ? { used: b.loadUsed, total: b.load, free: b.loadFree, pct: bar(b.loadUsed, b.load), over: b.loadFree < 0 } : null,
      dp: r.dp, lines: r.dpLines ?? [], markUp: r.markUp?.total, price: r.price, problems: r.problems ?? []
    };
  }

  /** Every vehicle_mod in the world's Item compendia (the Rigger 2 module's, and any other module's). */
  static async loadCatalog() {
    const out = [];
    for (const pack of game.packs) {
      if (pack.documentName !== "Item") continue;
      const index = await pack.getIndex({ fields: ["type"] });
      if (!index.some(e => e.type === "vehicle_mod")) continue;
      for (const doc of await pack.getDocuments({ type: "vehicle_mod" })) out.push({ uuid: doc.uuid, name: doc.name, img: doc.img, system: doc.toObject().system });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ── Input wiring: every field writes the working design and re-renders ─────────────────────────────────── */

  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const el of this.element.querySelectorAll("[data-field]")) {
      el.addEventListener("change", () => this.#setField(el.dataset.field, el));
    }
    const search = this.element.querySelector("[data-mod-filter]");
    search?.addEventListener("input", foundry.utils.debounce(() => { this.modFilter = search.value; this.render(); }, 250));
    const nameEl = this.element.querySelector("[data-name]");
    nameEl?.addEventListener("change", () => { this.name = nameEl.value.trim() || "New vehicle"; });
  }

  #setField(path, el) {
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.type === "number" || el.dataset.number !== undefined) v = num(v);
    if (path.startsWith("mod.")) {   // mod.<uid>.rating
      const [, uid, key] = path.split(".");
      const m = this.mods.find(x => x.uid === uid);
      if (m) m.system[key] = Math.max(0, Math.floor(num(v)));
    } else foundry.utils.setProperty(this.design, path, v);
    this.render();
  }

  /* ── Actions ────────────────────────────────────────────────────────────────────────────────────────────── */

  static #onStep(event, target) { this.step = target.dataset.step; this.render(); }
  static #onNext() { const i = STEPS.indexOf(this.step); if (i < STEPS.length - 1) { this.step = STEPS[i + 1]; this.render(); } }
  static #onBack() { const i = STEPS.indexOf(this.step); if (i > 0) { this.step = STEPS[i - 1]; this.render(); } }
  static #onCategory(event, target) { this.category = target.dataset.category; this.render(); }

  static #onPickChassis(event, target) {
    const key = target.dataset.key;
    // A new chassis: its power plant and the options priced from it start over; the Mark-Up choices stay.
    if (key !== this.design.chassisKey) this.design = { ...blankDesign(), chassisKey: key, markUp: this.design.markUp };
    this.step = "plant";
    this.render();
  }

  static #onPickPlant(event, target) {
    if (target.dataset.key !== this.design.powerPlantKey) {
      Object.assign(this.design, { powerPlantKey: target.dataset.key, speed: 0, acceleration: 0, load: 0, economySteps: 0, fuelSteps: 0,
        engineCustom: { speed: 0, acceleration: 0, load: 0 } });
    }
    this.step = "options";
    this.render();
  }

  /** +/− on a stepper: data-path, data-by (signed step). */
  static #onBump(event, target) {
    const path = target.dataset.path, by = num(target.dataset.by);
    foundry.utils.setProperty(this.design, path, num(foundry.utils.getProperty(this.design, path)) + by);
    this.render();
  }

  /** Raise a rating to its maximum in one click. */
  static #onToMax(event, target) {
    const key = target.dataset.key, r = this.result();
    const max = r.limits?.[key], step = key === "load" ? 10 : 1;
    const start = num(r.optionStats?.[key]) - num(this.design[key]);   // the table's start: options only, never mods
    if (max != null && start != null) this.design[key] = Math.floor((max - start) / step) * step;
    this.render();
  }

  static async #onAddMod(event, target) {
    const src = this.catalog?.find(m => m.uuid === target.dataset.uuid);
    if (!src) return;
    const system = foundry.utils.deepClone(src.system);
    system.rating = Math.max(1, num(system.rating) || 1);
    this.mods.push({ uid: foundry.utils.randomID(), itemId: null, name: src.name, img: src.img, system, design: true, customization: false, sourceUuid: src.uuid });
    this.render();
  }

  /** A converted old design's mod: count it in the design, or keep it as a later customization (plan §1c). */
  static #onClassify(event, target) {
    const m = this.mods.find(x => x.uid === target.dataset.uid);
    if (!m?.converted) return;
    m.customization = !m.customization;
    m.design = !m.customization;
    this.render();
  }

  static #onRemoveMod(event, target) {
    const m = this.mods.find(x => x.uid === target.dataset.uid);
    if (!m || m.customization) return;
    this.mods = this.mods.filter(x => x !== m);
    if (m.itemId) this.removed.add(m.itemId);
    this.render();
  }

  static async #onSave() {
    const adopted = this.#refreshFromActor();
    if (adopted.length) {
      this.render();
      return ui.notifications.warn(`The vehicle changed while the Workshop was open (${adopted.join(", ")}). Check the design, then save again.`);
    }
    const r = this.result();
    const tables = this.tables, ch = tables.chassis[this.design.chassisKey], pp = tables.powerPlants[this.design.powerPlantKey];
    if (!ch || !pp) return ui.notifications.warn("Pick a chassis and a power plant first.");
    if (!r.valid) return ui.notifications.warn(`The design has problems: ${r.problems.map(p => p.msg).join(" ")}`);
    const update = workshopUpdate(this.design, r, ch, pp, this.name);
    // Engine customization levels this save ADDS (against the design as stored now) get the GM's secret failure check
    // (R2 p.120): one pending key per save, written with the design, resolved by the GM (vehicle-play gmEnginePass).
    const stored = this.actor?.system?.design?.choices?.engineCustom ?? {};
    const added = ["speed", "acceleration", "load"].reduce((t, k) => t + Math.max(0, num(this.design.engineCustom?.[k]) - num(stored[k])), 0);
    if (added > 0) update[`flags.sr2e.pendingEngineChecks.${foundry.utils.randomID(12)}`] = { addedLevels: added };
    if (!this.actor) {
      if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn("You need the GM's \"Create New Actors\" permission to build a new vehicle (or ask the GM to create it, then edit it here).");
      // A new vehicle starts with its chassis' exemplar picture and token (the player can change it any time).
      const art = chassisArt(ch) ?? { img: "icons/svg/car.svg", "prototypeToken.lockRotation": true };
      const actor = await Actor.create({ name: this.name, type: "vehicle", ...foundry.utils.expandObject({ ...art, ...update }) });
      if (!actor) return;
      this.actor = actor;
      if (this.linkTo?.isOwner) {
        const linked = this.linkTo.system.linkedVehicles ?? [];
        if (!linked.includes(actor.uuid)) await this.linkTo.update({ "system.linkedVehicles": [...linked, actor.uuid] });
      }
    } else {
      if (this.actor.system.design?.version !== 2 && !this.actor.system.design?.chassisKey) {
        // A production vehicle: designing it from scratch replaces its stats. Ask, showing what changes (plan §1c).
        const diff = statDiff(this.actor, update);
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Replace this vehicle's stats?" },
          content: `<p>${esc(this.actor.name)} wasn't designed in the Workshop. Saving this design replaces its stats:</p>${diff || "<p>(no stat changes)</p>"}` });
        if (!ok) return;
      }
      // A redesign changes the picture only while it's still a default (never one somebody chose).
      const art = hasDefaultArt(this.actor, this.tables) ? chassisArt(ch) : null;
      await this.actor.update(art ? { ...update, ...art } : update);
    }
    await this.#reconcileMods();
    ui.notifications.info(`${this.actor.name} saved: ${r.dp} Design Points, ${r.price.toLocaleString()}¥.`);
    this.notes = [];
    this.convertMods = false;
    for (const m of this.mods) m.converted = false;
    this.render();
  }

  /** Create, update and delete only the Workshop's own (flagged) mods; customizations are never touched. */
  async #reconcileMods() {
    const actor = this.actor;
    const mine = this.mods.filter(m => !m.customization);
    const keepIds = new Set(mine.map(m => m.itemId).filter(Boolean));
    const toDelete = actor.items.filter(i => i.type === "vehicle_mod" && i.getFlag("sr2e", "designMod") && !keepIds.has(i.id)).map(i => i.id);
    if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);
    const choiceFor = (m) => m.system.modKey === "drive-by-wire" ? { acceleration: 10, speed: 0, load: 0, ...(this.design.dbwSplit ?? {}) } : (m.system.custom?.choice ?? {});
    for (const m of mine) m.system.custom = { ...(m.system.custom ?? {}), choice: choiceFor(m) };
    const updates = mine.filter(m => m.itemId && actor.items.get(m.itemId)).map(m => ({ _id: m.itemId, "system.rating": num(m.system.rating), "system.custom.choice": choiceFor(m), "flags.sr2e.designMod": true }));
    for (const m of mine) m.loadedRating = num(m.system.rating);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    const creates = mine.filter(m => !m.itemId).map(m => ({ name: m.name, type: "vehicle_mod", img: m.img, system: m.system, flags: { sr2e: { designMod: true, wsUid: m.uid } } }));
    if (creates.length) {
      // Each new item takes its id back, so the next save updates it instead of adding another.
      const made = await actor.createEmbeddedDocuments("Item", creates);
      // Matched by uid: createEmbeddedDocuments doesn't return them in order.
      for (const doc of made) {
        const m = mine.find(x => !x.itemId && x.uid === doc.getFlag("sr2e", "wsUid"));
        if (m) Object.assign(m, { itemId: doc.id, loadedRating: num(doc.system.rating), loadedSys: sansRating(doc.system) });
      }
    }
    // What was just written is the new "loaded" state, so the next save doesn't mistake it for an edit made elsewhere.
    for (const m of mine) { const it = actor.items.get(m.itemId); if (it) Object.assign(m, { loadedRating: num(it.system.rating), loadedSys: sansRating(it.system) }); }
  }
}

/** An item's system data minus its Rating, to spot edits made on its sheet. */
const sansRating = (sys) => JSON.stringify({ ...(sys?.toObject?.() ?? sys), rating: 0 });

/** The actor update a design writes: BASE stats (gross Cargo/Load), the vehicle type, the stored design. */
export function workshopUpdate(design, r, ch, pp, name) {
  // BASE stats (plan C1): design options only; the sheet applies every mod's effects on top (applyModEffects).
  const s = { ...r.stats, ...r.baseStats };
  const t = vehicleTypeFor(ch);
  const pair = typeof s.handling === "object";
  return {
    ...(name ? { name } : {}),
    "system.vehicleType": t.vehicleType, "system.skill": t.skill ?? "",
    "system.handling": pair ? s.handling.onRoad : s.handling, "system.handlingOffRoad": pair ? s.handling.offRoad : null,
    "system.speed": num(s.speed), "system.stallSpeed": num(s.stallSpeed), "system.acceleration": num(s.acceleration),
    "system.body": num(s.body), "system.armor": num(s.armor), "system.signature": num(s.signature),
    "system.pilot": num(s.pilot), "system.sensor": num(s.sensor), "system.autonav": num(s.autonav),
    "system.cargo": num(s.cargo), "system.load": num(s.load),
    "system.seating": String(s.seating ?? ""), "system.seatingExtra": num(s.seatingExtra), "system.entryPoints": String(s.entryPoints ?? ""),
    "system.ltProfile": String(s.ltProfile ?? ""), "system.setupTime": String(s.setupTime ?? ""),
    "system.economy": num(s.economy), "system.economyUnit": String(s.economyUnit ?? ""), "system.economyIdle": String(s.economyIdle ?? ""),
    "system.fuelType": String(s.fuelType ?? ""), "system.fuelSize": num(s.fuelSize), "system.fuelUnit": String(s.fuelUnit ?? ""),
    "system.otherFeatures": (s.accessories ?? []).join(", "),
    "system.designPointValue": num(r.dp), "system.cost": num(r.price),
    "system.design.version": 2, "system.design.baseVersion": 2, "system.tires": String(design.tires ?? ""), "system.design.category": ch.category ?? "", "system.design.transport": isTransport(ch), "system.design.chassisKey": design.chassisKey, "system.design.powerPlantKey": design.powerPlantKey,
    "system.design.choices": foundry.utils.deepClone(design),
    "system.design.optionCf": num(r.options?.cf), "system.design.optionLoad": num(r.options?.load), "system.design.restrictedCf": num(r.options?.restrictedCf)
  };
}

/** A small HTML table of the stats an update would change on this actor. */
function statDiff(actor, update) {
  const rows = [];
  for (const [path, v] of Object.entries(update)) {
    if (!path.startsWith("system.") || path.startsWith("system.design")) continue;
    const old = foundry.utils.getProperty(actor, path);
    if (old !== v && !(old == null && (v === "" || v === 0))) rows.push(`<tr><td>${esc(path.slice(7))}</td><td>${esc(old)}</td><td>→ ${esc(v)}</td></tr>`);
  }
  return rows.length ? `<table class="ws-diff">${rows.join("")}</table>` : "";
}

/** Open the Workshop from anywhere (`game.sr2e.vehicleWorkshop(actor)`). */
export const openVehicleWorkshop = (actor = null, opts = {}) => VehicleWorkshop.open(actor, opts);

/** The Actors sidebar button, for anyone who may create actors. */
export function registerVehicleWorkshop() {
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.can("ACTOR_CREATE")) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const actions = root?.querySelector(".header-actions");
    if (!actions || actions.querySelector("[data-sr2e-workshop]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.sr2eWorkshop = "1";
    b.innerHTML = `<i class="fas fa-screwdriver-wrench"></i> Vehicle Workshop`;
    b.title = "Design a vehicle from scratch (Rigger 2 p.108–146)";
    b.addEventListener("click", () => openVehicleWorkshop());
    actions.append(b);
  });
}
