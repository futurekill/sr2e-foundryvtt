const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Character Sheet for Shadowrun 2E player characters.
 * Uses the V13 ApplicationV2 framework with HandlebarsApplicationMixin.
 */
export class SR2ECharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "character"],
    position: { width: 800, height: 700 },
    actions: {
      rollAttribute: SR2ECharacterSheet.#onRollAttribute,
      rollSkill: SR2ECharacterSheet.#onRollSkill,
      rollInitiative: SR2ECharacterSheet.#onRollInitiative,
      rollWeapon: SR2ECharacterSheet.#onRollWeapon,
      castSpell: SR2ECharacterSheet.#onCastSpell,
      rollProgram: SR2ECharacterSheet.#onRollProgram,
      toggleEquip: SR2ECharacterSheet.#onToggleEquip,
      editItem: SR2ECharacterSheet.#onEditItem,
      deleteItem: SR2ECharacterSheet.#onDeleteItem,
      addItem: SR2ECharacterSheet.#onAddItem,
      resetPools: SR2ECharacterSheet.#onResetPools
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
    header: { template: "systems/sr2e/templates/actor/parts/actor-header.hbs" },
    tabs: { template: "systems/sr2e/templates/actor/parts/actor-tabs.hbs" },
    attributes: { template: "systems/sr2e/templates/actor/parts/actor-attributes.hbs" },
    skills: { template: "systems/sr2e/templates/actor/parts/actor-skills.hbs" },
    combat: { template: "systems/sr2e/templates/actor/parts/actor-combat.hbs" },
    magic: { template: "systems/sr2e/templates/actor/parts/actor-magic.hbs" },
    matrix: { template: "systems/sr2e/templates/actor/parts/actor-matrix.hbs" },
    gear: { template: "systems/sr2e/templates/actor/parts/actor-gear.hbs" },
    bio: { template: "systems/sr2e/templates/actor/parts/actor-bio.hbs" }
  };

  /** @override */
  tabGroups = {
    primary: "attributes"
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.system = system;
    context.actor = actor;
    context.config = CONFIG.SR2E;

    // Organize items by type
    context.skills = actor.items.filter(i => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
    context.weapons = actor.items.filter(i => i.type === "weapon");
    context.armors = actor.items.filter(i => i.type === "armor");
    context.spells = actor.items.filter(i => i.type === "spell");
    context.cyberware = actor.items.filter(i => i.type === "cyberware");
    context.gear = actor.items.filter(i => i.type === "gear");
    context.programs = actor.items.filter(i => i.type === "program");
    context.adeptPowers = actor.items.filter(i => i.type === "adept_power");
    context.contacts = actor.items.filter(i => i.type === "contact");
    context.lifestyles = actor.items.filter(i => i.type === "lifestyle");
    context.ammo = actor.items.filter(i => i.type === "ammo");
    context.foci = actor.items.filter(i => i.type === "focus");

    // Tab state
    context.tabs = this._getTabs();

    // Enriched HTML
    context.enrichedBiography = await TextEditor.enrichHTML(system.biography || "", { async: true });
    context.enrichedNotes = await TextEditor.enrichHTML(system.notes || "", { async: true });

    // Derived display values
    context.woundPenalty = system.woundPenalty;
    context.woundLevel = system.woundLevel;
    context.isMagical = system.isMagical;
    context.isDecker = system.isDecker;
    context.isRigger = system.isRigger;

    // Attribute list for iteration
    context.physicalAttributes = ["body", "quickness", "strength"];
    context.mentalAttributes = ["charisma", "intelligence", "willpower"];

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;
    context.tab = context.tabs[partId];
    return context;
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
      bio: { id: "bio", label: "SR2E.Tabs.Bio", icon: "fas fa-id-card", group: "primary", active: false }
    };

    const activeTab = this.tabGroups.primary || "attributes";
    if (tabs[activeTab]) tabs[activeTab].active = true;

    return tabs;
  }

  // -------------------------------------------------------------------------
  // ACTION HANDLERS
  // -------------------------------------------------------------------------

  /**
   * Roll an attribute test.
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static async #onRollAttribute(event, target) {
    event.preventDefault();
    const attribute = target.dataset.attribute;
    const actor = this.document;

    // Prompt for target number
    const tn = await SR2ECharacterSheet.#promptTargetNumber();
    if (tn === null) return;

    return actor.rollAttributeTest(attribute, tn);
  }

  /**
   * Roll a skill test.
   */
  static async #onRollSkill(event, target) {
    event.preventDefault();
    const skillId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!skillId) return;

    const tn = await SR2ECharacterSheet.#promptTargetNumber();
    if (tn === null) return;

    return this.document.rollSkillTest(skillId, tn);
  }

  /**
   * Roll initiative.
   */
  static async #onRollInitiative(event, target) {
    event.preventDefault();
    return this.document.rollInitiative();
  }

  /**
   * Roll a weapon attack.
   */
  static async #onRollWeapon(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    const tn = await SR2ECharacterSheet.#promptTargetNumber();
    if (tn === null) return;

    return item.roll({ targetNumber: tn });
  }

  /**
   * Cast a spell.
   */
  static async #onCastSpell(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    const tn = await SR2ECharacterSheet.#promptTargetNumber();
    if (tn === null) return;

    return item.roll({ targetNumber: tn });
  }

  /**
   * Roll a program action.
   */
  static async #onRollProgram(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    const tn = await SR2ECharacterSheet.#promptTargetNumber();
    if (tn === null) return;

    return item.roll({ targetNumber: tn });
  }

  /**
   * Toggle equip state for an item.
   */
  static async #onToggleEquip(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    const field = item.type === "cyberware" ? "system.installed" : "system.equipped";
    const currentValue = item.type === "cyberware" ? item.system.installed : item.system.equipped;
    return item.update({ [field]: !currentValue });
  }

  /**
   * Edit an item.
   */
  static async #onEditItem(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  /**
   * Delete an item.
   */
  static async #onDeleteItem(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`
    });

    if (confirm) return item.delete();
  }

  /**
   * Add a new item of a given type.
   */
  static async #onAddItem(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    const name = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;

    const itemData = { name, type };
    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * Reset all dice pools to their maximum values.
   */
  static async #onResetPools(event, target) {
    event.preventDefault();
    const system = this.document.system;
    const updates = {};

    for (const pool of ["combat", "hacking", "magic", "control"]) {
      if (system.dicePools[pool]) {
        updates[`system.dicePools.${pool}.value`] = system.dicePools[pool].max;
      }
    }

    return this.document.update(updates);
  }

  /**
   * Prompt for a target number.
   * @returns {Promise<number|null>}
   */
  static async #promptTargetNumber() {
    return new Promise((resolve) => {
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: "Target Number" },
        content: `
          <form>
            <div class="form-group">
              <label>Target Number:</label>
              <input type="number" name="tn" value="4" min="2" max="30" autofocus>
            </div>
          </form>
        `,
        buttons: [
          {
            action: "roll",
            label: "Roll",
            default: true,
            callback: (event, button, dialog) => {
              const tn = parseInt(button.form.elements.tn.value);
              resolve(isNaN(tn) ? 4 : tn);
            }
          },
          {
            action: "cancel",
            label: "Cancel",
            callback: () => resolve(null)
          }
        ]
      });
      dialog.render(true);
    });
  }
}

/**
 * NPC Sheet - simplified version of the character sheet.
 */
export class SR2ENPCSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "npc"],
    position: { width: 650, height: 550 },
    actions: {
      rollAttribute: SR2ECharacterSheet.prototype.constructor.DEFAULT_OPTIONS?.actions?.rollAttribute,
      rollInitiative: SR2ECharacterSheet.prototype.constructor.DEFAULT_OPTIONS?.actions?.rollInitiative,
      editItem: SR2ECharacterSheet.prototype.constructor.DEFAULT_OPTIONS?.actions?.editItem,
      deleteItem: SR2ECharacterSheet.prototype.constructor.DEFAULT_OPTIONS?.actions?.deleteItem,
      addItem: SR2ECharacterSheet.prototype.constructor.DEFAULT_OPTIONS?.actions?.addItem,
      rollWeapon: SR2ECharacterSheet.prototype.constructor.DEFAULT_OPTIONS?.actions?.rollWeapon
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
    npc: { template: "systems/sr2e/templates/actor/npc-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.system = system;
    context.actor = actor;
    context.config = CONFIG.SR2E;

    context.skills = actor.items.filter(i => i.type === "skill");
    context.weapons = actor.items.filter(i => i.type === "weapon");
    context.gear = actor.items.filter(i => i.type === "gear");
    context.spells = actor.items.filter(i => i.type === "spell");

    context.enrichedBiography = await TextEditor.enrichHTML(system.biography || "", { async: true });

    return context;
  }
}

/**
 * Vehicle Sheet.
 */
export class SR2EVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "vehicle"],
    position: { width: 550, height: 450 },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    vehicle: { template: "systems/sr2e/templates/actor/vehicle-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.document.system;
    context.actor = this.document;
    context.config = CONFIG.SR2E;
    context.weapons = this.document.items.filter(i => i.type === "weapon");
    context.mods = this.document.items.filter(i => i.type === "vehicle_mod");
    return context;
  }
}

/**
 * Spirit Sheet.
 */
export class SR2ESpiritSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "spirit"],
    position: { width: 500, height: 450 },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    spirit: { template: "systems/sr2e/templates/actor/spirit-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.document.system;
    context.actor = this.document;
    context.config = CONFIG.SR2E;
    return context;
  }
}

/**
 * IC Sheet.
 */
export class SR2EICSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "ic"],
    position: { width: 450, height: 400 },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    ic: { template: "systems/sr2e/templates/actor/ic-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.document.system;
    context.actor = this.document;
    context.config = CONFIG.SR2E;
    return context;
  }
}
