# Plan: VR2.0 part 5b — utility options and programming
_Round 0 — initial draft by Claude_

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

### 1. Data (`ProgramData`)
- `options: ArrayField(SchemaField({ kind, rating }))`, `kind` from a fixed list, `rating` ≥ 1 for area,
  DINAB, skulk; `manufacturer` StringField (sensitive). Validated against the per-utility allow-list
  (`UTILITY_OPTIONS`, keyed by the program's identity: `utilityKindOf` / operational names /
  `CONFIG.SR2E.vr2SystemOperations` utilities) — an option not allowed is shown struck through and has no
  effect; chaser + penetration together: both inert, flagged.
- Derived (both directions, CLAUDE.md derived-state rule): `effectiveRatingOpt`, `size` (actual),
  `designSize`, `cost` = design size × the base rating's band. Without the setting, or with no options,
  size and cost are exactly today's (a regression test pins it).
- `dinab: { wear: [<loadGen>:<card>] }` style wear for the DINAB rating, current loadGen only (Swap Memory
  resets it), and `squeezed` derived from a per-loadGen `flags.sr2e.decompressed.<loadGen>`.

### 2. Pure rules (`module/rules/vr2-options.mjs`, Vitest)
`optionModifiers(base, options)`, `programSizes({ rating, multiplier, options })` → `{ effective, actual,
design }`, `optionsAllowed(kind)`, `areaTN(baseTN, targets)`, `defenseTN(defense, options)` (shield/shift
with chaser/penetration), `skulkTally(rating, skulk)`, `dinabDice(...)`, `programmingTask(...)` (design
size, base time, period from successes, per-day reduction incl. teams and tools), `teamLimits(...)`.
Book examples pinned: Attack-6M(Skulk-4) 300/60,000¥; Attack-6M(Limit: IC) 5²×3; Slow-4 Area-4 TN 4 and
cap; Selena's Attack-8S (design 256, base 512 days, 4 successes → 128, +1 → 98 days after 10 days, …
→ 3 days at the end, the worked example p.101–102); the team example (6,7,6 → 7; +3,+2,+3 → +5).

### 3. Option effects in play
- **Targeting:** −2 TN on attacks with that program.
- **Chaser / penetration:** the attack TN's shield/shift term uses `defenseTN`. Penetration also
  "defeats the shield defensive utility": a decker defending with the Shield utility gets no Shield Test
  against a penetration attack (Risks: reading).
- **Limit:** the attack dialog offers the program only against its one target type (decker/IC).
- **Area:** the attack dialog (decker attacker, area program) lets the decker tick up to Area Rating
  targets among the current user targets. One roll (the dice pool once) at the HIGHEST of the targets'
  TNs; each target gets its own attack card with `tn` = its own TN (+ number of targets) and
  `successes` = count of the test's die totals ≥ that TN, plus bought successes. `liveAtk` for an area
  card recomputes from the shared test (`dice[].total`) so Karma rerolls/buys flow to every card. Armor's
  +2 vs area: the resisting persona/IC carrying Armor gets +2 armor against an `area` card. The party-IC
  "area-effect" checkbox goes away when the setting is on (the area option is the source); stays as is
  when off.
- **One-shot:** after the program's test is rolled (attack or System Test), the copy is spent:
  `flags.sr2e.oneShot.<loadGen>: card` and it counts as unloaded-and-crashed until Swap Memory (new
  loadGen). Tar: a tar win on a one-shot utility crashes every one-shot copy of the same program key in
  active memory (existing `programKey`).
- **Skulk:** the crash choice's tally (+IC rating) becomes max(0, rating − Skulk) when the crashing card's
  program had Skulk (snapshotted on the card); Steamroller's tar crash too.
- **DINAB:** a "Run by DINAB" toggle in the System Test and attack dialogs for a program with DINAB: dice =
  DINAB rating (current, after wear), no Hacking Pool, labelled a Free Action. Failure (System Test lost
  to the host, attack with 0 successes, or the defender's resolution zeroing the damage) adds one DINAB
  wear (`flags.sr2e.dinabWear.<loadGen>_<card>`); all 1s crashes the program (`crashed: true`). DINAB at 0
  → the toggle disappears. Swap Memory (new loadGen) resets both.
- **Squeeze:** after a load or Swap Memory a squeezed program is "compressed": unusable (excluded by
  `usablePrograms`) until the decker clicks Decompress (Complex Action, no test) → the per-loadGen flag.
- **Sensitive:** a host `manufacturer` field; a sensitive program on a host of another manufacturer (both
  set) is unusable there (`usablePrograms` gets the host). Blank on either side = no restriction.

### 4. Programming
- A **Programming** dialog from a program's row (or a "New program" button on the Matrix tab): program
  name, base rating, multiplier/level, options, the programmer (default: this character; Computer or
  Software), tools (checkboxes from the p.102 table), team members (other characters, owner-selectable).
  It shows design size, base time, the cap checks (rating ≤ skill; team: size ≤ ⌊max ÷ 2⌋, rating ≤
  max + 1; mainframe SV ≥ ⌈rating ÷ 2⌉).
- **Start:** rolls the Computer (Program Rating) Test (Karma Pool usable), stores the task on the program
  item `flags.sr2e.programming = { baseTime, successes, period, done: 0, bonus, log: [] }`; 0 successes →
  "try again" (no task).
- **Work:** "Log days" (N days, current tools/team) → `done += N × (1 + bonus)` (team: the team rule),
  appended to `log` with the tools used, so a mid-task tool change (the worked example) counts right.
  `done ≥ period` → "complete": the program item becomes usable (until then it can't be loaded).
- Costs of tools/mainframe time are shown, not charged (GM's call; Award/purchase flows unchanged).

### 5. UI
- Program item sheet: an Options section (kind select + rating, allowed list, struck-through invalid),
  manufacturer, the derived actual/design size and price.
- Matrix tab program row: badges for DINAB (rating left), one-shot (spent), squeezed (Decompress button),
  programming progress.

### 6. Tests
- Vitest: `vr2-options.test.mjs` with the book examples above + allow-lists + chaser/penetration exclusivity.
- Quench `sr2e.vr2-options`: price/size on the sheet; targeting −2; penetration vs shield IC and vs a
  decker's Shield; area against two IC (one roll, two cards, different TNs, Karma reroll flows to both);
  one-shot spent and tar wiping copies; skulk tally; DINAB free run, degrade, all-1s crash, Swap restore;
  squeeze decompress; sensitive refused on another manufacturer's host; programming start → log → done.

## Key decisions & tradeoffs
- A world setting gates the whole optional rule; with it off, nothing changes (sizes, prices, dialogs).
- Area rolls ONCE at the highest TN and scores each card from the stored die totals, so Karma flows.
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
- **Programming suite:** the table says task bonus 5, the text says it "adds a +1 task bonus to the
  mainframe host bonus" (4 + 1 = 5): consistent, +5 total on a mainframe with a suite.
- DINAB's "fails a test" on a non-opposed test (e.g. a System Test is always opposed by the host): only
  the three listed failures count.
- Area against deckers on the log: each card is admitted separately (part 5a §0).
