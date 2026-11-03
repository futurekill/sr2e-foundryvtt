# Plan: VR2.0 part 6: frames and SKs
_Draft 0 (2026-11-03). Not yet Codex-reviewed (Codex is out of quota until 2026-11-04 10:07). No code before review._

Sources (all rendered from the image-only PDF, `Shadowrun 2e - Virtual Realities 2.0 {FASA7904}.pdf`; book page = PDF − 8
here): Frames pp.105–107 (PDF 113–115), DINAB p.103–104, Command Sets p.104, Upgrading p.107, Buying Programs p.107,
Condition Monitors p.124, SKs pp.140–141 (PDF 148–149).

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

**Upgrading (p.107).**
- Base time = the new version's base time − the current version's.
- Computer Test against the upgraded rating, then standard programming.
- Adding options is also an upgrade.

## Approach (proposed)
0. **Phasing.** 6a frames (core + loading + dumb + smart), 6b SKs, 6c command sets + upgrading. Each is releasable
   alone; 6b reuses 6a's icon actor.
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
   - Plain Decoy doesn't need frames, so it could ship first, as 6a-0.
6. **SKs (6b).**
   - `frame` actor with `kind: "sk"`: MPCP, persona ratings (validated ≤ MPCP each, Σ ≤ MPCP × 3), Computer = MPCP,
     `utilityPool {total, alloc: {utility: points}}`, `nativeHostUuid`.
   - Allocation is a Free Action from the SK sheet, and each utility it allocates behaves like a loaded program of that
     rating (a virtual program list feeding `activePrograms`).
   - Black hammer and killjoy cost 2:1, and restore/medic points are locked until the SK is on its native host.
   - Initiative takes the 1/3/5-point dice steps.
   - Native-host regeneration is a Complex Action button.
7. **Command sets and upgrading (6c).**
   - A command-set item: size roll, Control Test, a hours-undetected card. The rest is the GM's narrative.
   - Upgrade = a programming task with base time = new − old (`baseTime` difference). Adding options counts.
8. **Tests.**
   - Vitest: core size/cap/attributes, the loading rating with the ÷ example, SK pool costs, initiative steps.
   - Quench `sr2e.vr2-frames`: write, load and upload a dumb frame; command an attack; IC kills the frame; logoff crashes
     it; smart frame initiative; decoy redirect; SK allocation; Limit:frame.

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
- **Unread pages:** Null operation (p.117) not read yet; Decoy (p.112) is read.
- **Gaps in the book:**
  - It doesn't say whether a dumb frame takes damage from black IC's lethal effects. Plan: as an icon, no biofeedback.
  - Smart frame action economy: "its own actions", so it uses the same action types as a decker. Assumed.
- **Concurrency:** a frame actor created by the GM client for a player's upload, and its crash on logoff through the
  sequencer, so a logoff on one device and a command on another can't race.
- **Scale:** many frames on a host make many combatants. Fine for table scale.

## Questions for the user (to settle before Codex)
1. Phasing: 6a/6b/6c as separate releases, or everything in one?
2. Should smart frames always appear in the combat tracker, or only when combat starts?
3. Command sets: worth automating (size + Control Test + hours card), or leave to the GM?

## Out of scope
- True AI (p.141–142: GM fiat).
- Otaku complex forms and sprites.
- Grid topology.
- Deck construction.
- Native-host master programs.
- Satellite links.
