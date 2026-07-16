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

  // ══ Expansion pack — more Shadowland chatter ═══════════════════════════════
  // ── Critical glitch ───────────────────────────────────────────────────────
  { tags: ["glitch"], text: "That's not a fumble, that's a cry for help.", by: "Dodger" },
  { tags: ["glitch"], text: "The dice betrayed you and honestly? Fair.", by: "Wordsmith" },
  { tags: ["glitch"], text: "{name}, the only thing you hit was rock bottom.", by: "The Smiling Bandit" },
  { tags: ["glitch"], text: "Mark the log: comedy, not action.", by: "FastJack" },
  { tags: ["glitch"], text: "A trained monkey. We should've hired a trained monkey.", by: "Hatchetman" },
  { tags: ["glitch"], text: "Whatever the plan was, it just filed for divorce.", by: "Wordsmith" },
  { tags: ["glitch"], text: "Somewhere, Lofwyr felt that and smiled.", by: "Dodger" },
  { tags: ["glitch"], text: "{name} found the one wrong way to do it. Impressive.", by: "Captain Chaos" },
  { tags: ["glitch"], text: "Cameras, witnesses, AND that roll. Rough day.", by: "Netcat's Uncle" },
  // ── Big success ───────────────────────────────────────────────────────────
  { tags: ["crit"], text: "Poetry. Violent, expensive poetry.", by: "Wordsmith" },
  { tags: ["crit"], text: "That's getting stitched onto a jacket, chummer.", by: "The Smiling Bandit" },
  { tags: ["crit"], text: "{name} just wrote the after-action report in ink.", by: "Captain Chaos" },
  { tags: ["crit"], text: "Better than the sim-flick. And the sim-flick was good.", by: "Dodger" },
  { tags: ["crit"], text: "Hoi — save some competence for the rest of us.", by: "Netcat's Uncle" },
  { tags: ["crit"], text: "The Johnson's gonna lowball the next job after THAT.", by: "The Chromed Accountant" },
  { tags: ["crit"], text: "Frame it, gild it, hang it in the Big Rhino.", by: "Hatchetman" },
  // ── Flat failure ──────────────────────────────────────────────────────────
  { tags: ["fail"], text: "And the crowd goes mild.", by: "Captain Chaos" },
  { tags: ["fail"], text: "That did precisely bupkis, chummer.", by: "Hatchetman" },
  { tags: ["fail"], text: "{name} swung for the fences, hit the parking lot.", by: "The Smiling Bandit" },
  { tags: ["fail"], text: "The dice abstained. Politically.", by: "Wordsmith" },
  { tags: ["fail"], text: "Keep the receipt, that roll's getting returned.", by: "The Chromed Accountant" },
  { tags: ["fail"], text: "Not wrong, not right, just... nowhere.", by: "Dodger" },
  // ── Ordinary success ──────────────────────────────────────────────────────
  { tags: ["success"], text: "Ugly, functional, paid. The runner's trinity.", by: "FastJack" },
  { tags: ["success"], text: "It counts. Barely counts, but counts.", by: "Dodger" },
  { tags: ["success"], text: "{name} gets there. Style points pending.", by: "Captain Chaos" },
  { tags: ["success"], text: "No flair, no fuss, no funeral. I'll take it.", by: "Street Doc on Call" },
  { tags: ["success"], text: "Money in the meter. Keep moving.", by: "The Smiling Bandit" },
  // ── Metatype ──────────────────────────────────────────────────────────────
  { tags: ["troll"], text: "{name} opens doors. Through the wall, usually.", by: "Captain Chaos" },
  { tags: ["troll"], text: "Ceilings are more of a suggestion to this one.", by: "Dodger" },
  { tags: ["troll"], text: "Dermal plate and a smile. Mostly plate.", by: "Street Doc on Call" },
  { tags: ["elf"], text: "{name} was doing this before your grandsire had a SIN.", by: "Wordsmith" },
  { tags: ["elf"], text: "Grace on legs. Annoying, immortal legs.", by: "Captain Chaos" },
  { tags: ["elf"], text: "Elegant, deadly, and won't shut up about the Tir.", by: "Hatchetman" },
  { tags: ["dwarf"], text: "{name} reads a circuit like a bedtime story.", by: "Netcat's Uncle" },
  { tags: ["dwarf"], text: "Low center of gravity, high center of grudge.", by: "The Smiling Bandit" },
  { tags: ["ork"], text: "{name} burns bright 'cause the fuse is short.", by: "Street Doc on Call" },
  { tags: ["ork"], text: "All muscle, all business, zero patience.", by: "Hatchetman" },
  // ── Cyberware / essence ───────────────────────────────────────────────────
  { tags: ["chromed"], text: "{name} rustles when they walk. That's the alloy.", by: "Street Doc on Call" },
  { tags: ["chromed"], text: "The wallet's meat. Everything else is invoice.", by: "The Chromed Accountant" },
  { tags: ["chromed"], text: "MRI techs weep when {name} books an appointment.", by: "Netcat's Uncle" },
  { tags: ["lowEssence"], text: "The mages won't stand downwind of that aura.", by: "FastJack" },
  { tags: ["lowEssence"], text: "{name} traded the soul for the upgrade. Buyer's market.", by: "Street Doc on Call" },
  // ── Archetype ─────────────────────────────────────────────────────────────
  { tags: ["mage"], text: "{name} argues with physics and physics folds.", by: "Dodger" },
  { tags: ["mage"], text: "Keep 'em fed, rested, and off the drain line.", by: "Street Doc on Call" },
  { tags: ["mage"], text: "The wiz makes the impossible a Tuesday.", by: "Captain Chaos" },
  { tags: ["adept"], text: "No spell, no chrome, still puts you through a wall.", by: "Hatchetman" },
  { tags: ["adept"], text: "{name}'s the ghost story the street sams tell.", by: "The Smiling Bandit" },
  { tags: ["decker"], text: "{name} left the meat at the door and the ICE crying.", by: "Netcat's Uncle" },
  { tags: ["decker"], text: "Sees the world in glowing green. Lucky them.", by: "FastJack" },
  { tags: ["decker"], text: "One jump ahead of the trace, same as always.", by: "Dodger" },
  { tags: ["rigger"], text: "{name} thinks in wheels and rotors now.", by: "Captain Chaos" },
  { tags: ["rigger"], text: "The drones love {name}. The drones love no one.", by: "The Smiling Bandit" },
  // ── Wealth ────────────────────────────────────────────────────────────────
  { tags: ["broke"], text: "{name} counts nuyen in single digits. Bold.", by: "The Chromed Accountant" },
  { tags: ["broke"], text: "Ramen tonight. Ramen every night.", by: "Hatchetman" },
  { tags: ["rich"], text: "{name} tips in certified credsticks. Show-off.", by: "Captain Chaos" },
  { tags: ["rich"], text: "New money, old enemies. Balance the books, {name}.", by: "The Chromed Accountant" },
  // ── Generic runner ────────────────────────────────────────────────────────
  { tags: ["runner"], text: "No SIN, no past, no problem. That's the job.", by: "FastJack" },
  { tags: ["runner"], text: "{name} runs the shadows so they don't run {name}.", by: "Dodger" },
  { tags: ["runner"], text: "Deniable, disposable, and still breathing. Respect.", by: "Hatchetman" },
  { tags: ["runner"], text: "Everybody's expendable. {name} just hasn't been spent.", by: "Wordsmith" },
  { tags: ["runner"], text: "The sprawl remembers a name like {name}. Keep it quiet.", by: "Captain Chaos" },
  { tags: ["runner"], text: "Trust the team, watch the Johnson, love no one.", by: "The Smiling Bandit" },
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


/* ── Foundry wiring (no-op outside Foundry) ──────────────────────────────────
 * These hooks register on import, not from an explicit call — so the chat-card
 * banter is live only because actor-sheet.mjs imports headerBanter from here.
 * Keep that import even if the header line ever goes away, or this dies silently.
 */

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

/** Header rotation window (ms). Short enough that the line feels alive between
 *  visits, long enough that the rapid re-renders while editing a sheet (which
 *  fire seconds apart) keep showing the same line instead of flickering. */
export const HEADER_BANTER_WINDOW_MS = 8 * 60 * 1000; // 8 minutes

/**
 * A header line for the character sheet, reacting to the character. Seeded by
 * actor id + a short time window (see above), so it rotates through the pool as
 * play goes on rather than sitting on one line all day — but stays put across
 * the sub-second re-renders that happen while a sheet is open and being edited.
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
  const window = Math.floor(Date.now() / HEADER_BANTER_WINDOW_MS);
  const line = pickBanter(tags, seededRng(hashSeed(`${actor?.id}:${window}`)));
  return line ? { text: applyName(line.text, actor?.name), by: line.by } : null;
}
