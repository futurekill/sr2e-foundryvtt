// Core p.264 (Vehicles table note, rendered 2026-11-26): Street Index .75 under 10,000¥, 1 up to 50,000¥, 2 above.
import { describe, it, expect } from "vitest";
import { vehicleStreetIndex, streetPrice } from "../module/rules/sr2e-rules.mjs";

describe("vehicleStreetIndex (core p.264)", () => {
  it.each([[2000, 0.75], [9999, 0.75], [10000, 1], [50000, 1], [50001, 2], [250000, 2]])("%d¥ → %d", (cost, si) => {
    expect(vehicleStreetIndex(cost)).toBe(si);
  });
  it("no price, no index; the street price is list × index", () => {
    expect(vehicleStreetIndex(0)).toBeNull();
    expect(vehicleStreetIndex(undefined)).toBeNull();
    expect(streetPrice(20000, vehicleStreetIndex(20000))).toBe(20000);
    expect(streetPrice(2000, vehicleStreetIndex(2000))).toBe(1500);
  });
});
