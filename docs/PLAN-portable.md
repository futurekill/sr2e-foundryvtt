# Plan: portable characters — Foundry export/import (chargen milestone M1)
_Draft 2 (2026-11-14), after Codex round 1 (13 findings, all taken). Implements milestone **M1** of the standalone
character generator (../sr2e-chargen/docs/PLAN.md, approved at Codex round 12: "Portable character JSON", D4–D13,
Milestones → M1). That plan is the requirement; this one is HOW it is built in the system repo. Useful on its own as a
character backup._

## Goal
A GM (or a character's owner) can export a character — with the vehicles, drones and bound spirits it references, its
images and everything Foundry knows about it — to one file, and import that file into the same or another world with
nothing lost, nothing applied twice, and every internal reference pointing at the right documents. The same format is
what the chargen web app reads and writes.

## Scope by release
- **M1a — export, the format, the registry, the migration runner** (`module/portable/`): the bundle, complete source,
  portable ids, reference rewriting, the asset zip, the prepared snapshot with its context, the identity registry and
  its CI checks, the owned-paths schema, AND the extracted pure migration runner with its parity tests and historical
  fixtures (round 1 #11: import depends on it, so it ships first). Export only: nothing in a world can be damaged
  beyond the portable-id stamp (§1.3).
- **M1b — import as NEW documents** (any world): preflight, archive safety, identity reservation and remapping, assets,
  ruleset acceptance, the fence, the write journal and recovery, clock re-anchoring, migrations on read.
- **M1c — import OVER an existing actor**: recursive source reconciliation with confirmed deletions (items, effects,
  flags, fields), `edits[]`/`deleted[]`, backup/restore with the same ids.
- **M1d — hardening**: round trips over every pregen and module-enabled character, failure injection at every journal
  step, multi-client fence tests.

## 1. The format and export (M1a)
```
{ schema: "sr2e-portable", schemaVersion: 1, systemVersion, coreVersion, modules: { id: version },
  exportedBy: { app: "foundry", worldId, user? }, metadata: { name, exportedAt, worldTime, serverTime },
  ruleset: { vehicleRuleset, matrixRuleset, cyberDamage, cybermancy, healingClock, … },   // D4
  books: [moduleIds],                                                                    // D4
  root: portableId,
  documents: [ { portableId, documentName: "Actor", source, prepared: { $schema, $context, … },
                 portable: { items: {id→pid}, effects: {id→pid}, itemEffects: {itemId: {id→pid}} } } ],
  edits: [], deleted: [],                                                                 // creator patch (empty from Foundry)
  unresolved: [ { from: pid, path, kind, ref } ],
  assets: [ { path, file, sha256, bytes } ] }
```
### 1.1 Graph (D6)
Start at the root actor; follow `system.linkedVehicles`, `system.controlledVehicles`, `system.boundSpirits` (vehicles
and spirits: nothing further); every reached actor is one document, stored once. Unlinked token actors are exported
from their synthetic source. A reference to something not exported → `unresolved[]`.

### 1.2 A consistent snapshot (round 1 #9)
- **Quiescence first.** Export refuses — naming each — while the graph has an OPEN multi-document transaction: an open
  import journal or fence; a vehicle customization request admitted but not delivered or released (`custRequests`); a
  cybermancy operation without op-done; an unfinished dose (`resumeDoses` pending); an unsettled money queue entry; an
  open crash/impact record; a VR2 request the sequencer hasn't settled. The list is ONE function,
  `openTransactions(actor)` in `module/portable/quiescence.mjs`, each entry owned by its subsystem (a test fails if a
  subsystem with receipts/records lacks one). Partially completed operations are therefore never exported (this also
  removes the "recovery recreates a randomized item" case, round 1 #1).
- **Revision check.** Export reads every source, then the prepared projections, then re-reads each document's
  `_stats.modifiedTime` (actor and embedded) and the quiescence check; any change → retry (3 times, then refuse).
- The export runs on the active GM (`gmCall("portableExport")`), so it sees the same queue state as every writer.

### 1.3 Complete source and portable ids (D5; round 1 #10)
- `doc.toObject()` of each actor with its embedded items and effects (actor effects AND item effects), flags included.
- **Portable ids** are written ONCE per document lacking one (`flags.sr2e.portableId`), by the active GM inside the
  world queue `portable-ids` (one writer, so two clients can't assign different ids; it needs no owner permission on
  vehicles or spirits). **Duplicates**: within a graph, two documents with the same pid → the one created later
  (`_stats.createdTime`, then id) gets a fresh pid before export; **clones**: a `preCreate` hook on Actor/Item/
  ActiveEffect strips `flags.sr2e.portableId` from any create that isn't `sr2eImport` and isn't a `keepId` restore
  (duplicates, compendium imports, drag copies), so a copy never inherits its original's identity.
- `ownership` is exported for information only and NEVER restored (§2.6).

### 1.4 References and identities — the registry (D11; round 1 #1–#4)
`module/portable/registry.mjs` classifies every identity-bearing SHAPE (not just flag names). Each entry has a
location — a parent-aware path: `actor.<path>`, `actor.items[].<path>`, `actor.effects[].<path>`,
`actor.items[].effects[].<path>`, `actor.prototypeToken.<path>` — and a kind:
- `data` — plain values, carried as is;
- `ref` — an id/uuid of a document IN the bundle (actor, item, effect; values or keys): rewritten to
  `portable:<pid>[/items/<pid>|/effects/<pid>|/items/<pid>/effects/<pid>]` on export and to the new ids on import;
- `derivedKey` — a key DERIVED from an identity by a named function (`permKey`, `shiftKey`, `stateKey`, `followId`,
  `claimId`, and composite strings like `deck:<uuid>@<conn>`, `cym:item:<opId>:<slot>`, timestamp-bearing notice keys):
  the adapter parses it, remaps its parts (identities AND, for time parts, the clock rebase of §2.5) and re-derives it;
- `deterministicId` — a document `_id` derived from a key (round 1 #1): claim/event markers (`claims.mjs`), cybermancy
  implant items (`claimId("cym:item:<opId>:<slot>")`), delivered customization items (`_id` = request id), frame actors
  (`_id` = upload id) and SK incarnations, and every other `keepId` site (vehicle-base, vehicle-list, combat-spells,
  drugs, vr2ic, sheet-actions, the workshop — the inventory names each). Identity reservation re-derives these from
  their REMAPPED keys (never random), in dependency order, and remaps every reference to them;
- `event` — an event-log record (`recordEvent`, the `substanceLog`, `vr2:` facts, `cym:*`, mbw, `permdmg:` …) whose
  payload embeds identities: ONE adapter per event type (round 1 #4) listing the payload paths (item ids, other event
  keys — mbw `void` targets, `mbwApplied` receipt keys = `claimId(recordKey)` — cybermancy proposals with item snapshots
  and `cyberIds`, VR2 crash records with item ids in keys and payloads); identities are mapped through ONE
  dependency-ordered identity map (documents → embedded → deterministic ids → derived keys → event payloads);
- `external` — a reference to a document OUTSIDE the bundle, typed (round 1 #3): `{ docType: Actor|Token|Scene|Region|
  RegionBehavior|User|JournalEntry|Combat|Combatant|ChatMessage, worldId }`. Kept only on a same-world import
  (`exportedBy.worldId` = this world) when the document still exists; otherwise it is dangling and listed
  (`unresolved[]`, the import report). Matrix hosts/places (`skSessions`, `vr2Moves`) are `external Actor`;
  chat-card receipts are `external ChatMessage` (their readers only compare keys — confirmed per entry in the reader
  audit);
- `transient` — live session state bound to the table (jackpoint `matrixSessions`, persona tokens, astral form origins,
  `engaged`, combat-scoped `spellEffect` timing): kept on a same-world restore when every referent exists, else
  REMOVED on import and listed — a jack-in or a combat can't move worlds;
- `worldTime` / `serverTime` / `monotonic` / `duration` — clocks (§2.5);
- `opaque` — unknown: carried as is; an identity-CHANGING import refuses when a scan finds a uuid/id of an exported
  document inside it, naming it; same-id restores pass.
Effects' `origin` and system fields holding ids (`linkedWeaponId`-style) are registry entries too.

**Inbound references** — documents outside the bundle that point AT the actor (cancer journal pages, Calendaria
healing/substance notes) — are not exported; an import under new ids lists them so the GM can relink.

### 1.5 The CI checks (round 1 #2)
- **Shape inventory** (Vitest, `test/portable-registry.test.mjs`): an espree AST walk of `module/` (espree ships with
  ESLint) finds every write: `setFlag/getFlag/unsetFlag("sr2e", …)`, string and template-literal update keys under
  `flags.sr2e.`, nested object literals under `flags: { sr2e: … }`, `once()`/`recordEvent()`/`claimId()` key prefixes,
  and every `keepId` create. A DYNAMIC path (a computed key it can't resolve) must carry a `// portable: <entry>`
  annotation naming its registry entry. The test fails on any shape without an entry — per shape and per event type,
  not per top-level name (a new payload inside `claim` is caught).
- **Adapter coverage**: every `ref`/`derivedKey`/`deterministicId`/`event` entry has a fixture-driven round-trip test
  (export → new ids → import → the reader finds it).
- First-pass inventory: docs/PORTABLE-FLAG-INVENTORY.md (`tools/flag-inventory.mjs`; superseded by the AST scan).

### 1.6 Prepared snapshot (D12; round 1 #12)
A versioned projection of derived values (attributes, pools, monitors, essence, effective vehicle stats…) with a tagged
codec for Sets/Maps/getters (`{ $set: [...] }`, `{ $map: [[k,v]] }`); `prepared.$schema` lists what's carried and
`prepared.$context` records the D9 derivation context it was derived under (the world settings read, system and module
versions). Read-only.

### 1.7 Owned paths (D5; round 1 #12)
`schema/owned-paths.json` (D7): the source paths the creator may edit, versioned with `schemaVersion`. Foundry exports
write `edits: []` and `deleted: []`; Foundry imports show any present ones (M1c applies `deleted[]` after confirmation).

### 1.8 Assets
A zip `<handle>.sr2e.zip` = `character.json` + `assets/`; every image the graph references — actor portrait and token
texture, item images, effect icons, `<img src>` in rich text — copied and rewritten to `assets/<sha256>.<ext>`.
`systems/sr2e/…` and `modules/…` paths travel as references; anything unreachable stays as is, listed. JSON-only export
available. Zip writing in the browser with fflate (vendored, pinned).

## 2. Import (M1b, M1c)
### 2.1 Archive and file safety (round 1 #13)
- **Streaming and bounded**: fflate's streaming `Unzip`, entry by entry; limits checked BEFORE allocation from the
  local headers and ENFORCED on the actual bytes as they stream (abort on overrun): ≤ 64 entries, ≤ 20 MB expanded in
  total, ≤ 5 MB per entry, compression ratio ≤ 100:1.
- **Names**: NFC-normalized, `/`-separated, plain relative paths (no `..`, no absolute, no backslashes, no drive
  letters), unique case-insensitively, only `character.json` and `assets/<sha256>.<ext>`; symlink entries (zip external
  attributes) and directories rejected.
- **JSON**: size-capped, parsed once, then validated against `schema/portable.schema.json` (ajv, already a dev
  dependency; vendored for runtime) before any other use.
- **Images**: the header's declared dimensions checked first (≤ 4096 × 4096, ≤ 16 MP), decoded with
  `createImageBitmap`, re-encoded to WebP through `OffscreenCanvas`, and only the RE-ENCODED bytes are uploaded; the
  sha256 must match the manifest.

### 2.2 Preflight, before ANY write
Schema and every version (D10: newer → view-only, refused here with the reason); modules present (missing → its
documents refused, named); references resolvable or listed; **ruleset acceptance** (D4); the registry checks for
identity-changing imports (opaque scan, `transient`/`external` listing); the inbound-reference report.

### 2.3 Identity reservation
New imports reserve new ids for every document, item and effect (`randomID`), re-derive every `deterministicId` and
`derivedKey` from the remapped identities (§1.4, dependency order), all held in the journal; a same-world backup
restore may keep ids (`keepId`) when they are free.

### 2.4 The fence (round 1 #5)
- **Atomic with creation**: actors created by the import carry `flags.sr2e.importFence = { importId }` in their CREATE
  data; existing actors (M1c) get it in one update first.
- **Commit-time enforcement on every client**: one set of `preCreate/preUpdate/preDelete` hooks for Actor, Item and
  ActiveEffect (`module/portable/fence.mjs`) VETOES any write to a fenced actor or its embedded documents unless the
  write carries `sr2eImport` with that `importId`. A writer already past an `await` is stopped at its commit — no
  drain acknowledgement is needed for safety. Writers that write OTHER documents about the actor (a payer's money
  queue receipt for a fenced vehicle's request, a chat card) are covered by quiescence (§1.2 applies to import too:
  M1c refuses over an actor with open transactions).
- **Admission closure**: queues and reconcilers (money, `damage:`, `vdmg:`, `vr2op:`, `rc-control`, pool, matrix, the
  healing/substance clocks, mbw/cybermancy reconcilers incl. delayed ones, astral forms, persona tokens, jackpoints,
  overhead, chase and vehicle GM passes, the VR2 sequencer) check `fenced(actor)` at admission and skip without error,
  re-scheduling themselves on unfence (a `sr2e.unfenced` hook). A Vitest grep check fails if a writer module from that
  list doesn't import `fence.mjs`; Quench proves the veto on two clients and across a GM handover.

### 2.5 Clocks (round 1 #8)
- **One rebase per bundle**: Δworld = destination worldTime − `metadata.worldTime`; Δserver = now − `metadata.serverTime`.
  EVERY `worldTime` instant (deadlines and historical instants alike) and every `monotonic` value of the bundle
  (`substanceClock`, the substance log's times, `cymCare`, healing `dueAt`, move-by-wire `since`, `presentSince`,
  AE `duration.startTime`) shifts by the same Δworld, so order and every elapsed time are preserved exactly. Values may
  become negative; the code that floors a clock (drugs.mjs `effectiveClock`'s `Math.max(0, …)`) changes to floor the
  ELAPSED time, not the instant, with a test.
- `serverTime` (claim `at`, STUCK/TTL) shifts by Δserver.
- Time-bearing `derivedKey`s (cybermancy notice keys) are re-derived from the shifted time.
- **Combat durations** (`duration.combat`, `startRound`, `startTurn`): the combat is `transient` — on a new-world
  import the AE keeps its remaining rounds (`rounds − (combat.round − startRound)` at export, stored in the bundle)
  re-anchored to the next combat it joins, listed in the report.

### 2.6 Writes, `sr2eImport` and ownership
- Every write carries `{ sr2eImport: importId }`. **Every** document hook with gameplay consequences — pre AND post,
  create, update AND delete, on Actor, Item, ActiveEffect and their embedded descendants, plus deferred callbacks
  they schedule (round 1 #7: shapeshift death results on `createActiveEffect`, vr2ic's sequencer/dataworm scheduling
  on effect creation, drugs' tombstones, receipt stripping and deletion veto) — returns early on it. A **hook
  inventory test** (AST) lists every `Hooks.on("(pre)?(create|update|delete)…")` in `module/`; each must be marked
  either `import-safe` (no gameplay consequence: renders, caches) or `import-guarded` with a behavioural Quench case
  (import a fixture that would trigger it; assert nothing fired). A new unlisted hook fails CI.
- **Ownership** (D7 "Permissions"): the exported `ownership` is replaced on import: the importing user owner, the
  world's default otherwise.
- Embedded items are authoritative; `_stats.compendiumSource` restored for provenance only.
- Assets uploaded to `worlds/<world>/sr2e-imports/<rootPid>/`, paths rewritten; a failed upload → warning + default.

### 2.7 The write journal and recovery (round 1 #6)
- One journal per import: a page of the hidden journal entry `SR2E Imports`, `flags.sr2e.importJournal` = { importId,
  phase: reserved → writing → written → committed → closed, lease: { userId }, steps: [ { op, docRef, expectBefore
  (sha256 of the source, or "absent"), target (the full final source), ackAt } ] }.
- **Ownership proof**: every document the import creates carries `flags.sr2e.importId` in its create data; recovery
  treats an existing document as this import's only if it carries that id AND its source hash equals the step's
  `target` (done) — otherwise it is DIVERGENT.
- **Roll-forward** per step: absent → create; equals target → done; equals `expectBefore` → re-apply; anything else →
  divergent: STOP, list it, the GM chooses (rollback or keep as is). Rollback symmetrically restores `expectBefore`
  only where the document equals `target` or `expectBefore`, listing divergences.
- **One recovery owner**: imports and recovery run only on the active GM, serialized in the world queue `sr2e-import`
  (one import at a time per world); each step first checks the journal's `lease` is this user (a GM handover takes the
  lease in one update, then resumes). Recovery runs on GM `ready` and from a button.
- **Commit and unfence**: `written` → unfence each actor (`-=importFence`, with `sr2eImport`) → `committed` → `closed`;
  every transition is idempotent, so a crash at any point resumes.

### 2.8 Existing-actor reconciliation (M1c, chargen round 11)
Match items/effects by `portableId`; unmatched → create; in the destination but not the bundle → delete (listed,
confirmed); within a document, keys absent from the bundle's source are deleted with `-=`; `deleted[]` applied after
confirmation. Tests: a removed sustained-spell effect, item effect and flag stay removed.

## 3. Migrations on read (M1a; D10; round 1 #11)
- Extract a pure runner from `module/migrations.mjs` that keeps its EXACT staging (`migrateActor` today): stage 1 —
  every pending `migrateActor` reads the SAME actor source S0 and their updates merge (mergeObject with `-=`
  deletions, `diff: false` semantics) into S1; stage 2 — every item's pending `migrateItem` reads that item's source
  and S1 as the parent, merged per item into S2; stage 3 — `addItems` reads S2 and appends. Explicit context
  (settings, versions) instead of world reads; schema defaults applied as Foundry's `cleanData` would (the
  `field === undefined` trap). The world runner becomes a thin caller; parity test: same output both ways over the
  fixtures.
- Four version axes: `schemaVersion` (`module/portable/migrations/`), `systemVersion` (the runner), `coreVersion`
  (`Actor.fromSource` + `migrateData` in a sandbox), each module's version (a hook; none yet).
- Applied on read to a COPY; the original file is never modified. Newer than known → view-only.
- Historical fixtures (one per `schemaVersion`, plus a 0.152.0-era character) in `test/fixtures/portable/`, in M1a.

## 4. Checks
- Vitest: round trips (export → import → export equal modulo ids) per pregen fixture; the shape inventory and hook
  inventory; every adapter; clock rebase (order and elapsed preserved, negative instants); archive limits and names;
  schema validation; runner parity; reconciliation deletions.
- Quench `sr2e.portable`: export/import of a complex character (vehicles, a drone, a bound spirit, ware incl. a
  completed cybermancy operation, a sustained spell, addiction log, healing clock, shapeshift state, mbw records) into
  the same world under NEW ids, comparing prepared values and retrying every claim/event (no new consequence);
  existing-actor round trip with removals; failure injection before/after each journal step; divergent document
  handling; fence veto on two clients and across a GM handover; quiescence refusal; clone stripping of portable ids.

## Key decisions & tradeoffs
- Quiescence over capturing in-flight transactions: refusing to export a half-finished operation is simpler and safer
  than adapting its recovery across worlds; the refusal names what to finish.
- The fence is a commit-time veto in pre-hooks on every client (plus admission skips), not a drain protocol: work past
  an `await` can't commit, so no cross-client acknowledgement is needed.
- The registry classifies SHAPES (AST scan) with per-event adapters; unknown shapes are opaque and only block
  identity-changing imports that would carry a bundle identity.
- Migration runner first (M1a), since import depends on it.

## Risks / open questions
- The reader audit per registry entry is the bulk of M1a.
- `Actor.fromSource` + `migrateData` across core versions needs verification on v13 → v14.
- OffscreenCanvas WebP encoding on the user's hosts (fallback: PNG re-encode).

## Out of scope
The chargen web app itself (M3+), citations (chargen "M1b Citations" stays a separate milestone), content-module
migrations beyond the hook.
