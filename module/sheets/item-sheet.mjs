const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

// V13: TextEditor is namespaced; shim for backwards compat
const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

/**
 * Base Item Sheet for the Shadowrun 2E system.
 * Handles all item types with dynamic template selection.
 */
export class SR2EItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "item"],
    position: { width: 520, height: 480 },
    actions: {
      rollItem:        SR2EItemSheet._onRollItem,
      addRatingRow:    SR2EItemSheet._addRatingRow,
      removeRatingRow: SR2EItemSheet._removeRatingRow,
      addModuleRow:    SR2EItemSheet._addModuleRow,
      removeModuleRow: SR2EItemSheet._removeModuleRow,
      addEffect:       SR2EItemSheet._addEffect,
      editEffect:      SR2EItemSheet._editEffect,
      deleteEffect:    SR2EItemSheet._deleteEffect
    },
    form: {
      submitOnChange: true
    },
    window: {
      resizable: true
    }
  };

  /** @override */
  static PARTS = {
    header: { template: "systems/sr2e/templates/item/parts/item-header.hbs" },
    body: { template: "systems/sr2e/templates/item/item-body.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.item = item;
    context.system = item.system;
    context.effects = item.effects.contents;
    context.config = CONFIG.SR2E;
    context.isOwned = !!item.parent;
    context.type = item.type;
    context.editable = this.isEditable;

    // Provide enriched HTML for notes/descriptions
    const enrichOpts = {
      secrets: this.document.isOwner,
      async: true,
      relativeTo: this.document
    };
    if (item.system.notes) {
      context.enrichedNotes = await TextEditor.enrichHTML(item.system.notes, enrichOpts);
    }
    if (item.system.description) {
      context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, enrichOpts);
    }

    // Map item type → FontAwesome icon class for the header display
    const ITEM_ICONS = {
      skill:       "fas fa-book",
      weapon:      "fas fa-crosshairs",
      armor:       "fas fa-shield-alt",
      spell:       "fas fa-hat-wizard",
      cyberware:   "fas fa-microchip",
      gear:        "fas fa-toolbox",
      program:     "fas fa-laptop-code",
      ammo:        "fas fa-circle",
      focus:       "fas fa-gem",
      adept_power: "fas fa-bolt",
      contact:     "fas fa-address-card",
      lifestyle:   "fas fa-home",
      vehicle_mod: "fas fa-wrench"
    };
    context.itemIcon = ITEM_ICONS[item.type] ?? "fas fa-box";

    // Type-specific context
    switch (item.type) {
      case "weapon":
        context.weaponTypes = CONFIG.SR2E.weaponTypes;
        context.firearmModes = CONFIG.SR2E.firearmModes;
        break;
      case "spell":
        context.spellCategories = CONFIG.SR2E.spellCategories;
        context.spellTypes = CONFIG.SR2E.spellTypes;
        context.spellRanges = CONFIG.SR2E.spellRanges;
        context.spellDurations = CONFIG.SR2E.spellDurations;
        break;
      case "cyberware":
        context.cyberwareGrades = CONFIG.SR2E.cyberwareGrades;
        context.cyberwareLocations = CONFIG.SR2E.cyberwareLocations;
        context.hasRatingTable = (item.system.ratingStats?.length ?? 0) > 0;
        context.isContainer = (item.system.capacity ?? 0) > 0 || (item.system.modules?.length ?? 0) > 0;
        break;
      case "program":
        context.programCategories = CONFIG.SR2E.programCategories;
        break;
      case "skill":
        context.skillCategories = CONFIG.SR2E.skillCategories;
        context.attributes = CONFIG.SR2E.attributes;
        break;
      case "lifestyle":
        context.lifestyles = CONFIG.SR2E.lifestyles;
        break;
    }

    return context;
  }

  /**
   * V13 signature: _preparePartContext(partId, context, options)
   * @override
   */
  async _preparePartContext(partId, context, options) {
    context.partId = `${this.id}-${partId}`;
    return context;
  }

  /**
   * Roll the item.
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async _onRollItem(event, target) {
    event.preventDefault();
    return this.document.roll();
  }

  /**
   * Add a new row to the cyberware rating stats table.
   * The new row gets the next sequential rating after the last existing row.
   */
  static async _addRatingRow(event, target) {
    event.preventDefault();
    const item = this.document;
    const rows = foundry.utils.deepClone(item.system.ratingStats ?? []);
    const nextRating = rows.length > 0 ? (rows[rows.length - 1].rating + 1) : 1;
    rows.push({ rating: nextRating, essenceCost: 0, cost: 0, availability: "", streetIndex: "" });
    await item.update({ "system.ratingStats": rows });
  }

  /**
   * Create an Active Effect on this item and open its config sheet.
   * For spells these are applied to the caster while the spell is sustained
   * (transfer = false; SR2EItem#setSustaining copies them on/off the actor).
   */
  static async _addEffect(event, target) {
    event.preventDefault();
    const item = this.document;
    const [effect] = await item.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name,
      img: item.img,
      transfer: false,
      disabled: false
    }]);
    effect?.sheet.render(true);
  }

  /** Open an Active Effect's config sheet. */
  static async _editEffect(event, target) {
    event.preventDefault();
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    this.document.effects.get(effectId)?.sheet.render(true);
  }

  /** Delete an Active Effect from this item. */
  static async _deleteEffect(event, target) {
    event.preventDefault();
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    if (effectId) await this.document.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
  }

  /**
   * Remove a row from the cyberware rating stats table.
   * @param {Event} event
   * @param {HTMLElement} target  Must carry a data-index attribute.
   */
  static async _removeRatingRow(event, target) {
    event.preventDefault();
    const item = this.document;
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;
    const rows = foundry.utils.deepClone(item.system.ratingStats ?? []);
    rows.splice(index, 1);
    await item.update({ "system.ratingStats": rows });
  }

  /**
   * Add a module slot to container cyberware (cybereyes/cyberears). The first
   * add also seeds the free capacity at 0.5 if none was set, turning an ordinary
   * cyberware item into a container.
   */
  static async _addModuleRow(event, target) {
    event.preventDefault();
    const item = this.document;
    const mods = foundry.utils.deepClone(item.system.modules ?? []);
    mods.push({ name: "", essenceCost: 0, cost: 0, rating: 0, combatTnMod: 0, active: true, notes: "" });
    const update = { "system.modules": mods };
    if ((item.system.capacity ?? 0) <= 0) update["system.capacity"] = 0.5;
    await item.update(update);
  }

  /** Remove a module slot from container cyberware. */
  static async _removeModuleRow(event, target) {
    event.preventDefault();
    const item = this.document;
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;
    const mods = foundry.utils.deepClone(item.system.modules ?? []);
    mods.splice(index, 1);
    await item.update({ "system.modules": mods });
  }
}
