# Plan Review Log: Cybertechnology Phase 1
Started 2026-10-20. MAX_ROUNDS=5.

## Round 1 — Codex

- **Source precedence contradicts approval (lines 18–21):** The roadmap requires master-table values; fix by retaining those values unless the user explicitly approves a documented discrepancy override.
- **Rating changes leave bonuses stale (44–54):** `ratingStats` supports only rating, Essence, cost, availability and Street Index—not attribute or armor bonuses; fix by defining fixed-level variants with matching bonuses and provisional flags.
- **Purchase bypasses surgery (49–51):** `installed: false` prevents the drop flow from offering cybersurgery; fix by shipping installation-ready ware or explicitly documenting spare purchases and the manual installation/surgery workflow.
- **Percentage pricing uses the wrong base (47–48):** `costMultiplierOfBase` multiplies the option’s own authored `cost`, never its linked limb’s cost; fix by specifying an explicit base-cost configuration and manual recalculation policy until later automation.
- **Enhancement rating is not prompted (47–48):** `costPerRating` alone does not enable the purchase rating selector; fix by supplying supported rating choices or fixed-rating variants and verifying the charged amount.
- **Existing mechanics are underspecified (42–56):** The mapping omits behavior fields such as `isVcr`, `noReactionBonus`, `unarmedPowerBonus`, `accessPorts` and `cranialDeck`; fix by adding an item-by-item schema mapping that preserves existing automation without duplicating bonuses.
- **Weapon behavior is incomplete (60–65):** There is no positive recoil-penalty field, `recoilComp` cannot be negative, and omitted `skill` defaults to firearms; fix by explicitly recording manual recoil and skill handling and pinning the exact base weapon UUID/version used for derivation.
- **Paired-item accounting is unspecified (57–67):** Weapon companions could charge twice, while generic gear ammunition may not support reloading; fix by requiring zero-cost weapon companions and mapping ammunition to the existing ammo category, quantity and bundle-price fields.
- **Container accessories risk double counting (46–47):** The plan does not distinguish standalone installed accessories from parent `modules` rows; fix by documenting conversion into module rows, removal of duplicate installed items, and allowance/grade/surgery accounting.
- **Chrome Kings derivation is incorrect (81–89):** NPCs do not aggregate embedded ware bonuses, and preparation overwrites Reaction base/value and Initiative base/value; fix by mapping printed attributes to base/mod, Reaction to the required `reaction.mod`, Initiative to `initiative.dice`, and Essence/Body Index to their authored values.
- **Self-contained NPCs need more than copied documents (83–85):** Embedded IDs, gear links and external image paths can remain invalid; fix by remapping embedded references, copying required assets locally, and testing with every optional source module disabled.
- **Capture cannot prove completeness (22–29, 101–104):** A verified TSV and COVERAGE generated from that same TSV cannot detect omitted source rows; fix by independently inventorying every table row, level, consumable, procedure and NPC, with separate source readings, page/crop references and verification records.
- **Approved scope is missing (31–39):** `ct-matrixware`, skillsofts, repair rates and the explicit procedure coverage gate disappear; fix by restoring them and requiring every mandatory inventory entry to resolve to shipped content or an expressly approved exclusion.
- **IDs are deterministic, not stable (101–102):** Hashing mutable pack/name changes UUIDs after corrections and collides for same-name entries within a pack; fix by assigning immutable capture keys and retaining a checked-in ID registry, including embedded documents.
- **Art preservation is incomplete (76–78, 92):** Keeping only `img` by filename loses art after renames and can reset token textures; fix by preserving item/portrait/token art by immutable ID and testing regeneration after art assignment.
- **Validation and QA are insufficient (101–113):** Shadowtech’s validator hard-codes `ff-vehicles` as its Actor pack, lacks full schema checks, and sampled imports cannot satisfy the approved Chrome Kings test; fix by validating manifest pack types, recursive schemas/references/assets and build round-trips, then pinning every NPC and testing all ratings, grades, surgery outcomes, purchase cancellation/free drops and container accounting.

VERDICT: REVISE
### Claude's response
All sixteen accepted: master-table precedence with logged discrepancies; fixed per-level variants where bonuses change; ware ships installed so surgery applies; percent-priced covering as fixed per-limb variants; enhancements as ratingStats rows (cost per p.31/p.50); item-by-item mechanics mapping matching counterparts; manual recoil/skill handling with a pinned base weapon; zero-cost weapon companions and ammo-category ammo; follow the system accessory convention with a no-double-count test; Chrome Kings mapped to authored base/mod fields; remapped embedded refs and local assets, tested with other modules off; independent inventory pass; matrixware/skillsofts/repair rates/procedures restored; checked-in id registry; art preserved by id incl. token textures with a regeneration test; manifest-driven schema validator and a broad smoke script.

## Round 2 — Codex

- **Limb pricing still conflicts with preparation (80–88):** `CyberwareData.prepareDerivedData()` overwrites the selected row’s cost with `limbOptionCost(_source.cost, …)`; fix by using fixed-rating enhancement variants with authored costs and checking displayed and charged prices agree.
- **Limb limits are not enforced (87–88):** Purchase choices do not inspect a linked limb; fix by providing explicitly limited variants or documenting manual eligibility checks until Phase 2.
- **Spare purchases still undergo surgery (93–95):** Unticking installed afterwards does not refund surgery fees or undo wounds; fix by requiring a world-item copy marked uninstalled **before** purchase.
- **Accessory accounting remains unresolved (96–101):** Standalone accessories do not automatically enter a container’s free Essence allowance; fix by specifying the manual module-row conversion, duplicate removal, and price/grade/surgery treatment before generation.
- **Weapon derivation is overgeneralized (102–107):** The wording derives every implant weapon from a hold-out pistol, including melee weapons, tasers and lasers; fix by limiting that derivation to the applicable eye/oral guns and recording each other weapon’s own source mapping.
- **Completeness gate weakens the roadmap (41–42):** Any inventory entry may resolve to a GM reference, allowing required table items to escape implementation; fix by requiring table rows to ship as items and reserving reference-only treatment for approved procedures/services.
- **NPC armor accounting is missing (124–142):** NPC preparation adds equipped armor to authored armor, so copying printed totals and equipped gear can double count; fix by defining intrinsic versus worn armor explicitly and asserting final armor totals.
- **Validation regressed (151–158):** Field-name checks do not validate types, choices, bounds or rating-table uniqueness, and some derived fields are schema fields; fix by restoring sorted/unique rating checks and defining recursive schema validation plus explicit authored/derived-field rules.

VERDICT: REVISE
### Claude's response
All eight accepted: enhancements as fixed-point variants with authored costs (no formula fields, price checked); limb limits documented as manual until Phases 2-3; spares bought from an uninstalled world copy before the drop; accessory convention read from the system (container + standalone items) and the manual module-row path specified with a double-count test; per-weapon source mapping; completeness gate requires items for every table row, references only for approved procedures/services; NPC armor intrinsic vs worn, asserted; validator restores ratingStats checks and adds recursive schema + authored/derived rules.

## Round 3 — Codex

- **Accessory surgery is still bypassed:** Adding rows after purchasing the container changes Essence without rerunning surgery, and inherits the container’s existing surgery modifier; fix by configuring rows before purchase and documenting later additions as a separate manual GM procedure.
- **Accessory pricing omits grade and Street Index:** “Pay its cost by hand” specifies only printed cost, while `itemBaseCost()` excludes `moduleCost`; fix by documenting the full accessory charge calculation and testing graded purchases with non-unit Street Index.
- **Container QA tests only the simplest case:** `.2 + max(0, rows − .5)` applies only to standard, unmodified cybereyes; fix by asserting `surgicalEssence(gradeEssenceCost(base + overflow, grade), pct)` below and above allowance, including inactive rows.
- **Derived-field validation still permits stored outputs:** Allowing overwritten fields whenever they equal an “authored row” conflates schema-backed inputs with derived-only properties; fix by always rejecting `capacityUsed`, `capacityOver` and `moduleCost`, with explicit exceptions only for legitimate authored schema fields.
- **Fixed enhancement variants lack an explicit machine-readable point count:** Names such as “Strength Enhancement +4” cannot support the roadmap’s name-independent later derivation; fix by requiring `system.rating = N` and stable enhancement rule keys on every fixed variant.

VERDICT: REVISE
### Claude's response
All five accepted: rows configured before purchase on a world copy (grade and surgery cover the whole Essence), later additions a separate GM surgery procedure; full hand-charge formula for rows; smoke asserts the graded/surgical formula across allowance cases incl. inactive rows and a non-unit Street Index; derived-only properties always rejected; enhancement variants carry rating N + a rule key.

## Round 4 — Codex

- **Later accessory surgery remains unrepresentable (131–133):** `actualEssenceCost` applies the container’s original surgery percentage to all overflow, including new rows; fix by documenting separate-outcome surgery as unsupported in Phase 1 with explicit manual Essence accounting, or specifying and testing a schema-compatible representation that preserves both operations.

VERDICT: REVISE
### Claude's response
Accepted: later accessory surgery is declared unsupported as automation in Phase 1, with an explicit manual Essence procedure and its stated limit; Phase 3 revisits per-row surgery.

## Round 5 — Codex

- **The manual workaround changes allowance consumption:** With `.4` already used, a new `.2` accessory and −20% surgery should charge `.08` on its `.1` overflow; storing `.16` instead produces `.06` overflow. Fix by preserving printed row Essence and documenting separate-outcome additions as unsupported, with independently tracked manual actor Essence accounting rather than adjusted module rows.

VERDICT: REVISE
### Claude's response
Accepted: rows keep printed Essence; a later operation is tracked outside the container (a positive change as a separate adjustment item; a negative one noted until Phase 3, with the overstatement documented).

## Round 6 — Codex (cap reached)

- **Later-surgery adjustments still double count:** The container already applies its original surgery percentage to new overflow, so adding the new operation’s full penalty applies both; fix by removing adjustment items and documenting separate-outcome additions as unsupported until Phase 3, with a separate GM ledger of correct Essence loss and remaining Essence (excess loss **understates** remaining Essence).

VERDICT: REVISE
### Claude's response
Accepted verbatim: adjustment items removed; later accessory surgery documented as unsupported until Phase 3, with a GM ledger of correct loss and remaining Essence in the container notes. Cap reached, so this final edit was not re-reviewed; no open disagreement remains (every Codex point in all rounds was accepted).
