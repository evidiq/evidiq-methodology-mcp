import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { getCatalog } from "./lib/catalog.js";
import { validateX402Challenge } from "./lib/validators/x402.js";
import { scanGitHistory, checkGitToplevel } from "./lib/scanners/git.js";
import { checkOkxStatus } from "./lib/okx/status.js";
import { validatePlanSections } from "./lib/plan/sections.js";
import { verifyDeterminism } from "./lib/verify/determinism.js";
import { diffCapabilities } from "./lib/verify/capabilities.js";
import { curlSweep } from "./lib/verify/curl.js";
import { createAttestation, methodologySignerAvailable } from "./lib/methodology/report.js";
import { anchorToOgStorage } from "./lib/og/storage.js";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const artifactStore = new Map<string, unknown>();

const INSTRUCTIONS = `EVIDIQ Methodology MCP — fleet production verification tools. 15 tools (5 free, 10 paid).

Free tools (always 200): methodology_capabilities, validate_plan_sections, diff_capabilities, curl_sweep, verify_determinism.

Paid tools (x402-gated, USDT0 on eip155:196): audit_git_history (0.005), check_okx_status (0.005), validate_x402_compliance (0.01), validate_plan_freeze (0.01), pre_submit_check (0.015), scan_deployment_env (0.02), production_readiness_score (0.02), verify_onchain_proof (0.02), generate_runbook_entry (0.03), attest_readiness (0.03). Payment settles before work begins.`;

interface Finding {
  defect: number;
  title: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

async function runReadinessAudit(
  targetUrl: string,
  repoPath: string | undefined,
  agentId: string | number
): Promise<{
  score: number;
  passed: number;
  failed: number;
  skipped: number;
  findings: Finding[];
  verdict: string;
  okxStatus: unknown;
}> {
  const defects = getCatalog().defects;
  const findings: Finding[] = [];
  const base = targetUrl.replace(/\/mcp\/?$/, "");
  const mcpUrl = /\/mcp\/?$/.test(targetUrl) ? targetUrl.replace(/\/+$/, "") : `${base}/mcp`;

  const sweep = await curlSweep({ baseUrl: base }).catch(() => null);
  const git = repoPath ? scanGitHistory(repoPath) : null;
  const toplevel = repoPath ? checkGitToplevel(repoPath) : null;
  const okx = checkOkxStatus(agentId);

  findings.push({
    defect: 1,
    title: defects[0].title,
    status: git ? (git.hits.filter((h) => h.severity === "critical").length === 0 ? "pass" : "fail") : "skip",
    detail: git ? `${git.hits.length} hits (${git.hits.filter((h) => h.severity === "critical").length} critical) across ${git.commitsScanned} commits` : "repoPath not provided",
  });

  findings.push({ defect: 2, title: defects[1].title, status: "skip", detail: "not auto-checkable (requires trace inspection)" });

  const postEntry = sweep?.results.find((r) => r.method === "POST" && r.path === "/mcp");
  findings.push({
    defect: 3,
    title: defects[2].title,
    status: postEntry ? (postEntry.status >= 200 && postEntry.status < 400 ? "pass" : "fail") : "skip",
    detail: postEntry ? `POST /mcp tools/list → ${postEntry.status}` : "sweep unavailable",
  });

  findings.push({ defect: 4, title: defects[3].title, status: "skip", detail: "requires free-tool schema introspection" });
  findings.push({ defect: 5, title: defects[4].title, status: "skip", detail: "requires target tool semantics" });
  findings.push({ defect: 6, title: defects[5].title, status: "skip", detail: "N/A for methodology service" });
  findings.push({ defect: 7, title: defects[6].title, status: "skip", detail: "no estimate_cost tool in this service" });
  findings.push({ defect: 8, title: defects[7].title, status: "skip", detail: "run diff_capabilities separately (needs capabilitiesTool)" });
  findings.push({ defect: 9, title: defects[8].title, status: "skip", detail: "requires tools/list × handler cross-check" });
  findings.push({ defect: 10, title: defects[9].title, status: "skip", detail: "requires paid-tool input rejection parity check" });
  findings.push({ defect: 11, title: defects[10].title, status: "skip", detail: "requires test-suite inspection" });
  findings.push({ defect: 12, title: defects[11].title, status: "skip", detail: "requires hot-path code inspection" });

  let x402Status: "pass" | "fail" | "skip" = "skip";
  let x402Detail = "x402 challenge not available";
  try {
    const r = await fetch(mcpUrl, { method: "GET", headers: { Accept: "application/json" } });
    const hdrs: Record<string, string | string[] | undefined> = {};
    r.headers.forEach((v, k) => {
      hdrs[k] = v;
    });
    if (r.status === 402) {
      const v = validateX402Challenge({ headers: hdrs });
      x402Status = v.ok ? "pass" : "fail";
      x402Detail = v.ok ? "x402 challenge §41-C compliant, no WWW-Authenticate" : `x402 violations: ${v.errors.join("; ")}`;
    } else {
      x402Detail = `GET /mcp → ${r.status} (no 402; gate may be bypassed)`;
    }
  } catch (e: any) {
    x402Detail = `x402 fetch failed: ${e?.message || e}`;
  }
  findings.push({ defect: 13, title: defects[12].title, status: x402Status, detail: x402Detail });

  const headEntry = sweep?.results.find((r) => r.method === "HEAD" && r.path === "/mcp");
  findings.push({
    defect: 14,
    title: defects[13].title,
    status: headEntry ? (!headEntry.hang && headEntry.status > 0 ? "pass" : "fail") : "skip",
    detail: headEntry ? `HEAD /mcp → ${headEntry.status} in ${headEntry.timeMs}ms${headEntry.hang ? " (HANG)" : ""}` : "sweep unavailable",
  });

  const healthEntry = sweep?.results.find((r) => r.method === "GET" && r.path === "/health");
  findings.push({
    defect: 15,
    title: defects[14].title,
    status: healthEntry ? (healthEntry.status >= 200 && healthEntry.status < 400 ? "pass" : "fail") : "skip",
    detail: healthEntry ? `GET /health → ${healthEntry.status}` : "sweep unavailable",
  });

  findings.push({
    defect: 16,
    title: defects[15].title,
    status: toplevel ? (toplevel.matches ? "pass" : "fail") : "skip",
    detail: toplevel ? (toplevel.matches ? "toplevel matches service folder" : toplevel.error || "toplevel mismatch (defect #16)") : "repoPath not provided",
  });

  const passed = findings.filter((f) => f.status === "pass").length;
  const failed = findings.filter((f) => f.status === "fail").length;
  const skipped = findings.filter((f) => f.status === "skip").length;
  const evaluated = passed + failed;
  const score = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 0;
  const verdict = score >= 80 ? "READY" : score >= 50 ? "CONDITIONAL" : "NOT READY";
  return { score, passed, failed, skipped, findings, verdict, okxStatus: okx };
}

export const handler = createMcpHandler(
  (server) => {
    // ── FREE 1: methodology_capabilities ───────────────────────────────────
    server.registerTool(
      "methodology_capabilities",
      {
        title: "Catalog: 15 skills, 15 tools, 16 defects",
        description:
          "Return the live catalog: all 15 skills (name, category, trigger, purpose), the 15 MCP tools (5 free + 10 paid), and the 16 §0 defects (number, title, how-to-prevent). Bootstrap confirmation the verification MCP is reachable. Free.",
        inputSchema: {},
      },
      async () => textResult(getCatalog())
    );

    // ── FREE 2: validate_plan_sections ─────────────────────────────────────
    server.registerTool(
      "validate_plan_sections",
      {
        title: "Validate PLAN.md has all required EVIDIQ sections",
        description:
          "Check a PLAN.md (by path or inline content) for: §0 defects carry-forward, §17 contract freeze, two-phase scope, tool inventory, determinism contract, env section, deploy section, release checklist. Returns present + missing + hints. Free.",
        inputSchema: {
          planPath: z.string().optional().describe("Absolute path to PLAN.md."),
          planContent: z.string().optional().describe("Inline PLAN.md content (use if the file isn't reachable from the MCP env)."),
        },
      },
      async ({ planPath, planContent }) => {
        if (!planPath && planContent === undefined) {
          return textResult({
            ok: false,
            usage: "Provide `planPath` or `planContent`. Checks for: §0 defects, §17 freeze, two-phase scope, tool inventory, determinism, env, deploy, release checklist.",
            note: "Free. plan-writing uses this on the draft + at handoff.",
          });
        }
        return textResult(validatePlanSections({ planPath, planContent }));
      }
    );

    // ── FREE 3: diff_capabilities ──────────────────────────────────────────
    server.registerTool(
      "diff_capabilities",
      {
        title: "Diff tools/list vs *_capabilities.tools (defect #8/#9)",
        description:
          "Compare a service's MCP tools/list vs its *_capabilities.tools list. Reports onlyInToolsList (defect #9) + onlyInCapabilities (defect #8). Free.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint, e.g. https://mcp.evidiq.dev/methodology/mcp."),
          capabilitiesTool: z.string().optional().describe("The capabilities tool name, e.g. methodology_capabilities."),
        },
      },
      async (params) => {
        const targetUrl = params?.targetUrl;
        const capabilitiesTool = params?.capabilitiesTool;
        if (!targetUrl || !capabilitiesTool) {
          return textResult({
            match: false,
            usage: "Provide `targetUrl` + `capabilitiesTool`. Returns match + onlyInToolsList + onlyInCapabilities.",
            note: "Free. Defect #8/#9 detection.",
          });
        }
        return textResult(await diffCapabilities({ targetUrl, capabilitiesTool }));
      }
    );

    // ── FREE 4: curl_sweep ─────────────────────────────────────────────────
    server.registerTool(
      "curl_sweep",
      {
        title: "HEAD/GET/POST sweep with 10s timeout (defect #14)",
        description:
          "Sweep /health, /x402, /skill.md, /mcp (HEAD + GET + POST tools/list) of a service with a 10-second timeout per request. Reports status + timing + hang flag per method/path. Defect #14 (HEAD /mcp hang) detector. Free.",
        inputSchema: {
          baseUrl: z.string().optional().describe("Service base URL, e.g. https://mcp.evidiq.dev/methodology (no trailing slash)."),
        },
      },
      async ({ baseUrl }) => {
        if (!baseUrl) {
          return textResult({
            ok: false,
            usage: "Provide `baseUrl` (e.g. https://mcp.evidiq.dev/methodology). Sweeps /health, /x402, /skill.md, /mcp (HEAD/GET/POST) with 10s timeout.",
            note: "Free. Defect #14 (HEAD /mcp hang) detector.",
          });
        }
        return textResult(await curlSweep({ baseUrl }));
      }
    );

    // ── FREE 5: verify_determinism ─────────────────────────────────────────
    server.registerTool(
      "verify_determinism",
      {
        title: "Call a free MCP tool 2× and compare (deep JSON equality)",
        description:
          "Call a FREE MCP tool on a target service 2× with identical input and deep-compare the JSON responses. Paid-tool reportDigest determinism (RFC 6979) is a manual playbook §3.7 step. Free.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint, e.g. https://mcp.evidiq.dev/methodology/mcp."),
          toolName: z.string().optional().describe("Free tool to call 2×, e.g. methodology_capabilities."),
          arguments: z.record(z.string(), z.any()).optional().describe("Arguments to pass (defaults to {})."),
        },
      },
      async (params) => {
        const targetUrl = params?.targetUrl;
        const toolName = params?.toolName;
        if (!targetUrl || !toolName) {
          return textResult({
            deterministic: false,
            usage: "Provide `targetUrl` + `toolName` (+ optional `arguments`). Calls the target's free tool 2× and deep-compares the JSON response.",
            note: "Free. Paid-tool reportDigest determinism is manual (playbook §3.7).",
          });
        }
        return textResult(await verifyDeterminism({ targetUrl, toolName, arguments: params?.arguments }));
      }
    );

    // ── PAID 1: audit_git_history (0.005 USDT0) ────────────────────────────
    server.registerTool(
      "audit_git_history",
      {
        title: "Scan git history for leaked secrets + verify toplevel (defects #1, #16)",
        description:
          "Run scanGitHistory (EVM private keys, GitHub PATs, OKX creds, mnemonics, PAT-in-URL) and checkGitToplevel on a repo. Returns the hit list + toplevel match in one audit. Costs 0.005 USDT0. Paid.",
        inputSchema: {
          repoPath: z.string().optional().describe("Absolute path to the git repo to audit (e.g. /home/cucu/Coder/EVIDIQ/evidiq-methodology-mcp)."),
        },
      },
      async ({ repoPath }) => {
        if (!repoPath) {
          return textResult({
            ok: false,
            usage: "Provide `repoPath` (absolute path to a git repo). Scans history for leaked keys + verifies .git toplevel.",
            note: "Paid. Costs 0.005 USDT0. Defects #1 + #16.",
          });
        }
        const git = scanGitHistory(repoPath);
        const toplevel = checkGitToplevel(repoPath);
        return textResult({
          ok: git.ok && toplevel.matches,
          hits: git.hits,
          commitsScanned: git.commitsScanned,
          bytesScanned: git.bytesScanned,
          toplevel,
        });
      }
    );

    // ── PAID 2: check_okx_status (0.005 USDT0) ─────────────────────────────
    server.registerTool(
      "check_okx_status",
      {
        title: "Query OKX.AI listing status for an agent (approvalLabel, approvalRemark)",
        description:
          "Run `onchainos agent get-agents --agent-ids <id>` and parse approvalLabel, statusLabel, approvalDisplayStatus, approvalRemark, communicationAddress. Degrades to the manual ssh command if onchainos is not on PATH. Costs 0.005 USDT0. Paid.",
        inputSchema: {
          agentId: z.union([z.number(), z.string()]).optional().describe("Numeric OKX agent ID (e.g. 10385)."),
        },
      },
      async ({ agentId }) => {
        if (agentId === undefined || agentId === null || agentId === "") {
          return textResult({
            ok: false,
            usage: "Provide `agentId` (numeric). Returns approvalLabel + approvalRemark (read literally — §23) + communicationAddress.",
            note: "Paid. Costs 0.005 USDT0.",
          });
        }
        return textResult(checkOkxStatus(agentId));
      }
    );

    // ── PAID 3: validate_x402_compliance (0.01 USDT0) ──────────────────────
    server.registerTool(
      "validate_x402_compliance",
      {
        title: "Decode + validate an x402 v2 challenge (§41-C)",
        description:
          "Decode a base64 x402 v2 challenge (or read payment-required/x-payment-required headers) and verify §41-C compliance: x402Version:2, scheme:exact, network:eip155:196, asset, payTo, maxTimeoutSeconds:300, extra:{name:'USD₮0',version:'1'}. Confirms WWW-Authenticate is absent (§41-A trap). Costs 0.01 USDT0. Paid.",
        inputSchema: {
          challengeBase64: z.string().optional().describe("Base64-encoded x402 v2 challenge (the payment-required header value)."),
          headers: z.record(z.string(), z.any()).optional().describe("Raw response headers (case-insensitive). Used to detect WWW-Authenticate + extract payment-required."),
        },
      },
      async ({ challengeBase64, headers }) => {
        if (!challengeBase64 && !headers) {
          return textResult({
            ok: false,
            usage: "Provide `challengeBase64`, or `headers` with payment-required/x-payment-required. Validates §41-C structure + WWW-Authenticate absence.",
            note: "Paid. Costs 0.01 USDT0. §41-A trap detector.",
          });
        }
        return textResult(
          validateX402Challenge({
            challengeBase64,
            headers: headers as Record<string, string | string[] | undefined> | undefined,
          })
        );
      }
    );

    // ── PAID 4: validate_plan_freeze (0.01 USDT0) ──────────────────────────
    server.registerTool(
      "validate_plan_freeze",
      {
        title: "Validate PLAN.md §17 contract freeze + determinism contract",
        description:
          "Run validatePlanSections and additionally confirm the literal 'Contract Freeze' text + determinism contract are present in the plan. Costs 0.01 USDT0. Paid.",
        inputSchema: {
          planPath: z.string().optional().describe("Absolute path to PLAN.md."),
          planContent: z.string().optional().describe("Inline PLAN.md content."),
        },
      },
      async ({ planPath, planContent }) => {
        if (!planPath && planContent === undefined) {
          return textResult({
            ok: false,
            usage: "Provide `planPath` or `planContent`. Checks required sections + §17 Contract Freeze text + determinism contract.",
            note: "Paid. Costs 0.01 USDT0.",
          });
        }
        const sections = validatePlanSections({ planPath, planContent });
        let planText = "";
        if (typeof planContent === "string") {
          planText = planContent;
        } else if (planPath) {
          try {
            planText = readFileSync(planPath, "utf8");
          } catch {
            planText = "";
          }
        }
        const contractFreezePresent = /contract\s+freeze/i.test(planText) || /§17/i.test(planText);
        const determinismContractPresent = /determinism/i.test(planText) || /reportDigest/i.test(planText);
        return textResult({
          ok: sections.ok && contractFreezePresent && determinismContractPresent,
          sections,
          contractFreezePresent,
          determinismContractPresent,
        });
      }
    );

    // ── PAID 5: pre_submit_check (0.015 USDT0) ─────────────────────────────
    server.registerTool(
      "pre_submit_check",
      {
        title: "Pre-submission go/no-go: curl sweep + diff capabilities + x402 compliance",
        description:
          "Runs curl_sweep on the target base, diff_capabilities vs tools/list, and validates the target's x402 challenge (GET /mcp 402). Combines the three into a single go/no-go report. Costs 0.015 USDT0. Paid.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint (…/mcp) or base URL."),
          capabilitiesTool: z.string().optional().describe("Capabilities tool name, e.g. methodology_capabilities."),
        },
      },
      async ({ targetUrl, capabilitiesTool }) => {
        if (!targetUrl || !capabilitiesTool) {
          return textResult({
            go: false,
            usage: "Provide `targetUrl` + `capabilitiesTool`. Runs curl_sweep + diff_capabilities + validate_x402_compliance.",
            note: "Paid. Costs 0.015 USDT0.",
          });
        }
        const base = targetUrl.replace(/\/mcp\/?$/, "");
        const mcpUrl = /\/mcp\/?$/.test(targetUrl) ? targetUrl.replace(/\/+$/, "") : `${base}/mcp`;

        const sweep = await curlSweep({ baseUrl: base }).catch(() => null);
        const diff = await diffCapabilities({ targetUrl: mcpUrl, capabilitiesTool }).catch(() => null);

        let x402: {
          ok: boolean;
          errors?: string[];
          warnings?: string[];
          decoded?: unknown;
          wwwAuthenticatePresent?: boolean;
          challengeSource?: string | null;
          note?: string;
          status?: number;
          error?: string;
        } = { ok: false, note: "no 402 received (gate may be bypassed)" };
        try {
          const r = await fetch(mcpUrl, { method: "GET", headers: { Accept: "application/json" } });
          const hdrs: Record<string, string | string[] | undefined> = {};
          r.headers.forEach((v, k) => {
            hdrs[k] = v;
          });
          if (r.status === 402) {
            x402 = validateX402Challenge({ headers: hdrs });
          } else {
            x402 = { ok: false, note: `GET /mcp returned ${r.status} (expected 402 for a gated service)`, status: r.status };
          }
        } catch (e: any) {
          x402 = { ok: false, error: e?.message || String(e) };
        }

        const checks = [
          { name: "curl_sweep", pass: !!sweep?.ok, result: sweep ?? { ok: false, error: "curl_sweep threw" } },
          { name: "diff_capabilities", pass: !!diff?.match, result: diff ?? { match: false, error: "diff_capabilities threw" } },
          { name: "validate_x402_compliance", pass: !!x402.ok, result: x402 },
        ];
        const go = checks.every((c) => c.pass);
        return textResult({ go, checks });
      }
    );

    // ── PAID 6: scan_deployment_env (0.02 USDT0) ───────────────────────────
    server.registerTool(
      "scan_deployment_env",
      {
        title: "Inspect target container env via /health",
        description:
          "Fetches the target service's /health JSON and checks signerAvailable, paymentGate (enforced/bypassed), and OKX credentials presence. Confirms the container booted with its env-file. Costs 0.02 USDT0. Paid.",
        inputSchema: {
          healthUrl: z.string().optional().describe("Target /health URL, e.g. https://mcp.evidiq.dev/methodology/health."),
        },
      },
      async ({ healthUrl }) => {
        if (!healthUrl) {
          return textResult({
            ok: false,
            usage: "Provide `healthUrl` (target /health). Checks signerAvailable + paymentGate + okx creds.",
            note: "Paid. Costs 0.02 USDT0.",
          });
        }
        try {
          const r = await fetch(healthUrl, { headers: { Accept: "application/json" } });
          const body: any = await r.json().catch(() => null);
          const signerAvailable = !!body?.signerAvailable;
          const paymentGate = typeof body?.paymentGate === "string" ? body.paymentGate : "unknown";
          const okxCredentialsPresent = !!body?.okxCredentialsPresent || paymentGate === "enforced";
          const gateSane = paymentGate === "enforced" || paymentGate === "bypassed";
          const ok = r.status >= 200 && r.status < 300 && signerAvailable && gateSane;
          return textResult({
            ok,
            status: r.status,
            signerAvailable,
            paymentGate,
            okxCredentialsPresent,
            raw: body,
          });
        } catch (e: any) {
          return textResult({ ok: false, error: e?.message || String(e) });
        }
      }
    );

    // ── PAID 7: production_readiness_score (0.02 USDT0) ────────────────────
    server.registerTool(
      "production_readiness_score",
      {
        title: "Score 0-100 against the 16-defect production checklist",
        description:
          "Runs curl_sweep on the target, scanGitHistory + checkGitToplevel on the repo, and checkOkxStatus on the agent, then scores the service against the 16 §0 defects. Returns score, passed/failed counts, and per-defect findings. Costs 0.02 USDT0. Paid.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint or base URL."),
          repoPath: z.string().optional().describe("Absolute path to the service git repo."),
          agentId: z.union([z.number(), z.string()]).optional().describe("Numeric OKX agent ID."),
        },
      },
      async ({ targetUrl, repoPath, agentId }) => {
        if (!targetUrl || !repoPath || agentId === undefined || agentId === null || agentId === "") {
          return textResult({
            ok: false,
            usage: "Provide `targetUrl` + `repoPath` + `agentId`. Scores the service against the 16 §0 defects.",
            note: "Paid. Costs 0.02 USDT0.",
          });
        }
        const audit = await runReadinessAudit(targetUrl, repoPath, agentId);
        return textResult({
          ok: audit.score >= 80,
          score: audit.score,
          passed: audit.passed,
          failed: audit.failed,
          skipped: audit.skipped,
          verdict: audit.verdict,
          findings: audit.findings,
          okxStatus: audit.okxStatus,
        });
      }
    );

    // ── PAID 8: verify_onchain_proof (0.02 USDT0) ──────────────────────────
    server.registerTool(
      "verify_onchain_proof",
      {
        title: "Verify an onchain settle tx via eth_getTransactionReceipt",
        description:
          "Queries https://rpc.xlayer.tech with eth_getTransactionReceipt and parses status (0x1 success / 0x0 fail), blockNumber, gasUsed, from/to. Confirms a payment settle or 0G anchor tx actually landed. Costs 0.02 USDT0. Paid.",
        inputSchema: {
          txHash: z.string().optional().describe("0x-prefixed 64-hex transaction hash."),
        },
      },
      async ({ txHash }) => {
        if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          return textResult({
            ok: false,
            usage: "Provide `txHash` (0x + 64 hex). Queries eth_getTransactionReceipt on https://rpc.xlayer.tech.",
            note: "Paid. Costs 0.02 USDT0.",
          });
        }
        try {
          const r = await fetch("https://rpc.xlayer.tech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
          });
          const json: any = await r.json().catch(() => null);
          const receipt = json?.result;
          if (!receipt) {
            return textResult({ ok: false, txHash, error: json?.error?.message || "no receipt (tx not found or not finalized)" });
          }
          const success = receipt.status === "0x1";
          return textResult({
            ok: success,
            txHash,
            status: receipt.status,
            success,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            from: receipt.from,
            to: receipt.to,
            transactionHash: receipt.transactionHash,
          });
        } catch (e: any) {
          return textResult({ ok: false, txHash, error: e?.message || String(e) });
        }
      }
    );

    // ── PAID 9: generate_runbook_entry (0.03 USDT0) ────────────────────────
    server.registerTool(
      "generate_runbook_entry",
      {
        title: "Generate §24 registry row + §NN section template",
        description:
          "Produces an EVIDIQ-RUNBOOK §24 registry row and a §NN per-service section template from an agentId + anchor txHash. Pure markdown text generation, no external calls. Costs 0.03 USDT0. Paid.",
        inputSchema: {
          agentId: z.union([z.number(), z.string()]).optional().describe("Numeric OKX agent ID."),
          txHash: z.string().optional().describe("0G/storage anchor or settle tx hash."),
        },
      },
      async ({ agentId, txHash }) => {
        if (agentId === undefined || agentId === null || agentId === "" || !txHash) {
          return textResult({
            ok: false,
            usage: "Provide `agentId` + `txHash`. Generates §24 registry row + §NN section markdown.",
            note: "Paid. Costs 0.03 USDT0.",
          });
        }
        const id = String(agentId);
        const ts = new Date().toISOString();
        const signerLine = methodologySignerAvailable() ? "available" : "MISSING (set METHODOLOGY_SIGNER_PRIVATE_KEY)";
        const markdown = `## §24 Registry Row

| agentId | service | slug | anchorTx | timestamp |
|---------|---------|------|----------|-----------|
| ${id} | EVIDIQ Methodology MCP | methodology | ${txHash} | ${ts} |

## §NN.${id} EVIDIQ Methodology MCP

- **agentId:** ${id}
- **slug:** methodology
- **publicBaseUrl:** https://mcp.evidiq.dev/methodology
- **anchorTx:** ${txHash}
- **anchored:** ${ts}
- **tools:** 15 (5 free, 10 paid)
- **x402:** eip155:196 / USDT0 / exact
- **signer:** ${signerLine}
`;
        return textResult({ ok: true, agentId: id, txHash, markdown });
      }
    );

    // ── PAID 10: attest_readiness (0.03 USDT0) ─────────────────────────────
    server.registerTool(
      "attest_readiness",
      {
        title: "Full readiness audit + EIP-191 signed attestation + 0G anchor",
        description:
          "Runs the 16-defect readiness audit, binds the verdict into an EIP-191 signed attestation (reportDigest + signature) via the methodology signer, and anchors it to 0G Storage. Returns the attestation + anchor tx, stored for later retrieval. Costs 0.03 USDT0. Paid.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint or base URL."),
          repoPath: z.string().optional().describe("Absolute path to the service git repo."),
          agentId: z.union([z.number(), z.string()]).optional().describe("Numeric OKX agent ID."),
        },
      },
      async ({ targetUrl, repoPath, agentId }) => {
        if (!targetUrl || agentId === undefined || agentId === null || agentId === "") {
          return textResult({
            ok: false,
            usage: "Provide `targetUrl` + `agentId` (repoPath optional — git checks skip if absent). Runs the audit, signs the attestation, anchors to 0G.",
            note: "Paid. Costs 0.03 USDT0.",
          });
        }
        const audit = await runReadinessAudit(targetUrl, repoPath, agentId);
        if (!methodologySignerAvailable()) {
          return textResult({
            ok: false,
            audit,
            signerAvailable: false,
            error: "METHODOLOGY_SIGNER_PRIVATE_KEY not set — cannot sign attestation.",
          });
        }
        const attestation = await createAttestation({
          verdict: audit.verdict,
          score: audit.score,
          totalChecks: audit.passed + audit.failed,
          passedChecks: audit.passed,
          findings: audit.findings.map((f) => `[#${f.defect} ${f.status}] ${f.title}: ${f.detail}`),
        });
        if (!attestation) {
          return textResult({ ok: false, audit, error: "Attestation signing failed." });
        }
        const ogAnchor = await anchorToOgStorage({ ...attestation });
        const record = { attestation, ogAnchor, audit };
        artifactStore.set(attestation.reportDigest, record);
        return textResult({ ok: true, attestation, ogAnchor, audit });
      }
    );
  },
  {
    instructions: INSTRUCTIONS,
    capabilities: { tools: {} },
  },
  {
    basePath: "",
    maxDuration: 300,
    verboseLogs: false,
  }
);
