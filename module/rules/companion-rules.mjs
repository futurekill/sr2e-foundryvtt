/**
 * Mobile companion mode — the pure decisions (docs/PLAN-companion.md). No Foundry
 * and no DOM here: module/companion/boot.mjs feeds these the device's facts.
 */

/** Foundry's own minimum usable window (client/helpers/client-issues.mjs). */
export const MIN_VIEWPORT = { width: 1024, height: 768 };

/**
 * Should this device run the companion screen instead of the desktop interface?
 * The device's stored choice wins. Otherwise: only a TOUCH device whose viewport is
 * below Foundry's minimum — a desktop window dragged narrow stays desktop.
 * @param {{override?: "on"|"off"|null, width: number, height: number, coarse: boolean}} p
 */
export function companionMode({ override = null, width, height, coarse }) {
  if (override === "on") return true;
  if (override === "off") return false;
  const small = width < MIN_VIEWPORT.width || height < MIN_VIEWPORT.height;
  return !!coarse && small;
}

/**
 * The override a URL asks for: `?companion=1|on` → "on", `0|off` → "off",
 * `auto` → "auto" (forget the stored choice), anything else → undefined (no change).
 */
export function overrideFromQuery(search = "") {
  const m = /[?&]companion=([^&#]*)/i.exec(search);
  if (!m) return undefined;
  const v = decodeURIComponent(m[1]).toLowerCase();
  if (v === "1" || v === "on" || v === "true") return "on";
  if (v === "0" || v === "off" || v === "false") return "off";
  if (v === "auto") return "auto";
  return undefined;
}

/**
 * What to do about the device's `core.noCanvas` setting.
 * Entering companion mode with the canvas on: remember the old value, turn it off.
 * Running the desktop with a value WE changed still in place: put it back.
 * `reloaded` is a per-tab guard so a failed write can never loop the page.
 * @returns {{set?: boolean, remember?: boolean, forget?: boolean, reload: boolean}}
 */
export function canvasPlan({ companion, noCanvas, remembered, reloaded }) {
  if (companion) {
    if (noCanvas) return { reload: false };
    if (reloaded) return { reload: false };              // tried once already: carry on with the canvas
    return { set: true, remember: true, reload: true };
  }
  if (remembered === null || remembered === undefined) return { reload: false };
  if (noCanvas === remembered) return { forget: true, reload: false };
  if (reloaded) return { forget: true, reload: false };
  return { set: remembered, forget: true, reload: true };
}

/**
 * Which actor the companion shows: the stored pick if still owned, else the user's
 * assigned character, else the only owned character; null means "ask".
 * @param {{storedId?: string|null, assignedId?: string|null, ownedIds: string[]}} p
 */
export function companionActor({ storedId = null, assignedId = null, ownedIds = [] }) {
  if (storedId && ownedIds.includes(storedId)) return storedId;
  if (assignedId && ownedIds.includes(assignedId)) return assignedId;
  return ownedIds.length === 1 ? ownedIds[0] : null;
}
