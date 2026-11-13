# Plan: VR2.0 part 7: grid topology
_Draft 1 (2026-11-04). Reviewed PHASE BY PHASE (the part-6 lesson). **7a Codex-APPROVED round 3; BUILT and released in 0.132.0 (code review approved round 4).**
**7b Codex-APPROVED round 4; BUILT and released in 0.133.0 (code review approved round 2)**; **7c Codex-APPROVED round 3; BUILT and released in 0.134.0 (code review approved round 2)**. No code before review._

Sources (rendered, image-only PDF; book = PDF − 8):
- Matrix Topology pp.14–15;
- Grids, RTG tables, LTGs, PLTGs, jackpoints, grid tallies, system operations on grids, satellite links pp.26–30;
- Host Networks p.36;
- Trace on a Grid p.47.

## Today
- Hosts are actors (`HostData`).
- A decker has ONE live host session (`flags.sr2e.vr2Session`: host, tally, `conn`) on top of the part-3 connection
  log (`system.vr2Conn`).
- **Grid operations:** Logon to LTG/RTG and Locate Access Node exist as System Operations (`config.mjs`), but there is
  no grid to log on to. Logon to Host works from anywhere, to any host.
- **Grid trace:** "trace on a grid" (p.47) and Redirect Datatrail's "one per grid" are GM notes (part 3 §scope,
  vr2ic.mjs:554).
- **Jackpoints** (`module/jackpoints.mjs`) carry only `traceMod`.

## The rules, as printed
**Connections (p.14–15).** There are four kinds:
- **Open access:** any host on a grid is reachable from that grid. From one host you may disconnect and reach another
  host on the same grid without ending the run.
- **Tiered:** second-tier hosts are reachable only through the first-tier host. Going B → C means re-entering A.
- **Host–host:** hosts linked directly. You reach a host only through linked hosts (the diagram: LTG → A → B → D → E).
- **Private grid (PLTG):** once on any host of a PLTG, you can reach any other host on that PLTG.

**Grids (p.26–28).**
- National grids are RTGs, each with many LTGs.
- RTG System Ratings come from the North American and Overseas tables (security code + Access/Control/Index/Files/
  Slave). An RTG not on the list is Easy: each rating −2, a range of 6 to 8.
- LTG ratings normally equal the parent RTG's (in North America). Optional variable LTG: 1D6 → 1–2: −1, 3–4: 0,
  5–6: +1 to all ratings, for hours or a whole adventure.
- PLTGs: their ratings never vary. A custom PLTG suggests Orange/Red and Easy.
- Entry points: a PLTG may have several, on different public grids (the Saeder-Krupp example).
- Get in through any entry point, or from a host connected to the PLTG.

**Jackpoints (p.28–29).** Each has Trace, Access and Base Bandwidth:

| Jackpoint | Trace | Access | Bandwidth |
|---|---|---|---|
| Legal | −2 | −2 | 20 |
| Illegal | +0 | +0 | 20 |
| Satellite uplink | p.30 | +2 | 50 |
| Workstation | −4 | −4 | 50 |
| Remote device | +4 | +4 | 20 |
| Console | −6 | see text | unlimited |

- Access applies to all Access Tests in the run.
- Console halves the system's Access Rating and Security Value for all Access Tests, and gives unlimited bandwidth.
- The bandwidth trace modifier (−⌊bandwidth used ÷ base⌋) belongs to the optional Bandwidth rule (p.90). Out of scope.

**Grid security tallies (p.29).**
- Moving between LTGs of the SAME RTG keeps one tally: 2 + 1 + 2 = 5, and it stays 5 while the decker is on those
  grids.
- The tally doesn't follow him to another RTG.
- A tally built under an RTG **does** carry into a PLTG entered from it: the PLTG checks its triggers when the logon
  finishes, then counts on from there.
- A satellite's tally carries over to the RTG the decker accesses (p.30).

**Operations on grids (p.29–30).** Graceful Logoff is always allowed. Otherwise:

| Where the decker is | What he can do |
|---|---|
| Legal or illegal trid jackpoint | Only Logon to LTG |
| Workstation, remote device or console jackpoint | Only Logon to Host, onto the host controlling the device |
| On an LTG | Logon to RTG (its parent); Logon to Host (any host on that LTG); Logon to LTG (into a PLTG attached to that LTG); Redirect Datatrail; Retrain |
| On an RTG | Logon to RTG (another); Logon to LTG (any of its LTGs); Locate Access Node; Make/Tap Comcall; Redirect Datatrail; Retrain |
| On a PLTG | Anything allowed on public RTGs and LTGs |

**Satellite (p.30).**
- Needs a satlink deck. Computer Test against the Satlink TN table, base time 3 minutes, retry in about 5 minutes.
- Reaction −2. Trace finds the satellite but not the decker.
- The satellite counts as an LTG of Orange-Average/Hard, with no subsystem reduction; military/corp comsats are
  Red-Hard.
- From it the decker can use Logon to RTG to reach any RTG.

**Host networks (p.36).**
- To reach a second-tier host from the hub: Analyze Subsystem on the hub's Access (or another subsystem, if the
  designers hid it), then Logon to Host.
- Leaving the hub counts as a Graceful Logoff from it, so a running trace adds the trace IC's rating to the new logon's
  TN.
- Once the decker is on the new host, the hub loses his datatrail and its trace crashes.
- Host to host means going back through the hub.
- On the hub, Locate File/Slave cover the whole network.

**Trace on a grid (p.47).**
- A trace triggered by a grid keeps working while the decker is on ANY grid of that RTG. He must keep it suppressed,
  or keep relocating.
- It loses interest when he logs onto a host, another RTG or a PLTG.
- A trace triggered by the RTG governing his jackpoint, or by an LTG under it, can **dump** him the moment it locates
  the jackpoint: no killer needed.

## Approach (proposed)
0. **Phasing.**
   - 7a: grids as places + navigation + grid tallies + jackpoint kinds.
   - 7b: trace on a grid + dump-on-locate + host networks (hub rules).
   - 7c: satellite links.
   - Each is optional within VR2.0 behind a new world setting `vr2Topology` (off by default). Off, everything behaves
     as today: logon anywhere, the GM tracks grids.
1. **Grids are Host actors with a `kind`.**
   - `HostData.kind`: "host" | "ltg" | "rtg" | "pltg" | "satellite", default "host" (`blank: false`).
   - Then `parentUuid` (LTG → RTG), `links: [uuid]` (directed: who you can reach from here), `entryPoints: [uuid]`
     (PLTG ← public grids), `hub: boolean` (a tiered first-tier host), and `controls: [jackpoint region uuid]`.
   - Reusing the Host actor keeps every System Test, tally, alert, IC and session path working unchanged on a grid,
     since grids use the same ratings and security code.
   - **Presets:** an RTG picker fills in the printed tables (`module/rules/vr2-grids.mjs`, transcribed from the renders
     above, with a Vitest test per row: e.g. Aztlan Orange-3 8/8/6/7/7, Tir na nÓg Red-5 9/9/7/8/8), plus the Easy rule
     for an unlisted RTG.
   - "Create LTG under this RTG" copies the RTG's ratings, with the variable-LTG roll button.
2. **Navigation = admission of Logon operations.**
   - A pure `reachable(fromPlace, op, toPlace, topology)` decides which logons are legal from where the decker is. Where
     he is = the jackpoint for the first logon, else the live session's place. It follows the "Operations on grids"
     rules above.
   - Host reachability comes from the place's `links`, tier rules, PLTG membership and the `controls` of the jackpoint.
   - The System Operation dialog lists only reachable targets when topology is on.
   - Leaving a place for the next one is the existing session switch (`replaceSessions`), so the part-3 exit
     housekeeping runs unchanged.
3. **Tallies across grids.**
   - Part 3 keys tallies per session. Grid sessions carry a `tallyScope`:
     - every LTG of an RTG and the RTG itself share `rtg:<uuid>`;
     - a PLTG starts from the scope it was entered from (snapshot at logon), then has its own;
     - a satellite feeds the RTG accessed from it.
   - The tally fold reads the scope rather than the host. Hosts keep their own tally as today. **Open question 1:** does
     anything carry from grid to host? The book says only RTG → PLTG and satellite → RTG carry over.
4. **Trace on a grid (7b).**
   - A trace IC on a grid keeps its location cycle while the decker's live session stays in the same `rtg:` scope. It
     ends when he logs onto a host, another RTG or a PLTG.
   - Dump-on-locate: if the trace's grid governs the decker's jackpoint (the jackpoint's LTG/RTG), a completed location
     dumps him with dump shock, as killer-free.
   - This is written by the sequencer, as part-3 trace facts are.
   - Redirect Datatrail becomes "one per grid", enforced per `rtg:` scope.
5. **Host networks (7b).**
   - A `hub` host's second-tier `links` are hidden until an Analyze Subsystem (Access, or the configured subsystem)
     succeeds in this session.
   - Logon from the hub adds the hub's running trace IC rating to the TN. A completed logon crashes that trace (the hub
     loses the trail).
   - Locate File/Slave on a hub reports which network host has it.
6. **Jackpoint kinds (7a).**
   - The jackpoint Region Behaviour gets `kind` (legal / illegal / satellite / workstation / remote / console) with the
     table's trace/access values.
   - Access adds to every Access Test this run. Console halves the Access Rating and Security Value in Access Tests.
   - The existing `traceMod` stays as an extra GM adjustment.
   - The kind also decides the first-logon rule: trid → LTG only; workstation/remote/console → only the `controls` host.
7. **Satellite (7c).**
   - A satlink deck flag, then a Locate Satellite test against the Satlink TN table (conditions picker, bad weather +2)
     as an extended Computer Test, base 3 minutes. A satellite place: Orange-Average/Hard or Red-Hard.
   - Reaction −2 while on the satlink.
   - Trace locates the satellite: no physical location, but the other trace effects apply.
8. **Tests.**
   - Vitest: RTG table rows, the Easy rule, the variable-LTG table, `reachable()` for every row of the operations table,
     tally scopes for the p.29 example (2 + 1 + 2 = 5, carries into a PLTG, not to another RTG), and the jackpoint
     table.
   - Quench `sr2e.vr2-grids`:
     - trid jackpoint → LTG → host;
     - refusal of a host that isn't reachable;
     - tally carried across LTGs;
     - PLTG entry with an inherited tally;
     - hub second tier hidden until analyzed;
     - grid trace persists across LTGs and dumps when governing;
     - topology off = no change.

## 7a in detail: places, navigation, grid tallies, jackpoint kinds (the part under review)

Extra pages read for this section (rendered 2026-11-04): Logon to Host / LTG / RTG and Graceful Logoff (p.114, p.116),
Locate Access Node (p.114), Matrix Topology (p.14–15), Operations on Grids (p.29–30).
- **Logon to LTG (p.116):** "If the decker loses the test, his log-on attempt fails. The decker can try again, but his
  security tally remains on the grid for some time (typically, public LTGs 'remember' unauthorized access attempts
  for 1D3 × 5 minutes)." Another jackpoint before the next attempt → the grid starts a new tally.
- **Logon to RTG (p.116):** from an LTG, to its controlling RTG. He MUST do it to reach a different LTG of the same
  RTG, or another RTG. The test uses the RTG's own Access Rating ("local" LTG changes don't carry over).
- **Graceful Logoff (p.114):** disconnects "from a host and the LTG where he logged on": it leaves the Matrix. There is
  no operation for "back to the grid". Open access (p.14) is how a decker moves between hosts: "he can disconnect
  from that host and access another host without terminating his Matrix run".
- **Locate Access Node (p.114):** Index/Browse. It finds the LTG codes of the hosts he wants: TN +1 for a vague goal,
  +0 for a more specific one, −1 for a definite one. "Once a decker has located an LTG code, he need not repeat the
  operation … unless its owners change the address."
- **On a grid (p.29–30):** the RTG list includes Retrain and Tap Comcall, but the system has no such operations
  today. They stay out of scope; 7a only gates the operations that exist.

### 1. Places
**Schema.** `HostData` gains the fields below. All of them are inert unless `vr2Topology` is on.
- `kind` StringField: `host` | `ltg` | `rtg` | `pltg`, initial `host`, `blank: false`. The `satellite` kind arrives in
  7c, with its own schema change.
- `grid` DocumentUUIDField (an Actor, nullable). It is the grid this place hangs from:
  - an LTG's grid is its parent RTG;
  - an open-access or first-tier host's grid is its LTG or PLTG;
  - a second-tier host and an RTG have none.
- `links` ArrayField of Actor UUIDs: host↔host links, **undirected**. A link stored on either end counts. The tiered
  diagram (A↔B, A↔C, A↔D) and the host-host diagram (A↔B, B↔C, B↔D, C↔D, D↔E) are both undirected; going B → C in a
  tiered network means re-entering A (p.14).
- `entryPoints` ArrayField of LTG UUIDs: where a PLTG can be entered (p.28).
- `unlisted` BooleanField: the address isn't public, so the decker must find it (below).
- `ratingShift` NumberField, an integer from −1 to +1, initial 0. It is the Variable LTG roll (p.28). The
  `securityValue` getter and `subsystemRating(key)` add it, min 1. That is the ONE place every test reads ratings from,
  so the shift reaches all of them. Rolling again replaces the shift; clearing it restores the printed ratings.

**Sheet.** The Host sheet gets a **Grid** section: kind, grid, links, entry points and unlisted. It also shows a read-only
**Reachable from here** list from `reachable()`, so the GM can check the topology. The section is hidden when topology
is off.

**Presets.** `module/rules/vr2-grids.mjs` holds the 50 rows of `tools/data/vr2-rtg-ratings.tsv`, copied into code. A
build check fails if the two differ.
- **New RTG…** (Actors directory, GM only) is a picker. It creates a `kind: rtg` host with the row's code,
  `securityValueOverride` = level, and the five subsystems.
- **Unlisted** gives the Easy rule: each rating −2, range 6–8. The GM picks the code.
- On an RTG's sheet, **Create LTG** copies the RTG's code and ratings into a new `kind: ltg` host with `grid` = the RTG.
- For the Germany-style indented rows (the LTGs in the table), the picker creates the LTG under its RTG with the
  table's own ratings.
- **Roll variable ratings** (on an LTG, when the separate `vr2VariableLTG` setting is on) posts a visible 1D6 and writes
  `ratingShift`: 1–2 gives −1, 3–4 gives 0, 5–6 gives +1. The GM can also set the shift by hand ("specific changes").

### 2. Where the decker is
**The derived place.** `currentPlace(actor)` is derived, never stored.
- The live session (`liveSession`) names a place (`hostUuid`).
- The decker is **on** that place when either:
  - the session was not opened by a logon attempt (a "Disconnect to grid", §3, or an operation on the place he is
    already on), or
  - its `logon.ok` is true.
- Otherwise he is still on `logon.from`: the place he was on when he attempted. It is null at a jackpoint.

**`logon.ok` is the one source of truth (R1 #3).**
- It is written when the card is posted.
- An `updateChatMessage` hook rewrites it whenever a Karma reroll changes the logon card's verdict. The hook runs on
  the client that made the change, inside the session queue, and only if `logon.card` is still that card on the live
  session.
- Deleting the card changes nothing: the GM tidying chat never moves a decker.

**The jackpoint (R1 #1).**
- Under topology, `startSession` opens a **hostless** session (`hostUuid: ""`): the decker is at his jackpoint, on no
  place. He reaches the jackpoint's wired place only through a successful logon.
- With topology off, the session is seeded from the jackpoint's host, as today.
- With no jackpoint (the sheet's plain Jack In), the decker counts as at an *illegal trid* jackpoint that is wired to
  no particular LTG.

**Logon attempts (R1 #2).**
- Every logon calls `sessionFor(actor, target, { logon: { id, from, carry } })`, where `from` is
  `currentPlace(actor)?.uuid ?? null`.
- Each of `sessionFor`'s three paths writes a fresh attempt record over any old one, so a retry never keeps the
  previous card:
  - the same target;
  - adopting a hostless session;
  - starting a new session.
- `from` and `carry` are snapshots taken at the attempt.
- After the card is posted, the same session queue writes `logon.card` and `logon.ok`. It checks the session id and
  `logon.id`, as `tallyUpdate` checks its session.
- A failed attempt leaves the decker where he was. The tally he earned stays with the target's scope (§4).

**One operation at a time (R1 #5).** Every `vr2SystemTest` runs whole inside a new per-actor operation queue,
`enqueueAttack("vr2op:<uuid>")`, from admission through the roll, card, tally and logon write. The queue applies
whether or not topology is on.
- Two quick clicks can no longer switch the session between the first test's roll and its tally. Today the second
  click would silently drop the first test's tally event.
- It's a separate key from `sessionQueue`, so the queued helpers inside it can't deadlock.
- **Disconnect to grid (§3) runs in the same `vr2op` queue (R2 #2)**, so it can't switch the session under a System
  Test that is still rolling.
- The queue is per client. That's the system-wide contract: one person drives an actor (jackpoints.mjs header, the
  part-3 plan). A second device driving the same decker at the same moment is out of contract, as it is for every
  session write today (R2 #1, rejected).
- A roll dialog that's cancelled returns, and the queue moves on.

**Operations that aren't logons.**
- An operation that isn't a logon must target `currentPlace(actor)`. When that place differs from the live session's
  host (after a failed attempt), `sessionFor` switches back to it, seeded from the ledger (§4).

### 3. Navigation: `reachable(place, op, target, topo)`
**What it is.** `reachable` is a pure function in `module/rules/vr2-grids.mjs`, tested with Vitest.
- `topo` is a plain snapshot of every place: `{uuid, kind, grid, links, entryPoints, unlisted}`. The caller also passes
  the jackpoint's kind and wired place, and the decker's known addresses.
- It returns `{ok, why}`.

**Graceful Logoff** is always allowed (p.29).

**Where each operation is allowed**, by where the decker is (the p.29–30 table plus p.116):

| Where the decker is | Logon to LTG | Logon to RTG | Logon to Host | Other operations |
|---|---|---|---|---|
| Trid jackpoint (legal or illegal) | the jackpoint's wired LTG; any LTG if it has none | — | — | none |
| Workstation, remote-device or console jackpoint | — | — | only the jackpoint's wired host | none |
| LTG L | a PLTG with L among its `entryPoints` | L's `grid` (the parent RTG) | any host with `grid` = L | Redirect Datatrail |
| RTG R | any LTG with `grid` = R | any other RTG | — | Locate Access Node, Make Comcall, Redirect Datatrail |
| PLTG P | P's entry-point LTGs | any RTG | any host with `grid` = P | everything allowed on an LTG or an RTG |
| Host H on grid G | — | — | hosts with `grid` = G (open access, p.14) and H's links | every host operation, against H only; **Disconnect to grid** |
| Second-tier host H (no grid) | — | — | H's links only | every host operation, against H only |

**Disconnect to grid (R1 #4).** p.14: "he can disconnect from that host and access another host without terminating
his Matrix run".
- It is a button on the Matrix tab. It is no test, and it isn't a Graceful Logoff (which leaves the Matrix, p.114).
- From a host H with a grid G, it opens a session on G with no logon: he is on G, with its tally seeded as in §4.
- A second-tier host has no grid. The decker goes back through its links instead (the tiered rule).
- Grid-level operations need the decker to be on the grid. From a host, he disconnects first.

**A host operation on a grid is refused:** grids run only the operations in the table.

**Leaving from the jackpoint (R2 #3).** p.28: "When a decker first connects to the public grid … his deck loads his
icon onto an LTG". So before his first successful logon, no icon is loaded anywhere, and nothing can dump him.
- Under topology, a decker with no place (at the jackpoint, or after failed first attempts) leaves without dump shock
  and without a test.
- It is a new part-3 exit trigger, `unplaced`. The sequencer accepts it only if, on its own client, topology is on and
  `currentPlace(actor)` is null.
- `unplaced` is refused while black IC holds the connection, as `voluntary` and `graceful` are.
- Jack Out offers it automatically. A Graceful Logoff needs a place to test against, so it isn't offered there.

**Addresses (p.114, p.116):** a place with `unlisted` is reachable only once the decker knows its address:
- `flags.sr2e.vr2Known.<actorId>`, durable across runs, as the book says;
- the GM always passes.

**Locate Access Node:**
- Its dialog gets a goal picker that sets the TN: vague +1, specific 0, definite −1.
- The success card gives the GM a **Reveal address…** button. It picks an unlisted place and adds it to the decker's
  known list.
- The GM can also tick known addresses on the decker's sheet ("he got it from a fixer").

**The System Operation dialog:**
- Under topology, the target list shows only places where `reachable().ok`, plus the current place for operations
  that aren't logons.
- Each refused target lists its reason in a GM-only "Why not?" fold-out.
- `vr2SystemTest` re-checks before anything is spent or rolled, inside the session queue. A stale dialog or a macro is
  refused there with the same `why`.

**Topology off:** nothing changes. Any host, any operation, as today.

### 4. Tallies across grids (p.29, p.116)
**Scope keys.** Every place has a tally scope:
- a public LTG or RTG: `rtg_<RTG actor id>`, found by following `grid` up to the RTG;
- an LTG with no RTG set: `ltg_<id>`;
- a PLTG: `pltg_<id>`;
- a host: `host_<id>`.

Actor ids, not UUIDs, because a UUID's dots would split the flag path.

**The ledger.** `flags.sr2e.vr2Tallies.<scope> = { conn, jackpoint, tally, forgetAt? }`.

**One atomic switch (R1 #6, #7).** `replaceSessions` becomes ONE update:
- `flags.sr2e.==vr2Session` (Foundry v13's forced replacement, `helpers.mjs` "=="), or `-=` when there's no next
  session;
- `==lastSession`;
- the outgoing session's ledger entry.

So no failure window drops a tally, and no merge carries old receipts along.

**The seed for a new session**, in order:
1. the OUTGOING live session's tally, if it is in the same scope (an LTG → RTG move);
2. the scope's ledger entry, if it has this `conn`;
3. a failed-access memory (below);
4. 0.

Topology off: no ledger. Today's per-session tally stays exactly as it is.

**Whose sheaf.** The p.29 example (2 + 1 + 2 = 5) is one tally across the RTG and its LTGs, so it fires one set of
triggers: the RTG's (`tallyUpdate` reads the sheaf of the scope's owner). An LTG's own sheaf is ignored under topology,
and its sheet says so.

**Into a PLTG (p.29; R1 #9):** "his Security Tally on the PLTG begins at 5, plus any points he incurs while logging
on", and the triggers that crosses "go off as soon as he finishes the log-on".
- The attempt snapshots `carry = { scope, tally }` from the public scope he's on.
- The attempt's own points land on the PLTG session as usual.
- **When `logon.ok` first becomes true** (at the card, or later through Karma), the queue applies one carry event,
  `carry-<logon.id>` (one receipt, so it happens once). Its amount is `max(0, carry.tally − the PLTG's seeded tally)`.
  - `tallyUpdate` gains `{ exact: true }`, so this event skips the trace acceleration (`traceTally`): the inherited
    points are already counted.
  - It crosses the PLTG sheaf from the current tally upward, so the rows fire at the finished logon.
- Re-entry in the same connection therefore gives max(the PLTG's ledger, the public tally) plus the new attempt. The
  book is silent on re-entry; this never lowers an earned tally.

**Failed Logon to LTG (p.116; R1 #8):** "his security tally remains on the grid for some time (… 1D3 × 5 minutes)",
unless he switches to a different jackpoint.
- The failed card rolls a visible 1D3 × 5 minutes and writes the scope's entry with `forgetAt` = world time + that,
  and the jackpoint's UUID. It goes into the ledger right away, not only when the session switches.
- **Every** Logon to LTG attempt checks it, including a retry on the same live session. If `forgetAt` has passed and
  he never got on, the attempt resets the session's tally to 0 first.
- **Across connections:** a new connection from the SAME jackpoint seeds from an unexpired failed-access memory. A
  different jackpoint, or a no-jackpoint sheet entry, never does.
- Game time moves only when the GM or combat moves it. The card says "the grid forgets at …".

**Hosts:** a host's tally is kept for the connection, so stepping out to another host and back doesn't wipe it.
- **Open question 1, answered here:** nothing in pp.14–36 carries a GRID tally onto a host, so a host's scope starts
  at 0.
- Clearing a host's tally on a successful Graceful Logoff from it comes with the hub rules (7b, p.36).

### 5. Jackpoint kinds (p.28–29): VR2.0 whether or not topology is on
**Kind.**
- `JackpointBehaviorData.kind`: `legal` | `illegal` | `satellite` | `workstation` | `remote` | `console`, initial
  `illegal` (+0/+0). Existing jackpoints therefore keep today's numbers.
- Satellite is selectable but does nothing until 7c: its Trace is "see p.30".

**Wiring.** The existing `host` field is relabelled **Wired to**:
- an LTG for trid kinds;
- a host for device kinds.

With topology off it seeds the session as today.

**Legacy wiring (R1 #11).** Existing jackpoints have `host` pointing at an ordinary host. Under topology, a trid
jackpoint wired to a non-LTG place reads as wired to that place's grid when it has one, or else as "no LTG" (any LTG).
- The jackpoint config shows a warning when the wiring doesn't fit the kind.
- Turning `vr2Topology` on posts a GM-only chat list of every jackpoint whose wiring doesn't fit its kind, each with
  a link to fix it.
- No silent migration: the schema default can't tell a deliberate configuration from an old one.

**Trace and Access.** The kind's Trace value plus `traceMod` (now "extra GM adjustment") feeds `traceFactor` at
vr2.mjs:842.

The kind's Access modifier is added to the TN of every **Access Test**: a System Test whose operation's subsystem is
`access`. That covers the Logons, Graceful Logoff and Decrypt Access. It is shown on the card.

**Console:**
- the Access subsystem rating and the host's Security Value are both halved in Access Tests, **rounded up** (user
  ruling 2026-11-04);
- the Security Value is halved only for Access Tests, and it is the Security Value the host rolls for that test;
- unlimited bandwidth matters only to the out-of-scope Bandwidth rule.

**Where the kind is read (R1 #10).** `openConnection` snapshots `{ kind, wired, traceMod }` into the durable
`connOpen` record, beside the jackpoint UUID.
- One helper, `connJackpoint(actor)`, reads that snapshot. It is used by:
  - `sessionHost`;
  - the trace TN (vr2.mjs:842);
  - the Access modifier;
  - `reachable`.
- A jackpoint edited mid-run can't re-wire or re-price a running connection.
- An old record with no snapshot falls back to the live behaviour, as today, and to `illegal`.

### 6. IC on grids (7a's share)
- A grid's IC are IC actors whose host is the grid. For the public RTG and its LTGs, that host is the RTG.
- Today's attack admission doesn't compare the decker's session host with the IC's host (`HANDLERS.attack`,
  vr2ic.mjs:246). So RTG IC already reaches a decker on any of its LTGs: no change. *Codex: please check that claim.*
- Grid trace persistence and dump-on-locate are 7b.

### 7. Tests (7a)
**Vitest:**
- every TSV row, compared with the code copy;
- the Easy rule;
- the variable-LTG table;
- `ratingShift` floor;
- `reachable()` for every cell of the table above, including: unlisted with and without the address, open access
  between hosts, a tiered host reached only through the hub and back (B → A → C), and the host-host chain
  LTG → A → B → D → E;
- the scope key for each kind;
- the p.29 example (2 + 1 + 2 = 5; carried into a PLTG and crossing its trigger; not carried to another RTG);
- `forgetAt` expiry;
- the jackpoint table and console halving.

**Quench `sr2e.vr2-grids`:**
- an illegal jackpoint: Logon to LTG, then a host on it;
- an unreachable host refused, with nothing spent;
- a failed logon leaves the decker on the LTG, and a retry continues the tally; an expired `forgetAt` resets it on the
  retry, and a reconnect from the same jackpoint keeps an unexpired one;
- Disconnect to grid from a host, then Logon to RTG;
- two System Operations clicked together: both tallies land (the op queue);
- the LTG → RTG → LTG tally carry, firing the RTG sheaf once;
- a PLTG entry with an inherited tally that fires the PLTG trigger only at the successful logon, unaccelerated for
  a traced decker;
- Karma turning a failed logon into success moves the decker;
- deleting the logon card keeps him there;
- topology off: unchanged.

## 7b in detail: trace on a grid, host networks, one redirect per grid

Builds on 7a as released in 0.132.0: `currentPlace()`, `logon` records, the `vr2Tallies` ledger, `vr2op` queue. The
pages behind it were rendered again for this section (2026-11-04):
- **Trace on a Grid (p.47).** "Trace triggered by a grid keeps working against the decker as long as he remains on
  any grid controlled by the same RTG. If he defeats the IC on an LTG, he must keep it suppressed or keep relocating
  as long as he is on that LTG, its parent RTG, or any other LTG governed by that RTG … the IC loses interest in
  tracking the decker once he has logged onto a host or another RTG or PLTG."
- **Dump on locate (p.47).** "If the trace IC has been triggered by the RTG that governs the decker's jackpoint, or by
  an LTG attached to that RTG, then the IC can immediately dump the decker once it detects his jackpoint … a
  killer-type attack is not necessary … not available to a trace originating on other grids or hosts."
- **Host networks (p.36).**
  - "To travel from the hub to a second-tier system, a decker must perform an Analyze Subsystem operation on the
    Access subsystem of the first-tier host (unless the designers … hid the connection … on a different subsystem)
    to find the connections, then perform a Logon to Host to the second-tier host."
  - "These operations include the equivalent of a Graceful Logoff on the first-tier hub, so if the system is running
    Trace IC, add the IC rating to the decker's target number for the logon to the new host … if the decker
    successfully logs on to the second-tier host, the hub loses his datatrail, and any Trace running against him in
    the hub crashes."
  - "To pass from any single host in a network to another, the decker must perform a Logon to Host operation from the
    second-tier machine back onto the hub, and then another Logon to Host to get to the next computer."
  - "Deckers on a hub can perform operations such as Locate File or Locate Slave for the entire host network …
    identify which second-tier host contains a specific datafile or controls a certain remote device."
- **Graceful Logoff (p.114)** "clears all traces of the decker and his actions from the security and memory systems of
  the host."
- **Redirect Datatrail (p.117).**
  - "Deckers may perform Redirect Datatrail operations on any grid. Reduce the target number for the opposing
    Security Test by the decker's trace modifier (see Jackpoints, p.28)."
  - "Deckers can leave only one redirect on a grid. For each grid where a decker leaves a redirect, reduce his trace
    factor by 1."
  - The system already counts redirects into the Trace Factor (part 3; the stated reading that redirects ADD stays).

All of 7b applies only when `vr2Topology` is on. Off, traces, logons and redirects behave as today.

### 1. Which place a trace belongs to
**Recording the place.** The `trace` fact (vr2ic.mjs ~754, written by the sequencer when the trace hits) gains
`place`: the IC's host UUID at that moment. An older trace fact without it reads the IC's current host.

The sequencer also records the place's scope and class in the fact: `scope` and `grid: true` for a public LTG or RTG.
`traceState` returns `place`, `scope` and `grid` with the trace, so the fold and every predicate can see them
(R1 #4). The legacy fallback is computed by the sequencer when it reads an old fact.

**`traceScope(trace)`** classifies the trace from that place, using 7a's `scopeOf`:
- a public-grid trace: the place is an LTG or RTG, so the scope is `rtg_<id>` or `ltg_<id>`;
- a host trace: anything else, including a PLTG. The book's grid rule names public RTGs and LTGs only.
- A Track (part 5a, a decker's utility) is neither. 7b never touches it.

### 2. A grid trace loses interest (p.47): durable, ordered moves (R1 #1, #6)
**Move entries.** Every place change is written by the decker's client in the SAME actor update that makes it.
- The entry is `flags.sr2e.vr2Moves.<conn>_<k> = { conn, k, place, from, network, logonId }`, where `k` is a
  per-connection counter (one person drives an actor).
- The place changes that write one:
  - the first `ok` of a logon (`settleLogon`, at the card or through Karma);
  - Disconnect to grid.
- No state exists where the decker has moved and the entry is missing, and a departure followed by a return leaves
  two entries.
- Entries of older connections are pruned when a session closes.

**Sequencing them.** `syncMoves(actor)` runs in the sequencer. For each entry of the live connection with no `move`
fact yet, in `k` order, it writes `move:<conn>:<k>`:
- `{ type: "move", conn, k, place, from, network, scope, grid }`, with the scope and class computed then;
- the fact gets a `seq`.

It runs:
- at the start of `passFor`. `schedule` already fires on the actor's updates, so a move is sequenced moments after
  it happens;
- at the start of `tickTraces`;
- before any `trace` fact is written.

So every move the GM's client can see is ordered before any later tick or new trace. A `moved` request is
unnecessary and isn't added.

**The order is the sequencer's (R2 #1).**
- `tickTraces` also runs `syncMoves` again immediately before EACH tick fact it writes, so a move that arrives
  during a tick pass is sequenced before the next tick.
- A move that becomes visible only after a tick was written happened after that boundary, by definition. The
  sequencer's seq is the one order every client agrees on, as it already is for ticks and crashes (part 3).

**The fold decides, purely (`traceState`).** A trace ends ("lost") at the first `move` fact with a seq after its own:
- a **public-grid trace** (not a Track) is lost when the move's `grid` is false, or its `scope` differs from the
  trace's: a host, a PLTG or another RTG (p.47);
- a **host trace** placed on P (not a Track) is lost when the move is a `network` move whose `from` is P (§4).

Its `crash` becomes the earlier of the existing crash and that move's seq, so a tick sequenced after the move never
counts. Like any crash, this doesn't undo a trace that completed before the move. The rules are pure, in
`module/rules/vr2-grids.mjs` (`traceLostAt(trace, moves)`), and `traceState` calls them.

**The card.** `noticeTraces` posts it once per trace (`once`), whispered to the GM: "<IC> loses interest: <decker>
left <grid> (p.47)", or "the hub lost his datatrail (p.36)".

**Frozen dead traces (R1 #3).** The fold's `frozenCount` excludes dead traces as well as complete ones, so a lost or
crashed frozen trace stops costing Detection Factor.

**Keeping a suppression across the grid (p.47: "keep it suppressed … as long as he is on that LTG, its parent RTG, or
any other LTG"; R1 #2).**
- Today the suppressed and released IC live on the session, so a new session drops them silently.
- Under topology they travel with the tally:
  - 7a's ledger entry stores `suppressed` and `released`;
  - `newSession` restores them by the same seed rule as the tally: the outgoing session in the same scope, else the
    ledger entry for this connection.
- So a failed attempt elsewhere, which installs the target's session while the decker is still on P, loses nothing:
  the return to P restores them.
- On another place they don't count.
- **Detection Factor reads the CURRENT place's suppressions (R2 #2):**
  - the live session's, when its scope is the current place's;
  - otherwise (a pending or failed attempt elsewhere) the current place's ledger entry for this connection.

  A helper `placeSuppressed(actor)` replaces the direct `liveSession(actor)?.suppressed` read in
  `vr2DetectionFactor`. Release and suppress still act on the live session, and are refused unless it is the current
  place's.

**A complete trace (one that has located the jackpoint) stays complete.** The decker is still traced: the tally and
attack effects of p.46 continue, as they do today. Losing interest stops only a hunt that is still running.

### 3. Dump on locate (p.47)
**When the option exists.** Traces are "governing" when:
- the trace's scope is a public RTG scope; and
- the decker's jackpoint governs it: `connJackpoint(actor).wired`, read through 7a's `wiredPlace`, is an LTG whose
  scope is that same `rtg_` scope.

  A device jackpoint, no jackpoint, or an LTG with no RTG means never.

**The GM's option.** `noticeTraces` (~1167) adds a **Dump the decker (GM, p.47)** button to the "locates the
jackpoint" card. It is an option, because the book says the IC *can*. The button sends a sequencer op, `gridDump`:
- it re-checks that the trace is complete, governing, and that the decker is still on its connection;
- it also re-checks that the decker is still somewhere in that RTG scope. The book allows the dump "once it detects
  his jackpoint", and a decker who left the grid has left its switchers.
- Then it runs `openExit(actor, "dump")`: dump shock, as any dump.

**Which host's dump shock (R3 #1; every exit under topology, not only this one).**
- `exitHost` (vr2ic.mjs ~132) reads the live session's host. After a failed logon, that session is the attempted
  destination, not where the decker is.
- Under topology, the exit records the place where it opened: `exitOpen` gains `place`, set to
  `currentPlace(actor)?.uuid` and captured by the sequencer when it writes the fact.
- The dump-shock step (~1381) reads that `place` first, then falls back to `exitHost`, so a dump comes from the grid
  or host the decker was really on.
- Topology off: unchanged.
- One exit per connection already makes a double click harmless.

### 4. Host networks (p.36)
**Network moves.** A *network move* is a Logon to Host from host P to a host T that is linked to it (7a's undirected
`links`). Open-access moves between hosts on one grid are not network moves: p.14 describes them as a disconnect
followed by a logon, and has no hub.

**Finding the connections.**
- `HostData.hubSubsystem`, a StringField from `access | control | index | files | slave`, initial `access`
  (`blank: false`): "unless the designers … hid the connection … on a different subsystem".
- Moving from a first-tier host (one with a `grid`) to a second-tier one (no `grid`) needs the decker to have found
  the connections: a successful **Analyze Subsystem** on P's `hubSubsystem`, on this connection.
  - The record is `flags.sr2e.vr2Mapped.<P id> = conn`. It is written in the `vr2op` queue when that card is posted,
    and again by 7a's Karma `updateChatMessage` hook when a reroll turns it into a success.
  - It is never removed: Karma only adds successes.
- `reachable` gets a `mapped` set. Without it the move is refused: "Find the connections first: Analyze Subsystem
  (<subsystem>) on <hub> (p.36)."
- The GM is NOT exempt. The topology check on the host sheet passes "everything mapped".
- Going back from a second-tier host to the hub needs no mapping.

**Leaving counts as a Graceful Logoff from P** (every network move, in both directions: **user ruling 2026-11-04**).
p.36 states it for the hub's departure, and the return trip is the same act of logging off one host and on to the
next.
- **The TN:** the logon's TN adds the rating of every live trace, neither complete nor dead, whose `place` is P. That
  is the same term `vr2SystemTest` already adds to a Graceful Logoff (`tracing`). The card shows it.
- - **Tracks are excluded** (R1 #5). The TN term and the cleanup both skip `track` traces: a Track is another decker's
  utility, not P's IC. Today's Graceful Logoff `tracing` term gets the same exclusion, as p.45 speaks of trace IC.
- **On success** (`settleLogon` with `ok`, so Karma counts), in that same update:
  1. the move entry has `network: true, from: P`. The fold then ends every incomplete trace placed on P that
     started before the move (§2): "the hub loses his datatrail". The entry belongs to this connection and this
     logon, and only earlier traces are affected, so a late or duplicate sync can't touch a later trace (R1 #6).
  2. P's ledger tally and its suppressions are cleared ("clears all traces … from the security … of the host",
     p.114). The decker comes back to a fresh P.
- **A failed network move** leaves the decker on P, and P's traces keep running.

**Locate File / Locate Slave on a hub** (a host with a `grid` and at least one second-tier link): the card adds
"On the hub: this covers the whole network; the GM says which host has it (p.36)". Files and slaves aren't modelled,
so the answer is the GM's.

### 5. One redirect per grid (p.117)
- Under topology, Redirect Datatrail runs only on a grid (7a's reachability table already says so).
- **One per grid:** the redirect fact is keyed by the grid: `redirect:<conn>:<place id>`, replacing today's running
  count `k`. A second success on the same grid writes nothing, and its card says "one redirect per grid already left
  on <grid>".
  - Different grids, even in one scope, each take one: "for each grid where a decker leaves a redirect".
  - The fold's `redirects` count is unchanged: the number of redirect facts on the connection.
- **The opposing Security Test:** "Reduce the target number for the opposing Security Test by the decker's trace
  modifier". The host's TN is the Detection Factor, so for Redirect Datatrail under topology the host rolls against
  `max(2, DF − jackpointKind(kind).trace)`, read literally (**user ruling 2026-11-04**): a legal jackpoint (trace −2)
  makes it 2 higher and a remote device (+4) 4 lower. The card shows it.
- Topology off: as today (the GM's call).

### 6. Tests (7b)
**Vitest:**
- `traceLostAt` for each case, ordered by seq:
  - LTG → RTG → another LTG of the same RTG: kept;
  - → a host, a PLTG, or another RTG: lost;
  - a host trace and a Track: never by this rule;
  - a complete trace: never;
  - a network move from its place: lost;
  - a departure then a return: lost at the departure;
  - a move before the trace started: ignored;
  - a Track: never.
- `frozenCount` excludes dead traces.
- `traceScope` with and without `place`.
- Governing (dump), true when:
  - a trid jackpoint wired to an LTG of that RTG, with a trace placed on that LTG or on the RTG.

  False when:
  - a trace on another RTG;
  - a device jackpoint;
  - an unwired jackpoint.
- `reachable` with `mapped`:
  - hub → second tier refused unmapped, allowed mapped;
  - second tier → hub never needs it;
  - an open-access move never needs it.
- The redirect TN.

**Quench `sr2e.vr2-grids` additions:**
- a grid trace on the LTG survives LTG → RTG → LTG (still ticking), and dies on Logon to Host, with a "loses
  interest" card;
- a tick right after a successful logon to a host doesn't count, even when the move is synced in that tick's pass;
- out to a host and back to the LTG before the GM's pass: the trace is still lost;
- a failed attempt on another scope, then back: the suppression is still there;
- a frozen trace that loses interest gives the Detection Factor point back;
- a Track is untouched by grid moves and network moves, and adds nothing to a network move's TN;
- a suppression carries LTG → RTG and is gone on another RTG;
- a governing trace completes: the GM's **Dump the decker** exits with dump shock. A non-governing one has no button;
- hub → second tier:
  - refused until Analyze Subsystem (Access) succeeds;
  - a hidden-on-Control hub needs Control;
  - the logon TN includes the hub trace's rating;
  - success kills the hub trace and clears the hub's tally;
- a failed network move keeps the hub trace;
- two redirects on one LTG count once; on two LTGs, twice. The redirect card's TN uses the jackpoint's trace
  modifier;
- topology off: the trace, redirects and hosts are unchanged.

## 7c in detail: satellite links

Builds on 7a and 7b as released (0.132.0, 0.133.0). The pages behind it were rendered for this section (2026-11-05):
**Satellite Links** (p.30), **Satlink Interface** (p.88), and the Random Host System-Rating Table (p.31).
- **p.30.**
  - "A decker [who] taps directly into a communications satellite … trades higher Access target numbers for partial
    immunity to Trace IC. Signal lag over the satlink also reduces Reaction by −2."
  - "While Trace IC can locate the satellite jackpoint, it cannot pinpoint the decker's physical location, making
    physical response to the Matrix intrusion impossible. The other effects of a successful trace still apply."
  - "To access the Matrix via a satellite, a decker must have a deck equipped with a satlink interface … The Base Time
    to isolate the satellite and lock onto its transponder is 3 minutes … a successful Computer Test against a target
    number based on the conditions … Satlink Target Numbers Table":
    - open country, clear view of horizon 2;
    - some obstructions 3;
    - mountains or heavy forest 6;
    - suburban 3;
    - light urban 6;
    - downtown urban 8;
    - bad weather (more than overcast) +2.
  - "Failure to achieve any successes means … fails to locate the satellite or lock on to its transponder … another
    attempt after five minutes or so, and more frequently in dire situations."
  - "For game purposes, satellites function as LTGs but are classified as Orange-Average or even Orange-Hard systems
    with no reduction in Subsystem Ratings. Rate military and private corporate comsats as Red-Hard."
  - "Once the decker locates the satellite, he can perform a Logon to LTG operation to access it. From the satellite,
    a decker can perform a Logon to RTG operation to any RTG on earth. He can access most systems in near-earth orbit
    as well, if they use that particular satellite."
  - "Security tallies generated on a satellite carry over to the RTG that the decker accesses."
- **p.28 (Jackpoints):** satellite uplink: Trace Factor "see p.30", Access +2, Base Bandwidth 50. 7a already applies
  the +2. Bandwidth stays out of scope.
- **p.88 (Satlink Interface):** a deck-mounted interface plus a dish.
  - A large portable dish reduces the locate TN by 1, and a fixed-base earth station by 2.
  - The standard dish and the temporary spray-polymer dish change nothing.
  - Dish prices and interface construction belong to the purchase and deck-building systems: out of scope.
- **p.31:** Average systems: Security Value 1D3+6, subsystems 2D3+9. Hard: 2D3+6 and 1D6+12. "No reduction in
  Subsystem Ratings" means these rolls stand as rolled, unlike the unlisted public grid's −2.

All of 7c needs `vr2Topology`, except the satlink's Reaction −2, which applies whenever the Matrix uses VR2.0 and the
connection's jackpoint kind is satellite (the kind's numbers already apply then).

### 1. The satlink interface
- `deckModeFields()` gains:
  - `satlink`, a BooleanField, initial false;
  - `satDish`, a StringField from `standard | large | fixed | temporary`, initial `standard`, `blank: false`.
- These are the same fields ICCM uses. They live on deck items and the manual `system.cyberdeck`, and
  `_snapshotActiveDeck` copies them: add both to its `keys` and its `blank` defaults.
- The deck sheet and the manual cyberdeck block get a checkbox and a dish select, beside ICCM.
- Migration: none. The defaults mean "no satlink", which is true of every existing deck.

### 2. Satellites are places
- `HostData.kind` gains `satellite`. That is a choice added to an existing StringField, so existing documents stay
  valid. 7a's trap check applies after the schema change: reload and check `invalidDocumentIds`.
- In the pure rules (`module/rules/vr2-grids.mjs`):
  - `GRID_KINDS` includes `satellite`: a satellite is a grid ("functions as an LTG").
  - `GRID_OPS.satellite` = the LTG's operations (Redirect Datatrail).
  - `scopeOf` → `satellite_<id>`, its own scope and owner, so a satellite's own sheaf fires.
  - `traceClass` → `grid: true` with that scope. A trace started there loses interest when the decker leaves the
    satellite (7b's rule, with the satellite as the "same RTG" set of one).
- `reachable`, on a satellite S:
  - Logon to RTG → any RTG ("to any RTG on earth");
  - Logon to Host → any host with `grid` = S ("near-earth orbit … if they use that particular satellite");
  - Logon to LTG → nothing.
- **New grid…** gains a **Satellite** choice: Orange-Average, Orange-Hard or Red-Hard (military or corporate). It
  rolls the p.31 dice in a visible chat roll, with no reduction, and creates a `kind: satellite` host. The pure
  `satelliteRatings(difficulty, dice)` is tested on every boundary.

### 3. Reaching the satellite
**Wiring (R1 #2).** For a `satellite` jackpoint, `wiredPlace` returns the wired place when it is a satellite, else
null (any satellite). `wiringFits` requires a satellite. Before this, both helpers treated a satellite jackpoint as
trid and wanted an LTG; Vitest covers the new branch.

**From a satellite jackpoint.** At a satellite-kind jackpoint (7a's snapshot, `connJackpoint(actor).kind ===
"satellite"`), `reachable` with no place allows only Logon to LTG, and only to a `kind: satellite` place. That
replaces 7a's interim "a satellite jackpoint acts as trid". If the jackpoint is wired to a satellite, it must be that
one; unwired, any satellite.

Two conditions, both checked in `reachable`, with the caller passing them in:
- **a satlink deck:** `actor.system.cyberdeck.satlink`. Without it: "This deck has no satlink interface (VR2.0
  p.88)";
- **a lock on that satellite (R1 #1):** `flags.sr2e.vr2SatLock = { conn, card, ok, sat }` with this connection's
  `conn`, `ok` true, and `sat` equal to the target. A lock is on ONE satellite: the transponder the decker isolated.
  Without it: "Lock on to <satellite> first (Locate satellite, p.30)".

**Locate satellite.** A new Matrix-tab button, shown under topology while the decker is at a satellite jackpoint
with no place yet. Its dialog:
- **Conditions:** the six rows of the table, with their TN;
- **Bad weather:** a checkbox for +2;
- **Dish:** from the deck's `satDish`. Large −1, fixed-base −2, never below 2.
- **Satellite (R1 #1):** the one to lock onto. It is fixed to the jackpoint's wired satellite when it has one, and
  otherwise picked from the `kind: satellite` places. The record keeps its UUID as `sat`.

It is a Computer Test with Hacking Pool and Karma, as other Computer Tests (a skill test, not a System Test: no host
rolls, no tally).
- **Successes > 0:** locked. The card says "isolated and locked on in 3 minutes ÷ successes" (SR2 base time).
  The test runs in the `vr2op` queue, and the decker's client writes `vr2SatLock { conn, card, ok: true, sat }` (R2 #1).
  The card's `flags.sr2e.satLock` carries `{ conn, sat }`.
- **0 successes:** the card says "no lock; another try in about five minutes (sooner in dire situations)". The
  timing is the GM's (p.30: "as a rule of thumb"). Retrying replaces the lock record.
- **Karma:** 7a's `updateChatMessage` hook also watches this card. A reroll that turns 0 into a success rewrites the
  whole record from the card's own `{ conn, sat }`, with `ok: true` for that `card`, so `sat` is never lost. It does
  so only while the record (if any) has that same `card`. Deleting the card changes nothing.
- A new connection needs a new lock. The record carries `conn`.

### 4. On the satellite
- **The tally carries to the RTG** (p.30, "carry over to the RTG that the decker accesses"). This reuses 7a's PLTG
  carry exactly:
  - a Logon to RTG from a satellite snapshots `carry = { tally: scopeTally(actor, satellite) }`;
  - on its first `ok`, the carry event adds `max(0, carry − the RTG scope's seed)`, `exact` (no trace
    acceleration), crossing the RTG's sheaf then;
  - the condition in `systemTestNow` becomes: target is a PLTG, OR the decker is on a satellite and the operation is
    Logon to RTG.
- **Reaction −2** (signal lag; VR2.0, satellite jackpoint, topology on or off; R1 #3): in the Matrix-initiative branch
  of `getInitiative` (documents/actor.mjs ~972). It is read from `connJackpoint(actor).kind`.
  - It applies to the FINAL Matrix Reaction: after tortoise halving and Response Increase, before the wound
    penalty. That gives `base = max(0, naturalReaction + bonus − 2 − woundPenalty)`, the existing floor, so the full
    2 always counts (Reaction 1 + Response 3: 7 → 5).
  - The note says "satlink lag −2". The dice are unchanged.
- **Trace finds the satellite, not the decker** (p.30):
  - a trace that completes on a connection whose jackpoint kind is satellite still marks the decker traced (the tally
    acceleration and the −1 to IC attacks; "the other effects … still apply");
  - `noticeTraces`' located card replaces the physical-location text and the Security Asset Response Times table with
    "It locates the satellite uplink: no physical location, so no physical response is possible (VR2.0 p.30)";
  - `governsJackpoint` is false for a satellite jackpoint, so there's never a dump button. A satellite jackpoint
    isn't wired to an RTG's LTG, and the p.47 dump needs "the RTG that governs the decker's jackpoint".
- **The datatrail step on exit** (part 3: a trace still running when the decker leaves keeps the jackpoint findable
  for 1D6−1 turns) still runs. What a late lock finds is the satellite, and the step's card says so.

### 5. Tests (7c)
**Vitest:**
- `satelliteRatings` on the min and max of every die;
- `scopeOf` and `traceClass` for a satellite;
- `reachable`:
  - from a satellite jackpoint, refused without a satlink, refused without a lock, refused for a satellite other
    than the locked one, then allowed (only its wired one when wired);
  - `wiredPlace` and `wiringFits` for satellite jackpoints;
  - the Reaction lag on Reaction 1 with Response 3, and on a tortoise deck;
  - on a satellite: any RTG, its hosts, no LTG;
- `GRID_OPS.satellite`;
- the locate TN from conditions, weather and dish, floored at 2.

**Quench `sr2e.vr2-grids` additions:**
- a satellite jackpoint with no satlink deck: Logon to LTG refused;
- with one: refused until **Locate satellite** succeeds, then onto the satellite;
- a Karma reroll on a failed lock locks on;
- the satellite's tally carries into the RTG when the logon succeeds, and only then;
- the initiative note shows −2 Reaction on a satellite connection;
- a completed trace on a satellite connection: the decker is traced, and the card says no physical location, with no
  dump button;
- topology off: a satellite jackpoint still gives Access +2 and −2 Reaction, and nothing else changes.

## Key decisions & trade-offs
- **Grids are Host actors**, not a new type: zero changes to System Tests, IC and alerts. The cost: a GM must create
  an actor per grid they care about. Presets make that one click.
- **The topology is a directed link list**, set by the GM on each place, plus implicit rules: an LTG's hosts, an RTG's
  LTGs, a PLTG's members. There is no graph editor; open question 2 asks whether a drawn map on the Matrix scene is
  wanted.
- **Setting-gated**, because most tables run Matrix scenes loosely, and forced navigation would block GM shortcuts.

## Risks / open questions
1. Host tallies stay per host (today's rule). Confirm nothing in pp.26–36 carries a grid tally onto a host. The renders
   above say only RTG → PLTG and satellite → RTG.
2. ~~Visual map?~~ **Decided 2026-11-03.** The user's rule is the most complete and correct thing, so everything the
   pages above describe is in scope: 7a, 7b and 7c, the optional Variable LTG Ratings (p.28, as its own world setting),
   the satellite rules, and the hub/second-tier rules.
   - The map itself isn't a rule. The places' own sheets list their links ("reachable from here") so the GM can check
     the topology.
   - Drawing them on the Matrix scene is a later nicety.
   - The optional Bandwidth rule (p.90–91) stays a separate later part: it belongs to deck construction, not topology.
3. **Migration:** `HostData.kind` defaults to "host", so existing hosts are unaffected. Grid actors are new. Check
   `invalidDocumentIds` after the schema add ([[sr2e-stringfield-blank-trap]]).
4. **Concurrency:** navigation is admission. Two devices logging the same decker onto different places must resolve to
   one session. The existing `sessionQueue` and the server-ordered connection log already serialize this; the plan
   relies on them, and Codex should probe it.
5. ~~Tables at 300 dpi~~ **Done 2026-11-04:** both tables are transcribed to `tools/data/vr2-rtg-ratings.tsv` from
   300-dpi renders, 50 rows.
   - Germany's bold entries are RTGs, and the indented ones are LTGs under them.
   - The asterisk (PLTG entry point) is kept, and so is the spelling: "Tir Tairngire" without an accent in the North
     American table.

6. ~~Console rounding~~ **Decided 2026-11-04 (user):** round up (Access 7 → 4, Security Value 5 → 3).

## Documentation (part of done)
- **Wiki:** "The Matrix" section, plus a How-To-Guides walkthrough for anything that takes the GM or the decker more
  than one step, with screenshots and a GIF of the flow in use.
- **In Foundry:** `npm run gen-guides && npm run build-packs guides` ships the how-to, with its images, in the SR2E
  Player Guides pack.

## Out of scope
- The optional Bandwidth rule (p.90–91): a separate later part (deck construction).
- Matrix Law (p.132).
- Comcalls beyond the existing operations.
- UV hosts' special reality (p.36–37).
- Security Asset Response Times (p.47) as automation. It could be a GM roll button later.
