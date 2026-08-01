# spec-brainstorming

> Design review with a **frozen contract**. HARD GATE: no code leaves this skill until the design is
> frozen and the user explicitly approves. Adapted from EVIDIQ methodology `brainstorming`, specialized
> for EVIDIQ's determinism + x402 + OKX constraints.

---

## When to use

- The user says "build MCP #16" (or any new EVIDIQ MCP service) and no frozen PLAN.md exists yet.
- A design discussion is open and you are tempted to start writing `server.ts`.
- The user asks "help me design / spec / brainstorm" a new paid MCP tool or service.
- Before `plan-writing` — this skill produces the frozen inputs (contract, pattern catalogue,
  determinism audit) that PLAN.md is built on.

Do **not** use this for extending an already-shipped service with one new tool — that's a smaller
design loop, not a fleet freeze. Do **not** use after PLAN.md is frozen — you're already in
`plan-writing` or `tdd-implementation`.

---

## What it does

EVIDIQ MCPs are **deterministic, paid, on-chain-anchored** services. Generic brainstorming produces
specs that drift. This skill forces the design through the EVIDIQ-specific gates before anything is
frozen:

1. **Scope the service** — what the agent sends, what the service returns, why it must be paid (and
   why it can't be free), which of the 10 tool slots are paid vs free.
2. **Pattern catalogue normatization** — the detection/evaluation rules must be a frozen, ordered,
   regex/string catalogue (see Bulwark `lib/bulwark/patterns.ts` for the canonical shape). No model
   in the verdict path (defect #12). Rule order is part of the contract — reordering changes the
   digest.
3. **Cross-implementation determinism audit** — 6 rounds (the bar Bulwark set). Same bytes → same
   verdict → same `reportDigest` → same EIP-191 signature (RFC 6979). Identify every non-determinism
   source (timestamps, random, model, network, object-key order, array order) and either remove it
   or exclude it from the digest (§17: `executionId`, `evaluationTimeMs`, `timestamp`, `zeroG*` are
   excluded; the digest + signature MUST be identical across 2 calls).
4. **Verdict semantics** — BLOCK requires ≥1 BLOCK-action violation (defect #6). Verdict is derived
   from the trace, never asserted. Every claim in a report traces to an executed trace step
   (defect #2).
5. **x402 design-up-front** — even though Phase 1 ships with `X402_BYPASS=1`, design the paid tool
   set, atomic prices (`AssetAmount`, not USD — defect #13/§23), `payTo`, the §41-C challenge shape
   now. Phase 2 just flips the bypass off; it must not redesign.
6. **0G anchoring plan** — the `attest_*` tool anchors the report digest as a 0G Merkle root. Plan
   for real `@0gfoundation/0g-ts-sdk` (NOT `0g-storage-ts-sdk`) from Sentinel/Notary, never a mock
   (the mock trap, playbook §5.1).
7. **Tool inventory** — 5 paid + 5 free, mirroring the fleet shape: `<slug>_capabilities`,
   `validate_<input>`, `estimate_cost`, `verify_<slug>_report`, `get_artifact` (free); 5 domain
   scan/attest tools (paid). `estimate_cost` must only quote known tools (defect #7).
8. **Free-vs-paid input contract** — `validate_*` free tool refuses exactly what the paid tools
   refuse (defect #10). Free tools accept `{}` without throwing (defect #3) and use no enum/regex
   schema that would 402 (defect #4).
9. **Frozen §17 contract** — write the contract section that the rest of the build is bound to. The
   4 mathematical invariants (trace consistency, violation-count consistency, verdict determinism,
   integrity digest) go here. Once frozen, changes require explicit user approval.

---

## The hard gate

**No code is written in this skill.** The output is a design document + a frozen §17 contract. The
agent must:

- Present the design to the user.
- Wait for explicit approval ("freeze it", "approved", "go").
- Only then hand off to `plan-writing`.

If the user says "just start coding, we'll design as we go", push back once with the determinism
argument (you cannot make a frozen `reportDigest` retroactively deterministic), then defer to the
user but record the risk in the eventual PLAN.md §0.

---

## EVIDIQ specialization (vs EVIDIQ methodology `brainstorming`)

| EVIDIQ methodology | EVIDIQ spec-brainstorming |
|---|---|
| Explore the design space, converge on a plan | Same, **plus** a frozen deterministic contract |
| No payment concept | Design x402 v2 paid tool set + atomic prices + §41-C shape up-front |
| No registration concept | Anticipate the OKX.AI 10-service listing shape (5 paid, 5 free, A2MCP) |
| TDD later | Determinism audit (6 rounds) is part of the design, not the test phase |
| Generic anti-patterns | Carry the 16 §0 defects; design specifically to avoid each |

---

## Procedure

1. **Read the references.** `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §1–§2 (overview + prereqs),
   `../EVIDIQ-RUNBOOK.md` §23 (payments), §41 (challenge format). Skim a sibling PLAN.md (e.g.
   `../evidiq-bulwark-mcp/PLAN.md`) for the canonical shape.
2. **Interview the user** for: domain, what the agent sends, what verdict/result the service
   returns, why it's paid, expected price points.
3. **Draft the pattern catalogue / evaluation rules.** Freeze order. No model in the path.
4. **Run the determinism audit** (6 rounds). List every non-determinism source; decide exclude vs
   remove. Write the §17 digest contract.
5. **Draft the 10-tool inventory** with prices (atomic), free tools, input contracts. Check
   `validate_*` parity with paid tools (defect #10).
6. **Draft the §41-C challenge** the service will emit in Phase 2 (`x402Version:2`, `scheme:exact`,
   `network:eip155:196`, `asset:0x779ded0c9e1022225f8e0630b35a9b54be713736`,
   `payTo:0x2a8efe3093278bb4bd3b2d9c7b5ba992ca4fc9b0`, `maxTimeoutSeconds:300`,
   `extra:{name:"USD₮0",version:"1"}`). Note: NO `WWW-Authenticate` header (§41-A).
7. **Draft §17 contract + the 4 invariants.**
8. **Present the design to the user.** Wait for approval. Do not write PLAN.md yet — that's
   `plan-writing`'s job, and it consumes this frozen design as input.

---

## MCP tools this skill may call

- **`validate_plan_sections`** — not yet (no PLAN.md). But keep it in mind: the design you freeze
  must produce a PLAN.md that will pass `validate_plan_sections` later.
- **`methodology_capabilities`** — optional, to confirm the verification MCP is up before a long
  design session.

This skill is mostly conversational + design writing; the live MCP tools come into play starting at
`plan-writing`.

---

## Defects this skill specifically prevents

#2 (claim from config), #6 (verdict about nothing), #7 (estimate_cost invents), #8 (capabilities
half-described), #10 (charge then reject), #12 (model in hot path), #13 (x402 header mistakes —
designed correctly from day 1).

---

## Stop / handoff

- **Stop:** design + §17 contract frozen, user approved.
- **Handoff to:** `plan-writing` — give it the frozen design + §17 + tool inventory + prices. It
  writes PLAN.md with §0 defects carry-forward and the two-phase scope.
- **Do NOT hand off to `tdd-implementation` directly** — PLAN.md must exist first (it's the contract
  the tests assert against).

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §1 (sequencing), §2 (prereqs), §5 (0G), §15 (defects).
- `../EVIDIQ-RUNBOOK.md` §23 (payments — official SDK + AssetAmount), §41 (challenge format).
- `../evidiq-bulwark-mcp/PLAN.md` — canonical frozen PLAN shape (§0 + §17 + two-phase).
