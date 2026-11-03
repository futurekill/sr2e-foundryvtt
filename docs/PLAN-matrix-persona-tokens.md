# Plan: persona tokens appear when a decker jacks in
_Draft 0 (2026-11-03). Not yet Codex-reviewed. Extends docs/PLAN-matrix-jackpoints.md; reuses the astral-forms
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
   - **Never remove** a hand-placed persona (`persona` without `personaManaged`).
2. **The writer** is `module/persona-tokens.mjs`, a copy of the astral-forms skeleton:
   - `isWriter = game.user.isActiveGM`.
   - `reconcileScene(scene)` runs debounced per scene, behind a serial queue. It re-derives before each write, and
     re-checks `isWriter()` between writes.
   - **Token data for a new persona:**
     - It's built from the actor's prototype token (`actor.getTokenDocument({ actorLink: true })`), so it's linked and
       damage lands on the character.
     - Flags `{persona: true, personaManaged: true}`, `sight.enabled: true` (the jackpoints persona rule), and
       friendly disposition.
     - Image: the character's **Matrix icon** (new optional field on the Matrix tab, `system.matrixIcon`; VR2.0
       p.84's MPCP iconography); if that's blank, the prototype token's image.
     - Placement: the first free grid cell inside the destination Region, scanning the region's bounds and skipping
       cells another token occupies. If the region is full, its centre, offset by the token's index.
   - **Triggers** (all document hooks, which replicate to every client):
     - updateActor touching `system.matrixMode`, `flags.sr2e.matrixSessions` or `system.vr2Conn`;
     - createToken/deleteToken on any scene that is some session's destScene;
     - deleteActor;
     - the GM's `ready` hook: a full pass over every Matrix scene, which cleans up after a crash or an offline GM.
3. **Jack-in flow** (`jackpoints.mjs`):
   - `canJackIn` no longer requires a persona. The GM is always playing along with the players (the user,
     2026-11-03), so there's always a writer. If none is active at that moment, the jack-in still goes ahead and the
     persona appears when the GM's client reconnects: its `ready` pass creates it.
   - `enter` writes the session as today. Before `showScene`, it waits up to ~5 s for `personaOn(actor, destScene)`.
     The wait is on the replicated token, not a socket.
     - If the persona appears, the view pans to it.
     - If it doesn't, the view switches without the pan, and a notice says the persona will appear when the GM's
       client catches up. Reconciliation pans later, as `reconcileTab` "enter" already does.
   - **Jack out / dump / crash:** nothing new. They already end the session, and the writer removes the managed token.
     A hand-placed one stays, as today.
4. **The token HUD** keeps the GM's **Matrix persona** toggle.
   - Marking a token by hand makes it hand-placed (`personaManaged` cleared), and the writer then removes any managed
     duplicate.
   - Unmarking a managed one deletes it, so the next jack-in recreates it.
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
     - VR2.0 dump shock removes it.
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
- Movement limiter and region behaviours on the Matrix scene: creating a token inside a Region fires
  `tokenMoveIn`-style events. The astral-forms work hit this: "Foundry splits a move at regions…". Check that the
  entry region has no behaviour that reacts to the creation.
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
