# Plan Review Log: Spell Defense for allies
Started 2026-09-25. MAX_ROUNDS=5.

## Round 1 — Codex
- **“A card resolves once” is false for ordinary defenders.** [rollSpellResistance](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3275) marks resolution only for the card’s author or GM; another player can repeatedly apply damage and reuse every grant. **Fix:** persist a defender-authored resolution receipt and check it before granting or resisting, with duplicate-execution protection.

- **Allied magicians cannot see most area target cards.** [_postAreaResults](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:2010) whispers them only to the caster, GMs, and target owners; adding a button does not make it accessible. **Fix:** provide a grant-request route accessible to allied defenders while preserving target-card privacy.

- **Grant spending is neither serialized nor failure-safe.** Two dialogs can spend the same remaining dice, and deduction followed by failed message creation loses dice without delivering protection. **Fix:** serialize spending per magician across clients and use uniquely identified, recoverable grant transactions.

- **Shielding is not specified sufficiently to remain “unchanged.”** [Allocation](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:2980) stores Shielding separately, while current resistance consumes both stores; the proposed grant contains only `n` and eligibility checks only ordinary Spell Defense. **Fix:** specify Shielding eligibility, selection, grant accounting, and consumption explicitly, including Shielding-only balances.

- **Unbound cards have no grant target.** [Single-target casting](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1784) can create `targetUuid: ""`, and resistance later falls back to the selected actor. **Fix:** require an explicit recipient for unbound cards and normalize actor/token UUIDs consistently before matching grants.

- **The new resistance dialog introduces cancellation and stale-balance hazards.** Elemental aid currently spends Force before rolling; allocation, [clearSpellDefense](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3187), and [pool refresh](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2737) can change balances while the dialog is open. **Fix:** confirm first, then revalidate and commit current pool balances and elemental reservation before rolling; cancellation must spend nothing.

- **The proposed tests miss the architecture’s main failure modes.** A happy-path grant test will not expose whisper visibility, nonauthor resolution, duplicate spending, Shielding, or refresh during an open dialog. **Fix:** add targeted coverage for those cases plus canceled resistance with elemental aid and failed grant creation.

VERDICT: REVISE
### Claude's response
Rewrote the plan and accepted all 7 points: grants are keyed by (cast test, target actor), made from public cards; per-magician queue with refund-on-failure; Shielding is explicit; unbound cards pick a target; resolution receipts; confirm-first with revalidation; expanded tests.

## Round 2 — Codex
- **Area targeting now leaks information.** The proposed public summary lists every caught target, whereas [_postAreaResults](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1946) deliberately whispers target information. **Fix:** keep the public attack identifier but let allies select a visible token without publishing the caught-target list.

- **An ally still cannot check whether a private card resolved.** Grants use an attack/actor key, but resolution receipts contain only a private `card.id`. **Fix:** include the attack/actor key in a resolution record accessible to grantors and check that record before spending.

- **Attack-keyed grants can be reused across cards.** [_resolveAreaCast](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1929) collects tokens without deduplicating linked actors; multiple cards can therefore share one grant key while resolving independently. **Fix:** deduplicate area resistance cards by the normalized attack/actor key and enforce consumption at that same key.

- **The acknowledged concurrency race permits unpaid protection and duplicate damage.** Client-local queues and guards do not coordinate a player with another owner or GM; even one client’s grant queue does not cover resistance, clear, allocation, or refresh. **Fix:** serialize all competing mutations through one elected authority and enforce one resolution claim per attack/target.

- **Refunding `n` is insufficient with two differently sourced balances.** A Shielding spend must not become refundable Magic Pool dice through [clearSpellDefense](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:3187), and restoring a pre-refresh balance can resurrect cleared dice. **Fix:** record the ordinary/Shielding debit split and allocation generation, then reconcile failed grants against that generation.

- **A grant can succeed after resistance has already selected its dice.** Checking “unresolved” does not prevent grants during the interval between the final grant snapshot and the outcome message; such grants are spent but never rolled. **Fix:** publish a resistance claim that closes grant acceptance before taking the final snapshot.

- **The area checklist includes targets with no automated resistance card.** Zero-success targets and GM-adjudicated objects appear among caught targets, but [_postAreaResults](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1993) skips their cards. **Fix:** validate that the selected attack/target has an open automated resistance before accepting payment.

VERDICT: REVISE
### Claude's response
Accepted 1, 2, 3, 5 and 6: no public target list, a public resolvesAttack record, area de-dup, an exact refund split, and a claim that closes grants. #4 is accepted only as far as message ordering and re-reads (no GM relay, by design; documented). #7 is rejected: a grantor cannot see whispered cards, and dice spent protecting an unaffected target are simply spent (documented).

## Round 3 — Codex
The documented cross-client race and spending on unaffected targets are explicit tradeoffs. These concrete gaps remain:

- **Equal timestamps lose dice without protection.** Resistance includes only grants *before* the claim, while refunds require a claim *before* the grant; equal timestamps satisfy neither. **Fix:** define complementary acceptance/refund predicates, with an explicit tie rule, and test equal timestamps.

- **Refunds can resurrect cleared allocations.** If refresh occurs between deduction and refund, restoring `{ sd, shield }` adds defense on top of a fully refreshed Magic Pool; clearing defense during that interval also receives the wrong refund destination. **Fix:** track allocation generations and reconcile refunds against intervening clear/refresh operations instead of blindly restoring the split.

- **Claims have no failure or retry lifecycle.** An exception after claim creation permanently blocks further grants, while retrying resistance creates another claim with an ambiguous cutoff; failures after elemental payment can also charge Force twice. **Fix:** persist a resumable attempt with one claim cutoff and recorded payment stages, releasing it only when safely aborted before payment.

- **Refund-then-delete is not idempotent.** If refund succeeds but grant deletion fails, retrying cleanup can refund the same grant again. **Fix:** track a durable refund transaction state and make both refund and grant exclusion idempotent.

VERDICT: REVISE
### Claude's response
Simplified instead of adding lifecycle. Claims and timestamps are gone: the resolution records usedGrants, and unused grants refund once (marked on the grant first), gated by a defence generation so cleared or refreshed dice never come back. An elemental-aid failure follows the existing receipt.

## Round 4 — Codex
- **The elemental retry guarantee does not exist.** [elementalTransition](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/elementals.mjs:184) has no resistance-attempt receipt or deduplication; retrying with a new attempt can charge Force again. **Fix:** persist and resume the original attempt’s payments, including own defense and Magic Pool deductions.

- **Generation changes incorrectly discard refundable dice.** Allocation adds ordinary defense rather than replacing it, and clearing returns ordinary defense to Magic Pool; neither supports “those dice would have gone anyway.” **Fix:** distinguish additive allocation, clear, and refresh, restoring ordinary dice to the appropriate balance while handling Shielding separately.

- **The creation-failure refund bypasses generation checks.** “No intervening refresh is possible on this client” is false unless refresh, clear, allocation, and resistance also use the magician’s queue. **Fix:** route all relevant local mutations through that queue and apply lifecycle-aware refund handling on creation failure too.

- **Marking `refunded` before restoring dice makes failed refunds permanent.** If the actor update fails after the message update succeeds, future handling skips dice that were never returned. **Fix:** atomically record a refund ID with the actor’s balance restoration, then mark the grant refunded; retries must check that ID.

- **Offline grantors miss refunds permanently.** A grantor disconnecting before resolution receives neither the post-creation check nor the live `createChatMessage` event. **Fix:** reconcile outstanding authored grants against resolution records on reconnect, using the same idempotent refund path.

VERDICT: REVISE
### Claude's response
The refund machinery was the source of every point, so it is removed. Following the rules as written, dice are expended at the grant; a grant that lands after the resistance is simply spent and visible via usedGrants. The only refund left is an immediate one when grant creation throws. Elemental aid is unchanged (existing path). That makes #1 through #5 moot.

## Round 5 — Codex
- **The grant queue excludes other mutations of the same balance.** Granting and self-resisting concurrently can spend the same dice twice. Also, “same call” does not make the creation-failure refund atomic: clear or refresh can run during the awaited message creation, after which restoring the split resurrects cleared defense. **Fix:** serialize grants, self-defense spending, allocation, clear, and refresh through the same per-magician queue, including rollback; test these interleavings.

VERDICT: REVISE
### Claude's response
Accepted: all Spell Defense mutations on a client share the per-magician queue, and the GM-client refresh is documented as cross-client. MAX_ROUNDS was reached with only this point outstanding, and it is applied as proposed. Proceeding to build.
