# verification-before-completion

> Live curl cross-verification against reference endpoints. Diff `tools/list` vs
> `*_capabilities`. Determinism check (2× same input = same digest, RFC 6979). Capability diff
> (10/10 match). Adapted from obra/superpowers `verification-before-completion`, specialized so the
> verification is live (against a deployed endpoint), not just "tests pass".

---

## When to use

- Shortly before declaring a phase "done" — verify the live endpoint actually behaves as the tests
  claim.
- During `phased-deployment` Phase 1 sweep + `x402-verification` Phase 2 checks (this skill is the
  verification engine those skills call).
- Before `okx-registration` — confirm 10/10 capability match + determinism once more.
- After a redeploy — re-verify the live endpoint didn't regress.

Do **not** use this instead of `npm test` — local tests are the first gate; this skill is the
**live** second gate. Do **not** declare "done" on tests alone — defect #11 (detectors tested only
in convenient form) is exactly "tests pass but the live handler returns a different shape".

---

## What it does

Local `npm test` + `tsc --noEmit` prove the code is internally consistent. They do NOT prove the
deployed endpoint behaves the same. This skill runs the live verifications:

1. **Curl cross-verification** — HEAD/GET/POST sweep against the live `https://mcp.evidiq.dev/<slug>`
  endpoint (and against a reference sibling, e.g. Bulwark, for shape comparison). All 200 (Phase 1
  bypass) or free-200/paid-402 (Phase 2). No hang (defect #14). **Call `curl_sweep`.**
2. **Capability diff** — `tools/list` (from the MCP `tools/list` method) vs `*_capabilities.tools`
  (from calling the capabilities tool). Must be 10/10 match. Defect #8 (capabilities describing half
  the service) + defect #9 (stated capability with no implementation). **Call `diff_capabilities`.**
3. **Determinism check** — call a tool 2× with identical input. For free tools: deep JSON equality
  via **`verify_determinism`** (calls the target 2×, compares). For paid tools (which produce
  `reportDigest` + `signature`): the manual playbook §3.7 step — 2× via curl, compare digest + sig,
  they MUST be identical (RFC 6979); exclude §17 fields (`executionId`, `evaluationTimeMs`,
  `timestamp`, `zeroG*`) which WILL differ. `verify_determinism` only handles free tools (paid
  digest comparison is not callable without a payment header).
4. **Verdict-shape verification** — malicious input → BLOCK (≥1 BLOCK violation, defect #6); clean
  input → ALLOW. Run each paid scan tool with both. The verdict must be derivable from the trace
  (defect #2), not asserted.
5. **Free-tool no-throw** — `capabilities {}`, `validate_<input> {}`, `estimate_cost {}`,
  `verify_<slug>_report {}`, `get_artifact {}` all return 200 with a normal result (defects #3, #4,
  #5). `estimate_cost {toolName:"fake"}` → `known:false` (defect #7).
6. **On-chain receipt** (Phase 2 only) — `eth_getTransactionReceipt` on the settle tx → `status
  0x1`. The PROOF. (Owned by `x402-verification`, but re-verified here as part of "done".)

---

## EVIDIQ specialization (vs obra/superpowers `verification-before-completion`)

| obra/superpowers | EVIDIQ verification-before-completion |
|---|---|
| Verify before declaring done | Same, **plus** verification is LIVE (curl the deployed endpoint), not just re-running tests |
| Generic cross-check | Diff `tools/list` vs `*_capabilities` (defect #8/#9) — 10/10 |
| No determinism | 2× same input → identical `reportDigest` + `signature` (RFC 6979); §17 exclusion list |
| No verdict rules | BLOCK ⇒ ≥1 BLOCK violation (defect #6); verdict from trace (defect #2) |
| No free-tool rules | Free tools handle `{}` (defects #3/#4/#5); `estimate_cost` no invent (defect #7) |
| No on-chain | Settle receipt `0x1` is the proof |

---

## The "done" bar (all must be green)

```
Local gates (tdd-implementation owns)
  npm test            → green (33+ tests)
  tsc --noEmit        → clean

Live gates (this skill owns)
  curl_sweep          → all 200 (Phase 1) / free-200 + paid-402 (Phase 2), no hang, HEAD <0.5s
  diff_capabilities   → 10/10 MATCH
  verify_determinism  → deterministic:true (free tool, 2× identical)
  paid determinism    → reportDigest + signature IDENTICAL (manual §3.7, 2× via curl) [Phase 1 bypass or Phase 2 paid]
  scan verdicts       → malicious→BLOCK, clean→ALLOW
  free-tool no-throw  → capabilities/validate/estimate/verify/get_artifact on {} → 200 normal
  estimate_cost fake  → known:false
  on-chain receipt    → settle tx status 0x1 [Phase 2 only]
```

If any line is not green, the phase is not done. Do not hand off.

---

## Procedure

1. Confirm local gates green (`npm test` + `tsc --noEmit`).
2. **`curl_sweep`** → `params: { baseUrl: "https://mcp.evidiq.dev/<slug>" }`. All 200/no-hang (Phase
   1) or free-200/paid-402 (Phase 2).
3. **`diff_capabilities`** → `params: { targetUrl, capabilitiesTool: "<slug>_capabilities" }`. 10/10.
4. **`verify_determinism`** → `params: { targetUrl, toolName: "<slug>_capabilities", arguments: {} }`.
   `deterministic:true`.
5. Manual paid determinism (playbook §3.7): 2× `attest_*` via curl (Phase 1 bypass = free; Phase 2
   = paid), compare `reportDigest` + `signature` — IDENTICAL.
6. Scan verdicts: malicious → BLOCK, clean → ALLOW, for each paid scan tool.
7. Free-tool no-throw: `capabilities {}` / `validate {}` / `estimate_cost {}` / `verify_* {}` /
   `get_artifact {}` → 200 normal. `estimate_cost {toolName:"fake"}` → `known:false`.
8. Phase 2: `eth_getTransactionReceipt` on the settle tx → `status 0x1`.
9. All green → hand off. Any red → back to the owning skill (or `systematic-debugging`).

---

## MCP tools this skill calls

- **`curl_sweep`** — `params: { baseUrl }`. HEAD/GET/POST at `--max-time 10`. Defect #14.
- **`diff_capabilities`** — `params: { targetUrl, capabilitiesTool }`. tools/list vs capabilities.
  Defects #8, #9.
- **`verify_determinism`** — `params: { targetUrl, toolName, arguments }`. 2× deep JSON equality
  (free tools only; paid digest is manual §3.7).

---

## Defects this skill specifically prevents

#2 (verdict from trace), #5 (not-found as error), #6 (verdict about nothing), #7 (estimate_cost
invents), #8 (capabilities half), #9 (no implementation), #11 (transport shape verified live, not
just library), #12 (determinism), #14 (HEAD hang).

---

## Stop / handoff

- **Stop:** every line in the "done" bar green.
- **Handoff to:** the next phase skill — `phased-deployment` (if Phase 1 verification),
  `x402-verification` (if entering Phase 2), `okx-registration` (if Phase 2 verified), or
  `documentation-sync` + `security-audit` (if post-registration).
- **Do NOT declare "done" with a red line.** A red line means back to the owning skill or
  `systematic-debugging`.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §3.4 (curl sweep), §3.5 (10-tool test), §3.7 (determinism),
  §3.8 (capability diff), §4.7 (settle receipt), §12 (verification log format), §15 (defects).
- `../EVIDIQ-RUNBOOK.md` §23 (release checklist), §26-A-2 (HEAD hang).
- `../evidiq-bulwark-mcp/test/x402.test.ts` — the local shape tests this skill verifies live.
