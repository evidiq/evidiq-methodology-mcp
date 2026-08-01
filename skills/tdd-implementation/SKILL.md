# tdd-implementation

> RED-GREEN-REFACTOR with **vitest**. 33+ tests minimum. Deterministic invariants enforced by tests.
> No model in the verdict path. Adapted from EVIDIQ methodology `test-driven-development`, specialized
> so the EVIDIQ determinism contract (§17) is asserted by the test suite, not hoped for.

---

## When to use

- PLAN.md is frozen (`plan-writing` handed off) and you are writing the service code.
- A subagent picks up a §12 milestone task — it implements test-first.
- Adding a tool or detector to an existing EVIDIQ service — write the test first.
- A determinism or verdict bug surfaced — reproduce it as a RED test before fixing.

Do **not** use this for the deployment phase (that's `phased-deployment`) or for OKX registration.
Do **not** skip RED — "I'll add tests after" is defect #11 (detectors tested only in convenient
form) in disguise.

---

## What it does

EVIDIQ MCPs are deterministic paid services whose `reportDigest` (JCS-canonical SHA-256) and
EIP-191 signature must be byte-identical across two calls with the same input (RFC 6979). TDD here
isn't just coverage — the test suite is the **enforcement mechanism** for §17:

1. **RED** — write a failing test that pins the behavior (verdict shape, digest field, trace step,
   violation count, signature recovery).
2. **GREEN** — write the minimum code to pass. No model, no network, no `Math.random`, no
   `Date.now()` in the digest path. Violations come from the trace, not assertions (defect #2, #6).
3. **REFACTOR** — reorder for clarity, never reorder the pattern catalogue (order is part of the
   contract — reordering changes the digest).
4. **Determinism tests** — call the evaluator 2× with the same input, assert `reportDigest` and
   `signature` are identical. Exclude `executionId`, `evaluationTimeMs`, `timestamp`, `zeroG*` from
   the comparison (§17). These WILL differ; the digest + signature MUST not.
5. **MCP-transport tests** — defect #11 says unit tests pass while the live handler returns a
   different shape. Test through the MCP transport (call the registered tool via the handler), not
   just the library. Bulwark `test/detector.test.ts` + `test/x402.test.ts` are the canonical split.
6. **The 4 invariants** (asserted in `test/report.test.ts`):
   - trace consistency (every claim traces to a trace step),
   - violation-count consistency (count matches trace),
   - verdict determinism (BLOCK ⇒ ≥1 BLOCK violation — defect #6),
   - integrity digest (JCS SHA-256 reproducible).
7. **33+ tests minimum** — the fleet bar. Scores of pattern cases + the 4 invariants + transport
   shape + x402 challenge shape + pricing atomicity. Bulwark ships ~ that many; match it.

---

## EVIDIQ specialization (vs EVIDIQ methodology `test-driven-development`)

| EVIDIQ methodology | EVIDIQ tdd-implementation |
|---|---|
| RED-GREEN-REFACTOR | Same, **plus** determinism tests are mandatory, not optional |
| Coverage goal | 33+ tests, including invariant + transport tests (defect #11) |
| No determinism concept | 2× same input → identical digest + signature (RFC 6979). §17 exclusion list. |
| No verdict rules | BLOCK ⇒ ≥1 BLOCK violation; verdict from trace (defects #2, #6) |
| No pricing tests | x402 challenge shape + atomic `AssetAmount` prices asserted (§41-C, defect #13) |

---

## Procedure (per task)

1. **Read the §12 milestone task** from PLAN.md. Identify the file + the behavior.
2. **RED:** write `test/<area>.test.ts` with a failing case. Use vitest (`describe`/`it`/`expect`).
   For a detector: malicious input → BLOCK, clean input → ALLOW. For a tool: the registered handler
   returns the documented shape.
3. **Run `npm test`** — confirm RED (the new test fails for the right reason, others stay green).
4. **GREEN:** write the minimum implementation. No `Date.now()` / `Math.random()` / `fetch` / model
   call in the verdict path. Violations appended to the trace, then counted; verdict derived from
   the trace.
5. **Run `npm test`** — confirm GREEN.
6. **REFACTOR** — if you touch the pattern catalogue order, STOP — that's a §17 change, needs user
   approval.
7. **Add the determinism case** for this area if it produces a digest (2× call, assert identical
   digest + sig, exclude §17 fields).
8. **Run `npx tsc --noEmit`** — must be clean. Both gates green before the task is "done".

---

## The two gates that must be green before any deploy

```bash
npm test            # vitest, 33+ tests, all green
npx tsc --noEmit    # strict, no errors
```

Both are enforced by the playbook (§2 prereqs + §5.3 rebuild). Do not deploy with either red.

---

## MCP tools this skill may call

- **`verify_determinism`** — once Phase 1 is deployed, call it against a free tool of the service
  (`<slug>_capabilities`) to smoke-check 2× response equality. The real digest determinism (paid
  `attest_*` tool) is the manual playbook §3.7 step (paid tool not callable without a payment
  header).
- **`diff_capabilities`** — before deploy, diff `tools/list` vs `*_capabilities.tools` to enforce
  defect #8 (capabilities describing half the service). Must be 10/10 match.

This skill is mostly local `npm test` / `tsc`; the MCP tools come at the deploy boundary.

---

## Defects this skill specifically prevents

#2 (claim from config), #6 (verdict about nothing), #8 (capabilities half — via diff_capabilities),
#10 (charge then reject — `validate_*` parity tested), #11 (transport shape tested), #12 (model in
path — forbidden in GREEN), #13 (challenge shape + atomic prices asserted in `test/x402.test.ts`).

---

## Stop / handoff

- **Stop:** the task's tests are GREEN, `tsc --noEmit` clean, determinism case added, no §17 order
  change.
- **Handoff to:** the next §12 task, or — when all tasks green — `phased-deployment` for Phase 1.
- **Do NOT deploy from this skill.** Deployment is `phased-deployment`, and it has its own gates.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §2 (prereqs: `npm test` + `tsc --noEmit`), §3.5–§3.8 (test
  sweep + determinism + capability diff), §15 (defects #6, #11, #12).
- `../evidiq-bulwark-mcp/test/detector.test.ts`, `test/report.test.ts`, `test/x402.test.ts` —
  canonical test split (detector + invariant + x402 shape).
- `../EVIDIQ-RUNBOOK.md` §23 (release checklist), §26-A-2 (HEAD hang — tested at deploy, not here).
