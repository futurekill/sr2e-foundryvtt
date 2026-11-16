# Plan: portable characters — Foundry export/import (chargen milestone M1)
_Draft 27 (2026-11-15), after Codex rounds 1–26 (13 + 8 + 6 + 3 + 3 + 2 + 3 + 1 + 4 + 3 + 4 + 3 + 2 + 3 + 3 + 2 + 2 + 3 + 3 + 4 + 1 + 1 + 1 + 2 + 1 + 1 findings; round 12 #3 answered differently, see the log); draft 3 added the reader audit
(docs/PORTABLE-FLAG-INVENTORY.md). Implements milestone **M1** of the standalone
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
- **Release gates** (round 2 #8): M1b ships only with its failure-injection (a crash before/after every journal step,
  recovery and rollback) and multi-client barrier/fence tests (two clients, a GM handover) passing; and (round 11 #4,
  the approved M1's interchange proof) new-id round trips of EVERY pregen and of module-enabled characters; M1c only
  with its overwrite, deletion and rollback tests and EDITED round trips (export → edit → import over). **M1d** adds
  coverage beyond those gates (historical fixtures for each new `schemaVersion`, wider module combinations).

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
Start at the root actor; follow `system.linkedVehicles`, `system.controlledVehicles`, `system.boundSpirits`, and the
vehicles named by its remote-control decks' networks (round 13 #1: `flags.sr2e.rcNet.subscribers[]` and
`affiliated.*.uuid` on each RC deck item — a subscriber-only drone is in none of the three fields; fixture) (vehicles
and spirits: nothing further); every reached actor is one document, stored once. Unlinked token actors are exported
from their synthetic source. A reference to something not exported → `unresolved[]`.

### 1.2 A consistent snapshot (round 1 #9)
- **Quiescence first.** Export refuses — naming each — while the graph has an OPEN multi-document transaction: an open
  import journal or fence; a vehicle customization request admitted but not delivered or released (`custRequests`); a
  cybermancy operation without op-done; an unfinished dose (`resumeDoses` pending); an unsettled money queue entry; an
  open crash/impact record; a VR2 request the sequencer hasn't settled; and, from the reader audit
  (docs/PORTABLE-FLAG-INVENTORY.md), an interrupted Keep as edited (`keepEdited`), pending engine checks
  (`pendingEngineChecks`), a vehicle follow-up not SETTLED (`vfollow`; round 16 #1: "posted" is not settled — a subsystem
  follow-up is posted before its roll and a feedback card before its resistance, and the destination has neither card:
  export waits until each follow-up's roll, consequences and resistance receipts are complete; new-id fixtures for a
  posted-unrolled subsystem and a posted-unresisted feedback join the M1b gate), a pending VR2 sheaf (`vr2SheafPending`); a
  LIVE VR2 connection (round 3 #5: `liveOpen` rebuilds it from the durable `connOpen`/`connEnd` facts, so dropping the
  transient session flags can't end it — the decker jacks out first, which writes `connEnd` with its consequences in
  the source world); unsettled overhead/optempo money (round 3 #4: a receipt not `released`/settled, a refund `due`); a missile launch
  not yet terminal (round 6 #2: `flags.sr2e.launches.<id>` not `resolved`/`lost`/`cancelled`) or a Combat
  `launchAdmit` entry still `reserved` for any exported holder — its recovery lives on the Combat and its chat cards,
  outside the bundle; fixtures for admission, ammunition spend, launch creation and unresolved impact. An adventure
  CLOSED in `vehicleAdventures` but not `applied` with a row for any exported vehicle (round 7 #2: the decision lives in
  the world setting and its charges/supersession are delivered after it; fixtures before and between row deliveries);
  a coasting episode with `fuelOut.pending` (round 7 #3: its speed change, stall Crash Test or landing is earned but
  delivered only by the next combat stage; fixtures interrupted before the crash and before the landing delivery); a
  vehicle-ammo RELOAD not `closed` (round 8 #1: vehicle-ammo.mjs's five-step transaction across weapon, reserve and
  eject items stays open in `planned`/`ready`/`settled`/`cancelled`, and `reconcileReloads` resumes it; its reference
  shapes `reloadPlans.ammoItemId`, `ejectTo`, `reserveReceipts.props.loadedSourceId` and `system.ammo.sourceId` /
  `loadedSourceId` join the registry; fixtures interrupted at debit, settlement, escrow release and cancellation); a hidden-Stress REVEAL not `done` (round 14 #1: `r2HiddenStress.reveals.<id>` pending in the world setting); a
  rigger DUMP not settled (round 14 #2, round 16 #2: `flags.sr2e.rigDumps.<id>` `pending` or `open`, OR `done` while its
  Stun-resistance receipt is missing or the dump-shock effect's duration doesn't match the recorded Willpower result —
  `rigDumpWill` sets `done` and the duration in separate writes; M1 adds a resumable completion step in rig-dump.mjs
  that re-applies the duration from `will`, with crash fixtures between the writes — its card and its resistance
  and Willpower steps live in the source world; `reconcileDumps` joins the barrier's drained reconcilers); a PENDING substance roll (round 11 #3: a
  `substanceLog` test, extension or recovery record with `pending: true` is claimed before its card exists, and
  `settleSubstances` deletes it as abandoned in a world without that card; fixture interrupted between claim and
  card) — and a COMPLETED substance roll still OPEN to Karma (round 17 #1: until `substanceKarmaClosed` — the clock past
  the event's time — a Karma spend on the source-world card rewrites the event's successes through
  `reconcileSubstanceTest`, and the bundle carries no card: export waits until every exported ledger's rolled events
  are closed, naming them; fixture with a rolled test/extension/recovery before the clock passes it); an UNRESOLVED
  ram (round 17 #2: a `vehicleRam` card not resolved whose ram involves an exported vehicle or its driver — its
  resistance action lives only on that card, and the crash follow-up is created only on resolution, so no actor-side
  record exists; the check scans world ChatMessages for `flags.sr2e.vehicleRam` without `resolved`, matching both
  vehicles' uuids, and the M1b gate gets a new-id fixture with an open ram); a ROLLED subsystem follow-up
  (`vfollow.<fid>.subsystem.rolled`) without `consequencesDone` (round 9 #3: its crash, engine and passenger
  consequences replay from the source world's follow-up; fixture interrupted between the roll and the consequences); an
  ACTIVE indirect-fire guidance record (round 9 #4: `flags.sr2e.guidance.<id>` in `acquired` or `committed` — its +2 TN
  and its cleanup are bound to the source Combat — so export waits until it is `ended` or `lost`; fixtures for a
  committed spotting with a terminal missile awaiting cleanup). **Open card actions** (round 18 #1–#2, generalising round
  17 #2's ram check, because several actions live ONLY on a source-world chat card): a card-action REGISTRY in
  `module/portable/card-actions.mjs`, one entry per SR2E card flag that carries an action button (its owner module
  declares `{ flag, isOpen(message), involves(message) → actor/vehicle uuids }`): the unresolved ram (`vehicleRam`),
  an unresolved Driving Test (`drivingTest` without its resolution receipt — the Resolve applies Stress and may create
  a crash follow-up; M1 makes an interrupted resolution resumable from the card's receipt), the fuel card's unused
  "Coax more distance" while the vehicle is `coasting` (open until a taken/declined decision is recorded on the
  vehicle: M1 adds that record, keyed to the coasting EPISODE — round 19 #2: the card carries `fuelOut.id`, so an old
  episode's card is never confused with a new one after refuelling, and round 20 #2: the card's episode id is passed
  through the Coax handler and the `fuelCoast` op, checked before the roll and again in the vehicle queue, so an old
  card can't act on a new episode), the substance rolls above, and every other
  button-bearing card; export scans the
  world's ChatMessages and refuses while any open entry involves an exported document. The inventory (round 19 #1) is of
  every chat-button HANDLER — generic `renderChatMessageHTML` hooks in sr2e.mjs and every subsystem's, matched by the
  button classes they bind — not of flags; round 20 #1: each SELECTOR × handler BRANCH × card source is its own
  registry action, since one class such as `.sr2e-resist-btn` serves several actions (the melee damage card's Resist
  among them), and the test enumerates branches, not classes: an action that today lives only in the card's HTML (e.g. the Damage Taken
  card's Knockdown Test) first gets a registered flag and a completion receipt. The test enumerates the bound button
  classes and fails on one with no registry entry, so a new card can't silently escape; M1b gets a new-id fixture per
  entry. The Driving Test (round 19 #3): `drivingResolve`'s claim is taken before the roll and Stress, so M1 makes the
  resolution STAGED and durable (claim → rolled → Stress applied → crash follow-up created → outcome card published,
  each recorded on the vehicle's receipt) and resumable from any stage; round 20 #3: the crash follow-up's id is
  DETERMINISTIC (derived from the Driving Test card), and the stage advances only once that id exists, so a resume
  can't create a second Crash Test; round 20 #4 (as revised at round 24): export only
  READS — a Driving Test's registry entry is open until every resolution stage is recorded AND its outcome card (the
  one carrying `closesTests`) is published (rounds 25–26: EVERY start of a hidden-Stress prompt —
  today the two un-awaited calls in vehicle-play.mjs, a Stress Rule of One in `drivingResolve` and a test pushed with
  Stress dice in `rollDrivingTest` — goes through ONE helper that marks the vehicle's prompt in flight before it starts,
  awaits the card and receipts its message id; the vehicle stays open in the registry while a prompt is in flight, a
  vitest fails on any other `hiddenStressPrompt(` caller, and the posted prompt's Reveal is itself a registry action), so a test still open to Karma is never exported; M1 does not change when or
  how the test closes (rounds 21–24 had grown a cross-client Karma-writer design to do that, withdrawn: the race between
  a Karma spend and the resolution exists in today's code independent of portability and is tracked separately in
  docs/BACKLOG.md); the registry's `isOpen` reads that receipt, and fixtures stop after
  each stage. The list is ONE function,
  `openTransactions(actor)` in `module/portable/quiescence.mjs`, each entry owned by its subsystem (a test fails if a
  subsystem with receipts/records lacks one). Partially completed operations are therefore never exported (this also
  removes the "recovery recreates a randomized item" case, round 1 #1).
- **Revision check.** Export reads every source, then the prepared projections, then re-reads each document's
  `_stats.modifiedTime` (actor and embedded) — and, for a GM export, the cancer supplement's MEMBERSHIP (the page ids
  keyed to the actor) and each page's `_stats.modifiedTime` (round 5 #3) — and the quiescence check; any change → retry
  (3 times, then refuse). Quiescence also refuses while a cancer roll for the actor is in flight (cybermancy.mjs tracks
  its page write in `inflight.mjs`), so a completed roll is never missed and a page never captured half-written.
- **One clock and context per snapshot** (round 2 #6): the export captures `worldTime`, `serverTime` and the settings
  context ONCE, first; every prepared projection is derived with that pinned context (folds that read
  `game.time.worldTime` — `mbwFold`, `cymFold`, the substance clock, healing — take an explicit `now`, the extraction
  D9 already requires), `metadata.worldTime`/`serverTime` are those values, and the validation re-reads world time and
  the settings: changed → retry.
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
Effects' `origin` and system fields holding ids (`linkedWeaponId`-style) are registry entries too. The Rigger 2
remote-control network (round 13 #2; Part 5a, after the reader audit) is one entry with explicit paths: on the deck item,
`flags.sr2e.rcNet` = `subscribers[]` (vehicle uuids: `ref`), `affiliated.<vKey>` (keys `derivedKey` = `followId(vehicle
uuid)`, payload `uuid` `ref`, `hardwired` data, `since` combat-scoped → `transient`), `operator` (actor uuid `ref`),
`primary` (a vKey), `standingOrders.<vKey>` (text/successes data, `messageId` → `external ChatMessage`), `ivis.<gid>`
(`drones[]` vKeys, spends keyed by Turn → `transient`), `usedCards` (message ids → `external ChatMessage`),
`connection` (live session → `transient`: an import arrives disconnected unless a same-world restore keeps every
referent); and the vehicles' `flags.sr2e.learningKey` / `learningSpends` (combat-scoped → `transient`). Fixture: a deck
with a connected operator, a primary, a subscriber-only drone, orders and an IVIS group, imported with new ids. Round 14 #3 adds the two RC bindings read by direct
flag access: `rcNet.unreachable.<vKey>` is `transient` (dropped on a cross-world import; the range sweep recomputes
it), and a signal amplifier's or IVIS master's `flags.sr2e.deckId` is a `ref` to the deck item (fixture: a character
with two decks and both devices bound). **Hidden Stress** (round 14 #1; R2 p.84) lives in the GM-only world setting
`r2HiddenStress`, keyed by vehicle uuid, with only the receipt `hiddenStressRolled` on the vehicle: a GM's export
carries each exported vehicle's unrevealed balance in a GM-only bundle section (`gmOnly.hiddenStress`, remapped to the
new uuid and journalled on import); a player's export omits the balance but KEEPS the receipt (round 15 #1: clearing it would re-roll and change the
character): a same-world import, always run by the GM, copies the setting record from the old vehicle uuid to the new
one in the journal; a CROSS-WORLD player export is REFUSED while any exported vehicle has an unrevealed balance
(round 18 #3, replacing round 15 #1's "report and set by hand": the receipt without the balance makes the revealable
Stress zero) — the player asks the GM, whose export carries `gmOnly.hiddenStress` without showing it to the player. Consistency (round 15 #2): `ensureRolled` writes the setting before the
receipt, so the whole roll is `track`ed as in flight, and the snapshot check refuses export when a vehicle's receipt
and its setting record disagree (one without the other). The barrier (round 15 #3) closes the world-wide
`hidden-stress` queue for fenced vehicles: its admission checks `fenced(vehicle)` and the drain awaits its tail; its
setting writes for those vehicles stay refused until the journal commits. Rigger dumps: `rigDumps.<id>.deckUuid` is a
`ref`, its card id `external ChatMessage`. So are the Rigger 2
subsystem bindings (round 9 #2; missed by the reader audit, now added to docs/PORTABLE-FLAG-INVENTORY.md):
`flags.sr2e.subsystems.<id>.target.id` is a `ref` to an embedded item when `target.kind` is `item` (`data` for a
`builtin` target, whose `gen` stays with `subsysGen`), and its copies in `vfollow.<fid>.subsystem.rolled.made[].target.id`
are the same shape; `recordLive` drops a record whose item id is gone, so an unmapped id would silently heal the damage.
Fixtures: an exported vehicle with an item-bound and a built-in subsystem record, imported with new ids, keeps both
effects (and a settled rolled follow-up keeps its `made[]` ids matching the records).

**Inbound references** — documents outside the bundle that point AT the actor (Calendaria healing/substance notes:
reminders the clocks re-create) — are not exported; an import under new ids lists them so the GM can relink.

**Cancer records are state, not a reference** (round 4 #2): the GM journal's cancer pages (`cymJournal`, page flag
`key` = `pageKey(actor, opId)`) hold the rolled cancer result, onset/death deadlines and notice receipts, and
`cancerPage()` refuses a reroll. They travel as a GM-ONLY supplement of the bundle (`supplements.cancer[]`: each page's
source), exported only by a GM (a player's export of a cybermantic character omits it and its import is refused for
an identity change, named). The import restores them into the destination's GM journal as journalled steps (§2.7),
the key re-derived from the remapped actor and op ids, the deadlines rebased (§2.5), the notice receipts carried.

### 1.5 The CI checks (round 1 #2)
- **Shape inventory** (Vitest, `test/portable-registry.test.mjs`): an espree AST walk of `module/` (espree ships with
  ESLint) finds every write: `setFlag/getFlag/unsetFlag("sr2e", …)`, string and template-literal update keys under
  `flags.sr2e.`, nested object literals under `flags: { sr2e: … }`, `once()`/`recordEvent()`/`claimId()` key prefixes,
  and every `keepId` create — and the identity-bearing SYSTEM fields (round 10 #3): every data-model field named
  `*Id`, `*Ids`, `*Uuid`, `*Uuids` or declared in a model's `static IDENTITY_FIELDS`, with the readers that dereference
  it (e.g. a spell's `system.fetish.itemId`, read by restricted-spells.mjs to find the bound gear item; fixture: a
  fetish-bound spell imported with new ids still finds its fetish). Field NAMES miss identities inside an `ObjectField`
  (round 11 #2), so every `ObjectField` in the data models must have a registry entry listing its payload paths (or
  `data`), and the test fails on an unlisted one; e.g. a vehicle mod's `system.custom.receipt.id` (= the item's own
  id: `ref`), `receipt.payer` (actor uuid: `ref`/`external Actor`), `custom.attempt.by` and `custom.brFails.*.worker`
  (actors; they set retry penalties) — read by `verifiedPurchase()` and the installation flow (vehicle-customize.mjs).
  Fixture: a PAID modification with failed attempts imported with new ids stays verified and keeps its penalties.
  Names can't be trusted to find every identity (round 12 #1: `system.dicePools.spellDefenseAidSpirit` holds a spirit
  uuid, read by `aidReservation` in elementals.mjs; registered as an actor `ref`, fixture: a reserved elemental Spell
  Defense survives a new-id import). So a **value scan** backs the name scans: exporting every fixture, a test walks
  every string in the bundle's source and fails when it contains the id or uuid of a document in the bundle at a path
  the registry doesn't list. A
  DYNAMIC path (a computed key it can't resolve) must carry a `// portable: <entry>`
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
- **The barrier protocol** (round 2 #1: pre-hooks run on the requesting client, so a veto alone can't stop a request
  already past its hook, and the queues are client-local): (1) **close admission** — the GM writes a world-level
  barrier record (`importBarrier = { importId, epoch, actors: [uuids incl. payers named by any graph record], phase:
  closing }`, a world setting every client receives); from then every client's queue wrappers (`enqueueAttack` keys
  naming those actors, `moneyQueue`, the GM op dispatcher) refuse new entries for those actors; (2) **drain and
  acknowledge** — each connected client awaits the tails of its own queues for those actors AND every in-flight
  reconciler run for them (round 5 #2: move-by-wire `reconcile`, the cybermancy reconcilers, the healing and substance
  clocks, the shapeshift and permanent-damage passes run from timers and hooks, outside the queues): each registers its
  run in `portable/inflight.mjs` (`track(actorUuid, promise)`, the WHOLE run incl. its journal-page and chat writes) —
  including CONTINUATIONS dispatched after a queue settles (round 12 #2: `commitDamage` fires `sr2e.damageCommitted`
  from a `.then` after its queue, and move-by-wire's listener starts `noteDamageForSeizure` without returning it; the
  dispatch and every listener's promise are tracked, and a Vitest fails on a `Hooks.callAll("sr2e.*")` whose listeners
  aren't wrapped in `track`),
  cancels its pending timers for barrier actors, and re-schedules on unfence; the client awaits those promises, then marks itself drained. Acks are PER
  INSTANCE (round 9 #1: two tabs of one user must not share a slot): every page load has an `instanceId`; on seeing the
  barrier it writes `flags.sr2e.importAck.<importId>.<instanceId> = { epoch, state: "seen" }` on its User document at
  once, and `state: "drained"` after its drain. The roster is AUTHORITATIVE, not collected
  (round 10 #1): every page load registers `flags.sr2e.instances.<instanceId> = { at }` on its User document at `ready`
  (before it can write anything) and renews it every 30 s; the roster is every registered instance of a connected
  user whose heartbeat is under 90 s old, re-read until the wait ends (a tab that loads DURING the barrier registers,
  finds the barrier at once, admits nothing for those actors and acks `drained` immediately). The GM waits for EVERY
  rostered instance to reach `drained` at this epoch; an instance leaves the roster only when its user disconnects or
  by (a)/(b) of §2.7 or the GM's own-tab confirmation; one that never answers blocks the import, which the GM may cancel — never proceed
  without it. Quench: two instances of one user, one draining slowly — the import waits for both; (3) **fence and verify** —
  the GM writes the actors' fences, re-reads every source, and re-runs quiescence (§1.2) against that fenced state
  before any import write. The pre-hook veto (below) stays as defense in depth for writers that ignore the barrier.
- **Pre-hook veto on every client**: one set of `preCreate/preUpdate/preDelete` hooks for Actor, Item and ActiveEffect
  (`module/portable/fence.mjs`) refuses any write to a fenced actor or its embedded documents unless the write carries
  `sr2eImport: { importId, epoch }` matching the journal's CURRENT epoch (so an old recovery owner's late write is
  refused too, #3).
- **Admission closure**: queues and reconcilers (money, `damage:`, `vdmg:`, `vr2op:`, `rc-control`, `ammo:<weaponUuid>`
  — mapped to its weapon's actor for admission and drain, round 8 #1 — and `reconcileReloads`, pool, matrix, the
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
- **The overhead month counter** (reader audit; round 3 #4): vehicle overhead is keyed by the world setting
  `vehicleOverheadMonth`, not worldTime. The bundle records the counter; ONE adapter shifts every month-bearing key and
  value by Δmonth = destination counter − exported counter, together — on the vehicle: `overhead.months.<m>`,
  `assessedThrough`, `optempoMonths.<m>`, the `vstress` receipts `overhead-missed-<m>` / `overhead-restore-<m>` /
  `ostress-rev:overhead-missed-<m>`; on the payer: `overheadDiscount.<m>`, `overheadReceipts.<tx>` (`rows[].month`, the
  `discount` month keys, a restore's `month`), `overheadRefunds.<tx>.done[]` (`<vehicleUuid>|<month>`: both parts
  remapped) and `overheadRefunds.<tx>.creditByMonth.<m>` (round 7 #1: `overheadRefund` subtracts prior refunds by these
  month keys, so an unshifted ledger refunds a settled partial refund again — fixture: a settled partial refund, then
  another supersession after import). A Stress receipt or refund entry left behind would penalise or refund a month twice. Unsettled money is
  refused by quiescence (§1.2), so the adapter only moves settled history.
- **The drone fuel clock** (round 6 #1): `fuelClock = { combatId, L, offset }` reads `L` while `combatId` is set, else
  `worldTime + offset`. One adapter makes the export's logical now explicit (`logicalNow` at the snapshot), detaches
  the combat (a combat never moves), and sets `offset` so the destination's first `logicalNow` equals that value
  rebased by Δworld — with `fuelCursor.at`, `movedTo`, `fuelPending` intervals and `fuelRounds` spans shifted by the
  SAME amount, so no span is billed twice or skipped. Quench: an idle drone exported mid-combat bills exactly the
  destination's first elapsed span.
- **Substance report ids** (round 3 #3): `substanceReported` keys are `stepId(step)` — drug, type, the step's TIME and a
  hash of its payload (rules/substances.mjs) — so a rebase changes them. The adapter folds the bundle's log before and
  after the rebase/remap and maps each reported step, by its position in the fold, to its new id; `corrected` entries
  (steps already gone) are carried as is — they never match a fresh step, so nothing is announced again. Quench: an
  imported addict with reported Essence loss posts no report on the destination's next clock tick. Optempo adventure ids
  (a world setting) are `external` (`docType: Setting`) — dangling elsewhere, listed.
- Time-bearing `derivedKey`s (cybermancy notice keys) are re-derived from the shifted time.
- **Healing epoch** (round 2 #5): the healing clock clamps a cursor to the world's `healingClockEpoch`; an imported
  actor gets an actor-local baseline (`healClock.<key>.importEpoch` = the rebased cursor) that the clamp honours, so the
  rebased bleeding interval survives; a world-level enable/disable AFTER the import still applies as usual.
- **VR2 sequence numbers** (round 2 #4): imported sequence numbers and every sequence reference (a registry kind
  `sequence`) are rebased into the destination's sequence space preserving their order (offset = the destination's
  next sequence − the bundle's minimum), and — while holding the sequencer barrier — the sequencer's counter (`SEQ`,
  vr2ic.mjs) is advanced above every imported value before the graph is released.
- **Identity-free tie order** (round 4 #1): `foldMbw` breaks equal `at` by record KEY, and keys embed item ids — remapping
  them can reverse two tied records (a TLE treatment TN 10 → 8). Move-by-wire records get an `ord` (a per-actor counter
  stamped by `recordEvent`, M1a), the fold sorts by `at`, then `ord`, then key; the export writes `ord` for older records
  from the SOURCE world's fold order, so the destination folds them identically. Every other fold that breaks ties on an
  identity-bearing key gets the same treatment (the registry's `event` entries name their tie key; a test fails on one
  that sorts by an id). Gate: a tied-timestamp remap fixture in M1a's adapter tests.
- **Drug-effect order** (round 3 #6): `drugsInForce` orders active drug effects by `_stats.createdTime`, and
  `commitDamage` consumes absorption in that order — but `_stats` is not carried. M1a gives each drug effect an
  explicit `flags.sr2e.drugOrder` (the creation time, written in its create data; the reader sorts by it, falling back
  to `_stats.createdTime` for older effects, and a migration stamps existing ones from `_stats`); only its order matters,
  so it is carried as is. Test: two active absorbers keep their consumption order across a new-id import and a
  recovery replay.
- **Combat durations** (`duration.combat`, `startRound`, `startTurn`): the combat is `transient` — on a new-world
  import the AE keeps its remaining rounds (`rounds − (combat.round − startRound)` at export, stored in the bundle)
  re-anchored to the next combat it joins, listed in the report.

### 2.6 Writes, `sr2eImport` and ownership
- Every write carries `{ sr2eImport: { importId, epoch } }` (round 3 #2: the ONE option shape, validated by the fence
  in §2.4 — creates, updates, deletes, rollback and release alike). **Every** document hook with gameplay consequences — pre AND post,
  create, update AND delete, on Actor, Item, ActiveEffect and their embedded descendants, plus deferred callbacks
  they schedule (round 1 #7: shapeshift death results on `createActiveEffect`, vr2ic's sequencer/dataworm scheduling
  on effect creation, drugs' tombstones, receipt stripping and deletion veto) — returns early on it. A **hook
  inventory test** (AST) lists every document hook in `module/` — literal `Hooks.on("…")` names AND dynamic
  registrations whose names resolve by constant folding (round 2 #7: the `Hooks.on(h, …)` loops over name arrays in
  mbw.mjs and cybermancy.mjs), plus every document-class lifecycle override in `module/documents/` (`_preCreate`,
  `_onCreate`, `_preUpdate`, `_onUpdate`, `_preDelete`, `_onDelete`, and `prepareData` side effects such as the
  prototype-token rename at actor.mjs:391); a registration the scan can't resolve must carry a `// portable-hook:`
  annotation. Each is marked `import-safe` (no gameplay consequence) or `import-guarded` with a behavioural Quench case
  (import a fixture that would trigger it; assert nothing fired). A new unlisted one fails CI.
- **Ownership** (D7 "Permissions"): the exported `ownership` is replaced on import: the importing user owner, the
  world's default otherwise.
- Embedded items are authoritative; `_stats.compendiumSource` restored for provenance only.
- Assets uploaded to `worlds/<world>/sr2e-imports/<rootPid>/`, paths rewritten; a failed upload → warning + default.

### 2.7 The write journal and recovery (round 1 #6)
- One journal per import: a page of the hidden journal entry `SR2E Imports`, `flags.sr2e.importJournal` = { importId,
  epoch, phase: reserved → writing → written → committed → releasing → closed, lease, steps: [ { op, docRef, before
  (the COMPLETE pre-image source, or "absent"), after (the complete expected post-image), ackAt } ] } — full images,
  not hashes (round 2 #2), so rollback can restore exactly; large images go to their own journal pages.
- **Canonical comparison** (round 2 #2): images are compared after normalisation — `cleanData` with the schema
  defaults, `_stats` removed, the import's own bookkeeping (`importId`, `importFence`, portable ids written by the
  import) removed — and per DOCUMENT: an actor step compares the actor without its embedded collections, each embedded
  document has its own step, so a later embedded step never makes the parent look divergent.
- **Ownership proof**: every document the import creates carries `flags.sr2e.importId` in its create data; recovery
  treats an existing document as this import's only if it carries that id AND its source hash equals the step's
  `target` (done) — otherwise it is DIVERGENT.
- **Roll-forward** per step: absent → create; equals `after` → done; equals `before` → re-apply; anything else →
  divergent: STOP, list it, the GM chooses (rollback or keep as is). Rollback writes `before` back only where the
  document equals `after` or `before`, listing divergences. Both only while the actors are still fenced.
- **One recovery owner** (round 2 #3; round 3 #1): the lease is a CLIENT INSTANCE (`{ userId, instanceId, heartbeat }`,
  the instance id random per page load, so two tabs of the same GM differ), renewed while working. The epoch check in
  the pre-hook runs on the REQUESTING client, so it can't revoke a write already past it — takeover therefore needs
  proof the old owner has nothing in flight: either (a) the old instance ACKNOWLEDGES a handover request (it stops,
  awaits its own pending writes, then writes `importAck.<importId> = { epoch, drained: true }` on its User), or (b) the
  server reports the old owner's USER inactive (a socket's requests are processed in order before its disconnect, so a
  disconnected client has nothing left to land) and its heartbeat is stale. A stale heartbeat alone (a frozen tab of a
  still-connected user) is NOT enough by itself (round 10 #2: a crashed tab whose user stays connected in another tab
  never acks and never "disconnects" as a user): there is NO rule (c) (round 12 #3): Foundry has no server-side compare-and-set and no per-socket
  disconnect signal, so nothing short of (a) or (b) proves an instance has nothing left to land. A frozen tab of a
  still-connected user therefore BLOCKS recovery, naming the instance and its user, until it acks or that user
  disconnects (closes every tab). The one exception is the GM's own stale instance: the GM may confirm "I have closed
  my other tabs" — only the GM can close them, and the takeover still waits a settle interval and re-reads every step
  twice, unchanged between reads, before it unfences. The import keeps the actors fenced throughout, so a block costs
  waiting, never data. Only then the takeover bumps the `epoch` (defense in depth for writers that ignore the barrier).
  Imports and recovery are serialized per world (one import at a time). Recovery runs from a button and from the
  startup coordinator below.
- **Startup coordinator** (round 4 #3): ONE GM-`ready` sequence orders import recovery and the world migration
  (`migrateAndReport`): (1) every open import journal is resolved FIRST, by PHASE before version (round 5 #1): a
  journal at `committed` or `releasing` only finishes releasing (forward — its actors are already the imported ones,
  migrated with the rest afterwards), whatever version wrote it; a journal BEFORE commit is rolled forward when written
  under the running system version, otherwise rolled BACK to its pre-images (written under the old version, which the
  migration then upgrades like any document); (2) only then `migrateWorld` runs. A journal that can't be resolved (divergent,
  waiting for the GM) leaves its actors fenced: the migration skips fenced actors and does NOT stamp the new
  `systemMigrationVersion` while any remain, so their migration runs at the next start after the GM resolves the import.
  Quench: an import interrupted mid-write, the system upgraded, then started — the journal rolls back and the migration
  runs once.
- **Commit, then release** (round 2 #3): `written` → `committed` is persisted while every actor is STILL fenced (the
  import's decision point: before it, recovery may roll back; after it, only forward); then `releasing` unfences the
  actors one by one, each release its own journalled step; then the barrier is lifted and the journal `closed`. A crash
  in `releasing` only finishes releasing; gameplay changes made to an already-released actor are never compared
  against the journal again.

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
- The fence is the barrier protocol (§2.4: close admission, drain and acknowledge, then fence and verify) with the
  pre-hook veto as defense in depth; recovery takeover needs the old owner's drained ack or its disconnect (§2.7).
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
