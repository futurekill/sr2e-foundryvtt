# Plan: the Reflex Recorder (Shadowtech p.27)
_Draft 2 (2026-11-20), built (2 Codex plan rounds; r2 folded). Deviation, recorded here: the die reaches the general skill paths (sheet and named rolls, weapons, melee defense, vehicles, Conjuring, Centering); the Matrix, electronic warfare, First Aid and spell-learning tests were done in a second commit (`_passiveSkillDice`). Release/0.161.0 work (ships after the Friday game). The chargen app offers it afterwards._

## The book (p.27, prose; the numbers checked against the item data)
Each recorder "learns" ONE Active or Vehicle skill (not a B/R skill) at **+1 die to all Success Tests** with it, from
then on, automatically. The skill can't be changed (barring surgical reprogramming). Two sizes: **General** (a whole
skill; Body Cost .25, 25,000¥, Avail 8/6 days) and **Concentration** (one Concentration; .1, 10,000¥, 5/6 days). Not
cumulative: never more than one die on any one skill; more recorders can cover more skills. Not compatible with
skillwires: no bonus to a skill acquired through skillwires or skill hardwires.

## System
1. `BiowareData.recordedSkill` (StringField, initial "", plain — no choices, so no blank trap): the learned skill's
   NAME, or for the Concentration size the concentration's name. No migration (initial).
2. Ware identity: `WARE_SOURCES` gains `reflex-recorder` (the Shadowtech General item, `6fac01c3ca92526c`), and a new
   Shadowtech item **Reflex Recorder (Concentration)** (Body Cost .1, 10,000¥, 5/6 days, p.27) also `reflex-recorder`
   with `recorderSize: "concentration"` (a field on BiowareData, initial "general").
3. A pure rule `reflexRecorderDice({ recorders, skill, variant })` in sr2e-rules.mjs: 1 when a WORKING recorder of the
   right size names this skill (general: the skill's name; concentration: the skill's concentration name, only on a
   concentration roll), the skill is `active` (not build_repair, knowledge, language), and the skill is not chipped
   (`_chipped`); else 0. Names compared normalized (case, spaces), as `_applyAdeptSkills` does.
4. `SR2EActor#_activeSkillBonus(skill, variant)` adds it to Enhanced Articulation's dice — the one hook every skill
   roll path already calls (actor.mjs 1455/1548/1973, item.mjs 766). The variant (base / concentration /
   specialization) passes through where those paths know it. A specialization roll counts as its concentration's? No:
   the book names General skills and Concentrations; a specialization roll of a recorded General skill gets the die
   (it's a test of that skill); a Concentration recorder gives it only to that concentration's rolls (and its
   specializations, which are narrower tests of it).
5. The skills list shows a badge "◉+1 (Reflex Recorder)" beside the skill (the adept badge's pattern).
6. The bioware item sheet gets a "Recorded skill" text field (and size) when the item is a reflex recorder.

## Tests
Vitest: `reflexRecorderDice` — general on its skill, nothing on another skill, nothing on B/R, nothing when chipped,
two recorders on one skill still 1, concentration only on its concentration's roll. Quench: a character with a
recorder gets the die in the roll's pool and the badge; removing the recorder clears it (the second-prepare rule).

## The app (sr2e-chargen, after this ships and the pin moves)
Offer both sizes with a `skill` choice (a skill record of the character; for Concentration, one of its
concentrations); projection writes `recordedSkill`; validate refuses a B/R skill and two recorders on one skill.

## Out of scope
Surgical reprogramming; the Toxin Exhaler (its toxin is a separate purchase at 100× a dose — its own plan).

## Draft 2 — changes after round 1 (these win)
- **One helper for a skill's implant/power dice (r1 #1–#4).** `SR2EActor#_skillBonusDice(skill, tier)` = the
  adept's `_adeptBonus` + Enhanced Articulation (`_activeSkillBonus`) + the recorder die, computed for the tier
  actually rolled (`"base" | "concentration" | "specialization"`). Every direct skill-to-dice path calls it AFTER
  deciding trained vs defaulted from the unmodified rating: no bonus while defaulting (the test isn't using the
  learned skill). Inventory to convert (each one listed in the commit): skill rolls and rollNamedSkill
  (actor.mjs ~1450), skillsoft rolls (~1548: a chip never gets the recorder), weapon rolls (item.mjs ~760–800, the tier
  resolved first, the name fallback included), `_vehicleSkill` (vehicle control, ramming, Rigger 2 driving — the die
  joins the test, Control Pool caps stay on the rating), Conjuring (~1591), spell learning (Sorcery, Magical Theory),
  First Aid (Biotech), Matrix Computer tests, Centering (item.mjs ~1899), electronic warfare (ew.mjs ~43). Rating-based
  LIMITS stay on the rating everywhere. A Vitest greps these files for the old pattern so a new path can't skip it.
- **Identity (r1 #5).** `recordedSkill` holds the skill's name; the Concentration size adds `recordedConcentration`
  (that skill's concentration name). A General recorder gives its die on that skill's base, concentration and
  specialization rolls; a Concentration recorder on rolls of that concentration of THAT skill, and of a specialization
  only when the skill's specialization is recorded under that concentration (`specialization` belongs to the skill's
  one concentration in this schema, so: when the recorded concentration is the skill's concentration).
- **Fixed once chosen (r1 #6).** The item sheet edits the choice while it is blank; once set, only a GM can change it
  ("surgical reprogramming", p.27).
- **Working implants (r1 #7).** Every lookup uses `workingImplant(actor, item)`; the derived `_recorderBonus` and its
  badge are cleared on every preparation before rebuilding; Quench covers chip in/out, damage, destruction, secondhand
  failure on a second preparation.
- **Content (r1 #8).** `../sr2e-shadowtech/tools/gen-bioware.mjs` emits both sizes with stable ids and the
  `recorderSize`/`flags.sr2e.rule: "reflex-recorder"` fields, keeping p.118's Street Index 1.5 and Legal; a Shadowtech
  release with `relationships.systems` minimum 0.161.0, after the system's.
- **Chargen (r1 #9).** Refuse two General recorders on one skill and two Concentration recorders on one concentration;
  allow different concentrations of one skill; a General plus a Concentration recorder on the same skill still give one
  die per test (the rule's max is 1).
- **Round 2 (r2 #1, folded; a ruling):** defaulting is decided from the unmodified rating and takes its Skill Web
  penalty; the recorder die is added after, also when defaulting and also through `rollNamedSkill` with no owned skill
  item (p.27: "+1 die to all future Success Tests", no minimum rating). Rulings page entry in the same change.
