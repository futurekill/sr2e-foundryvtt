# Plan: documents that fail validation are reported, not silently skipped
_Round 2 — revised after Codex rounds 1-2 (see the REVIEW-LOG)_

## Goal
`migrateWorld` walks `game.actors`, `game.items` and unlinked token actors. Foundry leaves
a document that fails schema validation out of those collections, so a migration never
sees it, and the world is stamped as migrated anyway. Live case: "Tiger (Physical
Adept)" (imported at 0.15.1) has `system.magic.type: "adept"`; migration 0.29.15 maps
exactly that value but never reached it, and the actor has been missing since June.

Round 1 showed that AUTOMATIC repair is the wrong fix:
- replaying old migrations on old raw data is not safe (0.91.0 Karma preservation and
  0.92.0 skill lifecycle would overwrite real values; a document's last-save version is
  not a migration checkpoint, and embedded items have their own histories);
- Foundry V13 does not return a repaired invalid document to the live collection until
  reload (the update response handler skips it), so the runner can't confirm a repair,
  and an addItems backfill could never run.

So the system's job is to make these documents VISIBLE and say how to fix them; the
repair is the GM's (usually: re-import or delete). And the runner stops running twice.

## Approach
1. **Active GM only — narrows, doesn't eliminate.** `sr2e.mjs` ready hook:
   `game.user.isActiveGM` instead of `isGM` around `migrateWorld()`. Two GMs loading
   together no longer both migrate. It is an election, not a lock: a higher-priority GM
   connecting mid-migration can start a second run. Documented in a `shortcut:` comment
   (one-GM tables are the expected load; a real lock would need a world-setting lease).
2. **Report what failed to load** — new `reportInvalidDocuments()` in `migrations.mjs`.
   Called by the active GM on EVERY load, AFTER the migration's `try/catch` and inside its
   own `try/catch`, so a failed migration can't suppress it. Read-only:
   - world level: enumerate `game.actors.invalidDocumentIds` and
     `game.items.invalidDocumentIds` (every construction failure lands there), and take the
     name + error from `game.issues.validationFailures[docName][id]` when present; when
     absent, name from `game.data.actors|items` by id and the diagnostic "not a validation
     error — see the startup console".
   - embedded items inside valid world actors: `actor.items.invalidDocumentIds`, name
     read from `actor._source.items` by id (no `getInvalid`, so no construction and nothing
     to throw); diagnostic "see the startup console". Each actor's lookup in its own
     `try/catch`, so one bad document can't stop the rest.
   - If any: ONE permanent warning naming them (first 5 + "and N more"), e.g. "SR2E | 1
     actor failed validation and is hidden from the world: Tiger (Physical Adept).
     Migrations can't reach it. Keep it until you've checked it: the console (F12) and
     Support → Document Issues show why. If it's an unchanged copy of a compendium entry,
     re-importing that entry replaces it." Plus a `console.warn` per document: kind, id,
     parent (for embedded), name, diagnostic.
   - The pure part (records → message text + console lines) is an exported function for
     Vitest. Nothing is written.
3. **This world's Tiger:** after the change, I compare the broken copy's raw data with
   the compendium entry and show you the differences; re-import/delete is your call.
4. **Tests.**
   - Vitest: the message builder — no failures → null; one actor → names it, singular
     wording; actors + items + embedded items → counts per kind and every name; a long
     list is truncated in the notification (first 5 + "and N more") but complete in the
     console lines.
   - Vitest also: a record without a validation error gets the console fallback; an
     embedded item names its parent; the notification never says "older version".
   - Quench (stubbed `invalidDocumentIds` / `validationFailures` / `game.data` around real
     actors, `ui.notifications.warn` captured): world actor with a record; world item
     without one (fallback); an embedded item on a real actor; an actor whose
     `items.invalidDocumentIds` getter throws → the others are still reported; none →
     silent. And the ready-hook order: with `migrateWorld` stubbed to throw, the report
     still runs (call the hook body's exported helper, not the hook).
   - Live: load the local world → the warning names Tiger.
5. **Docs.** CHANGELOG (Fixed: a document from an older version that fails to load is no
   longer silently skipped by migrations; the GM is told which and how to fix it; only
   the active GM runs migrations). CLAUDE.md Migrations: migrations never reach invalid
   documents; they're reported, and repair is manual; never write a migration expecting
   to fix a value that makes a document invalid.

## Key decisions & tradeoffs
- **Report, don't repair.** Loses the automatic fix for the rare legacy document, gains
  no risk of replaying unsafe migrations on stale data. A re-import from the compendium is
  the correct fix for pregens like Tiger anyway: its 0.15.1 data predates many fixes.
- **Every load, not once.** The list is tiny and the warning is the only signal a GM
  gets; silence after the first load would hide it again.
- **Uses Foundry's own `validationFailures`** rather than walking collections.

## Risks / open questions
- `game.user.isActiveGM` exists in V13. It narrows the double run, not prevents it
  (round 2); the remaining race is documented, not solved.
- Unlinked token deltas that fail validation: not covered (Foundry reports them through
  its own token warnings); out of scope.

## Out of scope
Automatic repair of invalid documents; compendium documents; ActiveEffects.
