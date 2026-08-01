# phased-deployment

> EVIDIQ-specific. Phase 1: `X402_BYPASS=1`, deploy via `deploy/run.sh` (with `--env-file`), curl
> sweep (HEAD/GET/POST, no hang), OpenClaw 10-tool test. Phase 2 removes the bypass, enables the
> x402 gate, verifies free 200 / paid 402. No equivalent in EVIDIQ methodology — this is pure fleet
> methodology.

---

## When to use

- `tdd-implementation` is green (`npm test` + `tsc --noEmit` both pass) and the service needs to go
  live on the VPS.
- A service is deployed but Phase 1 (bypass) tests haven't been run yet.
- Phase 1 passed and the user says "turn on the gate" / "go Phase 2".
- After a code change — redeploy and re-run the curl sweep + 10-tool test.

Do **not** use this before tests are green. Do **not** use this for OKX registration (that's
`okx-registration`, and it requires Phase 2 proven first). Do **not** skip Phase 1 — every Phase 1
bug otherwise becomes a paid-call failure in Phase 2.

---

## What it does

EVIDIQ ships in two phases because the §23 release checklist is expensive (real paid calls settle
real USDT0). Phase 1 verifies the service works end-to-end for free; Phase 2 verifies the payment
gate works end-to-end for real money.

### Phase 1 — bypass build + test (no x402)

1. **Create `/root/evidiq-<slug>.env` on the VPS** with `X402_BYPASS=1` (or `<SLUG>_X402_BYPASS=1`)
   plus the full X402 + OKX + OG vars from the start (saves a redeploy at Phase 2). Copy signer +
   OKX creds from a sibling env (e.g. `/root/evidiq-aegis.env`). `chmod 600`. Playbook §3.1.
2. **rsync + docker build + deploy via run.sh** — playbook §3.2:
   ```bash
   rsync -az --exclude node_modules --exclude dist --exclude .git --exclude .env -e ssh . hackaton-do:/root/evidiq-<slug>-src/
   ssh hackaton-do 'cd /root/evidiq-<slug>-src && docker build -t evidiq-<slug>:latest . 2>&1 | tail -5'
   ssh hackaton-do 'cd /root/evidiq-<slug>-src && bash deploy/run.sh'
   ```
   **Defect #15:** `deploy/run.sh` MUST include `--env-file`. Never manual `docker run`.
3. **Wait for health** — playbook §3.3 (`docker inspect … Health.Status` polling).
4. **Curl sweep** — playbook §3.4. HEAD must not hang (defect #14). `/health` must show
   `paymentGate:"bypassed", signerAvailable:true`. Endpoints: `/<slug>/health`, `/<slug>/x402`,
   `/<slug>/skill.md`, `/<slug>/mcp` (HEAD + GET + POST tools/list). All 200, all <0.5s.
   **Call `curl_sweep`** to run this.
5. **OpenClaw 10-tool test** — playbook §3.5. Install the MCP in OpenClaw on the VPS; call every
   tool via direct MCP protocol (curl is more reliable than `openclaw mcp call`). Free tools → 200.
   Paid tools (bypass) → 200, not 402. Checks: defect #7 (`estimate_cost {toolName:"fake"}` →
   `known:false`), defect #5 (`verify_*_report {}` → `valid:false`, not isError; `get_artifact
   {id:"x"}` → `found:false`, not isError), defect #8 (`<slug>_capabilities.tools` == `tools/list`,
   10/10 — **call `diff_capabilities`**).
6. **Scan verdict verification** — playbook §3.6. Malicious sample → BLOCK; clean sample → ALLOW.
7. **Determinism test** — playbook §3.7. Call `attest_*` 2× (bypass = free), compare `reportDigest`
   + `signature` — must be IDENTICAL. Exclude §17 fields. **(Phase 1 bypass lets the paid attest
   tool run free, so digest determinism is testable here without spending USDT0.)**
8. **STOP GATE** — playbook §3.9. **Do NOT register, do NOT `agent activate`, do NOT run a real
   paid call.** README "Proven on-chain" stays `TODO`. Hand off to `x402-verification` for Phase 2.

### Phase 2 — gate on + proven paid call (entry point only; the full checklist is `x402-verification`)

1. **Remove the bypass line** from `/root/evidiq-<slug>.env`, redeploy via `run.sh`, wait for health.
2. **Verify gate enforced** — `/<slug>/health` shows `paymentGate:"enforced", signerAvailable:true`.
3. **Free 200 / paid 402** — playbook §4.2.
4. **Hand off to `x402-verification`** for §41-C decode, `onchainos payment quote` all paid tools,
   top-up, real paid call → settle → receipt `0x1`. That skill owns the money-spending steps.

---

## EVIDIQ specialization (no EVIDIQ methodology equivalent)

| Concept | EVIDIQ phased-deployment |
|---|---|
| Payment phasing | Phase 1 bypass / Phase 2 gate is structural; Phase 1 has a hard stop gate |
| Deploy command | Always `deploy/run.sh` with `--env-file` (defect #15) |
| Reachability test | HEAD/GET/POST sweep with `--max-time 10`; HEAD hang = defect #14 (rejected 3 listings) |
| Capability parity | `<slug>_capabilities.tools` == `tools/list`, 10/10 (defect #8) via `diff_capabilities` |
| Free-tool no-throw | Capabilities/validate/estimate handle `{}` (defects #3, #4, #5) |
| Determinism | 2× attest → identical digest + sig (RFC 6979) — testable free in Phase 1 bypass |

---

## Procedure (Phase 1)

1. Confirm `npm test` + `tsc --noEmit` green (the `tdd-implementation` handoff).
2. Create the VPS env file (playbook §3.1). Include ALL vars now (bypass + X402 + OKX + OG).
3. rsync → docker build → `bash deploy/run.sh` (playbook §3.2).
4. Wait for health (playbook §3.3).
5. **Call `curl_sweep`** → `params: { baseUrl: "https://mcp.evidiq.dev/<slug>" }`. Expect all 200,
   no hangs, HEAD <0.5s.
6. OpenClaw 10-tool test (playbook §3.5) via curl.
7. **Call `diff_capabilities`** → `params: { targetUrl, capabilitiesTool: "<slug>_capabilities" }`.
   Expect 10/10 match.
8. **Call `verify_determinism`** → `params: { targetUrl, toolName: "<slug>_capabilities", arguments:
   {} }`. Expect `deterministic:true` (response identical). For the real `reportDigest` determinism,
   run the manual playbook §3.7 step (2× `attest_*` via curl, compare digest + sig).
9. Run scan verdict checks (malicious → BLOCK, clean → ALLOW).
10. **STOP.** Do not register. Hand off to `x402-verification` for Phase 2.

---

## MCP tools this skill calls

- **`curl_sweep`** — `params: { baseUrl }`. HEAD/GET/POST sweep at `--max-time 10`. Returns status +
  timing + hang flag per method/path. Defect #14 detection.
- **`diff_capabilities`** — `params: { targetUrl, capabilitiesTool }`. tools/list vs
  `*_capabilities.tools`. Defect #8 detection.
- **`verify_determinism`** — `params: { targetUrl, toolName, arguments }`. 2× call, deep JSON
  equality. Free tools only (no payment header handling).

---

## Defects this skill specifically prevents

#3, #4, #5 (free-tool behavior, checked in the 10-tool test), #7 (`estimate_cost` fake-tool check),
#8 (capability diff), #14 (HEAD hang — `curl_sweep`), #15 (env-file — `run.sh` mandate).

---

## Stop / handoff

- **Phase 1 stop:** 10-tool test green, capability diff 10/10, determinism identical, scan verdicts
  correct. **Do NOT register.** README "Proven on-chain" stays `TODO`.
- **Phase 2 entry:** remove bypass, redeploy, verify gate enforced, free 200 / paid 402.
- **Phase 2 handoff to:** `x402-verification` (it owns the money-spending §23 checklist).

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §3 (Phase 1), §4.1–§4.2 (Phase 2 entry), §15 (defects #14, #15).
- `../EVIDIQ-RUNBOOK.md` §24 (port + folder rules — next free port 3016 for MCP #16), §26-A-2 (HEAD
  hang).
- `../evidiq-bulwark-mcp/deploy/run.sh` — canonical `run.sh` with `--env-file` + Traefik labels.
