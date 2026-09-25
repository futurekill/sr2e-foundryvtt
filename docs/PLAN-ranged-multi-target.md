# Plan: Ranged multiple-target modifier and walking fire (RULES-AUDIT-3 C4)
_Round 5 — final; last Codex point applied (see log)_

## Goal
SR2E p.92–93 (rendered):
- Semi-auto: "If the attacker engages multiple targets in semi-automatic mode,
  the second target is at a +2 modifier."
- Burst: "fire directed against a second target receives a +2 target modifier."
- Full auto: the attacker "must 'walk' the fire from one target to the next…
  one round is 'wasted' for every meter of distance between the two targets.
  Smartguns never waste rounds. The attacker also receives a blanket +2 target
  modifier for each new target engaged during that Combat Phase." (Wedge example:
  targets 1/2/3 at +0/+2/+4.)
Today ranged fire has none of this; melee has a manual "additional targets" box.

## Approach
1. **A Combat Phase identity.** `SR2ECombat.nextTurn` and `nextRound` bump a
   monotonic `flags.sr2e.phaseSeq` in the SAME `update` that moves the turn or
   round. A `preUpdateCombat` hook injects `phaseSeq + 1` into the SAME change
   whenever `round` or `turn` is changing **without** `phaseSeq` already in
   it, so there is no window in which the old key is still live. That covers
   manual tracker edits, including going back to an earlier turn, because the
   counter is monotonic. `phaseKey(actor)` = `"<combatId>:<phaseSeq>:<resetSeq>"`
   for the active combat that contains the actor, else `"free:<resetSeq>"`. Today's recoil reset hangs off
   `combatTurn`, which does NOT fire when the same combatant keeps the top
   Initiative and `update({turn})` writes an unchanged index. So recoil also
   survives into that combatant's next phase (a bug that predates this work).
   `previousTurn` bumps `phaseSeq` too. **Nothing is zeroed at a boundary any
   more:** `_resetCombatRecoil` and its `combatTurn`/`combatRound` hooks are
   removed, and state is *invalidated* by the key instead. That removes the
   late-reset race outright. Open actor sheets of combatants re-render on
   `updateCombat`, so the displayed recoil (now the effective value) follows.
   `resetSeq` is per-actor (`flags.sr2e.resetSeq`), and the manual Reset Recoil
   paths increment it.
   **Recoil is generation-keyed too.** Every ranged commit is **one
   `actor.update`** holding `system.combatRecoil` and the complete
   `flags.sr2e.engaged` record, key included. That happens even for a
   tokenless attack, which omits only the `targets` entry and still writes the
   key, the recoil and `lastFA`. The **effective** recoil anywhere (`item.roll` and the
   dialog preview) is `combatRecoil` when `engaged.key === phaseKey`, and 0
   otherwise. A stale commit landing after a boundary therefore cannot carry
   recoil into the new phase. A gunner outside the tracker is covered through
   the vehicle-derived key, even when no reset visits them.
   The combat is found from the gunner's combatant, or else from the weapon's
   vehicle combatant (a gunner who is not in the tracker), or else it is
   `"free"`.
2. **The engagement record** lives on the **gunner** (`options.gunner ??
   this.parent`, the actor whose recoil and TN this is), as the flag
   `flags.sr2e.engaged = { key, targets: [tokenUuid…], lastFA: { weaponUuid,
   tokenUuid|null, sceneId, x, y } | null }`. Weapons are compared by
   **document UUID**, since embedded ids are not unique across vehicles. It is bounded: unique ids only. It is a
   flag, not a schema field (no `actor-data.mjs` change). A record whose `key` is
   not the current `phaseKey` reads as empty. **The key is captured before the
   roll and the record is written under that captured key**, so an attack that
   lands after a boundary writes an already-stale record rather than
   polluting the new phase. Target ids are never null. An attack with no
   token target is not recorded.
3. **One pure calculator** (`sr2e-rules.mjs`), shared by the dialog preview and
   `item.roll`:
   `rangedEngagement({ record, key, targetUuid, mode, weaponId, smartgun,
   distanceM, priorOverride, walkOverride })` →
   `{ priorTargets, tnMod, walked }`:
   - `priorTargets` = distinct ids in a fresh record other than the current
     target (A +0, B +2, C +4; back to A after B +2). With **no current target
     token** the automatic count is 0, and the label hints that the count
     should be entered by hand, because distinctness cannot be inferred. The
     override, when given, replaces it. It is sanitised to a finite
     non-negative integer.
     `tnMod = 2 × priorTargets`.
   - `walked` = rounds wasted. It is `0` unless the mode is full auto, the
     record's `lastFA` is the **same weapon** in this phase, the target is
     different and there is no smartgun. Otherwise it is
     `round(distanceM)` (or `walkOverride`), sanitised. The calculator returns
     `walkUnknown: true` when walking applies but neither a finite distance
     nor an override exists. **Either missing endpoint** (a previous FA burst
     with `tokenUuid: null`, or no current target) makes continuity unknown.
     The "different target" test is skipped in that case, so tokenless FA
     followed by tokenless FA needs an override too. The roll path **refuses** that case, so a macro
     cannot walk for free.
   `distanceM` is measured only when `lastFA.sceneId` is the current scene
   and both points are finite. Otherwise it is null, and the dialog asks for it
   (FA only).
4. **Roll path** (`item.mjs`, every ranged branch that fires at an aimed
   target, including the **spread** launcher's aimed target, never incidental
   cone victims; not blasts):
   - The called-shot / declared-mode validation stays first and unchanged.
   - Before any mutation, and **only for tracked ammunition** (`ammo.max > 0`,
     not thrown, the existing guard): `walked` must leave at least 1 round,
     else refuse. `burstFired(mode, rounds, ammo.current − walked)` then decides
     the burst (1 → single shot, 2 → short). Untracked weapons have unlimited
     rounds, but the walked rounds still add recoil.
   - **Serialised per gunner on this client**: `item.roll`'s ranged path
     itself (so macros too) runs through a per-actor promise queue. The target
     token (uuid and position) and the phase key are captured at **invocation**.
     Ammo, history and recoil are read when execution starts. Two attacks at A and B therefore get +0 and then +2, and both are
     recorded. (The same actor attacking from two clients at once is not
     guarded. One player drives one character.)
   - Recoil for THIS attack: `recoilPenalty(shotsFired + walked, fired.rounds,
     …)`. Wasted rounds were fired first, so they count (heavy doubling and gyro
     then apply as today). Damage bonuses use `fired.rounds` only. Ammo and
     the counter decrement or advance by `walked + fired.rounds`.
   - TN += `tnMod`; label "multiple targets +N", "walked fire: W rounds".
   - After the roll (hit or miss: the target was engaged), commit recoil and
     the record in the single `actor.update` described above, under the captured
     key. `lastFA` is set on FA and
     cleared by any other recorded engagement, so walking continuity means "the
     previous recorded shot this phase was this weapon on full auto". (FA is a
     Complex Action, so nothing else fits between its bursts in one phase.)
   - The dialog sends `priorOverride` / `walkOverride` **only if the user
     edited that field**. A walk override carries the context it was entered
     for: phase key, weapon UUID, the previous FA endpoint and the current
     target. `item.roll` discards it if any of these changed, recomputes, and
     refuses if walking is then unknown. Otherwise `item.roll` recomputes from
     live state, so a stale open dialog and a macro agree.
5. **Dialog**: the "targets already engaged this phase" input is pre-filled from
   the calculator. For FA only, a "walked fire (m)" input is pre-filled with the
   measured distance, or left blank when it can't be measured. The recoil preview
   uses `shotsFired + walked` and `burstFired` against `ammo − walked`. Reset
   Recoil re-reads both.
6. **Tests**:
   - Unit: the calculator's ordering, sanitising (NaN, Infinity, fractions),
     same-weapon walking, smartgun, stale key.
   - Quench (deterministic dice):
     - SA at A then B: +2.
     - FA at A, then FA with the same weapon at B 3 m away: 3 rounds wasted,
       ammo −(3 + burst), recoil includes them.
     - Smartgun: 0 wasted.
     - SA with another weapon between: no walking.
     - Walking leaves 2 rounds: a short burst. Leaves 1: a single shot. Leaves 0: refused, nothing spent.
     - Declared FA plus a called shot is still refused.
     - `nextTurn` with the same combatant on top: recoil and history **read as
       empty** (new key).
     - A manual tracker edit (turn set by hand): new key, and an attack fired
       immediately after it records under the new key.
     - An attack whose commit lands after `nextTurn` leaves the new phase at
       recoil 0.
     - A vehicle-only combatant: the gunner's history and recoil expire with
       the vehicle's phase.
     - Tokenless FA, then FA at B: walking unknown, refused without an
       override, accepted with one. Tokenless FA then tokenless FA: likewise.
     - Two queued macro calls at A then B: +0 then +2, both recorded.
     - A macro call with no dialog applies the same modifier.
7. CHANGELOG, QA-PLAN, RULES-AUDIT-3.

## Key decisions & tradeoffs
- **No shared round budget across an FA action** (Codex R1 #1, rejected). p.93
  has the attacker declare rounds "at a specific target", and the Wedge example
  fires 3, 3 and 4 as separate bursts with separate tests. Nothing caps the sum.
  Each burst is declared on its own. The waste is additional rounds.
- **A phase key** rather than a reset-only design: it makes stale data inert.
  The per-gunner queue covers everything from calculation through the awaited
  ammo, recoil and history commits. A rejected or thrown attack releases the
  queue in a `finally`.
- **Engaging means attacking**, hit or miss.
- **Distance is measured from the previous target's recorded position**, not its
  current one.
- **Stray shots** (p.93) are an OPTIONAL rule and out of scope.

## Risks / open questions
- Vehicle-mounted fire: the record and recoil are on the gunner. Ammo stays on
  the vehicle (unchanged). A gunner who can't update the vehicle's ammunition is
  a permission gap that predates this work and is left alone here (Codex R2 #8).

## Out of scope
Stray shots (optional rule), melee auto-tracking (melee keeps its manual input).
