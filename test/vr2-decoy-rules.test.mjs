// VR2.0 part 6a-0: Decoy (p.112), Null Operation and Scan Icon (p.117) — docs/archive/plans/PLAN-vr2-part6-frames.md.
import { describe, it, expect } from "vitest";
import { decoyFooled, liveDecoy, decoyBoxes, nullInactivityMod, scanIconTN } from "../module/rules/vr2-decoy-rules.mjs";

describe("Decoy (p.112)", () => {
  it("the IC attacks the decoy when 1D6 is less than the successes; a tie fools it too", () => {
    expect(decoyFooled(2, 3)).toBe(true);
    expect(decoyFooled(3, 3)).toBe(true);
    expect(decoyFooled(4, 3)).toBe(false);
    expect(decoyFooled(6, 6)).toBe(true);
  });
  const D = (key, ct, extra = {}) => ({ type: "decoy", key, card: `c-${key}`, conn: 1, sessionId: "s1", ct, ...extra });
  const H = (decoy, boxes) => ({ type: "decoyHit", decoy, boxes });
  const cards = (m) => (card) => (card in m ? m[card] : null);
  const ok = (successes) => ({ success: true, successes }), fail = { success: false, successes: 1 };
  it("the newest successful record is the decoy; its successes follow the card (Karma)", () => {
    const r = liveDecoy({ records: [D("a", 1), D("b", 2)], conn: 1, sessionId: "s1", cardOf: cards({ "c-a": ok(2), "c-b": ok(4) }) });
    expect(r).toMatchObject({ key: "b", successes: 4, damage: 0 });
  });
  it("a failed newer attempt leaves the older decoy; Karma turning it into a success replaces it", () => {
    const recs = [D("a", 1), D("b", 2)];
    expect(liveDecoy({ records: recs, conn: 1, sessionId: "s1", cardOf: cards({ "c-a": ok(2), "c-b": fail }) })?.key).toBe("a");
    expect(liveDecoy({ records: recs, conn: 1, sessionId: "s1", cardOf: cards({ "c-a": ok(2), "c-b": ok(3) }) })?.key).toBe("b");
  });
  it("a destroyed or deleted replacement never brings the old decoy back (R2 #1, R3)", () => {
    const recs = [D("a", 1), D("b", 2)];
    expect(liveDecoy({ records: [...recs, H("b", 6), H("b", 6)], conn: 1, sessionId: "s1", cardOf: cards({ "c-a": ok(2), "c-b": ok(3) }) })).toBeNull();
    expect(liveDecoy({ records: recs, conn: 1, sessionId: "s1", cardOf: cards({ "c-a": ok(2) }) })).toBeNull();
  });
  it("another host session or connection ends it; damage adds up under 10", () => {
    const recs = [D("a", 1)];
    expect(liveDecoy({ records: recs, conn: 1, sessionId: "s2", cardOf: cards({ "c-a": ok(2) }) })).toBeNull();
    expect(liveDecoy({ records: recs, conn: 2, sessionId: "s1", cardOf: cards({ "c-a": ok(2) }) })).toBeNull();
    expect(liveDecoy({ records: [...recs, H("a", 3), H("a", 6)], conn: 1, sessionId: "s1", cardOf: cards({ "c-a": ok(2) }) })?.damage).toBe(9);
  });
  it("full damage on the icon table (L1 M2 S3 D6, p.124), staged by the attack's successes; a miss does nothing", () => {
    expect(decoyBoxes("M", 0)).toBe(0);
    expect(decoyBoxes("M", 1)).toBe(2);
    expect(decoyBoxes("M", 2)).toBe(3);
    expect(decoyBoxes("S", 4)).toBe(6);
  });
});

describe("Null Operation (p.117)", () => {
  it("the inactivity bands", () => {
    expect(nullInactivityMod(9)).toBe(0);
    expect(nullInactivityMod(12)).toBe(1);         // Selena's 12-second download: +1
    expect(nullInactivityMod(59)).toBe(1);
    expect(nullInactivityMod(7 * 60)).toBe(2);     // the 7-minute maglock: +2
    expect(nullInactivityMod(3599)).toBe(2);
    expect(nullInactivityMod(3600)).toBe(4);
    expect(nullInactivityMod(12 * 3600 - 1)).toBe(4);
    expect(nullInactivityMod(12 * 3600)).toBe(5);  // +1 for each further 12 hours
    expect(nullInactivityMod(36 * 3600)).toBe(7);
  });
});

describe("Scan Icon (p.117)", () => {
  it("Scanner minus Sleaze lowers the TN; a bigger Sleaze raises it; never below 2", () => {
    expect(scanIconTN({ masking: 6, scanner: 4, sleaze: 0 })).toBe(2);
    expect(scanIconTN({ masking: 6, scanner: 4, sleaze: 3 })).toBe(5);
    expect(scanIconTN({ masking: 6, scanner: 2, sleaze: 5 })).toBe(9);
    expect(scanIconTN({ masking: 3, scanner: 6, sleaze: 0 })).toBe(2);
  });
});
