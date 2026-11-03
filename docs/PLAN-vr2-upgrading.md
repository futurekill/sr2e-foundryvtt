# Plan: VR2.0 program upgrading (and object-code pricing)
_Draft 0 (2026-11-03). Small extension of part 5b programming (`module/programming.mjs`). Not yet Codex-reviewed._

Source: VR2.0 p.107 "Upgrading" and "Buying Programs" (PDF 115, rendered).

## The rules, as printed
**Upgrading.**
- Deckers may upgrade any program in the chapter except command sets, by raising its rating.
- They must have a copy of the program's **source code**.
- Upgrading is a programming task:
  - Base time = the base time for writing the upgraded version from scratch (p.100) − the base time for writing the
    current version.
  - Task period = that base time ÷ the successes on a Computer Test against the **upgraded** rating.
  - The rest follows the standard programming rules (p.100).
- Deckers may also upgrade a program by **adding options** instead of raising its rating.

**Buying Programs.**
- A program's price comes from its rating and design size. Option ratings don't affect it.
- The listed prices are for object code plus a copy of the source code. **Reduce prices by 25 percent for
  object-code-only programs.**

## Approach
1. **Source vs object code.**
   - Add `ProgramData.objectCodeOnly`, a BooleanField with `initial: false`, so every existing program keeps its
     source. That way it needs no migration ([[sr2e-migration-schema-default-trap]]).
   - Price: `derivedItemCost` multiplies the program price by 0.75 when it's set. That's the one shared price path,
     so purchases, repricing and the sheet all agree.
   - Chargen and purchase: a checkbox "object code only (−25%)" on the program sheet. Changing it on a bought item goes
     through the existing reprice veto/re-issue in the money queue (`repriceQueued`), like a Rating change.
   - A program written by the decker (a completed programming task) has source by definition. Completing a task
     clears `objectCodeOnly`.
2. **The upgrade task.** It reuses `flags.sr2e.programming` with `kind: "upgrade"`:
   - The fields are `from: designOf(item)`, `target: {rating, multiplier, options}`, and
     `baseTime = baseTime(designSize(target)) − baseTime(designSize(from))`, plus the existing fields (taskId,
     testMessageId, team, period, log, complete).
   - The code button on a program row opens **Upgrade** when the program isn't being written (no task, or a completed
     one). The dialog edits a target rating and target options (the same option editor rows as the sheet), and shows
     the new design size and base time.
   - Refusals:
     - object-code-only ("needs the source code, p.107");
     - target the same as now;
     - target over `programmingCap` (the 5b caps, plus team rules).
   - A base time ≤ 0 is not refused: see Decided 1.
   - Test: Computer (Sensitive: the 5b average) against the **target** rating. Successes freeze on the first logged
     day, as for new programs.
   - While upgrading, the program **keeps working at its current design**. The book doesn't say the old version stops
     working, and the decker still has the old object code. That differs from new programs, which are unusable until
     written.
   - **Completion is one update:** `system.rating`/`options` ← target and `flags.sr2e.programming.complete` ← true.
     - The `preUpdateItem` design lock allows a design write only when that same update completes an upgrade task
       whose target equals the written design.
     - Any other design edit during the task is still refused.
     - A design edited outside the task (impossible while locked) is checked against `from` and refuses completion,
       as today's `objectsEqual` check does.
   - Completing an upgrade bumps `loadGen` if the program is loaded, so DINAB wear and one-shot claims of the old
     version don't carry over. Open question 2.
3. **Tests.**
   - Vitest:
     - upgrade base time: Browse-2 → Browse-4 = baseTime(16) − baseTime(4) = 32 − 8 = 24 days;
     - adding One-shot to an Attack-4M: design 48 → 72, so 144 − 96 = 48 days;
     - adding Limit gives a base time of 0, so it completes on the test with ≥ 1 success;
     - the 0.75 object-code price.
   - Quench `sr2e.vr2-options` (+3):
     - upgrade start → log → complete changes the rating;
     - the program stays usable during the upgrade;
     - an object-code-only program is refused;
     - a sheet edit during the task is refused.

## Key decisions
- **Usable while upgrading** (above). The alternative, unusable until done, is how a new program behaves, but nothing
  in p.107 takes the current version away.
- **Prices:** one 0.75 factor at the shared price path. No separate "source code" item.

## Decided (2026-11-03)
1. **An upgrade whose design comes out smaller.**
   - The only way this happens is adding **Limit** (rating −1, p.104). Adding an option is an upgrade by p.107's own
     words, so it is allowed.
   - The book has no comment on a base time ≤ 0 (current version's base time ≥ the new one's). Our reading:
     base time = max(0, difference).
   - The Computer Test against the upgraded rating is still rolled. With at least one success, the upgrade completes
     immediately (period 0). With none, it fails, as any programming test does.
   - The user asked "the rules don't have any commentary about this?" Confirmed: they don't. The refusal in draft 0 is
     dropped.
2. **Upgrading a loaded program:** decided in the plan, not a user question. The upgraded copy is new object code, so
   completion bumps `loadGen`.
   - In practice this only matters in two places: a spent one-shot fires again, and a DINAB's lost points come back,
     without a Swap Memory.
   - Programming takes days, so this happens between runs, where reloading is free anyway.

## Out of scope
- Command sets (not upgradable, p.107).
- Frame cores: covered by part 6, and a core's attributes can't be rearranged, so changing them is a rewrite.
- Cyberdeck upgrades (p.83).
