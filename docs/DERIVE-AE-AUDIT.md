# Active Effects on characters — the D3 audit (chargen M2)
_2026-11-15. Required by ../sr2e-chargen/docs/PLAN.md D3: every Active Effect the system or a content module puts on a
character, classified (a) derived from item data, (b) transient play state carried opaquely, (c) to convert before
the creator ships. Method: every `createEmbeddedDocuments("ActiveEffect")` / `ActiveEffect.create` /
`toggleStatusEffect` in `module/` and the content modules, plus every `effects[]` in every repo's `packs-src`._

## Who creates them

| Source | What | Changes | Class |
|---|---|---|---|
| `claims.mjs` `once()` / `recordEvent()` | step markers and durable event records (disabled, `flags.sr2e.claim`) | none | **not an effect** — read as `ctx.events` (D9), never applied |
| `drugs.mjs` (dose start, line ~254; resumed dose ~690) | the dose's effect, copied from the drug item's effects (`effectChanges`), `_id` = exposure id, timed | numeric ADD: `system.strength.mod`, `system.willpower.mod` (Kamikaze), `system.reaction.mod` (MAO) | **(b)** transient, but its keys are supported, so the pure layer APPLIES it; order = `drugsInForce` (PLAN-portable `drugOrder`) |
| `documents/item.mjs` `setSustaining` (~1521) | a sustained spell's effects copied to the caster, `origin` = spell uuid, removed when dropped | `system.<attr>.mod`, `system.initiative.mod`, `system.body.mod`, `system.dicePools.combat.bonus` | **(b)** transient; supported keys → applied |
| `sheets/item-sheet.mjs` (~380) | an effect a user adds to an item by hand | anything | **(a)** when its keys are supported; otherwise D9's unsupported path (values shown "as last computed in Foundry", never edited) |
| `toggleStatusEffect` (`sr2e.mjs` wound markers, `spell-effects.mjs` / `actor.mjs` prone, `shapeshift.mjs` dead) | token statuses | none | **(b)** carried opaquely; no numeric effect |

## What the content ships

| Repo | Documents with effects | Transfer | Notes |
|---|---|---|---|
| system | 17 spells | false | sustained-spell sources (copied on sustain) |
| Corporate Security Handbook | 2 spells | false | as above |
| Shadowtech | 3 drug gear items | false | dose sources (copied by `drugs.mjs`) |

Change keys in shipped content: `system.quickness.mod` (9), `system.initiative.mod` (7), `system.body.mod` (4),
`system.dicePools.combat.bonus` (4), `system.reaction.mod` (2), `system.strength.mod` (1), `system.willpower.mod` (1);
all mode ADD (2). No module ships a transferring effect on a character's item.

## Findings
1. **No category (c) blocker in shipped content.** Every shipped effect is a sustained spell or a drug dose (both
   transient, both with supported keys); nothing derived from an installed item depends on an Active Effect.
2. **D9's supported list is missing `system.dicePools.<pool>.bonus`.** It's a real, documented hook
   (`SR2EDataModel.resourceField`: "the Active-Effect hook … used by the Combat Sense spells") and four shipped
   spells use it. The system CLAUDE.md list (`<attr>.mod`, `reaction.mod`, `initiative.mod`, `armor.ballistic`,
   `armor.impact`) and D9 should both add it, or Combat Sense sustained in Foundry shows as "unsupported" in the creator.
3. **Order matters for drug doses** (absorption consumes in `drugsInForce` order): carried by PLAN-portable's
   `drugOrder`.
4. **Hand-authored item effects** are the only open-ended source; they stay on D9's unsupported path. No change.

## Follow-ups
- Add `system.dicePools.<pool>.bonus` (ADD/OVERRIDE) to the supported keys in CLAUDE.md and in PLAN-derive §2's
  effect application, with a parity fixture (Combat Sense sustained).
