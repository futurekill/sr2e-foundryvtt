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
import { isOnAstralPlane, astralCaps, chargeAstralMove, astralMoveDecision } from "./rules/astral-rules.mjs";
import { fabRegions } from "./fab.mjs";

const SETTING = "movementLimit";
// green (walk) → amber (run) → red (over max)
const BAND_COLOR = [0x2f9e44, 0xe8a91e, 0xe03131];

/** SR2 movement rates (m/Combat Phase) for a token's actor, or null. */
function tokenRates(tokenDoc) {
  const actor = tokenDoc?.actor;
  const q = Number(actor?.system?.quickness?.value) || 0;
  if (q <= 0) return null;
  // Prefer an actor-supplied movement multiplier over the metatype table.
  // Spirits carry their own (SR2 p.234-235: air x4, fire x3, earth/water x2) and
  // have no `race`, so the race lookup silently ran them all at human x3.
  const mult = Number(actor.system?.moveMult) > 0
    ? Number(actor.system.moveMult)
    : runMultiplierForRace(actor.system?.race);
  return movementRates(q, mult);
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
  if (!active) return false;
  // A projecting mage's astral form moves on its BODY's turn (the combatant
  // stays bound to the body token; docs/PLAN-astral-barriers.md item 15).
  const astralFormOf = tokenDoc.flags?.sr2e?.astralForm;
  if (active.uuid !== tokenDoc.uuid && astralFormOf !== active.uuid) return false;
  if (isOnAstralPlane(tokenDoc.flags?.sr2e)) return astralCapsOf(tokenDoc) !== null;
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

/* ── Astral movement (SR2 p.146; fat bacteria, CSH p.103) ───────────────────── */

/** Normal and fast astral caps for an astral-plane token, or null. A magician's
 *  Astral Quickness is Intelligence; a spirit's, its Quickness (no fast mode). */
function astralCapsOf(tokenDoc) {
  const a = tokenDoc?.actor;
  if (!a) return null;
  const spirit = a.type === "spirit";
  const aq = Number(spirit ? a.system?.quickness?.value : a.system?.intelligence?.value) || 0;
  if (aq <= 0) return null;
  const caps = astralCaps({ astralQuickness: aq, magic: a.system?.magic?.value ?? 0 });
  return { ...caps, canFast: !spirit && !!tokenDoc.flags?.sr2e?.astralForm };
}
const isFast = (tokenDoc, caps) => !!(caps?.canFast && tokenDoc.flags?.sr2e?.astralFast);

function readAstralLedger(tokenDoc, phase) {
  const l = tokenDoc.getFlag("sr2e", "astralLedger");
  if (!l || l.combatId !== phase.combatId || l.round !== phase.round || l.turn !== phase.turn) return { normal: 0, fast: 0 };
  return { normal: l.normal ?? 0, fast: l.fast ?? 0 };
}

/**
 * Metres of a centre-point path inside any enabled FAB zone — their union, each
 * stretch counted once — measured with the GRID's metric (the same one the move
 * total uses), not Euclidean pixels. Boundaries are found by sampling every
 * 1/50 grid square; each inside stretch is then measured by the grid.
 */
function fabMetresAlong(tokenDoc, centers) {
  const regions = fabRegions(tokenDoc.parent);
  if (!regions.length || centers.length < 2) return 0;
  const grid = tokenDoc.parent.grid;
  const step = Math.max(0.5, (grid.size ?? 100) / 50);
  const inFab = (p) => regions.some(r => r.testPoint({ x: p.x, y: p.y, elevation: p.elevation ?? 0 }));
  const at = (a, b, s) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, elevation: a.elevation ?? 0 });
  let metres = 0;
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1], b = centers[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    let start = null;
    for (let k = 0; k <= n; k++) {
      const s = k / n, inside = inFab(at(a, b, s));
      if (inside && start === null) start = s;
      if ((!inside || k === n) && start !== null) {
        const end = inside ? s : (k - 0.5) / n;
        metres += grid.measurePath([at(a, b, start), at(a, b, end)]).distance;
        start = null;
      }
    }
  }
  return metres;
}

/** Centre points of a list of V13 movement waypoints, starting from `from`. */
function centersOf(tokenDoc, from, waypoints) {
  return [from, ...(waypoints ?? [])].filter(Boolean)
    .map(w => tokenDoc.getCenterPoint({ ...w, width: w.width ?? tokenDoc.width, height: w.height ?? tokenDoc.height, shape: w.shape ?? tokenDoc.shape }));
}

/**
 * Decide an astral move: CHARGE what this update travels (`passed`), but VALIDATE
 * the whole remaining plan (`passed` + `pending`) — so a move split at a region
 * checkpoint is charged once per stretch, and each resumed stretch is re-checked
 * under the then-current toggle, FAB layout and phase.
 */
function decideAstralMove(tokenDoc, step, plan) {
  const caps = astralCapsOf(tokenDoc), phase = currentPhase();
  const fast = isFast(tokenDoc, caps);
  const led = readAstralLedger(tokenDoc, phase);
  const check = astralMoveDecision(led, chargeAstralMove({ ...plan, fast }), caps);
  const charged = astralMoveDecision(led, chargeAstralMove({ ...step, fast }), caps);
  return { ...check, caps, fast,
    ledger: { combatId: phase.combatId, round: phase.round, turn: phase.turn, normal: charged.normal, fast: charged.fast } };
}

function announceAstral(tokenDoc, d) {
  if (d.allowed) return;
  ui.notifications.warn(d.over === "fast"
    ? `${tokenDoc.name}: past the fast astral maximum of ${d.caps.fast} m this phase — blocked (SR2E p.146).`
    : `${tokenDoc.name}: ${Math.round(d.normal)} m at normal astral speed exceeds ${d.caps.normal} m (Astral Quickness × 4, SR2E p.146; fat bacteria forbid fast movement, CSH p.103) — blocked.`);
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
      if (isOnAstralPlane(doc.flags?.sr2e)) {
        // Green within this mode's cap, red past it (astral forms don't run).
        // The same two-ledger check as enforcement (FAB metres on the straight
        // line to this waypoint — a preview).
        const caps = astralCapsOf(doc), led = readAstralLedger(doc, currentPhase());
        const metres = waypointDistance(waypoint);
        const fabMetres = Math.min(metres, fabMetresAlong(doc, centersOf(doc, doc._source, [waypoint])));
        const d = astralMoveDecision(led, chargeAstralMove({ metres, fabMetres, fast: isFast(doc, caps) }), caps);
        return BAND_COLOR[d.allowed ? 0 : 2];
      }
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

/** A movement operation's metres (Foundry has measured them in scene units):
 *  `step` — what THIS update travels (passed); `plan` — passed + still pending.
 *  Falls back to the straight origin→destination line for both. */
function operationDistances(movement) {
  const passed = movement?.passed?.distance;
  const pending = movement?.pending?.distance;
  if (Number.isFinite(passed) || Number.isFinite(pending)) {
    const p = Number.isFinite(passed) ? passed : 0;
    return { step: p, plan: p + (Number.isFinite(pending) ? pending : 0) };
  }
  const o = movement?.origin, d = movement?.destination;
  const all = (o && d) ? gridDistance(o, d) : 0;
  return { step: all, plan: all };
}

/**
 * Decide a move against the cap. Returns the ledger flag to persist on accept,
 * or throws no state — pure aside from reading the token's current ledger.
 * @returns {{blocked:boolean, cap:number, newSpent:number, ledger:object, crossedIntoRun:boolean}}
 */
function decideMove(tokenDoc, moveMetres, planMetres = moveMetres) {
  const rates = tokenRates(tokenDoc);
  const phase = currentPhase();
  const led   = readLedger(tokenDoc, phase);
  // Validate the whole remaining plan; charge only what this update travels
  // (a move split at a region checkpoint resumes as further updates).
  const result = movementPhase(led.spent, planMetres, rates, led.capIsWalk);
  // Running is what was actually travelled: a short first stretch of a long plan
  // that then stops at a checkpoint never ran (the resumed stretch will, if it does).
  const travelled = movementPhase(led.spent, moveMetres, rates, led.capIsWalk);
  const ranThisRound = led.ranThisRound || travelled.ran;
  return {
    blocked: !result.allowed,
    cap: result.cap,
    walkCap: result.cap === rates.walk,
    newSpent: (led.spent || 0) + (moveMetres || 0),
    planned: result.newSpent,
    crossedIntoRun: !led.ranThisRound && travelled.ran,
    ledger: {
      combatId: phase.combatId, round: phase.round, turn: phase.turn,
      spent: (led.spent || 0) + (moveMetres || 0), capIsWalk: led.capIsWalk, ranThisRound
    }
  };
}

/** Post the block warning / the once-per-phase running advisory. */
function announce(tokenDoc, d) {
  if (d.blocked) {
    ui.notifications.warn(
      `${tokenDoc.name}: ${Math.round(d.planned)} m exceeds the ${d.walkCap ? "walking" : "running"} maximum of ${d.cap} m this phase — blocked (SR2 p.84).`);
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

  const { step, plan } = operationDistances(movement);
  if (isOnAstralPlane(document.flags?.sr2e)) {
    const passed = centersOf(document, movement?.origin, movement?.passed?.waypoints);
    const pending = centersOf(document, movement?.passed?.waypoints?.at(-1) ?? movement?.origin, movement?.pending?.waypoints);
    const fabStep = Math.min(step, fabMetresAlong(document, passed));
    const fabPlan = Math.min(plan, fabStep + fabMetresAlong(document, pending));
    const d = decideAstralMove(document, { metres: step, fabMetres: fabStep }, { metres: plan, fabMetres: fabPlan });
    announceAstral(document, d);
    if (!d.allowed) return false;
    return stash({ astralLedger: d.ledger });
  }

  const d = decideMove(document, step, plan);
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
      if (stashed.astralLedger) foundry.utils.setProperty(changes, "flags.sr2e.astralLedger", stashed.astralLedger);
      return;
    }
    // stale orphan (aborted update): drop it and enforce via the fallback below
  }

  if (options?.sr2eBypassMovement) return;
  if (!isCapped(tokenDoc)) return;
  const dest = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y };
  if (isOnAstralPlane(tokenDoc.flags?.sr2e)) {
    const metres = gridDistance({ x: tokenDoc.x, y: tokenDoc.y }, dest);
    const fab = Math.min(metres, fabMetresAlong(tokenDoc, centersOf(tokenDoc, { x: tokenDoc.x, y: tokenDoc.y }, [dest])));
    const d = decideAstralMove(tokenDoc, { metres, fabMetres: fab }, { metres, fabMetres: fab });
    announceAstral(tokenDoc, d);
    if (!d.allowed) return false;
    foundry.utils.setProperty(changes, "flags.sr2e.astralLedger", d.ledger);
    return;
  }
  const d = decideMove(tokenDoc, gridDistance({ x: tokenDoc.x, y: tokenDoc.y }, dest));
  announce(tokenDoc, d);
  if (d.blocked) return false;
  foundry.utils.setProperty(changes, "flags.sr2e.moveLedger", d.ledger);
});

// Drop any stale stash when combat ends, so an un-consumed decision can't leak
// into a later move (the ledger flag itself is round-qualified and self-expiring).
Hooks.on("deleteCombat", () => _pendingLedger.clear());
