# Plan: let a player's phone join while their computer is logged in
_Round 0: initial draft by Claude_

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
1. **`companion-join.html`, a static page in the system root.** It is
   self-contained: inline CSS and JS, no Foundry imports. It reads `#u=<userId>&n=<name>`
   from the URL fragment (never sent to the server or written to its logs) and shows
   "Join as <name>", a password field ("leave blank if you have none") and a Join
   button. On submit it POSTs `{action:"join", userid, password}` as JSON to
   `<prefix>/join`. On success it goes to `<prefix>/game?companion=1`. On failure it
   shows the error in plain English, mapped from the three known keys, with a
   generic fallback. `<prefix>` is the part of `location.pathname` before
   `/systems/`, so a server with a route prefix works too. With no `u` in the
   fragment, the page says to open it with the phone button on your computer.
   Nothing is stored. The password lives in one input and the one request.
2. **"Open on phone" button** on the player's computer: in the Settings sidebar
   (`renderSettings` hook), visible to every user, outside companion mode. It opens
   a DialogV2 with:
   - a QR code of `location.origin + <prefix> + /systems/sr2e/companion-join.html#u=…&n=…`;
   - the same link as selectable text, with a Copy button;
   - one line: "Scan with your phone's camera. You'll be asked for your Foundry
     password, if you have one."
   `location.origin` is the address this computer reached Foundry on, so it is
   reachable from the player's network. The exception is the host's own machine
   on `localhost`: then the dialog says to use the server's network address, and
   a GM can take it from Foundry's own Invitation Links.
3. **QR code:** vendor `qrcode-generator` (Kazuhiko Arase, MIT, one file, about
   20 KB minified) as `module/vendor/qrcode.mjs`, with its licence header kept.
   Render it as an SVG in the dialog. No npm runtime dependency, and nothing is
   loaded from a CDN, since tables are often offline.
4. **`?companion=1` on the redirect** forces companion mode on that device (stored
   per device, as stage 1 does), because the player came in through the phone
   link. "Open full Foundry on this device" still turns it off.
5. **Tests:** a Vitest suite for the pure parts, in `companion-rules.mjs`:
   `joinLink({origin, prefix, userId, name})`, `routePrefix(pathname)`, and the
   error-message mapping. A Quench test that the Settings button opens the dialog
   with a QR `<svg>` and the right link. A live check posting the page's request for
   a second login of a user who is already active: it gets a session, `/game` loads,
   and both devices stay connected.
6. **Packaging:** the release rsync excludes `*.md`, not `*.html`, so the page ships.
   Check it's in the zip once.

## Key decisions & tradeoffs
- **The phone gets its own login, not a copy of the computer's.** The rejected
  alternative put the computer's session cookie in the QR code: a bearer token
  for a day, shared logout, and a secret in a URL. The chosen way sends no secret
  anywhere and uses Foundry's own join route and password check.
- **A page served from the system folder, not a change to Foundry's join page.**
  The join page loads no package code. Patching core files would break on every
  update.
- **userId in the link.** User ids aren't secret: every logged-in client has them all.
  It saves asking the phone to list users, which it can't do without a session.
- **Forcing companion mode on.** A tablet bigger than 1024×768 that comes in this
  way gets the companion too, which is what the link is for. The tradeoff: a
  player who wanted the full interface on a big tablet needs one tap to leave.

## Risks / open questions
- **Logging out on one device.** `logoutWorld` calls `activity.deactivateUser`
  for the user, not the session. So "Log Out" on the phone may mark the player
  offline in the player list while their computer is still connected, until that
  socket reconnects. Cosmetic, but it should be documented, and checked live.
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
