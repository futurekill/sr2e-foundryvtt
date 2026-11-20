# Code review log: passive skill dice on every test path

## Round 1 — Codex (gpt-6-sol, high)
- **EW bonuses cannot be rolled through the deck panel.** [deck-panel.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/apps/deck-panel.mjs:180) and line 247 still pass rating-only dice, although [ew.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:182) now accepts passive dice. Fix: pass the matching passive-adjusted dice to both `rollEwCard` calls.
- **The EW cap can combine two different skills.** [ew.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/ew.mjs:67) takes the highest raw rating and independently takes the highest passive bonus. A standalone Electronic Warfare 7 and an Electronics recorder can therefore permit 8 dice when neither skill supplies 8. Fix: take the maximum of each eligible skill’s *own* rating plus its matching bonus.
- **Zero-rating skills receive adept and articulation dice while defaulting.** [actor.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3465) and line 4119 add the whole helper after choosing default dice and penalty; [vr2.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2.mjs:773) does likewise. Fix: gate adept and articulation bonuses on a trained skill, then apply the recorder under the existing defaulting ruling.
- **Two VR2 Computer tests remain rating-only.** [vr2.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vr2.mjs:2038) builds an improvised attack with raw Computer dice, and line 2214 does the same for a decker’s Scan Icon; preserve the DINAB and smart-frame branches. Fix: add passive Computer dice only to the decker’s own roll branches.
- **Programming and core loading remain rating-only Computer tests.** [programming.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/programming.mjs:185) and line 253 derive test dice from raw Computer or Software ratings, including team averages; their rating caps should stay raw. Fix: add each participant’s applicable passive dice before calculating the test dice and team average.

VERDICT: REVISE
## Round 2 — Codex (gpt-6-sol, medium)
VERDICT: APPROVED
### Responses (r1)
- deck-panel EW rolls use the passive-aware limits; the EW limit is per skill (own rating + own bonus); Improved Ability and Enhanced Articulation need a trained skill (the recorder joins a defaulted test, the ruling); the VR2 improvised attack and the decker's Scan Icon take the dice; programming/loading add each tier's dice before the best and the team average.
