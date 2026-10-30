// NPC alternate forms in the critters pack follow NPCData's flat form contract (docs/PLAN-shapeshifter-content.md).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const INT0 = ["body", "quickness", "strength", "charisma", "intelligence", "willpower", "ballistic", "impact"];
export function formProblems(doc) {
  const out = [], forms = doc.system?.forms ?? [], keys = new Set();
  for (const f of forms) {
    for (const k of ["key", "name", "img"]) if (typeof f[k] !== "string") out.push(`${k} not a string`);
    if (!f.key || keys.has(f.key)) out.push(`form key "${f.key}" blank or duplicate`);
    keys.add(f.key);
    for (const k of INT0) if (!Number.isInteger(f[k]) || f[k] < 0) out.push(`${f.key}.${k} = ${f[k]}`);
    if (!Number.isInteger(f.initiativeDice) || f.initiativeDice < 1) out.push(`${f.key}.initiativeDice = ${f.initiativeDice}`);
    if (!Number.isInteger(f.reactionMod)) out.push(`${f.key}.reactionMod = ${f.reactionMod}`);
  }
  const ids = new Set();
  for (const i of doc.items ?? []) {
    if (ids.has(i._id)) out.push(`duplicate item _id ${i._id}`);
    ids.add(i._id);
    const tag = i.system?.form ?? "";
    if (tag && !keys.has(tag)) out.push(`${i.name} tagged "${tag}", no such form`);
  }
  if (doc.system?.activeForm && !keys.has(doc.system.activeForm)) out.push(`activeForm "${doc.system.activeForm}" unknown`);
  return out;
}

describe("critter forms", () => {
  const dir = "packs-src/critters";
  for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    if (doc.type === "npc") it(doc.name, () => expect(formProblems(doc)).toEqual([]));
  }
});
