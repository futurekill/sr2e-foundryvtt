# Plan: Cybertechnology Phase 6 — cybermancy
_Round 4 — revised after Codex rounds 1–4 (log at the end). Roadmap docs/PLAN-cybertechnology.md §Phase 6 and its
"One effective Essence" contract; Phase 5's GM-editable-state model._

## Goal
An OPTIONAL world rule (`cybermancy`, default OFF) lets a character survive below 0
Essence, via a GM-confirmed operation at a delta clinic, and lives with the book's
consequences. Every lethal or permanent outcome is a GM click. Periodic events (auto-med
refills, CDS tests) are PROMPTED on the game clock and never applied automatically.

## Source (rendered pages, read 2026-10-22)
- **p.78–80, ground rules:**
  - cybersurgery that takes Essence below 0 IS cybermancy, and only at delta clinics. The
    GM decides whether cybermancy exists at all, and characters can't START below 0;
  - the procedure installs an automatic-medication system (free). Refills cost
    15,000¥ every 10 days; if it runs out, the character dies immediately. A corp may
    discount refills 1D6 × 5%, or pay for them;
  - **Less Than Zero:** the doctor's Biotech test, at TN by INTENDED Essence (the
    Cybersurgery/Cybermancy Survival Table: −.05 to −.50 → 4, −.55 to −1.0 → 6, … +2 per
    further .5, no lower limit);
  - every operation installs an IMS (.25 Essence, 137,750¥), counted in the intended
    Essence;
  - the Doctoring Table modifiers apply, except the −2 for intensive care (delta clinics
    are intensive care);
  - the cybermantic ritual's Willpower magic does NOT apply to this test;
  - failure: the character dies, and no Karma can be spent on the doctor's test.
    Success: the doctor's successes modify the Essence cost as Cybersurgery p.53.
- **p.80, side effects:**
  - **Better Off Dead:** the Physical Damage Overflow (Body + 10) is halved, rounded up;
  - every time the character experiences Physical Damage Overflow and is healed or
    stabilized: Willpower vs 2 × overflow damage, or death. Karma may be spent, and
    cybermantic Willpower applies.
- **p.80–81, magic:**
  - +2 × |Essence| to the TN of any magical test made against him, healing included;
  - an astral presence like constant astral perception, without being able to sense
    astral space;
  - karma hazing (optional): a periodic Essence (4) test, treating Essence as positive
    and rounded up. Any success means something hostile takes an interest.
- **p.81–82, Reaction/Perception:**
  - +1 to surprise Reaction Tests per point of negative Essence or part;
  - +2 to all Perception Tests per point or part. When deliberately searching:
    Willpower vs 3 × |Essence| (round up), each success −1 to that modifier;
  - **Lost in the Details:** all successes on a Perception Test at modified TN 5+ →
    lost. Willpower vs the Perception TN to break free, repeated each Combat Turn or
    minute at +1 TN each time. After 5 failures in a row the IMS kicks in, −1 TN per
    turn or minute. Others' attempts −1 TN each (Simple Actions in combat).
- **p.82, Willpower:**
  - −1 per half point of negative Essence or part;
  - the cybermantic magic restores up to 4 of those, never above the pre-cybermancy
    rating;
  - immune to any magic that increases Willpower (Increase Attribute);
  - the restoration can't be dispelled or grounded.
- **p.83, IMS:** no game effects (roleplaying).
- **p.83, social and Karma:**
  - +|Essence| (round up) to Charisma and social-skill TNs; below −2, the amount below −2
    counts double (−3 → +4; −3.5 → +5);
  - not when intentionally intimidating (interrogation), where the GM may even reduce
    the TN;
  - no magical compensation;
  - Karma is gained at HALF the usual rate;
  - Good Karma can't regain lost Essence.
- **p.83–84, CDS:**
  - periodic Willpower tests by the Chronic Dissociation Syndrome Table (Essence →
    frequency/TN): −.05 to −.50, every 6 months, 3; −.55 to −1.0, 6 months, 4; −1.05 to
    −1.5, 6 months, 5; −1.55 to −2.0, 4 months, 5; −2.05 to −2.5, 4 months, 6; −2.55 to
    −3.0, 3 months, 6; −3.05 to −3.5, 2 months, 6; −3.55 or lower, 2 months, 8 + 1 per
    further −.5;
  - cybermantic Willpower applies; other short-term magic doesn't;
  - **failure = CDS:** the character can't initiate actions, only react; +4 to
    Perception Tests and +3 to all other tests; dies in 3 + Willpower weeks;
  - **treatment** (delta clinic, the original ritual's magicians): the character's Spell
    Resistance (8) test. Success → the magic fails and the character dies. Failure → it
    reverses, and a Willpower (6) test shortens a 1-week recovery by 1 day a success.
    The TN drops by 1 each repeat (minimum 2).
- **p.84, cancer:**
  - at the operation, 2D6 < 2 × |intended Essence| → cancer (if he lives long
    enough);
  - GM options: +1 to the roll for unaugmented Body 4–7, +2 for 8+; +1 for symbiotes;
  - onset after 10D6 months; death 4 + 1D6 weeks later;
  - the GM decides when the player learns of it.

## Approach
### 0. Model (R1 summary: one durable record per lethal/money event)
- **Durable event records** (Phase 4's `recordEvent`: deterministic id, server-arbitrated
  uniqueness, never pruned) for every operation and every scheduled or lethal event.
  They're folded by a pure `foldCym`. Mutable GM bookkeeping (dates, notes) is derived
  from them, never stored beside them.
- **Event types and keys:**
  - `cym:op:<opId>`: a proposed operation with its persisted snapshot;
  - `cym:op-roll:<opId>`: the doctor's roll;
  - `cym:op-done:<opId>`;
  - `cym:cancer:<opId>`: GM-confirmed; its details are GM-private (§8);
  - `cym:refill:<n>` and `cym:cds:<n>`: one per due slot, with its outcome;
  - `cym:cds-treat:<k>`;
  - `cym:overflow:<receipt>` and its `-result`;
  - `cym:death:<cause>`;
  - `cym:void:<key>`, for GM-made records only.
- **Admission:** every action is GM-only and character-only, resolved by full UUID
  (tokens too). It revalidates the setting, the fold state, the due time against NOW
  (a rewind refuses), and the death state, immediately before creating its ONE record.
- **Death:** a `cym:death` record stops every schedule, and the sheet shows "dead
  (cybermancy)". Nothing is deleted.
- **Clocks (R2 #9):** every schedule-bearing payload carries an explicit WORLD time
  `wt`. `at` (server time) is used only for claim recovery.
- **Facts vs outcomes (R2 #10):** facts that happen to the character (an overflow care
  receipt, a seizure) are recorded by the client that committed them (an owner, maybe a
  player). Outcomes (death, survival, treatment results) are GM-only.
- **Attempts (R3 #4):** every GM-made, voidable outcome is keyed per ATTEMPT:
  `cym:op-roll:<opId>:<a>`, `cym:cds:<n>:<a>`, `cym:cds-treat:<k>:<a>`,
  `cym:refill:<n>:<a>`, `cym:overflow-out:<receipt>:<a>`. The LATEST non-void attempt
  is the outcome, and the next attempt number counts every earlier attempt, void ones
  included.
- **Voidable (R2 #15, R3 #5, R4 #1, #3):**
  - `cym:op-roll` ONLY until the charge receipt exists (a charged operation is undone by
    Cancel);
  - the LATEST resolved CDS/refill slot;
  - treatment results;
  - non-lethal overflow outcomes.

  Lethal outcomes are never voidable (`cym:revive`). NOT voidable: `cym:op-done` and
  `cym:op-cancel` (they carry money and items), death (the GM uses a separate
  `cym:revive` record, if ever), and notices.

### 1. One effective Essence (R1 #1–#2, #23–#24)
- **Schema:** `essence.signed` (Number, nullable, no min) and `essence.manualSigned`
  (Number, nullable, no min) are DECLARED on CharacterData and NPCData. `essence.value`
  keeps min 0 everywhere.
- **Order (R2 #1):** after ALL Essence losses are collected (`_collectItemModifiers` AND
  the substance ledger's `essenceLost`), before `_calculateAttributeValues`,
  CharacterData assigns `essence.signed = max − loss`
  (autoEssence), or `manualSigned ?? value` (manual). One accessor, `effectiveEssence()`,
  is read by every consumer below.
- **NPCs:** printed stats. The NPC sheet shows `manualSigned` when set (it's
  authored). The Cybertechnology module's Chrome Kings with negative printed Essence
  get `manualSigned` in a follow-up module release; there's no system migration (the new
  fields are nullable).
- **Negative only (R2 #16, R3 #7):** every consequence uses `neg = max(0, −signed)`.
  While neg = 0 (items removed, a manual edit):
  - the penalties are 0;
  - no refill or CDS slot becomes due (the schedules are suspended);
  - an ACTIVE CDS persists, as it's a condition, until treated or fatal.

  **Persisted transitions (R4 #2):**
  - the active GM's reconcile records `cym:suspend:<k>` = `{ wt }` when neg turns 0, and
    `cym:resume:<k>` = `{ wt, nextRefill, nextCds }` when it turns positive again. The
    due dates are FIXED in the record, each the later of its stored due and the
    resume's `wt`. k counts transitions;
  - the fold uses the latest resume's dates;
  - repeated reconciles are no-ops (the deterministic key exists);
  - an operation whose FINAL Essence (after the surgeon) is ≥ 0: op-done records the
    state, and its first transition is `cym:suspend:0`. No slot is ever due until a
    resume.

  History is never reset. The sheet says "cybermantic (Essence ≥ 0: suspended)".
- **Bands** by |E| in hundredths, with one rounding rule, `band = ⌈|E| / .5⌉` (the
  printed .50/.55 gap is the table's .05 steps):
  - −0.01 → 1, −0.50 → 1, −0.51 → 2, −0.55 → 2;
  - survival TN = 2 + 2 × band (−0.5 → 4, −1.0 → 6, −1.05 → 8);
  - the CDS table by band, below −3.5: TN 8 + (band − 8) (−3.55 → 8, −4.01 → 9).

  These examples are all tests.

### 2. The operation (R1 #4–#9)
- **Admission:** the surgery dialog's end Essence (signed) is below 0, the setting is on,
  and the GM ticks **Delta clinic: cybermancy authorized** (R1 #5: a property of the
  operation, not of the ware's grade).
- **Intended Essence (R2 #2)** comes from the complete HYPOTHETICAL inventory, before
  the surgeon's change: the signed Essence now − the candidate's PLAIN Essence (0%) +
  `_surgeryWareAdjust().credit` (muscle cost changed by a new limb) − .25 for the IMS
  unless an `ims` is installed. Admission and the survival TN both use it. The surgeon's
  change applies afterwards, from the same successes.
- **Manual Essence (R2 #3):** with `autoEssence` off, the operation's FINAL signed
  Essence is part of the commit: `essence.manualSigned` is written with the charge's
  receipt (§ the transaction).
- **The bundle:** the implant, plus an IMS (if absent), plus the automatic-medication
  system (if absent, by rule key). The cost is the implant + the fee + 137,750¥ for an
  IMS added. `cym:op:<opId>` persists all of it.
- **Roll:** the GM enters the doctor's dice and Doctoring modifiers (intensive care
  excluded). It's rolled side-effect-free (no Karma) and recorded as `cym:op-roll`.
- **Failure:** the card offers **Confirm death on the table** (`cym:death:op:<opId>`).
  Nothing is charged.
- **The frozen snapshot (R2 #6):** `cym:op:<opId>` freezes:
  - the installed-cyberware id list and the candidate's data;
  - nuyen;
  - the signed and manual Essence;
  - the computed Willpower;
  - the intended Essence, the TN, the cost and the item list.

  Before the CHARGE, Apply re-reads them and refuses on any change: the GM re-proposes.
  After the charge, the operation is FROZEN and only ever resumed, never recomputed.
- **The transaction (R1 #6–#8, R2 #4–#5):** it runs under a claim
  `cym:apply:<opId>:<attempt>`, the step owner. A stuck claim (older than `STUCK_MS`, as
  for doses and seizures) can be taken over by **Resume** with attempt + 1. The
  paused-holder double-run risk is documented. Each step checks its own receipt INSIDE
  the claimed run:
  1. **Charge:** one actor update writes nuyen, `flags.sr2e.cymReceipts.<opId>.charged`
     and (manual mode) `essence.manualSigned`. Skipped if the receipt is present.
     Money commits on one actor go through the existing per-actor purchase queue
     (`purchase:<actorUuid>`), so two operations never interleave their reads.
  2. **Items, ONE AT A TIME:** for each expected item, check by its deterministic id
     (`keepId`, derived from opId + slot). Create only the missing ones, so a
     duplicate in one never blocks the others.
  3. **Done:** `cym:op-done:<opId>`.

  The sheet shows an incomplete operation as "operation incomplete" with **Resume**
  and **Cancel and refund**.
- **Cancel (R3 #2–#3):** it uses the SAME operation claim as Apply, so the two are
  mutually exclusive.
  1. It records the intent `cym:op-cancel-intent:<opId>` first. From then on, Apply
     refuses, and Resume continues the cancel.
  2. The refund lands in the same update as its receipt
     (`cymReceipts.<opId>.refunded`). It also restores `essence.manualSigned` from the
     snapshot, IF it still equals the value the charge wrote; otherwise it warns and the
     GM edits.
  3. It deletes the created items one by one, each checked.
  4. Only after every step does it record the terminal `cym:op-cancelled:<opId>`.
- **Money across GMs (R3 #1, a documented limit):** the purchase queue is per client.
  Two GMs applying two DIFFERENT operations on one character at the same instant could
  both read one balance. The fallback is the receipts, which show every charge, so the
  GM corrects nuyen by hand.
- **Later operations (R1 #9)** append records. The established state (since,
  `willpowerBefore`, schedules, CDS, cancer) comes from the FIRST op-done and is never
  reset.

### 3. Willpower (R1 #3)
The book: "−1 per half point … restores up to 4 … cannot increase Willpower beyond the
rating he possessed before cybermancy".
- **The reading, with ONE cap on the restoration only:** loss = band-of-.5 count
  (⌈|E| / .5⌉); W' = W − loss; restore = min(4, loss, max(0, willpowerBefore − W'));
  final = max(1, W' + restore).
  - W is today's computed Willpower: natural advancement, augmentations and negatives
    all stay;
  - `willpowerBefore` = the computed Willpower at the first operation.
  - Examples: W 5, E −0.75 → loss 2, W' 3, restore 2 → 5. W 6 after advancing from 5,
    E −3 → loss 6, W' 0, restore min(4, 6, 5) = 4 → 4.
- **Immune to magic that increases Willpower:** positive Willpower changes from Active
  Effects whose origin is a SPELL item (sustained spells carry the spell's uuid as
  origin) are dropped. Other effects stay.
- **When:** applied after `_calculateAttributeValues` and the limb averages, before
  Reaction, pools, drain and the CDS dice. Source line "Cybermancy".

### 4. Magic against him (R1 #11–#13)
- **The surcharge** is ⌈2 × |E|⌉, a whole-number TN (a stated reading).
- **Healing spells** (`healingSpellTN(base, essence)`, already Essence-based): the
  clamped Essence (0) stays in the base formula, plus the surcharge. Example: Heal
  base 10, E −1.3 → 10 − 0 + 3 = 13. One helper, `cybermanticHealingTN`, is used by the
  sheet path (sheet-actions 1770), `_rollSpellcast` and the ritual path (ritual.mjs
  383). Previews use the same helper.
- **Other spells cast AT a cybermantic target (R2 #13):**
  - **Area spells:** the existing per-target `baseTN` snapshot gains `cymTN` for that
    target only, in scoring.
  - **Single-target spells:** `_rollSpellcast` freezes a single-target snapshot (the
    first target's actor UUID and its `cymTN`) and adds it to `options.targetNumber`
    authoritatively. Direct calls compute it the same way, and sheet previews use the
    same helper.
  - **Rituals:** the same snapshot helper is applied to their target.
  - Ordinary targets are unaffected.
- Mundane First Aid is untouched.
- **Reminders:** astral presence, surprise Reaction +⌈|E|⌉, Perception +2⌈|E|⌉,
  Lost in the Details. There's a GM **Hazing check** (Essence (4), ⌈|E|⌉ dice, posted
  only).

### 5. Social and Karma (R1 #22)
- **Formula, one rounding:** `cymSocial = ⌈min(|E|, 2) + 2 × max(0, |E| − 2) − ε⌉`
  (−0.3 → 1, −2 → 2, −2.2 → 3, −3 → 4, −3.5 → 5).
- **The roll dialog** gets skill context from every caller, chipped skills included.
  For a cybermantic character the social box shows `cymSocial` (replacing 3b's value,
  user ruling), pre-ticked regardless of `cyberSocial`, with an **Intentionally
  intimidating** checkbox that removes it.
- Karma at half rate and no Essence buy-back: reminders (the system has no award flow).

### 6. Clocks (R1 #16–#19)
- **Explicit next-due transitions (R2 #7):**
  - the first op-done records `nextRefill = wt + 10 days` and `nextCds = wt +
    period(band at op)`;
  - every resolved slot record stores its `nextDue`. Refills are + 10 days from the
    PREVIOUS due; CDS is + the period of the band AT RESOLUTION;
  - the pending slot = the latest record's `nextDue ≤ now`;
  - **slot ids are a CHAIN (R4 #1):** slot n + 1 exists only once slot n has a live
    result. Its id is fixed (`cym:cds:<n>`), never derived from counts. Voiding is
    allowed only on the LATEST resolved slot: voiding it reopens that slot (the next
    attempt is + 1), and nothing after it exists to invalidate;
  - a band change never reinterprets resolved slots, and creates no historical
    obligations;
  - a big jump: after resolving, the next one may already be due, and the sheet shows it
    at once.
- **Reconciliation:** the ACTIVE GM reconciles on `ready`, `updateWorldTime`, the
  setting's change, `userConnected` (handover), `canvasReady`, and actor or effect
  changes. It covers world characters and unlinked token characters on every scene,
  deduplicated by UUID (Phase 4's enumeration).
- **Notices (R2 #8):** a due slot gets one DURABLE delivery marker
  (`recordEvent(actor, "cym:notice:<kind>:<n>")`). Only the call that creates it posts the
  notice, so unrelated reconciles never repost. A posting failure loses nothing, because
  the sheet lists every pending slot (the documented fallback).
- **Refill slot actions:** Refilled (15,000¥ shown, with an optional discount; manual
  nuyen) / Corp pays / **Not refilled → Confirm death**.
- **CDS slot:** a Willpower test (cybermantic Willpower; no other short-term magic,
  meaning Active Effects from spells are excluded as in §3) vs the band TN.
  - Failure → `cym:cds:<n>` with `failed`, and `deathAt = now + (3 + W) weeks`. A
    failure while CDS is ACTIVE keeps the original deathAt (R1 #19).
  - The sheet shows the deathAt, and the GM gets **Confirm death** when it passes.
- **CDS treatment** (R1 #20), a dedicated test, not the combat spell-resistance path:
  - Willpower dice (mana-style resistance; a stated reading), no pools or Spell
    Defense, TN max(2, 8 − earlier treatments) + CDS's own +3 (the book's "all other
    tests"; stated);
  - success → **Confirm death**;
  - failure → reversed; Willpower (6) gives recoveryUntil = now + (7 − successes) days
    (minimum now). Recorded with the treatment.
- **Cancer** (R1 #10): see §8.

### 7. Tests' TN under CDS, and Better Off Dead (R1 #14–#15, #21)
- **CDS +3 (R2 #12):** applied in `testTnModifiers` to every character test, EVEN under
  a `tnPolicy` (an explicit exception: the book says all other tests).
  - Perception: there's no Perception test type, so the reminder says "+4 for
    Perception (instead of the +3)".
  - **Audit of raw `SR2ESuccessRoll` callers**, by who is tested:
    - the CHARACTER's own tests get `+ cdsTN` through a small helper
      `characterTN(actor, tn)`: the MBW seizure's Willpower and Body, the MBW
      complication test, and any raw caller testing the actor;
    - excluded, as the tests of OTHERS or tables: an opponent's test rolled in
      `actor.mjs`, the cyberware-damage grade dice, and the GM's doctor/physician
      rolls.
  - The list is in the code.
- **Better Off Dead:** `overflowMax = ⌈(Body + 10) / 2⌉` is displayed, with a warning at or
  above it (the system has no overflow-death automation).
- **The healing event** is EXPLICIT, not inferred (R2 #10):
  - `applyMagicalHealing` and `_healOneLevel` (which First Aid calls; the system has no
    separate stabilize action, and SR2 stabilizing IS First Aid) take an optional `care`
    receipt;
  - the OUTERMOST call creates the receipt and passes it down, so nested calls share
    one;
  - **(R3 #8)** when the actor had overflow > 0, the receipt is written IN THE HEALING
    UPDATE ITSELF: `flags.sr2e.cymCare.<receipt> = { overflowBefore, wt }`, together
    with the monitor change, one update;
  - the active GM's reconcile turns each such flag into the durable fact `cym:care:<receipt>`
    (idempotent) and posts the card once (a durable notice marker);
  - a manual edit doesn't trigger it.
- **The card's Willpower test** goes through the normal `rollSuccessTest` (Karma rerolls
  work, and they update its message).
- **Finalization (R2 #11, R3 #6, R4 #3):** ONE mutually exclusive outcome per attempt,
  `cym:overflow-out:<receipt>:<a>`, survived | died.
  - A "died" outcome is NOT voidable: a lethal mistake is corrected only by
    `cym:revive` (GM). A "survived" outcome is voidable (a fresh attempt).
  - A finalized "died" IS the death for the fold; no auxiliary record is created. The
    sheet shows death from the fold, so there's no repair step whose timing matters.
  - The same holds for every lethal record (`cym:death:*`, a died CDS/refill outcome):
    nonvoidable, with `cym:revive` as the only correction.
  - **Finalize** first sets the test message's `flags.sr2e.test.closed = true` (the
    existing flag that stops further Karma), awaits it, re-reads the CURRENT
    successes, and records the outcome. Death is derived from that outcome alone.
  - A reroll still in flight at that instant is the documented limit; the outcome
    record names the successes it used.

### 8. Cancer, GM-private (R1 #10)
- At op success, the GM's card proposes the cancer roll (2D6 + the GM's Body/symbiote
  options vs 2|intended|).
- **Two documents, recoverable (R2 #14):**
  1. The PRIVATE proposal is written first: the GM-ONLY JournalEntry "SR2E cybermancy
     (GM)" (players' ownership none) gets a page keyed `cancer:<actorUuid>:<opId>`
     (idempotent: written only if absent) with the roll, the onset `wt` (10D6 months)
     and the death window.
  2. **Confirm** records `cym:cancer:<opId>` = `{ confirmed: true, page: <that key> }`
     on the actor (no details).

  Reconcile repairs either partial state: a page without a confirm stays a proposal on
  the GM card; a confirm without a page re-prompts the GM to re-roll the private page.
- The GM gets onset/death notices from that page's dates. Telling the player is the
  GM's.

### 9. NPCs: printed stats; only `manualSigned` display (§1).

### 10. Tests (R1 #25)
- **Vitest:**
  - bands at −0.01/−0.50/−0.51/−0.55/−1.05/−3.55/−4.01, the survival and CDS TNs;
  - Willpower examples (advancement, the cap, the floor);
  - `cymSocial` boundaries;
  - the healing TN example;
  - `foldCym` (first op establishes, later ops append, death stops schedules, a CDS
    failure keeps deathAt, voids);
  - voiding the latest slot reopens it, and voiding an earlier one is refused;
  - suspend/resume with fixed dates, reconciled twice;
  - a died outcome is never voidable, and revive restores;
  - due slots with jump and rewind; recovery days; cancer threshold.
- **Quench:**
  - repeated preparation;
  - an operation offered only with the setting and the delta checkbox;
  - success creates the implant + IMS + auto-med with deterministic ids and charges once;
  - Resume after a simulated mid-way failure doesn't double;
  - a second operation keeps the schedules;
  - an existing IMS isn't added;
  - failure → Confirm death;
  - signed Essence on the sheet;
  - manual signed Essence;
  - Willpower ignores a spell-origin Increase Willpower;
  - a healing TN preview equals the cast TN;
  - a mixed-target area spell only surcharges the cybermantic target;
  - the social box with the intimidation toggle (chipped too);
  - a refill notice once, with the sheet fallback after deleting it;
  - a rewind refuses an old slot;
  - CDS +3 under `tnPolicy`;
  - overflow care → card → a Karma reroll → Confirm death reads the current result;
  - two GM clicks → one record;
  - the setting off: stale cards refuse;
  - a token character;
  - an NPC untouched.

## Key decisions
- Durable event records for operations, money and death (Phase 4's guarantees), not Phase 5's bookkeeping model.
- Death is never automatic: the GM clicks, and nothing is deleted.
- The signed Essence is derived for all characters, and consumed only by cybermantic
  ones.

## Out of scope
- The cybermantic ritual itself (the book gives no rules).
- Wraith/astral-predator encounters.
- Automating the Perception modifiers (no Perception test type).

## Review log
- **Codex R1 (REVISE), 25 points, all accepted:**
  - durable records for operations, money and death;
  - declared signed/manual Essence fields computed before attributes;
  - one band rounding with boundary tests;
  - the Willpower reading with the cap on the restoration only, and spell-origin
    effects suppressed;
  - intended Essence before the surgeon's change;
  - a delta-clinic checkbox;
  - an op transaction with receipts, deterministic item ids and Resume;
  - later ops append;
  - GM-private cancer;
  - healing/target TN paths named;
  - explicit overflow-care events with a Karma-safe death confirmation;
  - durable clocks with a sheet fallback, rewind refusal, backlog summary,
    token enumeration and death stopping schedules;
  - CDS deadlines kept;
  - a dedicated treatment test;
  - the CDS +3 policy across roll paths;
  - social skill context with an intimidation toggle;
  - the NPC display;
  - the expanded tests.
- **Codex R2 (REVISE), 16 points, all accepted:**
  - Essence after all losses;
  - intended Essence from the hypothetical inventory with the muscle credit;
  - manual Essence in the commit;
  - a claimed, resumable transaction with per-step receipts and a stuck takeover;
  - per-item creation, plus Cancel and refund;
  - a frozen snapshot refusing changes before the charge;
  - explicit next-due transitions;
  - durable notice markers;
  - world-time payloads;
  - facts recorded by the committing client;
  - a care receipt shared through nested healing;
  - an exclusive overflow outcome after closing the test;
  - the raw-caller audit;
  - a single-target spell snapshot;
  - recoverable two-document cancer;
  - the void policy for irreversible events;
  - neg = max(0, −E).
- **Codex R3 (REVISE), 8 points:**
  - #2–#7: accepted (cancel restores manual Essence; a resumable, exclusive cancel with
    intent and terminal records; attempt keys everywhere; the roll not voidable after
    charging; a finalized "died" is death; neg 0 suspends schedules and keeps an active
    CDS);
  - #8: the care receipt goes in the healing update itself;
  - #1: the cross-GM money race is a DOCUMENTED limit, with receipts as the fallback.
- **Codex R4 (REVISE), 3 points, all accepted:** chained slot ids with void only on the
  latest; persisted suspend/resume transitions with fixed dates (and final Essence ≥ 0
  starting suspended); lethal outcomes nonvoidable, with death derived from the outcome
  itself.
