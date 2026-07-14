// Build the Shadowrun Sixth World calendar for the Calendaria module by
// transforming Calendaria's own gregorian.json base (real Gregorian leap rules
// + yearZero 1970, so 2050s weekdays compute authentically). We swap the i18n
// keys for literal strings (self-contained, no lang file needed) and replace
// the festival set with player-safe Sixth World anniversaries (sourced from the
// SR2 core rulebook) plus the real-world holidays that persist in 2055.
// Base fetched once from github.com/Sayshal/calendaria/calendars/gregorian.json.
import { readFileSync, writeFileSync } from "node:fs";

const base = JSON.parse(readFileSync("/tmp/cal-gregorian.json", "utf8"));

// --- literal names (drop CALENDARIA.* i18n keys so the file is portable) ---
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
Object.values(base.months.values).forEach((m,i)=>{ m.name=MONTHS[i]; m.abbreviation=MONTHS[i].slice(0,3); });
Object.values(base.days.values).forEach((d,i)=>{ d.name=WDAYS[i]; d.abbreviation=WDAYS[i].slice(0,3); });
const SEA={spring0000000000:"Spring",summer0000000000:"Summer",autumn0000000000:"Autumn",winter0000000000:"Winter"};
for(const [k,v] of Object.entries(base.seasons.values)) v.name=SEA[k]||v.name;
base.eras.commonera0000000.name="Common Era"; base.eras.commonera0000000.abbreviation="CE";
base.moons.luna000000000000.name="Luna";
Object.values(base.moons.luna000000000000.phases).forEach(p=>{ p.name=p.name.split(".").pop().replace(/([A-Z])/g," $1").trim(); });

base.id = "sr2e-sixth-world";
base.name = "Shadowrun: Sixth World";
base.metadata = {
  id: "sr2e-sixth-world",
  description: "The Sixth World calendar for Shadowrun, Second Edition — the standard Gregorian year with the Awakened world's anniversaries. Set your world date to 2055 or later. Ships with the sr2e system.",
  author: "sr2e",
  system: "Shadowrun, Second Edition",
  luxonSync: { theme: "CE" }
};

// --- festivals -----------------------------------------------------------
// pad/slug a 16-char key like the base file uses
const key = (s) => (s.toLowerCase().replace(/[^a-z0-9]/g,"") + "0".repeat(16)).slice(0,16);
const fest = (name, month, day, icon, color, description) => ({
  [key(name)]: {
    name, month: month-1, dayOfMonth: day-1, icon, color, description,
    duration: 1, countsForWeekday: true, leapYearOnly: false,
    conditionTree: { type:"group", mode:"and", children:[
      { type:"condition", field:"month", op:"==", value: month },
      { type:"condition", field:"day",   op:"==", value: day } ] },
    allDay: true, displayStyle:"banner", visibility:"visible",
    silent: true, hasDuration: false, reminderType:"none", reminderOffset: 0
  }
});

const festivals = Object.assign({},
  // ---- Sixth World anniversaries (SR2 core rulebook, public history) ----
  fest("The Awakening", 12, 24, "fa-dragon", "#7b2ff7",
    "The day magic returned to the world. On 24 December 2011, near Mount Fuji, humanity recorded the first Great Dragon, Ryumyo — the signpost of the Sixth World's dawn. The Awakened mark the anniversary, and mana runs strong on the longest nights."),
  fest("Goblinization Day", 4, 30, "fa-hand-fist", "#a0522d",
    "Anniversary of 30 April 2021, when Unexplained Genetic Expression peaked and countless people changed into orks and trolls overnight. For metahumanity a day of pride and remembrance; for the fearful, a night to lock the doors."),
  fest("Crash Day", 2, 8, "fa-triangle-exclamation", "#c0202a",
    "On 8 February 2029 a self-replicating virus crashed computer systems across the planet, erasing data and lives and clearing the ground for the Matrix. Deckers and data-havens still pour one out for the Crash of '29."),
  // ---- real-world holidays that persist in 2055 ----
  fest("New Year's Day", 1, 1, "fa-champagne-glasses", "#FFD700",
    "The first day of the year, seen in worldwide — fireworks over the sprawl, corp galas, and street parties in the barrens alike."),
  fest("Valentine's Day", 2, 14, "fa-heart", "#E91E63",
    "A day of romance and commerce, hawked hard by every megacorp with something to sell."),
  fest("St. Patrick's Day", 3, 17, "fa-clover", "#4CAF50",
    "Irish culture celebrated with parades and green — and, since the Awakening, a nod to the Emerald Isle's own returned magic."),
  fest("Vernal Equinox", 3, 20, "fa-scale-balanced", "#90ee90",
    "Day and night in balance. Shamans and mages watch the turning mana tides; a potent day for magic and ritual."),
  fest("Earth Day", 4, 22, "fa-earth-americas", "#2e8b57",
    "A worldwide day for the planet — carrying real weight in a Sixth World of eco-shamans, awakened wilds, and green policlubs."),
  fest("May Day", 5, 1, "fa-people-group", "#d32f2f",
    "International workers' day — and a rallying point for the sprawl's unions, policlubs, and neo-anarchists."),
  fest("Summer Solstice", 6, 21, "fa-sun", "#ffd700",
    "The longest day. A high holy day for many magical traditions, when solar mana peaks."),
  fest("Autumnal Equinox", 9, 22, "fa-leaf", "#d2691e",
    "Day and night in balance once more; the year turns toward the dark, and the mana tides with it."),
  fest("Halloween", 10, 31, "fa-ghost", "#ff7518",
    "All Hallows' Eve — never taken lightly in a world where the dead, the astral, and worse are demonstrably real. The veil feels thin, and the Awakened stay wary."),
  fest("Day of the Dead", 11, 1, "fa-skull", "#c2185b",
    "Día de los Muertos, observed across Aztlan and the sprawls to honor the departed — a living tradition given new meaning in the Sixth World."),
  fest("Winter Solstice", 12, 21, "fa-snowflake", "#87ceeb",
    "The longest night. Mana runs high; many magicians time their most important workings to it."),
  fest("Christmas Day", 12, 25, "fa-tree", "#2e7d32",
    "Still kept the world over, sacred and commercial at once, from cathedral to corp arcology."),
  fest("New Year's Eve", 12, 31, "fa-champagne-glasses", "#FFD700",
    "The old year burns out in fireworks, gunfire, and neon — the sprawl at its loudest.")
);
base.festivals = festivals;
// no weekly-note clutter, no moon reference-date churn — leave base as-is otherwise

writeFileSync("calendars/sr2e-sixth-world.json", JSON.stringify(base, null, 2) + "\n");
const dated = Object.keys(festivals).length;
console.log(`wrote calendars/sr2e-sixth-world.json — ${dated} festivals (3 Sixth World + ${dated-3} persisting real-world)`);

// ponytail: one runnable check — festival month/dayOfMonth (0-idx) must agree
// with its conditionTree (1-idx), or Calendaria places the marker on the wrong day.
for (const [k,f] of Object.entries(festivals)) {
  const cm = f.conditionTree.children.find(c=>c.field==="month").value;
  const cd = f.conditionTree.children.find(c=>c.field==="day").value;
  if (f.month !== cm-1 || f.dayOfMonth !== cd-1)
    throw new Error(`festival ${k}: index mismatch month ${f.month}/${cm} day ${f.dayOfMonth}/${cd}`);
}
console.log("OK: all festival indices consistent (0-idx fields match 1-idx conditionTree)");
