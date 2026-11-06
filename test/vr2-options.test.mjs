// VR2.0 utility options and programming (pp.100–104): the book's own examples.
import { describe, it, expect } from "vitest";
import { activeOptions, programSizes, defenseTN, areaTN, skulkTally, utilityOf, toolBonus, baseTime, taskPeriod, workDone,
         teamTerms, mainframeAdequate, limitAllows, programmingCap, sensitiveSkill, foldProgramming, deriveProgram } from "../module/rules/vr2-options.mjs";
import { programSize, programCostVR2, derivedItemCost } from "../module/rules/sr2e-rules.mjs";

describe("option sizes and price (p.103)", () => {
  it("no options = today's size and price", () => {
    expect(programSizes({ rating: 6, multiplier: 3 })).toMatchObject({ actual: programSize(6, 3), design: programSize(6, 3), price: programCostVR2(6, 3) });
  });
  it("Attack-6M: 108 Mp, 21,600¥; with Skulk-4 effective Rating 10, design 300 Mp, 60,000¥", () => {
    expect(programSizes({ rating: 6, multiplier: 3 })).toMatchObject({ design: 108, price: 21600 });
    expect(programSizes({ rating: 6, multiplier: 3, options: [{ kind: "skulk", rating: 4 }] })).toMatchObject({ effective: 10, design: 300, price: 60000 });
  });
  it("Attack-6M (Limit: IC) is Rating 5: 5² × 3", () => {
    expect(programSizes({ rating: 6, multiplier: 3, options: [{ kind: "limit" }] }).actual).toBe(75);
  });
  it("percentage changes apply to the size the rating gives (180 Mp → 90 with optimization)", () => {
    const once = programSizes({ rating: 6, multiplier: 5, options: [{ kind: "optimization" }] });
    expect(once.actual).toBe(90);
    expect(once.design).toBe(360);
  });
  it("squeeze's +1 is design-only; one-shot −75% actual, +50% design", () => {
    expect(programSizes({ rating: 4, multiplier: 2, options: [{ kind: "squeeze" }] })).toMatchObject({ actual: 32, design: 50 });
    expect(programSizes({ rating: 4, multiplier: 2, options: [{ kind: "oneShot" }] })).toMatchObject({ actual: 8, design: 48 });
  });
  it("percentages round once: the options' order never changes the size", () => {
    const a = programSizes({ rating: 1, multiplier: 3, options: [{ kind: "oneShot" }, { kind: "optimization" }] });
    const b = programSizes({ rating: 1, multiplier: 3, options: [{ kind: "optimization" }, { kind: "oneShot" }] });
    expect(a).toEqual(b);
    expect(a.design).toBe(9);   // 3 × 1.5 × 2
  });
  it("the shared price path (itemBaseCost) prices the options too", () => {
    expect(derivedItemCost({ type: "program", rating: 6, multiplier: 3, activeOpts: [{ kind: "skulk", rating: 4 }] }, { vr2: true })).toBe(60000);
    expect(derivedItemCost({ type: "program", rating: 6, multiplier: 3, activeOpts: [] }, { vr2: true })).toBe(21600);
  });
  it("an effective rating below 1 counts as 1", () => {
    expect(programSizes({ rating: 1, multiplier: 2, options: [{ kind: "limit" }] }).actual).toBe(2);
  });
});

describe("which options apply", () => {
  it("allow-lists, rating caps, chaser + penetration both inert", () => {
    expect(utilityOf("Attack-6M")).toBe("attack");
    expect(utilityOf("Black Hammer 4")).toBe("blackHammer");
    expect(utilityOf("Read/Write-3")).toBe("readWrite");
    expect(utilityOf("Lock-On 2")).toBe("lockOn");
    const a = activeOptions("attack", 6, [{ kind: "skulk", rating: 4 }, { kind: "area", rating: 7 }, { kind: "squeeze" }]);
    expect(a.active.map(o => o.kind)).toEqual(["skulk"]);
    expect(a.inert.map(o => o.kind)).toEqual(["area", "squeeze"]);   // Area-7 > Rating 6; squeeze isn't an attack option
    const cp = activeOptions("attack", 6, [{ kind: "chaser" }, { kind: "penetration" }, { kind: "targeting" }]);
    expect(cp.active.map(o => o.kind)).toEqual(["targeting"]);
    expect(activeOptions("", 6, [{ kind: "targeting" }]).active).toEqual([]);
    expect(activeOptions("track", 4, [{ kind: "sensitive" }]).active.map(o => o.kind)).toEqual(["sensitive"]);
    const lim = activeOptions("attack", 6, [{ kind: "limit" }]);
    expect(lim.inert[0].why).toMatch(/target type/);
    const ic = activeOptions("attack", 6, [{ kind: "limit", target: "ic" }]).active;
    expect([limitAllows(ic, "ic"), limitAllows(ic, "decker"), limitAllows([], "decker")]).toEqual([true, false, true]);
  });
});

describe("option effects (p.103–104)", () => {
  it("shield and shift with chaser / penetration (user rulings: penetration +4 total vs shift)", () => {
    expect([defenseTN("shield"), defenseTN("shield", ["chaser"]), defenseTN("shield", ["penetration"])]).toEqual([2, 4, 0]);
    expect([defenseTN("shift"), defenseTN("shift", ["chaser"]), defenseTN("shift", ["penetration"])]).toEqual([2, 0, 4]);
  });
  it("area: the p.103 example — A at 6 + 2 = 8, B at 4 + 2 = 6; skulk", () => {
    expect([areaTN(6, 2), areaTN(4, 2)]).toEqual([8, 6]);
    expect([skulkTally(6, 4), skulkTally(3, 4)]).toEqual([2, 0]);
  });
});

describe("programming (pp.100–102)", () => {
  it("Selena's Attack-8S: 256 Mp, 512 days, 4 successes → 128, and the worked days to the end", () => {
    const d = programSizes({ rating: 8, multiplier: 4 }).design;
    expect(d).toBe(256);
    expect(baseTime(d)).toBe(512);
    let left = taskPeriod(512, 4);
    expect(left).toBe(128);
    left -= workDone(10, toolBonus({}));                                    // 118
    left -= workDone(10, toolBonus({ doubleMemory: true }));                // 98
    expect(left).toBe(98);
    left -= workDone(5, toolBonus({ doubleMemory: true, kit: true }));      // 83
    expect(left).toBe(83);
    left -= workDone(15, toolBonus({ mainframe: true }));                   // 8
    expect(left).toBe(8);
    expect(workDone(3, toolBonus({ doubleMemory: true, kit: true }))).toBeGreaterThanOrEqual(8);   // done in 3 days
    expect(mainframeAdequate(4, 8)).toBe(true);
    expect(taskPeriod(512, 0)).toBe(null);
  });
  it("tools: shop +2 (+3 with doubled memory), a suite +1 on a mainframe", () => {
    expect([toolBonus({ shop: true }), toolBonus({ shop: true, doubleMemory: true }), toolBonus({ mainframe: true, suite: true })]).toEqual([2, 3, 5]);
  });
  it("teams: skill 8 → 4 members, Rating 9; 6/7/6 → 7; +3/+2/+3 → +5 (6 days a day)", () => {
    expect(teamTerms([8, 3, 3, 3])).toMatchObject({ maxSize: 4, maxRating: 9 });
    const t = teamTerms([6, 7, 6], [3, 2, 3]);
    expect(t.skill).toBe(7);
    expect(t.bonus).toBe(5);
    expect(workDone(1, t.bonus)).toBe(6);
    expect(workDone(1, teamTerms([6, 7, 6], [0, 0, 0]).bonus)).toBe(1);   // no bonuses: 1 day a day
  });
  it("caps: skill; team highest + 1; black hammer/killjoy half (round up); sensitive averages", () => {
    expect([programmingCap("attack", [8]), programmingCap("attack", [8, 3]), programmingCap("blackHammer", [7]),
      programmingCap("killjoy", [7, 6])]).toEqual([8, 9, 4, 4]);
    expect(sensitiveSkill(6, 3)).toBe(5);
  });
});

describe("foldProgramming (plan 5b §4, Codex R3–R5): the lifecycle is a log, folded", () => {
  const start = (gen, at = 0) => ({ key: `prog:start:${gen}`, type: "progStart", gen, at, baseTime: 8, testMessageId: `t${gen}` });
  const end = (task, outcome, at = 0) => ({ key: `prog:end:${task}`, type: "progEnd", task, outcome, at });
  const log = (task, id, days) => ({ key: `prog:log:${task}:${id}`, type: "progLog", task, days, bonus: 0 });
  const frozen = (task, successes) => ({ key: `prog:frozen:${task}`, type: "progFrozen", task, successes });
  const NEW = { key: "prog:new", type: "progNew" };
  const perms = (xs) => xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));

  it("a bought program is usable; a new project isn't until a task completes", () => {
    expect(foldProgramming([]).unfinished).toBe(false);
    expect(foldProgramming([NEW]).unfinished).toBe(true);
    expect(foldProgramming([NEW, start(1)]).writing).toBe(true);
    expect(foldProgramming([NEW, start(1), end(1, "complete")]).unfinished).toBe(false);
  });
  it("abandoning or failing leaves the program as it was", () => {
    expect(foldProgramming([NEW, start(1), end(1, "abandon")]).unfinished).toBe(true);
    expect(foldProgramming([start(1), frozen(1, 0)]).unfinished).toBe(false);
    expect(foldProgramming([NEW, start(1), end(1, "complete"), start(2), end(2, "abandon")]).unfinished).toBe(false);
  });
  it("whatever order the records arrive in: an abandon of 1 never ends 2, and 1's late log stays in 1", () => {
    for (const order of perms([NEW, start(1), end(1, "abandon"), start(2), log(1, "x", 5)])) {
      const f = foldProgramming(order);
      expect([f.current, f.writing]).toEqual([2, true]);
      expect(Object.keys(f.tasks[2].log)).toHaveLength(0);
      expect(Object.keys(f.tasks[1].log)).toHaveLength(1);
    }
  });
  it("order is the generation, never the clock: tied or reversed timestamps can't make an old task current (R5 #2)", () => {
    for (const recs of [[start(1, 5), end(1, "complete", 5), start(2, 5)], [start(1, 9), end(1, "complete", 9), start(2, 1)]]) {
      const f = foldProgramming(recs);
      expect([f.current, f.writing, f.unfinished]).toEqual([2, true, true]);
    }
  });
  it("the period is the recorded FINAL successes, never the card: a failure stays failed (R5 #1, R6)", () => {
    expect(foldProgramming([start(1), frozen(1, 2)]).task.period).toBe(4);   // 8 ÷ 2
    const f = foldProgramming([start(1), frozen(1, 0)]);
    expect([f.task.end, f.writing]).toEqual(["fail", false]);
    expect(foldProgramming([start(1)]).task.period).toBe(null);              // not frozen yet: no period
    expect(foldProgramming([start(1), end(1, "complete"), start(2)]).nextGen).toBe(3);
  });
});

describe("programSizes rounds once (code review R3 #1)", () => {
  it("rating 3, multiplier 1.5, Optimization: design 27 Mp / 2,700¥, not 28", () => {
    const s = programSizes({ rating: 3, multiplier: 1.5, options: [{ kind: "optimization", rating: 0 }] });
    expect([s.design, s.price]).toEqual([27, 2700]);
    expect(programSizes({ rating: 3, multiplier: 1.5 }).design).toBe(14);   // no options: ceil(13.5), as programSize
  });
});

describe("upgrading (VR2.0 p.107; PLAN-vr2-upgrading)", () => {
  const m = { vr2: true, optionsOn: true };
  const size = (name, sys) => deriveProgram(name, sys, m).designSize;
  const upgradeBase = (from, to) => Math.max(0, baseTime(to) - baseTime(from));
  it("base time = the new version's less the current one's", () => {
    expect(upgradeBase(size("Browse", { rating: 2, multiplier: 1 }), size("Browse", { rating: 4, multiplier: 1 }))).toBe(32 - 8);
    const a = { rating: 4, multiplier: 1, damageLevel: "M" };
    expect([size("Attack", a), size("Attack", { ...a, options: [{ kind: "oneShot" }] })]).toEqual([48, 72]);
    expect(upgradeBase(48, 72)).toBe(144 - 96);
  });
  it("adding Limit shrinks the design: base time 0 (user ruling 2026-11-03)", () => {
    const a = { rating: 4, multiplier: 1, damageLevel: "M" };
    expect(upgradeBase(48, size("Attack", { ...a, options: [{ kind: "limit", target: "ic" }] }))).toBe(0);
  });
  const start = (gen, extra = {}) => ({ key: `prog:start:${gen}`, type: "progStart", gen, baseTime: 8, testMessageId: `t${gen}`, ...extra });
  const end = (task, outcome) => ({ key: `prog:end:${task}`, type: "progEnd", task, outcome });
  it("the program keeps working while its upgrade is written; a rewrite doesn't", () => {
    expect(foldProgramming([start(1, { upgrade: true })])).toMatchObject({ writing: true, unfinished: false });
    expect(foldProgramming([start(1)])).toMatchObject({ writing: true, unfinished: true });
  });
  it("the source code: a completed WRITING task gives it; a completed upgrade doesn't", () => {
    expect(foldProgramming([]).sourced).toBe(false);
    expect(foldProgramming([start(1), end(1, "complete")]).sourced).toBe(true);
    expect(foldProgramming([start(1, { upgrade: true }), end(1, "complete")]).sourced).toBe(false);
    expect(foldProgramming([start(1), end(1, "abandon")]).sourced).toBe(false);
  });
  it("object code only is 25% off under VR2.0, and only there", () => {
    const sys = { type: "program", rating: 4, multiplier: 2 };
    const full = derivedItemCost(sys, { vr2: true });
    expect(derivedItemCost({ ...sys, objectCodeOnly: true }, { vr2: true })).toBe(Math.ceil(full * 0.75));
    expect(derivedItemCost({ ...sys, objectCodeOnly: true }, { vr2: false })).toBe(derivedItemCost(sys, { vr2: false }));
  });
});
