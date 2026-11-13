# Plan Review Log: grenades aimed at a point
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
- **Step 3 uses obsolete launcher plumbing.** `renderBlastLauncher` emits `data-launch="1"`; `launchFromCard` reads `flags.sr2e.blastLaunch`, so adding coordinate attributes will not deliver the point. **Fix:** Persist `blastPoint` in launcher flags and forward it through `launchFromCard` into `resolveBlast`.

- **Point precedence and queue capture are unspecified.** `_rollWeaponAttack` captures `_engage.token`, and its blast branch falls back to live targeting when that capture is null; an unrelated target can override point or deferred placement. **Fix:** Snapshot an explicit point/token/deferred aim mode before enqueueing and resolve exclusively from that snapshot.

- **Step 2 leaves macro range calculation unwired.** Token range is suggested by `detectAttackTarget` in the sheet; `_rollWeaponAttack` uses `options.range ?? "short"`, so dialog-only measurement leaves distant macro throws at short range. **Fix:** Calculate point range in the shared attack path before resource spending, preserving accessory range shifts and defining missing-origin/out-of-range behavior.

- **“Whole metres” changes boundary results.** `detectAttackTarget` rounds distance for display but compares unrounded distance against range limits; rounding first could classify a point just beyond short range as short. **Fix:** Compare raw measured distance against brackets and round only the displayed value.

- **Step 4 promises placement without specifying an executable path.** `resolveBlast` currently requires a token; telling the GM to place a targetless card provides no point picker. **Fix:** Make unresolved deferred launchers prompt for a point at launch time, with cancellation leaving the card unresolved and retryable.

- **Macro point validation is missing.** A malformed `{x, y, sceneId}` can reach quantity/ammunition spending before resolution fails. **Fix:** Validate finite numeric coordinates and a valid scene identifier before mutations, then check the viewed scene again before scatter or template creation.

- **Step 5 cannot detect incorrect scatter orientation.** Its only placement test forces zero scatter, so replacing thrower-relative `scatterBearing` with an absolute bearing would pass. **Fix:** Add deterministic nonzero-scatter tests from differently positioned throwers, plus queued retargeting and flag-backed launch/retry coverage.

VERDICT: REVISE
### Claude's response
Rewrote the plan to accept all 7 points: an aim snapshot taken before queueing, validation before any mutation, range computed in the shared path on the raw distance, flag plumbing through launchFromCard, a deferred prompt at launch, and non-zero scatter tests.

## Round 2 — Codex
- **Existing launcher cards have no `aim`.** Step 5 does not define migration, so previously posted flag-backed cards could lose their stored token or fail. **Fix:** Normalize missing `aim` from the existing `centerTokenUuid`, using deferred mode only when no stored target exists.

- **Token resolution still permits target hijacking.** Step 1 removes the attack branch’s fallback, but `resolveBlast` independently falls back to live targets when a stored token cannot resolve; Step 5 guards only point scenes. **Fix:** Require explicit token aims to resolve on the viewed scene, otherwise refuse retryably without consulting live targets.

- **Deferred placement introduces a stale-success window.** `launchFromCard` currently reads attack successes before resolution; Karma spent while the new picker is open would leave scatter and the resolution marker using the earlier total. **Fix:** After placement completes, recheck launcher resolution and reread attack successes before rolling scatter and constructing the marker.

- **Range fallback can silently use an unrelated token’s range.** Selecting point mode retains the dialog’s token-derived `options.range`; if the shooter is absent or the scene changes before execution, Step 3 expressly uses that stale value. **Fix:** Separate explicitly chosen fallback range from target-derived presets, requiring an explicit range when the selected aim cannot be measured.

VERDICT: REVISE
### Claude's response
Accepted all 4: legacy aim is normalised, token aims never fall back to live targets, deferred launches re-read after placement, and an unmeasurable aim needs an explicit range.
