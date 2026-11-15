/**
 * Base TypeDataModel for the Shadowrun 2E system.
 * Extended by all Actor and Item data models.
 */
export class SR2EDataModel extends foundry.abstract.TypeDataModel {
  static VERSION = "0.1.0";

  /**
   * Helper to create a standard resource field (value/max).
   * `bonus` is the Active-Effect hook: effects targeting e.g.
   * system.dicePools.combat.bonus add dice on top of the computed maximum
   * (used by the Combat Sense spells).
   */
  static resourceField(initial = 0, max = 10) {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      value: new fields.NumberField({ required: true, integer: true, initial, min: 0 }),
      max: new fields.NumberField({ required: true, integer: true, initial: max, min: 0 }),
      bonus: new fields.NumberField({ required: true, integer: true, initial: 0 })
    });
  }

  /**
   * Where the entry is printed (chargen M1b, docs/PLAN-citations.md): `{ book, page }` — `book` a books.mjs id (or
   * "none"), `page` "59" or "59–60". Blank allowed (`blank: true`, or every existing document goes invalid).
   */
  static citationField() {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      book: new fields.StringField({ required: true, initial: "", blank: true }),
      page: new fields.StringField({ required: true, initial: "", blank: true })
    });
  }

  /**
   * Helper to create a standard attribute field.
   */
  static attributeField(initial = 1) {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      base: new fields.NumberField({ required: true, integer: true, initial, min: 0 }),
      mod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      value: new fields.NumberField({ required: true, integer: true, initial, min: 0 }),
      racial: new fields.NumberField({ required: true, integer: true, initial: 0 })
    });
  }

  /**
   * Helper to create a condition monitor field.
   */
  static conditionMonitorField() {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      max: new fields.NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      overflow: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    });
  }
}
