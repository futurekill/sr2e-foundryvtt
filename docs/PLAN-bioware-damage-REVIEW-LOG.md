# Plan Review Log: bioware damage
Started 2026-10-28. MAX_ROUNDS=5.

## Round 1 — Codex
The two user rulings are consistent with this review; the plan still has these concrete gaps:

1. **§5’s collector gate does not disable all benefits.** Armor and wound compensation read items independently in `actor-data.mjs`; `workingImplant()` currently checks only installation and Kamikaze failure, so a destroyed Pain Editor or Damage Compensator still works. **Fix:** incorporate `bioFunctions()` into the shared functional-implant check and audit direct installed/active checks, including pump activation.

2. **§4’s claim protects one receipt, not competing mutations.** Two different wound cards can both read damage 0, pass validation, and write 3 and 6; the result becomes 6 instead of 9, and healing can similarly overwrite damage. Phase 5’s documented same-action limitation does not cover this. **Fix:** serialize all bioware mutations through one authoritative writer, with per-item revisions checked inside that execution path.

3. **The roll claim can permanently strand partial damage.** A disconnect after claiming—or after updating the first of several targets—leaves a card that cannot roll again, without necessarily preserving its results. **Fix:** persist the rolled outcomes before applying damage, receipt each application alongside its item update, and provide resumable completion or explicit GM recovery.

4. **`once()` does not mean forever.** `claims.mjs` makes ordinary claims prunable after 24 hours, and existing pruning callers do not preserve bioware claims; relying on the claim alone permits an old card to roll again. **Fix:** check persisted terminal card state as well as the claim, and retain claims for unresolved operations.

5. **§6’s course cannot validate its starting wound.** `{id, level, dueAt}` stores neither starting damage nor revision; even storing boxes alone misses a 6→7→6 change during treatment. **Fix:** persist an item damage revision and owning actor UUID, invalidate courses on relevant item changes, and fence completion against both.

6. **Heal has no admission protocol.** Two owner devices can roll concurrently and replace each other’s course; repeated clicks can also reroll an existing course for a faster completion. **Fix:** claim each item’s healing-start generation before rolling and commit only if that generation, revision, and empty course slot still match.

7. **The healing state is unsafe to copy.** Unlike the existing actor clock’s UUID-keyed state, plain `flags.sr2e.bioHeal` can travel into copied items or unlinked token actors and complete an inherited course. **Fix:** bind each course to its full owning item UUID and reject or clear copied courses.

8. **§1’s bounded schema conflicts with §4’s overflow write unless explicitly clamped.** Adding Serious damage to an item at 6 produces 12, outside the proposed 0–10 field. **Fix:** calculate destruction from the unclamped sum, store `damage = Math.min(10, sum)`, and keep destruction sticky until an explicit GM repair/replacement edit.

9. **§6 omits part of the existing natural-healing procedure.** `healPhysical()` requires medical attention for Deadly wounds and a separate eligibility test without a doctor; merely rolling the Healing Table time test bypasses both. **Fix:** specify those eligibility steps explicitly, then halve the resulting duration without invoking character-monitor updates or character Magic-loss side effects.

10. **The setting’s scope is unspecified.** §2 gates new cards, but §5 unconditionally disables damaged implants and §6 does not say what happens to pending courses when the option is disabled. **Fix:** define and consistently implement setting-off behavior for functional benefits, existing cards, and healing courses while retaining stored damage.

11. **“GM card” needs a precise execution rule.** `sr2e.damageCommitted` fires locally on the committing client; a GM-only hook listener would miss player-committed damage. **Fix:** create the GM-whispered card on the committing owner client, as Phase 5 does, and restrict only its actions to GMs.

VERDICT: REVISE
### Claude's response
Accepted all 11 (see Round 1 plan).

## Round 2 — Codex
The revision closes several gaps, but the multi-client guarantees remain incomplete.

1. **§4’s queue is client-local.** Two GMs applying different cards can both read damage 0 and write 3 and 6, losing one hit; receipts do not serialize distinct hits, and owner healing runs on yet another client. **Fix:** route damage application and healing mutations through one authoritative writer, including reconciliation, rather than independent per-client queues.

2. **Concurrent Roll can corrupt persisted outcomes.** Both GMs can observe no results, persist different rolls, and begin applying; the last card write can describe different targets or levels from those already applied. This exceeds merely rolling twice. **Fix:** claim rolling before generating results, check persisted results first, and provide recovery for an interrupted claim.

3. **Without the clock, Heal still has no admission or stale-state protection.** Two devices can start healing the same wound, or a wound can become destroyed while the healing dialog is open. **Fix:** use the same generation claim and revision validation for both clock modes, rechecking destruction before committing.

4. **A claimed healing start can become permanently stuck.** Disconnecting before a “terminal outcome” leaves `bioHealGen` unchanged and its claim occupied, with no specified recovery. **Fix:** add a GM recovery action that advances the generation and fences any resumed old claimant.

5. **Course completion and invalidation do not explicitly clear the slot.** Completion bumps the revision, and damage makes a course invalid, but subsequent admission requires an empty slot. **Fix:** clear `bioHeal` atomically with completion and explicitly clear invalid courses before admitting another start.

6. **Apply does not define what happens to removed or replaced implants.** Only deletion is handled; a snapshotted implant can be uninstalled, destroyed, or manually replaced before application, and the live-value update still damages it. **Fix:** validate installation and an implant lifecycle generation, reporting stale targets for GM resolution instead of applying automatically.

7. **The revised healing procedure incorrectly requires the eligibility test even with a doctor.** “Otherwise the Wound Table test first” includes non-Deadly items receiving medical attention, whereas `healPhysical()` runs that test only without a doctor. **Fix:** require a doctor for Deadly; for other levels, run the eligibility test only when no doctor is involved.

8. **The plan text accidentally truncates the settled default.** It currently says `default of## Approach` and contains a stray backtick near Decisions. **Fix:** restore “default off” and the Approach heading, and remove the stray text.

VERDICT: REVISE
### Claude's response
Accepted #2-#8. #1 rejected as a blocker: the documented cross-client write limit (commitDamage, Phase 5, healing clock); writers re-read inside their queues.

## Round 3 — Codex
The documented cross-client write limit is accepted. These remaining issues occur without simultaneous competing writes:

1. **Roll takeover does not fence the original claimant.** GM A pauses after claiming; GM B uses “Roll again,” persists and applies results; A resumes and overwrites the card with another result set. **Fix:** give roll attempts a persisted generation, advance it on takeover, and reject publication/application from superseded attempts.

2. **A “None” result still invalidates healing.** Cultured bioware can roll zero damage, but Apply unconditionally writes `damageRev + 1`, canceling a valid course despite no injury. **Fix:** receipt zero-damage hits without changing damage, destruction, or revision.

3. **Healing ignores implant lifecycle changes.** Uninstalling and reinstalling an item changes `implantGen` but not `damageRev`; a previously started course can therefore complete on the reinstalled implant, and an open Heal dialog can commit across that transition. **Fix:** capture and validate `implantGen` during healing admission, commit, and completion.

4. **Stale healing attempts have contradictory generation behavior.** “Every terminal outcome … stale … bumps gen” conflicts with “a resumed old claimant … writes nothing”; an old attempt must not advance a newer attempt’s generation. **Fix:** return without writing on generation mismatch; advance the generation for other terminal outcomes only while the attempt still owns it.

5. **Apply compares a snapshot field that Trigger never stores.** The specified snapshot contains only IDs, names, and cultured status, so its `implantGen` comparison cannot work reliably. **Fix:** include each item’s `implantGen` explicitly in the persisted creation snapshot.

VERDICT: REVISE
### Claude's response
Accepted all 5: roll attempts with a persisted generation advanced by takeover; 0-damage hits write only their receipt; implantGen captured and validated at admission, commit and completion; a stale heal attempt writes nothing; the snapshot carries implantGen.

## Round 3 — Codex
Round 3 addresses the outstanding recovery, lifecycle, and zero-damage issues. I found no remaining plan-level blocker beyond the accepted cross-client write limit.

Implementation tests should cover superseded roll attempts, zero-damage hits preserving healing, and interrupted destruction updates resuming from their receipt without being misreported as stale.

VERDICT: APPROVED
APPROVED.

## Code review 1 — Codex
Found these issues beyond the accepted cross-client write limit:

1. **[bioware-damage.mjs:34](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/bioware-damage.mjs:34) — Secondhand damage rules are missing.** The snapshot preserves only cultured status, so secondhand implants roll as standard; Shadowtech p.12 and the existing item-sheet hint specify +1 and immediate destruction on 7. **Fix:** snapshot grade and implement the secondhand modifier and destruction result.

2. **[item-body.hbs:362](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/item/item-body.hbs:362) — No manual damage/destruction controls exist.** Cards tell the GM to resolve stale hits by hand, but the item sheet cannot edit either field or clear destruction for replacement. **Fix:** add GM-only damage and destroyed inputs routed through the lifecycle hook.

3. **[bioware-damage.mjs:160](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/bioware-damage.mjs:160) — Both healing rolls omit biosystem overstress.** Unlike `healPhysical()`, neither Body test passes `_bodyTestOpts()`, making healing easier precisely when installed bioware exceeds natural Body. **Fix:** spread `actor._bodyTestOpts()` into both healing-test options.

4. **[sheet-actions.mjs:3760](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3760) — Doctoring silently assumes hospital conditions.** The replacement dialog omits location, intensive care, and magical care despite D3 requiring the existing Heal options; field treatment receives an incorrectly low TN. **Fix:** reuse the existing doctoring dialog/options instead of hard-coding `condition: "hospital"`.

5. **[sheet-actions.mjs:2848](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:2848) — Manual activation bypasses the new functional check.** A damaged or destroyed pump/Pain Editor can still be activated; healing below Serious then enables its benefits from that invalid activation. **Fix:** require `workingImplant(actor, item)` when activating, while always permitting deactivation.

6. **[bioware-damage.mjs:145](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/bioware-damage.mjs:145) — Healing captures an inconsistent admission snapshot.** Level is read before several awaits, but revision and implant generation are captured afterward; an intervening item change can pair an old healing level with newer revision values. **Fix:** capture level, damage revision, and implant generation together, then validate that snapshot after claiming and before rolling.

7. **[sr2e-quench.mjs:13076](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:13076) — The interruption test never interrupts application.** It completes a zero-damage operation and retries an already-applied card, so it exercises neither receipt recovery nor the claimed preservation of an actual healing course; takeover fencing and two-card accumulation also lack the promised tests. **Fix:** inject failure after the item receipt lands but before card persistence, test with nonzero/destructive damage and an actual course, and add superseded-attempt and two-card cases.

VERDICT: REVISE
### Claude's response
Fixed all 7: secondhand +1 and destroyed on 7 (Shadowtech p.12, verified) with the grade snapshotted; GM damage/destroyed inputs on the item sheet (through the lifecycle hook); overstress on both healing tests; the full Doctoring options in the bioware Heal dialog; activating a triggered implant requires it to work; one consistent admission snapshot validated after the claim; Quench now injects a card-write failure after the receipt, adds two cards accumulating, secondhand destruction and a superseded attempt. 36/36 live.
