# Plan Review Log: NPC Threat Ratings
Started 2026-11-27. Codex gpt-6-sol.

## Round 1 — Codex
1. **The mode switch has two definitions.** The plan defines threat mode as `threatDice && threatRating > 0`, but says [npcDerived](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/npc-rules.mjs:78) suppresses pools whenever `threatDice` is set. At rating 0, an NPC would have neither Threat dice nor pools.  
   Fix: Use the same mode predicate for derivation, rolling, and the sheet.

2. **Changing the rating default is a migration.** Existing records such as [Corporate Security Guard](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/packs-src/contact-npcs/Corporate_Security_Guard_41aefd8460e8ed46.json:1) omit `threatRating`; they currently inherit 1 and would inherit 0 after the schema change. Unlinked token actors need the same check.  
   Fix: Keep the default at 1 and use the new switch alone to opt in, or migrate missing ratings explicitly.

3. **The pool guard covers only one input.** [rollSuccessTest](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:549) also accepts `paidPoolDice`, which is added after a caller has spent it. Ignoring `poolDice` alone does not enforce “no standard Dice Pools”; the opening `poolsLocked` check would also reject a stale pool request before it is ignored.  
   Fix: Resolve threat mode before the lock check and reject both pool inputs for that NPC.

4. **The promised Threat source cannot be produced by the current attribution helper.** [diceSourceRuns](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:3750) emits base, pool, Karma, and misc keys only. Adding dice to the roll total without extending it leaves those dice untagged, so the proposed clean-miss count silently fails.  
   Fix: Add an explicit `threat` run and verify the returned dice and persisted card flags carry that key.

5. **The Magic Pool suppression is incomplete as specified.** [NPCData](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1924) stores both `value` and `max`, while `npcDerived` does not return a Magic Pool. Setting only the derived value to 0 leaves a positive maximum and lets the shared refresh path attempt to refill it. The app cannot get Magic Pool state from `npcDerived` alone.  
   Fix: Define a single effective pool view for all three NPC pools and use it in preparation, refresh, dialogs, and the app.

6. **The proposed proof misses the paths most likely to expose these errors.** The physical and [astral clean-miss checks](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/astral-combat.mjs:349) are separate; [spell casting and Drain](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1999) allocate Magic Pool dice separately. The listed Quench cases exercise neither an unlinked token nor those two spell tests.  
   Fix: Add Quench cases for an unlinked NPC, astral clean miss, and cast plus Drain with pool requests, including a refresh.

I found no NPC success-test bypass in the specified actor, item, and astral roll paths; the concrete gaps are at pool admission and dice attribution.

VERDICT: REVISE
### Claude's response
All 6 accepted: one predicate; threatRating initial stays 1 (switch alone opts in); threat resolved before the lock, both poolDice and paidPoolDice dropped; diceSourceRuns gains a threat run (tested through the flags); one effective view of all three pools (value and max, both directions, refresh to 0); Quench adds unlinked token, astral clean miss, cast + Drain, refresh.

## Round 2 — Codex
1. A Threat mode NPC has Combat and Astral Pools of 0, but both defense dialogs show **Full Defense** only when the corresponding pool is positive. In melee or astral combat, that NPC cannot declare Full Defense, so its Threat successes cannot produce the clean miss the plan promises. See [melee defense](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2005) and [astral defense](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/astral-combat.mjs:402). Fix: Show Full Defense when the defender has a pool **or** is in Threat mode, and test both dialogs with a Threat mode NPC.

VERDICT: REVISE
### Claude's response
Accepted with a ruling: Full Defense offered in threat mode; the defender's own test then has no threat dice (the price Combat Pool pays, p.103), its resistance threat successes count toward the clean miss.

## Code review round 1 — Codex (gpt-6-sol, high), 2026-11-27
1. NPC Driver Points (chase.mjs) bypassed `rollSuccessTest` → **fixed**: the Open Test adds `npcThreat` dice and shows "+N Threat".
2. Cast/Drain Quench test called `rollSuccessTest` directly → **fixed**: now casts a real NPC spell with cast and Drain Magic Pool requests and checks both cards.
3. Full Defense tests did not prove the whole exchange → **fixed**: melee and astral now run defence → resist card/button → resistance, asserting no Threat dice on the defence and a Threat clean miss.
4. Initiative test compared stored fields → **fixed**: compares `getInitiativeRoll().formula` on and off.
Other NPC roll paths found by grep (direct `successTest`): equipment, host, IC, cyberware and cybermancy rolls — not an NPC's own tests; left as they are.
