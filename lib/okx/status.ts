// OKX.AI listing status checker. Runs `onchainos agent get-agents --agent-ids <id>`.
// On the VPS host, onchainos lives at /root/.local/bin/onchainos (login shell only). When this
// MCP server runs in a Docker container, onchainos is NOT on PATH — the tool degrades gracefully
// and returns the exact manual command to run via ssh from the agent's host.

import { execSync } from "node:child_process";

export interface OkxStatusResult {
  ok: boolean;
  agentId: string | number;
  name?: string;
  approvalLabel?: string;
  statusLabel?: string;
  approvalDisplayStatus?: number;
  approvalRemark?: string;
  communicationAddress?: string;
  onchainosReachable: boolean;
  manualCommand?: string;
  raw?: unknown;
  error?: string;
}

function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function isOnchainosAvailable(): boolean {
  try {
    execSync("command -v onchainos", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3_000 });
    return true;
  } catch {
    // Also try the known VPS path (works if the container mounts /root, which it normally does not).
    try {
      execSync("test -x /root/.local/bin/onchainos", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
}

export function checkOkxStatus(agentId: string | number): OkxStatusResult {
  // Validate agentId — only digits (OKX ids are numeric). Prevent shell injection.
  const idStr = String(agentId);
  if (!/^\d+$/.test(idStr)) {
    return {
      ok: false,
      agentId,
      onchainosReachable: false,
      error: `agentId must be numeric (got "${idStr}").`,
    };
  }

  if (!isOnchainosAvailable()) {
    return {
      ok: false,
      agentId,
      onchainosReachable: false,
      error:
        "onchainos CLI is not reachable from this MCP environment (it lives at /root/.local/bin/onchainos on the VPS host, not inside the container).",
      manualCommand: `ssh hackaton-do 'bash -lc "onchainos agent get-agents --agent-ids ${idStr}"'`,
    };
  }

  let raw: string;
  try {
    raw = execSync(`onchainos agent get-agents --agent-ids ${shellQuote(idStr)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20_000,
    });
  } catch (e: any) {
    return {
      ok: false,
      agentId,
      onchainosReachable: true,
      error: `onchainos call failed: ${e.message || e}`,
      manualCommand: `ssh hackaton-do 'bash -lc "onchainos agent get-agents --agent-ids ${idStr}"'`,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      agentId,
      onchainosReachable: true,
      error: "onchainos returned non-JSON output.",
      raw,
      manualCommand: `ssh hackaton-do 'bash -lc "onchainos agent get-agents --agent-ids ${idStr}"'`,
    };
  }

  const agent = parsed?.data?.[0] ?? parsed?.data ?? parsed;
  const result: OkxStatusResult = {
    ok: true,
    agentId,
    onchainosReachable: true,
    name: agent?.name,
    approvalLabel: agent?.approvalLabel,
    statusLabel: agent?.statusLabel,
    approvalDisplayStatus: agent?.approvalDisplayStatus,
    approvalRemark: agent?.approvalRemark,
    communicationAddress: agent?.communicationAddress,
    raw: agent,
  };
  // Friendly reading aid (§23: read approvalRemark literally).
  if (agent?.approvalDisplayStatus === 5) {
    result.error = `Listing REJECTED. Read approvalRemark literally (do not guess): "${agent?.approvalRemark ?? ""}". Fix + re-prove Phase 2, then resubmit via \`onchainos agent activate --agent-id ${idStr} --preferred-language en-US\`.`;
  } else if (agent?.approvalDisplayStatus === 2) {
    result.error = "Listing UNDER REVIEW (approvalDisplayStatus:2). Do NOT poll — wait for OKX (§27/§38).";
  }
  return result;
}
