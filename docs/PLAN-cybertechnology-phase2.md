# Plan: Cybertechnology Phase 2 — the cyberlimb model
_Final — APPROVED by Codex in round 4 (after rounds 1–3). Follows docs/PLAN-cybertechnology.md (approved
roadmap). No limb RULES here (Phase 3); this phase gives limbs and their options an
identity, and a model with an explicit eligibility contract, that Phase 3 reads._

## Goal
Every cyberlimb knows WHAT it is (arm, leg, hand…) and WHICH SIDE it's on; every limb
option knows WHAT KIND it is (Strength, Quickness, Body, smartlink, device…) and which
limb it's in. A pure model exposes that, plus every conflict, to the sheets and to
Phase 3. It works for every version of an item (system, Cybertechnology, custom) and
for characters, NPCs and synthetic token actors.

## Verified facts (2026-10-21, v13.351 local)
- Embedded item ids survive `actor.clone`, `Actor.create(actor.toObject())` and an
  unlinked token's synthetic actor, so `linkedLimbId` stays valid across copies,
  imports and tokens. No remapping is needed.
- A single option dragged to another actor keeps its old `linkedLimbId`, which points
  at nothing there.
- The system's limbs: Cyberarm/Cyberleg (Full) (core p.247/261); Simple Replacement
  (p.261, arm or leg unstated); Cyberarm/Cyberleg (Partial) and Cybertorso ("values
  unverified", from no book). The options: Increased Strength, Built-In Smartlink,
  Built-In Device (p.261).
- Cybertechnology's items carry `flags.sr2e.rule`: `limb:<type>` and
  `limb-enhancement:strength|quickness|body`.
- `SR2ENPCSheet` has no cyberware section, and `npc-sheet.hbs` doesn't render one.
- `cyberlimbOptionSummary` (sr2e-rules.mjs) is called only by its own tests. It reads
  any `costPerRating` as Strength, any `combatTnMod` as a smartlink, and re-applies
  `limbOptionCost` to already-prepared prices (R1 #6, #7).

## Approach
1. **Schema (CyberwareData), additive, all `blank: true` where "" is a choice:**
   - `limbType`: "" | arm | leg | hand | foot | forearm | lowerLeg | torso | skull.
   - `side`: unknown (initial) | left | right.
   - `limbOptionKind`: "" | strength | quickness | body | smartlink | device | weapon
     | other.
   - **Coverage is derived from the type, never stored** (full: arm, leg; partial:
     forearm, lowerLeg, hand, foot; core: torso, skull).
2. **Pure resolvers (`module/rules/limb-rules.mjs`)**, precedence: an explicit field,
   then `flags.sr2e.rule`, then a table of KNOWN compendium source uuids, then null.
   - `resolveLimbType(sys, flags, source)`. Rule `limb:<t>` (`lower-leg` →
     `lowerLeg`). Source table: the system's Cyberarm (Full) → arm, Cyberleg (Full)
     → leg, Cybertorso → torso.
   - `resolveOptionKind(sys, flags, source)`. Rule `limb-enhancement:<k>`. Source
     table: the system's Increased Strength → strength, Built-In Smartlink →
     smartlink, Built-In Device → device. Cybertechnology's Built-In Smartgun Link →
     smartlink. Its `Increased Strength (Cyberlimb)` → strength, `Built-In Device
     (Cyberlimb)` → device, cyberguns and taser → weapon, and other options (covering,
     magnetic system, DNI, external mount, gyromount parts) → other, all by source
     uuid from the module's id registry (R2 #3). An option whose kind stays
     unresolved is REPORTED (sheet reason + migration report), never silently counted
     or dropped.
   - **One shared membership predicate** `limbRole(sys, flags, source)` → `"limb" |
     "option" | null` (R1 #9). "option" when `limbOption`. "limb" when not an option
     and (`location === "cyberlimb"` OR the resolver finds a type). Model membership,
     the item-sheet controls and the report all use it.
   - **Preparation:** CyberwareData `prepareDerivedData` CLEARS and rebuilds
     `this.limbIdentity = { role, type, coverage, optionKind, via }` every pass (the
     derived-state rule). It's never stored: the validator and a test assert it never
     appears in `_source`. A compendium item imported any time is recognized, and no
     data migration is needed.
3. **The model, `limbModel(items)` (pure, over plain `{id, system, flags, source,
   installed}`; the actor wrapper passes its own items, so a synthetic actor's model
   is its own):**
   - **`limbs`:** every INSTALLED limb `{id, name, type, side, coverage, slots,
     conflicts[], options[], reasons[]}`. Rules read only these.
   - **`options`:** installed options attached to a limb that is present, installed
     and a limb. Each gives `{id, kind, rating, cost, essence}` from PREPARED values
     (R1 #7), never re-priced.
   - **`orphans`:** installed options whose link is empty, points at a missing id (a
     deleted parent), an uninstalled parent, or a non-limb, each with its reason. No
     hook rewrites links: orphans are derived (R1 #3–#4).
   - **Cross-actor drops (R2 #4):** the item DROP path (`_dropItemWorkflow`, on the
     dropping client before the item exists) blanks `linkedLimbId` on any dropped
     limb option, since a drop always creates a new, unattached item. This prevents a
     clone with the same limb id from silently adopting it. Whole-actor copies, imports
     and tokens don't go through the drop path and keep their links (verified).
   - **Occupancy and conflicts (R1 #5, R2 #1).** Each sided limb occupies
     family-namespaced slots on its side:
     - arm = {arm.upper, arm.lower, arm.hand}; forearm = {arm.lower} (corrected in
       Phase 3 §0: p.30 makes the hand a separate part; was {arm.lower, arm.hand});
       hand = {arm.hand};
     - leg = {leg.upper, leg.lower, leg.foot}; lowerLeg = {leg.lower, leg.foot};
       foot = {leg.foot}.

     A left arm and a left leg never collide (tested). Torso and skull occupy
     {torso}/{skull}.
   - **Conflicts are a list (R3 #1).** Each limb exposes `slots` (its occupied set)
     and `conflicts[]` (every `{side, slot, ids}` group it's in). A left arm, forearm
     and hand produce groups on `arm.lower` and `arm.hand`, and the arm is in both.
   - **Only KNOWN sides conflict (R3 #2).** Groups form only among limbs on the same
     left/right side. Unknown-side limbs that could overlap (two unknown arms; an
     unknown hand with a left arm) are reported as `unresolvedOverlap[]` ("set the
     sides"), never as a conflict, so they keep their side-independent rules. Tested
     with two unknown-side arms. Two limbs sharing any slot on the same
     side (or two torsos/skulls) form a **conflict group** `{side, slot, ids}`.
   - **Separate facts, eligibility per rule (R2 #2).** Each limb exposes
     `classified`, `sideKnown`, `conflicts[]` (every group it's in) and `optionsValid`
     separately. There's no single "eligible" flag; Phase 3 chooses per rule:
     - side-dependent rules (pairs, Quickness mismatch, Body pairs) need classified
       + side known + no conflicts;
     - per-limb rules (enhancement limits, Essence of ware in the limb, unarmed Power
       of a hand) need classified + no conflicts, and are fine with an unknown side.

     These two are named predicates in limb-rules.mjs (`forSideRules`,
     `forLimbRules`). How replacements are COUNTED with overlaps (bone lacing, bioware
     efficiency) is a Phase-3 rule decision, made from the model's `slots` and
     `conflicts` (R3 #1), not a Phase-2 predicate. Unknown sides are never guessed.
   - Computed on demand (sheet context, Phase 3), never stored.
4. **Sheets (R1 #1–#2):**
   - **A shared cyberlimb partial** (`parts/cyberlimbs.hbs`) on BOTH the character's
     gear tab and the NPC sheet (a new compact Cyberlimbs section on the NPC). It
     lists each limb (type and side selects where editable, the coverage, reasons),
     and under it EVERY option, attached or orphaned, each with the same
     attach/detach selector (R2 #6), so an NPC option can be reassigned or detached.
   - **Rows cover the whole inventory (R3 #3):** the partial builds its rows from
     EVERY limb and option item (installed or not, with a status chip), so an
     uninstalled option can still be detached or reassigned, and an uninstalled limb
     still shows on an NPC. The model's rule data and the selector's parent choices
     stay installed-only.
   - **The old dropdown goes (R2 #5):** the attach select in `actor-gear.hbs`'s
     cyberware rows is removed, and `context.cyberlimbs` with it. Options are edited
     only in the shared partial, whose choices come from the model (installed limbs
     only).
   - **The attach dropdown** offers installed limbs labelled "Cyberarm (left)", a
     "— detach —" choice, and, when the current link is invalid, a SELECTED
     placeholder "⚠ <parent name or 'missing'> (<reason>)". It always shows the real
     state, and choosing anything fires a change.
   - **The item sheet** shows limb type and side when `limbRole` is "limb", and the
     option kind when it's "option".
5. **Delete `cyberlimbOptionSummary`** and its tests (unused, wrong). The model
   replaces it.
6. **Content (system packs-src):** set `limbType` on Cyberarm (Full) arm, Cyberleg (Full)
   leg and Cybertorso torso, and `limbOptionKind` on the three core options. Partial
   limbs and Simple Replacement stay unclassified with a note. The module needs no
   change (its rule flags and ids resolve).
7. **Report-only migration (0.110.0, R1 #8):** a collector runs the PURE resolvers and
   model over each actor's SOURCE items (world actors, and unlinked tokens with scene
   and token name). It whispers the GM a list of limbs that are unclassified, have an
   unknown side or are in a conflict, and of orphaned options. It writes no data.
8. **Tests (R1 #10).**
   - **Vitest** (`test/limb-rules.test.mjs`):
     - each resolver's precedence;
     - `limbRole` for every membership case;
     - occupancy conflicts (arm + hand same side, forearm + hand, duplicates, the
       opposite side fine, torso pair);
     - eligibility and reasons;
     - orphans (missing, uninstalled parent, non-limb, empty);
     - options from prepared values.
   - **Quench:**
     - **repeated preparation:** set → clear `limbType`, rule flag present → removed,
       limb → option → limb, each re-prepared twice: `limbIdentity` follows and never
       reaches `_source`;
     - a character and an NPC: classify, set sides, attach, the sheet sections and
       dropdown placeholder;
     - a cross-actor drag arrives unattached, including onto a clone that has the
       same limb id;
     - an NPC option attached, reassigned, detached;
     - a left arm and a left leg are both conflict-free;
     - the module's Increased Strength and Built-In Device resolve their kinds;
     - delete or uninstall a parent → orphaned with the right reason, and reinstall
       restores;
     - a synthetic token: its own model, the base actor and a sibling token
       unchanged;
     - a Cybertechnology hand resolves with no `limbType` set.
9. **Docs:** CHANGELOG, QA-PLAN, CLAUDE.md ("Cyberlimbs": limb identity only via the
   resolvers and the model; Phase 3 counts eligible limbs only; never names).

## Key decisions & tradeoffs
- **Derive, don't write:** types resolve at preparation, orphans are derived, and no
  hook rewrites links. That avoids every multi-client, same-user-tabs and
  synthetic-actor write race.
- **Explicit eligibility:** Phase 3 can't double-count overlapping or unknown-side
  limbs.
- **No guessing** for books that don't say (Simple Replacement, the unverified Partial
  items).

## Risks / open questions
- The system's "Cyberarm/Cyberleg (Partial)" items come from no book. The user may
  want to retire them for Cybertechnology's partial limbs (not this phase).
- The Chrome Kings' limbs resolve by flag but their sides are unknown; the module's
  generator can set them from the stat blocks' "left/right" text in its next release.
