# Plan: persona tokens appear when a decker jacks in
_Draft 2 (2026-11-04), Codex-APPROVED in round 3 (docs/PLAN-matrix-persona-tokens-REVIEW-LOG.md). Extends docs/PLAN-matrix-jackpoints.md; reuses the astral-forms
pattern (module/astral-forms.mjs, docs/PLAN-astral-barriers.md Stage 2)._

## Goal
Make jackpoints as easy as summoning:
- **The GM** draws a jackpoint and its entry area once.
- **A decker** stands in it and clicks **Jack in**. Their persona token appears in the entry area on the Matrix scene,
  and their view goes there. When they jack out, or are dumped, the token goes away.
- No per-decker setup. A persona the GM placed and marked by hand keeps working exactly as today.

## Today (why it isn't like this)
- `canJackIn` refuses unless the GM has already placed and marked a persona token for that decker on that Matrix
  scene ("No usable persona … ask the GM to place one").
- Jackpoints round 1 (Codex R1) deliberately avoided creating and deleting tokens at runtime. The reasons:
  - TOKEN_CREATE/DELETE are world permissions, Assistant GM and up by core default;
  - owner/GM races;
  - orphans;
  - cleanup while someone is offline.
- **Astral forms later solved exactly this.** Only the ACTIVE GM's client writes, from a debounced, per-scene,
  desired-state reconcile, re-derived from fresh documents before every write. Duplicates converge on the lowest id,
  and no socket is involved. The same shape works here.

## Approach
1. **Pure rule** in `module/rules/jackpoint-rules.mjs`:
   - The function: `desiredPersonas({ tokens, liveSessions })` → `{ create: [actorId], remove: [{id, reason}] }`.
   - **Inputs:**
     - `tokens`: id, actorId, actorLink, and the flags `persona`/`personaManaged`.
     - `liveSessions`: actorId → destScene, from each actor's WINNING, valid session (`winner(sessionsOf(actor))` +
       `sessionValid`) while `matrixMode` is on.
   - **Create** when an actor has a live session to this scene and NO usable persona there, whether hand-placed or
     managed.
   - **Remove** a managed persona when:
     - its actor has no live session to this scene;
     - a hand-placed persona of the same actor exists here (the GM's wins);
     - it is a duplicate managed persona (keep the lowest id).
   - **Remove** a managed token that isn't usable or isn't linked to its actor (a GM hid it, or its link was changed):
     managed tokens are disposable, so an unusable one is replaced, never kept (R2 #4). Duplicate pruning ("keep the
     lowest id") runs among USABLE managed tokens only, so an unusable lowest-id token can never evict a good one.
   - **Never remove** a hand-placed persona (`persona` without `personaManaged`).
   - **Usability is one shared predicate** (`personaUsable`: not hidden, and sighted when the scene uses token
     vision), computed by the caller and passed in per token, so the pure rule and `canJackIn` can never disagree
     (R1 #6). Only a USABLE hand-placed persona suppresses or replaces the managed one; a hidden or unsighted
     hand-placed token is left alone, and the managed persona is created/kept beside it. `personaOn` changes to
     prefer usable tokens, then hand-placed over managed, then sort/id.
2. **The writer** is `module/persona-tokens.mjs`, a copy of the astral-forms skeleton:
   - `isWriter = game.user.isActiveGM`.
   - `reconcileScene(scene)` runs debounced per scene, behind a serial queue. It re-derives before each write, and
     re-checks `isWriter()` between writes.
   - **Token data for a new persona:**
     - It's built from the actor's prototype token (`actor.getTokenDocument({ actorLink: true })`), so it's linked and
       damage lands on the character.
     - Flags `{persona: true, personaManaged: true}`, `sight.enabled: true` (the jackpoints persona rule),
       `hidden: false` (a prototype set to hidden would otherwise make it unusable, R1 #6), and friendly disposition.
     - Image: the character's **Matrix icon** (new optional field on the Matrix tab, `system.matrixIcon`; VR2.0
       p.84's MPCP iconography); if that's blank, the prototype token's image.
     - Placement (R1 #8, R2 #5): scan the destination Region's bounds cell by cell; a cell qualifies only if the
       region CONTAINS the token's whole footprint — proved by geometry, not sampling: the footprint rectangle minus
       the Region's polygons (`region.polygons`, holes included) via the ClipperLib difference Foundry ships, contained
       iff the remainder's area is ~0 — and no other token overlaps it. (Concave notches and holes that miss any
       sample points are handled; a 2×2 prototype fits only where 2×2 is free.) If none is
       free, the first contained cell even though occupied (stacking beats landing outside). A Region with no
       contained cell at all (smaller than the token) → the region's first shape's centre, and a GM-facing
       console warning.
     - The destination Region is the session's SNAPSHOT (R1 #7): `enter` now records `destRegion` (uuid) beside
       `destScene`, and `sessionValid` also requires that Region to exist on `destScene`. Retargeting the jackpoint
       mid-session doesn't move a live persona; deleting the entry Region ends the session as deleting the scene does.
       Old session records without `destRegion` stay valid (fallback: the jackpoint's current destination, if it is
       on the snapshot scene).
   - **Which scenes a pass covers:** every scene that is some live session's destScene, PLUS every scene holding a
     managed persona token, whatever the sessions say (R1 #4: a create that lands after its session ended is then
     still found and removed). Every completed write reschedules its scene, so the post-write state is re-derived.
   - **Triggers** (all document hooks, which replicate to every client), mirroring astral-forms.mjs:
     - updateActor touching `system.matrixMode`, `flags.sr2e.matrixSessions` or `system.vr2Conn`;
     - createToken/deleteToken on any scene;
     - updateToken when `flags.sr2e.persona`/`personaManaged` (including `-=` deletions), `actorLink`, `actorId`,
       `hidden` or `sight` change — never on plain movement (R1 #5);
     - deleteActor; deleteRegion (a destination Region going away);
     - `ready`, and `userConnected` when this client is (now) the writer, for a full pass — the same handoff
       astral-forms uses (R1 #3).
3. **Jack-in flow** (`jackpoints.mjs`):
   - `canJackIn` no longer requires a persona. The GM is always playing along with the players (the user,
     2026-11-03), so there's always a writer. If none is active at that moment, the jack-in still goes ahead and the
     persona appears when the GM's client reconnects: its `ready` pass creates it.
   - `enter` writes the session (now with `destRegion`) as today. Before `showScene`, it waits up to ~5 s for a
     usable `personaOn(actor, destScene)`. The wait is on the replicated token, not a socket.
     - The wait loop ALSO ends the moment the session stops being live (matrixMode off, the key gone or no longer
       the winner, or `sessionValid` false) (R1 #2). After the wait, the existing "still ours, still the winner,
       still on" re-check runs again before `showScene` — now including `sessionValid` (R2 #3) — so a dump or an
       invalidated session during the wait cancels instead of switching.
     - A jack-out on the SAME client would queue behind `enter` in `matrixQueue` and so couldn't end the wait. So
       `jackOut` first adds the actor to a local `LEAVING` set (before enqueueing, on both the core and VR2.0 paths);
       the wait loop exits on it and `enter` takes its cancel path; the queued jack-out then runs as today and clears
       the flag (R2 #2). Jack-outs from other clients arrive as actor updates and end the wait through the
       "session stops being live" check.
     - If the persona appears, the view pans to it.
     - If it doesn't, the view switches without the pan, and a notice says the persona will appear when the GM's
       client catches up.
   - **Late pan (R1 #1):** today, once the tab is `entered`, `reconcileTab` returns "stay", so nothing would pan.
     Add a `createToken` hook on the decker's own client: when the created token is a usable persona of the tab
     record's actor, on the record's `destScene`, the record is `entered`, its session is still the live winner,
     and the canvas is showing that scene, pan to it once (a `panned` flag on the tab record stops repeats).
     A persona created DURING `showScene` (record still `pending`) would be skipped by that hook, so right after
     `enter` marks the record `entered` it checks once more for a usable persona and pans if it hasn't. `panned`
     is set by BOTH the immediate pan and the late one (R2 #1).
   - **Jack out / dump / crash:** nothing new. They already end the session, and the writer removes the managed token.
     A hand-placed one stays, as today.
4. **The token HUD** keeps the GM's **Matrix persona** toggle for ordinary tokens (mark/unmark → hand-placed, as
   today). On a MANAGED persona the button becomes **Keep this persona** (adopt), never unmark/delete (R1 #9):
   - Adopting clears `personaManaged`, making it hand-placed and permanent.
   - The HUD never deletes a token. Only the writer deletes managed ones. A GM who deletes a managed persona by
     hand during a live session gets a fresh one (documented: "jack the decker out to remove it").
   - Adoption runs only on the active GM's client, INSIDE the writer's per-scene queue, re-checking the token still
     exists; non-active GMs see the button disabled with "only the active GM's client can do this" (R1 #10). So an
     adoption and the writer's delete can't interleave: whichever runs first, the second re-derives and sees it.
5. **Sheet jack-in** (no jackpoint) is unchanged: no token, no map. It's still the no-setup way to deck.
6. **Frames (part 6)** reuse this writer for frame icons on the Matrix scene: "a session wants an icon here" becomes
   "a running frame wants an icon here". That's noted, not built here.
7. **Tests.**
   - Vitest on `desiredPersonas`:
     - create when missing;
     - no create when hand-placed;
     - remove when the session ended;
     - remove a managed duplicate (lowest id kept);
     - never remove a hand-placed persona;
     - remove the managed persona when a hand-placed one appears.
   - Quench `sr2e.persona-tokens`, as the GM, scoped to its own scenes:
     - a jack-in creates exactly one linked, sighted persona in the entry region;
     - jack-out removes it;
     - a hand-placed persona is used and kept;
     - two quick jack-ins converge on one token;
     - the GM `ready` pass removes a stale managed token;
     - with no active GM, the jack-in proceeds and the GM's `ready` pass creates the persona;
     - VR2.0 dump shock removes it;
     - session ended WHILE the create is in flight (delayed write via a test seam): the orphan is removed (R1 #4);
     - writer handoff: `isWriter` forced false then true + a `userConnected` pass catches up (R1 #3);
     - adopt vs. pending removal: adopt then end the session → the adopted token survives (R1 #10);
     - late pan: the persona arrives after the wait → the tab pans once; arrives during `showScene` → still pans
       once (R1 #1, R2 #1);
     - same-client jack-out during the wait → cancel, no scene switch (R2 #2);
     - a managed persona hidden, unsighted, or unlinked by the GM → replaced by one usable token, converging (R2 #4);
     - a hidden hand-placed persona → a managed one is created beside it; un-hiding it removes the managed one (R1 #6);
     - placement in an L-shaped Region and in a Region with a hole/notch that misses a cell's centre and corners:
       every created token's footprint is contained (R1 #8, R2 #5); a 2×2 prototype too;
     - retargeting the jackpoint mid-session leaves the persona where it is; deleting the entry Region ends the
       session and removes it (R1 #7).
   - Two GM clients can't run in one Quench session; the single-writer rule is covered by the `isWriter` seam.
   - Live: a player client (Player2, no password) jacks in at a jackpoint with no hand-placed persona.

## Key decisions & trade-offs
- **The GM's client is the only writer**, as astral forms are. It works whatever the table's TOKEN_CREATE setting is,
  with no socket relay, which is unreliable at this table (CLAUDE.md). A GM is always at the table (user, 2026-11-03),
  so this costs nothing in practice.
- **Managed tokens are disposable**, hand-placed ones are the GM's. Two flags rather than one, so the cleanup can
  never delete something the GM made.
- **Removal on session end**, not just hiding: a hidden stale token would trip `personaUsable` and clutter the scene.
  The next jack-in makes a fresh one.

## Risks / open questions (for Codex)
- The pause between the session write and the token appearing (the GM's debounce plus the round trip). The jack-in
  shouldn't feel broken; hence the wait-then-pan, and the later pan by reconcile.
- A decker with sessions on two Matrix scenes: `winner()` already picks one live session, so there's one persona.
- **Region events: PROBED 2026-11-04, live, on a throwaway scene.**
  - Creating a linked token inside a Region fires that Region's behaviours with **`tokenEnter`** (not
    `tokenMoveIn` or `tokenAnimateIn`), whether or not anyone views the scene. The created token's `regions` already
    holds the Region.
  - So a behaviour on the ENTRY Region reacting to `tokenEnter` runs once per jack-in. Examples: a Pause Game, a
    Teleport, or a script.
  - The jackpoint behaviour itself declares no events, so it's unaffected.
  - Plan: document it as GM-facing ("anything on the entry area that reacts to a token entering runs when a decker
    jacks in"). That's arguably what a GM wants, e.g. an alert script. Persona creation doesn't suppress it.
- **Ownership: PROBED.** A token from `actor.getTokenDocument({ actorLink: true })` is linked, and ownership is the
  actor's (the player keeps OWNER), so no ownership data goes on the token.
- The token is created from the prototype, so the prototype's own ownership and vision settings carry over. Verify a
  player still owns it (actorLink makes ownership the actor's).

## Documentation (part of done)
- **Wiki:** update "The Matrix" and the "Set up a Matrix jackpoint" how-to: no persona to place any more, and the
  optional Matrix icon. Include a new GIF of the persona appearing on jack-in and leaving on jack-out, and a screenshot
  of the Matrix icon field (headless Chrome + puppeteer-core + a CDP screencast, as the jackpoint and fat-bacteria guides were made).
- **In Foundry:** `npm run gen-guides && npm run build-packs guides` ships the updated how-to, with its images, in
  the SR2E Player Guides pack.

## Out of scope
- Drawing grid/host topology (part 7).
- Frame icons (part 6).
- NPC deckers on maps (still sheet-only, as today).
