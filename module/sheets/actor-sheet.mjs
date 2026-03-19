const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

// V13: TextEditor is namespaced; shim for backwards compat
const TextEditor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

// ---------------------------------------------------------------------------
// SHARED ACTION HANDLERS
// These are standalone async functions used by multiple sheet classes.
// In V13 ApplicationV2, action handlers receive (event, target) and
// `this` is bound to the Application instance.
// ---------------------------------------------------------------------------

/**
 * Pool definitions: key → display label.
 * These map to system.dicePools.X.value.
 * Karma Pool is intentionally excluded — it is spent separately, not during a roll.
 */
const POOL_DEFS = [
  { key: "combat",  label: "Combat Pool" },
  { key: "magic",   label: "Magic Pool" },
  { key: "hacking", label: "Hacking Pool" },
  { key: "control", label: "Control Pool" }
];

/**
 * Get the current available dice for a pool from an actor.
 * @param {Actor} actor
 * @param {string} key
 * @returns {number}
 */
function getPoolAvailable(actor, key) {
  if (!actor?.system) return 0;
  return actor.system.dicePools?.[key]?.value ?? 0;
}

/**
 * Prompt for a target number and optional pool dice via DialogV2.
 * Shows only pools that have available dice.
 * @param {Actor|null} actor     - Actor to read pools from (may be null for NPCs)
 * @param {number}    [skillCap] - Max pool dice allowed per pool (= skill rating being used).
 *                                 Defaults to Infinity (no cap) for attribute-only or uncapped rolls.
 * @returns {Promise<{tn: number, poolDice: object}|null>}
 */
async function promptRollOptions(actor, skillCap = Infinity) {
  // Collect non-zero pools, capping each by skillCap and available dice
  const availablePools = POOL_DEFS
    .map(p => {
      const available = getPoolAvailable(actor, p.key);
      const cap = skillCap === Infinity ? available : Math.min(available, skillCap);
      return { ...p, available, cap };
    })
    .filter(p => p.cap > 0);

  const capNote = skillCap !== Infinity
    ? `<p style="margin:0 0 4px;font-size:10px;color:#888;">Max pool dice per pool: ${skillCap} (= skill rating)</p>`
    : "";

  const poolHTML = availablePools.length ? `
    <hr style="margin:8px 0 6px;">
    <p style="margin:0 0 2px;font-size:11px;color:#a0a0a0;">Pool Dice (optional — reduces pool after roll)</p>
    ${capNote}
    ${availablePools.map(p => `
    <div class="form-group" style="margin:3px 0;align-items:center;gap:6px;">
      <label style="font-size:12px;flex:1;">${p.label}
        <span style="color:#888;font-size:10px;">(${p.available} left${p.cap < p.available ? `, max ${p.cap}` : ""})</span>
      </label>
      <input type="number" name="pool_${p.key}" value="0" min="0" max="${p.cap}"
             style="width:48px;text-align:center;">
    </div>`).join("")}
  ` : "";

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Roll Options" },
    content: `
      <form>
        <div class="form-group">
          <label>Target Number:</label>
          <input type="number" name="tn" value="4" min="2" max="30" autofocus>
        </div>
        ${poolHTML}
      </form>
    `,
    buttons: [
      {
        action: "roll",
        label: "Roll",
        default: true,
        callback: (event, button, dialog) => {
          const tn = parseInt(button.form.elements.tn.value);
          const poolDice = {};
          for (const p of availablePools) {
            const raw = parseInt(button.form.elements[`pool_${p.key}`]?.value) || 0;
            const clamped = Math.max(0, Math.min(raw, p.cap));
            if (clamped > 0) poolDice[p.key] = clamped;
          }
          return { tn: isNaN(tn) ? 4 : tn, poolDice };
        }
      },
      {
        action: "cancel",
        label: "Cancel",
        callback: () => null
      }
    ],
    close: () => null
  });
  return result;
}

/**
 * Roll an attribute test.
 * @this {ApplicationV2} The sheet application
 */
async function onRollAttribute(event, target) {
  event.preventDefault();
  const attribute = target.dataset.attribute;
  const actor = this.document;
  const opts = await promptRollOptions(actor);
  if (opts === null) return;
  return actor.rollAttributeTest(attribute, opts.tn, { poolDice: opts.poolDice });
}

/**
 * Roll a skill test.
 * Pool dice are capped at the skill's current rating.
 * @this {ApplicationV2}
 */
async function onRollSkill(event, target) {
  event.preventDefault();
  const skillId = target.closest("[data-item-id]")?.dataset.itemId;
  if (!skillId) return;
  const actor = this.document;
  const skill = actor.items.get(skillId);
  const skillCap = skill?.system?.rating ?? Infinity;
  const opts = await promptRollOptions(actor, skillCap);
  if (opts === null) return;
  return actor.rollSkillTest(skillId, opts.tn, { poolDice: opts.poolDice });
}

/**
 * Roll initiative.
 * @this {ApplicationV2}
 */
async function onRollInitiative(event, target) {
  event.preventDefault();
  return this.document.rollInitiative();
}

/**
 * Roll a weapon attack.
 * Pool dice are capped at the rating of the skill linked to this weapon.
 * @this {ApplicationV2}
 */
async function onRollWeapon(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;
  // Find the skill linked to this weapon (matched by skill key on the weapon vs. skill name slug)
  const weaponSkillKey = item.system?.skill ?? "";
  const actor = this.document;
  let skillCap = Infinity;
  if (weaponSkillKey) {
    // Look for a skill item whose name (lowercased, spaces→underscores) matches the weapon's skill key
    const linkedSkill = actor.items.find(i =>
      i.type === "skill" &&
      (i.name.toLowerCase().replace(/\s+/g, "_") === weaponSkillKey.toLowerCase() ||
       i.name.toLowerCase().replace(/[\s/()]+/g, "_") === weaponSkillKey.toLowerCase())
    );
    if (linkedSkill) skillCap = linkedSkill.system?.rating ?? Infinity;
  }
  const opts = await promptRollOptions(actor, skillCap);
  if (opts === null) return;
  return item.roll({ targetNumber: opts.tn, poolDice: opts.poolDice });
}

/**
 * Cast a spell.
 * @this {ApplicationV2}
 */
async function onCastSpell(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;
  const opts = await promptRollOptions(this.document);
  if (opts === null) return;
  return item.roll({ targetNumber: opts.tn, poolDice: opts.poolDice });
}

/**
 * Roll a program action.
 * @this {ApplicationV2}
 */
async function onRollProgram(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;
  const opts = await promptRollOptions(this.document);
  if (opts === null) return;
  return item.roll({ targetNumber: opts.tn, poolDice: opts.poolDice });
}

/**
 * Toggle equip/install state for an item.
 * @this {ApplicationV2}
 */
async function onToggleEquip(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;
  const field = item.type === "cyberware" ? "system.installed" :
                item.type === "program" ? "system.loaded" : "system.equipped";
  const currentValue = item.type === "cyberware" ? item.system.installed :
                       item.type === "program" ? item.system.loaded : item.system.equipped;
  return item.update({ [field]: !currentValue });
}

/**
 * Edit an item (open its sheet).
 * @this {ApplicationV2}
 */
async function onEditItem(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (item) item.sheet.render(true);
}

/**
 * Delete an item with confirmation.
 * @this {ApplicationV2}
 */
async function onDeleteItem(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: `Delete ${item.name}?` },
    content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`
  });

  if (confirmed) return item.delete();
}

/**
 * Add a new item of a given type.
 * @this {ApplicationV2}
 */
async function onAddItem(event, target) {
  event.preventDefault();
  const type = target.dataset.type;
  const name = `New ${type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`;
  return this.document.createEmbeddedDocuments("Item", [{ name, type }]);
}

/**
 * Reset all dice pools to their maximum values.
 * @this {ApplicationV2}
 */
async function onResetPools(event, target) {
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
 * Increment a condition monitor by 1 (up to max).
 * @this {ApplicationV2}
 */
async function onIncrementMonitor(event, target) {
  event.preventDefault();
  const monitor = target.dataset.monitor;
  const cm = this.document.system.conditionMonitor[monitor];
  if (!cm || cm.value >= cm.max) return;
  return this.document.update({ [`system.conditionMonitor.${monitor}.value`]: cm.value + 1 });
}

/**
 * Decrement a condition monitor by 1 (down to 0).
 * @this {ApplicationV2}
 */
async function onDecrementMonitor(event, target) {
  event.preventDefault();
  const monitor = target.dataset.monitor;
  const cm = this.document.system.conditionMonitor[monitor];
  if (!cm || cm.value <= 0) return;
  return this.document.update({ [`system.conditionMonitor.${monitor}.value`]: cm.value - 1 });
}

// ---------------------------------------------------------------------------
// Shared actions map used by character sheet and NPC sheet
// ---------------------------------------------------------------------------
const SHARED_ACTIONS = {
  // Tab navigation — use switchTab so V13's built-in _onClickTab never fires.
  // changeTab() fails because content sections live inside <div data-part="x">
  // wrappers that V13 injects, not as direct children of this.element.
  // Instead: update tabGroups and re-render directly.
  switchTab: function(event, target) {
    const tab = target.dataset.tab;
    const group = target.dataset.group;
    if (tab && group && group in this.tabGroups) {
      this.tabGroups[group] = tab;
      this.render();
    }
  },
  rollAttribute: onRollAttribute,
  rollSkill: onRollSkill,
  rollInitiative: onRollInitiative,
  rollWeapon: onRollWeapon,
  castSpell: onCastSpell,
  rollProgram: onRollProgram,
  toggleEquip: onToggleEquip,
  editItem: onEditItem,
  deleteItem: onDeleteItem,
  addItem: onAddItem,
  resetPools: onResetPools,
  incrementMonitor: onIncrementMonitor,
  decrementMonitor: onDecrementMonitor,

  /**
   * Increment the condition monitor of a linked vehicle actor.
   * Uses data-vehicle-uuid on the button (or a parent) to find the vehicle.
   * @this {ApplicationV2}
   */
  incrementVehicleMonitor: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    if (!uuid) return;
    const vehicle = await fromUuid(uuid);
    if (!vehicle) return;
    const cm = vehicle.system.conditionMonitor;
    if (!cm || cm.value >= cm.max) return;
    return vehicle.update({ "system.conditionMonitor.value": cm.value + 1 });
  },

  /**
   * Decrement the condition monitor of a linked vehicle actor.
   * @this {ApplicationV2}
   */
  decrementVehicleMonitor: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    if (!uuid) return;
    const vehicle = await fromUuid(uuid);
    if (!vehicle) return;
    const cm = vehicle.system.conditionMonitor;
    if (!cm || cm.value <= 0) return;
    return vehicle.update({ "system.conditionMonitor.value": cm.value - 1 });
  },

  /**
   * Open a linked vehicle's sheet.
   * @this {ApplicationV2}
   */
  openVehicle: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    if (!uuid) return;
    const vehicle = await fromUuid(uuid);
    if (vehicle) vehicle.sheet.render(true);
  },

  /**
   * Unlink a vehicle from this character.
   * @this {ApplicationV2}
   */
  unlinkVehicle: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    if (!uuid) return;
    const current = this.document.system.linkedVehicles ?? [];
    const updated = current.filter(v => v !== uuid);
    return this.document.update({ "system.linkedVehicles": updated });
  },

  /**
   * Open a FilePicker to change the actor portrait.
   * In V13 ApplicationV2, data-edit="img" is not automatically handled,
   * so we wire it up via data-action="editImage".
   * @this {ApplicationV2}
   */
  editImage: async function(event, target) {
    event.preventDefault();
    const actor = this.document;
    const fp = new FilePicker({
      type: "image",
      current: actor.img,
      callback: async (path) => {
        await actor.update({ img: path });
      }
    });
    fp.browse();
  }
};

// =========================================================================
// CHARACTER SHEET
// =========================================================================

/**
 * Character Sheet for Shadowrun 2E player characters.
 * Uses the V13 ApplicationV2 framework with HandlebarsApplicationMixin.
 */
export class SR2ECharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "character"],
    position: { width: 800, height: 700 },
    actions: SHARED_ACTIONS,
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
    vehicles: { template: "systems/sr2e/templates/actor/parts/actor-vehicles.hbs" },
    contacts: { template: "systems/sr2e/templates/actor/parts/actor-contacts.hbs" },
    bio: { template: "systems/sr2e/templates/actor/parts/actor-bio.hbs" }
  };

  /** @override */
  tabGroups = {
    primary: "attributes"
  };

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
  async _onDrop(event) {
    event.preventDefault();
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
    const current = this.document.system.linkedVehicles ?? [];
    if (current.includes(dropped.uuid)) return false; // already linked
    return this.document.update({ "system.linkedVehicles": [...current, dropped.uuid] });
  }

  /**
   * Handle dropping an Item onto the actor sheet.
   * Supports compendium browser, world sidebar, and inter-actor drops.
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
    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.system = system;
    context.actor = actor;
    context.config = CONFIG.SR2E;
    context.editable = this.isEditable;

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

    // Tab state
    context.tabs = this._getTabs();

    // Enriched HTML fields
    context.enrichedBiography = await TextEditor.enrichHTML(system.biography || "", {
      secrets: this.document.isOwner,
      rollData: actor.getRollData(),
      async: true,
      relativeTo: this.document
    });
    context.enrichedNotes = await TextEditor.enrichHTML(system.notes || "", {
      secrets: this.document.isOwner,
      rollData: actor.getRollData(),
      async: true,
      relativeTo: this.document
    });

    // Derived display values
    context.woundPenalty = system.woundPenalty;
    context.woundLevel = system.woundLevel;
    context.isMagical = system.isMagical;
    context.isDecker = system.isDecker;
    context.isRigger = system.isRigger;

    // Attribute lists for template iteration
    context.physicalAttributes = ["body", "quickness", "strength"];
    context.mentalAttributes = ["charisma", "intelligence", "willpower"];

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

  /**
   * @override
   * After every render, wire up prose-mirror editors for reliable saves.
   *
   * Problem: HTMLProseMirrorElement only commits its content on an explicit
   * save gesture (Ctrl+S / toolbar button). It does NOT auto-save on blur,
   * so content typed without an explicit save is silently lost when the sheet
   * closes or re-renders.
   *
   * Fix: listen for `focusout` on each prose-mirror element. When focus leaves
   * the editor entirely (not just moving to the toolbar), save immediately via
   * document.update(). This is safe to call on every render because the old
   * elements are replaced by the new ones each time.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!this.isEditable) return;
    for (const pm of this.element.querySelectorAll("prose-mirror[name]")) {
      pm.addEventListener("focusout", (event) => {
        // focusout bubbles — ignore when focus moves within the same editor
        // (e.g. clicking a toolbar button keeps us inside the prose-mirror)
        if (pm.contains(event.relatedTarget)) return;
        const name = pm.getAttribute("name");
        const value = pm.value ?? "";
        if (name) this.document.update({ [name]: value });
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
export class SR2ENPCSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "npc"],
    position: { width: 650, height: 550 },
    actions: {
      rollAttribute: onRollAttribute,
      rollInitiative: onRollInitiative,
      rollWeapon: onRollWeapon,
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
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

  _onDragOver(event) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }
    if (data?.type === "Item") return this._onDropItem(event, data);
  }

  async _onDropItem(event, data) {
    if (!this.document.isOwner) return false;
    const item = data.uuid ? await fromUuid(data.uuid) : null;
    if (!item) return false;
    if (item.parent?.uuid === this.document.uuid) return false;
    return this.document.createEmbeddedDocuments("Item", [item.toObject()]);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.system = system;
    context.actor = actor;
    context.config = CONFIG.SR2E;
    context.editable = this.isEditable;

    context.skills = actor.items.filter(i => i.type === "skill");
    context.weapons = actor.items.filter(i => i.type === "weapon");
    context.gear = actor.items.filter(i => i.type === "gear");
    context.spells = actor.items.filter(i => i.type === "spell");

    context.enrichedBiography = await TextEditor.enrichHTML(system.biography || "", {
      secrets: this.document.isOwner,
      async: true,
      relativeTo: this.document
    });

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context.partId = `${this.id}-${partId}`;
    return context;
  }
}

// =========================================================================
// VEHICLE SHEET
// =========================================================================

/**
 * Vehicle Sheet.
 */
export class SR2EVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "vehicle"],
    position: { width: 550, height: 450 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    },
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
    context.editable = this.isEditable;
    context.weapons = this.document.items.filter(i => i.type === "weapon");
    context.mods = this.document.items.filter(i => i.type === "vehicle_mod");
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context.partId = `${this.id}-${partId}`;
    return context;
  }
}

// =========================================================================
// SPIRIT SHEET
// =========================================================================

/**
 * Spirit Sheet.
 */
export class SR2ESpiritSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "spirit"],
    position: { width: 500, height: 450 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    },
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
    context.editable = this.isEditable;
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context.partId = `${this.id}-${partId}`;
    return context;
  }
}

// =========================================================================
// IC SHEET
// =========================================================================

/**
 * IC (Intrusion Countermeasures) Sheet.
 */
export class SR2EICSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "ic"],
    position: { width: 450, height: 400 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    },
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
    context.editable = this.isEditable;
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context.partId = `${this.id}-${partId}`;
    return context;
  }
}
