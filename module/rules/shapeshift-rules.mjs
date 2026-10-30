/**
 * Shapeshifters — pure rules (docs/PLAN-shapeshifters.md). Shadowrun Companion pp.36–38 for player
 * characters; core pp.227–229 (Regeneration, Allergy, Vulnerability) for gamemaster characters.
 * Every number here was read from a page render.
 */
import { claimId } from "./claim-rules.mjs";

const A = (o = {}) => ({ body: 0, quickness: 0, strength: 0, charisma: 0, intelligence: 0, willpower: 0, ...o });
const F = (attrs, extra = {}) => ({ attrs: A(attrs), initDice: 0, reach: 0, dermalDice: 0, ...extra });

/** Shapeshifter Attribute Modifiers Table (Companion p.36). */
export const SHAPESHIFTER_SPECIES = {
  bear: { human: F({ body: 1, strength: 1 }),
          animal: F({ body: 5, quickness: -1, strength: 5, willpower: -2 }, { reach: 1, dermalDice: 2 }) },
  fox: { human: F({ intelligence: 1, charisma: 2, willpower: 1 }),
         animal: F({ intelligence: 1, charisma: 2, willpower: 1, body: -2, strength: -2 }, { initDice: 1 }) },
  leopard: { human: F(), animal: F({ body: 1, strength: 1 }, { initDice: 2 }) },
  seal: { human: F({ charisma: 1 }), animal: F({ charisma: 1, body: 2, quickness: 1 }, { initDice: 1 }) },
  tiger: { human: F({ strength: 1 }),
           animal: F({ body: 4, quickness: 1, strength: 4, intelligence: -1, willpower: -2 }, { reach: 1, initDice: 2 }) },
  wolf: { human: F(), animal: F({ body: 1, quickness: 1 }, { initDice: 1 }) }
};
export const SPECIES_KEYS = Object.keys(SHAPESHIFTER_SPECIES);

/**
 * Shapeshifter Character Creation Table (Companion p.36). Row A is the race (every shapeshifter must put
 * Race at A); every row carries every category the priority renderer reads. `null` = not available.
 */
export const SHAPESHIFTER_PRIORITIES = {
  A: { attributes: null, skills: null, resources: null, forcePoints: null, magic: "none", race: "shapeshifter" },
  B: { attributes: 24, skills: 30, resources: 400000, forcePoints: 35, magic: "full_magician", race: null },
  C: { attributes: 20, skills: 24, resources: 90000, forcePoints: 25, magic: "adept", race: null },
  D: { attributes: 17, skills: 20, resources: 5000, forcePoints: 15, magic: "none", race: null },
  E: { attributes: 15, skills: 17, resources: 500, forcePoints: 5, magic: "none", race: null }
};

/** The modifiers of one form; unknown species or form → none. */
export const formModifiers = (species, form) => SHAPESHIFTER_SPECIES[species]?.[form] ?? F();

/** Social Skills (core p.72): Etiquette, Interrogation, Leadership, Negotiation (by base name). */
export const SOCIAL_SKILLS = ["etiquette", "interrogation", "leadership", "negotiation"];
export const isSocialSkill = (name) =>
  SOCIAL_SKILLS.includes(String(name ?? "").replace(/\(.*$/, "").trim().toLowerCase());

/** Dermal armor dice added to damage resistance: troll +1 Body (core Racial Modifications Table), bear animal form +2 (p.36). */
export const dermalDice = ({ race, species, form } = {}) =>
  race === "troll" ? 1 : race === "shapeshifter" ? formModifiers(species, form).dermalDice : 0;

// ── Damage buckets (player characters, Physical only) ───────────────────────

/** The heal order for an ordinary (non-regeneration) decrease: the slow-healing damage first (RAW silent). */
export const HEAL_ORDER = ["bane", "drain", "human", "animal"];
export const emptyBuckets = () => ({ human: 0, animal: 0, bane: 0, drain: 0 });
const sum = (b) => HEAL_ORDER.reduce((t, k) => t + (b[k] ?? 0), 0);

function take(b, n, order = HEAL_ORDER) {
  for (const k of order) { const t = Math.min(b[k], n); b[k] -= t; n -= t; if (!n) break; }
  return b;
}

/**
 * Make the buckets sum to the monitor total (Physical value + overflow). Missing boxes have unknown
 * provenance and go to `human` — the slowest regenerating form (also an already-wounded actor's start).
 */
export function reconcileBuckets(b, total) {
  const out = { ...emptyBuckets(), ...(b ?? {}) };
  for (const k of HEAL_ORDER) out[k] = Math.max(0, Math.floor(Number(out[k]) || 0));
  const s = sum(out);
  if (s < total) out.human += total - s;
  else if (s > total) take(out, s - total);
  return out;
}

/**
 * Apply one Physical change. `added` names how many of the added boxes came from silver (`bane`) or
 * Physical Drain (`drain`); the rest are the current form's. A decrease takes `explicit` decrements
 * (regeneration) or the heal order.
 */
export function applyDelta(b, { before, after, added = {}, form = "human", explicit = null }) {
  const out = reconcileBuckets(b, before);
  if (after > before) {
    let n = after - before;
    for (const k of ["bane", "drain"]) { const t = Math.min(n, Math.max(0, added[k] ?? 0)); out[k] += t; n -= t; }
    out[form === "animal" ? "animal" : "human"] += n;
  } else if (after < before) {
    let n = before - after;
    if (explicit) for (const k of HEAL_ORDER) { const t = Math.min(n, out[k], Math.max(0, explicit[k] ?? 0)); out[k] -= t; n -= t; }
    take(out, n);
  }
  return reconcileBuckets(out, after);
}

/** Combat Turns per minute: a Combat Turn is 3 seconds (core p.80). */
export const TURNS_PER_MINUTE = 20;

/**
 * `turns` Combat Turns of regeneration (Companion p.37–38). Human form: nothing. Animal form, each turn one
 * ⌊E⌋ budget: animal-form damage first, then human-form damage up to ⌊E/2⌋ of what's left (after a survived
 * Deadly check the human bucket heals at the full rate). Silver and Physical Drain: 1 box per minute each.
 * @returns {{dec:object, carry:number, healed:number}}
 */
export function regenStep(b, { form, essence, turns = 1, carry = 0, survived = false }) {
  const dec = emptyBuckets();
  if (form !== "animal" || turns <= 0) return { dec, carry, healed: 0 };
  const left = { ...emptyBuckets(), ...b };
  const E = Math.max(0, Math.floor(Number(essence) || 0));
  for (let t = 0; t < turns; t++) {
    let budget = E;
    const a = Math.min(left.animal, budget); left.animal -= a; dec.animal += a; budget -= a;
    const h = Math.min(left.human, survived ? budget : Math.min(Math.floor(E / 2), budget));
    left.human -= h; dec.human += h;
  }
  const minutes = Math.floor((carry + turns) / TURNS_PER_MINUTE);
  const nextCarry = (carry + turns) % TURNS_PER_MINUTE;
  for (const k of ["bane", "drain"]) { const t = Math.min(left[k], minutes); left[k] -= t; dec[k] += t; }
  return { dec, carry: nextCarry, healed: sum(dec) };
}

// ── Death ───────────────────────────────────────────────────────────────────

/**
 * Does this Physical change open a death check? Only when it ADDS damage (`before`/`after` = Physical value +
 * overflow) and the Physical monitor is `full` after it. PC in human form → standard rules (null). PC damage all silver → standard rules (null). Drain in this
 * hit, or silver plus other damage → dies on 1–2; otherwise on 1 (the card offers 1–2 for massive tissue
 * injury). NPCs (core p.227) → 1.
 */
export function deathCheckFor({ kind, form, before, after, full, added = {}, buckets = null }) {
  if (!(after > before) || !full) return null;
  if (kind === "npc") return { diesOn: 1, why: "regeneration (core p.227)" };
  if (form !== "animal") return null;
  const b = buckets ?? emptyBuckets();
  const total = sum(b);
  if (total > 0 && b.bane >= total) return null;
  if ((added.drain ?? 0) > 0) return { diesOn: 2, why: "Deadly Physical damage from Drain (Companion p.38)" };
  if (b.bane > 0) return { diesOn: 2, why: "silver and other damage together (Companion p.38)" };
  return { diesOn: 1, why: "Deadly damage (Companion p.38)" };
}

/** A death check merged with a newer one: the worse odds, the newer reason. */
export const mergeDeath = (prev, next) => !prev ? next
  : { ...prev, diesOn: Math.max(prev.diesOn, next.diesOn), why: next.diesOn > prev.diesOn ? next.why : prev.why };

/** Damage of Body + 10 boxes or more kills a shapeshifter character in any form (Companion p.38). */
export const killedOutright = (total, body) => total >= body + 10;

/** Does a 1D6 roll kill? */
export const deathRollKills = (roll, diesOn) => Number(roll) <= Number(diesOn);

/** Shapeshifter state lives under the OWNING actor's key (unlinked tokens never read their base's). */
export const shiftKey = (uuid) => claimId(`shift:${uuid}`);

/** Normalized per-actor state. */
export const normalizeShift = (st) => ({ carry: 0, death: null, survived: false, ...(st ?? {}),
  b: { ...emptyBuckets(), ...(st?.b ?? {}) }, high: { ...(st?.high ?? {}) } });

/** Silver (bane) on a hit (Companion p.38; core p.229): Power +2, Damage Level +1 (max D). */
export function baneHit(power, level) {
  const stages = ["L", "M", "S", "D"];
  const i = stages.indexOf(level);
  return { power: power + 2, level: stages[Math.min(3, Math.max(0, i) + 1)] };
}

/** Schema choices for a species field (blank = not a shapeshifter). */
export const SPECIES_CHOICES = { "": "SR2E.Shapeshift.SpeciesNone",
  ...Object.fromEntries(SPECIES_KEYS.map(k => [k, `SR2E.Shapeshift.Species.${k}`])) };

/** Is this actor (by type and system data) a shapeshifter? Character: race + species; NPC: the flag. */
export const shapeshifterOf = (type, sys) => type === "character"
  ? sys?.race === "shapeshifter" && !!sys?.shapeshifter?.species
  : type === "npc" && !!sys?.shapeshifter?.enabled;
/** A shapeshifter CHARACTER in animal form (the Companion's animal-form limits apply). */
export const inAnimalForm = (type, sys) => type === "character" && shapeshifterOf(type, sys) && sys.shapeshifter.form === "animal";
/** The form modifiers in effect for a character (none unless a shapeshifter). */
export const characterForm = (sys) => shapeshifterOf("character", sys)
  ? formModifiers(sys.shapeshifter.species, sys.shapeshifter.form) : formModifiers("", "");
/** Physical adept powers are usable only in human form (Companion p.36). Takes a character's system data. */
export const adeptPowersWork = (sys) => !inAnimalForm("character", sys);
/** Dermal dice for an actor's system data (troll; a shapeshifter character's bear animal form). */
export const dermalDiceOf = (type, sys) => dermalDice({ race: sys?.race,
  species: type === "character" ? sys?.shapeshifter?.species : "", form: sys?.shapeshifter?.form });
/** An NPC's active form record, or null ("" or an unknown key = the printed block). */
export const activeFormOf = (sys) => (sys?.activeForm && (sys.forms ?? []).find(f => f.key === sys.activeForm)) || null;
/** Only natural (form-tagged) weapons now: a character in animal form, or an NPC shapeshifter in an alternate form. */
export const formWeaponsOnly = (type, sys) => inAnimalForm(type, sys)
  || (type === "npc" && shapeshifterOf(type, sys) && !!activeFormOf(sys));
/**
 * Can this actor use this weapon in its current form? A shapeshifter character in animal form only its
 * natural (`animal`) weapons — its gear didn't shift (Companion p.36); in human form not those. An NPC:
 * tagged weapons in their form only; untagged ones in every form, except an NPC shapeshifter's, which stay
 * with the printed (human) form (core p.234: animal-form attacks are (A + 1)(A)).
 */
export function weaponUsable(type, sys, weaponSys) {
  const tag = weaponSys?.form ?? "";
  if (type === "character" && shapeshifterOf(type, sys)) return sys.shapeshifter.form === "animal" ? tag === "animal" : tag !== "animal";
  if (type === "npc" && tag) return tag === (activeFormOf(sys)?.key ?? "");
  return !formWeaponsOnly(type, sys);
}
/** Dual-natured: an NPC marked so, or any shapeshifter (Companion p.37 — it can't shut its astral presence off). */
export const isDualNaturedSys = (type, sys) => (type === "npc" && !!sys?.dualNatured) || shapeshifterOf(type, sys);
/**
 * A projecting shapeshifter's astral attributes are its PHYSICAL ones (Companion p.37): astral Strength =
 * Strength (damage, a magician's Charisma slot), astral Body = Body (resistance, the Willpower slot), astral
 * Quickness = Quickness. Null for everyone else.
 */
export const shapeshifterAstral = (type, sys) => type === "character" && shapeshifterOf(type, sys)
  ? { strength: sys.strength?.value ?? 0, body: sys.body?.value ?? 0, quickness: sys.quickness?.value ?? 0 } : null;
