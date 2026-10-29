# Plan: Shapeshifters (Shadowrun Companion pp.36–38; core pp.227–229, 233)
_Implemented 2026-10-29 (sr2e 0.125.0) — revised after Codex rounds 1–5 (cap reached; round-5 fixes applied, not re-reviewed) (see PLAN-shapeshifters-REVIEW-LOG.md)_

## Goal
Make shapeshifters playable as characters (Companion "New Character Types") and runnable as NPCs (core
critter + Regeneration power), with forms the sheet can switch between. All rules were read from page
renders (Companion PDF p.37–39 = book p.36–38; core PDF p.228–229, 255, 259).

User decisions (2026-10-29): regeneration heals **Physical damage only** (Stun recovers by the normal
rules); shifting to animal form **uninstalls** installed cyberware automatically (chat card lists it;
Essence is the GM's). The book says *cyberware* (p.38) — bioware is not rejected.

### Rules being implemented
- **Creation (p.36):** Race must be Priority A. Shapeshifter table B: Magician, 24 attr, 30 skill,
  400,000¥/35 FP; C: Adept, 20, 24, 90,000¥/25; D: —, 17, 20, 5,000¥/15; E: —, 15, 17, 500¥/5.
  Base attributes ≤ 6; Human-/Animal-Form modifiers apply on top, and final ratings are NOT subject to
  racial maximums. No free starting contacts (p.38).
- **Species (p.36):** Bear H +1B +1S; A +5B −1Q +5S −2W, +1 Reach, Dermal Armor (+2 Body).
  Fox H +1I +2C +1W; A +1I +2C +1W −2B −2S, +1D6 Init. Leopard H none; A +1B +1S +2D6 Init.
  Seal H +1C; A +1C +2B +1Q +1D6 Init. Tiger H +1S; A +4B +1Q +4S −1I −2W, +1 Reach, +2D6 Init.
  Wolf H none; A +1B +1Q +1D6 Init.
- **Shifting (p.36):** Complex Action. Gear and clothing don't shift. In animal form: no speech, no Social
  skills, spells allowed but no Centering, no physical adept powers.
- **Dual nature (p.37):** perceives astrally any time (Simple Action), can't shut off its astral presence.
  Magicians project only in human form; astral attributes = physical attributes.
- **PC regeneration (p.37–38):** none in human form. Human-form damage heals ⌊E/2⌋/turn once in animal
  form; animal-form damage ⌊E⌋/turn while in animal form. Deadly → 1D6, dies on 1 (1–2 massive tissue);
  survivors heal ⌊E⌋/turn and still check magic loss. Damage ≥ Body + 10 kills in any form. Physical Drain:
  1 box/minute; Deadly Physical from Drain → dies on 1–2.
- **Silver (p.38):** +2 Power and +1 Damage Level; silver damage recovers 1 box/minute, outside the
  regeneration rules (kills per standard rules); Deadly from silver + non-silver → dies on 1–2.
- **Cyberware (p.38):** can't willingly accept any; rejected on shifting to animal form.
- **NPCs (core p.227; Companion p.37 sends GM characters there):** Deadly wound or cumulative wounds take
  it down → 1D6, dead on 1 (1–2 fire/explosion); otherwise wounds vanish at the start of the next Combat
  Turn. Vulnerability (core p.229) +1 Damage Level, and such wounds recover "at the same speed" as others.
  Severe Allergy +2 Power.

## Approach

### 1. Pure rules — `module/rules/shapeshift-rules.mjs` (Vitest, book values cited)
- `SHAPESHIFTER_SPECIES`, `SHAPESHIFTER_PRIORITIES` (render-safe: EVERY row A–E has every category the
  priority renderer reads; row A = `{race: "shapeshifter", attributes: 0, skills: 0, resources: 0,
  forcePoints: 0, magic: "none"}`).
- `formModifiers(species, form)` → `{attrs, initDice, reach, dermalDice}`; unknown → zeros.
- `SOCIAL_SKILLS` (core skill list, verified from render) and `isSocialSkill(name)` on the base name.
- **Buckets** (Physical only): `{human, animal, bane, drain}`, total = Physical value + overflow.
  - `reconcileBuckets(b, total)`: sum < total → the missing boxes go to `human` (unknown provenance gets
    the slowest regenerating form rate; this is also the initial state of an already-wounded actor);
    sum > total → trim in the default heal order. Pure, value-based, no migration.
  - `applyDelta(b, {added: {bane, drain}, form, removed, explicit})`: increases → the named counts, rest to
    the current form; decreases → `explicit` decrements (regeneration) or heal order bane → drain → human →
    animal (RAW silent; slowest first).
- `regenStep(b, {form, essence, turns, carry, survived})`, one turn's budget = ⌊E⌋ shared: animal bucket
  first, then human up to ⌊E/2⌋ of what's left (the conservative reading — no 9-box turns at E 6); after a
  survived Deadly check (`survived`) the human bucket heals at the full rate. Bane and drain: 1 per 20
  turns (a minute), tracked by `carry`. Human form → nothing.
- `deathCheckFor({kind, form, before, after, added, buckets})` → `null` or `{diesOn, why}`: only when the
  update ADDS Physical damage and the monitor is full afterwards (a Deadly wound, or wounds that take it
  down, or more damage while down). PC in human form → null (standard rules). PC: damage all bane → null
  (standard rules); drain in this hit → 2; bane and non-bane both present → 2; else 1. NPC → 1 (the card
  offers 1–2 for fire/explosion). A pending check merges to the worse `diesOn`.
- `killedOutright(total, body)` = total ≥ body + 10 (PC only).

### 2. Schema (every new choice field `blank: true` or choice-less; legacy-construct tests in Quench)
- **Character** `system.shapeshifter: { species (choices + blank), form: "human"|"animal" (initial human),
  bane: "silver", humanImg: "", animalImg: "" }`. `isShapeshifter(actor)` = character with
  `race === "shapeshifter"` and a species, or NPC with `shapeshifter.enabled`.
- CONFIG: `races.shapeshifter`, `racialModifiers.shapeshifter` (0s), `racialMaximums.shapeshifter` = the
  human 6s (the creation cap on BASE), `racialAbilities.shapeshifter: []`.
- `_naturalAttribute` (shapeshifter only): the existing clamp of `base + edge` (racial max 6 + edgeMax —
  IN CREATION ONLY, unchanged after chargen) then **+ form modifier, unclamped**, then permanent losses,
  floored at 1 (a −2 form modifier on a base 1 gives 1). ONE structure: `naturalInfo`
  stays form-free (raw = base + edge, cap = 6 + edgeMax, loss) and is ONLY the Karma price input; the form
  modifier is not in it. `advanceKarma`'s "would this raise anything" check calls `_naturalAttribute` itself
  with the base before/after (so clamp, edge, form and losses are all the real calculation). The form modifier is NOT in `.racial` and NOT in `naturalInfo`
  (advancement prices off base with cap 6 — form-independent; Karma doubling above 6 per p.192). The
  attribute tooltip names it "Animal form"/"Human form".
- Initiative: `+ formMods.initDice` beside `mods.initiativeDice` (CharacterData ~436), not in the rigging
  branch.
- Dermal: `dermalDice(actor)` (troll 1, bear animal 2) in rules, used by actor.mjs:2407 and
  permanent-damage.mjs:64.
- **RaceData** `raceKey` gains `shapeshifter`; `species` (blank). `_onDropRace` copies species, sets human
  form.
- **NPC** `shapeshifter: { enabled, bane: "silver" }`; `forms: ArrayField({ key, name, img, body,
  quickness, strength, charisma, intelligence, willpower, reactionMod, initiativeDice, ballistic, impact })`;
  `activeForm: ""` (free string; "" or an unknown key = the printed block). `NPCData.prepareBaseData`
  (Foundry runs it BEFORE applying Active Effects) sets the baseline every pass in both directions: with a
  form, `<attr>.base`, `reaction.mod`, `initiative.dice`, `armor.ballistic/impact` = the form's values; with
  none, the `_source` values. Foundry then applies every effect (ADD, OVERRIDE, MULTIPLY) in its normal order
  on top, and prepareDerivedData is unchanged — so no effect is inferred or dropped, and with no form active
  the result is exactly today's. The prepared baseline is never saved: while a form is active the NPC
  sheet's stat-block inputs are disabled (the forms editor edits forms). While a form is active, the NPC sheet's stat-block inputs are
  disabled (the forms editor edits forms), so prepared form values can't be saved into the block.
  Kludde-style spirits use forms without `shapeshifter.enabled`. `isDualNatured(actor)` = `dualNatured` OR
  shapeshifter.
- **Weapon** `system.form: ""` (free string). One predicate `weaponUsable(actor, item)`: PC shapeshifter in
  animal form → only `form === "animal"`; PC in human form → not `animal`; NPC with forms → blank or the
  active form. Used by the attack entry points (ranged, melee, after their dialogs too), `rollMeleeDefense`
  counterstrike weapon choice, and `actorAstralProfile` weapon selection. Animal-tagged melee weapons get
  the species Reach added.
- **Weapon / Ammo** `system.material: ""`; loaded ammo's wins.

### 3. Shifting — `module/shapeshift.mjs`
`shiftForm(actor, toForm)` (owner): refuses while projecting, either monitor full, or a death check pending
/ dead. Order: (1) PC → animal: installed cyberware → `installed:false` FIRST (one embedded update; on failure
abort — nothing shifted); (2) `actor.update(form, {sr2eShift: true})`; (3) token art for the actor's tokens on
the viewed scene + prototype when the form has an image (warn on failure); (4) one chat card. An interruption
after (1) leaves a human-form character with uninstalled implants — the outcome the shift was going to cause
anyway; no state to recover.
- `preUpdateActor` guards EVERY writer: a form change is refused while projecting / a monitor full / death
  pending or dead; a change to animal is refused while any cyberware is installed (message: use Shift form).
  So no macro or sheet edit reaches animal form with working implants.
- `preCreateItem`/`preUpdateItem`: nobody installs cyberware on an animal-form shapeshifter; a non-GM can't
  install it on a human-form one ("can't willingly accept"; the GM may — p.38's "un-named governments").

### 4. Animal-form limits (PC)
- Social skills: `rollSkillTest` refuses `isSocialSkill`. Language skills are allowed (comprehension);
  the card notes it can't speak.
- Centering: reduction forced to 0, centering skill rolls refused.
- Adept powers: one predicate `adeptPowersWork(actor)` read by the adept branch of
  `_collectItemModifiers`, `_applyAdeptSkills` (Improved Ability — clearing `_adeptBonus`/`_adeptSource`
  before the gate), and Killing Hands (sheet-actions.mjs:613, item.mjs:1144).
- Worn armor excluded from `wornArmorTotals` (derived; shifting back restores it).
- Cyberware: no modifiers in animal form (rejected) even before the uninstall lands.

### 5. Dual nature and projection
`astralKind` order: PROJECTING first (unchanged branch), then `isDualNatured` → "dual" (a shapeshifter in its
body: same attributes, physical armor). Projecting keeps the projecting profile (Sorcery, foci, Astral Pool),
but its attributes come from one map, `astralAttrs(actor)`: shapeshifter → astral Strength = Strength (the
damage the profile now reads from Charisma), astral Body = Body (resistance, now Willpower), astral
Quickness = Quickness (`astralReaction`, `movement.mjs:123`); everyone else unchanged.
Projection admission (shapeshifters; others unchanged): `preUpdateActor` evaluates the RESULTING
form and astralState (an update may change both) and refuses `projecting` unless the result is human form AND
the character is a full magician (Magic Priority B; magic type `full_magician`). `toggleAstral` skips
projecting when unavailable. The legacy `rollAstralResistance` (actor.mjs:2877, existing `flags.sr2e.astral`
cards) also reads `astralAttrs`. Perception stays the existing toggle. Astral visibility needs no change (physical token).

### 6. Buckets (PC only) — kept by ONE preUpdateActor hook
- State at `flags.sr2e.shift.<stateKey(uuid)>` = `{b, carry, death}` (owner-keyed like the healing clock,
  so an unlinked token never reads its base actor's state).
- Hook (EVERY `isShapeshifter` actor, Physical monitor in `changes`): death admission (below) for PCs and
  NPCs; bucket accounting for PCs only: before/after totals → `applyDelta` with
  `options.sr2eDamage` (`{bane, drain}` counts of THIS update's added Physical boxes) or
  `options.sr2eRegen` (explicit decrements), then `reconcileBuckets`. Death: `deathCheckFor` → a pending
  check merged into `death` in the SAME update. All on the writer's client — no hook round-trip, so
  player-made damage works.
- `commitDamage(…, {source})` computes how many Physical boxes the PRIMARY hit added (vs Hyper/Stun
  overflow, which is unattributed) and passes `{sr2eDamage: {[source]: n}}` for `bane`/`drain`. Drain
  callers pass `source: "drain"` (actor.mjs:1490, item.mjs:1880, conjuring and ritual drain — only Physical
  drain counts); a bane hit `"bane"`.

### 7. Regeneration
- **Combat:** `updateCombat` with `newRound > oldRound ≥ 1` (combat start 0→1 heals nothing; a rewind
  never heals), on GM clients. Per COMBATANT a cursor `high[combatantId]` (the last round regenerated for, or
  forfeited) — keyed by combatant, so leaving and rejoining starts a new participation; an actor with several
  combatants is processed once (its first combatant). Missing cursor: the combatant's
  `flags.sr2e.joinedRound` (written in its own create by `preCreateCombatant`: `max(1, combat.round)`), else
  (legacy combatants in an existing combat) the event's `oldRound`.
  For each `isShapeshifter` combatant actor: settle the healing clock first (`reconcileHealing`, OUTSIDE the
  damage queue; skip this actor if false); then inside `damage:<uuid>` re-read the cursor; `cursor ≥ newRound`
  → nothing; claim the ADVANCE by its starting point, `once(actor, "regen:<combatant>:<cursor>")` (two
  clients holding rounds 3 and 5 both start from 2: one wins and writes, the other does nothing, and the next
  event catches up from the new cursor — the cursor never regresses); elapsed turns = `newRound − cursor`.
  Pending death check or dead → write the cursor alone (the turn is FORFEITED and recorded: the book rolls the
  check at once; the card says an unanswered check costs the turn). Else ONE write: PC → `regenStep(turns)`
  decrements (`sr2eRegen`) + carry + cursor = newRound; NPC → Physical and overflow to 0 + cursor.
  A crash between claim and write leaves the cursor unchanged: the next event CATCHES UP the elapsed turns
  (time did pass) — chosen deliberately.
  `shortcut: no cross-client CAS — a player's damage landing in the same instant as the GM's tick can be
  overwritten; the window is between Combat Turns. Upgrade if it's ever seen.`
- **Out of combat:** sheet "Regenerate…" (owner/GM), minutes passed → turns = 20 × minutes; refused while
  the actor is in a started combat; settles the healing clock first (same rule as above).
- Survived episode: `death.survived` is cleared by the hook when the Physical total returns to 0.
- Stun: untouched (normal recovery).

### 8. Death
- The pending check lives in `death = {id, diesOn, why, state: "pending"|"dead"|"survived"}`. Regeneration
  and shifting are blocked while pending/dead.
- `death` carries `rev`, bumped on EVERY transition (open, merge to a worse `diesOn`, outright death,
  resolution, revive). Resolution is a durable EVENT, then an idempotent apply: the GM's roll is
  published with the existing `recordEvent(actor, "death:<id>:<rev>", {roll, diesOn, outcome})` (a durable
  deterministic-id record — the server accepts exactly one; a second roll loses and reads the winner). The chat
  card is rendered FROM that record. Apply = one write of `state` (+rev), only if id, rev and
  `state === "pending"` still match; any GM client re-applies a recorded but unapplied outcome (on the
  record's creation and from the sheet's "Death check" button). No claims to strand. A stale
  result (rev changed — e.g. an outright death in between) applies nothing.
- Card: the active GM's `updateActor` hook posts it once per id (`once(actor, "deathcard:<id>")`); the sheet
  ALWAYS shows a GM "Death check" button while pending (recovery if the card never posted). Buttons: "Roll
  1D6 (dies on N)" and, when N is 1, "Massive tissue injury (dies on 1–2)". Resolution is one write
  (`state`, and survived → `survived: true` for regenStep), refused if the id changed. Dead → actor-scoped
  `death.state = "dead"` (authoritative) and the `dead` status mirrored on the actor's tokens; a GM
  "Revive / clear" button resets. Survived + magician → a GM button "Magic loss check (p.115)" with the same
  shape: roll 2D6 (`magicLost`, the standard test), `recordEvent(actor, "deathmagic:<deathId>", {roll, lost})`
  (one result ever), then ONE actor update applying Magic −1 (if lost) AND `death.magicApplied = true`, only if
  not already applied — re-applied from the record if that write failed. Regeneration — not a healing course — heals the wound, so the standard
  paths that check on healing a Deadly wound don't fire for it. `shortcut: no shared receipt with those
  paths — if a GM ALSO heals the same Deadly wound by the normal rules before regeneration does, they skip
  one check by hand; upgrade if a table hits it.`
- `killedOutright` on any PC increase → `death.state = "dead"` directly with a card.
- NPC deaths use the same state and card.

### 9. Silver (bane) on resistance
`rollDamageResistance`: for an `isShapeshifter` defender, a checkbox "<bane> weapon (+2 Power, +1 Damage
Level)", pre-ticked when `options.material` matches the bane. Ticked → Power +2 before armor, level +1 (max
D), commit with `source: "bane"`. Material is carried by the ranged state, the melee attack card and the
generic resist button (`data-material`); other paths use the checkbox. Willpower (6) contact test: not
automated.

### 10. Character creation
`priorityTable(system)` (actor-sheet.mjs:529, :1648) → SHAPESHIFTER_PRIORITIES for a shapeshifter; the
renderer (actor-sheet.mjs:1657) gets a "Shapeshifter" race label and shows "—" for unavailable categories
instead of 0.
Validation lines: race priority not A; full magician without Magic B; adept without Magic C; mundane-only at
D/E with a tradition; sum-to-10 is refused for shapeshifters (the book gives only this table). No free
contacts: if chargen grants any, zero for shapeshifters.

### 11. Content (this effort)
sr2e-shadowrun-companion: six race items "Shapeshifter (Bear)" … (`raceKey: "shapeshifter"`, `species`),
summaries of p.36–38; drop the generator's `ponytail:` skip.

### 12. Tests
Vitest: species/priority tables, buckets (add/remove/reconcile incl. legacy-wounded), regenStep (mixed
budget, survived, carry), deathCheckFor matrix, killedOutright, isSocialSkill, dermalDice.
Quench (`sr2e.shapeshifters`): legacy actors/items construct with new defaults; attributes/initiative per
form and after a SECOND preparation; NPC form selected → cleared → deleted (no stuck values; sheet inputs
disabled); player-origin damage (non-GM user doc update) creates buckets and a pending death check;
regeneration blocked while pending; death card resolution (dies/survives/massive); combat round tick once
(two calls), no tick on round decrement; out-of-combat regen; bane checkbox staging; drain source; shift
refusals; cyberware rejection incl. an interrupted shift; adept/Killing Hands/Improved Ability gated;
weapon eligibility in attack, defense counterstrike and astral profile; social skill refusal; priority
table render + validation. Interleavings: two tick calls for the same round (second is a no-op); a death
failed uninstall aborts the shift;
uninstall-then-failed-form-update leaves a consistent human; direct `form: "animal"` update with installed
cyberware refused; projecting refused in animal form and for a mundane shapeshifter (incl. one update changing form + state);
combat rewind 3→1→2 heals nothing; start 0→1 heals nothing; jump 2→5 heals 3 turns; death result whose apply
fails, re-applied from the message; two results for one (id, rev) — earliest wins; outright death between
roll and apply (stale result applies nothing); overlapping round handlers 2→3 / 3→5 in both orders (the cursor never regresses; the total catches up); a late joiner heals only from its join round; NPC forms with ADD and OVERRIDE effects, prepared
twice, form selected and cleared, effects intact; two death records for one (id, rev) — one accepted;
Magic loss double-click and an interrupted apply (Magic lowered exactly once); legacy combatant without
joinedRound or cursor; leave-and-rejoin heals only from the rejoin; a claim-then-crash catches up next round.

## Key decisions & tradeoffs
1. Form modifiers are a natural term AFTER the base clamp, outside `.racial` and advancement pricing.
2. NPC forms are absolute stat blocks; PC forms are species modifiers — as each book prints them.
3. One preUpdateActor hook keeps buckets and opens death checks in the same update as any Physical change.
4. NPC silver wounds regenerate (core p.229); PC silver wounds don't (Companion p.38).
5. Death checks are GM-rolled; "dead" is actor-scoped state, mirrored to token statuses.
6. Mixed-origin turns share one ⌊E⌋ budget (conservative reading).
7. No cross-client CAS for regeneration ticks. Rejected Codex R2 #1 (one authoritative writer with durable
   requests): every monitor writer in this system — first aid, healing spells, healing-clock completions,
   the GM's sheet — writes absolute values from its own read; Foundry has no compare-and-set, and the
   system's documented stance (healing clock, CLAUDE.md) is to accept it. The window here is the instant
   between Combat Turns, when nobody is resolving damage.

## Out of scope
Cyberpirates (Malakat, Pugot, Warek) and the core Shapeshifter's animal forms, Paranormal Animals' Kludde:
content follow-ups using `forms` (animal stats need verifying from renders). Wyrd Mantis is not a
shapeshifter. Masking, Willpower (6) silver contact test, gear damage on shifting.
