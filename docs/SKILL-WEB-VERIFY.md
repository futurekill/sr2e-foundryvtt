# Skill Web — circle-count verification

**STATUS: APPLIED ✅** — every count in the `Correct?` column below is now baked
into `CONFIG.SR2E.skillWeb.links` as a route graph (anchors + junctions + one-way
arrows, circles as weights). The engine is `findBestPath`/`webDefaultingTN` in
`module/rules/sr2e-rules.mjs`; `test/skill-web.test.mjs` locks all of it.

The web is now the printed **route map** (per the ChatGPT model + the p.68–69
scans), not per-skill edges — so skill→skill defaulting and the disconnections
(e.g. Quickness can't reach Computer) come out right. Verified against the 17
acceptance cases and every attribute→skill total below.

### Inferences to sanity-check (not pinned by your counts)
These weren't in your traced totals; I chose them from the scans + acceptance
tests. Flag any that look wrong:
- **Quickness does NOT reach melee.** Your melee section lists only Strength (2)
  and Body (3), so combat skills default to Strength/Body — I dropped the
  Quickness→Armed/Unarmed arrow. (The scan shows a third arrow; if it's real,
  tell me its circle count.)
- **Interrogation ↔ Negotiation = 0 circles** (they share one dot then split at a
  junction), so knowing one defaults the other at +0.
- **Intelligence academics are a star** (all 3 from Int); `biology→computer` is
  routed to 5 via a Cybertechnology→Computer-Theory internal segment. Physical
  Sciences & Demolitions are leaves (no internal skill→skill links yet).

Original working notes below (⚠ = was an inferred guess; ✓ = GM-verified).

## Quickness — combat & physical (VERIFIED)

| Skill | Defaults to | Current circles | +TN | Correct? |
|---|---|---|---|---|
| Athletics ✓ | quickness | 1 | +2 |  |
| Stealth ✓ | quickness | 2 | +4 |  |
| Firearms ✓ | quickness | 1 | +2 | 2 |
| Gunnery ✓ | quickness | 1 | +2 | 2 |
| Projectile Weapons ✓ | quickness | 2 | +4 |  |
| Throwing Weapons ✓ | quickness | 2 | +4 |  |
| Armed Combat ✓ | body | 1 | +2 |  |
| Unarmed Combat ✓ | body | 1 | +2 |  |

## Strength / Body — melee only (VERIFIED, sinks)

| Skill | Defaults to | Current circles | +TN | Correct? |
|---|---|---|---|---|
| Armed Combat ✓ | body | 1 | +2 | 3 |
| Unarmed Combat ✓ | body | 1 | +2 | 3 |
| Armed Combat ✓ | strength | 1 | +2 | 2 |
| Unarmed Combat ✓ | strength | 1 | +2 | 2 |

## Charisma — social

| Skill | Defaults to | Current circles | +TN | Correct? |
|---|---|---|---|---|
| Leadership ✓ | charisma | 2 | +4 |  |
| Interrogation ✓ | charisma | 3 | +6 |  |
| Negotiation ✓ | charisma | 3 | +6 |  |
| Etiquette | charisma | 3 | +6 |2|

## Willpower — magic & social sciences

| Skill | Defaults to | Current circles | +TN | Correct? |
|---|---|---|---|---|
| Magical Theory | willpower | 1 | +2 | 3 |
| Conjuring | willpower | 2 | +4 | 5 |
| Sorcery | willpower | 2 | +4 | 5 |
| Military Theory | willpower | 1 | +2 | 5 |
| Psychology | willpower | 2 | +4 | 3 |
| Sociology | willpower | 3 | +6 | 4 |

## Intelligence — academic & tech

| Skill | Defaults to | Current circles | +TN | Correct? |
|---|---|---|---|---|
| Physical Sciences | intelligence | 1 | +2 | 3 |
| Demolitions | intelligence | 2 | +4 | 3 |
| Computer Theory | intelligence | 2 | +4 | 3 |
| Cybertechnology ⚠ | intelligence | 3 | +6 | 3 |
| Biology ⚠ | intelligence | 4 | +8 | 3 |
| Computer ⚠ | intelligence | 3 | +6 | 4 |
| Electronics ⚠ | intelligence | 3 | +6 | 5 |
| Biotech ⚠ | intelligence | 5 | +10 | 5 |

## Reaction — vehicles

| Skill | Defaults to | Current circles | +TN | Correct? |
|---|---|---|---|---|
| Ground Vehicles (B/R) | reaction | 1 | +2 | 2 |
| Hovercraft | reaction | 2 | +4 | 2 |
| Bike | reaction | 2 | +4 | 2 |
| Car | reaction | 3 | +6 | 2 |
| Boats (B/R) | reaction | 1 | +2 | 2 |
| Motorboat | reaction | 2 | +4 | 2 |
| Sailboat | reaction | 2 | +4 | 2 |
| Aircraft (B/R) | reaction | 1 | +2 | 3 |
| Winged Aircraft | reaction | 2 | +4 | 3 |
| Rotor Aircraft | reaction | 2 | +4 | 3 |
| Vector Thrust Aircraft | reaction | 3 | +6 | 3 |

## Two one-way bridges (set these and everything downstream recomputes)

| Bridge | Meaning | Current circles | Correct? |
|---|---|---|---|
| Intelligence academic → Willpower cluster | how far magic/social-sci is from Intelligence | 1 | 3 |
| Willpower cluster → Charisma | how far the social skills are from Willpower | 1 | 4 |
