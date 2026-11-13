# Plan Review Log: Cybertechnology roadmap
Started 2026-10-20. MAX_ROUNDS=5.

## Round 1 — Codex

Phase 1 is concrete enough to begin its detailed plan, but its “no system prerequisites” promise is premature. The roadmap needs these fixes; quoted rule values are accepted as supplied.

- **Phase 2 depends on Phase 3’s limb model:** Introduce limb type, extent, side, replacement coverage, and enhancement identity before counting replacements, applying pair bonuses, or calculating bioware interactions.
- **`linkedLimbId` is not mechanical containment:** Define valid installed parents, orphan handling, parent removal, and ID remapping on import/copy before using links to reduce Essence or enable bonuses.
- **Phase 1 implant-weapon linkage lacks system support:** Existing smartgun compatibility is not a cyberware-to-weapon ownership link; either add a prerequisite system release or explicitly ship manually paired weapons.
- **Eye allowance and physical limits are different:** Preserve `capacity` as free Essence allowance and add separate maximum-capacity, eye-side, and weapon-slot metadata, including migration of existing anonymous module rows.
- **Eye modules can currently shed Essence by becoming inactive:** Separate physical installation from activation so switching an accessory off does not release its allowance or Essence charge.
- **Phase 1 bonuses can double-count later:** Give provisional `attributeMods` stable provenance and specify their replacement when Phases 2–4 introduce derived bonuses, preserving user-authored adjustments.
- **Phase 2 interactions lack calculation contracts:** Define rounding, minimum efficiency, stacking precedence, and whether reductions affect Essence, bioware Body Cost, purchase price, or installation-time records.
- **Social automation lacks required inputs:** Add explicit visibility/exemption metadata and a dedicated eligible-Essence calculation rather than deriving penalties from total actor Essence loss.
- **Chrome Kings depend on deferred mechanics:** Gate mechanically complete NPCs on the relevant limb, move-by-wire, and cybermancy support, or declare a tested manual-stat representation for Phase 1.
- **Negative Essence requires more than removing the clamp:** Cover schema validation, manual `autoEssence` mode, Magic derivation, displays, and downstream consumers behind an explicit cybermancy state.
- **Automatic IMS insertion needs installation semantics:** Make it an idempotent step in a GM-confirmed operation that accounts for an existing IMS and includes its Essence and price exactly once.
- **Scheduled consequences lack an adjudication policy:** Specify which clock events merely prompt tests and which apply confirmed outcomes, preventing unattended refills, spending, death, or duplicate consequences.
- **Optionality is asserted globally but unresolved locally:** Add a rule-level mandatory/optional/GM-adjudicated matrix, particularly for per-limb combat, bioware interactions, complications, and cybermancy consequences.
- **Migration scope is substantially underspecified:** Require versioned migrations for world items, embedded actor items, unlinked tokens, and module content, with stable IDs, preserved customization, and explicit handling of ambiguous legacy limbs.
- **Book coverage stops short of usable equipment:** Add explicit delivery scope for the listed flash-paks, ammunition, medication/refills, repair supplies, and special-device procedures, whether implemented as items or cited GM reference entries.
- **Phase 1 lacks a completeness gate:** Require a row-by-row coverage manifest identifying existing equivalents, new content, accepted errata, deferred mechanics, and unresolved cells before release.

VERDICT: REVISE
### Claude's response
All accepted. Phase 2 is now the limb model before any limb rule (Phase 3). Phase 1 ships manually paired implant weapons and Chrome Kings with printed stats. Added: provisional-bonus provenance, clock policy (prompt + GM-confirm, keyed), migration requirements, optionality matrix, consumables scope, COVERAGE.md gate, eye allowance vs physical cap, social eligible-Essence + visibility field, negative Essence as an explicit cybermancy state, idempotent IMS. Verified and added Phase 0 (inactive cybereye modules shed Essence today, item-data.mjs:631).
USER DECISIONS (2026-10-20): no errata to other books — the module ships its own version of every table row (players choose); rules key on item fields so all versions behave alike. Phase 6 cybermancy is in scope.

## Round 2 — Codex

Phase 1 is ready for its detailed plan, but the roadmap still has these cross-phase gaps:

- **Chrome Kings still depend on Phase 6:** NPC Essence also has `min: 0`; provide signed-Essence storage/display before Phase 1 or explicitly defer negative-Essence NPC fidelity.
- **Provisional provenance cannot preserve edits yet:** Store the original field/value contributions, not just a rule key, and define conflict handling when a user changes a flagged bonus.
- **Unchanged older packs lack the new rule keys:** Define a compatibility resolver for known source UUIDs and explicit classification for custom items, including fresh imports after migrations have run.
- **Limb enhancements have two potential authorities:** Keep linked option items authoritative and derive the parent enhancement list, or specify a lossless migration preventing duplicate bonuses, Essence, and prices.
- **Unknown limb sides have undefined behavior:** Include `unknown` in the declared side choices and define which calculations remain deferred until the GM resolves identity and overlapping replacement coverage.
- **Eye migration contradicts “never guessed”:** Infer paired eyes only from reliable parent metadata; preserve and report ambiguous containers and unassigned weapon sides instead of treating every legacy row as paired.
- **Phase 0 assumes installation metadata that does not exist:** Define whether row presence means installed or add an `installed` field, with an explicit policy for legacy inactive rows.
- **Signed Essence risks becoming a stale second total:** Define one effective-Essence accessor and how cybermancy’s signed value responds to installation, removal, surgery, permanent loss, and manual mode.
- **The completeness gate permits incomplete releases:** Require every table row to have shipped content even when automation is deferred, and make unreadable required values explicit release blockers or approved exclusions.
- **Description-only scope remains untracked:** Extend coverage beyond table rows and priced consumables to ammunition and special-device procedures, assigning each an implementation phase or cited GM reference.
- **IMS accounting remains underspecified:** Detect an existing installed IMS and include any required addition in intended Essence, survival-test inputs, and operation cost exactly once.

VERDICT: REVISE
### Claude's response
All eleven accepted: negative-Essence NPCs deferred explicitly to Phase 6; provisional records exact field contributions and leaves user-changed fields alone (reported); rule-key resolver (flag, then compendium source uuid table, else GM-classified) at preparation; one derived unclamped essence.signed alongside the clamped value; linked option items stay authoritative, totals derived; side includes unknown with defined skipping; eye migration infers pairs only from reliable metadata; Phase 0 policy (row = installed, active = TN only, legacy report); gate requires every row shipped, unreadables block unless user-approved; coverage includes ammo and procedures; IMS accounting before the roll.

## Round 3 — Codex

Phase ordering and scope are now sufficient, and Phase 1 is ready for its detailed plan. Three roadmap-level issues remain:

- **Signed Essence still has conflicting authorities:** Reconcile derived `essence.signed` with Phase 6’s stored signed flag, and define an unclamped manual input for PCs and NPCs—the existing typed `essence.value` cannot hold negatives.
- **`capacity === .5` is not reliable eye-pair metadata:** The generic module-row editor seeds that value on any implant; require explicit eye-pair classification or known source identity and report everything ambiguous.
- **Provisional-bonus cleanup misses later imports:** Apply idempotent conversion or preparation-time suppression to flagged items imported after migration, including older module packs, so provisional and automated bonuses cannot silently stack.

VERDICT: REVISE
### Claude's response
All three accepted: the cybermancy flag holds state only; signed Essence has one derivation, with a nullable essence.manualSigned input (PCs and NPCs) in manual mode; eye pairs only from rule key or known source uuid; provisional suppression also at preparation time so later imports cannot stack.

## Round 4 — Codex

The three remaining issues are resolved. Phase ordering, migration contracts, optionality, and content coverage are sufficient at roadmap level. Phase 1 is concrete enough to begin its detailed plan, with negative-Essence NPC fidelity explicitly deferred.

No remaining roadmap-level blockers.

VERDICT: APPROVED