# Plan: Cybertechnology Phase 4 — move-by-wire and reflex add-ons
_Round 6 — revised after Codex rounds 1–6 (log at the end). Follows docs/PLAN-cybertechnology.md (roadmap §Phase 4)
and Phase 3b (docs/PLAN-cybertechnology-phase3b.md, released in 0.112.0)._

## Goal
- Move-by-wire works as printed: its bonuses, its incompatibilities, and its
  complications (TLE-x, CCSS) with their treatment and recovery.
- The reaction enhancer's +6 cap is enforced.
- The reflex trigger switches wired reflexes on and off.
- The GM gets a tool for wired reflexes' jumpiness.

Identity comes from `wareRule` (Phase 3b), never names. Everything that changes an
outcome is GM-confirmed.

## Source (rendered pages, read 2026-10-22)
- **p.38:**
  - Reaction Enhancer: .3 Essence/point, max +6 for player characters; compatible
    with every Reaction/Initiative booster except move-by-wire and the adrenal pump.
  - Reflex Trigger: +.2 Essence, +13,000¥, installed only WITH wired reflexes
    (not after the fact). Turning wired reflexes on or off is a Simple Action.
- **p.39, move-by-wire:**
  - Level n: +n Quickness, +2n Reaction, +nD6 Initiative, +n dice for Athletics and
    Stealth tests;
  - "not compatible with any other Reaction/Initiative enhancing cyber- or bioware".
- **p.53, effects of wired reflexes (GM's discretion):**
  - in a perceived-threat situation, a Perception Test at +1 TN per +1D6 Initiative
    bonus;
  - the character may make a Willpower Test against the UNMODIFIED Perception TN to
    hold off reacting;
  - "use this rule sparingly".
- **pp.54–55, move-by-wire complications:**
  - **Test:** GM-made, at scheduled dates or after excessive stress, while no spell
    boosts the attributes.
    - Dice = ⌊(Body + Willpower) / 2⌋; magical bonuses don't apply. Cyber
      enhancement can add at most +2 to Body for this.
    - Frequency/TN by level: 1: 6 months, 3; 2: 4 months, 4; 3: 4 months, 5;
      4: 3 months, 6.
    - 2+ successes: no complication; 1: TLE-x; 0: CCSS, or CCSS and TLE-x, at the GM's
      discretion.
  - **TLE-x:**
    - in GM-deemed dangerous or crucial circumstances: +2 Perception TN, Initiative
      −2, Reaction −1D6;
    - −1 Charisma and Charisma-based skills in important social situations;
    - treatment: Biotech/Transimplant Surgery (8); a second occurrence (10); after
      that it's chronic and can't be corrected (the GM may lower social skills and
      Charisma);
    - chronic: on a Moderate-or-worse wound in combat or conflict, Willpower (6). On a
      failure the character collapses and takes 6M, becomes unconscious after
      10 × 1D6 Combat Turns, and stays out 10 × 1D6 minutes.
  - **CCSS:**
    - move-by-wire permanently dysfunctional; it must be removed;
    - untreated: an (unaugmented) Body (5) test every hour, or death;
    - treated: rehabilitation for (10 − unaugmented Body) weeks, minimum 5, intensive
      care, 50,000¥/week;
    - the physician's Biotech/Transimplant Surgery (10) test → the CCSS Recovery
      Table:
      - 6 → DL1: −1 Quickness and Willpower;
      - 4 → DL2: −1 Quickness, Intelligence and Willpower;
      - 2 → DL3: −1 Strength, Quickness and Willpower, −2 Intelligence;
      - 0 → DL4: −1 Strength, Quickness and Willpower, Intelligence 0;
    - only in an intensive-care unit.
- **p.56–57 (Phase 3b deferred these here):** adrenal pumps and suprathyroid glands
  "do not function" with move-by-wire. Synaptic accelerators combine only at Level 1,
  at triple cost, implanted simultaneously.

## User rulings (2026-10-22)
- **CCSS table:** round DOWN to a row: 6+ → DL1, 4–5 → DL2, 1–3 → DL3, 0 → DL4.
- **Incompatible combinations:** the pump and suprathyroid stop working with
  move-by-wire. Every other combination is warned (sheet + GM report), but its
  bonuses still count.
- **TLE-x:** recorded. The GM switches on an "episode" for a scene: Initiative −2 and
  Reaction −1D6 (rolled when switched on) apply until switched off. Perception +2 and
  social −1 are reminders.
- **Seizure damage:** 6M Stun, resisted with Body only (no armor).

## Approach

### 1. Identity (extends `ware-rules.mjs`)
`wareRule` already returns the module's `move-by-wire:N`, `wired-reflexes:N`,
`reflex-trigger` and `reaction-enhancer` flags. The source table adds:
- the core Wired Reflexes 1–3 (→ `wired-reflexes:N`);
- Cybertechnology's Boosted Reflexes 1–3 (→ `boosted-reflexes`);
- Shadowtech's Synaptic Accelerator (→ `synaptic-accelerator`).

`wareLevel(rule)` parses the trailing `:N`. A pure
`reactionEnhancers(rules)` classifies what counts as a Reaction/Initiative enhancer
for the move-by-wire warning: wired, boosted, reaction enhancer, synaptic
accelerator, adrenal pump, suprathyroid.

### 2. One fresh context per pass (R1 #10)
`_wareCyberInteractions` (the start of collection, Phase 3b) also builds `this.mbw` =
`{ itemId, level, working, conflicts[], reflexDice, wiredWorking }`, assigned fresh every
pass before anything reads it. It's derived only from the items and the persisted
CCSS record:
- **working:** installed, implants not failed, and the item is not the one CCSS
  disabled.
- The pump/suprathyroid efficiency (3b) gains `mbw: working` → 0.
- `reflexDice` = initiative dice from working cyber/bio ware.
- `wiredWorking` = a working, switched-on `wired-reflexes:*`.

Nothing from a previous pass is read.

### 3. Move-by-wire bonuses
- **The item's printed attributeMods are final.** The Phase 1 "provisional" values
  equal p.39 exactly, and this phase derives no second copy, so nothing is suppressed
  and there's no migration. The provisional flag stays, with a CLAUDE.md note.
- **Athletics/Stealth dice (R1 #11):** in `rollSkillTest`, AFTER the trained/defaulted
  rating and TN are resolved, add `mbw.level` dice when `mbw.working` and the skill
  key is athletics or stealth. That covers general, concentration, specialization and
  defaulted tests alike. It shows as "+N move-by-wire". Characters only.

### 4. Incompatibilities
- With `mbw.working`, pump and suprathyroid efficiency is 0. Source line: "Adrenal Pump
  (0%: move-by-wire)".
- Other enhancers (wired, boosted, reaction enhancer, synaptic accelerator) go into
  `mbw.conflicts`, shown on the sheet and in the report, and still count. A synaptic
  accelerator at rating 1 gets the note "Level 1 combines only at triple cost,
  implanted together".

### 5. Reaction enhancer cap
The Reaction from installed working `reaction-enhancer` items above 6 is subtracted
once in collection (source line "Reaction Enhancer cap (+6, p.38)"). Characters only.
The sheet warns.

### 6. Reflex trigger
- New CyberwareData `switchedOff` (Boolean, initial false; old documents get the
  initial).
- With an installed `reflex-trigger`, each `wired-reflexes:*` row gets an on/off
  toggle ("Simple Action, p.38"). Switched off, it contributes no attributeMods, and
  its Essence still counts.
- Without a trigger, `switchedOff` is ignored and the toggle hidden.

### 7. Reflex jumpiness (GM tool, p.53; R1 #19)
- The text covers "wired reflexes OR ANY OTHER kind of cybernetic reflex
  enhancement", so the button shows when `mbw.reflexDice > 0`, and the TN modifier is
  +1 per those dice. This reading is stated in the tooltip.
- A GM-only "Reflex check (p.53)" by Initiative prompts for the Perception base TN,
  then rolls Intelligence (Perception) at base + reflexDice, and Willpower at base
  (hold off).
- Both are posted; nothing is applied.

### 8. Complications: an append-only event log (setting `mbwComplications`, default ON)
**The model (R2 #1–#6, #8, #12),** the same pattern as the substance ledger
(CLAUDE.md: "append-only event log, folded by pure functions; never store derived
state").
- Every complication fact is ONE immutable event record: a hidden, disabled, change-less
  ActiveEffect on the actor (world or token) with a DETERMINISTIC id
  (`claimId(key)`) and `flags.sr2e.claim = { key, durable: true, mbw: <payload> }`.
- Creating it is atomic. The server rejects a second create of the same id, so a
  duplicate click, a second GM, a reload or an old card can never record an event
  twice.
- Every record carries `at = game.time.serverTime` (server-synced). The fold orders
  by (at, key): a deterministic order (R3 #4).
- Records are never updated or deleted. **Undo is a `void` record** (key
  `mbw:void:<key>`), and the fold ignores a voided record and everything that depends
  on it (R3 #6). Keys are never reused, because nothing is deleted.
- Only GM-made records can be voided: tests, outcomes, treatments, episodes, seizure
  results and recoveries. The system-made `install`/`remove` lifecycle records can't
  (R4 #8), so the fold always has at most one open generation.
- **Voiding has no external effect:** voiding a seizure result doesn't heal (the card
  says so), and payment is manual (below).
- `pruneMarkers` keeps every `durable` claim (R2 #2). Code that already excludes
  claim markers (`markerOf`) therefore excludes these too, and no tests count them.

**Event types and keys** (`gen` = the schedule generation):
- `install`, key `mbw:install:<itemId>:<k>`: `{ itemId, level, since }`. k counts
  that item's earlier install records (never deleted, so never reused).
- `remove`, key `mbw:remove:<installKey>`: written when that implant stops being the
  character's move-by-wire: uninstalled, deleted, relevelled, or disabled by CCSS.
  - A temporary implant FAILURE (Kamikaze) doesn't close the generation: the implant
    is still there, so the clock runs on (R5 #4).
  - **Generation semantics:** a generation is a period in which reconciliation
    observed the same (itemId, level). A flicker shorter than the debounce window
    (uninstall → reinstall, level 1 → 2 → 1 before it runs) is deliberately the SAME
    generation: it's GM fiddling, not a new implant. A change that persists past the
    window is a new one. Decided and tested (R5 #4).
- **The current generation** = the install record with no remove record (R3 #3).
  Reconciliation keeps at most one open: a reinstall, a level round-trip, or a
  replacement each removes the old record and installs a new one.
- `test`, key `mbw:test:<gen>:<n>:<attempt>` (scheduled) or
  `mbw:test:manual:<randomId>`: `{ gen, n, attempt, dice, tn, successes, rolls }`.
  - Slot n is consumed by its latest NON-VOID attempt. Voiding an attempt frees the
    slot, and the next roll is attempt + 1 (R5 #3).
  - Attempt numbers are never reused, because nothing is deleted.
  - Outcomes reference the attempt key.
  - The roll is made locally and recorded in the SAME create. Recording IS
    consumption (R2 #6). A lost race discards the local roll ("already rolled by …").
  - A crash before the create leaves the test pending, and the GM rolls again.
- `outcome`, key `mbw:outcome:<testKey>`: `{ test, result: tle | ccss | both | none }`.
  There is one per test, and the first choice wins.
- `tleTreatment`, key `mbw:tle-treat:<occurrence>:<attempt>`: `{ occurrence, tn,
  success }`. It names the occurrence (outcome key) it treats, so a late treatment
  can't clear a later occurrence (R3 #4).
- `episode`, key `mbw:episode:<randomId>`: `{ on, reactionLoss, occurrence, chronic }`.
  An "on" names the untreated occurrence it belongs to, or `chronic: true` (R5 #2).
- `seizure`, key `mbw:seizure:<damageReceipt>`: `{ boxes }`; then
  `seizureResult`, key `mbw:seizure-result:<seizureKey>`: `{ willpower, resisted,
  stun, turns, minutes }`. It's recorded BEFORE any damage (R3 #1).
- `ccssTreatment` / `ccssRecovery`, keys `mbw:ccss-…:<incidentKey>` (one each per
  incident): `{ weeks, cost }` / `{ physicianSuccesses, row }`.

**Prerequisites (R3 #5, R4 #2)** have two layers:
- **Admission** (time and installation eligibility) is checked once, immediately
  before the create, against the state at that moment. The fold NEVER re-checks it,
  so a test whose generation later closed (because CCSS closed it, or the implant
  failed) or a rewind never erases history.
- **Structural dependencies** (the record it names exists and isn't void) are
  checked by both.

The rules:
- a scheduled test needs its generation open and n ≤ due(now), so a click after a
  rewind is refused;
- an outcome needs its test;
- a treatment needs an un-treated occurrence;
- a recovery needs that incident's treatment;
- a seizure result needs its seizure;
- an episode needs active or chronic TLE-x.

**Rolls without side effects (R3 #9):** event rolls use `SR2ESuccessRoll.successTest`
directly (no chat, no pools, no Karma). The winner's record is created first, and only
then is the card posted FROM the stored record. A losing local roll is never shown.

**The fold** (pure, `mbw-rules.mjs` → `foldMbw(events, now)`) derives everything:
- the current generation: the one `install` with no `remove` (R4 #3);
- `dueSlots = ⌊(now − since) / period⌋`;
- `pendingSlots` = the slot numbers 1..dueSlots with no valid (non-void) attempt
  (R6 #2). It's a SET, not a count difference: a voided slot is pending again, and a
  replacement attempt fills only its own slot. Rewinding lowers dueSlots, and
  recorded tests stay. "N tests due" = |pendingSlots|, and the next roll takes the
  lowest pending slot;
- TLE-x occurrences = non-void outcomes with tle/both, numbered in (at, key) order;
- `chronic` = occurrences ≥ 3;
- `active` = any occurrence with no successful treatment REFERENCING IT (R4 #5);
- the treatment TN by occurrence (8 / 10);
- the episode = the latest episode event, valid only while ITS occurrence is
  untreated (or it's a chronic episode and TLE-x is still chronic).
  - A treated occurrence permanently expires its episode: a later occurrence never
    resurrects it, and needs a new "on" (R5 #2).
  - Tested: episode → successful treatment → new occurrence → no episode.
- CCSS INCIDENTS, one per ccss/both outcome, each with its implant item id and
  state (untreated → treating → recovered) from its own records (R2 #8);
- disabled implant ids = every incident's item;
- permanent reductions = the sum of every non-void incident's recovery row, and DL4
  present → Intelligence 0;
- pending seizures (no result yet).

So counters are never overwritten (R2 #4), and a new implant B never revives or
forgets implant A.

**Permanent reductions are DERIVED, not written (R2 #12, R3 #7–#8):**
- They lower the NATURAL attribute. `_naturalAttribute(attr)` becomes
  max(1, naturalAttribute(…) − permanentLoss[attr]) (R4 #7), so the floor of 1 is in
  the natural path itself. They reach everything that reads natural ratings: the
  limb averages' natural positions, the Quickness/Strength caps, the Body Index cap,
  the complication dice. Tested with repeated recoveries on low attributes.
- DL4's "Intelligence level 0" is the one explicit exception: after
  `_calculateAttributeValues` and before Reaction or anything that reads Intelligence,
  `intelligence.value = 0`.
- Source line: "CCSS (permanent)".
- Nothing touches base attributes, so there's no stale preview and no double
  application; undo = void the recovery record.
- Tested with four cyberlimbs: reduced Quickness lowers the natural positions and
  the cap.

**Writers:** a click handler creates exactly one record (a GM user, a character actor
by full UUID). The active GM's reconciliation creates `install`/`remove` records only.
No other state exists.

**Reconciliation (no writes in preparation):**
- **Where:** on the ACTIVE GM, debounced per actor. Triggers:
  - `ready`, `updateWorldTime`, the setting's change, user connect/disconnect (GM
    handover), `canvasReady`;
  - create/update/delete of ANY item, `updateActor` (the substance state that fails
    implants lives there), and create/delete of ActiveEffects (the mbw records, CCSS
    included) on a character (R4 #4).
- **Scope:** world characters, plus the unlinked character tokens on EVERY scene,
  iterated from `game.scenes` (no canvas needed) and deduplicated by actor UUID.
- **What it does:** it compares the INSTALLED, non-CCSS-disabled move-by-wire's
  (itemId, level), regardless of temporary failure (R6 #1), with the open
  generation. If they differ, it creates `remove` for the open one (if any), THEN `install` for
  the installed, non-CCSS-disabled one (if any).
  - If it's interrupted between the two creates, the next reconciliation finds no
    open generation and just installs.
  - Both keys are deterministic, so a repeat is a no-op.
- **Notices (R2 #14):** when `pendingScheduled` becomes > 0 for a generation, ONE
  summary card "N complication tests due" is posted. It's guarded by
  `once(actor, "mbw-notice:<gen>:<tests done>")`, a normal prunable claim, so a jump
  of years makes one card, not thousands. Individual tests are recorded only when
  rolled.

**The test (R1 #12):**
- dice = ⌊(B + W) / 2⌋ from a provenance snapshot taken in collection:
  - B = natural Body + min(2, Body from working cyber and bio ware, incl. limb
    pairs);
  - W = natural Willpower (already permanent-reduced, R4 #6) + Willpower from working
    ware (after pump efficiency).

  No adept powers, no Active Effects.

**TLE-x episode effects:**
- `reactionLoss` is subtracted inside the FINAL Reaction computation, before its
  non-negative clamp, after both the normal and rigging branches (R2 #11).
- `_getInitiativeParts` subtracts 2 from the base in the ordinary and rigging modes
  (not Matrix/astral). The sheet's Initiative display uses the same parts.

**Seizures (R2 #7):**
- `commitDamage` gains an optional `receipt` (a random id the caller passes) and
  returns the boxes that LANDED.
- The character damage path, when the landed boxes are ≥ 3 and the target has chronic
  TLE-x, creates the `seizure` record AFTER the damage queue resolves (outside it).
  The seizure's own damage is committed with `source: "seizure"` and is skipped.
- **Accepted limit (recorded):** if the client closes between the damage write and
  the record, that prompt is lost, and the sheet's always-present "Seizure check"
  button (chronic only) is the fallback. The record write can't be atomic with a
  monitor update across documents, and the rule is GM-confirmed anyway.
- **Resolution (R3 #1):**
  - The Willpower (6) test and, on a failure, the Body-only resistance (no armor or
    pools, TN 6, staging 6M by successes / 2) and the 10 × 1D6 turns and minutes
    are ALL rolled side-effect-free and recorded in one `seizureResult` create. The
    winner owns the numbers.
  - Only then is the damage applied, admitted ONCE across clients by
    `once(actor, "<resultKey>:apply")` (server-arbitrated, R4 #1), then
    `commitDamage(actor, "stun", boxes, { extra: { "flags.sr2e.mbwApplied.<resultKey>": true }, skipIf: () => applied })`.
    The receipt lands in the same update as the monitor; `skipIf` covers a local
    retry.
  - **Recovery (R5 #1):** a claim with no receipt shows on the sheet as "claimed,
    damage not applied". **Apply anyway** appears only once the claim is older than
    the existing stuck threshold (`STUCK_MS`, the same precaution as force-finishing
    a stuck dose), and makes the same receipt-guarded call.
    - **Documented risk:** if the original holder was only PAUSED past that threshold
      and then resumes, both can pass the local receipt check, and the damage lands
      twice. The GM can then heal the extra.
    - Tested: a holder resuming after an override.
  - The seizure's own damage passes `source: "seizure"` and never re-prompts.

**CCSS:** the banner per un-recovered incident shows:
- **Hourly survival: Body (5)** with natural Body (posted, not recorded);
- **Begin treatment** (`ccssTreatment`: weeks = max(5, 10 − natural Body),
  50,000¥/week);
- **Payment is manual (R3 #2):** the card shows weeks × 50,000¥, and the GM adjusts
  nuyen. No automatic charge, so there's no uncertain money state;
- **Recovery** (`ccssRecovery`, the row per the user ruling);
- **Remove move-by-wire.**

### 9. NPCs and synthetic actors
- NPCs: none of §3–§8.
- Token characters: §3–§7 work (per-actor preparation).
- §8: the manual buttons and every card resolve the token actor by UUID (R1 #20).
  Reconciliation covers world characters and the unlinked character tokens on EVERY
  scene, as §8 says (R3 #10).

### 10. Report-only migration (0.113.0)
Lists:
- characters with move-by-wire plus other enhancers, including pumps that stop;
- Reaction Enhancer totals above +6;
- wired reflexes that a trigger can now switch off.

Nothing is written.

### 11. Tests (R1 #21)
- **Vitest:**
  - `wareLevel`, period/TN, `pendingScheduled` (jump, rewind, replacement);
  - the complication dice snapshot (cyber cap, no AE, natural with racial);
  - result → proposal;
  - TLE-x transitions by occurrence;
  - the CCSS rows for 0–7;
  - rehab weeks/cost;
  - `foldMbw` over hand-built logs (generations, jump/rewind, relevel/reinstall,
    competing events, treatment ending an episode, two incidents A then B);
  - the DL4 override with racial Intelligence;
  - the enhancer cap;
  - the seizure staging (6M, successes → level).
- **Quench** (twice prepared):
  - the Athletics/Stealth dice, including a defaulted test;
  - pump 0% with move-by-wire;
  - wired reflexes + move-by-wire reported;
  - the +6 cap;
  - trigger off/on and the hidden toggle;
  - the schedule: advance time past two periods → "2 due", ONE card per event even
    with the reconcile run twice; rewind → refused; replace the implant → a fresh
    clock;
  - a stale card's second click refused (the duplicate id);
  - two distinct manual tests at once both record, and the occurrences fold to 2;
  - a drug-ledger prune leaves the durable records;
  - a crash simulation: a local roll whose create is rejected is discarded;
  - two concurrent seizure applications: one claim wins and one monitor update lands;
  - CCSS closing its own generation keeps the test, the outcome and the incident;
  - implant failure → recovery with no time advance keeps the generation (no records);
  - a late treatment of occurrence 1 doesn't clear occurrence 2;
  - void rules: lifecycle records refuse a void, and voiding an outcome drops its
    incident;
  - voiding a scheduled attempt frees its slot for attempt 2;
  - with slot 1 voided and slot 2 recorded, slot 1 is pending (also after a rewind to
    between the two);
  - a round trip inside the debounce window is the same generation, and past it a new
    one;
  - Kamikaze failure doesn't close the generation;
  - Apply TLE-x, then an episode on/off moves rolled initiative (via
    `_getInitiativeParts`) and Reaction, and reverts;
  - a chronic 3-box commit prompts, a 2-box commit doesn't, and the seizure's own
    damage doesn't re-prompt;
  - CCSS stops the bonuses; a new implant works; recovery applied twice writes once;
    DL4 with a racial Intelligence bonus shows 0;
  - the setting off: no prompts;
  - an NPC untouched;
  - a token character's manual test resolves the token actor.

## Key decisions & tradeoffs
- **Printed move-by-wire mods are final.** That beats deriving and suppressing an
  identical number.
- **The clock prompts and never applies;** every outcome is a GM click. That matches
  the roadmap's GM-confirmed policy.
- **30-day months.**
- **Episode effects are derived from a flag, not an Active Effect,** so they can't
  outlive the toggle.
- **An append-only event log of deterministic-id records:** server-arbitrated
  uniqueness with no overwrite races. Derived state is never stored, and permanent
  reductions are derived, not written. No GM-authority relay is needed (the system
  removed its socket relay as unreliable).

## Risks / open questions
- The world-time hook fires for every time change. The scan is O(characters), cheap,
  and runs on the active GM only.
- **The seizure prompt can be lost** if the client closes between the damage write and
  the record. The sheet button is the fallback.

## Out of scope
- Cyberware damage and secondary effects (Phase 5).
- The GM lowering social skills for chronic TLE-x (by hand).
- Synaptic accelerator triple pricing (a note only).
- Calendaria-aware months.

## Review log
- **Codex R1 (REVISE), 21 points, all accepted.** The complications became an event
  model:
  - stable event ids;
  - `once()` claims per action;
  - revalidation inside the claim;
  - the sheet as the durable panel;
  - reconciliation on the active GM, never in preparation;
  - per-implant clocks with jump/rewind policies.

  Also:
  - a fresh per-pass context;
  - dice after defaulting;
  - initiative in `_getInitiativeParts`;
  - a Body-only seizure resistance with a non-reentrant marker on LANDED damage;
  - CCSS states and receipts;
  - DL4 as a derived override;
  - occurrence-based TLE-x;
  - jumpiness for "any cybernetic reflex enhancement" as printed;
  - token actors by UUID;
  - many more tests.
- **Codex R2 (REVISE), 15 points:** the mutable record is replaced by an
  append-only log of deterministic-id event records, folded purely. That resolves:
  - #1, #3, #4, #6: recording is the transaction, and counters are derived;
  - #2: durable records are kept by pruning;
  - #5: per-implant generations;
  - #8: CCSS incidents;
  - #9, #12: reductions derived right after attributes;
  - #10: treatment ends the episode in the fold;
  - #11: inside the Reaction clamp;
  - #13: all scenes plus `canvasReady`;
  - #14: one summary notice;
  - #15: interleaving/failure tests;
  - #7: a damage receipt and landed boxes, with the cross-document atomicity limit
    accepted, documented, and backed by a sheet fallback.
- **Codex R3 (REVISE), 10 points, all accepted:**
  - the seizure result is recorded before damage, and damage goes through
    `commitDamage`'s same-update receipt and `skipIf` (idempotent, with a sheet
    "Apply" recovery);
  - payment is manual;
  - install/remove records give explicit generations;
  - (serverTime, key) ordering, and treatments reference their occurrence;
  - prerequisites are checked at create and in the fold;
  - void records instead of deletion;
  - reductions go through the natural-attribute path (limb averages and caps follow)
    with the value floor, and DL4 is the explicit Intelligence exception;
  - side-effect-free event rolls;
  - §9 now covers all scenes.
- **Codex R4 (REVISE), 9 points, all accepted:**
  - a `once` admission before seizure damage, with an "Apply anyway" override;
  - admission checked at record time only;
  - install/remove everywhere;
  - reconciliation on item, actor and effect changes;
  - occurrence-referenced treatment;
  - no double Willpower reduction;
  - a floor in the natural path;
  - lifecycle records can't be voided;
  - the matching tests.
- **Codex R5 (REVISE), 4 points, all accepted:**
  - the "Apply anyway" override waits for `STUCK_MS`, with the paused-holder risk
    documented;
  - episodes reference their occurrence and expire with its treatment;
  - scheduled slots vs attempts;
  - generation semantics: (itemId, level) with sub-window flicker ignored and failure
    not closing it, decided and tested.
- **Codex R6 (REVISE), 2 points, both accepted:** reconciliation follows the
  installed implant, not its working state; pending scheduled tests are a set of slots
  with no valid attempt.
