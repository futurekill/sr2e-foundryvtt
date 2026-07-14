# Sixth World calendar (for Calendaria)

`sr2e-sixth-world.json` is a [Calendaria](https://wiki.3deathsaves.com/calendaria/)
calendar of Shadowrun 2nd Edition holidays. It is **player-facing and
spoiler-free** — only public Sixth World history and holidays anyone would know.

## Importing

1. Install and enable the **Calendaria** module.
2. Open Calendaria's calendar manager → **Import** → choose **Calendaria JSON**.
3. Select `systems/sr2e/calendars/sr2e-sixth-world.json` (or upload a copy).
4. After import, **set the world date** to your campaign's start (e.g. 1 March
   2055). The calendar uses the real Gregorian year — leap years and weekdays
   land authentically for any 2050s date.

## What's in it

**Sixth World anniversaries** (from the SR2 core rulebook — established public
history by 2055):

| Date | Event |
|------|-------|
| 24 Dec | **The Awakening** — magic returns; Ryumyo appears near Mount Fuji (2011) |
| 30 Apr | **Goblinization Day** — UGE peaks; orks and trolls emerge (2021) |
| 8 Feb  | **Crash Day** — the virus that crashed the world's computers (2029) |

**Persisting real-world holidays** still observed in 2055: New Year's Day & Eve,
Valentine's Day, St. Patrick's Day, Earth Day, May Day, Halloween, Day of the
Dead, Christmas, and the two solstices and two equinoxes (which matter to
magicians — mana tides).

## Not included (on purpose)

Sixth World milestones the core rulebook records only by **year**, not a calendar
day — the Great Ghost Dance (2017), the Treaty of Denver (2018), the Night of
Rage (2039), the secession of Tír Tairngire (2035) — are left out rather than
pinned to an invented date. If your table observes any of these on a specific
day, add it in Calendaria's editor.

Regenerate with `node tools/gen-calendar.mjs`.
