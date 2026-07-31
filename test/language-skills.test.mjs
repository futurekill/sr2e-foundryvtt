// SR2E p.74: "each specific language is a Specialization of a family of
// languages"; chargen specializations get +2; the family sits 4 below the
// language. Read from a 300 dpi render, not the text layer.
//
// The family being 4 below the LANGUAGE (not 4 below the number bought) is a
// deliberate reading — it keeps the language↔family spread at 4, matching the
// generic specialization rule on p.55/p.70. See docs/PLAN-language-skills.md.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { languageSkillRatings, skillRollRating, skillSubRatings } from "../module/rules/sr2e-rules.mjs";

describe("language skills (SR2E p.74)", () => {
  it("adds +2 to a language taken at character generation", () => {
    expect(languageSkillRatings(4, true).language).toBe(6);
    expect(languageSkillRatings(1, true).language).toBe(3);   // the reported case
  });

  it("adds nothing to one picked up afterwards", () => {
    expect(languageSkillRatings(4, false).language).toBe(4);
  });

  it("puts the family 4 below the language", () => {
    // Spanish bought at 4 in chargen → Spanish 6, Romance 2.
    expect(languageSkillRatings(4, true)).toEqual({ language: 6, family: 2 });
    expect(languageSkillRatings(8, false)).toEqual({ language: 8, family: 4 });
  });

  it("treats any modified rating below 1 as a 1", () => {
    // "Any modified rating less than 1 is treated as a 1."
    expect(languageSkillRatings(1, true).family).toBe(1);     // 3 - 4 = -1 → 1
    expect(languageSkillRatings(2, true).family).toBe(1);     // 4 - 4 =  0 → 1
    expect(languageSkillRatings(3, true).family).toBe(1);     // 5 - 4 =  1
    expect(languageSkillRatings(4, true).family).toBe(2);     // first value above the floor
  });

  it("keeps the same language↔family spread as an ordinary specialization", () => {
    // p.55/p.70: specialization = general + 4. p.74 must not invent a different
    // spread — that was the reading this implementation deliberately rejected.
    const { language, family } = languageSkillRatings(9, true);
    expect(language - family).toBe(4);
    expect(skillSubRatings(family).specialization).toBe(language);
  });

  it("leaves an untrained language at 0 so defaulting still fires", () => {
    expect(languageSkillRatings(0, true)).toEqual({ language: 0, family: 0 });
  });
});

describe("skillRollRating", () => {
  it("rolls the derived rating for a language", () => {
    expect(skillRollRating({ category: "language", rating: 4, languageRating: 6 })).toBe(6);
  });

  it("rolls the plain rating for everything else", () => {
    expect(skillRollRating({ category: "active", rating: 5, languageRating: 99 })).toBe(5);
    expect(skillRollRating({ category: "knowledge", rating: 3 })).toBe(3);
  });

  it("falls back to the bought rating when nothing is derived", () => {
    // An unprepared or synthetic skill object must not roll 0 dice.
    expect(skillRollRating({ category: "language", rating: 4 })).toBe(4);
    expect(skillRollRating(null)).toBe(0);
  });
});

describe("shipped language skills", () => {
  const langs = readdirSync("packs-src/skills").filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(`packs-src/skills/${f}`, "utf8")))
    .filter(d => d.system?.category === "language");

  it("ships 18 languages, every one carrying a family decision", () => {
    expect(langs).toHaveLength(18);
    for (const l of langs) expect(l.system.languageFamily).toBeDefined();
  });

  it("files each language under its p.74 family", () => {
    const byName = Object.fromEntries(langs.map(l => [l.name, l.system.languageFamily]));
    expect(byName["Spanish"]).toBe("Romance");
    expect(byName["English"]).toBe("Germanic");
    expect(byName["Russian"]).toBe("Slavic");
    expect(byName["Cantonese"]).toBe("Sino-Tibetan");
    expect(byName["Arabic"]).toBe("Semitic");
    // Bold with no list of their own on p.74 — each is its own family.
    expect(byName["Japanese"]).toBe("Japanese");
    expect(byName["Korean"]).toBe("Korean");
  });

  it("leaves the three languages in no formal group without a family", () => {
    // p.74 Special Languages: City Speak "is not part of any formal language
    // group"; Sperethiel has "no direct connections to existing language
    // groups"; and there are no formal ork languages at all.
    const byName = Object.fromEntries(langs.map(l => [l.name, l.system.languageFamily]));
    expect(byName["Cityspeak"]).toBe("");
    expect(byName["Sperethiel"]).toBe("");
    expect(byName["Or'zet"]).toBe("");
  });
});

describe("CONFIG language families vs the compendium", () => {
  // The runtime map exists because a LinguaSoft creates its skill from a NAME
  // with no compendium available (SR2E p.248 — a LinguaSoft replicates Language
  // Skills, so the chip must carry the same p.74 family structure). Two copies
  // of the same fact, so pin them together.
  const cfg = readFileSync("module/config.mjs", "utf8");
  const block = /SR2E\.languageFamilies\s*=\s*\{([\s\S]*?)\n\};/.exec(cfg)[1];
  const CONFIG_MAP = Object.fromEntries(
    [...block.matchAll(/^\s*"?([^":\n]+?)"?:\s*"([^"]*)"/gm)].map(m => [m[1].trim(), m[2]])
  );

  const shipped = readdirSync("packs-src/skills").filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(`packs-src/skills/${f}`, "utf8")))
    .filter(d => d.system?.category === "language");

  it("actually parsed the map", () => {
    // Without this the three assertions below pass vacuously if the regex breaks.
    expect(Object.keys(CONFIG_MAP).length).toBe(15);
  });

  it("agrees with every shipped language that has a family", () => {
    for (const l of shipped) {
      const fam = l.system.languageFamily;
      if (!fam) continue;                       // deliberately family-less
      expect(CONFIG_MAP[l.name.toLowerCase()],
        `${l.name}: compendium says "${fam}", CONFIG says "${CONFIG_MAP[l.name.toLowerCase()]}"`).toBe(fam);
    }
  });

  it("omits the three languages that belong to no family", () => {
    // p.74: City Speak and Elvish are in no formal group; there are no formal
    // ork languages. A chip for one of these must get no family, not a wrong one.
    for (const n of ["cityspeak", "sperethiel", "or'zet"]) {
      expect(CONFIG_MAP[n]).toBeUndefined();
    }
  });

  it("does not invent languages the compendium does not ship", () => {
    const names = new Set(shipped.map(l => l.name.toLowerCase()));
    for (const k of Object.keys(CONFIG_MAP)) expect(names.has(k), `CONFIG has unknown language "${k}"`).toBe(true);
  });
});

describe("a language in no formal family (SR2E p.74)", () => {
  // City Speak, Sperethiel and the ork tongues belong to no group, so there is
  // nothing to muddle through toward. Deriving a family rating anyway made the
  // sheet render a clickable BLANK tag that rolled dice for a family that does
  // not exist — on native languages as well as chipped ones. Found by review
  // after 0.77.0 shipped.
  /** Mirror of SkillData#applyLanguageRatings' family gate. */
  const familyOf = (rating, chargen, languageFamily) =>
    languageFamily ? languageSkillRatings(rating, chargen).family : 0;

  it("gets no family rating, however high the language", () => {
    expect(familyOf(3, true, "")).toBe(0);
    expect(familyOf(9, true, "")).toBe(0);
    expect(familyOf(6, false, "")).toBe(0);
  });

  it("still gets one when the language DOES have a family", () => {
    expect(familyOf(9, true, "Romance")).toBe(7);
    expect(familyOf(3, false, "Germanic")).toBe(1);   // floor still applies
  });

  it("covers exactly the three shipped family-less languages", () => {
    const langs = readdirSync("packs-src/skills").filter(f => f.endsWith(".json"))
      .map(f => JSON.parse(readFileSync(`packs-src/skills/${f}`, "utf8")))
      .filter(d => d.system?.category === "language");
    const none = langs.filter(l => !l.system.languageFamily).map(l => l.name).sort();
    expect(none).toEqual(["Cityspeak", "Or'zet", "Sperethiel"]);
  });
});
