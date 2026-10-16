# Plan: a Resist button resolves once; a melee attack is defended once
_Round 2 — revised after Codex rounds 1-2 (see the REVIEW-LOG)_

## Goal
Audit 2026-10-16 (second pass), findings 1 and 2.
1. The generic Resist button (`.sr2e-resist-btn` with `data-power`, wired in
   `module/sr2e.mjs` ~2344) carries its damage in data attributes and records nothing.
   It is used by the melee hit card (`SR2EActor#_resolveMeleeHit`), blast rows
   (`resolveBlast`, ~2173) and shotgun-spread rows (`resolveShotgunSpread`, ~2280), plus
   any other card that emits that button without `data-ranged`/`data-manip`. A second
   click (double tap on a phone, or a later click) rolls again and lands the damage again.
   The direct ranged card is already protected (`resistRangedDamage`: in-flight set +
   `isCardResolved` + a `beforeRoll` re-check + the result tagged `resolves: message.id`).
2. `rollMeleeDefense` checks `isCardResolved(message, "melee")` before its dialog only;
   two dialogs opened by a double tap both roll and both resolve.

Expected load: one GM world, a few players with computer + phone.

## Approach
1. **A key per button, from data the card already has.** In the handler:
   `key = \`${message.id}#${i}\`` where `i` is the button's index among
   `.sr2e-resist-btn[data-power]` in the rendered message (order is fixed by the card's
   content, the same on every client). Works for cards already in chat.
2. **Refuse a resolved key, three times over** (the ranged pattern):
   - a module-level `RESIST_IN_FLIGHT` Set on this client (double tap before any roll);
   - before calling: `game.messages.some(m => m.flags?.sr2e?.resolvesRow === key)` → warn
     "That damage has already been resisted.";
   - pass `beforeRoll` that re-checks the same after the resist dialog closes (another
     client may have resolved it meanwhile), reading `game.messages.get(message.id)`:
     a source card deleted while the dialog was open refuses too (as `resistRangedDamage`).
3. **Tag the result.** `rollDamageResistance` (actor.mjs ~2320) and
   `rollVehicleDamageResistance` (~2038) build `resolves` flags from
   `options.resolvesMessageId`; add `options.resolvesRow` → `flags.sr2e.resolvesRow`
   merged into the same flags object, on every message those functions post after the
   beforeRoll (they already spread `...resolves` on each; verify every post path does,
   including the vehicle "no effect" early return and the complete-miss path).
   A new flag (not `resolves`) so nothing that reads `resolves === message.id` (card
   closure hook, `isCardResolved`) changes meaning.
3b. **Vehicles:** forward `resolvesRow` (and `beforeRoll`) through the vehicle branch of
   `rollDamageResistance` (~2187, which rebuilds its options explicitly), and in
   `rollVehicleDamageResistance` call `beforeRoll` BEFORE the immune "no effect" post
   (~2055) as well as before the roll, so an immune vehicle is also resolved once.
3c. **The card remembers too.** The existing `createChatMessage` closure hook
   (sr2e.mjs ~1989, author's client or a GM if the author is offline) gains: when an
   outcome carries `resolvesRow = "<cardId>#<i>"`, set the dotted flag
   `flags.sr2e.resolvedRows.<i> = true` on the source card (one key per row, so two rows
   finishing together can't overwrite each other). This branch runs BEFORE the hook's
   existing early return for outcomes without `flags.sr2e.resolves`. The handler refuses a key if EITHER an outcome marker
   exists OR the card lists the row, so deleting a result message doesn't reopen it.
3d. **Name the target on new melee hit cards.** `_resolveMeleeHit` gets `o.loserUuid`:
   the defender (`this.uuid`) when the attacker wins, the attacker (`state.attackerUuid`)
   on a counterstrike, none for Undefended (unknown target → the existing fallback to
   the selected token/assigned character, as today). The button gets
   `data-target-uuid` when known, so the generic handler resolves the right defender
   instead of whoever is selected. Same for a manifested spirit's attack card
   (`rollSpiritAttack`, ~2611): capture `firstTarget()?.actor?.uuid` (the helper the
   attack dialog already uses at ~2777) at roll time and put it on the button. With no
   target picked, the card stays untargeted and the first selected/assigned actor
   resists, as today (documented on the card's tooltip).
4. **Cancelled dialogs stay retryable:** no roll → no tagged message → key free again
   (the in-flight entry is cleared in `finally`).
5. **Melee defense and Undefended share one guard.** A module-level `MELEE_IN_FLIGHT`
   Set keyed by the attack card's id, taken by BOTH `rollMeleeDefense` and the Undefended
   handler and held until their outcome message exists (released in `finally`). Each
   re-checks `isCardResolved(game.messages.get(message.id), "melee")` (a deleted card
   counts as resolved) after any await — for Defend, after the
   dialog closes and before rolling; for Undefended, after `fromUuid`.
6. **Tests.**
   - Quench: a blast card with two rows: resist row 0 (stubbed dialog + fixed faces),
     then click row 0 again → no second resistance message, damage unchanged; row 1
     still resolves. A melee hit card's Resist twice → one result. Two concurrent
     handler calls on one row → one result. A cancelled resist leaves the row retryable.
   - Quench: `rollMeleeDefense` called twice concurrently with the dialog auto-confirmed
     → one outcome message; Undefended clicked twice → one hit card; Defend then
     Undefended at once → one outcome.
   - Quench: two rows of one blast card resolved concurrently, then both result messages
     deleted → both rows still refused (two independent flags).
   - Quench: a blast row whose result message is deleted stays refused (card's
     `resolvedRows`); an immune vehicle row resolves once; a new melee hit card's button
     carries the loser's uuid.
7. **Docs.** CHANGELOG (Fixed), QA-PLAN line (double-tap Resist on a blast row).

## Key decisions & tradeoffs
- Button index as the key: no card format change, so old cards are covered. Risk: a card
  whose content is re-rendered with a different number of buttons would shift indices —
  these cards are never updated after creation (verify).
- Client-local in-flight set + chat-marker check, not a lock: two clients clicking within
  the same instant can both pass before either result exists. Same accepted limit as the
  ranged card. Expected load makes it rare.

## Risks / open questions
- Do all post paths in rollDamageResistance/rollVehicleDamageResistance carry the flags?
- Does any other caller of these functions pass options that would now collide?
- Knockdown and healing buttons are out of scope (healing is guarded by its own rule;
  knockdown does no damage).

- REJECTED from round 1: an authorization policy for Undefended (who may concede for the
  defender). Pre-existing behaviour, not part of these findings; noted for later.

## Out of scope
Cross-client simultaneity beyond the ranged card's existing guarantee.
