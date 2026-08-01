# EVIDIQ Methodology MCP — Fleet Production Verification Service

Nine **free** verification tools that the EVIDIQ Methodology skills call during the MCP fleet
production workflow. This is **infrastructure**, not a paid service — there is no x402 payment gate,
no signer, no OKX credentials, and no 0G anchoring. Every tool returns HTTP 200.

The skills (15 markdown files, shipped in the companion `evidiq-methodology` repo) guide any coding
agent through spec → freeze → TDD → bypass-test → x402 gate → OKX register → docs sync. This MCP
server provides the **live verification** the skills can't do by hand: scan git history for leaked
keys, validate the x402 §41-C challenge shape, query OKX listing status, verify determinism, diff
capabilities, and sweep endpoints for the HEAD-hang defect.

---

## Service Overview

- **Service Name**: `EVIDIQ-Methodology`
- **Public Endpoint**: `https://mcp.evidiq.dev/methodology/mcp`
- **Host Port**: `3016` (MCP #16 in the §24 registry)
- **Payment Gate**: none (all 9 tools free — infrastructure)
- **Container env**: `PORT`, `HOSTNAME`, `PUBLIC_BASE_URL` only

---

## 9 Tools Specification (all FREE)

### Fleet Security & Verification

1. **`scan_git_history`** — FREE
   - Walks `git log -p --all` of a repo and regex-scans every commit diff for leaked EVM private keys
     (`0x` + 64 hex), GitHub PATs (`ghp_` / `github_pat_`), OKX creds, mnemonics, and PAT-in-URL.
     Returns a hit list (commit hash + file + matched pattern). Defect #1 detection.
   - Input: `{ repoPath: string }`.
2. **`check_git_toplevel`** — FREE
   - Runs `git rev-parse --show-toplevel` and compares to the expected folder. Catches defect #16
     (service folder inheriting the ops root `.git` → wrong content pushed to the public repo).
   - Input: `{ repoPath: string }`.
3. **`validate_x402_challenge`** — FREE
   - Decodes a base64 x402 v2 challenge (or reads `payment-required` / `x-payment-required` /
     `WWW-Authenticate` from raw headers) and verifies §41-C compliance: `x402Version:2`,
     `scheme:"exact"`, `network:"eip155:196"`, `asset:"0x779ded0c9e1022225f8e0630b35a9b54be713736"`,
     `payTo:"0x2a8efe3093278bb4bd3b2d9c7b5ba992ca4fc9b0"`, `maxTimeoutSeconds:300`,
     `extra:{name:"USD₮0",version:"1"}`. Confirms `WWW-Authenticate` is absent (§41-A trap).
   - Input: `{ challengeBase64?: string, headers?: object }`.
4. **`check_okx_status`** — FREE
   - Queries `onchainos agent get-agents --agent-ids <id>` and parses `approvalLabel`,
     `statusLabel`, `communicationAddress`, `approvalDisplayStatus`, `approvalRemark`. If `onchainos`
     is not reachable from the MCP environment, returns the exact manual command to run on the VPS.
   - Input: `{ agentId: number | string }`.

### Plan & Catalog

5. **`validate_plan_sections`** — FREE
   - Checks a PLAN.md (by path or inline content) for the mandatory EVIDIQ sections: §0 defects
     carry-forward, §17 contract freeze, two-phase scope, tool inventory, determinism contract, env,
     deploy, release checklist. Returns present + missing lists.
   - Input: `{ planPath?: string, planContent?: string }`.
6. **`methodology_capabilities`** — FREE
   - Returns the live catalog: all 15 skills (name, trigger, purpose), the 9 MCP tools (name,
     purpose, calledBy), and the 16 §0 defects (number, title, how-to-prevent). Bootstrap
    confirmation that the verification MCP is reachable.

### Live Endpoint Verification

7. **`verify_determinism`** — FREE
   - Calls a **free** MCP tool on a target service 2× with identical input and deep-compares the
     JSON responses. Paid-tool `reportDigest` comparison is a manual playbook step (not callable
     without a payment header). If the target tool returns 402, reports that determinism for paid
     tools is not supported by this tool.
   - Input: `{ targetUrl: string, toolName: string, arguments?: object }`.
8. **`diff_capabilities`** — FREE
   - Compares a service's `tools/list` vs its `*_capabilities.tools` and reports match/mismatch.
     Catches defect #8 (capabilities describing half the service) + #9 (stated capability with no
     implementation). Expects a 10/10 match for a healthy EVIDIQ service.
   - Input: `{ targetUrl: string, capabilitiesTool: string }`.
9. **`curl_sweep`** — FREE
   - HEAD/GET/POST sweep of a service's `/health`, `/x402`, `/skill.md`, `/mcp` endpoints with a
     10-second timeout per request. Reports status + timing + hang flag per method/path. Catches
     defect #14 (HEAD `/mcp` hang) which rejected three EVIDIQ listings at once.
   - Input: `{ baseUrl: string }`.

---

## x402 Payment Instructions

**None.** This service has no payment gate. Every tool is free and returns HTTP 200. There is no
`payment-required` header, no 402, no `WWW-Authenticate`, no `PAYMENT-RESPONSE`. The
`validate_x402_challenge` tool *decodes and validates* the challenge of other (paid) EVIDIQ
services; it does not itself require payment.

---

## Install in OpenClaw

```bash
openclaw mcp add evidiq-methodology --transport streamable-http --url https://mcp.evidiq.dev/methodology/mcp
```

## Quickstart (curl)

```bash
# List all 9 tools
curl -s -X POST https://mcp.evidiq.dev/methodology/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Bootstrap catalog (skills + tools + 16 defects)
curl -s -X POST https://mcp.evidiq.dev/methodology/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"methodology_capabilities","arguments":{}}}'
```

---

## The 16 Defects this service helps catch

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

`scan_git_history` → #1. `check_git_toplevel` → #16. `validate_x402_challenge` → #13.
`diff_capabilities` → #8/#9. `verify_determinism` → #12 (free-tool parity). `curl_sweep` → #14.
`check_okx_status` → reads rejection reasons (#13-rooted). `validate_plan_sections` → ensures #1,
#12, #15 are designed-in. `methodology_capabilities` → carries all 16.

---

## License

MIT. See [LICENSE](LICENSE).
