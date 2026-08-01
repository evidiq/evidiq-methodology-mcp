// EVIDIQ Methodology MCP — static catalog for the `methodology_capabilities` tool.
// Mirrors the frozen spec in evidiq-methodology/PLAN.md §3 (skills) + §4 (tools) + §6 (defects).

export const SERVICE_VERSION = "1.0.0";
export const SERVICE_NAME = "EVIDIQ Methodology MCP";
export const SLUG = "methodology";

export interface SkillEntry {
  name: string;
  category: "core" | "meta" | "debugging";
  trigger: string;
  purpose: string;
}

export const SKILLS: SkillEntry[] = [
  { name: "using-evidiq-methodology", category: "meta", trigger: "session start / 'what skills are available'", purpose: "Bootstrap: list skills, carry §0 defects, route to the next skill in the session flow." },
  { name: "spec-brainstorming", category: "core", trigger: "'build MCP #16' / design a new service", purpose: "Design review with frozen contract (§17). HARD GATE: no code until frozen + user approves." },
  { name: "plan-writing", category: "core", trigger: "design frozen, need PLAN.md", purpose: "PLAN.md with §0 defects, §17 freeze, two-phase scope, bite-sized TDD tasks. Calls validate_plan_sections." },
  { name: "tdd-implementation", category: "core", trigger: "PLAN.md frozen, writing code", purpose: "RED-GREEN-REFACTOR with vitest. 33+ tests. Deterministic invariants. No model in verdict path." },
  { name: "phased-deployment", category: "core", trigger: "tests green, deploy to VPS", purpose: "Phase 1 bypass → run.sh deploy → curl sweep → 10-tool test. Phase 2 gate on. Calls curl_sweep/diff_capabilities/verify_determinism." },
  { name: "x402-verification", category: "core", trigger: "Phase 2 entry, gate on", purpose: "§23 checklist: free 200, unpaid 402, §41-C decode, payment quote, paid replay → settle → 0x1. Calls validate_x402_challenge/scan_git_history." },
  { name: "okx-registration", category: "core", trigger: "Phase 2 proven, list on OKX", purpose: "Pre-check canCreate, avatar, validate-listing, create ASP + 10 services, activate → read submitApproval. STOP. Calls check_okx_status." },
  { name: "documentation-sync", category: "core", trigger: "registered, sync docs", purpose: "README (proven table, badge, arch, verif log), landing (docs.ts, page.tsx, hero SVG), runbook (§24, §NN, X402 §13). Calls check_git_toplevel." },
  { name: "security-audit", category: "debugging", trigger: "final gate before 'Fleet +1'", purpose: "Git history scan, .git toplevel check, no hardcoded keys, no WWW-Authenticate. Calls scan_git_history/check_git_toplevel." },
  { name: "subagent-driven-development", category: "meta", trigger: "delegate §12 tasks to subagents", purpose: "Fresh subagent per task, two-stage review, 5-round fix loop, ledger. Escalates to systematic-debugging." },
  { name: "executing-plans", category: "meta", trigger: "drive the build with checkpoints", purpose: "Batch execution with 4 human gates: contract freeze, Phase 1 pass, Phase 2 pass, OKX submit." },
  { name: "git-hygiene", category: "meta", trigger: "before any push from a service folder", purpose: "Service folder owns .git (defect #16). Push via GITHUB_TOKEN env helper. Force-push when purging secrets. Calls check_git_toplevel." },
  { name: "writing-skills", category: "meta", trigger: "codify a new EVIDIQ workflow gap", purpose: "Create new skills following the 9-section fleet pattern. Test against existing services." },
  { name: "systematic-debugging", category: "debugging", trigger: "deployed failure / OKX rejection / fix-loop bottom", purpose: "4-phase root cause, specialized for x402 timeout, OKX rejection, env-file, name mismatch, 0G mock." },
  { name: "verification-before-completion", category: "debugging", trigger: "before declaring a phase 'done'", purpose: "Live curl cross-verification, diff tools/list vs *_capabilities, determinism 2×, 10/10 match. Calls curl_sweep/diff_capabilities/verify_determinism." },
];

export interface ToolEntry {
  name: string;
  purpose: string;
  calledBy: string;
}

export const TOOLS: ToolEntry[] = [
  { name: "scan_git_history", purpose: "Scan all commits in a repo for private keys (EVM 0x64hex), GitHub PATs, OKX creds, mnemonics, PAT-in-URL.", calledBy: "security-audit" },
  { name: "check_git_toplevel", purpose: "Verify git rev-parse --show-toplevel returns the service folder, not the ops root. Defect #16.", calledBy: "git-hygiene, documentation-sync" },
  { name: "validate_x402_challenge", purpose: "Decode base64 challenge, verify §41-C compliance (v2/exact/eip155:196/asset/payTo/maxTimeout:300). WWW-Authenticate absent.", calledBy: "x402-verification" },
  { name: "check_okx_status", purpose: "Query onchainos agent get-agents --agent-ids <N>, parse approvalLabel + statusLabel + approvalRemark.", calledBy: "okx-registration" },
  { name: "validate_plan_sections", purpose: "Check PLAN.md has all required sections (§0 defects, §17 freeze, two-phase scope, tool inventory, determinism, env, deploy, release checklist).", calledBy: "plan-writing" },
  { name: "verify_determinism", purpose: "Call a free MCP tool 2× with same input, compare deep JSON equality. (Paid digest comparison is manual — not callable without payment header.)", calledBy: "verification-before-completion, phased-deployment" },
  { name: "diff_capabilities", purpose: "Compare tools/list vs *_capabilities.tools, report match/mismatch. Defect #8/#9.", calledBy: "verification-before-completion, phased-deployment" },
  { name: "curl_sweep", purpose: "HEAD/GET/POST sweep with --max-time 10, report status + timing + hangs. Defect #14.", calledBy: "phased-deployment, verification-before-completion" },
  { name: "methodology_capabilities", purpose: "List all 15 skills, 9 tools, and the 16 defects. Bootstrap confirmation the verification MCP is reachable.", calledBy: "using-evidiq-methodology" },
];

export interface DefectEntry {
  number: number;
  title: string;
  prevents: string;
}

export const DEFECTS: DefectEntry[] = [
  { number: 1, title: "Fallback signing key in source", prevents: "No process.env.KEY || '0x…' anywhere; crash on missing signer env. scan_git_history catches leaks." },
  { number: 2, title: "Claim derived from config, not check", prevents: "Every claim in a report traces to an executed trace step." },
  { number: 3, title: "Free tool erroring on {}", prevents: "capabilities/validate/estimate handle no-arg calls without throwing." },
  { number: 4, title: "Enum/regex in free-tool schema causing 402", prevents: "Free tools accept {} or minimal valid input; no rejective zod schemas." },
  { number: 5, title: "'Not found' returned as error (isError)", prevents: "Return a normal result with a not-found message." },
  { number: 6, title: "Verdict about nothing", prevents: "BLOCK requires ≥1 BLOCK-action violation; verdict derived from the trace." },
  { number: 7, title: "estimate_cost inventing answers", prevents: "Only quote tools in PAID_TOOLS + the canonical free ones." },
  { number: 8, title: "Capabilities describing half the service", prevents: "*_capabilities.tools == tools/list (diff_capabilities before deploy, 10/10)." },
  { number: 9, title: "Stated capability with no implementation", prevents: "Every tool in tools/list has a registered handler." },
  { number: 10, title: "Charging then rejecting input", prevents: "validate_* refuses exactly what paid tools refuse." },
  { number: 11, title: "Detectors tested only in convenient form", prevents: "Test through the MCP transport, not just the library." },
  { number: 12, title: "Model in deterministic hot path", prevents: "No model, no network, no random in the verdict path. verify_determinism on free tools." },
  { number: 13, title: "x402 header mistakes (WWW-Authenticate, error in base64, GET /mcp 200)", prevents: "validate_x402_challenge + no WWW-Authenticate header; error in JSON body only." },
  { number: 14, title: "HEAD /mcp hang", prevents: "Answer HEAD explicitly (no body) before the MCP handler. curl_sweep detects hangs." },
  { number: 15, title: "Container without env-file", prevents: "Always deploy via deploy/run.sh which includes --env-file." },
  { number: 16, title: "Wrong repo content on GitHub push (no own .git)", prevents: "git rev-parse --show-toplevel must be the service folder; git init if missing. check_git_toplevel." },
];

export function getCatalog() {
  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    slug: SLUG,
    paymentGate: "none (9 free tools — infrastructure)",
    skillsCount: SKILLS.length,
    toolsCount: TOOLS.length,
    defectsCount: DEFECTS.length,
    skills: SKILLS,
    tools: TOOLS,
    defects: DEFECTS,
    references: [
      "evidiq-methodology/EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md (frozen, 1144 lines)",
      "EVIDIQ-RUNBOOK.md §23 (payments), §24 (registry + rules), §26 (mistakes), §41 (challenge format)",
      "EVIDIQ-X402-RUNBOOK.md (payment protocol)",
    ],
  };
}
