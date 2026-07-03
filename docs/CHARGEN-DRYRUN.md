# Character-Creation Dry-Run (pre-July-10)

Four archetypes built to legal SR2 priorities and traced through the **actual
derivation code** in `module/data/actor-data.mjs` (I can't drive the live sheet
from CI, so every derived number below is computed the way the code computes it
and checked against the core book with page cites). All priority spreads are a
valid A–E permutation. Formulas verified this pass:

- Reaction = ⌊(Quickness + Intelligence) / 2⌋ — p.60
- Combat Pool = ⌊(Quickness + Intelligence + Willpower) / 2⌋ — p.84
- Control Pool = Reaction, modified only by a vehicle control rig — p.84
- Hacking Pool = Computer Skill + Reaction — p.84
- Magic Pool = Sorcery Skill + active power foci (+ totem for shamans) — p.84
- Magic (attribute) = ⌊Essence⌋ — p.161
- **Astral Reaction = 2 × Intelligence** — p.147 *(was wrong; fixed this pass)*
- Condition monitors: fixed 10 boxes each — p.108

Cyberware essence/cost values are the shipped compendium numbers.

---

## 1. Street Samurai — "Rico" (Human)

**Priorities:** Attributes **A** (30) · Resources **B** (400k) · Skills **C** (24) · Magic **D** (none) · Race **E** (human)

**Attributes (30):** Body 6, Quickness 6, Strength 5, Charisma 2, Intelligence 5, Willpower 6 → Σ = 30 ✓
**Cyber:** Wired Reflexes L2 (ess 3.0, +4 Rxn, +2 init dice, ¥165k) · Smartlink (ess 0.5, ¥2.5k) · Datajack (ess 0.2, ¥1k)

| Stat | Code result | Book check |
|---|---|---|
| Reaction | ⌊(6+5)/2⌋=5, +4 Wired = **9** | p.60 + p.247 ✓ |
| Initiative | 9 + **3D6** (1 base + 2 Wired) | p.247 ✓ |
| Combat Pool | ⌊(6+5+6)/2⌋ = **8** | p.84 ✓ |
| Essence | 6.0 − 3.7 = **2.3** | p.161 ✓ |
| Condition | 10 / 10 | p.108 ✓ |
| Movement | walk 6 / run 18 | ✓ |

**Chargen panel:** Attributes 30/30 · Resources 168,500 / 400,000 (cyber only, pre-gear).

---

## 2. Full Mage — "Sable" (Human)

**Priorities:** Magic **A** (full magician) · Skills **B** (30) · Attributes **C** (20) · Resources **D** (5,000) · Race **E** (human)

**Attributes (20):** Body 3, Quickness 3, Strength 2, Charisma 3, Intelligence 4, Willpower 5 → Σ = 20 ✓
**No cyber** → Essence 6.0. **Skills (30):** Sorcery 6, Conjuring 5, Firearms 4, Etiquette 3, Stealth 4, Negotiation 3, Car 2, Computer 3 → Σ = 30 ✓
**Force Points (15):** Mana Bolt F4, Manaball F4, Heal F4, Armor F3 → Σ = 15 ✓

| Stat | Code result | Book check |
|---|---|---|
| Reaction | ⌊(3+4)/2⌋ = **3** | p.60 ✓ |
| Initiative | 3 + **1D6** | ✓ |
| Combat Pool | ⌊(3+4+5)/2⌋ = **6** | p.84 ✓ |
| Magic (attr) | ⌊6.0⌋ = **6** | p.161 ✓ |
| Magic Pool | Sorcery 6 + foci 0 = **6** | p.84 ✓ |
| **Astral Reaction** | 2 × Int 4 = **8** → astral init **23 + 1D6** | p.147 ✓ *(fixed)* |
| Condition | 10 / 10 | ✓ |

**Chargen panel:** Attributes 20/20 · Skills 30/30 · **Force Points 15/15**.

---

## 3. Decker — "Byte" (Human)

**Priorities:** Resources **A** (1,000,000) · Skills **B** (30) · Attributes **C** (20) · Magic **D** (none) · Race **E** (human)

**Attributes (20):** Body 3, Quickness 4, Strength 2, Charisma 2, Intelligence 6, Willpower 3 → Σ = 20 ✓
**Cyber:** Datajack (ess 0.2). **Cyberdeck:** MPCP 6. **Skills:** Computer 6 (+ rest of 30).

| Stat | Code result | Book check |
|---|---|---|
| Reaction | ⌊(4+6)/2⌋ = **5** | p.60 ✓ |
| Initiative (meat) | 5 + **1D6** | ✓ |
| Combat Pool | ⌊(4+6+3)/2⌋ = **6** | p.84 ✓ |
| **Hacking Pool** | Computer 6 + Reaction 5 = **11** | p.84 ✓ |
| Essence | 6 − 0.2 = **5.8** | p.161 ✓ |
| Condition | 10 / 10 | ✓ |

> Hacking Pool only appears once `cyberdeck.mpcp > 0` — confirm the deck's MPCP is set on the matrix tab.

---

## 4. Rigger — "Gearhead" (Human)

**Priorities:** Resources **A** (1,000,000) · Attributes **B** (24) · Skills **C** (24) · Magic **D** (none) · Race **E** (human)

**Attributes (24):** Body 4, Quickness 5, Strength 3, Charisma 2, Intelligence 6, Willpower 4 → Σ = 24 ✓
**Cyber:** Vehicle Control Rig L1 (ess 2.0) · Datajack (ess 0.2). **Skills:** Car 6, Gunnery 5.

| Stat | Code result | Book check |
|---|---|---|
| Reaction (not jacked) | ⌊(5+6)/2⌋ = **5** (rig adds no standing Rxn) | p.85 ✓ |
| Reaction (jacked in) | 5 + 2×1 = **7**, init **7 + 2D6** | p.85 ✓ |
| **Control Pool** | ⌊(5+6)/2⌋ + 2×1 = **7** | p.84 ✓ |
| Combat Pool | ⌊(5+6+4)/2⌋ = **7** | p.84 ✓ |
| Essence | 6 − 2.2 = **3.8** | p.161 ✓ |
| Condition | 10 / 10 | ✓ |

---

## 5. Physical Adept — "Talon" (Human)

**Priorities:** Attributes **A** (30) · Magic **B** (adept) · Skills **C** (24) · Resources **D** (5,000) · Race **E** (human)

**Attributes (30):** Body 5, Quickness 6, Strength 5, Charisma 3, Intelligence 5, Willpower 6 → Σ = 30 ✓
**No cyber** → Essence 6, Magic 6 → **Power Points = 6**. Powers: Increased Reaction ×2 (2 pts, +2 Rxn), Increased Reflexes L1 (2 pts, +1 init die), Killing Hands (M) (1 pt), Improved Ability/Firearms L1 (0.5) → **5.5 / 6 used**.

| Stat | Code result | Book check |
|---|---|---|
| Reaction | ⌊(6+5)/2⌋ = 5, +2 Increased Reaction = **7** | p.124 ✓ (Rxn only, no dice) |
| Initiative | 7 + **2D6** (1 base + 1 Increased Reflexes) | p.126 ✓ |
| Combat Pool | ⌊(6+5+6)/2⌋ = **8** | p.84 ✓ |
| Power points | **5.5 / 6 used** *(display was stuck at 0; fixed)* | p.124 ✓ |
| Magic Pool | none (adepts don't cast) | p.84 ✓ |

> Increased Reaction and Increased Reflexes are correctly modelled as **separate**
> powers in SR2 (unlike SR3's combined "Improved Reflexes"): the first adds
> Reaction only, the second adds Initiative dice only.

## 6. Shaman — "Grey Wolf" (Human)

**Priorities:** Magic **A** (full magician) · Skills **B** (30) · Attributes **C** (20) · Resources **D** (5,000) · Race **E** (human)

**Attributes (20):** Body 3, Quickness 3, Strength 2, Charisma 4, Intelligence 4, Willpower 4 → Σ = 20 ✓
Full magician, **Shamanic** tradition + totem (e.g. Wolf). Magic 6. Sorcery 6, Conjuring 5.

| Stat | Code result | Book check |
|---|---|---|
| Reaction | ⌊(3+4)/2⌋ = **3** | p.60 ✓ |
| Combat Pool | ⌊(3+4+4)/2⌋ = **5** | p.84 ✓ |
| Magic Pool | Sorcery **6** | p.84 ✓ |
| Totem modifiers | shown in the cast dialog per spell category | p.119 — see caveat |

> **Caveat (not a bug, a limitation):** the cast dialog *displays* the totem's
> per-category bonus/penalty (e.g. "Totem bonus +2 dice") but does not auto-add
> those dice to the pool — the shaman allocates them by hand. Conjuring totem
> bonuses (by domain) *are* applied automatically. Auto-applying spell totem
> dice is a good post-launch enhancement.

---

## Result

**2 bugs found & fixed** across six archetypes:
1. **Astral Reaction** was `⌊(Int+Will)/2⌋`; the book (p.147) is **2 × Intelligence**.
2. **Adept power points "used"** always displayed **0** — the spend total was
   never computed. Now sums pointCost × level against the Magic rating.

Everything else — every pool, Reaction, Initiative, Essence, condition monitor
and power/force budget across sam, mage, decker, rigger, adept and shaman —
matches the book. One documented limitation remains (shaman spell totem dice are
advisory, applied manually). Suggested live spot-checks on the 10th: build Sable
(Astral Reaction 8 while projecting) and Talon (Power Points read 5.5 / 6).
