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
 * `reloaded` is a per-tab guard so a failed write can never loop the page. The
 * caller scopes it to the direction it was set for (entering or leaving), so a
 * tab that switches the other way later still gets its reload.
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
  if (reloaded) return { reload: false };   // keep it until a restore actually succeeds
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

/* ── Stage 3: shared targets ────────────────────────────────────────────────── */

/**
 * The target picker's list: the tokens on the character's scene that a player may
 * aim at, combatants first, then nearest. Pure: the caller supplies plain rows.
 * Excludes the character's own token, GM-hidden tokens, and astral-only tokens
 * unless the character is astrally active (the same rule as astralAllowsView).
 * @param {{id, name, hidden?, astralOnly?, inCombat?, distance?, own?}[]} rows
 * @param {{astralActive?: boolean}} viewer
 */
export function targetChoices(rows = [], { astralActive = false } = {}) {
  return rows
    .filter(r => !r.own && !r.hidden && (!r.astralOnly || astralActive))
    .sort((a, b) => (Number(!!b.inCombat) - Number(!!a.inCombat))
      || ((a.distance ?? Infinity) - (b.distance ?? Infinity))
      || String(a.name).localeCompare(String(b.name)));
}

/* ── Joining from a phone while the computer is logged in (docs/PLAN-companion-join.md) ── */

/** The join page's path inside the system; the desktop's link and the page agree on it. */
export const JOIN_PAGE = "systems/sr2e/companion-join.html";

/**
 * The address with `companion=` removed, so the choice applies once: leaving the
 * companion reloads the cleaned address instead of re-applying `?companion=1`.
 * Returns null when there is nothing to remove.
 */
export function stripCompanionParam(href) {
  const url = new URL(href);
  if (!url.searchParams.has("companion")) return null;
  url.searchParams.delete("companion");
  return url.pathname + url.search + url.hash;
}

/** The server's route prefix, from the join page's own pathname ("" for none). */
export function pagePrefix(pathname = "") {
  const suffix = "/" + JOIN_PAGE;
  return pathname.endsWith(suffix) ? pathname.slice(0, -suffix.length) : null;
}

/**
 * `#u=<userId>&n=<name>` → {userId, name}, or null when the id isn't a Foundry id.
 * The name is untrusted text: callers must only ever show it with textContent.
 */
export function parseJoinFragment(hash = "") {
  const p = new URLSearchParams(String(hash).replace(/^#/, ""));
  const userId = p.get("u") ?? "";
  if (!/^[A-Za-z0-9]{16}$/.test(userId)) return null;
  return { userId, name: (p.get("n") ?? "").slice(0, 100) };
}

/**
 * The address a phone should open, typed or prefilled on the computer.
 * Only an http(s) origin: no credentials, path, query or fragment.
 * @returns {{origin: string, warning?: string} | {error: string}}
 */
export function normalizeAddress(input = "") {
  let url;
  try { url = new URL(String(input).trim()); } catch (e) { return { error: "That isn't a web address." }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "Use an http:// or https:// address." };
  if (url.username || url.password) return { error: "Leave the username and password out of the address." };
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    return { error: "Just the server address, e.g. http://192.168.1.20:30000, with nothing after it." };
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || host === "[::1]" || host === "::1";
  const warning = loopback ? "Your phone can't reach this address. Enter the one it can, e.g. http://192.168.1.20:30000."
    : host.endsWith(".local") ? "Your phone may need a different address." : undefined;
  return warning ? { origin: url.origin, warning } : { origin: url.origin };
}

/** The link for the QR code. `route` is getRoute(JOIN_PAGE), so it carries any route prefix. */
export function joinLink({ origin, route, userId, name }) {
  const path = route.startsWith("/") ? route : "/" + route;
  return `${origin}${path}#${new URLSearchParams({ u: userId, n: name })}`;
}

const JOIN_ERRORS = {
  "JOIN.ErrorInvalidPassword": "Wrong password.",
  "JOIN.ErrorBanned": "This user isn't allowed into the world. Ask your GM.",
  "JOIN.ErrorUserDoesNotExist": "That user doesn't exist any more. Ask your GM for a new link."
};

/**
 * What a join response means. Success needs a 200 JSON `status: "success"`; a 401
 * carries one of Foundry's error keys as text; anything else (no world running, a
 * proxy page, a timeout: status 0) is "couldn't reach the game".
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function joinResult({ status = 0, contentType = "", body = "" }) {
  if (status === 200 && /json/i.test(contentType)) {
    try { if (JSON.parse(body)?.status === "success") return { ok: true }; } catch (e) { /* malformed */ }
  }
  if (status === 401 && JOIN_ERRORS[String(body).trim()]) return { ok: false, message: JOIN_ERRORS[String(body).trim()] };
  return { ok: false, message: `Couldn't reach the game. Is it running?${status ? ` (HTTP ${status})` : ""}` };
}
