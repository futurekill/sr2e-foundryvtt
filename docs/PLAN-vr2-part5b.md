# Plan: VR2.0 part 5b — utility options and programming
_Round 1 — revised after Codex round 1_

## Goal
VR2.0's optional rule "Utility Options" (book pp.102–104) and the programming rules (pp.100–102) under
`matrixRuleset: "vr2"`: options on utility programs with their size, design size and price, every option's
effect in play, and a programming task (design time, the Computer test, tools, teams) that tracks progress.
Gated by a new world setting `vr2UtilityOptions` (the book: "gamemasters may introduce only specific
utility options"; default off), so tables that don't want options see nothing new.

## Out of scope
- Frames and SKs (p.105, AI chapter) — DINAB on frames, frame cores (their size rules are on p.105).
- Command sets (p.104). Programming persona/deck programs (MPCP etc. follow Cyberdecks, p.81) — the
  programming task covers utilities only; the 1.5× skill cap for MPCP/frame cores is stated, not modelled.
- Buying machine time in a corp's virtual machine (flavour), stealing time on a host (a Validate
  Passcode run, already playable by hand).

## Rules (110 dpi renders; PDF = book + 8)
- **Which options a utility may carry** (each utility's entry, pp.96–100):
  - every operational utility (Analyze … Validate): DINAB, one-shot, optimization, squeeze (p.96);
  - Attack: area, chaser, DINAB, limit, one-shot, optimization, penetration, stealth, targeting;
  - Black Hammer, Killjoy: one-shot, optimization, targeting; Hog: DINAB, one-shot, optimization, targeting;
  - Poison, Restrict, Reveal, Slow: area, DINAB, one-shot, optimization, targeting;
  - Steamroller: DINAB, one-shot, optimization, targeting;
  - Armor, Shield: optimization; Camo, Cloak, Lock-On: one-shot, optimization; Medic: DINAB, optimization;
    Restore: DINAB, one-shot, optimization; special utilities (Compressor, Sleaze, Track): none listed.
  - "stealth" in Attack's list is the **Skulk** option (its rating modifier is "+Stealth Rating", p.104).
- **Sizes (p.103).** Actual size = what the program occupies on a deck; design size = what governs base
  time AND price. Rating modifiers change the effective rating, applied BEFORE percentage changes; the size
  is then (effective rating)² × multiplier; percentages apply sequentially. Effective rating below 1 → 1.
  Rating modifiers don't count against the programmer's cap and don't change the programming TN.
  An option with a rating can't exceed the program's base rating.
- **Price (p.103):** base rating's per-Mp band × DESIGN size. "Attack-6M(Skulk-4): effective Rating 10,
  design size 300 Mp, 60,000¥" (300 × 200, the 4–6 band).
- **The options (pp.103–104):**
  - **Area** (+Area Rating): engage up to Area Rating targets with ONE Attack Test; each target's TN
    rises by the number of targets. Armor gets +2 against area attacks (personas and IC carrying it).
  - **Chaser** (+1): negates the +2 TN against IC with the shift defense; adds +2 against IC with shield.
    Not with penetration.
  - **DINAB** (+DINAB Rating): a built-in Computer Skill = the DINAB rating; on any of his actions the
    decker may spend a Free Action and the utility runs itself (one operation per utility per action; he
    can't also use it himself that phase). Degrades 1 point each time it FAILS: defeated in a System Test
    opposed by the host, misses in cybercombat, or the target reduces its damage to zero. All 1s → the
    program crashes; Swap Memory restores the degraded option and crashed programs. The decker may
    override and use his own skill (normal action cost).
  - **Limit** (−1): one target type only (deckers, IC programs, frames, SKs); useless against others.
  - **One-shot** (special): runs once and vanishes; Swap Memory reloads. Actual size −75%, design +50%.
    A tar program trashing a one-shot utility wipes ALL copies in active memory.
  - **Optimization** (special): actual −50%, design +100%.
  - **Penetration** (+1): defeats the shield defensive utility; against IC with shift it suffers +2 TN,
    in addition to shift's own +2. Not with chaser.
  - **Sensitive** (special): works only on one manufacturer's mainframes; actual −75%, design +50%;
    programming it uses the average of Computer and Computer Theory (or Matrix Theory).
  - **Skulk** (+Stealth Rating): crashing IC with it reduces the tally increase by the Skulk rating.
  - **Squeeze** (+1, DESIGN size only): self-compressed; actual size −50% for uploading; a Complex Action
    to decompress before use (no test); with Compressor too: −75%, two decompressions.
  - **Targeting** (+2): −2 TN for attacks.
- **Programming (pp.100–102).** Base time = design size × 2 days. Computer (Program Rating) Test — the
  base rating, not option changes; Software concentration / Matrix Programming specialization may stand
  in — successes divide the base time → the task period in days (0 successes: the task fails this try).
  Each day of work reduces the period by 1 + task bonus. Tools (p.102 table): double required memory +1,
  programming kit +1 (1,500¥), shop +2 (15,000¥; doubles memory), mainframe +4 (100 × SV ¥/day; SV ≥
  half the program's rating), mainframe programming suite +1 more (5 in the table, "adds +1" in the text
  — see Risks). Ratings: a program's base rating ≤ the programmer's skill. Teams: up to ⌊highest
  Computer ÷ 2⌋ members; max rating = highest skill + 1; the test uses the team's average skill (round
  up); team bonus = Σ members' bonuses − the number of programmers; each team day reduces the period by
  (bonus) days, or by 1 per member without bonuses.

## Approach
_Round 1 revision: Codex round 1 (19 findings) folded in; see the REVIEW-LOG._

### 0. One identity, one use lifecycle
- **Identity:** `utilityIdentity(item)` (vr2.mjs) = `utilityKindOf` (blackHammer, killjoy, track, hog, slow,
  steamroller) || `offenseOf` (poison, restrict, reveal) || the name prefix of the remaining utilities.
  `UTILITY_OPTIONS` is re-keyed to exactly those ids (camelCase, `readWrite`, `lockOn`), so combat, the
  allow-lists, pricing and programming all ask the same function (R1 #12).
- **Two program sets:** `usablePrograms` stays as is (memory-resident copies: Hog's victims, wear, crashes;
  R1 #14). A new `activePrograms(actor)` = usable minus a compressed squeeze copy minus a sensitive copy whose
  manufacturer differs from the actor's live-session host (read from `liveSession(actor)`, so no caller passes
  a host). `bestUtility`/`loadedUtility` and the attack, System Test, maneuver, Restore and Medic pickers use
  `activePrograms`; Hog's tick (vr2ic.mjs:774) and the tar victim picker keep `usablePrograms`.
- **Use sites** (where a program "executes", for one-shot and DINAB; R1 #9): the attack (attacker's program),
  the System Test (its operational utility), Restore, Medic, Evaluate's run, and the PASSIVE reads made by a
  roll: Camo in a trace hunt, Cloak/Lock-On in a maneuver test (the roller's and the opponent's). One helper
  `spendUse(actor, item, useId)` is called at each, before the roll (below).

### 1. Data (`ProgramData`)
- `options: ArrayField(SchemaField({ kind: StringField(choices, blank: true), rating: NumberField(min 0),
  target: StringField(choices decker/ic/frame/sk, blank: true) }))` (Limit's target type, R1 #11);
  `manufacturer: StringField(blank)`. Invalid entries are kept and shown struck through (`activeOptions`
  reports why); imported data never goes invalid. New fields default to empty: no migration.
- Sensitive is allowed on every utility (no entry lists it; its text speaks of "programs" in general —
  a reading, Risks).
- Derived each prepare, from scratch (derived-state rule): `optionSizes = programSizes(...)` → actual size,
  design size, price; inert entries' reasons. Without the setting, or with no options: exactly today's size and
  price (a regression test pins it).
- Pricing goes through the shared path (R1 #13): `itemBaseCost` takes `ctx.utility` and `ctx.utilityOptions`
  and prices from `programSizes(...).price`; its four callers (actor-sheet ×2, eye-accessories, sr2e.mjs
  repricing) pass them. `programSizes` multiplies all percentage factors and rounds ONCE (order-independent,
  R1 #19; a permutation test).

### 2. Pure rules (`module/rules/vr2-options.mjs`, Vitest — already written, amended)
As before plus: identity-keyed allow-lists, `limitAllows(option, targetType)`, round-once sizes, programming
caps (`programmingCap({ utility, skill, team })`: base ≤ skill, team ≤ highest + 1, Black Hammer/Killjoy
≤ ⌈skill ÷ 2⌉ (part 5's deferred cap; with a team, ⌈highest ÷ 2⌉ — the +1 doesn't lift it), R1 #16),
`sensitiveSkill(computer, theory)` = ⌈average⌉. Team work = `workDone(days, teamBonus)`: a team day is
1 + the team bonus (the book's +5 team → 6 days; no bonuses → 1 day) — the round-0 text "1 per member" was
my misreading; the book says 1 (p.102; R1 #17).

### 3. Option effects in play
- **Targeting:** −2 TN on attacks with that program.
- **Chaser / penetration:** the shield/shift TN term in `attackOnce` becomes `defenseTN(defense, kinds)`.
  Penetration also skips the defending decker's Shield utility test (`resistOnLog`/`resistAttribute` see
  `st.penetration`; snapshotted on the card).
- **Limit:** the attack dialog lists the program only against its target type; `attackOnce` re-checks.
  frame/sk targets don't exist yet → a Limit: frame/SK program is never offered (correct: useless).
- **Area (R1 #1–#5), on the area-spell precedent (item.mjs `areaCast`):**
  - The dialog lets the decker tick up to Area Rating targets among the user's targets. Per target, the TN is
    built exactly as today's single-target TN (maneuver state, parry, party, `defenseTN`) + the number of
    targets; position bonuses and parries are spent per target as today.
  - ONE `rollSuccessTest` at the lowest of those TNs with `areaCast: true`: the existing card already refuses
    post-roll Karma rerolls and bought successes on such a roll (GM adjudication) — so the roll is frozen the
    moment it lands; Avoid an Oops still works (all 1s is all 1s). Karma dice bought BEFORE the roll still work.
  - Per target: `tn_i + castDelta` (castDelta = the roll's final TN − its dialog TN: wounds, sustaining…, as
    area spells do; R1 #4), `successes = successesAtTN(dice, tn)`, frozen on the card as `areaSuccesses`.
  - All target cards are created in ONE `ChatMessage.createDocuments([...])` call (no half-posted attack;
    R1 #5); deckers on the log get their `attack` request per card exactly as single attacks do (part 5a §0
    discovery covers a card whose request was lost).
  - One accessor `attackSuccesses(st)` (vr2.mjs, exported): `st.areaSuccesses ?? live test total`. EVERY
    reader moves to it: `liveAtk`, `freezeSuccesses`, `advanceExit`, vr2ic.mjs:313/722/747/1357 (R1 #1).
  - Armor +2 vs area: `resistOnLog`/IC armor read `st.area`. The old party-IC "area-effect" checkbox is
    hidden when the setting is on (the option is the source); unchanged when off.
- **One-shot (R1 #6, #10; R2 #1):** `spendUse` records `recordEvent(actor, "oneshot:<itemId>:<loadGen>")` BEFORE
  the roll; losing it refuses the use ("already fired"). That record is DURABLE (never pruned, unlike `once`
  markers, which go after 24 h) and IS the spent record:
  `programUnusable` treats a one-shot item with that marker for its current loadGen as spent. A disconnect
  after the claim = the copy is spent (it executed). Tar: the tar fact gains `victims: [{itemId, loadGen}]` —
  every one-shot copy with the same `programKey` usable at fact time — and `reconcileTarFact` crashes exactly
  those (a copy loaded later is untouched).
- **Skulk:** the crash choice's tally (+IC rating) becomes `skulkTally(rating, skulk)`, Skulk snapshotted on
  the card at the roll; Steamroller's tar crash too.
- **DINAB (R1 #7, #8):**
  - A "Run by DINAB" toggle at the active use sites (attack, System Test, Restore, Medic). Dice: the DINAB rating
    left replaces Computer in a System Test; an attack, Restore and Medic keep the program's own rating ("a test
    with his offensive utility program", p.123). Always no Hacking Pool and no Karma Pool (the program, not the
    character, makes the test — a reading, Risks); a Free Action.
  - Phase rule (R2 #2, #3): in combat, the phase is the combat's monotonic `phaseSeq` (engagement.mjs), not
    round:turn, which repeats when initiative passes re-sort. ONE marker per program per phase,
    `once(actor, "phaseuse:<itemId>:<combatId>:<phaseSeq>", {mode: "own"|"dinab"})`: the server takes the first,
    so the decker's own run and the DINAB run can't both win on different devices; a DINAB loses to any existing
    marker, an own use loses only to a DINAB one, and an unseen winner (another device, not replicated yet)
    refuses with "try again". Out of combat: no phase limit.
  - One outcome per use, key `<loadGen>_<useId>` in `flags.sr2e.dinabWear` (distinct keys only, never an
    array): System Test lost to the host, or an attack with 0 successes → at the roll (no Karma, so final);
    the defender's resolution leaving no effect (damage staged to 0, Hog 0 points, Slow 0 actions, attribute
    0) → written by the resolving client. Area: the same key per use, so at most one point per use.
  - All 1s → a crash fact `recordEvent(actor, "dinabcrash:<itemId>:<loadGen>:<useId>", {type: "crash",
    programId, loadGen})` on the CAPTURED loadGen, so a late write never crashes a fresh Swap Memory copy.
  - DINAB left = rating − wear of the current loadGen; Swap Memory (new loadGen) restores both.
- **Squeeze (R1 #18):** one decompression. A squeezed copy is compressed until
  `flags.sr2e.decompressed === loadGen`; an item `preUpdate` deletes the flag when `loaded` goes false, and
  Swap Memory's new loadGen leaves it stale — both make it compressed again. "Decompress" (Complex Action,
  no test) on the program row. Compressor-uploaded copies (two decompressions) need an upload mechanic the
  system doesn't have: out of scope.
- **Sensitive:** host `manufacturer` field; blank on either side = no restriction; `activePrograms` filters.

### 4. Programming (R1 #15)
- A **Programming** dialog from a program's row: base rating, multiplier, options, the programmer
  (Computer, or Software/Matrix Programming; Sensitive: `sensitiveSkill`), tools, team members. Shows design
  size, base time, every cap from `programmingCap` (refuses to start over a cap) and mainframe adequacy.
- **Start:** rolls Computer (Program Rating) (Karma usable) and stores `flags.sr2e.programming = { taskId,
  testMessageId, design: { rating, multiplier, options, designSize }, baseTime }`.
- **First Log days** freezes the period: successes read from the test, then a log chat message carrying
  `closesTests: [testMessageId]` (no Karma after work starts). 0 successes → the task is void ("try again").
- **Work:** each Log days writes a new key `flags.sr2e.programming.log.<randomId> = { days, bonus }`
  (no read-modify-write; concurrent logs both land). `done` is derived (Σ days × (1 + bonus)).
- **Complete** when done ≥ period: refused if the item's design (rating/multiplier/options) no longer matches
  the task's snapshot ("the design changed: start a new task"); the sheet shows the design fields read-only
  while a task is open. Until complete the program can't be loaded.
- Tool and mainframe costs are shown, not charged.

### 5. UI
- Program item sheet: Options (kind select, rating, Limit target; struck-through invalid with reason),
  manufacturer, derived actual/design size and price. Host sheet: manufacturer.
- Matrix tab row badges: DINAB left, one-shot spent, compressed (Decompress), programming progress.

### 6. Tests
- Vitest `vr2-options.test.mjs`: book examples + identity-keyed allow-lists + chaser/penetration + Limit
  target + permutation-invariant sizes + caps (black hammer half, team) + team days (+5 → 6, none → 1).
- Quench `sr2e.vr2-options` (all fixtures scoped, no world-wide ops): price/size on the sheet and in
  `itemBaseCost`; targeting −2; penetration vs shield IC, vs shift IC (+4), vs a decker's Shield; area vs two
  IC (one roll, two cards, per-target successes incl. castDelta, Karma reroll refused, `freezeSuccesses` uses
  the card's count); one-shot spent + a second use refused + tar wiping only the captured copies; skulk tally;
  DINAB free run, failure wear once per use, all-1s crash bound to the old loadGen, Swap restore, phase claim;
  squeeze decompress and re-compress on unload; sensitive refused on another maker's host while Hog still
  sees the copy; programming start → log (two logs) → design-change refusal → complete.

## Key decisions & tradeoffs
- A world setting gates the whole optional rule; with it off, nothing changes (sizes, prices, dialogs).
- Area rolls ONCE at the LOWEST target TN (`areaCast`: post-roll Karma refused, GM adjudication as for area spells)
  and scores each card at its own TN; a card's count is frozen in `areaSuccesses` when there are other targets.
- Option allow-lists are enforced by inertness (shown, struck through), not refusal to save — imported
  data never becomes invalid.
- The programming task lives on the program item being written (unusable until complete), not a new
  item type.

## Decided by the user (2026-10-30)
- **Penetration defeats both shields:** IC with the shield defense lose their +2 TN, and a decker hit by a
  penetration attack gets no Shield utility test.
- **Penetration vs shift: +4 total** ("shield" in that sentence read as a typo for shift).
- **Own world setting, off by default** (`vr2UtilityOptions`).

## Risks / open questions
- **Tools that stack (p.101–102):** read as: PC tools and a mainframe never mix; a shop REPLACES a kit (+2, not
  +3) and its memory doubling earns the +1 only when ticked as doubled memory ("+3 (+1 doubled, +2 shop)");
  suite +1 on a mainframe. Implemented in `toolBonus`; the Selena example and the team example pass.
- **Rounding:** the task period (base ÷ successes) rounds up; percentage sizes round up (the book is silent).
- **Already built ahead of review (pure math only):** `module/rules/vr2-options.mjs` + `test/vr2-options.test.mjs`
  (12 tests from the book's examples). Everything that touches Foundry waits for approval.
- **Programming suite:** the table says task bonus 5, the text says it "adds a +1 task bonus to the
  mainframe host bonus" (4 + 1 = 5): consistent, +5 total on a mainframe with a suite.
- DINAB's "fails a test": only the three listed failures count; for non-damage effects "reduces its damage
  to zero" reads as "the resolution leaves no effect".
- DINAB tests use no Karma Pool or Hacking Pool (the program runs itself, not the decker).
- Area attacks: post-roll Karma rerolls/buys are GM adjudication, as for area spells (one roll, many TNs).
- Sensitive is allowed on any utility (no utility entry lists it).
- **Built (implementation notes):** DINAB's rating replaces Computer only in Computer tests (System Tests); the attack
  test is "a test with his offensive utility program" (p.123), so attacks, Restore and Medic keep the program's
  rating and lose only the pools. Restore/Medic DINAB runs degrade only on all 1s (none of the three listed failures
  applies). The design lock is a `preUpdateItem` refusal (with an Abandon button), not read-only inputs.
- Area against deckers on the log: each card is admitted separately (part 5a §0).
- **Round 2 fixes (2026-11-04):**
  - one-shot spends are durable records;
  - DINAB phases use `phaseSeq`, and one shared per-phase marker arbitrates own vs DINAB use;
  - Camo, Cloak and Lock-On give nothing when their one-shot spend is refused. Lock-On is bound to the copy whose
    rating set the TN (captured on the maneuver card, with the maneuverer's Evasion to recompute the TN without it);
  - System Tests judge Sensitive on the host being tested (`activePrograms(actor, host)`);
  - DINAB wear is written BEFORE the attack/hog/slow acknowledgements (it's idempotent per use);
  - programming:
    - the design (identity, category, offense, damage level, manufacturer, rating, multiplier, options) is captured
      before the dialog and re-checked before the task is written, and the lock covers the same fields;
    - work logs only into the task they were opened for (taskId re-checked);
    - the first log closes the test to Karma BEFORE writing the period;
    - a failed or abandoned task restores a program that was usable before it, else leaves it `unwritten`
      (unusable);
    - the Software concentration / Matrix Programming specialization roll where higher, with the caps still on
      Computer;
  - Area targets are deduplicated by actor uuid at validation (the dialog already did).
- **Round 3 (2026-11-04):**
  - programming state is `{ current, tasks: { [taskId]: … }, unwritten? }`, superseded in round 4 below;
  - the period is read AFTER the closure;
  - team size uses Computer;
  - a "Write a new program" button creates an unwritten project.
- **Rounds 4–5 (2026-11-04):** the programming lifecycle is durable records on the program item, folded by
  `foldProgramming` (rules/vr2-options.mjs):
  - `prog:new` is created WITH the item;
  - `prog:start:<n>` uses generation n, server-arbitrated and causal;
  - `prog:log:<n>:<id>`;
  - ONE `prog:frozen:<n>`;
  - ONE `prog:end:<n>`.

  The period is the closed test's LIVE successes, so Karma landing as it closed counts. No mutable programming state
  remains, and usability and failure are derived.
