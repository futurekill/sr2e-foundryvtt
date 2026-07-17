/**
 * Shared "Misc Dice" roll-dialog field — a SIGNED situational dice modifier plus
 * an optional note. SR2 has many one-off dice bonuses/penalties not worth a
 * dedicated field (Tailored Pheromones vs a metahuman, Aptitude, a friend
 * helping, a GM ruling); this single field covers them and the note explains it
 * on the chat card.
 *
 * Dependency-neutral so BOTH the sheet dialogs and the document methods (which
 * build their own inline dialogs) can import it — one definition, no drift.
 */

/** Bound the misc modifier: no infinities, no client-freezing dice counts. */
export const MISC_DICE_MAX = 100;
/** Cap the free-text note so an oversized string can't bloat the chat flag. */
export const MISC_LABEL_MAX = 200;

/**
 * Sanitise a misc-dice value from any source (form input or programmatic).
 * Non-finite → 0; truncated to an integer; clamped to ±MISC_DICE_MAX. HTML
 * `max`/`min` is not a trust boundary, so this is enforced centrally too.
 * @param {*} v
 * @returns {number}
 */
export function clampMiscDice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MISC_DICE_MAX, Math.min(MISC_DICE_MAX, Math.trunc(n)));
}

/** Trim + cap the note text. */
export function clampMiscLabel(v) {
  return (v ?? "").toString().trim().slice(0, MISC_LABEL_MAX);
}

/**
 * Dialog HTML for the misc-dice field. Inputs are named `misc_dice` / `misc_label`
 * so readMiscDice can parse any form that includes this block.
 * @returns {string}
 */
export function miscDiceHTML() {
  const i18n = game.i18n;
  return `
    <hr style="margin:8px 0 6px;">
    <div class="form-group" style="margin:3px 0;align-items:flex-start;gap:6px;">
      <label style="font-size:12px;flex:1;padding-top:3px;">${i18n.localize("SR2E.Dialog.MiscDice")}
        <span style="color:#aaa1c0;font-size:10px;">${i18n.localize("SR2E.Dialog.MiscDiceHint")}</span>
      </label>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <input type="number" name="misc_dice" value="0" step="1" min="-${MISC_DICE_MAX}" max="${MISC_DICE_MAX}"
               style="width:52px;text-align:center;"
               title="${i18n.localize("SR2E.Dialog.MiscDiceTitle")}">
        <input type="text" name="misc_label" maxlength="${MISC_LABEL_MAX}"
               placeholder="${i18n.localize("SR2E.Dialog.MiscDiceNote")}"
               style="width:150px;font-size:11px;">
      </div>
    </div>`;
}

/**
 * Read the misc-dice field from a dialog form.
 * @param {HTMLFormElement} form
 * @returns {{miscDice:number, miscLabel:string}}
 */
export function readMiscDice(form) {
  return {
    miscDice:  clampMiscDice(form?.elements?.misc_dice?.value),
    miscLabel: clampMiscLabel(form?.elements?.misc_label?.value)
  };
}
