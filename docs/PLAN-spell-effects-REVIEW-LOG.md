# Plan Review Log: Ignite / Poltergeist / Ice Sheet
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
- **Visibility claim is false.** [`detectAttackTarget`](module/sheets/sheet-actions.mjs:486) checks only whether the target’s centre lies within a flagged radius; attacks out of or through Poltergeist are missed, and the modifier is only suggested. **Fix:** explicitly implement the intended origin/path checks and describe the modifier as an overridable preset.

- **Ice Sheet conflicts with generic area geometry.** [`_resolveAreaCast`](module/documents/item.mjs:1972) resolves a Magic-based circle before rolling; `_postAreaResults` creates that circle unconditionally, including failed casts. **Fix:** branch spell-specific geometry, compute Ice Sheet’s square after successful casting, and suppress the generic circle.

- **Sustain cleanup has no template identity.** [`setSustaining(false)`](module/documents/item.mjs:1362) deletes caster effects only; templates currently record the spell’s name, insufficient for duplicate names, recasts, or synthetic actors. **Fix:** persist source spell UUID and cast-instance identity on templates and delete matching templates across scenes through retryable sustain cleanup.

- **“Net staging off” does not mean plain resistance.** [`resistManipDamage`](module/sr2e.mjs:1791) instead pre-stages damage using casting successes; it also hardcodes physical damage and half Impact, incompatible with Poltergeist. **Fix:** add explicit environmental resistance handling for fixed starting level, resistance attribute, damage type, armour fraction, and no attacker-success staging.

- **`boundarySeq` alone cannot prevent duplicate burns.** [`nextRound`](module/documents/combat.mjs:125) processes effects before committing the sequence; retries can repost cards or reroll burnout after partial failure. **Fix:** persist per-burn combat/instance/processed-sequence state, the burnout roll, and a recoverable card identity, with serialized boundary processing.

- **Ignition timing is underspecified.** `startRound`, `igniteAt`, and `burnoutAt` do not define fractional `10 ÷ successes` delays, round edits, combat changes, or whether burnout suppresses the final resistance. **Fix:** specify a monotonic pending→burning→expired clock, fractional-delay policy, exact tick order, and manual advancement outside combat.

- **Posting authority and mutation permissions are missing.** Elemental boundaries run on the advancing client, not an elected GM; a player caster also cannot necessarily create effects on an enemy. **Fix:** define one authorized processor with owner/GM application and recovery, plus permission-checked Resist/Extinguish actions and resolution tracking that does not require defenders to edit another user’s card.

- **Actor enumeration can miss or merge burns.** World-actor iteration misses unlinked token actors, while combatant iteration can tick linked actors twice; ordinary objects may have no Actor at all. **Fix:** resolve full synthetic actor UUIDs from combatants, deduplicate by actor UUID, and provide explicit object-target/manual handling.

- **The existing movement gates exclude valid ice crossings.** [`movement.mjs`](module/movement.mjs:260) skips non-active tokens and movement when the limiter is disabled; asynchronous prompting during pre-move also risks tests for subsequently cancelled moves. **Fix:** capture the finalized path independently of limiter gates, test intersections only after accepted movement, and resolve once on the designated client.

- **The proposed tests omit the integration failures above.** **Fix:** add regressions for failed casts, square geometry, sustain cleanup, retry/card failures, player permissions, unlinked versus linked tokens, and bent-path crossings with movement limiting disabled.

VERDICT: REVISE
### Claude's response
Rewrote the plan and accepted all 10: environmental resistance, a single active-GM processor with a per-effect seq, full burn state and tick order, template identity by spell uuid and instance, path-based visibility, Ice Sheet geometry only after success, a post-move updateToken crossing check, actor-uuid keys and permission requests, and expanded tests.

## Round 2 — Codex
- **Ignition delay contradicts itself (§5):** `ceil(10 / successes)` gives two turns for 5–9 successes, not “the next turn.” **Fix:** remove the parenthetical and test 5, 9, and 10 successes explicitly.

- **GM gating does not dispatch work (§2):** `nextRound()` executes on the advancing client; an active-GM check alone either skips effects or blocks another GM’s advancement, including existing elemental charging. **Fix:** route the entire serialized advancement to the active GM and define explicit recovery when none is available.

- **Burn retries remain unsafe (§5):** posting the card before persisting state allows a failed state update to reroll burnout on retry; card deduplication does not preserve the original transition. **Fix:** persist the burnout roll and pending tick/card payload first, then publish and finalize that recoverable transition.

- **Manual and combat sequences can collide (§5):** one `lastSeq` cannot safely compare independent manual and combat counters, and no pending burn card is specified for “Advance burn.” **Fix:** create a control card immediately and define clock ownership and rebasing when entering, leaving, or switching combat.

- **Ice crossing still loses bent paths (§10):** an old→new segment is the chord, not the finalized movement path; `updateToken` also receives the already-updated document. **Fix:** capture origin and finalized waypoints before movement, then consume them once after the accepted update, with an explicit fallback for direct position updates.

- **Poltergeist has no failed-cast gate (§6–8):** `_postAreaResults()` currently places templates regardless of successes, so the proposed branch can create visibility and damage from a failed cast. **Fix:** require a successful cast and confirmed sustain before activating its template or posting damage.

- **Recurring Poltergeist victims are undefined (§8):** reusing `area.caught` hits actors who left and misses entrants; canvas enumeration also fails when the active GM views another scene. **Fix:** recompute occupants from the template’s owning scene each tick and deduplicate by full actor UUID.

- **Visibility flag compatibility is unspecified (§6–7):** Poltergeist stores nested `spellEffect.visibility`, while existing smoke and `detectAttackTarget()` use `flags.sr2e.visibility`. **Fix:** explicitly support both flag paths while preserving smoke behavior.

- **Sustain cleanup still leaks on recast or permission failure (§6):** a new “current instance” can orphan the previous template, and player sustain termination cannot necessarily delete GM-created templates. **Fix:** end or reject the previous instance before replacement and persist GM-executed cleanup work until all matching templates are removed.

- **“Clear blast areas” now destroys sustained spells’ templates (§11):** clearing all `spellEffect` templates would erase Poltergeist while leaving its sustaining state active. **Fix:** restrict that cleanup to blast and Ice Sheet templates, or route sustained-template removal through spell termination.

VERDICT: REVISE
### Claude's response
Accepted all 10: the delay fix; a hook-driven active-GM processor with catch-up; persisted pending ticks; clock ownership and rebasing; V13 waypoints for ice; success and sustain gates for Poltergeist; per-tick occupants; both visibility flags; a GM cleanup request; and Clear restricted to Ice Sheet.

## Round 2 — Codex
(round 2 critique, then a re-review of the unsaved file, which repeated the same points)
The file on disk is unchanged from the previous review: it still says “Round 1” and retains the same blockers.

- **§5:** `ceil(10 / successes)` contradicts “5 or more successes means the next turn.” **Fix:** remove that parenthetical.
- **§2:** active-GM gating provides no dispatch from another advancing client. **Fix:** route serialized advancement to the active GM and define unavailable-GM recovery.
- **§5:** posting before persisting allows partial-failure retries to reroll burnout. **Fix:** persist the roll and pending card payload before publication.
- **§5:** manual and combat sequence counters can collide. **Fix:** define clock ownership, rebasing, and an immediately available pending-burn control card.
- **§10:** old→new segments miss bent paths, and `updateToken` sees updated coordinates. **Fix:** capture origin and finalized waypoints before movement, then evaluate after acceptance.
- **§6–8:** Poltergeist still lacks an explicit successful-cast gate. **Fix:** activate templates and damage only after successful casting and confirmed sustaining.
- **§8:** recurring damage does not specify refreshed occupants. **Fix:** recompute targets from the template’s owning scene each boundary.
- **§6–7:** nested visibility flags differ from existing smoke flags. **Fix:** explicitly support both paths.
- **§6:** current-instance cleanup can orphan earlier casts and fail on GM-owned templates. **Fix:** resolve previous instances before recasting and persist GM-authorized cleanup.
- **§11:** clearing every `spellEffect` template also removes sustained Poltergeist. **Fix:** restrict blast cleanup to blast/Ice Sheet templates or terminate affected sustains properly.

VERDICT: REVISE
### Claude's response
Wrote the full revision (the earlier save had failed). Accepted all 10 as listed in the Round 2 header.

## Round 4 — Codex
Round 2 resolves several earlier issues, but these blockers remain:

- **§2 replaces boundary identity with editable round numbers.** Editing round 2→8 now causes six ticks; rewinding can suppress later legitimate ticks. `nextRound()` already commits monotonic `boundarySeq`. **Fix:** observe and catch up committed `boundarySeq` changes, excluding combat initialization, rather than `changed.round`.

- **§10 cannot transfer a local movement capture to the GM.** Pre-update hooks run on the initiating client; the GM’s `updateToken` handler cannot consume a player’s local capture, and the existing movement code obtains finalized paths in `preMoveToken`. **Fix:** capture there and carry an operation-ID-tagged path through the accepted update to the GM, retaining the direct-update fallback.

- **§5 burn-card keys can collide across clocks.** `instance:tick` does not distinguish manual ticks from another combat’s counter, potentially suppressing a legitimate card after rebasing. **Fix:** use a persistent per-burn monotonic tick ID independent of its scheduling clock.

- **§5 Extinguish can be undone by a pending transition.** Setting `status: "out"` leaves `pendingTick.next` able to restore burning when processing resumes. **Fix:** serialize extinguishing with tick processing and invalidate pending transitions using an instance/version check.

- **§8 never assigns Poltergeist to a timing combat.** A scene can have multiple combats; a per-instance round guard can either double-charge or suppress unrelated boundaries. **Fix:** persist one timing combat and processed boundary sequence per instance, with explicit reassignment behavior.

- **§2/§8 catch-up invents historical occupants.** Recomputing current occupants for every missed boundary damages newcomers for turns they never spent inside and misses departed victims. **Fix:** snapshot occupants at each committed boundary or make unsnapshotted historical damage a GM recovery action.

- **§5 rebasing discards elapsed time.** Switching a manual burn to the combat’s current round at its next boundary without ticking loses that completed turn even when no manual advancement occurred. **Fix:** bind at combat entry/start, then count subsequent boundaries once, explicitly accounting for any manual advancement.

- **§8 automatic damage can reach vehicles through the wrong resolver.** `scene.tokens` includes vehicles, and `rollDamageResistance()` dispatches vehicles before environmental options are considered. **Fix:** restrict automated Poltergeist resistance to supported actor types and issue a GM-resolution note for vehicles.

VERDICT: REVISE
### Claude's response
Accepted all 8: boundaries keyed on boundarySeq, a monotonic tickId, versioned Extinguish, a timing combat per instance, no replay of missed Poltergeist boundaries, binding at combat entry, the path carried in update options, and vehicles excluded.

## Round 5 — Codex
- **§10’s direct-update fallback cannot recover the origin.** In `updateToken`, `changed` contains new values and the document’s `_source` is already updated; neither supplies the previous position. **Fix:** capture the origin on the initiating client in `preUpdateToken` and forward it with the accepted update.

- **§5’s version check does not prevent cross-client resurrection.** A player can extinguish after the GM checks `version` but before the GM’s update commits; client-local serialization cannot stop that overwrite. **Fix:** route Extinguish and all burn-state mutations through the active GM’s per-actor queue.

- **§5 does not bind burns created during an existing combat.** Its binding hooks only cover combat start and combatant creation, both already past when an existing combatant is ignited. **Fix:** initialize the timing combat and current `boundarySeq` when creating the burn, with reconciliation when the GM resumes processing.

- **§8 leaves Poltergeist permanently paused when cast before combat.** Combat adoption is specified only when an existing timing combat ends; no transition binds an initially untimed or paused instance when combat later starts. **Fix:** bind eligible paused instances on combat start/combatant creation and GM recovery, recording the current sequence without back-damage.

VERDICT: REVISE
### Claude's response
Accepted all 4 (origin captured client-side, all burn mutations on the active-GM queue, binding at burn creation and on resume, Poltergeist binding on combat start). MAX_ROUNDS was reached; no disagreement remains, and every point is applied as proposed.
