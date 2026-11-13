# Plan: Karma on a ranged attack reaches its damage card (RULES-AUDIT-3 C8)
_Round 3 — revised after Codex round 3_

## Goal
Karma Pool (SR2E p.246) can reroll failures or buy successes on a test after it
is rolled. Melee, spell, astral, matrix, healing, manipulation and learning cards
already follow such a change (`_syncDependentCards`). A **ranged weapon's damage
card** does not: it is static HTML, so its frozen `data-stage-vs` (net staging)
and `data-attacker-successes` (p.91 complete miss) keep the pre-Karma count.
And an attack with **0 successes posts no damage card at all**, so Karma can
never turn a miss into a hit. The same applies to the blast and spread
launchers (their successes drive scatter and staging).

## Approach
1. **Flag-backed ranged damage card.** `_rollWeaponAttack` posts it with
   `flags.sr2e.rangedDamage = { testMessageId, successes, resolved: false,
   weaponName, attackerName, power, basePower, baseLevel (pre-staging), ratedLevel,
   calledShot, armorType, damageType, armorCalc, armorMod, ammoName, targetUuid,
   powerNote, codeText }` and renders it with a pure
   `renderRangedDamageCard(state)`. The existing button attributes are derived
   from the state. At `successes <= 0` the card reads "Miss" and has no button.
   Karma that lifts the count above 0 brings the button to life, exactly like
   `renderManipDamageCard` does at 0.
2. **Registered** in `_syncDependentCards` under `rangedDamage`. It is skipped
   when resolved, where resolved means `flags.sr2e.resolves` points at the card
   (the manipulation pattern — `isCardResolved(msg, key)` from
   `astral-combat.mjs`). The resist handler reuses the manipulation handler's
   shape exactly: an in-flight guard per card, and a refusal at click AND in
   `beforeRoll` if the card is gone, resolved, or its successes changed while the
   dialog was open; it passes `resolvesMessageId`.
   - **Vehicles**: `rollDamageResistance`'s vehicle branch forwards `beforeRoll`
     and `resolvesMessageId`; `rollVehicleDamageResistance` runs the guard before
     any Control Pool is spent and tags every terminal outcome (stun immune,
     Light, no penetration, fully resisted, damage) with the marker.
3. **Launchers** (`.sr2e-blast-btn`, `.sr2e-spread-btn`) become flag-backed the
   same way (`flags.sr2e.blastLaunch`, `flags.sr2e.spreadLaunch`), re-rendered
   while unresolved. Clicking reads the successes from the flag (not the DOM).
   The resolvers **validate their prerequisites first** (scene, tokens) and
   return a success/failure; only a successful resolution is marked, by the
   rows card carrying `flags.sr2e.resolves = <launcher id>` (so a non-author can
   resolve without editing the attacker's message; the author/GM also re-renders
   the launcher closed). A failed click leaves it retryable.
   - **Every** successful outcome carries the marker — including the smoke
     deployment message, which has no rows.
   - Execution is guarded per launcher (in-flight set, released in `finally`) and
     refused when already resolved.
   - The resolver never trusts the launcher's displayed count: at click it reads
     the **live total from the source test message** (`testTotalSuccesses`) as
     its snapshot; the scatter, the rows and the outcome use it, and the outcome
     records it (`flags.sr2e.launchSuccesses`).
   - **Closing is author-side reconciliation**, not cross-client visibility:
     `_syncDependentCards` (and a `createChatMessage` hook on the author's/GM's
     client for outcomes carrying `resolves`) re-renders a launcher that has a
     resolving outcome as closed, showing the outcome's recorded snapshot. An
     unresolved launcher keeps following the live total.
   - A **failed** execution records nothing; because the next click re-reads the
     live total, a Karma spend during the failed launch can never be lost, and
     the author's client re-renders the retryable launcher at the live total.
     Test: Karma during a failed launch → retry uses the new count.
4. **The attack that missed**: today `result.successes > 0` gates the whole
   damage block, including the barrier resolution. A missed attack now posts
   the flag-backed miss card. If Karma revives it:
   - An attack that declared a **barrier** stores `barrier: { rating, mode,
     door, transparent }` in the state; revived, its card shows "Barrier — the GM
     resolves this shot by hand" and **no Resist button**, so no unreduced damage
     can go through a stopped shot or a barrier-only attack. Re-running barrier
     resolution from a card is out of scope.
   - Otherwise it revives normally (ammo and recoil were already spent at the
     roll).
5. **Legacy cards** (no flag) are untouched.
6. **Tests** (Quench, deterministic dice): a Karma reroll after the card posts
   changes the card's `stage-vs` and complete-miss count; an initial miss plus
   bought successes produces a live Resist button; a resolved card does not
   change; Karma during an open resist dialog is refused by `beforeRoll`; a
   blast launcher re-renders before its click and freezes after it.

## Key decisions & tradeoffs
- **Mirror the manipulation card** rather than invent anything. It already
  solved the race in `_reconcileManipCards` (Karma landing while cards are being
  created), and the same bounded reconciliation is reused.
- **Barrier + Karma revival** is deliberately not automated. The barrier result
  would need to be re-derived from a card that never ran it.

## Risks / open questions
- Card-author permission: the attacker's own client re-renders. A GM or
  another player spending the Karma cannot. That is the existing
  `_syncDependentCards` behaviour, which warns.
- The miss card is new chat noise. A missed attack currently shows only the test
  card.

## Out of scope
Re-running barrier resolution; Karma on blast rows after the launcher was clicked.
