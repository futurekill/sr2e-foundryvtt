// DialogV2#_renderHTML (foundry.mjs:57192) wraps `content` in its OWN
// <form class="dialog-form standard-form">. A <form> inside a <form> is invalid
// HTML and the parser silently DROPS the inner start tag — the element never
// reaches the DOM, though its children do.
//
// v0.82.0 shipped `content: \`<form class="sr2e-attack">\``. That root carried
// the --atk-* spacing scale and the flex/min-height:0 chain, so when it vanished
// every padding and gap computed to 0 (tabs ran together as "SHOTTACTICSDICE")
// and the panels could not scroll when the window was resized smaller. Nothing
// errored; it just looked broken.
//
// A bare <form> is also dropped, but harms nothing because no styling hangs on
// it. What must never come back is a form root carrying a class or style.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function jsFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith(".mjs") ? [p] : [];
  });
}

const SOURCES = jsFiles("module").map(path => ({ path, src: readFileSync(path, "utf8") }));

describe("DialogV2 content roots", () => {
  it("scans the dialog sources", () => {
    expect(SOURCES.some(f => f.src.includes("DialogV2"))).toBe(true);
  });

  it("never hangs styling on a <form> root, which the parser drops", () => {
    const offenders = [];
    for (const { path, src } of SOURCES) {
      // ANY <form> in dialog content, attributed or bare.
      //
      // This used to permit a bare <form>, on the grounds that the parser drops
      // it but nothing is styled off it so nothing breaks. True, and too weak:
      // 21 dead <form> wrappers accumulated across three files, each one a
      // one-word edit away from becoming the v0.82.0 bug again. They are gone,
      // and the rule is now "no <form> at all" — an invariant that is enforced
      // rather than a hazard that is tolerated.
      for (const m of src.matchAll(/<form[\s>]/g)) {
        // Skip prose: the explanatory comments above these fixes quote the tag.
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        if (/^\s*(\/\/|\*)/.test(src.slice(lineStart, m.index))) continue;
        offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders, `<form> in dialog content — DialogV2 supplies its own and the parser drops yours:\n${offenders.join("\n")}`).toEqual([]);
  });
});
