/**
 * Shadowtalk banter — the sourcebook margin chatter (">>>>>[…]<<<<<") reacting
 * to rolls and characters. Two surfaces:
 *   • chat cards: an occasional footer line reacting to the roll outcome
 *   • character sheet header: a line commenting on the character
 *
 * Deterministic by design: the rng is seeded from the message id (chat) or
 * actor id + day (sheet), so re-renders never reshuffle a line that players
 * already read. Pure helpers are exported for unit tests; Foundry hook
 * registration is guarded so the file imports cleanly in plain Node.
 */

/* ── seeded rng ──────────────────────────────────────────────────────────── */

/** Tiny string hash → 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < (str ?? "").length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — deterministic rng from a seed. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── content ─────────────────────────────────────────────────────────────── */

/**
 * Banter lines. `tags` are event tags (glitch/crit/fail/success) or character
 * tags from actorTags(). A line fires when ANY of its tags match.
 * Voices are SR2-era Shadowland handles.
 */
export const BANTER = [
  // Critical glitch (all ones)
  { tags: ["glitch"], text: "I have seen corpses roll better.", by: "Hatchetman" },
  { tags: ["glitch"], text: "Frag it, who taught this chummer to shoot — a tortoise?", by: "Street Doc on Call" },
  { tags: ["glitch"], text: "Archive that one under 'how to get geeked'.", by: "Captain Chaos" },
  { tags: ["glitch"], text: "That, kids, is why we pre-pay the DocWagon contract.", by: "FastJack" },
  // Big success (5+)
  { tags: ["crit"], text: "Smooth. Almost pro. Almost.", by: "FastJack" },
  { tags: ["crit"], text: "Okay, I'll admit it — that was slick.", by: "The Smiling Bandit" },
  { tags: ["crit"], text: "Somebody's been eating their soy-flakes.", by: "Hatchetman" },
  { tags: ["crit"], text: "Save the trid, I'm selling copies.", by: "Captain Chaos" },
  // Flat failure (0 successes)
  { tags: ["fail"], text: "You want a rating on that? No. No rating.", by: "The Chromed Accountant" },
  { tags: ["fail"], text: "Wake me when something happens.", by: "Hatchetman" },
  { tags: ["fail"], text: "The Matrix has ice colder than that move, and I've kissed it.", by: "Netcat's Uncle" },
  // Ordinary success — rare filler
  { tags: ["success"], text: "Textbook. Boring, but textbook.", by: "FastJack" },
  { tags: ["success"], text: "It ain't stylish, but the meter's running.", by: "The Smiling Bandit" },
  // Character flavor — sheet header
  { tags: ["troll"], text: "Doorways fear this one.", by: "FastJack" },
  { tags: ["elf"], text: "Yes, yes, the ears. Get over it, chummer.", by: "Hatchetman" },
  { tags: ["dwarf"], text: "Short. Angry. Usually right about the wiring.", by: "Captain Chaos" },
  { tags: ["ork"], text: "Tusks and trust issues. My kind of runner.", by: "The Smiling Bandit" },
  { tags: ["chromed"], text: "More warranty cards than childhood memories.", by: "Street Doc on Call" },
  { tags: ["lowEssence"], text: "There's more soul in a vending machine. Barely.", by: "Street Doc on Call" },
  { tags: ["mage"], text: "Keep the mojo-slinger breathing — they're the exit plan.", by: "FastJack" },
  { tags: ["adept"], text: "No chrome, no spells you can see. Watch the hands.", by: "Hatchetman" },
  { tags: ["decker"], text: "Sleeps with the deck. Probably named it.", by: "Captain Chaos" },
  { tags: ["rigger"], text: "Loves the van more than the team. The van earned it.", by: "The Smiling Bandit" },
  { tags: ["broke"], text: "Current net worth: one soykaf, black.", by: "The Chromed Accountant" },
  { tags: ["rich"], text: "Nuyen like that buys silence. Or a very loud funeral.", by: "The Chromed Accountant" },
  { tags: ["runner"], text: "Just another shadow with a SIN-shaped hole in it.", by: "FastJack" },
  { tags: ["runner"], text: "Trust everyone. Count your bullets anyway.", by: "Hatchetman" },
];

/* ── pure logic ──────────────────────────────────────────────────────────── */

/** Whether a banter line should appear at all, by frequency setting. */
export function shouldBanter(frequency, rng) {
  if (frequency === "chatty") return rng() < 0.6;
  if (frequency === "rare") return rng() < 0.2;
  return false; // "off" or unknown
}

/** Pick a line whose tags intersect the given tags. Deterministic per rng. */
export function pickBanter(tags, rng) {
  const pool = BANTER.filter(l => l.tags.some(t => tags.includes(t)));
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Character tags from a plain actor snapshot (no Foundry deps).
 * @param {{race?:string, magicType?:string, essence?:number, cyberCount?:number,
 *          nuyen?:number, mpcp?:number, vcr?:number}} a
 */
export function actorTags(a = {}) {
  const tags = ["runner"];
  if (["troll", "elf", "dwarf", "ork"].includes(a.race)) tags.push(a.race);
  if ((a.cyberCount ?? 0) >= 4) tags.push("chromed");
  if (a.essence != null && a.essence <= 2) tags.push("lowEssence");
  if (a.magicType === "full_magician" || a.magicType === "shamanic_adept" || a.magicType === "magical_adept") tags.push("mage");
  if (a.magicType === "physical_adept") tags.push("adept");
  if ((a.mpcp ?? 0) > 0) tags.push("decker");
  if ((a.vcr ?? 0) > 0) tags.push("rigger");
  if ((a.nuyen ?? 0) < 100) tags.push("broke");
  if ((a.nuyen ?? 0) >= 100000) tags.push("rich");
  return tags;
}

/** Event tag from a success-test card state (flags.sr2e.test). */
export function testEventTag(test) {
  if (!test?.dice) return null;
  if (test.criticalGlitch && !test.glitchAvoided) return "glitch";
  const successes = test.dice.filter(d => d.success).length + (test.boughtSuccesses ?? 0);
  if (successes >= 5) return "crit";
  if (successes === 0) return "fail";
  return "success";
}

/** Format a line in sourcebook shadowtalk style (plain text; caller escapes). */
export function formatShadowtalk(line) {
  return `>>>>>[${line.text}]<<<<<\n— ${line.by}`;
}

/* ── Foundry wiring (no-op outside Foundry) ──────────────────────────────── */

globalThis.Hooks?.once("init", () => {
  game.settings.register("sr2e", "banterFrequency", {
    name: "Shadowtalk banter",
    hint: "Occasional Shadowland commentary on roll results, sourcebook-style. Also shows a flavor line on character sheets. Rare ≈ 1 in 5 rolls; Chatty ≈ 3 in 5.",
    scope: "world",
    config: true,
    type: String,
    choices: { off: "Off", rare: "Rare", chatty: "Chatty" },
    default: "rare"
  });
});

globalThis.Hooks?.on("renderChatMessageHTML", (message, html) => {
  if (!(html instanceof HTMLElement)) return;
  if (html.querySelector(".sr2e-shadowtalk")) return; // already injected
  const test = message.flags?.sr2e?.test;
  const tag = testEventTag(test);
  if (!tag) return;

  let freq = "off";
  try { freq = game.settings.get("sr2e", "banterFrequency"); } catch (e) { return; }
  // Seed from the message id: the same card always shows (or omits) the same
  // line, even across the Karma-button re-renders. Glitches are too good to
  // skip — they always talk (unless banter is off).
  const rng = seededRng(hashSeed(message.id));
  if (freq === "off") return;
  if (tag !== "glitch" && !shouldBanter(freq, rng)) return;

  const line = pickBanter([tag], rng);
  if (!line) return;
  const div = document.createElement("div");
  div.className = "sr2e-shadowtalk";
  const text = document.createElement("span");
  text.textContent = `>>>>>[${line.text}]<<<<<`;
  const by = document.createElement("span");
  by.className = "sr2e-shadowtalk-by";
  by.textContent = `— ${line.by}`;
  div.append(text, by);
  (html.querySelector(".message-content") ?? html).appendChild(div);
});

/**
 * A header line for the character sheet: seeded by actor id + day, so it
 * rotates daily instead of flickering on every sheet re-render.
 * @param {Actor} actor
 * @returns {{text:string, by:string}|null}
 */
export function headerBanter(actor) {
  let freq = "rare";
  try { freq = game.settings.get("sr2e", "banterFrequency"); } catch (e) { /* default */ }
  if (freq === "off") return null;
  const sys = actor?.system ?? {};
  const tags = actorTags({
    race: sys.race,
    magicType: sys.magic?.type,
    essence: sys.essence?.value,
    cyberCount: actor?.items?.filter?.(i => i.type === "cyberware" && i.system.installed)?.length ?? 0,
    nuyen: sys.nuyen,
    mpcp: sys.cyberdeck?.mpcp,
    vcr: sys.vehicleControlRig
  });
  const day = Math.floor(Date.now() / 86400000);
  return pickBanter(tags, seededRng(hashSeed(`${actor?.id}:${day}`)));
}
