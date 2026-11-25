# Code review: shots per Combat Phase (0.164.2)

## Round 1 — Codex (gpt-6-sol, medium; 317k in / 2.9k out)
- [module/documents/item.mjs:653](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:653) — **SS-only weapons can fire twice through a direct roll.** When `item.roll()` supplies no firing mode, the guard defaults to `sa`; an SS-only gun’s first shot is recorded as SA and its second is allowed. Fix: derive the default from the weapon’s available modes before checking and recording the count.
- [module/documents/item.mjs:627](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:627) — **Rigger 2 dispatch bypasses the limit.** Missile launches and area attacks return before the guard and engagement write; an SS launcher can launch repeatedly in one phase. Fix: apply the phase check and record an accepted shot in those paths.
- [module/documents/item.mjs:657](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:657) — **A resumed missile attack can block itself.** Phase 0 uses a `missile:<launchId>` key, which passes the combat check; the initial attack records one SS shot, then `resumeTest` hits the guard before it can finish the damage card. Fix: skip the shot limit for a validated `resumeTest`.
- [module/documents/item.mjs:1273](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1273) — **A refused test is counted.** `rollSuccessTest` can return `null` while pools are locked during a round change, but this branch still increments `fired` and spends ordinary ammo. Fix: return when the test result is null, before the engagement and ammo commits.

The combat’s `phaseSeq` advances on phase handoffs, including when the turn index stays the same. Vehicle and drone phase ownership follows the existing `phaseKey` path. The array write replaces `fired`, and a stale record key is excluded from the next phase’s count.

VERDICT: REVISE
### Response
Fixed: the default mode follows the weapon's modes; resumed/missile keys skip the limit; a refused test (null result) records nothing. Not fixed (noted): Rigger 2 missile/area dispatch returns before the limit — the table doesn't use Rigger 2; a follow-up.
