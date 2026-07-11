import { resolveVehicleDesign, aggregateModDesign, modDesignPoints, streetPrice, chargenSpend, weaponFocusCost } from "../rules/sr2e-rules.mjs";
import { headerBanter } from "../banter.mjs";
import {
  SHARED_ACTIONS, detectAttackTarget, promptWeaponAttackOptions,
  onAddItem, onDeleteItem, onEditItem,
  onRollAttribute, onRollSkill, onRollInitiative, onRollWeapon,
  onMatrixAttack, onMatrixPerception, onResetHostTally
} from "./sheet-actions.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

// V13: TextEditor is namespaced; shim for backwards compat
const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

// =========================================================================
// BASE ACTOR SHEET
// =========================================================================

/**
 * Shared base class for all SR2E actor sheets.
 *
 * Centralizes the V13 ApplicationV2 boilerplate — part context, drag-drop,
 * prose-mirror auto-save and the submitOnChange workarounds — so every sheet
 * (not just the character sheet) gets the same data-loss protections.
 */
class SR2EBaseActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor"],
    form: {
      submitOnChange: true
    },
    window: {
      resizable: true
    },
    // V13: register DragDrop so _onDragOver/_onDrop/_onDragStart are bound.
    // Without this, dragover never calls preventDefault(), letting the browser's
    // native drop behaviour fire on form <select> elements and corrupt their values.
    dragDrop: [{ dragSelector: "[data-item-id]", dropSelector: null }]
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor    = this.document;
    context.system   = this.document.system;
    context.config   = CONFIG.SR2E;
    context.editable = this.isEditable;
    return context;
  }

  /**
   * @override
   * V13 signature: _preparePartContext(partId, context, options)
   */
  async _preparePartContext(partId, context, options) {
    context.partId = `${this.id}-${partId}`;
    context.tab = context.tabs?.[partId];
    return context;
  }

  /* -----------------------------------------------------------------------
   * Drag-and-Drop
   * V13 ApplicationV2: dragover must preventDefault to allow drops;
   * _onDrop parses the transfer payload and dispatches to _onDropItem.
   * ----------------------------------------------------------------------- */

  /** @override */
  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  /** @override */
  _onDragStart(event) {
    const li = event.currentTarget.closest("[data-item-id]");
    if (!li) return;
    const item = this.document.items.get(li.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
  }

  /** @override */
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch(e) { return; }
    if (data?.type === "Item") return this._onDropItem(event, data);
  }

  /**
   * Handle dropping an Item onto the actor sheet.
   * Supports compendium browser, world sidebar, and inter-actor drops.
   */
  async _onDropItem(event, data) {
    if (!this.document.isOwner) return false;
    let itemData;
    if (data.uuid) {
      const item = await fromUuid(data.uuid);
      if (!item) return false;
      if (item.parent?.uuid === this.document.uuid) return false;
      itemData = item.toObject();
    } else if (data.data) {
      itemData = data.data;
    } else {
      return false;
    }
    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * @override
   * After every render, wire up prose-mirror editors and hidden-tab inputs
   * for reliable saves.
   *
   * Problem 1: HTMLProseMirrorElement only commits its content on an explicit
   * save gesture (Ctrl+S / toolbar button). It does NOT auto-save on blur,
   * so content typed without an explicit save is silently lost when the sheet
   * closes or re-renders. Fix: save on focusout.
   *
   * Problem 2: submitOnChange cannot register named fields inside .tab-content
   * sections that start as display:none. Fix: explicit change listeners.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!this.isEditable) return;

    // Prose-mirror blur → auto-save (biography, notes, etc.)
    for (const pm of this.element.querySelectorAll("prose-mirror[name]")) {
      pm.addEventListener("focusout", (event) => {
        if (pm.contains(event.relatedTarget)) return;
        const name = pm.getAttribute("name");
        const value = pm.value ?? "";
        if (name) this.document.update({ [name]: value });
      });
    }

    // Named inputs/selects inside .tab-content sections — submitOnChange cannot
    // register these at sheet-render time because all non-default tabs start as
    // display:none. Wire them up explicitly so any change saves immediately.
    // Propagation is stopped to prevent a double-save where submitOnChange also
    // fires. Inputs inside [data-item-id] belong to embedded Items (below).
    // Also the header stat inputs (Good Karma, Nuyen, Karma Pool): these live
    // outside .tab-content but submitOnChange does not reliably persist them
    // (e.g. Enter or a button-click reading the field before the form commits),
    // which silently dropped Good Karma edits used by Quickening.
    for (const input of this.element.querySelectorAll(
      ".tab-content input[name], .tab-content select[name], .tab-content textarea[name], " +
      ".sr2e-sheet-header input[name], .sr2e-sheet-header select[name]"
    )) {
      if (input.closest("[data-item-id]")) continue;
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        let value = input.value;
        if (input.type === "number")   value = parseFloat(value) || 0;
        if (input.type === "checkbox") value = input.checked;
        this.document.update({ [input.name]: value });
      });
    }

    // Inline embedded-item field changes (e.g. skill rating inputs). These use
    // data-field instead of name because they belong to an embedded Item, not
    // the Actor, so the actor form's submitOnChange never touches them.
    for (const input of this.element.querySelectorAll("[data-item-id] [data-field]")) {
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const itemId = input.closest("[data-item-id]")?.dataset.itemId;
        const field  = input.dataset.field;
        if (!itemId || !field) return;
        const item = this.document.items.get(itemId);
        if (!item) return;
        let value = input.value;
        if (input.type === "number")   value = parseFloat(value) || 0;
        if (input.type === "checkbox") value = input.checked;
        item.update({ [field]: value });
      });
    }
  }

  /**
   * @override
   * Safety-net: inject prose-mirror values into form data before any
   * submitOnChange submission. FormDataExtended may not reliably extract
   * values from form-associated custom elements in all V13 builds. Without
   * this, saving ANY other field (e.g. nuyen) could overwrite biography with
   * an empty string.
   */
  async _processFormData(event, form, formData) {
    for (const pm of form.querySelectorAll("prose-mirror[name]")) {
      const name = pm.getAttribute("name");
      if (!name) continue;
      // Only inject if FormDataExtended didn't already capture the value
      if (!formData.has(name) && typeof pm.value === "string") {
        formData.set(name, pm.value);
      }
    }
    return super._processFormData(event, form, formData);
  }
}

// =========================================================================
// CHARACTER SHEET
// =========================================================================

/**
 * Character Sheet for Shadowrun 2E player characters.
 * Uses the V13 ApplicationV2 framework with HandlebarsApplicationMixin.
 */
export class SR2ECharacterSheet extends SR2EBaseActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "character"],
    position: { width: 800, height: 700 },
    actions: SHARED_ACTIONS
  };

  /** @override */
  static PARTS = {
    header: { template: "systems/sr2e/templates/actor/parts/actor-header.hbs" },
    tabs: { template: "systems/sr2e/templates/actor/parts/actor-tabs.hbs" },
    attributes: { template: "systems/sr2e/templates/actor/parts/actor-attributes.hbs" },
    skills: { template: "systems/sr2e/templates/actor/parts/actor-skills.hbs" },
    combat: { template: "systems/sr2e/templates/actor/parts/actor-combat.hbs" },
    magic: { template: "systems/sr2e/templates/actor/parts/actor-magic.hbs" },
    matrix: { template: "systems/sr2e/templates/actor/parts/actor-matrix.hbs" },
    gear: { template: "systems/sr2e/templates/actor/parts/actor-gear.hbs" },
    vehicles: { template: "systems/sr2e/templates/actor/parts/actor-vehicles.hbs" },
    contacts: { template: "systems/sr2e/templates/actor/parts/actor-contacts.hbs" },
    bio: { template: "systems/sr2e/templates/actor/parts/actor-bio.hbs" }
  };

  /** @override */
  tabGroups = {
    primary: "attributes"
  };

  /**
   * True while an external drag is hovering over this sheet.
   * Used to suppress spurious "change" events that browsers may fire on
   * <select> elements when a dragged item passes over them — those events
   * would trigger submitOnChange and corrupt magic.type / tradition before
   * the actual drop is processed.
   */
  _isDragging = false;

  /* -----------------------------------------------------------------------
   * Drag-and-Drop — extends the base behaviour with race-drop-zone styling
   * and protection of <select> elements during external drags.
   * ----------------------------------------------------------------------- */

  /** @override */
  _onDragOver(event) {
    super._onDragOver(event);
    this._isDragging = true;
    // Disable pointer events on selects so browsers can't fire spurious
    // "change" events on them as the dragged item passes over the sheet.
    this.element?.classList.add("sr2e-dragging");
    // Highlight race drop zone when something is being dragged over the sheet
    const zone = this.element?.querySelector(".race-drop-zone");
    if (zone) zone.classList.add("drag-over");
  }

  /** Clear drag-over highlight when drag leaves the sheet */
  _onDragLeave(event) {
    const zone = this.element?.querySelector(".race-drop-zone");
    if (zone) zone.classList.remove("drag-over");
  }

  /** @override */
  async _onDrop(event) {
    this._isDragging = false;
    this.element?.classList.remove("sr2e-dragging");
    event.preventDefault();
    // Clear drag-over highlight
    const zone = this.element?.querySelector(".race-drop-zone");
    if (zone) zone.classList.remove("drag-over");

    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch(e) { return; }
    if (!data?.type) return;
    if (data.type === "Item") return this._onDropItem(event, data);
    if (data.type === "Actor") return this._onDropActor(event, data);
  }

  /**
   * Handle dropping an Actor (vehicle/drone) onto the character sheet.
   * Adds the actor's UUID to system.linkedVehicles if it is a vehicle type
   * and is not already linked.
   */
  async _onDropActor(event, data) {
    if (!this.document.isOwner) return false;
    if (!data.uuid) return false;
    const dropped = await fromUuid(data.uuid);
    if (!dropped || dropped.type !== "vehicle") return false;
    // Don't link an actor to itself
    if (dropped.uuid === this.document.uuid) return false;
    // A compendium vehicle has no world presence, so it can't be placed on a
    // map. Import it into the Actors directory first, then link that copy.
    let vehicle = dropped;
    if (dropped.pack) {
      vehicle = await game.actors.importFromCompendium(game.packs.get(dropped.pack), dropped.id);
    }
    const current = this.document.system.linkedVehicles ?? [];
    if (current.includes(vehicle.uuid)) return false; // already linked
    return this.document.update({ "system.linkedVehicles": [...current, vehicle.uuid] });
  }

  /**
   * Handle dropping an Item onto the actor sheet.
   * Supports compendium browser, world sidebar, and inter-actor drops.
   * Race items are handled specially: they set the actor's race and apply
   * racial stat adjustments rather than being added to the inventory.
   * @override
   */
  async _onDropItem(event, data) {
    if (!this.document.isOwner) return false;
    let itemData;
    if (data.uuid) {
      const item = await fromUuid(data.uuid);
      if (!item) return false;
      if (item.parent?.uuid === this.document.uuid) return false;
      itemData = item.toObject();
    } else if (data.data) {
      itemData = data.data;
    } else {
      return false;
    }

    // --- Race drop handling ---
    if (itemData.type === "race") return this._onDropRace(itemData);

    // --- Tradition drop handling ---
    if (itemData.type === "tradition") return this._onDropTradition(itemData);

    // --- Weapon focus: bond to an existing melee weapon on drop (SR2E p.126),
    // which prices it (Reach + Force) and auto-bonds/activates it. ---
    if (itemData.type === "focus" && itemData.system?.focusType === "weapon") {
      if (!(await this._bondWeaponFocusOnDrop(itemData))) return null;
    }

    const [created] = await this.document.createEmbeddedDocuments("Item", [itemData]);

    // Auto-charge purchases (user request): characters pay the street price
    // (cost × Street Index) for dropped items; the paid amount is remembered
    // on the item so the sell button can refund it.
    // Hold ALT while dropping to add the item for FREE (found loot / GM gift) —
    // the charge is skipped and no "paid" flag is set, so selling it later
    // credits full value as expected.
    if (created && this.document.type === "character" &&
        game.settings.get("sr2e", "autoChargePurchases")) {
      const cost = Number(created.system?.cost) || 0;
      if (event?.altKey) {
        if (cost > 0) ui.notifications.info(`${created.name} added to ${this.document.name} for free (Alt-drop — no charge).`);
      } else if (cost > 0) {
        // During character creation, gear is bought at LIST price — the
        // Street Index markup only applies to in-play purchases.
        const inChargen = !!this.document.system.chargen?.inProgress;
        const price = inChargen ? cost : streetPrice(cost, created.system.streetIndex);
        const nuyen = this.document.system.nuyen ?? 0;
        if (nuyen >= price) {
          await this.document.update({ "system.nuyen": nuyen - price });
          await created.setFlag("sr2e", "paid", price);
          ui.notifications.info(`${this.document.name} buys ${created.name} for ${price}¥${inChargen ? " (list — character creation)" : (price !== cost ? ` (${cost}¥ list)` : "")} — ${nuyen - price}¥ left.`);
        } else {
          // Can't afford it — refuse the purchase rather than leave an unpaid
          // item on the sheet (which could then be sold for profit it never
          // cost). Alt-drop still adds it for free intentionally.
          await created.delete();
          ui.notifications.warn(`${this.document.name} can't afford ${created.name} (${price}¥ > ${nuyen}¥) — not added. Alt-drop to add it for free.`);
          return null;
        }
      }
    }
    return created;
  }

  /**
   * A weapon focus must bond to an existing melee weapon on drop (SR2E p.126):
   * prompt for one, then stamp bond fields + the derived price onto `itemData`
   * (mutated in place) before it's created and charged. Returns false to abort
   * the drop (no melee weapon on the actor, or the user cancelled).
   * @param {object} itemData  focus item source data (mutated)
   * @private
   */
  async _bondWeaponFocusOnDrop(itemData) {
    const actor = this.document;
    const weapons = actor.items.filter(i => i.type === "weapon" && i.system.weaponType === "melee");
    if (!weapons.length) {
      ui.notifications.warn("Add a melee weapon first — a weapon focus must be bonded to one (SR2E p.126).");
      return false;
    }
    const force = itemData.system.force ?? 1;
    const opts = weapons.map(w =>
      `<option value="${w.id}">${foundry.utils.escapeHTML(w.name)} — Reach ${w.system.reach ?? 0}, ${foundry.utils.escapeHTML(w.system.damageCode ?? "")}</option>`).join("");
    let chosen = null, chosenForce = force;
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: `Bond ${itemData.name}` },
      rejectClose: false,
      content: `<form>
        <p style="margin:0 0 8px;">A weapon focus bonds to one melee weapon and adds its Force in dice to that weapon's attacks — on the physical and astral planes. Price = <strong>(Reach + 1) × 100,000¥ + Force × 90,000¥</strong>.</p>
        <div class="form-group"><label>Force:</label>
          <input type="number" name="force" value="${force}" min="1" max="6" style="width:60px;"></div>
        <div class="form-group"><label>Bond to:</label>
          <select name="weapon" autofocus style="flex:1;">${opts}</select></div>
      </form>`,
      buttons: [
        { action: "bond", label: "Bond & Activate", default: true, callback: (e, b) => {
          chosen = b.form.elements.weapon.value;
          chosenForce = Math.max(1, parseInt(b.form.elements.force.value) || force);
        } },
        { action: "cancel", label: "Cancel" }
      ]
    });
    if (action !== "bond" || !chosen) return false;
    const weapon = actor.items.get(chosen);
    itemData.system.force = chosenForce;
    itemData.system.bondedWeaponId = chosen;
    itemData.system.bonded = true;
    itemData.system.active = true;
    itemData.system.cost = weaponFocusCost(weapon?.system.reach ?? 0, chosenForce);
    return true;
  }

  /**
   * Apply a dropped race item to the actor.
   * Sets system.race to the race key. Racial modifiers and maximums are read
   * from CONFIG.SR2E.racialModifiers / racialMaximums during data preparation.
   * @param {object} itemData  Plain object from item.toObject()
   * @private
   */
  async _onDropRace(itemData) {
    const actor = this.document;
    if (actor.type !== "character") {
      return ui.notifications.warn("SR2E | Races can only be applied to Player Characters.");
    }

    const raceKey = itemData.system?.raceKey ?? "human";
    const currentRace = actor.system.race;

    // Confirm if replacing an existing non-human race.
    // Use i18n with English fallbacks so the dialog is readable even if the
    // language file hasn't loaded yet.
    if (currentRace && currentRace !== "human" && currentRace !== raceKey) {
      const currentLabel = (() => {
        const key = CONFIG.SR2E.races[currentRace];
        if (!key) return currentRace.charAt(0).toUpperCase() + currentRace.slice(1);
        const loc = game.i18n.localize(key);
        return (loc && loc !== key) ? loc : currentRace.charAt(0).toUpperCase() + currentRace.slice(1);
      })();
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Change Metatype?" },
        content: `<p>This character is currently a <strong>${foundry.utils.escapeHTML(currentLabel)}</strong>.
          Replace with <strong>${foundry.utils.escapeHTML(itemData.name)}</strong>?
          Racial attribute modifiers and maximums will be updated.</p>`,
        rejectClose: false
      });
      if (!confirmed) return false;
    }

    // Set system.race — the CONFIG table handles all modifiers and maximums.
    const updateData = {
      "system.race": raceKey
    };

    await actor.update(updateData);
    ui.notifications.info(`${itemData.name} applied to ${actor.name}.`);
    return true;
  }

  /**
   * Apply a dropped Tradition item to the actor.
   * Sets system.magic.type and system.magic.tradition from the item's data.
   * If the actor already has a tradition set, prompts for confirmation first.
   * @param {object} itemData  Plain object from item.toObject()
   * @private
   */
  async _onDropTradition(itemData) {
    const actor = this.document;
    if (actor.type !== "character") {
      return ui.notifications.warn("SR2E | Traditions can only be applied to Player Characters.");
    }

    const currentType = actor.system.magic?.type ?? "none";
    if (currentType !== "none") {
      const currentLabel = game.i18n.localize(CONFIG.SR2E.magicTypes[currentType] ?? currentType);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Change Tradition?" },
        content: `<p>This character already has the <strong>${foundry.utils.escapeHTML(currentLabel)}</strong> tradition set.
          Replace with <strong>${foundry.utils.escapeHTML(itemData.name)}</strong>?</p>`,
        rejectClose: false
      });
      if (!confirmed) return false;
    }

    await actor.update({
      "system.magic.type":      itemData.system.magicType,
      "system.magic.tradition": itemData.system.tradition,
      "system.magic.skill":     itemData.system.skill ?? "both"
    });
    ui.notifications.info(`${itemData.name} applied to ${actor.name}.`);
    return true;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    // Organize items by type
    context.skills = actor.items.filter(i => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name))
      .concat(actor.system.chippedSkills ?? []); // synthetic skills from slotted skillsofts
    context.weapons = actor.items.filter(i => i.type === "weapon");
    context.armors = actor.items.filter(i => i.type === "armor");
    context.spells = actor.items.filter(i => i.type === "spell");
    context.cyberware = actor.items.filter(i => i.type === "cyberware");
    context.gear = actor.items.filter(i => i.type === "gear" && i.system.category !== "skillsoft");
    context.skillsofts = actor.items.filter(i => i.type === "gear" && i.system.category === "skillsoft");
    context.skillsoftCapacity = actor.system.skillsoft ?? { skillwiresRating: 0, activeUsed: 0, accessPorts: 0, knowAccess: false, memCapacity: 0, memUsed: 0 };
    context.programs = actor.items.filter(i => i.type === "program");
    context.adeptPowers = actor.items.filter(i => i.type === "adept_power");
    const allContacts = actor.items.filter(i => i.type === "contact");
    context.contacts = allContacts.filter(i => i.system.contactType !== "enemy");
    context.enemies  = allContacts.filter(i => i.system.contactType === "enemy");
    context.lifestyles = actor.items.filter(i => i.type === "lifestyle");
    context.ammo = actor.items.filter(i => i.type === "ammo");
    context.foci = actor.items.filter(i => i.type === "focus");
    // Edges & Flaws (qualities), split for display; total point value for the bio tab.
    context.qualities = actor.items.filter(i => i.type === "quality")
      .sort((a, b) => a.name.localeCompare(b.name));
    context.qualityPointTotal = context.qualities.reduce((sum, q) => sum + (q.system.pointValue || 0), 0);

    // Resolve linked vehicles (Actor UUIDs → actor objects with their weapons)
    const linkedUuids = system.linkedVehicles ?? [];
    const vehicleActors = [];
    for (const uuid of linkedUuids) {
      const vActor = await fromUuid(uuid);
      if (vActor) {
        vehicleActors.push({
          uuid,
          id: vActor.id,
          name: vActor.name,
          img: vActor.img,
          system: vActor.system,
          weapons: vActor.items.filter(i => i.type === "weapon")
        });
      }
    }
    context.linkedVehicles = vehicleActors;

    // Resolve bound/summoned spirits (Actor UUIDs → spirit actors)
    const spiritActors = [];
    for (const uuid of system.boundSpirits ?? []) {
      const sActor = await fromUuid(uuid);
      if (sActor) {
        spiritActors.push({ uuid, id: sActor.id, name: sActor.name, img: sActor.img, system: sActor.system });
      }
    }
    context.boundSpirits = spiritActors;

    // Tab state
    context.tabs = this._getTabs();

    // Enriched HTML fields
    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.biography || "", {
      secrets: this.document.isOwner,
      rollData: actor.getRollData(),
      async: true,
      relativeTo: this.document
    });
    context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.notes || "", {
      secrets: this.document.isOwner,
      rollData: actor.getRollData(),
      async: true,
      relativeTo: this.document
    });

    // Derived display values
    context.woundPenalty = system.woundPenalty;
    context.woundLevel = system.woundLevel;
    context.sustainPenalty = system.sustainPenalty;
    // When an installed VCR cyberware item governs the rig level, the
    // vehicles-tab field becomes a read-only display of it
    context.vcrFromCyberware = actor.items.some(
      i => i.type === "cyberware" && i.system.installed && i.system.isVcr
    );
    context.isMagical = system.isMagical;
    context.isDecker = system.isDecker;
    context.isRigger = system.isRigger;

    // Localized labels for the magic tradition display (read-only when set via drag-drop)
    const magicType = system.magic?.type ?? "none";
    const magicTrad = system.magic?.tradition ?? "none";
    const magicSkill = system.magic?.skill ?? "none";

    // Compute a human-readable label combining type + tradition + skill
    const _ml = key => game.i18n.localize(key);
    if (magicType === "full_magician") {
      context.magicLabel = magicTrad === "shamanic" ? _ml("SR2E.Magic.Shaman") : _ml("SR2E.Magic.HermeticMagician");
    } else if (magicType === "physical_adept") {
      context.magicLabel = _ml("SR2E.Magic.PhysicalAdept");
    } else if (magicType === "shamanic_adept") {
      context.magicLabel = _ml("SR2E.Magic.ShamanicAdept");
    } else if (magicType === "magical_adept") {
      if (magicTrad === "shamanic") {
        context.magicLabel = magicSkill === "conjuring" ? _ml("SR2E.Magic.ShamanicConjurer") : _ml("SR2E.Magic.ShamanicSorcerer");
      } else {
        context.magicLabel = magicSkill === "conjuring" ? _ml("SR2E.Magic.HermeticConjurer") : _ml("SR2E.Magic.HermeticSorcerer");
      }
    } else {
      context.magicLabel = "";
    }

    // Skill access label (shown as a sub-line on the magic tab)
    context.magicSkillLabel = magicSkill !== "none"
      ? game.i18n.localize(`SR2E.Magic.Skill${magicSkill.charAt(0).toUpperCase() + magicSkill.slice(1)}`) : "";

    // Astral access: full magicians and shamanic adepts only
    context.hasAstral = magicType === "full_magician" || magicType === "shamanic_adept";

    // Sorcery access: can cast spells
    context.hasSorcery = magicType === "full_magician" || magicType === "shamanic_adept"
      || (magicType === "magical_adept" && magicSkill === "sorcery");

    // Conjuring access: can summon spirits (full magicians, or magical adepts
    // with the conjuring skill). Shamanic adepts conjure nature spirits too.
    context.hasConjuring = magicType === "full_magician" || magicType === "shamanic_adept"
      || (magicType === "magical_adept" && magicSkill === "conjuring");
    // Shamans summon nature spirits; hermetics summon elementals
    context.conjuresElementals = magicTrad === "hermetic";

    // Adept powers: physical adepts and shamanic adepts. The section also
    // renders whenever the character holds adept_power items so a dragged-on
    // power is never invisible (GitHub #2) — with a warning if the magic
    // type doesn't actually grant powers.
    context.isAdept = magicType === "physical_adept" || magicType === "shamanic_adept";
    context.hasAdeptPowers = context.isAdept || context.adeptPowers.length > 0;

    // Keep legacy labels for any other templates still using them
    context.magicTypeLabel      = context.magicLabel;
    context.magicTraditionLabel = "";

    // Attribute lists for template iteration
    context.physicalAttributes = ["body", "quickness", "strength"];
    context.mentalAttributes = ["charisma", "intelligence", "willpower"];

    // --- Character-creation priority dropdowns (SR2E p.54) ---
    // Build labelled A–E options per category so the player can see what each
    // grade grants, and flag duplicate grades (each letter is used exactly once).
    const prio = CONFIG.SR2E.priorities;
    const chosen = system.chargen?.priorities ?? {};
    const nuyen = (n) => "" + n.toLocaleString("en-US") + "¥";
    const magicLabels = {
      full_magician: "Full Magician", adept_or_meta_magician: "Aspected / Adept",
      meta_adept: "Adept", none: "Mundane"
    };
    const desc = {
      race:       (g) => prio[g].race === "metahuman" ? "Any metatype" : "Human only",
      magic:      (g) => magicLabels[prio[g].magic] ?? "Mundane",
      attributes: (g) => `${prio[g].attributes} points`,
      skills:     (g) => `${prio[g].skills} points`,
      resources:  (g) => nuyen(prio[g].resources)
    };
    // Count how many categories picked each grade, to mark collisions.
    const counts = {};
    for (const cat of Object.keys(desc)) {
      const g = chosen[cat];
      if (g) counts[g] = (counts[g] ?? 0) + 1;
    }
    context.priorityOptions = {};
    for (const cat of Object.keys(desc)) {
      context.priorityOptions[cat] = ["A", "B", "C", "D", "E"].map((g) => ({
        grade: g,
        label: `${g} — ${desc[cat](g)}`,
        selected: chosen[cat] === g
      }));
    }
    // Grades that appear more than once (duplicates) and grades never used.
    context.priorityDuplicates = Object.keys(counts).filter((g) => counts[g] > 1).sort();
    context.priorityUnused = ["A", "B", "C", "D", "E"].filter((g) => !counts[g]);

    // Validity depends on the method (Companion p.20). Standard: each A–E once
    // (no duplicates). Sum-to-10: the grade point values (A=4…E=0) total 10 —
    // duplicates allowed.
    const method = system.chargen?.priorityMethod ?? "standard";
    const GRADE_PTS = { A: 4, B: 3, C: 2, D: 1, E: 0 };
    context.prioritySum = Object.keys(desc).reduce((s, cat) => s + (GRADE_PTS[chosen[cat]] ?? 0), 0);
    context.priorityMethod = method;
    context.priorityValid = method === "sumto10"
      ? context.prioritySum === 10
      : context.priorityDuplicates.length === 0;

    // --- Chargen budget: points/nuyen spent vs the chosen priority allotment
    // (SR2E p.44–45). Purely informational; nothing is enforced. ---
    const allot = {
      attributes:  prio[chosen.attributes]?.attributes ?? 0,
      skills:      prio[chosen.skills]?.skills ?? 0,
      resources:   prio[chosen.resources]?.resources ?? 0,
      forcePoints: prio[chosen.resources]?.forcePoints ?? 0
    };
    const attrData = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]
      .map((k) => ({ base: system[k]?.base ?? 0 }));
    const skillData = actor.items
      .filter((i) => i.type === "skill")
      .map((i) => ({ category: i.system.category, rating: i.system.rating }));
    const itemData = actor.items.map((i) => ({
      type: i.type,
      cost: i.system.cost ?? 0,
      quantity: i.system.quantity ?? 1,
      force: i.system.force ?? 0,
      bondingCost: i.system.bondingCost ?? 0
    }));
    context.chargenBudget = chargenSpend({ attributes: attrData, skills: skillData, items: itemData }, allot);
    // Thousands separators for the ¥ figures (they climb toward 1,000,000).
    for (const k of ["spent", "total", "remaining"]) {
      context.chargenBudget.resources[`${k}Fmt`] = context.chargenBudget.resources[k].toLocaleString("en-US");
    }
    // Force Points go to spellcasters only (SR2E p.45) — not physical adepts.
    const mt = system.magic?.type ?? "none";
    context.chargenShowForce = mt !== "none" && mt !== "physical_adept";

    // Shared Team Karma Pool total (SR2E p.246) — shown on every character sheet.
    context.teamKarma = game.settings.get("sr2e", "teamKarma") ?? 0;

    // Shadowtalk header line (null when banter is off) — rotates daily.
    context.shadowtalk = headerBanter(this.document);

    return context;
  }

  /**
   * @override
   * Adds the race-drop-zone dragleave handling on top of the base sheet's
   * prose-mirror / hidden-tab input wiring.
   */
  _onRender(context, options) {
    // Bind dragleave on the sheet element to clear race-drop-zone highlight
    // (dragleave fires when the drag leaves the entire sheet window)
    if (this.element) {
      this.element.addEventListener("dragleave", (event) => {
        // Only clear when leaving the sheet itself (relatedTarget outside element)
        if (!this.element.contains(event.relatedTarget)) {
          this._isDragging = false;
          this.element.classList.remove("sr2e-dragging");
          const zone = this.element.querySelector(".race-drop-zone");
          if (zone) zone.classList.remove("drag-over");
        }
      }, { passive: true });

      // Character-creation priority grades must form a permutation of A–E
      // (SR2E p.54). When one dropdown changes to a grade already used by
      // another category, swap them so every grade stays assigned exactly once.
      const prioSelects = this.element.querySelectorAll(
        'select[name^="system.chargen.priorities."]'
      );
      for (const sel of prioSelects) {
        sel.addEventListener("change", (event) => {
          const changed = event.currentTarget;
          const newGrade = changed.value;
          const prev = this.actor.system.chargen?.priorities ?? {};
          const changedKey = changed.name.split(".").pop();
          const oldGrade = prev[changedKey];
          // Find the sibling category that currently holds the new grade.
          let other = null;
          for (const s of prioSelects) {
            if (s === changed) continue;
            if ((prev[s.name.split(".").pop()] ?? s.value) === newGrade) { other = s; break; }
          }
          if (!other || oldGrade == null || oldGrade === newGrade) return;
          // Give the displaced category the grade we just vacated. Update its
          // DOM value first so the form's submit-on-change reads the swapped
          // permutation rather than re-introducing the duplicate, then persist.
          const otherKey = other.name.split(".").pop();
          other.value = oldGrade;
          this.actor.update({
            [`system.chargen.priorities.${changedKey}`]: newGrade,
            [`system.chargen.priorities.${otherKey}`]: oldGrade
          });
        });
      }
    }

    super._onRender(context, options);
  }

  /**
   * Build tab configuration.
   * @returns {object}
   * @private
   */
  _getTabs() {
    const tabs = {
      attributes: { id: "attributes", label: "SR2E.Tabs.Attributes", icon: "fas fa-user", group: "primary", active: false },
      skills: { id: "skills", label: "SR2E.Tabs.Skills", icon: "fas fa-book", group: "primary", active: false },
      combat: { id: "combat", label: "SR2E.Tabs.Combat", icon: "fas fa-fist-raised", group: "primary", active: false },
      magic: { id: "magic", label: "SR2E.Tabs.Magic", icon: "fas fa-hat-wizard", group: "primary", active: false },
      matrix: { id: "matrix", label: "SR2E.Tabs.Matrix", icon: "fas fa-laptop-code", group: "primary", active: false },
      gear: { id: "gear", label: "SR2E.Tabs.Gear", icon: "fas fa-toolbox", group: "primary", active: false },
      vehicles: { id: "vehicles", label: "SR2E.Tabs.Vehicles", icon: "fas fa-car", group: "primary", active: false },
      contacts: { id: "contacts", label: "SR2E.Tabs.Contacts", icon: "fas fa-address-book", group: "primary", active: false },
      bio: { id: "bio", label: "SR2E.Tabs.Bio", icon: "fas fa-id-card", group: "primary", active: false }
    };

    const activeTab = this.tabGroups.primary || "attributes";
    if (tabs[activeTab]) tabs[activeTab].active = true;

    return tabs;
  }
}

// =========================================================================
// NPC SHEET
// =========================================================================

/**
 * NPC Sheet - simplified version of the character sheet.
 */
export class SR2ENPCSheet extends SR2EBaseActorSheet {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "npc"],
    position: { width: 650, height: 550 },
    actions: {
      rollAttribute: onRollAttribute,
      rollSkill: onRollSkill,
      rollInitiative: onRollInitiative,
      rollWeapon: onRollWeapon,
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    }
  };

  /** @override */
  static PARTS = {
    npc: { template: "systems/sr2e/templates/actor/npc-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.skills = actor.items.filter(i => i.type === "skill");
    context.weapons = actor.items.filter(i => i.type === "weapon");
    context.gear = actor.items.filter(i => i.type === "gear");
    context.spells = actor.items.filter(i => i.type === "spell");

    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.biography || "", {
      secrets: this.document.isOwner,
      async: true,
      relativeTo: this.document
    });

    return context;
  }
}

// =========================================================================
// VEHICLE SHEET
// =========================================================================

/**
 * Whether a vehicle_mod takes a player-chosen Rating (so the sheet shows a Rating
 * editor): it has a rating-based Design-Point rule, or a non-zero current rating.
 * @param {object} s  vehicle_mod system data
 */
function isModRated(s = {}) {
  return (Array.isArray(s.dpTable) && s.dpTable.length > 0)
    || (Number(s.dpPerLevel) || 0) > 0
    || (Number(s.rating) || 0) > 0;
}

/**
 * "Apply to Vehicle" — resolve the stored design against the registered tables
 * and write the computed base stats onto the vehicle's actual fields (Rigger 2
 * p.108-123). Refuses if the design is incomplete or its DP can't be computed
 * (e.g. a drone-formula chassis). @this {SR2EVehicleSheet}
 */
async function onApplyVehicleDesign(event, target) {
  const actor = this.document;
  const stored = actor.system.design ?? {};
  // Fold installed mods into the build (same as the live readout).
  const modItems = actor.items.filter(i => i.type === "vehicle_mod");
  const modAgg = aggregateModDesign(modItems.map(i => i.system));
  const effectiveDesign = { ...stored, modDP: (Number(stored.modDP) || 0) + modAgg.designPoints };
  const result = resolveVehicleDesign(effectiveDesign, CONFIG.SR2E.vehicleDesign);
  if (!result.valid) {
    ui.notifications?.warn(game.i18n.localize("SR2E.Design.CannotApply"));
    return;
  }
  const update = {};
  for (const [key, value] of Object.entries(result.baseStats)) {
    update[`system.${key}`] = value;
  }
  // Total cost = design cost + ¥-priced customization mods on top.
  update["system.cost"] = (result.cost || 0) + modAgg.cost;
  await actor.update(update);
  ui.notifications?.info(game.i18n.format("SR2E.Design.Applied", { name: actor.name }));
}

/**
 * Fire a weapon mounted on this vehicle from the vehicle sheet.
 *
 * Vehicle weapons are fired by a gunner (a character) using Gunnery (SR2E p.105) —
 * a vehicle has no skills of its own, so a gunner is REQUIRED. The gunner is
 * resolved from the user's context: a controlled character/NPC token first
 * (explicit choice — lets a GM pick the gunner), then the user's assigned
 * character. With none resolved the shot is refused (a vehicle can't fire itself).
 * We roll the gunner's Gunnery (defaulting to Intelligence +4 TN untrained);
 * range is measured from the vehicle's token. Opens the same attack dialog as the
 * character sheet.
 * @this {ApplicationV2}
 */
async function onFireVehicleWeapon(event, target) {
  event.preventDefault();
  const weaponId = target.closest("[data-item-id]")?.dataset.itemId;
  const vehicle = this.document;
  const weapon = vehicle.items.get(weaponId);
  if (!weapon) return;

  // Resolve the gunner: a controlled character/NPC token, else the assigned char.
  const controlled = canvas?.tokens?.controlled
    ?.map(t => t.actor)
    .find(a => a && (a.type === "character" || a.type === "npc"));
  const gunner = controlled ?? game.user?.character ?? null;
  if (!gunner) {
    ui.notifications?.warn(game.i18n.localize("SR2E.Vehicle.NoGunner"));
    return;
  }

  // Gunnery, defaulting through the Skill Web untrained (shared with
  // sheet-actions.rollVehicleWeapon so the two handlers can't diverge).
  const { skillCap, baseDice, defaultingPenalty } = gunner._gunneryAttackDice();

  // Distance is measured from the vehicle's token (the weapon mount).
  const presets = detectAttackTarget(vehicle, weapon);

  const opts = await promptWeaponAttackOptions(gunner, weapon, skillCap,
                                               baseDice, defaultingPenalty, presets);
  if (!opts) return;
  return weapon.roll({ ...opts, gunner });
}

/**
 * Vehicle Sheet.
 */
export class SR2EVehicleSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "vehicle"],
    position: { width: 600, height: 600 },
    actions: {
      switchTab: SHARED_ACTIONS.switchTab,
      applyDesign: onApplyVehicleDesign,
      fireWeapon: onFireVehicleWeapon,
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    }
  };

  static PARTS = {
    tabs:     { template: "systems/sr2e/templates/actor/parts/actor-tabs.hbs" },
    overview: { template: "systems/sr2e/templates/actor/vehicle-sheet.hbs" },
    design:   { template: "systems/sr2e/templates/actor/parts/vehicle-design.hbs" }
  };

  /** @override */
  tabGroups = { primary: "overview" };

  /** @returns {object} tab config for the nav + content active states. */
  _getTabs() {
    const tabs = {
      overview: { id: "overview", label: "SR2E.Tabs.Overview", icon: "fas fa-car",               group: "primary", active: false },
      design:   { id: "design",   label: "SR2E.Tabs.Design",   icon: "fas fa-drafting-compass", group: "primary", active: false }
    };
    const active = this.tabGroups.primary || "overview";
    if (tabs[active]) tabs[active].active = true;
    return tabs;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.weapons = this.document.items.filter(i => i.type === "weapon");
    context.mods = this.document.items
      .filter(i => i.type === "vehicle_mod")
      .map(i => ({ id: i.id, name: i.name, rating: i.system.rating ?? 0, rated: isModRated(i.system) }));
    context.tabs = this._getTabs();
    context.design = this._prepareDesign();
    return context;
  }

  /**
   * Build the Design-tab view model: the live resolve result plus grouped
   * dropdown options drawn from CONFIG.SR2E.vehicleDesign (empty until a
   * content module like Rigger 2 registers its tables).
   * @private
   */
  _prepareDesign() {
    const tables = CONFIG.SR2E.vehicleDesign ?? { chassis: {}, powerPlants: {} };
    const stored = this.document.system.design ?? {};

    // Installed modifications fold into the build: design-option mods add their
    // Design Points; ¥-priced customization mods add their cost on top. So
    // dragging a mod onto the vehicle moves the DP and/or the total cost.
    const modItems = this.document.items.filter(i => i.type === "vehicle_mod");
    const modAgg = aggregateModDesign(modItems.map(i => i.system));
    const manualModDP = Number(stored.modDP) || 0;
    const effectiveDesign = { ...stored, modDP: manualModDP + modAgg.designPoints };
    const result = resolveVehicleDesign(effectiveDesign, tables);
    const totalCost = (result.cost || 0) + modAgg.cost;

    // CF / Load budgets (book p.115): mods consume Cargo Factor from the chassis'
    // Cargo Rating and kilograms from the power plant's Load Rating; neither may
    // be exceeded. Capacities come from the selected chassis / power plant.
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const cfCap = num(result.chassis?.cargoMax);
    const loadCap = num(result.powerPlant?.loadMax);
    const cfUsed = Math.round(modAgg.cf * 100) / 100;
    const loadUsed = Math.round(modAgg.load * 100) / 100;

    const groupBy = (map, keyFn, selectedKey) => {
      const groups = {};
      for (const [key, entry] of Object.entries(map ?? {})) {
        const g = keyFn(entry) || "Other";
        (groups[g] ??= []).push({ key, name: entry.name ?? key, dp: entry.dp, selected: key === selectedKey });
      }
      return Object.entries(groups)
        .map(([label, options]) => ({ label, options: options.sort((a, b) => String(a.name).localeCompare(String(b.name))) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    const chassisGroups    = groupBy(tables.chassis,     e => e.group,  stored.chassisKey);
    const powerPlantGroups = groupBy(tables.powerPlants, e => e.engine, stored.powerPlantKey);

    const ratings = Object.entries(CONFIG.SR2E.vehicleDesignRatings).map(([key, def]) => ({
      key, label: def.label, dp: def.dp, value: stored.improvements?.[key] ?? 0
    }));

    const fmt = (n) => Number(n || 0).toLocaleString();
    const installedMods = modItems.map(i => ({
      id: i.id, name: i.name,
      rating: Number(i.system.rating) || 0,
      rated: isModRated(i.system),
      designPoints: modDesignPoints(i.system),
      cost: Number(i.system.cost) || 0
    }));

    // Mark-Up Factor table (book p.114): suggest the base from the chosen
    // chassis category; the GM applies equipment/special-design factors.
    const markupCfg = CONFIG.SR2E.vehicleMarkup ?? {};
    const markupCategory = result.chassis?.group ?? null;
    const markupBase = markupCategory ? markupCfg.chassisBase?.[markupCategory] : null;

    return {
      ...result,
      designPoints: result.designPoints,
      cost: totalCost,
      hasData: chassisGroups.length > 0 || powerPlantGroups.length > 0,
      chassisGroups,
      powerPlantGroups,
      ratings,
      modDP: stored.modDP ?? 0,
      markUp: stored.markUp ?? 1,
      markupCategory,
      markupBase,
      markupEquipment: markupCfg.equipment ?? [],
      markupSpecial: markupCfg.specialDesign ?? [],
      flatOptions: CONFIG.SR2E.vehicleDesignFlatOptions ?? [],
      cfUsed, cfCap,
      cfOver: cfCap != null && cfUsed > cfCap,
      loadUsed, loadCap,
      loadOver: loadCap != null && loadUsed > loadCap,
      showBudgets: cfCap != null || loadCap != null || cfUsed > 0 || loadUsed > 0,
      installedMods,
      hasMods: installedMods.length > 0,
      modDPFromItems: modAgg.designPoints,
      modCost: modAgg.cost,
      modCostLabel: fmt(modAgg.cost),
      designPointsLabel: fmt(result.designPoints),
      costLabel: fmt(totalCost)
    };
  }
}

// =========================================================================
// SPIRIT SHEET
// =========================================================================

/**
 * Spirit Sheet.
 */
export class SR2ESpiritSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "spirit"],
    position: { width: 520, height: 560 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem,
      rollInitiative: onRollInitiative,
      spiritAttack: function(event) { event.preventDefault(); return this.document.rollSpiritAttack(); },
      useSpiritPower: function(event, target) {
        event.preventDefault();
        const key = target.closest("form, section")?.querySelector("[name='spiritPower']")?.value
                 ?? target.dataset.power;
        if (key) return this.document.useSpiritPower(key);
      },
      adjustServices: function(event, target) {
        event.preventDefault();
        const delta = parseInt(target.dataset.delta) || 0;
        const cur = this.document.system.services ?? 0;
        return this.document.update({ "system.services": Math.max(0, cur + delta) });
      }
    }
  };

  static PARTS = {
    spirit: { template: "systems/sr2e/templates/actor/spirit-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.spiritPowers = CONFIG.SR2E.spiritPowers;
    context.spiritDomains = CONFIG.SR2E.spiritDomains;
    context.isElemental = this.document.system.spiritType === "elemental";
    // Resolve the conjurer for a back-link
    const cuid = this.document.system.conjurerUuid;
    if (cuid) {
      const conjurer = await fromUuid(cuid);
      if (conjurer) context.conjurerName = conjurer.name;
    }
    return context;
  }
}

// =========================================================================
// IC SHEET
// =========================================================================

/**
 * IC (Intrusion Countermeasures) Sheet.
 */
/**
 * Wire change → save for top-level named fields on a single-part sheet.
 *
 * The base sheet only wires fields inside `.tab-content` (the tabbed character
 * sheet); simple single-part sheets (IC, Host) keep their inputs at the top
 * level, where ApplicationV2's submitOnChange does not reliably persist them.
 * Propagation is stopped so the form's submit handler doesn't double-save.
 * @param {ApplicationV2} sheet
 */
function wireTopLevelFields(sheet) {
  if (!sheet.isEditable || !sheet.element) return;
  for (const input of sheet.element.querySelectorAll("input[name], select[name], textarea[name]")) {
    if (input.closest("[data-item-id]")) continue;
    if (input.name === "name") continue; // handled by ActorSheetV2 itself
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      let value = input.value;
      if (input.type === "number")   value = parseFloat(value) || 0;
      if (input.type === "checkbox") value = input.checked;
      sheet.document.update({ [input.name]: value });
    });
  }
}

export class SR2EICSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "ic"],
    position: { width: 400, height: "auto" },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem,
      matrixAttack: onMatrixAttack,
      matrixPerception: onMatrixPerception
    }
  };

  static PARTS = {
    ic: { template: "systems/sr2e/templates/actor/ic-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // Plain {uuid, name} objects — `uuid` is a prototype getter that does not
    // render reliably in Handlebars option values, so expose it as own data.
    context.hosts = game.actors
      .filter(a => a.type === "host")
      .map(h => ({ uuid: h.uuid, name: h.name }));
    const host = this.document.system.hostUuid ? fromUuidSync(this.document.system.hostUuid) : null;
    context.linkedHost = host ? { uuid: host.uuid, name: host.name } : null;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    wireTopLevelFields(this);
  }
}

/**
 * Sheet for a Matrix host / node (SR2E p.164–168).
 */
export class SR2EHostSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "host"],
    position: { width: 400, height: "auto" },
    actions: {
      resetHostTally: onResetHostTally
    }
  };

  static PARTS = {
    host: { template: "systems/sr2e/templates/actor/host-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.successesNeeded = this.document.system.successesNeeded;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    wireTopLevelFields(this);
  }
}
