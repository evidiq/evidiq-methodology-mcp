# subagent-driven-development

> Fresh subagent per task. Two-stage review. Fix loop (5 rounds). Ledger file. Adapted from
> obra/superpowers `subagent-driven-development`, specialized so the tasks are EVIDIQ-specific
> (build, test, deploy, verify, register) and the fix loop bottoms out at `systematic-debugging`.

---

## When to use

- PLAN.md is frozen with §12 milestones decomposed into bite-sized tasks, and you want to delegate
  execution to subagents rather than drive each task yourself.
- The build is large (>8 tasks) and parallelization helps.
- A task is well-scoped (one file, one test) and a fresh context will execute it cleanly.

Do **not** use this for a 2-task build — `executing-plans` with you driving is faster. Do **not**
use this for debugging a live failure — `systematic-debugging` owns that. Do **not** let a subagent
cross task boundaries (no "and also fix the other thing").

---

## What it does

Fresh subagent per task keeps each context clean and stops prompt rot. The pattern (from
obra/superpowers, adapted):

1. **Ledger file** — `evidiq-<slug>-mcp/.ledger.md` (gitignored). One row per task: id, status
   (pending/in-review/blocked/done), assignee note, result link. The ledger is the source of truth
   for what's done.
2. **Fresh subagent per task** — each subagent gets: the task paragraph from §12, the relevant
   reference files (PLAN.md §0/§17, the sibling file to mirror, the runbook section), and a crisp
   definition of done (tests GREEN + `tsc --noEmit` clean + no §17 order change). It does NOT get the
   whole session history — fresh context.
3. **Two-stage review** — when the subagent reports done:
   - **Stage 1 (machine gate):** `npm test` + `npx tsc --noEmit` in the service folder. Both must be
     green. If red, back to the subagent with the failure output.
   - **Stage 2 (human/parent review):** you read the diff against the task scope. Did it touch only
     the intended file? Did it reorder the pattern catalogue (§17 freeze)? Did it add a model call
     (defect #12)? Did it add a fallback signer (defect #1)? If any concern, back to the subagent.
4. **Fix loop (5 rounds max)** — a task that fails review goes back to the same subagent (resume its
   session if possible) with the specific failure. After 5 rounds, STOP — escalate to
   `systematic-debugging` (4-phase root cause) rather than retrying blindly.
5. **EVIDIQ-specific task kinds** — the §12 tasks fall into: build a tool + its RED test, write a
   pattern-catalogue entry, wire the x402 challenge shape, port `lib/x402/` from a sibling, port
   `lib/og/` real 0G from Sentinel/Notary, write `deploy/run.sh`, write the service `skill.md`. Each
   kind has a reference file to mirror.
6. **MCP tools during subagent work** — subagents may call the verification MCP tools (`diff_capabilities`,
   `validate_plan_sections`, `scan_git_history`) as part of their definition-of-done when the
   service is deployed; for local-only tasks they run `npm test` + `tsc --noEmit`.

---

## EVIDIQ specialization (vs obra/superpowers `subagent-driven-development`)

| obra/superpowers | EVIDIQ subagent-driven-development |
|---|---|
| Fresh subagent per task | Same |
| Two-stage review | Same, **plus** stage-1 is the EVIDIQ gate (`npm test` + `tsc --noEmit`), stage-2 includes the §17 freeze + defect checks |
| Fix loop | 5 rounds, then escalate to `systematic-debugging` (not infinite retry) |
| Generic tasks | EVIDIQ kinds: tool+test, catalogue entry, x402 shape, lib port, run.sh, skill.md |
| Ledger | `.ledger.md` (gitignored) — one row per §12 task |
| Verification | Subagents call the 9 MCP tools at the deploy boundary |

---

## The task brief a subagent receives

A good task brief is self-contained (the subagent has no session history):

```
Task: <id> — <one-line>
File: <path>
Mirror: <sibling file path>  (e.g. ../evidiq-bulwark-mcp/lib/x402/okx.ts)
References: PLAN.md §<n>, ../EVIDIQ-RUNBOOK.md §<n>, ../EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md §<n>
§0 defects: <the 16> (carry forward)
Definition of done:
  - RED test in test/<area>.test.ts fails first, then passes
  - npm test green (all tests)
  - npx tsc --noEmit clean
  - no §17 pattern-catalogue order change
  - no model/fetch/Math.random in verdict path (defect #12)
  - no fallback signer string (defect #1)
Do NOT: touch files outside <scope>; register on OKX; deploy; run a paid call.
```

---

## Procedure

1. Read PLAN.md §12 milestones. Decompose into tasks if not already bite-sized.
2. Create `.ledger.md` with one row per task (status: pending).
3. Pick the next pending task. Mark it in-review. Dispatch a fresh subagent with the task brief.
4. Subagent reports done → stage-1 review (`npm test` + `tsc --noEmit`). Red → return to subagent
   with failure output (fix loop round N).
5. Stage-1 green → stage-2 review (diff vs scope + §17/defect checks). Concern → return to subagent.
6. Both stages pass → mark done in ledger. Pick next task.
7. Fix loop hits round 5 → STOP, escalate to `systematic-debugging`.
8. All tasks done → hand off to `phased-deployment` (the §12 tasks produce code + tests; deploy is
   the next phase).

---

## MCP tools subagents may call

- **`validate_plan_sections`** — if a task touches PLAN.md (rare; PLAN is frozen before this skill).
- **`diff_capabilities`** — once deployed, to confirm defect #8 (capabilities == tools/list).
- **`scan_git_history`** — before any push, to confirm no leaked keys in new commits.
- **`check_git_toplevel`** — before any push (defect #16).

Most subagent work is local `npm test` + `tsc --noEmit`; the MCP tools come at the deploy/push
boundary.

---

## Defects this skill specifically prevents

#11 (detectors tested only in convenient form — subagents write transport tests, not just library
tests), #12 (model in path — stage-2 review checks), #1 (fallback signer — stage-2 review checks),
the §17 freeze violation (stage-2 review checks).

---

## Stop / handoff

- **Stop:** all §12 tasks done in the ledger, stage-1 + stage-2 green for each, fix loop never hit
  round 5 (or escalated + resolved).
- **Handoff to:** `phased-deployment` — code + tests are green locally; deploy Phase 1 next.
- **Do NOT deploy from this skill.** Subagents build + test; deployment has its own gates.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §2 (prereqs: `npm test` + `tsc --noEmit`), §3 (Phase 1), §15
  (defects).
- `../evidiq-bulwark-mcp/test/` — canonical test split (detector + report + x402) that subagents
  mirror.
- `systematic-debugging` skill — the 4-phase escalation when the fix loop bottoms out.
