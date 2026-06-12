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
        <span style="color:#888;font-size:10px;">${game.i18n.format("SR2E.Dialog.KarmaDiceHint", { cap, avail })}</span>
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
    ? `<p style="margin:0 0 4px;font-size:10px;color:#888;">Max pool dice per pool: ${skillCap} (= skill rating)</p>`
    : "";

  // Each pool input carries data-pool-key / data-pool-cap for the validation hook.
  const poolHTML = availablePools.length ? `
    <hr style="margin:8px 0 6px;">
    <p style="margin:0 0 2px;font-size:11px;color:#a0a0a0;">${game.i18n.localize("SR2E.Dialog.PoolDiceHeader")}</p>
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
 *            outOfRange?: boolean, targetQuickness?: number}}
 */
function detectAttackTarget(attacker, weapon) {
  const presets = {};
  const targetToken = game.user?.targets?.first?.();
  if (!targetToken || !canvas?.ready) return presets;

  presets.targetName = targetToken.name;
  const tQuick = targetToken.actor?.system?.quickness?.value;
  if (tQuick) presets.targetQuickness = tQuick;

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

  const woundPenalty  = actor.system.woundPenalty ?? 0;
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
    <p style="margin:0 0 2px;font-size:11px;color:#a0a0a0;">${game.i18n.localize("SR2E.Dialog.PoolDiceHeader")}</p>
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

  // ── Static breakdown rows (auto-detected, not interactive) ────────────────
  const cywareLabel  = cywareName ? `${cywareName}:` : "Smartlink:";
  const cywareModStr = cyberwareMod > 0 ? `+${cyberwareMod}` : `${cyberwareMod}`;
  const cywareStyle  = cyberwareMod !== 0 ? "" : "display:none;";
  const woundStyle   = woundPenalty  > 0  ? "" : "display:none;";
  const recoilLabel  = `Recoil (${shotsFired} fired, RC ${recoilComp}):`;
  const recoilStyle  = recoilPenalty > 0  ? "" : "display:none;";

  // Initial TN with all situational mods at zero
  const initFinalTN = Math.max(2, BASE_TN + cyberwareMod + woundPenalty + recoilPenalty
                                          + defaultingPenalty);

  // Helper: format a modifier number for display (always show sign)
  const fmt = n => n === 0 ? "+0" : (n > 0 ? `+${n}` : `${n}`);

  // ── Live TN update via renderDialogV2 hook ────────────────────────────────
  // Identifies our dialog by #sr2e-attacker which is present in both ranged and melee.
  let hookId = null;
  hookId = Hooks.on("renderDialogV2", (app, html) => {
    const root = (html instanceof Element) ? html : document;
    const attackerSelect = root.querySelector("#sr2e-attacker");
    if (!attackerSelect) return;             // not our dialog
    Hooks.off("renderDialogV2", hookId);

    // Ranged-only inputs
    const rangeSelect  = root.querySelector("#sr2e-attack-range");
    const coverSelect  = root.querySelector("#sr2e-cover");
    const meleeCheck   = root.querySelector("#sr2e-in-melee");
    const modeSelect   = root.querySelector("#sr2e-firing-mode");
    const roundsInput  = root.querySelector("#sr2e-fa-rounds");
    const roundsRow    = root.querySelector("#sr2e-fa-rounds-row");
    // Melee-only inputs
    const quickInput   = root.querySelector("#sr2e-target-quick");
    const reachInput   = root.querySelector("#sr2e-reach-mod");
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
    const baseTnValSpan = root.querySelector("#sr2e-base-tn-val");
    const reachModSpan  = root.querySelector("#sr2e-reach-mod-val");
    // Row elements (show/hide)
    const coverRow    = root.querySelector("#sr2e-cover-row");
    const attackRow   = root.querySelector("#sr2e-attacker-row");
    const targetRow   = root.querySelector("#sr2e-target-row");
    const meleeRow    = root.querySelector("#sr2e-melee-row");
    const otherRow    = root.querySelector("#sr2e-other-row");
    const reachRow    = root.querySelector("#sr2e-reach-row");
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
                                      + cyberwareMod + woundPenalty + recoil
                                      + defaultingPenalty);
      } else {
        const quick  = parseInt(quickInput?.value) || 4;
        const rchMod = parseInt(reachInput?.value) || 0;
        if (baseTnValSpan) baseTnValSpan.textContent = quick;
        if (reachModSpan)  reachModSpan.textContent  = fmt(rchMod);
        if (reachRow)      reachRow.style.display     = rchMod !== 0 ? "" : "none";
        finalTN = Math.max(2, quick + rchMod + aMod + tMod + oMod + woundPenalty
                                    + defaultingPenalty);
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
                       attackerSelect, targetSelect, otherInput, quickInput, reachInput].filter(Boolean);
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
        <label>Target Quickness:</label>
        <input type="number" id="sr2e-target-quick" name="targetQuickness"
               value="${presets.targetQuickness ?? 4}" min="1" max="12" style="width:52px;text-align:center;"
               title="Target's Quickness attribute — this is the base TN for melee attacks (SR2E p.113)">
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label>Reach Disadvantage:</label>
        <input type="number" id="sr2e-reach-mod" name="reachMod"
               value="0" style="width:52px;text-align:center;"
               title="Positive = target has longer weapon (TN penalty for you). E.g. fighting a staff (Reach 2) with a knife (Reach 0) = +2.">
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
               title="Visibility, called shots, environmental conditions, etc.">
      </div>
    </div>`;

  // TN breakdown rows — differ for ranged vs melee
  const baseTnRow = isRanged
    ? `<tr><td style="color:#888;padding:1px 0;">Base TN (Short range):</td><td style="text-align:right;padding:1px 0;">${BASE_TN}</td></tr>`
    : `<tr><td style="color:#888;padding:1px 0;">Target Quickness:</td><td id="sr2e-base-tn-val" style="text-align:right;padding:1px 0;">4</td></tr>`;

  const rangedOnlyRows = isRanged ? `
    <tr>
      <td id="sr2e-range-label" style="color:#888;padding:1px 0;">Range (Short):</td>
      <td id="sr2e-range-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-cover-row" style="display:none;">
      <td style="color:#888;padding:1px 0;">Cover:</td>
      <td id="sr2e-cover-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-melee-row" style="display:none;">
      <td style="color:#c84;padding:1px 0;">Firing in Melee:</td>
      <td id="sr2e-melee-mod" style="text-align:right;padding:1px 0;">+3</td>
    </tr>` : `
    <tr id="sr2e-reach-row" style="display:none;">
      <td style="color:#888;padding:1px 0;">Reach Disadvantage:</td>
      <td id="sr2e-reach-mod-val" style="text-align:right;padding:1px 0;">+0</td>
    </tr>`;

  const autoRows = `
    <tr id="sr2e-attacker-row" style="display:none;">
      <td style="color:#888;padding:1px 0;">Attacker running:</td>
      <td id="sr2e-attacker-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-target-row" style="display:none;">
      <td style="color:#888;padding:1px 0;">Target running:</td>
      <td id="sr2e-target-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-other-row" style="display:none;">
      <td style="color:#888;padding:1px 0;">Other:</td>
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
      ${commonInputsHTML}
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
            targetQuickness: parseInt(f.targetQuickness?.value) || 4,
            reachMod:        parseInt(f.reachMod?.value)        || 0,
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
    targetQuickness: opts.targetQuickness,
    reachMod:        opts.reachMod,
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
        <label>${game.i18n.localize("SR2E.Dialog.Force")} <span style="color:#888;font-size:10px;">(1–${magicAttr})</span>:</label>
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
        <span style="color:#888;font-size:10px;">(${controlAvail} left, max ${controlCap})</span>
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
          <tr><td style="color:#888;">Dice (${skillLabel}):</td>
              <td style="text-align:right;">${baseDice}</td></tr>
          <tr><td style="color:#888;">Handling:</td>
              <td style="text-align:right;">${handling}</td></tr>
          <tr><td style="color:#888;">Terrain:</td>
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
        <p style="margin:4px 0 0;font-size:10px;color:#888;">
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
  reloadWeapon: onReloadWeapon,
  resetRecoil: onResetRecoil,
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
 * Vehicle Sheet.
 */
export class SR2EVehicleSheet extends SR2EBaseActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["sr2e", "sheet", "actor", "vehicle"],
    position: { width: 550, height: 450 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    }
  };

  static PARTS = {
    vehicle: { template: "systems/sr2e/templates/actor/vehicle-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.weapons = this.document.items.filter(i => i.type === "weapon");
    context.mods = this.document.items.filter(i => i.type === "vehicle_mod");
    return context;
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
    position: { width: 500, height: 450 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    }
  };

  static PARTS = {
    spirit: { template: "systems/sr2e/templates/actor/spirit-sheet.hbs" }
  };
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
    position: { width: 450, height: 400 },
    actions: {
      editItem: onEditItem,
      deleteItem: onDeleteItem,
      addItem: onAddItem
    }
  };

  static PARTS = {
    ic: { template: "systems/sr2e/templates/actor/ic-sheet.hbs" }
  };
}
