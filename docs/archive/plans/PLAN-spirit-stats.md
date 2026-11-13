# PLAN — Spirit / elemental stat profiles (SR2 p.234–235)

Summoned spirits currently get **every attribute equal to Force**. The book gives
four distinct profiles. This corrects the stats, the attack, movement, and two
latent bugs found alongside.

## The book (Critter Statistics Table, p.234–235 — read off rendered pages)

Columns `B | Q | S | C | I | W | E | R`; `F` = Force. The `Q` column is
**Quickness × movement-multiplier**, the standard critter notation (a Sasquatch
is "3 × 4" = Quickness 3, multiplier 4) — *not* Quickness multiplied by four.

| Profile | B | Q | mult | S | C/I/W | E | R | Attack |
|---|---|---|---|---|---|---|---|---|
| **air** | F−2 | F+3 | ×4 | F−3 | F | F | F+2 | *none* — "as Powers" |
| **earth** | F+4 | F−2 | ×2 | F+4 | F | F | F−2 | (F)S Unarmed, **Reaction** dice, +1 Reach |
| **fire** | F+1 | F+2 | ×3 | F−2 | F | F | F+1 | (F)M **Ranged**, Reaction dice, range F×2 m |
| **water** | F+2 | F | ×2 | F | F | F | F−1 | (F)S **Stun** Unarmed, **Force** dice |

Essence is printed `(F)A`: Essence = Force; the `A` marks its astral nature, not
a numeric term.

**Nature spirits use the same four profiles**, by domain group:

| Group | Domains | Profile |
|---|---|---|
| Of Man | city, hearth, field | fire |
| Of the Land | desert, forest, mountain, prairie | earth |
| Of the Sky | mist, storm | air |
| Of the Waters | lake, river, sea, swamp | water |

## Design (freeze this)

### 1. `config.mjs` — profiles beside the other conjuring tables

```js
SR2E.spiritProfiles = {
  air:   { b:-2, q:+3, mult:4, s:-3, r:+2, attack:null },
  earth: { b:+4, q:-2, mult:2, s:+4, r:-2,
           attack:{ mode:"melee",  level:"S", damageType:"physical", dice:"reaction", reach:1 } },
  fire:  { b:+1, q:+2, mult:3, s:-2, r:+1,
           attack:{ mode:"ranged", level:"M", damageType:"physical", dice:"reaction", rangeMult:2 } },
  water: { b:+2, q:0,  mult:2, s:0,  r:-1,
           attack:{ mode:"melee",  level:"S", damageType:"stun",     dice:"force" } }
};
SR2E.spiritDomainProfile = {           // nature-spirit domain → profile
  city:"fire", hearth:"fire", field:"fire",
  desert:"earth", forest:"earth", mountain:"earth", prairie:"earth",
  mist:"air", storm:"air",
  lake:"water", river:"water", sea:"water", swamp:"water"
};
```

**On `wind`:** p.235's *Of the Sky* domains are Mist and Storm; this system ships
`wind` instead. **Keep `wind` and map it to the air profile.** Renaming it would
also require new localisation keys, new `spiritPortraitVariants` entries and
three new portrait images per domain, plus a migration of saved actors — real
churn for a cosmetic naming difference that changes no stat, since all three are
the same air profile. `mist` and `storm` are added to the profile map so a
hand-set domain resolves, but `wind` stays the shipped umbrella. Note this
divergence in the config comment.

### 2. `sr2e-rules.mjs` — one pure, tested resolver

```js
export function spiritProfileKey(domain)   // → "air"|"earth"|"fire"|"water"
export function spiritAttributes(profile, force)               // → {body,quickness,strength,charisma,intelligence,willpower,reaction,essence,moveMult}
```

**Both spirit kinds store their element/domain in the same `domain` field** —
elementals use `fire|water|air|earth`, nature spirits use their domain key — so
the resolver takes only `domain`.

Floor every derived value at **1**, not 0 — including **Reaction**. A Force-1
Air elemental computes B −1 / S −2, a Force-1 Earth computes R −1, and a Force-1
Water computes R 0; a 0-or-less attribute breaks dice pools, and a 0 Reaction
breaks initiative and the movement limiter. The book does not address sub-1
results; this floor is the system's, and is documented as such.

### 3. `SpiritData.prepareDerivedData`

Resolve the profile once, then set each `<attr>.base` from it and
`.value = max(1, base + mod)`. Then:

- `reaction.base` from the profile; `reaction.value = base + mod`
- **`initiative.base = reaction.value` AND `initiative.value = reaction.value + initiative.mod`**,
  not Force. The roll path already uses `reaction.value`, so today the stored
  initiative can disagree with what actually gets rolled.
- `essence = force`
- `moveMult` exposed for the movement limiter
- **`conditionMonitor.physical.max = 10`, `stun.max = 10`** — drop `force * 2`.
  It has no citation, and it fights the hard-coded 1/3/6/10 wound thresholds:
  below Force 5 a spirit can never reach Deadly; above Force 5 it has boxes past
  it.

### 4. Add the missing `conditionMonitor.overflow` field

Each monitor already has its own nested `overflow` (see
`SR2EDataModel.conditionMonitorField`). What is missing is the **parent**
`conditionMonitor.overflow` that `applyDamage` reads and writes — Character and
NPC declare it, Spirit/Vehicle/IC/Host do not, so overflow damage on a spirit
computes `undefined + n`. Add the parent field to **SpiritData**; Vehicle, IC and
Host have the same hole and are out of scope here.

### 5. `rollSpiritAttack` — drive it from the profile

- **air**: no generic attack. Say so and point at its Powers rather than rolling.
- dice = Reaction (earth/fire) or Force (water), per profile
- damage `(F)<level>`, `damageType` from the profile (water is **Stun**)
- fire is **ranged**, range = Force × 2 m — state it on the card
- earth carries **+1 Reach**
- keep the existing Resist button, passing the correct `data-damage-type`

### 6. Movement limiter

`tokenRates` uses `runMultiplierForRace(actor.system.race)`, and a spirit has no
`race`, so it silently gets human ×3. Make it prefer `system.moveMult` when the
actor supplies one, falling back to the race table. Fire is coincidentally ×3
today; air, earth and water are all wrong.

## Proof

`npm test` (469 today) must stay green, plus new tests that:
- pin all four profiles' B/Q/S/R at a stated Force, citing p.234–235;
- assert nature-spirit domains map to the right profile (all 13);
- assert the Force-1 floor;
- assert initiative derives from adjusted Reaction, not Force;
- assert condition monitors are 10/10.

Report a table of each profile at Force 4 and Force 6.

## Out of scope

Great Form spirits, spirit Powers as mechanics (they stay descriptive), the
missing `overflow` on Vehicle/IC/Host, and any change to Conjuring itself.
