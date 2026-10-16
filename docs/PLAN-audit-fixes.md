# Plan: five fixes from the 2026-10-16 repo audit
_Round 2 — revised after Codex rounds 1-2 (see PLAN-audit-fixes-REVIEW-LOG.md)_

## Goal
Fix the five audit findings with the smallest changes, each pinned by one test.
Expected load: one GM world, a handful of players, each on a computer and maybe a phone.

## Approach

### 1. Hatamoto II range fix lives in RELEASED migration data
`module/rules/weapon-ranges.mjs:84` added `Eichiro Hatamoto II` to `MODULE_RANGE_FIXES`
(read by the 0.104.2 migration through `ALL_RANGE_FIXES`) AFTER v0.104.2 was tagged.
Worlds already stamped 0.104.2 never run it.
- Delete that line. Its Sakal/Samopal comment is unrelated and stays.
- Add to `WEAPON_STAT_FIXES["Eichiro Hatamoto II"]` (0.104.3, unreleased, per-field by exact
  old value): `system.ranges.short [5,10]`, `medium [15,20]`, `long [30,50]`,
  `extreme [50,100]` (shotgun row, core p.88; NAGRL types it Shotgun, p.32).
- Tests (Vitest): extend `test/migration-weapon-stats.test.mjs` with the Hatamoto ranges; add
  a guard pinning the released data as a snapshot: `Object.keys(RANGE_FIXES).length === 15`
  (it is an object) and `MODULE_RANGE_FIXES` deep-equal to its contents at the v0.104.2 tag
  (read with `git show v0.104.2:module/rules/weapon-ranges.mjs` in the existing sibling-tag
  test style, skipped when the tag is absent), with a comment: released migration data, add
  new fixes to a new migration.
- Check: `test/migration-module-weapon-ranges.test.mjs` (history across sibling tags) still
  passes. The NAGRL pack's Hatamoto is already shotgun ranges, so its pack check is unaffected.
- CHANGELOG (Unreleased line ~28 already mentions the Hatamoto's shotgun ranges): make clear
  the range correction runs in the 0.104.3 migration, so 0.104.2 worlds get it too.

### 2. Melee Defend stays live when the defender doesn't own the attack card
Only the message author or a GM may update a ChatMessage. `rollMeleeDefense` /
`_resolveMeleeHit` (`module/documents/actor.mjs`) mark the attack card resolved only when
`message.isAuthor || game.user.isGM`. When the GM's NPC attacks a player, the player's
defense leaves the card live: Defend can be clicked again and the exchange re-rolled. The
Full Defense branch (`actor.mjs:1659`) calls `message.setFlag` unguarded and throws for a
player, so its "turned aside" message never posts.

Reuse the existing `flags.sr2e.resolves` pattern (`sr2e.mjs:1989`): an outcome message
names the card it resolves, and the card's author's client (or a GM, if the author is
offline) updates the card.
- Both outcome messages (Full Defense "turned aside" and the `_resolveMeleeHit` hit card)
  carry `flags.sr2e.resolves = message.id` and `flags.sr2e.meleeResolution = <the
  resolution html already built>`.
- Delete the direct card writes in both places (the `setFlag` at 1659 and the guarded
  `message.update` at 1757). The hook does it for every case, author included, so there is
  one path.
- Import `renderMeleeAttackCard` into `sr2e.mjs` (it isn't imported today).
- The outcome marker is AUTHORITATIVE; the card update is cosmetic. Every melee guard uses
  the existing `isCardResolved(message, "melee")` (`astral-combat.mjs:81`, already imported
  in sr2e.mjs and actor.mjs): `rollMeleeDefense` (actor.mjs:1507), the Undefended button
  (sr2e.mjs ~2602), and `_syncDependentCards` (actor.mjs ~782: add "melee" to the
  marker-aware key list). So even if the author is offline, or the card update fails or is
  delayed, a second Defend/Undefended is refused.
- In the `createChatMessage` hook at `sr2e.mjs:1989`, add melee: if `card.flags.sr2e.melee`
  exists and is not resolved, update `{content: renderMeleeAttackCard(next),
  "flags.sr2e.melee": next}` with `next = {...st, resolved: true, resolution:
  outcome.flags.sr2e.meleeResolution ?? ""}`.
- Order inside `rollMeleeDefense` is unchanged: the roll, then the outcome message. The
  card closes when the outcome message is created, on the author's client.
- Known limit: if the author is offline and no GM is online, or the update fails, the card
  LOOKS live but every button refuses (marker check). Cosmetic only.
- Re-check of `resolved` before the roll is unchanged (`rollMeleeDefense` returns early).
  A double click before the outcome lands can still open two dialogs; out of scope (same as today).
- Quench: create a melee card (GM-authored), create an outcome message with `resolves` +
  `meleeResolution`, wait for the hook, assert the card is resolved and its content shows
  the resolution. A card with an outcome marker but `resolved: false` refuses
  `rollMeleeDefense` (no new message) and Undefended. A Full Defense win posts the outcome with
  the flags (stub dice so the defender wins). Live two-client check in QA-PLAN: a player
  defends against a GM attack and the card closes.

### 3. Sell can pay twice
`onSellItem` (`module/sheets/sheet-actions.mjs:2776`) awaits a confirm, then credits nuyen,
then deletes. Two dialogs (double-tap, or phone + computer) each credit.
- Move the refund computation into a small local `quote(item)` (same code). After the
  confirm, re-read the live item: if it's gone, return; if `quote(live)` differs from the
  quoted price, warn ("changed while you were deciding — sell again") and return.
- Keep `const backup = live.toObject()`. Delete FIRST and require a result. On a rejection
  or an undefined result: if `actor.items.has(id)` is now false (another client sold it),
  return quietly; otherwise log the error and warn "couldn't sell <item>", and return. No
  credit in either case.
- Then credit nuyen; require `actor.update` to return a document. If it throws or returns
  nothing, recreate the item from `backup` (`keepId: true`) and warn; if THAT fails, an error
  notification naming the item and refund so the GM fixes it by hand.
- Then the chat message.
- Quench (extend the sell test at ~7583): stub `DialogV2.confirm` to resolve true, call the
  action twice concurrently, and assert exactly ONE "sells" chat message and one refund
  (count calls through a wrapped `actor.update`), and the item gone. Second test: stub
  `actor.update` to return undefined for the nuyen write; assert the item is restored and
  nuyen unchanged. QA-PLAN live check (Quench runs in one client): phone + computer, open
  both confirms before accepting either, accept both; exactly one refund and one sale
  message.

### 4. Team Karma lost updates and unchecked delta
`_applyTeamKarmaDelta` (`sr2e.mjs:671`) reads the setting then awaits `settings.set`. Two
requests close together read the same total: 5 − 1 − 1 → 4. A non-numeric delta writes NaN.
- One module-level promise chain on the applying client:
  `let teamKarmaChain = Promise.resolve();` and `_applyTeamKarmaDelta` becomes
  `teamKarmaChain = teamKarmaChain.then(() => write(delta)).catch(err => console.error(...))`,
  so each write reads the value the previous one committed.
- Both callers (GM direct in `changeTeamKarma`, and the socket handler) go through it.
- Drop non-finite deltas: a bare return in the socket handler; `changeTeamKarma` returns
  `false` explicitly.
- Keep `changeTeamKarma`'s boolean return contract (callers at sheet-actions 3368/3395 rely
  on it). Errors in the chain are logged AND shown as `ui.notifications.error` on the
  applying client, not swallowed.
- Known limit, documented with a `shortcut:` comment: two players DRAWING the last point at
  the same moment both get it (the draw credits the actor locally; there is no reliable
  socket reply to wait on, per CLAUDE.md). Drawing is agreed at the table (p.246), and the
  GM-side total clamps at 0. A request/acknowledge protocol is out of scope.
- Quench: as GM, drain the chain, save the setting, seed it to 5, call `changeTeamKarma(-1)`
  twice without awaiting, await the chain (`SR2E._teamKarmaSettled()` returns it), assert 3;
  `changeTeamKarma(NaN)` returns false and leaves it at 3; restore in `finally`.

### 5. Drop-purchase charges before it records what was paid
`actor-sheet.mjs:548-562`: `actor.update(nuyen - price)` then `created.update({"flags.sr2e":
{paid,...}})`. If the second write fails, money is gone and the item has no `paid`, so a
later sale refunds street price instead.
- Swap the order: stamp the purchase flags on the item first, then charge.
- Re-read `this.document.system.nuyen` right before the charge and re-check affordability
  (the flag write adds a round trip to the existing snapshot window).
- A write "succeeds" only if it resolves to a document: treat a thrown error OR an
  undefined result as failure.
- Flag write fails → delete the item, warn, return null. Charge fails → delete the item,
  warn, return null. If that delete fails or returns nothing → error notification naming the
  item ("added but not paid for — remove it or charge by hand").
- Quench, parameterised over {throws, resolves undefined} for each of: the flag write, the
  charge. Each: item gone, nuyen unchanged, warning shown. Plus: charge fails AND the
  cleanup delete fails → the "added but not paid for" error notification fires.

### Docs
CHANGELOG Unreleased: one line per fix. QA-PLAN: melee defense by a player against a GM
attack closes the card (two clients).

## Key decisions & tradeoffs
- Fix 2 reuses the `resolves` hook instead of a socket (sockets drop at some tables, per
  CLAUDE.md) and removes the author-side direct write so there is one code path.
- Fix 4 serialises on the one client that writes (active GM, or a GM caller). Two GMs
  calling at once could still race; one-GM tables are the expected load.
- Fix 5 stamps `paid` before money moves. In the window between, the item claims a price
  not yet paid; on failure it is deleted, and a failed delete is reported loudly.
- REJECTED from round 1: a per-actor serialised "money authority" for all nuyen writes.
  Purchases and sales are human-paced on one sheet; the double-sell case is closed by the
  delete-first check. Concurrent purchases on one actor stay as today (pre-existing,
  unchanged by this plan except for the fresh re-read).
- REJECTED: a Team Karma request/acknowledge protocol (needs a reliable socket reply; see
  the fix 4 limit).

## Risks / open questions
- Fix 2: the hook path runs on the AUTHOR's client. If the attacker is a player whose
  client is open, that player's client updates the card. Correct per the existing pattern.
- Fix 2: the outcome message is created by the defender. Any existing code reading the
  attack card's `resolved` straight after `rollMeleeDefense` returns (tests, companion)
  will now see it later. Need to grep.
- Fix 5: does anything (purchase hook, ammo stacking just after) depend on nuyen being
  charged before the flags land? The ammo stacking runs after this block either way.

## Out of scope
Double-click opening two Defend dialogs; other buttons without in-flight guards; two-GM races.
