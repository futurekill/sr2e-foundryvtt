import { describe, it, expect } from "vitest";
import { evaluateDamageCode } from "../module/documents/item.mjs";
import { parseDrainCode } from "../module/data/item-data.mjs";

describe("evaluateDamageCode — numeric codes (SR2E p.92)", () => {
  it("parses Power + Level from a plain code", () => {
    expect(evaluateDamageCode("9M")).toEqual({ power: 9, level: "M" });
    expect(evaluateDamageCode("6S")).toEqual({ power: 6, level: "S" });
    expect(evaluateDamageCode("10D")).toEqual({ power: 10, level: "D" });
    expect(evaluateDamageCode("3L")).toEqual({ power: 3, level: "L" });
  });

  it("is case-insensitive on the level", () => {
    expect(evaluateDamageCode("9m")).toEqual({ power: 9, level: "M" });
  });

  it("falls back to a safe default for empty or unparsable codes", () => {
    expect(evaluateDamageCode("")).toEqual({ power: 0, level: "M" });
    expect(evaluateDamageCode("nonsense")).toEqual({ power: 0, level: "M" });
    // A formula code with no actor cannot resolve → default
    expect(evaluateDamageCode("(Str+3)S")).toEqual({ power: 0, level: "M" });
  });
});

describe("parseDrainCode (SR2E p.163)", () => {
  it("parses the canonical (F/2)±N form", () => {
    expect(parseDrainCode("((F / 2) + 1)M")).toEqual({ modifier: 1, level: "M" });
    expect(parseDrainCode("((F / 2) - 1)S")).toEqual({ modifier: -1, level: "S" });
  });

  it("parses (F/2) with no modifier", () => {
    expect(parseDrainCode("(F / 2)D")).toEqual({ modifier: 0, level: "D" });
  });

  it("parses the legacy compact form", () => {
    expect(parseDrainCode("+3(D)")).toEqual({ modifier: 3, level: "D" });
    expect(parseDrainCode("-1(S)")).toEqual({ modifier: -1, level: "S" });
  });

  it("handles en-dash and em-dash as minus", () => {
    expect(parseDrainCode("((F / 2) – 2)L")).toEqual({ modifier: -2, level: "L" });
  });

  it("defaults to +0 Moderate for unparsable input", () => {
    expect(parseDrainCode("")).toEqual({ modifier: 0, level: "M" });
    expect(parseDrainCode("garbage")).toEqual({ modifier: 0, level: "M" });
  });
});
