# executing-plans

> Batch execution with checkpoints. Human gates at: contract freeze, Phase 1 pass, Phase 2 pass, OKX
> submit. Adapted from obra/superpowers `executing-plans`, specialized so the checkpoints are the
> EVIDIQ two-phase gates (not generic milestones).

---

## When to use

- The user is driving the build themselves (not delegating to subagents) and wants a batch execution
  rhythm with explicit stop points.
- PLAN.md is frozen and you want to execute §12 milestones in batches with review between.
- The user says "execute the plan" / "run the plan" / "keep going until the next gate".

Do **not** use this if delegating to subagents — `subagent-driven-development` owns that. Do **not**
use this to skip a human gate — the gates are where the user approves spending real money (Phase 2)
or submitting to OKX.

---

## What it does

Executes PLAN.md §12 milestones in batches, stopping at each human gate for approval. The EVIDIQ
gates are non-negotiable checkpoints; passing one unlocks the next batch.

### The 4 human gates

1. **Contract freeze gate** (end of `spec-brainstorming` / start of `plan-writing`) — the §17
   contract + design is frozen, user approved. Until this gate passes, no code.
2. **Phase 1 pass gate** (end of `phased-deployment` Phase 1) — bypass build deployed, 10-tool test
   green, capability diff 10/10, determinism identical, scan verdicts correct. User approves
   turning on the gate (Phase 2 spends real USDT0). **The README "Proven on-chain" section stays
   `TODO` here.**
3. **Phase 2 pass gate** (end of `x402-verification`) — settle tx `0x1` recorded, `attest_*` 0G
   anchor real, `onchainos payment quote` all-green, `validate_x402_challenge` ok,
   `scan_git_history` clean. User approves OKX registration.
4. **OKX submit gate** (end of `okx-registration`) — `submitApproval` approvalStatus:2 success:true.
  User approves `documentation-sync` (writing docs with the real agent ID) + `security-audit` +
  push.

### The batch rhythm

- **Batch A (pre-freeze):** design audit rounds, §17 contract draft. → Gate 1.
- **Batch B (build):** §12 milestones — tools + tests + lib ports + run.sh + skill.md. Local `npm
  test` + `tsc --noEmit` green. → (no gate; handoff to deploy).
- **Batch C (Phase 1):** env file, rsync, docker build, deploy, curl sweep, 10-tool test,
  determinism. → Gate 2.
- **Batch D (Phase 2):** remove bypass, redeploy, free 200 / paid 402, §41-C decode, payment quote,
  top-up, paid call → settle → `0x1`, 0G anchor. → Gate 3.
- **Batch E (register):** preflight, service JSON, avatar, validate-listing, create ASP, activate,
  read submitApproval. → Gate 4.
- **Batch F (docs + audit + push):** README, landing, runbook, landing rebuild, commit + push all
  repos, security-audit. → "Fleet +1."

Between batches, report what passed + what's next + which gate is approaching. Wait for the user at
each gate.

---

## EVIDIQ specialization (vs obra/superpowers `executing-plans`)

| obra/superpowers | EVIDIQ executing-plans |
|---|---|
| Batch execution + checkpoints | Same, **plus** the 4 gates are the EVIDIQ two-phase + OKX gates |
| Generic milestones | §12 TDD tasks (build) + playbook batches (deploy/verify/register/docs) |
| No money gating | Phase 2 gate = "about to spend real USDT0" — user must approve |
| No external submission | OKX submit gate = "about to list publicly" — user must approve |
| Resume | Ledger/task list tracks where you are in the batch sequence |

---

## How to resume after a stop

If the session breaks and resumes, identify the current batch by checking:
- No frozen PLAN.md §17 → Batch A (or earlier).
- PLAN.md frozen, tests not green → Batch B.
- Tests green, not deployed → Batch C (Phase 1).
- Phase 1 green, gate still bypassed → waiting at Gate 2.
- Gate on, no settle tx → Batch D (Phase 2).
- Settle `0x1` recorded, no agent ID → waiting at Gate 3.
- Agent ID exists, `submitApproval` not read → Batch E.
- Registered, docs not synced → Batch F.

Then continue from the right batch. Re-verify the previous gate's evidence before proceeding (don't
trust memory — re-run the cheap checks).

---

## Procedure

1. Identify current batch (resume logic above).
2. Execute the batch's tasks in order (each task follows `tdd-implementation`'s RED-GREEN-REFACTOR
   for code tasks, or the playbook section for deploy/verify/register/docs tasks).
3. At the batch's gate, stop. Report: what passed, evidence (test counts, settle tx hash, agent ID),
   what the next batch will do, what it will cost (Phase 2 = real USDT0; OKX submit = public
   listing).
4. Wait for user approval. Do not cross a gate without it.
5. After approval, proceed to the next batch.
6. After Batch F + `security-audit` clean → "Fleet +1."

---

## MCP tools this skill coordinates

This skill is the orchestrator — it doesn't call tools itself, it sequences the skills that do:
- Batch B: `tdd-implementation` (+ `diff_capabilities`, `validate_plan_sections` at the boundary).
- Batch C: `phased-deployment` (`curl_sweep`, `diff_capabilities`, `verify_determinism`).
- Batch D: `x402-verification` (`validate_x402_challenge`, `scan_git_history`).
- Batch E: `okx-registration` (`check_okx_status`).
- Batch F: `documentation-sync` (`check_git_toplevel`) + `security-audit` (`scan_git_history`,
  `check_git_toplevel`).

---

## Defects this skill specifically prevents

The "skip Phase 1" mistake (Phase 1 gate is a hard stop), the "register before proven" mistake (§24
rule 4 — Gate 3 enforces it), the "push without .git check" mistake (Batch F includes
`security-audit` before push).

---

## Stop / handoff

- **Stop at every gate.** Do not cross without user approval. The expensive gates (Phase 2, OKX
  submit) especially.
- **Handoff within batches:** to `tdd-implementation` (Batch B), `phased-deployment` (Batch C),
  `x402-verification` (Batch D), `okx-registration` (Batch E), `documentation-sync` + `security-audit`
  (Batch F).
- **Final:** "Fleet +1." Update runbook §24 status when OKX approves.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §1 (sequencing — the whole playbook is the batch reference).
- `using-evidiq-methodology` session flow — the skill order this skill sequences.
- `../EVIDIQ-RUNBOOK.md` §24 (rules — gate 3 = rule 4 "no listing before proven paid call").
