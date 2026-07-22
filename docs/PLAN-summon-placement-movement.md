# Plan: seamless summoning, spirit placement, movement-limiter revisit

Workstream for three combat/summoning items. Design + **methodical test
procedures** so we verify each rather than hand-wave. Live/canvas/2-client work
happens in one session; Codex reviews the batch before release (available
Fri 2026-07-24).

Legend: ✅ prepped (in repo, unreviewed) · ⏳ needs the live session · 🔬 verify step.

---

## 1. Summoning must work for players AND GMs

**State.** GM summon works. Player summon is broken and *undiagnosed* — the bug
lives entirely in the player→GM socket round-trip (`createActorViaGM` →
`_handleCreateActorRequest` → `_resolveCreateActorResponse` in `module/sr2e.mjs`),
which cannot be reproduced single-client.

**✅ Prepped.** Diagnostic trail added to the relay — `console.debug("SR2E | relay: …")`
at every step (player emits, GM receives + reports whether it's the activeGM, GM
creates, player resolves, timeout). Quiet unless the console's **Verbose** level
is on.

**🔬 Diagnostic protocol (2 clients, both consoles open, filter `relay`):**
1. GM online, one Player logged in (a real player user, not the GM). Player owns a
   mage with the Conjuring skill.
2. Player summons a Force-1 fire elemental. Watch **both** consoles.
3. Read the trace to locate the break:
   - Player shows `emitting createActorRequest <id>` but the **GM console shows
     nothing** → the socket message isn't reaching the GM (channel/registration).
   - GM shows `received … I am NOT the activeGM` → GM election is wrong (no active
     GM, or a different GM is elected).
   - GM shows `GM created actor <uuid>` but the **player** shows a timeout →
     the response emit isn't reaching the player, or the player's listener isn't
     registered.
   - GM shows `GM-relayed actor creation failed: …` → the create/ownership-update
     throws GM-side; the message names the cause.
   - Player shows `response … ignored (not ours / already settled)` → requestId
     mismatch or double-settle.
4. Capture the exact line where it breaks → that dictates the one-line fix.

**Likely suspects (ranked):** (a) the player client never registered
`game.socket.on("system.sr2e", …)` — it runs in the `ready` hook; confirm it
runs for non-GM users; (b) `game.users.activeGM` resolves null/other on the
player client; (c) response emit not delivered.

**Acceptance:** a Player summons → spirit actor appears, **owned by that player**,
bound to their mage, honest "summoned" card. No wasted drain on any failure path.

---

## 2. Summoned spirit appears in the nearest unoccupied space to the caster

**State.** Not implemented — summon creates the actor only; no token is dropped.

**✅ Prepped.** Pure `nearestFreeCell(origin, occupied, bounds, maxRadius)` in
`sr2e-rules.mjs` (+ `test/spirit-placement.test.mjs`): ring-by-ring Chebyshev
search from the caster's cell, biased to orthogonal-nearest, bounds-aware,
returns null when packed. No canvas dependency.

**⏳ Wiring (deferred — entangled with the relay + needs canvas).** Placement is a
**scene write** (`scene.createEmbeddedDocuments("Token", …)`), which a player
can't do — so it must happen on the **actor-creating client** (the GM, directly
or via the relay). Design:
- On the client that creates the spirit actor, after creation: resolve the
  **caster's** active token, build the `occupied` set from the scene's tokens
  (cell footprints), call `nearestFreeCell`, drop the spirit token there.
- For a relayed (player) summon, the GM does this; the relay request must carry
  the caster's scene + cell so the GM knows where "beside the caster" is.

**Setting (per your call — configurable fallback).** Register `spiritPlacement`:
- `nearest` (default) — nearest free cell to the caster; **no caster token on the
  active scene → create actor only** (today's behavior).
- `nearestOrCenter` — nearest free cell, else drop at the scene centre.
- `prompt` — click-to-place (like a measured template).
- `off` — never auto-place.

**🔬 Test:**
- GM mage token on a gridded scene, neighbours open → summon → spirit lands in an
  adjacent free cell. Surround the mage → summon → spirit steps out a ring.
- Caster has no token on the scene → behaviour matches the chosen setting.
- (After #1) Player summon → token drops beside the **player's** token, owned by them.

---

## 3. Movement-in-combat limiter revisit

Reported: **cap too strict/loose**, **GM/player behaviour wrong**, **ruler
visuals/stuck colours**. Book re-checked (SR2 p.83):

**Audit findings.**
- ✅ **Rates are correct.** Movement is per Combat **Phase** (p.83: "may move at
  one of the two rates during a Combat Phase"). walk = Quickness, run =
  Quickness × Running-Table modifier (human/elf/ork ×3, dwarf/troll ×2). The
  per-phase `moveOrigin` stamp is right. So the *rates* aren't the bug.
- ⏳ **"Run only once per Combat Turn" is NOT enforced** (p.83: "Characters who
  have multiple Actions may run only in one of those Combat Phases"). Today a
  3-pass character can run every phase → **too loose**. Fix: flag a token when it
  runs in a phase; in later phases that turn, cap at the **walk** rate; clear the
  flag each new Combat Turn. *(Confirm this is the "too loose" you saw before
  building it — if the complaint is "too strict", it's a different root cause.)*
- ⏳ **+1 walking target modifier not surfaced** (p.83) — only the +4 running
  reminder posts. Minor; add a walk reminder.
- 🔬 **GM/player behaviour** — current rule: GM moves NON-player tokens freely,
  but a player-owned token stays capped even when the GM drags it
  (`movement.mjs` preUpdateToken guard). Decide with a live drag whether that
  matches intent, and whether the limit should fire only for the *active*
  combatant vs any token.
- 🔬 **Ruler visuals** — `#bandColor` only colours `pending`/`planned` stages;
  history is separated. Reproduce the "stuck colours" live to see if it's a V13
  TokenRuler stage/redraw issue.

**🔬 Diagnostic test (isolates strict-vs-loose + the other two):**
1. Human Q5 (walk 5 m / run 15 m), gridded scene, movement limit ON, in combat.
2. Drag ≤5 m → **green**, no warning. 5–15 m → **amber** + running reminder.
   >15 m → **red** + blocked (snaps back). Confirms rate direction.
3. Give the token multiple actions (high initiative). Run in phase 1, then in
   phase 2 try to run again → **should be walk-capped** (currently isn't).
4. GM drags a player token vs an NPC token → note which is capped. GM drags
   during a player's turn → note behaviour.
5. Hover to show movement history → check the band colours don't stick/mis-colour.

---

## Sequencing
1. **Fri:** live 2-client session → diagnose relay (§1), confirm movement
   direction (§3), decide GM/player intent. Then implement the confirmed fixes +
   the placement wiring (§2), Codex-review the batch, release.
2. Verified procedures here graduate into `docs/QA-PLAN.md`.
