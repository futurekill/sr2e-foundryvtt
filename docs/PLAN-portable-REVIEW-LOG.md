# Review log: docs/PLAN-portable.md (chargen M1, portable characters)

## Round 1 — Codex (draft 1, fresh session): REVISE, 13 findings
1. Deterministic identities extend beyond claim effects (cybermancy implant ids, customization request ids).
2. The registry CI check can't establish completeness (top-level names only; nested literals, dynamic paths, `claim`).
3. Reference kinds omit external Token/Scene/Region/User references; same id in another world ≠ same document.
4. Identity adapters must cover nested event dependencies (mbw, cybermancy proposals, VR2 crash records).
5. The fence lacks an acquisition protocol (admission, drain, commit-time checks, external writers, creation).
6. Journal recovery can overwrite unrelated changes or race another recovery.
7. `sr2eImport` suppression omits create/delete hooks (shapeshift, vr2ic, drugs).
8. Clock adaptation underspecified (AE startTime, monotonic substance clock floored at 0, timestamp keys, ordering).
9. Export doesn't define a consistent graph snapshot.
10. Portable-id assignment is neither concurrency- nor clone-safe; owners may lack permission on referenced docs.
11. Migration parity needs the runner's exact stage boundaries, and can't ship after import.
12. Missing interchange guarantees: ownership exclusion, owned-path schema, `edits[]`/`deleted[]`, D12 context.
13. Archive checks weaker than required (streaming enforcement, duplicates/links, pixel limits, re-encoding).

### Claude's response (draft 2) — all taken
1/4: `deterministicId` and per-type `event` adapters, one dependency-ordered identity map. 2: an espree AST shape
inventory (writes, nested literals, claim/event key prefixes, keepId creates; dynamic paths need an annotation) + adapter
round-trip tests. 3: typed `external` refs with worldId, `transient` session state, parent-aware paths. 5: fence set in
the create data; a commit-time veto in pre-hooks on every client; admission skips; quiescence for writers outside the
graph. 6: ownership proof (`importId` + source hash), divergence stops roll-forward and rollback, one lease-holding GM
recovery owner, idempotent commit/unfence phases. 7: hook inventory test (every document hook marked import-safe or
import-guarded with a behavioural Quench case). 8: one Δ rebase per bundle for every world-time value (order and elapsed
preserved; the drugs clock floor moves to elapsed), server-time Δ, time-bearing keys re-derived, combat durations
carried as remaining rounds. 9: export refuses on open transactions (`openTransactions`) + revision re-check with retry;
runs on the active GM. 10: GM-only serialized pid assignment, duplicate detection, clone stripping in preCreate.
11: runner (exact stages) + fixtures moved into M1a. 12: ownership replaced on import, `schema/owned-paths.json`,
`edits[]`/`deleted[]`, `prepared.$context`. 13: streaming fflate limits, name rules, ajv schema validation, pixel
limits + WebP re-encode, only re-encoded bytes uploaded.

## Round 2 — Codex (draft 2, fresh session): REVISE, 8 findings
1. The fence isn't a commit-time barrier (pre-hooks run on the requester; queues are client-local).
2. The journal can't roll back (hashes only); no canonical comparison (`_stats`, defaults, parent/embedded overlap).
3. Recovery ownership isn't crash-safe (a userId lease; unfencing before `committed`).
4. VR2 sequence numbers need destination reconciliation (the in-memory `SEQ`).
5. Healing re-anchoring ignores the destination's healing epoch clamp.
6. The snapshot doesn't bind its clock/settings to the prepared state.
7. The hook inventory misses dynamic registrations and document lifecycle overrides.
8. M1d postpones the tests needed to release M1b/M1c safely.

### Claude's response (draft 3) — all taken
1: a barrier protocol — close admission (a world barrier record every client's queue wrappers honour), drain and
acknowledge per client instance, then fence and re-verify; the pre-hook veto stays as defense in depth, epoch-checked.
2: full before/after images per step, canonical normalisation (cleanData, no `_stats`, no import bookkeeping), one step
per document. 3: a client-instance lease with heartbeat and drained handover, an epoch the veto checks; `committed`
persisted while fenced, then a separately journalled forward-only `releasing`. 4: sequence numbers rebased (a registry
kind `sequence`) and the sequencer counter advanced under its barrier. 5: an actor-local imported epoch the clamp
honours. 6: one pinned clock/settings context per snapshot (folds take `now`), re-checked at validation. 7: the
inventory resolves dynamic registrations by constant folding, covers document lifecycle overrides, requires
annotations otherwise. 8: failure-injection/multi-client tests gate M1b, overwrite/deletion/rollback gate M1c.
