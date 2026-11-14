# Plan: portable characters — Foundry export/import (chargen milestone M1)
_Draft 1 (2026-11-14), not yet reviewed. Implements milestone **M1** of the standalone character generator
(../sr2e-chargen/docs/PLAN.md, approved at Codex round 12: "Portable character JSON", D4–D13, Milestones → M1). That
plan is the requirement; this one is HOW it is built in the system repo. Useful on its own as a character backup._

## Goal
A GM (or a character's owner) can export a character — with the vehicles, drones and bound spirits it references, its
images and everything Foundry knows about it — to one file, and import that file into the same or another world with
nothing lost, nothing applied twice, and every internal reference pointing at the right documents. The same format is
what the chargen web app reads and writes.

## Scope by release
- **M1a — export + the format** (`module/portable/`): the bundle (document graph), complete source, portable ids,
  reference rewriting, the asset zip, the prepared snapshot, the flag/identity registry and its CI check. Export only:
  nothing in a world can be damaged.
- **M1b — import as NEW documents** (any world): preflight, identity reservation and remapping, assets, ruleset
  acceptance, the write journal and recovery, the actor fence, clock re-anchoring, migrations on read.
- **M1c — import OVER an existing actor**: recursive source reconciliation with confirmed deletions (items, effects,
  flags, fields), backup/restore with same ids.
- **M1d — migration runner + historical fixtures**: the pure runner extracted from `module/migrations.mjs`, fixtures
  per `schemaVersion`, round-trip suites over every pregen.

## 1. The format (M1a)
```
{ schema: "sr2e-portable", schemaVersion: 1, systemVersion, coreVersion, modules: { id: version },
  exportedBy: { app: "foundry", world?, user? }, metadata: { name, exportedAt },
  ruleset: { vehicleRuleset, matrixRuleset, cyberDamage, cybermancy, healingClock, … },   // D4
  books: [moduleIds],                                                                    // D4
  root: portableId,
  documents: [ { portableId, documentName: "Actor", source, prepared, portable: { items: {id→pid}, effects: {id→pid} } } ],
  unresolved: [ { from: pid, path, ref } ],
  assets: [ { path, file, sha256, bytes } ] }
```
- **Graph** (D6): start at the root actor; follow `system.linkedVehicles`, `system.controlledVehicles`,
  `system.boundSpirits` (and, for vehicles, nothing further); every reached actor is one document, stored once.
  Unlinked token actors are exported from their synthetic source. A reference to something not exported →
  `unresolved[]`.
- **Complete source** (D5): `doc.toObject()` of the actor with its embedded items and effects, flags included, plus a
  `portableId` per actor, item and effect. Portable ids are stable across re-exports: `flags.sr2e.portableId` is
  written ONCE (the first export) on each document lacking one, by its owner's client — the only world write an export
  makes, and it's idempotent.
- **References rewritten** to `portable:<pid>[/items/<pid>|/effects/<pid>]` on export: actor uuids in the three
  system lists; item/effect ids and uuids inside flags and system fields that the registry (§3) marks as references.
- **Prepared snapshot** (D12): a versioned projection of derived values (attributes, pools, monitors, essence, effective
  vehicle stats…) with a tagged codec for Sets/Maps/getters (`{ $set: [...] }`, `{ $map: [[k,v]] }`); read-only; listed
  per document in `prepared.$schema` so the reader knows what's there.
- **Assets** (plan "Assets"): a zip `<handle>.sr2e.zip` = `character.json` + `assets/`; every image the graph references
  — actor portrait and token texture, item images, effect icons, `<img src>` in rich text (biography, notes,
  descriptions) — copied and its path rewritten to `assets/<sha256>.<ext>`. `systems/sr2e/…` and `modules/…` paths
  travel as references; anything unreachable (external URL, missing file) stays as is and is listed with a warning.
  JSON-only export available. Zip writing in the browser with a small pinned dependency (fflate, vendored) — no
  network.

## 2. Import (M1b, M1c)
- **Preflight, before ANY write**: schema and every version (D10: newer → view-only, refused here with the reason);
  modules present (a missing module → its documents are refused, named); references resolvable or listed; archive limits
  (64 entries, 20 MB expanded, 5 MB per entry, compression ratio, plain relative names, decoded image checks);
  **ruleset acceptance** (D4): a dialog lists every setting that differs from the world's and requires "recompute under
  this world's rules"; the registry check (§3) for identity-changing imports.
- **Identity reservation**: new imports reserve new Foundry ids for every document, item and effect (`randomID`), held in
  the journal; a backup restore into the same world may keep ids (`keepId`) when they are free.
- **Write journal** (plan M1): `flags.sr2e.importJournal` on a world-level document (a hidden journal entry
  `SR2E Imports`, one page per import) records the original source of every document it will overwrite (M1c), then,
  BEFORE each mutation, the write's intent and its reserved ids; each write is then made with `{ sr2eImport: true }` and
  acknowledged. **Recovery** (on GM `ready` and from a button): for each open journal, reconcile against the actual world
  with idempotent operations — a create with a reserved id is detected, never repeated; an update is re-applied from
  the journalled target state. Rollback restores journalled originals and refuses if a fenced actor changed outside
  the import.
- **Fence** (plan M1, round 5 #1): the affected actors carry `flags.sr2e.importFence = { importId }` for the whole
  import and recovery; every gameplay writer and reconciler the system has (move-by-wire `reconcile`, healing clock,
  permanent damage, shapeshift regen, substance clock, astral forms, persona tokens, jackpoints, overhead, chase and
  vehicle GM passes, VR2 sequencer) checks `isFenced(actor)` and skips, after draining its pending work. One helper
  `fenced(actor)` in `module/portable/fence.mjs`; a Vitest grep test fails if a known writer module doesn't import it.
- **`sr2eImport` mode** (D13): every preCreate/preUpdate/update hook with gameplay consequences returns early when the
  write carries `options.sr2eImport` — the bundle's final source is written, nothing is replayed. A Quench case per
  hook family proves it (damage buckets, healing revisions, perm-damage episodes, ware lifecycle, claims).
- **Existing-actor reconciliation** (M1c, plan round 11): match items/effects by `portableId`; unmatched → create; in
  the destination but not the bundle → delete (listed, confirmed); within a document, keys absent from the bundle's
  source are deleted with `-=` keys (flags and system fields), never left behind by a merge. Tests: a removed sustained-
  spell effect, item effect and flag stay removed.
- **Embedded items are authoritative** (plan round 1 #5): `_stats.compendiumSource` is restored for provenance only.
- **Assets on import**: uploaded to `worlds/<world>/sr2e-imports/<rootPid>/`, paths rewritten; a failed upload →
  warning + default icon.

## 3. The flag/identity registry (D11) and its CI check
- `module/portable/registry.mjs` lists EVERY `flags.sr2e.<name>` the system writes on actors, items or effects (207
  names found by `grep` today across all document kinds; the registry covers the actor/item/effect ones and marks the
  rest `notExported`), each with a kind:
  - `data` — plain values, carried as is;
  - `actorRef` / `itemRef` / `effectRef` — values or KEYS that are ids/uuids of exported documents (e.g.
    `locks.<followId(uuid)>.targetUuid`, `jamVs`, `controlledVehicles`, `boundSpirits`, `linkedWeaponId`), with a
    JSON-path pattern saying where; rewritten both ways;
  - `hashedKey` — keys DERIVED from a uuid by a function (`permKey`, `shiftKey`, `stateKey`, `followId`): the adapter
    recomputes the key from the remapped uuid;
  - `claimKey` — claim/event markers (`flags.sr2e.claim` on effects, `_id = claimId(key)`): the key string is remapped
    and the marker's `_id` RE-DERIVED (D11 round 8 #2), and every reference to that id remapped too; a test retries
    every imported claim/event and asserts no new consequence;
  - `worldTime` — world-time instants (healing `dueAt`, move-by-wire `since`, substance clock, `presentSince`,
    `cymCare`, …): exported as REMAINING durations relative to the source world's time, re-anchored on import (plan
    round 5 #3); `serverTime` (claim markers' `at`, STUCK/TTL): exported relative to the export moment, re-anchored to
    the importer's server time;
  - `messageRef` — chat message ids (cards): carried as is; readers already tolerate a missing message (the plan's
    "external reference"); listed so a reader audit can confirm;
  - `opaque` — unknown to the registry: carried as is; an identity-CHANGING import refuses when an opaque value contains
    a uuid/id of an exported document (detected by scanning), naming it; same-id restores pass (plan round 3 #1).
- **CI check** (Vitest): a scanner lists every `flags.sr2e.<name>` written in `module/` (the same grep as the inventory)
  and fails when a name is missing from the registry — every future flag must be classified when it's added.
- Effects' `origin` uuids and items' `system.linkedWeaponId`-style fields are registry entries of their own (system
  fields, not flags), listed under `systemRefs`.

## 4. Migrations on read (M1d; D10)
- Extract a pure runner from `module/migrations.mjs`: given source + context (settings, versions) it applies every
  pending entry in ascending order, all reading the SAME source, item migrations receiving the owning actor's source,
  `addItems` creations honoured — the world runner becomes a thin caller (parity test: same output both ways).
- Four version axes per bundle: `schemaVersion` (portable migrations in `module/portable/migrations/`), `systemVersion`
  (the extracted runner), `coreVersion` (Foundry document format: `foundry.documents` `migrateData` via
  `Actor.fromSource` in a sandbox), each module's version (a module may register portable migrations; none do yet).
- Applied on read to a COPY; the original file is never modified. Newer than known → view-only.
- Historical fixtures (one per `schemaVersion`, plus a 0.152.0-era character) in `test/fixtures/portable/`.

## 5. Checks
- Vitest: format round trips (export → import → export equals, modulo ids) for every pregen fixture; registry scan;
  reference rewriting incl. hashed keys and claim ids; timestamp re-anchoring; archive limits; migration runner
  parity; reconciliation deletions.
- Quench `sr2e.portable`: export/import of a complex character (vehicles, a drone, a bound spirit, ware, a sustained
  spell, addiction log, healing clock, shapeshift state) into the same world under NEW ids, comparing prepared values;
  existing-actor round trip with removals; failure injection before/after each journal acknowledgement; fence honoured
  by every writer; `sr2eImport` skips every gameplay hook; claims don't fire twice.

## Key decisions & tradeoffs
- Export-only first (M1a) so the format and registry can be checked against real worlds before any import writes.
- The registry + CI scan is the guard against silent identity loss as the system keeps growing (207 flag names today).
- A vendored zip library instead of a server-side endpoint: Foundry has no system-side upload API for zips.

## Risks / open questions
- Classifying 207 flag names is the bulk of M1a; each entry needs a reader audit (what breaks if this id is stale).
- Foundry's `Actor.fromSource` + `migrateData` across core versions needs verification on v13 → v14 (memory: v14
  verified for the system).
- Image re-encoding in the browser for the decode checks (OffscreenCanvas) — confirm on the user's host.

## Out of scope
The chargen web app itself (M3+), citations (M1b of the chargen plan, renamed here to avoid confusion: chargen "M1b
Citations" stays a separate milestone), content-module migrations beyond the hook.
