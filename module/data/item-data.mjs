import { SR2EDataModel } from "./base-data.mjs";

/**
 * Data model for Skills.
 */
export class SkillData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ required: true, initial: "active", choices: ["active", "knowledge", "language", "special"] }),
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
      weaponType: new fields.StringField({ required: true, initial: "firearm", choices: ["melee", "projectile", "throwing", "firearm", "heavy", "grenade"] }),
      skill: new fields.StringField({ initial: "firearms" }),
      damageCode: new fields.StringField({ initial: "6M" }),  // e.g., "6M", "8S", "10D"
      damageType: new fields.StringField({ initial: "physical", choices: ["physical", "stun"] }),
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
        type: new fields.StringField({ initial: "regular" })
      }),
      recoilComp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

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
      category: new fields.StringField({ required: true, initial: "combat", choices: ["combat", "detection", "health", "illusion", "manipulation"] }),
      type: new fields.StringField({ required: true, initial: "physical", choices: ["physical", "mana"] }),
      range: new fields.StringField({ required: true, initial: "los", choices: ["touch", "los", "self", "area"] }),
      duration: new fields.StringField({ required: true, initial: "instant", choices: ["instant", "sustained", "permanent"] }),
      force: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      drainCode: new fields.StringField({ initial: "+1(M)" }),
      target: new fields.StringField({ initial: "" }),
      damageCode: new fields.StringField({ initial: "" }),
      isAreaEffect: new fields.BooleanField({ initial: false }),
      isVoluntary: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /**
   * Parse the drain code into components.
   * e.g., "+1(M)" -> { modifier: 1, level: "M" }
   */
  get parsedDrainCode() {
    const match = this.drainCode.match(/([+-]?\d+)\(([LMSD])\)/);
    if (!match) return { modifier: 0, level: "M" };
    return {
      modifier: parseInt(match[1]),
      level: match[2]
    };
  }

  /**
   * Calculate the drain target number.
   * Drain TN = Force / 2 (round down) + drain modifier
   */
  get drainTarget() {
    const drain = this.parsedDrainCode;
    return Math.max(2, Math.floor(this.force / 2) + drain.modifier);
  }
}

/**
 * Data model for Cyberware.
 */
export class CyberwareData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      location: new fields.StringField({ initial: "bodyware", choices: ["headware", "bodyware", "cyberlimb", "other"] }),
      grade: new fields.StringField({ initial: "standard", choices: ["standard", "alpha"] }),
      essenceCost: new fields.NumberField({ required: true, initial: 0.5, min: 0 }),
      rating: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      installed: new fields.BooleanField({ initial: true }),
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
      notes: new fields.StringField({ initial: "" })
    };
  }

  /**
   * Get the actual essence cost after grade modifier.
   */
  get actualEssenceCost() {
    const gradeData = CONFIG.SR2E.cyberwareGrades[this.grade];
    return this.essenceCost * (gradeData?.essenceMultiplier || 1.0);
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
      category: new fields.StringField({ initial: "persona", choices: ["persona", "combat", "defense", "sensor", "masking", "other"] }),
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
    // Program memory size = Rating * Multiplier
    this.size = Math.ceil(this.rating * this.multiplier);
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
      contactType: new fields.StringField({ initial: "contact", choices: ["contact", "buddy", "follower"] }),
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
      level: new fields.StringField({ initial: "low", choices: ["streets", "squatter", "low", "middle", "high", "luxury"] }),
      monthlyCost: new fields.NumberField({ initial: 1000, min: 0 }),
      monthsPaid: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      description: new fields.HTMLField({ initial: "" }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    const costTable = CONFIG.SR2E.lifestyles;
    if (costTable[this.level]) {
      this.monthlyCost = costTable[this.level].monthlyCost;
    }
  }
}

/**
 * Data model for Ammunition.
 */
export class AmmoData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ammoType: new fields.StringField({ initial: "regular" }),
      quantity: new fields.NumberField({ integer: true, initial: 10, min: 0 }),
      damageModifier: new fields.NumberField({ integer: true, initial: 0 }),
      armorModifier: new fields.NumberField({ integer: true, initial: 0 }),
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
      focusType: new fields.StringField({ initial: "spell", choices: ["spell", "spirit", "power", "weapon", "spell_lock"] }),
      force: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      bondingCost: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      bonded: new fields.BooleanField({ initial: false }),
      active: new fields.BooleanField({ initial: false }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      notes: new fields.StringField({ initial: "" })
    };
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
      installed: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}
