# Plan: Karma on a ranged attack reaches its damage card (RULES-AUDIT-3 C8)
_Round 0 — initial draft by Claude_

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
   (the manipulation pattern, `isManipCardResolved`, generalised to
   `isCardResolved(msg, key)`). The resist handler passes `resolvesMessageId` and
   a `beforeRoll` guard that re-reads the card and refuses if its successes
   changed while the dialog was open (the manipulation guard).
3. **Launchers** (`.sr2e-blast-btn`, `.sr2e-spread-btn`) become flag-backed the
   same way (`flags.sr2e.blastLaunch`, `flags.sr2e.spreadLaunch`), re-rendered
   while unclicked. Clicking reads the successes from the flag (not the DOM),
   then marks the launcher resolved, so the scatter and rows use one number.
4. **The attack that missed**: today `result.successes > 0` gates the whole
   damage block, including the barrier resolution. A missed attack now posts
   the flag-backed miss card. If Karma revives it:
   - An attack that declared a **barrier** revives with a note to resolve the
     barrier by hand. Re-running barrier resolution from a card is out of
     scope.
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
