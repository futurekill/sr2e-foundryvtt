/**
 * Shadowrun 2nd Edition system configuration constants.
 * All game-mechanical values from the SR2e core rulebook (FASA 7901).
 */
export const SR2E = {};

SR2E.systemId = "sr2e";
SR2E.systemName = "Shadowrun 2nd Edition";

// ---------------------------------------------------------------------------
// ATTRIBUTES
// ---------------------------------------------------------------------------
SR2E.attributes = {
  body: "SR2E.Attributes.Body",
  quickness: "SR2E.Attributes.Quickness",
  strength: "SR2E.Attributes.Strength",
  charisma: "SR2E.Attributes.Charisma",
  intelligence: "SR2E.Attributes.Intelligence",
  willpower: "SR2E.Attributes.Willpower"
};

SR2E.specialAttributes = {
  essence: "SR2E.Attributes.Essence",
  magic: "SR2E.Attributes.Magic",
  reaction: "SR2E.Attributes.Reaction"
};

// ---------------------------------------------------------------------------
// RACES & RACIAL MODIFIERS
// ---------------------------------------------------------------------------
SR2E.races = {
  human: "SR2E.Races.Human",
  dwarf: "SR2E.Races.Dwarf",
  elf: "SR2E.Races.Elf",
  ork: "SR2E.Races.Ork",
  troll: "SR2E.Races.Troll"
};

SR2E.racialModifiers = {
  human:  { body: 0, quickness: 0, strength: 0, charisma: 0, intelligence: 0, willpower: 0 },
  dwarf:  { body: 1, quickness: -1, strength: 2, charisma: 0, intelligence: 0, willpower: 1 },
  elf:    { body: 0, quickness: 1, strength: 0, charisma: 2, intelligence: 0, willpower: 0 },
  ork:    { body: 3, quickness: 0, strength: 2, charisma: -1, intelligence: -1, willpower: 0 },
  troll:  { body: 5, quickness: -1, strength: 4, charisma: -2, intelligence: -2, willpower: -1 }
};

SR2E.racialMaximums = {
  human:  { body: 6, quickness: 6, strength: 6, charisma: 6, intelligence: 6, willpower: 6, essence: 6, magic: 6, reaction: 6 },
  dwarf:  { body: 7, quickness: 5, strength: 8, charisma: 6, intelligence: 6, willpower: 7, essence: 6, magic: 6, reaction: 5 },
  elf:    { body: 6, quickness: 7, strength: 6, charisma: 8, intelligence: 6, willpower: 6, essence: 6, magic: 6, reaction: 6 },
  ork:    { body: 9, quickness: 6, strength: 8, charisma: 5, intelligence: 5, willpower: 6, essence: 6, magic: 6, reaction: 5 },
  troll:  { body: 11, quickness: 5, strength: 10, charisma: 4, intelligence: 4, willpower: 5, essence: 6, magic: 6, reaction: 4 }
};

SR2E.racialAbilities = {
  human:  [],
  dwarf:  ["thermographic_vision", "disease_resistance"],
  elf:    ["low_light_vision"],
  ork:    ["low_light_vision"],
  troll:  ["thermographic_vision", "dermal_armor", "reach_1"]
};

// ---------------------------------------------------------------------------
// CHARACTER CREATION PRIORITY TABLE
// ---------------------------------------------------------------------------
SR2E.priorities = {
  A: { attributes: 30, skills: 40, resources: 1000000, forcePoints: 50, magic: "full_magician", race: "metahuman" },
  B: { attributes: 24, skills: 30, resources: 400000,  forcePoints: 35, magic: "adept_or_meta_magician", race: "human" },
  C: { attributes: 20, skills: 24, resources: 90000,   forcePoints: 25, magic: "meta_adept", race: "human" },
  D: { attributes: 17, skills: 20, resources: 5000,    forcePoints: 15, magic: "none", race: "human" },
  E: { attributes: 15, skills: 17, resources: 500,     forcePoints: 5,  magic: "none", race: "human" }
};

// ---------------------------------------------------------------------------
// CONDITION MONITOR
// ---------------------------------------------------------------------------
SR2E.conditionLevels = {
  L: { label: "SR2E.Condition.Light",    modifier: 1 },
  M: { label: "SR2E.Condition.Moderate", modifier: 2 },
  S: { label: "SR2E.Condition.Serious",  modifier: 3 },
  D: { label: "SR2E.Condition.Deadly",   modifier: 4 }
};

// Damage staging: L -> M -> S -> D -> Overflow/Dead
SR2E.damageStages = ["L", "M", "S", "D"];

// Ranged-attack target-number modifiers by range bracket (SR2E p.91).
SR2E.rangeTnMods = { short: 0, medium: 2, long: 4, extreme: 6 };

// Each condition level = 3 boxes by default (10 boxes total for standard monitor)
SR2E.conditionBoxesPerLevel = 3;

// ---------------------------------------------------------------------------
// DAMAGE TYPES
// ---------------------------------------------------------------------------
SR2E.damageTypes = {
  physical: "SR2E.Damage.Physical",
  stun: "SR2E.Damage.Stun"
};

// ---------------------------------------------------------------------------
// SKILL CATEGORIES
// ---------------------------------------------------------------------------
SR2E.skillCategories = {
  active:       "SR2E.Skills.Active",
  build_repair: "SR2E.Skills.BuildRepair",
  knowledge:    "SR2E.Skills.Knowledge",
  language:     "SR2E.Skills.Language",
  special:      "SR2E.Skills.Special"
};

// Untrained skill defaulting (SR2E p.69, The Skill Web): each circle traced
// on the web adds +2 TN. Flat fallback used for any skill not in the web graph
// below (and while the web data is being verified).
SR2E.defaultingPenalty = 4;

// THE SKILL WEB (SR2E p.69) — directed graph consumed by webDefaultingTN().
// Nodes are attributes/skills (B/R skills carry `parentSkill`); `skillKey` maps
// a node to the rollable activeSkills key where one exists (so the roll layer
// can look a skill up by its system key). Edges are directed with `cost` = the
// TN each hop adds — one circle = 2 (SR2E p.69: +2 per circle). The engine finds
// the cheapest legal path attribute→skill (attribute defaulting) or skill→skill
// (related-skill defaulting). Costs verified against a photo of p.69 with the
// GM. ⚠ Not yet wired into rolls — the flat +4 above still applies until the
// remaining clusters are confirmed.
SR2E.skillWeb = {
  nodes: {
    // Attributes
    quickness: { label: "Quickness", type: "attribute" },
    strength: { label: "Strength", type: "attribute" },
    body: { label: "Body", type: "attribute" },
    intelligence: { label: "Intelligence", type: "attribute" },
    charisma: { label: "Charisma", type: "attribute" },
    reaction: { label: "Reaction", type: "attribute" },
    willpower: { label: "Willpower", type: "attribute" },
    // Quickness skills
    athletics: { label: "Athletics", type: "skill" },
    stealth: { label: "Stealth", type: "skill", skillKey: "stealth" },
    firearms: { label: "Firearms", type: "skill", skillKey: "firearms" },
    firearmsBR: { label: "Firearms (B/R)", type: "skill", parentSkill: "firearms" },
    gunnery: { label: "Gunnery", type: "skill", skillKey: "gunnery" },
    gunneryBR: { label: "Gunnery (B/R)", type: "skill", parentSkill: "gunnery" },
    projectile: { label: "Projectile Weapons", type: "skill", skillKey: "projectile_weapons" },
    projectileBR: { label: "Projectile Weapons (B/R)", type: "skill", parentSkill: "projectile" },
    throwing: { label: "Throwing Weapons", type: "skill", skillKey: "throwing_weapons" },
    throwingBR: { label: "Throwing Weapons (B/R)", type: "skill", parentSkill: "throwing" },
    armedCombat: { label: "Armed Combat", type: "skill", skillKey: "armed_combat" },
    armedCombatBR: { label: "Armed Combat (B/R)", type: "skill", parentSkill: "armedCombat" },
    unarmedCombat: { label: "Unarmed Combat", type: "skill", skillKey: "unarmed_combat" },
    // Tech skills
    computer: { label: "Computer", type: "skill", skillKey: "computer" },
    computerBR: { label: "Computer (B/R)", type: "skill", parentSkill: "computer" },
    electronics: { label: "Electronics", type: "skill", skillKey: "electronics" },
    electronicsBR: { label: "Electronics (B/R)", type: "skill", parentSkill: "electronics" },
    biotech: { label: "Biotech", type: "skill", skillKey: "biotech" },
    biotechBR: { label: "Biotech (B/R)", type: "skill", parentSkill: "biotech" },
    // Social skills
    leadership: { label: "Leadership", type: "skill", skillKey: "leadership" },
    interrogation: { label: "Interrogation", type: "skill" },
    negotiation: { label: "Negotiation", type: "skill", skillKey: "negotiation" },
    etiquette: { label: "Etiquette", type: "skill", skillKey: "etiquette" },
    // Vehicle skills
    groundVehicles: { label: "Ground Vehicles", type: "skill" },
    groundVehiclesBR: { label: "Ground Vehicles (B/R)", type: "skill", parentSkill: "groundVehicles" },
    hovercraft: { label: "Hovercraft", type: "skill" },
    bike: { label: "Bike", type: "skill", skillKey: "bike" },
    car: { label: "Car", type: "skill", skillKey: "car" },
    boats: { label: "Boats", type: "skill" },
    boatsBR: { label: "Boats (B/R)", type: "skill", parentSkill: "boats" },
    motorboat: { label: "Motorboat", type: "skill" },
    sailboat: { label: "Sailboat", type: "skill" },
    aircraft: { label: "Aircraft", type: "skill", skillKey: "pilot" },
    aircraftBR: { label: "Aircraft (B/R)", type: "skill", parentSkill: "aircraft" },
    winged: { label: "Winged Aircraft", type: "skill" },
    rotor: { label: "Rotor Aircraft", type: "skill" },
    vectorThrust: { label: "Vector Thrust Aircraft", type: "skill" },
    // Knowledge / academic skills
    demolitions: { label: "Demolitions", type: "skill", skillKey: "demolitions" },
    physicalSciences: { label: "Physical Sciences", type: "skill" },
    computerTheory: { label: "Computer Theory", type: "skill" },
    cybertechnology: { label: "Cybertechnology", type: "skill" },
    biology: { label: "Biology", type: "skill" },
    militaryTheory: { label: "Military Theory", type: "skill" },
    psychology: { label: "Psychology", type: "skill" },
    sociology: { label: "Sociology", type: "skill" },
    magicalTheory: { label: "Magical Theory", type: "skill" },
    conjuring: { label: "Conjuring", type: "skill", skillKey: "conjuring" },
    sorcery: { label: "Sorcery", type: "skill", skillKey: "sorcery" },
  },
  // Directed edges. cost = TN this hop adds (1 circle = 2). ⚠ Quickness cluster
  // GM-verified; Projectile/Throwing are 2 circles (cost 4); other clusters are
  // 1-circle placeholders pending the same verification pass.
  edges: [
    // Quickness
    { from: "quickness", to: "athletics", cost: 2 },
    { from: "athletics", to: "stealth", cost: 2 },              // Stealth = 2 circles from Quickness
    { from: "quickness", to: "firearms", cost: 2 },
    { from: "firearms", to: "firearmsBR", cost: 2 },
    { from: "quickness", to: "gunnery", cost: 2 },
    { from: "gunnery", to: "gunneryBR", cost: 2 },
    { from: "quickness", to: "projectile", cost: 4 },           // 2 circles (GM correction)
    { from: "projectile", to: "projectileBR", cost: 2 },
    { from: "quickness", to: "throwing", cost: 4 },             // 2 circles (GM correction)
    { from: "throwing", to: "throwingBR", cost: 2 },
    { from: "quickness", to: "armedCombat", cost: 2 },
    { from: "armedCombat", to: "armedCombatBR", cost: 2 },
    { from: "quickness", to: "unarmedCombat", cost: 2 },
    // Strength / Body → melee (Strength & Body reach Armed & Unarmed Combat)
    { from: "strength", to: "armedCombat", cost: 2 },
    { from: "strength", to: "unarmedCombat", cost: 2 },
    { from: "body", to: "armedCombat", cost: 2 },
    { from: "body", to: "unarmedCombat", cost: 2 },
    // Tech (Body-linked on the web)
    { from: "body", to: "computer", cost: 2 },
    { from: "computer", to: "computerBR", cost: 2 },
    { from: "body", to: "electronics", cost: 2 },
    { from: "electronics", to: "electronicsBR", cost: 2 },
    { from: "body", to: "biotech", cost: 2 },
    { from: "biotech", to: "biotechBR", cost: 2 },
    { from: "computer", to: "computerTheory", cost: 2 },
    { from: "electronics", to: "computerTheory", cost: 2 },
    { from: "biotech", to: "biology", cost: 2 },
    // Social
    { from: "charisma", to: "leadership", cost: 2 },
    { from: "leadership", to: "interrogation", cost: 2 },
    { from: "interrogation", to: "negotiation", cost: 2 },
    { from: "leadership", to: "etiquette", cost: 2 },
    // Vehicles
    { from: "reaction", to: "groundVehicles", cost: 2 },
    { from: "groundVehicles", to: "groundVehiclesBR", cost: 2 },
    { from: "groundVehicles", to: "hovercraft", cost: 2 },
    { from: "groundVehicles", to: "bike", cost: 2 },
    { from: "bike", to: "car", cost: 2 },
    { from: "reaction", to: "boats", cost: 2 },
    { from: "boats", to: "boatsBR", cost: 2 },
    { from: "boats", to: "motorboat", cost: 2 },
    { from: "boats", to: "sailboat", cost: 2 },
    { from: "reaction", to: "aircraft", cost: 2 },
    { from: "aircraft", to: "aircraftBR", cost: 2 },
    { from: "aircraft", to: "winged", cost: 2 },
    { from: "aircraft", to: "rotor", cost: 2 },
    { from: "rotor", to: "vectorThrust", cost: 2 },
    // Intelligence academic
    { from: "intelligence", to: "physicalSciences", cost: 2 },
    { from: "physicalSciences", to: "demolitions", cost: 2 },
    { from: "physicalSciences", to: "computerTheory", cost: 2 },
    { from: "computerTheory", to: "cybertechnology", cost: 2 },
    { from: "cybertechnology", to: "biology", cost: 2 },
    { from: "intelligence", to: "militaryTheory", cost: 2 },
    { from: "militaryTheory", to: "psychology", cost: 2 },
    { from: "psychology", to: "sociology", cost: 2 },
    // Magic
    { from: "willpower", to: "magicalTheory", cost: 2 },
    { from: "magicalTheory", to: "conjuring", cost: 2 },
    { from: "magicalTheory", to: "sorcery", cost: 2 },
  ]
};

// Active skill linked attributes
SR2E.activeSkills = {
  armed_combat:     { label: "SR2E.Skills.ArmedCombat",     attribute: "strength",     category: "active" },
  bike:             { label: "SR2E.Skills.Bike",            attribute: "reaction",     category: "active" },
  biotech:          { label: "SR2E.Skills.Biotech",         attribute: "intelligence", category: "active" },
  car:              { label: "SR2E.Skills.Car",             attribute: "reaction",     category: "active" },
  computer:         { label: "SR2E.Skills.Computer",        attribute: "intelligence", category: "active" },
  conjuring:        { label: "SR2E.Skills.Conjuring",       attribute: "willpower",    category: "active", magical: true },
  demolitions:      { label: "SR2E.Skills.Demolitions",     attribute: "intelligence", category: "active" },
  electronics:      { label: "SR2E.Skills.Electronics",     attribute: "intelligence", category: "active" },
  etiquette:        { label: "SR2E.Skills.Etiquette",       attribute: "charisma",     category: "active" },
  firearms:         { label: "SR2E.Skills.Firearms",        attribute: "quickness",    category: "active" },
  gunnery:          { label: "SR2E.Skills.Gunnery",         attribute: "intelligence", category: "active" },
  launch_weapons:   { label: "SR2E.Skills.LaunchWeapons",   attribute: "quickness",    category: "active" },
  leadership:       { label: "SR2E.Skills.Leadership",      attribute: "charisma",     category: "active" },
  negotiation:      { label: "SR2E.Skills.Negotiation",     attribute: "charisma",     category: "active" },
  pilot:            { label: "SR2E.Skills.Pilot",           attribute: "reaction",     category: "active" },
  projectile_weapons: { label: "SR2E.Skills.ProjectileWeapons", attribute: "strength" , category: "active" },
  sorcery:          { label: "SR2E.Skills.Sorcery",         attribute: "willpower",    category: "active", magical: true },
  stealth:          { label: "SR2E.Skills.Stealth",         attribute: "quickness",    category: "active" },
  throwing_weapons: { label: "SR2E.Skills.ThrowingWeapons", attribute: "strength",     category: "active" },
  unarmed_combat:   { label: "SR2E.Skills.UnarmedCombat",   attribute: "strength",     category: "active" }
};

// ---------------------------------------------------------------------------
// MAGIC TRADITIONS
// ---------------------------------------------------------------------------
SR2E.magicTraditions = {
  none: "SR2E.Magic.None",
  hermetic: "SR2E.Magic.Hermetic",
  shamanic: "SR2E.Magic.Shamanic"
};

SR2E.magicTypes = {
  none: "SR2E.Magic.TypeNone",
  full_magician: "SR2E.Magic.FullMagician",
  physical_adept: "SR2E.Magic.PhysicalAdept",
  shamanic_adept: "SR2E.Magic.ShamanicAdept",
  magical_adept: "SR2E.Magic.MagicalAdept"
};

// ---------------------------------------------------------------------------
// TOTEMS (Shamanic)
// spellBonus:   extra Magic Pool dice when casting spells of that category
// spellPenalty: lost Magic Pool dice when casting spells of that category
// conjuringBonus: extra dice when conjuring spirits of that domain type
// Special per-totem behaviours (berserk, time-of-day, etc.) are narrative/GM
// ---------------------------------------------------------------------------
SR2E.totems = {
  // Bear: +2 health spells; +2 forest spirits (SR2E p.122)
  bear:    { label: "SR2E.Totems.Bear",    environment: "forest",
             spellBonus: { health: 2 },
             spellPenalty: {},
             conjuringBonus: { forest: 2 } },

  // Cat: +2 illusion spells; +2 city spirits (SR2E p.122)
  cat:     { label: "SR2E.Totems.Cat",     environment: "urban",
             spellBonus: { illusion: 2 },
             spellPenalty: {},
             conjuringBonus: { city: 2 } },

  // Coyote: no modifiers (SR2E p.122)
  coyote:  { label: "SR2E.Totems.Coyote", environment: "any",
             spellBonus: {},
             spellPenalty: {},
             conjuringBonus: {} },

  // Dog: +2 detection spells; +2 field and hearth spirits (SR2E p.122)
  dog:     { label: "SR2E.Totems.Dog",     environment: "urban",
             spellBonus: { detection: 2 },
             spellPenalty: {},
             conjuringBonus: { field: 2, hearth: 2 } },

  // Eagle: +2 detection spells; +2 wind spirits (SR2E p.122)
  eagle:   { label: "SR2E.Totems.Eagle",   environment: "any",
             spellBonus: { detection: 2 },
             spellPenalty: {},
             conjuringBonus: { wind: 2 } },

  // Gator: +2 combat & detection; -1 illusion; +2 swamp/city spirits (SR2E p.123)
  gator:   { label: "SR2E.Totems.Gator",   environment: "swamp",
             spellBonus: { combat: 2, detection: 2 },
             spellPenalty: { illusion: 1 },
             conjuringBonus: { swamp: 2, city: 2 } },

  // Lion: +2 combat; -1 health; +2 prairie spirits (SR2E p.123)
  lion:    { label: "SR2E.Totems.Lion",    environment: "prairie",
             spellBonus: { combat: 2 },
             spellPenalty: { health: 1 },
             conjuringBonus: { prairie: 2 } },

  // Mouse: not described in core book — no mechanical modifiers
  mouse:   { label: "SR2E.Totems.Mouse",   environment: "urban",
             spellBonus: {},
             spellPenalty: {},
             conjuringBonus: {} },

  // Owl: +2 any sorcery/conjuring at night; +2 TN to ALL tests in daylight
  // Night bonus is handled as a generic +2 at cast time (GM adjudicates time-of-day)
  owl:     { label: "SR2E.Totems.Owl",     environment: "forest",
             spellBonus: {},
             spellPenalty: {},
             conjuringBonus: {} },

  // Raccoon: +2 manipulation; -1 combat; +2 city spirits (SR2E p.123)
  raccoon: { label: "SR2E.Totems.Raccoon", environment: "urban",
             spellBonus: { manipulation: 2 },
             spellPenalty: { combat: 1 },
             conjuringBonus: { city: 2 } },

  // Rat: +2 detection & illusion; -1 combat; +2 Spirits of Man (SR2E p.123)
  rat:     { label: "SR2E.Totems.Rat",     environment: "urban",
             spellBonus: { detection: 2, illusion: 2 },
             spellPenalty: { combat: 1 },
             conjuringBonus: { spirits_of_man: 2 } },

  // Raven: +2 manipulation; -1 combat; +2 wind spirits (SR2E p.124)
  raven:   { label: "SR2E.Totems.Raven",   environment: "any",
             spellBonus: { manipulation: 2 },
             spellPenalty: { combat: 1 },
             conjuringBonus: { wind: 2 } },

  // Shark: +2 combat & detection; +2 sea spirits (SR2E p.124)
  shark:   { label: "SR2E.Totems.Shark",   environment: "ocean",
             spellBonus: { combat: 2, detection: 2 },
             spellPenalty: {},
             conjuringBonus: { sea: 2 } },

  // Snake: +2 health, illusion, detection; -1 combat spells DURING combat
  // The in-combat penalty is narrative; the bonuses are always on (SR2E p.124)
  snake:   { label: "SR2E.Totems.Snake",   environment: "any",
             spellBonus: { health: 2, illusion: 2, detection: 2 },
             spellPenalty: {},
             conjuringBonus: {} },

  // Wolf: +2 detection & combat; +2 forest or prairie spirits (SR2E p.124)
  wolf:    { label: "SR2E.Totems.Wolf",    environment: "forest",
             spellBonus: { detection: 2, combat: 2 },
             spellPenalty: {},
             conjuringBonus: { forest: 2, prairie: 2 } }
};

// ---------------------------------------------------------------------------
// SPELL CATEGORIES
// ---------------------------------------------------------------------------
SR2E.spellCategories = {
  combat: "SR2E.Spells.Combat",
  detection: "SR2E.Spells.Detection",
  health: "SR2E.Spells.Health",
  illusion: "SR2E.Spells.Illusion",
  manipulation: "SR2E.Spells.Manipulation"
};

SR2E.spellTypes = {
  physical: "SR2E.Spells.Physical",
  mana: "SR2E.Spells.Mana"
};

SR2E.spellRanges = {
  touch: "SR2E.Spells.Touch",
  los: "SR2E.Spells.LOS",
  self: "SR2E.Spells.Self",
  area: "SR2E.Spells.Area"
};

SR2E.spellDurations = {
  instant: "SR2E.Spells.Instant",
  sustained: "SR2E.Spells.Sustained",
  permanent: "SR2E.Spells.Permanent"
};

SR2E.drainCodes = {
  L: "SR2E.Drain.Light",
  M: "SR2E.Drain.Moderate",
  S: "SR2E.Drain.Serious",
  D: "SR2E.Drain.Deadly"
};

// ---------------------------------------------------------------------------
// HEALING (SR2E p.112–115)
// ---------------------------------------------------------------------------

// Box floor each wound level drops to when one level is healed.
// (Light=1, Moderate=3, Serious=6, Deadly=10 boxes total.)
SR2E.healLevelFloor = { Deadly: 6, Serious: 3, Moderate: 1, Light: 0, Undamaged: 0 };

// Physical natural healing — Body Test target number by wound level (Wound
// Table, p.112). Deadly always requires medical attention.
SR2E.naturalHealTN = { Light: 2, Moderate: 4, Serious: 6, Deadly: 6 };

// First Aid — Biotech Test target number by current wound level (First Aid
// Table, p.115).
SR2E.firstAidTN = { Light: 4, Moderate: 6, Serious: 8, Deadly: 10 };

// Heal-time per level (Healing Table, p.113) — for the chat note only.
SR2E.healTime = {
  Deadly:   "30 days base (min 3 days), Hospitalized lifestyle",
  Serious:  "20 days base (min 2 days), High lifestyle",
  Moderate: "10 days base (min 1 day), Middle lifestyle",
  Light:    "24 hours base (min 12 hours), Low lifestyle"
};

// ---------------------------------------------------------------------------
// CONJURING (SR2E p.138–140)
// ---------------------------------------------------------------------------

// Nature spirit domains — a shaman may only summon a spirit in its domain.
SR2E.spiritDomains = {
  city:    "SR2E.Spirits.City",
  field:   "SR2E.Spirits.Field",
  forest:  "SR2E.Spirits.Forest",
  hearth:  "SR2E.Spirits.Hearth",
  lake:    "SR2E.Spirits.Lake",
  mountain:"SR2E.Spirits.Mountain",
  prairie: "SR2E.Spirits.Prairie",
  river:   "SR2E.Spirits.River",
  sea:     "SR2E.Spirits.Sea",
  desert:  "SR2E.Spirits.Desert",
  swamp:   "SR2E.Spirits.Swamp",
  wind:    "SR2E.Spirits.Wind"
};

// Elemental types — a mage summons elementals of the four classical elements.
// Each aids one spell category for Aid Sorcery (SR2E p.140).
SR2E.elementalTypes = {
  fire:  { label: "SR2E.Spirits.Fire",  aids: "combat" },
  water: { label: "SR2E.Spirits.Water", aids: "illusion" },
  air:   { label: "SR2E.Spirits.Air",   aids: "detection" },
  earth: { label: "SR2E.Spirits.Earth", aids: "manipulation" }
};

/**
 * Conjuring Drain (SR2E p.139): drain level scales with the spirit's Force
 * relative to the conjurer's Charisma. Stun until Force exceeds Charisma,
 * then Physical.
 * @param {number} force    Spirit Force Rating (also the test TN).
 * @param {number} charisma Conjurer's Charisma.
 * @returns {{ level: "L"|"M"|"S"|"D", type: "stun"|"physical" }}
 */
SR2E.conjuringDrain = (force, charisma) => {
  if (force > 2 * charisma)  return { level: "D", type: "physical" };
  if (force > charisma)      return { level: "S", type: "physical" };
  // "Less than half Charisma" is Light; at or above half (up to Charisma) is
  // Moderate. Half is strict, so Force == half Charisma is Moderate.
  if (force >= charisma / 2) return { level: "M", type: "stun" };
  return { level: "L", type: "stun" };
};

// Standard spirit powers offered on the spirit sheet. Most resolve narratively;
// the system tracks service expenditure and posts a descriptive card.
// (Full descriptions: Critters / Powers of the Awakened, SR2E p.214+.)
SR2E.spiritPowers = {
  accident:      "SR2E.Powers.Accident",
  concealment:   "SR2E.Powers.Concealment",
  confusion:     "SR2E.Powers.Confusion",
  engulf:        "SR2E.Powers.Engulf",
  fear:          "SR2E.Powers.Fear",
  guard:         "SR2E.Powers.Guard",
  manifestation: "SR2E.Powers.Manifestation",
  movement:      "SR2E.Powers.Movement",
  noxiousBreath: "SR2E.Powers.NoxiousBreath",
  psychokinesis: "SR2E.Powers.Psychokinesis",
  search:        "SR2E.Powers.Search",
  aidSorcery:    "SR2E.Powers.AidSorcery",
  aidStudy:      "SR2E.Powers.AidStudy",
  spellSustaining:"SR2E.Powers.SpellSustaining"
};

// ---------------------------------------------------------------------------
// WEAPON CATEGORIES
// ---------------------------------------------------------------------------
SR2E.weaponTypes = {
  melee: "SR2E.Weapons.Melee",
  projectile: "SR2E.Weapons.Projectile",
  throwing: "SR2E.Weapons.Throwing",
  firearm: "SR2E.Weapons.Firearm",
  heavy: "SR2E.Weapons.Heavy",
  grenade: "SR2E.Weapons.Grenade"
};

SR2E.firearmModes = {
  SS: "SR2E.Weapons.SingleShot",
  SA: "SR2E.Weapons.SemiAutomatic",
  BF: "SR2E.Weapons.BurstFire",
  FA: "SR2E.Weapons.FullAuto"
};

// ---------------------------------------------------------------------------
// ARMOR
// ---------------------------------------------------------------------------
SR2E.armorTypes = {
  ballistic: "SR2E.Armor.Ballistic",
  impact: "SR2E.Armor.Impact"
};

// ---------------------------------------------------------------------------
// CYBERWARE
// ---------------------------------------------------------------------------
SR2E.cyberwareGrades = {
  standard: { label: "SR2E.Cyberware.Standard", essenceMultiplier: 1.0, costMultiplier: 1.0 },
  alpha:    { label: "SR2E.Cyberware.Alpha",    essenceMultiplier: 0.8, costMultiplier: 2.0 }
};

SR2E.cyberwareLocations = {
  headware: "SR2E.Cyberware.Headware",
  bodyware: "SR2E.Cyberware.Bodyware",
  cyberlimb: "SR2E.Cyberware.Cyberlimb",
  other: "SR2E.Cyberware.Other"
};

// ---------------------------------------------------------------------------
// MATRIX / DECKING
// ---------------------------------------------------------------------------
SR2E.matrixActions = {
  attack: "SR2E.Matrix.Attack",
  sleaze: "SR2E.Matrix.Sleaze",
  mask: "SR2E.Matrix.Mask",
  sensor: "SR2E.Matrix.Sensor",
  bod: "SR2E.Matrix.Bod",
  evasion: "SR2E.Matrix.Evasion"
};

SR2E.icTypes = {
  white: "SR2E.Matrix.WhiteIC",
  gray: "SR2E.Matrix.GrayIC",
  black: "SR2E.Matrix.BlackIC"
};

SR2E.programCategories = {
  persona: "SR2E.Matrix.Persona",
  combat: "SR2E.Matrix.CombatUtility",
  defense: "SR2E.Matrix.DefenseUtility",
  sensor: "SR2E.Matrix.SensorUtility",
  masking: "SR2E.Matrix.MaskingUtility",
  other: "SR2E.Matrix.OtherUtility"
};

// Security Codes (SR2E p.165): the node's color sets how many successes a
// decker's Computer Skill Test must beat; the numeric System Rating is the TN.
SR2E.securityCodes = {
  blue:   { label: "SR2E.Matrix.SecBlue",   successes: 1 },
  green:  { label: "SR2E.Matrix.SecGreen",  successes: 2 },
  orange: { label: "SR2E.Matrix.SecOrange", successes: 3 },
  red:    { label: "SR2E.Matrix.SecRed",    successes: 4 }
};

// System operations (SR2E p.166–168), keyed by the node type that offers them.
// All resolve with the same Computer Skill Test vs the node's System Rating;
// the label/node is informational for the player.
SR2E.systemOperations = {
  locate:       { label: "SR2E.Matrix.OpLocate",       node: "SAN/SPU" },
  read:         { label: "SR2E.Matrix.OpRead",         node: "Datastore" },
  transfer:     { label: "SR2E.Matrix.OpTransfer",     node: "Datastore" },
  edit:         { label: "SR2E.Matrix.OpEdit",         node: "Datastore" },
  erase:        { label: "SR2E.Matrix.OpErase",        node: "Datastore" },
  control:      { label: "SR2E.Matrix.OpControl",      node: "Slave" },
  sensorReadout:{ label: "SR2E.Matrix.OpSensorReadout",node: "Slave" },
  cancelAlert:  { label: "SR2E.Matrix.OpCancelAlert",  node: "CPU" },
  displayMap:   { label: "SR2E.Matrix.OpDisplayMap",   node: "CPU" },
  lockout:      { label: "SR2E.Matrix.OpLockout",      node: "SAN" }
};

// ── Virtual Realities 2.0 Matrix (used only when matrixRuleset === "vr2") ──────
// The five host subsystems (ACIFS, VR2.0 p.16). Every VR2.0 System Test targets
// one of these ratings rather than the core book's single System Rating.
SR2E.vr2Subsystems = {
  access:  "Access",
  control: "Control",
  index:   "Index",
  files:   "Files",
  slave:   "Slave"
};

// VR2.0 System Operations (pp.114–116). Each operation's `subsystem` is its
// "Test" — the ACIFS rating the decker rolls against — and `utility` is the
// program it uses. A representative core set; a GM can extend it. Transcribed
// from the System Operations descriptions (verified against the VR2.0 PDF).
SR2E.vr2SystemOperations = {
  logonHost:          { label: "Logon to Host",       subsystem: "access",  utility: "Deception" },
  logonLTG:           { label: "Logon to LTG",        subsystem: "access",  utility: "Deception" },
  logonRTG:           { label: "Logon to RTG",        subsystem: "access",  utility: "Deception" },
  gracefulLogoff:     { label: "Graceful Logoff",     subsystem: "access",  utility: "Deception" },
  invalidatePasscode: { label: "Invalidate Passcode", subsystem: "control", utility: "Validate" },
  locateAccessNode:   { label: "Locate Access Node",  subsystem: "index",   utility: "Browse" },
  locateDecker:       { label: "Locate Decker",       subsystem: "index",   utility: "Scanner" },
  locateFrame:        { label: "Locate Frame",        subsystem: "index",   utility: "Scanner" },
  locateFile:         { label: "Locate File",         subsystem: "index",   utility: "Browse" },
  locateIC:           { label: "Locate IC",           subsystem: "index",   utility: "Analyze" },
  locatePaydata:      { label: "Locate Paydata",      subsystem: "index",   utility: "Evaluate" },
  locateSlave:        { label: "Locate Slave",        subsystem: "index",   utility: "Analyze" },
  editFile:           { label: "Edit File",           subsystem: "files",   utility: "Read/Write" },
  makeComcall:        { label: "Make Comcall",        subsystem: "files",   utility: "Commlink" },
  editSlave:          { label: "Edit Slave",          subsystem: "slave",   utility: "Spoof" },
  monitorSlave:       { label: "Monitor Slave",       subsystem: "slave",   utility: "Spoof" }
};

// Alert states (SR2E p.168). Passive adds +50% to IC ratings (applied by the
// GM); a second passive alert escalates to active.
SR2E.alertStates = {
  none:    "SR2E.Matrix.AlertNone",
  passive: "SR2E.Matrix.AlertPassive",
  active:  "SR2E.Matrix.AlertActive"
};

// ---------------------------------------------------------------------------
// VEHICLE STATS
// ---------------------------------------------------------------------------
SR2E.vehicleTypes = {
  ground: "SR2E.Vehicles.Ground",
  hovercraft: "SR2E.Vehicles.Hovercraft",
  boat: "SR2E.Vehicles.Boat",
  aircraft: "SR2E.Vehicles.Aircraft",
  rotor: "SR2E.Vehicles.Rotor",
  vectored_thrust: "SR2E.Vehicles.VectoredThrust",
  drone: "SR2E.Vehicles.Drone"
};

// Default driving skill per vehicle type (core skill list: Bike, Car, Pilot).
// A vehicle's system.skill field overrides this (e.g. "bike").
SR2E.vehicleSkillDefaults = {
  ground: "car",
  hovercraft: "car",
  boat: "pilot",
  aircraft: "pilot",
  rotor: "pilot",
  vectored_thrust: "pilot",
  drone: "car"
};

// Vehicle test types and their terrain TN modifiers, exactly as printed
// (SR2E p.105–107). Note the Crash Test Table really does list Tight +2
// below Restricted +4 — encoded as printed.
SR2E.vehicleTestTypes = {
  handling: "SR2E.Vehicles.TestHandling",
  position: "SR2E.Vehicles.TestPosition",
  crash:    "SR2E.Vehicles.TestCrash"
};

SR2E.vehicleTerrainMods = {
  // Position Test Modifiers (p.106) — also used for generic Handling Tests
  handling: { open: 0,  normal: 1, restricted: 2, tight: 4 },
  position: { open: 0,  normal: 1, restricted: 2, tight: 4 },
  // Crash Test Table (p.107)
  crash:    { open: -1, normal: 0, restricted: 4, tight: 2 },
  // Ramming Table (p.107): subtracted from the ram TN
  ram:      { open: 0,  normal: -2, restricted: -3, tight: -4 },
  // Escape Test Modifiers (p.107): added to the escape TN
  escape:   { open: -4, normal: -2, restricted: 0, tight: 2 }
};

SR2E.vehicleTerrains = {
  open:       "SR2E.Vehicles.TerrainOpen",
  normal:     "SR2E.Vehicles.TerrainNormal",
  restricted: "SR2E.Vehicles.TerrainRestricted",
  tight:      "SR2E.Vehicles.TerrainTight"
};

// Crash Impact Table (p.107): Power = cruising speed ÷ 10 (round down);
// Damage Level by speed bracket.
SR2E.crashDamageLevel = speed => {
  if (speed >= 201) return "D";
  if (speed >= 61)  return "S";
  if (speed >= 21)  return "M";
  return "L";
};

// Vehicle Damage Modifiers (p.109): per damage level, the TN penalty to the
// driver's tests, the Initiative penalty, and the speed multiplier.
SR2E.vehicleDamageMods = {
  Undamaged: { tn: 0, init: 0,  speed: 1    },
  Light:     { tn: 1, init: -1, speed: 1    },
  Moderate:  { tn: 2, init: -2, speed: 0.75 },
  Serious:   { tn: 3, init: -3, speed: 0.5  },
  Destroyed: { tn: 0, init: 0,  speed: 0    }
};

// ---------------------------------------------------------------------------
// LIFESTYLES
// ---------------------------------------------------------------------------
SR2E.lifestyles = {
  streets:   { label: "SR2E.Lifestyle.Streets",   monthlyCost: 0 },
  squatter:  { label: "SR2E.Lifestyle.Squatter",  monthlyCost: 100 },
  low:       { label: "SR2E.Lifestyle.Low",       monthlyCost: 1000 },
  middle:    { label: "SR2E.Lifestyle.Middle",    monthlyCost: 5000 },
  high:      { label: "SR2E.Lifestyle.High",      monthlyCost: 10000 },
  luxury:    { label: "SR2E.Lifestyle.Luxury",    monthlyCost: 100000 }
};

// ---------------------------------------------------------------------------
// DICE POOL TYPES
// ---------------------------------------------------------------------------
// The Karma Pool (system.karma.pool) is intentionally not listed here —
// it is spent through the karma actions on chat cards, not rolled as a pool.
SR2E.dicePools = {
  combat: "SR2E.DicePools.Combat",
  hacking: "SR2E.DicePools.Hacking",
  magic: "SR2E.DicePools.Magic",
  control: "SR2E.DicePools.Control"
};

// ---------------------------------------------------------------------------
// MOVEMENT RATES (meters per combat turn)
// ---------------------------------------------------------------------------
SR2E.movementRates = {
  walking: { multiplier: 1 },   // Quickness x 1 meters
  running: { multiplier: 3 }    // Quickness x 3 meters
};

// ---------------------------------------------------------------------------
// QUALITIES (Edges & Flaws) — character traits with a build-point value.
// Edges cost points (positive value); Flaws grant points (negative value).
// The SR2E core has no edge/flaw rules; Rigger 2 (and the SR Companion) add
// them as an optional subsystem. Effects are descriptive (not auto-applied).
// ---------------------------------------------------------------------------
SR2E.qualityKinds = {
  edge: "SR2E.Quality.Edge",
  flaw: "SR2E.Quality.Flaw"
};
SR2E.qualityCategories = {
  attribute: "SR2E.Quality.Attribute",
  skill:     "SR2E.Quality.Skill",
  physical:  "SR2E.Quality.Physical",
  mental:    "SR2E.Quality.Mental",
  social:    "SR2E.Quality.Social",
  magical:   "SR2E.Quality.Magical",
  other:     "SR2E.Quality.Other"
};

// Metamagic techniques an initiate learns (one per Grade). The Grimoire 2nd ed
// set (book p.43-50). The sheet records which an initiate knows; the techniques
// themselves are largely GM-adjudicated at the table.
SR2E.metamagic = {
  centering:  "Centering",
  masking:    "Masking",
  quickening: "Quickening",
  shielding:  "Shielding",
  anchoring:  "Anchoring",
  dispelling: "Dispelling"
};

// ---------------------------------------------------------------------------
// VEHICLE DESIGN (Rigger 2 "design from scratch", book p.108-123)
// The core system ships the Design-tab UI and the point-buy math
// (module/rules/sr2e-rules.mjs), but NOT the Rigger 2 Chassis / Power Plant
// tables — those are sourcebook content. A content module (sr2e-rigger-2)
// populates this registry at runtime via registerVehicleDesignData(), so the
// Design tab is empty (with a hint) until such a module is enabled.
//
// Normalized entry shapes the Design tab + resolveVehicleDesign() expect:
//   chassis[slug]     = { name, group, dp, handling, body, armor, pilot,
//                         sensor, autonav, cargoStart, cargoMax, seating }
//   powerPlants[slug] = { name, engine, dp, speedStart, speedMax, accelStart,
//                         accelMax, loadStart, loadMax, sig }
// (dp may be a non-numeric "drone formula" string; the resolver flags those.)
// ---------------------------------------------------------------------------
SR2E.vehicleDesign = { chassis: {}, powerPlants: {} };

/**
 * Merge design-table data into the registry. Idempotent per-key (later wins).
 * @param {{chassis?:object, powerPlants?:object}} data
 */
SR2E.registerVehicleDesignData = function registerVehicleDesignData({ chassis = {}, powerPlants = {} } = {}) {
  Object.assign(SR2E.vehicleDesign.chassis, chassis);
  Object.assign(SR2E.vehicleDesign.powerPlants, powerPlants);
  return SR2E.vehicleDesign;
};

// Buyable ratings on the Design tab, with their per-point Design-Point cost
// (mirrors DESIGN_OPTION_COSTS in module/rules; p.115).
SR2E.vehicleDesignRatings = {
  handling:     { label: "SR2E.Design.Handling",     dp: 25 },
  speed:        { label: "SR2E.Design.Speed",        dp: 2 },
  acceleration: { label: "SR2E.Design.Acceleration", dp: 25 },
  armor:        { label: "SR2E.Design.Armor",        dp: 50 },
  cargo:        { label: "SR2E.Design.Cargo",        dp: 5 },
  load:         { label: "SR2E.Design.Load",         dp: 0.1 },
  economy:      { label: "SR2E.Design.Economy",      dp: 5 },
  signature:    { label: "SR2E.Design.Signature",    dp: 200 },
  fuel:         { label: "SR2E.Design.Fuel",         dp: 25 }
};

// Flat / special design options that aren't per-point rating buys (book p.116-117).
// Shown on the Design tab as a reference; add the listed Design Points to the
// build via the manual "Extra DP" field.
SR2E.vehicleDesignFlatOptions = [
  { label: "Smart Materials (also +0.5 Mark-Up; raises Speed/Accel/Load maxes, −1 Handling)", dp: "100" },
  { label: "Add STOL profile (fixed-wing)", dp: "250" },
  { label: "Add VSTOL profile (fixed-wing)", dp: "400" },
  { label: "Medical-Treatment Gear (225 CF, 50 kg/patient)", dp: "400 + 80/patient" },
  { label: "Living Amenities — Basic / Improved / High (needs 200 CF)", dp: "40 / 50+40 / 100+40 per passenger" },
  { label: "Hydrofoil Capability (motorboats)", dp: "see p.116" },
  { label: "Improve Robot's Learning Pool", dp: "GM's discretion" }
];

// Mark-Up Factors Table (Rigger 2 p.114). Final cost = Design Points × Mark-Up
// × 100, where Mark-Up = (chassis-category base + Σ equipment modifiers) ×
// Π special-design multipliers. The modifier/multiplier values are GM-set within
// ranges, so the Design tab auto-fills the base from the chosen chassis category
// and shows this table for reference; the GM sets the final Mark-Up.
SR2E.vehicleMarkup = {
  // Base Mark-Up Factor by chassis category, keyed by the chassis group label
  // the content module registers (CONFIG.SR2E.vehicleDesign.chassis[*].group).
  chassisBase: {
    "Bikes": 0.5, "Cars": 1, "Boats": 1, "Hovercraft": 2.5, "Rotorcraft": 2.5,
    "Fixed Wing": 2.5, "Vector Thrust": 2.5, "Special": 2.5
  },
  // Added to the base Mark-Up (GM-set within the listed range).
  equipment: [
    { label: "Smart materials used in design", value: "+0.5" },
    { label: "Ambulance / medical-treatment vehicle", value: "+1" },
    { label: "Specialized non-combat vehicle (e.g. fire truck)", value: "+0.25 to +2.5" },
    { label: "Unusual / uncommon accessories & features", value: "+0.2 to +1.2" }
  ],
  // Multiply the total Mark-Up (these stack multiplicatively, never add).
  specialDesign: [
    { label: "Luxury vehicle", value: "×1.5 to ×2.5" },
    { label: "Security grade", value: "×2.0 to ×3.0" },
    { label: "Military grade", value: "×3.0 to ×5.0" },
    { label: "Drone", value: "×0.1" }
  ]
};
