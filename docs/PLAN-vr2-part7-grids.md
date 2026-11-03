# Plan: VR2.0 part 7: grid topology
_Draft 0 (2026-11-03). Not yet Codex-reviewed. No code before review._

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
2. Is a visual network map wanted (drawing the links on the Matrix scene from the topology), or only the dialogs?
3. **Migration:** `HostData.kind` defaults to "host", so existing hosts are unaffected. Grid actors are new. Check
   `invalidDocumentIds` after the schema add ([[sr2e-stringfield-blank-trap]]).
4. **Concurrency:** navigation is admission. Two devices logging the same decker onto different places must resolve to
   one session. The existing `sessionQueue` and the server-ordered connection log already serialize this; the plan
   relies on them, and Codex should probe it.
5. The PDF's North American / Overseas tables need a second careful pass at 300 dpi before transcription. Dense tables
   misalign ([[sr2e-source-captures]]).

## Out of scope
- The optional Bandwidth rule (p.90–91).
- Matrix Law (p.132).
- Comcalls beyond the existing operations.
- UV hosts' special reality (p.36–37).
- Security Asset Response Times (p.47) as automation. It could be a GM roll button later.
