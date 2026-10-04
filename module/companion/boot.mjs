/**
 * Mobile companion mode — the shell (docs/PLAN-companion.md, Stage 1).
 *
 * A phone or tablet that logs into the normal Foundry address gets a touch-first
 * character screen instead of the desktop interface, while the player's computer
 * keeps the map. This file decides whether THIS device is a companion, turns the
 * map canvas off on it (core.noCanvas, a per-device setting), hides the desktop
 * interface, and opens the companion screen for the player's character.
 *
 * The choice is per device, in localStorage (readable before settings exist):
 *   sr2e.companion            "on" | "off" (absent = automatic)
 *   sr2e.companion.noCanvas   the device's noCanvas value before we changed it
 *   sr2e.companion.actor      the character picked on this device
 * `?companion=1|0|auto` in the address sets the first, and is then removed from it.
 */

import { companionMode, overrideFromQuery, canvasPlan, companionActor, stripCompanionParam } from "../rules/companion-rules.mjs";

const KEY = "sr2e.companion", KEY_CANVAS = "sr2e.companion.noCanvas", KEY_ACTOR = "sr2e.companion.actor";
const RELOADED = "sr2e.companion.reloaded";   // sessionStorage: "on"/"off", one reload per tab per direction

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
};
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }
};

function decide() {
  const q = overrideFromQuery(globalThis.location?.search ?? "");
  if (q === "auto") store.set(KEY, null);
  else if (q) store.set(KEY, q);
  // Apply it once: otherwise leaving the companion reloads ?companion=1 and is
  // switched straight back on.
  try {
    const clean = stripCompanionParam(globalThis.location.href);
    if (clean !== null) globalThis.history.replaceState(globalThis.history.state, "", clean);
  } catch (e) { /* no history API */ }
  const override = store.get(KEY);
  return companionMode({
    override: override === "on" || override === "off" ? override : null,
    width: globalThis.innerWidth ?? 9999, height: globalThis.innerHeight ?? 9999,
    coarse: !!globalThis.matchMedia?.("(pointer: coarse)").matches
  });
}

/** Is this device running the companion screen? Decided once per page load. */
export const isCompanion = typeof window === "undefined" ? false : decide();

/** Switch this device between the companion and full Foundry, then reload. */
export function setCompanion(on) {
  store.set(KEY, on ? "on" : "off");
  try { sessionStorage.removeItem(RELOADED); } catch (e) { /* */ }
  globalThis.location.reload();
}

/** The actor this device's companion shows (null = none owned), asking if unclear. */
export async function chooseActor({ ask = false } = {}) {
  const owned = game.actors.filter(a => a.type === "character" && a.isOwner);
  let id = ask ? null : companionActor({ storedId: store.get(KEY_ACTOR), assignedId: game.user.character?.id ?? null,
    ownedIds: owned.map(a => a.id) });
  if (!id && owned.length > 1) {
    const opts = owned.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
    id = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Which character?" },
      content: `<div class="form-group"><select name="actor">${opts}</select></div>`,
      ok: { label: "Open", callback: (ev, btn) => btn.form.elements.actor.value }, rejectClose: false
    }) ?? owned[0].id;
  }
  if (!id && owned.length === 1) id = owned[0].id;
  if (id) store.set(KEY_ACTOR, id);
  return id ? game.actors.get(id) : null;
}

/** Remove Foundry's "requires 1024×768" banner (and keep removing it: it re-posts on resize). */
function hideResolutionBanner() {
  const starts = ["Window", "Screen", "Scale"].map(k => game.i18n.localize(`ERROR.RESOLUTION.${k}`).split("{")[0].trim()).filter(Boolean);
  const sweep = () => {
    for (const el of document.querySelectorAll("#notifications .notification")) {
      if (starts.some(s => el.textContent.includes(s))) el.remove();
    }
  };
  sweep();
  const host = document.getElementById("notifications");
  if (host) new MutationObserver(sweep).observe(host, { childList: true });
}

export function registerCompanion() {
  if (isCompanion) document.body.classList.add("sr2e-companion");

  // Settings exist from "setup" on, and the canvas only starts after it: the right
  // moment to switch the map off (or back on) for this device.
  Hooks.once("setup", async () => {
    const rememberedRaw = store.get(KEY_CANVAS);
    const plan = canvasPlan({
      companion: isCompanion, noCanvas: !!game.settings.get("core", "noCanvas"),
      remembered: rememberedRaw === null ? null : rememberedRaw === "true",
      reloaded: session.get(RELOADED) === (isCompanion ? "on" : "off")
    });
    if (plan.remember) store.set(KEY_CANVAS, String(!!game.settings.get("core", "noCanvas")));
    if (plan.forget) store.set(KEY_CANVAS, null);
    if (plan.set !== undefined) await game.settings.set("core", "noCanvas", plan.set);
    if (plan.reload) { session.set(RELOADED, isCompanion ? "on" : "off"); globalThis.location.reload(); }
  });

  if (!isCompanion) return;
  Hooks.once("ready", async () => {
    hideResolutionBanner();
    const { SR2ECompanionApp } = await import("./app.mjs");
    // The screen first, then the question: a picker must never be the only thing on a blank page.
    game.sr2e ??= {};
    const app = game.sr2e.companion = new SR2ECompanionApp({ actor: null });
    await app.render(true);
    app.actor = await chooseActor();
    app.render();
  });
}
