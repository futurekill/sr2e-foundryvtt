# Plan: Cybertechnology Phase 5 — cyberware damage, repair, scarring
_Round 4 — revised after Codex rounds 1–4 (log at the end). Follows the roadmap (docs/PLAN-cybertechnology.md §Phase 5)
and reuses Phase 4's event-log machinery (docs/PLAN-cybertechnology-phase4.md §8)._

## Goal
An OPTIONAL world rule (`cyberDamage`, default OFF): when a character takes a Serious or
Deadly wound, the GM gets one card offering the book's checks:
- the quick-and-dirty cyberware damage check, with grade resistance and secondary effects;
- dermal plating/sheathing degradation;
- scarring.

Rolls are GM clicks, and their results are applied to plain GM-EDITABLE state on the
items and the character (§0), which the GM can always correct by hand (R3 #8). A separate
maintenance change fixes Phase 4's `foldMbw` equal-timestamp bug.

## Source (rendered pages, read 2026-10-22)
- **p.44, the quick-and-dirty system:**
  - after all Damage Resistance Tests for a Serious or Deadly Wound, the GM rolls 2D6;
  - if the result is LESS than the boxes taken (6 Serious, 10 Deadly), cyberware is
    damaged;
  - the GM picks which piece, with a logical tie to the wound's location, not unduly
    hindering the character.
- **p.44, grade damage resistance:**
  - custom (alpha/beta/delta) cyberware rolls 5 dice vs a TN (Serious/Deadly):
    alpha 5/6, beta 4/5, delta 3/4;
  - one success means no damage.
- **p.44, delta:** medical costs and repair times are quadrupled.
- **Secondary damage tables (2D6):**
  - communications headware (p.45): 2–4 none; 5–7 static; 8–9 intermittent (half the
    message); 10–11 works intermittently, struck/jostled, Quickness (3); 12 total
    failure;
  - cybereye (p.45): 2–4 none; 5–6 black-and-white; 7 blurred, +2 to perception at a
    distance; 8–9 intermittent, Quickness (3); 10–11 one eye fails, +4 depth
    perception; 12 total failure;
  - cyberear (p.47): 2–4 none; 5–6 low end cuts out; 7 static, +2 to discern sounds;
    8–9 intermittent, Quickness (3); 10–11 one ear fails, +4 spatial sound; 12 total
    failure;
  - cyberlimb (p.49): 2–4 none; 5–7 twitches, +1 to tests using the limb; 8–9 on 2D6
    ≥ 10 the limb misbehaves (GM); 10–11 on 2D6 ≥ 8 it fails; 12 shuts down except an
    occasional twitch;
  - every secondary effect lasts until the unit is repaired. With the quick-and-dirty
    system, the repair TN = ⌊roll / 2⌋ (pp.45, 46, 47).
- **p.46:** an eye gun damages its cybereyes automatically when used (recoil).
- **pp.47–48, dermal plating:**
  - damage from a Serious or Deadly wound needs a spray bonder within 24 hours;
  - the GM notes every failure to use it. On every later Serious/Deadly wound from
    non-explosive weapons or magic, 2D6: if LESS than the number of failures, the
    effective rating drops by 1, cumulatively;
  - repair by a street doc: 2,000¥ × the points lost, per point (first point × total
    lost, …), −5% per net Negotiation success; a Biotech (5) test, 4 hours a point.
    DIY materials: 400¥ × 2 × points.
- **p.48, dermal sheathing:**
  - only a Deadly wound can permanently reduce its rating;
  - repairs are 6,500¥ a point (1,400¥ materials), Biotech (4), 5 hours;
  - sealer within 12 hours means no scarring, otherwise a Minor scar.
- **p.56, scarring:**
  - on a Serious or Deadly wound, a Body test at TN = the boxes taken, with the
    Scarring Modifiers:
    - intensive care −4; not in hospital/clinic 0; bad conditions +2; terrible +4;
    - magically healed half or more −4; some −2;
    - dermal plating +3; dermal sheathing or semi-artificial skin +2;
    - proper healing salve for plating/sheathing −2;
  - successes: 0 Terrible, 1–2 Major, 3–4 Noticeable, 5+ Minor;
  - minor cosmetic surgery removes all but Terrible, and minor invasive surgery
    reduces a Terrible scar to Minor.

## User rulings (2026-10-22)
- **Secondary effects** are recorded and shown as reminders; nothing changes rolls.
- **Dermal sheathing** uses plating's degradation check, but only on Deadly wounds, and
  sealer within 12 hours is its "bonder".

## Approach
### 0. Model: GM-editable state, not an event log (R2: the simpler alternative)
This phase is optional GM bookkeeping that the book leaves to the GM's discretion at every
step. Its state is a handful of visible numbers and lists the GM can always correct by
hand, so an event log (Phase 4's choice, needed there for clocks, counters and
irreversible outcomes) is replaced by:
- **On each cyberware item** (CyberwareData, new fields, all with initials so old documents
  stay valid):
  - `conditions`: an ARRAY of `{ id, table: "" | eye | ear | comm | limb | other, roll:
    Number, effect: String, repairTN: Number }`. Every unrepaired secondary effect lasts
    until repaired (R4 #2), so a second wound ADDS one and never replaces;
  - `skinMissed`: an integer, the missed bonder/sealer treatments;
  - `skinLoss`: an integer, 0..rating, the points of rating lost.
- **On the character:** `flags.sr2e.scars`, an array of `{ id, severity, source, at,
  treatedTo }`.
- **Editing:** all of it is editable on the item sheet (GM) and the actor's "Cyberware
  condition" block. Writes are ordinary single updates, and a hand edit always wins.

**Cards are proposals; a click applies.**
- Every roll happens when the GM clicks Roll on a card. The card shows the result and an
  **Apply** button.
- Apply writes the field (setting an absolute value computed from the CURRENT document,
  never "+1 blindly"). It then marks the card resolved (`flags.sr2e.resolved`), which
  disables its buttons for everyone.
- **Snapshots are persisted** in the card's message flags WHEN THE CARD IS CREATED (R3
  #2): wound level, boxes, each skin item's `skinMissed`/`skinLoss`, and the rolls once
  made. Renders, reloads and other clients all show those stored values.
- **Apply refuses a changed snapshot** (R3 #3): if the target field no longer equals the
  snapshot (a hand edit or another apply happened), the card says so and does nothing,
  and the GM edits by hand.
- **Scars carry a stable id** from the card: `<messageId>:general:scar` for the scarring
  check, `<messageId>:<itemId>:scar` for each sheathing scar (R4 #1). Apply adds the scar only
  if that id isn't already present, so it's idempotent.
- **Resolution is per item and per action** (R3 #1): `flags.sr2e.resolved[<item>:<action>]`.
  Treatment, degradation and the sheathing scar close independently, so a missed
  treatment can be recorded hours after a degradation check.
- **Recorded limit:** two GMs applying the SAME action at the same instant can both pass
  the check. The visible numbers are the fallback.

That removes R1/R2's attempt keys, dependency folds and voids from this phase entirely
(R2 #1–#6, #8–#10).

**Phase 4's equal-timestamp bug** (R1 #4) is still fixed. `foldMbw` resolves parent
liveness to a fixpoint (independent of sort order), keeping its own void policy
(only its listed types are voidable, a missing parent is not live, and there's no
void-of-void). A regression fixture is added BEFORE the change.

### 1. The trigger
- `commitDamage`'s hook payload gains `{ type, receipt }` (a receipt is generated per
  commit). The seizure listener ignores them.
- On a CHARACTER with the setting on, the committing client posts ONE GM card when that
  commit LANDED ≥ 6 PHYSICAL boxes (6–9 Serious, 10+ Deadly).
- **Dedupe:** `once(actor, "cdmg-card:<receipt>")`, a normal claim (the receipt is unique
  per commit).
- **The card's sections** (each rendered only if it applies; R2 #6):
  - Cyberware damage check, if any cyberware is installed;
  - Plating/sheathing, if installed (sheathing only on Deadly);
  - Scarring check.
- Each section has its own Roll/Apply and resolves independently. A section marked
  resolved can't be applied again.
- **Lost card:** the actor block has "Serious/Deadly wound (manual)", which posts the same
  card for the GM to fill.
- Stun is excluded.

### 2. Identity (extends `ware-rules.mjs`)
- `dermal-plating`: core Dermal Plating 1–3 uuids, plus the module's flag.
- `dermal-sheath`: the module's flag.
- `cyberear`: the core uuid, plus the module's flag.
- `comm-headware`: the core and Cybertechnology radio/receiver/telephone/commlink/
  cybercomm/crypto/scramble/subdermal speakers, by uuid.

Each is tested. "Semi-artificial skin" = `dermal-sheath`, or a dialog checkbox.

### 3. The damage check
1. **Roll 2D6;** damaged when < the threshold (6 Serious, 10 Deadly).
2. **If damaged:** the GM picks the item (a select of installed cyberware, eyes, ears,
   limbs and comm first) and the table (preset from identity, editable; "other" = no
   table).
3. **Grade resistance** (alpha/beta/delta: 5 dice vs the S/D TN, ≥ 1 success → "resisted").
4. **Secondary 2D6** → the row and repair TN ⌊roll / 2⌋.

The card shows all of it. **Apply** appends `{ id: <messageId>:damage, … }` to the chosen
item's `conditions`, unless that id is already present (idempotent). "Resisted" and "not
damaged" are terminal and write nothing; "other" appends `{ table: "other", effect:
"damaged (GM)", repairTN: 0 }`.

- **Already damaged:** the card lists the item's existing conditions next to the new one,
  so the GM can reconcile (keep both, or remove one on the item).
- **Repaired:** a button per condition (item and block) removes that one.
- Delta items show "×4 medical costs and repair time (p.44)".

### 4. Dermal plating and sheathing
- **Qualifying source (R3 #4):** degradation needs a wound from non-explosive weapons or
  magic. The skin section has a GM checkbox, "from non-explosive weapons or magic"
  (persisted on the card), which enables the Degradation check.
- **Damage:** the card's skin section offers, per installed plating (S/D) or sheathing
  (D only):
  - **Missed treatment** (GM, once the 24 h bonder / 12 h sealer deadline has passed):
    `skinMissed` = (the value shown) + 1. "Treated in time" does nothing (no record is
    needed: only failures count, p.48).
  - **Degradation check**, when the SNAPSHOT `skinMissed > 0` and the source qualifies:
    2D6 vs the snapshot, persisted at card creation, so this wound's own later missed
    treatment never counts (R2 #3, R3 #2). A loss writes `skinLoss = min(rating, snapshot
    loss + 1)`. At full loss, the check is shown as "no further loss" (R2 #5).
- **Effect:** in collection, for `dermal-plating` and `dermal-sheath` items ONLY (R3 #7),
  `body = max(0, attributeMods.body − skinLoss)`. Every other item's Body contribution
  (negatives included) is unchanged. The value is used for the totals, the tooltip sources and
  `mods.wareBody` alike. Item data isn't mutated. It applies whether or not the setting
  is on (losses are physical facts), and is recomputed every pass.
- **Repair a point:** `skinLoss − 1`. The card shows the street-doc price for that point
  (plating 2,000¥ × points lost now; sheathing 6,500¥), Biotech (5)/(4), the time and the
  Negotiation note. Payment is manual.
- **Sheathing scar:** a sheathing Missed treatment also offers **Record Minor scar**
  (p.48). It's a separate scar from the general check, and supplements it.

### 5. Scarring (R2 #7)
- **Dice** = the prepared Body.
- **TN** = boxes + the Scarring Modifiers (the dialog: treatment conditions, magical
  healing, salve; plating +3 and sheathing/skin +2 auto-ticked from identity, editable) +
  the biosystem-overstress `extraTN` from `_bodyTestOpts()`.
- **Exact TN (R3 #5):** rolled via `rollSuccessTest` with `tnPolicy: "table"` (which
  takes NONE of the ordinary modifiers: wound, sustain, drugs…) plus that one `extraTN`.
  The card shows the breakdown.
- **Roll and Apply:** the roll is posted when the GM clicks Roll. Apply adds `{ severity }` to `flags.sr2e.scars` (Terrible / Major /
  Noticeable / Minor by 0 / 1–2 / 3–4 / 5+). The resolved card blocks a second Apply.
- **Treatment (R3 #6):** the current severity is `treatedTo ?? severity`. The select
  offers what applies to the CURRENT severity: minor invasive turns Terrible into Minor,
  and minor cosmetic removes any non-Terrible scar. So Terrible → Minor → removed works.
  Hand-editable.

### 6. Sheet
A "Cyberware condition" block on the gear tab (shown with the setting on or any state set)
lists:
- damaged items (effect, repair TN, Repaired);
- plating/sheathing (missed count, loss, Repair a point);
- scars (with treatment);
- Serious/Deadly wound (manual).

A damaged item's gear row shows ⚠. The item sheet shows and edits all three fields (GM).

### 7. NPCs, tokens, permissions
- Characters only (NPC stats are printed).
- Token characters work per actor.
- GM-only buttons. The fields are owner-editable actor data, like any other.

### 8. Report-only migration: none (off by default, new).

### 9. Tests
- **Vitest:**
  - the four tables at every roll, repair TN, grade TNs;
  - the trigger thresholds;
  - scar severities;
  - the clamped Body, with plating/sheathing clamped and an unrelated negative Body
    modifier untouched;
  - scar surgery Terrible → Minor → removed;
  - degradation: missed 3, roll 2 → loss; at full loss → no further loss; the snapshot
    excludes the current wound;
  - `foldMbw` with an equal-timestamp parent and child (the regression fixture first),
    plus its existing suite unchanged.
- **Quench:**
  - a 6-box physical commit posts ONE card; Stun, 5 boxes, the setting off and an NPC
    don't; the same receipt twice posts one;
  - damage Apply → ⚠ → Repaired;
  - two successive wounds on the same unrepaired item keep both conditions;
  - one card applies both the general scar and a sheathing scar;
  - alpha resisting;
  - a plating loss lowers Body, `wareBody` and the tooltip together over repeated
    preparation, and Repair restores it;
  - a resolved card refuses a second Apply;
  - skin actions resolve independently (degradation, then a missed treatment later);
  - snapshots survive a re-render and a reload;
  - the scar TN is exactly boxes + modifiers + overstress, even with a wound and a
    sustained spell;
  - a scar Apply;
  - a hand edit on the item sheet persists;
  - a token character has its own state.

## Key decisions
- One optional setting covers the whole phase.
- **GM-editable state, not an event log:** bookkeeping the GM can always see and correct.
- Reminders, not roll changes (user ruling).
- Physical wounds only.

## Out of scope
- Automatic eye-gun self-damage (a note on the item).
- Encryption and jamming.
- Cortex bombs.
- BrightLight effects.

## Review log
- **Codex R1 (REVISE), 18 points, all accepted:**
  - a fixpoint dependency helper (also fixes Phase 4's equal-timestamp bug);
  - attempt keys;
  - admission vs structural checks;
  - the documented trust model;
  - the commit contract (type and receipt);
  - the committing client records, and the card follows the record;
  - Repost;
  - separate check/result records with terminal outcomes;
  - recorded non-loss degradation checks with frozen failure lists;
  - GM-confirmed missed treatments;
  - repairs targeting losses;
  - one clamped Body value for all consumers;
  - losses independent of the setting;
  - side-effect-free scar rolls with a stated modifier policy;
  - scar treatment chains;
  - the sheathing scar as a separate record;
  - identity coverage (cyberear, skin);
  - the corrected tests.
- **Codex R2 (REVISE), 10 points:** answered by replacing the event model with
  GM-editable state (R2's own "simpler alternative"). Attempt keys, multi-parent
  dependencies, voids and cross-client semantic conflicts no longer arise.
  - Kept from R2: #3 (the degradation snapshot excludes the current wound); #5 (losses
    clamp at the rating, with "no further loss"); #6 (per-section applicability and
    resolution); #7 (scar dice vs TN stated exactly); #9 (Phase 4 regression fixture
    first, with its void policy kept).
  - #10's concurrency tests are replaced by the resolved-card and absolute-write
    contract, whose limit is recorded.
- **Codex R3 (REVISE), 8 points, all accepted:**
  - per-item, per-action resolution;
  - snapshots persisted at card creation;
  - Apply refuses a changed snapshot, and scars carry stable ids;
  - a qualifying-source control for degradation;
  - the scar TN via `tnPolicy: "table"` + overstress;
  - current scar severity;
  - the clamp scoped to skin implants;
  - the introduction rewritten.
- **Codex R4 (REVISE), 2 points, both accepted:** scar ids are per source; conditions
  are an array, appended (two wounds keep both) and repaired one by one.
