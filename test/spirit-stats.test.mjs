import { describe, it, expect } from "vitest";
import { spiritAttributes } from "../module/rules/sr2e-rules.mjs";

// SR2E Critter Statistics Table, book p.234–235. Columns B | Q | S | C | I | W | E | R.
// The Q column is Quickness x movement-multiplier, the standard critter notation
// ("3 x 4" = Quickness 3, multiplier 4) — NOT Quickness multiplied by four.
const PROFILES = {
  air:   { b: -2, q: +3, mult: 4, s: -3, r: +2 },
  earth: { b: +4, q: -2, mult: 2, s: +4, r: -2 },
  fire:  { b: +1, q: +2, mult: 3, s: -2, r: +1 },
  water: { b: +2, q:  0, mult: 2, s:  0, r: -1 }
};

describe("Spirit attributes (SR2E p.234–235)", () => {
  it("air at Force 6: B 4, Q 9 (x4), S 3, R 8", () => {
    const a = spiritAttributes(PROFILES.air, 6);
    expect(a.body).toBe(4);
    expect(a.quickness).toBe(9);
    expect(a.strength).toBe(3);
    expect(a.reaction).toBe(8);
    expect(a.moveMult).toBe(4);
  });

  it("earth at Force 6: B 10, Q 4 (x2), S 10, R 4", () => {
    const a = spiritAttributes(PROFILES.earth, 6);
    expect(a.body).toBe(10);
    expect(a.quickness).toBe(4);
    expect(a.strength).toBe(10);
    expect(a.reaction).toBe(4);
    expect(a.moveMult).toBe(2);
  });

  it("fire at Force 6: B 7, Q 8 (x3), S 4, R 7", () => {
    const a = spiritAttributes(PROFILES.fire, 6);
    expect(a.body).toBe(7);
    expect(a.quickness).toBe(8);
    expect(a.strength).toBe(4);
    expect(a.reaction).toBe(7);
    expect(a.moveMult).toBe(3);
  });

  it("water at Force 6: B 8, Q 6 (x2), S 6, R 5", () => {
    const a = spiritAttributes(PROFILES.water, 6);
    expect(a.body).toBe(8);
    expect(a.quickness).toBe(6);
    expect(a.strength).toBe(6);
    expect(a.reaction).toBe(5);
    expect(a.moveMult).toBe(2);
  });

  it("the regression this fixes: a Force-4 earth elemental is NOT 4/4/4", () => {
    // The old code flattened every attribute to Force, halving an earth
    // elemental's toughness and doubling its agility.
    const a = spiritAttributes(PROFILES.earth, 4);
    expect(a.body).toBe(8);
    expect(a.strength).toBe(8);
    expect(a.quickness).toBe(2);
    expect(a.reaction).toBe(2);
  });

  it("Charisma, Intelligence, Willpower and Essence are always Force", () => {
    for (const p of Object.values(PROFILES)) {
      const a = spiritAttributes(p, 5);
      expect(a.charisma).toBe(5);
      expect(a.intelligence).toBe(5);
      expect(a.willpower).toBe(5);
      expect(a.essence).toBe(5);
    }
  });

  it("floors every value at 1 — the book's formulas go negative at low Force", () => {
    // Force 1 air: B -1, S -2. Force 1 earth: R -1. Force 1 water: R 0.
    const air = spiritAttributes(PROFILES.air, 1);
    expect(air.body).toBe(1);
    expect(air.strength).toBe(1);
    const earth = spiritAttributes(PROFILES.earth, 1);
    expect(earth.reaction).toBe(1);
    const water = spiritAttributes(PROFILES.water, 1);
    expect(water.reaction).toBe(1);
  });

  it("an unknown or missing profile still yields usable numbers", () => {
    const a = spiritAttributes(undefined, 4);
    expect(a.body).toBe(4);
    expect(a.moveMult).toBe(3);
  });
});

// The printed power sets (SR2E p.234–235). Nature spirits are NOT
// interchangeable: only Storm has Electrical Projection, only the water group
// Engulfs, only Swamp Binds, and among elementals only Fire has the flame powers.
import { SR2E } from "../module/config.mjs";

describe("Spirit powers by domain (SR2E p.234–235)", () => {
  const P = SR2E.spiritDomainPowers;

  it("every domain a shaman can summon has a printed power set", () => {
    for (const key of Object.keys(SR2E.spiritDomains)) {
      expect(P[key], `${key} has no power list`).toBeTruthy();
      expect(P[key].length).toBeGreaterThan(0);
    }
  });

  it("every listed power exists in spiritPowers", () => {
    for (const [domain, list] of Object.entries(P)) {
      for (const power of list) {
        expect(SR2E.spiritPowers[power], `${domain} lists unknown power ${power}`).toBeTruthy();
      }
    }
  });

  it("Of Man: city, hearth and field differ as printed", () => {
    expect(P.city).toEqual(["accident","alienation","concealment","confusion","fear","guard","search"]);
    expect(P.hearth).toEqual(["accident","alienation","concealment","confusion","guard","search"]);
    expect(P.field).toEqual(["accident","concealment","guard","search"]);
  });

  it("only Storm projects electricity; Mist does not", () => {
    expect(P.storm).toContain("electricalProjection");
    expect(P.mist).not.toContain("electricalProjection");
  });

  it("only the water group Engulfs among nature spirits", () => {
    for (const d of ["lake","river","sea","swamp"]) expect(P[d]).toContain("engulf");
    for (const d of ["city","hearth","field","desert","forest","mountain","prairie","mist","storm"]) {
      expect(P[d], `${d} should not Engulf`).not.toContain("engulf");
    }
  });

  it("only Swamp binds", () => {
    expect(P.swamp).toContain("binding");
    expect(Object.entries(P).filter(([, l]) => l.includes("binding")).map(([d]) => d)).toEqual(["swamp"]);
  });

  it("only the Fire elemental has the flame powers", () => {
    expect(P.fire).toEqual(expect.arrayContaining(["flameAura","flameProjection"]));
    for (const e of ["air","earth","water"]) {
      expect(P[e]).not.toContain("flameAura");
      expect(P[e]).not.toContain("flameProjection");
    }
  });

  it("Air alone among elementals has Noxious Breath and Psychokinesis", () => {
    expect(P.air).toEqual(expect.arrayContaining(["noxiousBreath","psychokinesis"]));
    for (const e of ["earth","fire","water"]) {
      expect(P[e]).not.toContain("psychokinesis");
    }
  });

  it("every domain resolves to one of the four stat profiles", () => {
    for (const key of Object.keys(SR2E.spiritDomains)) {
      expect(["air","earth","fire","water"]).toContain(SR2E.spiritDomainProfile[key]);
    }
  });

  it("the domain groups map to the right profile (p.235)", () => {
    const M = SR2E.spiritDomainProfile;
    for (const d of ["city","hearth","field"])                 expect(M[d]).toBe("fire");
    for (const d of ["desert","forest","mountain","prairie"])   expect(M[d]).toBe("earth");
    for (const d of ["mist","storm","wind"])                    expect(M[d]).toBe("air");
    for (const d of ["lake","river","sea","swamp"])             expect(M[d]).toBe("water");
  });
});
