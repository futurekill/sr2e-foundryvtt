/**
 * In-combat movement limit (SR2E p.84). While a combat is running and the
 * "Limit movement in combat" setting is on, the ACTIVE combatant's token is held
 * to its actor's movement rates (walk = Quickness, run = Quickness × the metatype
 * Running Modifier, metres per Combat Phase):
 *
 *   • the drag ruler is coloured GREEN within walking distance, AMBER once into
 *     running distance, RED past the running maximum;
 *   • crossing into running posts an advisory reminder (+4 target modifier that
 *     phase — the GM/attacker applies it, this does not auto-apply);
 *   • a drop past the running maximum is refused (the token snaps back).
 *
 * Distance is CUMULATIVE per phase — tracked in a round-qualified `moveLedger`
 * flag that accumulates each accepted move, so an out-and-back that nets zero
 * still counts, and repeated short drags can't bypass the cap. Running is allowed
 * in only one Combat Phase per Combat Turn (p.84): once a character runs, later
 * phases that round are walk-capped.
 *
 * Scope: ONLY the current combat's active combatant is capped — bystanders,
 * out-of-turn/GM repositioning, and tokens on other scenes move freely. A
 * programmatic mover can bypass with `options.sr2eBypassMovement`.
 *
 * Off by default (world setting `movementLimit`). Canvas-layer — the pure phase
 * math lives in module/rules/sr2e-rules.mjs and is unit-tested.
 */

import { movementRates, runMultiplierForRace, movementPhase, movementColorBand }
  from "./rules/sr2e-rules.mjs";

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

/** The current combat + phase identity, or null when no combat is running. */
function currentPhase() {
  const combat = game.combat;
  if (!combat?.started) return null;
  // turn may be null between phases; keep it honest so the ledger identity can't
  // collide a null turn with real turn index 0.
  return { combatId: combat.id, round: combat.round ?? 0, turn: combat.turn ?? null, combat };
}

/**
 * Is this token the active combatant of the running combat (the only token the
 * limit applies to)? The active combatant's token is by definition on the
 * combat's scene, so this also scopes out other-scene bystanders.
 */
function isCapped(tokenDoc) {
  if (!game.settings.get("sr2e", SETTING)) return false;
  const phase = currentPhase();
  if (!phase) return false;
  const active = phase.combat.combatant?.token;
  // Compare UUIDs, not ids — token ids are scene-local, so a token on another
  // scene sharing the active combatant's id must not be treated as active.
  if (!active || active.uuid !== tokenDoc.uuid) return false;
  return tokenRates(tokenDoc) !== null;
}

/**
 * Read the phase ledger for this token, resetting per the round/turn identity:
 *   - different combat or round  → fresh phase, nothing run yet;
 *   - same round, different turn  → new phase: spent resets, but a run earlier
 *     this Combat Turn caps this phase at a walk (p.84);
 *   - same phase                  → carry spent + cap as-is.
 * @returns {{spent:number, capIsWalk:boolean, ranThisRound:boolean}}
 */
function readLedger(tokenDoc, phase) {
  const l = tokenDoc.getFlag("sr2e", "moveLedger");
  if (!l || l.combatId !== phase.combatId || l.round !== phase.round) {
    return { spent: 0, capIsWalk: false, ranThisRound: false };
  }
  if (l.turn !== phase.turn) {
    return { spent: 0, capIsWalk: !!l.ranThisRound, ranThisRound: !!l.ranThisRound };
  }
  return { spent: l.spent ?? 0, capIsWalk: !!l.capIsWalk, ranThisRound: !!l.ranThisRound };
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
      if (!isCapped(doc)) return null;
      const rates = tokenRates(doc);
      const led = readLedger(doc, currentPhase());
      // Add movement already spent this phase (cumulative ledger) to this leg.
      const total = led.spent + waypointDistance(waypoint);
      return BAND_COLOR[movementColorBand(total, rates, led.capIsWalk)];
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

// Enforce the cap on the moving user's client. Only the active combatant's token
// is capped; each accepted move accumulates into a round-qualified ledger that
// is written back into THIS SAME update (no separate write, no stamp race).
Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
  if (game.user.id !== userId) return;                       // the mover evaluates
  if (changes.x === undefined && changes.y === undefined) return;
  if (options?.sr2eBypassMovement) return;                   // programmatic/forced move
  if (!isCapped(tokenDoc)) return;

  const rates = tokenRates(tokenDoc);
  const phase = currentPhase();
  const led   = readLedger(tokenDoc, phase);
  const dest  = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
  const move  = gridDistance({ x: tokenDoc.x, y: tokenDoc.y }, dest);

  const result = movementPhase(led.spent, move, rates, led.capIsWalk);
  if (!result.allowed) {
    ui.notifications.warn(
      `${tokenDoc.name}: ${Math.round(result.newSpent)} m exceeds the ${result.cap === rates.walk ? "walking" : "running"} maximum of ${result.cap} m this phase — blocked (SR2 p.84).`);
    return false;
  }

  const ranThisRound = led.ranThisRound || result.ran;
  foundry.utils.setProperty(changes, "flags.sr2e.moveLedger", {
    combatId: phase.combatId, round: phase.round, turn: phase.turn,
    spent: result.newSpent, capIsWalk: led.capIsWalk, ranThisRound
  });

  // Advisory only (this does NOT auto-apply the modifier); post once, when the
  // token first crosses into running this phase.
  if (!led.ranThisRound && result.ran) {
    ui.notifications.info(
      `${tokenDoc.name} is running: +4 target modifier to tests this phase (SR2 p.84) — apply it on the attack.`);
  }
});
