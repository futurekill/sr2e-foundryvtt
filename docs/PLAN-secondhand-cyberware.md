# Plan: second-hand cyberware (SSC p.100, Cybertechnology p.42)
_Round 3 — revised after Codex rounds 1–3, 2026-10-29_

## Goal
The last purchase-backlog item. The 0.10x cybersurgery plan recorded "second-hand cyberware: no
printed numbers", and that was wrong: the Street Samurai Catalog prints them. This plan builds
second-hand cyberware from those rules. Delta grade, secondhand bioware and cybersurgery already
shipped (docs/PLAN-cybersurgery-grades.md).

## Sources (rendered and read, 2026-10-29)
- **SSC (Revised) p.100, "Cheap Cyberware / Bargain Basement Cyberware":**
  - Second-hand cyberware "costs 50 percent less, but is prone to breakage. Installation and
    Essence Cost are the same as for a normal piece of cyberware."
  - It doesn't break whenever it's used, only "when it is crucial that it not break". Once per
    adventure (and only once), the GM may have the player make a Resistance Test for it: 5 dice
    against TN 4, "modified by circumstance as the gamemaster sees fit". The book's example is a
    cheap cyberarm holding the character's weight off a building, at TN as high as 8.
  - "Normal Karma rules apply, but it costs 2 points of Karma per die re-rolled."
  - If it fails, "it must be replaced. No repair is possible."
  - The GM is told to use it for tension, never to harass the players.
- **Cybertechnology p.42, Cyberware Quality:** cyberware comes as "standard, second-hand,
  alpha-grade, beta-grade, and even delta-grade". "Second-hand cyberware comes in standard, alpha,
  and beta grades, but is less reliable than new cyberware of the same grade." No other
  second-hand numbers appear on p.42–44, so nothing there contradicts SSC p.100.
  - So second-hand is a CONDITION on top of the grade, not a grade of its own, and delta can't be
    second-hand.
- Bioware already has its own rule (Shadowtech p.12: the `secondhand` bioware grade, 40–60% off),
  and is unchanged.

## Approach
1. **Data.** CyberwareData gains:
   - `secondhand: BooleanField(false)`;
   - `secondhandFailed: BooleanField(false)`, which records that the part failed its test and
     must be replaced.

   New fields default to false, so no migration is needed.

2. **Price.** A pure helper `cyberSecondhand(sys) = type === "cyberware" && sys.secondhand &&
   grade !== "delta"`. `itemBaseCost` multiplies by 0.5 when it holds, after the grade, so a
   second-hand alpha costs half a new alpha (×3 × .5 = ×1.5).
   - It is applied in `itemBaseCost`, the single pricing source, not in `gradeCostMultiplier`.
     That function's callers pass only the grade.
   - `secondhand` joins `PURCHASE_DRIVERS` and both `sysFor()` snapshots in sr2e.mjs. Ticking or
     unticking it on a purchased item then charges or refunds the difference, as a grade change
     does.
   - Delta plus second-hand is REFUSED as a TRANSITION (R1 #10, R2 #6). `preUpdateItem` rejects
     an update whose result is grade delta AND `secondhand` true when the item was not already
     in that state ("delta is always custom-made: untick second-hand first", Cybertechnology
     p.42).
     - An existing invalid record (pack or import data) still takes unrelated edits.
     - The item sheet shows the Second-hand checkbox whenever `secondhand` is true, delta
       included, so it can be unticked; it is hidden only on delta items that aren't
       second-hand.
     - The purchase dialog can't produce the combination.
     - The pricing helper ignores the flag on delta.
   - Chargen (R1 #1): the explicit item snapshot in actor-sheet.mjs (~553, beside
     `secondhandDiscount`) carries `secondhand`, so chargen resource totals price it the same.
   - Essence is unchanged ("the same as for a normal piece"). `actualEssenceCost` is untouched.

3. **Purchase dialog** (`_promptPurchaseOptions`). Cyberware gets a "Second-hand (half price, SSC
   p.100)" checkbox in the grade area. It is hidden while delta is selected and refreshes with the
   grade select, using the existing grade-field refresher.
   - Persistence (R1 #2): the dialog's result carries `secondhand` (true OR false), and the
     caller (~788) copies it into `itemData.system` before the surgery branch, beside
     `secondhandDiscount`. The dialog has no price preview today; the grade option labels say
     what changes, so the checkbox label carries "(−50% ¥, same Essence)". No new preview.
   - It is offered in chargen too; neither book restricts it.
   - Cybersurgery is unchanged ("Installation … the same").

4. **Item sheet.** In the cyberware grade area:
   - the Second-hand checkbox, hidden for delta;
   - when it is ticked, a **Reliability test** button and a **Failed — must be replaced** checkbox
     (`secondhandFailed`);
   - the hint "−50% ¥, same Essence; once per adventure the GM may call a 5-die test (SSC
     p.100)".

   The character sheet's cyberware row gets a small "2nd-hand" tag, and "FAILED" when it has
   failed.

5. **Reliability test.** `rollSecondhandTest(item)` (module/secondhand.mjs; built as a module
   function, not an actor method) runs from the item-sheet button or a macro.
   - It prompts for the TN: default 4, integer 2–12, with the note "GM: 4, raised by
     circumstance; up to 8 for a crucial strain (SSC p.100)". The prompt also has the Karma-dice
     input other tests use (R3 #1), passed as `options.karmaDice`. "Normal Karma rules apply",
     so it keeps rollSuccessTest's existing cost and cap.
   - It rolls 5 dice through `rollSuccessTest` with a new `tnPolicy: "equipment"` (R1 #6, R2 #3).
     It's the PART's test, not the character's, so the TN is exactly the GM's. The policy zeroes
     every character modifier. Today that means the wound penalty and cdsTN, which `"table"`
     doesn't zero, plus everything already zeroed by any policy (sustain, dump shock, MPCP,
     drugs, addiction, coordination, social, phobia). Both the wound and cdsTN lines gain the
     `"equipment"` check. The normal card, Karma buttons and Rule of One still apply. Test: a
     wounded character's card shows the entered TN.
   - The test state carries `rerollCostPerDie: 2`. Rerolling the failures then costs 2 × the
     number of failed dice and does NOT escalate; this is the book's override of p.191's
     escalating cost. Both the renderer (the button's cost label) and `applyKarmaToTest` (the
     charge and the affordability check) read it. Buying successes and avoiding an Oops keep
     their normal costs ("Normal Karma rules apply").
   - Refused when the item isn't second-hand, has already failed, or isn't installed.
   - **Failure** means 0 successes after any Karma. The roll can't decide that by itself, because
     Karma can come later. So the card carries a GM-only **"It fails — mark for replacement"**
     button (R1 #3, R2 #1–#2). It reuses the existing cross-client closure, the one combat
     spells and astral exchanges use (`isTestClosed`, astral-combat.mjs ~89): a separate message
     whose `flags.sr2e.closesTests` lists the test. That avoids writing the test's own flags,
     which a concurrent Karma `message.update` would overwrite. Steps:
     1. Read the CURRENT test state. Refuse while successes > 0.
     2. Post the settlement message: `closesTests: [testId]`,
        `flags.sr2e.secondhandSettle: {itemUuid, outcome: "failed"}`, "<item> fails — it must be
        replaced (SSC p.100)".
     3. Update the item: `secondhandFailed: true`.

     Karma already re-checks `isTestClosed` after paying and refunds, so a reroll that started
     before step 2 is refunded. The one remaining window: a reroll that passed its re-check
     before step 2 and lands after step 1's read. That is the same accepted window as combat
     spells P1.5, and the GM can still correct the item box.
   - **Retry and duplicates** (R2 #2, R3 #2): no `once()` marker. The settlement message IS the
     record, with `applied: false`.
     - After step 3 succeeds, the settling client sets `applied: true` on the settlement message
       (step 4).
     - "Finish: mark failed" shows only for an UNAPPLIED settlement and re-runs steps 3–4.
     - A GM who later unticks the item box (a correction) is never re-failed, because the
       settlement stays applied.
     - Two GMs pressing at once may post two settlement messages with the same outcome. Both
       close the test and both set the same boolean, so the duplicate is harmless.
     The GM can also tick the item-sheet box directly.
   - Once per adventure: the system has no notion of an adventure, so this isn't tracked. The
     prompt states the rule.

6. **A failed part stops working**, but its Essence still counts: it is in the body until it is
   replaced. In `CharacterData` mods (actor-data.mjs ~1022), `secondhandFailed` joins the `off`
   condition, so its attribute mods, initiative dice, wareBody/wareWillpower and reaction
   enhancer all drop. A failed wired-reflexes item doesn't set `mbw.wiredWorking`. The
   `reaction-enhancer` check at ~1215 and the mbw/trigger lookups at ~1220–1230 skip a failed
   item.
   - The Reaction-exempt Quickness accumulation (~1046, muscle replacement) moves inside the
     `!off` guard too (R1 #4); otherwise a failed muscle replacement would LOWER Reaction.
     Tested.
   - `isWeaponLike` becomes false for a failed cyberweapon.
   - **Cyberlimbs and limb options** (R1 #5): the limb model (`_limbEssenceAndModel`,
     `_applyLimbAverages`) is NOT changed. A failed limb follows the Phase 5 precedent, where
     "The limb shuts down completely" (Cybertechnology p.49) is a reminder, by the user's ruling
     that secondary effects are reminders. The book prints no stats for a dead limb. The limb
     items also skip the `off` gate above, so a limb never half-fails. The card and sheet say
     "a failed cyberlimb is dead weight: GM decides its effects (p.49 precedent)".
   - Other passive functions (vision modes, smartlink, VCR, comm) are keyed elsewhere. They get
     the sheet's FAILED tag plus a card note: "its other functions stop too: GM". Wiring every
     feature consumer is out of scope (see Risks).
   - Repair (R1 #7): "No repair is possible." The real handlers, `cdRepair` and `cdSkinRepair` in
     sheet-actions.mjs (~3821–3833), refuse a failed item with that reason.
   - Resale (R1 #9): `saleQuote` prices a failed part at 0¥ ("failed second-hand ware: worthless,
     SSC p.100"). Tested.
   - Re-pricing (R2 #4): `preUpdateItem` refuses any `PURCHASE_DRIVERS` change on a failed part
     ("a failed part can't be re-graded or re-rated: replace it"), so no refund leaks through
     `repriceDelta`. GM correction path: untick `secondhandFailed` (GM-only), then edit.
   - Eye accessories (R1 #8, R2 #5): converting into a cybereye accessory row is refused when
     the source has `secondhand` OR `secondhandFailed`. This covers both paths in
     eye-accessories.mjs, the source-item move and the direct purchase (the candidate), and is
     re-checked on the live source inside the queue, beside the existing `moveProblem` checks.
     Rows have no item to test.
   - Visibility (R1 #10): the FAILED tag and the item-sheet box show whenever `secondhandFailed`
     is true, whatever the grade or the `secondhand` flag. Only a GM can untick it (the field is
     GM-only in `preUpdateItem`). Changing grade or `secondhand` never clears it.
   - Replacing it means buying a new item and deleting the failed one (the existing flows).

7. **Tests.**
   - Vitest:
     - `itemBaseCost` with second-hand standard/alpha/beta = ×.5 / ×1.5 / ×3.5;
     - delta + second-hand = ×10 (ignored);
     - bioware unaffected by a stray `secondhand`;
     - Essence unchanged;
     - the reroll cost helper: 2 × failures, the same on the second reroll.
   - Quench `sr2e.secondhand-cyberware`:
     - buy second-hand alpha → price ×1.5, Essence ×.8;
     - untick second-hand → charged the difference;
     - a second-hand test with dice stubbed to all failures → the reroll charges 2 × 5 Karma Pool,
       and the second reroll charges 2 × the remaining failures;
     - the GM fail button is refused while successes > 0; after it settles, a Karma reroll is
       refused (closed), and a second press does nothing;
     - a wounded tester's TN is the entered TN;
     - chargen: second-hand ware's resource total is half;
     - a failed muscle replacement doesn't lower Reaction;
     - a failed part sells for 0; repair refuses it; re-grading a failed part is refused (no
       refund); grade → delta on a second-hand item is refused, but an existing delta+second-hand
       item still takes a name edit; a player can't untick `secondhandFailed`;
     - a CDS character's equipment test keeps the entered TN;
     - settlement retry: with the item update stubbed to fail once, "Finish" completes it; after
       a GM unticks the box, no Finish button appears;
     - a cyberphobic character's equipment test in a computing-free context keeps the entered
       TN, and the policy zeroes phobiaTN even with a computing tnContext;
     - Karma dice bought before the roll add to the 5 (normal cost);
     - a Karma reroll after settlement is refunded (closed);
     - converting a second-hand or failed item into an eye row is refused;
     - marking failed drops a wired-reflexes item's Reaction and initiative, keeps its Essence,
       and makes a spur not weapon-like;
     - a delta item shows no second-hand UI and is priced ×10.
8. **Docs and cleanup:**
   - fix the stale "nothing consumes damageResist" comment (sr2e-rules.mjs ~2523; cyberdamage.mjs
     reads it);
   - CHANGELOG, QA-PLAN, CLAUDE.md (purchase section);
   - memory: correct the "no printed numbers" claim.

## Key decisions & tradeoffs
- Second-hand is a flag, not a grade (Cybertechnology p.42 makes it orthogonal to standard,
  alpha and beta).
- The half price applies after the grade multiplier ("costs 50 percent less" than the same new
  piece).
- Failure is a GM decision on the card, not automatic: Karma can still change the result, and
  the book makes calling the test the GM's choice.
- The reroll cost is a per-test state field, so no other test changes.

## Risks / open questions
- "2 points of Karma per die re-rolled" combined with the system's reroll-ALL-failures action:
  the cost is 2 × all failures. SR2's reroll always rerolls every failure, so per die means per
  failure rerolled.
- Partial coverage of a failed part's passive functions (vision, smartlink, etc.). Listed, and
  shown on the sheet and card.
- Two GMs pressing the fail button at once only both set the same boolean, which is harmless.

## Out of scope
Tracking "once per adventure"; second-hand bioware (exists); clinic search tests (SSC p.99, a
legwork roll the GM runs).
