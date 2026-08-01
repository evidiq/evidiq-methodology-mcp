# systematic-debugging

> 4-phase root cause. Specialized for: x402 settlement failures (timeout trap §23), OKX rejection
> analysis (read `approvalRemark`, not guessing), container env-file missing (defect #15), name
> mismatch (Bastion `validate_manifest` vs `validate_config`). Adapted from EVIDIQ methodology
> `systematic-debugging`, specialized for the failure modes the fleet has actually hit.

---

## When to use

- A deployed service misbehaves (402 malformed, settle timeout, HEAD hangs, free tool 402s).
- OKX rejected a listing — read the reason + root-cause it before resubmit.
- A container shows `signerAvailable:false` or missing creds (defect #15).
- A `subagent-driven-development` fix loop hit round 5 — escalate here.
- A determinism check fails (two calls, different digest) — find the non-determinism source.

Do **not** use this for "the test suite is red on a fresh feature" — that's `tdd-implementation`
RED debugging, not a deployed-system root cause. Do **not** guess-and-patch — phase 1 (reproduce) +
phase 2 (root cause) must precede any fix.

---

## What it does

EVIDIQ failures have a recurring shape. This skill forces the 4-phase discipline and points each
phase at the fleet-specific failure modes:

### Phase 1 — Reproduce (cheaply, deterministically)

- **402 malformed / OKX validator fails:** capture the EXACT 402 headers (`curl -D`), decode the
  `payment-required` base64, compare to §41-C. **Call `validate_x402_challenge`** with the captured
  base64. Common reproductions: `WWW-Authenticate` present (§41-A), `error` field inside the base64
  (§41-A), `GET /mcp` returns 200 not 402, `resource.url` from `req.url` not `PUBLIC_BASE_URL`,
  `amount` as USD string not atomic `AssetAmount`.
- **Settle timeout / 503 "settlement ambiguous":** reproduce with the cheapest paid tool. Check
  `PAYMENT-RESPONSE` — is there a tx hash? The facilitator `timeout` trap (§23): `status:"timeout"`
  with a tx that confirms seconds later.
- **HEAD hang:** `curl -s -m 10 -I …/mcp` — if it hangs >10s, defect #14. The handler doesn't answer
  HEAD explicitly.
- **Free tool 402s:** call `capabilities {}` / `validate_{}` / `estimate_cost {}`. If 402, defect
  #3/#4 (enum/regex schema rejecting `{}`).
- **Determinism fail:** 2× same input, compare `reportDigest`. If different, find the
  non-determinism source (timestamp/random/model/network/object-key order/array order in the
  digest). Check §17 exclusion list — `executionId`, `evaluationTimeMs`, `timestamp`, `zeroG*` SHOULD
  differ; the digest + signature MUST NOT.
- **`signerAvailable:false`:** `/<slug>/health` shows it. Almost always defect #15 (container
  started without `--env-file`).

### Phase 2 — Root cause (find the actual cause, not the symptom)

- **OKX rejection:** `onchainos agent get-agents --agent-ids <id>` → read `approvalRemark` LITERALLY.
  Do not guess. §23: "no reading the boilerplate rejection as anything other than the specific
  sentence OKX sent." Common real reasons: not using official OKX SDK, WWW-Authenticate header,
  endpoint unreachable (HEAD hang), challenge malformed.
- **Container creds missing (defect #15):** `docker inspect <container> --format '{{.Config.Env}}'`
  — are OKX/signer vars present? If absent, the deploy wasn't via `run.sh` (or `run.sh` lacks
  `--env-file`). Fix `run.sh`, redeploy.
- **Name mismatch (Bastion pattern):** `validate_manifest` vs `validate_config` — a tool name in
  `tools/list` doesn't match the handler registration, or `*_capabilities.tools` lists a different
  name. Run **`diff_capabilities`** to catch defect #8/#9.
- **Settle timeout (§23):** the facilitator's `syncSettle` wait elapsed before confirmation. Root
  cause is NOT "settlement failed" — it's "the SDK reported timeout before the tx confirmed."
  Required handling: bounded poll `client.getSettleStatus(tx)`. Check `lib/x402/okx.ts` has the poll
  loop (2s interval, 24s deadline, never infers success from timeout).
- **0G missing (`zeroGAnchorTx: undefined`):** check `lib/og/storage.ts` for `mockRoot`/`mockTx`
  (mock trap §5.1). Check `package.json` — `@0gfoundation/0g-storage-ts-sdk` is WRONG, correct is
  `@0gfoundation/0g-ts-sdk`. Port real impl from Sentinel/Notary.
- **Wrong repo content on push (defect #16):** `git rev-parse --show-toplevel` returns the ops root,
  not the service folder. **Call `check_git_toplevel`.** Root cause: no `.git` in the service
  folder → inherited the root `.git`.

### Phase 3 — Fix (the actual cause)

- One change, scoped to the root cause. Not a spray of "maybe this too".
- If the fix touches the §17 contract (pattern order, digest fields) → STOP, get user approval
  (contract is frozen).
- If the fix is `run.sh` missing `--env-file` → add it + redeploy via `run.sh` (never manual `docker
  run`).
- If the fix is a leaked key in history → `git-hygiene` force-push purge + rotate (user approval).

### Phase 4 — Verify (the fix worked, and didn't break anything else)

- Re-run the Phase 1 reproduction. It should now pass.
- Re-run `npm test` + `tsc --noEmit`. Both green.
- Re-run the relevant gate: `validate_x402_challenge` ok, `onchainos payment quote` all-green,
  `check_git_toplevel` ok, `verify_determinism` identical, `diff_capabilities` 10/10.
- If the fix was for an OKX rejection, re-prove Phase 2 (settle `0x1`) before resubmitting via
  `onchainos agent activate`.

---

## EVIDIQ specialization (vs EVIDIQ methodology `systematic-debugging`)

| EVIDIQ methodology | EVIDIQ systematic-debugging |
|---|---|
| 4-phase root cause | Same, **plus** each phase points at fleet failure modes |
| Generic reproduction | §41-C challenge decode (`validate_x402_challenge`), HEAD sweep, determinism 2× |
| Generic root cause | Read `approvalRemark` literally (§23), defect #15 env-file, Bastion name-mismatch, §23 timeout trap, 0G mock trap |
| Generic fix | Scoped to root cause; §17 freeze stops contract changes; `run.sh` for env-file |
| Generic verify | Re-run the gate (`payment quote` all-green, settle `0x1`, `diff_capabilities` 10/10) |

---

## The fleet failure-mode catalogue (mental index)

| Symptom | Likely root cause | Skill tool / fix |
|---|---|---|
| OKX validator `ok:false` "invalid WWW-Authenticate" | `WWW-Authenticate` header on 402 (§41-A) | `validate_x402_challenge`; remove header |
| OKX "service not deployed / network issue" | HEAD `/mcp` hangs (defect #14) | `curl_sweep`; answer HEAD explicitly in `start-server.ts` |
| OKX "not integrated with official SDK" | hand-rolled settler (§23) | copy `lib/x402/okx.ts` from Sentinel/Atlas/Bulwark |
| `signerAvailable:false` | container no `--env-file` (defect #15) | deploy via `run.sh` |
| settle `status:timeout` but tx confirms | facilitator syncSettle trap (§23) | bounded `getSettleStatus` poll in `okx.ts` |
| `zeroGAnchorTx: undefined` | 0G mock (§5.1) / wrong package | port real impl from Sentinel; `@0gfoundation/0g-ts-sdk` |
| free tool 402 on `{}` | enum/regex schema (defect #4) | loosen zod schema |
| `verify_* {}` returns isError | "not found" as error (defect #5) | return normal result |
| 2× digest differs | non-determinism in path (defect #12) | remove model/random/timestamp from digest |
| `*_capabilities` ≠ `tools/list` | capabilities half-described (defect #8) | `diff_capabilities`; fix catalog |
| OKX rejection generic | read `approvalRemark` literally (§23) | fix the specific sentence, re-prove, resubmit |
| wrong files on GitHub | no own `.git` (defect #16) | `check_git_toplevel`; `git init` + force-push |

---

## Procedure

1. **Phase 1 (reproduce):** capture exact headers / response / tx hash. Call the relevant MCP tool
   (`validate_x402_challenge`, `curl_sweep`, `verify_determinism`, `diff_capabilities`,
   `check_git_toplevel`).
2. **Phase 2 (root cause):** match the symptom to the catalogue. Read `approvalRemark` literally if
   OKX-rejected. Inspect `docker inspect … Env` if creds missing. Inspect `lib/og/storage.ts` if 0G
   missing.
3. **Phase 3 (fix):** one scoped change. STOP if it touches §17 — get user approval. Redeploy via
   `run.sh` if env/container change.
4. **Phase 4 (verify):** re-run Phase 1 reproduction (pass) + `npm test` + `tsc --noEmit` (green) +
   the relevant gate (quote all-green / settle `0x1` / 10/10 / `check_git_toplevel` ok).
5. If OKX-rejected, re-prove Phase 2 (settle `0x1`) before resubmitting via `agent activate`.

---

## MCP tools this skill calls

- **`validate_x402_challenge`** — reproduce/verify 402 + §41-C compliance.
- **`curl_sweep`** — reproduce HEAD hang / timing.
- **`verify_determinism`** — reproduce/verify digest determinism (free tools; paid digest is manual).
- **`diff_capabilities`** — reproduce/verify defect #8/#9.
- **`check_git_toplevel`** — reproduce/verify defect #16.
- **`check_okx_status`** — read `approvalRemark` + `approvalDisplayStatus` for OKX rejection root
  cause.
- **`scan_git_history`** — if a leaked key is suspected as root cause.

---

## Defects this skill specifically prevents

#8 (capabilities diff), #12 (determinism), #13 (x402 headers), #14 (HEAD hang), #15 (env-file), #16
(.git toplevel), plus the §23 facilitator timeout trap and the §41-A WWW-Authenticate trap. And the
meta-defect: "guessing the OKX rejection reason instead of reading `approvalRemark`."

---

## Stop / handoff

- **Stop:** Phase 4 verified — reproduction now passes, tests + tsc green, the relevant gate green.
- **Handoff back to:** the skill that escalated (usually `subagent-driven-development` fix loop, or
  the deploy/verify/register skills). If OKX-rejected, hand off to `okx-registration` to resubmit
  after re-proof.
- **Do NOT resubmit to OKX without re-proving Phase 2** (§23 — the rejection was about code; fix +
  re-prove, then resubmit).

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §4.3 (§41-C decode), §4.6–§4.8 (settle), §5 (0G), §7.4
  (force-push fix), §15 (defects), §16 (command reference).
- `../EVIDIQ-RUNBOOK.md` §23 (payments — timeout trap, resubmit flow, "read the rejection
  literally"), §26-A-2 (HEAD hang), §41 (WWW-Authenticate trap).
- `../EVIDIQ-X402-RUNBOOK.md` — payment protocol failure modes.
