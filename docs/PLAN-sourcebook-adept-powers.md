# Plan: the sourcebook adept powers (Grimoire p.34; Corporate Security Handbook p.104)
_Draft 1 (2026-11-25). Today the system prices these powers as `pointCost × level` (`adeptPowerCost` default) and
applies NONE of their effects; the chargen app refuses them. Pages read 2026-11-25: Grimoire 2nd ed. p.34 (text layer,
prose), CSH p.104 (image-only; OCR checked against the page render)._

## The books
- **Attribute Boost** (.5 per level; bought separately per Physical Attribute — Strength, Body or Quickness; not
  Mental, not Reaction). Activation: Success Test, Magic Rating dice vs TN = the attribute's CURRENT value; any success →
  +level to that attribute for (successes) Combat Turns. When it ends: Drain, Willpower vs ⌊boosted value ÷ 2⌋, level by
  the boosted rating against the Racial Maximum (≤ ½ L, ≤ max M, ≤ 1.5× S, beyond D), 2 successes reduce one level, Stun.
  Not compatible with cyber/bioware enhancements or spell increases of that attribute; compatible with Improved Physical
  Attributes.
- **Body Control** (.5 per level): +level dice on the Damage Resistance Test against gases, drugs and poisons.
- **Enhanced Centering** (2 per skill category; 1 per Special Skill): the initiate adept applies Centering to a
  non-physical category (Build/Repair, Combat, Knowledge, Language, Magical, Social, Technical, Vehicle).
- **Missile Parry** (1): catch a slow missile (arrow, thrown knife, shuriken): Reaction (+ Combat Pool by choice) vs
  10 − the attack's range base TN; more successes than the attack's; ties to the attacker; a Free Action.
- **Mystic Armor** (1 per point): Impact armor, cumulative with worn impact armor; at most the current Magic Rating.
- **Suspended State** (1): Willpower + meditative Special Skill dice vs 4 with injury modifiers; effect as Hibernate
  (core p.157).
- **Extended Missile Parry** (CSH, 1.5): Missile Parry for someone protected within 3 m.
- **Enhanced Perception** (CSH): +1 die per level on Perception Tests, priced by the bonus against the racial maximum
  INTELLIGENCE: bonus ≤ ½ max .25 per +1; ≤ max .5; ≤ 1.5× max 1.

## Phase A — creation and derived values (this plan's build)
1. **Identity.** `ADEPT_POWER_SOURCES` gains the Grimoire and CSH compendium sources → keys `attribute_boost`,
   `body_control`, `enhanced_centering`, `missile_parry`, `mystic_armor`, `suspended_state`, `extended_missile_parry`,
   `enhanced_perception`; names in `ADEPT_POWER_NAMES` as the last resort, as for core.
2. **Choices on the item** (AdeptPowerData): `boostAttribute` (StringField, choices body/quickness/strength, blank:true
   — the StringField blank trap) for Attribute Boost; `centeringCategory` (StringField, the eight categories +
   "special", blank:true) for Enhanced Centering. Shown on the power's sheet while blank; editable.
3. **Prices** (`adeptPowerCost`): Enhanced Centering 2 per level, 1 when `centeringCategory === "special"`; Enhanced
   Perception by the tier table against `maxes.intelligence` (`adeptPowerBudget` passes it); the rest `pointCost × level`
   as today. Budget problems: Mystic Armor level > Magic Rating; Enhanced Perception bonus > 1.5 × racial max
   Intelligence; Attribute Boost without an attribute; two Attribute Boosts on one attribute.
4. **CSH content.** The three "Enhanced Perception (Tier n)" items become ONE "Enhanced Perception" (the CSH module,
   packs-src; the old ids kept as deprecated copies? No: replace, with a world note — see Risks).
5. **Mystic Armor** in `_calculateArmor`: `+min(level, magic)` Impact, as a source line; cleared every preparation
   (a derived total, already rebuilt each pass). An adept in animal form? N/A (adepts aren't shapeshifters' forms).
6. **Body Control dice** on the toxin resistance button (`drugs.mjs` ~942, Body, no pool, no armor): +level dice, shown.
7. **Enhanced Perception dice**: a "Perception Test" roll (Intelligence vs a TN asked, core p.?) on the sheet's
   attributes area, with +level dice; the Reflex check (mbw.mjs) is a Perception Test too: +level there.
8. **Enhanced Centering: priced and recorded only.** Read 2026-11-25: the system's Centering is the SPELL path only
   (item.mjs ~1899, Grimoire p.44). An initiated adept's Centering against the TN modifiers of a Physical Skill test
   (Grimoire p.44) is not built, and Enhanced Centering only extends that to its category — so its effect goes to Phase
   B with adept Centering itself.

## Phase B — play rolls (a second plan, after A ships)
Adept Centering against penalties on Physical Skill tests (Grimoire p.44) and Enhanced Centering's categories;
Attribute Boost activation + timed boost + Drain; Missile Parry / Extended (an opposed card against a thrown/projectile
attack card); Suspended State roll + Hibernate effect.

## The app (after the pin moves)
Offer all eight; Attribute Boost and Enhanced Centering ask their choice; `derive` adds Mystic Armor to armor; parity
fixture against Foundry.

## Tests
Vitest: prices (Centering 2/1, Perception tiers for a human and a troll, the rest linear), the budget problems.
Quench: Mystic Armor 3 with Magic 2 → +2 Impact (second preparation after Magic changes); Body Control dice on a toxin
card; the Perception roll's dice; Enhanced Centering's category gate.

## Risks / open questions
- Merging the Enhanced Perception items changes CSH content: worlds holding a Tier item keep it (pointCost × level,
  as today) — a GM can swap it. Alternative: keep the three items and price each by its tier (simpler, but a character
  could buy Tier 3 without Tier 1).
- Where core keeps "Perception Test" today (no roll exists): adding one is new UI.

## Draft 2 — changes after round 1 (these win over Phase A above)
- **r1 #1 Enhanced Centering: one item per category.** Each Enhanced Centering item is ONE purchase: its
  `centeringCategory` (blank:true; the eight categories or "special") and, for "special", `centeringSkill` (text, the
  Special Skill's name). Price 2, or 1 for a Special Skill; `level` is ignored (priced as 1). Budget problems: no
  category chosen; the same category (or Special Skill) twice; the character is not an initiate with the Centering
  metamagic (`magic.initiateGrade ≥ 1` and `magic.metamagic` includes "centering") — Grimoire p.34 "initiate".
- **r1 #2 Enhanced Perception: no content merge.** The three CSH tier items stay. All three sources (and the names
  "Enhanced Perception (Tier n)" / "Enhanced Perception") get the key `enhanced_perception`. The budget prices ALL
  Enhanced Perception items TOGETHER: their levels summed = the bonus, each +1 priced by the tier table against racial
  maximum Intelligence (in item order, like Improved Physical Attributes' `raised`), so which tier item holds a level
  doesn't matter. Problem: the bonus over 1.5 × racial maximum Intelligence. Worlds keep their items; nothing migrates.
  The dice = the same sum.
- **r1 #3 Cost callers:** `AdeptPowerData.powerCost` passes `boostAttribute`/`centeringCategory`; `adeptCostNeedsActor`
  is true for `enhanced_perception` (its price depends on the race).
- **r1 #4 The app** (after the pin moves): one Attribute Boost per chosen attribute, and the budget's new problems
  shown in its creation checks. Recorded for the app's plan; not in this system change.
- **r1 #5 Mystic Armor:** `_calculateArmor` adds `min(Σ mystic armor levels, current magic.rating)` to Impact as a
  separate term computed fresh each pass (from the items, never from the previous `armor.impact`), gated by
  `adeptPowersWork` (the existing human-form/powers gate). Quench: Magic 2 → +2; Essence loss to Magic 1 → +1;
  removed → 0; each on a second preparation.
- **r1 #6 Perception:** no new button. The Intelligence attribute roll's TN prompt gets a "Perception Test" checkbox;
  only then are the Enhanced Perception dice added. The named Perception Tests add them too: `reflexCheck` (mbw.mjs),
  the FAB search (fab.mjs), the chase relocation (chase.mjs). Each one listed in the commit.
- **r1 #7 Content:** the Grimoire items' descriptions corrected (Attribute Boost: any success grants the full level;
  Mystic Armor: Impact only) in packs-src AND the generator (sr2e-grimoire tools), a Grimoire module release.
- **r1 #8 Levels:** `level` keeps its schema (no Magic-based max: a NumberField max would clamp saved data); the Magic
  limit (Mystic Armor) and the racial limit (Enhanced Perception) are budget problems only.
- **Attribute Boost (Phase A part):** `boostAttribute` (body/quickness/strength, blank:true). Problems: none chosen;
  two Attribute Boosts on one attribute. No derived effect in Phase A (activation is Phase B).
- **Round 2 (folded, no round 3):** `adeptPowerBudget` takes `initiateGrade` and `metamagic` (CharacterData passes
  them) for the Enhanced Centering check; a "special" Enhanced Centering with a blank `centeringSkill` is a problem;
  the Mystic Armor problem checks the SUM of levels against `magic.value` (the actor's Magic Rating field — not
  `magic.rating`); Mystic Armor and Enhanced Perception count only for a `physical_adept` whose powers work
  (`adeptPowersWork`), at every Perception roll too; the chase relocation adds Enhanced Perception where the GM computes
  `inputs.dice` (chase.mjs ~330) so the prompt and the roll agree.
