# Plan Review Log: structured citations (chargen M1b)
Started 2026-11-15. Codex reviews: fresh session per round with a settled brief.

## Round 1 — Codex (draft 1, fresh session): REVISE, 7 findings
1. **The fallback can assign the wrong book (§3).** SSC’s *Ultrasound Sight* references “the core book Sourcebook Updates table, p.280.” No book alias immediately precedes that page, so the fallback can produce `SSC p.280`; the proposed validator accepts it.  
   **Fix:** Track explicit book context across the reference clause and send uncertain attribution to render-verified overrides.

2. **Multiple candidates are silently resolved, contrary to U19 (§3).** Cybertechnology’s *Reaction Enhancer* contains several page references; the heuristic selects p.38 without requiring the multi-candidate report that the approved requirement specifies. Parenthetical preference can remain useful, but cannot substitute for reporting ambiguity.  
   **Fix:** Report every distinct multi-candidate case, show the heuristic’s proposed selection, and require a verified override before writing it.

3. **Overrides cannot correct an earlier backfill (§3).** Once an incorrect citation has been written, “only where it is blank (never overwrites)” prevents a corrected TSV entry from taking effect; syntactically valid wrong citations still pass validation.  
   **Fix:** Let explicit overrides replace existing citations with a reported before/after diff, and make validation reject disagreement with an override.

4. **Vehicles fall outside the stated backfill and validation traversal (§§3, 5).** The schema includes vehicle actors, but the tool reads items and embedded items, while enforcement names catalog items. Following that literally leaves entries such as SSC’s *Suzuki Aurora* uncited despite their relevance to chargen.  
   **Fix:** Explicitly include top-level vehicle actors in parsing, overrides, coverage reports, and mandatory catalog validation.

5. **Unresolved research already qualifies for the `none` exemption (§§4–5).** The system TSV marks *Subsonic*, *Launch Weapons*, and *Pilot* as `none` while explicitly saying “pending a RAW decision.” The proposed gate therefore treats unfinished research as completed citation coverage.  
   **Fix:** Distinguish unresolved entries from confirmed no-source exceptions and fail validation on unresolved entries.

6. **Validation is not yet a release gate (§§5, 7).** Rigger 2’s release workflow runs `build-packs` without `validate`; a tagged release containing an uncited new item can still publish.  
   **Fix:** Require citation validation in every affected release workflow before building and packaging.

7. **Release ordering does not prevent citation loss (§7).** Under the plan’s own stated older-system behavior, importing updated content drops the unknown citation field; upgrading afterward supplies only blank defaults, with no migration to recover it. Publishing the system first does not enforce users’ installation order.  
   **Fix:** Raise citation-bearing modules’ minimum system version to the schema release.

VERDICT: REVISE

### Claude's response (draft 2) — all taken
1: the book context carries across a clause ("the core book … table, p.280" is core); uncertain attributions are
reported, never written. 2: every multi-candidate item is reported with the proposed pick; nothing is written for it
until a human confirms (`--accept` → override rows, `checked: reviewed proposal`). 3: override rows replace existing
citations (before/after diff) and validation rejects a citation that disagrees with its override. 4: top-level vehicle
actors are parsed, overridden, reported and validated. 5: the TSVs gain `status` (`cited` / `none` / `unresolved`);
unresolved rows fail validation — the system's Subsonic, Launch Weapons and Pilot are now `unresolved`. 6: validate runs
in every affected release workflow before build-packs. 7: citation-bearing module releases raise their minimum system
version to the schema release.
