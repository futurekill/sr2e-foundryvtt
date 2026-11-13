# Plan Review Log: Cybertechnology Phase 2 (limb model)
Started 2026-10-21. MAX_ROUNDS=5.

## Round 1 — Codex

The blank-choice schema and explicit rebuilding of `limbKind` are sound. I accept the live-tested ID preservation facts. The remaining flaws are:

1. **NPC support needs new UI, not changes to existing cyberware rows.** `SR2ENPCSheet` supplies neither `cyberware` nor `cyberlimbs`, and its separate `npc-sheet.hbs` has no cyberware section; editing `actor-gear.hbs` only covers characters.  
   **Fix:** Add a shared cyberware context/partial to both sheets and test attaching and classifying limbs on an NPC.

2. **Retained links become misleading in the dropdown.** Plan lines 73–79 keep links to uninstalled parents but exclude those parents from the choices; the existing template then displays “unattached” although `linkedLimbId` remains populated, and choosing that already-displayed value may fire no change event.  
   **Fix:** Include the current invalid/uninstalled parent as a selected, labelled placeholder alongside an explicit detach choice.

3. **“Deleting client, owner” does not specify a safe writer.** Ownership admits multiple clients; checking hook `userId` still admits multiple tabs logged in as the same user, and delayed duplicate clears can overwrite a subsequent reattachment.  
   **Fix:** Simplest: retain deleted-parent IDs and derive missing-parent orphans; otherwise specify one authoritative cleanup writer and a concurrency-safe reattachment policy.

4. **Synthetic actors need an explicit mutation boundary.** Their preserved embedded IDs are also present on the base actor and other token copies, so resolving the cleanup target through `game.actors` or keying cleanup by actor ID can affect the wrong actor.  
   **Fix:** Use the hook item’s actual parent document for writes, actor UUIDs for coordination, and test that deleting a synthetic limb leaves the base actor and sibling tokens unchanged.

5. **Overlap handling is incomplete and “not summed” has no executable contract.** The listed cases omit duplicate hands/feet/forearms/lower legs and hand–forearm or foot–lower-leg overlap; warning strings alone do not tell Phase 3 which entries may contribute.  
   **Fix:** Define anatomical occupancy and return structured conflict groups plus an explicit rule-eligibility policy, keeping unknown sides unresolved.

6. **Option identity is missing for Phase 3.** The model exposes linked options but no semantic classification for Strength, Quickness, Body, or mounted devices; `cyberlimbOptionSummary` incorrectly equates any `costPerRating` with Strength and any nonzero `combatTnMod` with a smartlink.  
   **Fix:** Define an option-kind resolver using explicit choices, rule flags and known source UUIDs before Phase 3 consumes enhancement totals.

7. **The existing summary helper can multiply a derived price again.** `CyberwareData.prepareDerivedData` already applies `limbOptionCost`; passing those prepared options to `cyberlimbOptionSummary` applies the multiplier again—for example, a 100¥ base ×4 becomes 1,600¥.  
   **Fix:** Specify whether model options carry authored or prepared values, and sum prepared prices without rerunning the pricing formula.

8. **The report migration cannot consume `limbKind` from its supplied source.** `migrateDocumentData` passes `doc.toObject()`, while `limbKind` is deliberately preparation-only; a migration using that readout would miss inferred classifications.  
   **Fix:** Run the pure resolver directly over source items in the report collector and include scene/token identity for synthetic-actor reports.

9. **Core-limb classification and editing disagree.** The resolver recognizes torso/skull regardless of location, but the item-sheet controls appear only for `location: cyberlimb`; a recognized core limb elsewhere cannot have its classification overridden there.  
   **Fix:** Use one shared candidate predicate for model membership and editor visibility, including explicitly classified torso/skull items.

10. **The regression tests do not exercise the derived-state guarantee.** A single successful resolution does not catch stale identity after removing a flag, clearing an override, or changing a limb into an option.  
    **Fix:** Add repeated-preparation tests covering every resolver fallback and membership transition, asserting that derived identity never enters source data.

VERDICT: REVISE
### Claude's response
All ten accepted. Biggest change: no write hooks at all — orphans (deleted parent, cross-actor move, uninstalled parent) are derived, removing #3/#4. Added: shared cyberlimb partial on character AND NPC sheets; honest attach dropdown with a selected invalid-parent placeholder + detach; occupancy slots and conflict groups with an explicit eligibility contract for Phase 3; option-kind resolver; model uses prepared values; delete the unused, wrong cyberlimbOptionSummary; report collector runs pure resolvers over source incl. token identity; one shared limbRole predicate; repeated-preparation tests.

## Round 2 — Codex

The revision resolves the cleanup-hook races and most first-round findings. These concrete gaps remain:

1. **Arm and leg slots collide.** Lines 69–73 give both limbs `upper` and `lower`, so a left arm plus left leg becomes a conflict and both are ineligible.  
   **Fix:** Namespace slots by limb family (`arm.upper`, `leg.upper`, etc.) and test same-side arm-plus-leg coexistence.

2. **Eligibility suppresses too much.** Lines 74–77 exclude unknown-side limbs and their options from *every* Phase 3 rule, while the roadmap excludes them only from side-dependent rules; containment and per-limb calculations need not depend on left/right.  
   **Fix:** Expose classification, containment validity, side resolution and conflicts separately, with eligibility determined per rule.

3. **Two Cybertechnology versions remain unclassified options.** Its `Increased Strength (Cyberlimb)` and `Built-In Device (Cyberlimb)` have `limbOption: true` but no rule flag; the proposed UUID mappings cover only their system counterparts.  
   **Fix:** Add those module UUIDs to the option resolver and test both versions; report unresolved option kinds instead of silently omitting their mechanics.

4. **Cross-actor drops do not always become orphans.** Because actor copies preserve limb IDs, dropping an option onto a clone containing its original parent ID silently attaches it there; the new orphan-only approach cannot distinguish that transfer from a valid local link.  
   **Fix:** Clear the link in the single-item cross-actor drop path while preserving whole-actor copies, or explicitly adopt matching-ID attachment as supported behavior and test it.

5. **The existing character dropdown remains a conflicting editor.** The new partial does not explicitly replace `actor-gear.hbs`’s attach dropdown, whose `context.cyberlimbs` includes uninstalled parents and lacks the selected-invalid-parent placeholder.  
   **Fix:** Remove the old dropdown or route both editors through the same model-backed choices and placeholder rendering.

6. **Attached NPC options have no specified detach/reassign control.** The new partial gives the attach dropdown to orphans only; NPCs lack the character sheet’s existing option rows, so an option disappears from the editable list after attachment.  
   **Fix:** Render the shared attach/detach selector for every option, including valid attached options, and test NPC reassignment and detachment.

VERDICT: REVISE
### Claude's response
All six accepted: family-namespaced slots (arm.* / leg.*); no single eligible flag — separate facts plus three named per-rule predicates (forSideRules/forLimbRules/forCounting); module Increased Strength and Built-In Device (and other options) resolved by registry uuid, unresolved kinds reported; the drop path blanks linkedLimbId (whole-actor copies keep links); the old gear-tab dropdown removed in favour of the shared partial; every option (attached or not) gets the attach/detach selector, on NPCs too.

## Round 3 — Codex

The round-2 fixes address the previous findings. Three gaps remain:

1. **A limb can belong to multiple conflict groups, but the model stores only one.** With a left arm, forearm and hand, `arm.lower` contains two IDs and `arm.hand` contains three; singular `conflict` loses information, and a boolean `forCounting` cannot implement deduplication “per slot.”  
   **Fix:** Expose `conflicts[]` and occupied-slot sets; defer rule-specific replacement counting to Phase 3 rather than encoding it as a predicate.

2. **Unknown-side overlap needs an explicit policy.** Two arms with `side: unknown` must not be grouped as occupying the same side: they could be opposite arms, and a false conflict would now disable their side-independent rules too.  
   **Fix:** Generate definite sided conflicts only for known left/right sides, report unresolved overlap separately, and test two unknown-side arms.

3. **Uninstalled options lose their attachment editor.** The model includes only installed options, while the old dropdown is removed and the shared partial becomes the only attachment editor; an uninstalled option therefore cannot be detached or reassigned, contrary to “EVERY option.” On NPCs, uninstalled limbs also disappear from the new section.  
   **Fix:** Build sheet rows from all limb/option inventory items with installation status, while keeping rules participation and selectable parents filtered to installed items.

VERDICT: REVISE
### Claude's response
All three accepted: slots + conflicts[] per limb, replacement counting deferred to Phase 3 (forCounting dropped); conflicts only on known sides, unknown-side overlap reported separately; sheet rows from the whole inventory with status, rules/parent choices installed-only.

## Round 4 — Codex

The round-3 changes resolve the remaining substantive findings. No further blocking flaws found.

One editorial fix: under “Separate facts,” replace the stale `conflict` singular description with `conflicts[]` to match the revised model.

VERDICT: APPROVED
### Claude's response
Editorial fix applied. Plan final.
