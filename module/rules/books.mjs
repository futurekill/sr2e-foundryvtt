/**
 * The book table (chargen M1b, docs/PLAN-citations.md §2): every book the system or a content module cites. Ids are
 * short and stable (they live in item data as `system.citation.book`). Shared by Foundry and the character generator.
 * `offsets` (PDF ↔ book page segments) are reserved for a later "open my PDF at this page"; never used to cite.
 */
export const BOOKS = Object.freeze({
  sr2: { abbr: "SR2", title: "Shadowrun, Second Edition", code: "FASA 7901", module: "sr2e" },
  ssc: { abbr: "SSC", title: "Street Samurai Catalog", code: "FASA 7104", module: "sr2e-street-samurai-catalog" },
  sc: { abbr: "SRComp", title: "Shadowrun Companion: Beyond the Shadows", code: "FASA 7905", module: "sr2e-shadowrun-companion" },
  grim: { abbr: "Grimoire", title: "The Grimoire (2nd Edition)", code: "FASA 7903", module: "sr2e-grimoire" },
  r2: { abbr: "R2", title: "Rigger 2", code: "FASA 7906", module: "sr2e-rigger-2" },
  rbb: { abbr: "RBB", title: "Rigger Black Book", code: "FASA 7108", module: "sr2e-rigger-black-book" },
  st: { abbr: "Shadowtech", title: "Shadowtech", code: "FASA 7110", module: "sr2e-shadowtech" },
  ct: { abbr: "Cybertech", title: "Cybertechnology", code: "FASA 7119", module: "sr2e-cybertechnology" },
  ff: { abbr: "FoF", title: "Fields of Fire", code: "FASA 7114", module: "sr2e-fields-of-fire" },
  csh: { abbr: "CSH", title: "Corporate Security Handbook", code: "FASA 7118", module: "sr2e-corporate-security" },
  cp: { abbr: "Cyberpirates", title: "Cyberpirates!", code: "FASA 7124", module: "sr2e-cyberpirates" },
  naw: { abbr: "NAGRL", title: "The Neo-Anarchists' Guide to Real Life", code: "FASA 7208", module: "sr2e-neo-anarchists" },
  vr2: { abbr: "VR2", title: "Virtual Realities 2.0", code: "FASA 7904", module: "sr2e" },
  pae: { abbr: "PAoE", title: "Paranormal Animals of Europe", code: "FASA 7112", module: "sr2e-paranormal-animals" },
  de: { abbr: "Double Exposure", title: "Double Exposure", code: "FASA 7319", module: "sr2e-double-exposure" },
  mis: { abbr: "Missions", title: "Missions", code: "FASA 7325", module: "sr2e-missions" },
  qe: { abbr: "Queen Euphoria", title: "Queen Euphoria", code: "FASA 7304", module: "sr2e-queen-euphoria" }
});
/** Not printed in any book (an explicit, reasoned exception; never blank). */
export const NO_BOOK = "none";

/** The free-text forms item notes use → book ids (the backfill parser; docs/PLAN-citations.md §3). Order matters. */
export const BOOK_ALIASES = Object.freeze([
  [/\b(SR2E|SR2|SRII|Shadowrun,? Second Edition|core (?:book|rules|rulebook)|basic rules)\b/i, "sr2"],
  [/\b(SSC|Street Samurai Catalog)\b/i, "ssc"],
  [/\b(SRComp|SR Companion|Shadowrun Companion)\b/i, "sc"],
  [/\bGrimoire(?: II)?\b/i, "grim"],
  [/\b(R2|Rigger 2)\b/, "r2"], [/\b(RBB|Rigger Black Book)\b/i, "rbb"],
  [/\bShadowtech\b/i, "st"], [/\bCybertechnology\b/i, "ct"], [/\b(FoF|Fields of Fire)\b/i, "ff"],
  [/\b(CSH|Corporate Security Handbook)\b/i, "csh"], [/\bCyberpirates\b/i, "cp"],
  [/\b(NAGRL|Neo-Anarchists'? Guide)\b/i, "naw"], [/\b(VR2(?:\.0)?|Virtual Realities)\b/i, "vr2"],
  [/\bParanormal Animals of Europe\b/i, "pae"]
]);
/** The book id a phrase names, or null. */
export function bookOf(text) {
  for (const [re, id] of BOOK_ALIASES) if (re.test(String(text ?? ""))) return id;
  return null;
}

/** A page is "59" or "59–60" (en dash), nothing else. */
export const isValidPage = (page) => /^\d+(?:–\d+)?$/.test(String(page ?? ""));
/** Normalize a page: strips "p."/"pp.", turns a hyphen range into an en dash. */
export const normalizePage = (page) => String(page ?? "").replace(/^\s*pp?\.\s*/i, "").replace(/\s*[-–]\s*/, "–").trim();

/** The badge text: "SSC p.59", "R2 pp.81–83"; "" when blank; "—" for the explicit no-book exception. */
export function citationLabel(c) {
  if (!c?.book) return "";
  if (c.book === NO_BOOK) return "—";
  const b = BOOKS[c.book];
  const abbr = b?.abbr ?? c.book;
  if (!c.page) return abbr;
  return `${abbr} ${String(c.page).includes("–") ? "pp." : "p."}${c.page}`;
}
/** The hover title: the full book title and code. */
export function citationTitle(c) {
  if (!c?.book) return "";
  if (c.book === NO_BOOK) return "Not printed in a sourcebook";
  const b = BOOKS[c.book];
  return b ? `${b.title} (${b.code})${c.page ? `, page ${c.page}` : ""}` : c.book;
}
