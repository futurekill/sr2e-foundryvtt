# Plan Review Log: restricted-use spells
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
Verified the restricted-use text against the local SR2E core PDF, p.133, and checked Grimoire’s actual/effective Force distinction. The plan needs these corrections:

1. **Relearning currently cannot work.** `_learnSpell` and `completeLearning` reject duplicates by spell name; p.133 explicitly says the magician will “know both versions.” **Fix:** Identify learned variants by spell definition plus restriction, retain the original item, and bind spell foci to the appropriate variant’s item ID.

2. **“Everything except Drain” breaks quickening.** `quickenSpell` prices Karma using `sustainedForce`; storing adjusted Force there would overcharge, while storing only actual Force loses the sustained effect’s strength. Grimoire specifies actual Force for quickening cost. **Fix:** Store actual cast Force and effective Force separately and assign each downstream consumer explicitly.

3. **Area radius does not receive the bonus.** SR2E p.130 bases radius on Magic Rating, matching `areaSpellGeometry`; exclusive F6 at Magic 6 does not automatically produce an 8-metre radius. **Fix:** Keep base radius equal to Magic Rating and specify separately how adjusted Force affects withholding limits.

4. **Learned Force and chosen casting Force are conflated.** `_rollSpellcast` accepts `options.force`; casting below the learned maximum must calculate Drain from that chosen actual Force, not the learned maximum. **Fix:** Define `actualCastForce ≤ learnedForce`, calculate effective Force from it, and retain the existing astral Physical-drain override.

5. **The Magic Pool cap remains underspecified.** Both `_rollSpellcast` and the dialog cap allocations by Magic Rating, with an additional area Force cap; merely passing adjusted Force into `spellCastDice` does not change its explicit `poolCap`. **Fix:** Specify the adjusted allocation ceiling once and use it consistently for dialog previews, casting, and shared elemental-aid allocations.

6. **`sustaining` does not mean the caster is sustaining.** Locked, quickened, and elemental-held spells retain that flag; a blanket check would incorrectly prohibit further magic. **Fix:** Define a shared “personally sustaining” predicate that accounts for all three holders.

7. **Exclusive enforcement has bypasses.** `setSustaining(true)` and elemental `takeOver` can introduce conflicting sustained spells without casting; generic magical-skill rolls can bypass specialized action checks. **Fix:** Enforce exclusivity at those state transitions and relevant document-level skill entry points, before spending resources.

8. **Fetish possession is insufficient.** An equipped item does not establish that it is held or touched, and the proposed check permits quantity-zero gear or the same fetish linked to multiple spells. **Fix:** Validate positive quantity, spell-specific binding, and explicit held/touched use before casting.

9. **Expendable replacement and consumption are incomplete.** Deleting the final fetish leaves a dangling immutable item ID, while consumption after rolling permits overlapping casts to reuse the final unit. **Fix:** Define replenishment of the learned fetish type and serialize validation/consumption before the spell test, including failed casts.

10. **A sheet lock does not enforce permanent selection.** Direct updates bypass it, and `cleanSpellDefinition` would copy the new actor-local fetish ID from source spells. **Fix:** Enforce restriction changes at the document layer and clear/rebind actor-local fetish references during learning and copying.

VERDICT: REVISE
### Claude's response
Rewrote the plan and accepted all 10: variants keyed by restriction, a per-consumer Force table (quickening on actual, radius on Magic), actual vs effective, one pool ceiling, a personally-sustaining predicate, enforcement at every transition and magical skill, fetish in-hand/quantity/uniqueness, expendables decremented before the roll, and _preUpdate enforcement with clean-on-copy.

## Round 2 — Codex
The revision fixes several earlier issues, but these concrete flaws remain:

1. **Magic Pool rules contradict each other.** The table says the ceiling is effective Force; the prose says Magic + bonus. At Magic 6, actual Force 1, exclusive, those yield 3 versus 8 dice. SR2E p.85 caps allocation by Magic Attribute; p.133 adjusts the spell’s rating, not that Attribute. **Fix:** Retain the Magic cap, apply effective Force to the area-specific Force cap, and explicitly label any different rule as a house rule.

2. **Exclusive checks remain asymmetric.** Step 7 blocks adding another spell while an exclusive is personally sustained, but does not block `setSustaining(true)` on an exclusive while an ordinary spell is sustained. **Fix:** Validate the resulting personally sustained set and reject any combination containing an exclusive plus another spell.

3. **Two holder-release paths bypass exclusivity.** `sheet-actions.mjs` removes a spell lock through a direct update; elemental `endService` clears the holder just like `takeOver`. Neither is covered explicitly. **Fix:** Apply the same resulting-state check to unlocking, `endService`, and every other transition returning concentration to the caster.

4. **Name matching permits forbidden fetish substitution.** Renaming arbitrary gear to `fetishName` makes it eligible, including replacing a reusable fetish; p.133 explicitly prohibits substitution. **Fix:** Bind reusable fetishes by item ID and give expendable replacement stock a stable, spell-specific identity independent of its display name.

5. **Fetish uniqueness is checked too early.** Two pending learning attempts can reserve the same fetish name before either creates its spell, then both complete successfully. **Fix:** Revalidate fetish ownership/binding during `completeLearning`, before Karma payment and item creation.

6. **The cast dialog still contradicts the new Force contract.** Its input, default, and `readPreview` clamp to Magic Rating rather than learned Force, preventing legitimate overcasting and permitting requests above a low learned rating. **Fix:** Explicitly update all dialog bounds and preview logic to match document-level `spellForces` validation.

7. **The new sustained state lacks lifecycle cleanup.** Existing `setSustaining(false)` and `cleanSpellDefinition` clear only `sustainedForce`, leaving `sustainedEffectiveForce` stale or copied into a newly learned spell. **Fix:** Initialize, snapshot, and clear both Force fields together across casting, dropping, expiry, and definition copying.

VERDICT: REVISE
### Claude's response
Accepted all 7. The Magic Pool keeps the Magic cap (an area Force cap uses effective; flagged). A resulting-set exclusive check runs on every transition, including unlock and endService. Fetishes are bound by flag, not name, which makes #5 moot. The dialog bounds follow learnedForce, and both sustained fields share a lifecycle.

## Round 3 — Codex
Two blocking flaws remain:

1. **The resulting sustained set cannot enforce casting restrictions.** `_rollSpellcast` only adds successful sustained-duration spells to that set. An instant exclusive cast while sustaining an ordinary spell—or an ordinary instant cast while sustaining an exclusive—leaves the set unchanged and passes `exclusiveConflict(setAfter)`, contrary to p.133. **Fix:** Add a separate pre-cast check covering the attempted spell regardless of duration or success, alongside the sustained-set and same-action checks.

2. **Fetish binding still does not preserve the learned choice.** Step 4 collects a fetish name, but the schema discards it and permits binding gear after learning; deleting a reusable fetish then binding another also satisfies “exactly one item.” SR2E p.133 requires choosing the object when learning and prohibits substitution. **Fix:** Persist the learned reusable item identity or expendable stock specification at learning, retain it after gear deletion, and restrict subsequent binding/restocking to that choice.

VERDICT: REVISE
### Claude's response
Accepted both. There is an explicit pre-cast exclusivity check for any duration. The fetish choice is persisted at learning: the reusable fetish is a fixed item id, and expendable restock must match the learned label.

### Implementation note (Claude)
The learned-Force bound on the cast dialog and document path applies to **restricted** spells only. Compendium spells ship at Force 1 and players often never raise the learned Force, so bounding every spell would regress unrestricted casting. Restricted spells get their learned Force set deliberately in the Learn dialog.
