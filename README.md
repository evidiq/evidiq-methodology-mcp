# EVIDIQ Methodology — Agentic MCP Fleet Production Framework

> Battle-tested skills framework + verification MCP for building, testing, deploying, and
> registering x402-paid MCP services on OKX.AI. Adapted from [obra/superpowers](https://github.com/obra/superpowers)
> but specialized for the EVIDIQ fleet workflow (15 MCP services shipped, 16 hard-won lessons).
>
> This single repo ships both parts:
> - **`skills/`** — 15 markdown methodology skills that auto-trigger in any coding agent
>   (spec → freeze → TDD → bypass-test → x402 gate → OKX register → docs sync).
> - **MCP server** (root: `server.ts`, `lib/`, `deploy/`, `Dockerfile`) — 9 free verification
>   tools the skills call during the workflow. Port 3016, infrastructure (no x402 gate).

---

## Why this, why now

[obra/superpowers](https://github.com/obra/superpowers) proved that codified methodology skills make
coding agents dramatically more reliable. But obra/superpowers is **generic software dev** — it
doesn't know about x402 payments, OKX.AI registration, deterministic contract freeze, EIP-191
signers, 0G anchoring, or the 16 defects EVIDIQ has already paid for.

Every new EVIDIQ MCP (#1–#15) went through the same manual process — and every time, the ops agent
re-discovered the same gates, the same checklist, the same mistakes. **EVIDIQ Methodology codifies
this into skills that auto-trigger**, so the next MCP (#16+) goes through the battle-tested pipeline
without human re-explanation. The companion MCP server adds what obra/superpowers can't do: **live
verification tools** that check git history for leaked keys, validate x402 challenge format (§41-C),
query OKX listing status, and verify determinism — callable by the skills during the workflow.

---

## Repo layout

```
evidiq-methodology-mcp/
├── skills/                    # 15 SKILL.md methodology skills (markdown — not in Docker image)
│   ├── using-evidiq-methodology/
│   ├── spec-brainstorming/
│   ├── plan-writing/
│   ├── tdd-implementation/
│   ├── phased-deployment/
│   ├── x402-verification/
│   ├── okx-registration/
│   ├── documentation-sync/
│   ├── security-audit/
│   ├── subagent-driven-development/
│   ├── executing-plans/
│   ├── git-hygiene/
│   ├── writing-skills/
│   ├── systematic-debugging/
│   └── verification-before-completion/
├── lib/                       # MCP server libs (validators, scanners, okx, plan, verify, catalog)
├── test/                      # vitest suite (48 tests)
├── deploy/run.sh              # docker run with --env-file (defect #15)
├── server.ts                  # 9 free MCP tools (no payment gate)
├── start-server.ts            # port 3016, HEAD explicit (defect #14)
├── skill.md                   # service skill (copied into Docker image)
├── Dockerfile                 # multi-stage build (COPY server.ts/lib/skill.md only)
├── package.json               # @evidiq/methodology-mcp
├── PLAN.md                    # frozen spec (15 skills + 9 tools + 16 defects)
└── EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md  # frozen 1144-line operational playbook
```

The Dockerfile only `COPY`s `server.ts`, `start-server.ts`, `lib/`, `skill.md` — the `skills/`
markdown stays out of the image (it's for agents loading via `.claude`/`.opencode`/git clone).

---

## The 15 Skills

### Core Workflow Skills

| # | Skill | Purpose |
|---|---|---|
| 1 | [`spec-brainstorming`](skills/spec-brainstorming/SKILL.md) | Design review with frozen contract (§17). Hard gate: no code until frozen + user approves. |
| 2 | [`plan-writing`](skills/plan-writing/SKILL.md) | PLAN.md with §0 defects, §17 freeze, two-phase scope, bite-sized TDD tasks. |
| 3 | [`tdd-implementation`](skills/tdd-implementation/SKILL.md) | RED-GREEN-REFACTOR with vitest. 33+ tests. Deterministic invariants. No model in verdict path. |
| 4 | [`phased-deployment`](skills/phased-deployment/SKILL.md) | Phase 1 bypass → run.sh deploy → curl sweep → 10-tool test. Phase 2 gate on. |
| 5 | [`x402-verification`](skills/x402-verification/SKILL.md) | §23 release checklist: free 200, unpaid 402, §41-C decode, payment quote, paid replay → settle → 0x1. |
| 6 | [`okx-registration`](skills/okx-registration/SKILL.md) | Pre-check canCreate, avatar, validate-listing, create ASP + 10 services, activate → read submitApproval. STOP. |
| 7 | [`documentation-sync`](skills/documentation-sync/SKILL.md) | README (proven table, badge, arch, verif log), landing (docs.ts, page.tsx, hero SVG), runbook (§24, §NN, X402 §13). Commit + push. |
| 8 | [`security-audit`](skills/security-audit/SKILL.md) | Git history scan, .git toplevel check (defect #16), no hardcoded keys, no WWW-Authenticate, no fallback signer. |

### Meta Skills

| # | Skill | Purpose |
|---|---|---|
| 9 | [`subagent-driven-development`](skills/subagent-driven-development/SKILL.md) | Fresh subagent per task. Two-stage review. Fix loop. Ledger. EVIDIQ-specific tasks. |
| 10 | [`executing-plans`](skills/executing-plans/SKILL.md) | Batch execution with checkpoints. Human gates at: freeze, Phase 1 pass, Phase 2 pass, OKX submit. |
| 11 | [`git-hygiene`](skills/git-hygiene/SKILL.md) | Service folder owns .git (defect #16). Push via GITHUB_TOKEN env helper. Force-push when purging secrets. |
| 12 | [`writing-skills`](skills/writing-skills/SKILL.md) | Create new EVIDIQ skills following the fleet pattern. Test against existing services. |
| 13 | [`using-evidiq-methodology`](skills/using-evidiq-methodology/SKILL.md) | Bootstrap / intro. Session-start hook lists available skills. |

### Debugging Skills

| # | Skill | Purpose |
|---|---|---|
| 14 | [`systematic-debugging`](skills/systematic-debugging/SKILL.md) | 4-phase root cause. Specialized for x402 settlement timeout, OKX rejection, env-file, name mismatch. |
| 15 | [`verification-before-completion`](skills/verification-before-completion/SKILL.md) | Live curl cross-verification. Diff tools/list vs *_capabilities. Determinism (2× same input). Capability diff (10/10). |

---

## The 9 MCP Verification Tools (port 3016, all free)

| Tool | Purpose | Called by skill |
|---|---|---|
| `scan_git_history` | Scan all commits in a repo for private keys (EVM 0x64hex), GitHub PATs (`ghp_`), OKX creds, mnemonics. | `security-audit` |
| `check_git_toplevel` | Verify `git rev-parse --show-toplevel` returns the service folder, not the ops root. Defect #16. | `git-hygiene` |
| `validate_x402_challenge` | Decode base64 challenge, verify §41-C compliance (v2, exact, eip155:196, asset, payTo, maxTimeout:300). WWW-Authenticate absent. | `x402-verification` |
| `check_okx_status` | Query `onchainos agent get-agents --agent-ids <N>`, parse approvalLabel + approvalRemark. | `okx-registration` |
| `validate_plan_sections` | Check PLAN.md has all required sections (§0 defects, §17 freeze, two-phase scope, tool inventory, determinism, env, deploy, release checklist). | `plan-writing` |
| `verify_determinism` | Call a free MCP tool 2× with same input, compare deep JSON equality. (Paid-tool digest comparison is a manual playbook step — not callable without payment header.) | `verification-before-completion` |
| `diff_capabilities` | Compare tools/list vs *_capabilities.tools, report match/mismatch. | `verification-before-completion` |
| `curl_sweep` | HEAD/GET/POST sweep with --max-time 10, report status + timing + hangs. | `phased-deployment` |
| `methodology_capabilities` | List all 15 skills, 9 tools, and the 16 defects. | `using-evidiq-methodology` |

---

## The 16 Defects (carry-forward — every skill carries these)

1. Fallback signing key in source
2. Claim derived from config, not check
3. Free tool erroring on `{}`
4. Enum/regex in free-tool schema causing 402
5. "Not found" returned as error (isError)
6. Verdict about nothing
7. `estimate_cost` inventing answers
8. Capabilities describing half the service
9. Stated capability with no implementation
10. Charging then rejecting input
11. Detectors tested only in convenient form
12. Model in deterministic hot path
13. x402 header mistakes (WWW-Authenticate, error in base64, GET /mcp 200)
14. HEAD /mcp hang
15. Container without env-file
16. Wrong repo content on GitHub push (no own .git)

Full checklist: [`EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md`](EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md) §15.

---

## Session Flow

```
Agent session starts
    ↓
[using-evidiq-methodology] — bootstrap, list skills, carry §0 defects
    ↓
User: "build MCP #16"
    ↓
[spec-brainstorming] — HARD GATE: no code until design frozen + user approves
    ↓                    (6 rounds of determinism audit, pattern catalogue normatization)
    ↓
[plan-writing] — PLAN.md with §0 + §17, two-phase scope, bite-sized TDD tasks
    ↓                    [validate_plan_sections]
    ↓
[subagent-driven-development] — fresh subagent per task, fix loop, ledger
    ↓                    (tasks call MCP tools for verification)
    ↓
[tdd-implementation] — vitest RED-GREEN-REFACTOR, 33+ tests
    ↓
[phased-deployment] — Phase 1: bypass, deploy, curl sweep, OpenClaw test
    ↓                    [curl_sweep] [diff_capabilities] [verify_determinism]
    ↓
[x402-verification] — Phase 2: gate on, §23 checklist
    ↓                    [validate_x402_challenge] [scan_git_history]
    ↓
[okx-registration] — create ASP, activate, STOP
    ↓                    [check_okx_status]
    ↓
[documentation-sync] — README + landing + runbook + commit + push
    ↓                    [check_git_toplevel]
    ↓
[security-audit] — final git history scan, .git check
    ↓
Done. Fleet +1.
```

---

## Installation

### OpenClaw (primary EVIDIQ agent)
```bash
openclaw mcp add evidiq-methodology --transport streamable-http --url https://mcp.evidiq.dev/methodology/mcp
```

### Claude Code
```bash
claude mcp add --transport http evidiq-methodology https://mcp.evidiq.dev/methodology/mcp
```

### Any MCP client
Skills are markdown — can also be loaded directly from this repo's `skills/` directory as `.claude/`
or `.opencode/` skills.

---

## Boundary vs obra/superpowers

| Aspect | obra/superpowers | EVIDIQ Methodology |
|---|---|---|
| Domain | Generic software dev | MCP fleet production (x402 + OKX.AI) |
| Skills count | 13 | 15 (13 adapted + 2 new) |
| Verification | Manual / test-based | MCP tools (live x402 decode, OKX status, git scan, determinism) |
| Defects | Generic anti-patterns | 16 fleet-specific (from 15 real MCP builds) |
| Payment | None | x402 v2 gate knowledge (§41-C, exact scheme, USDT0) |
| Registration | None | OKX.AI ASP create + activate flow |
| Determinism | TDD | Contract freeze + RFC 6979 + pattern catalogue + array ordering |

---

## License

MIT. See [LICENSE](LICENSE).
