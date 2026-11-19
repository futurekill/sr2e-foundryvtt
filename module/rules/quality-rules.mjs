/**
 * Edges and Flaws with automated effects (Rigger 2 p.14–16; docs/PLAN-vehicles-phase2.md 2b.0, 2b.3).
 * Pure: no Foundry. Identity is the quality's `rule` field, then its known compendium source; never its name.
 */
export const QUALITY_RULES = ["vehicle-empathy", "simsense-vertigo", "sensitive-neural-structure", "spike-resistance",
  "computer-illiterate", "gremlins", "adrenaline-surge", "bio-rejection",
  // Creation and derived effects (Companion p.24–32; sr2e-chargen PLAN-M5d).
  "bonus-attribute-point", "exceptional-attribute", "bonus-skill-point", "bonus-force-point", "extra-contact",
  "lightning-reflexes", "will-to-live"];

const R2 = (id) => `Compendium.sr2e-rigger-2.r2-qualities.Item.${id}`;
const SC = (id) => `Compendium.sr2e-shadowrun-companion.sc-qualities.Item.${id}`;
/** Copies made before the `rule` field existed resolve through their compendium source. */
export const QUALITY_SOURCES = {
  [R2("4ddf73e8f8d0d8c2")]: "computer-illiterate",
  [R2("c4611cd92d4484df")]: "gremlins",
  [R2("9064cd10afc7fbd4")]: "sensitive-neural-structure",
  [R2("f94365525601975a")]: "simsense-vertigo",
  [R2("c6bc04745d97b6b3")]: "spike-resistance",
  [R2("baa69c515123180f")]: "vehicle-empathy",
  [SC("be38ddb6d866a9c9")]: "bio-rejection",
  [SC("e6dc6b1c2a35549a")]: "adrenaline-surge",
  [SC("8553622399551197")]: "bonus-attribute-point",
  [SC("5be6c48444d171ce")]: "exceptional-attribute",
  [SC("d3953453f746eccc")]: "bonus-skill-point",
  [SC("bc9de9a4d65635b8")]: "bonus-force-point",
  [SC("bc589f7812890335")]: "extra-contact",
  [SC("c35b0315e04b0084")]: "lightning-reflexes",
  [SC("85ba0ae1a6b8fee8")]: "will-to-live"
};

/** The quality's rule key: the explicit field, else its known source, else null. */
export const qualityRule = (rule, source = null) => rule || (source && QUALITY_SOURCES[source]) || null;

/**
 * Effective Willpower when resisting neural damage (BTLs, black IC, dump shock; p.15):
 * Sensitive Neural Structure −1 per 2 points (−2 → −1, −4 → −2), never below 1;
 * Spike Resistance +1 per 2 points. `q` = {rule: |pointValue|}.
 */
export function neuralWillpower(willpower, q = {}) {
  const w = Number(willpower) || 0;
  const sns = Math.floor((q["sensitive-neural-structure"] || 0) / 2);
  const spike = Math.floor((q["spike-resistance"] || 0) / 2);
  return Math.max(Math.min(w, 1), w - sns) + spike;
}

/**
 * Gremlins (p.15): what a 2 on 2D6 does at the Flaw's value (1–4). Returns the i18n key suffix, or null
 * when the equipment is unaffected (cyberware, bioware, magical equipment).
 */
export function gremlinsOutcome(total, value, { immune = false } = {}) {
  if (immune || total !== 2) return null;
  return `Tier${Math.min(4, Math.max(1, Math.abs(value) || 1))}`;
}

// ── Edges and Flaws at creation (Shadowrun Companion p.22–35; sr2e-chargen docs/PLAN-M5d.md) ─────────────────

/**
 * The values each Companion quality may take — the Edges/Flaws Table (p.35), read on the page render 2026-11-19.
 * `values`: the allowed values; `magicallyActive`: the values for a magically active character instead (Bio-Rejection,
 * Blind, Sensitive System); `variable`: the GM sets it (p.23: no Edge above 6, no Flaw below −6); `attribute`: Bonus
 * Attribute Point, priced by `bonusAttributeCost`.
 */
export const QUALITY_VALUES = {
  [SC("ef6b252711dd8c3c")]: { values: [-1, -2, -3, -4] },   // Addiction
  [SC("e6dc6b1c2a35549a")]: { values: [2] },   // Adrenaline Surge
  [SC("c6265f759827b148")]: { values: [-1, -2, -3, -4] },   // Allergy
  [SC("51fa1cc5019fd560")]: { values: [2] },   // Ambidexterity
  [SC("67ba58d3e1668542")]: { values: [-2, -3, -4, -5] },   // Amnesia
  [SC("0cd869063d5cffe8")]: { values: [2] },   // Animal Empathy
  [SC("cc9d282ba61a6abd")]: { values: [2] },   // Aptitude
  [SC("ba890aa4d65e100c")]: { values: [3] },   // At Ease
  [SC("c962f0fe22409ac3")]: { values: [-5] },   // Bad Karma
  [SC("f3f29ed729a1bc62")]: { values: [-1, -2, -3, -4] },   // Bad Reputation
  [SC("be38ddb6d866a9c9")]: { values: [-5], magicallyActive: [-2] },   // Bio-Rejection
  [SC("15d96916649d472f")]: { values: [2] },   // Blandness
  [SC("e62fe9478a5cd28e")]: { values: [-6], magicallyActive: [-2] },   // Blind
  [SC("8553622399551197")]: { attribute: true },   // Bonus Attribute Point
  [SC("bc9de9a4d65635b8")]: { values: [1, 2, 3] },   // Bonus Force Point
  [SC("d3953453f746eccc")]: { values: [1, 2, 3, 4, 5] },   // Bonus Skill Point
  [SC("abccd70f59301164")]: { values: [-6] },   // Borrowed Time
  [SC("b8ef5d41df88bbbb")]: { values: [1] },   // Bravery
  [SC("0f07cad52aad4335")]: { values: [2] },   // College Education
  [SC("12e78a0df5ab161e")]: { values: [-1] },   // Color Blind
  [SC("83b1d3f9c97e41cc")]: { values: [-1] },   // Combat Monster
  [SC("cd2f9429621f1d1e")]: { values: [-4] },   // Combat Paralysis
  [SC("c60b6f7e00370156")]: { values: [2] },   // Common Sense
  [SC("989cb9d4186fba9a")]: { variable: "flaw" },   // Compulsive
  [SC("2044e19fd5168233")]: { values: [-6] },   // Cortex Bomb
  [SC("050f203f229ea897")]: { values: [-2] },   // Dark Secret
  [SC("ffb89de4a8926160")]: { values: [1, 2, 3] },   // Day Job
  [SC("1b7943699a3795a9")]: { values: [-3] },   // Deaf
  [SC("06b22117907a4d28")]: { variable: "flaw" },   // Dependent
  [SC("872f9fb8a4791cdc")]: { values: [1] },   // Double-Jointed
  [SC("5be6c48444d171ce")]: { values: [2] },   // Exceptional Attribute
  [SC("bc589f7812890335")]: { values: [1, 2, 3, 4, 5, 6] },   // Extra Contact
  [SC("c6bcc3db03bea236")]: { values: [-4] },   // Flashbacks
  [SC("ba121b95ac24cce3")]: { values: [2] },   // Focused Concentration
  [SC("2776cc75d4354926")]: { values: [3] },   // Friends Abroad
  [SC("47f80e0533d29355")]: { values: [2] },   // Friends in High Places
  [SC("c377428add7b0ac1")]: { values: [1, 2] },   // Good Reputation
  [SC("a0170c796f8e50cc")]: { variable: "edge" },   // High Pain Tolerance
  [SC("a5b1826f19578ed5")]: { values: [1] },   // High School Education
  [SC("5bfa2e8acc05b939")]: { values: [2] },   // Home Ground
  [SC("eee0ace7779e4bed")]: { values: [1] },   // Human-Looking
  [SC("5bfa541d49298f62")]: { values: [-4] },   // Hung Out to Dry
  [SC("1594dbfdedb5c7ea")]: { values: [-2, -4, -6] },   // Hunted
  [SC("0cea37b8c6579a18")]: { values: [-1] },   // Illiterate
  [SC("f999393429a08eaf")]: { values: [-2] },   // Impulsive
  [SC("070265cf4575ac64")]: { values: [-2] },   // Incompetence
  [SC("4cbb6e3bcede7645")]: { values: [-1, -2, -3, -4, -5] },   // Infirm
  [SC("c35b0315e04b0084")]: { values: [2, 4, 6] },   // Lightning Reflexes
  [SC("a82deba930b4ac7e")]: { values: [-4] },   // Low Pain Tolerance
  [SC("16dcc8844c827a2f")]: { values: [1, 2, 3, 4] },   // Magic Resistance
  [SC("80025ecfcda2c4bd")]: { values: [3] },   // Magical Talent: Astral Sight
  [SC("2b1f0f6a9489cc0b")]: { values: [4] },   // Magical Talent: Combat Spells
  [SC("566edc9ef96b2f97")]: { values: [2] },   // Magical Talent: Detection Spells
  [SC("501c57b75b6f3e23")]: { values: [3] },   // Magical Talent: Health Spells
  [SC("44d912bc4685d0f2")]: { values: [3] },   // Magical Talent: Illusion Spells
  [SC("1797966aedbd667b")]: { values: [4] },   // Magical Talent: Manipulation Spells
  [SC("a4bfa90f814ae0e1")]: { values: [2] },   // Magical Talent: Poor Link
  [SC("e202246fd6322000")]: { values: [3, 5] },   // Magical Talent: Summoning
  [SC("9aea9e2dbd696133")]: { values: [-3] },   // Mysterious Cyberware/Bioware
  [SC("82ed458e32749132")]: { values: [1] },   // Natural Immunity
  [SC("def9db885d00825f")]: { values: [-2] },   // Night Blindness
  [SC("c0c831313993b694")]: { values: [1] },   // Night Vision
  [SC("c23d6fa8d432a5cb")]: { values: [-2] },   // Oblivious
  [SC("88587f29ae4e26cd")]: { values: [-2] },   // Pacifist
  [SC("2bd453a7b973a06e")]: { values: [-3] },   // Paraplegic
  [SC("f723198cdb039db9")]: { values: [2] },   // Perceptive
  [SC("a55a1fbfc3ccbabb")]: { values: [1] },   // Perfect Time
  [SC("005c8f5815fda252")]: { values: [-1, -2, -3, -4] },   // Phobia
  [SC("063d472235259253")]: { values: [3] },   // Photographic Memory
  [SC("ef8af42c79438ef6")]: { values: [-6] },   // Police Record
  [SC("75d5bba3dddf79d9")]: { values: [-6] },   // Quadriplegic
  [SC("1d50793b22bc1c54")]: { values: [2] },   // Quick Healer
  [SC("93821ee297d0cadf")]: { values: [6] },   // Registered Equipment
  [SC("4023d909c82399ed")]: { values: [1] },   // Resistance to Pathogens
  [SC("e1e07e37ed4c9e01")]: { values: [1] },   // Resistance to Toxins
  [SC("59450649b47f6d3a")]: { values: [1] },   // Sense of Direction
  [SC("d58f282451636987")]: { values: [-3], magicallyActive: [-2] },   // Sensitive System
  [SC("6e0116bc05bc2f2c")]: { values: [2, 4, 6] },   // State-of-the-Art Model
  [SC("67f599f32c01e82f")]: { values: [1] },   // Technical School Education
  [SC("f5020f4041e576de")]: { values: [-5] },   // Total Pacifist
  [SC("e6dec75ab2f46766")]: { values: [2] },   // Toughness
  [SC("538c8a0dad429914")]: { values: [-2] },   // Uncouth
  [SC("c7d74c54a0431d26")]: { values: [-1] },   // Uneducated
  [SC("c3bd7e124d756049")]: { values: [-2] },   // Vindictive
  [SC("c8f6af316f76ce31")]: { values: [-1] },   // Weak Immune System
  [SC("85ba0ae1a6b8fee8")]: { values: [1, 2, 3] },   // Will to Live
};
const CP = (id) => `Compendium.sr2e-cyberpirates.cp-qualities.Item.${id}`;
// Cyberpirates p.142–144 and Rigger 2 p.15–16, read on the page renders (2026-11-19). Natural Immunity (Cyberpirates) is
// once per drug or poison (the detail names it).
Object.assign(QUALITY_VALUES, {
  [CP("1258fa4a0e011983")]: { values: [-1] },          // Braggart
  [CP("ca097e4e850955b5")]: { values: [3, 5] },        // Connected: one-way or two-way trading
  [CP("fd79c4cdec8ca715")]: { values: [-2] },          // Liar
  [CP("c076a957272eb9b0")]: { values: [3] },           // Natural Immunity (Cyberpirates)
  [CP("fa299c77e7806f1f")]: { values: [3, 1] },        // Pirate Family: 3, or 1 at the GM's choice
  [CP("f95c736b9cf5d90f")]: { values: [-2] },          // Sea Legs
  [CP("61a6a085b6e0cec1")]: { values: [-4] },          // Sea Madness
  [CP("8ab46ae201e4ab6f")]: { values: [1, 2, 3, 4, 5, 6] },   // Water Sprite: 1 per ability improvement (p.23's limit)
  [R2("4ddf73e8f8d0d8c2")]: { values: [-3] },          // Computer Illiterate
  [R2("9064cd10afc7fbd4")]: { values: [-2, -4] },      // Sensitive Neural Structure
  [R2("f94365525601975a")]: { values: [-2] },          // Simsense Vertigo
  [R2("c6bc04745d97b6b3")]: { values: [2, 4] },        // Spike Resistance
  [R2("c4611cd92d4484df")]: { values: [-1, -2, -3, -4] },   // Gremlins
  [R2("baa69c515123180f")]: { values: [2] }            // Vehicle Empathy
});
/** Taken once per subject (the detail names it; p.23 "cannot be combined" otherwise): skill, substance, phobia… */
export const PER_SUBJECT = new Set([SC("cc9d282ba61a6abd"), SC("070265cf4575ac64"), SC("c6265f759827b148"), SC("005c8f5815fda252"),
  SC("989cb9d4186fba9a"), SC("ef6b252711dd8c3c"), SC("06b22117907a4d28"), CP("c076a957272eb9b0")]);   // Aptitude, Incompetence, Allergy, Phobia, Compulsive, Addiction, Dependent
const PER_ATTRIBUTE = new Set(["bonus-attribute-point", "exceptional-attribute"]);
const CREATION_RULES = new Set(["bonus-attribute-point", "exceptional-attribute", "bonus-skill-point", "bonus-force-point", "extra-contact", "lightning-reflexes", "will-to-live"]);

/** A magically active character (p.23 reductions): any magic type, physical adepts included. */
export const magicallyActive = (system) => (system?.magic?.type ?? "none") !== "none";

/** The values a quality may take for this character, or null when the table doesn't know it. */
export function qualityValuesFor(source, { magicallyActive: mag = false } = {}) {
  const v = QUALITY_VALUES[source];
  if (!v) return null;
  if (v.attribute) return { attribute: true };
  if (v.variable) return { variable: v.variable, values: v.variable === "edge" ? [1, 2, 3, 4, 5, 6] : [-1, -2, -3, -4, -5, -6] };
  return { values: mag && v.magicallyActive ? v.magicallyActive : v.values };
}

/**
 * Bonus Attribute Point (p.24): 1 point per +1 up to the ORIGINAL racial maximum, 2 per +1 past it (only reachable
 * with Exceptional Attribute). `natural`: the rating before the bonus (base + racial).
 */
export function bonusAttributeCost({ natural = 0, originalMax = 6, gain = 0 }) {
  let cost = 0;
  for (let i = 1; i <= gain; i++) cost += natural + i > originalMax ? 2 : 1;
  return cost;
}

const sourceOfItem = (i) => i?._stats?.compendiumSource ?? i?.flags?.core?.sourceId ?? null;
const ruleOfItem = (i) => qualityRule(i?.system?.rule, sourceOfItem(i));
/** Plain sums of the effect qualities (values are |pointValue|): what the budget and preparation add. */
export function qualityEffects(items = []) {
  const out = { skillPoints: 0, forcePoints: 0, extraContacts: 0, reaction: 0, willToLive: 0 };
  for (const i of items) {
    if (i?.type !== "quality") continue;
    const v = Math.abs(Number(i.system?.pointValue) || 0), r = ruleOfItem(i);
    if (r === "bonus-skill-point") out.skillPoints += v;
    else if (r === "bonus-force-point") out.forcePoints += 2 * v;   // 2 Force Points per point (p.32)
    else if (r === "extra-contact") out.extraContacts += v;          // one Level 1 contact per point (p.31)
    else if (r === "lightning-reflexes") out.reaction += Math.floor(v / 2);   // +1 Reaction per 2 points (p.26)
    else if (r === "will-to-live") out.willToLive += v;              // +1 Damage Overflow box per point (p.27)
  }
  return out;
}

/**
 * Every creation rule for Edges and Flaws, one list for the app and Foundry's creation panel: the balance (p.22,
 * "combined point values equal zero"), each value against the table (magically active reductions included), one copy
 * (per attribute / per subject), an attribute where one is needed, Bonus Attribute Point's price. `racial(attr)` gives
 * the natural rating before Edges and `maximum(attr)` the ORIGINAL racial maximum. Returns [{ text, page, book }].
 */
export function qualityAudit({ system = {}, items = [], natural = () => 0, maximum = () => 6 }) {
  const out = [], quals = items.filter(i => i?.type === "quality"), mag = magicallyActive(system), seen = new Set();
  const add = (text, page, book = "sc") => out.push({ text, page, book });
  let total = 0;
  for (const q of quals) {
    const sys = q.system ?? {}, src = sourceOfItem(q), r = ruleOfItem(q), v = Number(sys.pointValue) || 0, spec = qualityValuesFor(src, { magicallyActive: mag });
    total += v;
    const key = PER_ATTRIBUTE.has(r) ? `${src}:${sys.attribute}` : PER_SUBJECT.has(src) ? `${src}:${String(sys.notes ?? "").trim().toLowerCase()}` : src ?? q.name;
    if (seen.has(key)) add(`${q.name} is taken twice: Edges and Flaws don't combine (p.23).`, 23);
    seen.add(key);
    if (PER_ATTRIBUTE.has(r) && !sys.attribute) add(`${q.name}: choose the attribute.`, 24);
    // An effect belongs to its own quality: a rule set on another one (or none from the table) isn't honoured silently.
    const expected = (src && QUALITY_SOURCES[src]) || "";
    if (spec && sys.rule && sys.rule !== expected) add(`${q.name} carries another quality's rule (${sys.rule}): clear it.`, 23);
    if (!spec && CREATION_RULES.has(r)) add(`${q.name}: only the Companion's own quality has this effect (${r}).`, 23);
    if (r === "exceptional-attribute" && (Number(sys.maximumBonus) || 0) !== 1) add(`${q.name} raises the maximum by exactly 1 (p.24).`, 24);
    if (!spec) continue;   // not a Companion quality: its own book's rules
    if (spec.attribute) {
      const gain = Number(sys.attributeBonus) || 0, n = natural(sys.attribute), cost = bonusAttributeCost({ natural: n, originalMax: maximum(sys.attribute), gain });
      if (gain < 1) add(`${q.name}: choose how many points.`, 24);
      else if (v !== cost) add(`${q.name}: +${gain} costs ${cost} points here (2 per point past the racial maximum, p.24).`, 24);
    } else if (!spec.values.includes(v)) {
      const own = !String(src).includes("shadowrun-companion"), page = own ? Number(sys.citation?.page) || 0 : 35;
      add(`${q.name} is worth ${spec.values.join(", ")}${spec.variable ? " (the GM sets it)" : ""}${QUALITY_VALUES[src]?.magicallyActive ? (mag ? " for a magically active character" : " (not magically active)") : ""}, not ${v} (p.${page}).`, page, own ? sys.citation?.book : "sc");
    }
  }
  // Point-based design with the GM's option: Edges and Flaws are paid in Building Points, not balanced (p.22–23).
  const paidInBP = system?.chargen?.priorityMethod === "points" && !!system?.chargen?.qualitiesUseBP;
  if (quals.length && total !== 0 && !paidInBP) {
    const e = quals.filter(q => (Number(q.system?.pointValue) || 0) > 0).reduce((t, q) => t + Number(q.system.pointValue), 0);
    add(`Edges +${e}, Flaws ${total - e}: they must balance to 0 (p.22).`, 22);
  }
  return out;
}
