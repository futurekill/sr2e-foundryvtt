# Plan: VR2.0 part 6: frames and SKs
_Draft 4 (2026-11-04): **6a-0 Codex-APPROVED in round 4.** **This review covers 6a-0 only** (detailed below); 6a, 6b and 6c each get
their own detailed plan and review before they're built, which must meet the requirements Codex R1 raised (listed below).
Null operation and Scan Icon read (p.117) and added to 6a-0; upgrading moved to its own plan.
Codex review: docs/PLAN-vr2-part6-frames-REVIEW-LOG.md. No code before review._

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

## 6a-0 in detail: Decoy, Null Operation, Scan Icon (the part under review)

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
