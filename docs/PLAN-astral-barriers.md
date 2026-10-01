# Plan: astral movement through walls, astral barriers, FAB zones
_Round 5 — final, after Codex rounds 1–5 (round 5 = MAX_ROUNDS) (see PLAN-astral-barriers-REVIEW-LOG.md)_

## Goal
Make token movement follow the astral rules. Something on the astral plane walks
through ordinary walls, because inanimate objects don't block astral movement.
Walls still block its sight. Living things and magical barriers stop it.
Physical bodies are unchanged: that includes a mage who is only perceiving, and
the comatose body of a projecting mage. On top of that, add the Corporate
Security Handbook's fat-bacteria (FAB) zones. Its items and the netgun come
later, in the sr2e-corporate-security module.

## Rules (verified from 110 dpi renders of the books, cited by printed folio)
- **SR2 p.145:** inanimate objects "block the passage of magical energy and
  emotions", so astral beings can't see or assense through a wall, but "can
  freely pass through the astral position corresponding to the object's
  physical space". Living things are corporeal on the astral plane and block
  movement: vegetation, and the Earth. Water, air and fire don't.
- **p.145:** an astrally *perceiving* magician is still bound by the body ("he
  cannot reach through a wall").
- **p.146:**
  - Projection: the body stays behind, comatose.
  - Normal astral movement is Astral Quickness (= Intelligence) × 4 m per Action
    Phase.
  - Fast movement is Magic km per action; the character "cannot assense or see
    the scene in detail without slowing to normal movement", and combat happens
    only between two fast-moving characters.
- **p.147:** hermetic circles and medicine lodges are astral barriers. Passing
  one means destroying it with an opposed test.
- **CSH p.37–39:** living walls stop astral forms and spirits. Passing needs an
  opening as large as the body.
- **CSH p.103:** FAB "prohibits 'fast' astral movement … restricts astral
  travelers to normal movement (Astral Quickness × 4)". It adds +4 to "any
  Astral Perception Tests made by a character in a fat bacteria-filled zone",
  and doesn't affect spellcasting or astral combat.
- **CSH p.103, FAB-UV:**
  - detection is "a successful Perception Test against a Base Target Number
    6", +1 TN per 50 m² searched, −1 TN "for every two individuals involved in
    the search";
  - one success spots the intruder;
  - attacks against a spotted intruder are at +4, −1 per additional success:
    "5 total successes eliminates the penalty", and six or more give no bonus
    (re-read from the render);
  - an aware intruder may make "a Stealth Test against a target number equal to
    the searchers' Intelligence", and each success "reduces the searchers'
    success total by 1".
- **CSH p.104:** FAB should only be used if everyone understands it. So
  everything is opt-in per scene.

## Approach

### Stage 1: astral tokens pass ordinary walls
1. Pure predicates in `module/rules/astral-rules.mjs` (Vitest):
   - `isOnAstralPlane(tokenFlags)`: true when the token has
     `flags.sr2e.astralForm` (Stage 2) or `flags.sr2e.astralOnly` (an
     unmanifested spirit, or any GM-marked astral token). It's a flag lookup
     only, O(1), with no actor access. The actor's `astralState` never counts,
     so a projecting mage's BODY token stays physical.
   - `astralBarrierKind(wallFlags)` returns `"living" | "fab" | "ward" | null`,
     read from `flags.sr2e.astralBarrier`.
2. `SR2EMovePolygon extends <whatever CONFIG.Canvas.polygonBackends.move is at
   init>` overrides `_testEdgeInclusion(edge, edgeTypes)`:
   - If the polygon isn't `type === "move"`, the source token isn't on the astral
     plane, the scene has astral walls off (item 4), or `edge.type !== "wall"`:
     return `super(...)`.
   - Wall edge with no barrier kind: return `false`. The astral form passes. That
     includes closed doors: it can't pass *under* a door, but it passes the door
     itself, which is inanimate.
   - `"living"` or `"fab"`: return `super(...)`. Physical blocking, direction,
     thresholds and the open-door state all apply. Foundry's door edge carries
     `edge.move = NONE` when the door is open, and `super` checks that.
   - `"ward"` (an astral-only barrier, e.g. a hermetic circle drawn as a wall
     with physical move NONE): include it if the edge isn't collinear with the
     origin. `edge.move` is ignored, because the ward stops nothing physical.

   One override covers `Token#checkCollision` and the movement-path collision
   helper; both build `PointMovementSource({object: token})`, verified in the V13
   client.
3. **Movement paths covered:** drag, ruler and path preview, keyboard nudges,
   and waypoints. **Deliberate bypasses**, as in the existing limiter:
   - teleport and `displace` (`walls: null` in CONFIG).
   - `blink` is NOT a bypass: V13 defaults its restriction to "move", so it is
     collision-checked and gets the astral rule.
   - `options.sr2eBypassMovement` skips only the system's distance limiter,
     never wall collision.
   - direct document updates by the GM.
4. **Per-scene switch:** the scene flag `flags.sr2e.astralWalls` (true / false /
   unset). Unset falls back to the world setting "Astral forms pass walls"
   (default ON, RAW). It's a checkbox in the Scene config.
   - Consequence, written into the CHANGELOG: existing unmanifested spirit tokens
     (`astralOnly`) now pass ordinary walls, which is the rule.
5. **Wall config:** a `renderWallConfig` hook (WallConfig is ApplicationV2 in
   V13; inject into the form the way the jackpoint/Scene config injections do)
   adds a select: Astral barrier = None / Living wall / Fat bacteria (cavity) /
   Ward or circle.
   - A `refreshWall` hook tints flagged walls green for the GM.
   - Choosing "Ward" offers to set physical movement, sight and sound to NONE.
6. **Aperture size** ("no sliding under doors", CSH p.39): left to the GM. The
   sweep is centre-line; a living wall with a small gap should be drawn without
   the gap.

### Stage 2: projection leaves the body (GM-driven lifecycle)
7. **Authority:** players can't create or delete tokens by default
   (`TOKEN_CREATE`/`TOKEN_DELETE` default to ASSISTANT, verified in
   `common/constants.mjs`). Socket relays are unreliable at this table (system
   CLAUDE.md). So the **active GM's client is the only lifecycle writer**. It
   reacts to actor and token changes that replicate to every client anyway, so
   no socket is needed.
   - With no GM online, projecting changes state only. The sheet warns: "no GM
     connected — your astral form will appear when one is".
   - The reconcile runs again on the GM's `ready`.
8. **Scope: linked actors only** (PCs and bound spirits). For an unlinked token
   (an NPC mage), the GM marks a token astral-only by hand, as today. The sheet
   says why no form appeared.
9. **Desired state**, as a pure `desiredForms(bodies, forms)` in
   `astral-rules.mjs`, tested:
   - A *body* is a token with `actorLink: true` whose actor's
     `astralState === "projecting"`, that isn't itself a form, astral-only, or a
     Matrix persona (`flags.sr2e.persona`, the jackpoints flag).
   - There's exactly one form per body, keyed by the body's full UUID in
     `flags.sr2e.astralForm`.
   - Every other token carrying `astralForm` is surplus: its body is gone or not
     projecting, or it's a duplicate for the same body.
10. **Reconcile** (`reconcileAstralForms(scene)`) runs on the GM client, through
    a per-scene serial queue debounced 100 ms. It's triggered by:
    - `updateActor` (astralState);
    - `createToken`, `deleteToken`, and `updateToken` (flags);
    - `canvasReady` and `ready`;
    - `userConnected` (GM handoff: the newly designated active GM reconciles every
      scene);
    - `deleteActor`, and `updateToken` changing `actorId` or `actorLink`.

    **Which scenes:** an actor-level trigger schedules every scene holding a token
    with that `actorId`, or a form whose `astralForm` UUID names such a token.
    **Authority** is rechecked (`game.user.isActiveGM`) immediately before every
    write.
    **Survivor:** among duplicate forms for one body, the lowest token id
    survives, and that's re-derived from fresh documents before each delete. Two
    tabs of the same GM user (Foundry designates users, not tabs) therefore pick
    the same survivor and converge. Deleting a document that's already gone is
    caught and ignored.

    Each pass reads the CURRENT documents, computes the desired state, deletes the
    surplus, then creates what's missing. It re-reads and recomputes before each
    write, so an exit that lands mid-create is fixed on the next pass. Creating is
    idempotent because the key is the body UUID: a duplicate made by a race is
    surplus next pass and gets deleted.
    - The body marker is not stored. Like jackpoints' `bodyMarked`, a
      `refreshToken` cue draws it whenever the token is a body by item 9. Every
      trigger above also requests `refreshState` on the affected tokens, so the
      cue redraws on each eligibility change.
11. **Form token:** a copy of the body's prototype data at the body's position
    (same actor, linked), with:
    - `flags.sr2e.astralForm = bodyUuid` and `astralOnly = true`;
    - `lockRotation` true;
    - a soft-glow tint, like the existing spirit FX.

    Visibility follows the existing `astralAllowsView` policy unchanged:
    - it's hidden from mundane viewers;
    - the documented **friendly** exception still applies, so an allied PC's form
      shows translucent to the party, exactly as an allied spirit does (a
      deliberate playability rule).
12. **Return:** when the actor leaves projection, the form is surplus and is
    deleted. The aura returns to wherever the body is. If the body token moved
    while the form was out, the GM gets a whisper card citing p.146 (the 6-hour
    search for the body).
13. **Combat:** the combatant stays bound to the body token, and its initiative
    is already Astral Reaction + 15 (actor-level). Stage 3's limiter resolves a
    form to its body's combatant.

### Stage 3: FAB zones and astral speed
14. **`fatBacteria` RegionBehavior**, registered like `registerJackpointBehavior`:
    - a `RegionBehaviorType` subclass with schema
      `strain: "fab1" | "fabuv"`, `uvLit: boolean`, and
      `uvEpoch: number (integer, initial 0)`;
    - registered in `CONFIG.RegionBehavior.dataModels`, declared in system.json
      `documentTypes` (needs a server restart), with a lang key;
    - its static `events` map registers `TOKEN_EXIT` (which covers moving out AND
      a region reshaped around a stationary token, unlike `tokenMoveOut`) for
      reveal cleanup (item 17).
    - **Epoch contract:** a `_preUpdate` on the behaviour type adds
      `system.uvEpoch + 1` to the SAME update whenever `uvLit` goes false→true or
      `disabled` goes true→false. One write, so no window opens.

15. **Astral speed in the movement limiter** (only when `movementLimit` is on, as
    today):
    - An astral-plane token is limiter-eligible when it, or for a form its body
      (`astralForm` UUID), is the active combatant's token.
    - The ledger is keyed by the moving token, so the form has its own.
    - Normal speed = Astral Quickness × 4 per phase: Intelligence for a mage's
      form; for an astral-only spirit, its Quickness (see Open questions).
    - **Fast movement** is a HUD toggle on a projection form,
      `flags.sr2e.astralFast`. The book gives fast rates for magicians only, so
      spirits have no toggle. While fast, the per-phase cap is the finite
      **Magic × 1,000 m** (Magic km per action, p.146). That's larger than any
      tactical map, but it is a real number on the same ledger. The HUD and chat
      warn that only fast movers can fight each other and the form can't assense.
    - **Ledger:** one per-phase ledger per moving token. Each segment of the
      finalized path is CHARGED BY THE MODE IT WAS TRAVELLED IN, into two
      cumulative totals:
      - `normalMetres`: every segment moved with fast off, plus every segment
        inside an enabled FAB region whatever the toggle (FAB forbids fast, CSH
        p.103);
      - `fastMetres`: segments moved with fast on and outside FAB.

      Segments come from V13's `TokenDocument#segmentizeRegionMovementPath(region,
      waypoints)`, which handles token size, shape, centre offsets and teleport
      actions. Overlapping FAB regions are counted as a union: each metre is
      charged once, by testing per segment whether it's inside ANY enabled FAB
      region.
    - **Caps**, both cumulative per phase: `normalMetres ≤ Astral Quickness × 4`
      and `fastMetres ≤ Magic × 1000`. Distance already travelled is never
      reclassified:
      - fast 100 m, then fast off and 1 m normal, is legal (normal 1 ≤ 24);
      - fast outside then 1 m into FAB charges that 1 m to normal.

      A split route and the unsplit one give identical totals. A move that breaks
      either cap is refused, as today.
    - The colour bands collapse to green (within normal) and red (over), because
      astral forms have no running.
16. **Astral perception +4:**
    - `rollSuccessTest` options take `observerTokenUuid`.
    - For tests tagged `astralPerception`, if that token sits inside an enabled
      FAB region, add +4 with a breakdown line.
    - This applies to perceiving magicians physically in the zone as well as to
      forms.
    - The tag's first user is the existing Astral Examination flow, if there is
      one; otherwise a minimal "Assense" roll (Intelligence, GM-set TN), because
      the +4 needs something real to hit. During implementation, grep for an
      existing assensing roll before adding one.
17. **FAB-UV search** (GM button in the fatBacteria behaviour's config, enabled
    only for `fabuv` with `uvLit` on):
    - **Searchers:** the GM's selected tokens. **The searcher who rolls** is the
      first selected (or chosen in the dialog). TN =
      `6 + ceil(area/50) − floor(searchers/2)`, minimum 2, where area is the
      region's area in m². That's the sum of the region's resolved polygon tree,
      with holes counted negative, NOT its bounding box; for a non-polygon shape,
      use `RegionDocument#polygonTree` directly, not the deprecated placeable getter. Convert px² → m² with
      `(grid.distance / grid.size)²`. It rolls one Perception test (the book's
      singular test, with helpers lowering the TN).
    - **Per intruder** (every astral-plane token inside the region):
      - the GM ticks whether this intruder is aware;
      - if it is, it rolls Stealth against the rolling searcher's Intelligence,
        and net = searcher successes − its successes;
      - net ≥ 1 reveals it, and the penalty is `max(0, 4 − (net − 1))`.
    - **Reveal record:** `flags.sr2e.fabReveal.<behaviorId> = {extra, epoch, gen}`
      on the intruder token, written by the GM. The live visibility predicate
      requires both `record.epoch === behaviour.system.uvEpoch` and
      `record.gen === token.flags.sr2e.fabExitGen[behaviorId] ?? 0` (strict
      equality). So UV off→on never revives an old reveal, and an exit-generation
      increment that lands AFTER a late reveal write still invalidates it.
    - **Serialization:** exit invalidation and search commits for the same token
      and behaviour run through one GM-side queue (`fab:<tokenUuid>:<behaviorId>`).
      Foundry doesn't await the `TOKEN_EXIT` handler, so the queue is what orders
      them.
    - **Membership generation:** the GM's `TOKEN_EXIT` handler, besides deleting
      the record, increments `flags.sr2e.fabExitGen.<behaviorId>` on that token.
    - **Stale-search guard:** when the search starts, it captures the behaviour's
      `uvEpoch` and each intruder's `fabExitGen` for that behaviour. Just before
      writing each reveal, it re-reads them. If the epoch changed, UV is off, the
      behaviour is disabled, the intruder's exit generation changed (it left,
      even if it has come back), or it isn't inside now, that intruder's result is
      posted as "void (conditions changed)" and not written.
    - **Cleanup on the actual transitions:**
      - the behaviour's `TOKEN_EXIT` event, handled on the active GM only,
        deletes that token's record for that behaviour. It fires for movement out
        and for a region reshaped around a token;
      - `updateRegionBehavior` with UV off or disabled deletes all of that
        behaviour's records (and the epoch already invalidates them);
      - the GM's reconcile on `ready` and on handoff sweeps leftovers.
      - Limitation, stated: with no GM online, an exit-and-re-enter can't be
        observed. The epoch still protects against UV toggles.
    - **`astralAllowsView`** gets a `revealed` input, computed LIVE when the
      decision is made. It's true only if some record's behaviour still exists,
      is enabled, is `fabuv`, has UV lit, and the token is in that behaviour's
      region now (`token.document.regions`). So a stale record can never reveal;
      the GM tidies records in the reconcile pass.
    - **Visibility refresh hooks:** `updateToken` (flags or position),
      `updateRegion`, `updateRegionBehavior`, and `deleteRegionBehavior`.
    - The chat card lists each intruder's result and attack penalty, which the
      attacker applies. We don't auto-apply it.

### Stage 4 (NOT this plan): the sr2e-corporate-security module
The items, the FAB-NG netgun, contacts, archetypes, drones and VTOLs, the Goose
totem, and the adept powers.

## Key decisions & tradeoffs
- **A backend subclass over per-move hooks.** Every tactical movement path funnels
  through it (verified). It subclasses whatever is registered, so another module's
  backend is kept.
- **A GM-only lifecycle writer over player-side creation.** The permission
  defaults rule out player-side creation; the GM queue plus a desired-state
  reconcile removes duplicate and interleave races; and no socket is needed.
- **Linked actors only, for automatic forms.** That's every PC. NPC mages are
  handled by hand.
- **The body marker is computed, not stored**, so it can't go stale.
- **Barrier attack tests (p.147) are out.** The GM removes the flag when a barrier
  falls.
- **Per-segment mode accounting** (two cumulative totals) rather than a
  per-drag or whole-phase rule. Equal routes cost the same, and slowing down
  never retro-charges fast travel.

## Risks / open questions
- **Spirit astral speed:** core gives Astral Quickness × 4 for magicians; spirits
  aren't stated. Proposal: the spirit's Quickness × 4. Flag this.
- **Region area:** computed from the polygon tree. If V13 exposes no tree at
  runtime, use the resolved polygons' signed areas instead. Verify this first in
  implementation.
- **The GM must be online** for forms to appear (stated in the UI).
- **The performance of `_testEdgeInclusion`:** two flag reads per edge, nothing
  else.

## Tests
- Vitest:
  - `isOnAstralPlane`, `astralBarrierKind`, and the edge decision table (a pure
    `astralEdgeDecision(kind, isWall)` returning "exclude" / "super" /
    "include");
  - `desiredForms` (duplicates, gone bodies, a persona excluded, unlinked
    excluded);
  - the FAB-UV TN, net and penalty for net successes 0 through 6 (1 → +4, 5 → 0,
    6 → 0), and reveal validity including a stale epoch;
  - the astral speed caps (normal, fast = Magic × 1000), and the two-cap ledger:
    - a split route equals the unsplit one;
    - fast 100 m outside plus 1 m into FAB is allowed;
    - normal metres inside FAB above Int×4 are refused;
    - fast then slowed down: earlier fast metres aren't charged to normal;
    - overlapping FAB regions are charged once;
  - `desiredForms` excluding a `persona`-flagged token, and the survivor rule.
- Quench `sr2e.astral-walls`:
  - `checkCollision` for an astral-only token passes a plain wall and a closed
    plain door, and is blocked by a living wall, by a closed living-wall door,
    and by a ward;
  - an open living-wall door lets it pass;
  - a physical token is blocked by plain and living walls and passes a ward;
  - lifecycle: projecting creates exactly one form, a double trigger still yields
    one form, leaving deletes it, deleting the body deletes the form, a jackpoint
    persona token gets no form, and a simulated handoff (calling the handoff
    reconcile) heals a missing or duplicate form;
  - the FAB-UV reveal shows and hides with UV and enabled toggles;
  - shrinking a region off a stationary revealed token and restoring it doesn't
    revive the reveal;
  - a search started, then the intruder exits and re-enters, then the search
    finishes, is voided;
  - the same sequence with the exit handler's write artificially delayed past the
    search commit still yields no visible reveal (gen mismatch);
  - the limiter caps a form inside FAB and not outside while fast.

  All scoped to test-created scenes and actors.

## Out of scope
Barrier attack tests, mana barrier spell automation, underground and elevation
("the Earth blocks"), cross-scene projection, unlinked-actor forms, aperture-size
enforcement, and all Stage 4 content.
