import { describe, it, expect } from "vitest";
import {
  DAMAGE_LEVELS, damageBoxes, stageLevel,
  columnWoundPenalty, totalWoundPenalty,
  systemOperationTN, personaAttribute,
  icReactionBase, alertAdjustedRating, escalateAlert, programSize,
  burstRounds, recoilPenalty, burstDamageBonus,
  programCost, focusCost, weaponFocusCost, astralAllowsView,
  netToSteps, astralReaction, drainTargetNumber,
  woundLevel, firstAidBodyMod, meleeOutcome, containerEssence,
  vehicleDesign, engineCustomizationCost, DESIGN_OPTION_COSTS,
  resolveVehicleDesign, designNum, aggregateModDesign, modDesignPoints,
  modCfConsumed, modLoadReduction, skillsoftMemory, skillsoftCost, shotgunSpread, skillSubRatings, streetPrice, knockdownTN, knockdownThreshold, knockdownOutcome, reactionBase,
  chargenSpend, adeptPowerCost,
  cybercombatTN, icDamageLevel, dumpShockDamage, detectionFactor,
  matrixProgramMultiplierVR2, programCostVR2, programStreetIndexVR2,
  matrixConditionBoxes, matrixCombatOutcome, simsenseOverloadTN,
  webDefaultingTN
} from "../module/rules/sr2e-rules.mjs";

describe("Container cyberware essence — eyes/ears capacity (SR2E p.247)", () => {
  it("absorbs modules up to the 0.5 free capacity (base only)", () => {
    // base 0.2 eyes + thermo 0.2 + low-light 0.2 (modules sum 0.4 < 0.5)
    expect(containerEssence(0.2, 0.4, 0.5)).toBe(0.2);
  });
  it("charges only essence beyond the capacity", () => {
    // + camera 0.4 → modules sum 0.8; 0.2 + (0.8 - 0.5) = 0.5
    expect(containerEssence(0.2, 0.8, 0.5)).toBe(0.5);
  });
  it("an empty container is just the base", () => {
    expect(containerEssence(0.2, 0, 0.5)).toBe(0.2);
  });
});

describe("Damage levels & boxes (SR2E p.113)", () => {
  it("fills 1/3/6/10 boxes for L/M/S/D", () => {
    expect(damageBoxes("L")).toBe(1);
    expect(damageBoxes("M")).toBe(3);
    expect(damageBoxes("S")).toBe(6);
    expect(damageBoxes("D")).toBe(10);
  });

  it("orders levels L < M < S < D", () => {
    expect(DAMAGE_LEVELS).toEqual(["L", "M", "S", "D"]);
  });
});

describe("Damage staging (SR2E p.110)", () => {
  it("stages up and clamps at Deadly", () => {
    expect(stageLevel("L", 1)).toBe("M");
    expect(stageLevel("M", 2)).toBe("D");
    expect(stageLevel("S", 5)).toBe("D"); // clamps
  });

  it("stages down and clamps at Light", () => {
    expect(stageLevel("S", -1)).toBe("M");
    expect(stageLevel("M", -5)).toBe("L"); // clamps
  });

  it("returns the level unchanged for 0 steps", () => {
    expect(stageLevel("M", 0)).toBe("M");
  });
});

describe("Injury Modifier (SR2E p.112)", () => {
  it("steps a single column 0→+1→+2→+3 at 1/3/6 boxes", () => {
    expect(columnWoundPenalty(0)).toBe(0);
    expect(columnWoundPenalty(1)).toBe(1);
    expect(columnWoundPenalty(2)).toBe(1);
    expect(columnWoundPenalty(3)).toBe(2);
    expect(columnWoundPenalty(5)).toBe(2);
    expect(columnWoundPenalty(6)).toBe(3);
    expect(columnWoundPenalty(10)).toBe(3);
  });

  it("is cumulative across the Physical and Stun monitors", () => {
    // Light physical (+1) + Moderate stun (+2) = +3
    expect(totalWoundPenalty(1, 4)).toBe(3);
    // Serious physical (+3) + Serious stun (+3) = +6
    expect(totalWoundPenalty(7, 8)).toBe(6);
    expect(totalWoundPenalty(0, 0)).toBe(0);
  });
});

describe("Matrix system-operation TN (SR2E p.166–167)", () => {
  it("equals the System Rating on the first attempt", () => {
    expect(systemOperationTN(4, 0)).toBe(4);
  });

  it("adds +2 per prior attempt", () => {
    expect(systemOperationTN(4, 1)).toBe(6);
    expect(systemOperationTN(4, 3)).toBe(10);
  });

  it("adds an untrained Skill-Web default penalty", () => {
    expect(systemOperationTN(4, 0, 4)).toBe(8);
    expect(systemOperationTN(4, 2, 4)).toBe(12);
  });
});

describe("Firing modes & rounds (SR2E p.92–93)", () => {
  it("fires 1 round for single shot / semi-auto", () => {
    expect(burstRounds("ss")).toBe(1);
    expect(burstRounds("sa")).toBe(1);
  });

  it("fires a fixed 3-round burst for BF", () => {
    expect(burstRounds("bf", 10)).toBe(3); // declared ignored for BF
  });

  it("fires a declared 3–10 rounds for FA, clamped", () => {
    expect(burstRounds("fa", 5)).toBe(5);
    expect(burstRounds("fa", 1)).toBe(3);  // min 3
    expect(burstRounds("fa", 20)).toBe(10); // max 10
    expect(burstRounds("fa")).toBe(3);      // default
  });
});

describe("Recoil penalty (SR2E p.93)", () => {
  it("adds the burst's own rounds for a recoil-prone weapon", () => {
    // First BF burst, no prior shots, no comp → +3
    expect(recoilPenalty(0, 3, { isBurst: true, hasRecoil: true, recoilComp: 0 })).toBe(3);
  });

  it("recoil compensation cancels rounds one-for-one (min 0)", () => {
    expect(recoilPenalty(0, 3, { isBurst: true, hasRecoil: true, recoilComp: 2 })).toBe(1);
    expect(recoilPenalty(0, 3, { isBurst: true, hasRecoil: true, recoilComp: 5 })).toBe(0);
  });

  it("counts rounds already fired this phase", () => {
    expect(recoilPenalty(2, 1, { isBurst: false, hasRecoil: true, recoilComp: 0 })).toBe(2);
  });

  it("ignores the burst rounds for weapons not subject to recoil", () => {
    expect(recoilPenalty(0, 3, { isBurst: true, hasRecoil: false, recoilComp: 0 })).toBe(0);
  });
});

describe("Burst/full-auto damage bonus (SR2E p.93)", () => {
  it("adds +1 Power per round and +1 level per 3 rounds", () => {
    expect(burstDamageBonus(3)).toEqual({ powerBonus: 3, levelSteps: 1 });
    expect(burstDamageBonus(6)).toEqual({ powerBonus: 6, levelSteps: 2 });
    expect(burstDamageBonus(10)).toEqual({ powerBonus: 10, levelSteps: 3 });
  });
});

describe("Program memory size (SR2E p.174–177)", () => {
  it("is Rating² × multiplier", () => {
    // Browse ×1: R3 → 9 Mp
    expect(programSize(3, 1)).toBe(9);
    // Attack ×2: R4 → 32 Mp
    expect(programSize(4, 2)).toBe(32);
    // Shield ×4: R2 → 16 Mp
    expect(programSize(2, 4)).toBe(16);
    // Analyze ×3: R6 → 108 Mp
    expect(programSize(6, 3)).toBe(108);
  });
});

describe("Wound level by boxes (SR2E p.113)", () => {
  it("maps 0/1/3/6/10 thresholds to the wound levels", () => {
    expect(woundLevel(0)).toBe("Undamaged");
    expect(woundLevel(1)).toBe("Light");
    expect(woundLevel(2)).toBe("Light");
    expect(woundLevel(3)).toBe("Moderate");
    expect(woundLevel(5)).toBe("Moderate");
    expect(woundLevel(6)).toBe("Serious");
    expect(woundLevel(9)).toBe("Serious");
    expect(woundLevel(10)).toBe("Deadly");
  });
});

describe("First Aid Body modifier (SR2E p.115)", () => {
  it("eases the TN for a tougher patient at Body 4/7/10", () => {
    expect(firstAidBodyMod(3)).toBe(0);
    expect(firstAidBodyMod(4)).toBe(-1);
    expect(firstAidBodyMod(7)).toBe(-2);
    expect(firstAidBodyMod(10)).toBe(-3);
  });
});

describe("Opposed melee outcome (SR2E p.100–101)", () => {
  it("attacker wins on more successes, with the net margin", () => {
    expect(meleeOutcome(4, 1)).toEqual({ winner: "attacker", net: 3 });
  });
  it("ties favour the attacker (net 0)", () => {
    expect(meleeOutcome(2, 2)).toEqual({ winner: "attacker", net: 0 });
  });
  it("defender wins only on strictly more successes", () => {
    expect(meleeOutcome(1, 3)).toEqual({ winner: "defender", net: 2 });
  });
});

describe("Net successes → staging steps (SR2E p.110)", () => {
  it("is 1 step per 2 net successes (round down)", () => {
    expect(netToSteps(0)).toBe(0);
    expect(netToSteps(1)).toBe(0);
    expect(netToSteps(2)).toBe(1);
    expect(netToSteps(3)).toBe(1);
    expect(netToSteps(4)).toBe(2);
    expect(netToSteps(7)).toBe(3);
  });
});

describe("Astral Reaction (SR2E p.147)", () => {
  it("is twice Intelligence", () => {
    expect(astralReaction(6)).toBe(12);
    expect(astralReaction(4)).toBe(8);
    expect(astralReaction(3)).toBe(6);
  });
});

describe("Spell Drain TN (SR2E p.131, p.140)", () => {
  it("is floor(Force / 2) + drain modifier, min 2", () => {
    expect(drainTargetNumber(4, 3)).toBe(5);   // Fireball at Force 4: 2 + 3
    expect(drainTargetNumber(6, 0)).toBe(3);   // 3 + 0
    expect(drainTargetNumber(2, -1)).toBe(2);  // 1 − 1 = 0 → clamped to 2
  });
});

describe("Derived costs (SR2E p.174, p.249)", () => {
  it("program cost is Size × 100", () => {
    expect(programCost(3, 1)).toBe(900);    // Browse R3: size 9
    expect(programCost(4, 2)).toBe(3200);   // Attack R4: size 32
  });

  it("focus cost is Force × per-Force unit", () => {
    expect(focusCost(6, 20000)).toBe(120000); // Power Focus Force 6
    expect(focusCost(1, 5000)).toBe(5000);    // Spell Lock Force 1
  });

  it("weapon focus cost is [(Reach+1)×100k] + Rating×90k (SR2E p.126)", () => {
    expect(weaponFocusCost(1, 2)).toBe(380000); // Reach 1 katana, Force 2
    expect(weaponFocusCost(0, 1)).toBe(190000); // Reach 0, Force 1
    expect(weaponFocusCost(2, 3)).toBe(570000); // Reach 2 polearm, Force 3
  });

  it("astral-only tokens: seen by GM/owner/summoner/friendly/astrally-active (SR2E p.145)", () => {
    const v = (o) => astralAllowsView({ astralOnly: true, isGM: false, viewerAstralActive: false, ownsToken: false, ...o });
    expect(v({})).toBe(false);                          // mundane viewer, hostile/unknown — hidden
    expect(v({ isGM: true })).toBe(true);               // GM always sees
    expect(v({ viewerAstralActive: true })).toBe(true); // perceiving/projecting sees
    expect(v({ ownsToken: true })).toBe(true);          // owner sees their own
    expect(v({ isSummoner: true })).toBe(true);         // a mage always sees their bound spirit
    expect(v({ friendly: true })).toBe(true);           // allied astral beings are visible to all
    // A normal (non-astral) token is unaffected by this rule
    expect(astralAllowsView({ astralOnly: false, isGM: false, viewerAstralActive: false, ownsToken: false })).toBe(true);
  });
});

describe("Persona attribute cap (SR2E p.172–174)", () => {
  it("caps a program's rating at the deck's MPCP", () => {
    expect(personaAttribute(6, 4)).toBe(4); // program higher than MPCP
    expect(personaAttribute(3, 6)).toBe(3); // program lower than MPCP
  });
});

describe("IC Reaction Time base (SR2E p.169)", () => {
  it("is 5/7/9 for Green/Orange/Red and 0 for Blue (no IC)", () => {
    expect(icReactionBase("blue")).toBe(0);
    expect(icReactionBase("green")).toBe(5);
    expect(icReactionBase("orange")).toBe(7);
    expect(icReactionBase("red")).toBe(9);
  });

  it("combined with rating gives the Reaction (before the 1D6)", () => {
    // Orange node, IC rating 4 → 7 + 4 = 11
    expect(icReactionBase("orange") + 4).toBe(11);
  });
});

describe("Alert IC-rating modifier (SR2E p.168)", () => {
  it("leaves ratings unchanged with no alert", () => {
    expect(alertAdjustedRating(4, "none")).toBe(4);
  });

  it("adds +50% (rounded down) on a passive alert", () => {
    expect(alertAdjustedRating(4, "passive")).toBe(6);
    expect(alertAdjustedRating(5, "passive")).toBe(7); // 7.5 → 7
  });

  it("keeps the +50% boost on an active alert", () => {
    expect(alertAdjustedRating(4, "active")).toBe(6);
  });
});

describe("Alert escalation (SR2E p.168)", () => {
  it("steps none → passive → active", () => {
    expect(escalateAlert("none")).toBe("passive");
    expect(escalateAlert("passive")).toBe("active");
    expect(escalateAlert("active")).toBe("active");
  });
});

describe("Vehicle design point-buy (Rigger 2 p.108-123)", () => {
  it("a bare chassis is just its Design Points (Sand Buggy = 20)", () => {
    expect(vehicleDesign({ chassisDP: 20 }).designPoints).toBe(20);
  });
  it("Sports Car chassis = 110 DP", () => {
    expect(vehicleDesign({ chassisDP: 110 }).designPoints).toBe(110);
  });
  it("adds the power plant's Design Points to the chassis", () => {
    expect(vehicleDesign({ chassisDP: 110, powerPlantDP: 165 }).designPoints).toBe(275);
  });
  it("Steffi's Light Strike Vehicle reconstructs to its published 154 DP (full walkthrough, book p.111-115)", () => {
    // Sand Buggy chassis 20 + sand-buggy gasoline engine 25 = 45; off-road
    // Handling −1 (×25 = 25) → 70; Acceleration +2 (×25 = 50) → 120; Cargo +2 CF
    // (×5 = 10) → 130; Load +30 kg (×0.1 = 3) → 133; mods 21 → 154.
    const r = vehicleDesign({
      chassisDP: 20, powerPlantDP: 25,
      improvements: { handling: 1, acceleration: 2, cargo: 2, load: 30 },
      modDP: [21], markUp: 2
    });
    expect(r.designPoints).toBe(154);
    expect(r.cost).toBe(30800); // 154 × Mark-Up 2 × 100
  });
  it("default per-point costs match the book/walkthrough (Handling 25, Accel 25, Speed 2, Cargo 5, Load 0.1/kg)", () => {
    expect(DESIGN_OPTION_COSTS.handling).toBe(25);
    expect(DESIGN_OPTION_COSTS.acceleration).toBe(25);
    expect(DESIGN_OPTION_COSTS.speed).toBe(2);
    expect(DESIGN_OPTION_COSTS.cargo).toBe(5);
    expect(DESIGN_OPTION_COSTS.armor).toBe(50);
    // Load: 1 DP per 10 kg → 0.1/kg, so +50 kg = 5 DP
    expect(vehicleDesign({ chassisDP: 0, improvements: { load: 50 } }).designPoints).toBe(5);
  });
  it("minor design options: economy 5/pt, signature 200/pt, fuel 25/unit (p.116-117)", () => {
    expect(DESIGN_OPTION_COSTS.economy).toBe(5);
    expect(DESIGN_OPTION_COSTS.signature).toBe(200);
    expect(DESIGN_OPTION_COSTS.fuel).toBe(25);
    // 2 economy + 1 signature + 3 fuel = 10 + 200 + 75 = 285 DP
    expect(vehicleDesign({ improvements: { economy: 2, signature: 1, fuel: 3 } }).designPoints).toBe(285);
  });
  it("final cost = Design Points × Mark-Up Factor × 100 (book p.115 worked examples)", () => {
    // Rich's final 1,239-DP car at Mark-Up 2.5 → 309,750¥
    expect(vehicleDesign({ chassisDP: 1239, markUp: 2.5 }).cost).toBe(309750);
    // Steff's 154-DP Light Strike at Mark-Up 2 → 30,800¥ (before the GM's rounding)
    expect(vehicleDesign({ chassisDP: 154, markUp: 2 }).cost).toBe(30800);
    expect(vehicleDesign({ chassisDP: 0, markUp: 5 }).cost).toBe(0);
  });
});

describe("designNum — parsing design-table cells", () => {
  it("passes finite numbers", () => {
    expect(designNum(110)).toBe(110);
    expect(designNum(0)).toBe(0);
  });
  it("parses purely-numeric strings (handling stored as \"4\")", () => {
    expect(designNum("4")).toBe(4);
    expect(designNum("0.1")).toBe(0.1);
  });
  it("rejects drone-formula / range / null cells", () => {
    expect(designNum("5x8")).toBe(null);   // load = ×Body
    expect(designNum("0-8")).toBe(null);   // signature range
    expect(designNum("35 + (10x8)")).toBe(null);
    expect(designNum(null)).toBe(null);
    expect(designNum(undefined)).toBe(null);
    expect(designNum(NaN)).toBe(null);
  });
});

describe("resolveVehicleDesign — design tables → DP, cost, base stats", () => {
  // A minimal normalized registry, shaped like CONFIG.SR2E.vehicleDesign.
  const tables = {
    chassis: {
      sportsCar: { name: "Sports Car", dp: 110, handling: "3", body: 2, armor: 0,
                   pilot: 0, sensor: 1, autonav: 0, cargoStart: 0, cargoMax: 20, seating: "2" },
      tracked:   { name: "Tracked Drone", dp: "5x8", handling: "4", body: 1 } // unbuildable DP
    },
    powerPlants: {
      scGas: { name: "Sports Car (gasoline)", engine: "gasoline", dp: 65,
               speedStart: 90, speedMax: 260, accelStart: 5, accelMax: 16,
               loadStart: 40, loadMax: 160, sig: 4 }
    }
  };

  it("sums chassis + power-plant DP and applies the cost formula", () => {
    const r = resolveVehicleDesign(
      { chassisKey: "sportsCar", powerPlantKey: "scGas", markUp: 2 }, tables
    );
    expect(r.valid).toBe(true);
    expect(r.designPoints).toBe(175);      // 110 + 65
    expect(r.cost).toBe(35000);            // 175 × 2 × 100
  });

  it("improvement deltas raise DP and the applied stats (clamped to maxes)", () => {
    const r = resolveVehicleDesign({
      chassisKey: "sportsCar", powerPlantKey: "scGas",
      improvements: { speed: 100, acceleration: 11, armor: 2, handling: 1 },
      markUp: 1
    }, tables);
    // DP: 175 + speed 100×2 + accel 11×25 + armor 2×50 + handling 1×25
    //   = 175 + 200 + 275 + 100 + 25 = 775
    expect(r.designPoints).toBe(775);
    expect(r.baseStats.speed).toBe(190);          // 90 + 100
    expect(r.baseStats.acceleration).toBe(16);    // 5 + 11 = 16 (= max, clamped)
    expect(r.baseStats.armor).toBe(2);            // 0 + 2
    expect(r.baseStats.handling).toBe(2);         // 3 − 1 (lower = better)
    expect(r.baseStats.body).toBe(2);
    expect(r.baseStats.signature).toBe(4);
  });

  it("applies the on-road value when handling is a \"4/8\" road/off-road pair", () => {
    const t = {
      chassis: { car: { name: "Car", dp: 100, handling: "4/8", body: 3 } },
      powerPlants: { gas: { name: "Gas", engine: "gasoline", dp: 50, speedStart: 90, speedMax: 200, accelStart: 5, accelMax: 16, sig: 3 } }
    };
    const r = resolveVehicleDesign({ chassisKey: "car", powerPlantKey: "gas", improvements: { handling: 1 } }, t);
    expect(r.baseStats.handling).toBe(3);  // on-road 4 − 1 improvement
  });

  it("speed clamps to the power plant maximum", () => {
    const r = resolveVehicleDesign({
      chassisKey: "sportsCar", powerPlantKey: "scGas",
      improvements: { speed: 9999 }
    }, tables);
    expect(r.baseStats.speed).toBe(260);          // speedMax
  });

  it("modDP adds installed-modification Design Points", () => {
    const r = resolveVehicleDesign(
      { chassisKey: "sportsCar", powerPlantKey: "scGas", modDP: 60 }, tables
    );
    expect(r.designPoints).toBe(235);             // 175 + 60
  });

  it("flags missing selections and unknown keys", () => {
    expect(resolveVehicleDesign({}, tables).missing).toContain("chassis");
    expect(resolveVehicleDesign({ chassisKey: "nope", powerPlantKey: "scGas" }, tables).missing)
      .toContain("unknownChassis");
  });

  it("flags a chassis whose DP is an unbuildable drone formula", () => {
    const r = resolveVehicleDesign(
      { chassisKey: "tracked", powerPlantKey: "scGas" }, tables
    );
    expect(r.valid).toBe(false);
    expect(r.missing).toContain("chassisDP");
  });
});

describe("modDesignPoints — a mod's Design Cost by rating (Rigger 2 p.118-146)", () => {
  it("flat designPoints ignores rating (Ring Mount 10, Pintle 1)", () => {
    expect(modDesignPoints({ designPoints: 10 })).toBe(10);
    expect(modDesignPoints({ designPoints: 1, rating: 3 })).toBe(1);
  });
  it("dpPerLevel scales linearly with rating (Nitrous Oxide 55/level)", () => {
    expect(modDesignPoints({ dpPerLevel: 55, rating: 1 })).toBe(55);
    expect(modDesignPoints({ dpPerLevel: 55, rating: 3 })).toBe(165);
    expect(modDesignPoints({ dpPerLevel: 55, rating: 0 })).toBe(0);
  });
  it("dpTable looks up non-linear DP by rating (Autonav 5/10/50/150)", () => {
    const auto = { dpTable: [5, 10, 50, 150] };
    expect(modDesignPoints({ ...auto, rating: 1 })).toBe(5);
    expect(modDesignPoints({ ...auto, rating: 3 })).toBe(50);
    expect(modDesignPoints({ ...auto, rating: 4 })).toBe(150);
    expect(modDesignPoints({ ...auto, rating: 0 })).toBe(0);   // not installed
    expect(modDesignPoints({ ...auto, rating: 9 })).toBe(150); // clamp to last
  });
  it("dpTable overrides; otherwise base + per-level are additive (Life Support 5 + 1/level)", () => {
    expect(modDesignPoints({ dpTable: [7], dpPerLevel: 55, designPoints: 3, rating: 1 })).toBe(7);
    expect(modDesignPoints({ designPoints: 5, dpPerLevel: 1, rating: 4 })).toBe(9);
    expect(modDesignPoints({ dpPerLevel: 4, designPoints: 3, rating: 2 })).toBe(11);
  });
});

describe("modCfConsumed / modLoadReduction — CF + Load budgets (Rigger 2 p.115)", () => {
  it("CF: flat, per-Armor-Point, and EW table by rating", () => {
    expect(modCfConsumed({ cfConsumed: 1 })).toBe(1);                       // Ring Mount
    expect(modCfConsumed({ cfPerLevel: 2, rating: 4 })).toBe(8);            // Concealed armor, 4 pts
    expect(modCfConsumed({ cfTable: [0, 1, 2, 3, 2, 4, 6, 10, 12, 16], rating: 8 })).toBe(10); // ECM L8
  });
  it("Load: flat + per-level (Gunnery Recoil Adjuster 24 + 1/level)", () => {
    expect(modLoadReduction({ loadReduction: 25 })).toBe(25);              // Ring Mount
    expect(modLoadReduction({ loadReduction: 24, loadPerLevel: 1, rating: 6 })).toBe(30);
  });
  it("aggregateModDesign sums cf and load too", () => {
    const r = aggregateModDesign([
      { cfConsumed: 1, loadReduction: 25 },              // Ring Mount
      { cfPerLevel: 2, rating: 3 },                      // Concealed armor 3 pts -> 6 CF
      { cfConsumed: 0.5 }                                // Electronics Port
    ]);
    expect(r.cf).toBe(7.5);
    expect(r.load).toBe(25);
  });
});

describe("aggregateModDesign — installed-mod contributions to a build", () => {
  it("sums Design Points and ¥ cost across mods", () => {
    const r = aggregateModDesign([
      { designPoints: 21, cost: 0 },
      { designPoints: 39, cost: 0 },
      { designPoints: 0, cost: 5000 }   // ¥-priced customization
    ]);
    expect(r.designPoints).toBe(60);
    expect(r.cost).toBe(5000);
  });
  it("treats missing/non-numeric fields as 0", () => {
    const r = aggregateModDesign([{ cost: 1500 }, {}, { designPoints: "x" }]);
    expect(r.designPoints).toBe(0);
    expect(r.cost).toBe(1500);
  });
  it("empty list is zero", () => {
    expect(aggregateModDesign()).toEqual({ designPoints: 0, cost: 0, cf: 0, load: 0 });
  });
  it("folds into resolveVehicleDesign via modDP (DP and then cost added on top)", () => {
    const tables = { chassis: { c: { name: "C", dp: 100, handling: "3", body: 2 } },
      powerPlants: { p: { name: "P", engine: "gas", dp: 50, speedStart: 90, speedMax: 200, accelStart: 5, accelMax: 16, sig: 3 } } };
    const agg = aggregateModDesign([{ designPoints: 10, cost: 5000 }]);
    const result = resolveVehicleDesign({ chassisKey: "c", powerPlantKey: "p", modDP: agg.designPoints, markUp: 1 }, tables);
    expect(result.designPoints).toBe(160);        // 100 + 50 + 10 mod DP
    expect(result.cost + agg.cost).toBe(21000);   // 160×100 + 5,000 mod ¥
  });
});

describe("Engine customization cost (Rigger 2 p.120)", () => {
  it("first level = power-plant DP × 1.25", () => {
    expect(engineCustomizationCost(100, 1)).toBe(125);
  });
  it("each added level adds 0.5 to the multiplier (3 levels = ×2.25)", () => {
    expect(engineCustomizationCost(100, 2)).toBe(175);
    expect(engineCustomizationCost(100, 3)).toBe(225);
  });
  it("zero or negative levels cost nothing", () => {
    expect(engineCustomizationCost(100, 0)).toBe(0);
  });
});


describe("skillsoft memory + cost (Skill Memory Table p.248, costs p.243)", () => {
  it("General row Mp by rating; Language row for LinguaSofts", () => {
    expect(skillsoftMemory("active", 8)).toBe(800);     // General rating 8
    expect(skillsoftMemory("knowledge", 1)).toBe(10);
    expect(skillsoftMemory("language", 8)).toBe(80);    // Language row
    expect(skillsoftMemory("active", 0)).toBe(0);
    expect(skillsoftMemory("active", 11)).toBe(0);
  });
  it("cost = Mp × per-type rate", () => {
    expect(skillsoftCost("active", 8)).toBe(80000);     // 800 × 100
    expect(skillsoftCost("knowledge", 1)).toBe(1500);   // 10 × 150
    expect(skillsoftCost("language", 8)).toBe(4000);    // 80 × 50
  });
});

describe("shotgun shot-round spread (SR2E p.95 diagram)", () => {
  it("choke 3 matches the diagram steps/power/TN/width", () => {
    expect(shotgunSpread(3, 2)).toEqual({ steps: 0, powerPenalty: 0, tnModifier: 0, halfWidthM: 1 });
    expect(shotgunSpread(3, 3)).toEqual({ steps: 1, powerPenalty: 1, tnModifier: -1, halfWidthM: 2 });
    expect(shotgunSpread(3, 6)).toEqual({ steps: 2, powerPenalty: 2, tnModifier: -2, halfWidthM: 3 });
    expect(shotgunSpread(3, 9)).toEqual({ steps: 3, powerPenalty: 3, tnModifier: -3, halfWidthM: 4 });
  });
  it("choke clamps to 2-10 and a tight choke spreads slower", () => {
    expect(shotgunSpread(10, 9).steps).toBe(0);   // choke 10: no spread until 10 m
    expect(shotgunSpread(1, 4).steps).toBe(2);    // clamped to 2 → floor(4/2)
  });
});

describe("skillSubRatings — Concentrations & Specializations (SR2E p.55, p.70)", () => {
  it("matches the book's chargen example: allocate 5 with a Specialization → general 3 / conc 5 / spec 7", () => {
    // The stored rating is the FINAL general rating (3)
    expect(skillSubRatings(3)).toEqual({ concentration: 5, specialization: 7 });
  });
  it("concentration alone: allocate 5 → general 4 / concentration 6", () => {
    expect(skillSubRatings(4).concentration).toBe(6);
  });
});

describe("streetPrice (Street Index, SR2E p.238)", () => {
  it("marks prices up/down by the Street Index, rounded", () => {
    expect(streetPrice(500, 1)).toBe(500);
    expect(streetPrice(500, 1.25)).toBe(625);
    expect(streetPrice(20, 0.75)).toBe(15);
    expect(streetPrice(333, 1.5)).toBe(500);   // 499.5 rounds to 500
  });
  it("treats missing/zero SI as list price", () => {
    expect(streetPrice(500, 0)).toBe(500);
    expect(streetPrice(500, "")).toBe(500);
    expect(streetPrice(500, undefined)).toBe(500);
  });
});

describe("knockdown (SR2E p.91)", () => {
  it("TN is half Power (round down), full Power for gel, min 2", () => {
    expect(knockdownTN(9)).toBe(4);      // 9 → 4
    expect(knockdownTN(6)).toBe(3);
    expect(knockdownTN(9, true)).toBe(9); // gel: full power
    expect(knockdownTN(2)).toBe(2);       // floor(1) clamped to 2
  });
  it("threshold = half the damage done: L1/M2/S3, Deadly always drops", () => {
    expect(knockdownThreshold("L")).toBe(1);
    expect(knockdownThreshold("M")).toBe(2);
    expect(knockdownThreshold("S")).toBe(3);
    expect(knockdownThreshold("D")).toBe(Infinity);
  });
  it("outcome: meet threshold = none, 0 = prone, between = stagger, Deadly = prone", () => {
    expect(knockdownOutcome("M", 2)).toBe("none");
    expect(knockdownOutcome("M", 1)).toBe("stagger");
    expect(knockdownOutcome("M", 0)).toBe("prone");
    expect(knockdownOutcome("S", 2)).toBe("stagger");
    expect(knockdownOutcome("D", 5)).toBe("prone");
    expect(knockdownOutcome("L", 1)).toBe("none");
  });
});

describe("reactionBase (SR2E p.60, p.249)", () => {
  it("floor((Q+I)/2) normally", () => {
    expect(reactionBase(6, 5)).toBe(5);   // (6+5)/2 = 5.5 → 5
    expect(reactionBase(4, 4)).toBe(4);
  });
  it("Muscle Replacement Quickness does NOT feed Reaction (p.249)", () => {
    // Q6 including +2 from Muscle Replacement, Int 4: Reaction uses Q4 → 4
    expect(reactionBase(6, 4, 2)).toBe(4);
    // without the exemption it would be (6+4)/2 = 5
    expect(reactionBase(6, 4, 0)).toBe(5);
  });
});

describe("adeptPowerCost (SR2E p.124–126)", () => {
  it("Increased Reflexes is cumulative 1 / 4 / 6 for 1 / 2 / 3 dice", () => {
    expect(adeptPowerCost({ name: "Increased Reflexes", pointCost: 1, level: 1 })).toBe(1);
    expect(adeptPowerCost({ name: "Increased Reflexes", pointCost: 1, level: 2 })).toBe(4);
    expect(adeptPowerCost({ name: "Increased Reflexes", pointCost: 1, level: 3 })).toBe(6);
  });
  it("Increased Reaction is tiered by racial Reaction max (human 6: 0.5/1/2 bands)", () => {
    // +2 both in the ≤½-max band (≤3): 0.5 + 0.5 = 1
    expect(adeptPowerCost({ name: "Increased Reaction", level: 2 }, 6)).toBe(1);
    // +4: 3×0.5 + 1×1 = 2.5
    expect(adeptPowerCost({ name: "Increased Reaction", level: 4 }, 6)).toBe(2.5);
    // +7: 3×0.5 + 3×1 + 1×2 = 6.5 (into the 1.5× band)
    expect(adeptPowerCost({ name: "Increased Reaction", level: 7 }, 6)).toBe(6.5);
  });
  it("other powers are linear pointCost × level", () => {
    expect(adeptPowerCost({ name: "Improved Ability", pointCost: 0.5, level: 4 })).toBe(2);
    expect(adeptPowerCost({ name: "Pain Resistance", pointCost: 0.5, level: 3 })).toBe(1.5);
  });
});

describe("chargenSpend — priority budget tracking (SR2E p.44–45)", () => {
  it("sums the six attribute BASE ratings only (Reaction/Essence/Magic excluded)", () => {
    const attrs = [{ base: 6 }, { base: 5 }, { base: 5 }, { base: 4 }, { base: 4 }, { base: 3 }]; // = 27
    const r = chargenSpend({ attributes: attrs }, { attributes: 30 });
    expect(r.attributes).toEqual({ spent: 27, total: 30, remaining: 3, over: false });
  });
  it("counts active + build/repair skills, not knowledge/language/special", () => {
    const skills = [
      { category: "active", rating: 6 }, { category: "build_repair", rating: 4 },
      { category: "knowledge", rating: 5 }, { category: "language", rating: 3 },
      { category: "special", rating: 2 }
    ];
    const r = chargenSpend({ skills }, { skills: 8 });
    expect(r.skills.spent).toBe(10);   // 6 + 4 only
    expect(r.skills.over).toBe(true);  // 10 > 8
  });
  it("sums gear list cost × quantity; ammo counts its bundle, not ×rounds", () => {
    const items = [
      { type: "weapon", cost: 700, quantity: 1 },
      { type: "ammo", cost: 20, quantity: 3 },      // bundle price 20 — NOT 20×3
      { type: "skill", cost: 999 },                  // not a resource type
      { type: "cyberware", cost: 5000 }
    ];
    const r = chargenSpend({ items }, { resources: 90000 });
    // Ammo's `cost` is the whole bundle, so a 3-round box counts 20, not 60
    // (the old ×quantity was the 10×-overcharge bug, PLAN-ammo-stacking #4).
    expect(r.resources.spent).toBe(700 + 20 + 5000);
    expect(r.resources.remaining).toBe(90000 - 5720);
  });
  // Regression: resources were summed from each item's flat `cost`, so a rated
  // item (whose prices live in ratingStats, flat cost usually 0) counted as FREE,
  // grade multipliers were ignored, and bioware was left out of the resource list
  // entirely. A starting character could load up on chrome for nothing.
  it("prices rated items from their ratingStats row, not the flat cost", () => {
    const rows = [{ rating: 1, cost: 60000 }, { rating: 2, cost: 100000 }];
    const r = chargenSpend({ items: [
      { type: "cyberware", cost: 0, rating: 2, grade: "standard", ratingStats: rows }
    ] }, { resources: 1000000 });
    expect(r.resources.spent).toBe(100000);
  });
  it("counts bioware as a resource", () => {
    const r = chargenSpend({ items: [
      { type: "bioware", cost: 60000, rating: 1, grade: "standard", ratingStats: [] }
    ] }, { resources: 1000000 });
    expect(r.resources.spent).toBe(60000);
  });
  it("applies grade multipliers to the resource total", () => {
    const cultured = chargenSpend({ items: [
      { type: "bioware", cost: 60000, rating: 1, grade: "cultured", ratingStats: [] }
    ] }, { resources: 1000000 });
    expect(cultured.resources.spent).toBe(240000);   // ×4 (Shadowtech p.7)
    const alpha = chargenSpend({ items: [
      { type: "cyberware", cost: 55000, rating: 1, grade: "alpha", ratingStats: [] }
    ] }, { resources: 1000000 });
    expect(alpha.resources.spent).toBe(165000);      // ×3 (SSC p.98)
  });
  it("Force Points = spell Force + focus bonding cost", () => {
    const items = [
      { type: "spell", force: 4 }, { type: "spell", force: 5 },
      { type: "focus", bondingCost: 8 }
    ];
    const r = chargenSpend({ items }, { forcePoints: 15 });
    expect(r.forcePoints.spent).toBe(17); // 4 + 5 + 8
    expect(r.forcePoints.over).toBe(true); // 17 > 15
  });
});

describe("VR2.0 Matrix primitives (FASA7904)", () => {
  it("Cybercombat TN by Security Code × icon status (p.123)", () => {
    expect(cybercombatTN("blue", "intruding")).toBe(6);
    expect(cybercombatTN("blue", "legitimate")).toBe(3);
    expect(cybercombatTN("red", "intruding")).toBe(3);
    expect(cybercombatTN("orange", "legitimate")).toBe(5);
  });
  it("IC Damage Level by Security Code (p.124)", () => {
    expect(icDamageLevel("blue")).toBe("M");
    expect(icDamageLevel("green")).toBe("M");
    expect(icDamageLevel("orange")).toBe("S");
    expect(icDamageLevel("red")).toBe("S");
  });
  it("Dump shock damage: level by code, Power = Security Value (p.124)", () => {
    expect(dumpShockDamage("blue", 4)).toEqual({ power: 4, level: "L", type: "stun" });
    expect(dumpShockDamage("red", 8)).toEqual({ power: 8, level: "D", type: "stun" });
  });
  it("Dump shock: cool deck −2 Power/−1 Level, ICCM stacks, tortoise immune", () => {
    // Orange (S) value 6, cool deck: power 4, level M
    expect(dumpShockDamage("orange", 6, { coolDeck: true })).toEqual({ power: 4, level: "M", type: "stun" });
    // Red (D) value 6, cool deck + ICCM: power 2, level −2 steps → M
    expect(dumpShockDamage("red", 6, { coolDeck: true, iccm: true })).toEqual({ power: 2, level: "M", type: "stun" });
    // Tortoise user is immune
    expect(dumpShockDamage("red", 8, { tortoise: true })).toBeNull();
    // Blue (L) fully mitigated by a cool deck (level below Light)
    expect(dumpShockDamage("blue", 4, { coolDeck: true })).toBeNull();
  });
  it("Detection Factor = ceil(avg(Masking, Sleaze)) (p.17–18)", () => {
    expect(detectionFactor(5, 0)).toBe(3);   // ceil(2.5)
    expect(detectionFactor(4, 6)).toBe(5);   // ceil(5)
    expect(detectionFactor(3)).toBe(2);      // ceil(1.5)
  });
  it("Program price is tiered by rating (p.107)", () => {
    expect(matrixProgramMultiplierVR2(3)).toBe(100);
    expect(matrixProgramMultiplierVR2(5)).toBe(200);
    expect(matrixProgramMultiplierVR2(8)).toBe(500);
    expect(matrixProgramMultiplierVR2(10)).toBe(1000);
    // Rating 5 Attack (size = 25 × 2 = 50) → 50 × 200 = 10,000¥
    expect(programCostVR2(5, 2)).toBe(10000);
    // Rating 1 (size 2) → 200 (matches core at low rating)
    expect(programCostVR2(1, 2)).toBe(200);
  });
  it("Program Street Index by rating band (p.107)", () => {
    expect(programStreetIndexVR2(3)).toBe(1);
    expect(programStreetIndexVR2(4)).toBe(1.5);
    expect(programStreetIndexVR2(7)).toBe(2);
    expect(programStreetIndexVR2(12)).toBe(3);
  });
  it("Condition Monitor fill per level (p.124): L1/M2/S3/D6", () => {
    expect(matrixConditionBoxes("L")).toBe(1);
    expect(matrixConditionBoxes("M")).toBe(2);
    expect(matrixConditionBoxes("S")).toBe(3);
    expect(matrixConditionBoxes("D")).toBe(6);
  });
  it("Cybercombat staging — the book's Cassie example (p.124)", () => {
    // Killer-6 on an Orange host = base Serious; IC 3 successes stage up to
    // Deadly; Cassie's Bod(2) resist with 4 successes stages down to Moderate.
    expect(matrixCombatOutcome("S", 3, 4)).toEqual({ level: "M", boxes: 2 });
  });
  it("Cybercombat staging — up clamps at Deadly, full resist = no damage", () => {
    expect(matrixCombatOutcome("S", 6, 0)).toEqual({ level: "D", boxes: 6 }); // +3 clamps at D
    expect(matrixCombatOutcome("L", 0, 4)).toEqual({ level: null, boxes: 0 }); // staged below L
  });
  it("Simsense Overload TN by level (p.124); Deadly auto-crashes → null", () => {
    expect(simsenseOverloadTN("L")).toBe(2);
    expect(simsenseOverloadTN("M")).toBe(3);
    expect(simsenseOverloadTN("S")).toBe(5);
    expect(simsenseOverloadTN("D")).toBeNull();
  });
});

describe("Skill Web defaulting algorithm (SR2E p.68–69)", () => {
  // Fixture web (not the real book graph — proves the ALGORITHM). All links
  // one-way (aToB) so the arrow-blocking assertions stay meaningful (real data
  // is two-way by default; printed arrows are the exception):
  //   quickness →2→ firearms →1→ gunnery
  //   quickness →1→ athletics
  const web = { links: [
    { from: "quickness", to: "firearms", circles: 2, dir: "aToB" },
    { from: "firearms", to: "gunnery", circles: 1, dir: "aToB" },
    { from: "quickness", to: "athletics", circles: 1, dir: "aToB" },
  ] };

  it("prefers the cheaper related-skill path over the attribute path", () => {
    // Rolling firearms with gunnery known: trace desired(firearms)→owned(gunnery)
    // follows the arrow firearms→gunnery = 1 circle (+2), cheaper than the
    // attribute path quickness→firearms = 2 circles (+4).
    expect(webDefaultingTN(web, "firearms", ["gunnery"]))
      .toEqual({ penalty: 2, source: "gunnery", kind: "skill" });
  });

  it("+2 per circle when defaulting to the linked attribute", () => {
    // Untrained firearms, no related skill: quickness → firearms = 2 circles.
    expect(webDefaultingTN(web, "firearms", [])).toEqual({ penalty: 4, source: "quickness", kind: "attribute" });
  });

  it("respects arrow direction — a blocked related path falls back to the attribute", () => {
    // Rolling gunnery with only firearms known: there is no forward path
    // gunnery→firearms (the arrow runs firearms→gunnery), so the shortcut is
    // blocked and it defaults via the attribute (quickness→gunnery = 3 circles).
    expect(webDefaultingTN(web, "gunnery", ["firearms"]))
      .toEqual({ penalty: 6, source: "quickness", kind: "attribute" });
  });

  it("returns null for a skill nothing connects to", () => {
    expect(webDefaultingTN(web, "unreachable", ["firearms"])).toBeNull();
  });
});
