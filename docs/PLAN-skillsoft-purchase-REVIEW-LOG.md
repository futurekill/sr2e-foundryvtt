# Plan Review Log: skillsoft purchase
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex (session 01a0d9d2…)
The plan needs revision. No files were modified.

1. **Dialog validation can close the dialog or strand it.** Foundry v13’s `DialogV2.wait` resolves on submission; returning `false` does not keep it pending, while throwing bypasses button re-enabling. The claim that callback exceptions immediately become cancellation is incorrect. **Fix:** Validate before submission and explicitly manage successful submission, cancellation, and caught callback errors.

2. **Required inputs can block Cancel and DataSoft purchases.** Foundry renders Cancel as a submit button; a hidden required skill input can still invalidate the form. **Fix:** Make Cancel bypass validation, and disable/remove `required` from the skill input for DataSofts.

3. **NPCs never reach this purchase dialog.** `SR2ENPCSheet` inherits the base `_onDropItem`, which directly creates items; NPC data also does not run the character’s `_applySkillsofts`. **Fix:** Explicitly scope this feature to character purchases and test that NPC drops retain their existing behavior.

4. **Free drops do not necessarily create blank chips.** Both handlers copy `item.toObject()`, so configured world and inter-actor chips preserve their skill and slot state; charged character drops also prompt regardless of source. **Fix:** Preserve source configuration, prefill the dialog from it, and test compendium, world, inter-actor, same-actor, Alt, and setting-off paths separately.

5. **The proposed fields omit the skill’s linked attribute.** Synthetic skills use `grantedSkillAttribute`, whose default is Intelligence; Firearms should use Quickness. **Fix:** Carry the selected skill’s linked attribute into the chip, reusing the existing catalog approach in `item-sheet.mjs`.

6. **DataSofts can grant skills if stale text survives.** `_applySkillsofts` does not explicitly exclude category `data`; a nonempty `grantedSkill` can produce a synthetic data-category skill. **Fix:** Clear `grantedSkill` when buying a DataSoft and explicitly skip DataSoft skill injection.

7. **Duplicate chips do not resolve cleanly.** Two fitting chips for one owned skill overwrite it in iteration order; without an owned skill they create duplicate synthetic entries, and both consume capacity. **Fix:** Define duplicate-slot behavior and default a newly purchased duplicate to unslotted unless the user explicitly replaces the running chip.

8. **Renaming is underspecified and the category-switch test contradicts it.** Switching ActiveSoft to language does not rename it LinguaSoft; substring checks also mistake “English” inside “Old English” for an exact match. **Fix:** Build generic chip names from the selected category and exact skill, while preserving custom source names.

9. **Language-family lookup is only reliable for canonical names.** Synthetic languages use an exact lowercased config-key lookup; custom names get no family, and matching owned skills retain their existing family. **Fix:** Test canonical English, a custom language, and an existing language skill separately, and limit the promised family behavior accordingly.

10. **The capacity description overstates enforcement.** `knowAccess` accepts any positive parsed memory capacity without checking a datasoft link, and neither port count nor memory capacity limits concurrent Know/LinguaSofts. **Fix:** Describe the current checks accurately and separate stronger capacity enforcement from this purchase change.

11. **New HTML interpolation needs explicit escaping.** Actor-owned names, compendium names, and free text can contain markup or quotes; these feed datalist options, initial values, renamed items, and purchase notifications. **Fix:** Populate suggestions with DOM `.value`/`.textContent`, escape HTML interpolation, and test malicious skill and item names through purchase completion.

12. **The error boundary misses important failures.** `fromUuid`, catalog loading, and dialog setup occur before the proposed create-and-charge catch; valid Foundry drags such as `ActiveEffect` are unsupported, not malformed JSON. **Fix:** Catch failures around the complete supported-item workflow, quietly ignore unsupported drag types, and distinguish malformed payloads from resolution failures.

13. **Create-before-charge is not transactional.** A failed actor update leaves an unpaid item; a failed flag update leaves deducted money without purchase provenance; failed deletion can leave an unaffordable item. **Fix:** Track completed steps and implement compensating cleanup or explicitly report the surviving item/debit state rather than a generic purchase failure.

14. **Shared-dialog regressions are missing from the tests.** Programs, rated gear, cyberware/bioware, foci, and bows share this dialog; unconditional skill listeners or validation would break them, and an existing unit test expects the old exact field array. **Fix:** Gate all skillsoft controls and listeners, update that assertion, and cover Buy/Cancel for the other field combinations.

A simpler implementation would retain the existing skillsoft predicate, reuse the catalog’s name-and-attribute data, and use successful dialog return values plus caught exceptions rather than adding a three-shape result protocol.

VERDICT: REVISE

### Claude's response
Accepted, simplified:
- #1/#2: no required attribute; an empty skill re-opens the dialog.
- #3: scoped to character drops.
- #4: prefill from the source.
- #5: reuse _skillCatalog with the attribute.
- #6: DataSoft clears the skill, and _applySkillsofts skips data.
- #7: a duplicate defaults to unslotted.
- #8: item-sheet naming, labelled from the selected category.
- #9: tests limited to canonical, custom and owned languages.
- #10: accurate capacity wording.
- #11: DOM-built datalist, escaping.
- #12: one try/catch around the whole workflow; unsupported types stay quiet.
- #13: failures report the surviving state; transactional charging out of scope.
- #14: gated controls, regression tests.

Per Codex's simpler alternative, the prompt keeps its return contract (object or null) and rethrows a caught callback error.

## Round 2 — Codex
Round 1 resolves most concerns, but these remain:

1. **Build/Repair suggestions cannot work as promised.** `GearData.grantedSkillCategory` excludes `build_repair`, and `_applySkillsofts` matches categories exactly; choosing an owned Build/Repair skill produces a separate active skill instead of overriding it. **Fix:** Omit Build/Repair suggestions until chip pricing/category mapping and skill matching explicitly support them.

2. **Slot defaults contradict source preservation.** Prefilling `slotted: false` conflicts with “defaults on”; every generic compendium chip also starts false, so the implementation needs a rule distinguishing blank purchases from configured copies. **Fix:** Preserve slot state for configured sources, default blank skill-bearing purchases on, and retain the buyer’s choice across retries.

3. **Duplicate detection must react to typing.** A blank compendium chip has no duplicate when the dialog opens; entering “Firearms” later can leave the checkbox on despite an existing Firearms chip. **Fix:** Recalculate the duplicate warning/default on skill and category changes using trimmed, case-insensitive names, without overriding an explicit checkbox choice.

4. **Whitespace-only names can pass validation.** Round 1 dropped the explicit trimming requirement; `_applySkillsofts` trims later, allowing a paid, slotted chip that grants nothing. **Fix:** Trim before validation, catalog matching, duplicate detection, naming, and persistence; test whitespace-only input.

5. **Render failures escape the proposed error boundary.** Suggestions are populated in a render event listener; exceptions there do not automatically reject the awaited `DialogV2.wait` promise, so the outer catch cannot reliably report them. **Fix:** Load catalog data before opening the dialog and explicitly catch render-listener errors, close the dialog, and propagate the stored error.

6. **Catalog matching can silently change configured chips.** “The matched catalog entry sets the attribute” conflicts with preserving a configured source’s attribute, particularly when an owned skill and compendium entry share a name but differ. **Fix:** Preserve the source attribute until the skill/category changes, and define actor-owned entries as taking precedence over compendium suggestions.

7. **The problem statement still misdescribes the code.** Pack sources omit `grantedSkill`, whose schema default is `""`; callback exceptions interrupt submission rather than immediately resolving as cancellation. **Fix:** Correct those statements and describe the new callback handling as preventing a stalled submission and subsequent ambiguous dismissal.

The simplified retry approach and explicit partial-purchase notification are reasonable; no transaction redesign is necessary for this scope. No files were modified.

VERDICT: REVISE

### Claude's response
All 7 accepted; see "Round 2 amendments".

## Round 3 — Codex: APPROVED

One implementation guardrail: preserve configured or explicitly chosen slot state ahead of automatic duplicate defaults, including across dialog retries.

No files were modified. This approves the plan; implementation still needs the specified tests.

VERDICT: APPROVED

---
# Implementation review (the same Codex session)
- **Round 1: REVISE (5).** Fixed: configured slot state beats the duplicate default; only exact generic names are renamed; notifications are escaped; the promised coverage is added; cleanup is tracked.
- **Round 2 (after the usage limit reset): REVISE (1).** Chat cleanup is removed; the batch creates none.
- **Round 3: APPROVED.**
