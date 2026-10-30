# Plan: shapeshifter content follow-ups (animal forms on NPC critters)
_Round 2 — revised after Codex round 2_

## Goal
sr2e 0.125.0 shipped NPC alternate forms (`system.forms[]` absolute stat blocks + `system.activeForm`,
applied in `NPCData.prepareBaseData`; weapons tagged `system.form` = a form key). Use it to give the
published shapeshifter critters their animal forms, instead of a "switch by hand" formula in the bio.
Pugot (Cyberpirates hog shapeshifter) is ON HOLD by the user's call: no book prints hog stats.

## Verified source (300 dpi renders)
- Core p.234 Critter Statistics: Shapeshifter (Human) B5 Q4×5 S5 C5 I3 W3 E(8) R5* Humanoid.
  Shapeshifter (Animal) A+2 / (A+1)×(A+1) / A+2 / 5 / 3 / 3 / (8) / 5* / attack (A+1)(A).
  Core p.230: the six common species are Bear, Fox, Leopard, Seal, Tiger, Wolf; "in animal form, a
  shapeshifter manifests as a large, well-formed member of its species".
- Core p.233 normal critters (A): Bear, Large 10/2 4×3 12 9D +1 Reach (user chose Large, per p.230);
  Fox 2 4×4 1 3L −1 Reach; Leopard 5 5×4 5 9S; Seal 6 5×4 4 4M (land ×2); Tiger 8 6×4 8 10S +1 Reach;
  Wolf 5 5×4 4 7M; Dog, Large 3 4×4 3 6M (user chose Large for the malakat).
- Cyberpirates p.149 Malakat: human B5 Q4×5 S5 C5 I3 W3 (8) R5 (NO asterisk → 1D6); animal as core
  but R5 plain; malakat +1 Body +1 Quickness +1D6 Initiative.
- Cyberpirates p.155 Warek (leopard): same blocks; +2D6 Initiative; bane Gold.
- PAE p.67 Kludde: Avian 3 6×3 2 — 2/4 6 (7) 4** 6L −1 Reach (fly ×6); Canine 5 6×6 4 … 5M;
  Feline 2 6×4 2 … 4L −1 Reach. All 3D6 Init. Not a shapeshifter (no Regeneration) — forms only.

## Derived form blocks (form fields: attrs, reactionMod = R − ⌊(Q+I)/2⌋, initiativeDice, armor)
| Critter / form | B (armor) | Q (run) | S | C I W | R / dice | Attack (tagged to form) |
|---|---|---|---|---|---|---|
| Core Bear | 12 (2) | 5 (×4) | 14 | 5 3 3 | 5 → mod 1 / 2 | 10D, +1 Reach |
| Core Fox | 4 | 5 (×5) | 3 | 5 3 3 | mod 1 / 2 | 4L, −1 Reach |
| Core Leopard | 7 | 6 (×5) | 7 | 5 3 3 | mod 1 / 2 | 10S |
| Core Seal | 8 | 6 (×5; land ×3) | 6 | 5 3 3 | mod 1 / 2 | 5M |
| Core Tiger | 10 | 7 (×5) | 10 | 5 3 3 | mod 0 / 2 | 11S, +1 Reach |
| Core Wolf | 7 | 6 (×5) | 6 | 5 3 3 | mod 1 / 2 | 8M |
| Malakat dog | 6 | 6 (×5) | 5 | 5 3 3 | mod 1 / 2 (1+1D6) | 7M |
| Warek leopard | 7 | 6 (×5) | 7 | 5 3 3 | mod 1 / 3 (1+2D6) | 10S |
| Kludde avian | 3 | 6 | 2 | 1 2 6 | mod 0 / 3 | (bio only — PAE critters carry no attack items) |
| Kludde feline | 2 | 6 | 2 | 1 2 6 | mod 0 / 3 | (bio only) |
Kludde's printed actor block stays the canine form (activeForm ""); forms = avian, feline. The feline
S is printed 2 on the render (the generator's note says S1 — fix the note).

## Approach
1. **System (sr2e 0.125.1)**. New helper `formWeaponsOnly(type, sys)` in shapeshift-rules.mjs =
   `inAnimalForm(type, sys) || (type === "npc" && !!sys?.shapeshifter?.enabled && !!activeFormOf(sys))`.
   `weaponUsable` NPC branch becomes: tagged → `tag === (activeFormOf(sys)?.key ?? "")` (unchanged, so an
   orphan tag stays refused even with no forms left); untagged → `!formWeaponsOnly(...)`. Scoped to
   shapeshifter-enabled NPCs (Companion p.36 gear doesn't shift; core p.234 animal attacks only); other
   multi-form NPCs keep untagged weapons in every form.
   - Melee defense (actor.mjs:1688): `natural = formWeaponsOnly(...) && meleeWeapons.length`, so a shifted
     NPC shapeshifter isn't offered "Unarmed (Str)M Stun"; the riposte fallback only runs when no weapon was
     chosen, which then can't happen for it (the option isn't offered when a natural weapon exists).
     After the dialog (actor.mjs ~1783): a chosen weaponId that no longer exists → warn + abort; Unarmed
     chosen while `formWeaponsOnly` and a usable natural melee weapon exists (shifted mid-dialog) → warn +
     abort. Deliberate exception: a restricted form with NO usable melee weapon keeps Unarmed (a data gap
     must not leave it unable to defend). Covers characters in animal form too.
   - NPC sheet: `context.weapons` rows carry `usable`; unusable ones render dimmed with "(other form)",
     still editable. Armor: `armorBase` = the active form's ballistic/impact when a form is active (inputs
     already disabled), so "With worn armor" compares against the form, not the printed block.
   - Unit tests (shapeshift-rules.test.mjs): untagged usable in printed form; refused in a form for an
     enabled NPC shapeshifter; allowed in a form for a non-shapeshifter NPC; orphan tag with forms=[] refused.
2. **System pack** `packs-src/critters/Shapeshifter_*.json`: Essence 6 → 8 (printed (8); 0.122.0 lifted
   the cap); cite p.234 (was p.233); six forms (keys bear/fox/leopard/seal/tiger/wolf, names
   "Bear form" …, img ""), six tagged Natural Attack weapons; bio: "keep the one form your shapeshifter
   has, delete the other five"; running multipliers + seal's land ×3 in the bio. Rebuild packs.
3. **Cyberpirates** `gen-critters.mjs`: SHIFT takes a form block; critter() emits `forms`, `activeForm: ""`,
   `shapeshifter: { enabled: true, bane }` (silver / gold — Malakat/Warek currently lack it), a tagged
   Natural Attack. Pugot stays human-only with an "animal form not published — on hold" note.
   Regenerate, check art survived (every actor img / token texture resolves to a file on disk — one-liner), re-snapshot schema.json to 0.125.1,
   bump module minimum to sr2e 0.125.1, version 0.5.0.
4. **PAE** `gen-critters.mjs`: optional `forms` on a record; Kludde gets avian + feline; minimum sr2e
   0.125.0 (forms schema; no attack items so the weaponUsable change doesn't matter); version 0.3.0.
5. Quench (`sr2e.shapeshifters`): import the core Shapeshifter from the pack, shift to wolf — derived
   B7 Q6 S6 R5, armor 0, sheet context marks Unarmed Strike unusable and Wolf attack usable; shift to bear
   — armorBase 2/2; shift back — printed block (B5, Essence 8) restored. Live: screenshot the wolf sheet.
6. Form-data validation: each module's validate-packs.mjs (and a system vitest over packs-src/critters)
   checks every `forms[]` entry is the flat contract {key,name,img: string; body..willpower, ballistic,
   impact: integers ≥ 0; initiativeDice integer ≥ 1; reactionMod any integer}, keys non-blank and unique,
   embedded item _ids unique per actor, and every embedded
   weapon's `system.form` is "" or an existing form key.
7. CHANGELOG + QA-PLAN + README minimums + package.json and package-lock.json root versions in each repo; release system first, then modules.

## Key decisions
- One generic core critter with all six forms (GM deletes the unneeded five) vs six actors: chosen to
  avoid six new portraits and keep the core pack's doc count/IDs stable.
- Untagged = printed form only (step 1) instead of tagging the human attacks with a duplicate "human" form.
- Form armor = the animal's printed armor (bear /2); the shapeshifter row modifies Body only.

## Risks
- Any shapeshifter-enabled NPC in an active alternate form with untagged gear loses that gear while in a form (intended RAW).
- Regenerating Cyberpirates wipes art if artFor misses (it derives from files; verify).
