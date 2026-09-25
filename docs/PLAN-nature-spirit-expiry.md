# Plan: Nature spirits vanish at sunrise and sunset (SR2E p.139)
_Round 0 — initial draft by Claude_

## Goal
p.139 (rendered): "Nature spirits vanish at sunrise and sunset, no matter what, and
regardless of whether or not the sun is actually visible. All services end at
that time. Any services left unused or unspecified by that time are lost."
Today the summon card only mentions it; the spirit stays forever.

## Approach
1. **A GM "Sunrise / Sunset" action** (scene controls / macro-style button on the
   GM's tools, and a `game.sr2e.natureSpiritsDepart()` API): every nature spirit
   actor bound to a conjurer loses all services and departs — its tokens are
   removed from all scenes, it is dropped from the conjurer's `boundSpirits`, and
   the actor is deleted (or kept, flagged `departed`, if the GM chooses in a
   setting). One chat card lists who departed.
2. **World-time trigger (optional, automatic)**: when `game.time.worldTime`
   advances past a sunrise or sunset — 06:00 / 18:00 by default, configurable
   per world in two settings — the same action runs on the active GM's client
   (`updateWorldTime` hook). Calendaria's own sunrise/sunset is used when that
   module exposes it; otherwise the fixed hours. Off by default (worlds that
   don't track time would otherwise lose spirits unexpectedly).
3. **Summon card** keeps its note, now naming the next sunrise/sunset when the
   world tracks time.
4. **Tests**: Quench — the action removes a nature spirit (bound, with tokens),
   leaves elementals alone, and updates the conjurer's list; advancing world
   time across 18:00 with the setting on triggers it once; with it off, nothing.

## Key decisions & tradeoffs
- Manual action first-class; the automatic trigger is opt-in.
- Delete vs flag: default delete (the spirit is gone "no matter what").

## Out of scope
Domains (a spirit leaving its domain), Calendaria-specific UI.
