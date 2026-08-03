// An ApplicationV2 `data-action="x"` is inert unless `x` is in the sheet's
// `actions` map. Nothing errors when it isn't — the click is simply ignored — so
// the failure is invisible until someone tries the button in play.
//
// This shipped for real. `npc-sheet.hbs` had no Spells section at all, while
// SR2ENPCSheet#_prepareContext dutifully computed `context.spells` and threw it
// away. Queen Euphoria's villain went out with eight spells that could not be
// seen or cast, and a stat-by-stat audit passed him as CLEAN because every
// number on the sheet matched the printed page. Numbers matching is not the same
// as the sheet working.
//
// So: every action the NPC template asks for must be registered, and the two
// halves of casting must both be present. The sustain toggle is load-bearing —
// a successful sustained spell calls setSustaining(true) by itself, and
// setSustaining(false) is the ONLY path that removes the Active Effects it
// copied onto the caster (item.mjs:1051). Cast without drop leaks effects.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const TEMPLATE = readFileSync("templates/actor/npc-sheet.hbs", "utf8");
const SHEETS = readFileSync("module/sheets/actor-sheet.mjs", "utf8");
const SHARED = readFileSync("module/sheets/sheet-actions.mjs", "utf8");

/** The `actions: { ... }` block of a sheet class, sliced out of the source. */
function actionMap(className) {
  const cls = SHEETS.indexOf(`class ${className}`);
  expect(cls, `${className} not found`).toBeGreaterThan(-1);
  const open = SHEETS.indexOf("actions: {", cls);
  expect(open, `no actions map on ${className}`).toBeGreaterThan(-1);
  let depth = 0, i = SHEETS.indexOf("{", open);
  for (; i < SHEETS.length; i++) {
    if (SHEETS[i] === "{") depth++;
    else if (SHEETS[i] === "}" && --depth === 0) break;
  }
  return SHEETS.slice(open, i + 1);
}

const keys = (block) =>
  [...block.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1]);

// ApplicationV2 merges DEFAULT_OPTIONS.actions down the class chain, so the NPC
// sheet also gets whatever SR2EBaseActorSheet registers (editImage lives there,
// deliberately, so every sheet's portrait is clickable). Checking only the NPC
// class's own map would report inherited actions as missing.
const REGISTERED = new Set([
  ...keys(actionMap("SR2ENPCSheet")),
  ...keys(actionMap("SR2EBaseActorSheet"))
]);

describe("NPC sheet actions", () => {
  it("registers every data-action the template uses", () => {
    const used = new Set(
      [...TEMPLATE.matchAll(/data-action="([^"]+)"/g)].map(m => m[1])
    );
    expect(used.size).toBeGreaterThan(0);
    const missing = [...used].filter(a => !REGISTERED.has(a));
    expect(missing, `template actions with no handler: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("can cast a spell AND drop a sustained one", () => {
    // Both halves, or sustained spells become unremovable with their Active
    // Effects still applied.
    expect(REGISTERED.has("castSpell")).toBe(true);
    expect(REGISTERED.has("toggleSustain")).toBe(true);
    expect(TEMPLATE).toMatch(/data-action="castSpell"/);
    expect(TEMPLATE).toMatch(/data-action="toggleSustain"/);
  });

  it("takes both handlers off SHARED_ACTIONS, which is where they exist", () => {
    // `onCastSpell` is not exported from sheet-actions.mjs and is not imported
    // by actor-sheet.mjs; `toggleSustain` is an inline function on the shared map
    // with no standalone binding. Referencing either bare name throws at load.
    const map = actionMap("SR2ENPCSheet");
    expect(map).toMatch(/castSpell:\s*SHARED_ACTIONS\.castSpell/);
    expect(map).toMatch(/toggleSustain:\s*SHARED_ACTIONS\.toggleSustain/);
    expect(SHARED).toMatch(/^\s*castSpell:/m);
    expect(SHARED).toMatch(/^\s*toggleSustain:\s*(async\s+)?function/m);
  });

  it("prepares context for every list the template renders", () => {
    // A fieldset whose context key is never assigned renders empty, which looks
    // like "this NPC has none" rather than like a bug. That is exactly how the
    // missing spells hid.
    const ctx = SHEETS.slice(SHEETS.indexOf("class SR2ENPCSheet"));
    for (const key of ["spells", "foci", "skills", "weapons"]) {
      expect(TEMPLATE, `template never iterates ${key}`).toMatch(new RegExp(`\\b${key}\\b`));
      expect(ctx.slice(0, 3000), `_prepareContext never sets context.${key}`)
        .toMatch(new RegExp(`context\\.${key}\\s*=`));
    }
  });
});
