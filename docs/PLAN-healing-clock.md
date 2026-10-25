# Plan: healing on the game clock (Calendaria)
_Round 5 — revised after Codex R1–R5 (MAX_ROUNDS reached; R5 fixes applied without a further review) (see PLAN-healing-clock-REVIEW-LOG.md)_

## Goal
When the Calendaria module is active (and the new `healingClock` setting is on), the
time-based healing rules of SR2E core p.111–115 follow Foundry's world time — which
Calendaria advances: a stage of natural healing, a First Aid treatment and a box of Stun
recovery start when rolled and land automatically when their time has passed; a dying,
unstabilized character keeps losing boxes; the "golden hour" of First Aid and Treat is checked.
Natural-healing stages get calendar notes. Without Calendaria (or setting off) everything
behaves exactly as 0.118.1.

User rulings (2026-10-25): heal automatically when the time passes (a card says so; the next
stage starts when the player clicks again); scope = "anything applicable".

## Rules being clocked (rendered pages, corrected 11th printing)
- **Natural healing, p.113:** one stage takes the Healing Table base time ÷ successes, never
  under the minimum. Rolled at the start; the level comes off when the time is up.
- **Stun recovery, p.112:** one box takes 60 min ÷ successes while resting. "If this resting
  time is interrupted, the recovery process aborts and the character will have to make the Body
  or Willpower Test again, using his current condition. The result can never be better than
  the result of the first roll, however."
- **First Aid, p.115:** within the golden first hour; treatment takes the table time ÷
  successes, uninterrupted; "Any serious interruption aborts the first aid process, but it can be
  repeated." A Deadly wound is stabilized (instantly — stabilizing stops the bleeding now),
  and "stabilization … must be maintained continually until professional help can be administered."
- **Treat, p.155:** within one hour of injury.
- **Bleeding, p.111:** overflowed but alive and unattended → +1 box every 10 minutes; death when
  total damage exceeds 10 + Body, i.e. overflow > natural Body ("exceeded by more than the
  character's natural Body Rating").

## Approach

### 1. Gate
`healingClockOn()` = `calendaria()` active AND world setting `healingClock` (default on).
Checked when an action STARTS something. Completion/bleeding run only while it is on.

### 2. State: `flags.sr2e.healClock.<k>` on the actor, `k = claimId(actor.uuid)`
```
{                                        // keyed by the OWNING actor (R3 #10)
  rev: { phys, stun },                   // per-column revisions — NOT bumped by bleeding ticks (§2a)
  restGen,                               // bumped by any damage (incl. bleeding) and Rest interrupted
  physical: { id, kind: "natural"|"aid", startedAt, dueAt, rev, level, successes,
              doctor, waiveMagician, magician, deadly } | null,
  stun:     { id, startedAt, dueAt, stunRev, restGen, successes, target } | null,  // target = Stun after the box
  stunCap: n | null,                     // the first roll of an interrupted Stun recovery (p.112)
  startGen,                              // start admission (§3)
  injury: { firstAt, lastAt } | null,    // this Physical wound episode
  bleed: { id, cursor, stable: null|"aid"|"self"|"care", lethal } | null,
  loss: { <courseId>: { n, why } },      // Magic loss checks owed, per course (R3 #8)
  lossDone: { <courseId>: { <i>: result } } }   // one receipt per check, never overwritten
```
- **Ownership (R2 #11, R3 #10):** the state lives under a key derived from the actor's OWN uuid,
  so a synthetic token actor that inherits its base actor's flags simply has no state under its
  key — nothing inherited is ever read or adopted. Every claim key contains the actor uuid.
- **Physical and Stun recover independently (R2 #9):** one Physical course (natural stage or
  First Aid treatment) and one Stun box at a time, each with its own revision.

### 2a. One hook keeps the state honest — `preUpdateActor` (R1 #4–#6, R2 #4–#7)
Every update of a character, NPC or spirit that changes its condition monitor — `commitDamage`,
every healing path, the sheet's +/− and hand edits, other modules — passes through a
`preUpdateActor` hook on the writing client, which adds to THE SAME update:
- `rev.phys + 1` if Physical or overflow changes (except bleeding ticks), `rev.stun + 1` if Stun
  changes, `restGen + 1` if ANY column increases (damage, including bleeding). Validity
  (R4 #1–#2): a Physical course needs its `rev.phys`; a Stun course needs its `stunRev` AND
  `restGen` — so Physical healing (a completed stage, magical healing) never cancels resting
  Stun recovery, while any damage does. Any change in between voids, even one that comes back
  to the same value (R2 #4). Bleeding does not void a Physical course (a bleeding patient's
  only course is a doctor's, which stops the bleeding anyway).
- **Damage interrupts rest:** any column increasing voids the Stun course and keeps its cap
  (`stunCap ??= course.successes`) (R2 #10); Physical increasing voids the Physical course.
  A card says so (posted by the hook's client after the update).
- **Bleeding ticks are not injuries (R3 #6):** an update carrying the option `sr2eBleed` bumps only
  `restGen` (bleeding is not rest); it does not touch `injury` or `rev.phys`.
- **Wound episode:** Physical/overflow increasing sets `injury.lastAt = now` (and `firstAt` when
  Physical was 0); Physical reaching 0 clears `injury`. Stun reaching 0 clears `stunCap`.
- **Bleeding episode (R2 #5–#6):** overflow rising from 0 starts `bleed = {id, cursor: now,
  stable: null}` at the injury time itself (id = claimId(uuid + rev.phys) — deterministic);
  further overflow damage on a stabilized episode sets `stable: null` AND `cursor: now` — the new
  wound bleeds from now, not from the old cursor (R3 #4); overflow reaching 0 ends it (`bleed: null`).
The hook only reads the pre-update document and the changes, so it needs no queue; it runs
whether or not the clock is on (cheap), so turning the setting on later finds honest state.

### 3. Starting (any client: the owner's player, phone or GM) — R2 #1, #12
`healPhysical` / `firstAid` (non-Deadly success) / `recoverStun`, with the clock on:
1. Refuse if that column already has a valid course.
2. Read the column's revision `r0` and `startGen`; `once(actor, "healstart:"+uuid+":"+startGen)`
   — two devices at once: one proceeds, the other is told a course is being started.
3. Roll as now.
4. If `startGen` is no longer the one this attempt claimed (the GM cleared it as stuck), write
   NOTHING and stop (R4 #3). Otherwise ONE update: if the revisions are unchanged — for Stun its
   `rev.stun` AND `restGen` (any damage interrupts rest, R3 #3) — and the slot is still empty
   (R3 #2), write the course; else write nothing but "the wound changed while you rolled — roll
   again". In both cases (and on a failed roll: 0 successes, no medical attention) that update
   bumps `startGen`, so a later attempt claims a fresh key. A start whose client died between claim and update leaves
   `startGen` behind: the GM's **Clear stuck start** button (shown when the claim marker is older
   than STUCK_MS) bumps it.
5. A card: "heals to Moderate on 4 Jan 18:00" (Calendaria date).
- Stun successes used = `min(roll, stunCap)` when a cap is set; a 0-success roll starts nothing.

### 4. Completion — the active GM; idempotent absolute writes (R1 #1, #3; R2 #2, #3, #8)
On `updateWorldTime`, `ready`, `userConnected` and `updateSetting(healingClock)`, the active GM
calls `reconcileHealing(actor, now)` for characters, NPCs and spirits (world actors + unlinked
token actors on every scene). For a course with `dueAt ≤ now` and a matching revision:
- First, every course whose revision no longer matches is cleared, its note removed and a "the
  wound changed" card posted (R3 #11).
- ONE update writes ABSOLUTE values derived from the course, not deltas, built by the SAME helper
  `_healOneLevel` uses (`healStageUpdate`, R3 #7 — so `firstAided` / `magicallyHealed` /
  `injury` follow the same rules): Physical → the floor of the level below `course.level`,
  overflow 0, the cybermancy care receipt under a DETERMINISTIC key `healclock-<courseId>`
  (R3 #1); Stun → `course.target`, `stunCap: null` (R3 #9); course null; and for owed checks
  `loss.<courseId> = {n, why}` (same value on a duplicate; progress lives in `lossDone`).
  Because the values are absolute and the revision check runs right before writing (inside the
  GM client's `damage:<uuid>` queue), a duplicate completion — two GMs, a retry, **Finish now**
  racing a slow original — writes the same values and changes nothing; a `once(…"healcard:"+id)`
  keeps the card single. No completion claim can strand a course (R2 #2).
- **Magic loss (R2 #8, R3 #1, #8):** for each owed check `i` without `lossDone.<id>.<i>`,
  `once(actor, "magicloss:"+uuid+":"+id+":"+i)`, roll, then re-read: only if `lossDone.<id>.<i>`
  is still absent, ONE update: Magic −1 if lost + the receipt (R4 #5); when all are done,
  `loss.-=<id>`. The GM takeover of a stuck check writes `lossDone.<id>.<i> = "manual"` FIRST, so a
  resumed worker finds a receipt and applies nothing (a resume landing inside that re-read window
  is a double fault, accepted). The scan finishes leftovers; a
  check whose claim exists but whose receipt never landed (older than STUCK_MS) goes to the GM
  as a card ("roll Magic loss by hand") and is marked done.
- **Cross-client damage race (R1 #1, R2 #3) — accepted, documented.** A hit committed on another
  client in the milliseconds between the GM's revision check and its write could be lost. That
  same window already exists for EVERY pair of clients that damage one actor (`commitDamage`
  serializes only per client); a server-arbitrated monitor sequencer would have to cover all
  damage, not just healing, and is its own project. Mitigation here: the write is guarded by the
  revision read immediately before it, and the GM client's own damage is serialized with it.
  Claude's call as arbiter (logged): this does not block the feature.

### 5. Golden hour (R1 #10–#11)
First Aid and Treat (clock on): if `injury` is known and `now − injury.firstAt > 1 h`, ask
"the wound is more than an hour old — first aid / Treat won't help (p.115, p.155). Treat
anyway?" (mixed ages — old `firstAt`, fresh `lastAt` — are named in the prompt). Unknown → no
prompt. The healing card snapshots `healKind: "treat"|"heal"` at cast (8 = Treat, 10 = Heal),
ritual cards too; legacy cards fall back to `spellName === "Treat"`.

### 6. Bleeding ticks (R1 #7–#9, R2 #5–#7)
`reconcileHealing` (active GM): with `bleed.stable` null, not lethal, and `now > cursor`:
boxes = ⌊(now − cursor)/600⌋; ONE update (option `sr2eBleed`) writes ABSOLUTE values from what it
read: overflow = read overflow + boxes — stopping at the first lethal value (natural Body + 1, or
the cybermantic limit) but never LOWERING an overflow already past it — and `cursor += boxes × 600`,
guarded by `restGen` read immediately before. Arbitrated per cursor (R4 #4):
`once(actor, "bleed:"+uuid+":"+episodeId+":"+cursor)` — two GM sessions reconciling at different
times can't both tick from the same cursor. A claim whose update never landed (cursor unchanged
after STUCK_MS) is retaken with a suffixed key (`…:t<n>`); the GM's **Settle bleeding** button
does the same at once (R3 #5). A tick only ever RAISES overflow and advances the cursor. A rewound clock ticks nothing. Legacy overflow with no episode
(pre-feature or set while off): the scan starts one at `now` (history unknown) with the
deterministic id — duplicates write the same episode.
- **Death:** overflow > natural Body (cybermantic: Cybertechnology p.80) → `lethal: true` in that
  update and ONE GM-whispered card (`once(…"lethal:"+uuid+":"+episodeId)`, card only) ("has died, p.111 — the GM decides"); ticking stops.
- **Owed bleeding is settled first (R4 #6, R5 #1):** every action that changes an UNSTABILIZED
  episode — setting `stable` (First Aid, self-stabilization, a doctor's course, Under care) AND
  every healing that lowers overflow (magical healing, a completed stage, Finish now) — first
  adds the ticks owed from `cursor` to now and computes its own change against that settled
  monitor, all in ONE update. Healing never forgives bleeding that already happened.
- **Only unstabilized time bleeds (R5 #3):** while `stable` is set nothing accrues and nothing is
  owed; moving between stable states (aid → care, care again) changes only the label; ending
  care (`stable: null`) sets `cursor = now`.
- **Stabilization and care:** First Aid on a Deadly wound → `stable: "aid"` (maintained);
  self-stabilization → `"self"`; a doctor's Heal course → `"care"`. GM buttons: **Under care**
  (`"care"`), **Aid/care ends** (`stable: null, cursor: now` — bleeding resumes, p.115), and
  **Survived** on a lethal episode (`lethal: false, stable: "care"`, the GM's adjudication).

### 6a. Chronological order across a time jump (R5 #2)
`reconcileHealing(actor, now)` builds the list of due events — course completions at `dueAt`,
bleeding ticks at `cursor + 600·k` — and applies them in time order (tie: a completion due at
the same moment as a tick lands first), stopping each kind at its own validity: a tick that lands
before a Stun box's `dueAt` bumps `restGen` and voids that box; a box due before the first tick
completes. Each event is its own update as above (claims and guards unchanged); the remaining
ticks after the last course event are aggregated.

### 7. GM controls (sheet condition panel)
Shows the running courses ("Serious → Moderate, due 4 Jan 18:00"; "1 Stun box, due 21:40") and
the bleeding state, with GM buttons **Finish now** (§4), **Cancel**, **Rest interrupted** (Stun:
cancel keeping the cap; First Aid: cancel — "it can be repeated"), **Clear stuck start**,
**Under care**, **Aid/care ends**, **Survived**.

### 8. Calendar notes
One note per actor for its running natural-healing course only, like the substance notes
(ownership marker, per-actor `run` queue, deleted on completion/void/actor delete and on
deleteToken for an unlinked token's actor). Visibility setting `healingNotesVisible`,
**default hidden** (Codex R1 #15 — "visible" means everyone, not just the owner).

### 9. Code layout
- `module/rules/healing-clock-rules.mjs` (pure): `clockChanges(before, changes, now)` (the
  hook's whole decision), `completionUpdate(course, monitor)`, `bleedTicks(cursor, now)`,
  `lethalOverflow(naturalBody, cymMax)`, `goldenHour(injury, now)`, `stunSuccesses(roll, cap)`.
- `module/healing-clock.mjs`: the hook, start, `reconcileHealing(actor, now)`, GM buttons, notes.

### 10. Tests
- Vitest: every pure function (rewound clock, cap, lethal threshold, mixed episode).
- Quench `sr2e.healing-clock` (R2 #13): world time is NEVER advanced; tests call
  `reconcileHealing(actor, now)` with an injected `now` on test actors only, and the gate is
  forced on through a test seam. Also (R3): duplicate completion of a cybermantic patient → one care
  receipt; a stale starter resuming after Clear stuck start → refused; stabilized then
  re-injured → bleeds from the new injury, not the old cursor; a failed bleed update → the next
  scan ticks it; Physical damage during a Stun roll → no course. (R4): a Physical stage completing
  while a Stun box rests → the Stun box still completes; a bleed tick doesn't void the doctor's
  course; a stale starter after Clear stuck start writes nothing; two reconciles at different times
  from one cursor → one tick set; a resumed Magic loss worker after a manual takeover applies
  nothing; stabilizing after an hour with no GM reconcile → 6 owed boxes land first. (R5):
  magical healing after an unreconciled hour → the owed boxes land before the healing; a Stun box
  due 12:05 with bleeding from 12:00 (first tick 12:10) reconciled at 12:20 → the box completes,
  then the ticks; the reverse ordering voids the box; First Aid at noon then care at 13:00 →
  nothing charged for the stabilized hour. Cases: start → advance →
  heals once; two concurrent starts → one course; damage during a course → void, no heal; magical
  healing during a course → void; completion with the claim taken but the update stubbed to fail
  → the course stays, Finish now works once; setting off → nothing completes, a changed monitor
  then voids on re-enable; unlinked token on an inactive scene completes; inherited base-actor
  course ignored by the token actor; bleeding ticks, stabilization stops it, Aid stops resumes,
  lethal card once; golden-hour prompt; Treat card snapshot; Stun interrupted → cap applies once.
  True multi-device behaviour (two browsers) is checked by hand in QA-PLAN.

## Key decisions & tradeoffs
- **D1 Stored, validated state** (not an event log): short-lived bookkeeping the GM can fix; the
  snapshot makes it self-invalidating.
- **D2 One completion writer:** the active GM.
- **D3 Big time jumps:** only the running course completes; bleeding accrues (RAW — the GM gets
  the card and decides).
- **D4 Off/on:** off pauses completion; on again, a still-valid course completes (its time has
  passed), a changed monitor voids it.
- **D5 Physical and Stun recover independently;** one course per column.
- **D6 First Aid on non-Deadly wounds is clocked** (Codex R1 #16, and the user's "anything
  applicable"); Deadly stabilization stays instant (it stops the bleeding when it succeeds).

## Out of scope
Treat/Heal maintenance turns; trauma patches; Deadly permanent damage; Shadowtech bioware
recovery; lifestyle enforcement; a cross-client damage sequencer.
