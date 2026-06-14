# Matrix Subsystem — Implementation Plan & Rules Reference

Pre-work for the Matrix (decking) subsystem. Rules below the line are
verified against the SR2E core rulebook (page cites inline); rules marked
**[VERIFY]** still need a PDF pass before coding. Build in the phase order
at the bottom — Phase 1 (cybercombat) is the satisfying, self-contained slice.

---

## 1. Existing scaffolding (audit)

Already in the codebase — reuse, don't rebuild:

- **CharacterData** (`module/data/actor-data.mjs`):
  - `cyberdeck` { mpcp, hardening, activeMemory, storageMemory, loadSpeed, ioSpeed, response }
  - `matrixPersona` { bod, evasion, masking, sensor } — currently static fields
  - `dicePools.hacking` — computed = Computer skill + Reaction (p.84), already correct
  - `isDecker` getter = cyberdeck.mpcp > 0
- **ICData** (`ic` actor type): icType, rating, persona attrs (bod/evasion/masking/sensor/attack),
  a single condition monitor {value, max=rating×2}, initiative. Has a sheet (`templates/actor/ic-sheet.hbs`, 52 lines).
- **Programs compendium** (`packs-src/programs/`): persona programs (Bod/Evasion/Masking/Sensor R1–6)
  and two utilities (Attack, Sleaze R1–6). **Missing** the full operational utility list.
- **CONFIG.SR2E**: `matrixActions`, `icTypes`, `programCategories` exist.

### Gaps to fill
- Persona has **no condition monitor** — the persona takes Matrix damage separately
  from the decker's meat body. Needs its own single 10-box track.
- Persona attributes are static; per the book they should derive from **loaded persona
  programs**, capped by MPCP (mirror how armor derives from equipped armor items).
- No **dump-shock** state (+2 TN debuff).
- No node/host representation, security tally, or system-operation flow.
- Programs compendium needs the operational utilities (Phase 3).

---

## 2. Verified rules — Cybercombat (Phase 1 target)

### Matrix combat resolution (p.178–179)
Persona-vs-IC and persona-vs-persona use the same three steps:

**Attack** — roll dice = attacker's **Program Rating + Hacking Pool** (if a persona
is attacking) OR the **IC Rating** (if IC attacking). TN = the **node's System Rating**
(if target is IC) or the **persona's Bod** (if target is a persona). Count successes.

**Resistance** — target rolls dice = **IC Rating** (if IC) or **MPCP Rating** (+ that
decker's Hacking Pool if used, if a persona). TN = the **decker's Computer Skill**
(if target is a persona) or the **node's System Rating** (if target is IC). Count successes.

**Effect** — compare successes. A persona's *attack* must also overcome the node's
**Security Code** (extra successes needed; see table). IC never worry about Security
Codes; a persona may *ignore* Security Codes when **resisting**. The excess successes
drive the effect per the program/IC description (e.g. damage, −Initiative).

### Condition monitor (p.179)
Decks (the persona/MPCP) and IC have a **single 10-box** condition track — no
physical/stun split in the Matrix. Filling 10 boxes **crashes** the persona or IC.
A crashed deck **dumps** its user (see Dump Shock). Crashed IC is out. A crashed deck,
restarted after leaving the Matrix, is restored to full unless special IC applied
(e.g. Blaster, p.170). Condition levels impose TN/Reaction modifiers as they fill
(same thresholds pattern as meat condition monitors).

### Matrix initiative (p.178)
Decker rolls **1D6 + Reaction**. While in the Matrix, magic increases, wired reflexes,
and VCRs do **not** add to Initiative. **Response increase**: +2 Reaction and +1D6 per
level. Pure cybernetic command → +1 Initiative die. Keyboard-only → halve Reaction
(no response Reaction bonus, but still get the response Init die + base 1D6).
Tortoise on a terminal → halve Reaction (min 1), 1D6.

### Dump shock (p.180)
Being dumped (forced out) causes disorientation: **+2 to all target numbers** for up to
30 seconds. The character may make a **Willpower Test vs TN 4**; divide successes into
30 seconds for the actual duration (every 3 seconds, or part, = 1 Combat Turn).

### Security Code → successes-to-breach (p.180) **[VERIFY exact table values]**
Blue / Green / Orange / Red escalate the successes a persona's attack must beat.
Top-secret code = 4 successes. Pull the exact per-color table when coding.

### IC types (p.169–170) **[VERIFY specific IC effects]**
- **White IC** (p.169) — defensive; Jam IC, etc.
- **Gray IC** (p.170): Blaster (damages persona programs), Killer (Matrix combat,
  damage per success), Tar Baby (attacks a program), Trace and Dump / Trace and Burn.
- **Black IC** (p.170): Tar Pit, Trace, Trace and Report — black IC can cause biofeedback;
  fighting black IC requires a Willpower Test to Jack Out.

---

## 3. Rules to verify before later phases **[VERIFY]**
- Persona attribute derivation + MPCP cap specifics (p.172–174).
- Detection Factor / how Masking + Sensor gate IC noticing the decker.
- Security tally / sheaf and alert escalation (passive/active alert).
- System operations list (Logon, Locate, Analyze, Decrypt, Read/Write, Control, Graceful
  Logoff, etc.) and their tests (p.166, 174).
- Full utility program list and per-utility effects (p.174–177).
- Sensor/Masking special execution tests (p.176).

---

## 4. Design / data-model plan

- **Persona condition monitor**: add `matrixPersona.condition { value, max:10 }` to
  CharacterData (additive field, default-safe → migration framework covers it).
- **Persona attributes from programs**: in CharacterData.prepareDerivedData, set
  `matrixPersona.bod/evasion/masking/sensor` = the rating of the highest loaded
  program of each type (`item.type === "program"`, `system.loaded`), capped at MPCP.
  Keep manual override when no programs are loaded (NPC deckers).
- **Cybercombat flow** — mirror the **opposed-melee card pattern**
  (`flags.sr2e.melee` → Defend/Undefended buttons → `rollMeleeDefense`):
  - `SR2EActor#rollMatrixAttack(target, programItem, options)` posts a card with the
    attacker's successes and a Resist button.
  - The target (IC actor or decker) resolves the Resistance Test; net successes apply
    damage to the single-box Matrix condition monitor.
  - Persona crash → apply Dump Shock (an Active Effect adding +2 TN, see the existing
    AE pipeline) and post a "dumped" card.
- **IC as the monster**: IC actors already exist; add `rollMatrixAttack` / a Resist on
  the IC sheet so GM-run IC can attack a decker and vice-versa. Reuse `SR2ESuccessRoll`.
- **Matrix initiative**: add a branch to `_getInitiativeParts` (a `matrixMode` flag on
  the decker) that ignores wired/magic and applies the response-increase rules.
- **Dump shock**: an Active Effect (`flags.sr2e.dumpShock`) or a transient status; +2 TN
  is a universal modifier — apply it in `rollSuccessTest` like the sustain penalty, or
  via an AE on a system field. Prefer the AE/status so it auto-clears.

---

## 5. Phased roadmap

**Phase 1 — Cybercombat slice (the recommended first build, ~one session).**
Persona condition monitor + program-derived persona attributes; `rollMatrixAttack` with
the attack/resist/effect resolution above; IC attacks from the IC sheet; persona crash →
dump shock; Matrix initiative branch. Testable end-to-end with the Glitch sample decker
vs an IC actor. Self-contained; ships clean even if Phases 2–3 never happen.

**Phase 2 — System operations & security.**
Node/host representation (a lightweight actor or journal-backed construct), the system
operations list with their tests, the security tally and alert escalation that triggers IC.

**Phase 3 — Content & polish.**
Full utility-program compendium (Analyze, Browse, Deception, Decrypt, Evaluate, etc.),
the specific IC roster as `ic` actors in a compendium, and detection-factor automation.

---

## 6. Page index (core book)
Matrix chapter p.160–185. Key: System Operations p.166; Utilities p.174–177; IC p.169–170;
Matrix Combat p.178–179; Dump Shock p.180; Hacking Pool p.84.
