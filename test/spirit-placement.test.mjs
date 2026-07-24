// Nearest-free-cell placement for summoned spirits (materialise beside the caster).
import { describe, it, expect } from "vitest";
import { nearestFreeCell } from "../module/rules/sr2e-rules.mjs";

const occ = (...cells) => new Set(cells);

describe("nearestFreeCell", () => {
  it("picks an orthogonally-adjacent cell when everything is open", () => {
    // Ring 1, nearest-by-Euclidean → an orthogonal neighbour (distance 1) beats
    // a diagonal (distance √2).
    const cell = nearestFreeCell({ col: 5, row: 5 }, occ("5,5"));
    const dcol = Math.abs(cell.col - 5), drow = Math.abs(cell.row - 5);
    expect(Math.max(dcol, drow)).toBe(1);            // adjacent
    expect(dcol + drow).toBe(1);                     // orthogonal, not diagonal
  });

  it("steps out to ring 2 when every ring-1 cell is taken", () => {
    const around = occ("5,5");
    for (let c = 4; c <= 6; c++) for (let r = 4; r <= 6; r++) around.add(`${c},${r}`);
    const cell = nearestFreeCell({ col: 5, row: 5 }, around);
    expect(Math.max(Math.abs(cell.col - 5), Math.abs(cell.row - 5))).toBe(2);
  });

  it("never returns the caster's own cell", () => {
    const cell = nearestFreeCell({ col: 0, row: 0 }, occ("0,0"));
    expect(`${cell.col},${cell.row}`).not.toBe("0,0");
  });

  it("respects scene bounds — a corner caster still gets an in-bounds cell", () => {
    const cell = nearestFreeCell({ col: 0, row: 0 }, occ("0,0"), { cols: 10, rows: 10 });
    expect(cell.col).toBeGreaterThanOrEqual(0);
    expect(cell.row).toBeGreaterThanOrEqual(0);
    expect(cell.col).toBeLessThan(10);
    expect(cell.row).toBeLessThan(10);
  });

  it("returns null when the whole searchable area is packed", () => {
    const bounds = { cols: 3, rows: 3 };
    const packed = occ();
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) packed.add(`${c},${r}`);
    expect(nearestFreeCell({ col: 1, row: 1 }, packed, bounds)).toBeNull();
  });

  it("a 2×2 token needs all four covered cells free (footprint-aware)", () => {
    // Caster at 5,5. Block enough that no 2×2 block fits at ring 1, forcing it out.
    const taken = occ("5,5", "6,5", "5,6", "6,6", "4,4", "4,5", "4,6");
    const cell = nearestFreeCell({ col: 5, row: 5 }, taken, null, { footprint: { w: 2, h: 2 } });
    // Every cell the 2×2 would cover must be free.
    for (let dc = 0; dc < 2; dc++) for (let dr = 0; dr < 2; dr++) {
      expect(taken.has(`${cell.col + dc},${cell.row + dr}`)).toBe(false);
    }
  });

  it("honours scene bounds for a footprint (a 2×2 can't hang off the edge)", () => {
    const cell = nearestFreeCell({ col: 8, row: 8 }, occ("8,8"), { cols: 10, rows: 10 },
      { footprint: { w: 2, h: 2 } });
    expect(cell.col).toBeLessThanOrEqual(8);   // top-left leaves room for w=2 within 10
    expect(cell.row).toBeLessThanOrEqual(8);
  });

  it("still accepts the legacy maxRadius-as-4th-arg call", () => {
    expect(nearestFreeCell({ col: 0, row: 0 }, occ("0,0"), null, 25)).toBeTruthy();
  });
});
