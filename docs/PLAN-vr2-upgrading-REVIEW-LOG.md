# Plan Review Log: VR2.0 program upgrading
Started 2026-11-06. Draft 1 rewritten against the 5b record-based programming code.

## Plan round 1 — Codex (fresh session; ~142k input tokens)

- **Pricing inputs are incomplete** — `docs/PLAN-vr2-upgrading.md:38`: `repriceDelta` constructs its own pricing inputs without `objectCodeOnly` (`module/sr2e.mjs:1508`); adding the driver alone makes unticking it charge nothing and later rating edits ignore the discount. **Fix:** Include the live flag in `sysFor`, override it per proposed change, and test both toggle directions and discounted rating edits.

- **Options do not currently trigger repricing** — `docs/PLAN-vr2-upgrading.md:30`: `PURCHASE_DRIVERS` lacks `options` (`module/sr2e.mjs:1416`), and `changedDrivers` uses reference inequality, unsuitable for option arrays (`:1568`). **Fix:** Explicitly add options with structural comparison and test ordinary paid option edits versus free programmed additions.

- **The promised 25% refund fails after free upgrades** — `docs/PLAN-vr2-upgrading.md:40`: completion preserves historical `paid`, while refunds use `min(paid, newPrice) - paid` (`module/sr2e.mjs:1563`); if the upgraded object-code price exceeds historical payment, ticking the checkbox refunds zero. **Fix:** Specify historical-payment semantics explicitly, preserve actual `paid`, and test upgrade → checkbox toggle → downgrade/sale.

- **Two-write recovery is not concurrency-safe** — `docs/PLAN-vr2-upgrading.md:89`: the end record releases the design lock before application (`module/sr2e.mjs:1472`); another device can edit or start writing, and two apply attempts can both pass the `from` check before either update lands. **Fix:** Serialize application through one authority with a durable applied marker, recheck state inside that operation, and protect pending designs until application finishes.

- **Recovery disappears when another task starts** — `docs/PLAN-vr2-upgrading.md:94`: `foldProgramming().task` is only the latest task (`module/rules/vr2-options.mjs:218`), while the code button permits starting again immediately after the end record (`module/programming.mjs:62`). **Fix:** Block both start paths while an unapplied completion exists and locate pending applications by task generation, not merely the latest task.

- **Ordinary writing has no second-write recovery** — `docs/PLAN-vr2-upgrading.md:42`: a crash after recording completion but before clearing `objectCodeOnly` leaves a written program without source permanently; `pendingUpgrade` explicitly excludes it. **Fix:** Include source restoration in the durable completion/application protocol and test a failed source-clearing update.

- **Derivation is not schema validation** — `docs/PLAN-vr2-upgrading.md:64`: `programSizes` floors ratings (`module/rules/vr2-options.mjs:100`) and `activeOptions` floors option ratings (`:73`), whereas the schema requires integer fields and valid target choices (`module/data/item-data.mjs:1063`, `:1083`). **Fix:** Validate and canonicalize the complete proposed system through `ProgramData` before recording the target, then separately reject inert options; test fractional ratings and invalid targets.

- **Mainframe eligibility uses the old rating** — `docs/PLAN-vr2-upgrading.md:72`: `workDialog` reads `item.system.rating`, not `task.design.rating`, for mainframe adequacy (`module/programming.mjs:213`). **Fix:** Use the upgrade target rating for this check and test a mainframe adequate only for the original version.

- **Source eligibility can change during the roll** — `docs/PLAN-vr2-upgrading.md:73`: neither `designOf` nor the unchanged lock includes `objectCodeOnly` or `commandSet` (`module/programming.mjs:32`; `module/sr2e.mjs:1473`), so the stated recheck can accept a now-ineligible program. **Fix:** Recheck eligibility when committing the start and protect eligibility fields during the task, with cross-device toggle tests.

- **The One-shot test has incorrect expected sizes** — `docs/PLAN-vr2-upgrading.md:108`: rating 4 at multiplier 2 produces design size 32, and One-shot multiplies it by 1.5 (`module/rules/vr2-options.mjs:15`, `:107`). **Fix:** Expect 32 → 48 Mp and a base-time difference of 96 − 64 = 32 days.

VERDICT: REVISE
### Claude's response (draft 2)
- **#1–#3 accepted:** `sysFor` carries `objectCodeOnly`; `options` becomes a purchase driver compared structurally;
  the refund invariant (never more than paid) is stated and tested.
- **#4–#5 accepted:** a completed, unapplied upgrade is *pending*: the design lock holds (admitting only the apply,
  tagged `sr2eUpgradeApply`), both start paths refuse and offer Apply upgrade; concurrent applies write identical values.
- **#6 accepted differently:** "has source" is DERIVED (a completed non-upgrade writing task), so there's no second
  write to lose.
- **#7 accepted:** the target is validated by the item's own schema (strict) before recording.
- **#8–#9 accepted:** mainframe adequacy uses the task's rating; eligibility rechecked after the roll and
  `objectCodeOnly`/`commandSet` locked during the task.
- **#10 rejected:** the plan's corrected example uses Attack-4**M** (×3): 48 → 72 Mp, 96 → 144 days, computed with
  `deriveProgram`. Codex reviewed an earlier ×2 example.

## Plan round 2 — Codex (fresh session, fixes only; ~103k input tokens)

- **Pending resurrects after a legitimate downgrade** — `docs/PLAN-vr2-upgrading.md:107–108`: Apply R2→R4, then edit the rating back to R2; the completed task again qualifies as pending, locks the item, and offers a free reapplication. **Fix:** Persist an applied-generation marker atomically with the target update and exclude applied generations from pending detection.

- **Concurrent applies can overwrite subsequent work** — `docs/PLAN-vr2-upgrading.md:112–114`: Both devices can pass the client-side lock before either update lands; after the first apply releases the lock, a sheet edit or new task can occur before the delayed second apply overwrites its design. Identical payloads are only harmless without intervening writes. **Fix:** Route application through one GM authority, rechecking pending generation and design inside the serialized operation.

VERDICT: REVISE
### Claude's response (draft 3)
- **#1 accepted:** `flags.sr2e.upgradeApplied: gen` lands in the same write as the target; pending requires the marker
  below the task's gen.
- **#2 accepted differently:** only the device whose end record WON applies (the end record is server-arbitrated, so
  there's one). A pending upgrade then means no apply is in flight (it landed, failed without landing, or never left a
  dead client), and recovery is a GM-only Apply upgrade. No GM relay needed: a GM is always present.

## Plan round 3 — Codex (fresh session, fixes only; ~84k input tokens)

- **Recovery still races normal application** — `docs/PLAN-vr2-upgrading.md:113`: Pending exists while the winner’s update is in flight; `recordEvent` arbitrates only the end record (`module/claims.mjs:33`). A GM recovery can also pass the lock, then land after the first apply and a subsequent sheet edit, overwriting that edit. **Fix:** Serialize automatic application and recovery through one GM authority, rechecking generation, applied marker, and design inside that operation.

- **Missing marker prevents first-upgrade recovery** — `docs/PLAN-vr2-upgrading.md:109`: Before the first application, `upgradeApplied` is absent; `undefined < gen` is false, so the specified predicate neither holds the pending lock nor exposes recovery. **Fix:** Compare `(item.flags?.sr2e?.upgradeApplied ?? 0) < gen` and test recovery with no existing marker.

VERDICT: REVISE
### Claude's response (draft 4)
- **#1 accepted:** applying goes through the sequencer (`progApply` request, run by the active GM in its queue). The
  handler re-checks pending inside the queue, so a duplicate or late request writes nothing. Apply upgrade (any owner)
  just re-sends the request.
- **#2 accepted:** `(upgradeApplied ?? 0) < gen`, tested with no marker.

## Plan round 4 — Codex (fresh session, fix only; ~97k input tokens)

No concrete flaws found in draft 4’s R3 fixes. The sequencer serializes automatic application and recovery; the queued pending check prevents duplicate writes, and `?? 0` handles the missing first-application marker.

VERDICT: APPROVED
**Plan approved in 4 rounds.**
