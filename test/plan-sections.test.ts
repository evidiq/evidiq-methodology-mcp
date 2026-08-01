import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePlanSections } from "../lib/plan/sections.js";

// A neutral fixture that exercises every required section. It deliberately does not
// reproduce any real project plan: the validator only looks for section shapes.
const COMPLETE_PLAN = `# Example service — build plan

## Scope of this task
Phase 1: run with the payment gate bypassed, test locally, do not register.
Phase 2: enable the gate, register, prove one paid call.

## §0. Defects carried over from earlier services
Each known defect, with a one-line mitigation for this service.

## §3. Tools specification (10 tools)
5 paid tools + 5 free (capabilities, validate, estimate_cost, verify_report, get_artifact).

## §4. Determinism contract
The report digest and its signature must be byte-identical across two identical calls.

## §9. Environment
PORT, HOSTNAME, PUBLIC_BASE_URL, signer key with no fallback.

## §10. Deploy
docker build, then deploy/run.sh with --env-file. Traefik labels and the port.

## §13. Release checklist
Free tool returns 200, unpaid call returns 402, then a paid replay settles.

## §17. Contract freeze
This contract is frozen. Changes require explicit approval.
`;

describe("validate_plan_sections", () => {
  it("passes a complete plan", () => {
    const r = validatePlanSections({ planContent: COMPLETE_PLAN });
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.present.length).toBeGreaterThanOrEqual(8);
  });

  it("detects a missing §0 carry-forward section", () => {
    const content = COMPLETE_PLAN.replace(
      "## §0. Defects carried over from earlier services",
      "## Overview"
    );
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("§0 defects carry-forward");
  });

  it("detects a missing §17 contract freeze", () => {
    const content = COMPLETE_PLAN.replace(/## §17\. Contract freeze[\s\S]*?approval\./, "");
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("§17 contract freeze");
  });

  it("detects missing two-phase scope", () => {
    const content = COMPLETE_PLAN.replace(
      /Phase 1:[\s\S]*?one paid call\./,
      "Build it."
    );
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("two-phase scope");
  });

  it("detects a missing determinism contract", () => {
    // The whole §4 block goes, since every keyword the validator accepts lives in it.
    const content = COMPLETE_PLAN.replace(/## §4\. Determinism contract[\s\S]*?(?=\n## )/, "");
    const r = validatePlanSections({ planContent: content });
    expect(r.missing).toContain("determinism contract");
  });

  it("returns a hint for every missing section", () => {
    const r = validatePlanSections({ planContent: "# minimal plan\nno sections here" });
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
    for (const m of r.missing) expect(typeof r.hints[m]).toBe("string");
  });

  it("reads a plan from planPath", () => {
    // Written to a temp file so the test does not depend on any file in the repo.
    const dir = mkdtempSync(join(tmpdir(), "plan-sections-"));
    const path = join(dir, "PLAN.md");
    try {
      writeFileSync(path, COMPLETE_PLAN, "utf8");
      const r = validatePlanSections({ planPath: path });
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.bytes).toBe(COMPLETE_PLAN.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a planPath that cannot be read", () => {
    const r = validatePlanSections({ planPath: join(tmpdir(), "definitely-absent-plan.md") });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Cannot read planPath");
  });

  it("errors when neither planPath nor planContent is provided", () => {
    const r = validatePlanSections({});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Provide");
  });
});
