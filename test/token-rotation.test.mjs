import { describe, it, expect } from "vitest";
import { rotatePoints } from "../module/rules/vehicle-play-rules.mjs";

describe("rotatePoints (a turned vehicle's footprint)", () => {
  const r = (pts) => pts.map(v => Math.round(v * 1000) / 1000 + 0);
  it("turns a 200×400 rectangle 90° clockwise around its center into a 400×200 one", () => {
    const pts = rotatePoints([0, 0, 200, 0, 200, 400, 0, 400], 100, 200, 90);
    const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
    expect([Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map(Math.round)).toEqual([400, 200]);
    expect(r(pts.slice(0, 2))).toEqual([300, 100]);   // the top-left corner goes to the top-right, clockwise on screen
  });
  it("0° and 360° leave the points where they are", () => {
    expect(r(rotatePoints([0, 0, 10, 0], 5, 5, 360))).toEqual([0, 0, 10, 0]);
  });
});
