import { describe, it, expect } from "vitest";
import { naturalAttribute, chargenSpend, attributeEdgeViolations } from "../module/rules/sr2e-rules.mjs";

// Shadowrun Companion p.24, ATTRIBUTE EDGES.
//   Bonus Attribute Point (Value 1): "A player can gain 1 bonus Attribute Point
//     ... can be added to any Attribute except Essence, Reaction or Magic."
//     "Unless authorized by the gamemaster, bonus Attribute Points cannot raise
//     the Attribute Ratings of characters beyond the racial maximums."
//   Exceptional Attribute (Value 2): "A player can increase the racial maximum
//     for one of his or her character's Attributes by 1. Note that Exceptional
//     Attribute simply raises the maximum—it does not increase the character's
//     actual Attribute Rating to the new maximum."

describe("naturalAttribute (Companion p.24 Attribute Edges)", () => {
  it("is base + racial with no Edges", () => {
    // A troll's Body: 3 bought, +5 racial, max 11.
    expect(naturalAttribute(3, 5, 0, 11, 0)).toBe(8);
  });

  it("adds a Bonus Attribute Point to the rating", () => {
    expect(naturalAttribute(3, 0, 1, 6, 0)).toBe(4);
  });

  it("stacks up to the book's 5 bonus points", () => {
    // Human Strength: 1 bought + 5 bonus points = 6, exactly the racial maximum.
    expect(naturalAttribute(1, 0, 5, 6, 0)).toBe(6);
  });

  it("will not let bonus points exceed the racial maximum", () => {
    // 6 bought + 2 bonus would be 8, but a human's maximum is 6.
    expect(naturalAttribute(6, 0, 2, 6, 0)).toBe(6);
  });

  it("clamps base+racial even with no Edges at all", () => {
    expect(naturalAttribute(9, 5, 0, 11, 0)).toBe(11);
  });

  it("Exceptional Attribute raises the maximum but NOT the rating", () => {
    // The book is explicit: the ceiling moves, the rating does not follow it.
    expect(naturalAttribute(4, 0, 0, 6, 1)).toBe(4);
    // At the old maximum, the raise alone still buys nothing.
    expect(naturalAttribute(6, 0, 0, 6, 1)).toBe(6);
  });

  it("Exceptional Attribute lets a Bonus Attribute Point reach the new maximum", () => {
    // "To do that, players must take bonus Attribute Points per the Bonus
    // Attribute Point Edge." 6 (at the human max) + 1 point, ceiling raised to 7.
    expect(naturalAttribute(6, 0, 1, 6, 1)).toBe(7);
    // ...and no further: the raised ceiling is still a ceiling.
    expect(naturalAttribute(6, 0, 3, 6, 1)).toBe(7);
  });

  it("leaves the rating unclamped when the attribute has no published maximum", () => {
    expect(naturalAttribute(8, 0, 2, null, 0)).toBe(10);
  });
});

describe("chargen does not charge for Edge-bought attribute points", () => {
  // The player's report: taking Bonus Attribute Point and adding the points by
  // hand left the chargen warning "off by 3". Edge-bought points live outside
  // `base`, so the attribute budget must not see them.
  const attrs = (base) => base.map((b) => ({ base: b }));

  it("counts only the bought base ratings", () => {
    // Six attributes at 4 = 24 points, against a Priority B allotment of 24.
    const spend = chargenSpend({ attributes: attrs([4, 4, 4, 4, 4, 4]) }, { attributes: 24 });
    expect(spend.attributes.spent).toBe(24);
    expect(spend.attributes.remaining).toBe(0);
    expect(spend.attributes.over).toBe(false);
  });

  it("stays balanced when 3 Edge points raise the ratings", () => {
    // Same character, +3 from Bonus Attribute Points. The ratings rise (via
    // naturalAttribute) but the budget is untouched — this is the off-by-3 fix.
    const spend = chargenSpend({ attributes: attrs([4, 4, 4, 4, 4, 4]) }, { attributes: 24 });
    expect(naturalAttribute(4, 0, 3, 9, 0)).toBe(7);
    expect(spend.attributes.spent).toBe(24);
    expect(spend.attributes.over).toBe(false);
  });
});

describe("attributeEdgeViolations (Companion p.24 limits)", () => {
  const bonus = (attribute, n) => ({ attribute, attributeBonus: n });
  const exceptional = (attribute) => ({ attribute, maximumBonus: 1 });

  it("passes a legal spread", () => {
    const v = attributeEdgeViolations([bonus("body", 3), bonus("strength", 2), exceptional("body")]);
    expect(v.bonusTotal).toBe(5);
    expect(v.bonusOverCap).toBe(false);
    expect(v.exceptionalRepeats).toEqual([]);
  });

  it("allows exactly 5 bonus points but flags the 6th", () => {
    expect(attributeEdgeViolations([bonus("body", 5)]).bonusOverCap).toBe(false);
    expect(attributeEdgeViolations([bonus("body", 6)]).bonusOverCap).toBe(true);
    // The cap is on the total across every Attribute, not per Attribute.
    const v = attributeEdgeViolations([bonus("body", 3), bonus("quickness", 3)]);
    expect(v.bonusTotal).toBe(6);
    expect(v.bonusOverCap).toBe(true);
  });

  it("flags Exceptional Attribute taken twice on one Attribute", () => {
    const v = attributeEdgeViolations([exceptional("charisma"), exceptional("charisma")]);
    expect(v.exceptionalRepeats).toEqual(["charisma"]);
  });

  it("allows Exceptional Attribute once on each of several Attributes", () => {
    // "only once per Attribute" — not once per character.
    const v = attributeEdgeViolations([exceptional("body"), exceptional("willpower")]);
    expect(v.exceptionalRepeats).toEqual([]);
  });

  it("ignores Edges with no Attribute picked", () => {
    // An unassigned Edge does nothing mechanically, so counting it against the
    // cap would be a false alarm — this is the state every freshly dragged
    // Bonus Attribute Point is in.
    const v = attributeEdgeViolations([
      { attribute: "", attributeBonus: 9 }, { attributeBonus: 9 }, bonus("body", 1)
    ]);
    expect(v.bonusTotal).toBe(1);
    expect(v.bonusOverCap).toBe(false);
  });

  it("survives an empty or junk list", () => {
    expect(attributeEdgeViolations().bonusOverCap).toBe(false);
    expect(attributeEdgeViolations([]).bonusTotal).toBe(0);
  });
});
