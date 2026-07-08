import { parseDrainCode } from "../data/item-data.mjs";
import { thrownRange, accessorySummary, gyroReduction, shiftRangeBracket, streetPrice } from "../rules/sr2e-rules.mjs";

// ===========================================================================
// SR2E SHARED SHEET ACTIONS
// Standalone dialog/prompt builders and ApplicationV2 action handlers used by
// the actor sheets. In V13 ApplicationV2 an action handler receives
// (event, target) with `this` bound to the Application instance. Extracted from
// actor-sheet.mjs so the sheet classes stay readable; SHARED_ACTIONS is the
// registry the classes spread into their static `actions`.
// ===========================================================================

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
  const actor = this.document;
  // A skillsoft-granted skill the character has no natural item for: roll the soft.
  const softId = target.closest("[data-soft-id]")?.dataset.softId;
  if (softId) {
    const chip = actor.system.chippedSkills?.find(s => s.softId === softId);
    const opts = await promptRollOptions(actor, { showPools: false, baseDice: chip?.system.rating ?? 1 });
    if (!opts) return;
    return actor.rollChippedSkill(softId, opts.tn, { poolDice: opts.poolDice, karmaDice: opts.karmaDice });
  }
  const skillId = target.closest("[data-item-id]")?.dataset.itemId;
  if (!skillId) return;
  // Clicking the inline "(Concentration N)" / "[Specialization N]" tag rolls
  // that variant's rating instead of the general skill (SR2E p.70). The tag is
  // its own data-action element, so `target` IS the tag when clicked; fall
  // back to the event path for safety.
  const variant = target?.dataset?.variant
    ?? event.target?.closest?.("[data-variant]")?.dataset?.variant ?? "";
  // SR2E p.86: Combat Pool is only for combat-related tests (Firearm, Melee, etc.)
  // and Damage Resistance Tests — pools are hidden for general skill checks.
  // Karma dice (p.190) may still be bought, capped at the dice in use:
  // the skill rating, or the linked attribute when defaulting untrained.
  const skillItem = actor.items.get(skillId);
  let baseDice = (variant && skillItem?.system?.[variant]?.rating)
    || skillItem?.system?.rating || 0;
  if (baseDice <= 0) {
    const attrKey = skillItem?.system?.linkedAttribute || "quickness";
    baseDice = attrKey === "reaction"
      ? (actor.system.reaction?.value ?? 1)
      : (actor.system[attrKey]?.value ?? 1);
  }
  const opts = await promptRollOptions(actor, { showPools: false, baseDice });
  if (!opts) return;
  return actor.rollSkillTest(skillId, opts.tn, {
    poolDice: opts.poolDice, karmaDice: opts.karmaDice, variant
  });
}

/** Every rollable skill name for the untrained picker: the Skill Web's skill
 *  nodes (canonical labels, incl. knowledge/vehicle) plus any activeSkills not
 *  on the web, deduped and sorted. */
function allSkillNames() {
  const names = new Set();
  for (const n of Object.values(CONFIG.SR2E.skillWeb?.nodes ?? {})) {
    if (n.type === "skill") names.add(n.label);
  }
  for (const k of Object.keys(CONFIG.SR2E.activeSkills ?? {})) {
    names.add(k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * "Roll a Skill…" — pick any skill and roll it whether or not the character has
 * it. Trained skills roll their rating; untrained ones default through the
 * Skill Web automatically (SR2E p.69). No throwaway item needed.
 * @this {ApplicationV2}
 */
async function onDefaultSkill(event, target) {
  event.preventDefault();
  const actor = this.document;
  const isGM = game.user.isGM;
  const opts = allSkillNames().map(n => `<option value="${foundry.utils.escapeHTML(n)}">${foundry.utils.escapeHTML(n)}</option>`).join("");
  let result = null;
  const setResult = (button) => {
    result = { skill: button.form.elements.skill.value, tn: parseInt(button.form.elements.tn.value) || 4 };
  };
  const buttons = [
    { action: "roll", label: "SR2E.Dialog.Roll", default: !isGM, callback: (e, b) => setResult(b) },
  ];
  // A GM can broadcast the request to the table instead of rolling this actor.
  if (isGM) buttons.push({ action: "request", label: "Request from Players", default: true, callback: (e, b) => setResult(b) });
  buttons.push({ action: "cancel", label: "SR2E.Dialog.Cancel" });

  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: isGM ? "Roll / Request a Skill" : "Roll a Skill" },
    rejectClose: false,
    content: `
      <form>
        <div class="form-group">
          <label>Skill:</label>
          <select name="skill" autofocus>${opts}</select>
        </div>
        <div class="form-group">
          <label>Target Number:</label>
          <input type="number" name="tn" value="4" min="2" max="30">
        </div>
        <p style="font-size:10px;color:#aaa1c0;margin:4px 0 0;">Trained skills roll their rating; if the character doesn't have the skill it defaults through the Skill Web automatically.${isGM ? " <em>Request from Players</em> posts a card each player rolls with their own character." : ""}</p>
      </form>`,
    buttons
  });
  if (!result) return;
  if (action === "request") {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-skill-request">
        <strong>🎲 Roll requested: ${foundry.utils.escapeHTML(result.skill)}</strong> — TN ${result.tn}
        <br><em>Roll it with your character (trained, or defaulted via the Skill Web).</em>
        <br><button type="button" class="sr2e-skill-request-btn" data-skill="${foundry.utils.escapeHTML(result.skill)}" data-tn="${result.tn}">Roll ${foundry.utils.escapeHTML(result.skill)}</button>
      </div>`
    });
  }
  return actor.rollNamedSkill(result.skill, result.tn);
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

  // Auto-suggest a Visibility Table modifier (p.89) — manually overridable
  // in the dialog. Sources: any template flagged with a visibility value
  // (smoke-grenade blasts stamp theirs) containing the TARGET's centre, and
  // the scene's darkness level.
  let visMod = 0;
  for (const t of canvas.templates?.placeables ?? []) {
    const v = t.document.flags?.sr2e?.visibility;
    if (!v) continue;
    const dx = targetToken.center.x - t.document.x;
    const dy = targetToken.center.y - t.document.y;
    const rPx = (t.document.distance ?? 0) * (canvas.grid.size / canvas.grid.distance);
    if (Math.hypot(dx, dy) <= rPx) visMod = Math.max(visMod, Number(v) || 0);
  }
  const darkness = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;
  if (darkness >= 0.75)      visMod = Math.max(visMod, 8);  // Full Darkness
  else if (darkness >= 0.4)  visMod = Math.max(visMod, 6);  // Minimal Light
  else if (darkness >= 0.15) visMod = Math.max(visMod, 2);  // Partial Light
  if (visMod) presets.visMod = visMod;

  // Pick the range bracket from the weapon's range data (0 = undefined)
  // Thrown weapons (grenades, knives, shuriken) ignore their static range field —
  // SR2 scales their brackets with the thrower's Strength (Grenade Range Table,
  // core p.96-97). A Str-6 throw reaches 18 m short / 30 medium / 60 long.
  const wt = weapon?.system?.weaponType;
  const r = (wt === "throwing" || wt === "grenade")
    ? thrownRange(attacker?.system?.strength?.value ?? 1)
    : (weapon?.system?.ranges ?? {});
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

  // Killing Hands (SR2E p.125-126): offer the physical-damage declaration on
  // unarmed attacks when the adept has the power. Best (highest) level wins.
  let killingHands = "";
  if (isMelee && /unarmed/i.test(weapon.name)) {
    const order = { L: 1, M: 2, S: 3, D: 4 };
    for (const p of actor.items) {
      if (p.type !== "adept_power") continue;
      const m = p.name.match(/killing hands\s*\((L|M|S|D)\)/i);
      if (m && (order[m[1].toUpperCase()] ?? 0) > (order[killingHands] ?? 0)) {
        killingHands = m[1].toUpperCase();
      }
    }
  }

  // ── Auto-detected modifiers ───────────────────────────────────────────────

  // Accessories attached to this weapon (SR2E p.240–241): recoil comp, TN
  // mods, smartgun grant, gyro rating, scope range shift. Same aggregation as
  // the roll itself (accessorySummary), so dialog and chat card always agree.
  const attached = actor.items.filter(i =>
    i.type === "gear" && i.system.weaponAccessory && i.system.linkedWeaponId === weapon.id);
  const accBase     = accessorySummary(attached, { deployed: false });
  const accDeployed = accessorySummary(attached, { deployed: true });

  // Smartweapon via factory flag or attached smartgun system (p.241);
  // receptor benefit: smartlink cyberware −2, else smart goggles −1 (p.90).
  const smartCapable = weapon.system.smartgunCompatible || accBase.grantsSmartgun;
  let cyberwareMod = 0;
  let cywareName = "";
  if (smartCapable) {
    for (const item of actor.items) {
      if (item.type === "cyberware" && item.system.installed && item.system.combatTnMod !== 0) {
        cyberwareMod += item.system.combatTnMod;
        if (cywareName) cywareName += ", ";
        cywareName += item.name;
      }
    }
    if (cyberwareMod === 0) {
      const goggles = actor.items.find(i =>
        i.type === "gear" && i.system.smartGoggles && i.system.equipped);
      if (goggles) { cyberwareMod = -1; cywareName = goggles.name; }
    }
  }

  // Laser sight (p.90): −1 out to 50 m, never on top of a smartlink/goggles
  // bonus. With no measured distance the shooter is trusted.
  const laserMod = (accBase.laserMod && cyberwareMod === 0 &&
                    (presets.distance == null || presets.distance <= 50))
    ? accBase.laserMod : 0;
  const accessoryTnMod = accBase.tnMod + laserMod;

  const woundPenalty   = actor.system.woundPenalty ?? 0;
  const sustainPenalty = actor.system.sustainPenalty ?? 0;
  const shotsFired    = actor.system.combatRecoil  ?? 0;
  const hasRecoil     = ["firearm", "heavy"].includes(weapon.system.weaponType);
  // Heavy weapons (M/HMGs, shotguns) double uncompensated recoil (p.89-90)
  const heavyRecoil   = weapon.system.weaponType === "heavy" || (weapon.system.choke ?? 0) >= 2;
  // Weapon + accessory compensation (p.90); deployment-gated mounts (bipod/
  // tripod) are added live via the dialog checkbox.
  const recoilComp    = (weapon.system.recoilComp ?? 0) + accBase.recoilComp;
  // Initial penalty from rounds already fired; a BF/FA burst's own rounds are
  // added live in the dialog once a firing mode is selected.
  const recoilPenalty = hasRecoil
    ? Math.max(0, shotsFired - recoilComp) * (heavyRecoil ? 2 : 1) : 0;

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
  const initFinalTN = Math.max(2, BASE_TN + cyberwareMod + accessoryTnMod
                                          + woundPenalty + sustainPenalty
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
    const deployedCheck = root.querySelector("#sr2e-deployed");
    const gyroRow  = root.querySelector("#sr2e-gyro-row");
    const gyroVal  = root.querySelector("#sr2e-gyro-val");

    function currentRecoilComp() {
      // Bipod/tripod compensation only when set up (p.240–241)
      return deployedCheck?.checked
        ? recoilComp + (accDeployed.recoilComp - accBase.recoilComp)
        : recoilComp;
    }

    function currentRecoil() {
      if (!isRanged || !hasRecoil) return 0;
      const mode  = modeSelect?.value ?? "sa";
      const burst = mode === "bf" ? 3
                  : mode === "fa" ? Math.min(10, Math.max(3, parseInt(roundsInput?.value) || 3))
                  : 0;
      const net = Math.max(0, liveShotsFired + burst - currentRecoilComp());
      // Heavy weapons/shotguns double uncompensated recoil (p.89-90)
      return heavyRecoil ? net * 2 : net;
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
        // Imaging scope shifts the effective bracket left by its rating (p.88)
        const selected = rangeSelect?.value ?? "short";
        const rng  = shiftRangeBracket(selected, accBase.rangeShift);
        const rMod = RANGE_TN_MODS[rng] ?? 0;
        const cMod = parseInt(coverSelect?.value) || 0;
        const vMod = parseInt(root.querySelector("#sr2e-visibility")?.value) || 0;
        // Firing while in melee: +2 per opponent engaging the attacker (p.90)
        const mMod = 2 * Math.max(0, parseInt(meleeCheck?.value) || 0);
        const recoil = currentRecoil();
        // Gyro mount eats recoil + attacker movement modifiers (p.90)
        const gyroCut = gyroReduction(accBase.gyroRating, recoil, aMod);
        if (rangeLabel)   rangeLabel.textContent   = rng !== selected
          ? `Range (${RANGE_LABELS[selected]} → ${RANGE_LABELS[rng]}, scope):`
          : `Range (${RANGE_LABELS[rng]}):`;
        if (rangeModSpan) rangeModSpan.textContent = fmt(rMod);
        if (coverModSpan) coverModSpan.textContent = fmt(cMod);
        if (meleeModSpan) meleeModSpan.textContent = fmt(mMod);
        if (coverRow)     coverRow.style.display   = cMod !== 0 ? "" : "none";
        if (meleeRow)     meleeRow.style.display   = mMod !== 0 ? "" : "none";
        if (roundsRow)    roundsRow.style.display  = (modeSelect?.value === "fa") ? "" : "none";
        if (recoilRow)    recoilRow.style.display  = recoil > 0 ? "" : "none";
        if (recoilVal)    recoilVal.textContent    = `+${recoil}`;
        if (gyroRow)      gyroRow.style.display    = gyroCut > 0 ? "" : "none";
        if (gyroVal)      gyroVal.textContent      = `−${gyroCut}`;
        finalTN = Math.max(2, BASE_TN + rMod + cMod + vMod + aMod + tMod + mMod + oMod
                                      + cyberwareMod + accessoryTnMod
                                      + woundPenalty + sustainPenalty
                                      + recoil - gyroCut + defaultingPenalty);
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
                       alliesInput, foesInput, supPosCheck, proneCheck, multiInput,
                       deployedCheck, root.querySelector("#sr2e-visibility")].filter(Boolean);
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
  // Concentration/Specialization selector (SR2E p.70) — only when choices exist
  const skillSelectHTML = presets.skillChoices?.length > 1 ? `
    <div class="form-group" style="margin:2px 0 6px;">
      <label title="Roll the general skill, or a Concentration/Specialization rating (SR2E p.70)">Skill used:</label>
      <select name="skillVariant">
        ${presets.skillChoices.map(c =>
          `<option value="${c.key}" ${c.selected ? "selected" : ""}>${foundry.utils.escapeHTML(c.label)}</option>`
        ).join("")}
      </select>
    </div>` : "";

  const topInputsHTML = isRanged ? `
    ${skillSelectHTML}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
      <div class="form-group" style="margin:2px 0;">
        <label>Range:</label>
        <select id="sr2e-attack-range" name="range">
          ${["short", "medium", "long", "extreme"].map(k =>
            `<option value="${k}" ${presets.range === k ? "selected" : ""}>${RANGE_LABELS[k]}</option>`
          ).join("")}
        </select>
      </div>
      ${hasRecoil ? `<div class="form-group" style="margin:2px 0;">
        <label>Firing Mode:</label>
        <select id="sr2e-firing-mode" name="firingMode">${
          Object.entries(FIRING_MODE_DATA)
            .filter(([key]) => weapon.system.firingModes?.[key])
            .map(([key, d]) => `<option value="${key}">${d.label}</option>`)
            .join("") || `<option value="sa">${FIRING_MODE_DATA.sa.label}</option>`
        }</select>
      </div>` : ""}
      <div class="form-group" style="margin:2px 0;">
        <label>Cover:</label>
        <select id="sr2e-cover" name="cover">
          <option value="0">None</option>
          <option value="2">Partial (+2)</option>
          <option value="4">Good (+4)</option>
          <option value="6">Near-Total (+6)</option>
        </select>
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label title="Visibility Table (SR2E p.89), NORMAL vision values. Low-light/thermographic vision reduces these — Full Darkness: LL +8, Thermo +4(cyber)/+2; Minimal: LL +4/+2, Thermo +4/+2; Partial: LL +1/0, Thermo +2/+1; Glare: LL/Thermo +4/+2; Mist: LL +2/0, Thermo 0; Light smoke: LL +4/+2, Thermo 0; Heavy smoke: LL +6/+4, Thermo +1/0; blind fire +8. Adjust for the shooter's vision.">Visibility:</label>
        <select id="sr2e-visibility" name="visibility">
          ${[[0, "Clear"], [2, "Partial Light / Glare / Mist (+2)"],
             [4, "Light Smoke/Fog/Rain (+4)"], [6, "Minimal Light / Heavy Smoke (+6)"],
             [8, "Full Darkness / Blind Fire (+8)"]].map(([v, l]) =>
            `<option value="${v}" ${presets.visMod === v ? "selected" : ""}>${l}${presets.visMod === v && v ? " — auto" : ""}</option>`
          ).join("")}
        </select>
      </div>
      ${(weapon.system.choke ?? 0) >= 2 ? `<div class="form-group" style="margin:2px 0;align-items:center;">
        <label title="Fire shot rounds in a spreading cone (SR2E p.95): a wider spread lowers your TN but reduces Power, and hits everyone in the cone.">Shot (spread):</label>
        <input type="checkbox" id="sr2e-shot-spread" name="shotSpread" style="width:auto;">
        <span style="margin-left:6px;font-size:11px;color:#9d8fc2;">choke ${weapon.system.choke}</span>
      </div>` : ""}
      <div class="form-group" id="sr2e-fa-rounds-row" style="margin:2px 0;display:none;">
        <label>FA Rounds (3–10):</label>
        <input type="number" id="sr2e-fa-rounds" name="rounds" value="3" min="3" max="10"
               style="width:52px;text-align:center;"
               title="Rounds in the full-auto burst: +1 Power and +1 recoil per round, +1 Damage Level per 3 rounds (SR2E p.93)">
      </div>
      <div class="form-group" style="margin:2px 0;align-items:center;">
        <label>Foes engaging you (+2 ea):</label>
        <input type="number" id="sr2e-in-melee" name="inMelee" value="0" min="0"
               style="width:52px;text-align:center;"
               title="Firing a ranged weapon while engaged in melee: +2 TN per opponent present (SR2E p.90)">
      </div>
      ${accBase.needsDeployment.length ? `<div class="form-group" style="margin:2px 0;align-items:center;">
        <label>${foundry.utils.escapeHTML(accBase.needsDeployment.join("/"))} deployed:</label>
        <input type="checkbox" id="sr2e-deployed" name="deployed" style="width:auto;"
               title="Recoil compensation from a bipod/tripod only counts when the mount is set up — fired from a braced sitting or lying position (SR2E p.240–241)">
      </div>` : ""}
    </div>` : `
    ${skillSelectHTML}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">
      ${killingHands ? `<div class="form-group" style="margin:2px 0;align-items:center;">
        <label title="Declare the strike as PHYSICAL damage at your Killing Hands level instead of (Str)M Stun (SR2E p.125-126)">Killing Hands (${killingHands} Physical):</label>
        <input type="checkbox" id="sr2e-killing-hands" name="killingHands" checked style="width:auto;">
      </div>` : ""}
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
        <label title="Attacker movement (SR2E p.90). A gyro mount reduces these.">Attacker:</label>
        <select id="sr2e-attacker" name="attacker">
          <option value="0">Stationary</option>
          <option value="1">Walking (+1)</option>
          <option value="2">Walking, difficult ground (+2)</option>
          <option value="4">Running (+4)</option>
          <option value="6">Running, difficult ground (+6)</option>
        </select>
      </div>
      <div class="form-group" style="margin:2px 0;">
        <label title="Target movement (SR2E p.90): an unmoving target is −1.">Target:</label>
        <select id="sr2e-target" name="target">
          <option value="-1">Stationary (−1)</option>
          <option value="0" selected>Walking</option>
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
      <td style="color:#aaa1c0;padding:1px 0;">Attacker moving:</td>
      <td id="sr2e-attacker-mod" style="text-align:right;padding:1px 0;">+0</td>
    </tr>
    <tr id="sr2e-target-row" style="display:none;">
      <td style="color:#aaa1c0;padding:1px 0;">Target movement:</td>
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
    ${laserMod !== 0 ? `
    <tr>
      <td style="color:#6c9;padding:1px 0;" title="−1 out to 50 m; does not combine with a smartlink (SR2E p.90)">Laser sight:</td>
      <td style="text-align:right;padding:1px 0;">${laserMod}</td>
    </tr>` : ""}
    ${accBase.tnMod !== 0 ? `
    <tr>
      <td style="color:#6c9;padding:1px 0;">Accessories:</td>
      <td style="text-align:right;padding:1px 0;">${accBase.tnMod > 0 ? "+" : ""}${accBase.tnMod}</td>
    </tr>` : ""}
    ${isRanged && accBase.gyroRating > 0 ? `
    <tr id="sr2e-gyro-row" style="display:none;">
      <td style="color:#6c9;padding:1px 0;" title="Gyro mount: reduces recoil and attacker movement modifiers by up to its rating (SR2E p.90)">Gyro mount (${accBase.gyroRating}):</td>
      <td id="sr2e-gyro-val" style="text-align:right;padding:1px 0;">−0</td>
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
            // Concentration/Specialization pick (SR2E p.70); "" = general
            skillVariant:    f.skillVariant?.value ?? "",
            // Effective bracket after any imaging-scope shift (SR2E p.88)
            range:           shiftRangeBracket(f.range?.value ?? "short", accBase.rangeShift),
            firingMode:      f.firingMode?.value    ?? "sa",
            rounds:          Math.min(10, Math.max(3, parseInt(f.rounds?.value) || 3)),
            coverMod:        parseInt(f.cover?.value)           || 0,
            visMod:          parseInt(f.visibility?.value)      || 0,
            attackerMod:     parseInt(f.attacker?.value)        || 0,
            targetMod:       parseInt(f.target?.value)          || 0,
            // Firing while engaged in melee: +2 per opponent (SR2E p.90)
            meleeMod:        2 * Math.max(0, parseInt(f.inMelee?.value) || 0),
            deployed:        !!f.deployed?.checked,
            distance:        presets.distance ?? null,
            otherMod:        parseInt(f.otherMod?.value)        || 0,
            reachMod:        parseInt(f.reachMod?.value)        || 0,
            friendsMod:      Math.min(4, Math.max(0, parseInt(f.foes?.value) || 0))
                           - Math.min(4, Math.max(0, parseInt(f.allies?.value) || 0)),
            positionMod:     (f.supPos?.checked ? -1 : 0) + (f.prone?.checked ? -2 : 0),
            multiMod:        2 * Math.max(0, parseInt(f.multiTargets?.value) || 0),
            killingHands:    f.killingHands?.checked ? killingHands : "",
            shotSpread:      !!f.shotSpread?.checked,
            choke:           weapon.system.choke ?? 0,
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
    heavy:      "gunnery",
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

  // Concentration/Specialization choices (SR2E p.70): offer them in the
  // dialog; a specialization whose name matches the weapon is preselected.
  const skillChoices = [];
  if (linkedSkill && (linkedSkill.system.rating ?? 0) > 0) {
    skillChoices.push({ key: "", label: `${linkedSkill.name} ${linkedSkill.system.rating}`,
                        rating: linkedSkill.system.rating, selected: true });
    for (const v of ["concentration", "specialization"]) {
      const sub = linkedSkill.system[v];
      if (sub?.name && sub.rating > 0) {
        const selected = v === "specialization" &&
          normalize(item.name).includes(normalize(sub.name));
        if (selected) skillChoices[0].selected = false;
        skillChoices.push({ key: v, label: `${sub.name} ${sub.rating}`, rating: sub.rating, selected });
      }
    }
  }

  // Fallback (mirrors _rollWeaponAttack): if no base skill matched, match a
  // concentration/specialization by the weapon's name so the pool cap reflects
  // the rating the roll will actually use.
  if (!skillChoices.length) {
    const wname = normalize(item.name);
    outer: for (const sk of actor.items) {
      if (sk.type !== "skill") continue;
      for (const v of ["specialization", "concentration"]) {
        const sub = sk.system[v];
        if (sub?.name && sub.rating > 0 &&
            (wname.includes(normalize(sub.name)) || normalize(sub.name).includes(wname))) {
          skillChoices.push({ key: "", label: `${sub.name} ${sub.rating}`, rating: sub.rating, selected: true });
          break outer;
        }
      }
    }
  }

  const rating = linkedSkill?.system?.rating ?? (skillChoices[0]?.rating ?? 0);
  if (rating > 0) {
    // Cap pools at the highest offered rating; the roll uses the chosen one.
    skillCap = Math.max(...skillChoices.map(c => c.rating));
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
  if (skillChoices.length > 1) presets.skillChoices = skillChoices;

  const opts = await promptWeaponAttackOptions(actor, item, skillCap, baseDice,
                                               defaultingPenalty, presets);
  if (!opts) return;
  return item.roll({
    skillVariant:    opts.skillVariant,
    visMod:          opts.visMod,
    killingHands:    opts.killingHands,
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
    shotSpread:      opts.shotSpread,
    choke:           opts.choke,
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

  // Force defaults to the spell's learned Force (set when the spell is added) —
  // the caster doesn't re-enter it every cast, just adjusts if they want to.
  const defaultForce = Math.max(1, Math.min(spell?.system?.force ?? 1, Math.max(1, magicAttr)));

  // Spell Success Test target number (SR2E p.130): for a living target it is the
  // target's Willpower (mana spell) or Body (physical spell). Auto-pull it from
  // the currently-targeted token for combat spells; otherwise fall back to 4.
  const isMana   = spell?.system?.type === "mana";
  const isCombat = spell?.system?.category === "combat";
  const tgtTok   = game.user?.targets?.first?.();
  const tgtActor = tgtTok?.actor;
  let suggestedTN = 4;
  let tnNote = "";
  if (isCombat && tgtActor) {
    const attrKey = isMana ? "willpower" : "body";
    suggestedTN = tgtActor.system?.[attrKey]?.value ?? 4;
    tnNote = `<span style="color:#6a8;">Target ${foundry.utils.escapeHTML(tgtTok.name)}: ${isMana ? "Willpower" : "Body"} ${suggestedTN}</span>`;
  } else if (isCombat) {
    tnNote = `<span style="color:#a86;">No target — TN is the victim's ${isMana ? "Willpower (mana)" : "Body (physical)"}.</span>`;
  }

  // Initial drain readout at the default Force
  const initDrainTN   = Math.max(2, Math.floor(defaultForce / 2) + drainMod);
  const initDrainType = defaultForce > magicAttr ? "Physical" : "Stun";
  const initTypeColor = defaultForce > magicAttr ? "#c44" : "#888";

  // Totem note for shaman feedback (SR2E p.119). Advisory: the totem's
  // per-category Magic Pool bonus/penalty is shown so the caster adjusts their
  // pool allocation by hand. Auto-applying it needs true bonus dice that bypass
  // the pool-value clamp in rollSuccessTest — tracked as a post-launch item.
  let totemNote = "";
  if (actor.system.magic?.tradition === "shamanic" && actor.system.magic?.totem) {
    const totemData = CONFIG.SR2E.totems[actor.system.magic.totem];
    const cat = spell?.system?.category;
    if (totemData && cat) {
      const bonus   = totemData.spellBonus?.[cat]   ?? 0;
      const penalty = totemData.spellPenalty?.[cat] ?? 0;
      if (bonus > 0)   totemNote += `<p style="margin:2px 0;font-size:10px;color:#6a6;">⬆ Totem bonus +${bonus} dice (${cat}) — add by hand</p>`;
      if (penalty > 0) totemNote += `<p style="margin:2px 0;font-size:10px;color:#a44;">⬇ Totem penalty −${penalty} dice (${cat}) — subtract by hand</p>`;
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
        <input type="number" name="force" id="sr2e-cast-force" value="${defaultForce}" min="1" max="${magicAttr}"
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
        <input type="number" name="tn" value="${suggestedTN}" min="2" max="30">
      </div>
      ${tnNote ? `<div style="margin:-2px 0 6px;font-size:10px;padding-left:4px;">${tnNote}</div>` : ""}
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
          const tn = parseInt(button.form.elements.tn.value) || suggestedTN;
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
 * Slot / un-slot a skillsoft (SR2E p.243). Slotting is gated by skillsoft
 * capacity: one slot per installed chipjack, and ActiveSofts additionally need
 * an installed Skillwires system. Un-slotting is always allowed.
 * @this {ApplicationV2}
 */
async function onToggleSlot(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const actor = this.document;
  const soft = actor.items.get(itemId);
  if (!soft) return;
  const slotting = !soft.system.slotted;
  if (slotting) {
    const cap = actor.system.skillsoft ?? {};
    const rating = Math.max(0, soft.system.rating || 0);
    if (soft.system.grantedSkillCategory === "active") {
      const wires = cap.skillwiresRating ?? 0;
      if (wires <= 0) {
        ui.notifications.warn("ActiveSofts require an installed Skillwires system.");
        return;
      }
      if ((cap.activeUsed ?? 0) + rating > wires) {
        ui.notifications.warn(`Exceeds Skillwire Rating budget: ${(cap.activeUsed ?? 0) + rating} of ${wires} total ActiveSoft rating in use.`);
        return;
      }
    } else if (!cap.knowAccess) {
      ui.notifications.warn("Know/LinguaSofts need an access port — install a chipjack, datajack, or headware memory.");
      return;
    }
  }
  return soft.update({ "system.slotted": slotting });
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

  // The innate Unarmed Strike is part of every character (SR2E p.100–101) and
  // must not be removed — the sheet hides its delete control, this guards
  // other paths.
  if (item.name === "Unarmed Strike") {
    return ui.notifications.info("Unarmed Strike is innate and can't be deleted.");
  }

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
 * Sell an item back: refund what was paid for it (flags.sr2e.paid, recorded by
 * the auto-charge on drop) — or the current street price when it was never
 * auto-purchased — then delete the item.
 * @this {ApplicationV2}
 */
/**
 * Use / show an adept power. Passive powers (attribute/dice bonuses) apply
 * automatically through derived data; clicking posts the power's rules to chat
 * so the player knows what it does and how to invoke it (e.g. Killing Hands is
 * a checkbox on the unarmed-attack dialog).
 * @this {ApplicationV2}
 */
async function onUsePower(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const power = this.document.items.get(itemId);
  if (!power) return;
  const s = power.system;
  const invoke = /killing hands/i.test(power.name)
    ? `<br><em>Invoke via the "Killing Hands" checkbox on an Unarmed Strike attack.</em>`
    : `<br><em>Passive — its bonus is already applied to the character's stats.</em>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.document }),
    content: `<div class="sr2e-power-card">
      <strong>✋ ${foundry.utils.escapeHTML(power.name)}</strong> (Level ${s.level}, ${s.totalCost} PP)
      ${s.description || ""}${invoke}
    </div>`
  });
}

async function onSellItem(event, target) {
  event.preventDefault();
  const actor = this.document;
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = actor.items.get(itemId);
  if (!item) return;

  // The innate Unarmed Strike isn't property — it can't be sold.
  if (item.name === "Unarmed Strike") {
    return ui.notifications.info("Unarmed Strike is innate and can't be sold.");
  }

  const paid = item.getFlag("sr2e", "paid");
  const price = paid ?? streetPrice(Number(item.system.cost) || 0, item.system.streetIndex);
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: `Sell ${item.name}?` },
    content: `<p>Sell <strong>${foundry.utils.escapeHTML(item.name)}</strong> for <strong>${price}¥</strong>${paid != null ? " (refund of the price paid)" : " (street price)"}? The item will be removed.</p>`
  });
  if (!confirmed) return;

  await actor.update({ "system.nuyen": (actor.system.nuyen ?? 0) + price });
  await item.delete();
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong> sells <strong>${foundry.utils.escapeHTML(item.name)}</strong> for <strong>${price}¥</strong>.`
  });
}

/**
 * Spend a single-use focus (Grimoire fetish focus): post a chat note and remove
 * the item. Re-add/buy another to use it again.
 * @this {ApplicationV2}
 */
async function onSpendFocus(event, target) {
  event.preventDefault();
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = this.document.items.get(itemId);
  if (!item) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.document }),
    content: `<div class="sr2e-focus-spent"><strong>${this.document.name}</strong> spends a single-use focus: <em>${item.name}</em> (Force ${item.system.force ?? 1}).</div>`
  });
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
  // Let an "Add Enemy" button seed contactType=enemy so it lands in the Enemies list.
  const contactType = target.dataset.contactType;
  if (contactType) itemData.system = { ...(itemData.system ?? {}), contactType };
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
  defaultSkill: onDefaultSkill,
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
  toggleSlot: onToggleSlot,
  editItem: onEditItem,
  deleteItem: onDeleteItem,
  sellItem: onSellItem,
  usePower: onUsePower,
  spendFocus: onSpendFocus,
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
   * Quicken a sustained spell — an initiate pays Karma (= the spell's Force) to
   * make it permanent with no sustaining penalty (Grimoire p.44).
   * @this {ApplicationV2}
   */
  quickenSpell: async function(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || item.type !== "spell") return;
    return item.quickenSpell();
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

export {
  SHARED_ACTIONS, detectAttackTarget, promptWeaponAttackOptions,
  // Individual handlers the per-subclass action maps in actor-sheet.mjs reference
  // directly (NPC / vehicle / spirit / IC / host sheets).
  onAddItem, onDeleteItem, onEditItem,
  onRollAttribute, onRollSkill, onRollInitiative, onRollWeapon,
  onMatrixAttack, onMatrixPerception, onResetHostTally
};
