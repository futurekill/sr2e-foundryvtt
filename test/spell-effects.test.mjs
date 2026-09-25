import { describe, it, expect } from "vitest";
import { igniteDelay, iceSheetSide, segmentHitsCircle, segmentHitsRect } from "../module/rules/sr2e-rules.mjs";

describe("Ignite delay (SR2E p.158): 10 turns ÷ successes, rounded up", () => {
  it("1 → 10, 3 → 4, 5 and 9 → 2, 10+ → 1", () => {
    expect(igniteDelay(1)).toBe(10);
    expect(igniteDelay(3)).toBe(4);
    expect(igniteDelay(5)).toBe(2);
    expect(igniteDelay(9)).toBe(2);
    expect(igniteDelay(10)).toBe(1);
    expect(igniteDelay(14)).toBe(1);
  });
});

describe("Ice Sheet area (p.158): Magic × successes m²", () => {
  it("Magic 6, 6 successes → a 6 m square", () => expect(iceSheetSide(6, 6)).toBe(6));
  it("0 successes → nothing", () => expect(iceSheetSide(6, 0)).toBe(0));
});

describe("geometry", () => {
  const c = { x: 50, y: 0 };
  it("a line passing through a circle hits it; one passing wide misses", () => {
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, c, 10)).toBe(true);
    expect(segmentHitsCircle({ x: 0, y: 20 }, { x: 100, y: 20 }, c, 10)).toBe(false);
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 30, y: 0 }, c, 10)).toBe(false);
  });
  const rect = { x: 10, y: 10, w: 10, h: 10 };
  it("crossing, ending inside, and passing by a rectangle", () => {
    expect(segmentHitsRect({ x: 0, y: 15 }, { x: 30, y: 15 }, rect)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 12, y: 12 }, rect)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 30, y: 5 }, rect)).toBe(false);
    expect(segmentHitsRect({ x: 25, y: 0 }, { x: 25, y: 30 }, rect)).toBe(false);
  });
});
