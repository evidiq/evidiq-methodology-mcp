// PLAN.md section validator. Checks for the mandatory EVIDIQ sections so a frozen PLAN.md is
// structurally complete before plan-writing hands off.

import { readFileSync } from "node:fs";

interface RequiredSection {
  id: string;
  re: RegExp;
  hint: string;
}

const REQUIRED_SECTIONS: RequiredSection[] = [
  { id: "§0 defects carry-forward", re: /(?:§0|defects?\s+(?:this\s+project\s+has\s+)?already\s+paid\s+for|carry\s*forward)/i, hint: "The 16 fleet defects, with project-specific mitigations." },
  { id: "§17 contract freeze", re: /(?:§17|contract\s+freeze|this\s+(?:contract|plan)\s+is\s+frozen)/i, hint: "The frozen contract + the 4 invariants + digest exclusion list." },
  { id: "two-phase scope", re: /(?:two-phase|phase\s+1|phase\s+2|x402_bypass)/i, hint: "Phase 1 bypass / Phase 2 gate; explicit Phase 1 stop gate." },
  { id: "tool inventory (10 tools)", re: /(?:tools?\s+specification|tool\s+inventory|10\s+tools|paid\s+tool)/i, hint: "5 paid + 5 free tools with input schemas + output shapes." },
  { id: "determinism contract", re: /(?:determinism|reportDigest|RFC\s*6979|invariant)/i, hint: "Same bytes → same digest + signature. The 4 invariants." },
  { id: "env section", re: /(?:^|\n)\s*(?:#+\s*)?(?:env|environment)|(?:PORT|SIGNER_PRIVATE_KEY|X402_)()/i, hint: "PORT, HOSTNAME, PUBLIC_BASE_URL, signer key (no fallback), X402_*." },
  { id: "deploy section", re: /(?:deploy|run\.sh|docker\s+(?:build|run)|traefik)/i, hint: "deploy/run.sh with --env-file (defect #15). Traefik labels. Port." },
  { id: "release / pre-submission checklist", re: /(?:release\s*checklist|pre-?submission|§23|payment\s+quote)/i, hint: "The §23 release checklist + onchainos payment quote gate." },
];

export interface ValidatePlanResult {
  ok: boolean;
  present: string[];
  missing: string[];
  hints: Record<string, string>;
  bytes: number;
  error?: string;
}

export function validatePlanSections(input: {
  planPath?: string;
  planContent?: string;
}): ValidatePlanResult {
  let content: string;
  if (input.planPath) {
    try {
      content = readFileSync(input.planPath, "utf8");
    } catch (e: any) {
      return { ok: false, present: [], missing: [], hints: {}, bytes: 0, error: `Cannot read planPath: ${e.message || e}` };
    }
  } else if (typeof input.planContent === "string") {
    content = input.planContent;
  } else {
    return {
      ok: false,
      present: [],
      missing: [],
      hints: {},
      bytes: 0,
      error: "Provide planPath or planContent.",
    };
  }

  const present: string[] = [];
  const missing: string[] = [];
  const hints: Record<string, string> = {};
  for (const s of REQUIRED_SECTIONS) {
    if (s.re.test(content)) {
      present.push(s.id);
    } else {
      missing.push(s.id);
      hints[s.id] = s.hint;
    }
  }

  return {
    ok: missing.length === 0,
    present,
    missing,
    hints,
    bytes: content.length,
  };
}
