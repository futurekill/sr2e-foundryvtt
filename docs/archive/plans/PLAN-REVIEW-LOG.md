# Plan Review Log: post-session fixes (NPC rolls, spirits, called shot, aim, barriers, contacts)

Started 2026-08-01. MAX_ROUNDS=5. Codex CLI 0.146.0, CLI default model, read-only every round.

Focus areas requested: (a) does the aim-state design survive contact with the
existing promptRollOptions/dice-pool code; (b) do the three attack-dialog items
conflict; (c) can the burst/full-auto Power value leak into the barrier comparison.

## Round 1 — Codex
30 findings, VERDICT: REVISE. Full critique kept at /tmp/codex-verdict.txt; the
load-bearing ones, all independently verified against the code before accepting:

- **#3 wrong helper.** Weapon attacks use `promptWeaponAttackOptions()` (line 495,
  called at 1238), NOT `promptRollOptions()`. My plan named the wrong function.
- **#9 double-application.** The existing `otherMod` tooltip already instructs
  "Aimed shot −1/Simple Action · called shot +4" — in TWO places
  (sheet-actions.mjs:881 and :937). Dedicated controls would double-apply.
- **#10 blind-fire collision.** A `#sr2e-visibility` selector already exists
  (:717); a barrier's +8 would stack with it for +16.
- **#18/19 Power leak is elsewhere.** `effectivePower` is built at 801-826, not
  477-540 as I wrote, and `basePower = effectivePower - rounds` (:839)
  reverse-engineers the pre-burst value rather than capturing it.
- **#26 stale instruction.** `rollAttribute` is ALREADY registered on the NPC
  sheet (actor-sheet.mjs:1114). Item 1 is template-only.
- **#27 wrong shape.** `system.powers` is `ArrayField(StringField)` — an array of
  keys (actor-data.mjs:1430) — but the template iterates an object as
  `(label, key)`. Switching the iterable alone makes the index the action key.
- **#1/2/6/17 aim is not enforceable.** No common "actor took an action" hook
  exists; Foundry hooks observe mutations, not game actions.

### Claude's response
Accepted nearly all of it. The plan was wrong about two function names, one
already-done task, one data shape, and the location of the Power leak — every
one verified in the code rather than taken on trust.

Rejected / narrowed:
- #7's "one typed attack-options object forwarded wholesale" as a full refactor:
  accepted the principle (normalize once, spread through both paths) but scoped
  to the fields this work adds plus the two already being dropped.
- #24/#25 (barriers for melee, magic, blast, spread): narrowed OUT of scope
  rather than designed, since the reported need is weapon fire.
- #22 persistent Barrier Rating documents: kept advisory, reported in chat.

## Round 2 — Codex
10 findings, VERDICT: REVISE. Sharper than round 1 and mostly correct.

Notable — **Codex corrected my own round-1 correction**: I claimed
`basePower = effectivePower - rounds` reverse-engineered a different quantity
from `burst.powerBonus`. It does not. `burstDamageBonus(rounds)` returns
`{powerBonus: rounds}` (sr2e-rules.mjs:329), so the subtraction is currently
exact — and `basePower` deliberately INCLUDES ammo `damageMod`, feeding the
p.108 vehicle-armour check. My proposed "capture before ammo and burst" would
have silently changed vehicle penetration. Verified in the code before accepting.

Also accepted:
- `barrierMode` ("through"/"break") had vanished from the data model.
- Barrier Power semantics undefined: now split into `comparisonPower`
  (= baseRoundPower) and `damagePower`.
- **Armour would have been double-applied** — the existing resistance path
  already applies it, so `resolveBarrier()` must subtract the barrier only.
- `_rollWeaponAttack()` decrements thrown/grenade quantity BEFORE resolution, so
  a refused attack would consume the item. Validation moves ahead of mutation.
- Aim cap must track the SELECTED skill variant, not the seeded highest.
- `forbidPoolDice` needed a stated failure contract (abort before side effects).
- NPC attribute cells are editable inputs — the action goes on a dedicated
  button, not the cell.
- `_source/` under `assets/` would ship the portraits twice.
- Plain Vitest cannot drive DialogV2/`item.roll()`; integration cases move to
  Quench.

### Claude's response
Accepted all ten. Rewrote the Power section to state my error explicitly rather
than quietly fixing it, since the wrong version was already written down.

## Round 3 — Codex
5 findings, VERDICT: REVISE. All narrow, all correct, all accepted:

- `resolveBarrier()` was declared to return `damagePower` but was never given
  `effectivePower` to compute it from. Now returns `powerReduction`; the caller
  does the subtraction.
- One `adjustedRating` conflated two different numbers: the through-barrier
  value used for penetration, and the break-through value (x2 vs ranged) used to
  assess damage TO the barrier when a shot is stopped. Now derived separately
  inside the resolver.
- The resolver needed the UNADJUSTED base rating, or the advisory `newRating`
  and the door thresholds (1/2 BR regular, 0 security) would be computed against
  a doubled number. It now takes base rating + metadata and adjusts internally.
- Backend validation covered `barrierMode` but not the rest of the
  caller-controlled barrier data — arbitrary ratings, forged transparency flags,
  negative aim counts all pass through `{...opts}`. Now: normalize every option
  against canonical values before anything is trusted.
- Called-shot eligibility was a gesture ("gate by weapon category"), not a
  predicate. Now concrete: `weaponType` in `{firearm, heavy}` (the six values are
  at item-data.mjs:153), mode in `{ss, sa, bf}`, AND
  `weapon.system.firingModes[mode] === true` (item-data.mjs:183).

### Claude's response
Accepted all five; no pushback this round. Looked up the actual `weaponType`
enum and `firingModes` shape rather than describing them approximately.

## Round 4 — Codex
4 findings, VERDICT: REVISE. All accepted:

- **I over-applied the pool ban.** p.82 forbids Dice Pool dice when aiming spans
  MULTIPLE Combat Phases; I forbade them whenever aim > 0, which wrongly
  penalises a single-phase aim the rule permits. Now driven by an explicit
  "aim spanned multiple phases" assertion.
- Aim ignored p.82's "ready ranged weapon" constraint. Now gated to
  `{firearm, heavy, projectile, throwing}` + `system.equipped`, with readiness
  beyond that stated as player-asserted.
- `barrierEffect` had no stated trigger. Now: break mode, or a stopped
  through-shot — never a through-shot that penetrates.
- `attackKind` advertised `meleeBlunt`/`meleeEdged` while melee barriers are
  explicitly out of scope. Narrowed to `"ranged"`.

### Claude's response
Accepted all four; no pushback.

## Round 5 — Codex (MAX_ROUNDS)
3 findings, VERDICT: REVISE. All accepted:

- Break-through had no terminal branch — a successful `"break"` attack would
  have fallen through to a defender damage card despite the barrier being the
  target. Now three explicit terminal outcomes.
- `securityDoor: boolean` could not tell a regular door from a non-door, so the
  half-rating opening threshold would have been applied to walls, windows and
  tires. Now `doorType: "none" | "regular" | "security"`.
- **The test plan still encoded my own over-restriction** ("aimed attack
  rejecting pool dice") after round 4 corrected it to multi-phase-only — which
  would have locked the bug into the tests. Now asserts both directions.

### Claude's response
Accepted all three.

## Outcome — MAX_ROUNDS reached, NOT a deadlock

Five rounds, 52 findings, **every one accepted**; the only pushback was on
scope (a full attack-options refactor, barriers for melee/magic/blast) which was
narrowed with a stated reason rather than argued away. Codex converged steadily:
30 -> 10 -> 5 -> 4 -> 3.

**Honest status: the round-5 revision has NOT been re-reviewed.** The loop hit
its cap immediately after the fixes were applied. There are no open
disagreements — but there is no APPROVED verdict on the final text either.

Findings that changed the plan most:
1. The plan named the wrong dialog helper and the wrong Power location.
2. `otherMod`'s tooltip already told users to enter called-shot and aimed-shot
   modifiers by hand — dedicated controls would have double-applied.
3. `rollWeaponInteractive()` already silently drops `deployed` and `distance`.
4. Codex corrected one of MY corrections (the burst power-bonus claim).
5. It caught my over-application of the pool ban, and then caught the test that
   would have frozen it in place.
