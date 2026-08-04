# Foundry v14 readiness — audit

**Result: clean. Zero uses of any API Foundry removes in v14.**
Audited 2026-08-04 against system 0.88.0.

## Method — why this didn't need v14 to exist

v14 isn't out, so auditing "against v14" would normally mean guessing. It
doesn't have to. **Foundry 13.351 already declares what v14 removes**: every
deprecated API carries `{since, until}`, and `until: 14` means v13 still supports
it and v14 drops it. Extracting those gives an authoritative checklist today.

From `/Applications/Foundry Virtual Tabletop.app/.../scripts/foundry.mjs`:

| horizon | count |
|---|---|
| `since: 12, until: 14` | 221 |
| `since: 13, until: 14` | 4 |
| `since: 13, until: 15` | 108 |
| `since: 11, until: 16` | 2 |

The 225 v14 removals reduce to **157 distinct human-readable notices**, listed in
`docs/V14-REMOVALS.md`. Regenerate by scanning foundry.mjs for `until:\s*"?14"?`
and lifting the warning text near each site.

## Finding: nothing to fix

Cross-referenced by Codex across `module/**/*.mjs` and `templates/**/*.hbs`, then
the highest-risk categories re-verified by hand. **No genuine usage.**

The near-misses are worth recording, because each looks like a hit and isn't:

| looks like | actually |
|---|---|
| `sr2e.mjs:613` `Actor.createDocuments()` | the warning fires only for the obsolete `temporary` option, which this call doesn't pass |
| `astral.mjs:181` `TokenDocument#updateSource` | the removed API is **`Token#updateSource`** on the canvas placeable — a different class |
| `sr2e.mjs:1323` `Actor#updateSource` | likewise not the Token method |
| item/actor `.effects` access | ActiveEffect collections, not the removed `TokenDocument#effects` |
| `integrations.mjs` `filePicker` | the *setting* option, not the removed Handlebars helper |
| `astral.mjs:58` `Token#isVisible` override | doesn't touch any removed `CanvasVisibility#vision` member |

Hand-verified separately, all clean:

- **Grid** — no `measureDistance(s)`, `getCenter`, `getSnappedPosition`,
  `getGridPositionFromPixels`, `getNeighbors`, `shiftPosition`. The code already
  uses the v14 replacements: `measurePath` (`sheet-actions.mjs:495`), `getOffset`
  and `getTopLeftPoint` (`placement.mjs:78-97`).
- **Chat** — no `CONST.CHAT_MESSAGE_TYPES` or `CHAT_MESSAGE_STYLES` anywhere.
- **Applications** — no `extends Application`/`FormApplication`, no `new Dialog(`.
  The ApplicationV2 migration is complete.
- **Templates** — no `{{colorPicker}}`, `{{filePicker}}` or `{{select}}`.

## What this does NOT cover

Removals only. It cannot cover **new requirements or behaviour changes** v14
introduces — those are unknowable until it ships. So this is necessary, not
sufficient: it means nothing we call disappears, not that everything still
behaves identically.

`compatibility` stays `{minimum: 13, verified: 13}`. Claiming `verified: 14`
without having run on v14 would be a false claim; bump it after a real run.

## When v14 ships

1. Re-extract from the v14 build and diff against `V14-REMOVALS.md`.
2. Run the Quench batches — they cover the sheet/persistence/dialog layer that
   static analysis can't reach, which is exactly where behaviour changes bite.
3. Then bump `verified`.
