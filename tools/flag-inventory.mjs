// First-pass inventory of every `flags.sr2e.<name>` the system uses (docs/PLAN-portable.md §3): which document kinds
// it's read/written on, and whether its code lines mention uuids, ids, world time, server time or chat messages.
// Heuristic: it feeds the hand-reviewed registry, it is not the registry. `node tools/flag-inventory.mjs > out.tsv`
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PAT = /(?:flags\.sr2e\.|getFlag\("sr2e", "|setFlag\("sr2e", "|unsetFlag\("sr2e", ")([A-Za-z0-9_]+)/g;
const KIND = [
  [/\b(msg|message|messages|card|chatMessage|out|resolvedMsg)\b/, "message"], [/\b(combat|c\.combat)\b/, "combat"],
  [/\b(scene|region|behavior|wall)\b/, "scene"], [/\b(token|tok|td)\b/, "token"], [/\buser\b/, "user"],
  [/\b(item|weapon|deck|port|soft|implant|ware|spell|focus|program)\b/, "item"], [/\b(effect|marker|ae)\b/, "effect"],
  [/\b(actor|vehicle|character|target|rigger|spirit|owner|payer|caster|decker|attacker|defender|jammer|observer|a|v)\b/, "actor"]
];
const HINT = [[/uuid|Uuid/, "uuid"], [/worldTime|\bwt\b|dueAt/, "worldTime"], [/serverTime|Date\.now/, "serverTime"],
  [/messageId|msg\.id|message\.id|card\.id/, "messageRef"], [/itemId|\.id\b/, "id"]];

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "quench") walk(p); } else if (p.endsWith(".mjs")) files.push(p); } })("module");
const inv = new Map();
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, n) => {
    for (const m of line.matchAll(PAT)) {
      const e = inv.get(m[1]) ?? { files: new Set(), kinds: new Set(), hints: new Set() };
      e.files.add(`${f.replace("module/", "")}:${n + 1}`);
      const before = line.slice(0, m.index);
      for (const [re, k] of KIND) if (re.test(before.slice(-60))) { e.kinds.add(k); break; }
      for (const [re, h] of HINT) if (re.test(line)) e.hints.add(h);
      inv.set(m[1], e);
    }
  });
}
console.log("flag\tkinds\thints\tuses");
for (const [k, e] of [...inv].sort()) console.log(`${k}\t${[...e.kinds].join(",") || "?"}\t${[...e.hints].join(",")}\t${[...e.files].slice(0, 4).join(" ")}${e.files.size > 4 ? ` +${e.files.size - 4}` : ""}`);
