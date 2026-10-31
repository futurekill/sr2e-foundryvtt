# Plan Review Log: VR2.0 part 5b (utility options, programming)
Started 2026-10-30. MAX_ROUNDS=5.

## Round 1 — Codex (thread 01a18f6d-da04-7d03-8085-92a450ceb6bb) — VERDICT: REVISE
19 findings: area successes bypass freezeSuccesses/advanceExit; area Karma has no freeze boundary; highest-TN
rerolls drop lower-TN successes; area TNs omit actor penalties; separate area-card creation races; one-shot
consumption not exclusive/recoverable; DINAB crash can hit a fresh reload; DINAB lacks a final-outcome protocol;
one-shot/DINAB miss Camo/Cloak/Lock-On/Restore/Medic; tar wipe needs a frozen victim list; schema can't hold
Limit's target and Sensitive is always inert; utility identity formats disagree; option prices disagree with
itemBaseCost; usablePrograms change would alter Hog; programming has stale Karma, lost concurrent work and
design substitution; black hammer/killjoy programming cap missing; team arithmetic contradiction; squeeze
lifecycle incomplete; per-factor rounding is order-dependent.

### Claude's response
Accepted all 19, with these choices:
- Area reuses the area-spell precedent (`areaCast`: post-roll Karma refused as GM adjudication, castDelta,
  `successesAtTN`), frozen `areaSuccesses` per card, one `attackSuccesses(st)` accessor for every reader, one
  `createDocuments` batch. That removes #2/#3 rather than designing a multi-TN reroll policy.
- One-shot spent = a `once()` claim taken before the roll (the marker is the durable record).
- DINAB: no Karma (outcome final at roll except the defender's zeroing), one wear key per use, crash as a
  generation-bound crash fact, a phase claim in combat.
- `usablePrograms` untouched; a new `activePrograms` for action pickers.
- #17: the code (1 + team bonus per team day) matches the book (p.102, rendered); the plan text was wrong.
- #18: narrowed to one decompression (no Compressor upload mechanic exists).
