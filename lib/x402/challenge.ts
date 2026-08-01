import { X402Challenge, X402AcceptRequirement } from "./types.js";
import { getX402Config } from "./config.js";

export const TOOL_PRICES_ATOMIC: Record<string, string> = {
  audit_git_history: "5000",
  check_okx_status: "5000",
  validate_x402_compliance: "10000",
  validate_plan_freeze: "10000",
  pre_submit_check: "15000",
  scan_deployment_env: "15000",
  production_readiness_score: "20000",
  verify_onchain_proof: "20000",
  generate_runbook_entry: "30000",
  attest_readiness: "30000",
};

export const TOOL_PRICES_HUMAN: Record<string, string> = {
  audit_git_history: "0.005 USDT0",
  check_okx_status: "0.005 USDT0",
  validate_x402_compliance: "0.01 USDT0",
  validate_plan_freeze: "0.01 USDT0",
  pre_submit_check: "0.015 USDT0",
  scan_deployment_env: "0.015 USDT0",
  production_readiness_score: "0.02 USDT0",
  verify_onchain_proof: "0.02 USDT0",
  generate_runbook_entry: "0.03 USDT0",
  attest_readiness: "0.03 USDT0",
};

export const FREE_TOOL_NAMES: string[] = [
  "methodology_capabilities",
  "validate_plan_sections",
  "diff_capabilities",
  "curl_sweep",
  "verify_determinism",
];

export function createChallenge(toolName: string): X402Challenge {
  const cfg = getX402Config();
  const atomicAmount = TOOL_PRICES_ATOMIC[toolName] || "5000";
  const humanAmount = TOOL_PRICES_HUMAN[toolName] || "0.005 USDT0";

  const acceptReq: X402AcceptRequirement = {
    scheme: "exact",
    network: cfg.chain,
    asset: cfg.asset,
    amount: atomicAmount,
    payTo: cfg.payTo,
    maxTimeoutSeconds: 300,
    extra: {
      name: cfg.domainName,
      version: cfg.domainVersion,
    },
  };

  return {
    x402Version: 2,
    resource: {
      url: `${cfg.publicBaseUrl}/mcp`,
      description: "EVIDIQ Methodology — fleet production verification tools for OKX.AI MCP builders. Paid tools audit, validate, and attest MCP readiness.",
      mimeType: "application/json",
    },
    accepts: [acceptReq],
    error: `Payment Required for tool '${toolName}'. Costs ${humanAmount}.`,
  };
}

export function encodeChallengeToBase64(challenge: X402Challenge): string {
  const { error, ...headerChallenge } = challenge;
  return Buffer.from(JSON.stringify(headerChallenge)).toString("base64");
}

export function getX402DiscoveryCatalog() {
  const cfg = getX402Config();
  return {
    x402Version: 2,
    resource: {
      url: `${cfg.publicBaseUrl}/mcp`,
      description: "EVIDIQ Methodology — fleet production verification tools for OKX.AI MCP builders. 5 free tools (methodology_capabilities, validate_plan_sections, diff_capabilities, curl_sweep, verify_determinism) remain free.",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: cfg.chain,
        asset: cfg.asset,
        amount: "5000",
        payTo: cfg.payTo,
        maxTimeoutSeconds: 300,
        extra: {
          name: cfg.domainName,
          version: cfg.domainVersion,
        },
      },
    ],
    pricing: [
      { tool: "audit_git_history", amount: "5000", usd: 0.005 },
      { tool: "check_okx_status", amount: "5000", usd: 0.005 },
      { tool: "validate_x402_compliance", amount: "10000", usd: 0.01 },
      { tool: "validate_plan_freeze", amount: "10000", usd: 0.01 },
      { tool: "pre_submit_check", amount: "15000", usd: 0.015 },
      { tool: "scan_deployment_env", amount: "15000", usd: 0.015 },
      { tool: "production_readiness_score", amount: "20000", usd: 0.02 },
      { tool: "verify_onchain_proof", amount: "20000", usd: 0.02 },
      { tool: "generate_runbook_entry", amount: "30000", usd: 0.03 },
      { tool: "attest_readiness", amount: "30000", usd: 0.03 },
      { tool: "methodology_capabilities", amount: "0", usd: 0, free: true },
      { tool: "validate_plan_sections", amount: "0", usd: 0, free: true },
      { tool: "diff_capabilities", amount: "0", usd: 0, free: true },
      { tool: "curl_sweep", amount: "0", usd: 0, free: true },
      { tool: "verify_determinism", amount: "0", usd: 0, free: true },
    ],
    guidance: "Free tools: methodology_capabilities, validate_plan_sections, diff_capabilities, curl_sweep, verify_determinism. Paid tools audit, validate, and attest MCP readiness before OKX submission.",
  };
}
