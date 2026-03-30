import { SR2EDataModel } from "./base-data.mjs";

/**
 * Data model for Shadowrun 2E Player Characters.
 */
export class CharacterData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // --- BIOGRAPHY ---
      biography: new fields.HTMLField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" }),

      // --- RACE ---
      // Set by dragging a race item from the Metatypes compendium onto the sheet.
      // Racial modifiers and maximums are always read from CONFIG.SR2E.racialModifiers
      // and CONFIG.SR2E.racialMaximums using this key — no per-actor overrides needed
      // for the standard five metatypes.
      race: new fields.StringField({ required: true, initial: "human" }),

      // --- PHYSICAL ATTRIBUTES ---
      body: SR2EDataModel.attributeField(3),
      quickness: SR2EDataModel.attributeField(3),
      strength: SR2EDataModel.attributeField(3),

      // --- MENTAL ATTRIBUTES ---
      charisma: SR2EDataModel.attributeField(3),
      intelligence: SR2EDataModel.attributeField(3),
      willpower: SR2EDataModel.attributeField(3),

      // --- SPECIAL ATTRIBUTES ---
      essence: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 6.0, min: 0, max: 6 }),
        max: new fields.NumberField({ required: true, initial: 6.0, min: 0, max: 6 })
      }),
      magic: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        tradition: new fields.StringField({ initial: "none", choices: {
          none: "SR2E.Magic.None", hermetic: "SR2E.Magic.Hermetic", shamanic: "SR2E.Magic.Shamanic"
        }}),
        type: new fields.StringField({ initial: "none", choices: {
          none: "SR2E.Magic.TypeNone", full_magician: "SR2E.Magic.FullMagician",
          physical_adept: "SR2E.Magic.PhysicalAdept", shamanic_adept: "SR2E.Magic.ShamanicAdept",
          magical_adept: "SR2E.Magic.MagicalAdept"
        }}),
        skill: new fields.StringField({ initial: "none", choices: {
          none:      "SR2E.Magic.SkillNone",
          sorcery:   "SR2E.Magic.SkillSorcery",
          conjuring: "SR2E.Magic.SkillConjuring",
          both:      "SR2E.Magic.SkillBoth"
        }}),
        totem: new fields.StringField({ initial: "" }),
        initiateGrade: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      reaction: new fields.SchemaField({
        base: new fields.NumberField({ required: true, integer: true, initial: 3, min: 0 }),
        mod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        value: new fields.NumberField({ required: true, integer: true, initial: 3, min: 0 })
      }),

      // --- CONDITION MONITORS ---
      conditionMonitor: new fields.SchemaField({
        physical: SR2EDataModel.conditionMonitorField(),
        stun: SR2EDataModel.conditionMonitorField(),
        overflow: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // --- DICE POOLS ---
      dicePools: new fields.SchemaField({
        combat: SR2EDataModel.resourceField(0, 0),
        hacking: SR2EDataModel.resourceField(0, 0),
        magic: SR2EDataModel.resourceField(0, 0),
        control: SR2EDataModel.resourceField(0, 0),
        karma: SR2EDataModel.resourceField(0, 0),
        spellDefense: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // --- INITIATIVE ---
      initiative: new fields.SchemaField({
        base: new fields.NumberField({ required: true, integer: true, initial: 3, min: 0 }),
        dice: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 5 }),
        mod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        value: new fields.NumberField({ required: true, integer: true, initial: 3, min: 0 }),
        passes: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 })
      }),

      // --- MOVEMENT ---
      movement: new fields.SchemaField({
        walk: new fields.NumberField({ required: true, integer: true, initial: 3, min: 0 }),
        run: new fields.NumberField({ required: true, integer: true, initial: 9, min: 0 })
      }),

      // --- ARMOR ---
      armor: new fields.SchemaField({
        ballistic: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        impact: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      // --- KARMA ---
      karma: new fields.SchemaField({
        current: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        total: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        pool: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
      }),

      // --- NUYEN ---
      nuyen: new fields.NumberField({ required: true, initial: 0, min: 0 }),

      // --- LIFESTYLE ---
      lifestyle: new fields.StringField({ initial: "low" }),

      // --- CHARACTER CREATION ---
      chargen: new fields.SchemaField({
        priorities: new fields.SchemaField({
          race: new fields.StringField({ initial: "E" }),
          magic: new fields.StringField({ initial: "E" }),
          attributes: new fields.StringField({ initial: "A" }),
          skills: new fields.StringField({ initial: "B" }),
          resources: new fields.StringField({ initial: "C" })
        }),
        attributePointsTotal: new fields.NumberField({ integer: true, initial: 30 }),
        attributePointsSpent: new fields.NumberField({ integer: true, initial: 0 }),
        skillPointsTotal: new fields.NumberField({ integer: true, initial: 30 }),
        skillPointsSpent: new fields.NumberField({ integer: true, initial: 0 }),
        resourcesTotal: new fields.NumberField({ initial: 90000 }),
        resourcesSpent: new fields.NumberField({ initial: 0 }),
        forcePointsTotal: new fields.NumberField({ integer: true, initial: 25 }),
        forcePointsSpent: new fields.NumberField({ integer: true, initial: 0 })
      }),

      // --- PHYSICAL ADEPT POWERS ---
      adeptPowerPoints: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ required: true, initial: 0, min: 0 })
      }),

      // --- MATRIX PERSONA (for Deckers) ---
      matrixPersona: new fields.SchemaField({
        bod: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        evasion: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        masking: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        sensor: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),

      // --- CYBERDECK ---
      cyberdeck: new fields.SchemaField({
        mpcp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        hardening: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        activeMemory: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        storageMemory: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        loadSpeed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        ioSpeed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        response: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),

      // --- VEHICLE CONTROL RIG ---
      vehicleControlRig: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 3 }),

      // --- LINKED VEHICLES ---
      linkedVehicles: new fields.ArrayField(
        new fields.StringField({ required: false, blank: true }),
        { initial: [] }
      )
    };
  }

  /** @override */
  prepareBaseData() {
    // Apply racial modifiers
    this._applyRacialModifiers();
  }

  /** @override */
  prepareDerivedData() {
    // Calculate final attribute values
    this._calculateAttributeValues();

    // Calculate Reaction = (Quickness + Intelligence) / 2
    this.reaction.base = Math.floor((this.quickness.value + this.intelligence.value) / 2);
    this.reaction.value = this.reaction.base + this.reaction.mod;

    // Initiative base = Adjusted Reaction. Wound penalty reduces initiative dice at roll
    // time (not the base score) per SR2E rules.
    this.initiative.base = this.reaction.value;
    this.initiative.value = this.reaction.value;

    // Calculate Essence-based Magic
    if (this.magic.type !== "none") {
      this.magic.max = Math.floor(this.essence.value);
      if (this.magic.value > this.magic.max) {
        this.magic.value = this.magic.max;
      }
    }

    // Calculate Condition Monitor maximums (Body / 2, round up, * 3 + 1 base of 10)
    this.conditionMonitor.physical.max = 10;
    this.conditionMonitor.stun.max = 10;

    // Calculate Dice Pools
    this._calculateDicePools();

    // Calculate Movement
    this.movement.walk = this.quickness.value;
    this.movement.run = this.quickness.value * 3;

    // Calculate Armor from equipped items
    this._calculateArmor();

    // Calculate Adept Power Points (Magic Rating for Physical Adepts)
    if (this.magic.type === "physical_adept") {
      this.adeptPowerPoints.max = this.magic.value;
    }
  }

  /**
   * Apply racial attribute modifiers based on selected race using the CONFIG table.
   * @private
   */
  _applyRacialModifiers() {
    const raceMods = CONFIG.SR2E.racialModifiers[this.race] || {};
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      if (this[attr]) {
        this[attr].racial = raceMods[attr] ?? 0;
      }
    }
  }

  /**
   * Calculate final attribute values from base + racial + mod.
   * @private
   */
  _calculateAttributeValues() {
    const maxes = CONFIG.SR2E.racialMaximums[this.race] ?? {};
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      if (this[attr]) {
        this[attr].value = this[attr].base + this[attr].racial + this[attr].mod;
        // Enforce minimum of 1
        if (this[attr].value < 1) this[attr].value = 1;
        // Enforce racial maximum
        if (maxes[attr] != null && this[attr].value > maxes[attr]) {
          this[attr].value = maxes[attr];
        }
      }
    }
  }

  /**
   * Calculate dice pools.
   * Combat Pool = (Quickness + Intelligence + Willpower) / 2, round down
   * Hacking Pool = (Computer Skill + MPCP) / 3 (calculated when cyberdeck is present)
   * Magic Pool = (combined from Magic rating + Initiate Grade) / 2
   * Control Pool = (Vehicle Control Rig rating * 2) or (Reaction) / 2
   * @private
   */
  _calculateDicePools() {
    // Helper: preserve dice already spent between re-preparations.
    // When a pool is first initialised its saved max is 0; treat that as
    // "full" (no dice spent yet).  Once we have persisted a non-zero max we
    // can derive spent = savedMax - savedValue and carry it forward.
    const applyPool = (pool, newMax) => {
      const savedMax   = pool.max;
      const savedValue = pool.value;
      const spent = savedMax > 0 ? Math.max(0, savedMax - savedValue) : 0;
      pool.max   = newMax;
      pool.value = Math.max(0, newMax - spent);
    };

    // Combat Pool = floor((Quickness + Intelligence + Willpower) / 2)
    const combatPool = Math.floor(
      (this.quickness.value + this.intelligence.value + this.willpower.value) / 2
    );
    applyPool(this.dicePools.combat, combatPool);

    // Magic Pool = Sorcery Skill Rating + rating of active bonded power foci
    // (SR2E p.84: "equal to his or her Sorcery Skill Rating... plus the rating
    //  of any applicable power foci")
    if (this.magic.type !== "none" && this.magic.type !== "physical_adept") {
      let sorceryRating = 0;
      let powerFociBonus = 0;
      if (this.parent?.items) {
        for (const item of this.parent.items) {
          if (item.type === "skill" && item.name.toLowerCase() === "sorcery") {
            sorceryRating = item.system.rating;
          }
          if (item.type === "focus" && item.system.focusType === "power" &&
              item.system.bonded && item.system.active) {
            powerFociBonus += item.system.force;
          }
        }
      }
      const magicPool = sorceryRating + powerFociBonus;
      applyPool(this.dicePools.magic, magicPool);
    }

    // Control Pool = Reaction (modified only by vehicle control rig)
    // (SR2E p.84: "equal to the character's Reaction, modified only by a VCR")
    if (this.vehicleControlRig > 0) {
      // Reaction already includes any VCR modifier from cyberware attributeMods.
      // The control pool is the Reaction value (final, post-cyberware) for riggers.
      const controlPool = this.reaction.value;
      applyPool(this.dicePools.control, controlPool);
    }

    // Hacking Pool = Computer Skill + Reaction (SR2E p.84)
    // Note: actor.mjs _recalculateHackingPool() re-runs after cyberware is applied
    // and will override this with the final post-cyberware values.
    if (this.cyberdeck.mpcp > 0) {
      let computerSkill = 0;
      if (this.parent?.items) {
        for (const item of this.parent.items) {
          if (item.type === "skill" && item.name.toLowerCase() === "computer") {
            computerSkill = item.system.rating;
            break;
          }
        }
      }
      const hackingPool = computerSkill + this.reaction.value;
      this.dicePools.hacking.max   = hackingPool;
      this.dicePools.hacking.value = hackingPool;
    }
  }

  /**
   * Calculate total armor from equipped armor items.
   * @private
   */
  _calculateArmor() {
    let ballistic = 0;
    let impact = 0;
    if (this.parent?.items) {
      for (const item of this.parent.items) {
        if (item.type === "armor" && item.system.equipped) {
          ballistic += item.system.ballistic || 0;
          impact += item.system.impact || 0;
        }
      }
    }
    // Add troll dermal armor
    if (this.race === "troll") {
      ballistic += 1;
      impact += 1;
    }
    this.armor.ballistic = ballistic;
    this.armor.impact = impact;
  }

  /**
   * Get the wound penalty modifier based on current damage.
   * @returns {number}
   */
  get woundPenalty() {
    const physical = this.conditionMonitor.physical.value;
    const stun = this.conditionMonitor.stun.value;
    const maxDamage = Math.max(physical, stun);
    if (maxDamage <= 0) return 0;
    if (maxDamage <= 3) return 1;  // Light
    if (maxDamage <= 6) return 2;  // Moderate
    if (maxDamage <= 9) return 3;  // Serious
    return 4; // Deadly
  }

  /**
   * Get the current wound level label.
   */
  get woundLevel() {
    const maxDamage = Math.max(
      this.conditionMonitor.physical.value,
      this.conditionMonitor.stun.value
    );
    if (maxDamage <= 0) return "Undamaged";
    if (maxDamage <= 3) return "Light";
    if (maxDamage <= 6) return "Moderate";
    if (maxDamage <= 9) return "Serious";
    return "Deadly";
  }

  /**
   * Check if the character is a magician of any type.
   */
  get isMagical() {
    return this.magic.type !== "none";
  }

  /**
   * Check if character has decking capability.
   */
  get isDecker() {
    return this.cyberdeck.mpcp > 0;
  }

  /**
   * Check if character is a rigger.
   */
  get isRigger() {
    return this.vehicleControlRig > 0;
  }
}

/**
 * Data model for NPCs / Grunts.
 */
export class NPCData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      biography: new fields.HTMLField({ initial: "" }),
      race: new fields.StringField({ required: true, initial: "human" }),
      professionalRating: new fields.NumberField({ integer: true, initial: 1, min: 0, max: 6 }),

      // Attributes
      body: SR2EDataModel.attributeField(3),
      quickness: SR2EDataModel.attributeField(3),
      strength: SR2EDataModel.attributeField(3),
      charisma: SR2EDataModel.attributeField(3),
      intelligence: SR2EDataModel.attributeField(3),
      willpower: SR2EDataModel.attributeField(3),
      essence: new fields.SchemaField({
        value: new fields.NumberField({ initial: 6.0, min: 0, max: 6 }),
        max: new fields.NumberField({ initial: 6.0, min: 0, max: 6 })
      }),
      magic: new fields.SchemaField({
        value: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        tradition: new fields.StringField({ initial: "none" }),
        type: new fields.StringField({ initial: "none" }),
        totem: new fields.StringField({ initial: "" })
      }),
      reaction: new fields.SchemaField({
        base: new fields.NumberField({ integer: true, initial: 3, min: 0 }),
        mod: new fields.NumberField({ integer: true, initial: 0 }),
        value: new fields.NumberField({ integer: true, initial: 3, min: 0 })
      }),

      // Condition
      conditionMonitor: new fields.SchemaField({
        physical: SR2EDataModel.conditionMonitorField(),
        stun: SR2EDataModel.conditionMonitorField(),
        overflow: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),

      // Armor
      armor: new fields.SchemaField({
        ballistic: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        impact: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),

      // Dice Pools
      dicePools: new fields.SchemaField({
        combat: SR2EDataModel.resourceField(0, 0),
        magic: SR2EDataModel.resourceField(0, 0)
      }),

      // Initiative
      initiative: new fields.SchemaField({
        base: new fields.NumberField({ integer: true, initial: 3, min: 0 }),
        dice: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
        mod: new fields.NumberField({ integer: true, initial: 0 }),
        value: new fields.NumberField({ integer: true, initial: 3, min: 0 })
      }),

      // Threat Rating
      threatRating: new fields.NumberField({ integer: true, initial: 1, min: 0 }),

      // Nuyen
      nuyen: new fields.NumberField({ initial: 0, min: 0 }),

      // Movement
      movement: new fields.SchemaField({
        walk: new fields.NumberField({ integer: true, initial: 3, min: 0 }),
        run: new fields.NumberField({ integer: true, initial: 9, min: 0 })
      })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Calculate attribute values
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      if (this[attr]) {
        this[attr].value = this[attr].base + this[attr].mod;
        if (this[attr].value < 1) this[attr].value = 1;
      }
    }

    // Reaction
    this.reaction.base = Math.floor((this.quickness.value + this.intelligence.value) / 2);
    this.reaction.value = this.reaction.base + this.reaction.mod;

    // Initiative base = Adjusted Reaction. Wound penalty reduces initiative dice at roll
    // time (not the base score) per SR2E rules.
    this.initiative.base = this.reaction.value;
    this.initiative.value = this.reaction.value;

    // Combat Pool — preserve spent dice across re-preparations
    const combatPool = Math.floor(
      (this.quickness.value + this.intelligence.value + this.willpower.value) / 2
    );
    const npcSpent = this.dicePools.combat.max > 0
      ? Math.max(0, this.dicePools.combat.max - this.dicePools.combat.value)
      : 0;
    this.dicePools.combat.max   = combatPool;
    this.dicePools.combat.value = Math.max(0, combatPool - npcSpent);

    // Movement
    this.movement.walk = this.quickness.value;
    this.movement.run = this.quickness.value * 3;

    // Condition monitors
    this.conditionMonitor.physical.max = 10;
    this.conditionMonitor.stun.max = 10;
  }

  /**
   * Get the wound penalty modifier based on current damage.
   * @returns {number}
   */
  get woundPenalty() {
    const physical = this.conditionMonitor.physical.value;
    const stun = this.conditionMonitor.stun.value;
    const maxDamage = Math.max(physical, stun);
    if (maxDamage <= 0) return 0;
    if (maxDamage <= 3) return 1;  // Light
    if (maxDamage <= 6) return 2;  // Moderate
    if (maxDamage <= 9) return 3;  // Serious
    return 4;                      // Deadly
  }

  /**
   * Get the current wound level label.
   */
  get woundLevel() {
    const maxDamage = Math.max(
      this.conditionMonitor.physical.value,
      this.conditionMonitor.stun.value
    );
    if (maxDamage <= 0) return "Undamaged";
    if (maxDamage <= 3) return "Light";
    if (maxDamage <= 6) return "Moderate";
    if (maxDamage <= 9) return "Serious";
    return "Deadly";
  }
}

/**
 * Data model for Vehicles.
 */
export class VehicleData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      vehicleType: new fields.StringField({ initial: "ground" }),
      handling: new fields.NumberField({ integer: true, initial: 3, min: 0 }),
      speed: new fields.NumberField({ integer: true, initial: 60, min: 0 }),
      acceleration: new fields.NumberField({ integer: true, initial: 5, min: 0 }),
      body: new fields.NumberField({ integer: true, initial: 3, min: 0 }),
      armor: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      signature: new fields.NumberField({ integer: true, initial: 2, min: 0 }),
      pilot: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      sensor: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      cargo: new fields.NumberField({ initial: 0, min: 0 }),
      load: new fields.NumberField({ initial: 0, min: 0 }),
      seating: new fields.StringField({ initial: "2" }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      conditionMonitor: new fields.SchemaField({
        value: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ integer: true, initial: 10, min: 0 })
      }),
      autonav: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      notes: new fields.HTMLField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Vehicle condition monitor based on Body
    this.conditionMonitor.max = this.body * 2 + 4;
  }
}

/**
 * Data model for Spirits/Elementals.
 */
export class SpiritData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      spiritType: new fields.StringField({ initial: "nature" }),
      force: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      domain: new fields.StringField({ initial: "" }),
      services: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Derived from Force
      body: SR2EDataModel.attributeField(1),
      quickness: SR2EDataModel.attributeField(1),
      strength: SR2EDataModel.attributeField(1),
      charisma: SR2EDataModel.attributeField(1),
      intelligence: SR2EDataModel.attributeField(1),
      willpower: SR2EDataModel.attributeField(1),
      essence: new fields.SchemaField({
        value: new fields.NumberField({ initial: 1, min: 0 }),
        max: new fields.NumberField({ initial: 1, min: 0 })
      }),
      reaction: new fields.SchemaField({
        base: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
        mod: new fields.NumberField({ integer: true, initial: 0 }),
        value: new fields.NumberField({ integer: true, initial: 1, min: 0 })
      }),

      conditionMonitor: new fields.SchemaField({
        physical: SR2EDataModel.conditionMonitorField(),
        stun: SR2EDataModel.conditionMonitorField()
      }),

      initiative: new fields.SchemaField({
        base: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
        dice: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
        mod: new fields.NumberField({ integer: true, initial: 0 }),
        value: new fields.NumberField({ integer: true, initial: 1, min: 0 })
      }),

      powers: new fields.ArrayField(new fields.StringField()),
      weaknesses: new fields.ArrayField(new fields.StringField()),
      notes: new fields.HTMLField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Spirit attributes are generally equal to Force
    // Specific spirit types may override individual attributes
    const f = this.force;
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      this[attr].base = f;
      this[attr].value = f + this[attr].mod;
    }
    this.essence.value = f;
    this.essence.max = f;
    this.reaction.base = f;
    this.reaction.value = f + this.reaction.mod;
    this.initiative.base = f;
    this.initiative.value = f + this.initiative.mod;

    // Condition monitors
    this.conditionMonitor.physical.max = f * 2;
    this.conditionMonitor.stun.max = f * 2;
  }
}

/**
 * Data model for IC (Intrusion Countermeasures) in the Matrix.
 */
export class ICData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      icType: new fields.StringField({ initial: "white" }),
      rating: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      // IC Persona attributes
      bod: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      evasion: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      masking: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      sensor: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      attack: new fields.NumberField({ integer: true, initial: 1, min: 0 }),

      conditionMonitor: new fields.SchemaField({
        value: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ integer: true, initial: 10, min: 0 })
      }),

      initiative: new fields.SchemaField({
        base: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
        dice: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
        value: new fields.NumberField({ integer: true, initial: 1, min: 0 })
      }),

      specialAbilities: new fields.ArrayField(new fields.StringField()),
      notes: new fields.HTMLField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    this.conditionMonitor.max = this.rating * 2;
    this.initiative.base = this.rating;
    this.initiative.value = this.rating;
  }
}
