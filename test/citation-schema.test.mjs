import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Chargen M1b (docs/PLAN-citations.md §1): every Item type and the vehicle actor carry `citation`.
describe("citation field", () => {
  it("every Item type's schema declares it, and the vehicle actor's", () => {
    const types = Object.keys(JSON.parse(readFileSync(new URL("../system.json", import.meta.url))).documentTypes.Item);
    const src = readFileSync(new URL("../module/data/item-data.mjs", import.meta.url), "utf8");
    const schemas = src.split("static defineSchema()").slice(1);
    expect(schemas.length).toBe(types.length);
    for (const s of schemas) expect(s.slice(0, 400)).toContain("citation: SR2EDataModel.citationField()");
    const actor = readFileSync(new URL("../module/data/actor-data.mjs", import.meta.url), "utf8");
    expect(actor.split("export class VehicleData")[1].slice(0, 3000)).toContain("citation: SR2EDataModel.citationField()");
  });
});
