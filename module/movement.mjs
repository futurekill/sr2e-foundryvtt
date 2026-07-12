/**
 * In-combat movement limit (SR2E p.83). While a combat is running and the
 * "Limit movement in combat" setting is on, a token's drag is measured against
 * its actor's movement rates (walk = Quickness, run = Quickness × the metatype
 * Running Modifier, metres per Combat Phase):
 *
 *   • the drag ruler is coloured GREEN within walking distance, YELLOW once into
 *     running distance, RED past the running maximum;
 *   • crossing into running posts a reminder (+4 target modifier that phase);
 *   • a drop beyond the running maximum is refused (the token snaps back).
 *
 * GMs move freely; off by default (world setting `movementLimit`). Distance is
 * measured from the token's position at the start of its Combat Phase (stamped
 * in flag `moveOrigin` when its turn begins), so it accounts for movement
 * already spent this phase. Canvas-layer — verified live in Foundry; the pure
 * rates are unit-tested (test/movement.test.mjs).
 */

import { movementRates, runMultiplierForRace } from "./rules/sr2e-rules.mjs";

const SETTING = "movementLimit";
const EPS = 1e-6;
// green (walk) → amber (run) → red (over max)
const BAND_COLOR = [0x2f9e44, 0xe8a91e, 0xe03131];

/** SR2 movement rates (m/Combat Phase) for a token's actor, or null. */
function tokenRates(tokenDoc) {
  const actor = tokenDoc?.actor;
  const q = Number(actor?.system?.quickness?.value) || 0;
  if (q <= 0) return null;
  return movementRates(q, runMultiplierForRace(actor.system?.race));
}

/** 0 = within walk, 1 = running, 2 = over the running max. */
function band(distance, rates) {
  if (distance <= rates.walk + EPS) return 0;
  if (distance <= rates.run + EPS) return 1;
  return 2;
}

/** Is the limit active for this token right now? */
function limitActive(tokenDoc) {
  return game.settings.get("sr2e", SETTING)
    && !!game.combat?.started
    && tokenRates(tokenDoc) !== null;
}

/** Whether to hide Foundry's combat movement-history ruler (separate setting). */
function hideHistory() {
  return game.settings.get("sr2e", "hideCombatMovementHistory");
}

/** Grid distance (scene units = metres) between two pixel points. */
function gridDistance(a, b) {
  return canvas.grid.measurePath([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]).distance;
}

/** Cumulative metres to a ruler waypoint from the drag origin. */
function waypointDistance(waypoint) {
  return waypoint?.measurement?.backward?.distance ?? waypoint?.measurement?.cost ?? 0;
}

/** Install the coloured TokenRuler. Called at init (rulerClass must be set
 *  before the canvas draws). */
export function registerMovementLimit() {
  const Base = CONFIG.Token.rulerClass;

  class SR2ETokenRuler extends Base {
    /** Band colour for a waypoint, or null to keep the default styling. */
    #bandColor(waypoint) {
      // Only colour the LIVE drag. Foundry draws the combat movement HISTORY as
      // "passed" waypoints (shown on hover); recolouring those made the bands
      // look permanently stuck. Unknown/missing stages keep core styling.
      if (!["pending", "planned"].includes(waypoint?.stage)) return null;
      const doc = this.token?.document;
      if (!limitActive(doc)) return null;
      const rates = tokenRates(doc);
      // Add movement already spent this phase (origin → current position).
      const origin = doc.getFlag("sr2e", "moveOrigin");
      const prior = origin ? gridDistance(origin, doc) : 0;
      return BAND_COLOR[band(prior + waypointDistance(waypoint), rates)];
    }

    /** Hide the "passed" combat movement history when the setting is on. */
    #isHiddenHistory(waypoint) {
      return hideHistory() && waypoint?.stage === "passed";
    }

    _getSegmentStyle(waypoint) {
      const style = super._getSegmentStyle(waypoint);
      if (this.#isHiddenHistory(waypoint)) { style.width = 0; style.alpha = 0; return style; }
      const c = this.#bandColor(waypoint);
      if (c !== null) style.color = c;
      return style;
    }

    _getWaypointStyle(waypoint) {
      const style = super._getWaypointStyle(waypoint);
      if (this.#isHiddenHistory(waypoint)) { style.radius = 0; style.alpha = 0; return style; }
      const c = this.#bandColor(waypoint);
      if (c !== null) style.color = c;
      return style;
    }

    _getGridHighlightStyle(waypoint, offset) {
      const style = super._getGridHighlightStyle(waypoint, offset);
      if (this.#isHiddenHistory(waypoint)) style.alpha = 0;
      return style;
    }

    _getWaypointLabelContext(waypoint, state) {
      // Let super thread its label state, then drop the label for hidden history.
      const context = super._getWaypointLabelContext(waypoint, state);
      return this.#isHiddenHistory(waypoint) ? null : context;
    }
  }

  CONFIG.Token.rulerClass = SR2ETokenRuler;
}

// Stamp the phase-start position on the active combatant's token so distance is
// measured from where they began the phase. GM writes the flag; everyone reads.
async function stampOrigin(combat) {
  if (!game.user.isGM) return;
  const tok = combat?.combatant?.token;
  if (tok) await tok.setFlag("sr2e", "moveOrigin", { x: tok.x, y: tok.y });
}
Hooks.on("combatStart", stampOrigin);
Hooks.on("updateCombat", (combat, changes) => {
  if ("turn" in changes || "round" in changes) stampOrigin(combat);
});

// Enforce the cap on the moving user's client: block a drop past the running
// maximum, warn when it crosses into running distance.
Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
  if (game.user.id !== userId) return;                       // the mover evaluates
  if (changes.x === undefined && changes.y === undefined) return;
  if (!limitActive(tokenDoc)) return;
  // The GM may reposition NON-player tokens freely (NPCs, setup), but a
  // player-owned token (a PC, or their drone/spirit) stays capped even when the
  // GM drags it — otherwise the limit does nothing when the GM moves a PC.
  if (game.user.isGM && !tokenDoc.actor?.hasPlayerOwner) return;

  const rates  = tokenRates(tokenDoc);
  const origin = tokenDoc.getFlag("sr2e", "moveOrigin") ?? { x: tokenDoc.x, y: tokenDoc.y };
  const dest   = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
  const dist   = gridDistance(origin, dest);

  if (dist > rates.run + EPS) {
    ui.notifications.warn(
      `${tokenDoc.name}: ${Math.round(dist)} m exceeds the running maximum of ${rates.run} m this phase — blocked (SR2 p.83).`);
    return false;
  }
  if (dist > rates.walk + EPS) {
    ui.notifications.info(
      `${tokenDoc.name} is running (${Math.round(dist)} m): +4 target modifier to tests this phase (SR2 p.83).`);
  }
});
