const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

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
      rollItem: SR2EItemSheet.#onRollItem
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
    context.config = CONFIG.SR2E;
    context.isOwned = !!item.parent;
    context.type = item.type;

    // Provide enriched HTML for notes/descriptions
    if (item.system.notes) {
      context.enrichedNotes = await TextEditor.enrichHTML(item.system.notes, { async: true });
    }
    if (item.system.description) {
      context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, { async: true });
    }

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
   * Roll the item.
   */
  static async #onRollItem(event, target) {
    event.preventDefault();
    return this.document.roll();
  }
}
