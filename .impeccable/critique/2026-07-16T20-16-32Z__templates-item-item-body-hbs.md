---
target: the item sheet (templates/item/item-body.hbs)
total_score: 22
p0_count: 2
p1_count: 2
timestamp: 2026-07-16T20-16-32Z
slug: templates-item-item-body-hbs
---
Method: dual-agent (A: design review · B: detector + browser evidence)

# Critique: templates/item/item-body.hbs — the Item sheet

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | submitOnChange commits every field silently; the nuyen charge announces only via an expiring corner toast |
| 2 | Match System / Real World | 4 | Field names are the book's verbatim; placeholders teach format; 16 tooltips cite page numbers |
| 3 | User Control and Freedom | 1 | Rating/module row delete is immediate — no confirm, no undo, on hand-transcribed data |
| 4 | Consistency and Standards | 2 | Street Index is number+live price readout on 4 types, bare text with no readout on the 2 that charge money |
| 5 | Error Prevention | 2 | Good min/max constraints; the affordability veto is real — but the sheet prevents nothing pre-click |
| 6 | Recognition Rather Than Recall | 2 | Rules knowledge lives in title= on non-focusable <label>s — mouse-hover only |
| 7 | Flexibility and Efficiency | 2 | Rating tables + Quick Pick are real accelerators, undercut by a 28-field flat column |
| 8 | Aesthetic and Minimalist Design | 2 | Every cyberware shows both "Enable Rating Table" and "Enable Modules" unconditionally; a 700-char rules paragraph mid-form |
| 9 | Error Recovery | 2 | The recovery logic is exemplary; none of it reaches the sheet |
| 10 | Help and Documentation | 3 | More inline documentation than most Foundry systems ship — marked down purely for delivery |
| **Total** | | **22/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

NOT SLOP. Every field is load-bearing; vocabulary is the source material's; tooltips carry page citations. It fails the last mile, not the thinking.

Two priors corrected by Assessment A:
- CONTRAST PASSES with headroom. Body #e0d4f0 = 13.78:1 (AAA=7:1). Muted #9d8fc2 = 6.63:1. A committed magenta-on-near-black theme costing nothing in legibility. Deliberate, not luck.
- MONOSPACE IS CORRECT. Sheet is ~80% numeric/code-shaped strings; monospace is right for tabular numerics. Real label/value split (Arial Narrow condensed chrome / Courier data) carries the hierarchy.

DETERMINISTIC SCAN: FALSE CLEAN — that is the finding. detect.mjs returned [] exit 0. Controls proved .hbs is not in SCANNABLE_EXTENSIONS (file-system.mjs:13) → file SILENTLY SKIPPED, no warning. Renamed .html → still zero: all 45 rules need CSS/inline styles; this template has none. Control page w/ Inter+gradient-text fired correctly (exit 2). Registry has ZERO a11y rules. Zero findings = not looked at, not clean.

VISUAL OVERLAYS: none. Browser reads gated on the Foundry origin (confirmed first-hand); Handlebars can't render standalone. No rendered-UI claims made.

## Overall Impression

A tool built by someone with deep domain fluency who never opened the result. .hint is written 19 times and styled zero times. Same for .stacked, .focus-price, .item-effect-row. Seven inline style= attrs are places the author hardcoded past a missing token — twice reimplementing .hint by hand with opacity:.6, BECAUSE .hint doesn't work.

Biggest opportunity: this sheet spends real money and never says so.

## What's Working

1. Progressive disclosure driven by data state, not a toggle. hasRatingTable/isContainer/gradeReducesEssence computed from the document; set a capacity and the item BECOMES cybereyes. Line 366 makes one button honest in both states.
2. A committed identity that costs nothing in legibility (see contrast).
3. Domain fluency as interface. placeholder="((F / 2) + 1)M" teaches drain grammar; line 933 puts the rule inside the option label.

## Priority Issues

[P0] Rating/Grade spend nuyen with no affordance on the sheet. submitOnChange + preUpdateItem hook = changing Grade IS a purchase, styled identically to Damage Type. Cyberware/bioware are the ONLY two types without the {{priceTag}} readout — at the moment money moves, price is off-screen. flags.sr2e.paid never rendered. Fix: render paid next to Grade; give cyberware/bioware the priceTag treatment (copy L139-141); .charges-nuyen class on financial controls. → /impeccable harden

[P0] 0 of 195 labels associated. 0 for=, 0 id=, 0 aria-*; 5 wrap implicitly → 97% unlabelled. addEffect/editEffect/deleteEffect are bare <a> with no href/tabindex/role — UNREACHABLE BY KEYBOARD. <img effect.img> has no alt. Fix: partId is already computed, unique per sheet, and unused — find-and-replace. Convert anchors to <button>. → /impeccable audit

[P1] .hint has no CSS rule. 19 uses; every matching rule scoped to another sheet. Asides render at full body weight, identical to data — incl. L482's ~700-char rules paragraph with a +4 TN penalty buried in it. Fix: generalise what .rating-stats-header .hint already does (4 lines). → /impeccable layout

[P1] Two declared item types render blank. `tradition` has ZERO branches (a void, despite system.json declaring htmlFields:["description"]). `vehicle_mod` renders 1 of 10 fields — and 73 vehicle_mod items ship across the estate. Both fall back to a generic box icon. Fix: implement, or add an honest hasBody fallback. → /impeccable craft

[P2] Destructive row deletion, no confirm/undo. A 10-tier table is 50 hand-transcribed numbers; one misclick on a 3:1 × in a 24px row destroys one. Hover goes magenta = "accent" everywhere else; --sr2e-danger exists and is unused. Fix: title="Remove rating {{this.rating}}", hover --sr2e-danger, confirm on non-empty rows. → /impeccable harden

## Persona Red Flags

Sam (a11y) — fails hardest. 195 labels announce blank. Effects unreachable by keyboard. Rating table strips outline for a 1px #006688 border at 3.02:1 (clears 3:1 by 0.02) while main inputs get magenta + glow. Backwards. Every remove button named identically "Remove row".

Alex (power user) — 25-28 flat fields, no tabs/collapse, 520x480 window = half always below fold. Two speculative "Enable…" buttons on every cyberware forever. flex:1 defeats width:45px → a 0-12 Rating is as wide as a 6-digit Cost; nothing sized to content. Cyberdeck block duplicated with DISAGREEING labels (Transfer / I/O vs I/O Speed).

Jordan (first-timer) — changes Grade to see what it does and spends money. Can't afford → select snaps back + corner toast = broken dropdown. Creates a Tradition item, gets a void, concludes the system is broken.

Casey (mobile) — N/A, correctly. Desktop ApplicationV2 windows. Scoring responsive here would be padding.

## Minor Observations

.stacked / .focus-price / .item-effect-row unstyled. context.editable dead. _addRatingRow doesn't seed armorBallistic/armorImpact → new bioware rows get empty armor cells. L1025-1035 are eleven copy-pasted Notes one-liners; bioware got rows="6" and the other ten didn't — divergence exists only because the line was copied ten times.

## Questions to Consider

1. Why does the sheet that spends money never show the balance? actor.system.nuyen is one hop away via item.parent.
2. .hint written 19 times, styled zero. Does anyone open this sheet?
3. The 16 best rules explanations in the codebase are unreachable without a mouse. Why did title= feel like the right container?
4. Progressive disclosure is the file's best idea and it stops at the door — smart about conditional fields, dumb about the 25-field trunk.
