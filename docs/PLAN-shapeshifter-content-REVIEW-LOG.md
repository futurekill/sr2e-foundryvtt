# Plan Review Log: shapeshifter content
Started 2026-10-29. MAX_ROUNDS=3.

## Round 1 — Codex
The arithmetic is correct: all listed Reaction modifiers, initiative dice, attack powers, and bear armor follow the supplied source stats. The proposed minimum versions are also appropriate: Cyberpirates needs 0.125.1; PAE’s stated content needs 0.125.0. No files modified.

Findings requiring plan changes:

1. **NPCs without forms are not necessarily unaffected.** Replacing the existing tagged-NPC branch with `sys.forms?.length` makes orphan-tagged weapons usable when the forms array is empty—including after deleting the last form. **Fix:** retain the existing restriction for tagged weapons even when no forms remain, and test that case.

2. **The restriction covers every multi-form NPC, not just shapeshifters.** Non-shapeshifting NPCs with alternate stat blocks lose all untagged attacks and gear; the shapeshifter gear rule does not establish that behavior for them. Actual `type: "spirit"` actors bypass this branch. **Fix:** scope printed-only untagged weapons to enabled NPC shapeshifters, or explicitly provide an all-forms weapon option for other NPCs.

3. **Melee defense bypasses the intended animal-attack restriction.** In `actor.mjs:1688`, `inAnimalForm` recognizes only characters, so shifted NPCs still get the default “Unarmed — (Str)M Stun” option; the counterstrike fallback at line 1859 supplies that damage even when Unarmed Strike is unusable. **Fix:** make defense choices and fallback damage respect active NPC forms, including revalidation after the dialog.

4. **“Shift to wolf, see 8M only” cannot pass with the proposed changes.** `actor-sheet.mjs:1887` includes every weapon, and the NPC template renders them all; attack guards merely reject clicks. **Fix:** filter the usable attack list through `weaponUsable`, retain access for item management, and explain blank-tag semantics in sheet help.

5. **Bear armor displays misleadingly.** NPC sheet armor inputs use the printed actor’s `_source.system.armor`; alternate-form armor is consequently shown as “With worn armor,” even with no equipment. **Fix:** derive the displayed armor baseline from the active form’s `ballistic`/`impact`, then calculate the worn-armor indicator against that baseline.

6. **The form serialization contract is underspecified and existing validators cannot catch mistakes.** `NPCData.forms` requires flat numeric attributes plus `ballistic` and `impact`, not attribute objects or nested `armor`; Cyberpirates’ snapshot validates only top-level field classes, and PAE validates no system fields. **Fix:** specify the exact flat form object and validate nested types, unique nonblank keys, weapon-tag references, and embedded weapon IDs.

7. **The proposed verification misses the affected execution paths.** Two predicate assertions do not exercise defense, astral damage selection, restoration of printed stats, or sheet rendering. **Fix:** add focused coverage for those paths, plus unknown/deleted form keys and no-form tagged weapons.

8. **The Cyberpirates art verification command is invalid.** Its `package.json` has no `art` script; moreover, `art-todo.mjs` checks asset existence rather than whether generated JSON actually references it. **Fix:** compare generated actor `img` and token texture paths against existing assets after regeneration in both modules.

9. **Release bookkeeping is incomplete.** Both READMEs retain older system minimums, and both modules have separate package versions. **Fix:** explicitly synchronize manifests, package versions and applicable lockfile metadata, README minimums, and the live Cyberpirates schema snapshot.

The direct attack guards in `item.mjs` and `sheet-actions.mjs`, and the dual-natured melee selection in `astral-combat.mjs`, already use `weaponUsable`; correctly tagged attacks will follow the revised predicate there.

VERDICT: REVISE
### Claude's response
Accepted 1–9. Scoped the untagged rule to shapeshifter-enabled NPCs (new formWeaponsOnly helper, also used
by melee defense), kept orphan-tag refusal, sheet marks other-form weapons and shows form armor, added form
validators + tests, art check by file existence, README/package versions.

## Round 2 — Codex
The revision resolves the broad NPC restriction, orphan-tag behavior, sheet display, and armor-baseline issues. Derived arithmetic and minimum version pins still check out. Three gaps remain:

1. **Melee defense still permits the forbidden fallback.** `formWeaponsOnly(...) && meleeWeapons.length` restores generic Unarmed when no usable weapon exists. Additionally, opening defense in printed form and shifting before submission bypasses the existing `if (weapon && …)` guard; deleting the selected weapon has the same effect (`actor.mjs:1783–1785`). **Fix:** revalidate missing/unarmed selections against the current form after the dialog, prevent generic counterstrikes in restricted forms, and test empty inventory, form changes, and weapon deletion.

2. **Form validation does not enforce the complete schema.** Integer-only checks accept negative attributes/armor and `initiativeDice: 0`, contrary to `NPCData`; the system’s six new attack items also need duplicate-ID coverage, which step 6 does not specify. **Fix:** validate attributes/armor ≥0, initiative dice ≥1, unrestricted integer `reactionMod`, and unique embedded item IDs.

3. **Lockfile release metadata remains omitted.** Cyberpirates’ lockfile still records package version `0.0.1`, and PAE’s records `0.1.0`, at both root metadata locations. **Fix:** synchronize each module’s `package-lock.json` root versions with its new `package.json` version.

The direct attack and dual-natured astral callers already honor `weaponUsable`. The revised flat form contract and art-path verification are appropriate. No files modified.

VERDICT: REVISE
### Claude's response
Accepted all 3 (post-dialog revalidation with the empty-inventory exception kept deliberately; full schema bounds + unique item ids; lockfile versions).

## Round 3 — Codex
No remaining blocking flaws. The revision addresses stale defense selections, schema bounds, embedded IDs, and lockfile versions. Arithmetic, form fields, caller behavior, art wiring, and minimum version pins are consistent.

The no-usable-weapon Unarmed fallback is now an explicit exception: it permits a `(Str)M` Stun counterstrike, not merely defense.

Minor wording fix: narrow the Risks statement from “Any existing world NPC with forms” to “Any shapeshifter-enabled NPC in an active alternate form.”

No files modified.

VERDICT: APPROVED
## Implementation review — Codex
One blocking bug:

- **Fox Reach −1 violates the weapon schema.** [The new attack](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/critters/Shapeshifter_bdaf020fcade8e21.json:347) specifies `reach: -1`, but [WeaponData](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:202) and the item editor enforce a minimum of zero, so it cannot survive loading/editing as authored. **Fix:** allow negative natural-attack Reach in the schema and editor, and test that the Fox’s −1 survives Foundry import and editing.

Otherwise, the implementation matches the approved plan: defense revalidation, weapon restrictions, armor baseline, form arithmetic, tags, IDs, and version pins check out. NPC plain-object weapon rows preserve every field their template consumes; edit, roll, and drag handlers retrieve actual documents by ID.

Both module validators pass; referenced art files exist. Vitest did not run because the installed version rejected `--configLoader`; live Foundry checks remain unverified. No files modified.

VERDICT: REVISE
### Claude's response
Rejected the schema change: the system pack's own Fox stores −1 Reach as 0 (no negative reach anywhere; reach math assumes ≥0). Followed that convention: reach 0 + the printed −1 in the attack note.
