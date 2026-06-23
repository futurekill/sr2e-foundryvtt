import { describe, it, expect } from "vitest";
import {
  DAMAGE_LEVELS, damageBoxes, stageLevel,
  columnWoundPenalty, totalWoundPenalty,
  systemOperationTN, personaAttribute,
  icReactionBase, alertAdjustedRating, escalateAlert, programSize,
  burstRounds, recoilPenalty, burstDamageBonus,
  programCost, focusCost,
  netToSteps, astralReaction, drainTargetNumber,
  woundLevel, firstAidBodyMod, meleeOutcome, containerEssence,
  vehicleDesign, engineCustomizationCost, DESIGN_OPTION_COSTS,
  resolveVehicleDesign, designNum, aggregateModDesign, modDesignPoints
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

describe("Astral Reaction (SR2E p.146)", () => {
  it("is (Intelligence + Willpower) / 2, rounded down", () => {
    expect(astralReaction(6, 6)).toBe(6);
    expect(astralReaction(5, 4)).toBe(4); // 4.5 → 4
    expect(astralReaction(3, 2)).toBe(2);
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
  it("rating improvements use the flat per-point costs and accumulate — Rich's Sports Car reaches 599 DP", () => {
    // Worked example p.112-113: Sports Car (chassis 110) + its engine (165 DP,
    // implied) + Accel +11 ×2 (22) + Speed +151 ×2 (302) = 599. Uses the default
    // DESIGN_OPTION_COSTS (acceleration 2, speed 2).
    const r = vehicleDesign({
      chassisDP: 110, powerPlantDP: 165,
      improvements: { acceleration: 11, speed: 151 }
    });
    expect(r.designPoints).toBe(599);
  });
  it("modifications add their Design-Point cost — Rich's build hits 659 DP after mods", () => {
    const r = vehicleDesign({
      chassisDP: 110, powerPlantDP: 165,
      improvements: { acceleration: 11, speed: 151 },
      modDP: [21, 39] // p.113 mods totalling 60 DP
    });
    expect(r.designPoints).toBe(659);
  });
  it("default per-point costs match the book (Handling 25, Speed/Accel 2, Cargo 1, Armor 50, Load 0.1/kg)", () => {
    expect(DESIGN_OPTION_COSTS.handling).toBe(25);
    expect(DESIGN_OPTION_COSTS.speed).toBe(2);
    expect(DESIGN_OPTION_COSTS.acceleration).toBe(2);
    expect(DESIGN_OPTION_COSTS.cargo).toBe(1);
    expect(DESIGN_OPTION_COSTS.armor).toBe(50);
    // Load: 1 DP per 10 kg → 0.1/kg, so +50 kg = 5 DP
    expect(vehicleDesign({ chassisDP: 0, improvements: { load: 50 } }).designPoints).toBe(5);
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
    // DP: 175 + 100×2 + 11×2 + 2×50 + 1×25 = 175+200+22+100+25 = 522
    expect(r.designPoints).toBe(522);
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
  it("dpTable wins over dpPerLevel wins over flat", () => {
    expect(modDesignPoints({ dpTable: [7], dpPerLevel: 55, designPoints: 3, rating: 1 })).toBe(7);
    expect(modDesignPoints({ dpPerLevel: 4, designPoints: 3, rating: 2 })).toBe(8);
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
    expect(aggregateModDesign()).toEqual({ designPoints: 0, cost: 0 });
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
