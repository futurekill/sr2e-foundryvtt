import { describe, it, expect } from "vitest";
import {
  DAMAGE_LEVELS, damageBoxes, stageLevel,
  columnWoundPenalty, totalWoundPenalty,
  systemOperationTN, personaAttribute,
  icReactionBase, alertAdjustedRating, escalateAlert, programSize,
  burstRounds, recoilPenalty, burstDamageBonus,
  programCost, focusCost, weaponFocusCost, astralAllowsView,
  netToSteps, astralReaction, drainTargetNumber,
  woundLevel, healingDrainLevel, healingSpellTN, healingBaseTime,
  healingTimeReduced, splitHealingSuccesses, firstAidBodyMod, meleeOutcome, containerEssence,
  skillsoftMemory, skillsoftCost, shotgunSpread, skillSubRatings, streetPrice, knockdownTN, knockdownThreshold, knockdownOutcome, reactionBase,
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

describe("Healing Table + success split (SR2E p.155)", () => {
  it("base maintenance time is 5/10/15/20 turns for L/M/S/D", () => {
    expect(healingBaseTime("L")).toBe(5);
    expect(healingBaseTime("M")).toBe(10);
    expect(healingBaseTime("S")).toBe(15);
    expect(healingBaseTime("D")).toBe(20);
  });

  it("divides successes into the base time, rounding up, floor 1 turn", () => {
    expect(healingTimeReduced(15, 3)).toBe(5);    // Serious, 3 successes → 5 turns
    expect(healingTimeReduced(20, 4)).toBe(5);    // Deadly, 4 → 5
    expect(healingTimeReduced(10, 3)).toBe(4);    // 10/3 = 3.33 → 4 turns
    expect(healingTimeReduced(5, 99)).toBe(1);    // never below one turn
  });

  it("spending nothing on time leaves the base time", () => {
    expect(healingTimeReduced(15, 0)).toBe(15);
  });

  it("splits successes between boxes and time, clamped to what was rolled", () => {
    expect(splitHealingSuccesses(5, 2)).toEqual({ boxes: 3, toTime: 2 });
    expect(splitHealingSuccesses(5, 0)).toEqual({ boxes: 5, toTime: 0 });
    expect(splitHealingSuccesses(5, 5)).toEqual({ boxes: 0, toTime: 5 });
    // can't spend successes you don't have
    expect(splitHealingSuccesses(3, 9)).toEqual({ boxes: 0, toTime: 3 });
    expect(splitHealingSuccesses(3, -2)).toEqual({ boxes: 3, toTime: 0 });
  });
});

describe("Treat / Heal cast TN (SR2E p.155)", () => {
  it("Treat is 8 − Essence, Heal is 10 − Essence", () => {
    expect(healingSpellTN(8, 6)).toBe(2);    // Treat on an unmodified subject
    expect(healingSpellTN(10, 6)).toBe(4);   // Heal on an unmodified subject
    expect(healingSpellTN(10, 12)).toBe(2);  // a high-Essence critter (vampire 2D6): floored at TN 2
    expect(healingSpellTN(10, 3)).toBe(7);   // heavily chromed → much harder
    expect(healingSpellTN(8, 3)).toBe(5);
  });

  it("floors a fractional Essence, so cyberware never makes healing easier", () => {
    // Essence 5.4 → ⌊5.4⌋ = 5 → 10 − 5 = 5, i.e. ⌈10 − 5.4⌉. Matches the
    // system's existing Magic = ⌊Essence⌋ convention.
    expect(healingSpellTN(10, 5.4)).toBe(5);
    expect(healingSpellTN(10, 5.9)).toBe(5);
    expect(healingSpellTN(8, 0.5)).toBe(8);
  });

  it("never drops below the TN floor of 2", () => {
    expect(healingSpellTN(8, 9)).toBe(2);
    expect(healingSpellTN(8, 6.9)).toBe(2);
  });
});

describe("Treat / Heal Drain Level (SR2E p.155)", () => {
  it("maps the subject's physical wound level to the four drain levels", () => {
    expect(healingDrainLevel(1)).toBe("L");
    expect(healingDrainLevel(3)).toBe("M");
    expect(healingDrainLevel(6)).toBe("S");
    expect(healingDrainLevel(10)).toBe("D");
  });

  it("floors an undamaged subject at Light (nothing to heal)", () => {
    expect(healingDrainLevel(0)).toBe("L");
  });

  it("reads the physical monitor only — these spells don't treat stun", () => {
    // 2 physical boxes is Light whatever the stun monitor says; stun is not an
    // input at all, which is the point (SR2E p.155).
    expect(healingDrainLevel(2)).toBe("L");
    expect(healingDrainLevel(9)).toBe("S");
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
  it("program cost is Size × a per-Mp rate that STEPS by rating band (p.259)", () => {
    // Utility column: 1-3 → 100¥, 4-6 → 200¥, 7-9 → 500¥, 10+ → 1,000¥.
    expect(programCost(3, 1)).toBe(900);      // Browse R3: size 9 × 100
    expect(programCost(4, 2)).toBe(6400);     // Attack R4: size 32 × 200
    expect(programCost(7, 2)).toBe(49000);    // size 98 × 500
    expect(programCost(10, 2)).toBe(200000);  // size 200 × 1,000

    // Persona column is steeper: 1-3 → 100¥, 4-6 → 500¥, 7-9 → 1,000¥, 10+ → 5,000¥.
    expect(programCost(3, 3, true)).toBe(2700);    // Bod R3: size 27 × 100
    expect(programCost(4, 3, true)).toBe(24000);   // size 48 × 500
    expect(programCost(7, 3, true)).toBe(147000);  // size 147 × 1,000
  });

  it("the band edges are 3/4, 6/7 and 9/10", () => {
    // Guards an off-by-one in the band lookup: each pair straddles one edge.
    expect(programCost(3, 1)).toBe(9 * 100);
    expect(programCost(4, 1)).toBe(16 * 200);
    expect(programCost(6, 1)).toBe(36 * 200);
    expect(programCost(7, 1)).toBe(49 * 500);
    expect(programCost(9, 1)).toBe(81 * 500);
    expect(programCost(10, 1)).toBe(100 * 1000);
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
    expect(v({ revealed: true })).toBe(true);           // spotted by a live FAB-UV search (CSH p.103)
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
    expect(knockdownOutcome("M", 3)).toBe("none");
    expect(knockdownOutcome("M", 2)).toBe("stagger");   // must EXCEED the threshold
    expect(knockdownOutcome("M", 1)).toBe("stagger");
    expect(knockdownOutcome("M", 0)).toBe("prone");
    expect(knockdownOutcome("S", 2)).toBe("stagger");
    expect(knockdownOutcome("D", 5)).toBe("prone");
    expect(knockdownOutcome("L", 1)).toBe("stagger");
    expect(knockdownOutcome("L", 2)).toBe("none");
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
  it("every skill costs Skill Points except the free native language and street dialect (p.46, GitHub #19)", () => {
    const skills = [
      { category: "active", rating: 6 }, { category: "build_repair", rating: 4 },
      { category: "knowledge", rating: 5 }, { category: "language", rating: 3 },
      { category: "special", rating: 2 },
      { category: "language", rating: 6, freeLanguage: "native" }, { category: "language", rating: 2, freeLanguage: "dialect" }
    ];
    const r = chargenSpend({ skills }, { skills: 24 });
    expect(r.skills.spent).toBe(20);   // 6 + 4 + 5 + 3 + 2; the native language and dialect are free
    expect(r.skills.over).toBe(false);
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

import { meleeVisibilityMod } from "../module/rules/sr2e-rules.mjs";
describe("meleeVisibilityMod (SR2E p.102)", () => {
  it("halves the Visibility Table, rounding down", () => {
    expect([0, 2, 4, 6].map(meleeVisibilityMod)).toEqual([0, 1, 2, 3]);
  });
  it("except Full Darkness, which stays +8", () => {
    expect(meleeVisibilityMod(8)).toBe(8);
  });
});

import { conjuringLimit, elementalMaterialsCost } from "../module/rules/sr2e-rules.mjs";
describe("conjuringLimit (SR2E p.139–140)", () => {
  it("one nature spirit in service at a time", () => {
    expect(conjuringLimit("nature", [], 5)).toBeNull();
    expect(conjuringLimit("nature", [{ spiritType: "nature", services: 1 }], 5)).toMatch(/only one nature spirit/);
    expect(conjuringLimit("nature", [{ spiritType: "nature", services: 0 }], 5)).toBeNull();
  });
  it("elementals up to Charisma; nature spirits do not count against it", () => {
    const e = { spiritType: "elemental", services: 2 };
    expect(conjuringLimit("elemental", [e], 2)).toBeNull();
    expect(conjuringLimit("elemental", [e, e], 2)).toMatch(/Charisma/);
    expect(conjuringLimit("elemental", [{ spiritType: "nature", services: 3 }], 1)).toBeNull();
  });
});
describe("elementalMaterialsCost (SR2E p.140)", () => {
  it("is 1,000¥ per point of Force", () => {
    expect(elementalMaterialsCost(4)).toBe(4000);
  });
});
