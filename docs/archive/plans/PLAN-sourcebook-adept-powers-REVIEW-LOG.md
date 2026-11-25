# Plan Review Log: the sourcebook adept powers

## Round 1 — Codex (gpt-6-sol, high; 617k in / 6.0k out)
**Phase A needs revision.** Findings, with a one-line fix for each:

- **Enhanced Centering is modeled as one choice for multiple levels.** [Grimoire p.34](/Users/jcandalino/Code/foundryvtt/shadowrun/Shadowrun%202e%20-%20Grimoire%202nd%20edition%20%7BFASA7903%7D.pdf) charges per *distinct* skill category or Special Skill, and limits the power to an initiate with Centering. **Fix:** Record each purchased category or named Special Skill separately, price each entry, and check the prerequisite.
- **The Enhanced Perception merge leaves existing world items behind.** The three shipped tier items have distinct IDs and prices; [adeptPowerKey](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2093) cannot identify their old names unless explicitly taught them. **Fix:** Preserve and price all three legacy IDs and names, and include their levels in the dice total and cap, or provide a migration.
- **Two cost callers need the new context.** [AdeptPowerData.powerCost](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1219) omits both new choices, while `adeptCostNeedsActor` does not identify Enhanced Perception as race dependent. **Fix:** Pass the choice fields through both cost paths and return “depends on the character” for an unowned Enhanced Perception item.
- **The chargen handoff does not yet carry the proposed rules.** [sr2e-chargen](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/creation.mjs:274) rejects a second Attribute Boost by key, and its budget callers use costs but do not surface `adeptPowerBudget.problems`. **Fix:** After syncing the pinned rules, allow one Boost per chosen attribute and report the new budget problems in both creation checks.
- **Mystic Armor can retain a stale derived bonus.** [_calculateArmor](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1685) starts from the current armor fields, so “cleared every preparation” needs an explicit source reset; it must also follow the existing human-form power gate and the current Magic Rating after Essence loss. **Fix:** Rebuild its Impact contribution from source and Active Effects each pass, gate it with `adeptPowersWork`, and test Magic loss, recovery, removal, and a second preparation.
- **The proposed Perception button duplicates part of the sheet’s UI and misses existing rolls.** Clicking Intelligence already prompts for a TN, but that generic test must not receive Perception dice; [reflexCheck](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/mbw.mjs:216), FAB search, and chase relocation are explicit Perception Tests. **Fix:** Give the existing Intelligence roll an explicit Perception mode and apply the bonus to those named callers only.
- **Two shipped descriptions contradict the book and the plan.** The [Attribute Boost item](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-grimoire/packs-src/grim-adept-powers/Attribute_Boost_8910da4d6b4d8736.json) says each success adds one point, though any success grants the full purchased level; the [Mystic Armor item](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-grimoire/packs-src/grim-adept-powers/Mystic_Armor_52fa826e15730ecb.json) says Ballistic and Impact, though p.34 specifies Impact. **Fix:** Correct both pack descriptions and their generators in Phase A.
- **The plan needs an explicit schema rule for purchased levels.** [AdeptPowerData.level](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1187) is a `NumberField`; setting a dynamic Magic based `max` would clamp saved purchases rather than report them after Essence loss. **Fix:** Keep purchased levels in the schema and enforce Magic and racial limits through budget problems; retain `blank: true` on both proposed choice fields.

VERDICT: REVISE
### Response
All 8 accepted (Draft 2). The content merge dropped: the three tier items priced together.

## Round 2 — Codex (gpt-6-sol, high; 565k in / 4.5k out)
- **Enhanced Centering eligibility:** Draft 2 requires an initiate with Centering, but `adeptPowerBudget` receives neither `initiateGrade` nor `metamagic` from `CharacterData` ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sourcebook-adept-powers.md:69), [caller](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:635)); pass both into the budget and check them there.
- **Special Skill choice:** The proposed budget problems omit a blank `centeringSkill` when the category is `special` ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sourcebook-adept-powers.md:70)); require a nonblank skill name before pricing that purchase.
- **Mystic Armor limit:** The effect caps the *sum* of levels, but the stated budget limit can leave two individually valid items over the Magic limit ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sourcebook-adept-powers.md:84)); check the summed Mystic Armor levels in the budget.
- **Mystic Armor derivation:** `magic.rating` does not exist in the actor schema, and `adeptPowersWork` alone does not check magic type ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sourcebook-adept-powers.md:84), [schema](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:164)); cap with `magic.value` and require `physical_adept`.
- **Enhanced Perception:** Draft 2 does not gate its dice by physical adept status and `adeptPowersWork`, as existing adept effects do ([plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-sourcebook-adept-powers.md:88), [existing gate](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1265)); apply that gate at every listed Perception roll.
- **Chase relocation:** The GM computes and displays `inputs.dice` before the client rolls it ([chase calculation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:330), [roll](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/chase.mjs:1119)); add Enhanced Perception during the GM’s relocation dice calculation so the prompt and roll agree.

VERDICT: REVISE
### Response
All 6 folded without round 3.

## Code review round 1 — Codex (gpt-6-sol, high; 1.44M in / 13.7k out)
1. [module/documents/actor.mjs:1318](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1318) — The Perception bonus is read from a getter defined only on `CharacterData`. An NPC physical adept with Enhanced Perception gets zero extra dice on this roll and the other named Perception rolls. **Fix:** Put the gated item calculation in a shared helper used by character and NPC actors.

2. [module/documents/item.mjs:434](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:434) — When race-dependent `powerCost` is null, the card shows the old linear cost. An NPC with a level-1 Tier 3 Enhanced Perception item sees **1 PP** although the new table prices its first die at **0.25 PP**. **Fix:** Show the “depends on the character” label when `powerCost` is null.

3. [module/documents/item.mjs:427](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:427) — The card says a power’s bonus is already applied for powers whose effects are deferred to Phase B. Posting Attribute Boost, Missile Parry, or Suspended State gives the player false play guidance. **Fix:** Use a rules-reference message for powers whose activation is not implemented.

4. [templates/item/item-body.hbs:1193](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/item/item-body.hbs:1193) — Enhanced Centering still allows levels above 1, while Draft 2 prices and records only one category per item. Its shipped item permits level 5; selecting that level leaves cost at 2 PP with no problem. **Fix:** Hide or disable the Level control for Enhanced Centering and show that each item covers one choice.

5. [module/quench/sr2e-quench.mjs:1932](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/quench/sr2e-quench.mjs:1932) — The test titled “Body Control dice on a toxin’s resistance” only reads the getter; it never invokes the toxin card. Removing the bonus from `resistToxin` would leave this test passing. It also creates an adept with zero Magic. **Fix:** Give the fixture sufficient Magic and assert the dice passed through an actual toxin resistance action.

VERDICT: REVISE
### Response
#1 rejected: NPCData has no magic.type; the system applies no adept power effects to NPCs (as Combat Sense). #2–#5 fixed.

## Code review round 2 — fix-only (gpt-6-sol, medium; 255k in / 1.7k out)
No findings in the three fixes. The Quench stub returns before damage, flags, or `updateCard`; its actor is new, and the queue clears after settlement. Review was read-only.

VERDICT: APPROVED