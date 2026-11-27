# Plan: treating the wounded — a medic-driven First Aid flow (core p.111–115)
_Round 11 — revised after Codex r1–r11 (gear moved to the GM writer) (docs/archive/plans/PLAN-treatment-REVIEW-LOG.md), 2026-11-27._ User (2026-11-27), after the 2026-11-21 game: players thought the
sheet's **Heal** button lets a Biotech runner treat another runner; it rolls the PATIENT's Body (natural healing and
the Doctoring Table). Rulings from the user: a Biotech runner is **not** a "doctor" (RAW p.113); an untrained user with
a medkit rolls **the medkit's 3 dice** instead of defaulting; players own only their own characters.

## The rules (rendered core p.111–115, p.164, p.250/275, Street Gear p.263 = PDF 288)
- p.113: the Doctoring Table applies only "if a doctor is involved (one with a real medical degree, not just Biotech
  Skill)". Organ damage from a Deadly wound needs "continuous treatment by another character with Biotech skill".
- p.115 First Aid: the medic's **Biotech** Success Test vs the First Aid Table (L 4 / M 6 / S 8 / D 10) + patient is
  a magician +2, bad +1, terrible +3, patient's Body −0/−1/−2/−3, **no medkit +4**; only in the golden first hour;
  never more than one level in all; time = table time ÷ successes, uninterrupted; no use once magical healing applied.
  Deadly: stabilize only; a failed test → the patient's natural Body vs 10; "Professional help, once it reaches the
  character, allows another Biotech Test and character Body Test" (professional = better equipped, or a better Biotech
  Rating than the first medic's). Trauma patch: an extra natural Body Test vs 4 + dermal armor + blood filter ratings.
- p.250 medkit: an expert system (Biotech 3) that advises the user; "Supplies run out on a result of 1 on a 1D6 rolled
  following a treatment". Street Gear: Medkit 200¥ (weight 3, 2/24 hrs, SI 1.5); Medkit Supplies 50¥ (2/24 hrs, SI 1.5).

## Today (what confused the table)
- **Heal** (`healPhysical`, sheet-actions `onHealPhysical`) = the patient's own Body tests; "A doctor is involved" is an
  NPC professional. Correct RAW, misleading name. Its organ-damage gate demands the doctor box, though p.113 asks only
  for a Biotech carer.
- **First Aid** (`firstAid(patient)`) treats a TARGETED token's actor (else self), with a "No medkit" checkbox, and
  writes the patient's monitor from the medic's client — which fails for a player treating another player's runner
  (no ownership). Karma spent on the test afterwards changes nothing (it applied at once).
- The pack Medkit costs 300¥ (Street Gear: 200¥), weight 0, "Always"; there is no Medkit Supplies item and no medkit
  state.

## Approach
1. **Identity of the medical gear (never names):** `medicalGearRule(item)` in a new pure `module/rules/treatment-rules.mjs`:
   `flags.sr2e.rule` ("medkit", "medkitSupplies", "traumaPatch"), else the known compendium source UUID table. Pack
   items get the flag; the Medkit's price/weight/availability/SI corrected to Street Gear; a new "Medkit Supplies" item
   (50¥). **Supplies per unit** (r1 #8): `flags.sr2e.medkitEmpty` = how many units of the stack are used up (0..quantity);
   a stack is usable while `quantity − empty ≥ 1`.
2. **Pure rules** (treatment-rules.mjs, Vitest): `firstAidTn({ level, magician, waiveMagician, body, conditionMod,
   medkit, defaultingPenalty })` → { tn, parts } (moves today's inline math); `medicDice({ biotech, webDefault, medkit })`
   → { dice, penalty, source } — trained: Biotech (+ passive dice); untrained WITH a usable medkit: 3 dice, no penalty
   (ruling); untrained without: Skill Web default as today; `woundSnapshot(actor)` → { boxes, overflow, rev } (rev = the
   wound GENERATION, r2 #5) and `sameWound(a, b)` (all three equal, r1 #4). The generation is
   `flags.sr2e.woundGen`, bumped by a `preUpdateActor` hook in the SAME update as ANY change to the Physical monitor or
   overflow, clock on or off, for characters, NPCs and spirits — so a card rolled at 3 boxes never matches a later
   3-box wound;
   `professionalOk(first, medic)` (r1 #10).
3. **The medic's "Treat…" button** (character + NPC sheets, and the companion through SHARED_ACTIONS): a dialog that
   LISTS patients by their EXACT document (r1 #11): each token on the current scene whose actor has Physical damage or
   overflow — its `token.actor` (the synthetic actor of an unlinked token, the world actor of a linked one) — then any
   damaged player character with no token on the scene, deduplicated by UUID. A target, if any, is preselected. Per
   patient: the wound, "first aid already given" / "magically healed" (with **"These are new injuries (GM's call)"**,
   as today's confirm, r1 #9), the golden hour (with the healing clock). Conditions and (for a magician patient) the
   waiver; the medkit is the medic's own usable stack (none → +4, shown). For a Deadly patient: "Stabilize", or — once
   a stabilization attempt on this wound failed — **"Professional help"**, offered only when this medic's Biotech Rating
   is higher than the recorded first medic's or the GM ticks "better equipped" (r1 #10); and "Trauma patch" if the
   medic carries one.
4. **Roll, then Apply (Karma counts):** the medic's client snapshots the patient (`woundSnapshot`), rolls
   `rollSuccessTest` (Biotech or the medkit's 3 dice, tnContext biotech) and posts a **treatment card**
   (`flags.sr2e.treatment`: id = the card's id, patientUuid, medicUuid, testMessageId, the snapshot, level, kind
   aid|stabilize|professional|trauma, opts incl. "new injuries", medkit item id, phase "rolled", and **`writer`** = the
   user who rolled — the medic's writer, `moneyWriterFor(medic)`: its active player owner, else the active GM).
   **One medic writer** (r2 #3, r5 #1): Apply and Karma on a treatment test run only on `moneyWriterFor(medic)` at that
   moment — the medic's active player, else the active GM — inside a per-test queue that `applyKarmaToTest` also uses
   for treatment tests. Apply reads the success total and posts an apply-request message carrying that exact total,
   the chosen gear item id, and `closesTests: [testMessageId]` — from then Karma is refused (`isTestClosed`); the GM
   never reads a live total. Apply itself changes no gear.
5. **Gear is spent by the GM writer too** (r1 #7 … r7: one writer removes every cross-client race on the medic's
   items): inside step 6's patient queue, AFTER the eligibility checks pass and BEFORE the patient commit, the GM runs
   the gear step in a per-item queue (`gear:<itemUuid>`, order always patient → item) as ONE item update carrying the
   stock change and its receipt `flags.sr2e.treatUse.<cardId>`: the medkit's supplies roll (1D6 → `medkitEmpty` +1 on
   a 1, the die in the receipt) or a trauma patch (quantity −1, the item KEPT at 0). A receipt already there → skip
   (a resumed request). No receipt and the item gone/unusable → the card is Refused ("the medkit/patch is gone"). A
   crash between the gear step and the patient commit resumes cleanly: the gear receipt skips the step, the patient
   receipt is still absent. If that resumed request is then Refused (the wound changed meanwhile, r8 #1), the GM
   refunds the gear in the same item queue — a patch: quantity +1; a medkit: `medkitEmpty` −1 ONLY if the receipt's
   die was a 1 (r9 #1) — with the receipt marked `refunded` in ONE update (never refunded twice). The card is marked
   Refused only AFTER the refund is written (r9 #2), so the ready-time scan still finds an unfinished one.
6. **Application by ONE writer: the active GM** (r2 #2) — its `createChatMessage` hook on the request, even when the
   medic owns the patient (a GM is always present; one writer means one local queue). All of it INSIDE the patient's
   `damage:<uuid>` queue (r1 #2), with QUEUE-HELD helpers (r2 #1): `commitStart` and `setStable` are split into
   `commitStartHeld` / `stableHeld` that assume the caller holds the queue and only build their state into the caller's
   ONE update; the public functions keep their queue wrappers for today's callers:
   - **Receipt first:** `flags.sr2e.treated.<cardId>` on the patient. Present → already applied: only re-mark the card.
   - **Settle, then check:** `reconcileHealing` runs BEFORE entering the queue (it queues itself); inside, the live
     `woundSnapshot` must equal the card's (boxes, overflow, generation — r1 #4); the golden hour (`goldenHour`: refused
     when `old && !mixed`; when `mixed` — an old wound with fresh damage — only if the card carries the GM's "new
     injuries" ruling, r2 #6); magical healing and first-aid-given unless "new injuries"; for "professional", the
     recorded first attempt still matches.
     The clock slot (free or not) is part of these checks, so it is known before any gear is spent (r11 #1). **Rule for EVERY refusal path** (r10 #1, r11 #1): refund any gear this card already spent (step 5) first, THEN mark the card **Refused** with the reason (no patient write; a later retry gives the same
     answer, because the snapshot can only drift further).
   - **Commit in ONE patient update with the receipt:** the healing-clock course (clock on, r3 #2: NO `admitStart`
     marker — the GM holds the queue, so `commitStartHeld` checks the slot is free and bumps the column's `startGen`
     itself, in the same write; an in-flight "Recover" started meanwhile then fails its own fence with "the wound
     changed", as today; a full slot → Refused) or
     `_healOneLevel` with the receipt in its update (clock off); `stableHeld` / the stabilization record (r1 #10, r3 #3): `flags.sr2e.stabilize` = { attempts: [{ cardId, kind,
     biotech, ok, woundGen }] } for the current Deadly episode (cleared in the same update that takes the patient out of Deadly).
     Inside the queue, against it — "stable" is the LIVE clock state `bleed.stable` when a bleed record
     exists; otherwise (clock off, or a Deadly wound with no overflow — r5 #2) the latest attempt is ok, its recorded
     wound generation equals the live one, and no "stabilization ended" entry follows it (r4 #2: new damage ends a
     stabilization). The GM ends one with **"Care ends"** (clock on — it now ALSO appends that entry in the patient
     queue, bleed record or not, r6 #2) or a **"Stabilization ended"** button (clock off, r5 #3): currently stable → any stabilize card is Refused ("already
     stable"); the last attempt failed → a plain "stabilize" card is Refused and a
     "professional" one is allowed only if its Biotech beats every recorded attempt's or the GM ticked "better
     equipped"; not stable after "care ends" or new damage → a new plain attempt is allowed (p.115: stabilization must be maintained);
     the patient's own Body vs 10 (failed stabilize) or vs 4 + dermal armor + blood filter (trauma patch) is rolled by
     the writer before the commit and its result goes in the same update. Magic-loss checks after.
   - Then the card → **Applied** (GM updates it). On `ready` the active GM re-runs every request message whose card is
     neither Applied nor Refused (the receipt makes this safe) — a reload or a disconnect never loses one (r1 #1).
   - Receipts are KEPT (r2 #5): one small entry per treatment; the wound generation already stops an old card from
     matching a new wound, and the receipt stops a replay of the same card.
7. **Karma on a refused treatment** (r1 #6): not refunded. A refusal means the patient's wound changed after the roll
   (new damage, healing, another medic first) — the attempt was made on a wound that no longer exists. The dialog shows
   eligibility before the roll, so a refusal is rare; the card says why. Ruling on the wiki.
8. **Patient side "Ask for treatment":** a button on the wounded character's sheet posts a card naming the patient and
   the wound; its **Treat** button opens step 3's dialog for the clicking user's own character that has Biotech or a
   usable medkit (several → pick one), patient preselected.
9. **Relabel the patient's own healing:** "Heal" → **"Recover"** (tooltip "Your own Body test to heal a stage, p.113");
   its dialog says "A doctor or clinic (a professional — not a runner's Biotech, p.113)". The organ-damage gate accepts
   "Under continuous care by a character with Biotech" (a new checkbox) OR a doctor.
10. **Clock off** (r1 #11): no time is tracked by design (the healing clock is the timing feature); First Aid lowers the
    wound at Apply and the card states the uninterrupted minutes — as today.
11. **Docs:** wiki How-To "Treat a wounded runner" (screenshots + GIF), Combat page, Rulings (untrained medkit = 3 dice;
    Biotech runner ≠ doctor; professional help; Karma before Apply, no refund on refusal), CHANGELOG, QA-PLAN,
    in-Foundry guides (`gen-guides`).

## Proof
- Vitest: `firstAidTn` (every table row and modifier, floor 2), `medicDice` (trained, untrained+medkit 3 no penalty,
  untrained without, empty medkit = none), `medicalGearRule` (flag, source UUID, name never), the pack prices.
- Quench `sr2e.treatment`: a request message applied by the GM hook heals one level ONCE — two request messages for
  the same card, and a re-run of the `ready` resume, change nothing more (receipt); two CARDS for the same wound: the
  second is Refused (snapshot); a wound changed between roll and Apply (3 → 4 boxes, same level) is Refused; Karma
  reroll before Apply raises the applied successes and Karma after Apply is refused; Deadly stabilize, failed → Body vs
  10, professional help refused for an equal Biotech and allowed for a higher one; trauma patch consumed once on a
  repeated Apply; medkit supplies on a forced 1 → one unit of a stack of two empty, the other still usable → Restock;
  untrained + medkit rolls 3 dice with no penalty; an UNLINKED token patient (its synthetic actor healed, the world
  actor untouched); the healing-clock path (course written with the receipt, an occupied slot → Refused) and the
  instant path; magically-healed and already-aided refused unless "new injuries".
- The existing healing Quench batches stay green.

## Key decisions & tradeoffs
- **Request message + active GM**, not the system socket (unreliable at this table) and not "patient's owner clicks
  Apply" (the patient's player may be away from the keyboard). A GM is always present (project rule).
- **Apply after Karma** (one extra click) over applying at once: RAW lets the medic reroll with Karma; the live total
  is read at apply time and the test then closes.
- **No house rule** making a Biotech runner a doctor.

## Risks / open questions
- Two medics at once: both cards snapshot the same wound; the first commit changes it, so the second is Refused.
- A wound that changes between roll and Apply is refused rather than re-targeted (simple, explicit); Karma not refunded.
- Golden hour without the healing clock can't be measured: the dialog asks (as today).

## Out of scope
Stun (rest only, unchanged); the Treat/Heal spells (their Apply button already runs on the patient's owner — a GM-relay
for them is a follow-up if the table needs it); stabilization units; DocWagon contracts.
