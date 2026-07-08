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
  // ── Critical glitch (all ones) ──────────────────────────────────────────
  { tags: ["glitch"], text: "I have seen corpses roll better.", by: "Hatchetman" },
  { tags: ["glitch"], text: "Frag it, who taught this chummer to shoot — a tortoise?", by: "Street Doc on Call" },
  { tags: ["glitch"], text: "Archive that one under 'how to get geeked'.", by: "Captain Chaos" },
  { tags: ["glitch"], text: "That, kids, is why we pre-pay the DocWagon contract.", by: "FastJack" },
  { tags: ["glitch"], text: "{name}, buddy, that was a war crime against dice.", by: "The Smiling Bandit" },
  { tags: ["glitch"], text: "Somewhere a fixer just crossed {name} off the call list.", by: "Captain Chaos" },
  { tags: ["glitch"], text: "Even the Renraku ICE is embarrassed for you.", by: "Netcat's Uncle" },
  { tags: ["glitch"], text: "I've watched go-gangers on kamikaze do this cleaner.", by: "Hatchetman" },
  { tags: ["glitch"], text: "Refund the karma, that roll never happened. For your sake.", by: "The Chromed Accountant" },
  // ── Big success (5+) ────────────────────────────────────────────────────
  { tags: ["crit"], text: "Smooth. Almost pro. Almost.", by: "FastJack" },
  { tags: ["crit"], text: "Okay, I'll admit it — that was slick.", by: "The Smiling Bandit" },
  { tags: ["crit"], text: "Somebody's been eating their soy-flakes.", by: "Hatchetman" },
  { tags: ["crit"], text: "Save the trid, I'm selling copies.", by: "Captain Chaos" },
  { tags: ["crit"], text: "{name} makes it look easy. I hate that.", by: "Netcat's Uncle" },
  { tags: ["crit"], text: "That's the {name} the Johnson thinks he hired.", by: "FastJack" },
  { tags: ["crit"], text: "Chrome, talent, or dumb luck — bank it either way.", by: "The Chromed Accountant" },
  { tags: ["crit"], text: "Clean enough to frame. Nice work, chummer.", by: "The Smiling Bandit" },
  { tags: ["crit"], text: "Now THAT'S going in the after-action brag.", by: "Captain Chaos" },
  // ── Flat failure (0 successes) ──────────────────────────────────────────
  { tags: ["fail"], text: "You want a rating on that? No. No rating.", by: "The Chromed Accountant" },
  { tags: ["fail"], text: "Wake me when something happens.", by: "Hatchetman" },
  { tags: ["fail"], text: "The Matrix has ice colder than that move, and I've kissed it.", by: "Netcat's Uncle" },
  { tags: ["fail"], text: "Nothing. A whole lotta nothing.", by: "FastJack" },
  { tags: ["fail"], text: "{name} whiffs it. Cameras got the whole thing, too.", by: "Captain Chaos" },
  { tags: ["fail"], text: "Rolled like the dice owed you money.", by: "The Smiling Bandit" },
  { tags: ["fail"], text: "That's a paddlin'. Metaphorically. Probably literally soon.", by: "Hatchetman" },
  // ── Ordinary success — rare filler ──────────────────────────────────────
  { tags: ["success"], text: "Textbook. Boring, but textbook.", by: "FastJack" },
  { tags: ["success"], text: "It ain't stylish, but the meter's running.", by: "The Smiling Bandit" },
  { tags: ["success"], text: "Gets the job done. Don't spend it all in one bar.", by: "The Chromed Accountant" },
  { tags: ["success"], text: "Good enough for drek work. Good thing this is drek work.", by: "Hatchetman" },
  { tags: ["success"], text: "{name} threads the needle. Barely, but threaded.", by: "Netcat's Uncle" },
  // ── Metatype ────────────────────────────────────────────────────────────
  { tags: ["troll"], text: "Doorways fear this one.", by: "FastJack" },
  { tags: ["troll"], text: "{name}'s idea of subtle is a smaller cannon.", by: "The Smiling Bandit" },
  { tags: ["troll"], text: "Cover? {name} IS the cover.", by: "Captain Chaos" },
  { tags: ["elf"], text: "Yes, yes, the ears. Get over it, chummer.", by: "Hatchetman" },
  { tags: ["elf"], text: "{name} will remind you of the Awakening. Twice.", by: "Captain Chaos" },
  { tags: ["elf"], text: "Pretty, pointed, and faster than you. Rude.", by: "Netcat's Uncle" },
  { tags: ["dwarf"], text: "Short. Angry. Usually right about the wiring.", by: "Captain Chaos" },
  { tags: ["dwarf"], text: "Underestimate {name} once. You only get the once.", by: "FastJack" },
  { tags: ["dwarf"], text: "Built like a safe and about as easy to crack.", by: "Street Doc on Call" },
  { tags: ["ork"], text: "Tusks and trust issues. My kind of runner.", by: "The Smiling Bandit" },
  { tags: ["ork"], text: "{name} lives fast 'cause the clock's honest about it.", by: "Street Doc on Call" },
  { tags: ["ork"], text: "Meaner than they look, and they look plenty mean.", by: "Hatchetman" },
  // ── Cyberware / essence ─────────────────────────────────────────────────
  { tags: ["chromed"], text: "More warranty cards than childhood memories.", by: "Street Doc on Call" },
  { tags: ["chromed"], text: "{name} sets off detectors two zones over.", by: "Netcat's Uncle" },
  { tags: ["chromed"], text: "Half runner, half shopping list.", by: "The Chromed Accountant" },
  { tags: ["lowEssence"], text: "There's more soul in a vending machine. Barely.", by: "Street Doc on Call" },
  { tags: ["lowEssence"], text: "{name}'s aura reads like a parking structure.", by: "FastJack" },
  { tags: ["lowEssence"], text: "One more implant and we bill the estate.", by: "The Chromed Accountant" },
  // ── Archetype ───────────────────────────────────────────────────────────
  { tags: ["mage"], text: "Keep the mojo-slinger breathing — they're the exit plan.", by: "FastJack" },
  { tags: ["mage"], text: "{name} mutters at the air and reality flinches.", by: "Captain Chaos" },
  { tags: ["mage"], text: "Great in a fight, useless at customs. Watch the drain.", by: "Street Doc on Call" },
  { tags: ["adept"], text: "No chrome, no spells you can see. Watch the hands.", by: "Hatchetman" },
  { tags: ["adept"], text: "{name} does with meat what samurai buy off a shelf.", by: "The Smiling Bandit" },
  { tags: ["adept"], text: "Punches above the weight class. Way above.", by: "Captain Chaos" },
  { tags: ["decker"], text: "Sleeps with the deck. Probably named it.", by: "Captain Chaos" },
  { tags: ["decker"], text: "{name} lives in the Matrix and visits the meat.", by: "Netcat's Uncle" },
  { tags: ["decker"], text: "One good run from a black-IC obituary. Aren't we all.", by: "FastJack" },
  { tags: ["rigger"], text: "Loves the van more than the team. The van earned it.", by: "The Smiling Bandit" },
  { tags: ["rigger"], text: "{name} jacks in and suddenly the drones have opinions.", by: "Captain Chaos" },
  { tags: ["rigger"], text: "Never in the room. Always in the fight.", by: "Hatchetman" },
  // ── Wealth ──────────────────────────────────────────────────────────────
  { tags: ["broke"], text: "Current net worth: one soykaf, black.", by: "The Chromed Accountant" },
  { tags: ["broke"], text: "{name}'s credstick bounces harder than the bullets.", by: "The Smiling Bandit" },
  { tags: ["broke"], text: "Working for ammo money again, chummer?", by: "Hatchetman" },
  { tags: ["rich"], text: "Nuyen like that buys silence. Or a very loud funeral.", by: "The Chromed Accountant" },
  { tags: ["rich"], text: "{name}'s buying the drinks. {name} is ALWAYS buying the drinks now.", by: "Captain Chaos" },
  { tags: ["rich"], text: "Corp money and shadow work. Bold retirement plan.", by: "FastJack" },
  // ── Generic runner ──────────────────────────────────────────────────────
  { tags: ["runner"], text: "Just another shadow with a SIN-shaped hole in it.", by: "FastJack" },
  { tags: ["runner"], text: "Trust everyone. Count your bullets anyway.", by: "Hatchetman" },
  { tags: ["runner"], text: "{name}. Huh. Never heard of 'em. That's the good kind.", by: "The Smiling Bandit" },
  { tags: ["runner"], text: "Another face in the sprawl, another name in my files.", by: "Captain Chaos" },
  { tags: ["runner"], text: "Alive, armed, and off the grid. Livin' the dream.", by: "Netcat's Uncle" },
  { tags: ["runner"], text: "Watch your back, {name}. The sprawl doesn't blink.", by: "FastJack" },
];

/** Substitute the {name} token with the character's name (or a generic fill). */
export function applyName(text, name) {
  return (text ?? "").replace(/\{name\}/g, name || "chummer");
}

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
  const who = message.speaker?.alias || message.actor?.name || "chummer";
  const div = document.createElement("div");
  div.className = "sr2e-shadowtalk";
  const text = document.createElement("span");
  text.textContent = `>>>>>[${applyName(line.text, who)}]<<<<<`;
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
  const line = pickBanter(tags, seededRng(hashSeed(`${actor?.id}:${day}`)));
  return line ? { text: applyName(line.text, actor?.name), by: line.by } : null;
}
