import { shiftView } from "../shapeshift.mjs";
import { shapeshifterOf, SHAPESHIFTER_PRIORITIES, SPECIES_CHOICES, weaponUsable, activeFormOf } from "../rules/shapeshift-rules.mjs";
import { mbwOn, mbwFold, stuckSeizures } from "../mbw.mjs";
import { cymOn, cymFold, cymSurgery, proposeOperation } from "../cybermancy.mjs";
import { cyberDamageOn } from "../cyberdamage.mjs";
import { accessoryKindOf, eyeHostAt, fitEyeAccessory, withSource } from "../eye-accessories.mjs";
import { CCSS_ROWS } from "../rules/mbw-rules.mjs";
import { rowsListValue, wareCtx, physicalLimbs, sourcesOf, fullCyberlimbs, muscleFactor, MUSCLE, ceil2 } from "../rules/ware-rules.mjs";
import { resolveVehicleDesign, aggregateModDesign, modDesignPoints, streetPrice, chargenSpend, attributeEdgeViolations, overstressPenalty, itemBaseCost, derivedItemCost, purchasePromptFields, strengthMinWeaponStats, personaBudgetOver, surgeryEssencePct, surgeonTN, surgeryCategory, secondhandPriceMultiplier, gradeEssenceCost, surgicalEssence, effectiveBodyCost } from "../rules/sr2e-rules.mjs";
import { phaseKey, currentRecoil } from "../engagement.mjs";
import { moneyQueue, created as createdDocs, deleted as deletedDocs, updated, adjustNuyen, hasRefundableStock, queuedQuantityEdit } from "../money.mjs";
import { isVR2 } from "../vr2-mode.mjs";
import { liveSession } from "../vr2.mjs";
import { deckerContext, hostShutdown } from "../vr2ic.mjs";
import { elementalHolderOf, spellBlockedByElemental, boundElementals, aidReservation, liveBoundSpirits } from "../elementals.mjs";
import { statusOf, presentDays, spendService, startFight, standDown, callElemental, sendAway, chargeDays } from "../spirit-services.mjs";
import { limbModel, limbIdentity, limbLabel, SIDED } from "../rules/limb-rules.mjs";
import { activeDrugs, drugOf, substanceRows, unfinishedDoses, commitDamage } from "../drugs.mjs";
import { calendarDate } from "../calendaria.mjs";

/** The sheet's substance rows, with calendar dates when Calendaria is active. */
function substanceContext(actor) {
  const s = substanceRows(actor);
  for (const r of s.rows) r.nextDate = calendarDate(r.nextT);
  return s;
}
import { elementalAidsCategory, spiritAttackSummary } from "../rules/sr2e-rules.mjs";
import { headerBanter } from "../banter.mjs";
import { clockView } from "../healing-clock.mjs";
import { permView } from "../permanent-damage.mjs";
import { bioView } from "../bioware-damage.mjs";
import { attributeBreakdown } from "../util/attribute-breakdown.mjs";
import {
  SHARED_ACTIONS, detectAttackTarget, promptWeaponAttackOptions,
  onAddItem, onDeleteItem, onEditItem,
  onRollAttribute, onRollSkill, onRollInitiative, onRollWeapon,
  onMatrixAttack, onMatrixPerception, onResetHostTally, onVR2Maneuver, onVR2Redetect, onHostSheafAdd, onHostSheafRemove, onVr2Ic
} from "./sheet-actions.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;


// =========================================================================
// BASE ACTOR SHEET
// =========================================================================

/**
 * Read a drop's JSON. Malformed JSON warns (it used to vanish); a drop with no
 * text payload (a file, a foreign drag) is ignored quietly.
 * @returns {object|null}
 */
function readDrop(event) {
  const raw = event?.dataTransfer?.getData("text/plain") ?? "";
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (e) {
    console.warn(`SR2E | unreadable drop payload (${raw.length} chars)`);
    ui.notifications.warn("That drop couldn't be read — drag an item or actor from a sheet, the sidebar or a compendium.");
    return null;
  }
}

/**
 * Shared base class for all SR2E actor sheets.
 *
 * Centralizes the V13 ApplicationV2 boilerplate — part context, drag-drop,
 * prose-mirror auto-save and per-field saves — so every sheet
 * (not just the character sheet) gets the same data-loss protections.
 */
/**
 * A dropped cyberlimb option always arrives unattached: its link points into the actor
 * it came from, and a clone with the same limb id must not silently adopt it. Whole-
 * actor copies, imports and tokens don't drop, so they keep their links
 * (docs/PLAN-cybertechnology-phase2.md).
 */
function unattachDroppedOption(itemData) {
  // Its recorded placement facts belong to the old placement too (Phase 3 §4).
  if (itemData?.type === "cyberware" && itemData.system?.limbOption) {
    itemData.system = { ...itemData.system, linkedLimbId: "", limbSurcharge: false, limbAdjacent: false };
  }
}

/**
 * The cyberlimb section shared by the character and NPC sheets: rows for EVERY limb and
 * option item (installed or not), the model's reasons, and attach choices limited to
 * installed limbs (docs/PLAN-cybertechnology-phase2.md §4).
 */
export function cyberlimbContext(actor) {
  const plain = actor.items.filter(i => i.type === "cyberware").map(i => ({
    id: i.id, name: i.name, installed: !!i.system.installed, system: i.system, flags: i.flags,
    source: i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null }));
  const model = limbModel(plain);
  const limbInfo = new Map(model.limbs.map(l => [l.id, l]));
  const orphanInfo = new Map(model.orphans.map(o => [o.id, o]));
  const parents = model.limbs.map(l => ({ id: l.id, label: limbLabel(l) }));
  const rejected = new Map((actor.system.limbs?.rejected ?? []).map(r => [r.id, r.reason]));
  const limbs = [], options = [];
  for (const p of plain) {
    const ident = p.system.limbIdentity ?? limbIdentity(p.system, p.flags, p.source);
    if (ident?.role === "limb") {
      const m = limbInfo.get(p.id);
      limbs.push({ id: p.id, name: p.name, installed: p.installed, type: ident.type, via: ident.via,
        limbType: p.system.limbType, side: p.system.side, sided: !ident.type || SIDED.has(ident.type),
        coverage: ident.coverage, reasons: m?.reasons ?? (p.installed ? [] : ["not installed: not counted"]),
        overlap: model.unresolvedOverlap.some(u => u.ids.includes(p.id)) });
    } else if (ident?.role === "option") {
      const o = orphanInfo.get(p.id);
      const link = p.system.linkedLimbId ?? "";
      const attached = !!link && parents.some(x => x.id === link);
      options.push({ id: p.id, name: p.name, installed: p.installed, kind: ident.optionKind, limbOptionKind: p.system.limbOptionKind,
        link, attached,
        // A link that isn't a valid choice is shown as a selected placeholder, so the
        // select always tells the truth and picking anything fires a change.
        placeholder: link && !attached ? `⚠ ${actor.items.get(link)?.name ?? "missing limb"} (${o?.reason ?? "not a valid limb"})` : null,
        reason: o?.reason ?? rejected.get(p.id) ?? (!p.installed ? "not installed: not counted" : null),
        essence: p.installed ? actor.items.get(p.id)?.system.actualEssenceCost ?? null : null,
        cost: (actor.items.get(p.id)?.system.cost ?? 0).toLocaleString("en-US"),
        surcharge: !!p.system.limbSurcharge, adjacent: !!p.system.limbAdjacent });
    }
  }
  // The rule numbers (characters only: an NPC's authored stats already include its
  // limbs, so nothing is computed for it; docs/PLAN-cybertechnology-phase3.md §2).
  const L = actor.type === "character" ? actor.system.limbs : null;
  const stats = L && (L.anyCyber || L.pairBody || L.handPower || L.laceReplacements || L.coordinationTN) ? {
    positions: L.anyCyber ? L.positions.map(p => ({ label: `${p.side} ${p.family}`, cyber: p.cyber, strength: p.strength, quickness: p.quickness })) : [],
    avgStrength: L.avgStrength, avgQuickness: L.avgQuickness,
    caps: L.caps.map(c => `${c.attr} average ${c.was} capped at ${c.cap}`),
    pairBody: L.pairBody, handPower: L.handPower, laceReplacements: L.laceReplacements, coordinationTN: L.coordinationTN
  } : null;
  return { limbs, options, parents, stats, any: limbs.length + options.length > 0,
    unresolvedOverlap: model.unresolvedOverlap.length > 0 };
}

/**
 * The cyberware condition block (optional; docs/PLAN-cybertechnology-phase5.md): damaged
 * items, plating/sheathing losses, scars. Shown with the setting on or any state set.
 */
function cyberConditionContext(actor) {
  const ware = actor.items.filter(i => i.type === "cyberware");
  const damaged = ware.filter(i => (i.system.conditions ?? []).length).map(i => ({ id: i.id, name: i.name,
    delta: i.system.grade === "delta", conditions: i.system.conditions }));
  const skins = ware.filter(i => ["dermal-plating", "dermal-sheath"].includes(i.system.wareRule) && (i.system.skinMissed || i.system.skinLoss))
    .map(i => ({ id: i.id, name: i.name, missed: i.system.skinMissed, loss: i.system.skinLoss,
      price: (i.system.wareRule === "dermal-sheath" ? 6500 : 2000 * Math.max(1, i.system.skinLoss)).toLocaleString("en-US") }));
  const scars = (actor.getFlag("sr2e", "scars") ?? []).map(s => {
    const current = s.treatedTo ?? s.severity;
    return { ...s, current, procedures: current === "Terrible" ? [{ to: "Minor", label: "minor invasive → Minor" }]
      : current !== "removed" ? [{ to: "removed", label: "minor cosmetic → removed" }] : [] };
  });
  const on = cyberDamageOn();
  if (!on && !damaged.length && !skins.length && !scars.length) return null;
  return { on, isGM: game.user.isGM, damaged, skins, scars };
}

/**
 * The move-by-wire & reflexes panel (docs/PLAN-cybertechnology-phase4.md): the derived
 * numbers, everything pending, and (GM) the records that can be voided.
 */
function mbwContext(actor) {
  const m = actor.system.mbw;
  if (!m) return null;
  const complications = mbwOn();
  const f = mbwFold(actor);
  const rowLabel = (i) => i.recovery ? (CCSS_ROWS[i.recovery.row]?.label ?? "") : "";
  const label = (e) => ({ test: `Test ${e.manual ? "(stress)" : `#${e.n}`}: ${e.successes} successes`, outcome: `Result: ${e.result}`,
    tleTreatment: `TLE-x treatment (${e.tn}): ${e.success ? "success" : "failure"}`, episode: `Episode ${e.on ? `on (−${e.reactionLoss})` : "off"}`,
    seizureResult: `Seizure: ${e.stun} Stun`, ccssTreatment: `CCSS treatment: ${e.weeks} weeks`, ccssRecovery: `CCSS recovery: row ${e.row}` }[e.type] ?? e.type);
  const show = !!(m.level || m.conflicts.length || m.enhancerExcess || m.reflexDice || f.occurrences.length || f.incidents.length);
  return { ...m, show, complications, isGM: game.user.isGM, treatTN: f.nextTreat ? (f.nextTreat.number === 1 ? 8 : 10) : null,
    canEpisode: f.active || f.chronic,
    incidents: f.incidents.map(i => ({ ...i, rowLabel: rowLabel(i), treatment: i.treatment ? { ...i.treatment, cost: (i.treatment.cost ?? 0).toLocaleString("en-US") } : null })),
    seizures: stuckSeizures(actor), records: f.voidable.map(e => ({ key: e.key, label: label(e) })) };
}

/**
 * The cybermancy panel (docs/PLAN-cybertechnology-phase6.md): the consequences, everything
 * pending (the durable fallback for every notice), and (GM) the records that can be voided.
 */
function cymContext(actor) {
  if (!cymOn()) return null;
  const f = cymFold(actor);
  if (!f.ops.size) return null;
  const c = actor.system.cym ?? {};
  const days = (wt) => wt == null ? "" : `${Math.round((wt - game.time.worldTime) / 86400)} days`;
  const label = (e) => ({ opRoll: `Doctor's test: ${e.successes} successes`, refill: `Refill #${e.n}: ${e.outcome}`, cds: `CDS test #${e.n}: ${e.failed ? "failed" : "passed"}`,
    cdsTreat: `CDS treatment: ${e.outcome}`, overflowOut: `Better Off Dead: ${e.outcome}` }[e.type] ?? e.type);
  const r = actor.flags?.sr2e?.cymReceipts ?? {};
  return { ...c, isGM: game.user.isGM, active: f.active, dead: f.dead, suspended: f.active && (f.suspended || !c.neg),
    signed: actor.system.essence?.signed, manual: (() => { try { return !game.settings.get("sr2e", "autoEssence"); } catch (e) { return false; } })(),
    manualSigned: actor.system.essence?.manualSigned,
    overflowWarn: (actor.system.conditionMonitor?.overflow ?? 0) >= (c.overflowMax ?? Infinity),
    willpowerBefore: f.established?.willpowerBefore, refillDue: f.refillDue, cdsDue: f.cdsDue,
    nextRefill: f.refillDue ? "" : days(f.nextRefill), nextCds: f.cdsDue ? "" : days(f.nextCds),
    cdsDeath: f.cds ? days(f.cds.deathAt) : "", cdsDeathPassed: !!f.cds && f.cds.deathAt <= game.time.worldTime,
    recovery: f.recoveryUntil && f.recoveryUntil > game.time.worldTime ? days(f.recoveryUntil) : "",
    cdsSince: f.cds?.since, cdsTreatTN: f.cds ? 8 - Math.min(6, f.treatments) : null,
    ops: [...f.ops.values()].filter(o => !o.done && !o.cancelled).map(o => ({ opId: o.opId, rolled: !!o.roll, survived: o.roll?.survived,
      charged: !!r[o.opId]?.charged, cancelling: o.cancelIntent, name: o.proposal.snapshot.items[0]?.data?.name ?? "implant", tn: o.proposal.snapshot.tn })),
    cares: f.cares.filter(x => !f.overflowOut(x.receipt)).map(x => ({ receipt: x.receipt, tn: 2 * x.overflowBefore })),
    cancer: f.cancer.length, records: f.voidable.map(e => ({ key: e.key, label: label(e) })) };
}

class SR2EBaseActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor"],
    window: {
      resizable: true
    },
    // Portrait click-to-edit for EVERY actor sheet. AppV2 deep-merges
    // DEFAULT_OPTIONS.actions down the class chain, so putting editImage here
    // gives npc/vehicle/spirit/ic/host their portrait picker without repeating it
    // (previously only the character header wired data-action="editImage").
    actions: {
      editImage: SHARED_ACTIONS.editImage,
      exportJson: SHARED_ACTIONS.exportJson,
      healClock: SHARED_ACTIONS.healClock,
      permDamage: SHARED_ACTIONS.permDamage
    },
    // V13: register DragDrop so _onDragOver/_onDrop/_onDragStart are bound.
    // Without this, dragover never calls preventDefault(), letting the browser's
    // native drop behaviour fire on form <select> elements and corrupt their values.
    dragDrop: [{ dragSelector: "[data-item-id]", dropSelector: null }]
  };

  /**
   * Add "Export to JSON" to the sheet's header menu, for every actor type.
   *
   * APPENDS to whatever the parent offers rather than declaring
   * `window.controls` in DEFAULT_OPTIONS — that key is an ARRAY, and the option
   * merge replaces arrays wholesale, which would silently drop the inherited
   * Configure Sheet / Prototype Token / artwork entries.
   * @override
   */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      icon: "fa-solid fa-file-arrow-down",
      label: "SR2E.Sheet.ExportJson",
      action: "exportJson"
    });
    return controls;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor    = this.document;
    context.system   = this.document.system;
    context.config   = CONFIG.SR2E;
    context.editable = this.isEditable;
    context.isGM     = game.user.isGM;
    context.healClock = clockView(this.document);   // healing on the game clock (Calendaria)
    context.permDmg = permView(this.document);      // permanent damage from Deadly wounds (p.113–114)
    context.shift = shiftView(this.document);        // shapeshifters and forms (Companion pp.36–38)
    context.speciesChoices = SPECIES_CHOICES;
    context.vr2      = isVR2();
    context.attrBreakdown = this._buildAttrBreakdown();
    // Recoil still in force this Combat Phase (keyed; module/engagement.mjs).
    context.recoilInForce = currentRecoil(this.document, phaseKey(this.document));
    return context;
  }

  /**
   * Per-attribute augmentation breakdown for the sheet tooltip: names every
   * cyberware / bioware / adept power / Active Effect moving the attribute,
   * instead of the old generic "cyberware / magic / adept power". Formatted as a
   * multi-line `title` (a summary line, then one line per source) so it reads
   * everywhere without depending on a rich-tooltip renderer.
   * @returns {Record<string,{summary:string, title:string}>}
   * @private
   */
  _buildAttrBreakdown() {
    const sys = this.document.system ?? {};
    const provenance = sys.attributeSources ?? {};
    const esc = foundry.utils.escapeHTML;
    const out = {};
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      const a = sys[attr];
      if (!a) continue;
      const b = attributeBreakdown({ base: a.base ?? 0, value: a.value ?? 0, sources: provenance[attr] ?? [] });
      const label = game.i18n.localize(CONFIG.SR2E.attributes[attr] ?? attr);
      const rows = b.sources.map((s) => {
        const up = s.value > 0;
        return `<li><span class="bd-delta ${up ? "up" : "down"}">${up ? "+" : "−"}${Math.abs(s.value)}</span>` +
               `<span class="bd-nm">${esc(s.name)}</span></li>`;
      }).join("");
      const total = b.count
        ? `<div class="bd-total ${b.up ? "up" : "down"}">${b.up ? "+" : "−"}${Math.abs(b.modTotal)} net</div>`
        : "";
      out[attr] = {
        summary: b.summary,
        // Rich HTML for Foundry's themed tooltip (styled via .sr2e-attr-bd).
        tt: `<div class="sr2e-attr-bd"><div class="bd-head"><span class="bd-name">${esc(label)}</span>` +
            `<span class="bd-val">${b.value}</span></div><div class="bd-base">base ${b.base}</div>` +
            `<ul class="bd-src">${rows}</ul>${total}</div>`
      };
    }
    // Reaction gets the same chrome, minus the itemised sources (not tracked yet).
    const r = sys.reaction;
    if (r) {
      const rl = game.i18n.localize("SR2E.Attributes.Reaction");
      const mod = r.mod ?? 0;
      const modLine = mod
        ? `<div class="bd-total ${mod > 0 ? "up" : "down"}">${mod > 0 ? "+" : "−"}${Math.abs(mod)} modifier</div>`
        : "";
      out.reaction = {
        tt: `<div class="sr2e-attr-bd"><div class="bd-head"><span class="bd-name">${esc(rl)}</span>` +
            `<span class="bd-val">${r.value ?? 0}</span></div><div class="bd-base">base ${r.base ?? 0}</div>${modLine}</div>`
      };
    }
    return out;
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
    const data = readDrop(event);
    if (data?.type === "Item") return this._onDropItem(event, data);
  }

  /**
   * Handle dropping an Item onto the actor sheet.
   * Supports compendium browser, world sidebar, and inter-actor drops.
   */
  async _onDropItem(event, data) {
    if (!this.document.isOwner) return false;
    let itemData;
    const eyeHost = eyeHostAt(this.document, event);   // an eye accessory onto a cybereye row
    if (data.uuid) {
      const item = await fromUuid(data.uuid);
      if (!item) return false;
      if (item.parent?.uuid === this.document.uuid) {
        if (eyeHost && eyeHost.id !== item.id && accessoryKindOf(item.toObject())) return fitEyeAccessory(this.document, eyeHost, item.toObject(), { source: item });
        return false;
      }
      itemData = withSource(item);
    } else if (data.data) {
      itemData = data.data;
    } else {
      return false;
    }
    if (eyeHost && accessoryKindOf(itemData)) return fitEyeAccessory(this.document, eyeHost, itemData, { free: true });
    unattachDroppedOption(itemData);
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
   * Problem 2: the form never submits as a whole (see _prepareSubmitData), so
   * every named field saves itself. Fix: explicit change listeners.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    // An unfinished dose becomes force-finishable at a set time: re-render then.
    clearTimeout(this._doseTimer);
    const waits = (context.unfinishedDoses ?? []).filter(d => game.user.isGM && !d.overridable).map(d => d.msUntil);
    if (waits.length) this._doseTimer = setTimeout(() => { if (this.rendered) this.render(); }, Math.min(...waits) + 250);
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

    // Every named Actor field saves itself on change — on EVERY sheet. This once
    // covered only .tab-content and .sr2e-sheet-header, which left the NPC and
    // spirit sheets (no tabs, no header class) with nothing that saved: damage
    // typed on an NPC was gone when the sheet reopened. Inputs inside
    // [data-item-id] belong to embedded Items (below); names outside the
    // document (the spirit sheet's `spiritPower` picker) are UI state.
    for (const input of this.element.querySelectorAll("input[name], select[name], textarea[name]")) {
      if (input.closest("[data-item-id]")) continue;
      if (input.name !== "name" && !input.name.startsWith("system.")) continue;
      // Nuyen is edited as a CHANGE against what this field last showed, applied to the
      // live balance in the money queue — so a typed edit can't overwrite a charge that
      // landed meanwhile, and quick successive edits chain (docs/PLAN-money-queue-…, A2).
      if (input.name === "system.nuyen") {
        input.dataset.prev = String(this.document.system.nuyen ?? 0);
        input.addEventListener("change", (event) => {
          event.stopPropagation();
          const typed = Math.round(parseFloat(input.value) || 0);
          const delta = typed - (Number(input.dataset.prev) || 0);
          input.dataset.prev = String(typed);
          if (!delta) return;
          moneyQueue(this.document, () => adjustNuyen(this.document, delta), "nuyen field").then(ok => {
            if (!ok) { ui.notifications.warn("That would take nuyen below 0 — not changed."); this.render(); }
          });
        });
        continue;
      }
      // NPC Essence: a blank or non-numeric entry saves nothing (the generic path would write 0, which
      // the substance rules read as death), and a refused update re-renders (docs/PLAN-npc-essence.md).
      if (input.name === "system.essence.value") {
        input.addEventListener("change", (event) => {
          event.stopPropagation();
          const v = input.value.trim() === "" ? NaN : Number(input.value);
          if (!Number.isFinite(v) || v < 0) {
            if (input.value.trim() !== "") ui.notifications.warn("Essence must be 0 or more — not changed.");
            return this.render();
          }
          this.document.update({ [input.name]: v }).catch(() => { ui.notifications.warn("Essence not changed."); this.render(); });
        });
        continue;
      }
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
    // the Actor, so the actor-field wiring above never touches them.
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
        if (field === "system.quantity" && hasRefundableStock(item)) {
          return queuedQuantityEdit(item, Number(input.defaultValue), value).then(ok => { if (!ok) this.render(); });
        }
        item.update({ [field]: value });
      });
    }

    // Make item rows draggable to the hotbar. V13's ActorSheetV2 binds its own
    // DragDrop to the `.draggable` CLASS (and handles drops onto the whole sheet
    // — that's why dropping items IN works). Our rows are keyed by [data-item-id]
    // and never get that class, and the `dragDrop` DEFAULT_OPTIONS entry is an
    // AppV1-only no-op in V2 — so nothing was draggable OUT. Wire it explicitly:
    // set draggable + fire our _onDragStart (which writes {type:"Item", uuid} for
    // the hotbarDrop hook to turn into an item.roll() macro).
    // Cybereye rows light up while something is dragged over them (eye accessories).
    for (const el of this.element.querySelectorAll("[data-eye-host]")) {
      el.addEventListener("dragenter", () => el.classList.add("eye-drop-target"));
      el.addEventListener("dragleave", (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove("eye-drop-target"); });
      el.addEventListener("drop", () => el.classList.remove("eye-drop-target"));
    }
    for (const el of this.element.querySelectorAll("[data-item-id]")) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", this._onDragStart.bind(this));
    }
  }

  /**
   * @override
   * The actor form never submits as a whole: every field saves itself
   * (_onRender), and a whole-form submit would write DISPLAYED values back to
   * source — an NPC's armor already includes its worn items and an IC's
   * Security Code comes from its host, so the next prepare would add on top.
   *
   * This was an `async _processFormData` override until 0.93.1. Foundry calls
   * that method synchronously, so it received a Promise and every submit sent
   * update({}): submitOnChange never saved anything on any actor sheet, and
   * the per-field wiring above was the only thing that ever did.
   */
  _prepareSubmitData() {
    return {};
  }
}

// =========================================================================
// CHARACTER SHEET
// =========================================================================

/**
 * Character Sheet for Shadowrun 2E player characters.
 * Uses the V13 ApplicationV2 framework with HandlebarsApplicationMixin.
 */
/**
 * Points and nuyen spent in character creation vs the chosen priorities (SR2E p.44–45).
 * Purely informational on the sheet; finishing creation converts what's left of the
 * Resources (p.47).
 */
/** The priority table: the Shapeshifter Character Creation Table for a shapeshifter (Companion p.36). */
export const priorityTableFor = (system) => shapeshifterOf("character", system) ? SHAPESHIFTER_PRIORITIES : CONFIG.SR2E.priorities;

export function chargenBudgetOf(actor) {
  const system = actor.system;
  const prio = priorityTableFor(system);
  const chosen = system.chargen?.priorities ?? {};
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
    // The lifecycle fields and sub-rating NAMES travel too: chargenSpend
    // charges the allocation (SR2E p.70), and for a legacy skill with no
    // `allocated` it has to invert the reduction, which needs the names.
    .map((i) => ({
      category: i.system.category,
      freeLanguage: i.system.freeLanguage,
      rating: i.system.rating,
      allocated: i.system.allocated,
      ratingsFinalized: i.system.ratingsFinalized,
      concentration: { name: i.system.concentration?.name ?? "" },
      specialization: { name: i.system.specialization?.name ?? "" }
    }));
  const itemData = actor.items.map((i) => ({
    type: i.type,
    cost: i.system.cost ?? 0,
    // Rating/grade/ratingStats travel too — chargenSpend prices through
    // itemBaseCost, so rated and alpha/beta/cultured ware count properly.
    rating: i.system.rating ?? 1,
    grade: i.system.grade,
    secondhandDiscount: i.system.secondhandDiscount,   // secondhand bioware's own price (Shadowtech p.12)
    secondhand: i.system.secondhand,   // second-hand cyberware is half price (SSC p.100)
    bodySystem: i.system.bodySystem,   // neural bioware ignores its grade (Shadowtech p.7)
    ratingStats: i.system.ratingStats,
    quantity: i.system.quantity ?? 1,
    // Ammo's recorded bundle value (set at purchase) — chargenItemCost prices
    // ammo by this, not cost × rounds.
    acquiredListValue: i.getFlag("sr2e", "acquiredListValue"),
    drug: !!drugOf(i),
    // Ware context (single eye, muscle discount), priced once in itemBaseCost.
    eyes: i.system.eyes,
    ...(i.type === "cyberware" || i.type === "bioware" ? wareCtx(actor.items, i) : {}),
    force: i.system.force ?? 0,
    bondingCost: i.system.bondingCost ?? 0,
    // Accessories bought into an eye (docs/PLAN-money-queue-and-eye-accessories.md, B5).
    moduleListValue: rowsListValue(i.system.modules ?? [])
  }));
  return chargenSpend({ attributes: attrData, skills: skillData, items: itemData }, allot);
}

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

    const data = readDrop(event);
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
    // map. Create a world copy first, then link that. Creating a world Actor
    // needs permission a player lacks, so route it through the GM-relay (which
    // also grants the dropping player ownership of the vehicle).
    let vehicleUuid = dropped.uuid;
    if (dropped.pack) {
      if (!game.sr2e?.canCreateActor?.()) {
        ui.notifications.warn("Can't add this vehicle: importing it needs the “Create New Actors” permission or a connected GM. Ask your GM.");
        return false;
      }
      try {
        vehicleUuid = await game.sr2e.createActorViaGM(dropped.toObject());
      } catch (err) {
        console.error("SR2E | Could not import vehicle:", err);
        ui.notifications.error("The vehicle could not be added — the GM may have disconnected. See the console.");
        return false;
      }
    }
    const current = this.document.system.linkedVehicles ?? [];
    if (!vehicleUuid || current.includes(vehicleUuid)) return false; // failed or already linked
    return this.document.update({ "system.linkedVehicles": [...current, vehicleUuid] });
  }

  /**
   * Handle dropping an Item onto the actor sheet.
   * Supports compendium browser, world sidebar, and inter-actor drops.
   * Race items are handled specially: they set the actor's race and apply
   * racial stat adjustments rather than being added to the inventory.
   * @override
   */
  async _onDropItem(event, data) {
    // ONE error boundary around the whole drop: a failure anywhere (resolving
    // the item, the Buy dialog, creating, charging) is shown, never swallowed.
    const progress = { created: null };
    try {
      return await this._dropItemWorkflow(event, data, progress);
    } catch (err) {
      console.error("SR2E | item drop failed", err);
      const esc = foundry.utils.escapeHTML;
      const name = progress.created?.name;
      const why = esc(String(err?.message ?? err));
      ui.notifications.error(name
        ? `${esc(name)} was added, but the purchase didn't finish (${why}) — check its price and ${esc(this.document.name)}'s nuyen.`
        : `That item couldn't be added: ${why} — see the console (F12).`);
      return null;
    }
  }

  /** @private The drop, inside _onDropItem's error boundary. */
  async _dropItemWorkflow(event, data, progress) {
    if (!this.document.isOwner) return false;
    let itemData;
    // An eye accessory dropped on a cybereye's row is fitted into that eye
    // (docs/PLAN-money-queue-and-eye-accessories.md, B) — including one already owned.
    const eyeHost = eyeHostAt(this.document, event);
    if (data.uuid) {
      const item = await fromUuid(data.uuid);
      if (!item) return false;
      if (item.parent?.uuid === this.document.uuid) {
        if (eyeHost && eyeHost.id !== item.id && accessoryKindOf(item.toObject())) return fitEyeAccessory(this.document, eyeHost, item.toObject(), { source: item });
        return false;
      }
      itemData = withSource(item);
    } else if (data.data) {
      itemData = data.data;
    } else {
      return false;
    }

    unattachDroppedOption(itemData);

    // --- Race drop handling ---
    if (itemData.type === "race") return this._onDropRace(itemData);

    // --- Tradition drop handling ---
    if (itemData.type === "tradition") return this._onDropTradition(itemData);

    if (eyeHost && accessoryKindOf(itemData)) return fitEyeAccessory(this.document, eyeHost, itemData, { free: !!event?.altKey });
    // A configured eye arrives with ITS rows, which this character didn't buy: nothing in
    // them is refundable or counted in creation. shortcut: the rows come free with a copied
    // eye (the shipped compendium eyes have none since 0.116.2); the GM's call otherwise.
    if (itemData.type === "cyberware" && itemData.system?.modules?.length) {
      itemData.system.modules = itemData.system.modules.map(r => ({ ...r, id: r.id || foundry.utils.randomID(), paid: 0, listValue: 0 }));
    }

    // --- Weapon focus: bond to an existing melee weapon on drop (SR2E p.126),
    // which prices it (Reach + Force) and auto-bonds/activates it. ---
    if (itemData.type === "focus" && itemData.system?.focusType === "weapon") {
      if (!(await this._bondWeaponFocusOnDrop(itemData))) return null;
    }

    // Purchase options: for a chargeable character drop, let the buyer pick the
    // Rating and Grade before it's created/charged (any item with a rating table
    // or quality grades). Alt-drop (free) and the setting-off path skip the prompt.
    const isCharacter = this.document.type === "character";
    let autoCharge = true;
    try { autoCharge = game.settings.get("sr2e", "autoChargePurchases"); } catch (e) { /* default on */ }
    if (isCharacter && autoCharge && !event?.altKey && this.constructor._hasPurchaseOptions(itemData)) {
      const isSoft = itemData.type === "gear" && itemData.system?.category === "skillsoft";
      const srcSkill = String(itemData.system?.grantedSkill ?? "").trim();
      const srcCat = itemData.system?.grantedSkillCategory ?? "active";
      const opts = isSoft ? {
        suggestions: await this.constructor._skillsoftSuggestions(this.document),
        // A configured chip keeps its slot state; a blank one defaults to slotted.
        prefill: { skill: srcSkill, slotted: srcSkill ? !!itemData.system.slotted : true,
                   // A configured chip's slot state is the seller's choice: no auto-default.
                   slotTouched: !!srcSkill }
      } : {};
      // Installing cyberware in play is surgery (Cybertechnology p.53; core p.114):
      // not in character creation (p.59), not on a free drop, not for a spare.
      const inChargen = !!this.document.system.chargen?.inProgress;
      if (itemData.type === "cyberware" && !inChargen && this._candidateItem(itemData).system.installed) {
        opts.surgery = { preview: (pick) => this._surgeryPreview(itemData, pick),
          cym: cymOn() && game.user.isGM ? (pv) => cymSurgery(this.document, pv) : null };
      }
      let chosen = await this.constructor._promptPurchaseOptions(itemData, this.document, opts);
      while (chosen?.retry) {                           // Buy with no skill: ask again, prefilled
        if (chosen.prefill.rating != null) itemData.system.rating = chosen.prefill.rating;
        chosen = await this.constructor._promptPurchaseOptions(itemData, this.document, { ...opts, prefill: chosen.prefill });
      }
      if (chosen === null) return null;                 // cancelled the purchase
      if (isSoft) this._applySkillsoftChoice(itemData, chosen, { srcSkill, srcCat, suggestions: opts.suggestions });
      if (chosen.rating != null) itemData.system.rating = chosen.rating;
      if (chosen.grade != null) itemData.system.grade = chosen.grade;
      if (chosen.grantedSkillCategory != null) itemData.system.grantedSkillCategory = chosen.grantedSkillCategory;
      if (chosen.force != null) itemData.system.force = chosen.force;
      if (chosen.secondhandDiscount != null) itemData.system.secondhandDiscount = chosen.secondhandDiscount;
      if (chosen.secondhand != null) itemData.system.secondhand = chosen.secondhand;
      if (chosen.surgery) return this._surgeryPurchase(itemData, chosen.surgery);
      if (chosen.strengthMinimum != null) {
        itemData.system.strengthMinimum = chosen.strengthMinimum;
        // Bake the Str-Min price and damage into the SOURCE so the authored
        // fields on the sheet match what the bow actually is. prepareDerivedData
        // recomputes the same values, so this stays consistent either way.
        const scaled = strengthMinWeaponStats(itemData.system);
        if (scaled) Object.assign(itemData.system, scaled);
      }
    }

    // Creation through payment is ONE money-queue entry, so a sale, a reprice or another
    // purchase on this client can't land between the item appearing and its charge.
    const actor = this.document;
    const created = await moneyQueue(actor, async () => {
      const [created] = await createdDocs(actor, actor.createEmbeddedDocuments("Item", [itemData]), 1, "item drop") ?? [];
      if (!created) { ui.notifications.warn(`${foundry.utils.escapeHTML(itemData.name)} couldn't be added.`); return null; }
      progress.created = created;

      // Auto-charge purchases: characters pay the street price (base cost × Street
      // Index) for dropped items, where base cost accounts for the chosen Rating AND
      // Grade (SSC p.98 / Shadowtech p.7). The paid amount is remembered on the item
      // so the sell button and the Rating/Grade-change hook can refund/re-price it.
      // Hold ALT while dropping to add it for FREE (no charge, no `paid` flag).
      if (created && isCharacter && autoCharge) {
        // Price with the SAME context the purchase hook uses, or an authored DataSoft
        // is re-derived at the Mp fallback (charged the wrong price) and a bonded
        // weapon focus is priced off costPerForce instead of its weapon's Reach.
        let vr2 = false;
        try { vr2 = game.settings.get("sr2e", "matrixRuleset") === "vr2"; } catch (e) { /* core */ }
        const bondedReach = created.system.bondedWeaponId
          ? (this.document.items.get(created.system.bondedWeaponId)?.system.reach ?? null)
          : null;
        // Ware context (Cybertechnology p.45, p.57): the limbs BEFORE this item counts as one.
        const base = itemBaseCost(
          { type: created.type, ...created.system },
          { authoredCost: created._source.system?.cost ?? 0, vr2, bondedWeaponReach: bondedReach,
            ...wareCtx(this.document.items.filter(i => i.id !== created.id), created) });
        if (event?.altKey) {
          if (base > 0) ui.notifications.info(`${foundry.utils.escapeHTML(created.name)} added to ${foundry.utils.escapeHTML(this.document.name)} for free (Alt-drop — no charge).`);
        } else if (base > 0) {
          // During character creation, gear is bought at LIST price — the
          // Street Index markup only applies to in-play purchases.
          const inChargen = !!this.document.system.chargen?.inProgress;
          const price = Math.round(inChargen ? base : streetPrice(base, created.system.streetIndex));
          const nuyen = this.document.system.nuyen ?? 0;
          if (nuyen >= price) {
            // Write the purchase flags in ONE update so they can't partially land —
            // ammo left with `paid` but no basis would fall back to the old
            // full-refund. Ammo depletes as it's fired, so it also records the
            // acquisition basis: how many rounds and what list value it bought.
            // Sell-back then refunds proportionally to what's left, and chargen
            // counts the bundle value — not `cost × rounds` (see proportionalRefund
            // / chargenItemCost).
            const flags = { paid: price };
            if (created.type === "ammo" || drugOf(created)) {
              flags.acquiredQuantity = created.system.quantity ?? 0;
              flags.acquiredListValue = base;
            }
            // Flags first, then the money: if either write fails (throws, or resolves to
            // nothing) the item goes, so nothing is ever kept unpaid or paid-for-but-unrecorded.
            let failed = !(await updated(created.update({ "flags.sr2e": flags }), "purchase flags"));
            const fresh = this.document.system.nuyen ?? 0;   // re-read: the flag write was a round trip
            if (!failed && fresh < price) {
              if (!(await deletedDocs(actor, created.delete(), [created.id]))) ui.notifications.error(`${foundry.utils.escapeHTML(created.name)} is on ${foundry.utils.escapeHTML(actor.name)} unpaid — remove it or charge ${price}¥ by hand.`, { permanent: true });
              ui.notifications.warn(`${foundry.utils.escapeHTML(this.document.name)} can't afford ${foundry.utils.escapeHTML(created.name)} (${price}¥ > ${fresh}¥) — not added.`);
              return null;
            }
            if (!failed) failed = !(await adjustNuyen(actor, -price));
            if (failed) {
              if (await deletedDocs(actor, created.delete(), [created.id])) {
                ui.notifications.warn(`Couldn't buy ${foundry.utils.escapeHTML(created.name)} — nothing was charged and it wasn't added.`);
              } else {
                ui.notifications.error(`${foundry.utils.escapeHTML(created.name)} was added to ${foundry.utils.escapeHTML(this.document.name)} but not paid for — remove it or charge ${price}¥ by hand.`, { permanent: true });
              }
              return null;
            }
            ui.notifications.info(`${foundry.utils.escapeHTML(this.document.name)} buys ${foundry.utils.escapeHTML(created.name)} for ${price}¥${inChargen ? " (list — character creation)" : (price !== base ? ` (${base}¥ list)` : "")} — ${actor.system.nuyen ?? 0}¥ left.`);
          } else {
            if (!(await deletedDocs(actor, created.delete(), [created.id]))) ui.notifications.error(`${foundry.utils.escapeHTML(created.name)} is on ${foundry.utils.escapeHTML(actor.name)} unpaid — remove it.`, { permanent: true });
            ui.notifications.warn(`${foundry.utils.escapeHTML(this.document.name)} can't afford ${foundry.utils.escapeHTML(created.name)} (${price}¥ > ${nuyen}¥) — not added. Alt-drop to add it for free.`);
            return null;
          }
        }
      }
      return created;
    }, "item drop");
    if (!created) return null;

    // Ammo stacks on drop: fold the new box into a matching pile (same shape and
    // same money provenance) instead of leaving a duplicate line. Reuses the
    // safe, provenance-aware consolidation — an emptied/tracked box and a free
    // one still stay separate. Quiet: the purchase was already announced.
    if (created?.type === "ammo" && created.parent && game.sr2e?.consolidateAmmo) {
      const res = await game.sr2e.consolidateAmmo(this.document, { quiet: true, itemId: created.id });
      // The new box may have merged into another pile and been deleted; hand the
      // caller the surviving pile (consolidateAmmo reports its id) rather than a
      // dead document.
      if (!this.document.items.get(created.id)) {
        return this.document.items.get(res?.groups?.[0]?.survivorId) ?? null;
      }
    }
    return created;
  }

  /** @private An unembedded, prepared copy of dropped item data (its derived Essence, installed state…). */
  _candidateItem(itemData, over = {}) {
    const data = foundry.utils.mergeObject(foundry.utils.deepClone(itemData), over, { inplace: false });
    delete data._id;
    return new Item.implementation(data, { parent: this.document });
  }

  /**
   * @private What a cybersurgery would do (Cybertechnology p.53): the surgeon's TN from
   * the Essence the character ends with BEFORE the surgeon's change (so the test's own
   * result can't move its TN), the Essence after it, and the procedure's category.
   */
  _surgeryPreview(itemData, { rating, grade, successes = 2, others = 0 } = {}) {
    const sys = { ...(rating != null ? { rating } : {}), ...(grade ? { grade } : {}) };
    const pct = surgeryEssencePct(successes);
    const { discount, credit } = this._surgeryWareAdjust(itemData);
    const essenceOf = (p) => {
      const c = this._candidateItem(itemData, { system: { ...sys, surgeryEssencePct: p } });
      if (discount != null) c.system.limbDiscount = discount;   // muscle with cyberlimbs (p.57)
      return c.system.actualEssenceCost;
    };
    const plain = essenceOf(0), cost = essenceOf(pct);
    // A limb going in changes the Essence of muscle already installed (`credit`).
    // Signed Essence (Phase 6): the same as the clamped value for anyone not below 0.
    const ess = this.document.system.essence ?? {};
    const now = (Number(ess.signed ?? ess.value) || 0) + credit;
    return { pct, cost, plain, now, tn: surgeonTN(now - plain), end: now - cost, category: surgeryCategory(cost + (Number(others) || 0)) };
  }

  /**
   * @private Cybertechnology p.57 for a surgery candidate: its own muscle discount from
   * the character's full cyberlimbs, and, when the candidate is itself a limb, the
   * Essence existing installed muscle gives back (or takes) in the HYPOTHETICAL
   * post-installation inventory (an overlapping limb can lower the count).
   */
  _surgeryWareAdjust(itemData) {
    const actor = this.document, items = [...actor.items];
    const cand = { ...itemData, id: "zzcandidate00000", _source: { system: { ...itemData.system, installed: true } } };
    const before = fullCyberlimbs(physicalLimbs(sourcesOf(items)));
    const after = fullCyberlimbs(physicalLimbs(sourcesOf([...items, cand])));
    const discount = MUSCLE.has(wareCtx([], itemData).wareRule) && before > 0 ? muscleFactor(before) : null;
    let credit = 0;
    if (before !== after) {
      const awakened = actor.system.magic?.type && actor.system.magic.type !== "none";
      const at = (v, n) => n > 0 ? ceil2(v * muscleFactor(n)) : v;
      for (const i of items) {
        if (!i.system.installed || !MUSCLE.has(wareCtx([], i).wareRule)) continue;
        if (i.type === "cyberware") {
          const e = (n) => surgicalEssence(gradeEssenceCost(at(i.system.limbEssence ?? i.system.essenceCost, n), i.system.grade), i.system.surgeryEssencePct);
          credit += e(before) - e(after);
        } else if (i.type === "bioware" && awakened) {
          credit += effectiveBodyCost(at(i.system.bodyCost, before), i.system.grade, i.system.bodySystem)
            - effectiveBodyCost(at(i.system.bodyCost, after), i.system.grade, i.system.bodySystem);
        }
      }
    }
    return { discount, credit };
  }

  /**
   * @private Buy and install cyberware with its surgery (docs/PLAN-cybersurgery-grades.md):
   * in a per-actor queue, re-check Essence and nuyen, debit item + fee in ONE update,
   * create the item carrying its `paid` flag (refund if that fails), then the wound
   * and the card.
   */
  _surgeryPurchase(itemData, pick) {
    const actor = this.document, esc = foundry.utils.escapeHTML;
    return moneyQueue(actor, async () => {
      const pv = this._surgeryPreview(itemData, { rating: itemData.system.rating, grade: itemData.system.grade, ...pick });
      const cand = this._candidateItem(itemData, { system: { surgeryEssencePct: pv.pct } });
      const base = itemBaseCost({ type: cand.type, ...cand.system }, { authoredCost: itemData.system?.cost ?? 0,
        ...wareCtx(actor.items, itemData) });
      const price = base > 0 ? Math.round(streetPrice(base, cand.system.streetIndex)) : 0;
      const fee = pick.fee ? pv.category.fee : 0;
      // Cybermancy (Phase 6): a delta clinic the GM authorized proposes the operation instead.
      if (pick.delta && cymOn() && game.user.isGM && cymSurgery(actor, pv).cybermancy) {
        await proposeOperation(actor, { itemData, pv, pick, price, fee });
        return null;
      }
      if (pv.end < 0) {
        ui.notifications.warn(`The surgery would leave ${esc(actor.name)} below 0 Essence: it's aborted (the character survives with Essence 0 — GM; Cybertechnology p.53). Nothing was bought.`);
        return null;
      }
      const nuyen = actor.system.nuyen ?? 0;
      if (nuyen < price + fee) {
        ui.notifications.warn(`${esc(actor.name)} can't afford ${esc(itemData.name)} and its surgery (${price + fee}¥ > ${nuyen}¥) — nothing bought.`);
        return null;
      }
      if (price + fee > 0 && !(await adjustNuyen(actor, -(price + fee)))) {
        ui.notifications.warn(`Couldn't charge ${esc(actor.name)} for ${esc(itemData.name)} — nothing bought.`);
        return null;
      }
      const data = foundry.utils.deepClone(itemData);
      data.system.surgeryEssencePct = pv.pct;
      data.flags = foundry.utils.deepClone(data.flags ?? {});
      data.flags.sr2e = { ...(data.flags.sr2e ?? {}) };
      delete data.flags.sr2e.acquiredQuantity; delete data.flags.sr2e.acquiredListValue;
      if (price > 0) data.flags.sr2e.paid = price; else delete data.flags.sr2e.paid;
      const [created] = await createdDocs(actor, actor.createEmbeddedDocuments("Item", [data]), 1, "cyberware purchase") ?? [];
      if (!created) {
        if (price + fee > 0 && !(await adjustNuyen(actor, price + fee))) {
          ui.notifications.error(`${esc(itemData.name)} couldn't be added and the ${price + fee}¥ couldn't be refunded: add it to ${esc(actor.name)} by hand.`, { permanent: true });
        } else ui.notifications.error(`${esc(itemData.name)} couldn't be added; ${price + fee}¥ was refunded.`);
        return null;
      }
      const notes = [];
      if (pick.wound) {
        try { await commitDamage(actor, "physical", pv.category.boxes); }
        catch (err) { console.error("SR2E | surgery wound", err); notes.push("The surgery wound couldn't be applied: GM, mark it by hand."); }
      }
      const clinic = { alpha: 50, beta: 50, delta: 200 }[data.system.grade];
      if (clinic) notes.push(`At a ${data.system.grade} clinic, doctor's fees and hospitalization while it heals are ×${clinic} (Cybertechnology p.44).`);
      if (pv.category.key === "drastic" && (actor.system.magic?.max ?? 0) > 0) notes.push("A magician checks for Magic loss after healing (p.114).");
      try {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">
          <strong>${esc(actor.name)}: ${esc(created.name)} installed</strong> — ${esc(pv.category.label)} surgery (p.114).
          <br>Essence ${pv.pct ? `${pv.pct > 0 ? "+" : ""}${pv.pct}% → ${pv.cost}` : `${pv.cost}`} (surgeon's ${Number(pick.successes) || 0} success${Number(pick.successes) === 1 ? "" : "es"} vs TN ${pv.tn}, Cybertechnology p.53).
          <br>${price ? `${price}¥ for the implant` : "No charge for the implant"}${fee ? `, ${fee}¥ for the surgery` : ""}; ${pick.wound ? `a ${esc(pv.category.wound)} wound` : "no wound applied"}.
          ${notes.map(n => `<br><em>${esc(n)}</em>`).join("")}</div>` });
      } catch (err) { console.error("SR2E | surgery card", err); }
      return created;
    });
  }

  /**
   * Apply the Buy dialog's skillsoft choice to the item data (p.243): the
   * skill, slot state, linked attribute (an owned skill before the compendium;
   * changed only when the skill or type changed, or the chip was blank) and a
   * generic name made readable ("Firearms ActiveSoft").
   * @private
   */
  _applySkillsoftChoice(itemData, chosen, { srcSkill, srcCat, suggestions }) {
    const sys = itemData.system;
    const cat = chosen.grantedSkillCategory ?? sys.grantedSkillCategory ?? "active";
    const skill = cat === "data" ? "" : String(chosen.grantedSkill ?? "").trim();
    sys.grantedSkill = skill;
    sys.slotted = !!chosen.slotted;
    const changed = !srcSkill || skill.toLowerCase() !== srcSkill.toLowerCase() || cat !== srcCat;
    if (skill && changed) {
      const hit = (suggestions?.[cat] ?? []).find(e => e.name.toLowerCase() === skill.toLowerCase());
      if (hit?.attribute) sys.grantedSkillAttribute = hit.attribute;
    }
    const label = { active: "ActiveSoft", knowledge: "KnowSoft", language: "LinguaSoft", data: "DataSoft" }[cat] ?? "Skillsoft";
    if (/^(New Gear|New Item|ActiveSoft|KnowSoft|LinguaSoft|DataSoft)$/.test((itemData.name ?? "").trim())) {
      itemData.name = skill ? `${skill} ${label}` : label;
    }
  }

  /** True if a dropped item has any cost-driving field worth prompting for. */
  static _hasPurchaseOptions(itemData) {
    return purchasePromptFields({ type: itemData.type, ...itemData.system }).length > 0;
  }

  /**
   * Ask the buyer which Rating and Grade to purchase. Returns `{rating, grade}`
   * (either may be undefined if not applicable) or `null` if cancelled.
   */
  static async _promptPurchaseOptions(itemData, actor, opts = {}) {
    const sys = itemData.system ?? {};
    const fields = purchasePromptFields({ type: itemData.type, ...sys });
    if (!fields.length) return {};
    const soft = fields.includes("grantedSkill");
    const pre = opts.prefill ?? {};
    const rows = [...(sys.ratingStats ?? [])].sort((a, b) => a.rating - b.rating);
    // Built from the shared grade tables rather than restated here — this dialog
    // used to carry its own hand-written copy of the multipliers, which is how it
    // came to advertise a ×2 alphaware price the rules module didn't charge.
    const describeGrade = (key, g, discount = sys.secondhandDiscount) => {
      const label = game.i18n.localize(CONFIG.SR2E.cyberwareGrades[key]?.label
                                    ?? CONFIG.SR2E.biowareGrades[key]?.label ?? key);
      const bits = [];
      if (g.secondhand) bits.push(`−${Math.round((1 - secondhandPriceMultiplier(discount)) * 100)}% ¥, same Body Cost`);
      else if (g.costMultiplier !== 1)  bits.push(`×${g.costMultiplier} ¥`);
      if (g.essenceMultiplier != null && g.essenceMultiplier !== 1)
        bits.push(`×${g.essenceMultiplier} Essence`);
      if (g.bodyCostMultiplier != null && g.bodyCostMultiplier !== 1)
        bits.push(`×${g.bodyCostMultiplier} Body Cost`);
      return bits.length ? `${label} (${bits.join(", ")})` : label;
    };
    const gradeTable = itemData.type === "cyberware" ? CONFIG.SR2E.cyberwareGrades
                     : itemData.type === "bioware"   ? CONFIG.SR2E.biowareGrades
                     : null;
    const gradeChoices = gradeTable
      ? Object.fromEntries(Object.entries(gradeTable).map(([k, g]) => [k, describeGrade(k, g)]))
      : null;
    // Rating: a select when there's a real rating table, else a number input
    // (skillsoft chips 1–10, programs 1+). Only shown when it drives cost.
    let ratingSel = "";
    if (fields.includes("rating")) {
      if (rows.length > 1) {
        ratingSel = `<div class="form-group"><label>Rating:</label>
          <select name="rating" style="flex:1;">${rows.map(r =>
            `<option value="${r.rating}"${r.rating === (sys.rating ?? 1) ? " selected" : ""}>Rating ${r.rating} — ${r.cost}¥ list</option>`).join("")}</select></div>`;
      } else {
        const max = (itemData.type === "gear" && sys.category === "skillsoft") ? 10 : 100;
        ratingSel = `<div class="form-group"><label>Rating:</label>
          <input type="number" name="rating" value="${sys.rating ?? 1}" min="1" max="${max}" style="width:70px;"></div>`;
      }
    }
    const startCat = pre.category ?? sys.grantedSkillCategory ?? "active";
    const catSel = fields.includes("grantedSkillCategory") ? `<div class="form-group"><label>Skill Type:</label>
      <select name="grantedSkillCategory" style="flex:1;">${["active", "knowledge", "language", "data"].map(c =>
        `<option value="${c}"${c === startCat ? " selected" : ""}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join("")}</select></div>` : "";
    // The skill the chip grants (p.243). Names are set through the DOM in the
    // render callback, never interpolated into this HTML.
    const listId = `sr2e-soft-skills-${foundry.utils.randomID()}`;
    const skillSel = soft ? `<div class="form-group sr2e-soft-skill"><label>Skill:</label>
        <input type="text" name="grantedSkill" list="${listId}" style="flex:1;" placeholder="Firearms, English, Corporate Politics…"></div>
      <datalist id="${listId}"></datalist>
      <div class="form-group sr2e-soft-slot"><label><input type="checkbox" name="slotNow"> Slot it now</label>
        <span class="hint sr2e-soft-dupe" style="margin-left:6px;"></span></div>
      ${pre.warning ? `<p class="sr2e-soft-warn" style="color:#c84;margin:4px 0;"></p>` : ""}` : "";
    const forceSel = fields.includes("force") ? `<div class="form-group"><label>Force:</label>
      <input type="number" name="force" value="${sys.force ?? 1}" min="1" max="6" style="width:70px;"></div>` : "";
    // Bows are bought at a chosen Strength Minimum, which sets price AND damage
    // (p.96). Cap at 20: the table's "1+" has no printed ceiling.
    const strMinSel = fields.includes("strengthMinimum") ? `<div class="form-group"><label>Strength Min:</label>
      <input type="number" name="strengthMinimum" value="${sys.strengthMinimum || 1}" min="1" max="20" style="width:70px;">
      <span style="opacity:.7;margin-left:6px;">${sys.costPerStrengthMin}¥ each, damage (Str Min +${sys.strMinDamageBonus ?? 0})</span></div>` : "";
    const gradeSel = fields.includes("grade") && gradeChoices ? `<div class="form-group"><label>Grade:</label>
      <select name="grade" style="flex:1;">${Object.entries(gradeChoices).map(([k, lbl]) =>
        `<option value="${k}"${k === (sys.grade ?? "standard") ? " selected" : ""}>${lbl}</option>`).join("")}</select></div>
      ${itemData.type === "bioware" ? `<div class="form-group sr2e-secondhand"><label>Secondhand discount (%):</label>
        <input type="number" name="secondhandDiscount" value="${sys.secondhandDiscount ?? 50}" min="40" max="60" style="width:70px;">
        <span class="hint" style="margin-left:6px;">40–60% off; +1 on its damage tests (Shadowtech p.12)</span></div>` : ""}
      ${itemData.type === "cyberware" ? `<div class="form-group sr2e-secondhand-cyber"><label title="Comes in standard, alpha and beta grades, never delta (Cybertechnology p.42). Once per adventure the GM may call a 5-die Resistance Test; a failed part must be replaced (SSC p.100).">
        <input type="checkbox" name="secondhand"${sys.secondhand && sys.grade !== "delta" ? " checked" : ""}> Second-hand (−50% ¥, same Essence; SSC p.100)</label></div>` : ""}` : "";
    const surgery = fields.includes("surgery") && opts.surgery;
    const surgerySel = surgery ? `<fieldset class="sr2e-surgery" style="margin-top:6px;"><legend>Cybersurgery (Cybertechnology p.53)</legend>
      <div class="form-group"><label>Surgeon's successes:</label>
        <input type="number" name="surgerySuccesses" value="2" min="0" style="width:60px;">
        <span class="hint sr2e-surgery-tn" style="margin-left:6px;"></span></div>
      <div class="form-group"><label>Other implants, same surgery (Essence):</label>
        <input type="number" name="surgeryOthers" value="0" min="0" step="0.01" style="width:70px;"></div>
      <div class="form-group"><label><input type="checkbox" name="surgeryFee" checked> Charge the surgery fee</label>
        <label style="margin-left:10px;"><input type="checkbox" name="surgeryWound" checked> Apply the surgery wound</label></div>
      ${surgery.cym ? `<div class="form-group"><label title="Below 0 Essence only at a delta clinic, if the GM allows cybermancy at all (Cybertechnology p.79)"><input type="checkbox" name="surgeryDelta"> Delta clinic: cybermancy authorized</label></div>` : ""}
      <p class="hint sr2e-surgery-out" style="margin:2px 0;"></p>
      <p class="hint" style="margin:2px 0;">Several implants in one surgery: buy the earlier ones with the fee and wound unticked, then the last with the others' Essence. Delta grade needs a delta clinic (GM).</p></fieldset>` : "";

    let result = null, failure = null;
    await foundry.applications.api.DialogV2.wait({
      window: { title: `Buy ${itemData.name}` },
      rejectClose: false,
      content: `<div>
        <p style="margin:0 0 8px;">Choose what ${foundry.utils.escapeHTML(actor.name)} is buying. Price is charged on purchase (street price in play, list in character creation). Alt-drop instead to add it for free.</p>
        ${ratingSel}${catSel}${skillSel}${forceSel}${strMinSel}${gradeSel}${surgerySel}
      </div>`,
      render: (event, dialog) => {
        try {
          if (soft) this._wireSkillsoftFields(dialog.element, actor, opts);
          this._wireGradeFields(dialog.element, itemData, surgery ? opts.surgery : null, describeGrade);
        } catch (err) { failure = err; dialog.close(); }
      },
      buttons: [
        { action: "buy", label: "Buy", default: true, callback: (e, b) => {
          // Caught here and rethrown after the dialog closes: an exception in a
          // button callback must never read as Cancel.
          try {
            const f = b.form.elements;
            const intOr = (el, d) => { const n = parseInt(el?.value); return Number.isFinite(n) ? Math.max(1, n) : d; };
            result = {
              rating: f.rating ? intOr(f.rating, sys.rating ?? 1) : undefined,
              grade: f.grade ? f.grade.value : undefined,
              grantedSkillCategory: f.grantedSkillCategory ? f.grantedSkillCategory.value : undefined,
              force: f.force ? intOr(f.force, sys.force ?? 1) : undefined,
              strengthMinimum: f.strengthMinimum ? intOr(f.strengthMinimum, sys.strengthMinimum || 1) : undefined
            };
            // Second-hand cyberware: true OR false travels, so the caller always copies it;
            // never with delta (Cybertechnology p.42).
            if (f.secondhand) result.secondhand = !!f.secondhand.checked && (result.grade ?? sys.grade) !== "delta";
            if (f.secondhandDiscount && result.grade === "secondhand") {
              const d = parseInt(f.secondhandDiscount.value);
              result.secondhandDiscount = Math.min(60, Math.max(40, Number.isFinite(d) ? d : 50));
            }
            if (surgery) {
              // 0 successes is a real result (+15%), so this isn't intOr's clamp to 1.
              const n = Number(f.surgerySuccesses?.value);
              const o = Number(f.surgeryOthers?.value);
              result.surgery = { successes: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2,
                others: Number.isFinite(o) && o > 0 ? o : 0, fee: !!f.surgeryFee?.checked, wound: !!f.surgeryWound?.checked,
                delta: !!f.surgeryDelta?.checked };
            }
            if (soft) {
              const cat = result.grantedSkillCategory ?? startCat;
              const skill = String(f.grantedSkill?.value ?? "").trim();
              result.grantedSkill = cat === "data" ? "" : skill;
              result.slotted = !!f.slotNow?.checked;
              // An empty skill (whitespace counts) re-opens the dialog, prefilled.
              if (cat !== "data" && !skill) {
                result = { retry: true, prefill: { category: cat, skill: "", slotted: result.slotted, rating: result.rating,
                                                    slotTouched: b.form.dataset.slotTouched === "1",
                                                    warning: "Choose the skill this chip grants." } };
              }
            }
          } catch (err) { failure = err; result = null; }
        } },
        { action: "cancel", label: "Cancel" }
      ]
    });
    if (failure) throw failure;
    return result;
  }

  /**
   * Grade fields in the Buy dialog: the secondhand discount shows only for that grade
   * and re-labels it; the cybersurgery preview (TN, resulting Essence, category)
   * follows the rating, grade and successes. Text only, via the DOM.
   * @private
   */
  static _wireGradeFields(root, itemData, surgery, describeGrade) {
    const form = root.querySelector("form") ?? root;
    const grade = form.querySelector('[name="grade"]');
    const disc = form.querySelector('[name="secondhandDiscount"]');
    const discRow = form.querySelector(".sr2e-secondhand");
    const refresh = () => {
      if (discRow) discRow.style.display = grade?.value === "secondhand" ? "" : "none";
      const shRow = form.querySelector(".sr2e-secondhand-cyber");
      if (shRow) {
        shRow.style.display = grade?.value === "delta" ? "none" : "";
        if (grade?.value === "delta") shRow.querySelector("input").checked = false;
      }
      const opt = grade?.querySelector('option[value="secondhand"]');
      if (opt && disc) opt.textContent = describeGrade("secondhand", CONFIG.SR2E.biowareGrades.secondhand, disc.value);
      if (!surgery) return;
      const num = (n, d) => { const v = Number(form.querySelector(`[name="${n}"]`)?.value); return Number.isFinite(v) ? v : d; };
      const pv = surgery.preview({ rating: form.querySelector('[name="rating"]') ? num("rating", undefined) : undefined,
        grade: grade?.value, successes: Math.max(0, Math.floor(num("surgerySuccesses", 2))), others: Math.max(0, num("surgeryOthers", 0)) });
      form.querySelector(".sr2e-surgery-tn").textContent = `The GM rolls the surgeon (Biotech) against TN ${pv.tn}.`;
      form.querySelector(".sr2e-surgery-out").textContent = `${pv.category.label}: a ${pv.category.wound} wound, ${pv.category.fee.toLocaleString()}¥. `
        + `Essence ${pv.pct ? `${pv.pct > 0 ? "+" : ""}${pv.pct}% → ` : ""}${pv.cost}, leaving ${Math.round(pv.end * 100) / 100}${pv.end < 0 ? " — aborted (below 0)" : ""}.`;
      const cs = surgery.cym?.(pv);
      if (cs?.cybermancy && form.querySelector('[name="surgeryDelta"]')?.checked) {
        form.querySelector(".sr2e-surgery-tn").textContent = "Rolled on the proposal card: these successes aren't used.";
        form.querySelector(".sr2e-surgery-out").textContent = `Cybermancy: intended Essence ${cs.intended}${cs.ims ? " (with the IMS)" : ""}; `
          + `the doctor's test vs TN ${cs.tn}, failure is death (p.79–80). The operation is proposed to you, not bought yet.`;
      }
    };
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    refresh();
  }

  /**
   * Skillsoft fields in the Buy dialog: the suggestion list follows the Skill
   * Type (actor-owned skills first, then the skills compendium), a DataSoft
   * hides the skill, and a chip that duplicates a running one defaults to
   * unslotted — unless the buyer already chose. All names go through the DOM.
   * @private
   */
  static _wireSkillsoftFields(root, actor, opts) {
    const pre = opts.prefill ?? {};
    const form = root.querySelector("form") ?? root;
    const cat = form.querySelector('[name="grantedSkillCategory"]');
    const skill = form.querySelector('[name="grantedSkill"]');
    const slot = form.querySelector('[name="slotNow"]');
    const note = form.querySelector(".sr2e-soft-dupe");
    const list = form.querySelector("datalist");
    const box = form.querySelector(".sr2e-soft-skill");
    const warn = form.querySelector(".sr2e-soft-warn");
    if (!skill || !slot || !list) return;
    skill.value = pre.skill ?? "";
    slot.checked = pre.slotted ?? true;
    if (pre.slotTouched) form.dataset.slotTouched = "1";
    if (warn) warn.textContent = pre.warning ?? "";
    slot.addEventListener("change", () => { form.dataset.slotTouched = "1"; });
    const running = (c, name) => actor.items.some(i => i.type === "gear" && i.system.category === "skillsoft"
      && i.system.slotted && (i.system.grantedSkillCategory || "active") === c
      && (i.system.grantedSkill ?? "").trim().toLowerCase() === name.toLowerCase());
    const refresh = () => {
      const c = cat?.value ?? "active";
      const data = c === "data";
      if (box) box.style.display = data ? "none" : "";
      list.replaceChildren(...(opts.suggestions?.[c] ?? []).map(s => {
        const o = document.createElement("option"); o.value = s.name; return o;
      }));
      const name = skill.value.trim();
      const dupe = !data && name && running(c, name);
      note.textContent = dupe ? `${actor.name} already runs a ${name} chip.` : "";
      if (form.dataset.slotTouched !== "1") slot.checked = dupe ? false : (pre.slotted ?? true);
    };
    cat?.addEventListener("change", refresh);
    skill.addEventListener("input", refresh);
    refresh();
  }

  /**
   * Suggestions for a skillsoft's skill, per chip category: the actor's own
   * skills first (they also supply the linked attribute), then the skills
   * compendium. ActiveSofts list active skills only — the chip's category has
   * no build_repair, and matching is exact.
   * @private
   */
  static async _skillsoftSuggestions(actor) {
    const { SR2EItemSheet } = await import("./item-sheet.mjs");
    const out = {};
    for (const c of ["active", "knowledge", "language"]) {
      const seen = new Set();
      const add = (name, attribute) => {
        const key = String(name ?? "").trim().toLowerCase();
        if (!key || seen.has(key)) return null;
        seen.add(key);
        return { name: String(name).trim(), attribute };
      };
      const own = actor.items.filter(i => i.type === "skill" && i.system.category === c)
        .map(i => add(i.name, i.system.linkedAttribute)).filter(Boolean);
      const cat = (await SR2EItemSheet._skillCatalog([c])).map(e => add(e.name, e.attribute)).filter(Boolean);
      out[c] = [...own, ...cat];
    }
    return out;
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
    const weapons = actor.items.filter(i => i.isWeaponLike && i.system.weaponType === "melee");
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
      content: `<div>
        <p style="margin:0 0 8px;">A weapon focus bonds to one melee weapon and adds its Force in dice to that weapon's attacks — on the physical and astral planes. Price = <strong>(Reach + 1) × 100,000¥ + Force × 90,000¥</strong>.</p>
        <div class="form-group"><label>Force:</label>
          <input type="number" name="force" value="${force}" min="1" max="6" style="width:60px;"></div>
        <div class="form-group"><label>Bond to:</label>
          <select name="weapon" autofocus style="flex:1;">${opts}</select></div>
      </div>`,
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
    // Shared derivation (site 5 of 5) — the same helper the prepare pass and the
    // purchase hook use, so a bonded focus prices identically wherever it's read.
    itemData.system.cost = derivedItemCost(
      { type: "focus", focusType: "weapon", force: chosenForce,
        costPerForce: itemData.system.costPerForce ?? 0 },
      { bondedWeaponReach: weapon?.system.reach ?? 0 }) ?? itemData.system.cost;
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
      "system.race": raceKey,
      // A shapeshifter race item names its species (Companion p.36); any other race clears it.
      "system.shapeshifter.species": raceKey === "shapeshifter" ? (itemData.system?.species ?? "") : ""
    };
    if (actor.system.shapeshifter?.form !== "human") updateData["system.shapeshifter.form"] = "human";

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
    context.weapons = actor.items.filter(i => i.isWeaponLike);
    context.armors = actor.items.filter(i => i.type === "armor");
    context.spells = actor.items.filter(i => i.type === "spell");
    // Elemental Spell Defense reservation (SR2E p.141), shown with the pool.
    const res = aidReservation(actor);
    context.defenseAid = res ? { name: res.spirit?.name ?? "elemental", dice: res.dice, valid: res.valid } : null;
    // Elemental Spell Sustaining (SR2E p.142): who holds each spell, and for
    // how many more Combat Turns; or why it is blocked from being recast.
    context.spellElementals = Object.fromEntries(context.spells.map(sp => {
      const holder = elementalHolderOf(sp);
      const blocked = spellBlockedByElemental(sp);
      return [sp.id, {
        holderName: holder?.name ?? "", turnsLeft: holder?.system.effectiveForce ?? 0,
        blocked: blocked ?? "",
        canHandOff: sp.system.sustaining && !holder && !blocked && !sp.system.spellLocked
          && !sp.system.quickened && boundElementals(actor).some(e =>
            elementalAidsCategory(e.system.domain, sp.system.category))
      }];
    }));
    context.cyberware = actor.items.filter(i => i.type === "cyberware");
    context.cyberlimb = cyberlimbContext(actor);
    // Cybertechnology's optional social penalties (p.58): shown only when the world rule is on.
    let cyberSocial = false;
    try { cyberSocial = game.settings.get("sr2e", "cyberSocial"); } catch (e) { /* off */ }
    context.cyberSocial = cyberSocial ? actor.system.social : null;
    context.mbw = mbwContext(actor);
    context.cym = cymContext(actor);
    context.essenceShown = actor.system.cym ? (actor.system.essence.signed ?? actor.system.essence.value) : actor.system.essence.value;
    context.cyberCondition = cyberConditionContext(actor);
    // Bioware, sorted by body system so same-system implants group together
    // (Shadowtech). config.bodySystems gives the template localized labels.
    context.bioware = actor.items.filter(i => i.type === "bioware")
      .sort((a, b) => (a.system.bodySystem ?? "").localeCompare(b.system.bodySystem ?? "")
                   || a.name.localeCompare(b.name));
    context.bodySystems = CONFIG.SR2E.bodySystems;
    context.bioViews = Object.fromEntries(context.bioware.map(i => [i.id, bioView(actor, i)]));   // Shadowtech p.6
    context.bodyIndexOver = (actor.system.bodyIndex?.value ?? 0) > (actor.system.bodyIndex?.max ?? 0);
    context.bodyIndexOverstress = overstressPenalty(actor.system.bodyIndex?.value, actor.system.bodyIndex?.max);
    context.gear = actor.items.filter(i => i.type === "gear" && i.system.category !== "skillsoft");
    context.activeDrugs = activeDrugs(actor);
    context.unfinishedDoses = unfinishedDoses(actor);
    context.substances = substanceContext(actor);
    context.isGM = game.user.isGM;
    context.skillsofts = actor.items.filter(i => i.type === "gear" && i.system.category === "skillsoft");
    context.skillsoftCapacity = actor.system.skillsoft ?? { skillwiresRating: 0, activeUsed: 0, accessPorts: 0, knowAccess: false, memCapacity: 0, memUsed: 0 };
    context.programs = actor.items.filter(i => i.type === "program")
      .map(i => ({ id: i.id, name: i.name, img: i.img, system: i.system, isMedic: /^medic/i.test(i.name) }));
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
    for (const sActor of liveBoundSpirits(this.document)) {
      spiritActors.push({ uuid: sActor.uuid, id: sActor.id, name: sActor.name, img: sActor.img, system: sActor.system });
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
    // The deck block and persona are DERIVED in place (active deck, loaded programs, VR2.0
    // icon damage): edit them at their authored values, or submitOnChange re-authors the
    // derived numbers (CLAUDE.md, derived state).
    context.authoredDeck = actor._source.system?.cyberdeck ?? {};
    // Decks owned but none active: the numbers below are the manual ones (GitHub #22).
    const decks = actor.items.filter(i => (i.type === "gear" && i.system.category === "cyberdeck") || (i.type === "cyberware" && i.system.cranialDeck));
    context.deckInactiveHint = decks.length > 0 && !decks.some(i => i.system.deck?.active);
    context.authoredPersona = actor._source.system?.matrixPersona ?? {};
    if (context.vr2 && system.isDecker) {
      // VR2.0: the security tally of the live session, and the persona budget (p.84).
      context.vr2Session = liveSession(actor);
      context.vr2LastSession = actor.flags?.sr2e?.lastSession ?? null;
      const p = system.matrixPersona ?? {};
      const bems = (p.bod ?? 0) + (p.evasion ?? 0) + (p.masking ?? 0) + (p.sensor ?? 0);
      const over = personaBudgetOver(bems, system.cyberdeck?.mpcp ?? 0);
      context.personaBudget = over ? { bems, cap: 3 * (system.cyberdeck?.mpcp ?? 0), over } : null;
      context.vr2Suppressed = Object.entries(context.vr2Session?.suppressed ?? {}).map(([key, e]) => ({ key, ...e }));
      context.vr2Improvised = context.vr2Session?.improvised ?? null;
      context.vr2LostSight = Object.keys(actor.flags?.sr2e?.vr2Maneuvers?.lostSight ?? {}).length;
      context.vr2ic = deckerContext(actor);
    }
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
    const prio = priorityTableFor(system);
    const chosen = system.chargen?.priorities ?? {};
    const nuyen = (n) => n == null ? "—" : "" + n.toLocaleString("en-US") + "¥";
    const magicLabels = {
      full_magician: "Full Magician", adept_or_meta_magician: "Aspected / Adept",
      meta_adept: "Adept", adept: "Adept", none: "Mundane"
    };
    const raceLabels = { metahuman: "Any metatype", human: "Human only", shapeshifter: "Shapeshifter" };
    const desc = {
      race:       (g) => raceLabels[prio[g].race] ?? "—",
      magic:      (g) => magicLabels[prio[g].magic] ?? "Mundane",
      attributes: (g) => prio[g].attributes == null ? "—" : `${prio[g].attributes} points`,
      skills:     (g) => prio[g].skills == null ? "—" : `${prio[g].skills} points`,
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
    // (no duplicates). Sum-to-10: the grade point values (A=4…E=0) may "not exceed
    // 10" — duplicates allowed (the book's own example: 3, 3, 3, 1, 0).
    const method = system.chargen?.priorityMethod ?? "standard";
    const GRADE_PTS = { A: 4, B: 3, C: 2, D: 1, E: 0 };
    context.prioritySum = Object.keys(desc).reduce((s, cat) => s + (GRADE_PTS[chosen[cat]] ?? 0), 0);
    context.priorityMethod = method;
    context.priorityValid = method === "sumto10"
      ? context.prioritySum <= 10
      : context.priorityDuplicates.length === 0;
    // Shapeshifter creation (Companion pp.36–38): reported, not enforced, like the rest of this panel.
    context.shapeshifterChargen = shapeshifterOf("character", system) ? [
      chosen.race !== "A" ? "A shapeshifter must put Race at Priority A." : "",
      method === "sumto10" ? "The Shapeshifter Character Creation Table has no Sum-to-10 option — use Standard." : "",
      system.magic?.type === "full_magician" && chosen.magic !== "B" ? "A shapeshifter magician needs Magic at Priority B." : "",
      ["physical_adept", "shamanic_adept", "magical_adept"].includes(system.magic?.type) && chosen.magic !== "C" ? "A shapeshifter adept needs Magic at Priority C." : "",
      system.magic?.type !== "none" && ["D", "E"].includes(chosen.magic) ? "Magic at D or E is mundane for a shapeshifter." : "",
      "No free starting contacts: buy them with Resources (Companion p.38)."
    ].filter(Boolean) : [];

    // Reopening creation is GM-only (it restores list-price buying), so a player
    // looking at a finished character gets the box disabled rather than a click
    // the preUpdateActor veto silently undoes.
    context.chargenReopenLocked = !game.user.isGM && !system.chargen?.inProgress;
    context.chargenBudget = chargenBudgetOf(actor);
    // The Companion's two hard limits on the Attribute Edges (p.24). Reported
    // beside the budget, not enforced — like everything else in this panel.
    context.attributeEdges = attributeEdgeViolations(
      actor.items.filter((i) => i.type === "quality").map((i) => ({
        attribute: i.system.attribute,
        attributeBonus: i.system.attributeBonus,
        maximumBonus: i.system.maximumBonus
      }))
    );
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
          // Sum-to-10 (Companion p.20) allows repeated grades: no swap, the field just saves.
          if ((this.actor.system.chargen?.priorityMethod ?? "standard") === "sumto10") return;
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
      // Awakened NPCs (Craft, Stone and Pride in Queen Euphoria) need to cast and
      // to drop what they sustain. Both come off SHARED_ACTIONS: castSpell is not
      // exported under that name, and toggleSustain is an inline function on the
      // shared map with no standalone binding at all.
      castSpell: SHARED_ACTIONS.castSpell,
      toggleSustain: SHARED_ACTIONS.toggleSustain,
      // Dual-natured critters fight in astral space too (SR2E p.148), and
      // Awakened NPCs perceive and project (p.145–147).
      astralAttack: SHARED_ACTIONS.astralAttack,
      toggleAstral: SHARED_ACTIONS.toggleAstral,
      useDose: SHARED_ACTIONS.useDose,
      endDrug: SHARED_ACTIONS.endDrug,
      forceFinishDose: SHARED_ACTIONS.forceFinishDose,
      repostDrugCard: SHARED_ACTIONS.repostDrugCard,
      extendDose: SHARED_ACTIONS.extendDose,
      beginRecovery: SHARED_ACTIONS.beginRecovery,
      cleanseSubstance: SHARED_ACTIONS.cleanseSubstance,
      editSubstance: SHARED_ACTIONS.editSubstance,
      importSubstance: SHARED_ACTIONS.importSubstance,
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem,
      // Forms and shapeshifting (core p.227–229; docs/PLAN-shapeshifters.md)
      shiftForm: SHARED_ACTIONS.shiftForm,
      regenerate: SHARED_ACTIONS.regenerate,
      deathCheck: SHARED_ACTIONS.deathCheck,
      clearDeath: SHARED_ACTIONS.clearDeath,
      deathMagic: SHARED_ACTIONS.deathMagic,
      addForm: SHARED_ACTIONS.addForm,
      deleteForm: SHARED_ACTIONS.deleteForm
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
    // Weapons this form can't use stay listed (to edit) but marked (Companion p.36, core p.234).
    context.weapons = actor.items.filter(i => i.isWeaponLike)
      .map(w => ({ id: w.id, name: w.name, system: w.system, otherForm: !weaponUsable(actor.type, actor.system, w.system) }));
    context.gear = actor.items.filter(i => i.type === "gear");
    context.drugs = context.gear.filter(i => drugOf(i));
    context.activeDrugs = activeDrugs(actor);
    context.cyberlimb = cyberlimbContext(actor);
    context.unfinishedDoses = unfinishedDoses(actor);
    context.substances = substanceContext(actor);
    context.isGM = game.user.isGM;
    context.showDrugs = context.drugs.length > 0 || context.activeDrugs.length > 0 || context.unfinishedDoses.length > 0 || context.substances.rows.length > 0;
    context.spells = actor.items.filter(i => i.type === "spell");
    context.foci = actor.items.filter(i => i.type === "focus");
    // The armor inputs edit the stat-block base; system.armor is base + worn.
    // An active form sets the base (its inputs are locked), so worn armor compares against the form.
    const form = activeFormOf(actor.system);
    context.armorBase = form ? { ballistic: form.ballistic, impact: form.impact } : actor._source.system.armor;
    context.armorWorn = actor.system.armor.ballistic !== context.armorBase.ballistic
      || actor.system.armor.impact !== context.armorBase.impact;

    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.biography || "", {
      secrets: this.document.isOwner,
      async: true,
      relativeTo: this.document
    });

    return context;
  }

  /** Form rows edit the authored array directly (no named inputs: an ArrayField of objects). */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll("[data-form-field]").forEach(el => el.addEventListener("change", async (ev) => {
      ev.stopPropagation();
      const i = Number(el.dataset.formIndex), f = el.dataset.formField;
      const forms = foundry.utils.deepClone(this.document._source.system.forms ?? []);
      if (!forms[i]) return;
      if (f === "key" && forms[i].key && forms[i].key === this.document.system.activeForm) {
        el.value = forms[i].key;
        return ui.notifications.warn("Shift out of that form before renaming its key.");
      }
      if (f === "key" && (!el.value.trim() || forms.some((x, j) => j !== i && x.key === el.value.trim()))) {
        el.value = forms[i].key;
        return ui.notifications.warn("A form needs its own key — blank and duplicate keys are refused.");
      }
      forms[i][f] = el.type === "number" ? (parseInt(el.value) || 0) : el.value.trim();
      await this.document.update({ "system.forms": forms });
    }));
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
    context.weapons = this.document.items.filter(i => i.isWeaponLike);
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
      // Astral combat (SR2E p.147): spirits fight in astral space with their Force.
      astralAttack: SHARED_ACTIONS.astralAttack,
      useSpiritPower: function(event, target) {
        event.preventDefault();
        const key = target.closest("form, section")?.querySelector("[name='spiritPower']")?.value
                 ?? target.dataset.power;
        if (key) return this.document.useSpiritPower(key);
      },
      // Elemental Aid Sorcery / Spell Sustaining transitions (SR2E p.141–142)
      elementalAction: function(event, target) {
        event.preventDefault();
        const kind = target.dataset.kind;
        return this.document.elementalTransition(kind, kind === "sustainTurn" ? { n: 1 } : {});
      },
      adjustServices: function(event, target) {
        event.preventDefault();
        const delta = parseInt(target.dataset.delta) || 0;
        // −1 spends, +1 refunds (a GM ruling) — both through the services queue.
        return spendService(this.document, -delta, { reason: "adjusting by hand" });
      },
      fightForMe: function(event) { event.preventDefault(); return startFight(this.document); },
      standDown: function(event) { event.preventDefault(); return standDown(this.document); },
      callElemental: function(event) { event.preventDefault(); return callElemental(this.document); },
      sendAway: function(event) { event.preventDefault(); return sendAway(this.document); },
      chargeDays: function(event) { event.preventDefault(); return chargeDays(this.document); }
    }
  };

  static PARTS = {
    spirit: { template: "systems/sr2e/templates/actor/spirit-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // THIS spirit's powers, not the global catalogue. `system.powers` is an
    // ArrayField(StringField) of power keys, populated at summoning from
    // CONFIG.SR2E.spiritDomainPowers[domain] — so it must be mapped to
    // {key,label} pairs. Iterating the array directly in the template would
    // make the array INDEX the action key, which is why the select previously
    // used the catalogue object instead.
    context.spiritPowers = (this.document.system.powers ?? []).map(key => ({
      key,
      label: game.i18n.localize(CONFIG.SR2E.spiritPowers[key] ?? key)
    }));
    context.spiritDomains = CONFIG.SR2E.spiritDomains;
    context.isElemental = this.document.system.spiritType === "elemental";
    // The Attack button's tooltip from the same summary the roll uses (spiritAttackSummary).
    {
      const a = spiritAttackSummary(this.document.system);
      context.attackTitle = !a ? "No manifest attack: its attacks are its Powers (SR2E p.234)"
        : `Manifest attack: ${a.dice} ${a.diceFrom === "reaction" ? "Reaction" : "Force"} dice, ${a.power}${a.level}${a.stun ? " Stun" : ""}`
          + `${a.powerFrom === "strength" ? " (Power = Strength)" : ""}, ${a.mode === "ranged" ? `ranged ${a.range} m` : `melee${a.reach ? ` +${a.reach} Reach` : ""}`}`;
    }
    // Service status (SR2E p.139–142): see module/spirit-services.mjs.
    {
      const doc = this.document;
      const status = statusOf(doc);
      const since = doc.getFlag("sr2e", "presentSince");
      context.svc = {
        status, fighting: !!doc.getFlag("sr2e", "fighting"),
        controlled: status !== "uncontrolled" && status !== "departed",
        present: Number.isFinite(since), days: presentDays(doc),
        unknownPresence: context.isElemental && status === "engaged" && !Number.isFinite(since),
        label: { departed: "Departed", uncontrolled: "Uncontrolled — answers to no one", engaged: "Performing a service",
                 bondEnded: "Owes no more services — no longer bound; it departs (p.141)", bound: "Bound" }[status]
      };
    }
    if (context.isElemental) {
      const sys = this.document.system;
      const spellName = (u) => { try { return fromUuidSync(u)?.name ?? "a spell that no longer exists"; } catch (e) { return "a spell"; } };
      context.elementalStatus =
          sys.pendingExpireSpellUuid ? `Ending ${spellName(sys.pendingExpireSpellUuid)} — press Finish.`
        : sys.service === "sustain" ? (sys.depleted
            ? `Its Force is spent — ${spellName(sys.sustainingSpellUuid)} ends. Expire it.`
            : `Sustaining ${spellName(sys.sustainingSpellUuid)}: ${sys.effectiveForce} Combat Turn(s) left. Hand it back before it runs out, or the spell ends.`)
        : sys.service === "aid" ? `Aiding sorcery — ${sys.effectiveForce} dice left.`
        : sys.depleted ? "Vanished (Force spent). Re-call it for 1 service."
        : "Idle — can aid or sustain spells of its element (1 service to start).";
    }
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
export class SR2EICSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "ic"],
    position: { width: 400, height: "auto" },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem,
      matrixAttack: onMatrixAttack,
      matrixPerception: onMatrixPerception,
      vr2Maneuver: onVR2Maneuver,
      vr2Redetect: onVR2Redetect,
      vr2ic: onVr2Ic
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
}

/**
 * Sheet for a Matrix host / node (SR2E p.164–168).
 */
export class SR2EHostSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "host"],
    position: { width: 400, height: "auto" },
    actions: {
      resetHostTally: onResetHostTally,
      hostSheafAdd: onHostSheafAdd,
      hostSheafRemove: onHostSheafRemove,
      vr2ic: onVr2Ic
    }
  };

  static PARTS = {
    host: { template: "systems/sr2e/templates/actor/host-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.successesNeeded = this.document.system.successesNeeded;
    if (context.vr2) {
      // Live tallies of deckers whose session names this host (edited on the decker).
      const uuid = this.document.uuid;
      context.subsystems = Object.entries(CONFIG.SR2E.vr2Subsystems).map(([key, label]) =>
        ({ key, label, value: this.document.system.subsystems?.[key] ?? 0 }));
      context.sheaf = (this.document.system.sheaf ?? []).map(r => ({ ...r, label: CONFIG.SR2E.vr2SheafEvents[r.event] || "Other" }));
      context.tallies = game.actors.filter(a => liveSession(a)?.hostUuid === uuid)
        .map(a => ({ name: a.name, tally: liveSession(a).tally ?? 0 }));
      const run = hostShutdown(this.document);
      context.shutdown = run ? { left: run.left, turns: run.turns, warning: run.warning, offline: run.offline, manual: !!run.clock?.manual } : null;
    }
    return context;
  }
}
