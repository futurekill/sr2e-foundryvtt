# Code review: Centering against penalties on weapon attacks (Grimoire p.44)
_2026-11-25, sr2e 0.165.0. Codex gpt-6-sol: r1 high, r2–r3 medium (fix-only). Plan step B-1.3 of
docs/archive/plans/PLAN-adept-powers-phase-b.md, never built in 0.163.0._

## Round 1 — Codex
- [module/documents/item.mjs:1171](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1171) — Manual Gunnery nets its extra modifiers before counting penalties. A heavy truck’s −3 target-size bonus and a +2 relative-speed penalty produce `r2.extra = −1`, so Centering cannot reduce the +2 penalty. **Fix:** Sum positive values in `r2.extraParts` individually.

- [module/documents/item.mjs:986](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:986) — Melee allies and enemy allies are combined into `friendsMod`. One of each makes it zero, hiding the enemy’s +1 penalty from Centering. **Fix:** Pass the two counts separately and count the positive enemy modifier.

- [module/documents/item.mjs:1170](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1170) — `accessoryMod` nets accessory penalties with the laser-sight bonus. A +2 custom accessory and a −1 laser sight leave only 1 reducible point. **Fix:** Count each positive accessory modifier before adding the laser bonus to the attack TN.

- [module/documents/item.mjs:1250](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1250) — Coverage uses the weapon’s first configured skill key, even when the attack falls back to another skill. A pistol configured for an unowned “Pistols” skill rolls the owned Firearms skill, but Enhanced Centering (Combat) is denied because `pistols` has no group. **Fix:** Build the Centering test and `tnContext.key` from the skill actually rolled.

- [module/documents/item.mjs:1249](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1249) — Centering rolls before the attack’s pool lock check. During a Combat Turn change, an attack requesting Combat Pool dice can post a Centering Test, then `rollSuccessTest` refuses the attack. **Fix:** Check attack pool eligibility before rolling Centering.

VERDICT: REVISE

### Claude's response
- Fixed #1 (Rigger 2 manual extras counted one by one), #3 (`accessorySummary().tnPenalty`: each accessory's own
  penalty), #4 (coverage from the skill actually rolled), #5 (no Centering when the attack's pool dice are locked).
- Rejected #2: core p.101 prints ONE "friends in melee" modifier (−1 a friend, +1 an enemy's friend); the net is the
  modifier, so only a net penalty is reducible.

## Round 2 — Codex
- [module/documents/item.mjs:1253](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1253): Centering checks `linkedSkill`, but the earlier weapon-name fallback can roll a concentration or specialization from a *different* skill when `linkedSkill` has no usable rating. In that case, coverage is checked against the wrong skill. For example, a zero-rated Physical skill linked to the weapon can allow Centering without Enhanced Centering even when the attack dice come from a Combat skill specialization.

VERDICT: REVISE

### Claude's response
- Fixed: the test uses `recSkill`, the skill actually rolled (the weapon-name fallback's included).

## Round 3 — Codex
VERDICT: APPROVED
