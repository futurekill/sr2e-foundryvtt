const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

import { SPECIES_CHOICES } from "../rules/shapeshift-rules.mjs";
import { SHARED_ACTIONS } from "./sheet-actions.mjs";
import { isVR2 } from "../vr2-mode.mjs";
import { hasRefundableStock, queuedQuantityEdit, moneyQueue, adjustNuyen, updated } from "../money.mjs";
import { withRowIds } from "../rules/ware-rules.mjs";
import { rollSecondhandTest } from "../secondhand.mjs";


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
      secondhandTest:  function() { return rollSecondhandTest(this.document); },
      addRatingRow:    SR2EItemSheet._addRatingRow,
      removeRatingRow: SR2EItemSheet._removeRatingRow,
      addModuleRow:    SR2EItemSheet._addModuleRow,
      removeModuleRow: SR2EItemSheet._removeModuleRow,
      addEffect:       SR2EItemSheet._addEffect,
      editEffect:      SR2EItemSheet._editEffect,
      deleteEffect:    SR2EItemSheet._deleteEffect,
      editImage:       SHARED_ACTIONS.editImage
    },
    form: {
      submitOnChange: true
    },
    window: {
      resizable: true
    }
  };

  /**
   * @override
   * Refundable stock (ammo, tracked drugs) on a character: the quantity is never resent
   * by an unrelated field's submit, and a real edit goes through the owner's money queue
   * against the value this form showed (docs/PLAN-money-queue-and-eye-accessories.md, A2).
   */
  async _processSubmitData(event, form, submitData, options) {
    const item = this.document;
    const q = submitData?.system?.quantity;
    if (q !== undefined && item.parent?.type === "character" && hasRefundableStock(item)) {
      delete submitData.system.quantity;
      if (Number(q) !== Number(this._shownQuantity)) {
        const shown = this._shownQuantity;
        this._shownQuantity = Number(q);
        queuedQuantityEdit(item, shown, Number(q)).then(ok => { if (!ok) this.render(); });
      }
    }
    // Container rows: merge the submitted fields onto the rows BY ID, so fields the form
    // doesn't show (id, paid, listValue) survive and a stale form never rewrites a row
    // that changed meanwhile.
    const sub = submitData?.system?.modules;
    if (sub !== undefined) {
      delete submitData.system.modules;
      if (!this._rowsLocked) {
        const shown = this._shownRows ?? [];
        const edits = [];
        for (const [k, v] of Object.entries(sub ?? {})) {
          const base = shown[Number(k)];
          if (!base || !v) continue;
          const fields = {};
          // Only the fields the form shows: cleaning may fill hidden ones (paid…) with defaults.
          for (const f of ROW_FORM_FIELDS) if (f in v && !foundry.utils.objectsEqual({ v: base[f] }, { v: v[f] })) fields[f] = v[f];
          if (Object.keys(fields).length) edits.push({ id: base.id, index: Number(k), fields });
        }
        if (edits.length) applyRowChanges(item, (rows) => {
          for (const e of edits) {
            const i = e.id ? rows.findIndex(r => r.id === e.id) : e.index;
            if (i >= 0 && rows[i]) rows[i] = { ...rows[i], ...e.fields };
          }
          return rows;
        }).then(ok => { if (!ok) this.render(); });
      }
    }
    if (submitData?.system && !Object.keys(submitData.system).length) delete submitData.system;
    if (!Object.keys(submitData ?? {}).length) return;
    // A cybereye on a character: its other fields (pair/single, installed, Essence) change
    // what an accessory fit checks, so they land in the owner's money queue too.
    const actor = moneyActor(item);
    if (actor && item.system.wareRule === "cybereye-pair") {
      return moneyQueue(actor, () => actor.items.has(item.id) ? super._processSubmitData(event, form, submitData, options) : null, "eye form");
    }
    return super._processSubmitData(event, form, submitData, options);
  }

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
    context.isGM = game.user.isGM;
    // What the form shows, so a whole-form submit can tell a real quantity edit from a
    // stale resend (see _processSubmitData).
    this._shownQuantity = item.system.quantity;
    // Container rows as rendered: form fields address rows by POSITION, so submits are
    // mapped back to row ids through this snapshot (docs/PLAN-money-queue-…, B2).
    this._shownRows = foundry.utils.deepClone(item._source.system?.modules ?? []);
    this._rowsLocked = false;
    if (this._shownRows.some(r => !r.id)) {
      if (moneyActor(item)) {
        // Legacy rows get ids first, in the owner's money queue; until then they're read-only.
        this._rowsLocked = context.rowsLocked = true;
        normaliseRowIds(item, this._shownRows);
      } else this._rowsLocked = context.rowsLocked = !item.isOwner;
    }

    // A spell focus binds to ONE spell on its owning actor (SR2E p.137), so the
    // form needs that actor's spells to choose from. Nothing supplied them before,
    // so a selector added to the template would have rendered empty.
    if (item.type === "focus" && item.system.focusType === "spell") {
      // An UNOWNED focus — sitting in a compendium or the items sidebar — has no
      // actor and therefore nothing to bind to. Say so rather than showing an
      // empty dropdown that looks broken.
      context.focusOwned = !!item.actor;
      context.focusSpells = item.actor
        ? item.actor.items.filter(i => i.type === "spell")
            .map(i => ({ id: i.id, name: i.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      // Drives the persistent warning. Expendable fetish foci are out of this
      // mechanism entirely, so they are never "unbound".
      context.focusUnbound = context.focusOwned
        && !item.system.expendable
        && !item.system.boundSpellId;
    }
    // Fields the derivation OVERWRITES in place must be EDITED at their authored
    // value, or saving the sheet persists the derived one. Where the transform is
    // relative (base + bonus) that compounds on every save: bone lacing turned
    // (Str)M into (Str+3)M into (Str+3+3)M (GitHub #15), and module TN bonuses did
    // the same to combatTnMod. A narrow projection rather than all of `_source`,
    // so templates don't grow a dependency on a private Foundry property.
    // `effective` is the prepared value — display only, never an input.
    // `cost` is here for the same reason: a bow prices off Str Min, a cyberlimb
    // option off its formula, a soft off the Skill Memory Table and a focus off
    // Force — all of them OVERWRITE system.cost. With submitOnChange, editing any
    // other field on the sheet would then persist that derived price as the
    // authored one, and clearing the formula afterwards would "reveal" a number
    // nobody typed.
    context.authored = {
      damageCode: item._source.system?.damageCode,
      combatTnMod: item._source.system?.combatTnMod,
      cost: item._source.system?.cost,
      // A VR2.0 attack utility's multiplier follows its Damage Level (ProgramData).
      multiplier: item._source.system?.multiplier
    };
    context.effective = { damageCode: item.system.damageCode, combatTnMod: item.system.combatTnMod,
                          cost: item.system.cost };
    context.damageCodeDerived = context.authored.damageCode !== context.effective.damageCode;
    context.combatTnModDerived = context.authored.combatTnMod !== context.effective.combatTnMod;
    context.costDerived = context.authored.cost !== context.effective.cost;
    context.multiplierDerived = item.type === "program" && context.authored.multiplier !== item.system.multiplier;
    context.vr2 = isVR2();
    context.effects = item.effects.contents;
    context.config = CONFIG.SR2E;
    context.speciesChoices = SPECIES_CHOICES;   // race items: shapeshifter species (Companion p.36)
    context.isOwned = !!item.parent;
    context.type = item.type;
    context.editable = this.isEditable;
    // Skillwire systems expose a "Plus" toggle (doubles ActiveSoft capacity).
    context.isSkillwire = item.type === "cyberware" && /skillwire/i.test(item.name);

    // Provide enriched HTML for notes/descriptions
    const enrichOpts = {
      secrets: this.document.isOwner,
      async: true,
      relativeTo: this.document
    };
    if (item.system.notes) {
      context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.notes, enrichOpts);
    }
    if (item.system.description) {
      context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, enrichOpts);
    }

    // Map item type → FontAwesome icon class for the header display
    const ITEM_ICONS = {
      skill:       "fas fa-book",
      weapon:      "fas fa-crosshairs",
      armor:       "fas fa-shield-alt",
      spell:       "fas fa-hat-wizard",
      cyberware:   "fas fa-microchip",
      bioware:     "fas fa-dna",
      gear:        "fas fa-toolbox",
      program:     "fas fa-laptop-code",
      ammo:        "fas fa-circle",
      focus:       "fas fa-gem",
      adept_power: "fas fa-bolt",
      contact:     "fas fa-address-card",
      lifestyle:   "fas fa-home",
      vehicle_mod: "fas fa-wrench",
      quality:     "fas fa-star-half-alt"
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
        // Show the "Actual Essence" hint for any grade that reduces it, not just
        // alpha — betaware reduces it too (SSC p.98).
        context.gradeReducesEssence =
          (CONFIG.SR2E.cyberwareGrades[item.system.grade]?.essenceMultiplier ?? 1) !== 1
          || !!item.system.surgeryEssencePct;                // the surgeon's change (Cybertechnology p.53)
        context.isContainer = (item.system.capacity ?? 0) > 0 || (item.system.modules?.length ?? 0) > 0;
        break;
      case "bioware":
        context.biowareGrades = CONFIG.SR2E.biowareGrades;
        context.bodySystems = CONFIG.SR2E.bodySystems;
        context.hasRatingTable = (item.system.ratingStats?.length ?? 0) > 0;
        break;
      case "program":
        context.programCategories = CONFIG.SR2E.programCategories;
        break;
      case "skill":
        context.skillCategories = CONFIG.SR2E.skillCategories;
        context.attributes = CONFIG.SR2E.attributes;
        break;
      case "gear":
        // Skillsoft: offer a dropdown of standard skills (from the skills
        // compendium) matching the soft's type, so the granted skill is picked
        // rather than typed. Only the chip's own category: a chip has no
        // build_repair category, and _applySkillsofts matches categories
        // exactly, so a Build/Repair pick would grant a separate Active skill
        // (the Buy dialog lists the same way).
        if (item.system.category === "skillsoft") {
          const cats = [item.system.grantedSkillCategory];
          context.skillCatalog = await SR2EItemSheet._skillCatalog(cats);
        }
        break;
      case "lifestyle":
        context.lifestyles = CONFIG.SR2E.lifestyles;
        break;
      case "quality":
        context.qualityKinds = CONFIG.SR2E.qualityKinds;
        context.qualityCategories = CONFIG.SR2E.qualityCategories;
        context.qualityAttributes = CONFIG.SR2E.qualityAttributes;
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
   * Standard skills (name + linked attribute) from the skills compendium,
   * filtered to the given categories and sorted. Used to populate the skillsoft
   * granted-skill dropdown. Returns [] if the pack is unavailable.
   * @param {string[]} categories
   * @private
   */
  static async _skillCatalog(categories) {
    const pack = game.packs?.get("sr2e.skills");
    if (!pack) return [];
    const index = await pack.getIndex({ fields: ["system.category", "system.linkedAttribute"] });
    return index
      .filter(e => categories.includes(e.system?.category))
      .map(e => ({ name: e.name, attribute: e.system?.linkedAttribute || "intelligence" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Skillsoft quick-pick: choosing a standard skill fills the granted-skill
    // and linked-attribute fields and names the chip — one click configures it.
    const picker = this.element.querySelector("select.skill-picker");
    if (!picker) return;
    picker.addEventListener("change", async () => {
      const skill = picker.value;
      if (!skill) return;
      const attr = picker.selectedOptions[0]?.dataset.attr;
      const update = { "system.grantedSkill": skill };
      if (attr) update["system.grantedSkillAttribute"] = attr;
      const typeLabel = { active: "ActiveSoft", knowledge: "KnowSoft", language: "LinguaSoft" }[this.document.system.grantedSkillCategory] ?? "Skillsoft";
      if (/^(New Gear|New Item|ActiveSoft|KnowSoft|LinguaSoft|DataSoft)\b/.test(this.document.name)) {
        update.name = `${skill} ${typeLabel}`;
      }
      await this.document.update(update);
    });
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
   * Add a new row to the rating stats table. The new row gets the next unique
   * rating after the highest existing one (keeps ratings sorted + unique, which
   * BiowareData.prepareDerivedData relies on). Bioware rows carry `bodyCost`;
   * cyberware rows carry `essenceCost`.
   */
  static async _addRatingRow(event, target) {
    event.preventDefault();
    const item = this.document;
    const rows = foundry.utils.deepClone(item.system.ratingStats ?? []);
    const nextRating = rows.length > 0 ? (Math.max(...rows.map(r => r.rating)) + 1) : 1;
    const costKey = item.type === "bioware" ? { bodyCost: 0 } : { essenceCost: 0 };
    rows.push({ rating: nextRating, ...costKey, cost: 0, availability: "", streetIndex: "" });
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
    const row = { id: foundry.utils.randomID(), name: "", essenceCost: 0, cost: 0, rating: 0, combatTnMod: 0, active: true, notes: "" };
    const extra = (item.system.capacity ?? 0) <= 0 ? { "system.capacity": 0.5 } : {};
    await applyRowChanges(item, (rows) => [...rows, row], extra);
  }

  /** Remove a module slot from container cyberware. */
  static async _removeModuleRow(event, target) {
    event.preventDefault();
    const item = this.document;
    const rowId = target.dataset.rowId;
    const index = parseInt(target.dataset.index);
    const actor = moneyActor(item);
    if (!actor) {
      if (isNaN(index)) return;
      const mods = foundry.utils.deepClone(item._source.system.modules ?? []);
      mods.splice(index, 1);
      return item.update({ "system.modules": mods });
    }
    if (!rowId) return this.render();   // legacy rows: ids first (see _prepareContext)
    // On a character: remove the row and refund what was paid for it, in ONE money entry.
    return moneyQueue(actor, async () => {
      const live = actor.items.get(item.id);
      const rows = foundry.utils.deepClone(live?._source.system.modules ?? []);
      const i = rows.findIndex(r => r.id === rowId);
      if (i < 0) return;
      const [gone] = rows.splice(i, 1);
      if (!(await updated(live.update({ "system.modules": rows }), "remove row"))) return ui.notifications.warn(`Couldn't remove ${gone.name || "that row"}.`);
      const refund = Number(gone.paid) || 0;
      if (!refund) return;
      if (await adjustNuyen(actor, refund)) return ui.notifications.info(`${actor.name} gets ${refund}¥ back for ${gone.name || "the accessory"}.`);
      const back = foundry.utils.deepClone(actor.items.get(item.id)?._source.system.modules ?? []);
      back.splice(Math.min(i, back.length), 0, gone);
      if (await updated(live.update({ "system.modules": back }), "restore row")) ui.notifications.warn(`Couldn't refund ${gone.name}, so it was put back.`);
      else ui.notifications.error(`${gone.name} was removed but its ${refund}¥ wasn't refunded: add it to ${actor.name} by hand.`, { permanent: true });
    }, "remove eye row");
  }
}

/** The row fields the item sheet's form edits (templates/item/item-body.hbs). */
const ROW_FORM_FIELDS = ["active", "name", "essenceCost", "cost", "rating", "combatTnMod", "kind", "eye"];

/** The character whose money queue an item's row changes go through, or null (unembedded, NPC…). */
function moneyActor(item) {
  const actor = item.parent;
  return actor?.type === "character" ? actor : null;
}

/**
 * Change an item's container rows. On a character: inside the owner's money queue, against
 * the LIVE rows (by id); otherwise directly. `mutate(rows)` returns the new rows.
 */
export function applyRowChanges(item, mutate, extra = {}) {
  const actor = moneyActor(item);
  const run = async () => {
    const live = actor ? actor.items.get(item.id) : item;
    if (!live) return false;
    const rows = mutate(foundry.utils.deepClone(live._source.system.modules ?? []));
    return updated(live.update({ "system.modules": rows, ...extra }), "container rows");
  };
  return actor ? moneyQueue(actor, run, "eye rows") : run();
}

/** Give legacy rows ids, if the live rows are still the ones the sheet rendered. */
function normaliseRowIds(item, shown) {
  const actor = moneyActor(item);
  return moneyQueue(actor, async () => {
    const live = actor.items.get(item.id);
    const rows = foundry.utils.deepClone(live?._source.system.modules ?? []);
    if (!live || !foundry.utils.objectsEqual({ r: rows }, { r: shown })) return live?.sheet?.render();
    const fixed = withRowIds(rows, () => foundry.utils.randomID());
    if (fixed) await updated(live.update({ "system.modules": fixed }), "row ids");
  }, "row ids");
}
