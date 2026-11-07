# Plan Review Log: vehicle customization
Started 2026-11-07. MAX_ROUNDS=5. Plan: docs/PLAN-vehicle-customization.md.

## Round 1 — Codex

The plan needs revision. The main failures are mixed design/customization accounting, incomplete specification data, and a purchase flow spanning two actors without a shared admission guard. No files were modified; rulings 1–9 are unchanged.

1. **C1’s proposed base can erase design engine customization.** In [vehicle-design.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-design.mjs:423), `optionStats.speed/acceleration/load` use `.bought`, which excludes `choices.engineCustom`; those improvements are design options, not embedded mod effects. Saving these values loses their benefits.
   **Fix:** Define a separate pre-item-mod result that retains all design-option effects, including engine customization.

2. **Engine customization has no complete representation.** Its DESIGN entry has no stat effects; C2 provides neither a Speed/Acceleration/Load selection nor separate per-stat existing levels. Summing items by `modKey` also misses `choices.engineCustom`, while `K` still means DP rather than the ¥ engine-customization cost needed by Active Thermal Masking (p.130).
   **Fix:** Specify per-stat engine-customization records, normalize existing design-option levels into the shared context, and distinguish engine-customization DP from monetary cost.

3. **C1 changes skipped vehicles’ behavior before migration succeeds.** With Rigger 2 disabled, an old v2 vehicle retains baked Handling/Speed/etc.; the new derivation then applies its design mods again. Separately, [migrateWorld](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/migrations.mjs:821) stamps the world version even when an entry returns no update, so a per-vehicle stamp alone does not cause retries.
   **Fix:** Gate new derivation on completed base conversion and add an explicit pending-document retry pass independent of the world migration version, including unlinked token actors.

4. **Rebuilding every v2 vehicle silently discards authored changes.** The vehicle sheet permits editing base stats after Workshop creation; regenerating them solely from `design.choices` overwrites those edits. Missing chassis/plant rows also produce an incomplete `designVehicle` result.
   **Fix:** Detect discrepancies against the old calculation, preserve or flag authored deviations, and refuse conversion/stamping when required table rows are unavailable.

5. **The legacy installation fallback conflicts with schema defaults.** `VehicleModData.installed` already defaults to `false`, although current derivation counts every mod; a new `custom` SchemaField will also exist on old documents after cleaning. Testing either `installed` or the presence of `custom` cannot distinguish old installed equipment from new uninstalled parts.
   **Fix:** Use an explicit workflow-version/state value, treating legacy records as installed and only explicitly tracked purchases as pending.

6. **Many mods have no usable aggregation identity.** The generator assigns `modKey: ""` to entries including Off-Road Suspension, Thermal Baffles, RAM, and ECM. “Every item with the same `modKey`” either merges unrelated equipment or leaves those maxima unenforced.
   **Fix:** Assign stable keys to every applicable mod and distinguish rule-family identity from independently repeatable equipment instances.

7. **Separate batches repeat one-time effects and fixed consumption.** Off-road suspension reduces on-road Speed by 15 regardless of levels (p.125); a design level plus a customization level currently evaluates `speed: "-15"` twice and multiplies Economy twice. Conversely, globally aggregating all items would incorrectly collapse independently installed mounts or seats.
   **Fix:** Declare per-mod aggregation semantics for per-level effects, once-per-system effects, fixed consumption, and independent instances.

8. **Customization CF/Load must replace design consumption, not supplement it.** `modCf` and `modLoad` currently sum their design fields; they do not select a specification mode. Concealed armor costs 2 CF/point in design and 3 in customization (p.127); thermal baffles change from 0 to 3 CF/point (p.130).
   **Fix:** Resolve one consumption specification per item’s installation origin, with an explicit distinction between “inherit” and an authored zero, and use it in every capacity calculation.

9. **C2 cannot store the printed rating tables.** ECM’s Availability and Street Index change by rating, with restricted higher tiers lacking a numeric Street Index (p.137); Sensors have the same problem (p.140). A single Availability string and numeric Street Index cannot represent these. RAM explicitly says “Military only” (p.130).
   **Fix:** Add rating-indexed specification rows and explicit restricted/unavailable market states rather than coercing nonnumeric entries to ordinary prices.

10. **The proposed formula language does not parse its own examples.** `evalExpr` accepts single uppercase variables: `Ho` fails, and `S0` is interpreted as `S × 0`, not an identifier. `formulaOk` knows none of the proposed new variables. Current formula helpers can also turn evaluation failure into zero.
    **Fix:** Extend tokenizer, validator, and evaluator together with explicit identifiers, and block purchase when any required input or formula is unresolved.

11. **Batch rating is insufficient for nonlinear prices and installation TNs.** `R` means levels added, but engine customization’s multiplier increases for subsequent levels (p.120), and armor’s TN uses the desired Armor Rating (p.127). Buying one level repeatedly must not reset the engine price to its first-level multiplier or test every armor addition as Armor 1.
    **Fix:** Provide separate added, existing, and resulting ratings, plus pre-install and resulting stat variables, with a documented evaluation basis for each specification.

12. **Category overrides do not cover the printed distinctions.** A ground drone is both `category: car` and `drone: true`; existing `modEffect` never checks `@drone`. It also checks `@car` before `@transport`, so a generic car price can hide the transport exception. Thermal baffles additionally distinguish trucks, tractors, and zeppelins (p.130), which the stored category/transport pair cannot fully express.
    **Fix:** Store explicit vehicle classification traits and define ordered predicate overrides, including a production-vehicle classification path.

13. **C2’s maximum representation drops a printed exception.** Turbocharging always permits one level even when the normal Speed maximum would exclude it (p.122); a bare `speed ≤ S0 × 1.5` rejects that case. The extracted design check instead uses the plant maximum ×1.25, so it cannot serve both modes unchanged.
    **Fix:** Represent maximum basis, rounding, installation mode, total existing levels, and the one-level exception explicitly.

14. **Printed production stats alone cannot enforce existing-equipment rules.** A production vehicle with factory DBW cannot safely receive another one-time +10%; factory suspension may prohibit DBW; factory armor type can prohibit the other armor type. None of those facts follows reliably from its numeric stat line.
    **Fix:** Record factory equipment identities/levels as already included in the base, using them for restrictions and maxima without reapplying their stat or capacity effects.

15. **Extracting the existing effect block does not make all installed mods functional.** Autonav, Remote Pilot, and Sensors have no corresponding effects in DESIGN, and C1 lists no effective fields for them. Installing Sensors therefore leaves `system.sensor` unchanged. External fixed mounts also lack the permanent −1 Signature printed on p.131.
    **Fix:** Audit passive effects alongside customization specifications and add explicit absolute-rating effects and missing persistent modifiers.

16. **The reader sweep misses an actual combat input.** [sheet-actions.mjs:3180](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:3180) seeds the opposing vehicle’s ramming Handling from the base stat; changing only the attacker calculation leaves asymmetric results. [actor-vehicles.hbs:80](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/templates/actor/parts/actor-vehicles.hbs:80) also displays base Handling, Speed, and Acceleration.
    **Fix:** Include opposing-vehicle dialog defaults and linked-vehicle summaries in the effective-stat reader migration.

17. **The existing purchase path assumes payer and recipient are the same actor.** It creates on `this.document` and only auto-charges characters; invoking it for a vehicle will not debit the selected character. `moneyQueue` is client-local and keyed by payer, so two different payers can simultaneously pass the same vehicle’s capacity or maximum check.
    **Fix:** Extract a checked payer/recipient purchase operation with vehicle-scoped admission, live revalidation, duplicate protection, recorded payer identity, and checked compensation on failed creation/payment.

18. **Finish has no durable successful-installation prerequisite.** The schema lists neither the installation results nor an attempt identifier, and C3 jumps from a chat card to owner-controlled Finish. Ratings, dependencies, or capacity can change between the test and Finish; pending prerequisite equipment must not qualify as installed.
    **Fix:** Persist the successful attempt and its specification snapshot, require it at Finish, and revalidate installed prerequisites and vehicle constraints before committing.

19. **Not every installation requires a test.** Ablative armor explicitly takes six hours and requires no Skill Test (p.127); the universal “base time ÷ successes” flow has no valid denominator for it. The proposed lowest-success rule for other multi-skill installations is also not established by pp.118–120; DBW explicitly allows summed successes on p.124.
    **Fix:** Encode installation procedure and success-combination policy per mod, including fixed-duration/no-test procedures, and leave unsupported multi-skill interpretations explicitly unresolved.

VERDICT: REVISE
### Claude's response (draft 2)
All 19 accepted; ruling 10 asked of the user (multi-skill time = the lowest success count; DBW sums, p.124).
- #1 `baseStats` = every design option incl. engine customization, no item effects. #2 engine customization = three
  families with the design's levels as a synthetic source; EDP vs EY variables. #3 per-vehicle gate (`baseVersion`)
  and a pending pass every GM ready over actors + unlinked tokens. #4 conversion preserves edits (stored − (with −
  without)) and refuses missing rows. #5 `custom.state` (blank-allowed) instead of `installed`. #6/#7 stable family
  modKeys + `stack` semantics, effects evaluated once per levels family. #8 per-origin specs, marginal capacity per item,
  null = inherit vs "0". #9 rating-indexed market rows with restricted states. #10 identifier tokenizer, purchase blocked
  on unresolved formulas. #11 R / R0 / R1 and before/after stat variables. #12 vehicle traits with an ordered precedence.
  #13 explicit max spec incl. minOneLevel. #14 factory-equipment items. #15 passive-effect audit + `set` ratings.
  #16 opposing-vehicle defaults and the linked-vehicle summary added to the reader sweep. #17 reserve-then-charge with
  a payer/recipient money operation and `once` purchase ids. #18 durable attempt + Finish revalidation. #19 per-mod
  procedure (test/fixed) and combine policy.

## Round 2 — Codex (fresh session)

Draft 2 still needs revision. No files were modified. The findings below concern incomplete fixes or problems introduced by those fixes; rulings 1–10 remain settled.

1. **C1.6 subtracts Armor and Signature twice.** The current [Workshop save](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/vehicle-workshop.mjs:492) already excludes their mod contributions. A vehicle with base Armor 0 and six design armor levels stores 0; the proposed conversion computes `0 − (6 − 0) = −6`, violating the schema and preventing conversion.
   **Fix:** Reconstruct the old *stored* representation per field, preserving Armor/Signature bases and removing only effects actually baked by the old writer.

2. **C1.6 does not preserve edited stats with multiplicative effects.** Suppose design Speed 100 became 110 through DBW, then the owner edited stored Speed to 132. Subtracting the original difference produces base 122; applying DBW again produces 134, changing the vehicle during migration. Economy receives special treatment, but DBW and other Speed multipliers do not.
   **Fix:** Invert the old effect transformation, including rounding, and verify that reapplying it reproduces the pre-conversion effective stats before stamping; flag ambiguous cases.

3. **C2.4’s marginal formula eliminates fixed consumption.** For the first customized nitrous installation, the printed customization consumption is a constant 2 CF and 15 kg (p.121). As written, `f(1) − f(0)` becomes `2 − 2` and `15 − 15`, consuming nothing. The plan’s 1.5 CF example is the **design** value.
   **Fix:** Define absent-system consumption explicitly as zero, apply fixed consumption on first installation, and specify mixed-origin and removal behavior.

4. **Factory exclusion loses effects at aggregate thresholds.** C1.3 excludes factory levels from effects entirely. A production vehicle with five factory armor points receiving one additional point should cross the six-point Handling threshold (p.127); counting only the new point yields no Handling increase. Similarly, synthetic design engine-customization levels must count for limits without reapplying improvements already present in `baseStats`.
   **Fix:** Track baked baseline levels separately and calculate incremental effects relative to that baseline, using differences for additive effects and ratios for multipliers.

5. **C3.2 does not establish exclusive admission.** Creation time is documented as a timestamp, not a unique sequence or admission guarantee ([Foundry V13 documentation](https://foundryvtt.com/api/v13/interfaces/foundry.data.types.DocumentStats.html)). Two reservations can have equal timestamps. Adding an ID tie-breaker alone is insufficient: A can already have been admitted before equally timed B arrives and sorts ahead of it. The plan specifies neither immutable admission nor recovery from this case.
   **Fix:** Use a server-arbitrated vehicle claim or a single authoritative admission writer, persist the admission decision, and test simultaneous competing purchases across clients.

6. **The payment claim is not a durable payment receipt.** [`once()`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/claims.mjs:14) creates a marker separately from the debit. Disconnecting after the marker but before payment blocks a retry without proving payment; disconnecting after payment but before updating the item leaves paid parts without provenance. A disconnect immediately after reservation also leaves unpaid `parts` eligible for installation under C3.3–5.
   **Fix:** Record a durable purchase receipt atomically with the payer’s balance update, reconcile the recipient from that receipt, and require confirmed payment or explicit no-charge authorization before installation.

7. **C3.5 stores the attempt snapshot but never validates it.** An owner can test a one-level armor addition, edit the pending item to three levels, and Finish: the state remains `tested`, and capacity/maxima may still pass. The successful test no longer covers the installed work.
   **Fix:** Bind attempts to an immutable installation specification and reject Finish—or invalidate the attempt—when levels, choices, or relevant evaluated requirements differ.

8. **C2.8 cannot derive production categories from `vehicleType` alone.** The [Yamaha Rapier](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/vehicles/Yamaha_Rapier_b57f50f176440123.json:7) has `vehicleType: "ground"` and `skill: "bike"`; deriving from type alone misclassifies it as a car. That changes off-road suspension pricing from the printed motorcycle multiplier to the car multiplier (p.125). The Spotter Drone’s `"drone"` type supplies no body category for the proposed B/R mapping.
   **Fix:** Use available skill/category metadata and provide explicit GM-editable body-category and propulsion fields, blocking dependent calculations when classification remains unknown.

9. **C2 updates catalog identities without specifying updates to existing embedded items.** Existing Off-Road Suspension, Thermal Baffles, RAM, and ECM records can retain blank `modKey` values after the generator changes. Buying a newly keyed customization then fails to aggregate with the old design item, reopening the settled maximum and once-per-family-effect problems.
   **Fix:** Specify a versioned backfill or normalization resolver for existing embedded mods, preserving authored overrides and reporting records that cannot be identified safely.

For the three open questions:

- **Reservation ordering:** **Not sound as specified.** Server-ordered creation does not itself make the subsequent client check and payment one exclusive admission operation; findings 5–6 need resolution.
- **Class precedence:** **No broader-class override was required by the inspected tables.** The proposed transport-over-car ordering matches p.125, and tractor/truck/zeppelin overrides match p.130. Apply precedence independently for each property, using only overrides actually printed for it; add overlap tests for drone/category and electric-aircraft combinations.
- **Production traits:** **GM-entered truck/tractor traits are a workable interim approach, but insufficient alone.** Motorcycle classification must also consult `skill`, and drones need an explicit body category; propulsion-dependent restrictions need a known engine classification. Finding 8 covers the required change.

The other settled fixes are adequately addressed at plan level, subject to the promised transcription audit and implementation checks.

VERDICT: REVISE
### Claude's response (draft 3)
All 9 accepted. #1/#2 the conversion rebuilds exactly what 0.143.0 stored (baked fields only; Armor/Signature untouched),
converts only on an exact match and verifies the result; edited vehicles get a GM choice (reapply design / keep as
edited → production with factory items) instead of an inversion. #3 consumption = per-level part per item + the
family's fixed part once (absent = 0). #4 baked baselines (factory + design engine-customization levels) with
incremental effects and threshold differences. #5/#6 one admission writer (active GM, request records on the vehicle),
the payer's nuyen and a durable receipt in one checked update, deterministic item ids, recovery on ready. #7 the
attempt is bound to its spec, levels locked while bought, Finish re-evaluates. #8 classification from `skill`, then
GM body category/propulsion; unknowns block. #9 a family-identity resolver (modKey → compendium source → name),
unresolved items reported and refused.

## Round 3 — Codex (fresh session)

Draft 3 needs revision. These findings concern the Round 2 fixes and their consequences; settled rulings remain closed. No files were modified.

1. **“Keep as edited” loses effects and frees occupied capacity.** [C1.6](docs/PLAN-vehicle-customization.md:78) converts design mods to `factory`, whose effects and consumption are excluded. A vehicle with stored Armor 0 and six design armor points currently has effective Armor 6; after conversion it has 0. Its mods also stop consuming capacity even though the Workshop stored gross Cargo/Load. Dropping design choices can additionally lose synthetic engine-customization levels needed for maxima.
   **Fix:** Define this conversion explicitly: bake the converted items’ outstanding effects and consumption into the production baseline, preserve synthetic level records, and verify effective stats and usable capacity before committing.

2. **Recovery resurrects intentionally removed modifications.** [C3.2](docs/PLAN-vehicle-customization.md:150) recreates any receipted item that is missing, while C3.6 removes equipment by deleting it. Buy, install, remove, then reload: the retained receipt recreates the removed equipment as reserved parts.
   **Fix:** Persist a terminal removal record before deletion and reconcile only unfinished deliveries, distinguishing intentional removal from interrupted creation.

3. **Moving payment to the GM introduces a second money writer.** [C3.2](docs/PLAN-vehicle-customization.md:145) charges on the GM client, but [moneyQueue](module/money.mjs:1) is client-local and existing purchases run on the character owner’s client. With 1,000¥, a simultaneous 600¥ customization and 700¥ ordinary purchase can both read 1,000¥, then write 400¥ and 300¥; both purchases succeed. One player controlling the character does not prevent the new GM writer from overlapping.
   **Fix:** Route customization debits through the payer’s existing authoritative money writer, or establish shared serialization covering all money operations on that payer.

4. **An unresolved item has no identifiable family to refuse.** [C2.8b](docs/PLAN-vehicle-customization.md:126) treats an unrecognized item as a lone instance but says Customize refuses “its family.” Consider an existing blank-key suspension item renamed “Rally kit,” with no compendium provenance: the resolver cannot associate it with the newly keyed suspension, so that purchase can still bypass aggregation and maxima.
   **Fix:** Block family-dependent admission while any potentially relevant item remains unidentified, until the GM assigns its family or explicitly classifies it as independent equipment.

The automatic conversion’s field selection, fixed-consumption accounting, baked-level arithmetic, attempt revalidation, and production classification otherwise address their Round 2 findings at plan level.

VERDICT: REVISE
### Claude's response (draft 4)
All 4 accepted. #1 "Keep as edited" bakes current effective Armor/Signature and USABLE Cargo/Load into the production
base, makes design mods and engine-customization levels factory items, and commits only if effective stats and usable
capacity are unchanged. #2 a vehicle-side delivery record ("delivered" / "removed") written before deletion; recovery
only for undelivered receipts. #3 the GM only ADMITS; payment stays on the payer's existing money writer (the requesting
client's moneyQueue) with the receipt in the same update; unpaid admissions resume or the GM cancels them. #4 any
unresolved mod blocks all customization on that vehicle until the GM classifies it.

## Round 4 — Codex (fresh session)

Draft 4 closes Round 3 #4 and addresses the original payment-writer and resurrection failures, but three problems remain. No files were modified; settled rulings remain closed.

1. **“Keep as edited” double-counts unflagged modifications.** [C1.6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-customization.md:78) bakes *all* current Armor/Signature effects and occupied capacity into the baseline, but converts only **design** mods to factory items. Concrete case: stored Armor 0, six design armor points, and one unflagged armor point currently yield Armor 7. Conversion stores 7, makes the six design points factory, and reapplies the unflagged point: Armor 8. Likewise, its capacity gets deducted twice. The equality guard prevents corruption but leaves this legitimate vehicle unable to complete “Keep as edited.”
   **Fix:** Bake only the contributions being converted, leaving retained unflagged items’ effects and consumption outside the new baseline.

2. **Cancellation can race the newly separated payment writer.** [C3.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-customization.md:152) lets the GM cancel an unpaid admission while the payer independently commits its debit. Concrete case: the payer reads “admitted”; the GM sees no receipt, cancels, and admits another purchase into the freed capacity; the payer’s pending debit then lands. Receipt-driven delivery now overbooks the vehicle—or rejecting delivery leaves a paid purchase stranded.
   **Fix:** Require the payer’s money queue to acknowledge cancellation without payment before the GM releases the reservation; an existing receipt must instead complete delivery.

3. **Interrupted removal leaves a terminally removed item installed.** [C3.6](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-customization.md:176) writes `"removed"` before deletion, but recovery only prevents recreation. Concrete case: that write succeeds, then the client disconnects before deleting a `done` armor item. Reload leaves the item contributing Armor and consuming capacity indefinitely despite its terminal removal record.
   **Fix:** Have recovery finish deleting existing items whose delivery record is `"removed"`, retrying failed deletions.

VERDICT: REVISE
### Claude's response (draft 5)
All 3 accepted. #1 "Keep as edited" bakes only the converted design mods' contributions; unflagged mods keep applying.
#2 cancellation releases the reservation only after the payer's writer acknowledges inside its queue (a receipt means
deliver), or when no owner of the payer is active (then the GM's client is the writer). #3 recovery finishes an
interrupted removal; a "removed" item counts as removed until deleted.

## Round 5 — Codex (fresh session)

Reviewed draft 5 against Round 4. Findings #1 and #3 are closed at plan level; #2 remains incomplete. No files modified; settled rulings remain closed.

1. **Offline status does not prove payment has stopped.** [C3.2, lines 158–162](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-vehicle-customization.md:158) permits cancellation without queue acknowledgment when the payer’s owner becomes inactive. Concrete case: the payer sends its atomic debit/receipt update, then disconnects while that update is pending; the GM observes inactivity, cancels, and admits another purchase into the released capacity. The pending receipt subsequently lands, recreating Round 4’s overbooking or stranded-payment failure. A returning client’s re-read cannot stop an update already submitted.
   **Fix:** Remove the offline exception and retain the reservation until the payer’s queue acknowledges cancellation, unless a server-enforced handoff guarantees outstanding payment writes have settled.

VERDICT: REVISE
### Claude's response (draft 6)
Accepted as Codex wrote it: the offline exception is removed; a cancellation waits for the payer's writer to
acknowledge, and the reservation is shown as waiting until then. MAX_ROUNDS (5) reached; round 5's single finding was
fixed exactly as proposed. Draft 6 goes to the user for sign-off (human gate) before any code.
