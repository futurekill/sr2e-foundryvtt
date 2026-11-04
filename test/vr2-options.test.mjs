// VR2.0 utility options and programming (pp.100–104): the book's own examples.
import { describe, it, expect } from "vitest";
import { activeOptions, programSizes, defenseTN, areaTN, skulkTally, utilityOf, toolBonus, baseTime, taskPeriod, workDone,
         teamTerms, mainframeAdequate, limitAllows, programmingCap, sensitiveSkill, foldProgramming } from "../module/rules/vr2-options.mjs";
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

describe("foldProgramming (plan 5b §4, Codex R3–R4): the lifecycle is a log, folded", () => {
  const start = (task, at) => ({ key: `prog:start:${task}`, type: "progStart", task, at, baseTime: 8 });
  const end = (task, outcome, at) => ({ key: `prog:end:${task}`, type: "progEnd", task, outcome, at });
  const log = (task, id, days, at) => ({ key: `prog:log:${task}:${id}`, type: "progLog", task, days, bonus: 0, at });
  const NEW = { key: "prog:new", type: "progNew", at: 0 };
  const perms = (xs) => xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));

  it("a bought program is usable; a new project isn't until a task completes", () => {
    expect(foldProgramming([]).unfinished).toBe(false);
    expect(foldProgramming([NEW]).unfinished).toBe(true);
    expect(foldProgramming([NEW, start("A", 1)]).writing).toBe(true);
    expect(foldProgramming([NEW, start("A", 1), end("A", "complete", 2)]).unfinished).toBe(false);
  });
  it("abandoning or failing leaves the program as it was: a new project stays unwritten, a bought copy stays usable", () => {
    expect(foldProgramming([NEW, start("A", 1), end("A", "abandon", 2)]).unfinished).toBe(true);
    expect(foldProgramming([start("A", 1), end("A", "fail", 2)]).unfinished).toBe(false);
    expect(foldProgramming([NEW, start("A", 1), end("A", "complete", 2), start("B", 3), end("B", "abandon", 4)]).unfinished).toBe(false);
  });
  it("whatever order the records arrive in: an abandon of A never ends B, and A's late log stays in A", () => {
    const recs = [NEW, start("A", 1), end("A", "abandon", 2), start("B", 3), log("A", "x", 5, 4)];
    for (const order of perms(recs)) {
      const f = foldProgramming(order);
      expect(f.current).toBe("B");
      expect(f.writing).toBe(true);
      expect(Object.keys(f.tasks.B.log)).toHaveLength(0);
      expect(Object.keys(f.tasks.A.log)).toHaveLength(1);
    }
  });
  it("the period is the task's one period record; a restart starts with none", () => {
    const f = foldProgramming([start("A", 1), { key: "prog:period:A", type: "progPeriod", task: "A", successes: 4, period: 2, at: 2 },
      end("A", "complete", 3), start("B", 4)]);
    expect(f.tasks.A.period).toBe(2);
    expect([f.task.period, f.task.end, f.task.complete]).toEqual([null, null, false]);
  });
});
