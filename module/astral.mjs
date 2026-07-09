/**
 * Astral visibility (SR2E p.145, p.148). A token flagged `flags.sr2e.astralOnly`
 * exists only on the astral plane — an unmanifested spirit, a projecting mage's
 * astral form, a quickened spell, an active focus. Per the book it is "invisible
 * to normal sight; a magician can see it only if astrally perceiving." So such a
 * token is hidden from a client unless the viewer is the GM, owns the token, or
 * has an astrally-active character (astralState perceiving/projecting).
 *
 * Implemented as a Token#isVisible override + a GM toggle in the token HUD + a
 * refresh when astral state (or the flag) changes. The decision itself is the
 * pure, unit-tested astralAllowsView() in the rules module. No canvas deps load
 * outside Foundry (everything is behind hooks).
 */

import { astralAllowsView } from "./rules/sr2e-rules.mjs";

/** Whether an actor is astrally active (perceiving or projecting). */
function isAstralActive(actor) {
  const s = actor?.system?.astralState;
  return s === "perceiving" || s === "projecting";
}

/**
 * Whether the current user counts as an astral viewer: their assigned character
 * or any token they currently control is astrally perceiving/projecting.
 */
function viewerAstralActive() {
  if (isAstralActive(game.user?.character)) return true;
  for (const t of canvas?.tokens?.controlled ?? []) if (isAstralActive(t.actor)) return true;
  return false;
}

/** Force every placed token to re-evaluate its visibility on this client. */
function refreshTokenVisibility() {
  if (!canvas?.ready) return;
  for (const t of canvas.tokens.placeables) t.renderFlags?.set({ refreshVisibility: true });
}

globalThis.Hooks?.once("init", () => {
  game.settings.register("sr2e", "spiritsAstralByDefault", {
    name: "Spirits start astral-only",
    hint: "New spirit tokens are flagged astral-only on placement (a summoned spirit is on the astral plane until it manifests, SR2E p.145). Toggle the token's astral button when it manifests.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Subclass whatever Token placeable is currently registered and layer the
  // astral rule on top of normal visibility.
  const BaseToken = CONFIG.Token.objectClass;
  CONFIG.Token.objectClass = class SR2EToken extends BaseToken {
    /** @override */
    get isVisible() {
      const astralOnly = this.document?.getFlag?.("sr2e", "astralOnly");
      if (astralOnly && !astralAllowsView({
        astralOnly: true,
        isGM: game.user.isGM,
        ownsToken: !!this.actor?.isOwner,
        viewerAstralActive: viewerAstralActive()
      })) return false;
      return super.isVisible;
    }
  };
});

// Astral state changing (a mage starts/stops perceiving) flips which astral-only
// tokens this client can see — re-evaluate.
globalThis.Hooks?.on("updateActor", (actor, changes) => {
  if (foundry.utils.getProperty(changes, "system.astralState") !== undefined) refreshTokenVisibility();
});
globalThis.Hooks?.on("controlToken", () => refreshTokenVisibility());
globalThis.Hooks?.on("updateToken", (doc, changes) => {
  if (foundry.utils.getProperty(changes, "flags.sr2e.astralOnly") !== undefined) refreshTokenVisibility();
});

// GM toggle: an "astral-only" button on the Token HUD.
globalThis.Hooks?.on("renderTokenHUD", (hud, html) => {
  if (!game.user.isGM) return;
  const token = hud.object?.document;
  if (!token) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const col = root?.querySelector(".col.left");
  if (!col) return;

  const active = !!token.getFlag("sr2e", "astralOnly");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon" + (active ? " active" : "");
  btn.dataset.action = "sr2eAstralOnly";
  btn.title = "Astral-only — visible only to the GM, the token's owner, and astrally perceiving/projecting characters (SR2E p.145).";
  btn.innerHTML = `<i class="fas fa-eye-low-vision"></i>`;
  btn.addEventListener("click", async () => {
    await token.setFlag("sr2e", "astralOnly", !token.getFlag("sr2e", "astralOnly"));
    btn.classList.toggle("active");
    refreshTokenVisibility();
  });
  col.appendChild(btn);
});

// Visual cue: an astral-only token renders ethereal (astral-purple, translucent)
// for whoever can see it — so astral viewers know it's astral and the GM can
// spot flagged tokens at a glance. Re-applied each refresh (Foundry resets the
// mesh from the document first, so this is stable, not cumulative).
globalThis.Hooks?.on("refreshToken", (token) => {
  if (!token.mesh || !token.document?.getFlag?.("sr2e", "astralOnly")) return;
  token.mesh.tint = 0xB68CFF;
  token.mesh.alpha = Math.min(token.mesh.alpha ?? 1, 0.78);
});

// A summoned spirit is on the astral plane until it manifests (SR2E p.145), so
// default new spirit tokens to astral-only (world setting, on by default). The
// GM clears the token's astral button when the spirit manifests.
globalThis.Hooks?.on("preCreateToken", (tokenDoc, data) => {
  if (tokenDoc.actor?.type !== "spirit") return;
  if (foundry.utils.getProperty(data, "flags.sr2e.astralOnly") !== undefined) return;
  let on = true;
  try { on = game.settings.get("sr2e", "spiritsAstralByDefault"); } catch (e) { /* default */ }
  if (on) tokenDoc.updateSource({ "flags.sr2e.astralOnly": true });
});
