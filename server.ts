import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getCatalog } from "./lib/catalog.js";
import { validateX402Challenge } from "./lib/validators/x402.js";
import { scanGitHistory, checkGitToplevel } from "./lib/scanners/git.js";
import { checkOkxStatus } from "./lib/okx/status.js";
import { validatePlanSections } from "./lib/plan/sections.js";
import { verifyDeterminism } from "./lib/verify/determinism.js";
import { diffCapabilities } from "./lib/verify/capabilities.js";
import { curlSweep } from "./lib/verify/curl.js";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const INSTRUCTIONS = `EVIDIQ Methodology MCP — fleet production verification tools (infrastructure, all 9 tools free, no payment gate).

Used by the EVIDIQ Methodology skills during the MCP build/deploy/register workflow:
- methodology_capabilities: bootstrap catalog (15 skills, 9 tools, 16 defects).
- scan_git_history / check_git_toplevel: security-audit + git-hygiene (defects #1, #16).
- validate_x402_challenge: x402-verification (§41-C compliance, no WWW-Authenticate).
- check_okx_status: okx-registration (approvalLabel, approvalRemark — read literally).
- validate_plan_sections: plan-writing (§0 + §17 + two-phase scope present).
- verify_determinism: 2× free-tool response equality (paid digest is manual playbook §3.7).
- diff_capabilities: tools/list vs *_capabilities.tools (defect #8/#9; expect 10/10).
- curl_sweep: HEAD/GET/POST sweep with 10s timeout (defect #14 HEAD /mcp hang).

Every tool is free and returns 200. No payment-required header, no 402, no signer.`;

export const handler = createMcpHandler(
  (server) => {
    // ── 1. scan_git_history ─────────────────────────────────────────────────
    server.registerTool(
      "scan_git_history",
      {
        title: "Scan git history for leaked secrets (defect #1)",
        description:
          "Walk every commit of a repo with `git log -p --all` and regex-scan added lines for EVM private keys (0x + 64 hex), GitHub PATs (ghp_/github_pat_), OKX creds (OKX_API_KEY/SECRET_KEY/PASSPHRASE=), PAT-in-URL, and line-anchored mnemonics. Returns a hit list (commit + file + pattern + severity). Free.",
        inputSchema: {
          repoPath: z.string().optional().describe("Absolute path to the git repo to scan (e.g. /home/cucu/Coder/EVIDIQ/evidiq-bulwark-mcp)."),
        },
      },
      async ({ repoPath }) => {
        if (!repoPath) {
          return textResult({
            ok: false,
            hits: [],
            usage: "Provide `repoPath` (absolute path to a git repo). Scans `git log -p --all` for leaked keys (EVM 0x64hex, ghp_, OKX creds, mnemonics, PAT-in-URL).",
            note: "Free. Defect #1 detection — scans history, not just the working tree.",
          });
        }
        return textResult(scanGitHistory(repoPath));
      }
    );

    // ── 2. check_git_toplevel ───────────────────────────────────────────────
    server.registerTool(
      "check_git_toplevel",
      {
        title: "Verify git toplevel is the service folder (defect #16)",
        description:
          "Run `git rev-parse --show-toplevel` on a folder and confirm it returns that folder, NOT the ops workspace root. Defect #16: a service folder without its own .git inherits the ops .git, so `git push` sends private ops content (runbook, logos) to the public service repo. Free.",
        inputSchema: {
          repoPath: z.string().optional().describe("Absolute path to the service folder to verify."),
        },
      },
      async ({ repoPath }) => {
        if (!repoPath) {
          return textResult({
            ok: false,
            usage: "Provide `repoPath`. Returns { ok, toplevel, expected, matches }. Run before EVERY push from a service folder.",
            note: "Free. Defect #16 prevention.",
          });
        }
        return textResult(checkGitToplevel(repoPath));
      }
    );

    // ── 3. validate_x402_challenge ─────────────────────────────────────────
    server.registerTool(
      "validate_x402_challenge",
      {
        title: "Decode + validate an x402 v2 challenge (§41-C)",
        description:
          "Decode a base64 x402 v2 challenge (or read payment-required/x-payment-required headers) and verify §41-C compliance: x402Version:2, scheme:exact, network:eip155:196, asset:0x779ded0…13736, payTo:0x2a8efe…c9b0, maxTimeoutSeconds:300, extra:{name:'USD₮0',version:'1'}. Confirms WWW-Authenticate is absent (§41-A trap) and `error` is not inside the base64. Free.",
        inputSchema: {
          challengeBase64: z.string().optional().describe("Base64-encoded x402 v2 challenge (the payment-required header value)."),
          headers: z.record(z.string(), z.any()).optional().describe("Raw response headers (case-insensitive). Used to detect WWW-Authenticate + extract payment-required."),
        },
      },
      async ({ challengeBase64, headers }) => {
        if (!challengeBase64 && !headers) {
          return textResult({
            ok: false,
            usage: "Provide `challengeBase64`, or `headers` with payment-required/x-payment-required. Validates §41-C structure (v2/exact/eip155:196/USDT0/maxTimeout:300) and WWW-Authenticate absence.",
            note: "Free. §41-A trap detector.",
          });
        }
        return textResult(validateX402Challenge({ challengeBase64, headers: headers as Record<string, string | string[] | undefined> | undefined }));
      }
    );

    // ── 4. check_okx_status ────────────────────────────────────────────────
    server.registerTool(
      "check_okx_status",
      {
        title: "Query OKX.AI listing status for an agent (approvalLabel, approvalRemark)",
        description:
          "Run `onchainos agent get-agents --agent-ids <id>` and parse approvalLabel, statusLabel, approvalDisplayStatus, approvalRemark, communicationAddress. If onchainos is not reachable from the MCP environment, returns the exact manual command to run on the VPS. Free.",
        inputSchema: {
          agentId: z.union([z.number(), z.string()]).optional().describe("Numeric OKX agent ID (e.g. 10385)."),
        },
      },
      async ({ agentId }) => {
        if (agentId === undefined || agentId === null || agentId === "") {
          return textResult({
            ok: false,
            usage: "Provide `agentId` (numeric). Returns approvalLabel + approvalRemark (read literally — §23) + communicationAddress.",
            note: "Free. Degrades gracefully if onchainos is not on PATH.",
          });
        }
        return textResult(checkOkxStatus(agentId));
      }
    );

    // ── 5. validate_plan_sections ──────────────────────────────────────────
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

    // ── 6. verify_determinism ──────────────────────────────────────────────
    server.registerTool(
      "verify_determinism",
      {
        title: "Call a free MCP tool 2× and compare (deep JSON equality)",
        description:
          "Call a FREE MCP tool on a target service 2× with identical input and deep-compare the JSON responses. Paid-tool reportDigest determinism (RFC 6979) is a manual playbook §3.7 step — not callable without a payment-signature header. If the target returns 402, reports that paid-tools determinism is unsupported here. Free.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint, e.g. https://mcp.evidiq.dev/bulwark/mcp."),
          toolName: z.string().optional().describe("Free tool to call 2×, e.g. bulwark_capabilities."),
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

    // ── 7. diff_capabilities ───────────────────────────────────────────────
    server.registerTool(
      "diff_capabilities",
      {
        title: "Diff tools/list vs *_capabilities.tools (defect #8/#9)",
        description:
          "Compare a service's MCP tools/list vs its *_capabilities.tools list. Expects a 10/10 match for a healthy EVIDIQ service. Reports onlyInToolsList (defect #9 — advertised but no handler) + onlyInCapabilities (defect #8 — half-described). Free.",
        inputSchema: {
          targetUrl: z.string().optional().describe("Target MCP endpoint, e.g. https://mcp.evidiq.dev/bulwark/mcp."),
          capabilitiesTool: z.string().optional().describe("The capabilities tool name, e.g. bulwark_capabilities."),
        },
      },
      async (params) => {
        const targetUrl = params?.targetUrl;
        const capabilitiesTool = params?.capabilitiesTool;
        if (!targetUrl || !capabilitiesTool) {
          return textResult({
            match: false,
            usage: "Provide `targetUrl` + `capabilitiesTool`. Returns match + onlyInToolsList + onlyInCapabilities. Expect 10/10 MATCH.",
            note: "Free. Defect #8/#9 detection.",
          });
        }
        return textResult(await diffCapabilities({ targetUrl, capabilitiesTool }));
      }
    );

    // ── 8. curl_sweep ──────────────────────────────────────────────────────
    server.registerTool(
      "curl_sweep",
      {
        title: "HEAD/GET/POST sweep with 10s timeout (defect #14)",
        description:
          "Sweep /health, /x402, /skill.md, /mcp (HEAD + GET + POST tools/list) of a service with a 10-second timeout per request. Reports status + timing + hang flag per method/path. Defect #14 (HEAD /mcp hang) is the one that rejected three EVIDIQ listings at once. Free.",
        inputSchema: {
          baseUrl: z.string().optional().describe("Service base URL, e.g. https://mcp.evidiq.dev/methodology (no trailing slash)."),
        },
      },
      async ({ baseUrl }) => {
        if (!baseUrl) {
          return textResult({
            ok: false,
            usage: "Provide `baseUrl` (e.g. https://mcp.evidiq.dev/bulwark). Sweeps /health, /x402, /skill.md, /mcp (HEAD/GET/POST) with 10s timeout.",
            note: "Free. Defect #14 (HEAD /mcp hang) detector.",
          });
        }
        return textResult(await curlSweep({ baseUrl }));
      }
    );

    // ── 9. methodology_capabilities ────────────────────────────────────────
    server.registerTool(
      "methodology_capabilities",
      {
        title: "obra/superpowers catalog: 15 skills, 9 tools, 16 defects",
        description:
          "Return the live catalog: all 15 skills (name, category, trigger, purpose), the 9 MCP tools (name, purpose, calledBy), and the 16 §0 defects (number, title, how-to-prevent). Bootstrap confirmation the verification MCP is reachable. Free.",
        inputSchema: {},
      },
      async () => textResult(getCatalog())
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
