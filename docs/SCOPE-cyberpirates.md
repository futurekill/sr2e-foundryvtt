# Scope: Cyberpirates! (FASA7124, 1997, SR2) — draft for review
_2026-10-28. The PDF is image-only: OCR'd with tesseract for scoping; every number used in content
must be read from a rendered page (the source-captures rule)._

## What the book has (PDF pages; book folios to be read when rendering)
**Fiction/setting (PDF ~6–147):** Caribbean League, Philippines (Huks), West Africa, Madagascar,
long-haul piracy — NPC groups, places, some stat blocks inside. Not mechanics.

**Game information (PDF 148–194):**
| Area | PDF pages | Kind |
|---|---|---|
| Creating pirate characters, Availability, **Edges and Flaws** (Sea Madness, Water Sprite, …), Skills | 151–153 | content + small rules |
| Decking and piracy, ship designations | 154 | rules notes |
| **Critters**: Caribbean (Chupacabras …), Philippine (Aswang, King Cobra, Kiwigs, Reticulated Python …), West African | 156–163 | content (critter actors) |
| **Underwater adventuring**: swimming, treading water, diving (shallow/deep, Safe Diving Time Table, ascent/buoyancy, hazards), perception/vision under water, combat (surface-to-surface, underwater), magic (sorcery, conjuring, astral), damage (drowning, exploding tanks, keel-hauling) | 164–171 | rules (system) |
| **Ship rules**: ship attributes (speed/cavitation, hull, bulwark, signature, sonar, depth, accommodation, load), operations, crews, terrain, ship combat, ramming, running aground, boarding, weapon systems, missiles, ship damage, damage control, taking on water, repair, underwater operations, sensors/sonar, thermoclines, underwater vehicle combat | 171–178 | rules (system, large) |
| **Equipment**: melee/projectile weapons (harpoon gun, speargun, sling launcher), firearms (FN-AAL gyrojet pistol …), explosives | 179–181 | content (weapons) |
| **Diving equipment** (standard diving gear table, OXSYS artificial gill, diving armor, dual tank manifold, full mask, breathing helmet, LBA) | 181–183 | content (gear/armor) |
| **Cyberware** (OXSYS cybergill, cyberfins, nitrogen monitor, peg legs and hook hands) | 183 | content (cyberware) |
| **Vehicles**: motorboats, bancas, Mitsuhama Anago, rotorcraft, ships (liner, freighter, corvette, frigate), submarines (several); ship weapons (missiles, naval guns); vehicle accessories (torpedo probe, noisemaker, decoy) | 184–191 | content (vehicles); ships need the ship attributes |

## Proposed phases
1. **Content module `sr2e-cyberpirates`** (the existing module pattern: packs-src + generators +
   build-packs + validate + lint + QA-PLAN): weapons, diving gear/armor, cyberware, critters,
   Edges & Flaws (as the Companion module models them), small craft that fit the current vehicle
   model. Custom art like the other modules.
2. **Underwater rules (system, optional setting):** diving time/hazards, underwater vision
   modifiers, swimming/treading water, drowning, underwater combat/magic modifiers — mostly tables
   and TN modifiers the existing dialogs can take.
3. **Ship rules (system, large):** ship attributes on vehicles (hull, bulwark, sonar, depth, load,
   accommodation), ship combat/ramming/boarding/damage control/repair/sonar. Big ships and subs land
   with phase 3; until then they are listed but GM-run.

## Open questions for the user
- Phases 2 and 3 are real system work; worth it for your table, or content only?
- Edges & Flaws: confirm they should follow the Shadowrun Companion module's model.
