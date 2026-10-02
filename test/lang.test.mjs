// lang/en.json uses flat dotted keys. A nested object under a name that flat keys
// also use ("TYPES": {...} beside "TYPES.Actor.npc") REPLACES that whole tree when
// Foundry expands the file — 0.101.0 lost every Actor/Item type label that way
// (sheet titles read "TYPES.Actor.npc: Bartender").
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lang = JSON.parse(readFileSync("lang/en.json", "utf8"));

describe("lang/en.json", () => {
  it("has no nested object shadowing flat dotted keys", () => {
    const flat = Object.keys(lang).filter(k => typeof lang[k] === "string");
    const clashes = Object.keys(lang).filter(k => typeof lang[k] === "object"
      && flat.some(f => f.startsWith(k + ".")));
    expect(clashes).toEqual([]);
  });
  it("labels every Actor and Item type", () => {
    const sys = JSON.parse(readFileSync("system.json", "utf8"));
    for (const [doc, types] of Object.entries(sys.documentTypes))
      for (const t of Object.keys(types)) expect(lang[`TYPES.${doc}.${t}`], `TYPES.${doc}.${t}`).toBeTruthy();
  });
});
