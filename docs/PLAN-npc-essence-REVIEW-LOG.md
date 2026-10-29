# Plan Review Log: NPC Essence above 6
Started 2026-10-29. MAX_ROUNDS=5.

## Round 1 — Codex (thread 01a187ed-3e88-7322-bb51-ec1812d8c275): REVISE, 6 findings
1 manualSigned truthiness hides the value editor; 2 blank input saves 0 (generic listener);
3 fallback claim overgeneralized; 4 recovery advice too absolute; 5 tests too weak (cap at 12 would
pass, submit path is the change listener, unlinked tokens, manualSigned cases); 6 drugs/banter are
behavioural readers, not display only.
### Claude's response
All six accepted: value input always shown + manualSigned shown separately; a field-scoped save guard;
the fallback claim restated to what was observed; conditional recovery advice; tests expanded as
listed; inventory corrected.

## Round 2 — Codex: REVISE, 1 finding
Default construction is strict in the installed source; test permissive (fromSource) and strict paths explicitly.
### Claude's response
Accepted: both paths named and tested separately; the observation records the Foundry version and the exact call.

## Code review 1 — Codex: REVISE, 3 findings (all test/doc)
1 substance test had no ledger; 2 save-guard branches untested (0, fractions, warning, refused save); 3 plan said fallback, Foundry actually clamps in cleaning.
### Claude's response
All fixed: ledger loss on a 9-Essence NPC (not subtracted, no alert; alert at 0); DOM saves of 0 and 7.5, warning counts, an injected refused update; plan restated (pre-validation clamping). Quench 7/7.
