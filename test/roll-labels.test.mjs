// Every roll-label key the code asks for exists in the language file, so no
// roll card ever shows a raw "SR2E.RollLabel.X" key.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const lang = JSON.parse(readFileSync("lang/en.json", "utf8"));
const files = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap(d => d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".mjs") ? [join(dir, d.name)] : []);

describe("roll labels", () => {
  it("every RL() key is in lang/en.json", () => {
    const used = new Set();
    for (const f of files("module")) {
      // The key argument, including RL(cond ? "A" : "B").
      for (const m of readFileSync(f, "utf8").matchAll(/\bRL\(([^,)]*)/g)) {
        for (const q of m[1].matchAll(/(?:^\s*|[?:]\s*)"(\w+)"/g)) used.add(q[1]);
      }
    }
    expect(used.size).toBeGreaterThan(80);
    expect([...used].filter(k => !(`SR2E.RollLabel.${k}` in lang))).toEqual([]);
  });
});
