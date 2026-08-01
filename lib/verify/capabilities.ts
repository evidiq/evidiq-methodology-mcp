// diff_capabilities: compare a service's `tools/list` vs its `*_capabilities.tools`.
// defect #8 (capabilities describing half the service) + #9 (stated capability with no
// implementation). Expects a 10/10 match for a healthy EVIDIQ service.

import { listMcpTools, callMcpTool, extractTextResult } from "./mcp-call.js";

export interface DiffCapabilitiesInput {
  targetUrl: string; // e.g. https://mcp.evidiq.dev/bulwark/mcp
  capabilitiesTool: string; // e.g. bulwark_capabilities
}

export interface DiffCapabilitiesResult {
  match: boolean;
  targetUrl: string;
  capabilitiesTool: string;
  toolsList: string[];
  capabilities: string[];
  onlyInToolsList: string[]; // tools the server registers but capabilities doesn't advertise (defect #9-ish)
  onlyInCapabilities: string[]; // tools capabilities advertises but server doesn't register (defect #9)
  error?: string;
}

function extractToolsArrayFromCapabilityText(text: string | null): string[] {
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    // EVIDIQ *_capabilities returns { tools: ["...","..."], ... } at the top level.
    const candidates: unknown[] = [];
    if (obj && typeof obj === "object") {
      if ("tools" in obj) candidates.push((obj as Record<string, unknown>).tools);
      // Some services nest under `service`/`catalog` — search one level.
      for (const v of Object.values(obj as Record<string, unknown>)) {
        if (v && typeof v === "object" && "tools" in (v as Record<string, unknown>)) {
          candidates.push((v as Record<string, unknown>).tools);
        }
      }
    }
    for (const c of candidates) {
      if (Array.isArray(c) && c.every((x) => typeof x === "string")) return c as string[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function diffCapabilities(input: DiffCapabilitiesInput): Promise<DiffCapabilitiesResult> {
  const [listRes, capRes] = await Promise.all([
    listMcpTools(input.targetUrl, { timeoutMs: 15_000 }),
    callMcpTool(input.targetUrl, input.capabilitiesTool, {}, { timeoutMs: 15_000 }),
  ]);

  if (listRes.error || !listRes.tools) {
    return {
      match: false,
      targetUrl: input.targetUrl,
      capabilitiesTool: input.capabilitiesTool,
      toolsList: [],
      capabilities: [],
      onlyInToolsList: [],
      onlyInCapabilities: [],
      error: `tools/list failed: ${listRes.error ?? "no tools returned"} (status ${listRes.status})`,
    };
  }
  if (capRes.error || capRes.status !== 200) {
    return {
      match: false,
      targetUrl: input.targetUrl,
      capabilitiesTool: input.capabilitiesTool,
      toolsList: listRes.tools,
      capabilities: [],
      onlyInToolsList: listRes.tools,
      onlyInCapabilities: [],
      error: `capabilities call failed: ${capRes.error ?? `status ${capRes.status}`}`,
    };
  }

  const capText = extractTextResult(capRes.result);
  const capabilities = extractToolsArrayFromCapabilityText(capText);
  const toolsSet = new Set(listRes.tools);
  const capSet = new Set(capabilities);
  const onlyInToolsList = listRes.tools.filter((t) => !capSet.has(t)).sort();
  const onlyInCapabilities = capabilities.filter((t) => !toolsSet.has(t)).sort();

  return {
    match: onlyInToolsList.length === 0 && onlyInCapabilities.length === 0,
    targetUrl: input.targetUrl,
    capabilitiesTool: input.capabilitiesTool,
    toolsList: [...listRes.tools].sort(),
    capabilities: [...capabilities].sort(),
    onlyInToolsList,
    onlyInCapabilities,
    error:
      onlyInToolsList.length === 0 && onlyInCapabilities.length === 0
        ? undefined
        : `Mismatch (defect #8/#9). onlyInToolsList=${onlyInToolsList.join(",") || "—"}; onlyInCapabilities=${onlyInCapabilities.join(",") || "—"}`,
  };
}
