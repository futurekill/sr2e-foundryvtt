# Plan Review Log: phone joins while the computer is logged in
Started 2026-10-03 23:08. MAX_ROUNDS=5. Plan: docs/PLAN-companion-join.md

## Round 1 — Codex
The basic mechanism checks out: the installed v13 server accepts another login for an active user. The plan still has material gaps:

1. **“Open full Foundry” will fail after this redirect.** `boot.mjs:31–35` reapplies `?companion=1` on every load; `setCompanion(false)` writes `"off"` and reloads the unchanged URL, immediately restoring `"on"`.
   **Fix:** Remove or update the `companion` query parameter when switching modes, and test leaving after QR entry.

2. **Route-prefix discovery is incomplete.** The helper page contains `/systems/`, but the desktop generating the QR is at `<prefix>/game`; the proposed parser cannot derive its prefix there.
   **Fix:** Generate the desktop link with Foundry’s `getRoute`, and derive the standalone page’s prefix by removing its exact known pathname suffix.

3. **The fragment creates an unspecified DOM-XSS boundary.** Both `n` and `u` are attacker-controlled; interpolating them into HTML on Foundry’s origin could expose credentials or the authenticated session. Keeping them out of server logs does not make them trusted.
   **Fix:** Require `URLSearchParams` encoding/parsing, `textContent` for displayed values, safe DOM property assignment, and malicious-fragment tests.

4. **An existing phone session is silently changed—even on failed authentication.** `JoinView.handlePost` calls `logoutWorld` before checking the password; a mistyped password removes the current world login from that browser’s session. Other tabs share that session.
   **Fix:** Explicitly disclose that submitting replaces this browser’s world login, and test existing-session success and failure.

5. **Duplicate submissions can race authentication.** The plan specifies no submission lock; repeated taps can overlap logout/authentication, and a fresh browser can receive competing session cookies.
   **Fix:** Allow only one outstanding submission, disable the form until completion, and test rapid double submission.

6. **Failure handling assumes too narrow a response contract.** With no world running, Foundry’s `_noWorld` renders HTML; network failures, proxy responses and malformed JSON also bypass the three authentication-key mappings.
   **Fix:** Specify timeout, response-type/status validation, explicit success validation, recoverable UI state, and credential-free diagnostics.

7. **Desktop reachability does not imply phone reachability.** Beyond `localhost`, loopback IPs, desktop-only VPNs, local DNS and different phone networks break the generated QR; merely mentioning Invitation Links does not produce a usable replacement QR.
   **Fix:** Allow a reachable base address to be entered or selected and regenerate the link and QR, preserving the route prefix.

8. **The logout finding is wrong for the inspected version.** `Activity.deactivateUser` itself checks `!user.sockets.length`; logout does not inherently mark a user offline while another socket remains.
   **Fix:** Correct the finding and test logout followed by reconnect using two independent browser cookie stores; same-browser tabs do not establish session independence.

9. **The proposed tests mostly miss the actual login page.** Pure helper tests and checking for an SVG do not exercise fragment rendering, POST behavior, cookies, retries or the companion exit regression.
   **Fix:** Add browser coverage of the shipped HTML and a two-session lifecycle check covering join, logout, reconnect and leaving companion mode.

One factual simplification: the claim that listing users requires authentication is misleading—Foundry’s join flow exposes users before world authentication (`JoinView.handleSocket`). Keeping the fixed-user link is reasonable, but that limitation should not justify the design.

VERDICT: REVISE
### Claude's response
Accepted all nine. (1) is a real bug in released boot.mjs: now step 0, fixed first with history.replaceState. (2) getRoute on the desktop, exact-suffix strip on the page. (3) URLSearchParams, id regex, textContent only, hostile-fragment Quench test. (4) the page discloses it replaces this browser's login. (5) single in-flight request. (6) strict success check, timeout, generic error with status. (7) editable address field that regenerates the QR, with a warning for localhost/loopback/.local. (8) finding corrected: logout is per connection. (9) tests now cover the shipped page in an iframe, the companion exit, and a two-cookie-store live check. On the user-list point: kept the fixed-user link and corrected the rationale.

## Round 2 — Codex
The revision resolves the main design blockers, but three concrete gaps remain:

1. **The editable address has no URL contract.** Concatenating an address containing `/join`, a route prefix, a trailing slash, query or fragment can generate a broken QR. A non-HTTP scheme should also be rejected.
   **Fix:** Parse with `URL`, accept only HTTP(S) origins without credentials, normalize trailing slashes, and explicitly reject paths, queries and fragments before appending `getRoute(...)`.

2. **The live-test alternative cannot prove the claimed behavior.** `curl` can authenticate and fetch `/game`, but cannot run Foundry’s JavaScript or establish its socket; it cannot demonstrate two connected clients, double-tap handling or logout/reconnect independence. Reconnect and existing-session failure checks are also still absent.
   **Fix:** Require two actual browser profiles/devices and test the shipped form, existing-session authentication failure, logout, and reconnection of the surviving client.

3. **Disabling the button is not a submission lock.** The plan equates these, but a form submission handler needs its own guard against alternate or programmatic submissions; otherwise duplicate POSTs can still overlap session mutation.
   **Fix:** Set and check an `inFlight` flag synchronously in the submit handler, reset it in `finally`, and test two submit events rather than only two button taps.

Two smaller corrections:

- **Logout is per session/world, not per connection.** Tabs sharing the cookie share the affected login, even though activity stays online while sockets remain.  
  **Fix:** Replace “per connection” with “per browser session for the active world.”

- **`.local` is not inherently unreachable from phones.** The categorical warning contradicts the preceding “may not resolve.”  
  **Fix:** Say “Your phone may need a different address” for `.local` names.

VERDICT: REVISE
### Claude's response
Accepted all five: URL contract for the address field (http/https origin only, no credentials/path/query/fragment, trailing slash normalised); live test needs two real browsers using the shipped form, incl. existing-session failure and reconnect (curl dropped); synchronous inFlight guard plus a two-submit-event test; logout wording corrected to per browser session for the active world; .local gets the softer 'may need a different address'.

## Round 3 — Codex
The previous material blockers are addressed. The plan is sound enough to implement. Two minor test corrections remain:

- **Reconnect the surviving browser A after B logs out.** A remaining connected does not prove its session can authenticate a new connection.  
  **Fix:** Reload A after B logs out and verify it resumes without signing in.

- **Hostile-name expectations conflict.** Vitest says names are rejected; the iframe test says they render as text. Safe text rendering is sufficient.  
  **Fix:** Specify that names are treated as literal text, while malformed user IDs are rejected.

VERDICT: APPROVED
### Claude's response
APPROVED. Applied both minor fixes: A reloads and resumes after B logs out; hostile names are literal text, only malformed ids are rejected.
