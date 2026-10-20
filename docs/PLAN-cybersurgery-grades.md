# Plan: delta grade, secondhand bioware, cybersurgery at the clinic
_Round 3 — revised after Codex rounds 1–3_

## Goal
The purchase-system backlog ("second-hand parts; clinics that change price AND Essence;
more grades"), built only from rules the books actually print (all verified from page
renders, 2026-10-19).

## Sources (rendered and read)
- **Cybertechnology (FASA7119, SR2, 1995) p.42–44, Cyberware Quality.**
  - Grades are standard, second-hand, alpha, beta and delta. Delta: Essence −50%
    (×.5), cost ×10, damage resistance 3/4. Alpha (×.8, ×3, 5/6) and beta (×.6, ×7,
    4/5) match SSC p.98, which is already implemented.
  - "In all instances where material in this section contradicts previously published
    material, the newer material should take precedence." So SSC's "no deltaware"
    (our comment at sr2e-rules.mjs:2442) is superseded.
  - Delta is custom-made and needs a delta clinic (hard to reach; GM).
  - Second-hand CYBERWARE is named ("less reliable than new"), but the book prints no
    numbers for it. **Not implemented**; the GM adjusts the price by hand.
  - Fees: alpha/beta clinics charge doctor's fees and hospitalization at ×50 the basic
    rates, delta ×200 (the healing costs; a card note).
- **Cybertechnology p.53, Cybersurgery.**
  - The surgeon's skill test (Biotech) has TN = 10 − ⌊the Essence the character will
    end with⌋, plus Doctoring Table modifiers (the patient is assumed in intensive
    care, −2).
  - The surgeon's successes change the implant's Essence Cost: 0 +15%, 1 +10%, 2–3
    none, 4–5 −10%, 6+ −20%, rounding up.
  - If the result would leave Essence below 0, the surgery is aborted.
  - The surgery itself costs: Minor Cosmetic 1,000¥, Minor Invasive 5,000¥, Major
    Invasive 25,000¥, Drastic Invasive 250,000¥.
- **Core p.114, Elective Surgery:** cosmetic (no Essence) → Light wound; up to .4
  Essence → Minor Invasive, Moderate; .41–.99 → Major, Serious; 1+ → Drastic, Deadly
  (stable; a magician checks Magic loss after healing). Chargen: "Players do not have
  to find parts or undergo surgery to obtain cyberware during character generation"
  (p.~59).
- **Shadowtech p.12, Secondhand Parts:** used bioware sells "for 40 percent to 60
  percent less than original parts" with "the same Body Costs as the new". It takes
  +1 on its damage-test die rolls (a 7 destroys it). Cultured bioware has no
  secondhand market.

## Approach
1. **Delta grade** (`CYBERWARE_GRADES.delta = {essenceMultiplier: .5, costMultiplier: 10,
   damageResist: [3, 4]}`, citing Cybertechnology p.44).
   - Add it to the CyberwareData `grade` choices and labels.
   - The existing `gradeEssenceCost` (rounds up, .05 floor) and `gradeCostMultiplier`
     handle it.
   - The purchase dialog's grade select shows it with "(needs a delta clinic: GM)".
   - Fix the "no deltaware in SR2" comments.
2. **Secondhand bioware** (`BIOWARE_GRADES.secondhand = {bodyCostMultiplier: 1}`):
   - New BiowareData field `secondhandDiscount` (integer, 40–60, initial 50). The price
     multiplier is `1 − discount/100` (`gradeCostMultiplier` gains the system data).
   - The purchase dialog shows the discount input only when "Secondhand" is picked.
     It isn't offered for neural bioware, which is always cultured (and cultured has
     no secondhand market).
   - The item sheet and summary note: "+1 to its damage-test rolls; a 7 destroys it
     (Shadowtech p.12)". The system models no bioware damage tests, so it's a note.
   - Changing the discount or grade later re-prices through the existing
     preUpdateItem charge/refund: `secondhandDiscount` joins `PURCHASE_DRIVERS` AND
     both the old and new `sysFor()` snapshots (R1 #1). Tests: a discount-only edit,
     then a re-grade.
   - `describeGrade()` renders secondhand as "−N% (secondhand)" from the CURRENT
     discount input, and refreshes when it changes (R1 #8). It never reads a missing
     `costMultiplier`.
3. **Cybersurgery:** cyberware only, an in-play purchase whose PREPARED candidate (the
   schema-normalized item, so an omitted `installed` counts as its default, true)
   is installed (R1 #6, R2 #4). It's skipped in chargen, on alt-drop/free, and
   for an uninstalled spare. Installing a spare later has no surgery flow
   (unchanged, documented).
   - **A Cybersurgery section in the purchase dialog:**
     - **Surgeon's successes:** parsed on its own as a finite integer ≥ 0, default 2
       (= no change). 0 is a real result, not clamped to 1 (R1 #7).
     - **Other implants in the same surgery (Essence):** default 0. The category uses
       this implant + that total, since core p.114 sizes the procedure by its Essence
       TOTAL (R1 #5). Workflow, stated in the dialog: buy the earlier implants with
       the wound and fee unticked, then the last one with the others' total.
     - **Charge the surgery fee** and **Apply the surgery wound**, both on by default.
     - It shows the surgeon's TN for the GM: max(2, 10 − ⌊projected Essence⌋ − 2
       (intensive care)). The projected Essence here EXCLUDES the surgery %: the
       candidate is prepared with pct 0 for the TN, so the test's own result can't
       move its TN (R2 #3). The post-result Essence is shown separately. The GM rolls
       the NPC surgeon.
   - **Projected Essence, before anything is created** (R1 #3):
     - the candidate is prepared from the chosen data as an UNEMBEDDED item instance
       (`new Item.implementation(data, {parent: actor})`'s `actualEssenceCost`
       includes rating rows, container overflow, the cranial deck, grade and the
       surgery %);
     - projected = the actor's current Essence − that cost. The current value is
       clamped at 0, which is safe: at 0 any implant aborts anyway.
     - Projected < 0 → refused with the rule ("aborted; the character survives with
       Essence 0: GM"). Nothing is created or spent.
   - **Money: one check, one debit** (R1 #4):
     - affordability is tested on item price + fee together, before creation;
     - after the item is created, ONE nuyen update debits both. `flags.sr2e.paid`
       records the item price only (the fee is a service: never refunded on sale).
     - A zero-price implant still pays its fee (the debit runs when the total > 0).
   - **Serialized per actor** (R2 #2): after the dialog, the checks and writes run in
     a `purchase:<actor uuid>` queue (`enqueueAttack`), which RE-READS the actor's
     Essence and nuyen. Two drops on one client can't both pass a stale check. Two
     DIFFERENT clients buying for one actor at once is the general last-write-wins
     between editors (out of scope, as elsewhere).
   - **Order inside the queue** (R3 #1–#2): re-check → DEBIT item price + fee (one
     update) → create the item with `flags.sr2e.paid` = the item price IN THE CREATE
     DATA → wound (`commitDamage`, physical boxes 1/3/6/10) → card.
     - The candidate's data has any inherited acquisition flags
       (`flags.sr2e.paid`, `acquiredQuantity`) replaced explicitly, never copied from
       the source item.
     - A failed debit → nothing is created (the purchase is refused).
     - A failed create → the debit is refunded (one update), and the console and a
       notification say so. There's no state where the money is gone without a paid
       item, or a paid item exists without the money spent, short of a crash between
       two writes. A crash leaves the money debited with no item; the card was never
       posted, and the GM refunds by hand (documented).
     - A failure in the wound or the card is reported (console + notification).
       Nothing is rolled back.
     - Test: a create stubbed to fail → the money is restored and no item exists.
   - **Item sheet** (R2 #5): the actual-Essence hint shows whenever the grade OR the
     surgery % changes it (`gradeReducesEssence` becomes "actual ≠ base"), rated items
     included. A surgery-% readout appears beside the grade.
   - **Essence:** `system.surgeryEssencePct` (integer: +15/+10/0/−10/−20, initial 0).
     When it's non-zero, `actualEssenceCost = ceil100(graded × (1 + pct/100))`; when
     it's 0, the graded cost is returned UNCHANGED, so existing items keep their
     precision (R1 #2).
   - **Category** from the procedure's Essence (this + others): 0 → cosmetic (Light,
     1,000¥), ≤ .40 → minor (Moderate, 5,000¥), .41–.99 → major (Serious, 25,000¥),
     ≥ 1 → drastic (Deadly, 250,000¥). The procedure total is ROUNDED UP to the
     hundredth first (exact 0 stays 0), so .401 → .41 major and .995 → 1.00 drastic
     (R3 #3; tested).
   - **The card:** the category, wound, fee, Essence change, and notes (grade-clinic
     healing costs ×50/×200, Cybertechnology p.44; Magic-loss check after a drastic
     surgery heals, core p.114).
   - **Pure helpers** in sr2e-rules.mjs: `surgeryEssencePct(successes)`,
     `surgeryCategory(essence)`, `surgeonTN(endEssence)`, `surgicalEssence(graded,
     pct)`.
4. **Tests.**
   - Vitest: `surgicalEssence(x, 0) === x` for .025 (no re-rounding); the delta
     multipliers, with rounding against the .05 floor; the
     secondhand price at 40/50/60 and its unchanged Body Cost; every success band;
     category boundaries (0, .40, .41, .99, 1.0); the surgeon TN; the surgical Essence
     round-up; `purchasePromptFields` includes surgery fields for cyberware only.
   - Quench (`sr2e.purchases`):
     - buy delta cyberware → price ×10, Essence ×.5;
     - buy secondhand bioware at 60% off → price, Body Cost unchanged; re-grade →
       charge/refund;
     - in-play cyberware with 0 successes → Essence +15%, fee charged once, Moderate
       wound applied, card posted; in chargen → no surgery fields, nothing applied;
     - an Essence-overflow purchase is refused, nothing spent (a rated item, so the
       prepared candidate is the one checked);
     - 0 successes typed in the real dialog → +15% (not clamped);
     - an uninstalled spare → no surgery;
     - a zero-price implant pays its fee; an unaffordable item + fee is refused before
       creation;
     - the secondhand discount edited alone re-prices; the describeGrade text.
5. **Docs:** CHANGELOG, QA-PLAN, memory (sr2e-purchase-system, sr2e-cyberware-grades:
   delta EXISTS via Cybertechnology).

## Key decisions & tradeoffs
- Cybertechnology's delta grade is adopted (newer SR2 material, precedence stated by
  the book).
- The surgeon's test is entered, not rolled (it's an NPC's roll, and its TN needs GM
  modifiers).
- The surgery fee is a separate charge, not part of the item's resale price.
- Second-hand cyberware is not modelled: no printed numbers.

## Risks / open questions
- Existing worlds: new fields default to 0/50 and new choices are additive, so no
  migration is needed (StringField choices only grow; `blank` is unchanged).
- Removing or uninstalling cyberware has no surgery flow (unchanged).
