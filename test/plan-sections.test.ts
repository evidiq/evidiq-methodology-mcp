import { describe, it, expect } from "vitest";
import { validatePlanSections } from "../lib/plan/sections.js";

const COMPLETE_PLAN = `# EVIDIQ MCP #16 — build plan

## Scope of this task
Phase 1: X402_BYPASS=1, test, do NOT register. Phase 2: x402 gate on, register, prove paid call.

## §0. Defects this project has already paid for (carry forward)
The 16 defects, each with a one-line mitigation.

## §3. Tools Specification (10 tools)
5 paid scan tools + 5 free (capabilities, validate, estimate_cost, verify_report, get_artifact).

## §4. Determinism contract + the 4 invariants
reportDigest (JCS SHA-256) + signature must be byte-identical across 2 calls (RFC 6979).

## §9. Env
PORT, HOSTNAME, PUBLIC_BASE_URL, SIGNER_PRIVATE_KEY (no fallback), X402_*.

## §10. Deploy via deploy/run.sh
docker build + bash deploy/run.sh (includes --env-file). Traefik labels.

## §13. Release checklist (§23)
free 200, unpaid 402, onchainos payment quote, paid replay → settle → 0x1.

## §17. Contract freeze
This contract is frozen. Changes require explicit user approval.
`;

describe("validate_plan_sections", () => {
  it("passes a complete PLAN.md", () => {
    const r = validatePlanSections({ planContent: COMPLETE_PLAN });
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.present.length).toBeGreaterThanOrEqual(8);
  });

  it("detects a missing §0 defects section", () => {
    // Remove the §0 header entirely (no §0, no 'defects already paid for', no 'carry forward').
    const content = COMPLETE_PLAN.replace(/## §0\. Defects this project has already paid for \(carry forward\)/, "## Overview");
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("§0 defects carry-forward");
  });

  it("detects a missing §17 contract freeze", () => {
    const content = COMPLETE_PLAN.replace(/## §17\. Contract freeze[\s\S]*?approval\./, "");
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("§17 contract freeze");
  });

  it("detects missing two-phase scope", () => {
    const content = COMPLETE_PLAN.replace(/Phase 1: X402_BYPASS=1.*?prove paid call\./, "Build it.");
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("two-phase scope");
  });

  it("detects missing determinism contract", () => {
    // Remove the whole §4 block up to the next header (the §4 text contains 'determinism',
    // 'reportDigest', 'invariants', 'RFC 6979)' — all must go for the section to read as missing).
    const content = COMPLETE_PLAN.replace(/## §4\. Determinism contract[\s\S]*?(?=\n## )/, "");
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("determinism contract");
  });

  it("returns hints for missing sections", () => {
    const r = validatePlanSections({ planContent: "# minimal plan\nno sections here" });
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
    for (const m of r.missing) expect(typeof r.hints[m]).toBe("string");
  });

  it("reads from planPath", () => {
    // Use this project's own PLAN-equivalent — the skill repo has PLAN.md with §0/§17/two-phase.
    // The MCP repo itself has no PLAN.md; use the sibling methodology PLAN.md which has the keywords.
    const r = validatePlanSections({ planPath: "PLAN.md" });
    expect(r.error).toBeUndefined();
    // That file mentions two-phase, defects, contract freeze, deploy, tools.
    expect(r.present.length).toBeGreaterThan(0);
  });

  it("errors when neither planPath nor planContent is provided", () => {
    const r = validatePlanSections({});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Provide");
  });
});
