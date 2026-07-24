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

// Movement methods that count as tactical movement (subject to the cap). Every
// other method — a token HUD nudge, a paste, an undo/revert, a programmatic
// `token.update({x,y})` — is repositioning, not a Combat-Phase move, so it isn't
// charged. (SR2 p.84 governs a character choosing to walk/run on their turn.)
const TACTICAL_METHODS = new Set(["dragging", "keyboard"]);

// preMoveToken (V13) hands us the FINALIZED movement path, so a single bent /
// looping drag is charged its real travelled distance — not just the straight
// line to the drop. The decision (block, or the ledger to persist on accept, or a
// `skip` marker for a handled-but-uncapped move) is stashed by token UUID for the
// following preUpdateToken to consume. Invariant: a stash present ⟺ preMoveToken
// ran for this move, so the chord fallback fires ONLY when preMoveToken didn't.
// Each stash is timestamped; a stash older than STASH_TTL (an orphan left by an
// update aborted after preMoveToken) is ignored, so it can never be mis-applied
// to a later, unrelated move.
const _pendingLedger = new Map();
const STASH_TTL = 2000;   // ms; the real gap between the two hooks is sub-ms
const _now = () => globalThis.performance?.now?.() ?? Date.now();

/** Metres travelled by a movement operation: sum the measured passed + pending
 *  path sections (Foundry has already measured them in scene units = metres);
 *  fall back to the straight origin→destination line. */
function operationDistance(movement) {
  const passed = movement?.passed?.distance;
  const pending = movement?.pending?.distance;
  if (Number.isFinite(passed) || Number.isFinite(pending)) {
    return (Number.isFinite(passed) ? passed : 0) + (Number.isFinite(pending) ? pending : 0);
  }
  const o = movement?.origin, d = movement?.destination;
  return (o && d) ? gridDistance(o, d) : 0;
}

/**
 * Decide a move against the cap. Returns the ledger flag to persist on accept,
 * or throws no state — pure aside from reading the token's current ledger.
 * @returns {{blocked:boolean, cap:number, newSpent:number, ledger:object, crossedIntoRun:boolean}}
 */
function decideMove(tokenDoc, moveMetres) {
  const rates = tokenRates(tokenDoc);
  const phase = currentPhase();
  const led   = readLedger(tokenDoc, phase);
  const result = movementPhase(led.spent, moveMetres, rates, led.capIsWalk);
  const ranThisRound = led.ranThisRound || result.ran;
  return {
    blocked: !result.allowed,
    cap: result.cap,
    walkCap: result.cap === rates.walk,
    newSpent: result.newSpent,
    crossedIntoRun: !led.ranThisRound && result.ran,
    ledger: {
      combatId: phase.combatId, round: phase.round, turn: phase.turn,
      spent: result.newSpent, capIsWalk: led.capIsWalk, ranThisRound
    }
  };
}

/** Post the block warning / the once-per-phase running advisory. */
function announce(tokenDoc, d) {
  if (d.blocked) {
    ui.notifications.warn(
      `${tokenDoc.name}: ${Math.round(d.newSpent)} m exceeds the ${d.walkCap ? "walking" : "running"} maximum of ${d.cap} m this phase — blocked (SR2 p.84).`);
  } else if (d.crossedIntoRun) {
    ui.notifications.info(
      `${tokenDoc.name} is running: +4 target modifier to tests this phase (SR2 p.84) — apply it on the attack.`);
  }
}

// Primary enforcement: measure the true travelled path and block past the max.
// Stashes on EVERY move it handles on the mover's client — `{skip:true}` when the
// move is uncapped (non-tactical method, bypass, or not the active combatant),
// `{ledger}` when an accepted tactical move must persist — so the fallback below
// never re-touches a move preMoveToken already cleared. A blocked move returns
// false (cancels the update) and needs no stash.
Hooks.on("preMoveToken", (document, movement, operation) => {
  const uid = operation?.user?.id ?? operation?.user;
  if (uid && uid !== game.user.id) return;                   // only the mover evaluates
  const stash = (v) => { if (document.uuid) _pendingLedger.set(document.uuid, { ...v, t: _now() }); };

  if (operation?.sr2eBypassMovement) return stash({ skip: true });
  if (movement?.method && !TACTICAL_METHODS.has(movement.method)) return stash({ skip: true });  // undo/api/hud/paste
  if (!isCapped(document)) return stash({ skip: true });

  const d = decideMove(document, operationDistance(movement));
  announce(document, d);
  if (d.blocked) return false;                               // cancels the movement
  stash({ ledger: d.ledger });
});

// Persist the accepted move's ledger into the same document update. A fresh stash
// means preMoveToken handled the move: write its ledger (or nothing, for a skip).
// With no fresh stash, fall back to the straight-line chord measure — so on any
// build where preMoveToken doesn't fire, behaviour degrades to exactly the
// previous shipped limiter, never worse.
Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (changes.x === undefined && changes.y === undefined) return;

  const stashed = tokenDoc.uuid ? _pendingLedger.get(tokenDoc.uuid) : null;
  if (stashed) {
    _pendingLedger.delete(tokenDoc.uuid);
    if (_now() - stashed.t < STASH_TTL) {                    // fresh: preMoveToken owns this move
      if (stashed.ledger) foundry.utils.setProperty(changes, "flags.sr2e.moveLedger", stashed.ledger);
      return;
    }
    // stale orphan (aborted update): drop it and enforce via the fallback below
  }

  if (options?.sr2eBypassMovement) return;
  if (!isCapped(tokenDoc)) return;
  const dest = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
  const d = decideMove(tokenDoc, gridDistance({ x: tokenDoc.x, y: tokenDoc.y }, dest));
  announce(tokenDoc, d);
  if (d.blocked) return false;
  foundry.utils.setProperty(changes, "flags.sr2e.moveLedger", d.ledger);
});

// Drop any stale stash when combat ends, so an un-consumed decision can't leak
// into a later move (the ledger flag itself is round-qualified and self-expiring).
Hooks.on("deleteCombat", () => _pendingLedger.clear());
