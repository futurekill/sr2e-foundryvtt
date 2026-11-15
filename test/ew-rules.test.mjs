import { describe, it, expect } from "vitest";
import { signalBand, channelBoxes, appliedBoxes, interceptTn, interceptedChannels, decryptTn, decryptOk, mijiTns, mijiNet,
  regenTn, regenBoxes, regenerate, reconnectTn, reconnectAllowed, reconnectOk, affects, degradationMod } from "../module/rules/ew-rules.mjs";

const mon = (...entries) => ({ entries: Object.fromEntries(entries.map((e, i) => [`e${i}`, { at: i, ...e }])) });

describe("Signal Monitor (R2 p.70)", () => {
  it("bands: Light from 1 (+1), Moderate from 3 (+2), Serious from 6 (+3), 10 disengaged", () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10].map(b => signalBand(b).tn)).toEqual([0, 1, 1, 2, 2, 3, 3, 3]);
    expect(signalBand(10).full).toBe(true);
    expect(signalBand(9).full).toBe(false);
  });
  it("an entry applies at most the remaining capacity, so a channel never passes 10", () => {
    const m = mon({ boxes: 8 });
    expect(appliedBoxes(m, 5)).toBe(2);
    expect(appliedBoxes(mon({ boxes: 10 }), 3)).toBe(0);
    expect(channelBoxes(mon({ boxes: 3 }, { boxes: 4 }))).toBe(7);
  });
});

describe("Interception and encryption (p.68–69)", () => {
  it("TN = deck rating + 3, +2 per alert", () => {
    expect(interceptTn({ deckRating: 4 })).toBe(7);
    expect(interceptTn({ deckRating: 4, alert: 2 })).toBe(11);
  });
  it("successes take channels, the named ones first; none named → the GM chooses", () => {
    expect(interceptedChannels(2, ["system", "command"])).toEqual({ channels: ["system", "command"], gmChooses: 0 });
    expect(interceptedChannels(3, ["simsense"])).toEqual({ channels: ["simsense"], gmChooses: 2 });
    expect(interceptedChannels(2, [])).toEqual({ channels: [], gmChooses: 2 });
    expect(interceptedChannels(9, [])).toEqual({ channels: [], gmChooses: 3 });
  });
  it("decryption: TN encryption + 4; success needs MORE than half the deck rating, rounded up (R5-2)", () => {
    expect(decryptTn(3)).toBe(7);
    expect(decryptOk(3, 5)).toBe(false);   // ⌈5 ÷ 2⌉ = 3: needs 4
    expect(decryptOk(4, 5)).toBe(true);
    expect(decryptOk(3, 4)).toBe(true);    // ⌈4 ÷ 2⌉ = 2
  });
});

describe("MIJI (p.69–72)", () => {
  it("intruder vs deck rating + alert; defender vs protocol emulation, or ECM for jamming", () => {
    expect(mijiTns({ op: "meaconing", targetDeckRating: 4, alert: 1, protocolEmulation: 5, ecm: 3 })).toEqual({ intruder: 6, defender: 5 });
    expect(mijiTns({ op: "jamming", targetDeckRating: 4, protocolEmulation: 5, ecm: 3 })).toEqual({ intruder: 4, defender: 3 });
  });
  it("net successes; a tie or a defender win is 0", () => {
    expect(mijiNet(4, 1)).toBe(3);
    expect(mijiNet(2, 2)).toBe(0);
    expect(mijiNet(1, 3)).toBe(0);
  });
});

describe("Regeneration and reconnection (p.72)", () => {
  it("regeneration TN = the higher of deck and ECM rating + 3; 2 successes clear a box", () => {
    expect(regenTn({ deckRating: 4, ecm: 6 })).toBe(9);
    expect([0, 1, 2, 3, 5].map(regenBoxes)).toEqual([0, 0, 1, 1, 2]);
  });
  it("clears ONE intruder's boxes on the channel, oldest entry first (R5-5)", () => {
    const m = mon({ attackerKey: "A", boxes: 2 }, { attackerKey: "B", boxes: 3 }, { attackerKey: "A", boxes: 4 });
    expect(regenerate(m, "A", 3)).toEqual({ e0: 0, e2: 3 });
    expect(regenerate(m, "B", 9)).toEqual({ e1: 0 });
  });
  it("reconnection needs a clear box; TN 4 + band + damage; successes must exceed the filled boxes", () => {
    expect(reconnectAllowed(10)).toBe(false);
    expect(reconnectAllowed(9)).toBe(true);
    expect(reconnectTn({ boxes: 6, damageMod: 1 })).toBe(8);
    expect(reconnectOk(6, 6)).toBe(false);
    expect(reconnectOk(7, 6)).toBe(true);
  });
});

describe("Applying degradation (plan 5b.3)", () => {
  it("meaconing reaches drone and IVIS tests, not Comprehension", () => {
    expect(affects("meaconing", "command", "drone")).toBe(true);
    expect(affects("meaconing", "command", "comprehension")).toBe(false);
    expect(affects("jamming", "command", "comprehension")).toBe(true);
    expect(affects("jamming", "simsense", "riggerAll")).toBe(true);
    expect(affects("intrusion", "command", "drone")).toBe(false);
  });
  it("each channel counted once, banded by its TOTAL boxes, only when an affecting entry is present", () => {
    const monitors = {
      command: mon({ op: "intrusion", boxes: 4 }, { op: "meaconing", boxes: 2 }),   // 6 boxes → Serious +3 (meaconing present)
      system: mon({ op: "meaconing", boxes: 1 }),                                    // Light +1
      simsense: mon({ op: "jamming", boxes: 5 })                                     // not a drone-test effect
    };
    expect(degradationMod(monitors, "drone")).toBe(4);
    expect(degradationMod(monitors, "comprehension")).toBe(0);
    expect(degradationMod(monitors, "drone", ["system"])).toBe(1);
    expect(degradationMod({ command: mon({ op: "meaconing", boxes: 0 }) }, "drone")).toBe(0);
  });
});
