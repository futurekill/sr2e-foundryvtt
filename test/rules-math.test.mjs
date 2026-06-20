import { describe, it, expect } from "vitest";
import {
  DAMAGE_LEVELS, damageBoxes, stageLevel,
  columnWoundPenalty, totalWoundPenalty,
  systemOperationTN, personaAttribute,
  icReactionBase, alertAdjustedRating, escalateAlert, programSize,
  burstRounds, recoilPenalty, burstDamageBonus,
  programCost, focusCost,
  netToSteps, astralReaction, drainTargetNumber,
  woundLevel, firstAidBodyMod, meleeOutcome, containerEssence
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
