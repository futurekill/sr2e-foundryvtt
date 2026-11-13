# Plan: Skillsofts bought ready to use, and drop failures that say so
_Round 2 — Round 1 plus the Codex R2 amendments at the end_

## Problem (backlog, "Broken / needs a live session")
1. **Blank chips.** A dropped ActiveSoft / KnowSoft / LinguaSoft grants
   nothing until the GM types `grantedSkill` on the item sheet and ticks
   Slotted. The Buy dialog asks for the Rating and the skill *type*, but not
   the skill *name*, which is the one field that makes the chip work. Every
   compendium soft ships with `grantedSkill: null`.
2. **Silent failures made a player report undiagnosable:**
   - Both actor sheets' `_onDrop` do `catch(e) { return; }` around
     `JSON.parse(dataTransfer)`, so a malformed drag payload vanishes without
     a message.
   - `_promptPurchaseOptions` starts `result = null`, and `_onDropItem` reads
     `null` as "cancelled". Any exception in the Buy callback looks like
     clicking Cancel.

## Rules (p.243, SSC skillsoft table; already modelled in `_applySkillsofts`)
- An ActiveSoft needs Skillwires; its Rating counts against the Skillwire
  total.
- A KnowSoft or LinguaSoft needs an access port (chipjack, datajack, or
  headware memory + datasoft link).
- A DataSoft grants no skill.

`_applySkillsofts` matches `grantedSkill` to an owned skill by name AND
category, or synthesises one. A LinguaSoft's family is looked up in
`CONFIG.SR2E.languageFamilies` by name.

## Design
Scope: **character** drops that open the Buy dialog (NPC sheets create items
directly and don't run `_applySkillsofts`; that is unchanged).

1. **The Buy dialog asks for the skill** when the item is a skillsoft.
   - `purchasePromptFields` adds `grantedSkill` for skillsofts only; the
     existing unit assertion is updated. Every listener and field is gated on
     it, so programs, rated gear, cyberware, bioware, foci and bows are
     untouched.
   - **Suggestions** come from the item sheet's existing catalog
     (`SR2EItemSheet._skillCatalog`: skills-compendium name + linked
     attribute; ActiveSoft covers active + build_repair), plus the actor's own
     skills of that category.
     - For language the catalog is the language skills in the compendium.
     - The `<datalist>` options are built in the dialog's render with DOM
       `.value` / `.textContent` (no HTML interpolation of names). The list is
       rebuilt when the Skill Type changes.
   - **Prefill from the dropped item**: its `grantedSkill`, `slotted` and
     attribute. A configured world or inter-actor chip keeps its
     configuration.
   - **The linked attribute**: the matched catalog entry sets
     `grantedSkillAttribute` (Firearms → Quickness). Free text keeps the item's
     existing attribute.
   - **DataSoft**: the skill field is hidden, and buying clears `grantedSkill`.
     `_applySkillsofts` also explicitly skips `data`-category softs for skill
     injection (a stale name can never grant a skill).
   - **No required attribute.** If Buy is pressed with an empty skill for
     active, knowledge or language, the dialog resolves and `_onDropItem`
     **re-opens it prefilled** with a warning. Cancel then cancels. This
     avoids fighting DialogV2's submit handling, and Cancel never needs
     validation.
   - **Slot it now** checkbox. It defaults on, **unless a slotted chip on this
     actor already grants that skill in that category**; then it defaults off
     with a note ("X already runs Firearms"). It only sets `system.slotted`;
     the existing preparation checks decide what runs.
     - Accurate description: an ActiveSoft needs a Skillwire budget.
       Know/LinguaSofts need any access port or memory.
     - Stronger port/memory accounting is out of scope.
   - **Naming** reuses the item sheet's convention: a generic name (`New
     Gear`, `ActiveSoft`, `KnowSoft`, `LinguaSoft`, `DataSoft`) becomes
     `"<Skill> <TypeLabel>"`, with the label from the SELECTED category. A
     custom name is kept.
2. **Failures surface.**
   - `_onDrop` (both sheets): only malformed JSON warns ("That drop couldn't
     be read"). A valid drag of an unsupported type (ActiveEffect, Macro …) is
     ignored quietly, as today.
   - `_promptPurchaseOptions` keeps its contract: the chosen object, or `null`
     for Cancel or close. An exception inside the Buy callback is caught
     there, stored, and **rethrown after the dialog closes**, so it is never
     read as a cancel.
   - The WHOLE supported-item workflow in `_onDropItem` (resolve, catalog,
     dialog, create, charge) sits in one try/catch. An error is a visible
     notification plus a console log. If the item was already created when it
     failed, the message says so ("X was added but the purchase didn't
     finish — check its price and your nuyen"). Compensating the existing
     create-then-charge sequence is out of scope.
   - All names in notifications and HTML are escaped.

## Tests
- Unit: `purchasePromptFields` includes `grantedSkill` for skillsofts only
  (the existing assertion updated).
- Quench (character sheet, the real dialog via renderDialogV2):
  - A compendium ActiveSoft bought as "Firearms", slotted, becomes "Firearms
    ActiveSoft" with the attribute Quickness. With Skillwires 3 the
    character's Firearms shows the chip rating.
  - Switching the type to language: the datalist offers English. It becomes
    "English LinguaSoft", and the synthetic skill gets the Germanic family. A
    custom language name gets no family (a documented limit). An owned
    language keeps its family.
  - DataSoft: no skill field; `grantedSkill` is cleared; no skill injected
    even with a stale name.
  - Empty skill + Buy re-opens the dialog; Cancel then creates and charges
    nothing.
  - A duplicate chip for a skill already running defaults to unslotted.
  - A forced callback exception gives the error notification and no item,
    and is not read as a cancel.
  - A malformed JSON drop warns; an ActiveEffect drag is ignored quietly.
  - A world chip already configured keeps its skill when prefilled. Alt-drop
    of a compendium chip creates it unconfigured and free.
  - Regression: a program and a cyberware Buy/Cancel still work.
  - Escaping: a skill named `<img src=x onerror=alert(1)>` renders as text in
    the datalist and in the item name.

## Out of scope
The LinguaSoft-by-name family lookup (canonical ids, backlog item); stronger Know/LinguaSoft port and memory capacity accounting; making create-then-charge transactional; the
player-permission side of the original drop report (needs the player's
console); the item sheet (another session has uncommitted edits there).

## Round 2 amendments (Codex R2, all accepted)
- **No Build/Repair suggestions.** The chip's category field has no
  `build_repair`, and `_applySkillsofts` matches categories exactly, so the
  ActiveSoft list is active skills only. (The item sheet's picker still lists
  them; that file is another session's, out of scope. Noted in the backlog.)
- **Slot default.** A source chip with a non-blank `grantedSkill` is
  "configured": its `slotted` is preserved. A blank chip defaults to Slot on.
  The buyer's choice survives a re-open.
- **Live duplicate check.** On skill or type input, the trimmed,
  case-insensitive name is compared with this actor's slotted chips of that
  category. On a match the note appears, and the checkbox is switched off
  only if the user hasn't touched it.
- **Trimming** happens once, first: the trimmed value is used for
  validation, matching, duplicate detection, naming and persistence.
  Whitespace-only counts as empty (tested).
- **Render errors.** The catalog loads **before** the dialog opens (awaited,
  inside the outer try/catch). The render-time listener wiring is wrapped:
  on error it stores the error and closes the dialog; the stored error is
  rethrown after `wait` resolves.
- **The attribute rule.** It is changed only when the skill or category was
  changed in the dialog, or the chip was blank. An **actor-owned** skill of
  that name and category supplies the attribute before a compendium entry.
- **Problem statement corrected.** Pack sources omit `grantedSkill`, so the
  schema default `""` applies. A callback exception interrupts the
  submission; the new handling stops the dialog stalling and the ambiguous
  dismissal that followed.
- Tests added: a whitespace-only skill re-opens; typing a duplicate name
  flips the default off; a configured world chip keeps its attribute and
  slot state.
