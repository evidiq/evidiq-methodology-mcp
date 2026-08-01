// verify_determinism: call a free MCP tool on a target service 2× with identical input and
// deep-compare the JSON responses. Paid-tool reportDigest comparison is a MANUAL playbook step
// (§3.7) — not callable without a payment-signature header. If the target returns 402, this tool
// reports that paid-tools determinism is not supported here.

import { callMcpTool, extractTextResult } from "./mcp-call.js";

export interface VerifyDeterminismInput {
  targetUrl: string; // e.g. https://mcp.evidiq.dev/bulwark/mcp
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface VerifyDeterminismResult {
  deterministic: boolean;
  targetUrl: string;
  toolName: string;
  statuses: number[];
  call1: unknown | null;
  call2: unknown | null;
  error?: string;
  note: string;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function safeParseText(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function verifyDeterminism(input: VerifyDeterminismInput): Promise<VerifyDeterminismResult> {
  const args = input.arguments ?? {};
  const [r1, r2] = await Promise.all([
    callMcpTool(input.targetUrl, input.toolName, args, { timeoutMs: 20_000 }),
    callMcpTool(input.targetUrl, input.toolName, args, { timeoutMs: 20_000 }),
  ]);

  // 402 → paid tool, not supported by this tool (no payment-signature header).
  if (r1.status === 402 || r2.status === 402) {
    return {
      deterministic: false,
      targetUrl: input.targetUrl,
      toolName: input.toolName,
      statuses: [r1.status, r2.status],
      call1: r1.result,
      call2: r2.result,
      note: "Target tool returned 402 (paid). This tool only verifies free tools. For paid-tool reportDigest determinism (RFC 6979), run the manual playbook §3.7 step: 2× curl the paid tool with a payment-signature header and compare reportDigest + signature.",
      error: "paid tool not supported without payment header",
    };
  }

  if (r1.error || r2.error) {
    return {
      deterministic: false,
      targetUrl: input.targetUrl,
      toolName: input.toolName,
      statuses: [r1.status, r2.status],
      call1: r1.result,
      call2: r2.result,
      note: "One or both calls errored.",
      error: r1.error || r2.error || undefined,
    };
  }

  const t1 = safeParseText(extractTextResult(r1.result));
  const t2 = safeParseText(extractTextResult(r2.result));
  const eq = deepEqual(t1, t2);

  return {
    deterministic: eq,
    targetUrl: input.targetUrl,
    toolName: input.toolName,
    statuses: [r1.status, r2.status],
    call1: t1,
    call2: t2,
    note: eq
      ? "Response identical across 2 calls. Note: digest comparison (reportDigest/signature) requires a paid tool and is not supported by this tool without a payment header — run the manual playbook §3.7 step for paid-tool determinism."
      : "Responses DIFFER across 2 calls — non-deterministic. Investigate non-determinism sources (timestamp/random/model/network/object-key order) in the target tool's path.",
  };
}
