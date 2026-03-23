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
  dwarf:  { body: 7, quickness: 5, strength: 8, charisma: 6, intelligence: 6, willpower: 7, essence: 6, magic: 6, reaction: 6 },
  elf:    { body: 6, quickness: 7, strength: 6, charisma: 8, intelligence: 6, willpower: 6, essence: 6, magic: 6, reaction: 7 },
  ork:    { body: 9, quickness: 6, strength: 8, charisma: 5, intelligence: 5, willpower: 6, essence: 6, magic: 6, reaction: 6 },
  troll:  { body: 11, quickness: 5, strength: 10, charisma: 4, intelligence: 4, willpower: 5, essence: 6, magic: 6, reaction: 5 }
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
  heavy_weapons:    { label: "SR2E.Skills.HeavyWeapons",    attribute: "strength",     category: "active" },
  launch_weapons:   { label: "SR2E.Skills.LaunchWeapons",   attribute: "quickness",    category: "active" },
  leadership:       { label: "SR2E.Skills.Leadership",      attribute: "charisma",     category: "active" },
  negotiation:      { label: "SR2E.Skills.Negotiation",     attribute: "charisma",     category: "active" },
  pilot:            { label: "SR2E.Skills.Pilot",           attribute: "reaction",     category: "active" },
  projectile_weapons: { label: "SR2E.Skills.ProjectileWeapons", attribute: "quickness", category: "active" },
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
SR2E.dicePools = {
  combat: "SR2E.DicePools.Combat",
  hacking: "SR2E.DicePools.Hacking",
  magic: "SR2E.DicePools.Magic",
  control: "SR2E.DicePools.Control",
  karma: "SR2E.DicePools.Karma"
};

// ---------------------------------------------------------------------------
// MOVEMENT RATES (meters per combat turn)
// ---------------------------------------------------------------------------
SR2E.movementRates = {
  walking: { multiplier: 1 },   // Quickness x 1 meters
  running: { multiplier: 3 }    // Quickness x 3 meters
};
