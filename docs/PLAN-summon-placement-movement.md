# Plan: seamless summoning, spirit placement, movement-limiter revisit

Design + **methodical test procedures** for three combat/summoning items.
Live/canvas/2-client work happens in one session; Codex reviews the batch before
release. **Revised 2026-07-23 after a Codex audit** — which turned up two bugs
already shipped in 0.57.0 and corrected several assumptions below.

Legend: ✅ prepped · ⏳ needs the live session · 🔬 verify · ⚠️ **shipped bug**.

---

## 0. ⚠️ Two bugs already in 0.57.0 (found by the audit)

**A. The actor-creation relay is an unvalidated GM-write endpoint.**
`_handleCreateActorRequest` (module/sr2e.mjs) trusts `requesterId` **and arbitrary
`actorData`** from any client. A player who crafts a `createActorRequest` socket
message (dev tools) can make the GM create *any* world actor with *any* ownership.
Practical risk at a trusted home table is low, and the normal player flow is
broken anyway — but it's a real design flaw, and extending it to place tokens
would make it an arbitrary GM **scene**-write too. **Fix as part of the relay
rework, before wiring placement:** send a *constrained* request (caster UUID +
force/kind/domain/services — not raw actorData), validate GM-side, require
`requesterId === ` the caster's owner, whitelist actor type, GM constructs the
actual data. Use typed operations with per-op validators, not "create anything."

**B. The movement limiter measures net displacement, not distance travelled.**
`preUpdateToken` (module/movement.mjs) measures a straight line from `moveOrigin`
to the drop. Move 10 m east → back to origin → 10 m west = 30 m travelled, each
drop within 15 m, **never capped**. My earlier plan called this "sound" — it
isn't. Plus two more scope bugs in the same function: it fires for **any** token
while a combat exists (bystanders, tokens on other scenes — not just combatants),
and a token with no stamped `moveOrigin` falls back to its current position, so
**repeated short drags grant unlimited movement**. These three together are the
most likely source of the reported "too strict / too loose" and "GM/player
wrong." Movement is opt-in (off by default), so it's not a fire, but it's a real
correctness bug.

---

## 1. Summoning must work for players AND GMs

> **SHELVED 2026-07-24.** The player→GM socket relay was REMOVED: a raw
> `game.socket.emit`/`on` ping did not arrive GM-side at the live table, i.e.
> Foundry's `system.*` relay does not deliver in that deployment (Team Karma's
> cross-client sync fails there too). Current solution: grant players the
> **"Create New Actors"** permission so they use the direct path. Re-open only
> after confirming `system.*` messages actually deliver in the target host.


**State.** GM summon works. Player summon broken, undiagnosed — lives in the
player→GM socket round-trip, not reproducible single-client.

**✅ Prepped.** `console.debug("SR2E | relay: …")` trail at every hop (Verbose level).

**🔬 Diagnostic protocol (2 clients, both consoles, filter `relay`):** GM online,
a real Player user with a mage + Conjuring skill summons a Force-1 fire elemental;
read the trace to find which hop breaks (player emit → GM receive/activeGM check →
GM create → player resolve/timeout).

**Revised lead suspect (was wrong).** The likeliest failure is a **cross-client
readiness race**, not "`ready` doesn't run for players": `game.socket.on` is
registered in `Hooks.once("ready")`, and a player who finishes loading *first* can
see `game.users.activeGM` as non-null and emit **before the GM's listener is
registered** — the message is dropped (socket messages aren't queued for an
unregistered listener). Test explicitly: player ready before GM; summon the
instant `activeGM` becomes non-null; GM reconnect mid-request; election change;
two GMs one still loading. **Likely fix:** register the socket listener earlier
(as soon as `game.socket` exists, not in `ready`), and/or a readiness handshake so
`canCreateActor()` only returns true when a relay-ready GM is confirmed.

**Also fix in the rework (audit):**
- **Response-before-sync race:** the socket response can reach the player before
  Foundry syncs the created actor/ownership to them. Today it's masked (we only
  store the uuid), but it's fragile. The player should wait for the actor to
  appear in `game.actors` with the expected ownership (bounded timeout), not just
  settle on the socket reply. Diagnostics should distinguish "response received"
  from "actor visible and owned locally."
- **Idempotency / orphans:** a timeout doesn't mean the GM failed — it may create
  the spirit *after* the player gave up (orphan), and a retry makes a duplicate.
  Cache the result GM-side keyed by requestId so a retry returns the same actor.
- **Direct permitted-player ownership:** a player with `ACTOR_CREATE` uses the
  direct path, which grants no ownership — cover this case explicitly.

**Acceptance:** Player summons → spirit appears, **owned by that player**, bound,
honest card, no wasted drain on any failure path; verified across GM / relayed
player / permitted player / assistant GM / two-GM / GM-reload-mid-request.

---

## 2. Spirit appears in the nearest unoccupied space to the caster

**State.** Not implemented. `nearestFreeCell` (pure, tested) exists but the audit
shows it's **only correct for a 1-cell square-grid token** — insufficient as-is.

**Revisions from the audit — do NOT wire until these are handled:**
- **Footprint:** the search must test every cell the *summoned* token would cover
  (2×2 spirits, fractional sizes, non-grid-aligned pixels), not just one cell.
  Add a candidate-footprint predicate (width/height + occupied + bounds).
- **Hex / gridless:** Chebyshev `col,row` rings are square-grid only. Support
  matrix: square = footprint search; hex = Foundry grid APIs for adjacency/
  offset/footprint; gridless = radial pixel candidates + overlap test, or fall
  back to prompt/off. Applying the current helper to every scene would be a bug.
- **Blocking:** "unoccupied" ≠ "reachable" — walls / inaccessible cells can place
  a spirit inside a wall; decide whether to test collision. Also hidden tokens,
  defeated tokens, elevation.
- **maxRadius=25 is arbitrary** — compute from scene bounds (or bounded BFS with
  accurate exhaustion reporting), don't silently ignore a free cell at radius 26.
- **Pass stable IDs, not "scene + cell":** the caster may move/switch scenes/have
  their token deleted during roll+drain+relay, and a client-supplied cell is
  untrusted. Send `{sceneId, casterTokenId, casterActorUuid}`; the GM resolves the
  live token position immediately before placing. Define behaviour for multiple
  caster tokens / speaker-token ≠ selected-token.
- **Transactional + structured result:** actor-created-but-token-failed must be
  deliberate and reported: `{actorUuid, tokenUuid, placementStatus, warning}`.
  Handle no-free-cell, deleted/changed scene, token-permission error, retries.
- **`prompt` fallback through the relay is problematic** — which client shows it,
  who owns the interaction, cancellation, how long the request stays pending. A
  GM-side prompt isn't seamless for a player summon. Reconsider this option.

**Setting `spiritPlacement`:** `nearest` (default) / `nearestOrCenter` / `prompt`
(pending the concern above) / `off`. `nearestOrCenter` must still avoid walls /
occupied / off-scene.

**🔬 Test:** adjacent-free, surrounded (ring out), no caster token (setting), 2×2
spirit near occupied cells, hex scene, gridless scene, wall-adjacent, player
summon (after §1) drops beside the *player's* token owned by them.

---

## 3. Movement-in-combat limiter revisit

> **REWORKED 2026-07-24** (module/movement.mjs + rules `movementPhase` /
> `movementColorBand`, test/movement.test.mjs). Fixes landed: cumulative
> per-phase distance via a round-qualified `moveLedger` flag (out-and-back and
> repeated short drags now count; the old `moveOrigin` stamp + net-displacement
> measure are gone); scope narrowed to the **active combatant only** (bystanders
> / other-scene / out-of-turn move freely; `options.sr2eBypassMovement` escape
> hatch for programmatic moves); **run once per Combat Turn** enforced (p.84 —
> a phase after running is walk-capped); +4 running notice made advisory + posts
> once. **Still ⏳ live-verify** the diagnostic matrix below, then Codex-review.

Book re-checked (SR2 p.83). **Rates are correct** (per Combat Phase; walk =
Quickness, run = Quickness × Running-Table mod — human/elf/ork ×3, dwarf/troll
×2). The bugs are in *how spent movement is measured and scoped* (§0-B) plus:

- **Primary (§0-B): cumulative path cost, not net displacement.** Track distance
  *travelled* this phase (use the ruler/movement-history path cost, or accumulate
  each accepted move's measured cost), not straight-line origin→drop.
- **Scope:** `limitActive` must require the token be a combatant **in the active
  combat, on that combat's scene**, and normally its **active combatant** — not
  merely "a combat exists." Decide policy for out-of-turn/reaction movement,
  programmatic/forced movement, and a GM bypass (modifier key / update flag).
- **"Run only once per Combat Turn"** (p.83, reading is sound) — but don't use a
  cleared boolean (races with round changes, combat delete/rewind, token dup,
  multi-token actors, reload). Store a **round-qualified** value `{combatId,
  round}`; running is barred only when it matches the current combat+round — no
  cleanup needed. Better: fold run-state + `distanceSpent` + mode into one
  **per-phase movement ledger** keyed to `{combatId, round, combatant}`, lazily
  initialized on the moving update (avoids the cross-client `moveOrigin` stamp
  race, §0/audit-#11).
- **Commit point:** mark "ran" only after an *accepted* move pushes cumulative
  distance past the walk allowance — not when the ruler merely turns amber or a
  blocked attempt enters the band.
- **GM/player policy must be explicit and match the docs** (header says "GMs move
  freely" but the code caps GM-moved player tokens). `hasPlayerOwner` is a poor
  proxy for "tactical movement vs GM repositioning."
- **Reminders aren't mechanics:** the +4 running / +1 walking notifications don't
  actually apply the modifier and can spam on every drag adjustment. Decide: make
  movement-state one authoritative source consumed by attack/TN construction
  (coordinate with existing attacker-movement + gyro modifiers to avoid double-
  count), or label it clearly advisory and post once per phase/mode change.

**🔬 Diagnostic test:** Q5 human (walk 5 / run 15); ≤5 green, 5–15 amber+warn,
>15 blocked; **out-and-back** (should count travelled distance, currently doesn't);
run phase 1 then try to run phase 2 (should walk-cap); bystander / other-scene
token (should NOT be capped); repeated short drags (should NOT bypass); GM drags
player vs NPC token; hover history colours.

---

## Test matrix (broaden — audit #18)
Relay: player-ready-first, election change, two GMs, GM reload mid-request,
delayed response after timeout, duplicate/retry, spoofed requester/caster,
permitted-player-without-scene-write, multiple caster tokens, non-viewed caster
scene, simultaneous summons for one cell. Placement: 2×2/fractional footprints,
hex, gridless, walls. Movement: combatant vs bystander, no-origin short drags,
immediate move after phase transition, turn undo, combat delete/recreate,
multi-token actor.

## Sequencing
1. **Relay hardening + fix (§0-A, §1)** is release-blocking-ish and gates
   placement — do it first, with the validation redesign.
2. **Movement fixes (§0-B, §3)** — independent; can land separately.
3. **Placement wiring (§2)** — after the relay is trustworthy and footprint/grid
   handling is designed.
4. Codex-review the batch; verified procedures graduate into `docs/QA-PLAN.md`.
