import { describe, it, expect } from "vitest";
import { getCatalog, SKILLS, TOOLS, DEFECTS, SERVICE_VERSION, SERVICE_NAME, SLUG } from "../lib/catalog.js";

describe("methodology catalog (skill #9 tool)", () => {
  it("exposes the frozen service identity", () => {
    expect(SERVICE_NAME).toBe("EVIDIQ Methodology MCP");
    expect(SERVICE_VERSION).toBe("1.0.0");
    expect(SLUG).toBe("methodology");
  });

  it("has exactly 15 skills across core/meta/debugging categories", () => {
    expect(SKILLS).toHaveLength(15);
    const cats = new Set(SKILLS.map((s) => s.category));
    expect(cats).toEqual(new Set(["core", "meta", "debugging"]));
  });

  it("contains the 15 frozen skill names", () => {
    const names = SKILLS.map((s) => s.name).sort();
    expect(names).toEqual(
      [
        "documentation-sync",
        "executing-plans",
        "git-hygiene",
        "okx-registration",
        "phased-deployment",
        "plan-writing",
        "security-audit",
        "spec-brainstorming",
        "subagent-driven-development",
        "systematic-debugging",
        "tdd-implementation",
        "using-evidiq-methodology",
        "verification-before-completion",
        "writing-skills",
        "x402-verification",
      ].sort()
    );
  });

  it("has exactly 9 MCP tools", () => {
    expect(TOOLS).toHaveLength(9);
  });

  it("contains the 9 frozen tool names", () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "check_git_toplevel",
        "check_okx_status",
        "curl_sweep",
        "diff_capabilities",
        "scan_git_history",
        "methodology_capabilities",
        "validate_plan_sections",
        "validate_x402_challenge",
        "verify_determinism",
      ].sort()
    );
  });

  it("every tool references a calling skill", () => {
    for (const t of TOOLS) expect(t.calledBy.length).toBeGreaterThan(0);
  });

  it("has exactly 16 §0 defects numbered 1..16", () => {
    expect(DEFECTS).toHaveLength(16);
    expect(DEFECTS.map((d) => d.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("defect titles match the frozen fleet wording", () => {
    const byNum = Object.fromEntries(DEFECTS.map((d) => [d.number, d.title]));
    expect(byNum[1]).toMatch(/Fallback signing key/);
    expect(byNum[6]).toMatch(/Verdict about nothing/);
    expect(byNum[13]).toMatch(/WWW-Authenticate/);
    expect(byNum[14]).toMatch(/HEAD.*hang/);
    expect(byNum[15]).toMatch(/env-file/);
    expect(byNum[16]).toMatch(/Wrong repo content/);
  });

  it("getCatalog returns a bootstrap-shaped object with counts + references", () => {
    const c = getCatalog();
    expect(c.skillsCount).toBe(15);
    expect(c.toolsCount).toBe(9);
    expect(c.defectsCount).toBe(16);
    expect(c.paymentGate).toContain("none");
    expect(c.references.length).toBeGreaterThan(0);
  });
});
