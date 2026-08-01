# x402-verification

> §23 release checklist, Phase 2. Free 200, unpaid paid 402, §41-C challenge decode (no
> WWW-Authenticate, `payment-required` header, v2/exact/eip155:196/asset/payTo), `onchainos payment
> quote` all paid tools, top-up test buyer, real paid call → settle → receipt `0x1`. Adapted from
> obra/superpowers `verification-before-completion`, specialized for the OKX x402 v2 + USDT0 stack.

---

## When to use

- `phased-deployment` Phase 2 entry is done (bypass removed, gate enforced, free 200 / paid 402
  confirmed).
- Before `okx-registration` — Phase 2 must be proven (settle tx `0x1`) before any listing.
- A paid call failed or behaved ambiguously — re-run the relevant gate.
- OKX rejected a listing with a payment-validation reason — re-prove the full checklist.

Do **not** use this in Phase 1 (bypass) — `phased-deployment` owns Phase 1. Do **not** register on
OKX from this skill — `okx-registration` does that, and only after this skill records a `0x1` settle.

---

## What it does

This skill spends real USDT0 (small amounts) to prove the payment stack end-to-end. It is the gate
§23 calls "the whole lesson": no listing before a proven paid call. The steps:

1. **Free 200 / paid 402** — playbook §4.2. Free tools → 200; paid tools → 402; HEAD `/mcp` → 402,
   no hang.
2. **§41-C challenge compliance** — playbook §4.3. Capture 402 headers. `WWW-Authenticate` MUST be
   absent (§41-A trap — OKX validator fails on it). `payment-required` + `x-payment-required`
   present. Decode base64 challenge, verify: `x402Version:2`, `scheme:"exact"`,
   `network:"eip155:196"`, `asset:"0x779ded0c9e1022225f8e0630b35a9b54be713736"`,
   `payTo:"0x2a8efe3093278bb4bd3b2d9c7b5ba992ca4fc9b0"`, `maxTimeoutSeconds:300`,
   `extra:{name:"USD₮0",version:"1"}`. **Call `validate_x402_challenge`** with the base64 (or raw
   headers) to check this.
3. **OKX validator gate — `onchainos payment quote` all paid tools** — playbook §4.4, §41-D. Run on
   the VPS for every paid tool. EACH must return `ok:true` with a valid `decodedChallenge` +
   `supported:true`. If ANY returns `ok:false` or `unsupported`, **STOP — fix + redeploy before
   continuing**. This is the predictor that predicts OKX review outcome (§27-A).
4. **Top-up test buyer wallet** — playbook §4.5. Test buyer `0xd6B658dC6e53444bF9Cba598aFdd21Ede0A62Fb9`
   drains over time. Check USDT0 balance via `eth_call` on the asset contract; top-up 0.05 USDT0 via
   `onchainos wallet send` (note: `--recipient` not `--to`, `--readable-amount` not `--amt`).
5. **Real paid call → settle → receipt `0x1`** — playbook §4.6–§4.8. The test script needs
   `@okxweb3/x402-core` + `@okxweb3/x402-evm` + `viem` — docker-cp it into the Circuit container (or
   any sibling that has the deps) and `docker exec` it with `X402_SETTLE_KEY`. Cheapest paid tool
   first (0.005 USDT0). Expect `Status: 200` + `PAYMENT-RESPONSE: {"status":"settled",
   "transaction":"0x…"}`.
6. **Verify settle receipt on-chain** — playbook §4.7. `eth_getTransactionReceipt` on the settle tx
   → `status:"0x1" (SUCCESS)`. **This is the PROOF.** Record the tx hash.
7. **Capture FULL settle tx hash** — playbook §4.8 (the header can truncate in console).
8. **Determinism re-verify** — playbook §4 end. 2× same input → same `reportDigest` + `signature`
   (manual §3.7 step; the gate is on now so each call costs — pick the cheapest paid tool, or rely
   on the Phase 1 bypass determinism run).
9. **0G anchor verify (attest tool)** — playbook §5.4. Run the `attest_<slug>_safety` paid call,
   parse `zeroGAnchorTx` + `zeroGStorageRoot` from the response — must be real hex, not
   undefined/missing (mock trap, §5.1). Records the second proof tx.

---

## EVIDIQ specialization (vs obra/superpowers `verification-before-completion`)

| obra/superpowers | EVIDIQ x402-verification |
|---|---|
| Verify the thing you built works | Same, **plus** the x402 v2 money round-trip is verified with real USDT0 |
| No payment concept | §41-C challenge decode, no `WWW-Authenticate`, atomic `AssetAmount` |
| No on-chain proof | settle → `eth_getTransactionReceipt` → `status 0x1` is the proof |
| No OKX gate | `onchainos payment quote` for every paid tool is the predictor gate (§41-D) |
| No 0G | `attest_*` must return real `zeroGAnchorTx` + `zeroGStorageRoot` (mock trap) |

---

## Procedure

1. Confirm `phased-deployment` Phase 2 entry done (gate enforced, free 200 / paid 402).
2. Capture a 402 response's headers. **Call `validate_x402_challenge`** with the `payment-required`
   base64 (or the full headers). Fix any §41-C mismatch (e.g. WWW-Authenticate present, wrong asset,
   `maxTimeoutSeconds` ≠ 300) and redeploy before continuing.
3. **`onchainos payment quote`** on the VPS for every paid tool. All must be `ok:true`. STOP on any
   failure.
4. Top-up the test buyer if balance low.
5. Run the paid-call test script (docker-cp + docker exec in a sibling container). Cheapest tool.
6. `eth_getTransactionReceipt` → assert `status 0x1`. Record the tx hash.
7. Run `attest_<slug>_safety` paid call, assert real `zeroGAnchorTx` + `zeroGStorageRoot`. Record.
8. Re-verify determinism (cheapest paid tool, 2× — or accept the Phase 1 bypass determinism run).
9. **Hand off to `okx-registration`** with: both settle tx hashes, the 0G anchor proof, the
   `payment quote` all-green result. These go into the README proven table + OKX listing.

---

## The facilitator `timeout` trap (§23 — read before shipping)

With `syncSettle` on, the facilitator may answer `status:"timeout"` even though the tx it broadcast
confirms seconds later. Required handling: `pending`/`timeout` WITH a tx hash → bounded poll of
`client.getSettleStatus(tx)` (2s interval, 24s deadline). Never infer success from a timeout. Never
discard a known tx hash. The `lib/x402/okx.ts` copied from Sentinel/Atlas/Bulwark already implements
this.

---

## MCP tools this skill calls

- **`validate_x402_challenge`** — `params: { challengeBase64: "…" }` (or `headers: {...}`). Decodes
  base64, verifies §41-C structure, checks `WWW-Authenticate` absence. Returns `{ ok, errors,
  decoded }`.
- **`scan_git_history`** — before submit, scan the service repo for leaked keys (defect #1, #16). A
  leaked PAT or signer key in history is a hard stop.

`onchainos payment quote`, `wallet send`, `eth_getTransactionReceipt`, and the paid-call test script
are run as shell commands on the VPS (the MCP `check_okx_status` tool is for *registration* status,
not payment quote).

---

## Defects this skill specifically prevents

#1 (fallback signer — scan_git_history catches leaks), #7 (estimate_cost — re-checked), #13 (x402
header mistakes — `validate_x402_challenge` is the dedicated check), #14 (HEAD hang — re-swept), the
facilitator timeout trap (§23).

---

## Stop / handoff

- **Stop:** settle tx `0x1` recorded, `attest_*` 0G anchor real hex recorded, `payment quote`
  all-green, `validate_x402_challenge` ok, `scan_git_history` clean.
- **Handoff to:** `okx-registration` — give it the proof tx hashes + the all-green gate result.
- **Do NOT register from this skill.** Registration is `okx-registration`.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §4 (Phase 2), §5 (0G), §15 (defects #1, #13), §16 (command
  reference: `onchainos payment quote`, `wallet send`, `eth_getTransactionReceipt`, OKLink URL).
- `../EVIDIQ-RUNBOOK.md` §23 (payments — official SDK, AssetAmount, timeout trap, release
  checklist), §41 (challenge format + WWW-Authenticate trap).
- `../EVIDIQ-X402-RUNBOOK.md` — payment protocol reference.
