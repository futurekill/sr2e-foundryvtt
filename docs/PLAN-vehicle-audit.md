# Plan: vehicle stats audit (vehicle builder release 4b)
_Draft 2 — after Codex round 1 (11 findings, all taken; docs/PLAN-vehicle-audit-REVIEW-LOG.md)_

## Goal
Every vehicle the system and the content modules ship matches the stat line its own book prints (PLAN-vehicle-builder
§1d "Audit"). 135 vehicles: core 32 (core book p.148, p.264 table), Rigger Black Book 69, Cyberpirates 9, Fields of
Fire 8, Corporate Security Handbook 6, Queen Euphoria 6 (3 vehicles, each in `qe-actors` and as an actor embedded in the Adventure document),
Neo-Anarchists' Guide to Real Life 3, Street Samurai Catalog 2. The Rigger 2 list supersedes many of them while R2 is
active (0.145.0), but without R2 these stats are what a table plays with, and the identity map points at them.

## Approach
1. **Pages.** For each book, the stat-line pages: from each vehicle's stored cite, else found by searching the PDF
   (text where it has one, else the page renders). Render at 200 dpi into the scratchpad.
2. **Field inventory per book (R1 #4).** Before transcribing, list every field and mode each book prints (e.g. Fields
   of Fire: fuel, economy, access, setup time, off-road/water speeds, free cargo; RBB: alternate modes) and give each a
   target: a structured VehicleData field, the notes, or "unsupported" (documented). The audit checks every target.
3. **Independent pass (blind).** Codex transcribes every printed stat line from the renders into JSONL without seeing
   the shipped data, every inventoried field, with distinct states (R1 #5): a value, `"None"` as printed, `"—"` as
   printed, `null` = not printed, `"?"` = illegible. A row missing any inventoried field fails coverage and is redone.
4. **Per-book mapping (R1 #2, #3).** A small script per book turns the raw transcription into the values the shipped
   document should hold, from each module's documented conventions, read from its generator and data first: RBB stores
   cruise speed and printed armour ×3 (check), SSC/FoF store maximum speed, NAGRL cruise kph with structural Body in the
   notes, etc. Queen Euphoria (SR1) is mapped by the core book's Sourcebook Updates (p.277–284) **plus the per-vehicle
   rulings already recorded in `tools/data/qe-actors.json`** (Americar takes the SR2 catalogue 20,000¥; Nightsky the
   catalogue armour; PRC-42D the SR2 chassis with its overrides, e.g. Armour 3): those are the expected results.
   "Not printed" never matches a shipped default silently: it must map to an explicit expected value (usually the
   field's default) or it's a finding.
5. **Diff** the mapped values with the shipped data, field by field.
6. **Adjudicate every difference myself from the render** (crop at 400–600 dpi), never from a text layer. Outcomes:
   shipped wrong → fix; Codex misread → noted; illegible/ambiguous in the scan → ask the user for a photo of that entry.
   A deliberate choice (CHANGELOG, notes, generator comment, an earlier user ruling) stays and is listed.
7. **Fix as narrowly as the source allows (R1 #6, #7).** Where a generator owns the pack, the fix goes into its data
   AND the regenerated output is diffed against the old: only the approved fields may change (a script compares every
   other key, incl. img, token, items, flags, `_id`, file name). If regeneration would change anything else
   (placeholder art, token sizes, ids derived from a corrected name), patch the packs-src JSON directly instead and
   fix the generator data so a later run agrees, with ids pinned (name corrections never change `_id` or create files).
   Document count and every UUID per pack unchanged.
8. **Printed equipment (R1 #9).** A missing printed weapon or modification is added only as `custom.state:"factory"`
   (already in the stats, no capacity), and the vehicle's effective stats are checked unchanged with R2 off and on.
   Features with no catalog item stay in the notes.
9. **Queen Euphoria order (R1 #1).** Core fixes → `qe-actors` data → `gen-actors.mjs` → `gen-adventure.mjs` →
   build-packs; then the embedded Adventure actors are checked equal to the `qe-actors` ones (stats).
10. **Rigger 2 identity (R1 #8).** If a fix changes which list row a vehicle is (or a name), update
    `tools/data/vehicle-identity.json`, rerun `gen-vehicle-list.mjs` (runtime `data/vehicle-list.json`), validate, and
    release R2 too; import with R2 on is rechecked (Quench) for every affected UUID.
11. **Checks per repo (R1 #11):** content modules: `npm run validate`, `npm run lint`, the allowed-field diff, the
    id/count check; the system: Vitest, lint, Quench `sr2e.vehicles` (it has no validate script); every changed repo
    gets a CHANGELOG entry and a patch release.
12. **Report**: `docs/VEHICLE-AUDIT.md` in the system repo: per book, the field inventory, every vehicle checked, every
    difference (page, shipped → book, outcome), and the **manual correction list for existing world actors** (R1 #10).

## Key decisions & tradeoffs
- Codex as the blind second pass, me adjudicating only the differences: the shipped data was itself transcribed from
  these renders, so agreement of two independent readings is the bar (as for the R2 list); reading 135 stat lines
  twice by hand is the costlier alternative.
- Only printed stats are audited; derived/system-only fields (design keys, token size, art) are out of scope.
- World copies are not touched and there is no migration (R1 #10): corrections reach future imports only; the report
  lists each corrected vehicle so the GM can fix a world copy by hand (with R2 on, the Rigger 2 stats window applies
  the R2 row instead, which is a different source).

## Risks / open questions
- Some books print a vehicle twice (a summary table and a write-up) with different numbers: both are recorded, the
  write-up's own table wins unless the book's errata says otherwise, and the case is listed in the report.
- Codex image quota: one call per book (several pages each); a silent quota failure is detected from the --json stream.

## Out of scope
The R2 list's own data (two-pass verified in 0.145.0); in-play vehicle rules (Phase 2); vehicles in other modules not
named above (none found by the inventory).
