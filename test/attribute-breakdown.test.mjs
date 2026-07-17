import { describe, it, expect } from "vitest";
import { attributeBreakdown } from "../module/util/attribute-breakdown.mjs";

describe("attributeBreakdown", () => {
  it("names the single source (the common case)", () => {
    const b = attributeBreakdown({ base: 4, value: 6, sources: [{ name: "Muscle Replacement", value: 2 }] });
    expect(b.summary).toBe("+2 Muscle Replacement");
    expect(b.modTotal).toBe(2);
    expect(b.up).toBe(true);
    expect(b.count).toBe(1);
  });

  it("summarizes multiple sources by count and total", () => {
    const b = attributeBreakdown({ base: 4, value: 9, sources: [
      { name: "Muscle Replacement", value: 2 },
      { name: "Increase Body (sustained)", value: 3 }
    ]});
    expect(b.summary).toBe("+5 from 2 sources");
    expect(b.modTotal).toBe(5);
    // detail is sorted biggest-first for the expanded view
    expect(b.sources.map(s => s.name)).toEqual(["Increase Body (sustained)", "Muscle Replacement"]);
  });

  it("handles reductions with a minus sign", () => {
    const b = attributeBreakdown({ base: 5, value: 3, sources: [{ name: "Trauma", value: -2 }] });
    expect(b.summary).toBe("−2 Trauma");
    expect(b.up).toBe(false);
  });

  it("merges two levels of the same implant into one line", () => {
    const b = attributeBreakdown({ base: 3, value: 6, sources: [
      { name: "Bio Muscle", value: 2 }, { name: "Bio Muscle", value: 1 }
    ]});
    expect(b.count).toBe(1);
    expect(b.summary).toBe("+3 Bio Muscle");
  });

  it("drops zero contributions and blanks a nameless source", () => {
    const b = attributeBreakdown({ base: 4, value: 5, sources: [
      { name: "Real", value: 1 }, { name: "Nothing", value: 0 }, { value: 0 }
    ]});
    expect(b.count).toBe(1);
    const nameless = attributeBreakdown({ sources: [{ value: 2 }] });
    expect(nameless.sources[0].name).toBe("—");
  });

  it("returns an empty summary when nothing modifies the attribute", () => {
    const b = attributeBreakdown({ base: 4, value: 4, sources: [] });
    expect(b.summary).toBe("");
    expect(b.count).toBe(0);
  });
});
