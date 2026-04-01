import { parseDrainCode } from "../data/item-data.mjs";

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
 *
 * Validation rules enforced in the dialog UI:
 *   • Cannot exceed available dice in the pool (pool.value)
 *   • Cannot exceed skillCap (= skill rating, if this is a skill roll)
 * Both constraints are merged into `cap` for each pool.
 * Live feedback: red outline + error label + Roll button disabled while any field is over cap.
 *
 * @param {Actor|null} actor     - Actor to read pools from.
 * @param {number}    [skillCap] - Max pool dice per pool (= skill rating). Default: Infinity.
 * @returns {Promise<{tn: number, poolDice: object}|null>}
 */
async function promptRollOptions(actor, skillCap = Infinity) {
  // Collect pools that have dice available, capping each by both available and skillCap.
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

  // Each pool input carries data-pool-key / data-pool-cap for the validation hook.
  const poolHTML = availablePools.length ? `
    <hr style="margin:8px 0 6px;">
    <p style="margin:0 0 2px;font-size:11px;color:#a0a0a0;">Pool Dice (optional — reduces pool after roll)</p>
    ${capNote}
    ${availablePools.map(p => `
    <div class="form-group" style="margin:3px 0;align-items:flex-start;gap:6px;">
      <label style="font-size:12px;flex:1;padding-top:3px;">${p.label}
        <span style="color:#888;font-size:10px;">(${p.available} left${p.cap < p.available ? `, max ${p.cap}` : ""})</span>
      </label>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <input type="number" name="pool_${p.key}" value="0" min="0" max="${p.cap}"
               data-pool-key="${p.key}" data-pool-cap="${p.cap}"
               style="width:52px;text-align:center;">
        <span class="sr2e-pool-error" data-for="${p.key}"
              style="color:#e44;font-size:9px;display:none;line-height:1.2;text-align:right;"></span>
      </div>
    </div>`).join("")}
  ` : "";

  // ── Live validation via a one-shot renderDialogV2 hook ─────────────────────
  // Foundry V13: ApplicationV2 fires "renderDialogV2" (html is an HTMLElement).
  // We identify our dialog by the presence of data-pool-cap inputs.
  let validationHookId = null;
  if (availablePools.length > 0) {
    validationHookId = Hooks.on("renderDialogV2", (app, html) => {
      const inputs = html.querySelectorAll("input[data-pool-cap]");
      if (!inputs.length) return;                    // not our dialog — stay registered
      Hooks.off("renderDialogV2", validationHookId); // found it — deregister

      const rollBtn = html.querySelector('[data-action="roll"]');

      function validate() {
        let allValid = true;
        for (const input of inputs) {
          const cap = parseInt(input.dataset.poolCap);
          const val = parseInt(input.value) || 0;
          const err = html.querySelector(`.sr2e-pool-error[data-for="${input.dataset.poolKey}"]`);
          const over = val > cap;
          const under = val < 0;
          if (over || under) {
            input.style.outline = "2px solid #c44";
            if (err) {
              err.textContent = under ? "Min: 0" : `Max: ${cap}`;
              err.style.display = "block";
            }
            allValid = false;
          } else {
            input.style.outline = "";
            if (err) err.style.display = "none";
          }
        }
        if (rollBtn) rollBtn.disabled = !allValid;
      }

      for (const input of inputs) {
        input.addEventListener("input", validate);
      }
    });
  }

  // V13 IMPORTANT: DialogV2.wait() resolves with the ACTION STRING ("roll"/"cancel"),
  // NOT the callback's return value. Capture roll data as a side effect, then check action.
  let rollResult = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Roll Options" },
    rejectClose: false,
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
            // Safety clamp — UI validation already prevents over-entry,
            // but this guards against any race conditions or direct DOM edits.
            const clamped = Math.max(0, Math.min(raw, p.cap));
            if (clamped > 0) poolDice[p.key] = clamped;
          }
          rollResult = { tn: isNaN(tn) ? 4 : tn, poolDice };
        }
      },
      {
        action: "cancel",
        label: "Cancel"
      }
    ]
  });

  // Clean up the hook in case the dialog was closed before it rendered (edge case).
  if (validationHookId !== null) Hooks.off("renderDialogV2", validationHookId);

  return (action === "roll" && rollResult) ? rollResult : null;
}

/**
 * Roll an attribute test.
 * @this {ApplicationV2} The sheet application
 */
async function onRollAttribute(event, target) {
  event.preventDefault();
  const attribute = target.dataset.attribute;
  const actor = this.document;
  // SR2E p.86: Combat Pool is only valid for combat-related tests and Damage
  // Resistance Tests — not for general attribute tests. Pass null to suppress
  // pool inputs in the dialog.
  const opts = await promptRollOptions(null);
  if (!opts) return;
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
  // SR2E p.86: Combat Pool is only for combat-related tests (Firearm, Melee, etc.)
  // and Damage Resistance Tests. Pool dice are NOT valid for general skill checks.
  const opts = await promptRollOptions(null);
  if (!opts) return;
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
    if (linkedSkill) {
      const rating = linkedSkill.system?.rating ?? 0;
      // Only enforce the skill-rating cap when the character has training (rating > 0).
      // An untrained character (rating 0) can still add pool dice to a combat test;
      // capping at 0 would hide the pool inputs entirely.
      skillCap = rating > 0 ? rating : Infinity;
    }
  }
  const opts = await promptRollOptions(actor, skillCap);
  if (!opts) return;
  return item.roll({ targetNumber: opts.tn, poolDice: opts.poolDice });
}

/**
 * Prompt for spell casting options.
 *
 * Per SR2E p.84: only Magic Pool dice may be used for spellcasting.
 * Per SR2E p.84: the maximum Magic Pool dice added to a Spell Success Test
 *   equals the caster's Magic Attribute.
 * The player pre-allocates Magic Pool dice between the Spell test and the
 *   Drain Resistance test (SR2E p.139 — allocation happens before rolling).
 *
 * Force is chosen here (1 – Magic Rating). Drain TN = ⌊Force÷2⌋ + drain
 * modifier (SR2E p.140). Drain is Physical if Force > Magic Rating; Stun
 * otherwise.
 *
 * @param {Actor} actor       - The casting actor
 * @param {Item}  spell       - The spell item being cast
 * @returns {Promise<{force:number, tn:number, poolDice:object, drainPoolDice:object}|null>}
 */
async function promptSpellOptions(actor, spell) {
  const available  = getPoolAvailable(actor, "magic");
  const magicAttr  = actor.system.magic?.value ?? 0;
  const spellCap   = Math.min(available, magicAttr);     // cap for spell test
  const drainCap   = available;                          // no cap for drain resist

  // Parse drain code directly from the raw string — avoids DataModel prototype
  // chain issues and works even with serialised/plain-object item data.
  const drainCodeStr = spell?.system?.drainCode ?? "(F / 2)M";
  const drain        = parseDrainCode(drainCodeStr);
  const drainMod     = drain.modifier;   // numeric modifier used in live TN calc
  const drainLevel   = drain.level;      // L, M, S, D
  // Full formula string for display — matches the rulebook exactly
  const drainFormula = drainCodeStr;

  // Initial values at Force 1
  const initDrainTN   = Math.max(2, Math.floor(1 / 2) + drainMod);
  const initDrainType = 1 > magicAttr ? "Physical" : "Stun";
  const initTypeColor = 1 > magicAttr ? "#c44" : "#888";

  // Totem note for shaman feedback
  let totemNote = "";
  if (actor.system.magic?.tradition === "shamanic" && actor.system.magic?.totem) {
    const totemData = CONFIG.SR2E.totems[actor.system.magic.totem];
    const cat = spell?.system?.category;
    if (totemData && cat) {
      const bonus   = totemData.spellBonus?.[cat]   ?? 0;
      const penalty = totemData.spellPenalty?.[cat] ?? 0;
      if (bonus > 0)   totemNote += `<p style="margin:2px 0;font-size:10px;color:#6a6;">⬆ Totem bonus +${bonus} dice (${cat})</p>`;
      if (penalty > 0) totemNote += `<p style="margin:2px 0;font-size:10px;color:#a44;">⬇ Totem penalty −${penalty} dice (${cat})</p>`;
    }
  }

  const poolSection = available > 0 ? `
    <hr style="margin:8px 0 6px;">
    <p style="margin:0 0 2px;font-size:11px;color:#a0a0a0;">
      Magic Pool: ${available} available
    </p>
    ${totemNote}
    <div class="form-group" style="margin:4px 0;">
      <label style="font-size:12px;flex:1;">
        Spell test
        <span style="color:#888;font-size:10px;">(max ${spellCap})</span>
      </label>
      <input type="number" name="spell_pool" value="0" min="0" max="${spellCap}"
             style="width:52px;text-align:center;">
    </div>
    <div class="form-group" style="margin:4px 0;">
      <label style="font-size:12px;flex:1;">
        Drain resist
        <span style="color:#888;font-size:10px;">(no limit)</span>
      </label>
      <input type="number" name="drain_pool" value="0" min="0" max="${drainCap}"
             style="width:52px;text-align:center;">
    </div>
    <p style="margin:2px 0;font-size:10px;color:#888;">
      Total allocated cannot exceed ${available} available dice.
    </p>
  ` : totemNote;

  // Wire up live drain TN update via a render hook (avoids CSP issues with
  // inline event handlers in Foundry's ApplicationV2 rendering pipeline).
  Hooks.once("renderDialogV2", (_app, html) => {
    const forceInput = html.querySelector?.("#sr2e-cast-force")
                    ?? html.getElementById?.("sr2e-cast-force");
    if (!forceInput) return;
    const tnSpan   = (html.querySelector ?? html.getElementById.bind(html))("#sr2e-cast-drain-tn");
    const typeSpan = (html.querySelector ?? html.getElementById.bind(html))("#sr2e-cast-drain-type");
    forceInput.addEventListener("input", () => {
      const f = Math.max(1, Math.min(parseInt(forceInput.value) || 1, magicAttr));
      const tn = Math.max(2, Math.floor(f / 2) + drainMod);
      if (tnSpan)   tnSpan.textContent   = tn;
      if (typeSpan) {
        const isPhys = f > magicAttr;
        typeSpan.textContent = isPhys ? "Physical" : "Stun";
        typeSpan.style.color = isPhys ? "#c44" : "#888";
      }
    });
  });

  let rollResult = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Cast: ${spell.name}` },
    rejectClose: false,
    content: `<form>
      <div class="form-group">
        <label>Force <span style="color:#888;font-size:10px;">(1–${magicAttr})</span>:</label>
        <input type="number" name="force" id="sr2e-cast-force" value="1" min="1" max="${magicAttr}"
               autofocus>
      </div>
      <div style="margin:2px 0 6px;font-size:11px;color:#888;padding-left:4px;">
        Drain: TN <span id="sr2e-cast-drain-tn">${initDrainTN}</span>
        · ${drainLevel}
        <span id="sr2e-cast-drain-type" style="color:${initTypeColor};">${initDrainType}</span>
        <span style="color:#666;font-size:10px;">${drainFormula}</span>
      </div>
      <div class="form-group">
        <label>Target Number:</label>
        <input type="number" name="tn" value="6" min="2" max="30">
      </div>
      ${poolSection}
    </form>`,
    buttons: [
      {
        action: "roll",
        label: "Cast",
        default: true,
        callback: (event, button) => {
          const force = Math.max(1, Math.min(parseInt(button.form.elements.force.value) || 1, magicAttr));
          const tn = parseInt(button.form.elements.tn.value) || 6;
          const rawSpell = parseInt(button.form.elements.spell_pool?.value) || 0;
          const rawDrain = parseInt(button.form.elements.drain_pool?.value) || 0;
          // Clamp each allocation; drain is capped by whatever is left
          const spellAlloc = Math.max(0, Math.min(rawSpell, spellCap));
          const drainAlloc = Math.max(0, Math.min(rawDrain, Math.max(0, available - spellAlloc)));
          rollResult = {
            force,
            tn,
            poolDice:      spellAlloc > 0 ? { magic: spellAlloc } : {},
            drainPoolDice: drainAlloc > 0 ? { magic: drainAlloc } : {}
          };
        }
      },
      { action: "cancel", label: "Cancel" }
    ]
  });

  return (action === "roll" && rollResult) ? rollResult : null;
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
  // Spell-specific dialog: Magic Pool only, split between spell test & drain resist
  const opts = await promptSpellOptions(this.document, item);
  if (opts === null) return;
  return item.roll({ force: opts.force, targetNumber: opts.tn, poolDice: opts.poolDice, drainPoolDice: opts.drainPoolDice });
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
 * Respects data-category on the button for categorised item types (e.g. skills).
 * @this {ApplicationV2}
 */
async function onAddItem(event, target) {
  event.preventDefault();
  const type = target.dataset.type;
  const category = target.dataset.category; // e.g. "build_repair" for B/R skill buttons
  const name = `New ${type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`;
  const itemData = { name, type };
  // Pass the initial category into system data so the item lands in the right section.
  if (category) itemData.system = { category };
  return this.document.createEmbeddedDocuments("Item", [itemData]);
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
 * Reset a single dice pool back to its maximum value.
 * The pool name is read from data-pool on the button.
 * @this {ApplicationV2}
 */
async function onResetPool(event, target) {
  event.preventDefault();
  const pool = target.dataset.pool;
  const poolData = this.document.system.dicePools[pool];
  if (!poolData) return;
  return this.document.update({ [`system.dicePools.${pool}.value`]: poolData.max });
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
  //
  // IMPORTANT: Do NOT call this.render() here. The sheet uses submitOnChange:true,
  // meaning any field change fires an async actor.update(). If we call render()
  // synchronously on tab click, it races with the pending update and re-renders
  // using stale actor data (e.g. magic.type reverts to "none").
  //
  // Instead: toggle active classes directly in the DOM. this.tabGroups is still
  // updated so the correct tab is highlighted on the next legitimate re-render.
  switchTab: function(event, target) {
    const tab = target.dataset.tab;
    const group = target.dataset.group;
    if (!tab || !group || !(group in this.tabGroups)) return;

    // Update internal state (used by _getTabs on next full re-render)
    this.tabGroups[group] = tab;

    const el = this.element;
    if (!el) return;

    // Update nav link active states
    el.querySelectorAll(`.sr2e-tabs[data-group="${group}"] .tab`).forEach(a => {
      a.classList.toggle("active", a.dataset.tab === tab);
    });

    // Update content section active states
    el.querySelectorAll(`.tab-content[data-group="${group}"]`).forEach(section => {
      section.classList.toggle("active", section.dataset.tab === tab);
    });
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
  resetPool:  onResetPool,
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
  /**
   * Clear the character's magical tradition — resets magic.type and
   * magic.tradition to "none". Triggered by the × button on the magic tab.
   */
  clearTradition: async function(event, target) {
    return this.document.update({
      "system.magic.type":      "none",
      "system.magic.tradition": "none",
      "system.magic.skill":     "none",
      "system.magic.totem":     ""
    });
  },

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
    },
    // V13: register DragDrop so _onDragOver/_onDrop/_onDragStart are bound.
    // Without this, dragover never calls preventDefault(), letting the browser's
    // native drop behaviour fire on form <select> elements and corrupt their values.
    dragDrop: [{ dragSelector: "[data-item-id]", dropSelector: null }]
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
   * Drag-and-Drop
   * V13 ApplicationV2: dragover must preventDefault to allow drops;
   * _onDrop parses the transfer payload and dispatches to _onDropItem.
   * ----------------------------------------------------------------------- */

  /** @override */
  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
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
  _onDragStart(event) {
    const li = event.currentTarget.closest("[data-item-id]");
    if (!li) return;
    const item = this.document.items.get(li.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
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
    const current = this.document.system.linkedVehicles ?? [];
    if (current.includes(dropped.uuid)) return false; // already linked
    return this.document.update({ "system.linkedVehicles": [...current, dropped.uuid] });
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

    return this.document.createEmbeddedDocuments("Item", [itemData]);
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
      const confirmed = await Dialog.confirm({
        title: "Change Metatype?",
        content: `<p>This character is currently a <strong>${currentLabel}</strong>.
          Replace with <strong>${itemData.name}</strong>?
          Racial attribute modifiers and maximums will be updated.</p>`,
        defaultYes: false
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
      const confirmed = await Dialog.confirm({
        title: "Change Tradition?",
        content: `<p>This character already has the <strong>${currentLabel}</strong> tradition set.
          Replace with <strong>${itemData.name}</strong>?</p>`,
        defaultYes: false
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

    // Adept powers: physical adepts and shamanic adepts
    context.hasAdeptPowers = magicType === "physical_adept" || magicType === "shamanic_adept";

    // Keep legacy labels for any other templates still using them
    context.magicTypeLabel      = context.magicLabel;
    context.magicTraditionLabel = "";

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
    }

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
    // display:none. This affects every named field on the Magic, Skills, Combat,
    // Matrix, Gear, Vehicles, Contacts, and Bio tabs.
    // Wire them up explicitly here so any change saves immediately, bypassing
    // the broken submitOnChange registration. Propagation is stopped to prevent
    // a double-save in cases where submitOnChange also fires.
    // Inputs inside [data-item-id] are excluded — those belong to embedded Items
    // and are handled separately in the block below.
    for (const input of this.element.querySelectorAll(
      ".tab-content input[name], .tab-content select[name], .tab-content textarea[name]"
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

    // Inline embedded-item field changes (e.g. skill rating inputs on the Skills tab).
    // These inputs use data-field instead of name because they belong to an embedded
    // Item, not the Actor, so the actor form's submitOnChange never touches them.
    // We listen for "change" and update the embedded item directly.
    for (const input of this.element.querySelectorAll("[data-item-id] [data-field]")) {
      input.addEventListener("change", (event) => {
        event.stopPropagation(); // prevent the actor form from also firing
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
    },
    dragDrop: [{ dragSelector: "[data-item-id]", dropSelector: null }]
  };

  /** @override */
  static PARTS = {
    npc: { template: "systems/sr2e/templates/actor/npc-sheet.hbs" }
  };

  _onDragOver(event) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }

  _onDragStart(event) {
    const li = event.currentTarget.closest("[data-item-id]");
    if (!li) return;
    const item = this.document.items.get(li.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
  }

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
