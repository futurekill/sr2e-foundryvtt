# Plan: Matrix jackpoints — shifting a decker's perception
_Round 4 — simplified design (R1) plus the Round 2–4 amendments at the end; a later round wins_

## Goal
When a decker jacks in **at a jackpoint on the map**, their own screen shifts to a
separate **Matrix scene** where their persona is a token. The other players stay
on the meat-space map. The body stays where it was, marked as jacked in. Jacking
out, or being dumped, brings their view back. The sheet's plain **Jack In**
toggle is unchanged: no map, no shift, still fine for quick decking tests.

Decisions (futurekill, 2026-09-27): a **separate Matrix scene**; the trigger is
**stand at the jackpoint, then click**; the body **stays on the map, marked**.
Because the shift only happens at a jackpoint the GM placed, clicking Jack In on
the sheet never reveals whether a Matrix section exists.

## Probed (Foundry V13, the local world)
- `Scene#view()` has no permission check on the client, so a player's client can
  switch to any scene it has been sent. Per-client viewing is exactly the
  "only the decker's screen moves" behaviour.
- Tokens track `regions` (the regions they stand in), which gives a cheap
  "is this token at a jackpoint" test.
- `TOKEN_CREATE` includes PLAYER in THIS world's settings (roles 1, 3, 4); core's default is ASSISTANT. Irrelevant now: nothing creates tokens.
- Custom Region Behaviour types are registered through `documentTypes`
  (none yet in this system; core types are listed in
  `CONFIG.RegionBehavior.dataModels`).
- Being dumped already sets `system.matrixMode: false` (actor.mjs, dump shock).

## Design (Round 1: no runtime token creation or deletion)
Codex R1's core finding: creating and deleting persona tokens at runtime drags in
permissions (TOKEN_CREATE/DELETE are world settings, core default ASSISTANT),
races between owner and GM, orphans and offline cleanup. The simpler shape
removes all of it: **the only runtime writes are flags; the only cross-client
effect is one client's own view.**

1. **The jackpoint** — a Region Behaviour `jackpoint` (declared in `system.json`
   `documentTypes.RegionBehavior`, its data model registered in `init` alongside
   the core ones, with a label and icon). Fields, all GM-authored:
   - `destination`: a Region UUID on the Matrix scene (the entry area);
   - `label`; optional `host` (a Host actor UUID, suggested for system operations).
   Validated when saved (the destination resolves, is on ANOTHER scene, the host is
   a `host` actor) and again at every use. Behaviour data is GM-authored; players
   can't forge where a jackpoint leads.
2. **Persona tokens are placed by the GM, once.** Each decker gets a token of
   their (linked) actor on the Matrix scene, like any NPC placement. It stays
   there. While its actor isn't in a session it's drawn dimmed ("logged off",
   a `refreshToken` tint like the astral cue); nothing is created or deleted.
   If a decker jacks in with no persona on that scene, the GM gets a whisper
   ("place <name>'s persona on <scene>") and the view still shifts to the entry.
3. **Eligibility** (one predicate, used by the HUD, the action and tests):
   - a **character** with a **linked** token (v1: NPC deckers keep the sheet toggle
     — the dump and Matrix-resistance paths are character-only);
   - a usable deck by the SAME rule the Matrix uses: the effective deck snapshot
     (`system.cyberdeck.mpcp > 0`, i.e. an active deck, a working cranial deck, or
     manually entered specs);
   - the token document stands in a region with an **active** jackpoint
     behaviour (`hud.object.document.regions`); several → the button lists each;
   - not already in a session.
4. **Jacking in** (the clicking client, in a per-actor queue):
   - ONE actor update: `system.matrixMode: true` and
     `flags.sr2e.matrixSession = { id, jackpoint (behaviour UUID), originToken
     (token UUID), user, since }`. Where it leads is NOT stored — it's re-read from
     the jackpoint each time.
   - The body token gets `flags.sr2e.jackedIn = <session id>` (owner may update its
     own token), drawn as a marker by `refreshToken` — that token only, not the
     actor's other tokens.
   - THIS client records `sr2e.matrixView = {actor, session, originScene}` in
     `localStorage`, then views the destination scene and, once the canvas is
     ready, pans to the persona (or the entry region's centre if there's none).
   - A short chat card: "<name> jacks in at <label>".
5. **Coming back**: whenever `matrixMode` turns off while a session exists (the
   sheet toggle, dump shock, a GM edit, "Jack out" on the persona's or the body's
   HUD):
   - any owner or the active GM clears `flags.sr2e.matrixSession` and the body's
     `jackedIn` flag **only if they still carry that session's id** — idempotent,
     so racing clients and repeats are harmless, and a newer session is never
     cleared by an older one's cleanup;
   - the client whose `localStorage` view record matches that session views the
     origin scene again and forgets the record. No other client's view moves.
6. **Reload and reconciliation**: on `ready`, a client with a view record views
   the destination again if its session is still live, otherwise the origin (and
   forgets the record). The active GM clears any body `jackedIn` flag whose actor
   has no matching live session, and any session whose actor's `matrixMode` is off
   — so a dump while everyone was offline heals at the next GM login.
7. **What stays cosmetic, stated**: scene hiding (navigation off) is cosmetic; a
   player can always view a scene their client has. The feature is about moving
   the decker's attention, not secrecy.
8. **Combat**: `matrixMode` is actor-wide, so while jacked in, the character's
   Initiative is Matrix Initiative (as with the sheet toggle today); the persona and
   the body are separate combatants only if the GM adds both. Stated in the docs;
   no automation.

## Out of scope (for now)
- Combat across two scenes: Foundry keeps combats per scene; Matrix initiative
  already follows `matrixMode`. A decker in both fights is run by the GM as today.
- Riggers jumping into a drone's view (a similar idea; later, if wanted).
- Hiding the Matrix scene from other players who have permission to view it:
  it's hidden from navigation, which is enough for a table.

## Tests
- Unit: eligibility (character, linked, deck snapshot, active jackpoint, no
  session), the cleanup rule (clear only matching session ids), and the view
  reconciliation (record + session state → view destination / origin / nothing).
- Quench (GM client, a scratch scene pair) — plus a manual two-client QA pass in
  docs/QA-PLAN.md (a player login) for what one client can't prove:
  - a token in a jackpoint region gets the button; out of it, or without a deck,
    it doesn't;
  - jacking in: matrixMode on, the session flag, the body status, a persona token
    at the entry region, and the view on the destination scene;
  - the sheet's plain Jack In never creates a session or moves the view;
  - Jack out, dump shock and the sheet toggle all end the session: persona gone,
    status off, view back, flag cleared — once, however many fire;
  - a deleted destination region or scene ends a session cleanly on reload.

## Round 2 amendments (Codex R2) — override the Round 1 design where they differ

1. **Shared state, stated precisely**: the writes are the actor's `matrixMode` and
   its session records; the only local-only effect is one tab's view. Nothing else.
2. **Sessions are keyed records**: `flags.sr2e.matrixSessions.<id> = { jackpoint,
   originToken, user, since }`. Starting one ADDS its key; ending one DELETES ITS
   OWN key (`-=<id>`), so no cleanup can ever remove a different session.
   - **Arbitration**: if two keys are live at once (two owners clicked together),
     the earliest (`since`, then id) is THE session; every client whose tab holds a
     losing id cancels it immediately (deletes its key, keeps its view).
   - **Ending**: when `matrixMode` goes off, every client that holds a session key
     in its tab deletes that key and returns; the active GM deletes any leftover
     keys (actor `matrixMode` off, or a key older than the live one).
3. **Re-check after every wait** (a dump mid-jack-in): the sequence is
   add key + matrixMode → re-read (key still present, matrixMode still on, still
   the winner) → switch view. If any check fails, it deletes its key and stays put.
4. **The body marker is derived, not written**: `refreshToken` marks a token when
   its actor has a live session whose `originToken` is that token's UUID (and the
   token really is that actor's). No token flag, nothing to clean up.
5. **Tab-scoped view record**: `sessionStorage["sr2e.<worldId>.<userId>.matrixView"]
   = { actorUuid, session, originScene }`. One participating session per tab; a
   duplicated tab inherits it and behaves as the same decker's view. Returning
   happens only while this tab is still viewing that session's destination; a
   player who wandered to another scene isn't yanked back.
6. **View transitions are serialised and verified**: wait for `!canvas.loading`,
   `scene.view()`, then confirm `canvas.scene.id` is the target (retry a few times;
   warn if it never gets there). The record is kept until the switch is confirmed.
7. **Personas are marked by the GM**: a GM-only Token HUD toggle "Matrix persona"
   sets `flags.sr2e.persona = true` on a token (linked, a character) on a Matrix
   scene. A persona is lit when its actor has a live session whose destination is
   that token's scene; otherwise it's dimmed. The dimming is re-derived from the
   document on every refresh (tint and alpha restored when active), and the
   actor's tokens refresh whenever its sessions or `matrixMode` change.
   **No persona → no jack-in**: the button shows as unavailable ("no persona on
   <scene> — ask the GM"), so nobody lands blind. Jack out is on the persona's HUD
   and the sheet toggle always works.
8. **Invalidation**: at every use and on `ready`, a session's jackpoint behaviour,
   its destination region/scene and its origin token are resolved again.
   - Behaviour gone or disabled, or destination gone → the session ends (its key is
     deleted; `matrixMode` stays as the sheet has it) and the tab returns.
   - Origin scene gone → return to the active scene instead.
   - The destination is ALWAYS re-read from the behaviour, so a GM edit retargets
     live and reloaded sessions (stated, intentional).
9. **Ownership at action time**: jacking in and Jack out check the user owns the
   actor (and the body token) inside the action, not just in the HUD. The GM's
   reconciliation checks a record's `originToken` belongs to that actor before it
   uses it.

## Tests (replaces the list above)
- Unit (pure helpers): eligibility; arbitration (earliest live key wins; losers
  cancel); the end rule (each client deletes only its own key; the GM deletes
  leftovers); marker derivation (only the origin token of a live session);
  persona lit/dimmed; view reconciliation from (tab record, sessions, matrixMode,
  current scene) → destination / origin / active scene / nothing.
- Quench (GM client, scratch scenes): the button appears only in an active
  jackpoint with a persona; jack in writes one key and matrixMode and shifts the
  view; the sheet toggle never creates a session; dump shock / Jack out / the
  sheet toggle end it; a deleted destination or disabled behaviour ends it on the
  next check; two keys written together → the later one cancels itself; a dump
  between the write and the view switch cancels the switch.
- Manual two-client QA (docs/QA-PLAN.md): a player login jacks in while the GM
  and a second player stay put; two tabs; a reload mid-session; the GM edits the
  jackpoint; the player's owner-only permissions.

## Round 3 amendments (Codex R3) — override earlier rounds

1. **Ordering: the system-wide one-driver contract, plus one queue** (R3 #3).
   As everywhere else in this system (drugs, Karma, ammo), one person drives an
   actor. On that client EVERY Matrix transition — Jack in, Jack out, the sheet's
   Jack In toggle, dump shock — runs in one per-actor queue (`matrix:<uuid>`), so a
   dump can't interleave with an entry: whichever is queued first completes before
   the other reads state. Simultaneous writes from two different clients to the
   same actor are outside the contract (stated); reconciliation (below) still
   converges.
2. **One arbitration function, used everywhere** (R3 #1): `winner(sessions)` =
   the earliest (`since`, then id). The active GM deletes EVERY non-winning key
   (not only older ones), and every key when `matrixMode` is off.
3. **The tab record carries its own history** (R3 #2, #4, #5):
   `{ actorUuid, session, phase: "pending"|"entered", originScene, destScene }`.
   - It is written as `pending` BEFORE the actor update, and becomes `entered`
     (with the destScene actually entered) once the switch is confirmed.
   - On load or any session change, the tab reconciles:
     - `pending`, its key present and winning → finish the entry;
     - `pending`, key absent → drop the record, stay where it is;
     - `entered`, its key gone or not the winner → return (to `originScene`, else
       the active scene) if the tab is still on `destScene`; drop the record;
     - `entered`, still the winner → stay (or re-view `destScene` after a reload).
4. **No live retargeting** (R3 #6): the destination is fixed when the session is
   entered (the tab's `destScene`). Editing the jackpoint changes where the NEXT
   jack-in goes. A deleted or disabled jackpoint, or a deleted destination scene,
   ends the session at the next reconciliation (ready, or any change to the
   actor's sessions or `matrixMode`); the GM can always end it by turning Matrix
   mode off.
5. **Lost tokens** (R3 #7): a missing origin token just loses its marker (it's
   derived); the session continues. A persona deleted mid-session leaves the tab
   where it is, with a notification; Jack out is available to any owner of the
   ACTOR — on the sheet toggle and on the persona HUD — with no body token needed.
6. **A definite, usable persona** (R3 #8): the persona is the first GM-marked
   token of that actor on the destination scene (by sort, then id). Entry requires
   it to be visible (not hidden) and, if the scene uses token vision, to have
   sight enabled; otherwise the button explains what the GM must fix.
7. **Tests** (R3 #9), in addition to the list above: a losing key that is already
   `entered` returns its tab; a disconnected loser's key is deleted by the GM; a
   dump queued behind an entry leaves no session and the tab at its origin;
   reload in `pending` (key present / absent) and in `entered` (key gone); a
   deleted jackpoint or destination during a session; a hidden or sightless
   persona blocks entry. Cross-client ordering is covered by the manual QA pass.

## Round 4 amendments (Codex R4)

1. **The session snapshots its destination** (R4 #1): each shared session record
   also carries `destScene` — the destination scene validated from the jackpoint
   when the session was created. Persona lighting, GM validation and every other
   client use that snapshot for the life of the session; the tab's own history is
   used only to find its way back. Retargeting the jackpoint affects only new
   sessions.
2. **Termination first** (R4 #2): before any phase handling, a tab treats
   `matrixMode: false`, a missing or losing key, or an invalid dependency (the
   snapshot scene gone) as TERMINATION — never as an entry to resume. So a reload
   after a dump's `matrixMode: false` but before its key was deleted returns the
   tab (and deletes the key), with no GM needed.
3. **A return keeps its record until it succeeds** (R4 #3): the phase becomes
   `returning`; the record is dropped only once the origin (or fallback) scene is
   confirmed on the canvas, or at once if the tab had already moved to some
   unrelated scene (nothing to return from). A failed switch is retried on the next
   reconciliation (a reload, or the next session change).
4. **A pending loser** (R4 #4): `pending` with its key present but NOT the winner
   → delete its own key, drop the record, don't switch.
5. **Tests**, added: retarget the jackpoint while the decker is offline, then
   reload (stays on the snapshot scene; personas lit there, not on the new target);
   reload with a winning key but `matrixMode` off and no GM (returns, key deleted);
   a return whose first `view()` fails, then succeeds on the retry (record kept,
   then dropped); a pending loser cancels without switching.
