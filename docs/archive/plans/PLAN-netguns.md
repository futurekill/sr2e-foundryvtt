# Plan: netgun automation (SSC p.72, CSH p.103)
_Final — Codex rounds 1-5; round 5's two notes applied (see the REVIEW-LOG)_

## Goal
Net weapons fire a net, not damage. Today a net gun (`ammo.type: "net"`, damage code
"Special") posts an ordinary ranged damage card at Power 0 and the GM runs the net by
hand from the item notes. Automate both books' nets:
- **SSC Net-Gun (book p.72):** the victim makes a Strength Resistance Test against TN 5
  (normal net) or 8 (large net), or 3 when a normal net hits a large target; the victim
  may use Combat Pool. Entangled: immobile, can't act. Escape: once per turn, the same
  test, with a −1 modifier per turn entangled.
- **CSH FAB-NG (book p.103):** the same on the ASTRAL side: an Astral Reaction Test (TN
  5/8/3), escape once per Combat Turn with −1 per turn; and "if twice the attacker's
  successes exceeds the total dice the victim can roll (Astral Reaction + all available
  Astral Pool), no escape is possible".
User rulings (2026-10-16): the −1 is a **TN** modifier (TN falls per turn, floor 2); the
SSC "extra successes" are **all** the attacker's successes. Both books: the victim must
get MORE than twice the attacker's successes to avoid the net / escape.

Expected load: one GM world, a few players.

## Approach
1. **Pure rules** (`module/rules/net-rules.mjs`, Vitest):
   - `netTN({ net: "standard"|"large", largeTarget })` → 5 / 8 / 3 (standard on large).
   - `escapeTN(base, turnsEntangled)` → `max(2, base − turns)`.
   - `netHolds({ successes, attackerSuccesses })` → `successes <= 2 * attackerSuccesses`.
   - `escapeImpossible({ attackerSuccesses, dice })` → `2 * attackerSuccesses > dice`.
   - `netKind(weapon, loadedAmmoName)`: size from the loaded net's name (/large/i: the
     large gun fires both sizes) else the weapon's; astral from `flags.sr2e.net.astral`
     on the weapon (content modules set it), else /\bFAB\b/i on the name.
2. **Attack → net card.** In the ranged attack path (`item.mjs`), net ammunition is
   detected FIRST and routed ahead of the blast and shotgun-spread branches (and their
   modifiers): a weapon whose loaded ammo type is `net` posts a flag-backed
   **net card** (`flags.sr2e.netHit = { testMessageId, successes, targetTokenUuid,
   net, astral, resolved }`) instead of the damage card. Karma on the attack keeps it in
   step through the SAME machinery as the other dependent cards: `netHit` is added to
   `_syncDependentCards`' renderer registry and its marker-aware (resolved) list in
   `actor.mjs`, to the closure hook's renderers in `sr2e.mjs`, and creation-time
   `reconcileDependentCard` refuses a card that `isCardResolved(msg, "netHit")`. A miss
   posts it inert. The card records the EXACT target TokenDocument uuid; no target → no
   button (no fallback to the selected token).
3. **Resist the net** (card button):
   - resolve the recorded token; refuse if missing; refuse an astral net unless
     `isOnAstralPlane(token.flags.sr2e)` and a mundane one if it is;
   - preflight BEFORE any roll: the clicker owns the actor AND
     `tokenDoc.canUserModify(game.user, "update")`; client in-flight guard + the card's
     outcome marker, as the ranged card;
   - dialog: base dice = Strength (mundane) or Astral Reaction (astral) only; pool dice
     (Combat / Astral) allocated through `rollSuccessTest`'s `poolDice` so they are
     deducted; "Large target" checkbox pre-ticked for a troll; TN from `netTN`. The
     "no escape possible" warning uses attribute + the FULL available pool, snapshotted
     when the dialog opens;
   - after the dialog closes and BEFORE rolling, re-validate everything live: the card
     is still unresolved, the attack's current successes (Karma may have changed them),
     the token still exists, its plane, and both permissions;
   - the test is created CLOSED to Karma (`closed: true` in its persisted test state,
     via a `rollSuccessTest` option), because the result is applied at once;
   - roll (`isResistance: true`); just before committing, re-read the attack's CURRENT
     successes from the SOURCE attack test (`testTotalSuccesses` of the message named by
     `testMessageId`, not the dependent net card, which can lag) and decide with those (`netHolds`); the outcome then
     closes BOTH the resist test and the attack test to Karma (`closesTests: [attackTestId,
     resistTestId]`), so the attack can't change after it was resisted; commit the token state first, then
     the outcome message carrying `resolves` + `closesTests: [attackTestId, resistTestId]`.
4. **Entangled state on the TOKEN** (`tokenDoc.flags.sr2e.net = { id, cardId, tn,
   astral, attackerSuccesses, turns, seen, lastAttempt }`): `id` is per net; every escape commit re-reads the
   flag and must match the id it started with (an old card or a stale HUD can't clear a
   newer net). A new net on an already-netted token replaces the record (new id, new cardId).
   Visual from the TOKEN flag only: a `refreshToken` hook draws a net overlay sprite
   (`icons/svg/net.svg`) on a token whose `flags.sr2e.net` is set and removes it when
   cleared; an `updateToken` hook that sees `flags.sr2e.net` change (set, replaced or
   removed) asks that token to redraw (`renderFlags.set({ refreshState: true })`, as the
   astral body cue does), so an idle token updates too. No actor ActiveEffect at all, so a linked body and its astral form never
   share it, and nothing is left behind on replacement.
5. **Movement:** `preMoveToken` and the `preUpdateToken` coordinate path in
   `movement.mjs` both refuse a move for a token carrying `flags.sr2e.net`, checked
   BEFORE their tactical/uncapped early returns; `sr2eBypassMovement` passes it only for
   a GM.
5b. **Astral forms:** `astral-forms.mjs` `formData` strips `flags.sr2e.net` when it copies
   a body token (a netted body doesn't make a netted form). Ending projection while any
   of the actor's forms (on any scene) is netted is refused at the actor-update boundary
   (`preUpdateActor`: a non-GM change of `astralState` away from "projecting"), with
   "Your astral form is caught in a net"; a GM may still end it, and the reconcile that
   then deletes the form takes its net with it (noted in chat).
6. **Escape** (token HUD button and the card):
   - the card's escape button works only while the token's current net has
     `cardId === this card` (an old card can't touch a newer net); the HUD acts on the
     current net;
   - one client guard keyed by token uuid + net id, shared by both entry points;
   - turns entangled are brought up to date LAZILY by the escaping client itself (no
     background writer, so nothing races an escape or a replacement): the record keeps
     `turns` and `seen: {combatId, round}` (the highest round counted). At each attempt:
     same combat → add `max(0, round − seen.round)` and raise `seen` (a rewind adds
     nothing; a jump of three rounds adds three); no combat → add 1 (one turn per
     out-of-combat attempt); a different combat → first fold any uncounted rounds of the OLD combat if it still exists (`max(0, its round − seen.round)`), then start `seen` at the new combat's current round, adding nothing for the switch itself. The entangling commit
     initialises `seen` from the current combat;
   - when a combat is DELETED, the active GM folds its elapsed rounds into each netted
     token on that scene whose `seen.combatId` is that combat (`turns += max(0, round −
     seen.round)`, `seen = null`), re-reading the token and matching the net `id`
     immediately before the write; this is the only background write;
   - one attempt per Combat Turn: `lastAttempt: {combatId, round}`, re-checked after the
     dialog and again at commit;
   - roll at `escapeTN` (test created closed to Karma), commit re-reading the flag and
     matching `id`, then the outcome message; success clears the flag.
7. **Content data:** SSC and CSH weapons get `flags.sr2e.net = { size, astral }` through
   their generators (CSH generators keep art; SSC's gen is stale → patch packs-src
   directly). Item notes: replace the by-hand procedure with a pointer to the buttons.
8. **Tests.** Vitest for net-rules (both books' numbers, floor 2, the impossible case).
   Quench: a net hit posts a net card, not a damage card; Karma on the attack updates it
   and a resolved card is not reopened; resisting with fixed dice
   entangles (flag + overlay, on an idle token too), a moved token is refused; escape the same turn twice is
   refused; a later turn uses TN−turns; success clears it; an astral net flags only the
   astral token; projecting from a netted body makes an
   un-netted form; a player can't end projection while the form is netted; an old net's
   escape can't clear a newer net; a coordinate update of a netted token is refused.
9. **Docs:** CHANGELOG, QA-PLAN, module CHANGELOGs/notes.

## Key decisions & tradeoffs
- Token-level state (not actor) so astral nets hold only the astral form.
- "Unable to take any action" is not enforced on every roll (too many paths); movement
  is enforced and the card/HUD say the rest. Noted as a limit.
- A net card replaces the damage card for net ammo only; other "Special" weapons keep
  today's behaviour.

- Cross-client: two devices resolving the same net in the same instant can both pass
  the client guard (the same accepted limit as the ranged card); the per-net `id` keeps
  escape commits from clobbering a different net.
- Resist/escape tests are closed to Karma from creation. Karma on the ATTACK is
  reconciled until the net is resisted; the resist commit reads the source test and the
  outcome closes it. Cross-client limit (accepted, like the ranged card): an attacker's
  Karma action already in flight on another device in the instant the victim commits
  can still land on the attack test after the net was decided.

## Risks / open questions
- Turn counting outside combat (attempt count) is a judgement call.
- Pool spent on a net resist/escape: deducted like any test (rollSuccessTest).

## Out of scope
Blocking every action of an entangled character; nets against vehicles/drones.
