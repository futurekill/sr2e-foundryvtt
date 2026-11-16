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

## Round 6 — Codex (draft 6, fresh session): REVISE, 2 findings
1. **The fuel clock needs a coupled adapter, not just timestamp rebasing (§2.5).** vehicle-fuel.mjs reads `fuelClock.L` whenever `combatId` is truthy, otherwise `worldTime + offset`. Retaining a dangling combat freezes the imported drone’s clock; clearing that reference without recalculating `offset` changes its logical time relative to `fuelCursor.at` and `movedTo`, skipping or repeating fuel charges. Neither the plan nor the supplied inventory specifies this transition.

   **Fix:** Add a fuel-clock adapter that preserves logical elapsed time across combat detachment, rebases its cursors and interval records together, and tests the first destination fuel tick.

2. **Quiescence omits missile transactions whose recovery state lives outside the bundle (§1.2).** vehicle-missiles.mjs stores launches on the exported actor, but missileCloseStage settles them through the original Combat’s `launchAdmit` records and chat cards. These shapes are absent from the supplied inventory and explicit refusal list. An imported unfinished continuous launch can permanently retain its driving penalty and gunner restriction; removing it as transient instead loses an already-spent missile’s pending consequence. Checking actor-local records alone also misses the admission-to-launch gap.

   **Fix:** Refuse export while any relevant Combat admission remains reserved or any actor launch is nonterminal, with fixtures covering admission, ammunition spend, launch creation, and unresolved impact.

VERDICT: REVISE

### Claude's response (draft 7) — both taken
1: a fuel-clock adapter: the logical now at the snapshot, the combat detached, `offset` set so the destination's first
logical now is that value rebased; cursors, `movedTo`, pending intervals and round spans shifted together; a Quench case.
2: quiescence refuses non-terminal launches and reserved `launchAdmit` entries for exported holders, with fixtures.

## Round 7 — Codex (draft 7)

1. **The month adapter omits `overheadRefunds.<tx>.creditByMonth` (§2.5).** This leaves round 3’s refund resolution incomplete. [overheadRefund()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-overhead-rules.mjs:136) subtracts prior refunds by these month keys; the aggregate `credit` does not prevent another refund. A read-only reproduction rebasing month 10 → 1 returned **200 credit instead of 100** when that ledger was left unchanged. A previously settled partial refund can therefore be refunded again when another vehicle covered by the payment is superseded.

   **Fix:** Rebase `creditByMonth` keys with the receipt and discount keys, and test a settled partial refund followed by another supersession after import.

2. **Quiescence misses an adventure-close transaction whose authoritative decision lives outside the bundle (§1.2).** [vehicle-optempo.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-optempo.mjs:80) persists the adventure’s decision in `vehicleAdventures` before delivering vehicle charges and overhead changes; `applied` is written afterward. Export during that gap can pass the listed checks because no actor-local payment or refund is pending yet. The destination lacks the world-setting decision needed to finish the operation, losing charges or overhead supersession. Treating adventure references as dangling does not preserve this obligation.

   **Fix:** Refuse export when a closed, unapplied adventure contains a row for any exported vehicle, with fixtures before and between row deliveries.

3. **Quiescence misses undelivered coasting consequences (§1.2).** [fuelAdvanceStage()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-fuel.mjs:362) advances `turnsProcessed` and persists `fuelOut.pending` before delivering speed changes, a stall crash test, or emergency-landing damage. At that point no crash/impact or `vfollow` record need exist, so the current refusal list does not catch it. [deliverCoastStep()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-fuel.mjs:374) requires combat-stage processing; the fuel-clock adapter’s combat detachment leaves that already-earned consequence stranded until another applicable combat processes it.

   **Fix:** Refuse export while `fuelOut.pending` exists, testing interruptions before crash and landing delivery independently of fuel-clock rebasing.

VERDICT: REVISE

### Claude's response (draft 8) — all taken
1: `creditByMonth` keys shift with the other month keys; fixture as suggested. 2: quiescence refuses a closed, unapplied
adventure with a row for an exported vehicle. 3: quiescence refuses `fuelOut.pending`; fixtures before crash and landing delivery.

## Round 8 — Codex (draft 8)

1. **The reload transaction is missing from quiescence and the explicit fence coverage (§§1.2, 2.4).** [vehicle-ammo.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-ammo.mjs:1) implements a five-step transaction across weapon, reserve and eject items. A reload remains open in `planned`, `settled`, or `cancelled` state even when no money-queue entry is running. Its GM work uses `ammo:<weaponUuid>`, requiring embedded-item-to-actor mapping for barrier admission and drainage; [reconcileReloads()](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-ammo.mjs:119) also resumes from `ready`. Neither the explicit subsystem list nor the supplied inventory covers this path. Consequently, the plan permits exporting an unfinished reload and does not establish that its outstanding writes are drained before import acknowledgement. The associated references include `reloadPlans.ammoItemId`, `ejectTo`, `reserveReceipts.props.loadedSourceId`, and `system.ammo.sourceId/loadedSourceId`.

   **Fix:** Register reload quiescence (`state !== "closed"`), its reference shapes, and actor-associated admission/drain/resume handling for `ammo:<weaponUuid>`; gate M1b on interrupted debit, settlement, escrow-release and cancellation fixtures.

VERDICT: REVISE

### Claude's response (draft 9) — taken
Reload quiescence (`state !== "closed"`), its reference shapes in the registry, `ammo:<weaponUuid>` admission/drain mapped to
the weapon's actor, and the four interruption fixtures.

## Round 9 — Codex (draft 9, fresh session; gpt-6-sol, high): REVISE, 4 findings

1. **The barrier cannot prove that every tab has drained.** The plan stores one [ack per import on a User document](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:201), although its safety rule requires an ack from each client instance. Two tabs for one user can share that slot, letting import proceed while one still has writes in flight. **Fix:** Store acks by `importId` and `instanceId`, and wait against a roster of connected instances.

2. **Subsystem damage can disappear when item ids change.** [Subsystem records bind damage to `target.id`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-subsystems.mjs:6); [the reader ignores a record if that item id is absent](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/vehicle-subsystem-rules.mjs:100). Neither the plan nor the supplied inventory identifies this reference shape, including its copy in rolled follow-ups. **Fix:** Register and test remapping for `subsystems.*.target.id` and `vfollow.*.subsystem.rolled.made[].target.id`.

3. **A posted follow-up can still owe consequences.** Quiescence names [follow-ups not yet posted](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:50), but [a subsystem roll persists before its crash, engine, and passenger consequences finish](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-subsystems.mjs:68). Export in that gap carries an unfinished obligation whose recovery depends on the source world. **Fix:** Refuse export while a rolled subsystem follow-up lacks `consequencesDone`, with an interruption fixture at that point.

4. **Active indirect-fire guidance can leave a permanent penalty.** [A `committed` guidance record gives the spotter +2 TN](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-indirect.mjs:39), while [cleanup runs against its original Combat](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-indirect.mjs:251). The plan neither classifies `guidance` nor requires it to settle before export; even a terminal missile can leave committed guidance until cleanup. **Fix:** Treat active guidance as a combat-scoped transaction and refuse export until it is `ended` or `lost`.

VERDICT: REVISE

### Claude's response (draft 10) — all 4 taken
1 Acks are per instance: `importAck.<importId>.<instanceId> = { epoch, state: seen|drained }`; the GM's roster is the
`seen` instances collected over a fixed window after `closing`, at least one per connected user, and every rostered
instance must reach `drained` (Quench: two instances of one user, one slow). 2 Verified in code (recordLive drops a
record whose item id is gone): `subsystems.*.target.id` (kind item) and `vfollow.*.subsystem.rolled.made[].target.id`
are `ref`s; inventory rows added for `subsystems`, `subsysGen`, `guidance`; fixture with item-bound and built-in records.
3 Quiescence refuses a rolled subsystem follow-up without `consequencesDone`. 4 Quiescence refuses active guidance
(`acquired`/`committed`) until `ended`/`lost`.

## Round 10 — Codex (draft 10, fresh session; gpt-6-sol, high): REVISE, 3 findings

1. **The barrier can miss a tab.** Draft 10 builds its roster from instances that report `seen` during a fixed window. A connected tab that receives the setting later is absent from that roster, so import can proceed while that tab still has a write in flight. This leaves the round 9 barrier finding unresolved. **Fix:** Use an authoritative per-instance roster and require a drained acknowledgement from every instance in it before fencing. [Plan §2.4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:199)

2. **Recovery can strand an import after one tab closes.** Takeover accepts an acknowledgement from the old instance or inactivity of its *user*. If that instance crashes while another tab of the same user stays connected, neither condition can occur; closing the failed tab does not unblock recovery. **Fix:** Establish per-instance disconnect and pending-write proof for takeover, rather than relying on user-level activity. [Plan §2.7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:322)

3. **The registry completeness check excludes system-field references.** The proposed AST scan covers flags, claim keys and `keepId` creates, yet a spell’s `system.fetish.itemId` identifies a gear item and is dereferenced after import. An omitted adapter for that shape would silently break the spell under new item ids without failing the stated inventory check. **Fix:** Include identity-bearing system fields and their readers in the enforced registry inventory, with a new-id round-trip fixture for the fetish link. [Plan §1.5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:148), [spell field](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:447), [reader](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/restricted-spells.mjs:69)

VERDICT: REVISE

### Claude's response (draft 11) — all 3 taken
1 The roster is authoritative: each page load registers `instances.<instanceId>` on its User at ready and heartbeats
every 30 s; the roster is every registered instance of a connected user with a heartbeat under 90 s, re-read during the
wait; a tab loading mid-barrier admits nothing and acks drained at once. 2 Takeover adds (c) GM attestation of an
instance whose heartbeat is over 90 s stale; an attested takeover is roll-forward only (steps are idempotent toward
`after`, so a woken tab can only land the same values) and re-verifies before unfencing. 3 The shape inventory also
covers identity-bearing system fields (`*Id`/`*Uuid` names or `static IDENTITY_FIELDS`) and their readers; fixture:
`system.fetish.itemId` (verified at item-data.mjs, read by restricted-spells.mjs).

## Round 11 — Codex (draft 11, fresh session; gpt-6-sol, high): REVISE, 4 findings

Draft 11 still has four material gaps:

1. **Recovery takeover can admit a late write.** A stale heartbeat and GM attestation do not prove that the old tab has no request already past its client-side pre-hook. That request can land after the new owner’s final check or after release, overwriting imported or subsequent gameplay state. The plan itself acknowledges that the epoch check runs on the requesting client. [Plan §2.7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:325)  
   **Fix:** Require server-enforced epoch validation at mutation time, or authoritative proof that the old instance’s pending writes have drained, before takeover.

2. **The system-field registry check misses identities inside `ObjectField`s.** A vehicle modification’s `system.custom.receipt.id` must match its new item ID, and `receipt.payer` must resolve to the remapped actor; otherwise `verifiedPurchase()` rejects the imported purchase. `system.custom.brFails[].worker` also determines retry penalties. None is caught by the proposed `*Id`/`*Uuid` field-name scan. [Plan §1.5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:148), [model](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/item-data.mjs:1477), [reader](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-customize.mjs:351)  
   **Fix:** Audit identity-bearing `ObjectField` payloads and readers; register these paths and test a new-ID import of a paid modification with retry history.

3. **Quiescence omits pending substance tests.** `substanceLog` records a test, extension, or recovery roll with `pending: true` before its chat card and result exist. An export in that gap can carry the pending record without the source-world card; `settleSubstances()` later deletes it as abandoned, losing a roll that may have completed in the source world. The listed refusal covers unfinished *doses*, not these rolls. [Plan §1.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:46), [claim write](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:505), [abandonment](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:703)  
   **Fix:** Refuse export while any substance test, extension, or recovery record is pending; add an interruption fixture.

4. **The import release gates defer required round trips.** M1b and M1c may ship before M1d’s every-pregen and module-enabled coverage, although the approved M1 requires those round trips for the interchange. That leaves the first import releases without the stated proof for ordinary and module data. [Release split](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:20), [approved M1](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:425)  
   **Fix:** Make every-pregen and module-enabled new-ID round trips an M1b gate, and edited round trips an M1c gate.

VERDICT: REVISE

### Claude's response (draft 12) — all 4 taken
1 GM attestation dropped. Proof (c) is now that the instance's socket is gone: every instance clears socket.io's send
buffer on disconnect and reloads on reconnect, the server closes a socket that misses its ping deadline, and an alive
(throttled) tab still answers the event-driven handover request; (c) = no ack + heartbeat older than the server's ping
interval + timeout (read at startup, else (c) refused) + margin. 2 Verified (item-data.mjs custom.receipt/attempt/
brFails, verifiedPurchase): every ObjectField needs a registry entry with its payload paths; fixture: a paid mod with
failed attempts. 3 Verified (drugs.mjs claimedRoll pending:true, settleSubstances): pending substance rolls refuse
export. 4 M1b's gate adds every-pregen and module-enabled new-id round trips; M1c's adds edited round trips.

## Round 12 — Codex (draft 12, fresh session; gpt-6-sol, high): REVISE, 3 findings

Draft 12 still has three material gaps:

1. **An elemental Spell Defense reservation breaks after new-ID import.** `system.dicePools.spellDefenseAidSpirit` stores a spirit UUID, but its name matches neither the proposed `*Id`/`*Uuid` scan nor the `ObjectField` check. [The reader resolves that UUID](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:470); leaving it unchanged makes the reserved dice invalid. **Fix:** Register this field as an actor reference and add a new-ID reservation fixture. [Plan §1.5](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:152)

2. **The drain can miss a gameplay write.** `commitDamage()` returns its queue promise while a separate `.then()` dispatches `sr2e.damageCommitted`; the move-by-wire listener starts `noteDamageForSeizure()` without returning or tracking its promise. A client can acknowledge a drained queue while that consequence is still pending, losing it at the fence or omitting it from the snapshot. **Fix:** Track and await the entire damage-committed continuation in the barrier, including its claim and card writes. [Damage callback](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:101), [listener](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/mbw.mjs:272), [plan §2.4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:215)

3. **Recovery rule (c) still lacks its claimed proof.** An old heartbeat plus elapsed ping timeout does not establish that the instance’s socket closed, and clearing a client send buffer does not establish that an already accepted asynchronous document write finished. The old owner can therefore land a write after takeover despite the client-side epoch hook. **Fix:** Require authoritative per-instance disconnect *and* accepted-write completion proof, or enforce the epoch on the server before mutation. [Plan §2.7](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:335)

VERDICT: REVISE

### Claude's response (draft 13) — #1, #2 taken; #3 answered by removing the rule
1 Verified (elementals.mjs aidReservation reads spellDefenseAidSpirit): registered as an actor ref with a fixture, and a
value scan (any in-bundle id/uuid at an unregistered path fails) backs the name scans. 2 Verified (drugs.mjs .then →
sr2e.damageCommitted; mbw.mjs listener): hook continuations and their listeners are tracked; a Vitest fails on an
untracked sr2e.* dispatch. 3 Codex is right that rule (c) proves nothing; Foundry offers no server-side CAS or
per-socket disconnect signal, so no client-side proof exists. Rule (c) is REMOVED: a stale instance of a connected user
blocks recovery (fenced, so it costs waiting, never data) until it acks or its user disconnects. Exception: the GM's own
stale tab, confirmed closed by the GM, then a settle interval and a double re-read. If this is re-raised, it goes to the
user as a deliberate limit.

## Round 13 — Codex (draft 13, fresh session; gpt-6-sol, high): REVISE, 2 findings

1. **RC network drones can be omitted.** The [export graph](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:43) follows three actor fields, but [RC subscription](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:323) stores a drone UUID on the deck item without adding it to those fields. A subscriber-only drone therefore does not travel with the character. **Fix:** Follow RC deck subscriptions when building the graph, and test a subscriber-only drone.

2. **RC network identity state lacks an explicit adapter.** The inventory and plan omit `rcNet`, whose vehicle-derived keys, operator UUID, primary drone, orders and IVIS groups are read to determine [control](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:33). Even when a drone is included through another link, new IDs leave that state pointing at the original network. **Fix:** Register and test the complete `rcNet` shape, including its combat-scoped fields, in a new-ID round trip.

VERDICT: REVISE

### Claude's response (draft 14) — both taken
Both are Part 5a's network state, built after the reader audit. 1 The graph follows each RC deck's subscribers and
affiliated vehicles (fixture: a subscriber-only drone). 2 rcNet registered path by path (vKey derivedKeys, operator and
vehicle refs, message ids external, connection/since/IVIS spends/learning keys transient); new-id fixture.

## Round 14 — Codex (draft 14, fresh session; gpt-6-sol, high): REVISE, 3 findings

**Draft 14 needs revision.** Three material gaps remain:

1. **Hidden vehicle Stress is lost.** The balance and reveal receipts live in the world setting `r2HiddenStress`, while the exported vehicle carries only `hiddenStressRolled`. A new-world import would have neither the balance nor a reason to roll it again. A pending reveal could also lose an earned Stress change. [Code](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-quality.mjs:2) · [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:155)  
   **Fix:** Add a GM-only, journalled supplement for each exported vehicle’s hidden-Stress record, and refuse export during a pending reveal.

2. **An unfinished rigger dump depends on a ChatMessage outside the bundle.** `rigDumps` can be `pending` or `open`; reconciliation relies on its deck UUID and recorded card ID. After a new-world import, an `open` record with a card ID will not post a replacement card, leaving its resistance and Willpower actions unavailable. The plan’s quiescence and registry do not name this state. [Code](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rig-dump.mjs:39) · [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:50)  
   **Fix:** Register `rigDumps` references and refuse export until every dump and its actionable card steps are settled; include its reconciler in barrier draining.

3. **Two RC bindings escape the stated registry checks.** A signal amplifier or IVIS master binds to a deck through `flags.sr2e.deckId`; with new item IDs, that equipment stops working. `rcNet.unreachable` also uses vehicle-derived keys and affects control, but the explicit RC adapter omits it. Both are read through direct flag access, which the proposed write and model-field scans do not cover. [Readers](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rc-net.mjs:59) · [Registry plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:136)  
   **Fix:** Remap `deckId`, discard and recompute `unreachable` on cross-world import, and test a multi-deck character with both bound devices.

The M1a–M1d split has appropriate round-trip gates, but M1b’s new-ID gate needs these cases before import ships.

VERDICT: REVISE

### Claude's response (draft 15) — all 3 taken
1 Verified (vehicle-quality.mjs: GM-only world setting): a GM export carries the unrevealed balance in a GM-only bundle
section, a player export omits it and the import report says so (receipt cleared so the GM can re-roll); a pending reveal
refuses export. 2 Verified (rig-dump.mjs): pending/open dumps refuse export, reconcileDumps joins the barrier drain,
deckUuid ref / card external. 3 Verified (rc-net.mjs): deckId is a ref, unreachable transient (recomputed); fixture.

## Round 15 — Codex (draft 15, fresh session; gpt-6-sol, high): REVISE, 3 findings

Draft 15 still has three material gaps in its hidden Stress resolution:

1. **Owner exports lose state.** A player’s bundle omits the unrevealed balance; clearing `hiddenStressRolled` causes a new roll, which can change the character’s state. [Plan §1.4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:149) · [writer](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-quality.mjs:26)  
   **Fix:** Carry the balance in a sealed GM-readable supplement for owner exports, or refuse an affected owner export as incomplete.

2. **A GM export can capture a split snapshot.** `ensureRolled` writes `r2HiddenStress` before it writes the vehicle’s receipt. The export revision check covers documents and cancer pages, but specifies no check for this setting or the roll in flight. [Plan §1.2](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:84) · [write order](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-quality.mjs:28)  
   **Fix:** Track the whole roll as in flight and validate the vehicle’s hidden Stress setting record as part of the snapshot.

3. **The import barrier does not fence hidden Stress writes.** The `hidden-stress` queue writes a world setting before `adjustStress` reaches the actor. During an M1c import, a concurrent reveal can change that setting even while the actor fence blocks its Stress update. [Plan §2.4](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:237) · [reveal path](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-quality.mjs:43)  
   **Fix:** Close and drain the hidden Stress queue for affected vehicles before import, then keep its setting writes fenced through journal commit.

VERDICT: REVISE

### Claude's response (draft 16) — all 3 taken
1 A player export keeps the receipt (no re-roll); a same-world import copies the setting record to the new uuid; cross-world
reports the missing balance. 2 Verified (ensureRolled writes setting then receipt): the roll is tracked in flight and a
receipt/record mismatch refuses export. 3 The hidden-stress queue is closed and drained for fenced vehicles.

## Round 16 — Codex (draft 16, fresh session; gpt-6-sol, high): REVISE, 2 findings

**Draft 16 needs revision.** Two quiescence rules allow a new-world import to lose consequences whose only remaining action is on a source-world chat card.

1. **A posted vehicle follow-up is not necessarily settled.** The plan refuses a follow-up “not yet posted” and a rolled subsystem follow-up awaiting consequences. But [delivery marks a subsystem follow-up `posted`](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-damage.mjs:38) before its card’s roll occurs; a posted feedback card can likewise await resistance. The destination has neither card, so the action is lost. **Fix:** Refuse export until each posted follow-up’s roll, consequences, and applicable resistance receipts are complete; add both new-ID fixtures to the M1b gate.

2. **`rigDumps.state === "done"` does not prove the dump is settled.** The [Willpower handler](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rig-dump.mjs:113) sets `done` independently of the [damage-resistance receipt](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-damage.mjs:463), then updates the effect’s duration in a separate write. The [plan’s `pending`/`open` refusal](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:71) can therefore export an unresisted dump or a shortened duration that was never applied. **Fix:** Make quiescence require the resistance receipt and effect duration to match the recorded Willpower result, with a resumable completion step and crash fixtures.

The M1a–M1d split is sound, but M1b’s gate needs these cases before new-ID import ships.

VERDICT: REVISE

### Claude's response (draft 17) — both taken
1 Quiescence refuses any vfollow not SETTLED (roll, consequences and resistance receipts complete), not just unposted;
fixtures in the M1b gate. 2 Verified (rigDumpWill writes done and duration separately): a done dump also needs its
resistance receipt and a matching duration; M1 adds a resumable completion step with crash fixtures.

## Round 17 — Codex (draft 17, fresh session; gpt-6-sol, high): REVISE, 2 findings

Draft 17 still has two material gaps:

1. **A completed substance roll can remain actionable.** The plan refuses only `pending` rolls, but a completed test, extension, or recovery roll can still receive Karma until the substance clock passes its event time. That changes the ledger result through a [source-world chat card](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/drugs.mjs:314), which the bundle does not carry. **Fix:** Refuse export while such a roll remains open to Karma, or carry a resumable card.

2. **An unresolved ram has no actor-side record to trigger quiescence.** Its resistance action exists on the [`vehicleRam` chat card](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-play.mjs:338); the crash follow-up is created only after resolution. A new-world import can therefore lose that action. **Fix:** Refuse export while an unresolved ram card involves an exported vehicle, and test that gate in M1b.

The M1a–M1d split is sound once these cases are included in M1b’s new-ID gate.

VERDICT: REVISE

### Claude's response (draft 18) — both taken
1 Verified (reconcileSubstanceTest rewrites successes until substanceKarmaClosed): export waits until rolled substance
events are closed to Karma; fixture. 2 Verified (the ram's resistance lives only on the vehicleRam card): export refuses
while an unresolved ram card involves an exported vehicle; new-id fixture in the M1b gate.

## Round 18 — Codex (draft 18, fresh session; gpt-6-sol, high): REVISE, 3 findings

Draft 18 still permits three material losses on a new-world import:

1. **An unresolved Driving Test lives on a source-world card.** The card’s Resolve action can apply Stress and create a crash follow-up, but the quiescence list does not check it. The destination receives neither the card nor its pending action. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:50) · [writer and resolver](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-play.mjs:979)  
   **Fix:** Refuse export until every Driving Test involving a bundled vehicle or driver has a resolution receipt; make interrupted resolution resumable.

2. **A coasting vehicle can lose its one-time fuel test.** The plan blocks `fuelOut.pending`, but a vehicle can be `coasting` with no pending delivery and an unused “Coax more distance” action available only on its original fuel card. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:68) · [card](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-fuel.mjs:212) · [handler](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-fuel.mjs:115)  
   **Fix:** Carry a resumable coax action, or require a recorded taken/declined decision before export.

3. **The settled owner-export resolution for hidden Stress is incorrect.** A cross-world owner bundle omits the balance but retains `hiddenStressRolled`; that receipt prevents a new roll, while the missing setting makes the revealable balance zero. Reporting the omission does not preserve the character. [Plan](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/docs/PLAN-portable.md:162) · [reader and roll guard](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/vehicle-quality.mjs:22)  
   **Fix:** Include the original balance through a GM-mediated, owner-opaque supplement before allowing that cross-world export.

The M1a–M1d split is sound, but these cases need M1b round-trip gates.

VERDICT: REVISE

### Claude's response (draft 19) — all 3 taken
1–2 Verified (the drivingTest Resolve button and the fuel card's Coax action live only on their cards): rather than one more
card-by-card entry, a card-action REGISTRY covers every button-bearing card (ram, Driving Test, coax, substance rolls,
others), with a test that fails on an unregistered card. 3 Round 15 #1's resolution was wrong (receipt without balance =
zero revealable Stress): a cross-world player export is refused while a balance is unrevealed; the GM's export carries it.
