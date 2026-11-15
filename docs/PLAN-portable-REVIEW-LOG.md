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

## Round 3 — Codex (draft 3 + reader-audit additions, fresh session): REVISE, 6 findings
1. Recovery takeover still relies on the epoch pre-hook; a stalled owner's in-flight write can land after takeover; the
   "no drain protocol" key decision contradicts the barrier.
2. `sr2eImport` is `{ importId, epoch }` in §2.4 but `importId` in §2.6.
3. `substanceReported` keys derive from time + payload hash — a rebase without rebuilding them re-announces losses.
4. The month adapter misses receipts' `rows[].month`, `discount` keys, restore `month`, `overheadRefunds.<tx>.done[]`
   (`<vehicleUuid>|<month>`); unsettled reservations/refunds need quiescence.
5. Dropping VR2 session flags doesn't end the connection: `liveOpen` rebuilds it from durable connOpen/connEnd facts.
6. `drugsInForce` orders by `_stats.createdTime` (absorption order) — the journal ignores `_stats`.

### Claude's response (draft 4) — all taken
1: takeover needs the old instance's drained ack, or its user disconnected (server-ordered) with a stale heartbeat; a
frozen tab of a connected user blocks recovery (named) — the "no drain protocol" key decision is replaced. 2: one option
shape `sr2eImport: { importId, epoch }` everywhere. 3: a `stepId` adapter re-derives `substanceReported` keys by fold
position before/after the rebase; corrected entries carried. 4: the month adapter covers the payer's receipts (`rows[].
month`, `discount` keys, restore `month`) and `overheadRefunds.<tx>.done[]`; unsettled overhead money is refused by
quiescence. 5: a live VR2 connection is refused by quiescence (jack out first; `connEnd` with its consequences in the
source world). 6: an explicit `flags.sr2e.drugOrder` (creation time, migration from `_stats`) orders `drugsInForce`.

## Round 4 — Codex (draft 4, fresh session): REVISE, 3 findings
1. `foldMbw` breaks timestamp ties by record key, and keys embed item ids: a remap can reverse tied records (a TLE
   treatment TN 10 → 8 in a read-only reproduction).
2. Cancer journal pages are authoritative state (results, deadlines, notice receipts; `cancerPage()` refuses a reroll),
   not inbound references — listing them loses them.
3. Startup migration and journal recovery have no defined order; `migrateWorld` stamps its version even past fenced
   actors.

### Claude's response (draft 5) — all taken
1: an identity-free `ord` (per-actor counter in `recordEvent`; written by the export from the source fold for older
records) is the tie-break after `at`; other folds with id tie keys get the same, with a test. 2: cancer pages travel
as a GM-only supplement, restored as journalled steps with remapped keys and rebased deadlines. 3: one startup
coordinator: resolve open journals first (forward under the same system version, else roll back to pre-images), then
migrate; fenced actors are skipped and the version is not stamped while any remain.

## Round 5 — Codex (draft 5, fresh session): REVISE, 3 findings
1. **The startup recovery rule can roll back a committed import.** §2.7 orders rollback of *every* open journal from another system version, contradicting the forward-only `committed`/`releasing` rule immediately below it. A crash during release followed by an upgrade can therefore restore pre-images—or encounter divergence—on actors already released to gameplay. This is a defect in round 4’s resolution.
   
   **Fix:** Branch on journal phase before version: committed imports only finish release, then migrate; version-triggered rollback applies only before commit.

2. **Draining queue tails does not drain the existing reconcilers.** §2.4 acknowledges clients after their queue tails settle, but MBW reconciliation and cybermancy reconciliation run directly from timers, outside those queues. An admission check cannot stop an already-running invocation. Cybermancy also writes cancer-page receipt flags and chat messages, neither covered by the Actor/Item/ActiveEffect veto. Thus an acknowledged client can still have gameplay writes outstanding during import; merely importing `fence.mjs` does not establish drainage.
   
   **Fix:** Track and drain complete in-flight reconciler promises, including their journal/chat writes, before acknowledgement; cancel pending timers and test a reconciler suspended across an awaited write.

3. **Cancer supplements are outside the specified snapshot validation.** Draft 5 adds the authoritative pages, but §1.2 still validates actor and embedded-document revisions only. Cancer rolls create pages independently, and reconciliation changes their notice receipts without updating the actor. Export can therefore miss a completed roll or capture stale notice receipts while its revision check passes, allowing a reroll or repeated notice after import. This leaves round 4’s supplement resolution incomplete.
   
   **Fix:** Include supplement membership and page revisions in snapshot validation, and track in-flight cancer rolls so export waits or refuses until their page writes settle.

VERDICT: REVISE

### Claude's response (draft 6) — all taken
1: startup recovery branches on PHASE first — committed/releasing journals only finish releasing; the version-based
rollback applies only before commit. 2: timer- and hook-driven reconcilers register their whole runs (incl. journal and
chat writes) in `portable/inflight.mjs`; the drain awaits them, pending timers for barrier actors are cancelled and
re-scheduled on unfence; Quench: a reconciler suspended across an awaited write. 3: the revision check covers the cancer
supplement's membership and page revisions; quiescence refuses while a cancer roll's page write is in flight.
