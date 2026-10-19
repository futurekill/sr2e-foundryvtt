# Plan Review Log: v14 phone join
Started 2026-10-19. MAX_ROUNDS=5.

## Round 1 — Codex
The plan needs revision. Source inspection confirms that manual disconnect shows an error notification, **does not block editing**, and disables automatic reconnection. A successful manual `connect()` emits the socket’s `connect` event, bypassing Foundry’s manager-level `reconnect` handler and its refresh after five seconds. No files were modified.

1. **High — The desktop returns with stale world data.** Foundry does not fetch world data again on manual reconnect. Actor, combat, and target updates made during the window are missed; `module/targeting.mjs` only reapplies targets on `updateUser` or `canvasReady`, neither of which repairs a missed update automatically. Evidence: `public/scripts/foundry.mjs:206729`, `:206780`; Socket.IO `socket.js:604`.
   **Fix:** Reload the desktop after pairing and explicitly account for pending writes before disconnecting.

2. **High — “Writes would wait” is false for already-sent requests.** Socket.IO clears acknowledgements for sent packets on disconnect; Foundry’s `SocketInterface.dispatch` uses an ordinary callback without a timeout, so a write may commit server-side while its client promise hangs forever. In `updateSharedTargets`, that can stall every subsequent queued target change. New offline writes buffer and flush before the socket’s `connect` event, potentially overwriting newer phone state. Evidence: `socket.js:460–485`, `:604–626`; `foundry.mjs:81243`.
   **Fix:** Remove the blanket buffering assurance and require pending operations to settle while preventing new writes throughout the window.

3. **High — Another same-user connection prevents pairing entirely.** The plan calls other tabs “unaffected,” but `Activity.deactivateUser` refuses to deactivate a user with any sockets remaining; the phone’s option therefore stays disabled.
   **Fix:** Make closing all other same-user game connections an explicit prerequisite and provide a fallback when the name never becomes selectable.

4. **High — GM confirmation does not address duplicate automation.** After pairing, both clients have the same GM identity and can pass `game.users.activeGM?.isSelf`; existing handlers such as those in `module/spell-effects.mjs` can consequently execute twice. Disconnecting also does not suspend JavaScript or guarantee background work pauses.
   **Fix:** Exclude GM accounts from same-user pairing until automation elects a single client, rather than a single user.

5. **Medium — Socket connectivity does not prove authenticated recovery.** `dist/server/sockets.mjs:activate` can establish a socket with a valid session but `userId: null`; Foundry’s session listener only checks `sessionId`, and the existing page does not rerun `Game.getData`’s user check.
   **Fix:** Validate the new `session` response against the original user before declaring success, redirecting through normal authentication on mismatch.

6. **Medium — Opening `/join` already changes the phone’s session.** `JoinView.handleGet` calls `logoutWorld`, before any password submission; POST does so again before authentication. This removes that browser session’s world login, affecting other tabs sharing its cookie, although an independent desktop session remains intact.
   **Fix:** Disclose before scanning that opening the link replaces the phone browser’s existing world login, and test shared-cookie tabs separately from independent browsers.

7. **Medium — Plain `/join` does not reliably enable companion mode.** A stored `"off"` overrides phone detection, and large tablets may not qualify. Source confirms that an unauthenticated `/game?companion=1` redirect survives through `gameRedirect`, but an already-authenticated phone opens its current account directly.
   **Fix:** Use the prefixed `/game?companion=1` link and explicitly handle the already-authenticated phone/account case.

8. **Medium — The timeout races against user selection.** When the desktop reconnects, `JoinGameForm._syncPartState` clears a selected user who becomes active; someone still entering their password loses the selection. A sleeping desktop can also delay the timer, so `finally` does not guarantee a bounded 60-second window.
   **Fix:** Explain expiry and provide a repeat-window action, using an absolute deadline checked when the desktop resumes.

9. **Medium — The proposed test misses the primary failures.** A one-second disconnect followed by one successful write establishes neither state recovery nor preservation of pending operations.
   **Fix:** Add two-client tests covering missed world/target updates, an outstanding acknowledgement at disconnect, another same-user tab, expired authentication, and reconnect failure.

Authentication still checks the password, and the QR carries no bearer credential; the security concern is that a same-user GM phone receives full GM authority, regardless of its simplified interface.

The simpler alternative is to retain the separate-user flow and correct its inaccurate claim that v14 cannot support simultaneous sessions. If same-user pairing is essential, an explicit desktop leave-and-reload workflow avoids pretending the existing live client can safely resume unchanged.

VERDICT: REVISE
### Claude's response
Accepted all 9. The window now ends with a page reload, never a socket resume (1, 2, 5); another same-user connection keeps the name grey, so the dialog explains and offers a retry (3); GMs are excluded and keep the phone-user flow (4); the phone-login disclosure (6); /game?companion=1 as the link, with the signed-in-phone case covered (7); an absolute deadline checked on wake, plus a retry (8); a reload stub in Quench and a manual two-device QA script (9).

## Round 2 — Codex
Reloading resolves the stale-client and reauthentication problems. These flaws remain; no files were modified.

1. **High — Covering the screen does not stop writes or drain pending work.** [Plan lines 40–48](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-v14-phone-join.md:40) still allow timers and asynchronous continuations to emit after disconnect. For example, `writeFromCanvas` has a pending 120 ms timer; its offline write buffers, then disappears on reload. Already-committed operations can also lose their acknowledgements and never execute subsequent steps. “Nothing is lost that the server accepted” does not establish that an entire user action completed.
   **Fix:** Require an idle, saved state, flush pending target writes, and settle ongoing operations before disconnecting; explicitly disclose that reload discards unsaved work.

2. **High — Excluding GMs does not eliminate duplicate automated writers.** [designatedWriter](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2.mjs:798) elects a *user*, so both player devices pass; both `createChatMessage` handlers can read an absent receipt and submit the same maneuver update. [doseDriverOf](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:190) has the same assumption for interrupted-dose recovery. These are existing same-user compatibility problems that the proposed workflow exposes.
   **Fix:** Elect one connection for automatic player-owned writes, or make those operations server-idempotent, and test simultaneous processing on both devices.

3. **Medium — The logout disclosure contradicts the actual URL.** [Lines 24–28](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-v14-phone-join.md:24) say both that an authenticated phone opens its current account and that opening the link signs it out. `GameView.handleGet` renders the authenticated account; only visiting `/join` performs the logout. The phone may therefore display another user’s character without joining the intended account.
   **Fix:** State that the link preserves an existing login, instruct users to verify the account, and require signing out and rescanning when it differs.

4. **Medium — Quench cleanup recreates the unsafe reconnect path.** [Lines 60–63](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-v14-phone-join.md:60) reconnect the real client after stubbing reload, leaving missed updates and potentially unresolved promises in the test world; “any version” also conflicts with expecting v13 GMs to receive the phone-user dialog.
   **Fix:** Test transitions with an injected fake socket, reserve actual disconnect/reload for isolated browser QA, and scope GM-dialog assertions to v14+.

5. **Low — Retaining the “old advice” retains a false explanation.** [phone-link.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/companion/phone-link.mjs:36) says Foundry cannot sign one user in twice, contradicting this plan’s verified behavior.
   **Fix:** Explain that GMs need a separate phone user to avoid duplicate automation, rather than claiming a Foundry authentication restriction.

The separate-user flow remains the simpler alternative if draining operations and coordinating automatic writers exceed this change’s scope.

VERDICT: REVISE
### Claude's response
(The plan file was rewritten whole after a botched scripted edit.) Accepted: target writes are flushed before disconnecting, and unsaved work is disclosed (1); the disclosure now matches the URL (3); a fake socket in Quench, GM assertions scoped to v14 (4); an honest GM reason (5). On (2): user-elected writers on two same-user devices already exist with the v13 phone page; the maneuver result is an identical set plus receipt, and dose steps are receipted, so a double application converges. Added a two-device QA check instead of a code change.

## Round 3 — Codex
The session flow and fake-socket tests now address the earlier concerns. Three concrete gaps remain; no files were modified.

1. **High — Dose receipts do not prevent concurrent duplicate creation.** The response claims double application converges, but [completeDose](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:243) checks a local receipt and `cardFor`, then creates a chat message before recording the receipt. Both devices can observe no card and call `ChatMessage.create`, producing two independently identified cards. Existing v13 exposure does not make this safe, and an ordinary manual test may miss the race.
   **Fix:** Require single-connection execution or server-enforced deduplication for dose recovery, verified by forcing both clients past the missing-card check before either creation completes.

2. **High — Flushing targets still leaves new offline writes possible.** [The revised procedure](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-v14-phone-join.md:48) no longer specifies blocking game input during the 90-second window. Foundry’s disconnect handler only displays a notification; a subsequent target click starts another timer, buffers its update, and loses it on reload. “Finish anything unsaved first” does not warn against editing during the window.
   **Fix:** Make the offline window modal, disable game input and new target writes until reload, and explicitly tell users that offline changes will be discarded.

3. **Medium — The target drain does not cover all existing target writes and can hang before the deadline starts.** [writeFromCanvas](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/targeting.mjs:81) calls `shareTargets` without retaining its promise or joining `queue`; clearing its timer cannot await a write already dispatched. Conversely, a connection loss during the proposed await can strand an acknowledgement indefinitely, before the countdown is established.
   **Fix:** Track all outstanding target writes, bound preparation with a timeout, and abort pairing without disconnecting if draining fails; test an already-fired timer and lost acknowledgement.

The reload approach remains viable, but the plan should resolve these cases rather than treating receipts or a single target flush as sufficient synchronization.

VERDICT: REVISE
### Claude's response
Accepted all 3: a per-connection lease on the User document (server-ordered) for dose recovery (1); a modal window, target sharing suspended, offline changes disclosed as discarded (2); every target write tracked, a bounded drain, abort without disconnecting on timeout, and tests for both (3).

## Round 4 — Codex
The modal window and bounded target drain address the previous write concerns. The new lease is still a blocker; no files were modified.

1. **High — The proposed lease does not provide mutual exclusion.** In [steps 1–3](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-v14-phone-join.md:65), client A can write its ID, wait 1.5 seconds, and begin recovery; client B then writes its ID, waits, and begins while A is still working. Both checks legitimately return true. Ordered updates guarantee eventual agreement on the flag, not exclusive execution, and delayed delivery makes checking a local User document even weaker. Duplicate dose cards remain possible.
   **Fix:** Replace the timed flag with serialization enforced by an authoritative coordinator or server-enforced idempotency; otherwise retain separate-user joining until coordination is implemented.

2. **Medium — The lease test cannot establish the claimed guarantee.** Two calls sharing one client’s User document do not simulate independent document caches, delayed broadcasts, or a second claimant arriving after the first starts work.
   **Fix:** Add a deterministic two-client test that pauses A inside recovery, starts B after A’s ownership check, delays broadcasts, and asserts that only one recovery can perform side effects.

VERDICT: REVISE
### Claude's response
Accepted: the lease is dropped. Dose recovery on load (the only background path) is coordinated by the active GM, a single connection since GMs are excluded from pairing; owners only with no GM online, a documented shortcut limit. The test asserts the election.

## Round 5 — Codex
Two blockers remain in the replacement coordinator. No files were modified.

1. **High — Electing the GM does not trigger recovery on that GM.** [The revised plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-v14-phone-join.md:65) changes `doseDriverOf`, but [recovery runs only on each client’s own `ready` hook](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:1010). If a player’s dose is interrupted while the GM stays connected, the returning player now skips recovery, and the GM never reruns it.
   **Fix:** Route recovery requests to the coordinator and test a player reloading with an unfinished dose while the GM remains connected throughout.

2. **High — Excluding GMs from this pairing button does not guarantee one GM connection.** A GM can already have multiple authenticated tabs, and the unchanged v13 join page explicitly permits multiple devices. Every such connection passes the active-GM identity check, preserving the duplicate-recovery race.
   **Fix:** Use connection-level coordination or server-enforced idempotency; do not infer exclusive execution from a user’s role or the pairing UI.

The documented no-GM limitation does not cover either case. If reliable coordination is outside scope, retaining separate-user joining remains the simpler alternative.

VERDICT: REVISE
### Claude's response
MAX_ROUNDS reached. Both findings are right about dose-recovery coordination: electing the GM would regress a player reloading while the GM stays online, and a role isn't a connection. That race predates this feature (the v13 page, GM multi-tab). Decision: doseDriverOf stays unchanged; the race is taken out of this plan into its own backlog task (connection-level coordination or server idempotency). The rest of the plan (modal window, bounded drain, reload-only ending, fake-socket tests) had no open findings.
