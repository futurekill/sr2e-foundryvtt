// `node --check` parses; it does not execute, so it cannot see a temporal dead
// zone. v0.82.0 shipped a `const tacticsHTML = \`...${maxAim}...\`` declared 50
// lines ABOVE `const maxAim` — a template literal evaluates on declaration, so
// every attack threw "Cannot access 'maxAim' before initialization" and the
// dialog never opened. Syntax check passed, 607 tests passed, feature dead.
//
// This scans the dialog builders for the same shape: a template-literal const
// that interpolates a `const` declared later in the same function.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("module/sheets/sheet-actions.mjs", "utf8");

/** Every `const NAME = \`...\`;` template-literal assignment, with its line. */
function templateConsts(src) {
  const out = [];
  const re = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*`/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Walk to the matching unescaped closing backtick, skipping ${...} nests.
    let i = re.lastIndex, depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "\\") { i++; continue; }
      if (c === "$" && src[i + 1] === "{") { depth++; i++; continue; }
      if (c === "}" && depth > 0) { depth--; continue; }
      if (c === "`" && depth === 0) break;
    }
    out.push({ name: m[1], start: m.index, body: src.slice(re.lastIndex, i) });
  }
  return out;
}

/** Offsets of every top-level `function` keyword — the scope boundaries. */
const FN_STARTS = [...SRC.matchAll(/^(?:export\s+)?(?:async\s+)?function\s/gm)].map(m => m.index);

/** The half-open range of the top-level function containing `at`. */
function scopeOf(at) {
  const start = FN_STARTS.filter(i => i <= at).pop() ?? 0;
  const end = FN_STARTS.find(i => i > at) ?? SRC.length;
  return [start, end];
}

/** Offset of the first `const NAME =` declaration inside [from, to). */
function declIndex(name, from, to) {
  const re = new RegExp(`^\\s*const\\s+${name}\\s*=`, "gm");
  re.lastIndex = from;
  const m = re.exec(SRC);
  return m && m.index < to ? m.index : -1;
}

describe("template-literal consts do not read consts declared later", () => {
  const lits = templateConsts(SRC);

  it("finds template-literal consts to check", () => {
    // Guard: if the parse breaks, the assertions below pass vacuously.
    expect(lits.length).toBeGreaterThan(3);
  });

  it("has no temporal dead zone in any dialog template", () => {
    const violations = [];
    for (const lit of lits) {
      const [, scopeEnd] = scopeOf(lit.start);
      const refs = new Set([...lit.body.matchAll(/\$\{[^}]*?\b([A-Za-z_$][\w$]*)\b/g)].map(m => m[1]));
      for (const ref of refs) {
        if (ref === lit.name) continue;
        // Only a declaration in the SAME function can shadow into a dead zone.
        const at = declIndex(ref, lit.start, scopeEnd);
        if (at > -1) {
          const line = SRC.slice(0, lit.start).split("\n").length;
          const refLine = SRC.slice(0, at).split("\n").length;
          violations.push(`${lit.name} (line ${line}) reads "${ref}" declared later at line ${refLine}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
