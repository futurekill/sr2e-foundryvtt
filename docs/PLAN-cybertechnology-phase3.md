# Plan: Cybertechnology Phase 3a — cyberlimb rules
_Round 3 — revised after Codex rounds 1–3 (see the log at the end). Follows docs/PLAN-cybertechnology.md (roadmap) and
docs/PLAN-cybertechnology-phase2.md (the limb model, approved and built)._

The roadmap's Phase 3 is split in two:
- **3a (this plan):** the limb rules, Cybertechnology pp.49–52 and p.31 (and the
  cybertorso note, p.37).
- **3b (its own plan):** bioware interactions, the cybereye allowance and social
  penalties.

## Goal
Characters' cyberlimbs act on the numbers the book says they do: per-limb Strength and
Quickness with their averages, caps and pair mismatch; Body from limb pairs and Body
enhancements; unarmed Power from cyberhands and feet; bone lacing lost to replacements;
Essence of ware inside a limb (and of cyberguns outside one); and the enhancement
pricing rules (partial limbs, trolls, multiple enhancements). Every rule reads ONLY the
Phase 2 model and its eligibility predicates (`forSideRules` / `forLimbRules`), never
item names.

## Source (rendered pages, read 2026-10-21)
- **p.49:**
  - pairs of cyberlimbs act as dermal plating: +1 Body per pair (arms, legs); partial
    limbs, hands and feet add nothing;
  - one cyberhand or cyberfoot: +1 unarmed Power; any two: +2; more confer nothing;
  - the Cyberware-Cyberlimb Compatibility table, adjusted Essence when wired into a
    cyberlimb: Fingertip Compartment 0, Spurs and Razors (all) 0, Smartgun Links (all)
    .25, Tactical Computer −25% (round down), Orientation System .25;
  - bone lacing can't be performed on cyberlimbs (its armor doesn't apply to them).
- **p.50:**
  - bone lacing: two complete replacements keep the lacing armor; three subtract 1;
    more than three lose it all. One limb (right arm, left leg) = one replacement;
    skull and torso are one each;
  - every cyberlimb has a built-in Strength of 3;
  - when the limb in use can't be told (melee), the player picks:
    - the average Strength of all four limbs (round down), where muscle replacement
      or augmentation adds to each natural limb;
    - or lead with one limb: its Strength, at a TN modifier equal to (that limb −
      the average). The book's example: average 4, lead with Str 5 → +1;
  - Limitations: 3 points of Strength enhancement per limb, each point beyond 3 costs
    +.4 Essence and +25,000¥.
- **p.51:**
  - average augmented Strength ≤ min(2 × Body, Body + 4);
  - partial cyberlimbs:
    - hand/foot Strength enhancement is 65,000¥/point, max +3, no Essence, gripping
      only, never unarmed Power;
    - lower arm/leg is 120,000¥/point, or 60,000¥ if the adjacent hand/foot already
      has enhanced Strength;
  - trolls: a troll's cyberlimb has base Strength 8; Strength above 8 costs the
    standard .4 Essence/point;
  - Quickness enhancement:
    - a pair (arms, legs) must match; otherwise a TN modifier equal to the difference
      on all movement/coordination tests, cumulative across the arm and leg pairs;
    - the average Quickness is taken as for Strength and affects Reaction and
      Initiative;
    - 3 points per limb, each beyond 3 costs +.3 Essence and +20,000¥;
    - average enhanced Quickness ≤ min(2 × natural Quickness incl. bioware,
      Quickness + 4);
  - Body enhancement:
    - pairs only, up to +3 per pair, no Essence;
    - visual Perception TN −1 per point per pair (to notice cyberlimbs);
  - multiple enhancements: a different enhancement type added to a limb that already
    has one costs +10%; bought together, both cost +10%.
- **p.52:** cyberguns in a cyberlimb cost no Essence; in a natural limb or another body
  part, the Cybergun Essence Costs table (hold-out .15, light .35, machine pistol .4,
  SMG .6, heavy 1, shotgun 1.1).
- **p.31:** Strength 150,000¥/pt (1–3), 175,000¥/pt (4+, +.4 Essence/pt); Quickness
  90,000¥/pt (1–3), 110,000¥/pt (4+, +.3/pt); Body 75,000¥/pt.
- **p.37 (module description):** a cybertorso halves (round up) the extra Essence of
  Strength or Quickness enhancements beyond 3 points.

## User rulings (2026-10-21)
- **Multiple enhancements:** the first enhancement TYPE on a limb pays list price; every
  later type pays +10%. Types bought at the same time both pay +10%.
- **Body enhancement:** ONE item per pair, priced once (75,000¥/point). It attaches to
  either limb of the pair and counts only while that limb is in a complete pair.
- **Unarmed Power:** the cyberhand/foot bonus and bone lacing don't stack; the higher
  one applies (as lacing already works: highest wins).
- **Trolls:** no free points. Every Strength point above the troll base 8 costs .4
  Essence.

## Approach

### 0. Phase 2 correction: a lower arm/leg doesn't include the hand/foot
p.30 lists the hand and the lower arm as separate parts ("a part of one like a hand, a
lower arm, a lower leg"). The Essence also adds up: hand .35 + forearm .65 = arm 1. And
p.51 prices a lower arm cheaper "if the adjacent hand already has enhanced strength".
So `SLOTS.forearm` becomes `["arm.lower"]` and `lowerLeg` becomes `["leg.lower"]`. A
forearm and a hand on one side are then two compatible limbs, and a full arm still
conflicts with both. Phase 2 isn't released yet, so this lands before 0.110.0, with its
tests updated (Codex R1 #1).

### 0b. One enhancement of each kind per limb (Codex R1 #2, #3)
The Cybertechnology items are fixed variants (+1 … +6) that already carry their tiered
Essence and price.
- A limb counts ONE Strength option and ONE Quickness option: the highest rating.
- A PAIR counts ONE Body option: the highest, across both limbs.
- Extras are REPORTED ("a second Strength enhancement: only one counts; use the higher
  variant") and add nothing.

This keeps every tier threshold correct, and makes "one item per pair" the rule rather
than a cap.

**One selection, used everywhere (R2 #6).** `selectOptions(model)` returns the counted
option per (limb, kind) and per pair, and every rule reads it: stats, Body, Essence
relief, pricing and the report.
- A rejected duplicate gives no benefit.
- It is still installed ware: it costs its own Essence and keeps its price. The report
  says so.

**Partial limbs take precedence (R2 #5).** A Strength option on a hand, foot, forearm or
lower leg:
- costs NO Essence, for any race (p.51: "no additional Essence");
- has an effective rating of min(rating, 3); over 3 is reported.

The effective rating drives price and the report alike. The generic tier and troll
Essence formulas apply only to options on full limbs.

### 1. The four limbs and their stats (pure, `module/rules/limb-stats.mjs`)
`limbStats(model, ctx)` over the Phase 2 model. `ctx` holds:
- `naturalStrength`, `naturalQuickness`: the actor's attribute values as computed today
  (natural + cyber/bio/adept mods + AE), i.e. the Strength/Quickness of a NATURAL limb.
  This puts muscle replacement/augmentation on each natural limb (p.50);
- `naturalBody` (unaugmented, for the Strength cap);
- `quicknessCapBase`: natural Quickness including bioware (for the Quickness cap);
- `troll` (race).

The four limb positions are left/right × arm/leg. Each position's limb:
- a FULL cyberlimb (arm/leg type) that passes `forSideRules`;
- otherwise the natural limb.

Partial limbs (forearm, lower leg, hand, foot) don't replace a position: their Strength
enhancement is gripping-only (p.51), and they never enter the averages.

Per cyber position:
- Strength = base (3, troll 8) + its counted Strength option's rating.
- Quickness = `naturalQuickness` + its counted Quickness option's rating. The book gives
  no built-in Quickness for a cyberlimb, so an unenhanced limb matches the body.

The averages are the four positions, rounded down:
- `avgStrength`, capped at min(2 × naturalBody, naturalBody + 4);
- `avgQuickness`, capped at min(2 × quicknessCapBase, quicknessCapBase + 4).

A cap that bites is reported, never silently absorbed.

Pair mismatch = |left arm Q − right arm Q| + |left leg Q − right leg Q|. A natural limb
counts at its natural Quickness, so one enhanced cyberarm next to a natural arm
mismatches too. That is our reading of "the difference between the limbs' Quickness
Ratings"; the book's example is a cyber pair.

Only when at least one position is cyber do the averages replace the attributes;
otherwise nothing changes.

**Reaction-eligible Quickness (R1 #5, R2 #1).** The same averaging and cap is run a
second time on an exemption-free baseline (naturalQuickness − reactionExemptQuickness).
EVERY position starts from it: natural positions are the baseline, and cyber positions
are the baseline + their enhancement.
Reaction then uses that average with no further exemption, so an exemption the cap
already removed is never subtracted twice.

**Failed implants (R1 #7).** When `implantsFailed` (Kamikaze), no limb rule applies:
- no averages, pair Body, hand Power or Essence relief;
- Essence is still charged at the item's own value;
- lacing armor is already gated by `workingImplant`.

Failed implants "do nothing", so the limbs give no bonus.

### 2. Applying them (CharacterData only)
- **Ordering:** `_calculateAttributeValues` runs as today. Then the limb step:
  - `strength.value` ← avgStrength;
  - `quickness.value` ← avgQuickness;
  - each gets an "Cyberlimbs (average of four limbs)" source line, so the tooltip still
    reconciles.

  Reaction (which reads `quickness.value`) is computed after this, so the book's
  "affects Reaction and Initiative" holds. Muscle Replacement's reactionExemptQuickness
  keeps its meaning: it's already inside the natural limbs' value.
- **Body:**
  - +1 per complete pair of full cyberarms or full cyberlegs: both sides known and
    eligible, one left and one right;
  - + the pair's ONE selected Body enhancement (§0b), at most +3;
  - a Body enhancement on a limb with no pair, or on a partial limb, is REPORTED and
    adds nothing.

  These go in as `mods.body`, before `_calculateAttributeValues`, with named sources.
  The Strength cap uses natural Body, so this doesn't feed back.
- **Unarmed Power:** cyberhands/feet = eligible (`forLimbRules`) limbs occupying an
  `arm.hand` or `leg.foot` slot: a full limb has its hand/foot; a hand or foot counts,
  but a forearm/lower leg doesn't. An unknown side counts (per-limb rule). The bonus is
  1 → +1, ≥2 → +2.
  - The Unarmed Strike's Power gets max(lacing, cyber).
  - **Lacing stays its own fact (R1 #6):** `_unarmedPowerBonus` keeps the combined
    Power, and a new derived `_boneLacingPower` (lacing only, cleared every pass) gates
    the bone-lacing PHYSICAL option in the dialog (sheet-actions.mjs:599) and in
    `appliesBoneLacingPhysical`. Cyberhands alone never offer it.
- **Bone lacing:**
  - replacements = eligible FULL arms/legs, torso and skull, one each (R1 #12: the book
    speaks of "complete" replacements, and its example is a whole arm or leg). Partial
    limbs don't count;
  - 3 → each lacing item's armor −1 (floor 0);
  - more than 3 → lacing armor 0.

  "Lacing" = an installed cyberware with `unarmedPowerBonus > 0`: that field exists only
  for bone lacing. The Power bonus is untouched (the book removes "armor bonuses").
  Applied in `_calculateArmor`'s implant sum.
- **Melee lead-with:** the melee attack dialog offers "Strength: average N" (default)
  and "Lead with <limb> (Str S, TN +S−N)" for EVERY position (cyber or natural) stronger
  than the average (R1 #14). The choice sets the attack's Strength (damage formula `strength`/`str`
  keys) and adds the TN. Only shown when the averages are in force.
- **Quickness mismatch:** `system.limbs.coordinationTN`, applied in ONE place,
  `SR2EActor#testTnModifiers` (R1 #15). Every roll path already passes `tnContext`
  there: skills, attributes and weapon attacks (item.mjs:598, `tnContext.key`). It
  applies when the test's linked attribute is Quickness:
  - a Quickness attribute test;
  - a skill whose CONFIG linked attribute is Quickness, including weapon attacks
    through that skill.

  It shows as a named line in the TN breakdown.

  **The attack preview (R2 #7):** `promptWeaponAttackOptions` builds its own displayed
  TN. It shows the same coordination line, read from
  `system.limbs.coordinationTN` with the same skill-context test. It is display only and never
  added to the submitted modifiers, so the roll counts it once, in
  `testTnModifiers`.

  The book says "all tests involving movement or coordination of any kind"; this is the
  mechanical approximation, and the dialog's custom modifier still lets the GM add it
  elsewhere.
- **NPCs:** NPC attributes are authored from stat blocks, which already include their
  limbs. No attribute, Body, Essence or Power change for NPCs, and no computed limb
  stats are shown (R1 #16): their authored numbers aren't natural inputs. The section
  keeps Phase 2's identity, sides and reasons.
- **Synthetic actors:** an unlinked-token CHARACTER prepares its own items like any
  character. Quench covers it, and the base actor stays unchanged.

### 2b. Reset contract (R2 #8)
At the START of every CharacterData preparation, before any eligibility check, ALL
limb-derived actor state gets neutral values:
- `system.limbs = { positions: [], avgStrength: null, avgQuickness: null, caps: [],
  coordinationTN: 0, pairBody: 0, handPower: 0, laceReplacements: 0, leadWith: [] }`.
  This is the ONE canonical home (R3 #4): the coordination TN is read as
  `system.limbs.coordinationTN` by `testTnModifiers` and the attack preview. There is no
  separate `limbCoordinationTN`;
- the limb stat lines in `attributeSources`;
- on the embedded Unarmed Strike: `_boneLacingPower` is deleted inside
  `_applyUnarmedPower` on every call, before it's rebuilt. That's the same place and
  pattern as today's `_unarmedPowerBonus`.

**What gates what (R3 #3):**
- Only the AVERAGES, lead-with choices and Reaction re-average are gated on "at least
  one full cyber position".
- The per-limb effects are computed independently from the eligible limbs, and apply
  even with no full position:
  - hand/foot Power;
  - in-limb Essence;
  - lacing replacements;
  - pair Body (which needs full limbs anyway).
- Implant failure neutralises all of them. Quench walks install → conflict → fail → recover → uninstall, each
prepared twice.

### 3. Essence inside and outside a limb
A resolver `limbEssence(item, placement, ctx)` in limb-rules. Precedence, as Phase 2:
- an explicit field;
- then `flags.sr2e.rule`;
- then known source uuids.

New nullable CyberwareData fields:
- `essenceInLimb` (Number|null): the Essence when wired into an eligible cyberlimb;
- `essenceOutsideLimb` (Number|null): the Essence when not (cyberguns).

Table entries cover the core and Cybertechnology items:
- Spurs, Hand Razors, Retractable razors: in-limb 0;
- Fingertip Compartment: 0;
- Smartlink / Built-In Smartgun Link: .25;
- Orientation System: .25;
- Tactical Computer: −25%, rounded down to .01;
- the six cyberguns: out-of-limb per p.52, in-limb 0.

"Wired into a cyberlimb" = attached (linkedLimbId) to a limb that passes
`forLimbRules`. Non-option cyberware (spurs) is attached the same way Phase 2 attaches
options: the item is marked `limbOption` and linked. The shared partial already offers
that.

The cybertorso (an eligible torso) halves, rounding up to .01, the extra Essence of
Strength/Quickness enhancements beyond 3 points.

Trolls: Strength-kind options' Essence = .4 × rating (no free tier, user ruling).
Non-trolls: .4 × max(0, rating − 3), which is what the module's +4..+6 items already
carry. Quickness: .3 × max(0, rating − 3).

**Where it lands (R1 #11):**
- `_collectItemModifiers` first CLEARS `system.limbEssence` on EVERY cyberware item.
- It then builds the model, which reads each option's baseline (`essenceCost`, never
  `actualEssenceCost`).
- It resolves every placement and assigns all markers, and only then sums
  `actualEssenceCost`.
- Nothing reads a marker from the previous pass.
- `actualEssenceCost` uses the marker when present, so the gear tab, the totals and the
  report agree.
- Grade and surgery modifiers apply after it, as today.

### 4. Enhancement pricing
A pure `limbOptionPrice(option, limb, siblings, ctx)` → `{cost, reasons}`:
- **Partial limbs:**
  - a Strength option on a hand/foot = 65,000 × rating (max 3; over → reported, and it
    applies only 3);
  - on a forearm/lower leg = 120,000 × rating, or 60,000 if the same side's
    hand/foot holds a Strength option.
- **Recorded placement facts (R1 #8, R2 #3, #4):** surcharge and adjacency are facts of
  the PURCHASE, so they are recorded, not inferred from live siblings. Each limb option
  carries two authored booleans:
  - `limbSurcharge`: +10%, multiple enhancements;
  - `limbAdjacent`: a lower-arm/leg Strength option at 60,000¥ because the same-side
    hand/foot had enhanced Strength.

  **Reassessed only on the option's OWN attachment change.** When `linkedLimbId`
  changes, both are recomputed for the NEW placement:
  - attached to a limb counting another enhancement type → surcharge on; to an empty
    limb → off;
  - adjacency per the new limb.

  Sibling changes never touch them.

  **Exceptions:**
  - **Rollback (R3 #1):** the purchase hook's rollback update passes
    `sr2eKeepPlacementFacts: true`, which the new hook honours by doing nothing. The
    restored values land exactly as they were.
  - **Single drops (R3 #2):** `unattachDroppedOption` clears `limbSurcharge` and
    `limbAdjacent` along with `linkedLimbId`, so a dropped copy arrives unattached at
    list price. Whole-actor copies and imports keep all three (they don't use the drop
    path).

  **Where they're set (R2 #2).** A separate `preUpdateItem` hook, registered BEFORE the
  purchase hook, injects them into `changes`. It runs for every user and item,
  independent of charge eligibility, so the facts are correct even for unpaid items or
  with auto-charge off. Because they are then real changes, the purchase hook sees them
  as drivers, prices with them, and its rollback restores them with everything else.

  The old surcharge bullets, kept:
  - **Set automatically:** as above.
  - **Editable:** a checkbox on the option ("+10%: added to a limb with another
    enhancement"). The GM ticks it for both items of a same-time purchase, or clears
    it.
  - **Never touched again by siblings:** removing or moving another option doesn't
    change it, so there's no retroactive repricing.
  - Price ×1.1 while the flag is set.
- Otherwise the authored/derived price (Phase 2's `limbOptionCost`) is unchanged; core
  Increased Strength keeps its core price.

**One pricing resolver (R1 #9).** `limbOptionPrice` is called from `itemBaseCost`'s
context (`ctxFor`), so all three paths price the same way:
- the drop prompt (unattached, so list price);
- the preUpdateItem hook, which prices the OLD placement and the NEW, each from that
  side's own `{limbType, limbSurcharge, limbAdjacent}` (all recorded; no live-sibling
  read);
- the gear tab.

`linkedLimbId`, `limbSurcharge` and `limbAdjacent` join PURCHASE_DRIVERS, like `bondedWeaponId`.

The hook's existing single-update transaction is unchanged (R1 #10: concurrent batched
transactions are a pre-existing limitation of the purchase hook, not introduced here).
The shared partial changes one option per user action.

### 5. Sheets
- The Cyberlimbs section gains, per position:
  - Strength and Quickness;
  - the averages, and any cap that applies;
  - the Body from pairs and enhancements;
  - the unarmed bonus;
  - the coordination TN;
  - lacing replacements.
- Each option shows its effective Essence and price with the reason ("in cyberlimb:
  0", "troll: .4/pt", "+10%: second type").
- The attribute tooltip names the cyberlimb average.

### 6. Report-only migration (0.111.0)
Whispers the GM the characters whose derived Strength, Quickness, Body or Essence now
differ because of limb rules. Each is computed with the pure functions from source, old
vs new. Nothing is written. Because a lone unenhanced full cyberarm now LOWERS average
Strength (built-in 3), the CHANGELOG says so plainly.

### 7. Tests
- **Vitest** (`test/limb-stats.test.mjs`), with the book examples:
  - average 3/5/4/7 → 4, lead with 5 → +1;
  - Body 3 → Strength cap 6;
  - troll Body 9 → 13;
  - Quickness 3 → 6;
  - elf Quickness 9 → 13;
  - a pair of arms + a pair of legs → +2 Body;
  - full Body enhancements → +6;
  - one hand +1, two +2, three +2;
  - lacing at 2/3/4 replacements;
  - Compatibility table values;
  - cyberguns in/out of a limb;
  - troll Essence;
  - cybertorso halving;
  - partial pricing incl. the 60,000¥ adjacency;
  - +10% ordering incl. same-time;
  - unknown sides: per-limb rules apply, side rules skip;
  - conflicts excluded.
- **Quench:**
  - a character's attributes, Reaction and Essence change with limbs and revert on
    uninstall, twice prepared;
  - an NPC is unchanged;
  - re-linking an option charges the difference;
  - the melee dialog's lead-with option sets Strength and TN;
  - a coordination TN shows on a Quickness skill test.

### 8. Docs
CHANGELOG, QA-PLAN, CLAUDE.md (Cyberlimbs: the limb rules read only the model;
attributes are replaced by averages only when a cyber position exists).

## Key decisions & tradeoffs
- **Forearm/lower-leg Strength is gripping-only too** (R1 #13, kept): p.51 says "Cyber
  lower arms and legs work like cyberhands and feet, except" for price. So they
  inherit "does not add to the Power of unarmed combat attacks" and stay out of the
  averages.
- **Averages replace Strength/Quickness for everything,** not only melee. The book uses
  the average whenever the limb can't be told; the lead-with choice exists in melee.
  Other "true limb" uses (lifting with one arm) stay GM calls, helped by the per-limb
  numbers on the sheet.
- **A natural limb's Strength/Quickness = the actor's computed value.** This includes
  every non-limb modifier (spells, adept powers, bioware). The book only names muscle
  replacement/augmentation; adding the rest to natural limbs is our reading.
- **Partial limbs never enter the averages.**
- **Coordination TN applies only to Quickness tests and Quickness-linked skills.**
- **Essence by derived marker, not by rewriting authored `essenceCost`.**
- **Pricing via the purchase hook's driver list:** `linkedLimbId` joins it.

## Risks / open questions
- Existing characters with a full cyberarm/leg and no enhancement LOSE Strength (avg
  with a 3). That's RAW, but surprising; the report lists them.
- The melee dialog: need to confirm where the attack's Strength is read (damage formula
  keys `strength`/`str` in item.mjs) so a per-attack override is possible without
  touching the actor.
- Tactical computer "round down" precision (.01) is our choice.

## Out of scope
- Armor per hit location (p.49 averaging; no limb-armor items exist).
- Detecting cyberlimbs and the Body-enhancement perception modifier (shown as a note
  only).
- Secondary damage (Phase 5).
- Dangling/holding and weight (GM guidance).
- Bioware, the cybereye allowance and social penalties (Phase 3b).

## Review log
- **Codex R3 (REVISE), 4 points, all accepted:** rollback bypasses placement-fact
  normalisation; single drops clear the facts; only the averages are gated on a full
  position; one canonical storage location per value.
- **Codex R2 (REVISE), 8 points, all accepted:** an exemption-free baseline for every
  position; surcharge/adjacency injected before the purchase hook; reassessed on the
  option's own attachment only; adjacency recorded; partial-limb precedence; one
  shared selection (duplicates still cost Essence); coordination in the attack
  preview; the reset contract.
- **Codex R1 (REVISE), 16 points:**
  - Accepted: #1 (slots fixed, p.30), #2 and #3 (one per kind/pair), #5, #6, #7, #8
    (recorded surcharge), #9, #11, #12, #14, #15 (testTnModifiers), #16.
  - Kept: #13. The book says lower arms "work like cyberhands and feet".
  - Out of scope: #10. The purchase hook's concurrency is pre-existing.
  - Covered by tests: #4. The new steps ASSIGN from fresh inputs; Quench prepares
    twice.
