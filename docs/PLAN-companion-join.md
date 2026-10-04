# Plan: let a player's phone join while their computer is logged in
_Approved by Codex in round 3, with its two minor test fixes applied (see PLAN-companion-join-REVIEW-LOG.md)_

## Goal
A player is logged in on their computer and opens Foundry on their phone. The join
page won't let them pick their own name, because it greys out any user who is
already online. Give the phone a supported way in, so the mobile companion
(docs/PLAN-companion.md) works the way it was designed: the same user, on two
devices at once.

## Findings (verified against Foundry 13 on 2026-10-03)
- **Only the join page blocks it.** `templates/setup/parts/join-form.hbs` renders
  `<option … {{#if this.active}}disabled{{/if}}>`. The server's join handler
  (`dist/sessions.mjs` `authenticateUser`) checks the user exists, the password
  and the ban role, and **never checks whether the user is active**.
- **The server expects one user on several connections.** Activity keeps a user
  active while any of their sockets is connected (`heartbeat`: deactivate only when
  `user.sockets.length === 0`). Two logins of one user in one browser have run the
  companion and the desktop side by side since stage 3.
- **Logout is per browser session, for the active world.** It ends that browser's
  login (every tab sharing its cookie), but `Activity.deactivateUser` only marks
  the user inactive when they have no sockets left, so a second device with its
  own session stays logged in and online (Codex, rounds 1–2).
- **The join request is plain JSON.** The client posts
  `{action:"join", userid, password}` to `getRoute("join")`. Success returns
  `{status:"success", redirect}`; failure is a 401 whose body is an i18n key
  (`JOIN.ErrorInvalidPassword`, `JOIN.ErrorBanned`, `JOIN.ErrorUserDoesNotExist`).
  The server first runs `logoutWorld` on the posting session, which on a fresh
  phone is a no-op.
- **System files are public static files.** `GET /systems/sr2e/<file>.html` returns
  200 `text/html` with no session cookie, `Cache-Control: no-store`, and no CSP.
  A page there runs on Foundry's origin, so its POST gets and keeps Foundry's own
  session cookie. Foundry doesn't load system code on `/join`, so the join page
  itself can't be changed.

## Approach
0. **Fix first, in released code: `?companion=` must apply once.** `boot.mjs`
   re-reads `?companion=1` on every load, so "Open full Foundry on this device"
   writes "off", reloads the same address, and is switched straight back on. This
   already affects anyone who used `?companion=1`. After storing the choice, boot
   removes the parameter with `history.replaceState`. A Vitest test covers
   `stripCompanionParam(url)` (pure) and a Quench test covers leaving after
   entering with the parameter.
1. **`companion-join.html`, a static page in the system root**, self-contained
   (inline CSS and JS, no Foundry imports):
   - **Input:** `#u=<userId>&n=<name>`, parsed with `URLSearchParams` and never
     trusted. `u` must match `^[A-Za-z0-9]{16}$` (Foundry ids) or the page shows
     the "open this from your computer" message. The name is shown with
     `textContent` only; no `innerHTML` anywhere on the page. The fragment never
     reaches the server or its logs.
   - **Form:** "Sign this browser in as <name>", a password field ("leave blank if
     you have none") and Join. One line says it replaces any Foundry login this
     browser already has, because the server logs that browser out before it
     checks the password.
   - **Submit:** one request at a time. The submit handler sets an `inFlight` flag
     synchronously, returns at once if it's already set, and clears it in
     `finally`; the button is also disabled while it runs.
     It POSTs `{action:"join", userid, password}` as JSON to `<prefix>/join`, with
     a 15-second `AbortSignal.timeout`.
   - **Result:** success only when the response is 200, JSON, and
     `status === "success"`. Then go to `<prefix>/game?companion=1` (step 0 strips
     the parameter after it's applied). A 401 maps the three known keys to plain
     English. Anything else (HTML from a server with no world running, a proxy
     error, malformed JSON, a timeout) shows "Couldn't reach the game. Is it
     running?" plus the HTTP status, never the password. The form is usable again
     after any failure.
   - **`<prefix>`** is `location.pathname` with the exact suffix
     `/systems/sr2e/companion-join.html` removed.
2. **"Open on phone" button** on the player's computer, in the Settings sidebar
   (`renderSettings` hook), for every user, outside companion mode. It opens a
   DialogV2 with:
   - an **address** field, prefilled with `location.origin`. Editing it
     regenerates the link and QR. It's parsed with `URL`: only `http:` or `https:`,
     no username or password, and no path (beyond `/`), query or fragment; a
     trailing slash is dropped, and anything else shows an error instead of a QR.
     For `localhost` or a loopback IP the field says "your phone can't reach this
     address; enter the one it can, e.g. http://192.168.1.20:30000". For a `.local`
     name it says "your phone may need a different address";
   - the **QR code** of `<address>` + `foundry.utils.getRoute("systems/sr2e/companion-join.html")`
     + `#u=…&n=…` (`getRoute` supplies the route prefix);
   - the link as text, with a Copy button;
   - one line: "Scan with your phone's camera. You'll be asked for your Foundry
     password, if you have one."
3. **QR code:** vendor `qrcode-generator` (Kazuhiko Arase, MIT, one file, about
   20 KB minified) as `module/vendor/qrcode.mjs`, with its licence header kept.
   Render it as an SVG. No npm runtime dependency and no CDN, since tables are
   often offline.
4. **Tests:**
   - Vitest for the pure parts in `companion-rules.mjs`: `joinLink`,
     `pagePrefix(pathname)`, `parseJoinFragment` (rejecting malformed ids; names
     are kept as literal text), `joinError(status, contentType, body)`, `stripCompanionParam`.
   - Quench: the Settings button opens the dialog with a QR `<svg>` and the right
     link, and editing the address changes both. The shipped page loaded in a
     same-origin iframe with a hostile fragment (`n=<img src=x onerror=…>`)
     renders it as text and runs nothing. Two submit events dispatched back to
     back send one request (fetch stubbed). Leaving companion mode after
     `?companion=1` sticks.
   - Live, in two real browsers with separate cookie stores (the browser pane and
     a second browser or profile, or the user's phone), using the shipped form:
     - the user online in browser A; the form in browser B signs in, `/game`
       loads, and both clients are connected;
     - a wrong password in B shows the error, and leaves A untouched;
     - B already signed in, then a failed attempt in B: B's world login is gone
       (the disclosed behaviour) and A is untouched;
     - logging out in B leaves A online, and A reloads and resumes without
       signing in; B signs in again and reconnects;
     - leaving companion mode in B sticks.
5. **Packaging:** the release rsync excludes `*.md`, not `*.html`, so the page
   ships. Check the zip once.

## Key decisions & tradeoffs
- **The phone gets its own login, not a copy of the computer's.** The rejected
  alternative put the computer's session cookie in the QR code: a bearer token
  for a day, shared logout, and a secret in a URL. The chosen way sends no secret
  anywhere and uses Foundry's own join route and password check.
- **A page served from the system folder, not a change to Foundry's join page.**
  The join page loads no package code. Patching core files would break on every
  update.
- **userId in the link.** User ids aren't secret. Foundry's join flow exposes the
  user list before login (`handleSocket`), so a picker on the page is possible,
  but the link already names the right user and a picker adds a socket client to a
  static page for no gain.
- **Forcing companion mode on.** A tablet bigger than 1024×768 that comes in this
  way gets the companion too, which is what the link is for. The tradeoff: a
  player who wanted the full interface on a big tablet needs one tap to leave.

## Risks / open questions
- **Logging out on one device** leaves the other online (corrected after Codex
  rounds 1–2). The live test still checks it.
- **A future Foundry may refuse a second active login on the server.** The page
  then shows the server's error, and the fallback is a second user per player.
  Covered by the v14 compatibility backlog.
- **Rate limiting.** The page adds no new way to guess passwords: it is the same
  route the join page uses, at the same speed.
- **The QR code shows the user's id and name, not a password.** Anyone who scans it still
  needs the password. Users with no password are already open to anyone on the
  join page, so nothing changes for them.

## Out of scope
- A user picker on the helper page.
- Passwordless or one-time pairing codes. They need server support Foundry doesn't
  offer to packages.
- Changing Foundry's join page.
