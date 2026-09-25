# Plan Review Log: drugs and toxins
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex (session 01a0da5b…)
The plan needs revision. The character AE keys are valid, and copying `transfer:false` item effects onto the actor fits the configured pipeline. The failures are in damage persistence, expiration, NPC support, and dose resolution.

1. **Sheet damage bypasses the proposed interception.** [onIncrementMonitor](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3203) writes directly to the monitor; NPC/spirit numeric inputs and token-bar edits also bypass `applyDamage`. Absorption and overload therefore depend on how damage was entered. Matrix persona/IC writes are separate tracks and should not automatically receive biological effects.  
   **Fix:** Route explicit damage actions through one damage service and distinguish absolute monitor corrections from damage events.

2. **Passing drug state into `damageUpdate` does not persist consumed absorption.** [Ritual Drain](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ritual.mjs:543) synchronously builds monitor changes and commits them with its completion marker; `absorbLeft` on a separate AE introduces another write and a partial-failure window.  
   **Fix:** Store mutable absorption counters on the actor and return their updates alongside monitors and the ritual marker, or explicitly redesign the transaction.

3. **“One operation” is not concurrency protection.** Quantity decrement, effect creation, damage, and chat creation are separate asynchronous operations; two clients can consume the last dose twice or reuse the same four absorption boxes.  
   **Fix:** Serialize dose and damage operations through one authority per actor UUID, re-read state inside that queue, and persist operation IDs for retry protection.

4. **The expiration predicate suppresses indefinite effects.** V13 duration data permits `remaining: null`, and JavaScript evaluates `null <= 0` as true; Atropine’s “until treated” effect would qualify. V13 also provides lazy duration getters, so stale `remaining` is distinct from stale actor attributes. [V13 ActiveEffect API](https://foundryvtt.com/api/v13/classes/foundry.documents.ActiveEffect.html#updateduration)  
   **Fix:** Register the subclass, preserve base suppression, require a finite timed duration before comparing, and use `effect.active` consistently for TNs, absorption, overload, and overuse.

5. **MAO’s “turns” cannot be mapped ambiguously.** [SR2ECombat](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/combat.mjs:1) explicitly maps a Combat Turn to a Foundry **round**; Foundry turn indices change during initiative phases and reordering. The plan also omits combat identity/start coordinates, out-of-combat behavior, and zero/negative reduced durations.  
   **Fix:** Use rounds for Combat Turns, record the combat/start boundary, define combat-end and noncombat fallbacks, and handle nonpositive durations explicitly.

6. **Re-preparing actors needs a concrete lifecycle.** Re-running derived preparation alone can accumulate modifiers; changing suppression does not itself refresh prepared attributes or render sheets. Scanning only `game.actors` misses independent unlinked-token actors.  
   **Fix:** Reset affected actors from source and refresh their views on every client, deduplicate by UUID, and cover synthetic actors, scene activation, and combat deletion.

7. **NPC initiative bonuses silently fail.** [NPC preparation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1361) never adds `initiative.mod` to dice; its base preparation restores authored dice directly. Kamikaze and MAO therefore behave differently on NPCs. NPC sheets also use their own template/action map, not the proposed gear partial.  
   **Fix:** Normalize the NPC initiative hook and add the use action to NPC gear rows, with explicit supported-actor-type checks.

8. **The promised “existing effects UI” is absent from these actor sheets.** The templates and sheet action maps provide no generic actor-effect listing/deletion control; indefinite Atropine consequently has no planned treatment control.  
   **Fix:** Add a small active-drug list with owner-authorized end/remove actions.

9. **Generic positive-change halving is unsafe.** AE values are strings and modes matter: halving an ADD bonus is different from halving MULTIPLY/OVERRIDE values, and positive TN changes are penalties. Halving only AE changes also leaves Kamikaze’s flag-based absorption untouched.  
   **Fix:** Restrict generated drug changes to validated numeric ADD bonuses and explicitly declare which non-AE benefits receive the overuse reduction.

10. **Overuse identity and stacking are undefined.** The flags schema lacks the stable compound key later required by `drugEffect`; using item identity lets separate stacks evade detection. Every second effect also grants another absorption reservoir, while duplicate Hyper effects may stack TNs or overload unexpectedly. The rule is labelled stimulant overuse, but the design applies it to every drug.  
    **Fix:** Add canonical compound IDs and explicit overuse eligibility, same-compound stacking, absorption allocation, and duplicate-overload policies.

11. **Hyper plus Kamikaze has no defined damage order.** A five-box hit with four absorption remaining could produce overload from five boxes or one; recursively applying overload can trigger itself, and Stun spillover can be counted twice.  
    **Fix:** Resolve each incoming event once through a pure reducer with a documented absorption/overload order and a non-triggering secondary-damage stage.

12. **The environmental resistance path is not simply “Body only.”** [rollDamageResistance](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2150) still offers Combat Pool, adds troll dermal dice for Body, and accepts miscellaneous dice; omitting `environmental.attr` takes the non-Body branch and falls back to one die.  
    **Fix:** Pass `{attr:"body", armorFraction:0}` explicitly and specify which pool/augmentation rules each compound permits instead of assuming the environmental option enforces them.

13. **Card resolution lacks identity and replay protection.** Immediate damage can be skipped indefinitely, ordinary Resist buttons can be repeated, and Atropine repeats need different semantics from a one-shot exposure; actor IDs alone also misresolve unlinked tokens. Cyanide’s delayed onset has no structured representation.  
    **Fix:** Snapshot recipient UUID, exposure ID, onset, and repeat sequence on the card, then enforce ownership and per-event resolution guards using the existing `beforeRoll`/resolution mechanism.

14. **Duration and addiction tests are underspecified.** The plan provides Body-success reductions without a test TN; it also offers addiction/tolerance buttons for compounds without supplied ratings and automates base ratings while leaving Strength-based increases manual.  
    **Fix:** Encode each test’s TN and applicability, allow GM rating adjustments before rolling, and resolve required rolls before consuming inventory.

15. **Adding `tnAll` only to the total leaves integration gaps.** [testTnModifiers](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:329) has ritual TN policies and a centering cap; `rollSuccessTest` separately destructures modifier components for presentation.  
    **Fix:** Add a named drug modifier throughout totals, centering, previews, and chat, with explicit resistance and ritual-policy behavior.

16. **Inventory quantity is not necessarily doses.** The [content generator](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-shadowtech/tools/gen-gear.mjs:14) defaults gear to quantity one, while ACTH and the MAO injector contain six doses; the injector also changes damage behavior.  
    **Fix:** Represent container charges and formulation variants explicitly, preserving package prices and stable generated IDs.

The simpler design is actor-held mutable dose state plus ordinary AEs for stat changes, one pure damage reducer, and one serialized commit path. Extend Quench coverage to ritual Drain, manual damage actions, NPCs, two unlinked tokens sharing a base actor, concurrent clients, indefinite/zero durations, mixed drugs, cancelled dialogs, and repeated card clicks.

VERDICT: REVISE

### Claude's response
Put to the user as a scope decision; they chose the **lean core**. So #1–#3, #6, #9–#11 and #15 are moot: no absorption, overload, auto-suppression, overuse halving or automatic TN.

Addressed:
- #4: nothing auto-suppresses; the drug list shows remaining, expired or indefinite.
- #5: turns → rounds with the combat recorded; a no-combat fallback; zero durations.
- #7: NPC initiative.mod becomes dice.
- #8: an active-drugs list with End.
- #12/#13: a dedicated Body-only toxin resist with a resolves marker and exposure ids.
- #14: TN 4 flagged; rolls before spending; ratings adjustable; the button only when the drug has ratings.
- #16: doses as quantity; the MAO Injector as its own item.

## Round 2 — Codex
Round 1 resolves most earlier concerns. I accept manual expiration via **End** and the explicitly scoped-out mechanics. These issues remain within the lean automation:

1. **Toxin resolution is not reliably “once.”** `beforeRoll` checks and chat `resolves` markers cannot prevent two simultaneous clicks from passing before either finishes; damage can also commit while posting its marker fails.  
   **Fix:** Serialize resolution and commit an `exposureId + seq` completion flag alongside `damageUpdate` in the same actor update, including fully resisted outcomes.

2. **The dose queue protects only one client.** [enqueueAttack](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/engagement.mjs:56) is a local `Map`; owner and GM can both read quantity one and create two exposures.  
   **Fix:** Give dose/resistance mutations one designated executor per actor, with state rechecks inside its queue.

3. **Dose consumption still has a partial-failure gap.** Decrementing quantity, creating the effect, and posting the card are separate writes; a failure can consume a dose without delivering its effect or damage button.  
   **Fix:** Assign the exposure ID before mutation and define recovery or compensation for each failed step so retrying cannot spend another dose.

4. **Atropine repeats can fork.** Clicking “next damage” twice on the same card produces two independently resolvable cards with the same next sequence.  
   **Fix:** Make successor creation idempotent for `(actorUuid, exposureId, seq + 1)` and disable the previous repeat action after success.

5. **The dedicated tests omit existing modifier plumbing.** [rollSuccessTest](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:358) needs `isResistance:true` to exclude wound penalties; Body tests separately need `_bodyTestOpts()` for biosystem overstress. “TN = Power” does not specify whether these existing modifiers survive.  
   **Fix:** Explicitly use `rollSuccessTest` with resistance options for toxin/addiction/tolerance rolls and Body options for every Body roll, including duration tests.

6. **Spent drugs remain sellable for full price.** [onSellItem](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:2743) prorates only ammunition; a six-dose inhaler or injector can be emptied and sold for its full purchase price.  
   **Fix:** Extend the existing acquisition-basis/proportional-refund handling to drug doses, including a zero refund when empty.

One wording correction: replace “attribute effects … **for** a rolled duration” with “attribute effects with a displayed duration, **ended manually**,” and keep expired effects visible until removed. That matches the chosen implementation without adding automatic expiration.

Add focused checks for simultaneous resolution, duplicate repeat creation, failed dose completion, resistance modifiers, and depleted-item refunds.

VERDICT: REVISE

### Claude's response
All accepted; #2 is a stated limit (one driver per actor, as for spirit services). See "Round 2 amendments".

## Round 3 — Codex
The amendments address the prior findings within the lean scope. The accepted one-driver limit and manual expiration are clear.

One gap remains: **Atropine repeat creation is still a check-then-create race.** Two rapid clicks on the same client can both find no successor card, then both create it before either marks the parent used. The amendments explicitly queue dose consumption and toxin resistance, but not repeat creation; a sequential second-click test misses this.

**Fix:** Run successor lookup, creation, and parent marking inside the same per-actor local queue, and test two concurrent repeat requests with `Promise.all`.

VERDICT: REVISE

### Claude's response
Accepted: repeat creation runs in the same per-actor queue, with a Promise.all test.

---
# Implementation review
- **Round 1: REVISE (6).** Fixed: a zero duration applied penalties; chargen overcounted packs; token card identity; GM-only repeat and repost ownership; the MAO combat; coverage.
- **Round 2: APPROVED.**
