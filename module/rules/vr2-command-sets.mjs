/**
 * VR2.0 part 6c: command sets (docs/archive/plans/PLAN-vr2-part6-frames.md, "6c in detail"; VR2.0 pp.104–105). Pure: the state of a
 * set is folded from the durable facts on its host, never stored.
 */

/** Hours a loaded set runs undetected (p.105): 24 ÷ the host's summed successes; 48 when it scored none. Fractional. */
export const csHours = (sum) => (Number(sum) > 0 ? 24 / Number(sum) : 48);

/**
 * The step list: the open fact's steps, then EVERY change in seq order, each replacing the list from its `from` (§1,
 * R2 #3): a settled step is never rewritten (a change's `from` is the settled count when it was written).
 */
export function csStepList(open, changes = []) {
  let steps = [...(open?.steps ?? [])];
  for (const c of [...changes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) steps = [...steps.slice(0, c.from), ...(c.steps ?? [])];
  return steps;
}

/**
 * A set's state (§1). `steps` are its settled `csStep` facts, `changes` its `csSteps`, `marks` its `csMark`.
 * @returns {{status: "pending"|"failed"|"loaded"|"executed"|"purged"|"cancelled", next: number|null, nextSub: string|null,
 *   list: string[], sum: number, hours: number|null, loadedAt: number|null, purgeAt: number|null, undetected: boolean}}
 */
export function csState({ open, steps = [], changes = [], marks = [], now = 0 } = {}) {
  const list = csStepList(open, changes);
  const settled = [...steps].sort((a, b) => a.n - b.n);
  const sum = settled.reduce((n, s) => n + (Number(s.hostSuccesses) || 0), 0);
  const failed = settled.some(s => !s.success);
  const done = !failed && settled.length >= list.length && list.length > 0;
  const loadedAt = done ? (settled.at(-1)?.at ?? 0) : null;
  const hours = done ? csHours(sum) : null;
  const purgeAt = done ? loadedAt + hours * 3600 : null;
  const mark = [...marks].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0]?.what ?? null;
  let status = mark ?? (failed ? "failed" : done ? "loaded" : "pending");
  if (status === "loaded" && now >= purgeAt) status = "purged";
  const next = status === "pending" ? settled.length : null;
  return { status, next, nextSub: next == null ? null : list[next] ?? null, list, sum, hours, loadedAt, purgeAt,
    undetected: status === "loaded" };
}

/** Which actions a set's status admits (§1, R2 #2). */
export const csAdmits = (status, action) => ({ settle: status === "pending", steps: status === "pending", cancelled: status === "pending",
  executed: status === "loaded", purged: status === "loaded" })[action] ?? false;
