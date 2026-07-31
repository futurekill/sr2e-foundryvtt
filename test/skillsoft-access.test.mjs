// Know/LinguaSofts need an access port (SR2E p.243). Access used to be detected
// by NAME, so a sourcebook device that reads chips under a different name was
// rejected outright — a player with a Shadowtech Softlink (an advanced chipjack,
// Level = ports) was told to "install a chipjack, datajack, or headware memory"
// while wearing one. The declared `accessPorts` field fixes that class of bug,
// not just the one item.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/** Mirror of the access-port tally in CharacterData#_applySkillsofts. */
function accessFrom(items) {
  let chipjacks = 0, datajacks = 0, memCapacity = 0;
  for (const i of items) {
    if (i.type !== "cyberware" || !i.system.installed) continue;
    const n = i.name.toLowerCase();
    const declared = i.system.accessPorts ?? 0;
    if (declared > 0) chipjacks += declared;
    else if (n.includes("chipjack")) chipjacks++;
    if (n.includes("datajack")) datajacks++;
    const m = /(\d[\d,]*)\s*mp/i.exec(i.name);
    if (m) memCapacity += parseInt(m[1].replace(/,/g, ""), 10);
  }
  return { chipjacks, datajacks, memCapacity,
           knowAccess: chipjacks > 0 || datajacks > 0 || memCapacity > 0 };
}
const ware = (name, system = {}) => ({ type: "cyberware", name, system: { installed: true, ...system } });

describe("access ports for Know/LinguaSofts (p.243)", () => {
  it("a declared port counts however the device is named", () => {
    // The actual bug: "Softlink" contains neither "chipjack" nor "datajack".
    expect(accessFrom([ware("Softlink")]).knowAccess).toBe(false);          // name alone: invisible
    expect(accessFrom([ware("Softlink", { accessPorts: 1 })]).knowAccess).toBe(true);
  });

  it("multi-port devices contribute their full count", () => {
    // A Softlink accepts up to 4 chips (Level = ports, Shadowtech p.46).
    expect(accessFrom([ware("Softlink", { accessPorts: 4 })]).chipjacks).toBe(4);
  });

  it("still recognises legacy items by name when nothing is declared", () => {
    expect(accessFrom([ware("Chipjack")]).knowAccess).toBe(true);
    expect(accessFrom([ware("Datajack")]).knowAccess).toBe(true);
    expect(accessFrom([ware("Headware Memory 100 Mp")]).knowAccess).toBe(true);
  });

  it("does not double-count a declared port that also matches the name", () => {
    // "Chipjack" with accessPorts 1 must be 1 port, not 2.
    expect(accessFrom([ware("Chipjack", { accessPorts: 1 })]).chipjacks).toBe(1);
  });

  it("an uninstalled implant grants nothing", () => {
    expect(accessFrom([ware("Softlink", { accessPorts: 4, installed: false })]).knowAccess).toBe(false);
  });

  it("the shipped Chipjack declares its port", () => {
    const f = readdirSync("packs-src/cyberware").filter(x => x.endsWith(".json"))
      .map(x => JSON.parse(readFileSync(`packs-src/cyberware/${x}`, "utf8")))
      .find(d => d.name === "Chipjack");
    expect(f?.system.accessPorts).toBe(1);
  });
});
