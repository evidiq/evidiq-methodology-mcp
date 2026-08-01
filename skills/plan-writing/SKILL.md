# plan-writing

> Write PLAN.md with **§0 defects carry-forward**, **§17 contract freeze**, and **two-phase scope**
> (Phase 1 bypass → Phase 2 x402 gate). Bite-sized TDD tasks. Adapted from obra/superpowers
> `writing-plans`, specialized so a frozen EVIDIQ PLAN.md is the contract the whole build asserts
> against.

---

## When to use

- `spec-brainstorming` has frozen the design + §17 contract and handed off.
- The user says "write the PLAN" / "write the spec" / "write PLAN.md" for an EVIDIQ MCP.
- A PLAN.md exists but is missing §0, §17, or the two-phase scope — rewrite it.
- Before `subagent-driven-development` or `executing-plans` — both consume PLAN.md as the task list.

Do **not** use this before the design is frozen — that's `spec-brainstorming`'s hard gate. Do **not**
use this for a post-ship tweak to an existing service; write a small CHANGELOG note instead.

---

## What it does

PLAN.md is the implementation handoff for an EVIDIQ MCP. A fresh agent in a new tab reads it top to
bottom and then `../EVIDIQ-X402-RUNBOOK.md` and `../EVIDIQ-RUNBOOK.md` §23/§24/§26/§41. This skill
encodes the mandatory structure so no section is ever missing.

### Mandatory sections of an EVIDIQ PLAN.md

1. **Header** — service name, one-line description, status, "two-phase build" banner.
2. **Scope of this task** — Phase 1 (bypass, test, **do NOT register**) vs Phase 2 (gate on,
   register, prove). Explicit stop gate in Phase 1.
3. **§0 Defects this project has already paid for (carry forward)** — the full 16, with the
   service-specific consequences (see Bulwark PLAN.md §0 for the canonical wording). Every defect
   gets a one-line "how this project avoids it". This section is **non-negotiable**; the
   `validate_plan_sections` MCP tool checks for it.
4. **§1 What it is, in one line.**
5. **§2 Why** (deterministic, paid, anchored).
6. **§3 Tool inventory** — 10 tools, 5 paid (atomic prices) + 5 free, with input schemas and exact
   output shapes.
7. **§4 Determinism contract + the 4 invariants** — trace consistency, violation-count consistency,
   verdict determinism, integrity digest. What is excluded from the digest (§17 list).
8. **§5 Input contract** — what the agent sends; `validate_*` parity with paid tools (defect #10).
9. **§6 Pattern catalogue / evaluation rules** — frozen, ordered. No model (defect #12).
10. **§7 Report shape** — `executionId`, `verdict`, `trace`, `violations`, `receipt.reportDigest`,
    `receipt.signature`, `zeroGAnchorTx`, `zeroGStorageRoot`.
11. **§8 x402 pricing** — atomic `AssetAmount` strings, not USD (§23). The §41-C challenge shape.
12. **§9 Env** — `PORT`, `HOSTNAME`, `PUBLIC_BASE_URL`, `<SLUG>_X402_BYPASS=1` (Phase 1), signer key
    (no fallback — defect #1), OKX creds, `X402_*`, `OG_*`. Reference `/root/evidiq-<slug>.env`.
13. **§10 Deploy** — `deploy/run.sh` with `--env-file` (defect #15). Traefik labels. Port from §24
    registry (next free is 3016 for MCP #16).
14. **§11 Listing metadata** — 10 A2MCP services, fees matching §8, endpoint
    `https://mcp.evidiq.dev/<slug>/mcp`. `validate-listing` gate.
15. **§12 Milestones** — Phase 1 tasks (bite-sized, TDD) then Phase 2 tasks. Each task is a
    test-first unit the subagent can pick up.
16. **§13 Release checklist** — the §23 / playbook §3.4–§4.7 gate list.
17. **§14 Open questions** — if any.
18. **§15 References** — runbook sections, sibling PLANs.
19. **§16 Two-phase gate** — explicit "Phase 1 stop: do not register / do not activate / do not run
    a paid call".
20. **§17 Contract freeze** — "This contract is frozen. Changes require explicit user approval."
    The 4 invariants + the digest field list live here.

### Bite-sized TDD task shape (§12)

Each task is:
- one paragraph,
- names the file it touches,
- names the test it writes first (RED),
- names the implementation that turns it green,
- is independently assignable to a fresh subagent (see `subagent-driven-development`).

No task is "build the whole server". Tasks like "add `scan_prompt_injection` handler + RED test for
clean input → ALLOW" are the right granularity.

---

## EVIDIQ specialization (vs obra/superpowers `writing-plans`)

| obra/superpowers | EVIDIQ plan-writing |
|---|---|
| Generic plan, file-by-file tasks | Same, **plus** §0 + §17 + two-phase scope are mandatory |
| No defect memory | §0 carries the 16 fleet defects forward, each with a project-specific mitigation |
| No payment phasing | Phase 1 bypass / Phase 2 gate is structural — Phase 1 has an explicit stop gate |
| No verification hook | PLAN.md must pass `validate_plan_sections` (called by this skill + at handoff) |
| Atomic prices N/A | §8 prices are `AssetAmount` atomic strings, with the §41-C challenge shape inline |

---

## Procedure

1. **Ingest the frozen design** from `spec-brainstorming` (contract, catalogue, tool inventory,
   prices, §17 invariants).
2. **Open `../evidiq-bulwark-mcp/PLAN.md`** as the canonical template — copy its section shape, not
   its domain content.
3. **Write §0** — the 16 defects, each with a one-line "how this project avoids it". This is the
   section most often skipped and most often regretted.
4. **Write the body sections §1–§16** in order. Prices in §8 are atomic. Env in §9 lists every var
   (no fallbacks — defect #1). Deploy in §10 references `deploy/run.sh` + `--env-file` (defect #15).
5. **Write §17 contract freeze** — the 4 invariants + the digest exclusion list + the freeze line.
6. **Decompose §12 milestones** into bite-sized TDD tasks (one paragraph, one file, one test).
7. **Call `validate_plan_sections`** on the draft. Fix any missing section it reports. Re-run until
   green.
8. **Present PLAN.md to the user** for freeze approval. Once approved, §17 is immutable for the
   build; deviations require explicit re-approval.

---

## MCP tools this skill calls

- **`validate_plan_sections`** — `params: { planPath: "<service>/PLAN.md" }` (or `planContent`).
  Returns `{ ok, missing: [...], present: [...] }`. Required sections: §0 defects, §17 freeze,
  two-phase scope, tool inventory, determinism contract, env, deploy, release checklist. Run it
  on the draft and again at handoff.

---

## Defects this skill specifically prevents

#1 (fallback signer — env section forbids it), #7 (estimate_cost — §3 inventory constrains it),
#8 (capabilities — §3 forces 10 tools), #12 (model in path — §6 forbids it), #15 (env-file — §10
mandates run.sh), #16 (wrong repo — §10 + git-hygiene).

---

## Stop / handoff

- **Stop:** PLAN.md frozen (§17 line present), `validate_plan_sections` green, user approved.
- **Handoff to:** `executing-plans` (if the user drives the batch) or
  `subagent-driven-development` (if delegating to subagents). Both consume §12 milestones as the
  task list.
- **Do NOT start coding in this skill.** Hand off first.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §1 (sequencing), §3 (Phase 1), §4 (Phase 2), §15 (defects).
- `../evidiq-bulwark-mcp/PLAN.md` — canonical frozen PLAN.md (831 lines, §0 + §17 + two-phase).
- `../EVIDIQ-RUNBOOK.md` §23 (payments), §24 (port + folder rules), §26 (clean-copy), §41 (challenge).
