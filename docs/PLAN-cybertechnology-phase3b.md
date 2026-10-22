# Plan: Cybertechnology Phase 3b — cybereyes, bioware with cyberware, social penalties
_Round 4 — revised after Codex rounds 1–4 (log at the end). Follows docs/PLAN-cybertechnology.md (roadmap
§Phase 3) and Phase 3a (docs/PLAN-cybertechnology-phase3.md, released in 0.111.0)._

## Goal
The rest of the roadmap's Phase 3:
1. **Cybereyes and accessories (p.45):** single eyes, the grade-before-allowance
   order, the physical cap, and the weapon slots.
2. **Bioware with cyberware (pp.56–57):** the adrenal pump and suprathyroid
   efficiency, enhanced articulation's lost Reaction, and cheaper muscle
   replacement/augmentation with cyberlimbs.
3. **Social penalties (pp.57–58, optional):** the Charisma/social TN modifier and the
   contact check.

Every rule reads item IDENTITY from resolvers (`flags.sr2e.rule` → known source
uuid for ware; Phase 2's explicit field → flag → uuid for limbs), never names. Limb facts come only from the Phase 3a model
(`limbModel`, `forLimbRules`, `system.limbs`).

## Source (rendered pages, read 2026-10-22)
- **p.45, cybereyes:**
  - a pair costs .2 Essence and absorbs .5 of accessories free;
  - for beta/delta eyes, "make the necessary adjustments for Essence loss BEFORE
    considering the .5 allowance";
  - a single eye costs 60% of the price, .1 Essence, and absorbs .25;
  - accessories that need a pair (low-light, thermographic, cameras) work about
    half as well in one eye. Single-eye vision magnification gives +4 to Combat
    Test TNs while active;
  - at most 1.2 Essence of accessories per pair, including the free .5. The GM
    "should seriously consider" this;
  - one weapon system per eye;
  - a tool laser counts as that eye's weapon;
  - an eye with a cybercam can't hold a weapon or a tool laser;
  - eye weapons and lasers only mount in a cybereye.
- **p.56, adrenal pump:**
  - efficiency 100%, −15% per cyberlimb, −10% per partial cyberlimb, −5% per
    cyberhand/foot, −20% for a cybertorso, cumulative;
  - the bonus × efficiency, ROUNDED DOWN per attribute. The book's example: a
    cyberleg, a cyberhand and a cybertorso give 40% off, so a Level 2 pump's +2
    becomes 1.2 → +1, and its +4 Reaction becomes 2.4 → +2;
  - a Reaction Enhancer reduces the pump's bonuses by 50%;
  - pumps don't work with move-by-wire.
- **p.56, other bioware:**
  - Damage Compensator: doesn't affect cyberlimbs;
  - Enhanced Articulation: can't go in a cyberlimb. Its Reaction gain is LOST if
    the character gains a Reaction bonus from Quickness-enhanced cyberlimbs, or if
    more than two limbs are partly or wholly cyber.
- **pp.56–57, muscle replacement/augmentation:** applies to natural muscle. Each
  cyberlimb reduces "the Essence Cost and the purchase price for each point" by
  20% (round fractions up). The Strength side is 3a's limb averaging, already done.
- **p.57, more bioware:**
  - Suprathyroid: affected by cyber "in the same manner as adrenal pumps"; only
    major-scale replacements make it useless; incompatible with move-by-wire;
  - Synaptic Accelerator and move-by-wire: Phase 4;
  - Synthacardium: its Athletics bonus isn't cumulative with cyberlimb bonuses.
- **pp.57–58, social:**
  - optional: +1 to Charisma and Charisma-based skill TNs per 2 points of Essence
    (or portion above .5) below 6;
  - invisible ware may not count, datajacks never, wired reflexes and move-by-wire
    should, disguised ware depends on Perception, flagrant ware +1;
  - a minimum +1 above 3.0 lost;
  - offsetting factors (tailored pheromones) are the GM's call.
- **p.58, contacts:**
  - for characters whose cyber Essence loss exceeds .5;
  - once per run, or when new ware is added, a Charisma test at TN 3 + the
    modifier, which here applies even to non-obvious ware;
  - the Contact Reactions Table: 4+ unaffected; 3 aloof; 2 avoids the runner,
    +1 to later Charisma/social TNs; 1 consistently avoids, +1; 0 shuns, won't help
    unless coerced;
  - at most one contact lost per test period.

## User rulings (2026-10-22)
- **Social TN:** loss ≤ .5 → 0; otherwise ceil(loss / 2). So 1 → +1, 2.4 → +2.
- **Social use:** a world setting enables it. Charisma and social-skill roll dialogs
  then show a pre-ticked "Cyberware (social) +N" box that can be unticked for that
  roll, and the sheet shows the current N.
- **Muscle replacement/augmentation:** only FULL cyberarms/legs count, 20% each.
  Replacement: Essence and price. Augmentation (bioware): Body Cost and price.
- **Pump + Reaction Enhancer:** the reductions ADD (a cyberleg and an enhancer give
  65% off), with a floor of 0%.
- **Suprathyroid:** only MAJOR replacements reduce it: full cyberarms/legs (−15%)
  and a cybertorso (−20%). Its +1s round to 0, so one such replacement makes it
  useless. Hands, feet and lower limbs don't touch it.

## Approach

### 0. Preparation contract (R1 #1, #3, #4, #5)
- **The PHYSICAL limb model, source-only (R2 #4):** `physicalLimbs(itemSources)`
  runs `limbModel` over plain `_source` objects (plus each item's flags and source
  uuid), with no prepared getters, so it can't recurse into cost derivation or read
  a marker. It counts installed limbs regardless of Kamikaze failure.
  - The actor builds it once at the start of `_collectItemModifiers`.
  - Item preparation (displayed price), the purchase hook, the drop prompt, chargen
    and the surgery preview call the same helper on the actor's sources.
  - It feeds pump efficiency, the muscle discount and the articulation position
    count. 3a's functional rules keep their `working` gate.
- **Clear first, unconditionally (R2 #3):** at the start of the pass, the actor
  deletes `limbDiscount` from EVERY embedded cyberware and bioware item, before
  resolving any identity or reading any cost getter. It then assigns them, and only
  then sums Essence and Body Cost. So Body Index and awakened Essence see this
  pass's values, and an item whose identity changed keeps nothing.
- **One effective bonus per attribute:** the bioware loop's `scale(key)` (rating ×
  MAO) gains the efficiency factor, and the floor is taken there. Every consumer
  reads that one value: `mods[key]`, `mods.sources`, `reactionExemptQuickness`,
  `biowareQuickness`.
- **Articulation after the averages:** enhanced articulation's Reaction is collected
  into a separate `mods.articulationReaction` and added to `reaction.mod` only after
  `_applyLimbAverages`, where the suppression test (§3) can see this pass's limb
  numbers.

### 1. Identity (pure, `module/rules/ware-rules.mjs`) (R1 #12)
`wareRule(flags, source)` → a rule key or null. Precedence: `flags.sr2e.rule`, then
the legacy `flags.sr2e.adrenalPump`, then the source-uuid table. There is no new
explicit field: these items are catalogue items, and a GM can set the rule flag.
- Keys: `adrenal-pump`, `suprathyroid`, `enhanced-articulation`,
  `muscle-augmentation`, `muscle-replacement`, `reaction-enhancer`,
  `cybereye-pair`, `datajack`.
- MAO's pump check switches to the resolver.
- Table entries cover the core, Shadowtech and Cybertechnology items by uuid. No
  names.

### 2. Cybereyes
- **New fields:**
  - CyberwareData `eyes: "pair" | "single"` (initial "pair"; no blank);
  - module rows gain `kind` ("" | weapon | toolLaser | camera; blank:true, initial
    "") and `eye` ("both" | "left" | "right"; initial "both").
  - Old documents get the initials on load, so nothing is invalid (checked after a
    reload via `invalidDocumentIds`).
- **Single eye, without rewriting authored fields (R1 #11):**
  - `actualEssenceCost` uses base = .1 and allowance = capacity × .5 (.25 for the
    standard .5);
  - the price is × .6 in `derivedItemCost`'s cyberware branch, so drops, upgrades,
    the hook and chargen all agree;
  - `essenceCost` and `capacity` keep their authored pair values, so switching back
    is exact and the sheet never edits a derived number.
- **Order (p.45), scoped to what's printed (R1 #13):** for a `cybereye-pair`
  identity with a non-standard grade:
  - `actualEssenceCost` = grade(base) + max(0, grade(Σ rows) − allowance), then
    surgery;
  - `gradeEssenceCost` is applied to the row SUM, so the .05 floor applies only when
    the sum is above 0;
  - the standard grade is unchanged (the order is moot);
  - other containers (cyberears) keep today's order.
- **Physical cap:** compares the UNGRADED row sum to 1.2 on a pair. The cap is
  physical space, and grade doesn't shrink parts. It is reported only.
- **Slots:**
  - per eye, at most one weapon/toolLaser row. With `eyes = single`, every row is in
    the ONE eye, whatever its left/right/both label (R2 #5);
  - none in an eye with a camera row;
  - a weapon/toolLaser row with eye "both" → "set which eye";
  - rows with kind "" are counted as plain accessories, and the item sheet shows
    "N rows unclassified: set Weapon / Tool laser / Camera so the slot rules can
    check them" (R1 #10);
  - all reported on the item sheet, never blocking.
- **Single-eye notes:** half-effective pair accessories and +4 magnification are a
  note only.
- **Cut (R1 #9–#10):** dropping an accessory item onto an eye to make a row. Done
  correctly it needs its own purchase/conversion/rollback design. Rows stay
  hand-entered, as today.
- **`eyes` joins PURCHASE_DRIVERS (R1 #7):** pair → single refunds and single →
  pair charges, priced on both sides through the shared helper.

### 3. Bioware with cyberware (CharacterData only)
- **Efficiency** (pure `pumpEfficiency(counts, {enhancer})`, from the PHYSICAL
  model's `forLimbRules` limbs):
  max(0, 100 − 15·(full arm/leg) − 10·(forearm/lowerLeg) − 5·(hand/foot) −
  20·(torso) − (pump && an installed reaction-enhancer ? 50 : 0)) / 100.
  - Each attribute's effective bonus = floor(rating-scaled, MAO-limited bonus ×
    efficiency) (§0).
  - Suprathyroid (user ruling) counts only full arms/legs and the torso: no partial
    limbs, hands/feet or enhancer. A cyberhand leaves it at full strength; a
    cyberarm makes it +0.
  - The skull reduces nothing.
  - Source lines read "Adrenal Pump (60%)".
- **Enhanced articulation (R1 #2):** its Reaction is dropped when EITHER:
  - the character's Reaction base WITH the counted cyberlimb Quickness options
    exceeds the Reaction base computed with those options removed (both through
    3a's averaging and caps), i.e. the limbs really give a Reaction bonus; or
  - more than two of the four positions (side × arm/leg family) hold any eligible
    cyber part (hand, forearm, full limb). Counted on the PHYSICAL model, known
    sides only (R2 #6). Unknown-side parts aren't guessed: they're reported on the
    item ("set the limbs' sides to check enhanced articulation").

  The Reaction-gain test uses this pass's functional averages, so with implants
  failed there's no gain from limbs.

  The +1 active-skill die always stays. `limbStats` gains an option to ignore
  Quickness options, so both bases come from the same code.
- **Muscle replacement / augmentation:** n = eligible FULL cyberarms/legs in the
  physical model (≤ 4). The item's Essence (replacement) or Body Cost (augmentation)
  is × (1 − 0.2n), rounded UP to .01.
  - **Where:** set as the live `limbDiscount` marker (cleared first, §0), read by
    `actualEssenceCost` / `actualBodyCost`. Grade/culturing applies after the
    discount, and that ORDER is tested with cultured augmentation.
  - **Price (R1 #4, #6–#8, R2 #2): no recorded field, applied ONCE.**
    - `itemBaseCost(sys, ctx)` multiplies by `musclePriceFactor(n)` = (1 − 0.2n),
      rounding up to the nuyen, AFTER it picks the undiscounted price (derived, or
      the rating-table row from the AUTHORED cost) and before the grade multiplier.
      Only when `ctx.wareRule` is a muscle identity.
    - `derivedItemCost` doesn't apply it, so nothing applies it twice.
    - Every caller passes `ctx.wareRule` (resolved from the item's flags/source) and
      `ctx.fullCyberlimbs` (from `physicalLimbs`): the drop prompt (catalogue data,
      undiscounted), the purchase hook, `chargenItemCost` (its projection keeps
      flags/source; the call sites are listed in the implementation), and the
      item's displayed cost.
    - Callers: the drop purchase prompt (`actor-sheet.mjs` → `itemBaseCost`), the
      purchase hook (`ctxFor`, with the actor's current count for BOTH sides, so a
      rating change transacts consistently), chargen accounting and the item's
      displayed cost (the item reads the count from its parent actor's items'
      SOURCE, like 3a's limb pricing).
    - Copies and imports don't go through the purchase prompt, so nothing is
      re-stamped.
    - A limb added later changes the displayed price, but nothing is charged or
      refunded: only PURCHASE_DRIVERS transact, and limbs aren't one. The CHANGELOG
      says so.
- **Surgery (R2 #1, R3 #2):** `_surgeryPreview`'s unembedded candidate gets the same
  pure discount from the receiving character's `physicalLimbs`.
  - When the candidate is a limb, the preview builds the HYPOTHETICAL
    post-installation physical model (the actor's sources + the candidate, R4 #1)
    and takes its actual eligible full-limb count n′. An overlapping limb can LOWER
    the count.
    - It then adds Σ over existing INSTALLED muscle items of (Essence at n′ −
      Essence at n), and for an awakened character the same for muscle
      augmentation's Body Cost. That's a pure helper over the sources.
    - Tested with a second left arm (overlap, so the count drops) and with an
      uninstalled muscle item (ignored).
  - The TN, category, fee and remaining Essence then match the post-installation
    inventory.
- **NPCs (R1 #16):** none of §3 or §4 (their stats are printed). Item-level eye
  Essence still computes, but NPC Essence is authored, so nothing moves.
- **Not automated:** move-by-wire (Phase 4), cyberlimb damage (Phase 5),
  Synthacardium (notes).

### 4. Social penalties (optional; characters only)
- **Setting:** world setting `cyberSocial` (default false).
- **Visibility:** cyberware `socialVisibility` ("" | normal | hidden | ignored |
  flagrant; blank:true). "" = the identity default: `ignored` for a datajack,
  `normal` otherwise. `normal` lets a GM count a datajack (R2 #7).
- **Losses, over INSTALLED cyberware regardless of failure (R1 #14):**
  - `visibleLoss` = Σ actualEssenceCost of items not hidden/ignored;
  - `totalLoss` = Σ over all items except ignored.
- **Float safety (R3 #3, R4 #2):** the loss keeps its full precision, and the
  comparisons are tolerance-aware with EPS = 1e-9:
  - `loss > .5 + EPS`;
  - `Math.ceil(loss / 2 - EPS)`;
  - `loss > 3 + EPS`.

  Tests: twenty .1 items (2.0000000000000004 → +1), .504 (→ +1), 2.004 (→ +2), and
  .5 exactly (→ 0).
- **`social-rules.mjs`:**
  - `socialTN(loss) = loss <= .5 ? 0 : ceil(loss / 2)`;
  - `situationTN = max(socialTN(visibleLoss) + (any flagrant ? 1 : 0),
    totalLoss > 3 ? 1 : 0)`;
  - `contactTN = socialTN(totalLoss)`;
  - contact checks are required only when totalLoss > .5.
- **On characters:** `system.social = {visibleLoss, totalLoss, situationTN,
  contactTN}`, derived every pass REGARDLESS of the setting (R2 #8). The setting
  gates only presentation and application, read at render/roll time, so toggling
  it needs no actor re-preparation (world or synthetic).
- **Rolls (R1 #15):**
  - `promptRollOptions` takes a `context {attribute, skillKey}` from every caller;
  - when the setting is on and the linked attribute is charisma, it renders a
    pre-ticked "Cyberware (social) +N" box and returns `socialTN`;
  - each caller forwards `socialTN` into `rollSuccessTest`, which adds it as its
    own named line in `testTnModifiers` (`socialTN`, like `coordinationTN`);
  - callers that rebuild options are updated and listed in the implementation.
- **Contact check:**
  - its own path: Charisma at TN 3 + `contactTN`, passed explicitly, with no
    `socialTN` (no double modifier) and no Combat Pool;
  - it posts the Contact Reactions Table result. 2/1 successes say "+1 to Charisma
    and social TNs with this contact" (not stored).

### 5. Report-only migration (0.112.0)
Whispers the GM:
- graded cybereyes whose Essence changes (old vs new from source);
- characters whose pump, suprathyroid, articulation or muscle numbers change;
- eyes over the cap, or with weapon rows needing an eye.

Nothing is written.

### 6. Tests (R1 #17)
- **Vitest:**
  - the pump example (40% → +1 / +2), enhancer + leg = 35%, floor 0;
  - suprathyroid: one cyberhand → +1s kept, one cyberarm → +0;
  - a surgery preview for a cyberarm crediting existing muscle Essence;
  - articulation: one +1 Quickness option lost in the average keeps it; a real
    Reaction gain drops it; three positions drop it;
  - muscle n = 0..4 with rounding;
  - cultured augmentation (discount then culturing);
  - the eye order for each grade, a row sum of 0, the .05 floor;
  - single eye .1 / .25 / 60%;
  - cap and slots;
  - `socialTN` at .5, .6, 1, 2, 2.4, 3.1; the minimum, flagrant, hidden vs
    contactTN, datajack ignored;
  - contact table 0–4+.
- **Quench (transitions, each prepared twice):**
  - pump with leg + hand + torso, then remove the torso, then Kamikaze failure
    (efficiency unchanged, bonuses gated as today);
  - muscle augmentation's Body Index and an awakened character's Essence together
    as limbs are added and removed;
  - an eye pair → single → unrelated sheet save → pair, with Essence and price
    exact and the purchase refund/charge (and a vetoed unaffordable change);
  - old documents load valid after the schema add (`invalidDocumentIds` empty);
  - a Negotiation roll with the box ticked and unticked;
  - a contact check;
  - toggling the setting without editing an actor;
  - removing a muscle identity flag (the marker goes);
  - a surgery preview with a cyberlimb discount;
  - a flat-priced and a rating-table muscle purchase;
  - single-eye conflicting rows;
  - an NPC is unchanged;
  - two unlinked tokens of one character with different ware stay independent.

### 7. Docs
CHANGELOG, QA-PLAN, CLAUDE.md (identity via ware-rules; the physical vs functional
limb model; social is optional and setting-gated).

## Key decisions & tradeoffs
- **Reports, not blocks,** for the eye cap and slots: the book says "should
  seriously consider".
- **The eye order applies to graded cybereyes only** (what p.45 says); cyberears
  keep today's order.
- **Essence and price follow the live limbs; only purchase drivers transact.** A limb added later changes the shown price, but nothing is charged or refunded.
- **Social modifier through the dialog only.**

## Risks / open questions
- Changing the eye Essence order moves existing characters' Essence. It's reported,
  but it's a visible change.
- The existing core cybereye ships pre-listed rows; Phase 0 made them cost Essence.
  The cap report may flag those eyes. The report says why.

## Out of scope
- Move-by-wire interactions and the synaptic accelerator (Phase 4).
- Cyberlimb damage (Phase 5).
- Synthacardium automation.
- Tailored pheromones offsetting the social penalty (the GM's call).
- Tracking contact attitudes over time.

## Review log
- **Codex R1 (REVISE), 17 points:**
  - Accepted: #1–#8, #11–#17.
  - #9 and #10: accessory drop-to-row is cut, and unclassified rows are reported on
    the item.
  - #13: the eye order is scoped to graded cybereyes only, and the cap is read
    ungraded (physical).
- **Codex R2 (REVISE), 9 points, all accepted:** surgery candidates get the
  discount; one pricing contract applied once in `itemBaseCost`; clear markers
  unconditionally; a source-only physical model; a single eye is one slot set;
  articulation counts physical known positions; a `normal` visibility choice; social
  values derived regardless of the setting; summaries fixed.
- **Codex R3 (REVISE), 3 points:**
  - #1: the user ruled suprathyroid is reduced only by major replacements;
  - #2: the surgery preview credits existing muscle Essence when a full limb goes in;
  - #3: losses are rounded to the hundredth before thresholds.
- **Codex R4 (REVISE), 2 points, both accepted:** the surgery preview uses a
  hypothetical post-installation model; social thresholds use epsilon comparisons
  instead of rounding.
