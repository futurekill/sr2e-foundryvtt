# Plan: VR2.0 part 6: frames and SKs
_Draft 5 (2026-11-05): 6a-0 released in 0.131.0. **6a-1 (frame cores and loading) Codex-APPROVED round 2; BUILT and released in 0.135.0 (code review approved round 3).** 6a-2 is outlined in three sub-parts
(6a-2a/b/c), each to be detailed and reviewed. **6a-2a Codex-APPROVED round 3; BUILT and released in 0.136.0 (code review approved round 5).**
6a-2 (running frames), 6b and 6c each get their own detailed section and review, meeting the requirements Codex R1
raised (listed below). Codex review: docs/PLAN-vr2-part6-frames-REVIEW-LOG.md. No code before review._

Sources (all rendered from the image-only PDF, `Shadowrun 2e - Virtual Realities 2.0 {FASA7904}.pdf`; book page = PDF − 8
here): Frames pp.105–107 (PDF 113–115), DINAB p.103–104, Command Sets p.104, Upgrading p.107, Buying Programs p.107,
Condition Monitors p.124, SKs pp.140–141 (PDF 148–149), Decoy p.112, Null Operation and Scan Icon p.117 (PDF 125).

## Goal
A decker can write a frame core, load utilities onto it, upload it to a host and run it: a **dumb frame** that acts on
the decker's commands, or a **smart frame** that takes its own turns. The GM can run **SKs** (semi-autonomous
knowbots): personas without decks that carry a Utility Pool instead of programs. Frames and SKs are icons: they can be
attacked, take damage on a 10-box monitor, crash, and be targeted by the Limit option's "frame"/"SK" target types
(part 5b already lists them).

## The rules, as printed
**Frame core (p.105–106).**
- Size = Core Rating² × multiplier: **2** for dumb cores, **3** for smart. Dumb or smart is fixed when written.
- Options allowed on a core: DINAB, optimization, squeeze.
- Core Rating ≤ the programmer's Computer × 1.5, rounded down.
- Bod + Evasion + Masking + Sensor ≤ Core Rating; any may be 0. Core Rating replaces MPCP in any test that needs one.
- A smart frame's Reaction = its Core Rating.
- The total rating of the loaded programs, options excluded, must stay ≤ Core Rating, less any Core points given to
  Initiative.
- A core's attributes can't be rearranged: different attributes need a new core. The same core can be reloaded with
  different programs.

**DINAB and cores (p.106).**
- Every smart core must carry DINAB, and its DINAB rating is the frame's Computer skill.
- DINAB raises the core's design rating by the DINAB rating. Genie's 12-point smart core with DINAB-8 is
  1,200 Mp = (12 + 8)² × 3, so the raise counts in the size too.
- A dumb core may carry DINAB, which lets it trigger one of its programs on a given action.
- DINAB rating ≤ the programmer's Computer, set when written and never changed.

**Smart frame Initiative (p.106).**
- 1D6 base, plus 1 die for each Core point given to Initiative.
- Those points are set when the core is written, and they reduce the Core Rating used for the program total.
- Whenever the Core Rating drops, the loaded program ratings must be cut to fit.

**Frame loading (p.106).** A programming task.
- Loading Rating = Σ program ratings ÷ 2. Options and the core don't count.
- Loading size = LR²; loading base time = size × 2 days.
- Computer Test against the average rating of the programs being loaded. The Software concentration or Matrix
  Programming specialization may be used instead.
- Task period = base time ÷ successes.
- Programs are object-code copies, whole only: no partial copies.
- **Misprint:** the worked example prints "(10 + 2)² = 25", which can only be (10 ÷ 2)² = 25 (Attack-6 + Cloak-4 = 10).
  This is the same ÷ → + glyph substitution as the core book ([[sr2e-source-captures]]).
- Frame actual size = the core's actual size + the actual sizes of its programs and options: 1,200 + 144 + 48 = 1,392 Mp.

**Running a frame (p.106).**
- The decker logs on to a host and uploads the frame, which starts running when the upload completes.
- Compressed or squeezed frames must be decompressed first.

**Dumb frames (p.106–107).**
- A command is a Simple Action, even when the program does a Complex one.
- A command is one action, with no repeating: a second attack needs a second command.
- Dumb frames crash when the decker logs off that host, and they don't follow him to other systems.
- *Decoy frames:* with the Decoy operation, security targets the frame while the decker stays inactive. The decker uses
  his own Computer skill, but all attribute scores come from the frame, and only the frame's utilities count. IC hits
  the frame, though trace still finds the decker (same datatrail). Once the decoy crashes, security reacts to the
  decker normally.
- *Event triggers:* the decker must be on the same system to get the message, which may need a Null operation. The
  frame needs Sensor + analyze and/or scanner, each at least half the host's Security Value.
- *Weapon carriers:* each attack takes a Simple Action, and the programs are lost if the frame crashes.

**Smart frames (p.107).**
- They can do anything a dumb frame can, with their own skill (the DINAB rating) and their own Reaction and Initiative.
- The decker gives a basic order as a Free Action, and the frame carries it out on its own actions without using any
  of the decker's.

**Icon damage (p.124).**
- Every icon has a 10-box Condition Monitor and crashes when it fills.
- It resists damage with Bod against the damage's Power; Armor lowers the Power.

**SKs (p.140–141).**
- MPCP = 1D6 + 6. Bod + Evasion + Masking + Sensor ≤ MPCP × 3, each ≤ MPCP. Computer skill = MPCP.
- They load no utilities. Instead they have a Utility Pool of MPCP + 1D6 points:
  - Points are allocated to any utility as a Free Action, 1 point = 1 rating point, with the rating ≤ MPCP.
  - Black hammer and killjoy cost 2 points per rating point.
  - Points put into restore or medic can't be reallocated until the SK returns to its native host.
  - Points can also go to Initiative: 1 point → 2D6, 3 → 3D6, 5 → 4D6 (the maximum).
- Reaction = MPCP, with 1D6 Initiative.
- On its native host it repairs damage: a Complex Action gives it a medic/restore at MPCP rating, without using the pool.
- It can't jack out: it has to use Graceful Logoff and Logon to Host. It crashes when its monitor fills.
- The six printed configurations (MPCP-7/6/5/5/5 … MPCP-12/9/9/9/9) are examples.

**Command sets (p.104).**
- The decker writes the set in advance: design size 1D6 × 20 Mp. After upload, a Control Test loads it.
- The host's successes against the decker's Subsystem Tests are summed: 24 ÷ that sum = the hours before it's found
  and purged. With no successes, it lasts 48 hours.
- The GM picks which Subsystem Test the set needs, with Control as the default.

**Null operation (p.117).** Test Control, utility Deception, Complex Action.
- The GM may require one or more whenever a decker waits for something (a Matrix event, the end of an ongoing
  operation) or does things that take actions but no System Tests (e.g. maintaining an Edit Slave), and may roll it
  secretly for the decker.
- The host's opposed Security Test uses its base Security Value, plus the inactivity modifier: under 10 seconds +0;
  10 s–1 minute +1; 1 minute–1 hour +2; 1–12 hours +4; +1 more per additional 12 hours. The GM may cap the period.
- A tally trigger it causes may be activated by the GM later in the waiting period.

**Scan Icon (p.117).** Test Special, utility Scanner, Simple Action.
- On a decker, frame or SK the decker has located: Computer Test against the target icon's Masking.
- If the target runs Sleaze, subtract Sleaze from the scanner's Scanner rating and lower the TN by the difference;
  if Sleaze is higher, raise the TN by the difference.
- Each success buys one fact: its MPCP Rating, any one Persona Rating, or its Response Increase. Identifying the icon
  needs Analyze Icon.

**Upgrading (p.107)** is its own plan: docs/PLAN-vr2-upgrading.md.

## Approach (proposed)
0. **Phasing.** 6a-0 the missing icon operations (Decoy, Null Operation, Scan Icon), 6a frames (core + loading +
   dumb + smart), 6b SKs, 6c command sets. Each is releasable alone; 6b reuses 6a's icon actor. Upgrading is
   docs/PLAN-vr2-upgrading.md.
1. **Frame core = a program item** with `frameCore: {kind: "dumb"|"smart", bod, evasion, masking, sensor, initPoints}`.
   - It uses the part-5b options machinery: the allowed options are DINAB, optimization and squeeze. Smart requires
     DINAB.
   - The size goes through `programSizes`, with the design rating raised by DINAB (the Genie example becomes a test).
   - The cap goes into `programmingCap(kind: "frameCore")`: Computer × 1.5, rounded down. That also closes the 5b
     note "1.5× cap stated, not modelled".
   - Pure rules go in `module/rules/vr2-frames.mjs`, with Vitest tests on the Genie example.
2. **Loading = a programming task on the core** (reusing `module/programming.mjs`).
   - The task stores `{load: [{itemId, name, rating, actualSize}]}`, the loading rating, the base time, and the test
     against the average rating.
   - Completion writes `flags.sr2e.frame.loaded = [...]` as a SNAPSHOT of object-code copies.
   - Editing or deleting the source programs afterwards doesn't change a loaded frame. The book says they're copies,
     and a snapshot also keeps the frame stable across devices.
   - The total is validated against Core Rating − initPoints.
3. **A running frame = a new actor type `frame`**, an icon like IC: system.json `documentTypes` (needs a server
   restart), plus a data model and a sheet.
   - Uploading a core on a host creates the frame actor and its token, through `createActorViaGM`, gated by
     `canCreateActor()` ([[sr2e-actor-relay-backlog]]).
   - The actor carries the core's attributes, the loaded snapshot, `ownerUuid` (the decker), `hostUuid`, and the
     owner's connection id.
   - Lifecycle is an event-log fact like part 3: a dumb frame crashes when the decker's connection to that host ends,
     and only the sequencer writes that crash.
   - Alternative rejected: reusing the `ic` type. IC behaviour (host-owned, the sequencer's IC turns, trace, the alert
     ladder) would leak into frames, and every IC check would need a "not a frame" exception.
4. **Frames in combat.**
   - Frames are valid attack and maneuver targets: add `frame` to the target-type checks in vr2.mjs/vr2ic.mjs, after
     grepping every `["ic", "character"]`.
   - Damage resistance is Bod (+ a loaded Armor/Shield) against Power, on the 10-box monitor; a full monitor crashes
     the frame.
   - Dumb frame command:
     - The command button on the decker's Matrix tab uses the decker's Simple Action.
     - Dice: the program's rating for attacks (p.123, as personas do), and the decker's Computer for System Tests
       (the decoy rule).
     - The frame's attributes stand in for the persona's, and only its own loaded programs count.
   - Smart frame: its own combatant, with initiative Reaction (= Core) + (1 + initPoints)D6. Its Computer is its DINAB
     rating, and its owner rolls its actions from the frame sheet.
   - DINAB on a dumb core: one automatic program trigger per action, on the 5b DINAB wear/crash rules.
5. **Decoy and Locate Frame operations.**
   - **Locate Frame** already exists as a system operation (`config.mjs`: Index, Scanner). It needs frames to find.
   - **Decoy** (p.112, rendered) is missing. Rules:
     - Control Test, Mirrors utility, Complex Action.
     - It makes a decoy copy of the decker's icon and records the Control Test's successes.
     - Whenever a proactive IC attacks the decker, roll 1D6. If the roll is less than the successes, the IC attacks the
       decoy instead; a tie also fools the IC.
     - Decoys have no defences and no damage resistance: they take full damage and vanish when their monitor fills.
     - Not effective against trace IC.
     - Decoy can also be used to lock IC's attention onto frames (p.105–107: security goes after the decoy frame while
       the decker stays inactive, and the frame's attributes count).
   - **Plan:**
     - Decoy is a `decoy` record on the decker: successes, connection, and a 10-box monitor. The 1D6 redirect is rolled
       by the sequencer at IC attack admission and written into the admit record, so every device agrees.
     - A frame decoy is the same record pointing at the frame actor.
     - Trace still resolves to the decker, and scanner lowers Locate Frame/Decker as it does today.
   - Plain Decoy doesn't need frames, so it ships first, as 6a-0, with:
     - **Null Operation**: a system operation in `config.mjs` (`nullOp: control / Deception`). Its dialog asks for
       the waiting period, and the Security Test uses the base Security Value + the inactivity modifier (a pure
       `nullInactivityMod(seconds)` in vr2 rules, Vitest on each band). A GM "roll it secretly" option whispers the
       card to the GM.
     - **Scan Icon**: a Simple Action on a located decker (6a-0), frame or SK (6a/6b), Computer vs the target's
       Masking with the Sleaze/Scanner difference; the card lists one fact per success for the decker to choose, read
       from the target's derived data (MPCP or Core Rating, persona ratings, Response Increase).
6. **SKs (6b).**
   - `frame` actor with `kind: "sk"`: MPCP, persona ratings (validated ≤ MPCP each, Σ ≤ MPCP × 3), Computer = MPCP,
     `utilityPool {total, alloc: {utility: points}}`, `nativeHostUuid`.
   - Allocation is a Free Action from the SK sheet, and each utility it allocates behaves like a loaded program of that
     rating (a virtual program list feeding `activePrograms`).
   - Black hammer and killjoy cost 2:1, and restore/medic points are locked until the SK is on its native host.
   - Initiative takes the 1/3/5-point dice steps.
   - Native-host regeneration is a Complex Action button.
7. **Command sets (6c).**
   - A command-set item: size roll, Control Test, a hours-undetected card. The rest is the GM's narrative.
8. **Tests.**
   - Vitest: core size/cap/attributes, the loading rating with the ÷ example, SK pool costs, initiative steps.
   - Quench `sr2e.vr2-frames`: write, load and upload a dumb frame; command an attack; IC kills the frame; logoff crashes
     it; smart frame initiative; decoy redirect; SK allocation; Limit:frame.

## 6a-0 in detail: Decoy, Null Operation, Scan Icon (released 0.131.0)

**Decoy (p.112): Control, Mirrors, Complex.**
1. A system operation (`decoy: control / Mirrors` in config.mjs) run through `vr2SystemTest` like any other. After
   the roll the decker's client ALWAYS writes one durable record on itself, success or not:
   `vr2:decoy:<conn>:<cardId>` `{ card, host, sessionId }` (`recordEvent`; the deterministic id makes a double click
   one record). Whether it is a decoy is decided live from the card (next point), so a Karma reroll that turns a
   failure into a success creates the decoy with no extra write (R2 #4).
2. **Successes are read live from the card** (`flags.sr2e.vr2SystemTest.successes`, which the Karma buttons update):
   p.112 says "record the number of successes the decker achieves". A Karma reroll that turns the test into a failure
   makes the decoy invalid; one that adds successes strengthens it. The card is the source of truth; a deleted card
   ends the decoy.
3. **The live decoy** (folded, never stored): take the NEWEST decoy record of the live connection whose card currently
   shows a success OR no longer exists (R3: a deleted card counts as a decoy that's gone, so it still blocks the older
   one); that one alone is then checked — a missing card means no decoy — its `sessionId` must be the decker's current host session
   (logging on to another host or off ends it) and its damage (below) under 10 boxes; otherwise there is no decoy
   (R2 #1). So:
   - a successful Decoy replaces the old one for good: when the new one is destroyed, the old one does NOT come back;
   - a failed attempt (or one Karma turns into a failure) never happened as far as decoys go: the existing decoy
     stays. (The book is silent on several decoys; one, replaced by the next, is the simplest reading of "a decoy
     copy".)
   - A record whose card was deleted while it was still a failure also ends the older decoy. Deleting a test card
     is a GM tidy-up, so erring toward "no decoy" is the safe side.
4. **The redirect roll (R1 #1).** In `attackOnce`, an IC attack on a character whose program `isProactive` and isn't
   `trace` ("not effective against trace IC"), when the target has a live decoy:
   - it must be rolled by the active GM (the sequencer), exactly as cascading IC already is, so one client decides;
   - BEFORE any target-dependent term is computed, the sequencer rolls a visible 1D6 (a chat roll). Roll ≤ the
     decoy's successes ("less than … in the event of a tie, decoys fool IC") → **the attack goes to the decoy**.
   - A decoyed attack uses NONE of the decker's target terms: no traced −1, no maneuvers/parry, no black-IC +2 for a
     downed icon, no crippler attribute effect (a decoy has no attributes: the attack just does its damage). TN is the
     cybercombat table for the host's code and the IC's status; dice and Power are the IC's.
   - The card carries `decoy: { key, roll, successes }` and `targetUuid` stays the decker (for the admission below).
   - *(Built differently: the roll is carried on the attack card and in the `admit:<card>` fact, not a separate
     `vr2:decoyroll` record; noted in code review round 1.)*
5. **Admission and resolution (R1 #1, R2 #2–#3).** A decoyed attack is still requested and admitted as an IC attack
   on that decker (`Y.request(target, "attack", …, decoy: key)`), so exits, locks and the Black IC last-attack
   bookkeeping see it exactly as before. `HANDLERS.attack` copies `decoy` into the `admit:<card>` fact (today it
   copies only named fields). Its resolution button is **Hit the decoy** (the GM's), not the decker's resistance. It
   is a new sequencer handler `decoyHit`, shaped like `HANDLERS.apply`: it refuses unless the card was admitted on
   that connection WITH that decoy key, and returns ok without writing if `ack:attack:<card>` exists already.
   - "No special defenses and no damage resistance, so they take full damage": the IC's Damage Level staged up one
     level per two attack successes (the card's current successes), onto the decoy's 10-box monitor;
   - **0 successes is a miss**: no hit record, just the ack with `{ decoy: key, boxes: 0 }` (R2 #3);
   - written by the sequencer as `vr2:decoyhit:<conn>:<card>` `{ decoy: key, boxes }` (deterministic id: one hit per
     card), and the same `ack:attack:<card>` fact a normal resolution writes (outcome `{ decoy: key, boxes }`), so
     the admission is acknowledged and nothing on the decker waits for it;
   - if the decoy is already gone (full, replaced, session over), the hit still acks and lands on nothing: the IC
     wasted the attack on a vanished copy;
   - the decoy's damage is the sum of its hit records; at 10 it disappears (a chat line).
6. Trace IC ignores decoys (rule 4), and trace still finds the decker.

**Null Operation (p.117): Control, Deception, Complex.**
1. `nullOp: control / Deception` in config.mjs; its dialog adds **waiting period** (a number + seconds/minutes/hours).
2. The host's Security Test uses its BASE Security Value (`host.system.securityValue`, which is the base: cascades
   add separately) **+ the inactivity modifier** from a pure `nullInactivityMod(seconds)`: < 10 s +0; 10 s–1 min +1;
   1 min–1 h +2; 1–12 h +4; +1 per further 12 h (Vitest on every boundary). `vr2SystemTest` takes it as
   `opts.svMod`, shown on the card.
3. **Secret (R1 #3).** The dialog has **roll it secretly** (GM only, as the book allows): EVERY message the operation
   posts — the decker's roll, the System Test card, a Probe roll — is whispered to the GMs as a blind roll, via one
   `secret` option threaded through `vr2SystemTest` (and its probe), so nothing leaks to the player. The tally still
   rises (the tally event is processed from the message flags, whispered or not).
4. **Triggers (R1 #3, partly rejected).** The tally increase and the triggers it crosses apply as for every System
   Test. The book leaves the response's TIMING to the GM ("as he sees fit, perhaps after a percentage interval");
   the card says so. No deferred-trigger mechanism: triggers already only post to the GM, who decides when the IC
   shows up.

**Scan Icon (p.117): Special test, Scanner, Simple Action (R1 #4).**
1. A button on the Matrix tab beside Attack: target an icon first. 6a-0 targets: a decker's persona (frames and SKs
   join in 6a/6b through the same check).
2. **"Located"**: the same standard as an attack: the target is targeted and not lost (`maneuverState(...).blind` is
   false). The card records the target's `sessionKey` (its incarnation) so a reconnect makes it stale.
3. The utility executes like any other (`bestUtility(actor, "Scanner", host)` + `spendUse`, so one-shot, DINAB and
   Sensitive all apply). **TN = target Masking − (Scanner − target's Sleaze)**, min 2: Sleaze higher than Scanner
   raises it by the difference. Computer test (Hacking Pool allowed); no host roll ("Special").
4. **Disclosure only as paid:** the card is whispered to the scanning player and the GMs and shows N empty slots
   (N = successes, following Karma). Each slot's **Choose** button opens a pick (MPCP, Bod, Evasion, Masking,
   Sensor, Response Increase) and claims the slot with a DURABLE record, `recordEvent(actor, "vr2:scan:<card>:<slot>",
   { pick, value })` (R2 #5: `once` markers are pruned after 24 hours, which would reopen paid slots). The value is
   read from the target's derived data at the claim, and the card re-renders from the records. Nothing unchosen is
   ever rendered.
5. **Checked at the claim, not just by hiding buttons (R2 #6):** the slot index must be below the card's CURRENT
   successes, and the target's `sessionKey` must still be the one the card captured (a reconnect makes the card
   stale: no more picks). Picks already made stay: they were true when paid for.
6. Identifying the icon is Analyze Icon (exists).
7. The TN is shown as on every Matrix card (R2 #7 rejected: tests are rolled against a TN the player sees, and every
   Matrix card already shows TNs built from the target — IC defenses, Trace Factor; with the target's Sleaze
   unknown it doesn't pin Masking down anyway).

**6a-0 tests.**
- Vitest: `nullInactivityMod` bands; decoy fold (live / replaced / the replacement destroyed doesn't resurrect the
  old one / a failed newer attempt keeps the old / the newer card deleted → no decoy / session ended / 10 boxes /
  failure→success by Karma);
  `decoyFooled(roll, successes)` (≤, tie fools); Scan Icon TN with Sleaze above and below Scanner; staged decoy damage.
- Quench `sr2e.vr2-decoy`: a Decoy success records one decoy (double click → one); a killer IC attack with roll ≤
  successes is decoyed (its card has no decker terms) and Hit the decoy writes one hit + the ack; trace IC is never
  decoyed; 10 boxes remove the decoy; logging on to another host ends it; a Karma reroll to failure invalidates it;
  a 0-success decoyed attack acks with 0 boxes; a refused admission (the decker leaving) can't be hit onto the decoy;
  Hit the decoy clicked twice writes one hit.
- Quench: a secret Null Operation posts only GM-whispered messages and still raises the tally; the modifier shows.
- Quench: Scan Icon spends Scanner, reveals only claimed slots, a second click on a claimed slot changes nothing,
  a pick beyond the current successes or after the target reconnects is refused, and picks survive a marker prune.

## 6a-1 in detail: frame cores and loading

6a is split in two, as part 7 was:
- **6a-1** is the frame core as a program and the loading task. It covers items only, with nothing running.
- **6a-2** is running frames: the frame actor, upload, lifecycle, combat, dumb and smart frames, and decoy frames.
  It gets its own detailed section and review. The "Requirements carried" list below is mostly 6a-2's. 6a-1 answers
  the "loaded programs", "loading completion" and "core design" requirements.

The pages were rendered again for this section (2026-11-05): Frames, Frame Core, DINAB and Cores, Smart Frame
Initiative and Frame Loading (pp.105–106).

**User rulings (2026-11-05):**
- the Loading Rating (Σ ratings ÷ 2) rounds UP: 11 → 6;
- the loading test's TN (the average rating) rounds UP: 4.5 → 5.

### 1. A frame core is a program item
**Schema.** `ProgramData` gains
`frameCore: SchemaField { kind, bod, evasion, masking, sensor, initPoints }`:
- `kind` is a StringField from `"" | dumb | smart`, initial `""`, `blank: true` (the blank trap). `""` means not a
  core, which is every existing program, so there's no migration;
- the four attributes and `initPoints` are integers, min 0, initial 0.

The **Core Rating** is the program's `rating`.

**Derived data (`prepareDerivedData`, VR2.0 only; core-book Matrix: inert):**
- **The multiplier:** 2 (dumb) or 3 (smart), "the size multiplier for all dumb frame cores is 2; … 3 for smart cores".
  It overrides the authored multiplier exactly as an attack's Damage Level does today, and the authored multiplier is
  restored when `kind` is cleared.
- **The utility id** is `frameCore`. `UTILITY_OPTIONS.frameCore = ["dinab", "optimization", "squeeze"]`.
- `activeOptions` adds Sensitive to every utility today. It doesn't for `frameCore`: "Frame cores may be equipped with
  any of the following options: DINAB, optimization, and squeeze" is a closed list.
- **A core's DINAB isn't capped by the Core Rating (R1 #1).** Its cap is the programmer's Computer (§2), so
  `activeOptions` exempts `frameCore` DINAB from its "1 to the base rating" ceiling. Core-4 with DINAB-6 by
  Computer 6 is legal.
- **Core options are frame rules, not the optional Utility Options rule (R1 #2).**
  - DINAB is mandatory on smart cores, and its size counts.
  - `ProgramData` computes a core's active options under VR2.0 whether or not *VR2.0 utility options* is on.
  - With the setting off, ordinary programs still get none, as today.
- **Sizes** go through the existing `programSizes`. DINAB's "rating" modifier already raises both the design and the
  actual rating. Genie's smart core 12 + DINAB-8 → (12 + 8)² × 3 = 1,200 Mp, which becomes a Vitest case.
- `frameCheck`, a pure `coreProblems(core)` in a new `module/rules/vr2-frames.mjs`, lists what's wrong. A core with
  a problem can't be programmed, and later can't be loaded or uploaded:
  - Bod + Evasion + Masking + Sensor ≤ Core Rating (any may be 0);
  - `initPoints` ≤ Core Rating, and 0 on a dumb core (only smart frames have Initiative);
  - a smart core must carry an active DINAB.
- **`programCapacity`** = Core Rating − initPoints: what the loaded programs may total.
- **Frame Initiative** (for 6a-2, derived here): smart = (1 + initPoints)D6 and Reaction = Core Rating; dumb = none.

**Not a utility.** `usablePrograms`, the ONE rule every utility lookup goes through, excludes `frameCore.kind`. A core
in storage is never "loaded" onto the deck: the row shows no loaded toggle, and a stray `loaded: true` counts for
nothing. Cores take storage memory like any program, at their actual size.

**The design lock (R1 #6).**
- `designOf` (programming.mjs) adds `frameCore` (kind, the four attributes, initPoints).
- The `preUpdateItem` lock in sr2e.mjs adds `frameCore` to its key list.
- The lock refuses a design edit while EITHER task family is open: `programmingState(item).writing ||
  loadingState(item).writing`.
- Abandon takes the family's prefix, so "Abandon" on a loading task ends that task, not a programming one.

**Written means the current design, for cores only (R1 #7: a new rule, not 5b's).**
- 5b's fold keeps "written once" for ordinary programs, unchanged: they stay usable after a design edit, as today.
- For a frame core, "A core's attributes may not be rearranged … the programmer must write a new frame core" adds a
  core-only check: `coreWritten = the latest COMPLETED prog: task's captured design equals designOf(core) now`.
- Changing a written core's design leaves it unwritten until a new programming task completes.

### 2. Writing a core (the programming caps)
`programmingCap(utility, skills)` gains the core's rules (p.105–106):
- **Core Rating ≤ ⌊Computer × 1.5⌋.** The cap uses the highest Computer of a team, and a team's usual +1 doesn't lift
  it: the book ties the cap to "the programmer's Computer Skill × 1.5", as it ties black hammer's ⌈skill ÷ 2⌉.
- **DINAB rating ≤ Computer** (the same highest Computer), set when written ("cannot be altered later" is the design
  lock).
  - `activeOptions` caps a rated option at the base rating. A core's DINAB is checked against the programmer at
    `startDialog`.
  - The DINAB cap is part of the cap check: "DINAB-9 exceeds Computer 8 (p.106)".
- **Smart cores need DINAB:** `startDialog` refuses with `coreProblems`.

Everything else is 5b programming unchanged: the test against the Core Rating, base time from the design size, the
task period, tools, teams, freeze and Karma.

### 3. Loading: a programming-like task on the core (p.106)
**Its own record family on the core item**, folded like 5b's `prog:` records: `load:start:<n>`, `load:log:<n>:<id>`,
`load:frozen:<n>`, `load:end:<n>`. `foldProgramming` takes a prefix (`"prog:"` or `"load:"`). The append-only design,
server-arbitrated ids, the freeze-before-work rule and its recorded shortcut are all inherited, not re-invented.

**The start (`loadDialog`)** is a button on a written core's row: "Load programs…".
1. Pick programs from the decker's own program items: written, not frame cores. "Object-code copies of any programs
   he has available" means the decker's own copies; worn or loaded state is irrelevant.
2. **Checks (pure, in `module/rules/vr2-frames.mjs`):**
   - **The total:** Σ base ratings (options excluded: "not including Option Ratings") ≤ `programCapacity`.
   - **Whole programs only:** a program is copied at its own rating, and there is no partial-copy input.
   - At least one program.
3. **Loading Rating** = ⌈Σ ÷ 2⌉ (user ruling). Loading size = LR², and base time = size × 2 days. Genie: 6 + 4 = 10
   → 5 → 25 Mp → 50 days, the printed example with the ÷ misprint fixed.
4. **The test:** a Computer Test against ⌈the average base rating⌉ (user ruling). It uses `programmingSkillOf`, so the
   Software concentration or Matrix Programming specialization may stand in, as p.106 says. Teams and tools work as
   in programming ("Loading … is a task, similar to programming").
5. **The start record carries the WHOLE load (requirement: loaded programs as full immutable copies).**
   `load: [{ sourceId, name, source, system }]`:
   - `system` is the program's source data, the authored fields from `item.toObject().system`: rating, multiplier,
     category, offense, damageLevel, options, manufacturer;
   - `source` is its compendium identity (`_stats.compendiumSource` or the core's sourceId flag), for
     `programKey`-style identity checks;
   - `sourceId` is the item id it was copied from, for display only.

   Also `loadingRating`, `tn`, `baseTime`, and the core's design snapshot (`designOf(core)`).
6. **The design is captured before the dialog and re-checked before the record,** as `startDialog` does for programs.
   The core's design and every source program's design are both checked: a program edited during the roll means
   "start again".

**Work and completion** reuse 5b's `workDialog`, `freezePeriod` and `complete`, generalized by the prefix.
- `complete` refuses if the core's design changed since the start.
- Changes to the source programs after the start don't matter: the copies are already in the record.

**The winning terminal record is self-contained (R1 #4; the carried "loading completion" requirement).**
- `load:end:<n>` with outcome `complete` carries the whole load: the copies, `coreDesign` (the core's design at the
  start) and the `loadingRating`. They are copied from the start record in the same write.
- `foldProgramming` keeps an end record's `payload` (today it keeps only `outcome`). Ordinary programs never write
  one.

**The active load is derived, never written.** `activeLoad(core)` is the payload of the latest `load:` task with
outcome `complete`, plus its task number (the load generation).
- A newer completed load replaces it.
- An abandoned or failed load leaves the previous one in place.
- No separate "loaded" field exists that could be lost or overwrite a newer load.
- **It counts only if its `coreDesign` equals the core's design now (R1 #3), its total still fits the core's
  `programCapacity`, and the core is written (§1).**
- Rewriting a core to a different design never revives a load made for the old one: the load reads "made for
  another design of this core: load again".

**Copies are sized and read exactly like programs (R1 #5).**
- `ProgramData`'s derivation (the Damage-Level multiplier, the utility id, active options under the setting, sizes)
  moves into a pure `deriveProgram(name, system, { vr2, optionsOn })` in `module/rules/vr2-options.mjs`.
- `ProgramData.prepareDerivedData` calls it, unchanged in result: a pure refactor with Vitest pinning today's
  outputs.
- `copyStats(copy)` calls the same function on a snapshot. Inert or unknown options are dropped by `activeOptions`
  as they are for a live program, never thrown on.

**Frame actual size (p.106)** = the core's actual size + Σ each copy's actual size with its options. Each copy's size
comes from `programSizes` on its snapshot data. Genie: 1,200 + 144 + 48 = 1,392 Mp, a Vitest case. 6a-2 uses it for
upload.

### 4. UI (VR2.0)
- **The program sheet** gets a **Frame core** section:
  - kind (— / dumb / smart), Bod, Evasion, Masking, Sensor;
  - Initiative points (smart only);
  - the `coreProblems` list;
  - capacity, the size line, and the loaded snapshot (read-only).
- **The Matrix tab's program rows:** a core shows a **Core** badge with "dumb/smart, Core N", its loaded programs and
  the frame's actual size. It shows **Load programs…** instead of the loaded toggle. Loading progress uses the
  existing programming progress display with the `load:` fold.
- **Prices:** a core is priced by `programSizes` like any program (p.107: price from rating and design size).

### 5. Tests (6a-1)
**Vitest:**
- the Genie core size (1,200);
- the dumb/smart multipliers;
- `coreProblems` on each rule;
- `UTILITY_OPTIONS.frameCore` with Sensitive refused;
- `programmingCap` for cores: ⌊C × 1.5⌋, team, and the DINAB ≤ C check;
- the Loading Rating and TN roundings (11 → 6; 4.5 → 5);
- the Genie loading (10 → 25 Mp → 50 days; ÷ 5 successes → 10 days);
- the capacity with initPoints;
- `activeLoad`: latest complete wins, an abandon keeps the old one, a changed core design voids it, an over-capacity
  load voids it;
- `deriveProgram` gives the same results as today's `ProgramData`: attack multipliers, inert options, setting off;
- a core's DINAB above its rating but within Computer;
- smart-core DINAB counting with utility options off;
- the frame actual size, 1,392.

**Quench `sr2e.vr2-frames`:**
- write a smart core with DINAB;
- a smart core without DINAB refused;
- DINAB above Computer refused;
- load Attack + Cloak and complete, with the snapshot equal to the sources;
- edit the source Attack afterwards: the load unchanged;
- a second load replaces the first;
- an abandoned load keeps the first;
- design edits refused while loading, and Abandon ends the loading task;
- rewriting a core to another design voids its old load;
- changing the core's attributes makes it unwritten;
- a core never counts as a usable utility.

## 6a-2: running frames (outline; each sub-part gets its own detailed section and review)
6a-2 meets most of the "Requirements carried" list, and touches the IC/sequencer, combat and session code. One review
of all of it would be expensive (the part-6 R1 lesson), so it is split.

**Rule found for upload time (p.91, rendered 2026-11-05):** "A deck with an I/O bandwidth of 10 MePS can upload or
download 10 Mp of data per second". So uploading a frame takes ⌈frame actual size ÷ the deck's I/O bandwidth⌉
seconds: Genie's 1,392 Mp at 20 MePS is 70 seconds, about 24 Combat Turns. The deck's I/O speed field is the I/O
bandwidth. Multiplexing and Retrain stay out of scope, as part of the Bandwidth rule.

- **6a-2a: the frame actor, upload and lifecycle.**
  - The `frame` actor type: schema, sheet, a stable incarnation id equal to the upload id.
  - Upload as a sequencer-admitted, timed record, bound to the connection and the host session. Completion is the
    sequencer seeing world time pass the upload's seconds. Creating the actor, token and combatant is reconciled
    idempotently against a departure.
  - Decompress before upload.
  - Dumb frames end when the owner leaves that host; host shutdown and deletion end frames too; cleanup is
    replayable.
  - Frames as targets: attack and maneuver targeting, admission, resistance (Bod + the copies' Armor and Shield), the
    10-box monitor and crash, attribute effects, Limit `frame`, Scan Icon, Locate Frame.
- **6a-2b: commanding a dumb frame.**
  - The execution context: commander, acting icon, skill, utilities, host session, tally and trace owner.
  - Commands as the decker's Simple Action, one action each.
  - The copies as runtime programs for `activePrograms`, `spendUse` and wear.
  - Dumb-core DINAB, claimed against the owner's action.
  - Decoy frames: a separate mode from plain decoys.
  - Event triggers: Sensor and analyze/scanner ≥ half the Security Value, same-host delivery.
  - Cutting program ratings when the Core Rating drops.
- **6a-2c: smart frames.**
  - Their own Reaction and Initiative, and a combatant.
  - A basic order as a Free Action, then actions on their own turns with DINAB as the skill.
  - Existence independent of the owner ("whether their creator is logged on or not").

## 6a-2a in detail: the frame actor, upload, lifecycle, frames as targets

Builds on 6a-1 (0.135.0): a written core with an active load (`activeLoad`). The pages were rendered for this
section (2026-11-05): Running a Frame and Dumb Frames (p.106–107), Smart Frames (p.107), I/O bandwidth (p.91),
Locate Frame (p.114–115), Icon damage (p.124).

**Out of 6a-2a, on purpose (each stated so a reader doesn't assume it):**
- commanding a dumb frame, decoy frames, event triggers, dumb-core DINAB, and attribute, track, hog and slow effects
  on frames (6a-2b);
- smart frames acting, their combatant, and Initiative in combat (6a-2c).

In 6a-2a a frame exists, can be attacked, takes damage, crashes and is cleaned up. An attack whose effect isn't plain
damage is refused against a frame: "not yet (frames, part 6a-2b)".

### 1. The `frame` actor type
**Type.** `system.json` `documentTypes.Actor.frame` (a new type needs a server restart, so the release note says
so), with a `FrameData` model and a sheet (`SR2EFrameSheet`). After the schema add, check `invalidDocumentIds`.

**Schema.** Everything is written ONCE at creation from the upload's snapshot, except `condition`:
- `kind`: `dumb | smart` (6b adds `sk`);
- `coreRating`, plus `bod`, `evasion`, `masking`, `sensor` and `initPoints`;
- `dinab`: the core's DINAB rating, or 0;
- `ownerUuid`: the decker;
- `coreUuid`: the core item, for display only;
- `uploadId`: the incarnation id (§2);
- `hostUuid`, plus `conn` and `sessionId`: the owner's connection and host session at upload.

**The monitor is DERIVED, not stored (R1 #9).** A frame's damage is the sum of its `frameHit:<card>` facts on the
owner's log (§5): 10 boxes per p.124, and full means crashed (§4).

**Ownership.** The frame actor copies the owner actor's ownership levels, so the decker's player owns it. The GM
writes it (§3).

**The loaded copies become real program items on the frame actor** (the carried "loaded programs" requirement).
- At creation, each snapshot copy is created as an embedded `program` item: its `system` from the copy, `loaded:
  true`, and `flags.sr2e.frameCopy = { uploadId, source }`.
- `activePrograms`, `bestUtility`, `spendUse`, wear and crash all take an actor, so they work on the frame
  unchanged, with the frame's own wear and crash state.
- Their design is locked: a `preUpdateItem` / `preDeleteItem` guard on items of a `frame` actor refuses design edits
  and deletion, except by the GM's cleanup. "Programs are object-code copies" (p.106), so a running frame's programs
  never change.
- A frame core's own derivation doesn't apply to these items: they are ordinary programs.
- **Decompressed copies stay decompressed (R1 #1).** When the frame was decompressed (§2), each copy is created with
  `flags.sr2e.decompressed` = its own `loadGen` (0), so `isCompressed(copy)` is false. Otherwise a squeezed Armor
  copy would be unusable.
- **The frame's host is its context (R1 #2).** `activePrograms(actor, host)` (and so `bestUtility`) resolves the
  host of a `frame` actor from `system.hostUuid`, not from a live session (frames have none), so Sensitive
  copies are judged on the frame's own host.

**The frame's derived data:**
- `matrixPersona`-shaped attributes (`bod`, `evasion`, `masking`, `sensor`) and `mpcp` = `coreRating` ("the Core
  Rating is used in place of an MPCP Rating", p.105), so persona readers can use one accessor;
- `ended`, derived from the owner's records (§4).

### 2. Upload (p.106; p.91)
**Starting it.** **Upload frame** on a written core's row (VR2.0, connected) asks for the decker's current place, and
refuses unless:
- the decker is ON a host. Under topology that's `currentPlace(actor)` with a host kind; otherwise the live
  session's host;
- the core is written, `coreProblems` is empty, and `activeLoad` has no `void`. An empty load is allowed: a bare core
  can still serve as a decoy body in 6a-2b;
- **decompressed (requirement):** "Compressed or squeezed frames must be decompressed before they can run". If the
  core or any copy carries an active squeeze, the decker first uses **Decompress frame** on the row (a Complex
  Action, as `vr2Decompress`). It writes `flags.sr2e.frameDecompressed = <load gen>` on the core, and a newer load
  needs it again.

**The request.** The decker's client sends `upload` with `{ id, conn, core, gen, host, sessionId }` (R1 #3: `conn`
is captured explicitly; `request()` doesn't add it). `id` is a fresh `randomID(16)`. No snapshot and no duration:
the client's word on either isn't trusted.

**Admission (sequencer; R1 #3).** `HANDLERS.upload` **derives** everything on its own client:
- it validates that the decker's live connection is `conn`; the live session is `sessionId`, on `host`; the host is
  online; under topology the decker is ON that host;
- the core item (read from the owner actor) must be written, with no `coreProblems`, and an `activeLoad` of
  generation `gen` with no `void`; if squeezed, `frameDecompressed === gen`;
- it builds the snapshot itself from that core and load: `{ kind, coreRating, attrs, initPoints, dinab, copies,
  coreName, frameSize }`;
- `seconds = ⌈frameSize ÷ the owner's deck I/O speed⌉`, refused at 0;
- it **writes `upload-open:<id>`** `{ type: "upload", conn, sessionId, host, seconds, snapshot, clock }`. The clock is
  the decker's started combat if he is in one (`{ combatId, startRound }`, as traces do); otherwise
  `{ manual: true }`.

The card says the upload takes N seconds, which is ⌈N ÷ 3⌉ Combat Turns.

**Completion (sequencer; requirement: "completion admitted by the sequencer").**
- **In combat:** each round boundary of that combat adds 3 seconds (a Combat Turn). It is ticked from the existing
  `updateCombat` hook beside the trace ticks.
- **No combat:** the upload card has **Upload finished (GM)**, an `uploadDone` request. The GM is the clock, as for
  manual traces.
- When elapsed ≥ `seconds` and the decker is STILL on that connection, session and host, the sequencer writes
  `upload-done:<id>`.
- If at any check he is not, it writes `upload-end:<id>` `{ why: "left the host" }`, and the upload is lost: "As
  soon as the upload completes, the frame starts running", and an interrupted upload never completes.
- **Departure is a durable transition, not a current-location check (R1 #4)**, so a quick trip away and back still
  counts. The same rule decides uploads and dumb frames (§4), `departedSince(owner, { conn, sessionId, host, since })`:
  - **the connection** ended or changed;
  - **under topology:** any 7b `move` fact on that connection after `since` (the upload's or the frame's start seq).
    Moves are written only for real place changes, so a failed logon elsewhere isn't a departure;
  - **topology off:** the live session's id isn't `sessionId`. Session ids are never reused, so leaving and coming
    back still differs.

  `passFor` runs `reconcileUploads(actor)`. A new `updateActor` hook also schedules the decker on any
  `flags.sr2e.vr2Session` change, because session switches are flag writes, not records (the 7b lesson).

### 3. Creation, idempotent (requirement: "actor/token creation reconciled idempotently against a departure")
**The writer.** The active GM's client runs `reconcileFrames()` from `passFor` and on `ready` and `userConnected`, as
the persona-token writer does. It creates the frame for every `upload-done` that has no `frame-end`, unless the frame
actor already exists.

**Deterministic identity.**
- The frame actor is created with `_id = uploadId` and `keepId: true`, so two passes or two GM clients can never
  create two. The server refuses the duplicate id.
- Its copies are created in the same `Actor.create` call (embedded `items`), so the actor and its programs appear
  in one write.

**The token.**
- If the owner has a persona token on a Matrix scene (`personaOn`), the GM creates the frame's token beside it, on
  a free square (`placePersona` with the persona's square as the area), linked, with the core's name.
- Otherwise there's no token: the frame lives on its sheet, and the GM may drag it out.
- The token is reconciled the same way: one per frame, created only while the frame isn't ended.

**Re-checks and late arrivals (R1 #5).**
- Before creating, the writer checks again, after each await, that the upload is done and not ended, that no actor
  with that id exists, and that it is still the writer (the persona-token pattern).
- A departure can still land while `Actor.create` is in flight. So, as in persona-tokens, `createActor`,
  `deleteActor`, `createToken` and `deleteToken` hooks on frames reschedule the owner's reconcile, and every pass
  re-derives:
  - an ended frame's late-created actor or token is deleted;
  - surplus tokens (more than one for a frame) are deleted, keeping the oldest.

### 4. Lifecycle (requirement: "stable incarnation id, host shutdown/deletion, replayable cleanup")
**`ended` is DERIVED, by a pure `frameEnds(...)`, from durable state (R1 #6–#8).** The sequencer records a
`frame-end:<uploadId>` `{ why }` fact on the owner's log when it notices, for the card and history. But nothing
depends on that write having happened: an interrupted pass is simply redone.

**What ends a frame:**
- **dumb, the owner leaves** ("If a decker logs off a host, any dumb frames he is running on that host crash …
  don't follow the decker to other systems", p.106): `departedSince(owner, …)` since the frame's `upload-done` seq
  (§2).
- **its monitor is full (R1 #8):** derived from its `frameHit` facts, so a crash can't be missed between two writes;
- **its host has shut down since it started** (R1 #7, R2 #1): derived from the host's own shutdown records: any shutdown
  run that went offline after the frame's (or the upload's) start seq, even if it was since reset. It's not just
  "offline now", so a reset can't revive a frame the shutdown wiped. It replays even if `tickShutdown` was
  interrupted, and it applies to uploads too. p.53: "a shutdown wipes out all frames";
- **its host or its owner is deleted (R1 #6):** derived from the missing document. The owner's log is gone then,
  so no fact is needed or written;
- **the GM deletes it:** a `deleteActor` hook on a frame writes `frame-end … why: "deleted"` if none exists.
- **Smart frames don't end with the owner's departure** ("independent existence … whether their creator is logged
  on or not", p.105). Their acting is 6a-2c, so in 6a-2a a smart frame simply persists until one of the other
  causes ends it.

**Cleanup, replayable.** For every ended frame, `reconcileFrames` deletes its tokens (every scene), its combatants
(every combat), any pending upload card buttons' targets, and finally the actor. Each step is checked against the
fact and is safe to repeat. A GM client that crashed halfway finishes on its next pass.

### 5. Frames as targets (the hook points 6a-2a covers; requirement: "every hook point")
Every `["ic", "character"]` check in vr2.mjs and vr2ic.mjs was grepped (about 40). 6a-2a changes these, through two
helpers:
- `iconKind(a)` is `ic | decker | frame` (6b adds `sk`);
- `limitClass(a)` gives the Limit option's target type: `ic | decker | frame` (p.104 lists frame and SK).

| Hook | Today | 6a-2a |
|---|---|---|
| attack target types (`attackOnce` ~1057, area extras ~980/~1167) | ic, character | + frame (not ended) |
| Limit classification (~967, ~1172) | `ic` else `decker` | `limitClass` |
| maneuver targets (~1682) | ic, character | unchanged in 6a-2a (frames maneuver in 6a-2b) |
| `sessionKey` (~840) | IC generation, else session | frame: `<uuid>:<uploadId>` |
| IC → frame: request/admission | a character on the log is admitted by the sequencer | frames have no connection log: no admission, resolved like IC targets (the resist button) |
| black IC hitting a frame | biofeedback on a decker | plain Matrix damage at the IC's level/Power: "as an icon, no biofeedback" (a Risks decision in this plan) |
| attribute / track / hog / slow effects | personas or IC | refused vs a frame until 6a-2b |
| resistance (`vr2MatrixResist` ~1373) | ic / character | frame: Bod (+ its Armor copy) vs Power, Shield copy via `askShield`; resisted by the frame's owner or the GM |
| damage write (`matrixDamage` ~1307) | ic / persona path | frame (R1 #9): the resolver sends `frameHit { uploadId, card, boxes, armorRef, shieldRef }`; the sequencer writes `frameHit:<card>` ONCE (keyed by the card, server-arbitrated), and the wear of the Armor/Shield copy with it. A second resolution of the same card (player and GM at once, or a retry) writes nothing. The copy's wear goes to
another document, so the sequencer replays it from the winning receipt (R2 #2): `addWear` is card-keyed and
idempotent, and `reconcileFrames` re-applies the wear named in every `frameHit` whose card isn't in the copy's
wear yet |
| crash at 10 boxes | IC crash / persona dump | derived: the monitor is full (§4) |
| Scan Icon (6a-0) | deckers | + frames: MPCP = Core Rating, persona ratings, Response Increase 0 |
| Locate Frame (system op) | no frames existed | on success, a GM whisper listing the SMART frames on that host ("locates any smart frames or SKs running on the host", p.115) |
| host shutdown (~1368) | deckers | + frames (§4) |

**Ended frames are guarded.** The attack, resist and Scan Icon paths refuse a frame whose `ended` is set: "<frame>
has crashed".

### 6. Tests (6a-2a)
**Vitest** (pure, in `module/rules/vr2-frames.mjs`):
- upload seconds (Genie's 1,392 Mp at 20 MePS → 70 s → 24 turns), and an I/O speed of 0 refused;
- `frameEnds(...)` for every dumb and smart cause, and `departedSince` (a move after the start, a move before
  it, topology off with a new session, a failed logon's session switch not counted under topology);
- the derived monitor from `frameHit` facts, with a duplicate card counted once;
- `limitClass` and `iconKind`.

**Quench `sr2e.vr2-frames` additions:**
- the upload is refused off-host, compressed, unwritten, or with a void load;
- a combat upload completes after ⌈s ÷ 3⌉ round boundaries and creates exactly one frame actor (two
  `reconcileFrames` passes at once → one), with copies as locked items and the right attributes;
- a manual upload completes on the GM's button;
- leaving the host mid-upload ends it with no frame;
- a dumb frame crashes when the owner logs onto another host; a smart one persists;
- IC attacks a frame: Bod + Armor resist, 10 boxes crash it, and cleanup removes the actor and its token;
- the same attack resolved twice (owner and GM): damage lands once;
- a squeezed Armor copy is usable after the frame's decompression, and a Sensitive copy is judged on the frame's
  host;
- the owner out to another host and straight back (topology on and off): the dumb frame is ended;
- a Limit:frame attack works on a frame and is refused on a decker;
- host shutdown ends the frames on it;
- deleting the frame by hand writes its end.

## 6a-2b in detail: commanding dumb frames, DINAB cores, decoy frames, event triggers

**Status: plan Codex-APPROVED round 3 (2026-11-05); BUILT for 0.137.0.**

Builds on 6a-2a (0.136.0): a running `frame` actor whose loaded copies are locked embedded program items, with every
lifecycle fact on the OWNER's log. The pages were rendered again for this section (2026-11-05): Dumb Frames, Decoy
Frames, Event Triggers, Weapon Carriers and Smart Frames (pp.106–107).

**Out of 6a-2b, on purpose:** smart frames acting on their own, their combatant, Initiative and basic orders (6a-2c).
Every command below is refused on a smart frame with "smart frames act on their own (part 6a-2c)". The one exception
is Decoy: decoy frames are dumb frames ("Any dumb frame can act as … decoy", p.107), so 6a-2b doesn't need it for
smart frames either.

**"Cutting program ratings when the Core Rating drops" needs no runtime work, and here's why.** p.106 ties it to
Initiative allocation: "whenever a frame's Core Rating is reduced, the ratings of the frame's programs must be
reduced". Nothing in VR2.0 lowers a running frame's Core Rating:
- hog's target is "Decker" (p.98);
- cripplers and the attribute utilities hit Bod, Evasion, Masking or Sensor (§6);
- the Core Rating is fixed when written.

So the cut happens at load time. 6a-1 already does it: `loadProblems` refuses a load over `programCapacity`, and
`activeLoad` voids a load that no longer fits ("the core now holds N"). The plan says this so the requirement is
visibly closed rather than silently dropped.

### 1. The execution context (requirement: "commander, acting icon, skill, utilities, host session, tally/trace owner")
Today `systemTestNow`, `attackOnce`, `vr2Maneuver` and `vr2ScanIcon` read everything from ONE actor. 6a-2b gives each
of them an optional context, built by one function in `module/frames.mjs`:

`commandContext(frame)` → `{ commander, icon, host, frame }`:
- **commander** = the owner (a character). He rolls the test. It uses his Computer skill, his Hacking Pool, his Karma
  and his own TN modifiers (wounds, sustaining). "The decker uses his own Computer Skill to make tests for the frame"
  (p.107). His deck's deathworms don't apply: they're in his deck, not the frame.
- **icon** = the frame. Everything "attribute-related" comes from it (p.107):
  - the utility (`bestUtility(icon, …)`, `activePrograms(icon)`), its `spendUse`, wear and crash, all on the frame's
    own items;
  - Sensor (Analyze Icon, p.111) and Masking + Sleaze (the Detection Factor) from the frame's `matrixPersona` and
    copies;
  - the maneuver state (`maneuverState(icon, target)`): maneuvers are between icons.
- **host** = the frame's host (`frame.system.hostUuid`), fixed. A frame never picks a host and never logs on.
- **session, tally, trace owner** = the commander's live session on that host. "The frame has the same datatrail as
  the decker" (p.107), so its tests raise HIS tally, trigger IC against HIS session, and are opposed by HIS
  datatrail's suppressions. `sessionFor` is NOT called with the frame. The command is refused unless the commander's
  live session is on the frame's host and its connection is the frame's `conn` ("You must be on <host> to command
  <frame>"). A dumb frame that's alive always meets this; it's checked anyway, because the command reads it.

**Default context.** With no context, `ctx = { commander: actor, icon: actor, host: null }`, which is today's
behaviour unchanged. Each of the four functions is changed to read `ctx.commander` where it reads the decker as
roller, session owner or action-taker, and `ctx.icon` where it reads utilities, persona attributes or maneuver state.
The plan names each read, so none is missed:

| Function | Reads that become `icon` | Reads that stay `commander` |
|---|---|---|
| `systemTestNow` (vr2.mjs ~696) | `bestUtility` (REQUIRED for a frame: §2), `dinabLeft`, `spendUse`, `useRef`, `dinabFail`/`dinabCrashCheck` recipient, Analyze Icon's Sensor, `vr2DetectionFactor`'s Masking and Sleaze | `vr2ActionGuard`, `computer`, the roll, pools, Karma, `sessionFor` (never called with a context: the session must already be on the frame's host, §1), `commitAction`, the tally event, the card's `actorUuid`, the Decoy record (§4) |
| `attackOnce` (vr2.mjs ~1055) | the program list and pick, `activePrograms`, `spendUse`, `dinabRef`, `maneuverState`, `spendAttackState`, the card's `attackerUuid` and `attackerSession` | the roll, pools, Karma, `attackerComputer` (Shield TN, p.100), `commitAction`, and the card's COMMANDER fields (§3) |
| `vr2Maneuver` (vr2.mjs ~1709) | the maneuvering icon: its **Evasion** (the dice: the existing test is Evasion against the opponent's Sensor, p.122), its Cloak copy, the record and `mSession` | `commitAction` and the roller (the commander's client rolls the frame's Evasion; the decker's Computer plays no part) |
| `opposeManeuver` / `maneuverState`'s evade expiry (vr2.mjs ~939, ~1765) | a frame OPPONENT's Sensor and Lock-On copy | the tally that shortens an evasion: an icon's tally is its commander's session tally (`tallyOf(icon)` = the owner's `liveSession` tally for a frame) |
| `vr2ScanIcon` (vr2.mjs ~2013) | Scanner, `spendUse`, the located check | the roll |

`vr2Maneuver` today accepts only IC and character opponents and restricts Cloak and Lock-On to characters: both
checks gain `frame`.

**Checked at execution, not just in the dialog (R1 #5).** `ctx.check()` re-derives everything a command needs:
- the frame not ended, the same upload id;
- the commander's connection is the frame's `conn` and his live session is on the frame's host;
- the operation is allowed through a frame (§2), and the copy it runs is still in `activePrograms(frame)`.

Each path calls it right before `spendUse`: nothing is spent for a refused command. After the roll, a lighter
`ctx.check({ after: true })` re-checks only the incarnation: the frame not ended, the same upload, and the commander
still on the frame's host and connection. It does NOT ask the copy to still be active. A one-shot copy is consumed by
this very command's `spendUse`, and a DINAB crash from this roll is this command's own outcome (R2 #1). The card
binds the copy as it was used (`utilityRef` with its `loadGen`). A frame that crashed while the dice rolled posts "the frame crashed: the command is lost", as a crashed IC's
attack is lost today.

**`vr2DetectionFactor(commander, icon)`.** The Masking and Sleaze come from `icon`. The suppressions (frozen traces,
slowed IC, place suppressions) come from `commander`, because they belong to his datatrail. With one argument,
`icon` = `commander`, as today.

**Every card carries `icon: { uuid, upload }`** when the icon isn't the commander. `utilityRef` gains the same
`icon`, so the copy's recipient travels with the reference.

**Tar (R1 #6) gets an explicit context, not just a redirected item lookup.** `offerTar`, `tarStrike` and
`reconcileTarFact` (vr2ic.mjs ~577–605, ~732–789) read their actor for several things. With a frame copy:
- **the fact stays on the OWNER's log**, so the owner's reconciliation replays it. The receipt records the recipient
  `icon: { uuid, upload, copyId, loadGen }`, and a replay uses that recipient, never a re-derived one;
- **the crash** is a complete crash record on the FRAME:
  `recordEvent(frame, "vr2:crash:<copyId>:<loadGen>:tar-<card>", { type: "crash", programId, loadGen })`, which
  `programUnusable(frame, …)` reads;
- **the frame's numbers** stand in for the decker's: Core Rating as MPCP, no Hardening (a frame has no deck), and
  its Sensor where tar reads one;
- **tar pit's corruption** (p.42: the program's copies in the deck's storage) has no destination: a frame has no
  storage, and the decker's deck isn't the frame. The copy crashes; nothing is corrupted. The card says so;
- **a one-shot victim** is picked from the frame's copies.

If the frame has ended when the fact replays, the receipt still completes with no crash, and the card says "<frame>
had already crashed".

### 2. Commands (p.106–107)
**The button.** On the decker's Matrix tab, each running DUMB frame row (6a-2a's `vr2Frames` list) gets **Command…**.
The dialog offers:
- a **System Operation**, from the operations whose utility the frame carries as an active copy. "Dumb frames only
  execute programs" (p.106): a command runs a program, so an operation needs its utility. A decker can attempt an
  operation without its utility, but a frame can't;
- **Attack** (the targeted icon) with one of the frame's attack or attribute copies: the weapon carrier (p.107);
- **Scan Icon** (the targeted icon), with a Scanner copy;
- a **maneuver** (evade, parry, position) against the targeted icon. Maneuvers are actions, and the test is the
  icon's Evasion against the opponent's Sensor (p.121–122), so they're "attribute-related": the frame's Evasion and
  Cloak copy, rolled by the commander's client (§1's table);
- **Decoy** (§4) when the frame carries Mirrors.

**Never through a frame:**
- Logon to Host / LTG / RTG, Graceful Logoff and Disconnect to grid: a frame doesn't move, and "they do not follow
  the decker" (p.106);
- Null Operation: it is the decker's own waiting (§4).

**A command is the commander's Simple Action** "even if the frame program is used to perform a Complex Action"
(p.106):
- it calls `commitAction(commander, …)`, as any action does;
- the card says "Simple Action (command to <frame>)".

**"A dumb frame cannot repeat an action"** (p.106): one command, one test. There's no automatic repeat, so this holds
by construction; the card says so on an attack ("a second attack needs a second command").

**Refusals** (checked before anything is spent):
- the frame has ended (`frameState`);
- the frame is smart (6a-2c);
- the commander isn't on the frame's host with the frame's connection (§1);
- `vr2ActionGuard(commander)` (jacking out, icon down).

### 3. Attacks by a frame (weapon carriers, p.107)
- **Dice and Power** are the copy's rating, as for a decker's attack utility (p.123). The decker's Computer is the
  roller's skill only for System Tests.
- **Pools:** the commander's Hacking Pool and Karma, as for his own attacks.
- **Two identities on the card (R1 #1–#3).**
  - **The icon:** `attackerUuid` = the frame, `attackerType: "frame"`, `attackerSession` = the frame's `sessionKey`.
    Maneuvers, parry and position are kept per icon, and they read these.
  - **The commander:** `commanderUuid`, `commanderSession` (his live session id), the key `icKey` = his
    `attackerKeyOf` (`deck:<uuid>@<conn>`), and `attackerInc` = HIS `crashInc`. The frame shares his datatrail, so
    everything that locates, locks, admits or suppresses "the attacker" uses these.
- **Every reader that today branches on `attackerType === "character"` treats `"frame"` the same way and reads the
  commander fields.** Grepped:
  - `admitDeckerCards` (vr2ic.mjs ~1616);
  - the `createChatMessage` admission hook (vr2ic.mjs ~1996);
  - Slow's suppression (`slowResult` ~1003: `deckerUuid` and `session` come from `commanderUuid` and
    `commanderSession`, so the suppression lowers HIS Detection Factor);
  - the black-utility and lock bookkeeping that parses the key (vr2.mjs ~2137, vr2ic.mjs ~1532, ~1668, ~1792).

  The build greps `attackerType` and `attackerUuid` again and lists every reader in the code-review brief.
- **Track through a frame (R1 #3).** p.97: the Relocate TN uses the tracking icon's Sensor (vr2ic.mjs ~1304), and
  that reads a folded trace, not the card. So the trace receipt written at admission carries
  `via: { uuid, upload }`, and Relocate reads that frame's Sensor. "If the frame crashes, the decker loses the
  programs" (p.107): a Track whose `via` frame has ended ends with it, by the same fold rule that ends a trace whose
  IC crashed.
- **Targets:** IC, frames, and deckers. Cybercombat is with any icon (p.124), and the special utilities keep
  `utilityTargetProblem` unchanged: track, hog and black utilities hit a connected decker; slow and steamroller hit
  IC.
- **When the frame crashes** "the decker loses the programs" (p.107). The copies live and die with the frame actor,
  so this is 6a-2a's cleanup; nothing new is needed.
- **Area** works as today. Other targets are the commander's user targets, and the TN rises per target (p.103).

### 4. Decoy frames (p.107): a mode separate from 6a-0's plain decoy
**What the book says.**
- "If a decker performs a Decoy operation on a host or grid system, the system directs all security measures
  against the decoy frame as long as the decker himself remains inactive."
- "The decker uses his own Computer Skill to make tests for the frame, but all attribute-related scores depend on the
  decoy frame's ratings … Only the utilities loaded into the frame can be employed."
- "If the frame's actions create a security tally that triggers IC programs, the IC programs go after the decoy
  frame, not the decker's persona. Because the frame has the same datatrail as the decker, this doesn't help the
  decker's situation when facing trace IC."
- "Once a decoy frame crashes, the host system and any active IC programs react to subsequent actions by the decker
  per standard rules."

**Starting it.** **Decoy** commanded through a dumb frame is a System Test in the frame's context (§1):
- the commander's Computer against Control, with the frame's Mirrors copy;
- the card carries `iconUuid` = the frame;
- like 6a-0, the commander's client always writes one durable record, success or not:
  `vr2:decoyframe:<conn>:<card>` `{ type: "decoyFrame", conn, card, frame: uploadId, host, sessionId }`;
- whether it IS a decoy frame is read live from the card's verdict (Karma included), as 6a-0 does.

**The live decoy frame** is folded, never stored, in a pure `liveDecoyFrame({ records, conn, sessionId, cardOf,
frameEnded })` in `module/rules/vr2-frames.mjs`. It works in two steps, so an older decoy is never resurrected
(R1 #10):
1. **Select:** the newest `decoyFrame` record of the live connection whose card shows a success or no longer exists
   (6a-0's barrier: a deleted card still blocks older records).
2. **Test that record alone:**
   - a missing card means no decoy;
   - it must be on the commander's current session;
   - its frame must not have ended (`stateFor`): "once a decoy frame crashes";
   - it must have no `decoyFrameOff` fact (next point).

   If it fails, there is NO decoy frame: the fold never falls back to an older record.

**"As long as the decker himself remains inactive."** The decker's own action ends the mode for good, as a sequencer
fact, so it has a place in the one order the IC attack is also decided in (R1 #8):
- **The helper `ownAction(actor, why)`** runs where an action of the decker's OWN icon is committed:
  - every caller of `commitAction`;
  - every DINAB branch, which skips `commitAction`: his deck's program acts as his icon;
  - `relocate` (vr2ic.mjs ~1290) and `vr2Decompress` (vr2.mjs ~1986) (R1 #9);
  - Upload frame.

  The build greps `commitAction(` and `dinab` and lists every site in the code-review brief.
- **When it acts:** if the live connection has ANY `decoyFrame` record with no `decoyFrameOff` fact, it sends
  `request(actor, "decoyFrameOff", { conn, decoy: <that record's key>, why })`. "Any record", not "a live one" (R1
  #9): a failed Decoy that Karma later turns into a success is already off, because the decker acted after it.
- **The handler** writes `decoyframe-off:<conn>:<key>` `{ type: "decoyFrameOff", conn, decoy, why }` once.
- **The decker doesn't wait for the fact:** his action goes on, and the GM is always present. The order between his
  action and an IC attack is the sequencer's order (next point).

What doesn't end it:
- **a command to the frame** (§2): the frame acts, not the decker;
- **a Null Operation:** it's how the book has a decker wait (p.117: "whenever a decker waits for something"). It is
  the decker staying inactive, not acting. *This is Claude's reading; the book doesn't list it. Flagged in Risks.*
- Graceful Logoff and jacking out end the dumb frame anyway (6a-2a).

**"All security measures against the decoy frame."** In `attackOnce`, an IC attack whose target is a decker with a
live decoy frame goes to the frame, BEFORE any target term is computed:
- **proactive non-trace IC:** the target becomes the frame actor (`target = frame`). There's no 1D6 roll: the book's
  decoy frame isn't the 6a-0 die, it is "all security measures". The attack then runs exactly as a 6a-2a attack on a
  frame:
  - the frame's terms;
  - no admission on the decker's log;
  - the resistance button resolved by the frame's owner or the GM;
  - `hitFrame` facts.

  The card says "<IC> goes after <frame> (decoy frame, VR2.0 p.107)".
- **Who decides, and in what order (R1 #8).** An IC attack on a decker whose live connection has an un-off
  `decoyFrame` record must be rolled by the active GM, the sequencer, as 6a-0's decoyed and cascading attacks are.
  Before folding, the GM awaits `Y.flush()`, so every `decoyFrameOff` request already sent is processed first. Then
  it folds and binds the decision onto the card (`decoyFrame: key`) BEFORE any target term. An own action whose
  request arrives after the flush comes later in the sequencer's order, so that attack correctly goes to the frame.
- **Reactive security too (R1 #7).** Tar, data bombs and exploding scramble create their attack cards directly
  (`offerTar`, `bombEnd`, the reactive dispatch, vr2ic.mjs ~577–668, ~1912–1935). One helper,
  `securityTarget(decker, st)`, decides their target:
  - a test made BY a frame (`st.icon`) is answered on that frame: the frame did it;
  - a test made by the decker's own icon while a decoy frame is live goes to the frame, by the same flush-and-fold
    on the sequencer. Such a test is only a Null Operation, because any other action has ended the mode.

  The tally stays on the decker's session either way.
- **trace IC is never redirected** (6a-0's rule 4 and p.107: the frame "doesn't help … when facing trace IC"). It
  hunts the decker as today. A trace IC that targets a frame directly (6a-2a refused it) is still refused: "trace IC
  hunts a datatrail: target the frame's owner".
- **Both kinds live:** a decoy frame and a 6a-0 decoy can't both apply. The decoy frame wins: "all security
  measures" leaves nothing for the die. The 6a-0 decoy stays recorded and applies again once the decoy frame ends,
  if the decoy is still live. They are separate folds, so neither replaces the other.
- **The tally rule is the same redirect.** "IC triggered by the frame's tally go after the frame": the triggers fire
  on the decker's session as always (§1), and when that IC attacks, the redirect sends it to the frame.

### 5. Dumb-core DINAB (p.106): "may trigger one of the frame's programs on a given action"
**What it is.** A frame whose core carries DINAB (`frame.system.dinab` > 0) can run one of its copies by itself:
- **Run by DINAB** is a checkbox in the Command dialog when the frame has DINAB left;
- the run is a **Free Action** of the commander: no `commitAction`, no pools, no Karma (p.103's DINAB rules);
- its dice are the DINAB rating left (System Tests) or the copy's rating (attacks), as 5b's `spendUse` path does for
  a program's own DINAB.

**"On a given action": one run per the OWNER's phase** (requirement: "claimed against the owner's action and the
core, not the frame's empty combat phase"). The claim is `once(frame, "coredinab:<uploadId>:<phase>")`, where
`phase` = `phaseKey(commander)`. Outside combat there's no phase, and a run is always allowed, as 5b's DINAB is.

**Wear and crash, with an explicit recipient: the FRAME actor (R1 #11).** The run's reference is
`dinabRef = { core: true, frame: uuid, upload, copyId, loadGen, useId }`. It is carried on the card exactly where 5b
carries a program's `dinab` ref, so every existing DINAB outcome reaches it:
- **a miss, or a System Test the host defeats** (the roll-time paths, `dinabFail`);
- **an attack that hits but is fully resisted** (`dinabZeroed`, vr2.mjs ~1338, including 6a-2a's frame-resolution
  replay), and its request form `dinabWear` (vr2ic.mjs ~1098).

`dinabFail`, `dinabZeroed` and `dinabWear` gain one branch: a `core` ref writes core-DINAB wear on the frame,
`flags.sr2e.coreDinabWear.<upload>_<useId>`. It is keyed by the use, so a replay writes nothing new. DINAB left =
`frame.system.dinab` − those points.

**All 1s** crashes the COPY it ran, with a complete crash record on the frame:
`recordEvent(frame, "vr2:crash:<copyId>:<loadGen>:coredinab-<useId>", { type: "crash", programId: copyId, loadGen })`.
That is the shape `programUnusable` matches. There's no Swap Memory on a frame (programs are fixed), so the copy
stays crashed for the frame's life.

**A copy's OWN DINAB option** (a copy loaded with DINAB) works through 5b's `spendUse(frame, item, { dinab: true })`.
`phaseKey` gets one change: for a frame actor it returns the OWNER's phase. Without it, the frame is in no combat,
the key is "", and the per-phase limit is silently skipped.

### 6. Attribute effects on frames (the 6a-2a deferral)
**Cripplers and attribute utilities** (poison, restrict, reveal, and the IC cripplers) attack a persona attribute.
A frame has those four attributes (p.105), so they work on frames:
- **Resisting:** `resistAttribute` gets a frame branch, as `vr2MatrixResist` got one in 6a-2a. It rolls the frame's
  attribute plus the Shield copy against the rating. The frame's owner or the GM rolls it.
- **The loss is computed by the sequencer, in its order (R1 #12).** The resolver sends a new request `frameAttr`
  `{ card, upload, attr, defense: <its successes + Shield's> }`. The handler:
  1. freezes the attack successes (`freezeSuccesses`);
  2. computes `points = ⌊(attack − defense) ÷ 2⌋`;
  3. computes the loss with `attributeLoss` against the frame's CURRENT folded attribute and the card's `floor`;
  4. writes `frame-attr:<card>` `{ type: "frameAttr", upload, card, attr, lost }`, once per card.

  Two cripplers resolved at once are applied one after the other, so the second sees the first's loss and the floor
  holds.
- **The frame's attributes are derived:** the snapshot less the sum of its `frameAttr` losses.
- **Re-preparing the frame (R1 #13).** A fact lands on the OWNER, which re-prepares the owner, not the frame actor.
  6a-2a's `reconcileOwner` re-renders the owner's sheet; it also gets `frame.reset()` (prepare again) plus a
  re-render of the frame's open sheet, for every frame of that owner. The same happens on the owner's `createActiveEffect`
  hook for record effects, so every client, not only the sequencer's, sees the new numbers. The frame's
  `prepareDerivedData` folds `frameAttr` facts from the owner's records, which are prepared first. World actors
  prepare in order, so a frame prepared before its owner has its owner's records already, because records are the
  owner's embedded effects and need no derivation.
- **The resolution** is posted by the sequencer from the fact's receipt, as 6a-2a does for hits
  (`replayResolutions`).

**Never on a frame:**
- track, hog and the black utilities: their target is a connected decker (p.97–98, `utilityTargetProblem`);
- slow: its target is IC.

The refusal text names the rule.

### 7. Event triggers (p.107)
**Requirements (p.107):**
- **Sensor ≥ half the host's Security Value**, and so is each utility it relies on;
- **analyze** is needed for events caused by the host or its programs;
- **scanner** is needed for events caused by other deckers or legitimate users.

The check is the pure `triggerProblems({ sensor, analyze, scanner, securityValue, watch })`. "Equal to or exceeding
half" compares `2 × rating ≥ Security Value`, so no rounding is needed. The Security Value is the host's base value,
the number the book's tables give a host.

**Setting it.** **Set event trigger…** is a command (a Simple Action, §2): "watch for: host events / user events /
both", plus a free-text description. It writes `vr2:trigger:<uploadId>:<n>` `{ type: "trigger", upload, watch, note }`
on the owner's log (commander's client, `recordEvent`), after `triggerProblems` passes. The frame's sheet and the
decker's frame row list its triggers.

**Firing it (the GM).** Only the GM knows what happens on the host, so the GM fires a trigger:
- the frame sheet's trigger list has a **Fire** button (GM only);
- it goes through the sequencer as a new request `triggerFire { key, n }`.

**The handler refuses unless the requester is a GM** (`game.users.get(r.user)?.isGM`, R1 #14), as `uploadDone`
does. It reads the trigger's frame, watch and note from the durable setting record named by `key`, never from the
request. It writes `trigger-fire:<key>:<n>` `{ type: "triggerFire", key, n, delivered, why }`: the outcome is in the
fact.

**The report is replayed from the fact (R1 #15, R2 #2).** The sequencer posts it with `flags.sr2e.triggerFire =
<fact key>`, and no `once` claim. On every owner pass the sequencer posts any `triggerFire` fact that no message
carries yet. This is 6a-2a's `replayResolutions` pattern (an existence check on the message, on the sequencer's
client only), so an interrupted post is finished on the next pass and a finished one is never posted again.

The outcome is decided at the moment of firing, from live state:
- the frame isn't ended;
- `triggerProblems` still passes (its copies may have crashed, or its Sensor dropped through §6);
- **same-host delivery:** "The decker must be present on the same system to receive the frame's message". The owner
  is ON the frame's host (`currentPlace` under topology, else his live session's host).

A dumb frame whose owner left has ended, so this bites only on smart frames (6a-2c). It's checked anyway, so 6a-2c
inherits it.

**The result:**
- **delivered:** a card whispered to the owner and the GMs: "<frame> reports: <note>". The trigger's own card, when
  it's set, notes that "a decker waiting for it may need Null Operations (p.117)". That is the GM's call, so nothing
  is derived about the decker's waiting (R1 #15);
- **not delivered:** a GM-only card saying why.

Nothing is rolled: p.107 states no test.

### 8. Tests (6a-2b)
**Vitest** (pure, `module/rules/vr2-frames.mjs`):
- `liveDecoyFrame`: live; replaced by a newer success; a newer failure keeps the old; a deleted newer card → none; an
  off record; the frame ended; another session;
- `triggerProblems`: each rule on its boundary (Sensor 3 vs Security Value 6 passes, 2 fails), host vs user events;
- the core-DINAB left count.

**Quench `sr2e.vr2-frames` additions:**
- a command runs an Analyze operation with the decker's Computer and the frame's Analyze copy. The tally rises on the
  decker's session; the card has `iconUuid`; the decker's own Analyze utility is untouched; it is one Simple Action;
- a command refused for a smart frame, an ended frame, a frame on another host, and an operation whose utility the
  frame lacks;
- a weapon-carrier attack on IC uses the copy's rating; the IC's resist and damage work; the card's attacker is the
  frame, the key is the decker's;
- a tar baby striking a frame command crashes the frame's copy, not the decker's program;
- a decoy frame: a successful Decoy command makes it live; a killer IC attack on the decker goes to the frame (no
  1D6) and lands on the frame's monitor; trace IC still hunts the decker; the decker's own System Test ends the mode;
  a Null Operation doesn't; the frame crashing ends it;
- core DINAB: one run per owner phase (a second is refused), a failure wears it, all 1s crashes the copy;
- a copy's own DINAB respects the owner's phase;
- a crippler on a frame lowers its attribute (one loss per card, even when resolved twice);
- an event trigger: refused under the Security Value; set; the GM fires it; delivered while the decker is on the
  host;
- (R1) a frame's attack on a connected decker is admitted (the commander's key and incarnation); a frame's Slow
  suppresses on the COMMANDER's Detection Factor; a Track through a frame reads the frame's Sensor and ends when the
  frame crashes;
- (R1) a frame maneuver rolls the frame's Evasion and Cloak copy; a frame opponent opposes with its Sensor;
- (R1) the frame crashing between dialog and roll: nothing is spent, no card;
- (R1) the decoy fold: a newer successful decoy frame that crashes leaves NO decoy (the older one isn't resurrected);
  a failed Decoy, then an own action, then Karma turning it into a success: still off;
- (R1) the order: the decker's own action request sent, then an IC attack rolled on the GM: the attack goes to the
  decker (the flush processes the off first);
- (R1) a data bomb set off by a frame command hits the frame;
- (R1) a fully resisted core-DINAB attack wears the core DINAB once, even when replayed;
- (R1) two cripplers resolved at once on a frame at Bod 2 (floor 1): the second sees the first's loss;
- (R1) a non-GM `triggerFire` request is refused; an interrupted trigger report is posted once on the next pass.

## 6a-2c in detail: smart frames

**Status: plan Codex-APPROVED round 3 (2026-11-05); BUILT for 0.138.0.**

Builds on 6a-2a (0.136.0: the frame actor, upload, lifecycle, frames as targets) and 6a-2b (0.137.0: the command
context, weapon carriers, DINAB on a core, decoy frames, event triggers).

**The pages behind it** were rendered for this section (2026-11-05): Frames and Frame Core (p.105), DINAB and Cores
and Smart Frame Initiative (p.106), and Smart Frames (p.107).
- **p.105.** "Smart frames are capable of independent existence in the Matrix, whether their creator is logged on or
  not." Dumb frames, by contrast, "are linked to the decker's persona". "The Reaction attribute of a smart frame is
  equal to the frame's Core Rating."
- **p.106.**
  - "All smart frame cores must be programmed with the DINAB option, which acts as the core's Computer Skill."
  - "Smart frames have their own Reaction and Initiative Ratings": 1D6, plus one die per Core Rating point given to
    Initiative.
- **p.107.**
  - "Smart frames can perform any action a dumb frame can. In addition, smart frames have their own 'skill' (their
    DINAB Rating), and their own Response and Initiative ratings."
  - "The decker uses a Free Action to give the smart frame a basic order, and the frame then carries out that order on
    its own."
  - "The frame has its own actions. In game terms, the player who controls the decker runs the frame as well, but the
    frame's actions do not require any attention from the decker and do not use up any of the character's actions."

**User rulings (2026-11-05):**
1. **A smart frame keeps its OWN security tally on its host.** IC that its tally triggers goes after the frame. Trace
   IC can't trace it: it has no jackpoint of its own. This holds whether its decker is logged on or not.
2. **A basic order needs the decker logged on to the frame's host**, the same rule as event-trigger delivery (p.107).

**Out of 6a-2c:**
- SKs (6b) and command sets (6c);
- a smart frame running Decoy, because decoy frames are dumb frames ("Any dumb frame can act as … decoy", p.107);
- a smart frame running Redirect Datatrail, because it has no datatrail of its own (ruling 1).

Both refusals name the rule.

### 1. The smart frame acts as itself: the execution context
6a-2b's `ctx = { frame }` had the decker roll for the frame. A smart frame's action uses `ctx = { frame, smart: true }`
and is called with the FRAME as the acting actor: `systemTestNow(frame, host, op, { ctx })`, `attackOnce(frame, ctx)`,
`vr2Maneuver(frame, ctx)` and `vr2ScanIcon(frame, ctx)`. So the commander and the icon are the same actor:

| Read | A smart frame |
|---|---|
| who rolls | the frame (`frame.rollSuccessTest`), from its sheet, by its owner (the decker's player) or the GM |
| skill | its DINAB rating, as Computer (p.106). Untrained never applies |
| pools, Karma | none: a frame has neither. The dialogs already show none for an actor without them |
| programs, attributes | its own copies and its derived `matrixPersona` |
| host | its own (`frame.system.hostUuid`): it never logs on or moves |
| session, tally, sheaf | its OWN session on that host (§2), never the decker's (ruling 1) |
| Detection Factor | its Masking and Sleaze, less its own session's suppressions (`vr2DetectionFactor(frame, frame)`) |
| action | its own, never the decker's. No `commitAction` (that only touches characters), and no `ownAction`: a smart frame acting doesn't end its decker's decoy frame |

**`smartProblem(frame, { op, copy, after })`** in frames.mjs is the smart counterpart of `commandProblem`. It is
checked before anything is spent, and `after` is checked after the roll (as 6a-2b R2 #1). It refuses:
- not a smart frame, or ended;
- the user doesn't own the frame;
- its session is missing, or not on its host;
- its host is shut down;
- an operation in `NO_FRAME_OPS`, `decoy` or `redirectDatatrail` (out of scope above);
- a copy that isn't in `activePrograms(frame)`.

It does NOT need the decker anywhere: smart frames act "whether their creator is logged on or not".

**DINAB as the skill doesn't wear.** p.103's −1 per failure is the DINAB *option running a program*; on a smart core
p.106 makes it "the core's Computer Skill". A smart frame's test with its own skill is a skill test, so nothing wears.
*Claude's reading, flagged in Risks.* A COPY carrying its own DINAB option still runs and wears as 5b, on the frame.

**Every card a smart frame makes** carries `byFrame: true`, `icon: { uuid, upload }` (the frame) and
`owner: <owner uuid>`. Its `actorUuid` and `attackerUuid` are the frame itself. The owner's uuid is where any
sequencer fact about it goes (R1 #2).

### 2. The smart frame's own session (ruling 1)
**Created with the frame.** `reconcileDocs` (6a-2a) creates a smart frame with
`flags.sr2e.vr2Session = { id: <random>, hostUuid, hostName, tally: 0, receipts: {}, conn: null }` in the same
`Actor.create` call, so the frame and its session appear in one write.
- `liveSession(frame)` already accepts it: a session with `conn: null` on an actor with no `vr2Conn`.
- No `newSession`, `sessionFor` or ledger: the frame never moves, so 7a's scopes and carries don't apply. The host's
  own sheaf is the one that fires (`tallyUpdate` reads `s.owner ?? s.hostUuid`).

**Tally events.** `applyTallyEvent` already resolves `ev.actorUuid`, which is the frame. Its writer is the message's
author, who owns the frame. `tallyUpdate`'s trace acceleration reads `vr2Conn`, so it never applies. The sheaf
pending/delivery path (`vr2SheafPending`, `deliverSheaf`, its `updateActor` hook) works on any actor. The GM's sheaf
card names the frame.

**IC triggered by its tally go after the frame.** The GM attacks the frame's token: 6a-2a's frame-target path, as
today.

**Trace IC can't trace a smart frame (ruling 1).** `attackOnce`'s existing refusal of trace IC vs a frame gets a
smart-frame message: "a smart frame has no jackpoint to trace (its own existence, p.105)". A dumb frame keeps 6a-2b's
"target the frame's owner".

**Crash choices and suppressions on the frame's own session:**
- an IC that a smart frame's attack crashes offers the suppress/register choice on the FRAME's session. The card's
  `commanderUuid` and `commanderSession` are the frame's own (see §3), and `crashChoice` works on any actor with a
  live session;
- a data bomb that a smart frame sets off: `securityTarget(owner, st)` returns the frame (the card's `icon`). The
  bomb's tally prompt goes on `tallyHolder(target)`: a smart frame's own session, or, for a dumb frame or the decker,
  the decker's (R1 #2).

### 3. Attacks by a smart frame
`attackOnce(frame, { frame, smart: true })`:
- the non-IC branch with `icon = actor = frame`;
- `attackerComputer` = its DINAB (the Shield TN, p.100);
- no deathworms;
- the card's commander fields are the frame's own: `commanderUuid = frame.uuid`,
  `commanderSession = liveSession(frame).id`.

**A frame attacker key.** `attackerKeyOf(frame)` is "" today (no `vr2Conn`), and an empty key would break locks and
tracks. A smart frame's key is `frame:<frameUuid>@<uploadId>`:
- in vr2ic-rules.mjs, `isFrameKey(key)`, and `parseAttackerKey` returns `{ kind: "frame", uuid, upload }` for it;
- `attackerEnded(key)` treats a frame key as ended (R1 #3) when:
  - the actor at its uuid is missing or isn't a frame;
  - its `uploadId` isn't the key's upload;
  - or `frameState` says it has ended.

  So a smart frame's lock or Track ends with that incarnation, as a decker's does with his connection;
- every site that branches on `isDeckKey` to name or find the attacker gains the frame branch. Grepped:
  - vr2.mjs ~2271, the leave/lock listing;
  - vr2ic.mjs ~389 (the attacker's incarnation snapshot), ~1557, ~1709 and ~1820.

**Admission.** A smart frame's attack on a connected decker is admitted as a decker's is: `admitDeckerCards` and its
hook already accept `attackerType: "frame"` (6a-2b). The key is the frame key, and the incarnation (`attackerInc`) is
0: a frame has no crash incarnations. It ends instead.

**Track by a smart frame.** The trace fact's `via` (6a-2b) is the frame, so Relocate reads its Sensor and the track
dies with it.

**Slow by a smart frame.** `slowResult` writes `deckerUuid` = the frame and `session` = its session.
- **The Suppress button (p.99)** lowers the suppressor's Detection Factor while the IC is hung. Its request goes on
  the frame's OWNER's log with `frame: uploadId`: a frame has no log the sequencer passes, but its owner's facts
  already carry it (6a-2a).
- **The `slowSuppress` and `slowRelease` handlers** gain a frame branch: the session checked is the frame's, and the
  fact's `deckerUuid` is the frame.
- **`vr2DetectionFactor`'s Slow term** already counts suppressions whose `deckerUuid` is the actor's uuid, so the
  frame's Detection Factor drops.

### 4. Maneuvers, Scan Icon, triggers
- **Maneuvers:** `vr2Maneuver(frame, ctx)` rolls the frame's Evasion with its Cloak copy.
  - `tallyHolder` (6a-2b) becomes: a DUMB frame → its owner; a SMART frame → itself. A smart frame's evasion of IC is
    counted against its own tally.
- **Scan Icon:** its Scanner copy; it rolls its DINAB.
- **Event triggers:** setting one on a smart frame is a basic order (§5), so it needs the decker on the host. Firing
  and delivery are 6a-2b's, unchanged; the same-host check now really bites, because a smart frame outlives its
  decker's visit.

### 5. Basic orders (p.107; ruling 2)
- **Order…** is a button on the decker's row for a running SMART frame (Matrix tab). It takes a free-text order, for
  example "find and destroy the Black IC".
- **A Free Action:** no `commitAction`, and no `ownAction`. Giving an order is talking to the frame, not acting on the
  host, so it doesn't end a decoy frame.
- **Refused unless** the decker is logged on to the frame's host (`currentPlace` under topology, else his live
  session's host) and passes `vr2ActionGuard`.
- **Recorded** as `vr2:order:<uploadId>:<id>` `{ type: "frameOrder", upload, text }` on the owner's log
  (`recordEvent`, the decker's client). The frame's sheet shows the latest order, and a card is whispered to the
  owner and the GMs.
- **Its effect is narrative, and the player plays it out:** "the player who controls the decker runs the frame as
  well". The order isn't machine-checked against the frame's actions, because the book gives an order no mechanics.
- **An event trigger** set this way is an order with its `trigger` record (6a-2b §7), and the same host check applies.

### 6. The frame's sheet: acting
The smart frame's sheet gets the action buttons its owner and the GM use:
- **System Operation…**, **Attack**, **Maneuver** and **Scan Icon**, each calling the shared function with
  `ctx = { frame, smart: true }`;
- the operation dialog is 6a-2b's `commandFrame` dialog, reused. With `smart`:
  - it shows no Hacking Pool or Karma;
  - it offers no core-DINAB checkbox: the DINAB is its skill;
  - its title is the frame's;
  - "Set an event trigger" is offered from the decker's **Order…** instead (§5).

### 7. Initiative and combat (p.106; Decided #2)
- **Initiative:** `SR2EActor#_getInitiativeParts` gets a `frame` branch. A smart frame is `{ base: coreRating, dice:
  1 + initPoints, matrix: true }`, with the note "smart frame". A dumb frame has none; it's never a combatant.
- **Joining combat** ("it joins an active combat when it's uploaded"). A frame joins each eligible combat AT MOST
  ONCE, by two receipts on the owner's log, so the GM removing it never needs a hook (R1 #4, R2 #1):
  - **Eligible:** a running smart frame with a token belongs in a started combat on that token's scene in which its
    OWNER is a combatant.
  - **Step 1, intent:** the sequencer writes `frame-joining:<uploadId>:<combatId>` BEFORE anything is created.
  - **Step 2, create:** the combatant, `_id` = the upload id, created with `keepId`. An embedded keepId create of an
    existing id is rejected, so two passes or two GM clients never make two.
  - **Step 3, done:** `frame-joined:<uploadId>:<combatId>`.
  - **A pass:**
    - with no `joining`: does steps 1–3 when eligible;
    - with `joining` but no `joined`: an interrupted join. It creates the combatant if it's missing, then writes
      `joined`;
    - with `joined`: never creates again. A GM who removes the combatant from the tracker is therefore respected with
      no hook and no race. A GM who wants it back adds it from its token.
  - **The one gap is benign.** A GM who deletes the combatant in the instant between step 2 and step 3 gets it back
    once; removing it again is final.
  - **Initiative, recovered:** each pass rolls initiative (`combat.rollInitiative([id])`) for the frame's combatant
    whose initiative is still null.
  - **Ended:** after creating, the pass re-checks `frameState`, and an ended frame is removed at once (6a-2a's
    pattern).
  - **Triggers (R2 #2).** A pass runs whenever eligibility can newly arise. New hooks on the active GM schedule the
    owner of every running smart frame whose owner is a combatant there:
    - `updateCombat` when a combat starts (`started` changes to true);
    - `createCombatant` for an owner's combatant;
    - `createToken` for a frame's token (6a-2a already schedules this).

    A logged-off owner is still scheduled: `schedule` and `passFor` run for any character, whatever its connection.
  - This also enlists a smart frame in a combat its owner starts later. That is the reading of "a combatant like any
    other icon" (Decided #2).
- **Passes:** SR2ECombat's passes already work per combatant.
- **Its own actions:** the frame acts on its own turns from its sheet. The system doesn't police action counts for
  any actor, and frames are no exception.
- **The phase key of a copy's own DINAB option** (5b: one run per phase). `phaseKey` (6a-2b) maps a frame to its
  owner's phase. That is right for a dumb frame. A SMART frame that's a combatant uses its OWN phase, and otherwise
  its owner's.
- **Ended:** 6a-2a's cleanup already deletes the combatants of an ended frame.

### 8. Reactive security on a smart frame's tests
`offerTar` (vr2ic.mjs ~577) returns today when `st.conn == null` (R1 #1). It also accepts a `byFrame` card whose
frame is live and whose session is the card's. Its buttons' `data-actor` is the card's `owner` (`st.owner ??
st.actorUuid`), so every reactive fact goes on the OWNER's log, which the sequencer passes (R1 #2).
- **Tar:** `tarStrike(owner, …)`. The fact is on the owner's log, and the recipient is frozen from `ref.icon`. This is
  6a-2b's path unchanged: a frame recipient that's ended or a different upload lands on nothing. `liveConn` and the
  deck play no part for a frame recipient, so there's no corruption (a frame has no storage).
- **Worms:** never offered for a card with `byFrame` (no MPCP chip, as in 6a-2b).
- **Poison scramble:** `poisonTest` reads Computer from skill items. For a `byFrame` card it reads the frame's
  DINAB (its skill) from `st.icon`.
- **Data bombs:** above (§2).

### 9. Tests (6a-2c)
**Vitest:**
- `parseAttackerKey` and `isFrameKey` on a frame key;
- the frame branch of the initiative parts. The pure piece is `frameInitiative`, which exists; add a test that a dumb
  frame has none.

**Quench `sr2e.vr2-frames` additions:**
- a smart frame's own session exists at creation; its System Test rolls its DINAB dice, raises ITS tally, not the
  decker's, and has no pools;
- it acts with its decker logged off (jacked out): allowed;
- a smart frame's Decoy and Redirect Datatrail are refused; a dumb frame's Command is unchanged;
- trace IC vs a smart frame is refused with the no-jackpoint message;
- an IC its attack crashes offers the choice on the frame's session;
- a black-hammer lock from a smart frame ends when the frame crashes, or when its actor is gone (the frame key,
  R1 #3);
- (R1 #1–#2) a smart frame's System Test gets the GM's reactive-IC offer; a tar strike's fact lands on the owner's
  log and crashes the frame's copy;
- (R1 #4, R2) a combatant created twice at once → one; one with null initiative is rolled on the next pass; removed by
  the GM after `joined` → never re-added; a combat started after the upload, with the owner in it → the frame joins;
- an Order… is refused off the frame's host, and accepted on it: one record, shown on the sheet;
- initiative: Core 6 with 2 points → base 6, 3D6; uploaded while its decker is in a started combat, it joins once,
  and stays out after the GM removes it;
- a copy's own DINAB on a smart combatant frame claims the frame's own phase.

## 6b in detail: semi-autonomous knowbots (SKs)

**Status: plan Codex-APPROVED round 5 (2026-11-05); BUILT for 0.139.0.** *Built differently (simpler, same
guarantees):* an SK keeps its current or attempting session in `vr2Session` (so every session reader works), and
stashes a failed attempt's session in `flags.sr2e.skSessions.<hostId>`. Since an SK logs on only from between hosts,
the live session IS the destination's during an attempt.

The pages were rendered for this section (2026-11-05): Semi-Autonomous Knowbots, SKs and Native Hosts, SK Ratings,
Utility Pool, SK Response and Running an SK (pp.140–141).
- **p.140:**
  - SKs "are mobile virtual machines, personas without cyberdecks". They "can move".
  - Native host: "All SKs repair any damage to their Condition Monitors and Persona Ratings by logging on to their
    native hosts. If an SK is damaged while on its native host, it may receive the effects of a medic or restore
    program at a rating equal to its MPCP by spending a Complex Action. Such repairs do not require points from the
    SK's Utility Pool. Naturally, SKs have passcodes for their native host systems."
  - Ratings: "MPCP Rating of an SK equals 1D6 + 6. The MPCP Rating multiplied by 3 equals the maximum total of the
    SK's Bod, Evasion, Masking, and Sensor programs. No single Persona Rating may exceed the MPCP Rating. All SKs have
    a Computer Skill equal to their MPCP Ratings."
- **p.141:**
  - "SKs do not load utility programs. Instead, every SK has a Utility Pool of points equal to its MPCP Rating + 1D6."
  - **The sample table has one misprint.** MPCP-8 prints "Pool: 9 to 17". MPCP + 1D6 is 9 to 14, and every other row
    matches the formula (8–13, 10–15, 11–16, 12–17, 13–18). The table's six persona splits each total exactly MPCP × 3.
  - **Utility Pool:**
    - "Allocating points is a Free Action". "Each point from the pool acts as 1 Program Rating Point. The maximum
      rating for any utility is equal to the SK's MPCP Rating."
    - "Black hammer and killjoy programs require 2 Utility Pool points for each Program Rating Point."
    - "Any Utility Pool points allocated to restore or medic programs cannot be re-allocated until the SK returns to
      its native host and regenerates its code."
    - Points may go to the SK's Initiative.
  - **SK Response:** "base Reaction Rating equals its MPCP Rating, with 1D6 for initiative": 1 point → 2D6, 3 points →
    3D6, 5 points → 4D6, "the maximum increase allowed".
  - **Running an SK:**
    - "SKs behave like fanatically dedicated deckers".
    - "When the SK's Condition Monitor is filled, the program crashes and is gone."
    - "SKs cannot jack out … They must perform Graceful Logoff operations to leave hosts and Logon to Host operations
      to access their native hosts".

**Who runs an SK (Claude's reading, flagged in Risks).** SKs are major-power assets ("should be limited to major
adventures", p.140), so in this system an SK is the GM's icon, like IC. Its writes (damage, repair, allocation) go
through the active GM's sequencer. A GM who gives a player OWNER permission lets that player roll its tests, but the
facts are still written by the sequencer.

**Out of 6b:** True AI (p.141–142: GM fiat), and building SKs by programming (p.140: a Red-10 mainframe and six top
programmers is a story, not a test). The GM creates an SK directly.

### 1. An SK is a frame actor with `kind: "sk"`
SKs reuse 6a-2c's machinery: a smart frame that acts as itself, with an `Act…` dialog, attacker keys, Initiative and
the frame-target paths. What an SK changes is listed here.

**Schema.** `FrameData.kind` gains `sk`. Choices are added to an existing StringField whose initial value is `dumb`,
so existing documents stay valid; check `invalidDocumentIds` after the change.
- New fields: `nativeHostUuid` (string) and `pool` (integer ≥ 0, the rolled Utility Pool total).
- `coreRating` is the **MPCP**, `dinab` is its **Computer** (= MPCP), and `initPoints` is unused (§3).
- `hostUuid` is where it IS ("" between hosts, §4). No owner: `ownerUuid` is "".

**Identity (R1 #1).** An SK is ONE incarnation for its whole life: "if an SK is destroyed … its creators can generate
another one", which is a new SK. So it is created with `_id` = a fresh random id and `keepId`, and `uploadId` = that
same id. Every `game.actors.get(upload)` in the frame code then finds it.

**Its facts are on itself.** A frame's facts live on its owner's log; an SK has no owner, so its facts are written
on the SK by the sequencer. Every frame function that reads "the owner's records" gets one accessor,
`factsOf(frame)`: the SK's own records, or for a frame its owner's. Grepped, and each changed to use it:
- `stateFor`/`frameState`;
- `FrameData.prepareDerivedData`'s attribute fold (R1 #2): for an SK, `eventsOf(this.parent)`;
- `replayResolutions`, `replayWear`, and the `frameHit`/`frameAttr` handlers (§5).

**Where it differs from a frame:**
- **Ended** only by its monitor (§5), deletion, or a host shutdown: no upload, departure or owner.
  - A host shutdown dumps every icon on it (p.53), so an SK ON that host also ends.
  - The check is against its residence: the host of its latest `sk-move` fact (§4), and only shutdowns that went
    offline AFTER that move's `seq` (`shutdownOfflineSeqs(host).some(s => s > arrivalSeq)`). An SK arriving after an
    old shutdown and restart is unaffected (R2 #2).
- **No upload or combat joining:** `reconcileDocs`, `reconcileOwner`, `reconcileAllFrames` and `joinCombats` skip
  `kind: "sk"`. The GM adds an SK to combat from its token, as with IC. Its own pass is §5.
- **Checks:** `smartProblem` treats an SK like a smart frame, with the SK operation list (§4) and the "between
  hosts" state.
- **The rest is shared:** `phaseKey` and `tallyHolder` treat it as a smart frame (itself).

### 2. Creating an SK (the GM)
**New SK…** is a button in the Actor Directory (GM only, beside **New grid…**). Its dialog:
- **native host** (a host);
- **MPCP:** roll 1D6 + 6 (a visible chat roll), or set 7–12 by hand;
- **Bod, Evasion, Masking, Sensor**, validated by the pure `skProblems({ mpcp, bod, evasion, masking, sensor })`:
  - each ≤ MPCP;
  - the total ≤ MPCP × 3;
- **Utility Pool:** MPCP + 1D6 (a visible roll), or set by hand;
- **a preset** from the p.141 table fills the persona ratings.

It is created ON its native host, with GM ownership. In the sequencer, the GM writes the actor (keepId), then its
first move fact `sk-move:0` `{ to: native, from: "", initial: true }`, so its residence and shutdown boundary exist
from the start (R3 #1). The SK pass writes that initial move if an interruption lost it: an SK with no move fact is on
its native host as of its first pass.

### 3. The Utility Pool (p.141): one writer, replay-safe
**All allocation runs in the sequencer, on the active GM's client.** SKs are the GM's (§ above), so no request is
needed. A non-sequencer client's button says "the active GM allocates for an SK".
- **Allocate…** (the SK's sheet) is a Free Action. It edits the whole allocation as a table: utility name → rating,
  plus Initiative points.
- **The pure `poolProblems({ pool, mpcp, alloc, init, locked })`:**
  - cost = Σ rating, except black hammer and killjoy at 2 points per rating point;
  - plus Initiative points;
  - the cost must be ≤ the pool;
  - each rating must be ≤ MPCP;
  - Initiative points must be 0, 1, 3 or 5 ("5 points provides 4D6 — the maximum");
  - a restore or medic allocation may not drop below its locked rating.
- **Inside the sequencer:**
  1. re-check the dialog's expected revision against the latest `sk-alloc` fact (R2 #4): a stale dialog is refused
     ("allocated elsewhere meanwhile: reopen"). Then `poolProblems`, and the SK not ended;
  2. write the fact `sk-alloc:<rev>` with the whole allocation **and its item identities** (R1 #6):
     `{ rev, init, locked, items: [{ id, name, rating }] }`;
  3. reconcile.
- **Item identities:**
  - a utility that's unchanged keeps its item id;
  - one whose rating changed, or whose item is crashed, gets a NEW random id: a fresh version, so wear, crash
    records and one-shot/DINAB markers start clean, as a Swap Memory does for a deck.
- **The reconcile (`reconcileSkItems`, idempotent; run after the fact and on every SK pass):**
  - every item in the latest `sk-alloc` fact exists, created with that id and `keepId`;
  - every item flagged `skPool` that the fact doesn't list is deleted.

  So an interruption between the fact and the items is finished by the next pass, and nothing is duplicated (the id
  is the arbiter).
- **The item locks:** 6a-2a's `preUpdateItem` and `preDeleteItem` locks on frame items both let a write through when
  it carries the option `sr2eSkPool: true`. Only the reconcile passes it.
- **The restore and medic lock (p.141):** an allocation fact records `locked[name] = max(old lock, new rating)` for
  restore and medic. The next `sk-repair` with `unlock` (§5) clears it.
- **Initiative:** the latest allocation's `init` points. `_getInitiativeParts` for an SK is base MPCP, dice from
  `skInitDice(points)` (0 → 1, 1 → 2, 3 → 3, 5 → 4).

### 4. Acting and moving (p.141)
**Act…** (the SK's sheet) is 6a-2c's dialog with `ctx = { frame: sk, smart: true }`:
- its Computer is MPCP;
- no pools or Karma;
- its programs are the pool's items;
- it uses its session on the host it's ON.

Decoy and Redirect Datatrail are refused, as for smart frames. "SKs cannot jack out": there's no jack-out.

**Movement has its own two buttons, not the Act dialog (R1 #3):**
- **Logon to Host…**, with a host picker;
- **Graceful Logoff**.

Both go through one function, `skMove(sk, op, dest)`, written for a deckless icon. It uses no topology: grid travel is
the GM's narration for an SK, flagged in Risks.

**SK sessions are per host (R1 #4).** The SK keeps `flags.sr2e.skSessions.<hostId> = { id, hostUuid, hostName,
tally, receipts }`:
- `liveSession(sk)` returns the entry for the host it's ON (`system.hostUuid`), or null between hosts;
- `applyTallyEvent` finds an SK's session by the event's `sessionId` among these entries, not only the live one.
  This is one SK branch in `eventOf`/`applyTallyEvent`;
- `tallyUpdate` takes the session's flag path for the tally and receipts only. The sheaf-pending entry stays where it
  is today, OUTSIDE any session (`flags.sr2e.vr2SheafPending`, keyed by session), so closing a session can never
  lose an undelivered trigger (R2 #1).

**Logon to Host (dest):**
1. **The attempt session first:** the sequencer creates `skSessions[dest]` if it doesn't exist (tally 0). A failed
   attempt's tally stays on it: the host remembers the intruder until the SK leaves.
2. **The test:** Access, with the pool's Deception. It runs `systemTestNow` for the SK with a `dest` option: the host
   is `dest`, not the SK's current host, and the session is `skSessions[dest]`. So the tally event and the sheaf are
   the DESTINATION's (p.19: the host being logged on to rolls).
3. **Success:** the sequencer writes the fact `sk-move:<n>` `{ to: dest, from, repair: dest === native }`.

   **Failure:** no fact; it stays where it was.
- **Its native host takes no test** ("passcodes for their native host systems", p.140): the fact is written at once,
  with `repair: true`.

**Where it is is a FACT (R2 #3).** The `sk-move` facts are the source of truth, and the latest one says where it is.
`system.hostUuid` (which the frame code reads) and the session entries are reconciled from them by the SK pass,
idempotently.

**Every move fact is completed IN ORDER (R3 #2)**, never only the latest:
- for a logoff, the session entry it LEFT is deleted, identified by the session id the fact records
  (`{ to: "", from, sessionId }`), so a later attempt's or arrival's new session on that host is never touched (R4 #1);
- for an arrival with `repair`, the `sk-repair:arrive:<n>` fact is written if missing. That fact carries
  `at: <the move fact's seq>`, and the fold places it there (§5), so a hit that landed after the arrival but before
  the pass is never healed by it;
- then `system.hostUuid` is set to the latest fact's `to`, and its session is ensured.

**Every other SK write runs this completion FIRST, inside the same sequencer task**: a hit, a repair, a move, an
allocation or a test's admission. So no write is admitted against an unfinished transition. An interruption is
finished by the next pass, and a repeat changes nothing.

**Graceful Logoff:** a System Test on its current host, its tally on that host's session.
- **Success:** the fact `sk-move:<n>` `{ to: "", from, sessionId }`. The pass sets `hostUuid = ""` and deletes that
  session entry, and only that one (a later visit is a new session). The sheaf-pending entries survive (R2 #1).
- **Failure:** it stays.
- Between hosts, an SK can only Logon.

**Trace IC can't trace an SK:** it has no jackpoint (6a-2c's rule).

### 5. Damage, repair and crash: facts on the SK, one fold, one pass
**Every fact is written by the sequencer on the SK** (`fact(sk, …)`), on the active GM's client; others are refused
(one writer).
- `hitFrame` and `attrFrame` get an SK branch: instead of a request on an owner's log, they run the
  `frameHit`/`frameAttr` handler bodies directly in `sequencer()` with the SK as the log.
- **Refused once ended (R1 #8):** every SK write checks `frameState(sk).ended` inside the sequencer. That covers hits,
  repairs, moves and allocations.

**One sequence-ordered fold (R1 #7).** `skCondition(records)` in vr2-frames.mjs replaces "since the last repair". It
walks the SK's `frameHit`, `frameAttr` and `skRepair` facts in `seq` order:
- **a hit** adds its boxes (cap 10);
- **an attribute loss** adds to that attribute's loss;
- **a full repair** (`{ full: true }`, its native host) zeroes the monitor and every loss. It sits at its `at` seq
  (its move's), not at the seq its fact was written with (R3 #2);
- **a partial repair:**
  - `{ boxes }` (Regenerate as Medic) subtracts that many boxes, floor 0;
  - `{ attr, points }` (Regenerate as Restore) subtracts from that loss, floor 0.

Everything reads this one fold: `frameState` (monitor, ended), `FrameData`'s attributes, the `frameAttr` handler's
current value, and `replayResolutions`' "after this hit" monitor, which folds the facts up to that hit's `seq`. For
a frame (no repairs) it equals today's `frameMonitor` and `frameAttrLosses`, which become thin calls to it.

**Repair (p.140):**
- **Arriving at its native host:** the arrival's `sk-repair:arrive:<n>` `{ full: true, unlock: true }`, written by the
  pass from the move fact (§4), so it can't be lost to an interruption (R2 #3).
- **Regenerate** is a Complex Action button while ON its native host and damaged. It rolls MPCP dice:
  - against `medicTN(boxes)` for Medic, which writes `{ boxes: successes }`;
  - or against the restore TN for Restore (`restoreState`'s rule), which writes `{ attr, points }`.

  Neither uses the pool.

**The crash:** at 10 boxes the fold says ended. The SK pass then removes its tokens and combatants (6a-2a's cleanup
steps, without deleting the actor): the actor stays as the GM's record, marked crashed. Its locks and Tracks end (the
frame key's `attackerEnded`).

**The SK pass (R1 #5).** `skPass(sk)` runs in the sequencer and is idempotent:
- the location from the latest move fact: `hostUuid`, sessions, and the arrival repair (R2 #3);
- `reconcileSkItems`;
- replay resolutions and wear;
- the crash cleanup.

It is scheduled by a `createActiveEffect` hook on an SK's record effects, and by a scan of every SK on `ready` and
`userConnected`. That is the GM handoff: an interrupted allocation, resolution or cleanup is finished by the new
active GM.

### 6. The SK's sheet (the frame sheet with `kind: "sk"`)
- MPCP, Computer, the persona ratings (after losses), Initiative (MPCP + nD6);
- the monitor;
- the Utility Pool: total, allocated, free, locked;
- its own tally and current host, or "between hosts";
- buttons:
  - **Act…**;
  - **Allocate…**;
  - **Regenerate** (on its native host, while damaged);
  - **Logon to native host** (no test, when not there).

### 7. Tests (6b)
**Vitest:**
- `skProblems`: each rule, plus every p.141 sample;
- `poolProblems`:
  - black hammer at 2:1;
  - Initiative steps 1/3/5 only;
  - a rating above MPCP;
  - a cost over the pool;
  - a locked medic lowered;
- `skInitDice`;
- `skCondition`: hits, a partial Medic, a loss, a full repair, more hits, in seq order (R1 #7);
- the pool roll range (MPCP + 1D6; the MPCP-8 "9 to 17" misprint noted).

**Quench `sr2e.vr2-frames` additions:**
- New SK… creates one on its native host with its own session; persona validation refuses 13/…;
- allocate Attack-6, Armor-3, Initiative 3:
  - items appear;
  - Initiative is MPCP + 3D6;
  - a stale revision is refused;
  - re-allocating Attack to 4 replaces its item, and Armor keeps its wear;
- medic allocated, then lowered: refused until a repair;
- the SK acts (Locate IC) with MPCP dice, and its tally rises;
- Graceful Logoff, then Logon to a host: the session moves and the tally starts at 0;
- damage from an IC attack lands on the SK; Logon to native host repairs it and unlocks;
- (R1) a Logon to another host puts its tally on the DESTINATION's session; a failure stays; an allocation
  interrupted after its fact is completed by the next pass; a crashed SK refuses moves and allocations;
- Regenerate on the native host heals boxes;
- 10 boxes: crashed, the token removed, the actor kept and marked crashed;
- trace IC targeting an SK is refused.

## 6c in detail: command sets

**Status: plan under review.**

The pages were rendered for this section (2026-11-06): Command Sets (p.104–105).
- **p.104.** "A command set consists of a simple program of orders that a decker can leave on a host to be executed
  at a later time. Writing a command set may require one or more Subsystem Tests, depending on the tasks the decker
  wants the host to perform." The book's examples:
  - a Slave Test to manipulate a remote device ("opening a security door at a specific time or after receiving a
    specific signal");
  - a Files Test to print or erase a file;
  - an Access Test to open a SAN at a given time.

  "The gamemaster determines the specific Subsystem Test needed for the command set (when in doubt, use a Control
  Test). The deception utility reduces the target numbers for all these tests."
- **p.105.**
  - "More complex sequences of action require the decker to write a program in advance and upload it. The design size
    of such programs is 1D6 × 20 Mp. After uploading the program, the decker must make a successful Control Test to
    load the program into the host."
  - "Total any successes the host scores in opposing these Subsystem Tests. Divide the sum into 24. The result is the
    number of hours the program will continue to run on the host without being detected and purged. If the host scores
    no successes, the command set remains undetected for 48 hours."
- **Upgrading (p.107)** excludes command sets ("with the exception of command sets"): nothing to do here.

**User rulings (2026-11-06):**
1. **A complex set's program is created with no test.** The decker creates a command-set program item; its design
   size rolls 1D6 × 20 Mp, it takes storage memory like any program, and writing time is the GM's call. The book gives
   it no rating, so a programming test would need an invented TN.
2. **Its upload is timed like a frame's** (0.136.0): size ÷ the deck's I/O seconds (p.91). In combat it is counted
   by Combat Turns; outside combat the GM finishes it. Leaving the host loses it.

**Readings (Claude's, flagged in Risks):**
- **24 ÷ the sum is kept as a fraction:** 5 successes → 4.8 hours = 4 h 48 min. Time has no rounding problem.
- **Every test made for the set counts** toward the sum and must succeed: the task tests and the load test alike.
  "These Subsystem Tests" names them all. A failed test means the set doesn't work, and the card says so.

### 1. What a command set is
**One set = durable facts on its HOST**, written by the sequencer: the host is the GM's, and the set lives there after
the decker leaves.
- **`cs-open:<id>`** `{ type: "csOpen", id, decker, name, orders, kind: "simple" | "program", steps: [sub, …], conn,
  sessionId, upload? }`.
  - A SIMPLE set is opened by the decker's request; the sequencer writes it after checking he is ON that host
    (`currentPlace` under topology, else his live session's).
  - A PROGRAM set is NEVER opened by request (R1 #3). Only the sequencer opens it, from its own completed command-set
    upload (§3), and its id is the upload id.
- **`cs-step:<id>:<n>`** `{ type: "csStep", id, n, sub, success, hostSuccesses, card, at }`: step n, SETTLED once by
  the sequencer (§2).
  - `at` is `game.time.worldTime`, sampled by the sequencer and stored explicitly: `fact` adds only `seq` (R1 #1).
  - Its verdict and the host's successes are FROZEN in the fact. The card's test is closed then, so no Karma comes
    later (R1 #7).
- **`cs-steps:<id>:<k>`** `{ type: "csSteps", id, from, steps }`: the GM changes the REMAINING steps from step `from`
  ("the gamemaster determines", R1 #8). `from` is the number of steps already settled when it is written, and the
  request is refused otherwise. ALL changes fold in `seq` order, each replacing the list from its `from` onward, so a
  settled step is never rewritten (R2 #3).
- **`cs-mark:<id>`** `{ type: "csMark", id, what: "executed" | "purged" | "cancelled" }`: the GM's terminal mark, once
  (R1 #8).

**Everything else is derived, never stored.** The pure `csState({ open, steps, changes, marks, now })` in a new
`module/rules/vr2-command-sets.mjs` folds them:
- **the step list:** the open fact's steps, then every change in `seq` order, each from its `from`;
- **pending** (with the next step), **failed** (a settled step failed), **loaded** (every step settled and
  successful), or the GM's mark: **executed**, **purged** or **cancelled**;
- **the host's sum:** Σ the settled steps' `hostSuccesses`;
- **hours** = sum > 0 ? 24 ÷ sum : 48;
- **loadedAt** = the last step's `at`; **purgeAt** = loadedAt + hours × 3600;
- **undetected** while `now < purgeAt` and no mark. Past `purgeAt` it reads as purged without a mark.

**Admission per action (R2 #2):**
- settling a step and changing steps need the set **pending**;
- **Cancel** needs **pending**;
- **Executed** and **Purged** need **loaded**;
- any terminal mark refuses another.

### 2. The tests (p.104): one operation, bound to its set and step
**A new System Operation** `commandSet: { subsystem: "targeted", utility: "Deception" }`.
- It's run with `opts.subsystem` = the step's subsystem and `opts.cs = { id, step }`. `systemTestNow` stamps `cs` on
  the card (R1 #2), and otherwise handles it like Analyze Subsystem: TN = that subsystem less Deception, the host's
  opposing roll, the tally.
- Under topology, `reachable` already allows a non-logon operation only on the host the decker is on, and grids
  refuse it (not in `GRID_OPS`).

**Settling a step (R1 #2, #7).** Karma is spent on the card as usual. Then **Settle step** on the card sends
`request(decker, "csStep", { id, step, card })`. The sequencer admits it only if:
- the set is pending, and `step` is its NEXT step;
- the card is a `commandSet` test card stamped with this `cs.id` and `cs.step`, whose `sub` is that step's subsystem;
- its `actorUuid` is this decker, and its `hostUuid`, `conn` and `sessionId` equal the SET's host, and the set's
  ORIGINAL `conn` and `sessionId` (from `csOpen`), AND the decker's live connection and session now, with him ON
  that host (R2 #1). A reconnect, or a new session on the same host, can't finish an abandoned set.
- no `cs-step:<id>:<n>` exists yet: one settlement per step, so a card can't serve twice.

Then it closes the card's test (`freezeSuccesses`) and writes the step fact with the frozen verdict, the host's
successes and `at`. A decker who left before settling can't settle: the step stays pending (§4).

### 3. Simple and complex sets (the decker)
**Command set…** on the Matrix tab (VR2.0, on a host) opens a dialog:
- a name and the orders (free text: what, and when or on which signal);
- **tasks:** one or more subsystems (Access, Control, Index, Files, Slave), with **Control** as the default.
- **Simple:** opens the set by request.
- **From a program:** the decker picks a command-set program item, and it starts the upload instead (below).

The set's card lists its steps; the next step has a **Test** button, and its rolled card has **Settle step** (§2).

**Complex sets (ruling 1–2):**
- **The program item (R1 #6).** `ProgramData` gains `commandSet` (BooleanField, initial false) and `csSize`
  (integer ≥ 0, the rolled design size).
  - Derivation branches: a command-set program's design size and actual size are `csSize`, and its rating is unused
    (it is created with rating 1, so the existing `min: 1` holds). Every other program derives as today, both
    directions assigned (CLAUDE.md's derived-state rule).
  - `usablePrograms` excludes it, as it excludes cores, and the program row shows no loaded toggle. Storage memory
    counts its `csSize`.
  - **New command-set program** on the Matrix tab creates it with a visible 1D6 × 20 roll.
- **The upload, generalized from 0.136.0.** The decker's client requests `csUpload`
  `{ upload: id, item, name, orders, steps, host, conn, sessionId }`. A new handler validates it like `upload` does
  (on that host, connection, session, I/O > 0, a command-set item of his):
  - it writes the same `uploadOpen` fact, with `kind: "commandSet"`, `seconds = ⌈csSize ÷ I/O⌉`, and a snapshot
    holding the WHOLE set definition `{ coreName: <the set's name>, name, orders, steps, item }` (R1 #4);
  - `coreName` keeps its name, so frame records and every reader of it are untouched (R1 #5).
- **Everything about the upload clock is shared.** `settleUpload`, `tickUploads`, the manual **Upload finished
  (GM)** and departure don't care what's uploaded. `reconcileDocs` and `stateFor` skip `kind: "commandSet"`: no
  actor is made.
- **Opening on completion, reconciled (R1 #4).** In `reconcileOwner` (the decker's sequencer pass), every completed
  `commandSet` upload with no `cs-open:<upload>` on its host gets one, from the snapshot: `kind: "program"`, steps =
  `["control", …snapshot.steps]` (the load test first). `conn` and `sessionId` are the upload's (R2 #1). It is idempotent and keyed by the upload id, so an
  interruption after `uploadDone` is finished by the next pass. An `uploadEnd` never opens a set.

### 4. The decker leaving
A set is left on the host on purpose: once it's **loaded**, the decker leaving changes nothing.
- **Pending** steps need the decker on that host, connection and session at settlement (§2). After he leaves, no
  step can settle, and the set stays pending until the GM cancels it.
- *Flagged in Risks: the book doesn't say a half-written set survives a logoff; refusing is the cautious reading.*

### 5. The host sheet (the GM)
A **Command sets** section lists every set:
- its name, decker, orders, kind and steps (each ✓ / ✗ / pending, with the host's successes);
- its status: pending, failed, loaded, executed, purged or cancelled;
- for a loaded set: "undetected for H h M min (until <world time>)", or "found and purged (p.105)" once world time
  passes `purgeAt`. The sheet re-renders on `updateWorldTime`.

GM buttons, each a request handled by the sequencer and refused for a non-GM requester (as `uploadDone`). Each writes
the fact named in §1, and a set's state already folds them:
- **Executed** (it ran its orders);
- **Purged** (security found it early);
- **Cancel** (a pending set);
- **Change step** (a pending set's remaining steps: "the gamemaster determines").

A loaded set past `purgeAt` shows as purged without a mark: it is derived.

### 6. Tests (6c)
**Vitest** (`vr2-command-sets.mjs`):
- `csState` steps, pending/failed/loaded;
- the sum and hours: 24 ÷ 5 = 4.8, 0 → 48;
- purgeAt and undetected;
- a GM step change from step n; marks are terminal;
- the load step first for program sets.

**Quench (`sr2e.vr2-frames`, or a new `sr2e.vr2-command-sets`):**
- a simple Slave set: open, test (TN = Slave − Deception), loaded; its hours from the host's successes; the host
  sheet shows it; world time past `purgeAt` → purged;
- a settle for a step out of order, a card of another set or subsystem, a second settle of a step, or after the
  decker left: refused (R1 #2, #7);
- Karma on the card before settling counts; the settled card is closed (no later Karma);
- a program set: the item rolls its size; upload (manual clock) → the set opens with the Control step; a failed
  Control test → failed;
- an upload interrupted by leaving: no set;
- GM marks: a non-GM's request is refused;
- a command-set program is never a usable utility.

## Requirements carried to the 6a / 6b / 6c plans (Codex R1, accepted)
Each phase gets its own detailed plan, Codex-reviewed before code. It must answer:
- **6a, frame decoys:** a separate mode from plain decoys (security goes after the frame, the decker stays inactive,
  the frame's own defences and attributes apply, its crash ends it, trace still reaches the owner).
- **6a, upload vs departure:** bind an upload to the connection AND host session; completion admitted by the
  sequencer; actor/token/combatant creation reconciled idempotently against a departure.
- **6a, every hook point:** attacker admission (`admitDeckerCards` and its chat hook), guards, incarnation keys,
  resistance, monitor writes, Shield/Armor, maneuvers, attribute effects, Limit classification (incl. `kind: "sk"`),
  host shutdown (which enumerates characters today).
- **6a, loaded programs:** full immutable copies (options, attack semantics, identities) materialized as runtime
  items or an equivalent adapter that `activePrograms`/`spendUse`/DINAB wear accept, with their own wear/crash state.
- **6a, loading completion:** the whole loading snapshot in the winning task's terminal record; the active load
  derived by task generation, never a separate write that can be lost or overwrite a newer load.
- **6a, the core design:** frame fields in the frozen design (`designOf`); core-only option eligibility (DINAB,
  optimization, squeeze; no Sensitive), DINAB capped by the programmer's Computer, mandatory on smart cores; the
  Computer × 1.5 cap wired in.
- **6a, dumb-core DINAB:** claimed against the owner's action and the core, not the frame's (empty) combat phase,
  with an explicit recipient for wear/crash.
- **6a, an execution context** for frame actions separating commander, acting icon, skill, utilities, host session
  and tally/trace owner (System Tests read all of these from the character today).
- **6a, every quoted constraint:** decompress before upload; cut program ratings when the Core Rating drops; event
  triggers' Sensor + analyze/scanner ≥ half the host's Security Value and same-host delivery.
- **6a/6b lifecycle:** schema defaults, a stable incarnation id, host shutdown/deletion, replayable cleanup of tokens,
  combatants, decoy references and pending actions.
- **6b, SK pool:** serialized allocation and locked restore/medic points, versioned virtual utilities, native-host
  return/repair/travel/crash transitions, Graceful Logoff for a deckless icon.
- **6c, command sets:** one contract for upload, load verdict, the summed host successes and the purge deadline.
- **Tests** for each of the above, including two-device races and interrupted completions.

## Key decisions & trade-offs
- **A new actor type** rather than reusing IC (above). The cost is a server restart on upgrade and a migration-free
  type addition. Check `invalidDocumentIds` after adding it ([[sr2e-stringfield-blank-trap]]).
- **Loaded programs are copied into the frame**, not linked to live items, so a frame never changes under a running
  game.
- **Whether a dumb frame's attack rolls the program's rating or the decker's Computer.** The book says decoy tests use
  the decker's Computer skill, but attacks have used the utility's rating since part 5a (p.123). The plan keeps that
  split.
- **SKs share the frame actor type** instead of being NPC-like characters: same icon mechanics, plus a pool.
- **Event triggers are narrative.** They are a GM note: the frame posts a card when the GM marks an event.

## Risks / open questions
- **Pages:** all the rules this plan uses are read from renders (Null Operation and Scan Icon p.117 on 2026-11-04).
- **Gaps in the book:**
  - It doesn't say whether a dumb frame takes damage from black IC's lethal effects. Plan: as an icon, no biofeedback.
  - Smart frame action economy: "its own actions", so it uses the same action types as a decker. Assumed.
- **6a-2b readings (Claude's, flagged for the user):** a Null Operation doesn't end a decoy frame (it is the book's
  way to wait, p.117); a decoy frame takes ALL proactive non-trace IC attacks with no die (p.107 "all security
  measures"), and outranks a 6a-0 decoy while it lives; cripplers hit a frame's attributes (it is an icon with them).
- **6a-2c reading (Claude's, flagged for the user):** a smart frame's own DINAB-as-skill doesn't wear on failure
  (p.103's wear is the option running a program; p.106 makes a smart core's DINAB its Computer skill).
- **6b readings (Claude's, flagged for the user):** SKs are the GM's icons (writes through the sequencer); an SK's
  Logon to Host isn't limited by grid topology (the book gives a deckless icon no route rules); logging on to its
  native host needs no test (its passcode); a crashed SK's actor is kept as the GM's record.
- **6c readings (Claude's, flagged for the user):** 24 ÷ the sum is kept fractional (5 → 4 h 48 min); every test made
  for a set (task and load) counts toward the sum and must succeed; a half-written set's remaining steps need the
  decker still on that host session.
- **Concurrency:** a frame actor created by the GM client for a player's upload, and its crash on logoff through the
  sequencer, so a logoff on one device and a command on another can't race.
- **Scale:** many frames on a host make many combatants. Fine for table scale.

## Decided (2026-11-03)
The user isn't familiar with VR2.0 and asked for the most complete and correct reading, so these are Claude's calls,
explained so the user can override them.
1. **Separate releases:**
   - 6a-0: the Decoy operation;
   - 6a: frames;
   - 6b: SKs;
   - 6c: command sets (upgrading has its own plan).

   Each is smaller to review and test, and each is useful alone.
2. **Combat tracker:** a smart frame is a combatant like any other icon, with its own Initiative (p.106–107). It joins
   an active combat when it's uploaded, and outside combat it simply exists on the host. A dumb frame never joins: it
   acts on the decker's Simple Action.
3. **Command sets are automated.** Everything p.104 states is a rule:
   - the 1D6 × 20 Mp size;
   - the Control Test to load it;
   - 24 ÷ the host's summed successes = hours undetected, 48 if none.

   Which Subsystem Test the set needs is the GM's pick, as the book says, with Control as the default.

## Documentation (part of done)
- **Wiki:** "The Matrix" section, plus a How-To-Guides walkthrough for anything that takes the GM or the decker more
  than one step, with screenshots and a GIF of the flow in use.
- **In Foundry:** `npm run gen-guides && npm run build-packs guides` ships the how-to, with its images, in the SR2E
  Player Guides pack.

## Out of scope
- True AI (p.141–142: GM fiat).
- Otaku complex forms and sprites.
- Grid topology.
- Deck construction.
- Native-host master programs.
- Satellite links.
