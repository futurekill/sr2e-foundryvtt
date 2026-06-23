import { parseDrainCode } from "../data/item-data.mjs";
import { resolveVehicleDesign, aggregateModDesign } from "../rules/sr2e-rules.mjs";

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
 * Attach pool-dice validation to a rendered dialog root element.
 *
 * Looks for all <input data-pool-cap="N" data-pool-key="K"> elements,
 * validates their values on every `input` event, shows an inline error
 * span (`.sr2e-pool-error[data-for="K"]`) when out of range, and
 * disables the dialog's default button (data-action="roll" or the first
 * button) until all values are valid.
 *
 * Call this once from inside a renderDialogV2 hook after you have
 * confirmed the root belongs to your dialog.
 *
 * @param {Element} root - The dialog root HTMLElement.
 */
function attachPoolValidation(root) {
  const inputs = root.querySelectorAll("input[data-pool-cap]");
  if (!inputs.length) return;

  // Try the labelled action button first, fall back to the first button.
  const actionBtn = root.querySelector('[data-action="roll"]')
                 ?? root.querySelector("button");

  function validate() {
    let allValid = true;
    for (const input of inputs) {
      const cap   = parseInt(input.dataset.poolCap) || 0;
      const val   = parseInt(input.value)           || 0;
      const err   = root.querySelector(`.sr2e-pool-error[data-for="${input.dataset.poolKey}"]`);
      const bad   = val < 0 || val > cap;
      input.style.outline = bad ? "2px solid #c44" : "";
      if (err) {
        err.textContent    = bad ? (val < 0 ? "Min: 0" : `Max: ${cap}`) : "";
        err.style.display  = bad ? "block" : "none";
      }
      if (bad) allValid = false;
    }
    if (actionBtn) actionBtn.disabled = !allValid;
  }

  for (const input of inputs) {
    input.addEventListener("input", validate);
  }
  validate(); // set initial state
}

/**
 * Build the "buy additional dice with Karma Pool" input section.
 * SR2E p.190: 1 Karma Pool point per extra die, up to the number of base
 * (skill/attribute/rating) dice in use — pool dice excluded.
 *
 * The input carries data-pool-cap so attachPoolValidation() covers it.
 *
 * @param {Actor|null} actor    - Actor whose Karma Pool is spent.
 * @param {number}     baseDice - Base dice in use for the test (= karma cap).
 * @returns {string} HTML ("" when no karma is available or applicable)
 */
function karmaDiceSection(actor, baseDice) {
  const avail = actor?.system?.karma?.pool ?? 0;
  const cap = Math.min(avail, Math.max(0, baseDice ?? 0));
  if (cap <= 0) return "";
  return `
    <hr style="margin:8px 0 6px;">
    <div class="form-group" style="margin:3px 0;align-items:flex-start;gap:6px;">
      <label style="font-size:12px;flex:1;padding-top:3px;">${game.i18n.localize("SR2E.Dialog.KarmaDice")}
        <span style="color:#aaa1c0;font-size:10px;">${game.i18n.format("SR2E.Dialog.KarmaDiceHint", { cap, avail })}</span>
      </label>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <input type="number" name="karma_dice" value="0" min="0" max="${cap}"
               data-pool-key="karma" data-pool-cap="${cap}"
               style="width:52px;text-align:center;">
        <span class="sr2e-pool-error" data-for="karma"
              style="color:#e44;font-size:9px;display:none;line-height:1.2;text-align:right;"></span>
      </div>
    </div>`;
}

/**
 * Read and clamp the karma-dice input from a dialog form.
 * @param {HTMLFormElement} form
 * @param {Actor|null} actor
 * @param {number} baseDice
 * @returns {number}
 */
function readKarmaDice(form, actor, baseDice) {
  const avail = actor?.system?.karma?.pool ?? 0;
  const cap = Math.min(avail, Math.max(0, baseDice ?? 0));
  const raw = parseInt(form.elements.karma_dice?.value) || 0;
  return Math.max(0, Math.min(raw, cap));
}

/**
 * Prompt for a target number and optional pool / karma dice via DialogV2.
 * Shows only pools that have available dice.
 *
 * Validation rules enforced in the dialog UI:
 *   • Cannot exceed available dice in the pool (pool.value)
 *   • Cannot exceed skillCap (= skill rating, if this is a skill roll)
 * Both constraints are merged into `cap` for each pool.
 * Live feedback: red outline + error label + Roll button disabled while any field is over cap.
 *
 * @param {Actor|null} actor - Actor to read pools and Karma Pool from.
 * @param {object} [opts]
 * @param {number}  [opts.skillCap=Infinity] - Max pool dice per pool (= skill rating).
 * @param {number}  [opts.baseDice=0]        - Base dice in use (cap for karma dice).
 * @param {boolean} [opts.showPools=true]    - Whether dice pools may be used on this test.
 * @returns {Promise<{tn: number, poolDice: object, karmaDice: number}|null>}
 */
async function promptRollOptions(actor, { skillCap = Infinity, baseDice = 0, showPools = true } = {}) {
  // Collect pools that have dice available, capping each by both available and skillCap.
  const availablePools = (showPools ? POOL_DEFS : [])
    .map(p => {
      const available = getPoolAvailable(actor, p.key);
      const cap = skillCap === Infinity ? available : Math.min(available, skillCap);
      return { ...p, available, cap };
    })
    .filter(p => p.cap > 0);

  const capNote = skillCap !== Infinity
    ? `<p style="margin:0 0 4px;font-size:10px;color:#aaa1c0;">Max pool dice per pool: ${skillCap} (= skill rating)</p>`
    : "";

  // Each pool input carries data-pool-key / data-pool-cap for the validation hook.
  const poolHTML = availablePools.length ? `
    <hr style="margin:8px 0 6px;">
    <p style="margin:0 0 2px;font-size:11px;color:#b3a9cc;">${game.i18n.localize("SR2E.Dialog.PoolDiceHeader")}</p>
    ${capNote}
    ${availablePools.map(p => `
    <div class="form-group" style="margin:3px 0;align-items:flex-start;gap:6px;">
      <label style="font-size:12px;flex:1;padding-top:3px;">${p.label}
        <span style="color:#aaa1c0;font-size:10px;">(${p.available} left${p.cap < p.available ? `, max ${p.cap}` : ""})</span>
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

  const karmaHTML = karmaDiceSection(actor, baseDice);

  // ── Live validation via a one-shot renderDialogV2 hook ─────────────────────
  // Identified by the presence of data-pool-cap inputs (unique to this dialog).
  let validationHookId = null;
  if (availablePools.length > 0 || karmaHTML) {
    validationHookId = Hooks.on("renderDialogV2", (app, html) => {
      const root = (html instanceof Element) ? html : document;
      if (!root.querySelector("input[data-pool-cap]")) return; // not our dialog
      Hooks.off("renderDialogV2", validationHookId);
      attachPoolValidation(root);
    });
  }

  // V13 IMPORTANT: DialogV2.wait() resolves with the ACTION STRING ("roll"/"cancel"),
  // NOT the callback's return value. Capture roll data as a side effect, then check action.
  let rollResult = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("SR2E.Dialog.RollOptions") },
    rejectClose: false,
    content: `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize("SR2E.Dialog.TargetNumber")}:</label>
          <input type="number" name="tn" value="4" min="2" max="30" autofocus>
        </div>
        ${poolHTML}
        ${karmaHTML}
      </form>
    `,
    buttons: [
      {
        action: "roll",
        label: "SR2E.Dialog.Roll",
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
          const karmaDice = readKarmaDice(button.form, actor, baseDice);
          rollResult = { tn: isNaN(tn) ? 4 : tn, poolDice, karmaDice };
        }
      },
      {
        action: "cancel",
        label: "SR2E.Dialog.Cancel"
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
  // Resistance Tests — not for general attribute tests, so pools are hidden.
  // Karma dice (p.190) may still be bought, capped at the attribute rating.
  const baseDice = actor.system[attribute]?.value ?? 0;
  const opts = await promptRollOptions(actor, { showPools: false, baseDice });
  if (!opts) return;
  return actor.rollAttributeTest(attribute, opts.tn, {
    poolDice: opts.poolDice, karmaDice: opts.karmaDice
  });
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
  // and Damage Resistance Tests — pools are hidden for general skill checks.
  // Karma dice (p.190) may still be bought, capped at the dice in use:
  // the skill rating, or the linked attribute when defaulting untrained.
  const skillItem = actor.items.get(skillId);
  let baseDice = skillItem?.system?.rating ?? 0;
  if (baseDice <= 0) {
    const attrKey = skillItem?.system?.linkedAttribute || "quickness";
    baseDice = attrKey === "reaction"
      ? (actor.system.reaction?.value ?? 1)
      : (actor.system[attrKey]?.value ?? 1);
  }
  const opts = await promptRollOptions(actor, { showPools: false, baseDice });
  if (!opts) return;
  return actor.rollSkillTest(skillId, opts.tn, {
    poolDice: opts.poolDice, karmaDice: opts.karmaDice
  });
}

/**
 * Roll initiative.
 * @this {ApplicationV2}
 */
async function onRollInitiative(event, target) {
  event.preventDefault();
  // rollSR2Initiative is the SR2E-specific sheet roll; core Actor#rollInitiative
  // (combatant creation etc.) is intentionally left untouched.
  return this.document.rollSR2Initiative();
}

/** Range TN modifiers over the base Short TN of 4 (SR2E p.102). */
const RANGE_TN_MODS = { short: 0, medium: 2, long: 4, extreme: 6 };
const RANGE_LABELS   = { short: "Short", medium: "Medium", long: "Long", extreme: "Extreme" };

/**
 * Firing mode labels (SR2E p.92–93):
 *   BF: fixed 3-round burst — Power +3, Damage Level +1, +3 recoil.
 *   FA: declared 3–10 round burst — Power +1/round, Level +1 per 3 rounds,
 *       +1 recoil per round.
 */
const FIRING_MODE_DATA = {
  ss: { label: "SS — Single Shot" },
  sa: { label: "SA — Semi-Auto" },
  bf: { label: "BF — Burst Fire (+3 Pwr, +1 Lvl)" },
  fa: { label: "FA — Full Auto (+1 Pwr/round)" }
};

/**
 * Detect the attack target and measured distance from canvas targeting.
 *
 * Uses the user's current target (T key) and the attacker's token (the
 * shooter's own token, or the vehicle's for mounted weapons). Returns
 * presets for the attack dialog — everything remains overridable there.
 *
 * @param {Actor} attacker - Actor whose token is the origin (character or vehicle).
 * @param {Item}  weapon   - The weapon, for its range brackets.
 * @returns {{targetName?: string, distance?: number, range?: string,
 *            outOfRange?: boolean}}
 */
function detectAttackTarget(attacker, weapon) {
  const presets = {};
  const targetToken = game.user?.targets?.first?.();
  if (!targetToken || !canvas?.ready) return presets;

  presets.targetName = targetToken.name;

  const originToken = attacker?.getActiveTokens?.()[0]
                   ?? canvas.tokens?.controlled?.[0];
  if (!originToken || originToken === targetToken) return presets;

  // Measured distance in scene units (the system grid is metres)
  let distance;
  try {
    distance = canvas.grid.measurePath([originToken.center, targetToken.center]).distance;
  } catch (e) { return presets; }
  presets.distance = Math.round(distance);

  // Pick the range bracket from the weapon's range data (0 = undefined)
  const r = weapon?.system?.ranges ?? {};
  if (r.short > 0) {
    if      (distance <= r.short)  presets.range = "short";
    else if (distance <= r.medium) presets.range = "medium";
    else if (distance <= r.long)   presets.range = "long";
    else if (distance <= r.extreme) presets.range = "extreme";
    else { presets.range = "extreme"; presets.outOfRange = true; }
  }
  return presets;
}

/**
 * Prompt for weapon attack options.
 *
 * Situational modifiers (SR2E p.100–110):
 *   Base TN (short range)  = 4
 *   Range                  = +0 / +2 / +4 / +6 (Short/Medium/Long/Extreme)
 *   Cover                  = +0 / +2 / +4 / +6 (None/Partial/Good/Near-Total)
 *   Attacker running       = +2
 *   Target running         = +2
 *   Attacker in melee      = +3
 *   Smartlink              = sum of combatTnMod on installed cyberware (if smartgunCompatible)
 *   Wound penalty          = from actor.system.woundPenalty
 *   Recoil penalty         = max(0, shotsFired − weapon.recoilComp)
 *   Other                  = manual modifier for visibility, called shots, etc.
 *
 * All inputs update the TN breakdown live via a renderDialogV2 hook.
 *
 * @param {Actor}  actor    - The attacking actor.
 * @param {Item}   weapon   - The weapon item being fired.
 * @param {number} skillCap - Max pool dice (= skill rating). Default: Infinity.
 * @param {number} baseDice - Base dice in use (cap for bought karma dice). Default: 0.
 * @param {number} defaultingPenalty - Skill Web TN penalty when untrained. Default: 0.
 * @param {object} [presets] - Auto-detected target data from detectAttackTarget().
 * @returns {Promise<{range:string, firingMode:string, coverMod:number,
 *                    attackerMod:number, targetMod:number, meleeMod:number,
 *                    otherMod:number, poolDice:object, karmaDice:number}|null>}
 */
async function promptWeaponAttackOptions(actor, weapon, skillCap = Infinity, baseDice = 0,
                                         defaultingPenalty = 0, presets = {}) {
  const BASE_TN    = 4;
  const isMelee    = ["melee", "throwing"].includes(weapon.system.weaponType);
  const isRanged   = !isMelee;

  // ── Auto-detected modifiers ───────────────────────────────────────────────

  // Cyberware combat TN mods (smartgun link etc.) — only for compatible weapons
  let cyberwareMod = 0;
  let cywareName = "";
  if (weapon.system.smartgunCompatible) {
    for (const item of actor.items) {
      if (item.type === "cyberware" && item.system.installed && item.system.combatTnMod !== 0) {
        cyberwareMod += item.system.combatTnMod;
        if (cywareName) cywareName += ", ";
        cywareName += item.name;
      }
    }
  }

  const woundPenalty   = actor.system.woundPenalty ?? 0;
  const sustainPenalty = actor.system.sustainPenalty ?? 0;
  const shotsFired    = actor.system.combatRecoil  ?? 0;
  const recoilComp    = weapon.system.recoilComp   ?? 0;
  const hasRecoil     = ["firearm", "heavy"].includes(weapon.system.weaponType);
  // Initial penalty from rounds already fired; a BF/FA burst's own rounds are
  // added live in the dialog once a firing mode is selected.
  const recoilPenalty = hasRecoil ? Math.max(0, shotsFired - recoilComp) : 0;

  // ── Pool inputs ───────────────────────────────────────────────────────────
  const availablePools = POOL_DEFS
    .map(p => {
      const available = getPoolAvailable(actor, p.key);
      const cap = skillCap === Infinity ? available : Math.min(available, skillCap);
      return { ...p, available, cap };
    })
    .filter(p => p.cap > 0);

  const poolHTML = availablePools.length ? `
    <hr style="margin:8px 0 6px;">
    <p style="margin:0 0 2px;font-size:11px;color:#b3a9cc;">${game.i18n.localize("SR2E.Dialog.PoolDiceHeader")}</p>
    ${availablePools.map(p => `
    <div class="form-group" style="margin:3px 0;align-items:flex-start;gap:6px;">
      <label style="font-size:12px;flex:1;padding-top:3px;">${p.label}
        <span style="color:#aaa1c0;font-size:10px;">(${p.available} left${p.cap < p.available ? `, max ${p.cap}` : ""})</span>
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

  // ── Static breakdown rows (auto-detected, not interactive) ────────────────
  const cywareLabel  = cywareName ? `${cywareName}:` : "Smartlink:";
  const cywareModStr = cyberwareMod > 0 ? `+${cyberwareMod}` : `${cyberwareMod}`;
  const cywareStyle  = cyberwareMod !== 0 ? "" : "display:none;";
  const woundStyle   = woundPenalty  > 0  ? "" : "display:none;";
  const recoilLabel  = `Recoil (${shotsFired} fired, RC ${recoilComp}):`;
  const recoilStyle  = recoilPenalty > 0  ? "" : "display:none;";

  // Initial TN with all situational mods at zero
  const initFinalTN = Math.max(2, BASE_TN + cyberwareMod + woundPenalty + sustainPenalty
                                          + recoilPenalty + defaultingPenalty);

  // Helper: format a modifier number for display (always show sign)
  const fmt = n => n === 0 ? "+0" : (n > 0 ? `+${n}` : `${n}`);

  // ── Live TN update via renderDialogV2 hook ────────────────────────────────
  // Identifies our dialog by #sr2e-attacker which is present in both ranged and melee.
  let hookId = null;
  hookId = Hooks.on("renderDialogV2", (app, html) => {
    const root = (html instanceof Element) ? html : document;
    if (!root.querySelector("#sr2e-other-mod")) return;   // not our dialog
    Hooks.off("renderDialogV2", hookId);
    const attackerSelect = root.querySelector("#sr2e-attacker");

    // Ranged-only inputs
    const rangeSelect  = root.querySelector("#sr2e-attack-range");
    const coverSelect  = root.querySelector("#sr2e-cover");
    const meleeCheck   = root.querySelector("#sr2e-in-melee");
    const modeSelect   = root.querySelector("#sr2e-firing-mode");
    const roundsInput  = root.querySelector("#sr2e-fa-rounds");
    const roundsRow    = root.querySelector("#sr2e-fa-rounds-row");
    // Melee-only inputs (opposed test modifiers, SR2E p.101)
    const reachInput   = root.querySelector("#sr2e-reach-mod");
    const alliesInput  = root.querySelector("#sr2e-allies");
    const foesInput    = root.querySelector("#sr2e-foes");
    const supPosCheck  = root.querySelector("#sr2e-sup-pos");
    const proneCheck   = root.querySelector("#sr2e-prone");
    const multiInput   = root.querySelector("#sr2e-multi");
    // Common inputs
    const targetSelect = root.querySelector("#sr2e-target");
    const otherInput   = root.querySelector("#sr2e-other-mod");

    // Breakdown display spans
    const rangeLabel    = root.querySelector("#sr2e-range-label");
    const rangeModSpan  = root.querySelector("#sr2e-range-mod");
    const coverModSpan  = root.querySelector("#sr2e-cover-mod");
    const attackModSpan = root.querySelector("#sr2e-attacker-mod");
    const targetModSpan = root.querySelector("#sr2e-target-mod");
    const meleeModSpan  = root.querySelector("#sr2e-melee-mod");
    const otherModSpan  = root.querySelector("#sr2e-other-mod-val");
    const reachModSpan    = root.querySelector("#sr2e-reach-mod-val");
    const friendsModSpan  = root.querySelector("#sr2e-friends-mod-val");
    const positionModSpan = root.querySelector("#sr2e-position-mod-val");
    const multiModSpan    = root.querySelector("#sr2e-multi-mod-val");
    // Row elements (show/hide)
    const coverRow    = root.querySelector("#sr2e-cover-row");
    const attackRow   = root.querySelector("#sr2e-attacker-row");
    const targetRow   = root.querySelector("#sr2e-target-row");
    const meleeRow    = root.querySelector("#sr2e-melee-row");
    const otherRow    = root.querySelector("#sr2e-other-row");
    const reachRow    = root.querySelector("#sr2e-reach-row");
    const friendsRow  = root.querySelector("#sr2e-friends-row");
    const positionRow = root.querySelector("#sr2e-position-row");
    const multiRow    = root.querySelector("#sr2e-multi-row");
    const finalTnSpan = root.querySelector("#sr2e-final-tn");

    // Live recoil state — rounds already fired this phase (zeroed by the
    // in-dialog Reset button). The selected firing mode's own burst rounds
    // are added on top (SR2E p.93: a burst's rounds count toward its recoil).
    let liveShotsFired = shotsFired;
    const recoilRow = root.querySelector("#sr2e-recoil-row");
    const recoilVal = root.querySelector("#sr2e-recoil-val");

    function currentRecoil() {
      if (!isRanged || !hasRecoil) return 0;
      const mode  = modeSelect?.value ?? "sa";
      const burst = mode === "bf" ? 3
                  : mode === "fa" ? Math.min(10, Math.max(3, parseInt(roundsInput?.value) || 3))
                  : 0;
      return Math.max(0, liveShotsFired + burst - recoilComp);
    }

    function updateTN() {
      const aMod = parseInt(attackerSelect?.value) || 0;
      const tMod = parseInt(targetSelect?.value)   || 0;
      const oMod = parseInt(otherInput?.value)     || 0;

      if (attackModSpan) attackModSpan.textContent = fmt(aMod);
      if (targetModSpan) targetModSpan.textContent = fmt(tMod);
      if (otherModSpan)  otherModSpan.textContent  = fmt(oMod);
      if (attackRow)     attackRow.style.display    = aMod !== 0 ? "" : "none";
      if (targetRow)     targetRow.style.display    = tMod !== 0 ? "" : "none";
      if (otherRow)      otherRow.style.display     = oMod !== 0 ? "" : "none";

      let finalTN;
      if (isRanged) {
        const rng  = rangeSelect?.value ?? "short";
        const rMod = RANGE_TN_MODS[rng] ?? 0;
        const cMod = parseInt(coverSelect?.value) || 0;
        const mMod = meleeCheck?.checked ? 3 : 0;
        const recoil = currentRecoil();
        if (rangeLabel)   rangeLabel.textContent   = `Range (${RANGE_LABELS[rng]}):`;
        if (rangeModSpan) rangeModSpan.textContent = fmt(rMod);
        if (coverModSpan) coverModSpan.textContent = fmt(cMod);
        if (meleeModSpan) meleeModSpan.textContent = fmt(mMod);
        if (coverRow)     coverRow.style.display   = cMod !== 0 ? "" : "none";
        if (meleeRow)     meleeRow.style.display   = mMod !== 0 ? "" : "none";
        if (roundsRow)    roundsRow.style.display  = (modeSelect?.value === "fa") ? "" : "none";
        if (recoilRow)    recoilRow.style.display  = recoil > 0 ? "" : "none";
        if (recoilVal)    recoilVal.textContent    = `+${recoil}`;
        finalTN = Math.max(2, BASE_TN + rMod + cMod + aMod + tMod + mMod + oMod
                                      + cyberwareMod + woundPenalty + sustainPenalty
                                      + recoil + defaultingPenalty);
      } else {
        // Opposed melee (SR2E p.100-101): base TN 4 + Melee Modifiers Table
        const rchMod = parseInt(reachInput?.value) || 0;
        const allies = Math.min(4, Math.max(0, parseInt(alliesInput?.value) || 0));
        const foes   = Math.min(4, Math.max(0, parseInt(foesInput?.value) || 0));
        const frMod  = foes - allies;
        const posMod = (supPosCheck?.checked ? -1 : 0) + (proneCheck?.checked ? -2 : 0);
        const muMod  = 2 * Math.max(0, parseInt(multiInput?.value) || 0);
        if (reachModSpan)    reachModSpan.textContent    = fmt(rchMod);
        if (friendsModSpan)  friendsModSpan.textContent  = fmt(frMod);
        if (positionModSpan) positionModSpan.textContent = fmt(posMod);
        if (multiModSpan)    multiModSpan.textContent    = fmt(muMod);
        if (reachRow)    reachRow.style.display    = rchMod !== 0 ? "" : "none";
        if (friendsRow)  friendsRow.style.display  = frMod  !== 0 ? "" : "none";
        if (positionRow) positionRow.style.display = posMod !== 0 ? "" : "none";
        if (multiRow)    multiRow.style.display    = muMod  !== 0 ? "" : "none";
        finalTN = Math.max(2, BASE_TN + rchMod + frMod + posMod + muMod + oMod
                                      + woundPenalty + sustainPenalty + defaultingPenalty);
      }
      if (finalTnSpan) finalTnSpan.textContent = finalTN;
    }

    // Reset Recoil button — clears rounds already fired and persists to the actor
    const resetRecoilBtn = root.querySelector("#sr2e-reset-recoil-btn");
    if (resetRecoilBtn) {
      resetRecoilBtn.addEventListener("click", async () => {
        liveShotsFired = 0;
        await actor.update({ "system.combatRecoil": 0 });
        updateTN();
      });
    }

    const allInputs = [rangeSelect, coverSelect, meleeCheck, modeSelect, roundsInput,
                       attackerSelect, targetSelect, otherInput, reachInput,
                       alliesInput, foesInput, supPosCheck, proneCheck, multiInput].filter(Boolean);
    for (const el of allInputs) {
      el.addEventListener(el.type === "checkbox" ? "change" : "input", updateTN);
    }
    updateTN(); // set initial state

    // Pool-dice validation (shared helper — same behaviour as other roll dialogs)
    attachPoolValidation(root);
  });

  // ── Build dialog HTML ─────────────────────────────────────────────────────
  // Ranged: range bracket + firing mode + cover + in-melee penalty + recoil info
  // Melee:  target Quickness (= base TN) + reach modifier; no range/firing/cover/recoil
  const topInputsHTML = isRanged ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
      <div class="form-group" style="margin:2px 0;">
        <label>Range:</label>
        <select id="sr2e-attack-range" name="range">
          ${["short", "medium", "long", "extreme"].map(k =>
            `<option value="${k}" ${presets.range === k ? "selected" : ""}>${RANGE_LABELS[k]}</option>`
          ).join("")}
        </select>
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Firing Mode:</label>
        <select id="sr2e-firing-mode" name="firingMode">${
          Object.entries(FIRING_MODE_DATA)
            .filter(([key]) => weapon.system.firingModes?.[key])
            .map(([key, d]) => `<option value="${key}">${d.label}</option>`)
            .join("") || `<option value="sa">${FIRING_MODE_DATA.sa.label}</option>`
        }</select>
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Cover:</label>
        <select id="sr2e-cover" name="cover">
          <option value="0">None</option>
          <option value="2">Partial (+2)</option>
          <option value="4">Good (+4)</option>
          <option value="6">Near-Total (+6)</option>
        </select>
      </div>
      <div class="form-group" id="sr2e-fa-rounds-row" style="margin:2px 0;display:none;">
        <label>FA Rounds (3–10):</label>
        <input type="number" id="sr2e-fa-rounds" name="rounds" value="3" min="3" max="10"
               style="width:52px;text-align:center;"
               title="Rounds in the full-auto burst: +1 Power and +1 recoil per round, +1 Damage Level per 3 rounds (SR2E p.93)">
      </div>
      <div class="form-group" style="margin:2px 0;align-items:center;">
        <label>In Melee (+3):</label>
        <input type="checkbox" id="sr2e-in-melee" name="inMelee" style="width:auto;"
               title="Firing a ranged weapon while engaged in melee adds +3 TN">
      </div>
    </div>` : `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
      <div class="form-group" style="margin:2px 0;">
        <label>Reach Mod:</label>
        <input type="number" id="sr2e-reach-mod" name="reachMod"
               value="0" style="width:52px;text-align:center;"
               title="Your weapon longer: −1 per point of reach advantage. Shorter: +1 per point. (SR2E p.101)">
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Other Mod:</label>
        <input type="number" id="sr2e-other-mod" name="otherMod" value="0"
               style="width:52px;text-align:center;"
               title="Aimed shot −1/Simple Action · called shot +4 (bypass armour / location) · visibility (half value) · environment. Enter the net here.">
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Your allies in melee:</label>
        <input type="number" id="sr2e-allies" name="allies" value="0" min="0" max="4"
               style="width:52px;text-align:center;"
               title="Friends actively in this brawl: −1 TN each (max −4). (SR2E p.101)">
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Foe's allies in melee:</label>
        <input type="number" id="sr2e-foes" name="foes" value="0" min="0" max="4"
               style="width:52px;text-align:center;"
               title="Opponent's friends in the brawl: +1 TN each (max +4). (SR2E p.101)">
      </div>
      <div class="form-group" style="margin:2px 0;align-items:center;">
        <label>Superior position (−1):</label>
        <input type="checkbox" id="sr2e-sup-pos" name="supPos" style="width:auto;"
               title="Higher or steadier ground than your opponent (SR2E p.101)">
      </div>
      <div class="form-group" style="margin:2px 0;align-items:center;">
        <label>Opponent prone (−2):</label>
        <input type="checkbox" id="sr2e-prone" name="prone" style="width:auto;"
               title="Opponent is lying on the ground (SR2E p.101)">
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Additional targets (+2 ea):</label>
        <input type="number" id="sr2e-multi" name="multiTargets" value="0" min="0"
               style="width:52px;text-align:center;"
               title="Attacking multiple targets this action: +2 TN per extra target (SR2E p.101)">
      </div>
    </div>`;

  const commonInputsHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:4px;">
      <div class="form-group" style="margin:2px 0;">
        <label>Attacker:</label>
        <select id="sr2e-attacker" name="attacker">
          <option value="0">Stationary / Walking</option>
          <option value="2">Running (+2)</option>
        </select>
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Target:</label>
        <select id="sr2e-target" name="target">
          <option value="0">Stationary / Walking</option>
          <option value="2">Running (+2)</option>
        </select>
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Other Mod:</label>
        <input type="number" id="sr2e-other-mod" name="otherMod" value="0"
               style="width:52px;text-align:center;"
               title="Aimed shot −1/Simple Action · called shot +4 (bypass armour / location) · visibility · environment. Enter the net here.">
      </div>
    </div>`;

  // TN breakdown rows — differ for ranged vs melee
  const baseTnRow = isRanged
    ? `<tr><td style="color:#aaa1c0;padding:1px 0;">Base TN (Short range):</td><td style="text-align:right;padding:1px 0;">${BASE_TN}</td></tr>`
    : `<tr><td style="color:#aaa1c0;padding:1px 0;">Base TN (opposed melee):</td><td style="text-align:right;padding:1px 0;">${BASE_TN}</td></tr>`;

  const rangedOnlyRows = isRanged ? `
    <tr>
      <td id="sr2e-range-label" style="color:#aaa1c0;padding:1px 0;">Range (Short):</td>
      <td id="sr2e-range-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-cover-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Cover:</td>
      <td id="sr2e-cover-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-melee-row" style="display:none;">
      <td style="color:#c84;padding:1px 0;">Firing in Melee:</td>
      <td id="sr2e-melee-mod" style="text-align:right;padding:1px 0;">+3</td>
    </tr>` : `
    <tr id="sr2e-reach-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Reach:</td>
      <td id="sr2e-reach-mod-val" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-friends-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Friends in melee:</td>
      <td id="sr2e-friends-mod-val" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-position-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Position:</td>
      <td id="sr2e-position-mod-val" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-multi-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Multiple targets:</td>
      <td id="sr2e-multi-mod-val" style="text-align:right;padding:1px 0;">+0</td>
    </tr>`;

  const autoRows = `
    <tr id="sr2e-attacker-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Attacker running:</td>
      <td id="sr2e-attacker-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-target-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Target running:</td>
      <td id="sr2e-target-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-other-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Other:</td>
      <td id="sr2e-other-mod-val" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    ${cywareStyle !== "display:none;" ? `
    <tr style="${cywareStyle}">
      <td style="color:#6c9;padding:1px 0;">${cywareLabel}</td>
      <td style="text-align:right;padding:1px 0;">${cywareModStr}</td>
    </tr>` : ""}
    ${woundStyle !== "display:none;" ? `
    <tr style="${woundStyle}">
      <td style="color:#c84;padding:1px 0;">Wound Penalty:</td>
      <td style="text-align:right;padding:1px 0;">+${woundPenalty}</td>
    </tr>` : ""}
    ${sustainPenalty > 0 ? `
    <tr>
      <td style="color:#c84;padding:1px 0;">Sustaining spells:</td>
      <td style="text-align:right;padding:1px 0;">+${sustainPenalty}</td>
    </tr>` : ""}
    ${defaultingPenalty > 0 ? `
    <tr>
      <td style="color:#c84;padding:1px 0;" title="Untrained — defaulting via the Skill Web (SR2E p.69)">Defaulting (untrained):</td>
      <td style="text-align:right;padding:1px 0;">+${defaultingPenalty}</td>
    </tr>` : ""}
    ${isRanged && hasRecoil ? `
    <tr id="sr2e-recoil-row" style="${recoilStyle}">
      <td style="color:#ca4;padding:1px 0;">
        ${recoilLabel}
        <button type="button" id="sr2e-reset-recoil-btn"
                style="font-size:9px;padding:1px 5px;margin-left:6px;
                       background:rgba(200,160,50,0.15);border:1px solid #ca4;
                       border-radius:3px;cursor:pointer;color:#ca4;line-height:1.4;"
                title="Clear rounds already fired (start of new combat phase)">
          Reset
        </button>
      </td>
      <td id="sr2e-recoil-val" style="text-align:right;padding:1px 0;">+${recoilPenalty}</td>
    </tr>` : ""}`;

  // Auto-detected target banner (from canvas targeting)
  const targetBanner = presets.targetName ? `
    <div style="margin:0 0 6px;padding:4px 8px;background:rgba(80,140,200,0.12);
                border:1px solid rgba(80,140,200,0.4);border-radius:4px;font-size:11px;">
      🎯 Target: <strong>${foundry.utils.escapeHTML(presets.targetName)}</strong>${
        presets.distance != null ? ` — ${presets.distance} m` : ""}${
        presets.outOfRange ? ` <span style="color:#e44;font-weight:bold;">beyond Extreme range!</span>` : ""}
    </div>` : "";

  let rollResult = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("SR2E.Dialog.AttackTitle", { name: weapon.name }) },
    rejectClose: false,
    content: `<form>
      ${targetBanner}
      ${topInputsHTML}
      ${isRanged ? commonInputsHTML : ""}
      <div style="margin:6px 0 4px;background:rgba(0,0,0,0.15);border-radius:4px;padding:6px 8px;font-size:11px;">
        <table style="width:100%;border-collapse:collapse;">
          ${baseTnRow}
          ${rangedOnlyRows}
          ${autoRows}
          <tr style="border-top:1px solid rgba(255,255,255,0.15);">
            <td style="font-weight:bold;padding-top:3px;">Final TN:</td>
            <td id="sr2e-final-tn" style="text-align:right;font-weight:bold;padding-top:3px;">${initFinalTN}</td>
          </tr>
        </table>
      </div>
      ${poolHTML}
      ${karmaDiceSection(actor, baseDice)}
    </form>`,
    buttons: [
      {
        action: "roll",
        label: "SR2E.Dialog.Attack",
        default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          const poolDice = {};
          for (const p of availablePools) {
            const raw = parseInt(f[`pool_${p.key}`]?.value) || 0;
            const clamped = Math.max(0, Math.min(raw, p.cap));
            if (clamped > 0) poolDice[p.key] = clamped;
          }
          rollResult = {
            range:           f.range?.value        ?? "short",
            firingMode:      f.firingMode?.value    ?? "sa",
            rounds:          Math.min(10, Math.max(3, parseInt(f.rounds?.value) || 3)),
            coverMod:        parseInt(f.cover?.value)           || 0,
            attackerMod:     parseInt(f.attacker?.value)        || 0,
            targetMod:       parseInt(f.target?.value)          || 0,
            meleeMod:        f.inMelee?.checked ? 3 : 0,
            otherMod:        parseInt(f.otherMod?.value)        || 0,
            reachMod:        parseInt(f.reachMod?.value)        || 0,
            friendsMod:      Math.min(4, Math.max(0, parseInt(f.foes?.value) || 0))
                           - Math.min(4, Math.max(0, parseInt(f.allies?.value) || 0)),
            positionMod:     (f.supPos?.checked ? -1 : 0) + (f.prone?.checked ? -2 : 0),
            multiMod:        2 * Math.max(0, parseInt(f.multiTargets?.value) || 0),
            poolDice,
            karmaDice:       readKarmaDice(button.form, actor, baseDice)
          };
        }
      },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });

  if (hookId !== null) Hooks.off("renderDialogV2", hookId);
  return (action === "roll" && rollResult) ? rollResult : null;
}

/**
 * Roll a weapon attack.
 * Opens the weapon attack dialog (range selector + TN breakdown + pool dice).
 * @this {ApplicationV2}
 */
async function onRollWeapon(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;

  const actor = this.document;

  // SR2E weapon-type → default skill (mirrors the lookup in _rollWeaponAttack)
  const WEAPON_TYPE_DEFAULT_SKILLS = {
    firearm:    "firearms",
    melee:      "armed_combat",
    throwing:   "throwing_weapons",
    heavy:      "heavy_weapons",
    projectile: "projectile_weapons",
    grenade:    "throwing_weapons"
  };
  const normalize = s =>
    s.toLowerCase()
     .replace(/[\s/()]+/g, "_")
     .replace(/_+/g, "_")
     .replace(/^_|_$/g, "");

  // Build priority list: explicit skill field first, then weapon-type default
  const typeFallback  = WEAPON_TYPE_DEFAULT_SKILLS[item.system?.weaponType] ?? "";
  const skillKeys     = [
    normalize(item.system?.skill ?? ""),
    normalize(typeFallback)
  ].filter(k => k !== "");

  let skillCap = Infinity;
  let baseDice = 1;
  let defaultingPenalty = 0;
  const linkedSkill = actor.items.find(
    i => i.type === "skill" && skillKeys.includes(normalize(i.name))
  );
  const rating = linkedSkill?.system?.rating ?? 0;
  if (rating > 0) {
    skillCap = rating;
    baseDice = rating;
  } else {
    // Untrained: defaulting to the linked Attribute via the Skill Web
    // (mirrors the dice/TN computed in SR2EItem#_rollWeaponAttack)
    const defaultSkillKey = skillKeys.find(k => CONFIG.SR2E.activeSkills[k]) ?? "";
    const attrKey = CONFIG.SR2E.activeSkills[defaultSkillKey]?.attribute ?? "quickness";
    const attrValue = attrKey === "reaction"
      ? (actor.system.reaction?.value ?? 1)
      : (actor.system[attrKey]?.value ?? 1);
    baseDice = Math.max(1, attrValue);
    defaultingPenalty = CONFIG.SR2E.defaultingPenalty;
  }

  // Pre-fill range / target Quickness from canvas targeting (T key)
  const presets = detectAttackTarget(actor, item);

  const opts = await promptWeaponAttackOptions(actor, item, skillCap, baseDice,
                                               defaultingPenalty, presets);
  if (!opts) return;
  return item.roll({
    range:           opts.range,
    firingMode:      opts.firingMode,
    rounds:          opts.rounds,
    coverMod:        opts.coverMod,
    attackerMod:     opts.attackerMod,
    targetMod:       opts.targetMod,
    meleeMod:        opts.meleeMod,
    otherMod:        opts.otherMod,
    reachMod:        opts.reachMod,
    friendsMod:      opts.friendsMod,
    positionMod:     opts.positionMod,
    multiMod:        opts.multiMod,
    poolDice:        opts.poolDice,
    karmaDice:       opts.karmaDice
  });
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
    <p style="margin:0 0 2px;font-size:11px;color:#b3a9cc;">
      Magic Pool: ${available} available
    </p>
    ${totemNote}
    <div class="form-group" style="margin:4px 0;">
      <label style="font-size:12px;flex:1;">
        Spell test
        <span style="color:#aaa1c0;font-size:10px;">(max ${spellCap})</span>
      </label>
      <input type="number" name="spell_pool" value="0" min="0" max="${spellCap}"
             style="width:52px;text-align:center;">
    </div>
    <div class="form-group" style="margin:4px 0;">
      <label style="font-size:12px;flex:1;">
        Drain resist
        <span style="color:#aaa1c0;font-size:10px;">(no limit)</span>
      </label>
      <input type="number" name="drain_pool" value="0" min="0" max="${drainCap}"
             style="width:52px;text-align:center;">
    </div>
    <p style="margin:2px 0;font-size:10px;color:#aaa1c0;">
      Total allocated cannot exceed ${available} available dice.
    </p>
  ` : totemNote;

  // Wire up live drain TN update via a render hook (avoids CSP issues with
  // inline event handlers in Foundry's ApplicationV2 rendering pipeline).
  Hooks.once("renderDialogV2", (_app, html) => {
    // In some V13 builds the hook passes the ApplicationV2 instance or a
    // non-Element object as `html`. Fall back to document so querySelector
    // always has a valid receiver.
    const root = (html instanceof Element) ? html : document;
    const forceInput = root.querySelector("#sr2e-cast-force");
    if (!forceInput) return;
    const tnSpan   = root.querySelector("#sr2e-cast-drain-tn");
    const typeSpan = root.querySelector("#sr2e-cast-drain-type");
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
    window: { title: game.i18n.format("SR2E.Dialog.CastTitle", { name: spell.name }) },
    rejectClose: false,
    content: `<form>
      <div class="form-group">
        <label>${game.i18n.localize("SR2E.Dialog.Force")} <span style="color:#aaa1c0;font-size:10px;">(1–${magicAttr})</span>:</label>
        <input type="number" name="force" id="sr2e-cast-force" value="1" min="1" max="${magicAttr}"
               autofocus>
      </div>
      <div style="margin:2px 0 6px;font-size:11px;color:#aaa1c0;padding-left:4px;">
        Drain: TN <span id="sr2e-cast-drain-tn">${initDrainTN}</span>
        · ${drainLevel}
        <span id="sr2e-cast-drain-type" style="color:${initTypeColor};">${initDrainType}</span>
        <span style="color:#958ba8;font-size:10px;">${drainFormula}</span>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("SR2E.Dialog.TargetNumber")}:</label>
        <input type="number" name="tn" value="6" min="2" max="30">
      </div>
      ${poolSection}
      ${karmaDiceSection(actor, magicAttr)}
    </form>`,
    buttons: [
      {
        action: "roll",
        label: "SR2E.Dialog.Cast",
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
            drainPoolDice: drainAlloc > 0 ? { magic: drainAlloc } : {},
            // Cap by the chosen Force here; rollSuccessTest re-clamps against
            // the final spell dice (Force + totem) and the live Karma Pool.
            karmaDice:     readKarmaDice(button.form, actor, force)
          };
        }
      },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
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
  return item.roll({
    force: opts.force, targetNumber: opts.tn,
    poolDice: opts.poolDice, drainPoolDice: opts.drainPoolDice,
    karmaDice: opts.karmaDice
  });
}

/**
 * Prompt for conjuring options (SR2E p.138–140).
 * Shamans summon nature spirits by domain; hermetics summon elementals.
 * The Magic Pool does NOT apply, so no pool inputs are shown — only the
 * Force, spirit type/domain, optional spirit-focus dice, and karma dice.
 *
 * @param {Actor}   actor
 * @param {boolean} elementals - True for hermetic mages (elementals), else nature spirits.
 * @returns {Promise<{force:number, kind:string, domain:string, fociDice:number, karmaDice:number}|null>}
 */
async function promptConjureOptions(actor, elementals) {
  const magic = actor.system.magic?.value ?? 6;
  const charisma = actor.system.charisma?.value ?? 1;
  const kind = elementals ? "elemental" : "nature";

  const domainOptions = elementals
    ? Object.entries(CONFIG.SR2E.elementalTypes).map(([k, d]) =>
        `<option value="${k}">${game.i18n.localize(d.label)} (aids ${d.aids})</option>`).join("")
    : Object.entries(CONFIG.SR2E.spiritDomains).map(([k, label]) =>
        `<option value="${k}">${game.i18n.localize(label)}</option>`).join("");

  // Live drain preview as Force changes (Conjuring Drain Table vs Charisma)
  let hookId = Hooks.on("renderDialogV2", (app, html) => {
    const root = (html instanceof Element) ? html : document;
    const forceInput = root.querySelector("#sr2e-conjure-force");
    if (!forceInput) return;
    Hooks.off("renderDialogV2", hookId);
    const drainSpan = root.querySelector("#sr2e-conjure-drain");
    const update = () => {
      const f = Math.max(1, parseInt(forceInput.value) || 1);
      const d = CONFIG.SR2E.conjuringDrain(f, charisma);
      if (drainSpan) {
        drainSpan.textContent = `${d.level} ${d.type}`;
        drainSpan.style.color = d.type === "physical" ? "#c44" : "#aaa1c0";
      }
    };
    forceInput.addEventListener("input", update);
    update();
  });

  const initDrain = CONFIG.SR2E.conjuringDrain(1, charisma);

  let result = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: elementals ? "Summon Elemental" : "Summon Nature Spirit" },
    rejectClose: false,
    content: `<form>
      <div class="form-group">
        <label>Force <span style="color:#aaa1c0;font-size:10px;">(drain TN = Force)</span>:</label>
        <input type="number" id="sr2e-conjure-force" name="force" value="1" min="1" max="${Math.max(1, magic * 2)}" autofocus>
      </div>
      <div class="form-group">
        <label>${elementals ? "Element" : "Domain"}:</label>
        <select name="domain">${domainOptions}</select>
      </div>
      <div class="form-group">
        <label>Spirit Focus dice:</label>
        <input type="number" name="fociDice" value="0" min="0" style="width:52px;text-align:center;"
               title="Extra dice from a bonded spirit focus (applies to both the Conjuring and Drain tests)">
      </div>
      <div style="margin:2px 0 6px;font-size:11px;color:#aaa1c0;padding-left:4px;">
        Drain: <span id="sr2e-conjure-drain" style="color:${initDrain.type === 'physical' ? '#c44' : '#aaa1c0'};">${initDrain.level} ${initDrain.type}</span>
        (Charisma ${charisma}) · Conjuring Test TN = Force · Magic Pool does not apply.
      </div>
      ${actor.system.karma?.pool > 0 ? `
      <div class="form-group">
        <label>Karma dice <span style="color:#958ba8;font-size:10px;">(pool ${actor.system.karma.pool})</span>:</label>
        <input type="number" name="karma_dice" value="0" min="0" max="${actor.system.karma.pool}" style="width:52px;text-align:center;">
      </div>` : ""}
    </form>`,
    buttons: [
      {
        action: "conjure", label: "Summon", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          result = {
            force:     Math.max(1, parseInt(f.force?.value) || 1),
            kind,
            domain:    f.domain?.value ?? "",
            fociDice:  Math.max(0, parseInt(f.fociDice?.value) || 0),
            karmaDice: Math.max(0, parseInt(f.karma_dice?.value) || 0)
          };
        }
      },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (hookId !== null) Hooks.off("renderDialogV2", hookId);
  return (action === "conjure" && result) ? result : null;
}

/**
 * Summon a spirit (conjuring). Opens the conjure dialog then rolls.
 * @this {ApplicationV2}
 */
async function onConjure(event, target) {
  event.preventDefault();
  const actor = this.document;
  const elementals = target.dataset.kind === "elemental";
  const opts = await promptConjureOptions(actor, elementals);
  if (!opts) return;
  return actor.rollConjuring(opts);
}

/**
 * Prompt for a Matrix attack (SR2E p.178–179).
 *
 * A decker chooses a loaded Attack program (dice = program rating + Hacking
 * Pool); IC attacks with its Rating. The GM supplies the target number (the
 * node's System Rating when attacking IC, or the target persona's Bod) and the
 * node's System Rating (used as the defending IC's resistance TN).
 *
 * @param {Actor} actor
 * @returns {Promise<object|null>}
 */
async function promptMatrixAttackOptions(actor) {
  const isIC = actor.type === "ic";
  const hackingMax = actor.system.dicePools?.hacking?.max ?? 0;

  let programOptions = "";
  if (!isIC) {
    const attackPrograms = actor.items.filter(i =>
      i.type === "program" && i.system.loaded &&
      /attack|blaster/i.test(i.name)).sort((a, b) => (b.system.rating ?? 0) - (a.system.rating ?? 0));
    if (!attackPrograms.length) {
      ui.notifications.warn("Load an Attack program (e.g. Attack, Blaster) to attack in the Matrix.");
      return null;
    }
    programOptions = attackPrograms.map(p =>
      `<option value="${p.id}">${p.name} (Rating ${p.system.rating})</option>`).join("");
  }

  let result = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Matrix Attack" },
    rejectClose: false,
    content: `<form>
      ${isIC ? `
      <div style="font-size:11px;color:#aaa1c0;padding:0 4px 6px;">
        Attack dice = IC Rating (${actor.system.effectiveRating ?? actor.system.rating}${actor.system.alert !== "none" ? `, ${actor.system.alert} alert +50%` : ""}). TN = the target persona's Bod.
      </div>` : `
      <div class="form-group">
        <label>Attack Program:</label>
        <select name="program">${programOptions}</select>
      </div>
      <div class="form-group">
        <label>Hacking Pool dice <span style="color:#958ba8;font-size:10px;">(max ${hackingMax})</span>:</label>
        <input type="number" name="hacking" value="0" min="0" max="${hackingMax}" style="width:52px;text-align:center;">
      </div>`}
      <div class="form-group">
        <label>Target Number <span style="color:#aaa1c0;font-size:10px;">(node System Rating, or target persona Bod)</span>:</label>
        <input type="number" name="tn" value="4" min="2" style="width:52px;text-align:center;" autofocus>
      </div>
      <div class="form-group">
        <label>Node System Rating <span style="color:#aaa1c0;font-size:10px;">(defending IC's resist TN)</span>:</label>
        <input type="number" name="node" value="4" min="0" style="width:52px;text-align:center;">
      </div>
      ${actor.system.karma?.pool > 0 ? `
      <div class="form-group">
        <label>Karma dice <span style="color:#958ba8;font-size:10px;">(pool ${actor.system.karma.pool})</span>:</label>
        <input type="number" name="karma_dice" value="0" min="0" max="${actor.system.karma.pool}" style="width:52px;text-align:center;">
      </div>` : ""}
    </form>`,
    buttons: [
      {
        action: "attack", label: "Attack", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          result = {
            programId: f.program?.value ?? null,
            hacking:   Math.max(0, parseInt(f.hacking?.value) || 0),
            tn:        Math.max(2, parseInt(f.tn?.value) || 4),
            node:      Math.max(0, parseInt(f.node?.value) || 0),
            karmaDice: Math.max(0, parseInt(f.karma_dice?.value) || 0)
          };
        }
      },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return (action === "attack" && result) ? result : null;
}

/**
 * Launch a Matrix attack from the decker or IC sheet.
 * @this {ApplicationV2}
 */
async function onMatrixAttack(event, target) {
  event.preventDefault();
  const actor = this.document;
  const opts = await promptMatrixAttackOptions(actor);
  if (!opts) return;

  const attackDice = actor.type === "ic"
    ? (actor.system.effectiveRating ?? actor.system.rating ?? 1)
    : (actor.items.get(opts.programId)?.system?.rating ?? 0);

  return actor.rollMatrixAttack({
    attackDice, tn: opts.tn, nodeRating: opts.node,
    hacking: actor.type === "ic" ? 0 : opts.hacking,
    karmaDice: opts.karmaDice
  });
}

/**
 * IC scans for an intruder (SR2E p.169): roll the IC's Rating vs the target
 * persona's Masking. Pre-fills Masking from a targeted decker token.
 * @this {ApplicationV2}
 */
async function onMatrixPerception(event, target) {
  event.preventDefault();
  const actor = this.document;
  const targeted = Array.from(game.user?.targets ?? [])
    .map(t => t.actor).find(a => a?.type === "character" && (a.system.cyberdeck?.mpcp ?? 0) > 0);
  const prefill = targeted?.system.matrixPersona?.masking ?? 4;

  let masking = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Detect Intruder" },
    rejectClose: false,
    content: `<form>
      <div style="font-size:11px;color:#aaa1c0;padding:0 4px 6px;">
        The IC rolls its Rating (${actor.system.effectiveRating ?? actor.system.rating}) against the
        intruder's <strong>Masking</strong>. Any success raises the alert.
      </div>
      <div class="form-group">
        <label>Target Masking:</label>
        <input type="number" name="masking" value="${prefill}" min="0" style="width:52px;text-align:center;" autofocus>
      </div>
    </form>`,
    buttons: [
      { action: "scan", label: "Scan", default: true,
        callback: (e, b) => { masking = Math.max(0, parseInt(b.form.elements.masking?.value) || 0); } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "scan" || masking === null) return;
  return actor.rollMatrixPerception(masking);
}

/**
 * Toggle the decker's jacked-in (Matrix) state.
 * @this {ApplicationV2}
 */
async function onToggleMatrixMode(event, target) {
  event.preventDefault();
  return this.document.update({ "system.matrixMode": !this.document.system.matrixMode });
}

/**
 * Roll to shake off dump shock (Willpower vs TN 4, SR2E p.180).
 * @this {ApplicationV2}
 */
async function onRecoverDumpShock(event, target) {
  event.preventDefault();
  return this.document.recoverDumpShock();
}

/**
 * Reset a host's intrusion tally and alert state (e.g. between runs).
 * @this {ApplicationV2}
 */
async function onResetHostTally(event, target) {
  event.preventDefault();
  return this.document.update({ "system.attempts": 0, "system.alert": "none" });
}

/**
 * Prompt for a system operation against a host/node (SR2E p.166–168).
 * @param {Actor} actor
 * @returns {Promise<object|null>}
 */
async function promptSystemOperationOptions(actor) {
  // Candidate hosts: a targeted host token first, then all host actors.
  const targeted = Array.from(game.user?.targets ?? []).map(t => t.actor).filter(a => a?.type === "host");
  const hosts = [...new Set([...targeted, ...game.actors.filter(a => a.type === "host")])];
  if (!hosts.length) {
    ui.notifications.warn("No host/node actors exist. Create a Host actor (the GM maps the system).");
    return null;
  }

  const hostOptions = hosts.map(h => {
    const code = game.i18n.localize(CONFIG.SR2E.securityCodes[h.system.securityCode]?.label ?? h.system.securityCode);
    return `<option value="${h.id}">${foundry.utils.escapeHTML(h.name)} (${code}-${h.system.systemRating})</option>`;
  }).join("");

  const opOptions = Object.entries(CONFIG.SR2E.systemOperations).map(([k, op]) =>
    `<option value="${k}">${game.i18n.localize(op.label)}</option>`).join("");

  const hackingMax = actor.system.dicePools?.hacking?.max ?? 0;

  let result = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "System Operation" },
    rejectClose: false,
    content: `<form>
      <div class="form-group">
        <label>Target Node:</label>
        <select name="host">${hostOptions}</select>
      </div>
      <div class="form-group">
        <label>Operation:</label>
        <select name="operation">${opOptions}</select>
      </div>
      <div style="font-size:11px;color:#aaa1c0;padding:0 4px 6px;">
        Computer Test vs the node's System Rating; beat the Security Code in successes
        (Blue 1 · Green 2 · Orange 3 · Red 4). Each retry adds +2 TN.
      </div>
      <div class="form-group">
        <label>Hacking Pool dice <span style="color:#958ba8;font-size:10px;">(max ${hackingMax})</span>:</label>
        <input type="number" name="hacking" value="0" min="0" max="${hackingMax}" style="width:52px;text-align:center;" autofocus>
      </div>
      ${actor.system.karma?.pool > 0 ? `
      <div class="form-group">
        <label>Karma dice <span style="color:#958ba8;font-size:10px;">(pool ${actor.system.karma.pool})</span>:</label>
        <input type="number" name="karma_dice" value="0" min="0" max="${actor.system.karma.pool}" style="width:52px;text-align:center;">
      </div>` : ""}
    </form>`,
    buttons: [
      {
        action: "run", label: "Run", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          result = {
            hostId:    f.host?.value ?? null,
            operation: f.operation?.value ?? null,
            hacking:   Math.max(0, parseInt(f.hacking?.value) || 0),
            karmaDice: Math.max(0, parseInt(f.karma_dice?.value) || 0)
          };
        }
      },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "run" || !result) return null;
  result.host = hosts.find(h => h.id === result.hostId) ?? null;
  return result;
}

/**
 * Run a system operation from the decker sheet.
 * @this {ApplicationV2}
 */
async function onSystemOperation(event, target) {
  event.preventDefault();
  const actor = this.document;
  const opts = await promptSystemOperationOptions(actor);
  if (!opts || !opts.host) return;
  return actor.rollSystemOperation(opts.host, opts.operation, {
    hacking: opts.hacking, karmaDice: opts.karmaDice
  });
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
  // Karma dice are capped at the program rating (= base dice in use)
  const opts = await promptRollOptions(this.document, { baseDice: item.system.rating ?? 0 });
  if (opts === null) return;
  return item.roll({ targetNumber: opts.tn, poolDice: opts.poolDice, karmaDice: opts.karmaDice });
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

  const needsConfirm = game.settings.get("sr2e", "confirmDelete");
  if (needsConfirm) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`
    });
    if (!confirmed) return;
  }

  return item.delete();
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
 * Prompt for vehicle test options (SR2E p.105–107): test type, terrain,
 * situational modifier, Control Pool and karma dice, with a live TN breakdown.
 *
 *   TN = Handling + terrain (per test type) − 2 × VCR + vehicle damage + other
 *   Dice = driving skill (Reaction at +4 TN when defaulting)
 *
 * @param {Actor} actor   - The driving character.
 * @param {Actor} vehicle - The vehicle actor.
 * @returns {Promise<{testType, terrain, otherMod, poolDice, karmaDice}|null>}
 */
/** Terrain <option> list for vehicle dialogs (default normal). */
function terrainOptions(selected = "normal") {
  return Object.entries(CONFIG.SR2E.vehicleTerrains)
    .map(([k, label]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${game.i18n.localize(label)}</option>`)
    .join("");
}

/**
 * Prompt for ramming options (SR2E p.107). Opposing vehicle stats are
 * pre-filled from a targeted vehicle token when one is selected.
 * @returns {Promise<{opp:object, terrain:string, poolDice:object, karmaDice:number}|null>}
 */
async function promptRamOptions(actor, myVehicle) {
  // Pre-fill from a targeted token whose actor is a vehicle
  const targetActor = game.user?.targets?.first?.()?.actor;
  const tv = targetActor?.type === "vehicle" ? targetActor : null;
  const oppName = tv?.name ?? "";
  const oBody = tv?.system?.body ?? 2;
  const oArmor = tv?.system?.armor ?? 0;
  const oHand = tv?.system?.handling ?? 3;

  const controlAvail = actor.system.dicePools?.control?.value ?? 0;

  let result = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Ram with ${myVehicle.name}` },
    rejectClose: false,
    content: `<form>
      ${tv ? `<p class="hint" style="margin:0 0 4px;">🎯 Target: <strong>${foundry.utils.escapeHTML(oppName)}</strong></p>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
        <div class="form-group" style="margin:2px 0;"><label>Opp. Name:</label>
          <input type="text" name="oppName" value="${foundry.utils.escapeHTML(oppName)}" placeholder="other vehicle"></div>
        <div class="form-group" style="margin:2px 0;"><label>Opp. Body:</label>
          <input type="number" name="oBody" value="${oBody}" min="1" style="width:52px;text-align:center;"></div>
        <div class="form-group" style="margin:2px 0;"><label>Opp. Armor:</label>
          <input type="number" name="oArmor" value="${oArmor}" min="0" style="width:52px;text-align:center;"></div>
        <div class="form-group" style="margin:2px 0;"><label>Opp. Handling:</label>
          <input type="number" name="oHand" value="${oHand}" min="0" style="width:52px;text-align:center;"></div>
        <div class="form-group" style="margin:2px 0;"><label>Opp. Driver Skill:</label>
          <input type="number" name="oSkill" value="0" min="0" style="width:52px;text-align:center;"
                 title="Opposing driver's Vehicle Skill rating (0 if unknown/uncrewed)"></div>
        <div class="form-group" style="margin:2px 0;"><label>Terrain:</label>
          <select name="terrain">${terrainOptions()}</select></div>
      </div>
      ${controlAvail > 0 ? `
      <div class="form-group" style="margin:3px 0;"><label style="font-size:12px;">Control Pool
        <span style="color:#958ba8;font-size:10px;">(${controlAvail} left)</span></label>
        <input type="number" name="pool_control" value="0" min="0" max="${controlAvail}" style="width:52px;text-align:center;"></div>` : ""}
      <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
        Both vehicles roll (Skill + Body + ½ Armor − Handling) vs (opp Body + ½ Armor − terrain).
        Fewer successes crashes (SR2E p.107).</p>
    </form>`,
    buttons: [
      { action: "ram", label: "Ram", default: true, callback: (event, button) => {
        const f = button.form.elements;
        const control = Math.max(0, Math.min(parseInt(f.pool_control?.value) || 0, controlAvail));
        result = {
          opp: {
            name: f.oppName?.value || (tv?.name ?? ""),
            body: parseInt(f.oBody?.value) || 1,
            armor: parseInt(f.oArmor?.value) || 0,
            handling: parseInt(f.oHand?.value) || 0,
            skill: parseInt(f.oSkill?.value) || 0,
            actor: tv
          },
          terrain: f.terrain?.value ?? "normal",
          poolDice: control > 0 ? { control } : {}
        };
      }},
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return (action === "ram" && result) ? result : null;
}

/**
 * Prompt for escape-test options (SR2E p.107).
 * @returns {Promise<{fleeingSuccesses, pursuerSuccesses, intelligence, terrain}|null>}
 */
async function promptEscapeOptions(actor) {
  let result = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Escape Test (pursuer)" },
    rejectClose: false,
    content: `<form>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
        <div class="form-group" style="margin:2px 0;"><label>Fleeing Position succ.:</label>
          <input type="number" name="flee" value="0" min="0" style="width:52px;text-align:center;"
                 title="Position Test successes the FLEEING vehicle generated"></div>
        <div class="form-group" style="margin:2px 0;"><label>Pursuer Position succ.:</label>
          <input type="number" name="pursue" value="0" min="0" style="width:52px;text-align:center;"
                 title="Position Test successes the PURSUING vehicle (you) generated"></div>
        <div class="form-group" style="margin:2px 0;"><label>Spotter Intelligence:</label>
          <input type="number" name="int" value="${actor.system.intelligence?.value ?? 1}" min="1" style="width:52px;text-align:center;"
                 title="Highest Intelligence among characters who could see the fleeing vehicle"></div>
        <div class="form-group" style="margin:2px 0;"><label>Terrain:</label>
          <select name="terrain">${terrainOptions()}</select></div>
      </div>
      <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
        If the pursuer matched/beat the fleeing successes, escape auto-fails. Otherwise roll
        Intelligence vs (net + terrain); no success = escape (SR2E p.107).</p>
    </form>`,
    buttons: [
      { action: "go", label: "Resolve", default: true, callback: (event, button) => {
        const f = button.form.elements;
        result = {
          fleeingSuccesses: parseInt(f.flee?.value) || 0,
          pursuerSuccesses: parseInt(f.pursue?.value) || 0,
          intelligence: parseInt(f.int?.value) || 1,
          terrain: f.terrain?.value ?? "normal"
        };
      }},
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  return (action === "go" && result) ? result : null;
}

async function promptVehicleTestOptions(actor, vehicle) {
  const handling  = vehicle.system.handling ?? 3;
  const vcr       = actor.system.vehicleControlRig ?? 0;
  const vcrMod    = -2 * vcr;
  const damageMod = vehicle.system.damageTnMod ?? 0;

  // Driver's skill: rating, or Reaction at +4 when defaulting
  const skillKey  = vehicle.system.drivingSkill;
  const normalize = s => s.toLowerCase().replace(/[\s/()]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const skillItem = actor.items.find(i => i.type === "skill" && normalize(i.name) === skillKey);
  const rating    = skillItem?.system?.rating ?? 0;
  const defaultingPenalty = rating > 0 ? 0 : CONFIG.SR2E.defaultingPenalty;
  const baseDice  = rating > 0 ? rating : Math.max(1, actor.system.reaction?.value ?? 1);
  const skillLabel = rating > 0
    ? `${skillItem.name} ${rating}`
    : `Reaction ${baseDice} (defaulting +${defaultingPenalty})`;

  // Control Pool — max dice = skill rating in use (SR2E p.84)
  const controlAvail = actor.system.dicePools?.control?.value ?? 0;
  const controlCap   = Math.min(controlAvail, rating > 0 ? rating : baseDice);

  const initTN = Math.max(2,
    handling + (CONFIG.SR2E.vehicleTerrainMods.handling.normal ?? 0)
             + vcrMod + damageMod + defaultingPenalty);

  // Live TN updates
  let hookId = Hooks.on("renderDialogV2", (app, html) => {
    const root = (html instanceof Element) ? html : document;
    const typeSel = root.querySelector("#sr2e-vt-type");
    if (!typeSel) return;
    Hooks.off("renderDialogV2", hookId);
    const terrSel  = root.querySelector("#sr2e-vt-terrain");
    const otherInp = root.querySelector("#sr2e-vt-other");
    const tnSpan   = root.querySelector("#sr2e-vt-tn");
    const terrSpan = root.querySelector("#sr2e-vt-terrain-mod");
    const update = () => {
      const t   = typeSel.value;
      const ter = terrSel?.value ?? "normal";
      const tMod = CONFIG.SR2E.vehicleTerrainMods[t]?.[ter] ?? 0;
      const oMod = parseInt(otherInp?.value) || 0;
      if (terrSpan) terrSpan.textContent = tMod >= 0 ? `+${tMod}` : `${tMod}`;
      if (tnSpan) tnSpan.textContent = Math.max(2,
        handling + tMod + vcrMod + damageMod + oMod + defaultingPenalty);
    };
    for (const el of [typeSel, terrSel, otherInp].filter(Boolean)) {
      el.addEventListener(el.tagName === "INPUT" ? "input" : "change", update);
    }
    update();
    attachPoolValidation(root);
  });

  const controlHTML = controlCap > 0 ? `
    <hr style="margin:8px 0 6px;">
    <div class="form-group" style="margin:3px 0;">
      <label style="font-size:12px;flex:1;">Control Pool
        <span style="color:#aaa1c0;font-size:10px;">(${controlAvail} left, max ${controlCap})</span>
      </label>
      <input type="number" name="pool_control" value="0" min="0" max="${controlCap}"
             data-pool-key="control" data-pool-cap="${controlCap}"
             style="width:52px;text-align:center;">
    </div>` : "";

  let rollResult = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Vehicle Test: ${vehicle.name}` },
    rejectClose: false,
    content: `<form>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
        <div class="form-group" style="margin:2px 0;">
          <label>Test:</label>
          <select id="sr2e-vt-type" name="testType">
            <option value="handling">Handling Test</option>
            <option value="position">Position Test</option>
            <option value="crash">Crash Test</option>
          </select>
        </div>
        <div class="form-group" style="margin:2px 0;">
          <label>Terrain:</label>
          <select id="sr2e-vt-terrain" name="terrain">
            <option value="open">Open</option>
            <option value="normal" selected>Normal</option>
            <option value="restricted">Restricted</option>
            <option value="tight">Tight</option>
          </select>
        </div>
        <div class="form-group" style="margin:2px 0;">
          <label>Other Mod:</label>
          <input type="number" id="sr2e-vt-other" name="otherMod" value="0"
                 style="width:52px;text-align:center;"
                 title="Weather, unfamiliar vehicle, vehicle size, under fire, etc.">
        </div>
      </div>
      <div style="margin:6px 0 4px;background:rgba(0,0,0,0.15);border-radius:4px;padding:6px 8px;font-size:11px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="color:#aaa1c0;">Dice (${skillLabel}):</td>
              <td style="text-align:right;">${baseDice}</td></tr>
          <tr><td style="color:#aaa1c0;">Handling:</td>
              <td style="text-align:right;">${handling}</td></tr>
          <tr><td style="color:#aaa1c0;">Terrain:</td>
              <td id="sr2e-vt-terrain-mod" style="text-align:right;">+1</td></tr>
          ${vcrMod ? `<tr><td style="color:#6c9;">Vehicle Control Rig ${vcr}:</td>
              <td style="text-align:right;">${vcrMod}</td></tr>` : ""}
          ${damageMod ? `<tr><td style="color:#c84;">Vehicle damage (${vehicle.system.damageLevel}):</td>
              <td style="text-align:right;">+${damageMod}</td></tr>` : ""}
          ${defaultingPenalty ? `<tr><td style="color:#c84;">Defaulting (untrained):</td>
              <td style="text-align:right;">+${defaultingPenalty}</td></tr>` : ""}
          <tr style="border-top:1px solid rgba(255,255,255,0.15);">
            <td style="font-weight:bold;padding-top:3px;">Final TN:</td>
            <td id="sr2e-vt-tn" style="text-align:right;font-weight:bold;padding-top:3px;">${initTN}</td>
          </tr>
        </table>
        <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
          A failed Crash Test crashes the vehicle (SR2E p.107).</p>
      </div>
      ${controlHTML}
      ${karmaDiceSection(actor, baseDice)}
    </form>`,
    buttons: [
      {
        action: "roll", label: "SR2E.Dialog.Roll", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          const rawCtrl = parseInt(f.pool_control?.value) || 0;
          const control = Math.max(0, Math.min(rawCtrl, controlCap));
          rollResult = {
            testType:  f.testType?.value ?? "handling",
            terrain:   f.terrain?.value  ?? "normal",
            otherMod:  parseInt(f.otherMod?.value) || 0,
            poolDice:  control > 0 ? { control } : {},
            karmaDice: readKarmaDice(button.form, actor, baseDice)
          };
        }
      },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });

  if (hookId !== null) Hooks.off("renderDialogV2", hookId);
  return (action === "roll" && rollResult) ? rollResult : null;
}

/**
 * Reload a weapon from its selected reserve ammo item.
 * @this {ApplicationV2}
 */
async function onReloadWeapon(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;
  return item.reloadWeapon();
}

/**
 * Reset the combat recoil counter to zero (start of new initiative pass).
 * @this {ApplicationV2}
 */
async function onResetRecoil(event, target) {
  event.preventDefault();
  return this.document.update({ "system.combatRecoil": 0 });
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
  // Spell Defense allocations are released when the Magic Pool refreshes (p.132)
  updates["system.dicePools.spellDefense"] = 0;
  return this.document.update(updates);
}

/**
 * Allocate Magic Pool dice as Spell Defense (SR2E p.132). Prompts for the
 * number of dice to commit.
 * @this {ApplicationV2}
 */
async function onAllocateSpellDefense(event, target) {
  event.preventDefault();
  const actor = this.document;
  const avail = actor.system.dicePools?.magic?.value ?? 0;
  if (avail <= 0) return ui.notifications.warn("No Magic Pool dice available to allocate.");
  let n = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Allocate Spell Defense" },
    rejectClose: false,
    content: `<form>
      <div class="form-group"><label>Dice from Magic Pool (${avail} available):</label>
        <input type="number" name="n" value="0" min="0" max="${avail}" autofocus style="width:60px;text-align:center;"></div>
      <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
        Protects you and chosen allies in line of sight; added to spell-resistance
        tests until the Magic Pool refreshes (SR2E p.132).</p>
    </form>`,
    buttons: [
      { action: "go", label: "Allocate", default: true,
        callback: (event, button) => { n = Math.max(0, Math.min(parseInt(button.form.elements.n?.value) || 0, avail)); } },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !n) return;
  return actor.allocateSpellDefense(n);
}

/** Return allocated Spell Defense dice to the Magic Pool. @this {ApplicationV2} */
async function onClearSpellDefense(event, target) {
  event.preventDefault();
  return this.document.clearSpellDefense();
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

/** Recover Stun by resting (SR2E p.112). @this {ApplicationV2} */
async function onRecoverStun(event) {
  event.preventDefault();
  return this.document.recoverStun();
}

/** Natural Physical healing (SR2E p.113). @this {ApplicationV2} */
async function onHealPhysical(event) {
  event.preventDefault();
  return this.document.healPhysical();
}

/**
 * First Aid (SR2E p.115): treat self or a targeted token's actor. Prompts for
 * the patient and the situational modifiers (conditions, no medkit).
 * @this {ApplicationV2}
 */
async function onFirstAid(event) {
  event.preventDefault();
  const medic = this.document;
  const targetActor = game.user?.targets?.first?.()?.actor;
  const patient = (targetActor && targetActor !== medic) ? targetActor : medic;

  let opts = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `First Aid — ${patient.name}` },
    rejectClose: false,
    content: `<form>
      <p class="hint" style="margin:0 0 6px;">
        Patient: <strong>${foundry.utils.escapeHTML(patient.name)}</strong>${patient === medic ? " (self)" : ""}.
        Treats Physical damage only; one attempt per injury (SR2E p.115).
      </p>
      <div class="form-group">
        <label>Conditions:</label>
        <select name="cond">
          <option value="0">Normal (+0)</option>
          <option value="1">Bad (+1)</option>
          <option value="3">Terrible (+3)</option>
        </select>
      </div>
      <div class="form-group">
        <label>No medkit (+4):</label>
        <input type="checkbox" name="noMedkit" style="width:auto;">
      </div>
    </form>`,
    buttons: [
      { action: "go", label: "Treat", default: true, callback: (event, button) => {
        opts = {
          conditionMod: parseInt(button.form.elements.cond?.value) || 0,
          noMedkit: !!button.form.elements.noMedkit?.checked
        };
      }},
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !opts) return;
  return medic.firstAid(patient, opts);
}

/**
 * Prompt for a positive Team Karma amount (1..max). Returns the integer or null.
 * @private
 */
async function _promptTeamKarmaAmount(title, hintHtml, max) {
  let amount = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title },
    rejectClose: false,
    content: `<form>
      <p class="hint" style="margin:0 0 8px;">${hintHtml}</p>
      <div class="form-group">
        <label>Amount:</label>
        <input type="number" name="amt" value="1" min="1" max="${max}" step="1" autofocus style="width:80px;">
      </div>
    </form>`,
    buttons: [
      { action: "go", label: "Confirm", default: true, callback: (event, button) => {
        amount = Math.floor(Number(button.form.elements.amt?.value) || 0);
      }},
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ]
  });
  if (action !== "go" || !amount || amount < 1) return null;
  return Math.min(amount, max);
}

/**
 * Contribute Karma Pool points from this character into the shared Team Karma
 * Pool (SR2E p.246): reduces the character's Karma Pool and raises the team total.
 * @private
 */
async function onContributeTeamKarma(event) {
  event.preventDefault();
  const actor = this.document;
  const pool = actor.system.karma?.pool ?? 0;
  if (pool < 1) return ui.notifications.warn("This character has no Karma Pool points to contribute.");
  const amount = await _promptTeamKarmaAmount(
    `Contribute to Team Karma — ${actor.name}`,
    `Move Karma Pool points into the shared Team Karma Pool. Available: <strong>${pool}</strong>.`,
    pool
  );
  if (!amount) return;
  // Dispatch the team-total change first; abort (without spending) if no GM is connected.
  if (!CONFIG.SR2E.changeTeamKarma(amount)) return;
  await actor.update({ "system.karma.pool": pool - amount });
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong> contributes <strong>${amount}</strong> Karma Pool to the Team Karma Pool.`
  });
}

/**
 * Draw points from the shared Team Karma Pool into this character's Karma Pool
 * (SR2E p.246 — requires the team's agreement, adjudicated at the table).
 * @private
 */
async function onDrawTeamKarma(event) {
  event.preventDefault();
  const actor = this.document;
  const team = game.settings.get("sr2e", "teamKarma") ?? 0;
  if (team < 1) return ui.notifications.warn("The Team Karma Pool is empty.");
  const amount = await _promptTeamKarmaAmount(
    `Draw from Team Karma — ${actor.name}`,
    `Draw shared points into this character's Karma Pool. The Team Karma Pool holds <strong>${team}</strong>. Drawing requires the team's agreement (SR2E p.246).`,
    team
  );
  if (!amount) return;
  if (!CONFIG.SR2E.changeTeamKarma(-amount)) return;
  const pool = actor.system.karma?.pool ?? 0;
  await actor.update({ "system.karma.pool": pool + amount });
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong> draws <strong>${amount}</strong> from the Team Karma Pool.`
  });
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
  allocateSpellDefense: onAllocateSpellDefense,
  clearSpellDefense: onClearSpellDefense,
  conjure: onConjure,
  matrixAttack: onMatrixAttack,
  systemOperation: onSystemOperation,
  toggleMatrixMode: onToggleMatrixMode,
  recoverDumpShock: onRecoverDumpShock,
  rollProgram: onRollProgram,
  toggleEquip: onToggleEquip,
  editItem: onEditItem,
  deleteItem: onDeleteItem,
  addItem: onAddItem,
  reloadWeapon: onReloadWeapon,
  resetRecoil: onResetRecoil,
  resetPools: onResetPools,
  resetPool:  onResetPool,
  incrementMonitor: onIncrementMonitor,
  decrementMonitor: onDecrementMonitor,
  recoverStun: onRecoverStun,
  healPhysical: onHealPhysical,
  firstAid: onFirstAid,
  contributeTeamKarma: onContributeTeamKarma,
  drawTeamKarma: onDrawTeamKarma,

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
   * Roll a vehicle test (handling / position / crash) for a linked vehicle.
   * @this {ApplicationV2}
   */
  vehicleTest: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    if (!uuid) return;
    const vehicle = await fromUuid(uuid);
    if (!vehicle) return;
    const actor = this.document;
    const opts = await promptVehicleTestOptions(actor, vehicle);
    if (!opts) return;
    return actor.rollVehicleTest(vehicle, opts);
  },

  /**
   * Ram another vehicle with a linked vehicle (SR2E p.107).
   * @this {ApplicationV2}
   */
  ramVehicle: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    if (!uuid) return;
    const vehicle = await fromUuid(uuid);
    if (!vehicle) return;
    const actor = this.document;
    const opts = await promptRamOptions(actor, vehicle);
    if (!opts) return;
    return actor.rollVehicleRam(vehicle, opts.opp, opts.terrain, { poolDice: opts.poolDice });
  },

  /**
   * Resolve an Escape Test as the pursuer (SR2E p.107).
   * @this {ApplicationV2}
   */
  escapeTest: async function(event, target) {
    event.preventDefault();
    const opts = await promptEscapeOptions(this.document);
    if (!opts) return;
    return this.document.rollEscapeTest(opts);
  },

  /**
   * Fire a weapon mounted on a linked vehicle — the character is the gunner
   * (Gunnery skill, SR2E p.105).
   * @this {ApplicationV2}
   */
  rollVehicleWeapon: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-vehicle-uuid]")?.dataset.vehicleUuid;
    const weaponId = target.closest("[data-weapon-id]")?.dataset.weaponId;
    if (!uuid || !weaponId) return;
    const vehicle = await fromUuid(uuid);
    const weapon = vehicle?.items.get(weaponId);
    if (!weapon) return;
    const actor = this.document;

    // Gunner's skill: Gunnery, defaulting to Intelligence (+4 TN) untrained
    const gunnery = actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === "gunnery");
    const rating = gunnery?.system?.rating ?? 0;
    let skillCap = Infinity, baseDice = 1, defaultingPenalty = 0;
    if (rating > 0) {
      skillCap = rating;
      baseDice = rating;
    } else {
      baseDice = Math.max(1, actor.system.intelligence?.value ?? 1);
      defaultingPenalty = CONFIG.SR2E.defaultingPenalty;
    }

    // Distance measured from the vehicle's token (the weapon mount)
    const presets = detectAttackTarget(vehicle, weapon);

    const opts = await promptWeaponAttackOptions(actor, weapon, skillCap, baseDice,
                                                 defaultingPenalty, presets);
    if (!opts) return;
    return weapon.roll({ ...opts, gunner: actor });
  },

  /**
   * Toggle jacked-in (rigging) state — switches initiative to VCR bonuses.
   * @this {ApplicationV2}
   */
  toggleRigging: async function(event, target) {
    event.preventDefault();
    return this.document.update({ "system.rigging": !this.document.system.rigging });
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
   * Open a bound spirit's sheet.
   * @this {ApplicationV2}
   */
  openSpirit: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-spirit-uuid]")?.dataset.spiritUuid;
    if (!uuid) return;
    const spirit = await fromUuid(uuid);
    if (spirit) spirit.sheet.render(true);
  },

  /**
   * Banish a bound spirit — unlinks it from the conjurer and deletes the
   * temporary Spirit actor (it returns to its domain / dissipates).
   * @this {ApplicationV2}
   */
  banishSpirit: async function(event, target) {
    event.preventDefault();
    const uuid = target.closest("[data-spirit-uuid]")?.dataset.spiritUuid;
    if (!uuid) return;
    const current = this.document.system.boundSpirits ?? [];
    await this.document.update({ "system.boundSpirits": current.filter(s => s !== uuid) });
    const spirit = await fromUuid(uuid);
    if (spirit) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.document }),
        content: `<div class="sr2e-item-card"><strong>${foundry.utils.escapeHTML(spirit.name)}</strong> banished — it returns to its domain.</div>`
      });
      if (spirit.isOwner) await spirit.delete();
    }
  },

  /**
   * Toggle sustaining a spell (drop is a Free Action). Applies/removes the
   * spell's Active Effects and the +2 TN sustain penalty (SR2E p.130).
   * @this {ApplicationV2}
   */
  toggleSustain: async function(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || item.type !== "spell") return;
    return item.setSustaining(!item.system.sustaining);
  },

  /**
   * Toggle whether a sustained spell is held by a spell lock — locked spells
   * impose no sustain penalty (SR2E p.137).
   * @this {ApplicationV2}
   */
  toggleSpellLock: async function(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || !item.system.sustaining) return;
    return item.update({ "system.spellLocked": !item.system.spellLocked });
  },

  /**
   * Spend Good Karma on advancement (SR2E p.190).
   *   Attributes: cost = the NEW rating (×2 above racial maximum, GM call;
   *     Reaction/Essence/Magic can never be raised directly).
   *   Skills: 2 × new rating for general skills, 1 × new rating for languages.
   * @this {ApplicationV2}
   */
  advanceKarma: async function(event, target) {
    event.preventDefault();
    const actor = this.document;
    const system = actor.system;
    const available = system.karma?.current ?? 0;

    const ATTRS = ["body", "quickness", "strength", "charisma", "intelligence", "willpower"];
    const maxes = CONFIG.SR2E.racialMaximums[system.race] ?? {};

    const attrCost = key => {
      const natural = system[key].base + system[key].racial;
      const newNat  = natural + 1;
      const overMax = maxes[key] != null && newNat > maxes[key];
      return { newNat, cost: newNat * (overMax ? 2 : 1), overMax };
    };
    const skillCost = item => {
      const newRating = item.system.rating + 1;
      const mult = item.system.category === "language" ? 1 : 2;
      return { newRating, cost: newRating * mult };
    };

    const attrOptions = ATTRS.map(k => {
      const { newNat, cost, overMax } = attrCost(k);
      const label = game.i18n.localize(CONFIG.SR2E.attributes[k]);
      return `<option value="attr:${k}">${label} ${newNat - 1} → ${newNat} — ${cost} Karma${overMax ? " (above racial max ×2!)" : ""}</option>`;
    }).join("");

    const skills = actor.items.filter(i => i.type === "skill")
      .sort((a, b) => a.name.localeCompare(b.name));
    const skillOptions = skills.map(s => {
      const { newRating, cost } = skillCost(s);
      return `<option value="skill:${s.id}">${foundry.utils.escapeHTML(s.name)} ${newRating - 1} → ${newRating} — ${cost} Karma</option>`;
    }).join("");

    let choice = null;
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: `Karma Advancement — ${available} Good Karma available` },
      rejectClose: false,
      content: `<form>
        <div class="form-group">
          <label>Advance:</label>
          <select name="advance">
            <optgroup label="Attributes (cost = new rating; ×2 above racial max)">
              ${attrOptions}
            </optgroup>
            ${skillOptions ? `<optgroup label="Skills (2 × new rating; languages 1×)">
              ${skillOptions}
            </optgroup>` : ""}
          </select>
        </div>
        <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
          Costs per SR2E p.190. Reaction, Essence and Magic can never be raised
          directly. Raises above the racial maximum need GM approval.</p>
      </form>`,
      buttons: [
        {
          action: "advance", label: "Advance", default: true,
          callback: (event, button) => { choice = button.form.elements.advance?.value ?? null; }
        },
        { action: "cancel", label: "SR2E.Dialog.Cancel" }
      ]
    });
    if (action !== "advance" || !choice) return;

    const [kind, key] = choice.split(":");
    let label, cost;

    if (kind === "attr") {
      const { newNat, cost: c, overMax } = attrCost(key);
      cost = c;
      if (cost > available) {
        return ui.notifications.warn(`Not enough Good Karma — ${cost} needed, ${available} available.`);
      }
      await actor.update({
        [`system.${key}.base`]: system[key].base + 1,
        "system.karma.current": available - cost
      });
      label = `${game.i18n.localize(CONFIG.SR2E.attributes[key])} raised to ${newNat}` +
              (overMax ? " (above racial maximum — GM approved)" : "");
    } else {
      const item = actor.items.get(key);
      if (!item) return;
      const { newRating, cost: c } = skillCost(item);
      cost = c;
      if (cost > available) {
        return ui.notifications.warn(`Not enough Good Karma — ${cost} needed, ${available} available.`);
      }
      await item.update({ "system.rating": newRating });
      await actor.update({ "system.karma.current": available - cost });
      label = `${item.name} raised to ${newRating}`;
    }

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-item-card">
        <strong>Advancement:</strong> ${foundry.utils.escapeHTML(label)}
        <em>(${cost} Good Karma spent — ${available - cost} remaining)</em>
      </div>`
    });
  },

  /**
   * Cycle astral state: Physical → Perceiving → Projecting → Physical (p.145).
   * @this {ApplicationV2}
   */
  toggleAstral: async function(event, target) {
    event.preventDefault();
    const order = ["none", "perceiving", "projecting"];
    const cur = this.document.system.astralState ?? "none";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    await this.document.update({ "system.astralState": next });
    if (next !== "none") {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.document }),
        content: `<div class="sr2e-item-card"><strong>${foundry.utils.escapeHTML(this.document.name)}</strong> is now ${game.i18n.localize("SR2E.Astral." + next.charAt(0).toUpperCase() + next.slice(1))}.</div>`
      });
    }
  },

  /**
   * Make an astral attack (SR2E p.147). Prompts for damage type.
   * @this {ApplicationV2}
   */
  astralAttack: async function(event, target) {
    event.preventDefault();
    const actor = this.document;
    let opts = null;
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: "Astral Attack" },
      rejectClose: false,
      content: `<form>
        <div class="form-group"><label>Damage:</label>
          <select name="dt"><option value="stun">Stun</option><option value="physical">Physical</option></select></div>
        <div class="form-group"><label>Other Mod:</label>
          <input type="number" name="other" value="0" style="width:52px;text-align:center;"></div>
        <p style="margin:4px 0 0;font-size:10px;color:#aaa1c0;">
          Sorcery vs TN 4; damage (Charisma)L (+weapon focus). Echoes to the physical body (SR2E p.147).</p>
      </form>`,
      buttons: [
        { action: "go", label: "Attack", default: true, callback: (event, button) => {
          opts = { damageType: button.form.elements.dt?.value ?? "stun",
                   otherMod: parseInt(button.form.elements.other?.value) || 0 };
        }},
        { action: "cancel", label: "SR2E.Dialog.Cancel" }
      ]
    });
    if (action !== "go" || !opts) return;
    return actor.rollAstralAttack(opts);
  },

  /**
   * Clear the character's magical tradition — resets magic.type and
   * magic.tradition to "none". Triggered by the × button on the magic tab.
   * @this {ApplicationV2}
   */
  clearTradition: async function(event, target) {
    return this.document.update({
      "system.magic.type":      "none",
      "system.magic.tradition": "none",
      "system.magic.skill":     "none",
      "system.magic.totem":     ""
    });
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
    // V13: the global FilePicker is deprecated; use the namespaced implementation
    const FilePickerImpl = foundry.applications.apps.FilePicker.implementation;
    const fp = new FilePickerImpl({
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

    // Adept powers: physical adepts and shamanic adepts
    context.hasAdeptPowers = magicType === "physical_adept" || magicType === "shamanic_adept";

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
    context.priorityValid = context.priorityDuplicates.length === 0;

    // Shared Team Karma Pool total (SR2E p.246) — shown on every character sheet.
    context.teamKarma = game.settings.get("sr2e", "teamKarma") ?? 0;

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

    context.enrichedBiography = await TextEditor.enrichHTML(actor.system.biography || "", {
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
 * Vehicle Sheet.
 */
export class SR2EVehicleSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "vehicle"],
    position: { width: 600, height: 600 },
    actions: {
      switchTab: SHARED_ACTIONS.switchTab,
      applyDesign: onApplyVehicleDesign,
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
    context.mods = this.document.items.filter(i => i.type === "vehicle_mod");
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
      designPoints: Number(i.system.designPoints) || 0,
      cost: Number(i.system.cost) || 0
    }));
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
