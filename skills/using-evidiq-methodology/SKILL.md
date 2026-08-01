# using-evidiq-methodology

> Bootstrap / intro skill. Load this first at session start — it lists the available skills,
> carries the 16 defects forward, and points the agent at the production playbook.

---

## When to use

- At the **start of any session** that will build, deploy, verify, or register an EVIDIQ MCP service.
- When a fresh agent opens a new tab to ship "MCP #16" and needs the methodology index.
- When the user asks "what skills are available" or "how do I build an MCP the EVIDIQ way".
- When you are unsure which skill triggers next in the session flow.

Do **not** use this for a single quick edit (one file, no methodology) — just do the edit.

---

## What it does

This is the entry point of the EVIDIQ Methodology framework. It:

1. Loads the **16 §0 defects** into working memory — every other skill assumes you carry these.
2. Prints the **session flow** (spec → plan → TDD → deploy → verify → register → docs → audit).
3. Points at the two canonical references every EVIDIQ build reads top to bottom:
   - `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` — the frozen, step-by-step operational guide (1144 lines,
     every command + every gate). A fresh agent reads this and follows it.
   - `EVIDIQ-RUNBOOK.md` §23 (payments), §24 (folder registry + rules), §26 (mistakes),
     §41 (x402 challenge format + WWW-Authenticate trap).
4. Tells the agent which skill to invoke next based on the current state.
5. Calls the `methodology_capabilities` MCP tool to list skills + triggers + defects live.

---

## The session flow (memorize this)

```
[using-evidiq-methodology]  ← you are here (bootstrap, carry §0 defects)
    ↓ user: "build MCP #16"
[spec-brainstorming]        HARD GATE — no code until design frozen + user approves
    ↓
[plan-writing]              PLAN.md with §0 + §17, two-phase scope, bite-sized TDD tasks
    ↓                       call validate_plan_sections
[subagent-driven-development] fresh subagent per task, fix loop, ledger
    ↓                       (tasks call MCP tools for verification)
[tdd-implementation]        vitest RED-GREEN-REFACTOR, 33+ tests
    ↓
[phased-deployment]         Phase 1 bypass → deploy → curl sweep → OpenClaw 10-tool test
    ↓                       call curl_sweep, diff_capabilities, verify_determinism
[x402-verification]         Phase 2 gate on, §23 release checklist
    ↓                       call validate_x402_challenge, scan_git_history
[okx-registration]          create ASP, activate, STOP (no poll)
    ↓                       call check_okx_status
[documentation-sync]        README + landing + runbook + commit + push
    ↓                       call check_git_toplevel
[security-audit]            final git history scan, .git toplevel check, no leaked keys
    ↓
Done. Fleet +1.
```

---

## The 16 §0 defects (carry forward — every skill reads these)

```
 1. Fallback signing key in source        9.  Stated capability with no implementation
 2. Claim derived from config, not check  10. Charging then rejecting input
 3. Free tool erroring on {}              11. Detectors tested only in convenient form
 4. Enum/regex in free-tool schema → 402  12. Model in deterministic hot path
 5. "Not found" returned as error         13. x402 header mistakes (WWW-Authenticate, base64 error, GET 200)
 6. Verdict about nothing                 14. HEAD /mcp hang
 7. estimate_cost inventing answers       15. Container without env-file
 8. Capabilities describing half service  16. Wrong repo content on GitHub push (no own .git)
```

Full text of each: `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §15. The `security-audit` skill (and the
`scan_git_history` + `check_git_toplevel` MCP tools) check for these automatically.

---

## MCP tool this skill calls

- **`methodology_capabilities`** — returns the live catalog: all 15 skills with triggers, the 9 MCP
  tools with purposes, and the 16 defects. Call this once at bootstrap to confirm the verification
  MCP is reachable (port 3016). If unreachable, fall back to reading this directory — the skills are
  still usable as pure markdown; only the live verification tools go quiet.

---

## How to decide what runs next

| User signal / current state | Next skill |
|---|---|
| "build MCP #16" / no PLAN.md yet | `spec-brainstorming` (design review, freeze contract) |
| PLAN.md exists but `tsc`/`npm test` not green | `tdd-implementation` |
| Tests green, not deployed | `phased-deployment` (Phase 1 bypass) |
| Phase 1 deployed + 10-tool test passed, gate still bypassed | `x402-verification` (Phase 2) |
| Phase 2 proven (paid call settled 0x1) | `okx-registration` |
| Registered (agent activate submitted) | `documentation-sync` |
| Docs synced, not pushed | `security-audit` then push |
| Something broke (402 malformed, settle timeout, OKX rejected) | `systematic-debugging` |
| User asks to plan build batches + checkpoints | `executing-plans` |
| User wants to delegate tasks to subagents | `subagent-driven-development` |

---

## Hard rules the agent must hold across the whole session

1. **No code before contract freeze.** `spec-brainstorming` ends with a frozen §17 and explicit user
   approval. Until then, push back on any "let's just start writing server.ts".
2. **Two-phase, never one.** Phase 1 = `X402_BYPASS=1` deploy + full 10-tool test; Phase 2 = gate on
   + proven paid call. Skipping Phase 1 redispatches every Phase 1 bug into a paid-call failure.
3. **No listing before a proven paid call.** §24 rule 4, §23 — register/activate only after a settle
   tx with `status 0x1` is recorded. This gate is the whole lesson of §23.
4. **All OKX / `onchainos` ops on the VPS**, via `ssh hackaton-do 'bash -lc "onchainos …"'`.
   `web3.okx.com` is blocked from the workstation.
5. **Deploy only via `deploy/run.sh`** (includes `--env-file`). Manual `docker run` → defect #15.
6. **Service folder owns its `.git`.** Before any push, `git rev-parse --show-toplevel` must return
   the service folder, NOT `/home/cucu/Coder/EVIDIQ`. `git init` if missing. Defect #16.
7. **Official OKX Payment SDK only.** Copy `lib/x402/okx.ts` from Sentinel/Atlas/Bulwark. Never
   hand-roll a settler. §23.
8. **Prices are `AssetAmount` atomic strings**, never USD strings. §23.
9. **Free tools never 402.** Capabilities/validate/estimate handle `{}` without throwing, no enum
   schemas. Defects #3, #4.
10. **No `WWW-Authenticate` header** on a 402. Use `payment-required` + `x-payment-required`. §41-A.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` — frozen operational playbook, read top to bottom.
- `PLAN.md` (this repo) — the frozen 15-skills + 9-tools spec.
- `../EVIDIQ-RUNBOOK.md` §23, §24, §26, §41.
- `../EVIDIQ-X402-RUNBOOK.md` — payment protocol reference.
