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
});
