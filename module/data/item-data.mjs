import { SR2EDataModel } from "./base-data.mjs";
import { programSize, programCost, programCostVR2, focusCost, skillsoftMemory, skillsoftCost, skillSubRatings, effectiveBodyCost, cranialDeckEssence, gradeEssenceCost, derivedItemCost } from "../rules/sr2e-rules.mjs";

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
    // Concentration/Specialization ratings (SR2E p.55, p.70). The entered
    // `rating` is the FINAL general rating (already reduced): allocating 5
    // points with a Specialization yields general 3 / concentration 5 /
    // specialization 7 — so conc = general + 2 and spec = general + 4.
    // (A concentration alone: allocated 5 → general 4 / concentration 6.)
    const sub = skillSubRatings(this.rating);
    if (this.concentration.name) this.concentration.rating = sub.concentration;
    if (this.specialization.name) this.specialization.rating = sub.specialization;
  }

  /**
   * Get the effective rating for a given use (general, concentration, or specialization).
   * @param {string} [use] - "general", "concentration", or "specialization"
   */
  getEffectiveRating(use = "general") {
    if (use === "specialization" && this.specialization.name) {
      return this.specialization.rating;
    }
    if (use === "concentration" && this.concentration.name) {
      return this.concentration.rating;
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

      // Shotgun choke (SR2E p.95): 0 = not a shotgun; 2–10 enables firing shot
      // rounds, which spread into a cone (the higher the choke, the slower the
      // spread). Drives the "fire shot (spread)" option in the attack dialog.
      choke: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 10 }),

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

      // Weapon Focus (SR2E p.126): a melee weapon may itself be a magical focus.
      // When bonded, its Force is added in dice to the wielder's melee attacks.
      weaponFocusForce: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      focusBonded: new fields.BooleanField({ initial: false }),

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
      // Street Index: black-market price multiplier (street price = cost × SI)
      streetIndex: new fields.NumberField({ initial: 1, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      equipped: new fields.BooleanField({ initial: false }),
      accessories: new fields.ArrayField(new fields.StringField()),
      // Area weapons (grenades, rockets, missiles). When set, the weapon resolves
      // as a blast: Power falls off with distance and every token in the radius
      // resists individually (core p.96). "" = a normal single-target weapon.
      blastType: new fields.StringField({ initial: "", blank: true, choices: {
        "": "—", offensive: "Offensive", defensive: "Defensive", concussion: "Concussion",
        // Smoke: no damage — drops a visibility-impairing cloud template
        smoke: "Smoke (no damage)"
      }}),
      // Aerodynamic thrown weapon (shuriken, aerodynamic grenades — SR2 p.96):
      // scatters 2D6/−4-per-success (vs a standard grenade's 1D6/−2) and reaches
      // Str×20/×30 at long/extreme (vs ×10/×20). Only meaningful for throwing/
      // grenade weapons; the scatter half applies only when blastType is set.
      aerodynamic: new fields.BooleanField({ initial: false }),
      // Consumable count for thrown weapons (grenades, knives, shuriken): they
      // stack instead of reloading, and throwing one decrements this.
      quantity: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
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
      // Street Index: black-market price multiplier (street price = cost × SI)
      streetIndex: new fields.NumberField({ initial: 1, min: 0 }),
      equipped: new fields.BooleanField({ initial: false }),
      // Layered armor ADDS to the highest worn rating instead of competing
      // with it: helmets (p.242) and form-fitting body armor (SSC).
      isLayered: new fields.BooleanField({ initial: false }),
      // Partial/full heavy armor: Combat Pool −1 per point of Ballistic over
      // the wearer's Quickness (SR2E p.84).
      heavyArmor: new fields.BooleanField({ initial: false }),
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
      // Marks a spell as "magical healing" for the bioware interference rule
      // (Shadowtech p.6). Not the same set as the health category — Increase
      // Reflexes is a health spell but heals nothing. Flagged per-spell so a GM
      // can tick it for homebrew healing spells.
      healsDamage: new fields.BooleanField({ initial: false }),
      // Sustained-spell state (SR2E p.130): while sustaining, the caster takes
      // +2 TN on all other tests per spell — unless a spell lock holds it.
      sustaining: new fields.BooleanField({ initial: false }),
      sustainedForce: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      spellLocked: new fields.BooleanField({ initial: false }),
      // Quickened (Grimoire p.44): an initiate has paid Karma to make this
      // sustained spell permanent — it keeps running with no sustaining penalty.
      quickened: new fields.BooleanField({ initial: false }),
      quickeningKarma: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
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
      // Custom cyberware from a Shadow Clinic (SSC p.98). Alpha and Beta are the
      // only grades SR2 offers — deltaware is an SR3 concept.
      grade: new fields.StringField({ initial: "standard", choices: {
        standard: "SR2E.Cyberware.Standard", alpha: "SR2E.Cyberware.Alpha",
        beta: "SR2E.Cyberware.Beta"
      }}),
      essenceCost: new fields.NumberField({ required: true, initial: 0.5, min: 0 }),
      rating: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      streetIndex: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      installed: new fields.BooleanField({ initial: true }),
      // Cyber-implant melee weapon (spurs, hand razors, hand blades — SR2 p.256).
      // When isWeapon, this cyberware also appears in the combat tab and rolls
      // through the shared melee attack path (item.isWeaponLike). Only these
      // melee-relevant fields are needed — no ammo/ranges/firing modes.
      isWeapon: new fields.BooleanField({ initial: false }),
      weaponType: new fields.StringField({ initial: "melee" }),
      skill: new fields.StringField({ initial: "armed combat" }),
      damageCode: new fields.StringField({ initial: "" }),
      damageType: new fields.StringField({ initial: "physical" }),
      reach: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Combat TN modifier — negative values reduce the attack TN (e.g. −1 for Smartlink).
      // Applied only when the target weapon has smartgunCompatible = true.
      combatTnMod: new fields.NumberField({ integer: true, initial: 0 }),
      // Vehicle Control Rig: when true, this item's rating sets the character's
      // VCR level (Control Pool, rigging bonuses). The VCR's Reaction/Initiative
      // bonuses apply only while jacked in (SR2E p.85) — do NOT also give the
      // item attributeMods for them.
      isVcr: new fields.BooleanField({ initial: false }),
      // Tactical computer (Shadowtech p.53): its rating adds to Initiative, up
      // to the natural Reaction maximum. Set the *effective* level here — extra
      // senses (+1 each) and an orientation system (+2) raise it, and the book
      // leaves that tally to the GM.
      isTacticalComputer: new fields.BooleanField({ initial: false }),
      // Power added to the wearer's unarmed blows — bone lacing (Shadowtech
      // p.42): plastic +1, aluminum +2, titanium +3. The highest installed value
      // wins rather than summing; the laces are alternatives, not stackable.
      unarmedPowerBonus: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Muscle Replacement (SR2E p.249) and Muscle Augmentation (Shadowtech)
      // raise Strength AND Quickness, but "this change does not affect
      // Reaction". When set, the item's Quickness bonus is excluded from the
      // Reaction calculation (but still counts for Combat Pool and tests).
      noReactionBonus: new fields.BooleanField({ initial: false }),
      // Cyber-implant armor cumulative with worn armor (Bone Lacing aluminum/
      // titanium, Shadowtech p.42; Dermal Plating). Added in _calculateArmor.
      armorBallistic: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      armorImpact:    new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Cranial cyberdeck / "C2" (Matrixware, Shadowtech p.54–59). The book: "C2
      // decks operate exactly like regular cyberdecks", so this carries the SAME
      // deck block as a gear cyberdeck — the actor's deck snapshot, Matrix tab,
      // persona derivation and cybercombat all consume it unchanged. Essence is
      // DERIVED from the component ratings (see actualEssenceCost).
      cranialDeck: new fields.BooleanField({ initial: false }),
      deck: new fields.SchemaField({
        active: new fields.BooleanField({ initial: false }),
        mpcp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        hardening: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        activeMemory: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        storageMemory: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        loadSpeed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        ioSpeed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        response: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),
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
    // A cranial cyberdeck's Essence is the sum of its installed Matrixware
    // components, derived from the deck's own ratings (Shadowtech p.54–59),
    // rather than a flat authored value.
    const base = this.cranialDeck
      ? cranialDeckEssence(this.deck)
      : this.essenceCost + (this.capacityOver ?? 0);
    // Grade reduction rounds UP and floors at .05 (SSC p.98) — see gradeEssenceCost.
    return gradeEssenceCost(base, this.grade);
  }
}

/**
 * Data model for Bioware (Shadowtech FASA7110). Bioware mirrors cyberware's
 * shape (so `_collectItemModifiers` reads `attributeMods` uniformly) but costs
 * BODY INDEX rather than Essence in the cyber sense: a `bodyCost` that sums into
 * the character's Body Index, and — for the magically active only — an Essence
 * loss equal to that Body Cost (Shadowtech p.6). Grades are standard/cultured
 * (cultured = 0.75× Body Cost, p.7), NOT the cyberware alpha/beta grades.
 */
export class BiowareData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Body system this bioware augments — sheet grouping + flavor, non-mechanical.
      bodySystem: new fields.StringField({ initial: "structural", choices: {
        circulatory: "SR2E.Bioware.System.Circulatory", dermal: "SR2E.Bioware.System.Dermal",
        endocrine: "SR2E.Bioware.System.Endocrine", hepatic: "SR2E.Bioware.System.Hepatic",
        lymphatic: "SR2E.Bioware.System.Lymphatic", neural: "SR2E.Bioware.System.Neural",
        renal: "SR2E.Bioware.System.Renal", respiratory: "SR2E.Bioware.System.Respiratory",
        structural: "SR2E.Bioware.System.Structural"
      }}),
      grade: new fields.StringField({ initial: "standard", choices: {
        standard: "SR2E.Bioware.Standard", cultured: "SR2E.Bioware.Cultured"
      }}),
      // Listed (pre-grade) Body Cost. actualBodyCost applies the cultured multiplier.
      bodyCost: new fields.NumberField({ required: true, initial: 0.25, min: 0 }),
      rating: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      streetIndex: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      installed: new fields.BooleanField({ initial: true }),
      // Triggered bioware (Adrenal Pump, Pain Editor): the attribute mods apply
      // only while ACTIVATED. `triggered` = catalog flag; `active` = the player's
      // on/off toggle. Body Index / Essence always count (the implant is there);
      // only the mods are gated. Non-triggered implants ignore both.
      triggered: new fields.BooleanField({ initial: false }),
      active: new fields.BooleanField({ initial: false }),
      // Per-rating stats. Rows carry rating-dependent BODY COST (not essenceCost)
      // and optional per-rating ARMOR (Orthoskin's non-linear ballistic/impact).
      // Rows must have sorted, unique ratings (enforced by the content validator
      // and the item-sheet add-row action). prepareDerivedData copies the row.
      ratingStats: new fields.ArrayField(
        new fields.SchemaField({
          rating:       new fields.NumberField({ integer: true, initial: 1, min: 1 }),
          bodyCost:     new fields.NumberField({ initial: 0, min: 0 }),
          cost:         new fields.NumberField({ initial: 0, min: 0 }),
          availability: new fields.StringField({ initial: "" }),
          streetIndex:  new fields.StringField({ initial: "" }),
          armorBallistic: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          armorImpact:    new fields.NumberField({ integer: true, initial: 0, min: 0 })
        }),
        { initial: [] }
      ),
      // Armor granted while installed (Orthoskin). For rated items this is copied
      // from the active rating row in prepareDerivedData.
      armorBallistic: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      armorImpact:    new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Attribute modifiers — same shape/keys as CyberwareData so the actor's
      // `_collectItemModifiers` walks bioware and cyberware identically. These are
      // PER-LEVEL values: the collector multiplies them by the item's Rating
      // (every rated attribute bioware in Shadowtech scales linearly per level).
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
      // When set, this item's Quickness bonus does NOT feed Reaction (Adrenal
      // Pump: "Quickness raised in this manner does not also affect Reaction").
      // Muscle Augmentation/Suprathyroid Quickness DOES feed Reaction — leave off.
      noReactionBonus: new fields.BooleanField({ initial: false }),
      // Dice added to every ACTIVE SKILL Success Test while installed — Enhanced
      // Articulation (Shadowtech p.34): "Possessors of enhanced articulation roll
      // an additional die when making any Success Test involving an Active Skill."
      // Applied RAW: in SR2 the Active Skills include Sorcery/Conjuring and the
      // social skills, and unlike ActiveSofts (core p.243) the book carves out no
      // exception here. The prose calls them "motion-intensive", but that already
      // doesn't describe Etiquette — "(Active Skills)" is the operative rule.
      activeSkillDice: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Damage Compensator (Shadowtech p.24): a damage track at or below this
      // item's Rating inflicts no Injury Modifier; over it, the penalty is full.
      damageCompensator: new fields.BooleanField({ initial: false }),
      // Pain Editor (p.26): while ACTIVE, mental/Stun wound penalties are ignored.
      ignoresStunPenalty: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Rated bioware: copy the selected rating row into the flat fields (mirrors
    // CyberwareData). Rows are sorted; on no exact match, clamp to the NEAREST
    // rating rather than blindly using the last row.
    if (this.ratingStats?.length > 0) {
      const rows = [...this.ratingStats].sort((a, b) => a.rating - b.rating);
      let row = rows.find(r => r.rating === this.rating);
      if (!row) {
        row = rows.reduce((best, r) =>
          Math.abs(r.rating - this.rating) < Math.abs(best.rating - this.rating) ? r : best, rows[0]);
      }
      if (row) {
        this.bodyCost       = row.bodyCost;
        this.cost           = row.cost;
        this.availability   = row.availability;
        this.streetIndex    = row.streetIndex;
        this.armorBallistic = row.armorBallistic;
        this.armorImpact    = row.armorImpact;
      }
    }
  }

  /**
   * Effective Body Cost after grade (cultured = 0.75×). Unrounded — the single
   * canonical value the actor's Body Index / Essence math and the sheet both
   * consume (sheet rounds for display only). Shadowtech p.7.
   */
  get actualBodyCost() {
    return effectiveBodyCost(this.bodyCost, this.grade);
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
      // Street Index: black-market price multiplier (street price = cost × SI)
      streetIndex: new fields.NumberField({ initial: 1, min: 0 }),
      weight: new fields.NumberField({ initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      availability: new fields.StringField({ initial: "" }),
      legality: new fields.StringField({ initial: "Legal" }),
      equipped: new fields.BooleanField({ initial: false }),
      concealability: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Cyberdeck (SR2 p.140). A gear item with category "cyberdeck" carries a
      // deck's machine-readable specs here. When `deck.active` (only one deck
      // active per character), these snapshot onto the actor's system.cyberdeck.*
      // and drive the Matrix tab. Field names MIRROR the actor's cyberdeck schema
      // exactly so the snapshot is a straight copy. Persona attributes still come
      // from loaded persona program items (capped by MPCP), not the deck.
      deck: new fields.SchemaField({
        active: new fields.BooleanField({ initial: false }),
        mpcp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        hardening: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        activeMemory: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        storageMemory: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        loadSpeed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        ioSpeed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        response: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),

      // Weapon accessory (Laser Sight, Smartgun System, Gas-vent, Gyro Mount,
      // Bipod, Silencer, etc.): a mod that attaches to ONE weapon at a time
      // rather than being merely equipped. While linked, its modifiers apply to
      // that weapon's attacks. Aftermarket accessories are freely removable and
      // transferable between weapons; gas-vent systems, under-barrel grenade
      // launchers and "integral" factory accessories are not (SR2E p.240–241).
      weaponAccessory: new fields.BooleanField({ initial: false }),
      linkedWeaponId: new fields.StringField({ initial: "" }),
      combatTnMod: new fields.NumberField({ integer: true, initial: 0 }),
      accessoryRecoilComp: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // "Once installed, gas-vent systems cannot be removed" (p.240) — locks
      // the attach dropdown once linked (edit the item directly to override).
      permanentAccessory: new fields.BooleanField({ initial: false }),
      // Bipod/tripod: recoil comp counts only when set up — fired from a braced
      // sitting/lying position (p.240–241). The attack dialog gets a checkbox.
      requiresDeployment: new fields.BooleanField({ initial: false }),
      // Smartgun system (internal/external): makes the weapon a smartweapon
      // (p.241). The −2/−1 TN comes from the shooter's smartlink cyberware or
      // equipped smart goggles (p.90) — without a receptor it is dead weight.
      grantsSmartgun: new fields.BooleanField({ initial: false }),
      // Worn receptor: smart goggles give −1 TN with a smartweapon (p.90).
      smartGoggles: new fields.BooleanField({ initial: false }),
      // Laser sight: −1 TN (combatTnMod), but only ≤ 50 m and never combined
      // with a smartlink/goggles bonus (p.90, p.240). Flag lets the roll gate it.
      laserSight: new fields.BooleanField({ initial: false }),
      // Gyro stabilization: rating eats recoil + attacker movement modifiers,
      // cumulative with recoil comp (p.90, p.240).
      gyroRating: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Imaging scope magnification: shifts the range bracket left by rating,
      // short range is the floor (Image Modification Systems, p.88).
      rangeShift: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Skillsoft (category === "skillsoft"): a chip run through a chipjack +
      // Skillwires that grants a skill at its Rating while slotted (SR2E p.243).
      // The granted skill shows on the Skills tab; if it duplicates a natural
      // skill, the soft's rating REPLACES it while slotted ("the character's
      // natural ability is lost for the duration of the skillsoft access").
      slotted: new fields.BooleanField({ initial: false }),
      grantedSkill: new fields.StringField({ initial: "" }),
      // "data" is a DataSoft: a pure data library that grants no skill, read
      // through a datasoft link or headware memory. It needs NO skillwires, so it
      // has to be distinguishable from an ActiveSoft — a null here used to coerce
      // to "active", which made every DataSoft consume skillwire capacity and go
      // over-budget on a character who had none.
      grantedSkillCategory: new fields.StringField({ initial: "active", choices: {
        active: "active", knowledge: "knowledge", language: "language", data: "data"
      }}),
      grantedSkillAttribute: new fields.StringField({ initial: "intelligence" }),

      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Skillsoft Memory (Mp) and nuyen cost come straight off the Skill Memory
    // Table by type + rating (SR2E p.243, p.248), overriding any manual cost.
    if (this.category === "skillsoft") {
      this.mp = skillsoftMemory(this.grantedSkillCategory, this.rating);
      // Route through the SHARED derivation (rules.derivedItemCost) so the purchase
      // hook — which must price HYPOTHETICAL configurations — can never disagree
      // with what the sheet shows. Read the AUTHORED price off _source: this.cost is
      // what we're about to overwrite, so passing it would feed the derived value
      // back in as though a GM had typed it. Only a DataSoft honours it.
      this.cost = derivedItemCost({ type: "gear", category: this.category,
                                    grantedSkillCategory: this.grantedSkillCategory,
                                    rating: this.rating },
                                  { authoredCost: this._source?.cost ?? 0 });
    }
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
    // Program memory size = Rating² × Multiplier (same in both rulesets).
    this.size = programSize(this.rating, this.multiplier);
    // Cost: core book is a flat Size × 100 (p.174–177); VR2.0 tiers the price
    // multiplier by rating (Program Prices Table, p.107). try/catch: data prep
    // can run before settings are registered (default to the core formula).
    let vr2 = false;
    try { vr2 = game.settings.get("sr2e", "matrixRuleset") === "vr2"; } catch (e) { /* core */ }
    // Shared derivation — the ruleset is read HERE and passed in, because the rules
    // module is Foundry-free and must not touch game.settings itself.
    this.cost = derivedItemCost({ type: "program", rating: this.rating,
                                  multiplier: this.multiplier }, { vr2 });
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
      // Effects provided by this power. Values are PER LEVEL — the derived-data
      // pipeline multiplies by system.level (Increased Reaction +1/level,
      // Improved Physical Attributes +1/level, Increased Reflexes +1 die/level).
      attributeMods: new fields.SchemaField({
        body: new fields.NumberField({ integer: true, initial: 0 }),
        quickness: new fields.NumberField({ integer: true, initial: 0 }),
        strength: new fields.NumberField({ integer: true, initial: 0 }),
        reaction: new fields.NumberField({ integer: true, initial: 0 }),
        initiativeDice: new fields.NumberField({ integer: true, initial: 0 })
      }),
      // Improved Ability boosts one named Active Skill by +1 die per level
      // (SR2E p.125). The skill name is matched on the Skills tab.
      improvedSkill: new fields.StringField({ initial: "" }),
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
      // Relationship tiers follow the SR Companion: Contact / Buddy / Friend For
      // Life (rising Loyalty), Follower (a hireling/dependent), and Enemy.
      contactType: new fields.StringField({ initial: "contact", choices: {
        contact: "SR2E.Contact.Contact", buddy: "SR2E.Contact.Buddy",
        friend: "SR2E.Contact.Friend", follower: "SR2E.Contact.Follower",
        enemy: "SR2E.Contact.Enemy"
      }}),
      archetype: new fields.StringField({ initial: "" }),
      // For allies, Loyalty (how reliably they come through for you).
      // For enemies, the same column reads as the foe's animosity / grudge.
      loyalty: new fields.NumberField({ integer: true, initial: 1, min: 1, max: 6 }),
      // Connection / Influence: the contact's reach and resources (1-6).
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
      // Street Index: black-market price multiplier (street price = cost × SI)
      streetIndex: new fields.NumberField({ initial: 1, min: 0 }),
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
      // Weapon focus (focusType "weapon"): the id of the melee weapon item on the
      // same actor this focus is bonded to. Its Reach drives the price and it
      // gains the focus's Force in dice; astral attacks manifest it (SR2E p.126).
      bondedWeaponId: new fields.StringField({ initial: "", blank: true }),
      // Single-use foci (Grimoire fetish foci): a "Spend" button on the magic tab
      // expends the item after enhancing one casting.
      expendable: new fields.BooleanField({ initial: false }),
      // Per-Force nuyen unit cost (SR2E p.249). When > 0, the cost is derived as
      // Force × this; 0 leaves the cost field manually editable (custom foci).
      costPerForce: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      cost: new fields.NumberField({ initial: 0, min: 0 }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Shared derivation. No bondedWeaponReach here: a weapon focus prices off its
    // bonded weapon, which lives on the ACTOR — CharacterData._applyWeaponFoci runs
    // after this and supplies the Reach.
    if (this.costPerForce > 0) {
      this.cost = derivedItemCost({ type: "focus", force: this.force,
                                    costPerForce: this.costPerForce }) ?? this.cost;
    }
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

      // Which Attribute this quality acts on. Blank for the vast majority.
      // Essence/Reaction/Magic are excluded: "The bonus Attribute Point can be
      // added to any Attribute except Essence, Reaction or Magic" (Companion,
      // Attribute Edges) — and Reaction is derived here anyway.
      attribute: new fields.StringField({ initial: "", blank: true, choices: {
        "": "SR2E.Quality.NoAttribute",
        body: "SR2E.Attributes.Body", quickness: "SR2E.Attributes.Quickness",
        strength: "SR2E.Attributes.Strength", charisma: "SR2E.Attributes.Charisma",
        intelligence: "SR2E.Attributes.Intelligence", willpower: "SR2E.Attributes.Willpower"
      }}),
      // Bonus Attribute Point (Companion, Value 1 each): raises the RATING of
      // `attribute`. Counts as part of the NATURAL attribute — the book bounds it
      // by the racial maximum, and a bonus in `mod` would escape that clamp. Max 5
      // by the book; not enforced, because the same paragraph lets the GM allow
      // more (this system warns rather than blocks — cf. the Body Index cap).
      attributeBonus: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // Exceptional Attribute (Companion, Value 2 each): raises the racial MAXIMUM
      // of `attribute` by 1. "Exceptional Attribute simply raises the maximum — it
      // does not increase the character's actual Attribute Rating to the new
      // maximum. To do that, players must take bonus Attribute Points."
      maximumBonus: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

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
