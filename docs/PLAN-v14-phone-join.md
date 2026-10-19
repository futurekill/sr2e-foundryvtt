# Plan: same-user phone join on Foundry v14
_Final — 5 Codex rounds; the open dose-recovery point moved out of scope (see REVIEW-LOG)_

## Goal
On v14+, "Open on phone" signs a PLAYER's phone in as the same user as their computer (as
the v13 `companion-join.html` page does), instead of telling them to use a separate phone
user. v13 is unchanged.

## Verified facts (v14.369, tested live 2026-10-19 on the isolated install)
- v14 serves every `.html`/`.xhtml` under the data folder as `text/plain` and SVGs with a
  no-script CSP. `/join` POSTs must be same-origin. So no hosted page can do the join,
  and none is attempted: Foundry's own join page and real password auth are used.
- Foundry's join page disables a user only because it's in `activeUsers` (live socket
  connections). The server accepts a second session for an online user.
- `game.socket.disconnect()` on the computer makes the user selectable on an
  ALREADY-OPEN phone join page, live. The phone joins with the password. Both devices
  then work as that user.
- A MANUAL reconnect doesn't re-fetch world data, and in-flight acknowledgements are
  dropped on disconnect (Codex round 1, source-checked). So this flow never resumes the
  socket: it RELOADS.
- An unauthenticated `/game?companion=1` is sent to `/join` with that path stored as the
  redirect (`gameRedirect`), so after joining the phone lands in companion mode. A phone
  ALREADY signed in to this world opens that account directly.

## Approach
1. **Who gets it:** players on v14+. GMs keep a separate phone user: two clients of one
   GM would both pass `game.users.activeGM?.isSelf`, and GM-only automation could run
   twice. Their text says exactly that (not a claim that Foundry forbids two sessions).
   v13 keeps its page.
2. **The dialog (players, v14+):**
   - QR and link: `origin + getRoute("game") + "?companion=1"`.
   - Notes:
     - "If your phone is already signed in to this game as someone else, it will open
       that account: sign out there and scan again."
     - "If your name stays grey, Foundry is still open for you somewhere else (another
       tab or device): close it and try again."
     - "This page reloads when you're done; finish anything unsaved first."
   - Steps:
     1. Scan this and leave the join page open on the phone.
     2. **Let my phone in**: this computer goes offline and your name lights up.
     3. On the phone, pick your name, enter your password, Join.
     4. **I'm in**: this computer reloads.
   - A countdown shows during the window; if it runs out, the page reloads, and the
     dialog said beforehand to repeat "Open on phone".
   - **The offline window is MODAL** (DialogV2 `modal: true`): no game input until the
     reload. Its text says that anything done while offline is discarded.
3. **`letPhoneIn({ seconds = 90, reload = () => location.reload(), socket = game.socket })`**,
   one window at a time:
   - It refuses if `socket.connected` is false, or a window is already open.
   - **Quiesce first, bounded.** `targeting.mjs` tracks EVERY outstanding target write
     (`shareTargets` keeps its promise in an in-flight set, including
     `writeFromCanvas`'s). `drainTargets({ timeoutMs = 3000 })` fires a pending
     debounced write at once, then awaits the in-flight set against the timeout. On a
     timeout, pairing ABORTS WITHOUT disconnecting ("try again in a moment").
   - `suspendTargetSharing()` then stops new map-target writes until the reload.
   - Only after that, it disconnects. Work already accepted by the server shows after
     the reload.
   - It sets an ABSOLUTE deadline, checked on a 1 s timer and on `visibilitychange` /
     `focus` (a sleeping laptop resolves on wake).
   - It ENDS ONLY by `reload()`: on I'm in, the deadline, Cancel, or the dialog closing.
     It never reconnects the socket itself.
4. **`phoneJoinMode(generation, isGM)`:** "page" on v13; on v14+, "sameUser" for players
   and "phoneUser" for GMs.
5. **Same-user automation: out of scope (an existing limit, not new here).** User-elected
   background writers (`doseDriverOf`'s on-load dose recovery; `designatedWriter`) can
   run on every connection of one user. That's already true with the v13 phone page and
   with a GM in two tabs. A correct fix needs connection-level coordination or
   server-enforced idempotency (Codex rounds 3–5), so it gets its own plan, tracked as a
   backlog task. This feature doesn't change `doseDriverOf`.
6. **Tests.**
   - Vitest: `phoneJoinMode` (version × role); a pure `windowState(now, deadline)`.
   - Quench, with a FAKE socket (`{connected, disconnect(), connect()}`), so the real
     client is never disconnected:
     - `letPhoneIn` flushes targets, then disconnects the fake;
     - the stubbed reload fires at the deadline and on close;
     - a second call is refused;
     - refused when the fake is disconnected;
     - a target drain that times out ABORTS with no disconnect;
     - an already-fired debounce timer is drained;
     - never calls `connect()`.
     - The GM-dialog assertion is scoped to v14+ (on v13, `phoneJoinMode` = "page").
   - **Manual two-device QA on v14** (docs/QA-PLAN.md):
     - the phone joins while the computer is offline, and the computer reloads;
     - targets and edits show on both;
     - another same-user tab keeps the name grey;
     - deadline expiry;
     - an already-signed-in phone;
     - a maneuver result and a dose recovery seen by both devices apply once.
7. **Docs:** CHANGELOG, QA-PLAN, the wiki "Playing on a Phone" page,
   `docs/PLAN-companion-join.md` (a v14 addendum), and memory.

## Key decisions & tradeoffs
- A brief, user-initiated disconnect, rather than any hosted page: nothing in Foundry's
  security model is bypassed.
- End with a page reload, never a socket resume.
- Players only; GMs keep the separate phone user (single-GM automation).

## Risks / open questions
- A write sent just before the disconnect may be committed by the server without this
  client seeing the result; the reload shows the stored state. The notes tell the player
  to finish unsaved work first.
