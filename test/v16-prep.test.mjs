// v16 prep (docs/PLAN-v16-prep.md): the map-area adapter and the Active Effect compat
// helpers. Fixtures: Foundry v14.369's own BaseRegion._migrateMeasuredTemplateData,
// captured with tools run against the app bundle (1 m/100 px and 5 ft/70 px grids).
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import "./foundry-shim.mjs";
import { templateShape, areaShape } from "../module/areas.mjs";
import { segmentHitsPolygon } from "../module/rules/sr2e-rules.mjs";
import { effectChanges, changeIsAdd, isZeroDuration, isIndefinite, timingData, makeDrugEffectData } from "../module/effects-compat.mjs";

const fx = JSON.parse(readFileSync("test/fixtures/v14-template-regions.json", "utf8"));
const grids = { m1: { size: 100, distance: 1 }, ft5: { size: 70, distance: 5 } };
const close = (a, b) => Object.entries(b).forEach(([k, v]) => typeof v === "number" ? expect(a[k]).toBeCloseTo(v, 6) : expect(a[k]).toEqual(v));

describe("templateShape matches v14's own conversion", () => {
  for (const [key, f] of Object.entries(fx)) {
    it(key, () => {
      const g = grids[key.split(":")[0]];
      close(templateShape(f.input, g.size, g.distance, { ...f.ctx, gridBased: !!f.ctx.gridTemplates }), f.shape);
    });
  }
  it("a grid-based cone is always round, as Foundry forces it", () => {
    expect(templateShape({ t: "cone", distance: 5, angle: 60 }, 100, 1, { coneTemplateType: "flat", gridBased: true }).curvature).toBe("round");
  });
});

describe("areaShape: template and region read the same (scene units)", () => {
  const scene = (g) => ({ grid: g });
  const tdoc = (g, t) => ({ documentName: "MeasuredTemplate", parent: scene(g), ...t });
  const rdoc = (g, shape) => ({ documentName: "Region", parent: scene(g), shapes: [shape] });
  for (const [key, f] of Object.entries(fx)) {
    if (f.ctx.gridTemplates) continue;
    it(key, () => {
      const g = grids[key.split(":")[0]];
      const a = areaShape(tdoc(g, f.input)), b = areaShape(rdoc(g, f.shape));
      expect(b.shape).toBe(a.shape);
      if (a.shape === "rect") close(b.rect, a.rect);
      else { expect(b.radius).toBeCloseTo(a.radius, 6); expect(b.x).toBe(a.x); }
      if (a.shape === "cone") expect(b.direction).toBeCloseTo(a.direction, 6);
    });
  }
  it("Ice Sheet's diagonal encoding is a side × side box at its corner", () => {
    const g = grids.m1;
    const a = areaShape(tdoc(g, { t: "rect", x: 300, y: 200, distance: 4 * Math.SQRT2, direction: 45 }));
    close(a.rect, { x: 300, y: 200, w: 400, h: 400 });
  });
});

describe("effect compat: both schemas", () => {
  beforeEach(() => { globalThis.game.release = { generation: 13 }; });
  it("changes and ADD", () => {
    expect(effectChanges({ changes: [{ key: "a", mode: 2 }] })).toHaveLength(1);
    expect(effectChanges({ system: { changes: [{ key: "a", type: "add" }] }, changes: [] })).toHaveLength(1);
    expect(changeIsAdd({ mode: 2 })).toBe(true);
    expect(changeIsAdd({ type: "add" })).toBe(true);
    expect(changeIsAdd({ type: "override", mode: 2 })).toBe(false);
  });
  it("zero vs indefinite vs timed, legacy (hydrated nulls) and modern", () => {
    expect(isZeroDuration({ duration: { seconds: 0, startTime: 5 } })).toBe(true);
    expect(isZeroDuration({ duration: { value: 0, units: "seconds" } })).toBe(true);
    expect(isZeroDuration({ duration: { seconds: 600 } })).toBe(false);
    expect(isIndefinite({ duration: { seconds: null, rounds: null, turns: null, startTime: null } })).toBe(true);
    expect(isIndefinite({ duration: { value: null, units: "seconds" } })).toBe(true);
    expect(isIndefinite({ duration: { value: 0, units: "seconds" } })).toBe(false);
  });
  it("writes the running version's schema, keeping priorities and combat timing", () => {
    const changes = [{ key: "system.body.mod", mode: 2, value: "1", priority: 25 }];
    const v13 = makeDrugEffectData({ name: "X", changes, timing: { rounds: 4, combat: "c", startRound: 2, startTurn: 1 } });
    expect(v13.changes[0]).toEqual({ key: "system.body.mod", mode: 2, value: "1", priority: 25 });
    expect(v13.duration).toEqual({ rounds: 4, combat: "c", startRound: 2, startTurn: 1 });
    globalThis.game.release = { generation: 14 };
    const v14 = makeDrugEffectData({ name: "X", changes, timing: { seconds: 600, startTime: 9 } });
    expect(v14.system.changes[0]).toEqual({ key: "system.body.mod", type: "add", value: "1", priority: 25 });
    expect(v14.changes).toBeUndefined();
    expect(v14.duration).toEqual({ value: 600, units: "seconds" });
    expect(v14.start).toEqual({ time: 9 });
    expect(timingData({ zero: true, startTime: 3 })).toEqual({ duration: { value: 0, units: "seconds" }, start: { time: 3 } });
    expect(timingData({ indefinite: true })).toEqual({ duration: {} });
    expect(timingData({ rounds: 2, combat: "c", startRound: 1, startTurn: 0 }).start).toEqual({ combat: "c", round: 1, turn: 0 });
  });
});

describe("Ice Sheet collision uses the true outline", () => {
  it("a rotated Region's corner-gap doesn't count; crossing the ice does", () => {
    const g = grids.m1;
    const a = areaShape({ documentName: "Region", parent: { grid: g },
      shapes: [{ type: "rectangle", x: 500, y: 500, width: 200, height: 200, anchorX: 0.5, anchorY: 0.5, rotation: 45 }] });
    // A diamond centred at (500, 500) reaching ~141 px along each axis.
    expect(segmentHitsPolygon({ x: 360, y: 360 }, { x: 380, y: 360 }, a.polygon)).toBe(false);   // inside the bbox corner, outside the ice
    expect(segmentHitsPolygon({ x: 300, y: 500 }, { x: 700, y: 500 }, a.polygon)).toBe(true);
    expect(segmentHitsPolygon({ x: 500, y: 500 }, { x: 510, y: 505 }, a.polygon)).toBe(true);     // wholly inside
  });
});
