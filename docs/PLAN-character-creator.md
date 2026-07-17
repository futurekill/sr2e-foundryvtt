# Plan: Shadowrun 2E Character Creator + Portable Character Schema

_Design doc, 2026-07-17. **Planning only — nothing implemented yet.** Decisions
marked ⚑ are deferred and belong to the repo owner._

## Goal

A standalone SR2 character creator that shares a versioned, Foundry-independent
character format with this system, so a character can go:

> Creator → JSON → Foundry → edit → JSON → Creator → PDF

with no meaningful data loss.

## Guiding principle (from the spec — keep it)

The **portable JSON schema is the canonical interchange format.** Foundry actors,
the creator's internal state, and the PDF renderer each convert *to and from* that
schema — never directly to each other. This is the one decision that stops the
creator from marrying Foundry's actor structure, and it's correct. Everything
below serves it.

## Where we already are (important)

Milestone 6 ("extract the calculation/validation engine") is **mostly already
done**, which reshapes the plan:

- [`module/rules/sr2e-rules.mjs`](../module/rules/sr2e-rules.mjs) is deliberately
  **Foundry-free and unit-tested** — chargen priority spend, the full Skill Web
  graph + shortest-path defaulting, derived stats, item/grade/street pricing,
  Attribute Edges, skillsoft/program costs, the misc-dice clamp. This is the seed
  of the "shared rules package."
- [`module/config.mjs`](../module/config.mjs) holds the static tables (priorities,
  racial mods/maximums, skill web, drain tables) — also portable.
- The **content** (weapons, cyber, spells, …) lives in `packs-src/` JSON across
  this repo and the module repos. A creator needs this catalog; it is already in
  a portable-ish per-document JSON form.

The gap is not the rules. It's (a) a **normalized character schema** distinct
from Foundry's actor shape, and (b) **converters** on each side.

## The actual data model (what the schema must carry)

Actor types: `character, npc, vehicle, spirit, ic, host` (creator targets
`character`).

Item types (17): `skill, weapon, armor, spell, cyberware, bioware, gear, program,
adept_power, contact, lifestyle, ammo, focus, vehicle_mod, race, tradition,
quality`. A character is a `CharacterData` document plus an array of these
embedded items. **The creator's job is mostly assembling that item array** — the
same drop-onto-sheet flow, minus Foundry.

## Portable schema (draft v1)

```jsonc
{
  "schema": "shadowrun2e-character",
  "schemaVersion": 1,
  "systemVersion": "0.43.1",      // sr2e version that wrote this (for migration)
  "exportedBy": "creator|foundry",
  "character": {
    // Portable, system-agnostic character data. NOT Foundry's system object
    // verbatim — a curated projection: attributes {base,racial}, magic, chargen
    // priorities, karma, nuyen, biography, condition monitor, etc.
  },
  "items": [
    {
      "portableId": "uuidv4",     // stable across round-trips (see below)
      "type": "cyberware",
      "name": "Bone Lacing (Titanium)",
      "system": { /* the item's authored (_source) system data */ },
      "source": "Compendium.sr2e-shadowtech.st-cyberware.Item.xxx" // provenance, nullable
    }
  ],
  "metadata": {
    "created": "iso8601",
    "modified": "iso8601",
    "portrait": "data-uri | url | null",
    "warnings": [ /* import/unsupported-data messages */ ]
  },
  "_foundry": {
    // Side-channel for Foundry-only state that has no portable meaning but must
    // survive a re-export: actor _id, token config, active-effect state, flags,
    // ownership, prototypeToken. Preserved opaquely; the creator ignores it but
    // MUST round-trip it back untouched. This is what makes lossless possible.
  }
}
```

### Design notes on the schema

- **`system` blocks are the AUTHORED (`_source`) values, never the derived
  ones.** We just fixed a class of bug (GitHub #15) where derived values leaked
  into authored fields; the exporter must read `item._source.system`, not
  `item.system`, or a titanium lace round-trips as `(Str+3)M` and re-derives to
  `(Str+3+3)M`. Same for the character: export `base`, not `value`.
- **Derived values are NOT stored** (attribute totals, dice pools, initiative,
  costs). They recompute from `sr2e-rules.mjs` on both ends. Storing them invites
  exactly the drift we've been fighting. The schema MAY carry a read-only
  `derivedSnapshot` for the PDF/human inspection, clearly marked non-canonical.
- **Stable IDs:** `portableId` is minted on first export and preserved on
  re-import, so a Foundry edit → re-export → creator keeps item identity. Foundry
  `_id`s live in `_foundry`, not here (they're 16-char, Foundry-specific).
- **Content provenance:** `source` records the compendium UUID if the item came
  from one. On import, Foundry can relink to the live compendium item (picking up
  later field additions — see the stale-implant repair tool) rather than freezing
  a stale copy. If the source module isn't installed, the embedded `system` is
  the fallback.
- **Warnings channel:** unsupported/unknown item types or fields go to
  `metadata.warnings` and are preserved in `_foundry` rather than dropped, so a
  future creator version can round-trip them.

## Milestones (re-scoped)

| # | Milestone | Where | Notes |
|---|-----------|-------|-------|
| 1 | Document actor+item data model | this repo | mostly this doc + a schema reference |
| 2 | Define portable schema + JSON Schema file | this repo | `docs/portable-schema.md` + `schema/character.v1.json` |
| 3 | Foundry **export** (`game.sr2e.exportCharacter`) | this repo | actor → portable JSON; reads `_source` |
| 4 | Foundry **import** (`game.sr2e.importCharacter`) | this repo | portable JSON → actor + embedded items |
| 5 | **Round-trip tests** | this repo | Quench: actor → JSON → actor, assert lossless incl. `_foundry` |
| 6 | Extract rules engine to shared package | ⚑ repo decision | `sr2e-rules.mjs` + `config.mjs` + schema |
| 7 | Creator UI | ⚑ new repo | consumes the shared package |
| 8 | PDF renderer | ⚑ new repo | consumes the same normalized object |
| 9 | Schema migrations + warnings | shared | `schemaVersion` bumps, like the system's migrations.mjs |
| 10 | Complex-character tests | all | magic + cyber + vehicles + drones + custom items |

**Milestones 1–5 live in this repo and are independently valuable** (character
backup, sharing, safe migration) *before any creator exists*. That's the
recommended first build when we start.

## Deferred decisions ⚑

- **Rules sharing model** (npm package vs monorepo vs copy-and-sync). Deferred —
  milestones 1–5 don't force it. Copy-and-sync has bitten this estate before
  (packaging drift, stale `.md` version claims), so lean away from it when the
  time comes.
- **Creator tech stack** (framework, local-first storage, hosting).
- **PDF approach** (a dedicated renderer over the normalized object — NOT
  print-the-DOM; the spec is right about this).
- **Repo layout** (extend this repo for 1–5; the creator is its own repo).

## Risks / hard parts (name them now)

1. **"Lossless" is a constraint, not a freebie.** Foundry actors carry IDs,
   flags, AE state, token config, ownership, compendium links. The `_foundry`
   side-channel is the mechanism; the round-trip test (milestone 5) is the proof.
2. **Authored vs derived**, per the bug history above — the single most likely
   source of silent corruption. The exporter is `_source`-only by rule.
3. **Content availability.** A character with Shadowtech cyber imported into a
   Foundry without Shadowtech installed: keep the embedded `system` as the
   fallback, warn, and don't hard-fail.
4. **Catalog duplication.** The creator needs the item catalog the compendia
   hold. Don't fork it — the creator should consume the same `packs-src` JSON (or
   a built index of it), or it drifts from the system's content.
5. **Copyright (PDF).** Functional recreation of the sheet layout only — no FASA
   logos/art, clearly-unofficial branding. (Same discipline as the modules.)

## Suggested first build (when we start)

Milestones **1–5** in this repo: portable schema + `exportCharacter` /
`importCharacter` + Quench round-trip tests. Foundation for everything, useful on
its own, and the part where this codebase knowledge pays off most.
