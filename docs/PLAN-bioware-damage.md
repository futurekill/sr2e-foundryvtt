# Plan: bioware damage and repair (Shadowtech p.6)
_Round 3 — revised after Codex R1–R3_

## The rule (Shadowtech p.6, rendered)
"Damage to bioware systems can occur only on a single physical hit of Deadly severity. If the wound
is Deadly, roll 1D6 and subtract 3. The result is the number of potential implants that might be
damaged. Roll randomly to determine specifically what bioware is affected (repeats count as 'No
implant hit' for that particular die result). Note that dermal bioware cannot be damaged in this
manner and so is not considered when determining possible system damage. Having determined exactly
which bioware has been affected, roll 1D6 for each system to determine damage (subtract 1 from the
die roll result if the implant is cultured bioware): 0 None, 1–2 Light, 3–4 Moderate, 5 Serious,
6 Deadly. If a system suffers a Serious wound or greater, it will cease to function until healing
has reduced the Damage Level to less than Serious. If a system takes enough hits to exceed Deadly
damage, the system is destroyed. It cannot be healed, only removed and replaced. Bioware heals
individually and in half the time normally required for general healing. Until the bioware is fully
healed, the character receives no benefit from it."

**User rulings (2026-10-28):** (1) only Serious or worse switches the bioware off (until healed below
Serious) — the last sentence is read as describing that case; Light/Moderate damage leaves it
working. (2) An optional world setting **Bioware damage (Shadowtech p.6)**, default off.

## Approach
1. **Schema.** `BiowareData.damage` (integer 0–10, initial 0), `destroyed` (boolean), `damageRev`
   (integer, bumped by every change of the two), `implantGen` (integer, bumped by a `preUpdateItem` hook
   whenever `installed` changes or the GM edits damage/destroyed by hand). Light 1, Moderate 3, Serious 6, Deadly 10 boxes
   (core p.111). Hits add up from the UNCLAMPED sum: past 10 → `destroyed: true`, `damage` stored as
   min(10, sum) (R1 #8); `destroyed` is sticky — only the GM clears it by hand (repair = replacement).
2. **Trigger (R1 #11).** On `sr2e.damageCommitted` — fired on the COMMITTING client, as Phase 5 —
   a physical commit with landed boxes ≥ 10 ("a single hit of Deadly severity", Phase 5's per-commit
   reading), on a character with installed, non-destroyed, non-dermal bioware, setting on: that client
   creates ONE GM-whispered card per commit receipt (`once(actor, "biodmg-card:"+receipt)`), snapshot of
   the eligible items (id, name, cultured, `implantGen`) persisted (R3 #5). Actions are GM-only.
3. **Dermal bioware** is excluded by identity: a new ware rule `orthoskin` (its Shadowtech source in
   `WARE_SOURCES`).
4. **Rolling and applying — persisted first, receipted per item, resumable (R1 #2, #3, #4).**
   - **Roll** (GM): if the card already has results, nothing is rolled. Otherwise claim
     `once(actor, "biodmg-roll:"+receipt+":"+attempt)` BEFORE generating anything (R2 #2), where `attempt`
     is the card's persisted `rollAttempt` (initial 0). A claim whose results never landed (older than
     STUCK_MS, no results) is retaken by the GM's **Roll again**, which first advances `rollAttempt` on the
     card; publishing re-reads the card and stores results ONLY if `rollAttempt` still equals the
     claimant's and no results exist, and Apply uses only the stored results — a resumed superseded
     claimant publishes and applies nothing (R3 #1). Then 1D6 − 3 hits, one random pick
     each over the snapshot (repeat = no hit), 1D6 (−1 cultured) per hit item → levels; ONE card update
     stores all of it with every hit `applied: false`.
   - **Apply** (immediately after, and as an **Apply remaining** button if interrupted): for each
     unapplied hit, inside the GM client's per-actor bioware queue (`bio:<actorUuid>`), re-read the
     LIVE item — if it is gone, uninstalled, destroyed, or its `implantGen` (bumped whenever the item is
     installed/uninstalled/replaced by hand) differs from the snapshot, the hit is reported as stale for
     the GM to resolve, not applied (R2 #6) — and write ONE update (a 0-damage hit writes only its
     receipt: no damage, destruction or revision change, R3 #2): damage/destroyed from the live value + the hit, `damageRev + 1`,
     and the receipt `flags.sr2e.bioHits.<cardId>:<n> = level` — skipped if the receipt is already
     there. Then the card marks it applied. An item deleted meanwhile is reported.
   - **Concurrency (R2 #1):** different cards applied by two GMs at the same instant, or an owner's
     Heal racing a GM's Apply on another client, can lose an increment — the general cross-client write
     limit the system documents (commitDamage, Phase 5, the healing clock). Each writer re-reads live
     values inside its own queue; nothing here is worse.
5. **Effects (R1 #1).** One check, `bioFunctions(item)` = not destroyed and damage < 6, joins
   `workingImplant(actor, item)` (the shared functional-implant test); every reader of bioware benefits
   goes through it — `_collectItemModifiers`, armor, wound compensation (Damage Compensator), pain
   editing, pump/suprathyroid efficiency and trigger activation (audited by grep for
   `type === "bioware"`). Essence and Body Index still count. Sheet shows damage / "not working" /
   "destroyed".
6. **Repair — individually, half the time (R1 #5–#9, R2 #3–#5, #7).** A **Heal** button on a damaged,
   non-destroyed bioware row (owner or GM) runs the natural-healing PROCEDURE for the item's level
   (p.113): a Deadly item needs a doctor; WITHOUT a doctor, the Wound Table test first (no success →
   needs medical attention); then the Healing Table test with the character's natural Body; the time
   is HALVED. No character-monitor change, no Magic-loss check (that's the character's wound).
   - **Admission in both modes:** first any invalid course on the item is cleared (wrong `owner`, or
     `rev ≠ damageRev`, or `implantGen` changed); then `once(actor, "bioheal:"+item.uuid+":"+gen)` before
     rolling (gen = `flags.sr2e.bioHealGen`), capturing `damageRev` and `implantGen`. The commit re-reads
     the item: if gen has moved, it returns WITHOUT writing (R3 #4); otherwise it proceeds only if
     `damageRev`, `implantGen` (R3 #3), an empty slot and not-destroyed still match, and in the same
     write bumps gen — for the installed course, the instant heal, a failed roll, or a stale state
     alike. A start whose client died leaves gen behind: the GM's **Clear stuck heal** (shown when the
     claim is older than STUCK_MS) bumps gen, and the resumed old claimant then finds gen moved and
     writes nothing.
   - Without the healing clock: that commit IS the heal — the item drops a level now (to its own
     10-box track's next floor), `damageRev + 1`, and the card gives the (halved) time.
   - With the clock: the commit writes `flags.sr2e.bioHeal = { owner: item.uuid, id, level, rev:
     damageRev, implantGen, dueAt }`. Completion (the clock's reconcile, same per-actor queue)
     re-validates owner, rev and `implantGen` (R3 #3), then ONE update writes the floor absolutely, `damageRev + 1` and `bioHeal: null` (R2 #5).
     Any damage change bumps `damageRev` → the course is void (6→7→6 included) and is cleared at the
     next reconcile or admission.
7. **Setting off (R1 #10):** only NEW cards stop. Stored damage keeps its effects, Heal and existing
   courses keep working, and existing cards stay actionable — the damage already happened.
8. **Pure rules** `module/rules/bioware-damage-rules.mjs`: `bioDamageLevel(d6, cultured)`,
   `pickTargets(rolls, n)`, `addBioDamage(boxes, level) → {damage, destroyed}`, `bioFunctions(sys)`,
   `bioHealHours(level, successes)` (half the natural-healing hours). Vitest; Quench `sr2e.bioware-damage`
   (card once per receipt; roll persisted then applied; interrupted apply resumes without double
   damage; two cards summing; destroyed sticky; functions off at Serious; Heal clock course voided by
   damage; copied course ignored).

## Decisions
- D1 "single hit of Deadly severity" = one commit landing ≥ 10 boxes (Phase 5's reading).
- D2 damage is a stored, GM-editable field (no event log) — matches Phase 5's cyberware state.
- D3 item healing uses the character's natural-healing test at half time; no doctoring modifiers
  beyond what Heal offers (the dialog is the same).

## Out of scope
Bioware surgery/replacement flow (removal and re-implant are ordinary item edits); magical healing of
bioware (Shadowtech says magical healing must match the highest damage — left to the GM).
