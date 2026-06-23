import { SR2EDataModel } from "./base-data.mjs";
import { programSize, programCost, focusCost } from "../rules/sr2e-rules.mjs";

/**
 * Parse a drain code string into { modifier, level }.
 *
 * Exported as a standalone function so it can be used anywhere without
 * depending on the DataModel prototype chain (e.g. in actor-sheet.mjs
 * or item.mjs where `item.system.parsedDrainCode` might not resolve if
 * Foundry serialises the system data before the getter is called).
 *
 * Supported formats:
 *   Canonical (stored as-is from rulebook):
 *     "(F / 2)S"            → { modifier:  0, level: "S" }
 *     "((F / 2) + 3)D"      → { modifier: +3, level: "D" }
 *     "((F / 2) - 1)S"      → { modifier: -1, level: "S" }
 *     "((F / 2) – 1)L"      → { modifier: -1, level: "L" }  (en-dash)
 *   Legacy (old compact format, kept for backward compat):
 *     "+3(D)"               → { modifier: +3, level: "D" }
 *     "-1(S)"               → { modifier: -1, level: "S" }
 *
 * @param {string} s  The raw drain code string.
 * @returns {{ modifier: number, level: string }}
 */
export function parseDrainCode(s) {
  s = s ?? "";
  // Canonical with modifier: ((F / 2) ± N)Level (handles en-dash / em-dash too)
  const withMod = s.match(/\(\(F\s*\/\s*2\)\s*([+\-\u2013\u2014])\s*(\d+)\)\s*([LMSD])/);
  if (withMod) {
    const sign = withMod[1] === "+" ? 1 : -1;
    return { modifier: sign * parseInt(withMod[2]), level: withMod[3] };
  }
  // Canonical without modifier: (F / 2)Level
  const noMod = s.match(/\(F\s*\/\s*2\)\s*([LMSD])/);
  if (noMod) return { modifier: 0, level: noMod[1] };
  // Legacy compact: +3(D), -1(S), +0(M) etc.
  const legacy = s.match(/([+-]?\d+)\(([LMSD])\)/);
  if (legacy) return { modifier: parseInt(legacy[1]), level: legacy[2] };
  return { modifier: 0, level: "M" };
}

/**
 * Data model for Skills.
 */
export class SkillData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ required: true, initial: "active", choices: {
        active: "SR2E.Skills.Active",
        build_repair: "SR2E.Skills.BuildRepair",
        knowledge: "SR2E.Skills.Knowledge",
        language: "SR2E.Skills.Language",
        special: "SR2E.Skills.Special"
      }}),
      linkedAttribute: new fields.StringField({ initial: "quickness" }),
      rating: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      concentration: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        rating: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),
      specialization: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        rating: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),
      isMagical: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Calculate concentration and specialization ratings
    if (this.concentration.name) {
      this.concentration.rating = this.rating + 1;
    }
    if (this.specialization.name) {
      this.specialization.rating = this.rating + 2;
    }
  }

  /**
   * Get the effective rating for a given use (general, concentration, or specialization).
   * @param {string} [use] - "general", "concentration", or "specialization"
   */
  getEffectiveRating(use = "general") {
    if (use === "specialization" && this.specialization.name) {
      return this.rating + 2;
    }
    if (use === "concentration" && this.concentration.name) {
      return this.rating + 1;
    }
    return this.rating;
  }
}

/**
 * Data model for Weapons.
 */
export class WeaponData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      weaponType: new fields.StringField({ required: true, initial: "firearm", choices: {
        melee: "SR2E.Weapons.Melee", projectile: "SR2E.Weapons.Projectile",
        throwing: "SR2E.Weapons.Throwing", firearm: "SR2E.Weapons.Firearm",
        heavy: "SR2E.Weapons.Heavy", grenade: "SR2E.Weapons.Grenade"
      }}),
      skill: new fields.StringField({ initial: "firearms" }),
      damageCode: new fields.StringField({ initial: "6M" }),  // e.g., "6M", "8S", "10D"
      damageType: new fields.StringField({ initial: "physical", choices: {
        physical: "SR2E.Damage.Physical", stun: "SR2E.Damage.Stun"
      }}),
      concealability: new fields.NumberField({ integer: true, initial: 6, min: 0 }),
      reach: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Firearm-specific
      firingModes: new fields.SchemaField({
        ss: new fields.BooleanField({ initial: false }),
        sa: new fields.BooleanField({ initial: false }),
        bf: new fields.BooleanField({ initial: false }),
        fa: new fields.BooleanField({ initial: false })
      }),
      ammo: new fields.SchemaField({
        current: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        type: new fields.StringField({ initial: "regular" }),
        // The reserve ammo item (on the same actor) this weapon reloads from
        sourceId: new fields.StringField({ initial: "", blank: true }),
        // Snapshot of the rounds currently in the clip, captured at reload
        // time so the gun keeps shooting what was loaded even if the reserve
        // item is later edited, swapped or deleted.
        loadedSourceId: new fields.StringField({ initial: "", blank: true }),
        loadedName: new fields.StringField({ initial: "", blank: true }),
        damageMod: new fields.NumberField({ integer: true, initial: 0 }),
        armorMod: new fields.NumberField({ integer: true, initial: 0 }),
        armorCalc: new fields.StringField({ initial: "standard" }),
        damageType: new fields.StringField({ initial: "", blank: true })
      }),
      recoilComp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      smartgunCompatible: new fields.BooleanField({ initial: false }),

      // Range brackets (Short/Medium/Long/Extreme)
      ranges: new fields.SchemaField({
        short: new fields.NumberField({ integer: true, initial: 0 }),
        medium: new fields.NumberField({ integer: true, initial: 0 }),
        long: new fields.NumberField({ integer: true, initial: 0 }),
        extreme: new fields.NumberField({ integer: true, initial: 0 })
      }),

      // Melee-specific
      strengthMin: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // General
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      equipped: new fields.BooleanField({ initial: false }),
      accessories: new fields.ArrayField(new fields.StringField()),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /**
   * Parse the damage code into its components.
   * @returns {{ power: number, level: string }}
   */
  get parsedDamageCode() {
    const match = this.damageCode.match(/^(\d+)(L|M|S|D)(\d*)$/);
    if (!match) return { power: 0, level: "M", staging: 0 };
    return {
      power: parseInt(match[1]),
      level: match[2],
      staging: match[3] ? parseInt(match[3]) : 0
    };
  }
}

/**
 * Data model for Armor.
 */
export class ArmorData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ballistic: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      impact: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      concealability: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      equipped: new fields.BooleanField({ initial: false }),
      isLayered: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Data model for Spells.
 */
export class SpellData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ required: true, initial: "combat", choices: {
        combat: "SR2E.Spells.Combat", detection: "SR2E.Spells.Detection",
        health: "SR2E.Spells.Health", illusion: "SR2E.Spells.Illusion",
        manipulation: "SR2E.Spells.Manipulation"
      }}),
      subcategory: new fields.StringField({ initial: "", blank: true, choices: {
        "":               "SR2E.Spells.SubcatNone",
        control:          "SR2E.Spells.SubcatControl",
        telekinetic:      "SR2E.Spells.SubcatTelekinetic",
        transformation:   "SR2E.Spells.SubcatTransformation"
      }}),
      type: new fields.StringField({ required: true, initial: "physical", choices: {
        physical: "SR2E.Spells.Physical", mana: "SR2E.Spells.Mana"
      }}),
      range: new fields.StringField({ required: true, initial: "los", choices: {
        touch:   "SR2E.Spells.Touch",
        los:     "SR2E.Spells.LOS",
        limited: "SR2E.Spells.Limited",
        self:    "SR2E.Spells.Self",
        area:    "SR2E.Spells.Area"    // legacy — kept for backward compat with saved actors
      }}),
      duration: new fields.StringField({ required: true, initial: "instant", choices: {
        instant: "SR2E.Spells.Instant", sustained: "SR2E.Spells.Sustained",
        permanent: "SR2E.Spells.Permanent"
      }}),
      force: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      drainCode: new fields.StringField({ initial: "(F / 2)M" }),
      target: new fields.StringField({ initial: "" }),
      damageCode: new fields.StringField({ initial: "" }),
      isAreaEffect: new fields.BooleanField({ initial: false }),
      isVoluntary: new fields.BooleanField({ initial: false }),
      // Sustained-spell state (SR2E p.130): while sustaining, the caster takes
      // +2 TN on all other tests per spell — unless a spell lock holds it.
      sustaining: new fields.BooleanField({ initial: false }),
      sustainedForce: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      spellLocked: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /**
   * Parse the drain code string into { modifier, level }.
   * Delegates to the exported parseDrainCode() standalone function.
   */
  get parsedDrainCode() {
    return parseDrainCode(this.drainCode);
  }

  /**
   * Calculate the drain target number for a given force value.
   * Per SR2E p.140: TN = ⌊Force÷2⌋ + drain modifier.
   * e.g. "((F / 2) + 3)D" on Force 4 → TN = ⌊4÷2⌋+3 = 5, damage level D
   */
  get drainTarget() {
    const drain = this.parsedDrainCode;
    return Math.max(2, Math.floor(this.force / 2) + drain.modifier);  // ⌊F÷2⌋ + mod
  }
}

/**
 * Data model for Cyberware.
 */
export class CyberwareData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      location: new fields.StringField({ initial: "bodyware", choices: {
        headware: "SR2E.Cyberware.Headware", bodyware: "SR2E.Cyberware.Bodyware",
        cyberlimb: "SR2E.Cyberware.Cyberlimb", other: "SR2E.Cyberware.Other"
      }}),
      grade: new fields.StringField({ initial: "standard", choices: {
        standard: "SR2E.Cyberware.Standard", alpha: "SR2E.Cyberware.Alpha"
      }}),
      essenceCost: new fields.NumberField({ required: true, initial: 0.5, min: 0 }),
      rating: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      streetIndex: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      installed: new fields.BooleanField({ initial: true }),
      // Combat TN modifier — negative values reduce the attack TN (e.g. −1 for Smartlink).
      // Applied only when the target weapon has smartgunCompatible = true.
      combatTnMod: new fields.NumberField({ integer: true, initial: 0 }),
      // Vehicle Control Rig: when true, this item's rating sets the character's
      // VCR level (Control Pool, rigging bonuses). The VCR's Reaction/Initiative
      // bonuses apply only while jacked in (SR2E p.85) — do NOT also give the
      // item attributeMods for them.
      isVcr: new fields.BooleanField({ initial: false }),
      // Per-rating stats table. When populated, essenceCost/cost/availability/streetIndex
      // are derived from the row matching the current rating (prepareDerivedData).
      // For non-tiered items, leave this empty and fill the flat fields directly.
      ratingStats: new fields.ArrayField(
        new fields.SchemaField({
          rating:       new fields.NumberField({ integer: true, initial: 1, min: 1 }),
          essenceCost:  new fields.NumberField({ initial: 0, min: 0 }),
          cost:         new fields.NumberField({ initial: 0, min: 0 }),
          availability: new fields.StringField({ initial: "" }),
          streetIndex:  new fields.StringField({ initial: "" })
        }),
        { initial: [] }
      ),
      // Attribute modifiers provided by this cyberware
      attributeMods: new fields.SchemaField({
        body: new fields.NumberField({ integer: true, initial: 0 }),
        quickness: new fields.NumberField({ integer: true, initial: 0 }),
        strength: new fields.NumberField({ integer: true, initial: 0 }),
        charisma: new fields.NumberField({ integer: true, initial: 0 }),
        intelligence: new fields.NumberField({ integer: true, initial: 0 }),
        willpower: new fields.NumberField({ integer: true, initial: 0 }),
        reaction: new fields.NumberField({ integer: true, initial: 0 }),
        initiativeDice: new fields.NumberField({ integer: true, initial: 0 })
      }),
      // Container cyberware (cybereyes / cyberears): a free Essence allowance that
      // absorbs add-on modules. capacity 0 = ordinary cyberware (no module slots).
      // SR2E p.247 — cybereyes accept enhancements up to 0.5 Essence at no further
      // cost; only module essence beyond `capacity` adds to the base.
      capacity: new fields.NumberField({ initial: 0, min: 0 }),
      modules: new fields.ArrayField(
        new fields.SchemaField({
          name:        new fields.StringField({ initial: "" }),
          essenceCost: new fields.NumberField({ initial: 0, min: 0 }),
          cost:        new fields.NumberField({ initial: 0, min: 0 }),
          rating:      new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          // TN modifier the module grants while installed (e.g. −2 for a Smartlink),
          // surfaced on the parent's combatTnMod so the smartgun logic still sees it.
          combatTnMod: new fields.NumberField({ integer: true, initial: 0 }),
          active:      new fields.BooleanField({ initial: true }),
          notes:       new fields.StringField({ initial: "" })
        }),
        { initial: [] }
      ),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // If a rating stats table exists, derive the active stats from the current rating row.
    if (this.ratingStats?.length > 0) {
      const row = this.ratingStats.find(r => r.rating === this.rating)
               ?? this.ratingStats.at(-1);
      if (row) {
        this.essenceCost  = row.essenceCost;
        this.cost         = row.cost;
        this.availability = row.availability;
        this.streetIndex  = row.streetIndex;
      }
    }

    // Container cyberware: total the ACTIVE modules and surface derived readouts.
    // capacityUsed feeds the sheet meter; capacityOver is the essence charged
    // beyond the free allowance; combatTnMod gains any module TN bonuses.
    let modEssence = 0, modCost = 0, modTn = 0;
    for (const m of this.modules ?? []) {
      if (!m.active) continue;
      modEssence += m.essenceCost ?? 0;
      modCost    += m.cost ?? 0;
      modTn      += m.combatTnMod ?? 0;
    }
    this.capacityUsed = Math.round(modEssence * 100) / 100;
    this.capacityOver = Math.max(0, Math.round((modEssence - (this.capacity ?? 0)) * 100) / 100);
    this.moduleCost   = modCost;
    this.combatTnMod  = (this.combatTnMod ?? 0) + modTn;
  }

  /**
   * Get the actual essence cost after grade modifier. For container cyberware
   * (cybereyes/cyberears) this is base + the module essence beyond the free
   * capacity; ordinary cyberware (capacity 0, no modules) is just the base.
   */
  get actualEssenceCost() {
    const gradeData = CONFIG.SR2E.cyberwareGrades[this.grade];
    const mult = gradeData?.essenceMultiplier || 1.0;
    const total = (this.essenceCost + (this.capacityOver ?? 0)) * mult;
    return Math.round(total * 100) / 100;
  }
}

/**
 * Data model for Gear (general equipment).
 */
export class GearData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "general" }),
      rating: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      quantity: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      equipped: new fields.BooleanField({ initial: false }),
      concealability: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Weapon accessory (Laser Sight, Smartgun System, Gas-vent, Gyro Mount,
      // Bipod, Silencer, etc.): a mod that attaches to ONE weapon at a time
      // rather than being merely equipped. While linked, its modifiers apply to
      // that weapon's attacks (SR2E p.110, Street Samurai Catalog).
      weaponAccessory: new fields.BooleanField({ initial: false }),
      linkedWeaponId: new fields.StringField({ initial: "" }),
      combatTnMod: new fields.NumberField({ integer: true, initial: 0 }),
      accessoryRecoilComp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      requiresSmartgun: new fields.BooleanField({ initial: false }),

      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Data model for Matrix Programs.
 */
export class ProgramData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "persona", choices: {
        persona: "SR2E.Matrix.Persona", combat: "SR2E.Matrix.CombatUtility",
        defense: "SR2E.Matrix.DefenseUtility", sensor: "SR2E.Matrix.SensorUtility",
        masking: "SR2E.Matrix.MaskingUtility", other: "SR2E.Matrix.OtherUtility"
      }}),
      rating: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      size: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      multiplier: new fields.NumberField({ initial: 1, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      loaded: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Program memory size = Rating² × Multiplier; cost = Size × 100 (p.174–177)
    this.size = programSize(this.rating, this.multiplier);
    this.cost = programCost(this.rating, this.multiplier);
  }
}

/**
 * Data model for Physical Adept Powers.
 */
export class AdeptPowerData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      pointCost: new fields.NumberField({ required: true, initial: 0.25, min: 0 }),
      level: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      maxLevel: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      description: new fields.HTMLField({ initial: "" }),
      // Effects provided by this power
      attributeMods: new fields.SchemaField({
        body: new fields.NumberField({ integer: true, initial: 0 }),
        quickness: new fields.NumberField({ integer: true, initial: 0 }),
        strength: new fields.NumberField({ integer: true, initial: 0 }),
        reaction: new fields.NumberField({ integer: true, initial: 0 })
      }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /**
   * Get total power point cost (cost per level * level).
   */
  get totalCost() {
    return this.pointCost * this.level;
  }
}

/**
 * Data model for Contacts.
 */
export class ContactData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      contactType: new fields.StringField({ initial: "contact", choices: {
        contact: "SR2E.Contact.Contact", buddy: "SR2E.Contact.Buddy", follower: "SR2E.Contact.Follower"
      }}),
      archetype: new fields.StringField({ initial: "" }),
      loyalty: new fields.NumberField({ integer: true, initial: 1, min: 1, max: 6 }),
      influence: new fields.NumberField({ integer: true, initial: 1, min: 1, max: 6 }),
      description: new fields.HTMLField({ initial: "" }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Data model for Lifestyles.
 */
export class LifestyleData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      level: new fields.StringField({ initial: "low", choices: {
        streets: "SR2E.Lifestyle.Streets", squatter: "SR2E.Lifestyle.Squatter",
        low: "SR2E.Lifestyle.Low", middle: "SR2E.Lifestyle.Middle",
        high: "SR2E.Lifestyle.High", luxury: "SR2E.Lifestyle.Luxury"
      }}),
      // User-editable: the book cost for the level is only a default. It is NOT
      // overwritten in prepareDerivedData so custom lifestyles keep their cost.
      monthlyCost: new fields.NumberField({ initial: 1000, min: 0 }),
      monthsPaid: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      description: new fields.HTMLField({ initial: "" }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Data model for Ammunition.
 *
 * Ammo behaviour (SR2E p.93–94):
 *   damageModifier - added to the weapon's Damage Power on attack
 *                    (explosive +1, gel −2, …)
 *   damageType     - overrides the damage type when set (gel → stun)
 *   armorCalc      - how the defender's armor is computed on the
 *                    Damage Resistance Test:
 *                      standard       weapon's normal armor type
 *                      half_ballistic ⌊Ballistic ÷ 2⌋ (APDS)
 *                      impact         Impact armor applies (gel)
 *                      flechette      max(2 × Impact, Ballistic);
 *                                     +1 Damage Level if unarmored
 *   armorModifier  - flat adjustment to the computed armor rating
 *                    (negative = armor-piercing; for homebrew rounds)
 */
export class AmmoData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ammoType: new fields.StringField({ initial: "regular" }),
      quantity: new fields.NumberField({ integer: true, initial: 10, min: 0 }),
      damageModifier: new fields.NumberField({ integer: true, initial: 0 }),
      armorModifier: new fields.NumberField({ integer: true, initial: 0 }),
      damageType: new fields.StringField({ initial: "", blank: true, choices: {
        "":       "SR2E.Ammo.DamageTypeWeapon",
        physical: "SR2E.Damage.Physical",
        stun:     "SR2E.Damage.Stun"
      }}),
      armorCalc: new fields.StringField({ initial: "standard", choices: {
        standard:       "SR2E.Ammo.ArmorStandard",
        half_ballistic: "SR2E.Ammo.ArmorHalfBallistic",
        impact:         "SR2E.Ammo.ArmorImpact",
        flechette:      "SR2E.Ammo.ArmorFlechette"
      }}),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Data model for Magical Foci.
 */
export class FocusData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      focusType: new fields.StringField({ initial: "spell", choices: {
        spell: "SR2E.Focus.Spell", spirit: "SR2E.Focus.Spirit", power: "SR2E.Focus.Power",
        weapon: "SR2E.Focus.Weapon", spell_lock: "SR2E.Focus.SpellLock"
      }}),
      force: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      bondingCost: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      bonded: new fields.BooleanField({ initial: false }),
      active: new fields.BooleanField({ initial: false }),
      // Per-Force nuyen unit cost (SR2E p.249). When > 0, the cost is derived as
      // Force × this; 0 leaves the cost field manually editable (custom foci).
      costPerForce: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    if (this.costPerForce > 0) this.cost = focusCost(this.force, this.costPerForce);
  }
}

/**
 * Data model for Vehicle Modifications.
 */
export class VehicleModData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      modType: new fields.StringField({ initial: "general" }),
      rating: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      // Design-Point cost of this mod as a vehicle-design option (Rigger 2
      // design-from-scratch), evaluated against `rating` by rules.modDesignPoints:
      //   dpTable (by rating) > dpPerLevel (×rating) > designPoints (flat).
      // 0 for ¥-priced customizations, which instead add their `cost`.
      designPoints: new fields.NumberField({ initial: 0, min: 0 }),
      dpPerLevel:   new fields.NumberField({ initial: 0, min: 0 }),
      dpTable: new fields.ArrayField(new fields.NumberField({ min: 0 }), { initial: [] }),
      // Cargo Factor consumed from the chassis' Cargo Rating, and kilograms taken
      // from the power plant's Load Rating (Rigger 2 p.115). Same flat/perLevel/
      // table model as the Design-Point fields, evaluated against `rating`.
      cfConsumed:   new fields.NumberField({ initial: 0, min: 0 }),
      cfPerLevel:   new fields.NumberField({ initial: 0, min: 0 }),
      cfTable: new fields.ArrayField(new fields.NumberField({ min: 0 }), { initial: [] }),
      loadReduction: new fields.NumberField({ initial: 0, min: 0 }),
      loadPerLevel:  new fields.NumberField({ initial: 0, min: 0 }),
      loadTable: new fields.ArrayField(new fields.NumberField({ min: 0 }), { initial: [] }),
      installed: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Data model for Metatype / Race items.
 * Drag one of these onto a character sheet to set their race and apply
 * racial attribute modifiers and maximums.
 */
export class RaceData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // The canonical race key used to look up CONFIG.SR2E.racialModifiers etc.
      // Storing it here lets you override defaults per-item if needed.
      raceKey: new fields.StringField({ required: true, initial: "human", choices: {
        human: "SR2E.Races.Human",
        dwarf: "SR2E.Races.Dwarf",
        elf: "SR2E.Races.Elf",
        ork: "SR2E.Races.Ork",
        troll: "SR2E.Races.Troll"
      }}),

      // Racial attribute modifiers (additive bonuses to base attributes)
      attributeMods: new fields.SchemaField({
        body:         new fields.NumberField({ required: true, integer: true, initial: 0 }),
        quickness:    new fields.NumberField({ required: true, integer: true, initial: 0 }),
        strength:     new fields.NumberField({ required: true, integer: true, initial: 0 }),
        charisma:     new fields.NumberField({ required: true, integer: true, initial: 0 }),
        intelligence: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        willpower:    new fields.NumberField({ required: true, integer: true, initial: 0 })
      }),

      // Racial attribute maximums
      attributeMaximums: new fields.SchemaField({
        body:         new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 }),
        quickness:    new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 }),
        strength:     new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 }),
        charisma:     new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 }),
        intelligence: new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 }),
        willpower:    new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 }),
        essence:      new fields.NumberField({ required: true, initial: 6, min: 0 }),
        magic:        new fields.NumberField({ required: true, integer: true, initial: 6, min: 0 }),
        reaction:     new fields.NumberField({ required: true, integer: true, initial: 6, min: 1 })
      }),

      // Special racial abilities (e.g. low_light_vision, thermographic_vision, dermal_armor, reach_1)
      specialAbilities: new fields.ArrayField(
        new fields.StringField({ initial: "" })
      ),

      // Karma cost to select this race during character creation (default 0 for humans)
      karmaCost: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // Flavour / rulebook text
      description: new fields.HTMLField({ initial: "" })
    };
  }
}

/**
 * Magical Tradition item.
 * Drag one of these onto a character sheet to set their magic type and
 * tradition (e.g. "Hermetic Full Magician", "Shamanic Adept", "Physical Adept").
 * The Type and Tradition fields on the magic tab are locked to this item —
 * drop a new tradition to change, or use the clear button to remove.
 */
export class TraditionData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Which magic archetype this tradition represents
      magicType: new fields.StringField({ required: true, initial: "full_magician", choices: {
        full_magician:   "SR2E.Magic.FullMagician",
        physical_adept:  "SR2E.Magic.PhysicalAdept",
        shamanic_adept:  "SR2E.Magic.ShamanicAdept",
        magical_adept:   "SR2E.Magic.MagicalAdept"
      }}),

      // Philosophical tradition (none = not applicable, e.g. Physical Adept)
      tradition: new fields.StringField({ required: true, initial: "none", choices: {
        none:     "SR2E.Magic.None",
        hermetic: "SR2E.Magic.Hermetic",
        shamanic: "SR2E.Magic.Shamanic"
      }}),

      // Which magical skill(s) this tradition grants access to.
      // "both"      = Full Magician or Shamanic Adept (Sorcery + Conjuring)
      // "sorcery"   = Magical Adept (Sorcerer)
      // "conjuring" = Magical Adept (Conjurer)
      // "none"      = Physical Adept (no magical skills)
      skill: new fields.StringField({ required: true, initial: "both", choices: {
        none:      "SR2E.Magic.SkillNone",
        sorcery:   "SR2E.Magic.SkillSorcery",
        conjuring: "SR2E.Magic.SkillConjuring",
        both:      "SR2E.Magic.SkillBoth"
      }}),

      // Flavour / rulebook text
      description: new fields.HTMLField({ initial: "" })
    };
  }
}

/**
 * Quality (Edge or Flaw) — an optional character trait with a build-point
 * value (SR Companion p.21; Rigger 2 p.14-15). Edges have a positive value
 * (they cost points), Flaws a negative value (they grant points). Some are
 * tiered (e.g. Sensitive Neural Structure -2 / -4); store the chosen value and
 * describe the tiers in notes. Effects are descriptive — not auto-applied.
 */
export class QualityData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      kind: new fields.StringField({ initial: "flaw", choices: {
        edge: "SR2E.Quality.Edge", flaw: "SR2E.Quality.Flaw"
      }}),
      category: new fields.StringField({ initial: "other", choices: {
        attribute: "SR2E.Quality.Attribute", skill: "SR2E.Quality.Skill",
        physical: "SR2E.Quality.Physical", mental: "SR2E.Quality.Mental",
        social: "SR2E.Quality.Social", magical: "SR2E.Quality.Magical",
        other: "SR2E.Quality.Other"
      }}),
      // Build-point value: positive for Edges, negative for Flaws.
      pointValue: new fields.NumberField({ integer: true, initial: 0 }),
      source: new fields.StringField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" })
    };
  }

  /** Signed value as a display string, e.g. "+2" / "-3". */
  get signedValue() {
    const v = this.pointValue;
    return v > 0 ? `+${v}` : `${v}`;
  }
}
