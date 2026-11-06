# Plan: VR2.0 program upgrading (and object-code pricing)
_Draft 4 (2026-11-06): **Codex-APPROVED (round 4); BUILT for 0.141.0 (code review 4 rounds)**. Rounds in PLAN-vr2-upgrading-REVIEW-LOG.md: rewritten against the current `module/programming.mjs` (5b's append-only `prog:` records,
`foldProgramming`, `designOf`). Draft 0 (2026-11-03) predated the records and is replaced._

Source: VR2.0 p.107, "Upgrading" and "Buying Programs" (PDF 115, rendered).

## The rules, as printed
**Upgrading.**
- Deckers may upgrade any program in the chapter except command sets, by raising its rating.
- They need a copy of the program's **source code**.
- Upgrading is a programming task:
  - base time = the base time for writing the upgraded version from scratch (p.100) − the base time for writing the
    current version;
  - task period = that base time ÷ the successes on a Computer Test against the **upgraded** rating;
  - the rest follows the standard programming rules (p.100).
- Deckers may also upgrade a program by **adding options** instead of raising its rating.

**Buying Programs.** The listed prices are for object code plus the source code. **Reduce prices by 25 percent for
object-code-only programs.**

## What the code does today (the base this plan changes)
- A program's lifecycle is durable records on the item (`recordEvent`): `prog:start:<gen>` (`progStart`, with the
  `design` captured by `designOf`, `designSize`, `baseTime`, `testMessageId`, `team`), `prog:log:…`, `prog:frozen:<gen>`,
  and ONE `prog:end:<gen>` (complete / abandon). `foldProgramming` derives `writing`, `unfinished`, `task`, `nextGen`.
- While a task is `writing`, the program is `unfinished` (unusable) and the `preUpdateItem` lock in `sr2e.mjs` refuses
  any design write (name, rating, multiplier, options, damageLevel, offense, manufacturer, category, frameCore).
- `complete()` refuses if `designOf(item)` no longer equals `task.design`, then writes the end record.
- The code button (`programmingDialog`) starts a task on ANY program not being written: writing a never-written
  project, or re-writing an owned one (it's unusable until done). Quench (UO R3) relies on re-writing; it stays.
- A bought program's rating/options are purchase drivers: editing them on the sheet reprices through the money queue.

## Approach

### 1. Object code only (pricing)
- `ProgramData.objectCodeOnly`: `BooleanField({ initial: false })`. Existing programs keep their source; no migration
  (nothing is guarded on it).
- `derivedItemCost` (the one shared price path): a program with `objectCodeOnly` under VR2.0 costs
  `Math.ceil(price × 0.75)`. Purchases, `repriceDelta` and the sheet all read it, so they agree.
- **Repricing (plan R1 #1–#2):**
  - `repriceDelta`'s `sysFor` carries `objectCodeOnly` (the live value, overridden by the change), so both sides of a
    toggle or of a later rating edit are priced with the right factor.
  - `PURCHASE_DRIVERS` gains `objectCodeOnly` and **`options`**. p.107 prices a program by rating and design size, and
    options change the design size, so a paid option edit on the sheet reprices too (today it silently doesn't).
    `changedDrivers` compares `options` structurally (`foundry.utils.objectsEqual`), every other driver as today.
  - Refunds keep the existing invariant (`min(paid, newPrice) − paid`): you never get back more than you paid.
    A free upgrade (§2) doesn't raise `paid`, so ticking "object code only" on an upgraded program refunds at most
    down to the discounted new price. That's intended: the upgrade cost no money.
- The program sheet shows the checkbox "Object code only (−25%, no upgrades; p.107)" under VR2.0.
- **A program the decker WRITES has its source** (plan R1 #6): derived, not written. `hasSource(item)` =
  `!objectCodeOnly || a completed non-upgrade writing task in its records`. No second write, so nothing to lose.

### 2. The upgrade task
**Entry.** A new **Upgrade** button (`fa-arrow-up`) on a program row, VR2.0 only, shown when the program is usable
(`!unfinished`), not being written or loaded, not a frame core, not a command-set program. `vr2ic` op `programUpgrade`
→ `upgradeDialog(actor, item)` in `programming.mjs`. The code button keeps its job (write / re-write / log work).

**The dialog** shows the current rating and options, and edits the target:
- **Target rating** (number, ≥ the current rating).
- **Added options** (only when Utility Options are on, `utilityOptionsOn()`): one row per option the utility allows
  (`UTILITY_OPTIONS[utility]` + sensitive) that it doesn't carry yet: a checkbox, a rating for rated options, the
  target for Limit, and the manufacturer for Sensitive. Existing options are kept exactly as they are (p.107 says
  "adding options"; changing an existing one is not an upgrade it describes).
- Live text: the new design size, `baseTime(target) − baseTime(current)` days, and the TN (the target rating).

**Refusals** (each a warning, nothing recorded):
- `!hasSource(item)`: "needs the source code (VR2.0 p.107)";
- a command-set program (p.107) or a frame core (a core's design is rewritten, part 6);
- a target equal to the current design, or a lower rating;
- the target rating over `programmingCap(utility, computers)` (the 5b caps and team rules, as `startDialog`);
- a target the data model would reject (plan R1 #7): the dialog reads integers (`parseInt`), and the whole proposed
  system is validated by the item's own schema (`item.validate({ changes: { system: target }, strict: true })`,
  refusing on the error) before anything is recorded; the target's design is that validated, cleaned data. Then an
  added option that `activeOptions` would leave inert is refused with its reason.

**The test** is `startDialog`'s, with the TARGET's numbers: Computer (or the Sensitive average when the TARGET carries
Sensitive), team rules, TN = the target rating (min 2). Successes freeze on the first log, as today.

**The record:** `prog:start:<gen>` `{ type: "progStart", gen, testMessageId, team, upgrade: true, from: designOf(item),
design: <target design>, designSize: <target design size>, baseTime: max(0, baseTime(target) − baseTime(from)) }`.
- `design` is the TARGET, so every existing reader of `task.design` keeps meaning "what this task produces".
- The start re-checks, after the roll, that `designOf(live)` still equals `from`, nothing is writing or loading, no
  upgrade is pending (below), and the program is still eligible (`hasSource`, not a command set, not a core)
  (plan R1 #9).

**While upgrading the program keeps working at its current design.** p.107 doesn't take the old version away; the
decker still has its object code.
- `foldProgramming`: `unfinished = (writing && !task.upgrade) || !usable`. An upgrade task never makes a program
  usable that wasn't (it can only start on a usable one).
- The design lock: while the upgrade is `writing` OR **pending** (completed, not yet applied), the design (= `from`)
  is fixed, and so are `objectCodeOnly` and `commandSet` (plan R1 #4, #9). The lock admits exactly one write while
  pending: the apply (below), recognized by its option `sr2eUpgradeApply: <gen>` and changes equal to that task's
  target.

**Mainframe adequacy** (p.101) is checked against the task's rating, `task.design.rating` (= the item's rating for a
writing task, the target for an upgrade) (plan R1 #8).

**Base time 0** (adding Limit, rating −1 per p.104, gives a smaller design): `max(0, …)`. The book is silent; the user
confirmed (2026-11-03) it is allowed. The test still rolls: ≥ 1 success completes on the first log with no days asked
(`workDialog`: a task with `baseTime === 0` freezes, then completes); none fails, as any programming test.

**Completion** (`complete()`, upgrade branch):
1. Refuse if `designOf(live)` ≠ `task.from` (it can't change while locked, but a GM can bypass the lock).
2. Write the ONE end record (`outcome: "complete"`), server-arbitrated as today.
3. **Apply the target through the sequencer** (plan R2 #2, R3 #1): the device whose end record won sends
   `request(actor, "progApply", { item: item.id, gen })` (the 5a request log on the decker; the active GM's sequencer
   runs it, one at a time, with every other request). The handler RE-CHECKS inside the queue that the item is still
   pending for that gen (step 4), then makes ONE write: `item.update({ system: { rating, options, manufacturer,
   loadGen }, flags: { sr2e: { upgradeApplied: gen } } }, { sr2eNoCharge: true, sr2eUpgradeApply: gen })`. No money
   moves: the decker programmed it. `loadGen` is the live value + 1 when loaded (§Decided 2). The marker lands in the
   SAME write as the design. Not pending any more → `{ ok: true }`, nothing written: a duplicate request is a no-op,
   and can never overwrite a later edit.
4. **Pending until applied** (plan R1 #4–#5, R2 #1, R3 #2): `programmingState(item)` exposes `pending = { gen, design }`
   when the LATEST task is a completed upgrade, `(flags.sr2e.upgradeApplied ?? 0) < gen`, and `designOf(item)` still
   equals its `from`. Once applied, a later downgrade on the sheet can't bring it back (the marker). While pending:
   - the design lock holds (above), so no other edit lands in between;
   - both start paths (the code button and Upgrade) refuse to start anything, so the pending task stays the latest;
   - the row shows **Apply upgrade** (anyone who owns it), which sends the same `progApply` request: the recovery for
     a request that never left a dead client. Safe at any time, because the handler re-checks.
   - If the design is neither `from` nor the target (a GM console edit), it's not pending; the card says so.

**Abandon** works as today (the program stays at its current version: the confirm says "the current version stays").

### 3. Sheet
- Program row: an upgrading program shows "upgrading to R<n>[ + options]: <done>/<period> days" where the writing
  progress shows today, and it stays usable (no "unfinished" styling).
- The item sheet's "being programmed" hint names the upgrade target.

### 4. Tests
**Vitest** (`test/vr2-options.test.mjs`):
- upgrade base time: Browse-2 → Browse-4 = baseTime(16) − baseTime(4) = 32 − 8 = 24 days;
- adding One-shot to an Attack-4M: design 48 → 72, so 144 − 96 = 48 days (computed with `deriveProgram`);
- adding Limit to the Attack-4M: design 48 → 27, base time max(0, 54 − 96) = 0;
- `foldProgramming`: an upgrade task in progress leaves the program usable; a new-program task doesn't;
- `derivedItemCost`: object code only = ⌈0.75 × price⌉ under VR2.0, unchanged under core rules;
- `foldProgramming`/`programmingState`: `pending` set for a completed, unapplied upgrade; cleared once the design is the
  target; `hasSource` true after a completed writing task.

**Quench** (`sr2e.vr2-options`, +4):
- upgrade start → log → complete: the rating is the target, the program stayed usable during the task, no nuyen moved
  on a bought program, `loadGen` bumped on a loaded one;
- an object-code-only program is refused; a sheet rating edit and an `objectCodeOnly` toggle during the upgrade are
  refused; an object-code-only program written by the decker can be upgraded;
- repricing a bought program: object code on → refund 25%, off → pay it; adding an option on the sheet charges the
  design-size difference; a discounted program's rating edit is priced at 75%;
- mainframe adequacy is checked against the target rating;
- a Limit upgrade completes on the first log with no days;
- a completed upgrade whose apply failed (end record written by hand) is pending: the design lock holds, the code
  button and Upgrade refuse to start, Apply upgrade applies it (no marker yet: the `?? 0` case); a second
  `progApply` for the same gen writes nothing; after applying, a sheet downgrade leaves it not pending (the marker).

## Key decisions
- **A separate Upgrade button**, not a new mode of the code button: the code button's re-write behaviour is relied on
  (UO R3), and an upgrade is a different task with a different TN and base time.
- **`design` is the target** in the start record, `from` is the current design: existing readers of `task.design`
  stay correct, and the lock holds `from`.
- **Usable while upgrading** (p.107 doesn't take the old version away).
- **Additions only** for options; existing options are untouched.
- **Prices:** one ×0.75 at the shared price path; toggling it on a bought program reprices.

## Decided (2026-11-03)
1. **Base time ≤ 0** (adding Limit): allowed, base time = max(0, difference); the test still rolls. User confirmed
   the book has no commentary.
2. **Upgrading a loaded program:** completion bumps `loadGen`: the upgraded copy is new object code (a spent one-shot
   and DINAB wear of the old version don't carry over). Programming takes days, so this happens between runs.

## Risks
- The completion is two writes (end record, then item update). §2 step 4 holds the design lock and blocks new tasks
  until the second write lands; the sequencer writes it, re-checking in its queue; Apply upgrade re-sends a lost request.
- Paid option edits now reprice (a behaviour change for bought programs with options; CHANGELOG says so).
- A GM can edit a locked design through the console; completion then refuses (step 1), as `complete()` does today.

## Documentation (part of done)
- Wiki "The Matrix" (Programming → Upgrading, object code) and a How-To "Upgrade a program (VR2.0)" with a GIF.
- `npm run gen-guides && npm run build-packs guides`. CHANGELOG, QA-PLAN, CLAUDE.md.

## Out of scope
- Command sets (not upgradable, p.107). Frame cores (rewritten, part 6). Cyberdeck upgrades (p.83).
- Removing or changing existing options (not an upgrade p.107 describes).
