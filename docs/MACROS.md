# SR2E macros & the macro pad

The system ships a **SR2E Macros** compendium — **twenty** macros built for driving
a session from a physical macro pad, laid out across two hotbar pages.

## Import

Compendiums → **SR2E Macros** → select all → right-click → **Import All**, then
drag each onto the hotbar. Slot order matters; see below.

## How a VIA macro pad actually reaches Foundry

VIA sends **keystrokes**. It cannot call Foundry functions. So the chain is:

```
VIA key  →  digit 1–0  →  Foundry hotbar slot  →  macro
```

Foundry binds hotbar slots 1–10 on the **current page** to the number-row digits,
with `0` firing slot 10. So configure each pad key to send a plain digit — no
modifiers needed for the first ten.

**The one gotcha: hotbar digits only fire when the CANVAS has focus.** If your
cursor is in the chat box, pressing `3` types a "3". Click the map first. That is
Foundry's behaviour, not something a macro can defend against, and it is the most
likely reason a key "does nothing".

## Framework Laptop 16 RGB Macropad (both gens)

24 keys in a 6×4 grid, QMK firmware, VIA-configurable, per-key RGB. Gen 2 is the
same hardware with a firmware fix for waking in a bag, so the mapping below is
identical on either.

Twenty-four keys means **one hotbar page wastes most of the pad**, which is why
there are twenty macros across two pages. The constraint is that every macro
fires from a *digit*, so only ten are reachable at a time — the pad needs two
keys to flip pages.

Suggested allocation of the 24:

| Keys | Purpose |
|---|---|
| **10** | digits `1`–`0` — fire whichever hotbar page is showing |
| **2** | hotbar **page prev / next** |
| **12** | native Foundry controls, or leave dark |

Bind the two page keys in **Configure Controls** (search "hotbar"). Point them at
something VIA can send and the OS will not eat — **F13–F24 are ideal**, since they
exist in HID, VIA emits them, and nothing else claims them.

The remaining twelve are yours. Things worth binding, all native Foundry rather
than macros: toggle the token layer, ruler/measure, target mode, pan to selected,
toggle fog, undo, and zoom in/out. These also need binding in Configure Controls
before a pad key can reach them.

### Per-key RGB as a legend

The RGB is genuinely useful here rather than decorative — colour by *consequence*,
so your hand learns which keys are safe:

| Colour | Meaning | Keys |
|---|---|---|
| **Green** | fire freely, idempotent | 1, 2, 3, 5, 6, 8, 19 |
| **Amber** | opens a dialog, needs a number | 4, 10, 16, 20 |
| **Blue** | toggles a state | 7, 13, 14 |
| **Red** | destructive or confirms | 9, 17, 18 |

### QMK layers instead of page keys

If you would rather not spend two keys on paging: a QMK **layer** key can make the
same ten physical keys send `1`–`0` on layer 0 and your page-next binding plus
`1`–`0` on layer 1. That is more firmware work for the same result, and it hides
which page you are on — the two-key version is easier to live with.

## The layout, and why it is in this order

Slot order is part of the design — the keys you hit constantly get the low
digits, and the ones with consequences sit further out.

| Slot | Macro | Dialog? | Notes |
|---|---|---|---|
| **1** | Next Initiative Pass | no | **The most-pressed key in SR2.** Costs the current actor 10 Initiative and jumps to the highest remaining total (p.85). |
| **2** | Refresh Dice Pools (selected) | no | Combat/Magic/Control, Spell Defense, Shielding — **and spell focus dice**, which refresh on the same schedule (p.137). |
| **3** | Refresh Pools — Everyone in Combat | no | Start-of-round sweep. Needs **no selection**, deliberately. |
| **4** | Apply Damage (selected) | **yes** | Boxes + type. Stun overflow converts to Physical automatically (p.110). |
| **5** | Recover Stun (selected) | no | Body or Willpower, whichever is higher, vs TN 2. |
| **6** | Heal Physical (selected) | no | Natural healing. Refuses Deadly wounds — those need First Aid. |
| **7** | Toggle Astral Perception | no | `none ⇄ perceiving` only. |
| **8** | Roll Initiative — All Combatants | no | Re-rolls the whole combat. |
| **9** | Clear Templates (this scene) | no | Sweeps leftover blast/spell templates. |
| **10** (`0`) | Award Karma (selected) | **yes** | Adds to spendable and lifetime Karma. |

### Page 2 — second tier

Frequent, but not every round.

| Slot | Macro | Dialog? | Notes |
|---|---|---|---|
| **11** | Reset Recoil (selected) | no | Recoil accrues within a Combat Phase (p.89). |
| **12** | Recover Dump Shock | no | Willpower vs TN 4. No-ops if unshocked. |
| **13** | Toggle Matrix Mode | no | Flips the decker between meat and Matrix. |
| **14** | Toggle Astral-Only Token | no | Acts on the **token**, not the actor — two tokens of one actor can differ. |
| **15** | Consolidate Ammo | no | Merges duplicate stacks. |
| **16** | Quick Success Test | **yes** | Dice + TN off the first selected actor. The GM workhorse. |
| **17** | End Combat | **confirms** | The only destructive key, so the only one that asks. |
| **18** | Clear All Targets | no | Targets only, never your selection. |
| **19** | Select All Player Tokens | no | Grab the party, then hit 2 / 5 / 6. |
| **20** | Award Nuyen (selected) | **yes** | Even split; tells you the remainder rather than silently dropping it. |

## Three rules every macro here follows

1. **Works from a keypress, with no click.** Each acts on the current token
   selection or the active combat — never on "the thing you just clicked",
   because a pad key cannot click anything first.
2. **Safe to press twice.** A pad invites fat-fingering. Refreshing a full pool
   is a no-op; recovering stun on someone unstunned does nothing; nothing here
   deletes without being scoped.
3. **Only two ask a question.** Damage and Karma need a number, and guessing is
   worse than a keystroke. The other eight fire immediately.

## Deliberate omissions

- **Astral *projection*** is not on a key. Projecting leaves your body behind and
  changes initiative — not something to trigger by accident. Perception toggles;
  projection stays on the sheet.
- **Award Karma does not touch the Karma Pool.** `karma.pool` is the *dice*
  resource that rerolls, buys successes and avoids glitches spend down. Session
  karma goes to `current` and `total`; putting it in the pool would hand out
  combat currency every time you paid the group.
- **No "damage the targeted token" macro.** Targeting and selection diverge
  constantly in play, and a pad key that damages the wrong actor is worse than
  no key at all.

## Customising

They are ordinary script macros — edit freely after importing. If you want them
regenerated or extended, `tools/gen-macros.mjs` is the source; it asserts that no
two macros claim the same slot.
