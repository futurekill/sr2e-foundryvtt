import { SR2EDataModel } from "./base-data.mjs";
import { totalWoundPenalty, compensatedWoundPenalty, overstressPenalty, mpcpMaxRating, MPCP_OVERLOAD_TN, personaAttribute, icReactionBase, alertAdjustedRating, astralReaction, skillsoftMemory, skillsoftCost, skillwireCapacity, wornArmorTotals, heavyArmorPoolPenalty, reactionBase, weaponFocusCost, unarmedDamageCode, derivedItemCost, naturalAttribute } from "../rules/sr2e-rules.mjs";

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
      // Body Index (Shadowtech FASA7110 p.6): Σ effective Body Cost of installed
      // bioware. Both fields are derived every prepare (value from bioware, max
      // from natural Body) — declared here because strict TypeDataModels reject
      // assigning undeclared props during derivation.
      bodyIndex: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
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
        initiateGrade: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // Metamagic techniques learned (one per initiate Grade); keys from
        // CONFIG.SR2E.metamagic. Recorded on the magic tab.
        metamagic: new fields.ArrayField(new fields.StringField()),
        // The non-magical skill an initiate uses to Center (Grimoire p.43) — the
        // skill rolled to reduce drain. Matched by name against the actor's skills.
        centeringSkill: new fields.StringField({ initial: "" })
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
      // Note: the Karma Pool is NOT a dice pool — it lives at system.karma.pool
      // and is spent via the karma actions on success-test chat cards.
      dicePools: new fields.SchemaField({
        combat: SR2EDataModel.resourceField(0, 0),
        hacking: SR2EDataModel.resourceField(0, 0),
        magic: SR2EDataModel.resourceField(0, 0),
        control: SR2EDataModel.resourceField(0, 0),
        spellDefense: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // Shielding (Grimoire p.45): free bonus spell-defense dice = initiate grade,
        // granted alongside any Magic Pool dice and returned to neither on clear.
        shieldingBonus: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
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
        // While character creation is in progress, auto-charged purchases use
        // the LIST price (no Street Index markup) — chargen resources buy at
        // book prices; the street markup is an in-play thing. Untick when
        // play begins.
        inProgress: new fields.BooleanField({ initial: true }),
        // Priority assignment method: "standard" (each A–E used once) or "sumto10"
        // (Companion p.20 — any grades whose point values A=4…E=0 sum to 10).
        priorityMethod: new fields.StringField({ initial: "standard", choices: {
          standard: "Standard (A–E once each)", sumto10: "Sum-to-10"
        }}),
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
      // Scaffolding for the Matrix subsystem — see docs/MATRIX.md. The persona
      // takes Matrix damage on its own single 10-box condition track (no
      // physical/stun split in the Matrix; SR2E p.179). bod/evasion/masking/
      // sensor will derive from loaded persona programs (capped by MPCP) once
      // cybercombat is implemented; today they are manual NPC-decker fields.
      matrixPersona: new fields.SchemaField({
        bod: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        evasion: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        masking: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        sensor: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        condition: new fields.SchemaField({
          value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          max: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 })
        })
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

      // Tactical computer effective level (Shadowtech p.53) — adds to Initiative
      // up to the natural Reaction maximum. No help while rigging or decking.
      tacticalComputer: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Dice added to every Active Skill Success Test — Enhanced Articulation
      // (Shadowtech p.34). Summed from installed bioware.
      activeSkillDice: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      // Jacked in via VCR (SR2E p.85): while rigging, initiative uses ONLY the
      // VCR's Reaction (+2/level) and Initiative (+1d6/level) bonuses — no
      // other Reaction/Initiative enhancers apply, except injury modifiers.
      rigging: new fields.BooleanField({ initial: false }),

      // Astral state (SR2E p.145–147): "none", "perceiving" (dual-natured,
      // still in the body) or "projecting" (astral form acts separately, body
      // is inert). Astral Reaction = (Int+Will)/2; +15 while projecting.
      astralState: new fields.StringField({ initial: "none", choices: {
        none: "SR2E.Astral.None", perceiving: "SR2E.Astral.Perceiving", projecting: "SR2E.Astral.Projecting"
      }}),

      // Matrix state (SR2E p.178): jacked in → Matrix initiative (1d6 + Reaction,
      // +2 Reaction & +1d6 per response level; wired/magic/VCR do not apply).
      matrixMode: new fields.BooleanField({ initial: false }),
      // Dump shock (p.180): +2 to all TNs after being dumped, until shaken off.
      dumpShock: new fields.BooleanField({ initial: false }),

      // --- COMBAT STATE ---
      // Shots fired this combat turn — used for recoil tracking.
      // Reset manually (or via a macro) at the start of each initiative pass.
      combatRecoil: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // --- LINKED VEHICLES ---
      linkedVehicles: new fields.ArrayField(
        new fields.StringField({ required: false, blank: true }),
        { initial: [] }
      ),

      // --- BOUND/SUMMONED SPIRITS (UUIDs of Spirit actors) ---
      boundSpirits: new fields.ArrayField(
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
    // Embedded items are fully prepared before this runs, so all item-driven
    // modifiers (cyberware, adept powers, foci, skills) are collected here.
    // This is the single source of truth for derived character stats —
    // SR2EActor adds no further derivation.
    // Awakened status must be read from magic.type BEFORE Essence/Magic are
    // (re)derived below — magic.max depends on the Essence this collection feeds,
    // so consulting it here would be circular (Shadowtech bioware Essence rule).
    const isAwakened = this.magic.type !== "none";
    const mods = this._collectItemModifiers({ isAwakened });

    // Calculate final attribute values (base + racial clamped to racial max,
    // then cyberware/adept modifiers applied on top)
    this._calculateAttributeValues(mods);

    // Body Index (Shadowtech p.6): value from installed bioware (collected above,
    // assigned exactly once here); cap = natural, unaugmented Body — computed
    // from base+racial so bioware/AE Body bonuses can never inflate the cap.
    this.bodyIndex.value = mods.bodyIndex;
    // An Edge-granted Body point is NATURAL (not augmentation), so it raises the
    // Body Index cap too — the cap is the character's unaugmented Body.
    this.bodyIndex.max = this._naturalAttribute("body", mods);

    // Installed VCR cyberware is AUTHORITATIVE for the rig level — the manual
    // field on the vehicles tab only applies when no rig item is installed
    // (quick NPC-style setups). Must run before _calculateDicePools
    // (Control Pool requires a VCR).
    if (mods.vcrLevel > 0) this.vehicleControlRig = mods.vcrLevel;
    this.tacticalComputer = mods.tacComputer;
    this.activeSkillDice = mods.activeSkillDice;

    // Essence loss from installed cyberware (toggleable via the autoEssence setting).
    // try/catch: settings are registered in the init hook, but data prep can be
    // triggered in contexts where the setting isn't registered yet.
    let autoEssence = true;
    try { autoEssence = game.settings.get("sr2e", "autoEssence"); } catch (e) { /* default on */ }
    if (autoEssence) {
      this.essence.value = Math.max(0, this.essence.max - mods.essenceLoss);
    }

    // Calculate Reaction = (Quickness + Intelligence) / 2, plus cyberware mods.
    // reaction.mod already holds stored + Active Effect contributions.
    //
    // While JACKED IN (p.85): only the Vehicle Control Rig's bonuses apply —
    // Reaction = natural (Q+I)/2 plus 2 per rig level, Initiative dice =
    // 1 + rig level. Other Reaction/Initiative enhancers (wired reflexes,
    // spells) are suppressed; injury modifiers still apply at roll time.
    // Muscle Replacement/Augmentation Quickness is excluded here (SR2E p.249).
    this.reaction.base = reactionBase(
      this.quickness.value, this.intelligence.value, mods.reactionExemptQuickness ?? 0);
    if (this.rigging && this.vehicleControlRig > 0) {
      this.reaction.mod = 2 * this.vehicleControlRig;
      this.initiative.dice = 1 + this.vehicleControlRig;
    } else {
      this.reaction.mod = (this.reaction.mod ?? 0) + mods.reaction;
      // initiative.mod is the Active-Effect hook for EXTRA INITIATIVE DICE
      // (e.g. an Increase Reflexes spell effect adds to system.initiative.mod)
      this.initiative.dice = Math.max(1, 1 + mods.initiativeDice + (this.initiative.mod ?? 0));
    }
    this.reaction.value = Math.max(0, this.reaction.base + this.reaction.mod);

    // Initiative base = Adjusted Reaction. The wound Initiative Modifier is applied
    // to Reaction *before* Initiative dice are rolled (SR2E Damage Modifiers Table,
    // p.112) — it reduces the base score at roll time, not the number of dice.
    this.initiative.base = this.reaction.value;
    this.initiative.value = this.reaction.value;

    // While astrally projecting the body is inert and the astral form acts on
    // Astral Initiative = (Astral Reaction + 15) with a single die (SR2E p.147).
    // Mirror that on the sheet so the Initiative panel matches what the roll
    // does (SR2EActor#_computeInitiative also branches on astralState).
    if (this.astralState === "projecting") {
      this.initiative.base = this.astralReaction + 15;
      this.initiative.value = this.initiative.base;
      this.initiative.dice = 1;
    }

    // Calculate Essence-based Magic
    if (this.magic.type !== "none") {
      this.magic.max = Math.floor(this.essence.value);
      if (this.magic.value > this.magic.max) {
        this.magic.value = this.magic.max;
      }
    }

    // Condition monitors are fixed 10-box tracks in SR2E
    this.conditionMonitor.physical.max = 10;
    this.conditionMonitor.stun.max = 10;

    // Calculate Dice Pools
    this._calculateDicePools();

    // Calculate Movement
    this.movement.walk = this.quickness.value;
    this.movement.run = this.quickness.value * 3;

    // Calculate Armor from equipped items
    this._calculateArmor();

    // Adept Power Points (Magic rating for Physical Adepts, SR2E p.124). Points
    // USED = Σ of each power's cost. Sum the SAME per-power cost the sheet shows
    // in its Cost column (pointCost × level = system.totalCost) so the total
    // always equals the sum of its parts — non-linear powers (Increased
    // Reflexes/Reaction) carry their book cost via pointCost, not a hidden
    // override that made Used disagree with the column.
    if (this.magic.type === "physical_adept") {
      this.adeptPowerPoints.max = this.magic.value;
      let used = 0;
      for (const item of this.parent?.items ?? []) {
        if (item.type === "adept_power") used += item.system.totalCost ?? 0;
      }
      this.adeptPowerPoints.value = used;
    }

    // Snapshot the active cyberdeck's specs onto system.cyberdeck.* so every
    // Matrix consumer (persona, Hacking Pool, isDecker, targeting) reads one
    // place. MUST run before _derivePersona (which reads cyberdeck.mpcp).
    this._snapshotActiveDeck();

    // Derive Matrix persona attributes from loaded persona programs
    this._derivePersona();

    // Inject skills from slotted skillsofts (must run after skill items are
    // prepared, so an override reads the real native rating first).
    this._applySkillsofts();

    // Physical-adept Improved Ability: add each power's levels to its named skill
    // as a derived bonus (rolled, not paid with skill points).
    this._applyAdeptSkills();

    // Weapon foci: price each from its bonded weapon's Reach + Force, and tag the
    // bonded weapon so the Combat tab shows the focus and melee adds its dice.
    this._applyWeaponFoci();

    // Bone lacing raises the Power of unarmed blows (Shadowtech p.42). Derived
    // onto the innate Unarmed Strike so every path that reads its damageCode —
    // the attack dialog, opposed melee, the riposte — sees it without changes.
    this._applyUnarmedPower(mods.unarmedPower);
  }

  /**
   * Wire each weapon focus (focusType "weapon") to the melee weapon it's bonded
   * to (SR2E p.126). Derives the focus PRICE from the bonded weapon's Reach and
   * the focus Force — [(Reach + 1) × 100k] + Force × 90k — and tags the weapon
   * with `_boundFocus*` so the Combat tab and melee-attack dice can find it. Only
   * the specific bonded weapon benefits (not every melee attack). No source
   * mutation — un-bonding clears it on the next prepare.
   * @private
   */
  _applyWeaponFoci() {
    const items = this.parent?.items;
    if (!items) return;
    for (const focus of items) {
      if (focus.type !== "focus" || focus.system.focusType !== "weapon") continue;
      const weapon = focus.system.bondedWeaponId ? items.get(focus.system.bondedWeaponId) : null;
      if (weapon?.type === "weapon") {
        // Shared derivation (site 4 of 5). This pass is the ONLY one that can see
        // the bonded weapon, so it supplies the Reach as context — the purchase
        // hook resolves the same Reach itself and must agree with what lands here.
        focus.system.cost = derivedItemCost(
          { type: "focus", focusType: "weapon", force: focus.system.force ?? 0,
            costPerForce: focus.system.costPerForce ?? 0 },
          { bondedWeaponReach: weapon.system.reach ?? 0 }) ?? focus.system.cost;
        focus.system._bondedWeaponName = weapon.name;
        weapon.system._boundFocusId = focus.id;
        weapon.system._boundFocusName = focus.name;
        weapon.system._boundFocusForce = focus.system.force ?? 0;
        weapon.system._boundFocusActive = !!(focus.system.bonded && focus.system.active);
      } else {
        focus.system._bondedWeaponName = "";
      }
    }
  }

  /**
   * Physical-adept "Improved Ability" (SR2E p.125): each such power names one
   * Active Skill and adds +1 die per level to it. Applied as a derived
   * `_adeptBonus` on the skill item (NOT folded into `rating`, so the bought
   * rating — and therefore the chargen skill-point budget — is unchanged). Rolls
   * add the bonus; the Skills tab shows it as a badge.
   * @private
   */
  _applyAdeptSkills() {
    const items = this.parent?.items;
    if (!items) return;
    const norm = (s) => (s ?? "").toLowerCase().replace(/\s*\(b\/r\)\s*/g, "").trim();
    for (const power of items) {
      if (power.type !== "adept_power") continue;
      const target = norm(power.system.improvedSkill);
      if (!target) continue;
      const level = Math.max(0, power.system.level ?? 0);
      if (level <= 0) continue;
      const skill = items.find(i => i.type === "skill" && norm(i.name) === target);
      if (!skill) continue;
      skill.system._adeptBonus = (skill.system._adeptBonus ?? 0) + level;
      skill.system._adeptSource = power.name;
    }
  }

  /**
   * Fold a cyber-implant Power bonus into the innate Unarmed Strike's damage
   * code (Shadowtech p.42 — bone lacing). Mutates the derived item, never the
   * source, so it recomputes from scratch each prepare and can't accumulate.
   * @param {number} bonus
   * @private
   */
  _applyUnarmedPower(bonus) {
    if (!bonus) return;
    const unarmed = this.parent?.items?.find(
      i => i.type === "weapon" && i.name === "Unarmed Strike");
    if (!unarmed) return;
    // Derive from the AUTHORED code, never the prepared one. This is a relative
    // transform (base + bonus) landing on a field the item sheet also edits, so
    // reading the prepared value re-adds the bonus to a value that already has
    // it — (Str+3)M becomes (Str+3+3)M and compounds on every save (GitHub #15).
    unarmed.system.damageCode = unarmedDamageCode(unarmed._source.system.damageCode, bonus);
    unarmed.system._unarmedPowerBonus = bonus;
  }

  /**
   * Apply slotted skillsofts (SR2E p.243). Computes skillsoft capacity from
   * installed cyberware (chipjacks = simultaneous slots; Skillwires rating caps
   * ActiveSofts) and injects each slotted soft's skill onto the actor:
   *   - duplicates a natural skill → the soft's rating REPLACES it while slotted
   *     (the natural ability is lost for the duration), flagged _chipped.
   *   - a skill the character lacks → a synthetic entry on `chippedSkills` that
   *     the Skills tab renders read-only and rolls via the soft.
   * Nothing here is persisted; un-slotting the soft removes the effect.
   * @private
   */
  _applySkillsofts() {
    this.chippedSkills = [];
    const items = this.parent?.items;
    // Capacity from installed cyberware: Skillwires rating is the TOTAL-rating
    // budget for all running ActiveSofts (SR2E p.243); each chipjack accesses one
    // Know/LinguaSoft at a time; headware memory (parsed from its name) stores Mp.
    let chipjacks = 0, datajacks = 0, skillwires = 0, memCapacity = 0;
    if (items) {
      for (const i of items) {
        if (i.type !== "cyberware" || !i.system.installed) continue;
        const n = i.name.toLowerCase();
        if (n.includes("chipjack")) chipjacks++;
        if (n.includes("datajack")) datajacks++;
        if (n.includes("skillwire")) skillwires = Math.max(skillwires, skillwireCapacity(i.name, i.system.rating || 0));
        const m = /(\d[\d,]*)\s*mp/i.exec(i.name);
        if (m) memCapacity += parseInt(m[1].replace(/,/g, ""), 10);
      }
    }
    // Know/LinguaSofts need an access port: a chipjack, a datajack, or headware
    // memory + datasoft link (SR2E p.243). ActiveSofts need a Skillwire system.
    const knowAccess = chipjacks > 0 || datajacks > 0 || memCapacity > 0;
    const slotted = items
      ? items.filter(i => i.type === "gear" && i.system.category === "skillsoft" && i.system.slotted)
      : [];

    let activeUsed = 0, memUsed = 0;
    for (const soft of slotted) {
      soft.system._overBudget = false;
      const name = (soft.system.grantedSkill || "").trim();
      const cat = soft.system.grantedSkillCategory || "active";
      const rating = Math.max(0, soft.system.rating || 0);
      // Active → running-rating sum ≤ Skillwire Rating; Know/Lingua → any access port.
      const fits = cat === "active"
        ? (skillwires > 0 && activeUsed + rating <= skillwires)
        : knowAccess;
      if (!fits) { soft.system._overBudget = true; continue; }
      if (cat === "active") activeUsed += rating;
      memUsed += skillsoftMemory(cat, rating);
      if (!name || rating <= 0) continue;

      const existing = items.find(i => i.type === "skill" && i.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.system._chipped = true;
        existing.system._chipSource = soft.name;
        existing.system._nativeRating = existing.system.rating;
        existing.system.rating = rating;
      } else {
        this.chippedSkills.push({
          id: "", softId: soft.id, name,
          system: {
            category: cat, rating, linkedAttribute: soft.system.grantedSkillAttribute || "intelligence",
            _chipped: true, _synthetic: true, _chipSource: soft.name,
            concentration: { name: "" }, specialization: { name: "" }
          }
        });
      }
    }
    this.skillsoft = {
      skillwiresRating: skillwires, activeUsed,
      accessPorts: chipjacks + datajacks, knowAccess,
      memCapacity, memUsed
    };
  }

  /**
   * Copy the active cyberdeck gear item's specs onto system.cyberdeck.* so the
   * Matrix tab and every consumer read one source of truth. Only one deck may be
   * active at a time (enforced on activation). With NO active deck, the manual
   * system.cyberdeck.* fields are left untouched as a fallback — so existing
   * deckers who entered specs by hand keep working without a migration.
   * @private
   */
  _snapshotActiveDeck() {
    // A cranial cyberdeck ("C2", Matrixware — Shadowtech p.54) is cyberware that
    // carries the same deck block: "C2 decks operate exactly like regular
    // cyberdecks", so it snapshots through this identical path and the whole
    // Matrix tab / persona / cybercombat stack works on it unchanged.
    const deck = this.parent?.items?.find(i =>
      (i.type === "gear" && i.system.category === "cyberdeck" && i.system.deck?.active) ||
      (i.type === "cyberware" && i.system.cranialDeck && i.system.installed && i.system.deck?.active));
    if (!deck) return;
    const d = deck.system.deck;
    for (const k of ["mpcp", "hardening", "activeMemory", "storageMemory", "loadSpeed", "ioSpeed", "response"]) {
      this.cyberdeck[k] = d[k] ?? 0;
    }
  }

  /**
   * Derive the Matrix persona attributes (Bod/Evasion/Masking/Sensor) from the
   * highest-rated loaded persona program of each type, capped at the MPCP
   * (SR2E p.172). When no program of a type is loaded, the manual value on the
   * sheet is kept (for quick NPC-decker setups). Persona condition max is the
   * single 10-box Matrix track.
   * @private
   */
  _derivePersona() {
    this.matrixPersona.condition.max = 10;
    const mpcp = this.cyberdeck?.mpcp ?? 0;
    if (mpcp <= 0 || !this.parent?.items) return;

    const best = { bod: 0, evasion: 0, masking: 0, sensor: 0 };
    for (const item of this.parent.items) {
      if (item.type !== "program" || !item.system.loaded) continue;
      const name = item.name.toLowerCase();
      for (const attr of ["bod", "evasion", "masking", "sensor"]) {
        if (name.startsWith(attr)) best[attr] = Math.max(best[attr], item.system.rating ?? 0);
      }
    }
    for (const attr of ["bod", "evasion", "masking", "sensor"]) {
      if (best[attr] > 0) this.matrixPersona[attr] = personaAttribute(best[attr], mpcp);
    }
  }

  /**
   * Collect attribute/initiative/essence modifiers from installed cyberware,
   * bioware, and adept powers.
   * @param {{isAwakened:boolean}} opts isAwakened captured from `magic.type` at the
   *   top of prepareDerivedData (must NOT read the derived `magic.max`, which
   *   depends on the Essence this collection feeds — that would be circular).
   * @returns {{body:number, quickness:number, strength:number, charisma:number,
   *            intelligence:number, willpower:number, reaction:number,
   *            initiativeDice:number, essenceLoss:number, bodyIndex:number}}
   * @private
   */
  _collectItemModifiers({ isAwakened = false } = {}) {
    const mods = {
      body: 0, quickness: 0, strength: 0,
      charisma: 0, intelligence: 0, willpower: 0,
      reaction: 0, initiativeDice: 0, essenceLoss: 0, vcrLevel: 0, tacComputer: 0,
      unarmedPower: 0, activeSkillDice: 0,
      // Provenance for the attribute tooltip: one {name, value} per item that
      // moves an attribute, so the sheet can name the source instead of a generic
      // "cyberware / magic / adept power". Active-Effect sources are added later
      // (they're applied before this runs; see _attributeEffectSources).
      sources: { body: [], quickness: [], strength: [], charisma: [], intelligence: [], willpower: [] },
      // Attribute Edges (Companion): edgeAttr raises the RATING, edgeMax the
      // racial MAXIMUM. Both are part of the NATURAL attribute, not `mod`.
      // edgeSources keeps the named per-quality breakdown for the sheet tooltip.
      edgeAttr: {}, edgeMax: {}, edgeSources: {},
      // Quickness bonus that must NOT feed Reaction (Muscle Replacement/
      // Augmentation, SR2E p.249). Still counts for Combat Pool and tests.
      reactionExemptQuickness: 0,
      // Body Index = Σ effective Body Cost of installed bioware (Shadowtech p.6).
      bodyIndex: 0
    };
    // Raw (unrounded) bioware Body Cost, summed then rounded ONCE below so this
    // matches the pure `bodyIndexTotal` helper exactly (one canonical value).
    let biowareRaw = 0;
    for (const item of this.parent?.items ?? []) {
      if (item.type === "cyberware" && item.system.installed) {
        for (const [key, val] of Object.entries(item.system.attributeMods)) {
          if (key in mods) mods[key] += val;
          if (val && mods.sources[key]) mods.sources[key].push({ name: item.name, value: val });
        }
        // Muscle Replacement/Augmentation Quickness doesn't raise Reaction
        // (flag, with a name fallback for pre-0.28 world copies).
        if (item.system.noReactionBonus || /muscle (replacement|augmentation)/i.test(item.name)) {
          mods.reactionExemptQuickness += item.system.attributeMods?.quickness || 0;
        }
        mods.essenceLoss += item.system.actualEssenceCost;
        // Installed VCR cyberware sets the character's rig level (its rating)
        if (item.system.isVcr) {
          mods.vcrLevel = Math.max(mods.vcrLevel, item.system.rating || 1);
        }
        if (item.system.isTacticalComputer) {
          mods.tacComputer = Math.max(mods.tacComputer, item.system.rating || 1);
        }
        // Bone lacing (Shadowtech p.42) — highest wins; you can't layer plastic
        // under titanium.
        mods.unarmedPower = Math.max(mods.unarmedPower, item.system.unarmedPowerBonus || 0);
      }
      if (item.type === "bioware" && item.system.installed) {
        const sys = item.system;
        // Body Index / Essence always accrue — the implant is present regardless
        // of activation (Shadowtech p.6). Armor (Orthoskin) is added in _calculateArmor.
        biowareRaw += sys.actualBodyCost;
        // Attribute mods are PER-LEVEL — scale by Rating (all rated attribute
        // bioware in Shadowtech is linear). Triggered implants (Adrenal Pump,
        // Pain Editor) only apply their mods while `active`.
        if (!sys.triggered || sys.active) {
          const rating = Math.max(1, sys.rating ?? 1);
          for (const [key, val] of Object.entries(sys.attributeMods ?? {})) {
            if (key in mods) mods[key] += val * rating;
            if (val && mods.sources[key]) mods.sources[key].push({ name: item.name, value: val * rating });
          }
          // Explicit flag only (no name heuristic): e.g. Adrenal Pump's Quickness
          // does not feed Reaction, but Muscle Augmentation's / Suprathyroid's does.
          if (sys.noReactionBonus) {
            mods.reactionExemptQuickness += (sys.attributeMods?.quickness || 0) * rating;
          }
          // Enhanced Articulation's +1 die (Shadowtech p.34) — per-Level like the
          // attribute mods, and gated by the same triggered/active check.
          mods.activeSkillDice += (sys.activeSkillDice || 0) * rating;
        }
      }
      // Attribute Edges (Companion): Bonus Attribute Point raises a rating,
      // Exceptional Attribute raises that attribute's racial maximum. Data-driven
      // via explicit fields — never by matching the item's name.
      if (item.type === "quality" && item.system.attribute) {
        const a = item.system.attribute;
        if (item.system.attributeBonus) {
          mods.edgeAttr[a] = (mods.edgeAttr[a] ?? 0) + item.system.attributeBonus;
          (mods.edgeSources[a] ??= []).push({ name: item.name, value: item.system.attributeBonus });
        }
        if (item.system.maximumBonus) {
          mods.edgeMax[a] = (mods.edgeMax[a] ?? 0) + item.system.maximumBonus;
        }
      }
      if (item.type === "adept_power") {
        // Power effects are per-level (SR2E p.124–126): scale by the level.
        const lvl = Math.max(1, item.system.level ?? 1);
        for (const [key, val] of Object.entries(item.system.attributeMods)) {
          if (key in mods) mods[key] += val * lvl;
          if (val && mods.sources[key]) mods.sources[key].push({ name: item.name, value: val * lvl });
        }
      }
    }
    // Bioware total stays UNROUNDED (locked decision) — same raw summation as the
    // pure `bodyIndexTotal` helper, so model == helper. The sheet rounds for display.
    mods.bodyIndex = biowareRaw;
    // Awakened characters pay Essence equal to their bioware Body Index; mundanes
    // pay none (Shadowtech p.6). Same raw total for exact parity.
    if (isAwakened) mods.essenceLoss += mods.bodyIndex;
    return mods;
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
   * The natural, unaugmented value of an attribute: base + racial, clamped to
   * the racial maximum, BEFORE any cyber/bio/adept/AE modifier. Shared by the
   * attribute calc and the Body Index cap so the two can never diverge.
   * @param {string} attr
   * @returns {number}
   * @private
   */
  _naturalAttribute(attr, mods = null) {
    const maxes = CONFIG.SR2E.racialMaximums[this.race] ?? {};
    return naturalAttribute(
      this[attr]?.base ?? 0,
      this[attr]?.racial ?? 0,
      mods?.edgeAttr?.[attr] ?? 0,
      maxes[attr] ?? null,
      mods?.edgeMax?.[attr] ?? 0
    );
  }

  /**
   * Calculate final attribute values.
   * The natural attribute (base + racial) is clamped to the racial maximum;
   * cyberware/adept modifiers then apply on top of the clamped natural value.
   * @param {object} mods - Modifier totals from _collectItemModifiers().
   * @private
   */
  _calculateAttributeValues(mods) {
    const aeSources = this._attributeEffectSources();
    // Provenance lives in a top-level EPHEMERAL map, not on system.<attr>.sources:
    // the attribute is a declared SchemaField and V13 may seal it, so an
    // undeclared nested property can be dropped or throw. Top-level derived data
    // on the model is safe (the system assigns lots of it here).
    this.attributeSources = {};
    for (const attr of ["body", "quickness", "strength", "charisma", "intelligence", "willpower"]) {
      if (this[attr]) {
        // .mod at this point = stored value + Active Effect contributions
        // (effects are applied before prepareDerivedData); item mods stack on top.
        this[attr].mod = (this[attr].mod ?? 0) + mods[attr];
        this[attr].value = Math.max(1, this._naturalAttribute(attr, mods) + this[attr].mod);

        // Named sources reconcile to the WHOLE base→value gap the tooltip shows,
        // not just `.mod`: metatype (racial rating bonus) and the Bonus Attribute
        // Point edge are part of the NATURAL rating but still moved the attribute
        // above its bought base, so the player should see them too. Order:
        // metatype, edge, then additive Active Effects + item mods (cyber/bio/adept).
        const named = [];
        const racial = this[attr].racial ?? 0;
        if (racial) {
          const raceKey = (this.race ?? "").charAt(0).toUpperCase() + (this.race ?? "").slice(1);
          named.push({ name: game.i18n.localize(`SR2E.Races.${raceKey}`), value: racial });
        }
        // Bonus Attribute Point edge — attribute its EFFECTIVE points (after the
        // racial-maximum clamp), not the raw purchased amount, so a partly-wasted
        // edge doesn't read as "+N edge" with a phantom "−N other".
        const edgeItems = mods.edgeSources?.[attr] ?? [];
        if (edgeItems.length) {
          const maxes = CONFIG.SR2E.racialMaximums[this.race] ?? {};
          const natNoEdge = naturalAttribute(this[attr].base ?? 0, racial, 0, maxes[attr] ?? null, mods?.edgeMax?.[attr] ?? 0);
          const edgeEff = this._naturalAttribute(attr, mods) - natNoEdge;
          if (edgeEff > 0) named.push({ name: edgeItems.map((e) => e.name).join(" + "), value: edgeEff });
        }
        named.push(...(aeSources[attr] ?? []), ...(mods.sources?.[attr] ?? []));
        // Anything left over — a non-additive effect (override/multiply) or an
        // unknown contributor — folds into one honest "other" line, so base +
        // every listed source ALWAYS equals the shown value.
        const residual = (this[attr].value - (this[attr].base ?? 0)) - named.reduce((t, s) => t + s.value, 0);
        if (residual) named.push({ name: game.i18n.localize("SR2E.Attr.OtherSource"), value: residual });
        this.attributeSources[attr] = named;
      }
    }
  }

  /**
   * Attribute modifiers contributed by ADDITIVE Active Effects (sustained spells,
   * temporary buffs/penalties), grouped by attribute with the effect's name.
   * Only ADD-mode changes are attributed by name — for override/multiply modes
   * the change value isn't the additive contribution, so those fall into the
   * "other" residual computed by the caller. Effects are applied to
   * `system.<attr>.mod` before prepareDerivedData, so they don't pass through
   * _collectItemModifiers and must be read here.
   * @returns {Record<string,{name:string,value:number}[]>}
   * @private
   */
  _attributeEffectSources() {
    const out = { body: [], quickness: [], strength: [], charisma: [], intelligence: [], willpower: [] };
    const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
    for (const effect of this.parent?.appliedEffects ?? []) {
      for (const ch of effect.changes ?? []) {
        if (ch.mode !== ADD) continue;   // non-additive → residual, not a named line
        const m = /^system\.(body|quickness|strength|charisma|intelligence|willpower)\.mod$/.exec(ch.key ?? "");
        const value = Number(ch.value) || 0;
        if (m && value) out[m[1]].push({ name: effect.name || "Effect", value });
      }
    }
    return out;
  }

  /**
   * Calculate dice pools (SR2E p.84):
   * Combat Pool  = (Quickness + Intelligence + Willpower) / 2, round down
   * Magic Pool   = Sorcery Skill + active bonded power foci
   * Control Pool = Reaction, modified only by a vehicle control rig
   * Hacking Pool = Computer Skill + Reaction (requires a cyberdeck)
   * @private
   */
  _calculateDicePools() {
    // Helper: preserve dice already spent between re-preparations.
    // When a pool is first initialised its saved max is 0; treat that as
    // "full" (no dice spent yet).  Once we have persisted a non-zero max we
    // can derive spent = savedMax - savedValue and carry it forward.
    const applyPool = (pool, newMax) => {
      // pool.bonus = Active Effect contributions (e.g. Combat Sense spell)
      const total = Math.max(0, newMax + (pool.bonus ?? 0));
      const savedMax   = pool.max;
      const savedValue = pool.value;
      const spent = savedMax > 0 ? Math.max(0, savedMax - savedValue) : 0;
      pool.max   = total;
      pool.value = Math.max(0, total - spent);
    };

    // Combat Pool = floor((Quickness + Intelligence + Willpower) / 2), less
    // 1 die per point of heavy-armor Ballistic over Quickness (SR2E p.84).
    const equippedArmor = (this.parent?.items ?? [])
      .filter(i => i.type === "armor" && i.system.equipped);
    const combatPool = Math.max(0, Math.floor(
      (this.quickness.value + this.intelligence.value + this.willpower.value) / 2
    ) - heavyArmorPoolPenalty(this.quickness.value, equippedArmor));
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

    // Control Pool = Reaction modified ONLY by the vehicle control rig
    // (SR2E p.84: "Reaction bonuses from other sources are of no help") —
    // natural (Q+I)/2 plus 2 per rig level, regardless of other enhancers
    // or whether the rigger is currently jacked in.
    if (this.vehicleControlRig > 0) {
      const naturalReaction = Math.floor((this.quickness.value + this.intelligence.value) / 2);
      applyPool(this.dicePools.control, naturalReaction + 2 * this.vehicleControlRig);
    }

    // Hacking Pool = Computer Skill + Reaction (SR2E p.84: "equal to his or her
    // Computer Skill … plus the character's Reaction")
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
      applyPool(this.dicePools.hacking, computerSkill + this.reaction.value);
    }
  }

  /**
   * Calculate total armor from equipped armor items.
   * @private
   */
  _calculateArmor() {
    // Preserve Active Effect contributions (e.g. an Armor spell adding to
    // system.armor.ballistic) — at this point the fields hold source (0) + AEs.
    const aeBallistic = this.armor.ballistic ?? 0;
    const aeImpact = this.armor.impact ?? 0;
    // Worn armor does NOT stack — only the highest rating counts; layered
    // pieces (helmets, form-fitting body armor) add to it (SR2E p.242).
    const worn = wornArmorTotals(
      (this.parent?.items ?? []).filter(i => i.type === "armor" && i.system.equipped)
    );
    // Note: troll Dermal Armor is "+1 Body" (SR2E Racial Modifications Table),
    // applied as an extra Body die on Damage Resistance Tests in
    // SR2EActor#rollDamageResistance — it is not an armor rating bonus.
    // Cyber Dermal Plating raises the Body Attribute itself (p.242).
    // Bioware body armor (Orthoskin, Shadowtech p.17) is a subdermal layer that
    // ADDS on top of worn armor (it does not compete for the highest-rating slot).
    // Bioware (Orthoskin) and cyber-implant armor (Bone Lacing, Dermal Plating)
    // both add on top of worn armor while installed (Shadowtech p.17, p.42).
    let implantBallistic = 0, implantImpact = 0;
    for (const i of this.parent?.items ?? []) {
      if ((i.type === "bioware" || i.type === "cyberware") && i.system.installed) {
        implantBallistic += i.system.armorBallistic ?? 0;
        implantImpact    += i.system.armorImpact ?? 0;
      }
    }
    this.armor.ballistic = worn.ballistic + aeBallistic + implantBallistic;
    this.armor.impact = worn.impact + aeImpact + implantImpact;
  }

  /**
   * Get the wound penalty (Injury Modifier) based on current damage.
   *
   * SR2E Damage Modifiers Table (p.112): a column reaches Light at 1 box,
   * Moderate at 3, Serious at 6 (Deadly at 10 = unconscious; no modifier
   * listed, capped at +3 here). Condition Levels are cumulative ACROSS the
   * Physical and Stun columns — e.g. Moderate Stun + Light Physical = +3.
   *
   * Shadowtech automation: an installed **Damage Compensator** suppresses a
   * track's modifier while that track sits at or below its Rating (p.24), and an
   * ACTIVE **Pain Editor** ignores mental/Stun penalties outright (p.26).
   * @returns {number}
   */
  get woundPenalty() {
    let compensator = 0, ignoreStun = false;
    for (const i of this.parent?.items ?? []) {
      const s = i.system;
      if (i.type !== "bioware" || !s?.installed) continue;
      if (s.damageCompensator) compensator = Math.max(compensator, s.rating || 0);
      if (s.ignoresStunPenalty && (!s.triggered || s.active)) ignoreStun = true;
    }
    return compensatedWoundPenalty(
      this.conditionMonitor.physical.value,
      this.conditionMonitor.stun.value,
      { compensator, ignoreStun }
    );
  }

  /**
   * Get the current wound level label (worst of the two columns).
   * Boxes per level: Light=1, Moderate=3, Serious=6, Deadly=10.
   */
  get woundLevel() {
    const maxDamage = Math.max(
      this.conditionMonitor.physical.value,
      this.conditionMonitor.stun.value
    );
    if (maxDamage >= 10) return "Deadly";
    if (maxDamage >= 6)  return "Serious";
    if (maxDamage >= 3)  return "Moderate";
    if (maxDamage >= 1)  return "Light";
    return "Undamaged";
  }

  /**
   * Biosystem overstress (Shadowtech p.7): while the Body Index exceeds its cap
   * the character makes ALL Body Success Tests at +1 TN per point, or fraction
   * thereof, over — until the Index drops back under their natural Body.
   * @returns {number}
   */
  get bodyOverstressTN() {
    return overstressPenalty(this.bodyIndex?.value, this.bodyIndex?.max);
  }

  /**
   * Universal TN penalty from an over-spec'd cranial cyberdeck (Matrixware,
   * Shadowtech p.54): an installed MPCP above 1.5 × Intelligence (round up)
   * inflicts +4 on the target number of EVERY action, "across the board".
   * Applies whether or not the deck is currently active — the hardware is in
   * the decker's skull either way.
   * @returns {number}
   */
  get mpcpOverloadPenalty() {
    let mpcp = 0;
    for (const i of this.parent?.items ?? []) {
      if (i.type === "cyberware" && i.system.cranialDeck && i.system.installed) {
        mpcp = Math.max(mpcp, i.system.deck?.mpcp ?? 0);
      }
    }
    if (mpcp <= 0) return 0;
    return mpcp > mpcpMaxRating(this.intelligence?.value ?? 0) ? MPCP_OVERLOAD_TN : 0;
  }

  /**
   * Universal TN penalty from sustained spells: +2 per spell being
   * sustained by concentration (spell locks exempt). SR2E p.130.
   * @returns {number}
   */
  get sustainPenalty() {
    let count = 0;
    for (const item of this.parent?.items ?? []) {
      if (item.type === "spell" && item.system.sustaining && !item.system.spellLocked && !item.system.quickened) count++;
    }
    return 2 * count;
  }

  /** Astral Reaction = (Intelligence + Willpower) ÷ 2 (SR2E p.147). */
  get astralReaction() {
    return astralReaction(this.intelligence.value);
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
      // Body Index (Shadowtech p.6). GM-typed, like Essence above — NPCs are
      // stat blocks, so implants aren't summed from items the way they are for
      // characters. Typing a value here is enough to drive everything
      // downstream: biosystem overstress on Body tests and the bioware
      // interference penalty when someone magically heals this NPC.
      bodyIndex: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        max: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
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

    // Body Index cap = the NPC's natural (unmodified) Body — Shadowtech p.6.
    this.bodyIndex.max = this.body.base;

    // Reaction
    this.reaction.base = Math.floor((this.quickness.value + this.intelligence.value) / 2);
    this.reaction.value = this.reaction.base + this.reaction.mod;

    // Initiative base = Adjusted Reaction. The wound Initiative Modifier reduces
    // Reaction at roll time (SR2E Damage Modifiers Table, p.112).
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

    // Armor = the stat-block base + equipped armor items (highest worn rating
    // + layered pieces, SR2E p.242), so a GM can swap armor on the fly.
    const npcWorn = wornArmorTotals(
      (this.parent?.items ?? []).filter(i => i.type === "armor" && i.system.equipped)
    );
    this.armor.ballistic += npcWorn.ballistic;
    this.armor.impact    += npcWorn.impact;
  }

  /**
   * Get the wound penalty (Injury Modifier) based on current damage.
   * Cumulative across the Physical and Stun columns — see CharacterData.
   * @returns {number}
   */
  get woundPenalty() {
    return totalWoundPenalty(
      this.conditionMonitor.physical.value,
      this.conditionMonitor.stun.value
    );
  }

  /**
   * Biosystem overstress (Shadowtech p.7) — see CharacterData#bodyOverstressTN.
   * Present here so the Body-test plumbing treats NPCs identically.
   * @returns {number}
   */
  get bodyOverstressTN() {
    return overstressPenalty(this.bodyIndex?.value, this.bodyIndex?.max);
  }

  /**
   * Universal TN penalty from sustained spells (+2 each, spell locks exempt).
   * @returns {number}
   */
  get sustainPenalty() {
    let count = 0;
    for (const item of this.parent?.items ?? []) {
      if (item.type === "spell" && item.system.sustaining && !item.system.spellLocked && !item.system.quickened) count++;
    }
    return 2 * count;
  }

  /**
   * Get the current wound level label (worst of the two columns).
   * Boxes per level: Light=1, Moderate=3, Serious=6, Deadly=10.
   */
  get woundLevel() {
    const maxDamage = Math.max(
      this.conditionMonitor.physical.value,
      this.conditionMonitor.stun.value
    );
    if (maxDamage >= 10) return "Deadly";
    if (maxDamage >= 6)  return "Serious";
    if (maxDamage >= 3)  return "Moderate";
    if (maxDamage >= 1)  return "Light";
    return "Undamaged";
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
      // Driving skill override (e.g. "bike"); empty = type default from
      // CONFIG.SR2E.vehicleSkillDefaults
      skill: new fields.StringField({ initial: "", blank: true }),
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
      notes: new fields.HTMLField({ initial: "" }),
      // Rigger 2 design-from-scratch state (book p.108-123). Populated on the
      // vehicle sheet's Design tab; "Apply to Vehicle" writes the resolved base
      // stats onto the fields above. Keys reference CONFIG.SR2E.vehicleDesign,
      // which a content module (sr2e-rigger-2) registers at runtime.
      design: new fields.SchemaField({
        chassisKey:    new fields.StringField({ initial: "", blank: true }),
        powerPlantKey: new fields.StringField({ initial: "", blank: true }),
        improvements: new fields.SchemaField({
          handling:     new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          speed:        new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          acceleration: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          armor:        new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          cargo:        new fields.NumberField({ initial: 0, min: 0 }),
          load:         new fields.NumberField({ initial: 0, min: 0 }),
          economy:      new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          signature:    new fields.NumberField({ integer: true, initial: 0, min: 0 }),
          fuel:         new fields.NumberField({ integer: true, initial: 0, min: 0 })
        }),
        modDP:  new fields.NumberField({ initial: 0, min: 0 }),
        markUp: new fields.NumberField({ initial: 1, min: 0 })
      })
    };
  }

  /** @override */
  prepareDerivedData() {
    // Standard 10-box damage track: Light at 1, Moderate at 3, Serious at 6,
    // Destroyed at 10 — vehicle damage levels per SR2E p.109.
    this.conditionMonitor.max = 10;

    // Installed modifications that adjust vehicle stats (Rigger 2). Armor mods
    // (Standard/Concealed/Ablative Vehicle Armor) add their Rating in Armor
    // Points; signature mods (Thermal Baffles, RAM, Active Thermal Masking) add
    // to Signature. Kept as a derived bonus so the base stat stays editable
    // (effective = base + mod bonus); see effectiveArmor / effectiveSignature.
    let modArmor = 0, modSignature = 0;
    for (const item of (this.parent?.items ?? [])) {
      if (item.type !== "vehicle_mod") continue;
      const rating = Number(item.system.rating) || 0;
      if (item.system.modType === "armor") modArmor += rating;
      else if (item.system.modType === "signature") modSignature += rating;
    }
    this.modArmor = modArmor;
    this.modSignature = modSignature;
  }

  /** Effective Armor = base + armor-mod Armor Points. */
  get effectiveArmor() { return (this.armor || 0) + (this.modArmor || 0); }

  /** Effective Signature = base + signature-mod bonuses. */
  get effectiveSignature() { return (this.signature || 0) + (this.modSignature || 0); }

  /**
   * Current vehicle damage level (SR2E p.109).
   * @returns {"Undamaged"|"Light"|"Moderate"|"Serious"|"Destroyed"}
   */
  get damageLevel() {
    const v = this.conditionMonitor.value;
    if (v >= 10) return "Destroyed";
    if (v >= 6)  return "Serious";
    if (v >= 3)  return "Moderate";
    if (v >= 1)  return "Light";
    return "Undamaged";
  }

  /** TN penalty to the driver's tests from vehicle damage (p.109). */
  get damageTnMod() {
    return CONFIG.SR2E.vehicleDamageMods[this.damageLevel]?.tn ?? 0;
  }

  /** Initiative penalty from vehicle damage (p.109). */
  get damageInitMod() {
    return CONFIG.SR2E.vehicleDamageMods[this.damageLevel]?.init ?? 0;
  }

  /** Cruising speed after the damage speed multiplier (p.109). */
  get effectiveSpeed() {
    const factor = CONFIG.SR2E.vehicleDamageMods[this.damageLevel]?.speed ?? 1;
    return Math.floor(this.speed * factor);
  }

  /** The driving skill key for this vehicle (override or type default). */
  get drivingSkill() {
    return this.skill || CONFIG.SR2E.vehicleSkillDefaults[this.vehicleType] || "car";
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
      maxServices: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // UUID of the conjuring character (set when summoned via rollConjuring)
      conjurerUuid: new fields.StringField({ initial: "", blank: true }),

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

      // The Security Code of the node this IC defends drives its Reaction Time
      // (SR2E p.169). The alert state applies the +50% IC-rating boost (p.168).
      // When hostUuid links a Host actor, its Security Code + alert are pushed
      // here automatically (set once on the host; see the updateActor sync hook).
      hostUuid: new fields.StringField({ initial: "" }),
      securityCode: new fields.StringField({ initial: "green", choices: {
        blue: "blue", green: "green", orange: "orange", red: "red"
      }}),
      alert: new fields.StringField({ initial: "none", choices: {
        none: "none", passive: "passive", active: "active"
      }}),

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
    // When this IC defends a Host, the host is the single source of truth for
    // the Security Code and alert — derive them live so the two can never drift
    // (set them once on the host; see the IC-refresh hook in sr2e.mjs).
    if (this.hostUuid) {
      let host = null;
      try { host = fromUuidSync(this.hostUuid); } catch { /* unresolved link */ }
      if (host?.type === "host") {
        this.securityCode = host.system.securityCode;
        this.alert = host.system.alert;
      }
    }

    // Active/passive alerts boost all IC ratings by +50% (SR2E p.168).
    this.effectiveRating = alertAdjustedRating(this.rating, this.alert);
    this.conditionMonitor.max = this.rating * 2;
    // Reaction Time = Security-Code base + (effective) Rating, then 1D6 (p.169).
    this.initiative.base = icReactionBase(this.securityCode) + this.effectiveRating;
    this.initiative.dice = 1;
    this.initiative.value = this.initiative.base;
  }
}

/**
 * Data model for a Matrix host / node (SR2E p.164–168). One host actor
 * represents one node: a Security Code (color) and a numeric System Rating.
 * The System Rating is the target number for any system operation; the
 * Security Code's color sets how many successes the decker must beat.
 */
export class HostData extends SR2EDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // Security Rating = Security Code (color) + System Rating (TN). p.165.
      securityCode: new fields.StringField({ initial: "blue", choices: {
        blue: "blue", green: "green", orange: "orange", red: "red"
      }}),
      systemRating: new fields.NumberField({ integer: true, initial: 2, min: 1 }),

      // Intrusion tracking (p.167–168): attempts so far this run drive the
      // alert roll and the escalating +2 TN; alert escalates none→passive→active.
      attempts: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      alert: new fields.StringField({ initial: "none", choices: {
        none: "none", passive: "passive", active: "active"
      }}),

      // --- Virtual Realities 2.0 subsystems (ACIFS, p.16) ---
      // Used only when the Matrix ruleset is "vr2"; the core-book Matrix ignores
      // them. Each host rates five subsystems — Access, Control, Index, Files,
      // Slave — and each System Test targets the relevant one. The Security
      // Value (dump-shock Power, IC/host Damage Resistance) is GM-set; when left
      // at 0 it falls back to the System Rating (see securityValue getter).
      subsystems: new fields.SchemaField({
        access:  new fields.NumberField({ integer: true, initial: 2, min: 0 }),
        control: new fields.NumberField({ integer: true, initial: 2, min: 0 }),
        index:   new fields.NumberField({ integer: true, initial: 2, min: 0 }),
        files:   new fields.NumberField({ integer: true, initial: 2, min: 0 }),
        slave:   new fields.NumberField({ integer: true, initial: 2, min: 0 })
      }),
      securityValueOverride: new fields.NumberField({ integer: true, initial: 0, min: 0 }),

      notes: new fields.HTMLField({ initial: "" })
    };
  }

  /**
   * Successes a decker must beat to make this node execute an operation
   * (Security Code color, SR2E p.165).
   */
  get successesNeeded() {
    return CONFIG.SR2E.securityCodes[this.securityCode]?.successes ?? 1;
  }

  /**
   * VR2.0 Security Value (p.19): the host's dice for opposed System/Damage
   * Resistance tests and the dump-shock Power. GM-set; defaults to the System
   * Rating when not overridden. Inert in the core-book Matrix.
   */
  get securityValue() {
    return this.securityValueOverride > 0 ? this.securityValueOverride : this.systemRating;
  }

  /**
   * Rating of one ACIFS subsystem (VR2.0 p.16), the TN for a VR2.0 System Test.
   * Falls back to the System Rating for an unknown key. Inert in the core-book
   * Matrix.
   * @param {"access"|"control"|"index"|"files"|"slave"} key
   * @returns {number}
   */
  subsystemRating(key) {
    return this.subsystems?.[key] ?? this.systemRating;
  }
}
