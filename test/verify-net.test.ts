import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startMockMcp, CANONICAL_TOOLS } from "./mock-server.js";
import { curlSweep } from "../lib/verify/curl.js";
import { verifyDeterminism } from "../lib/verify/determinism.js";
import { diffCapabilities } from "../lib/verify/capabilities.js";
import { callMcpTool, listMcpTools, extractTextResult } from "../lib/verify/mcp-call.js";

let srv: { url: string; close: () => void };
let mismatchSrv: { url: string; close: () => void };

beforeAll(async () => {
  srv = await startMockMcp();
  // Second mock that omits one tool from the capabilities response (defect #8 mismatch).
  mismatchSrv = await startMockMcp({ dropCapability: "get_artifact" });
});
afterAll(() => {
  srv.close();
  mismatchSrv.close();
});

describe("curl_sweep (defect #14)", () => {
  it("sweeps all routes, no hang, HEAD /mcp answers 200", async () => {
    const r = await curlSweep({ baseUrl: srv.url });
    expect(r.ok).toBe(true);
    expect(r.defects).toHaveLength(0);
    const head = r.results.find((x) => x.method === "HEAD" && x.path === "/mcp");
    expect(head).toBeDefined();
    expect(head?.hang).toBe(false);
    expect(head?.status).toBe(200);
    // Every request must be under 10s (the mock answers instantly).
    for (const e of r.results) expect(e.timeMs).toBeLessThan(10_000);
  });

  it("reports every expected route", async () => {
    const r = await curlSweep({ baseUrl: srv.url });
    const keys = r.results.map((x) => `${x.method} ${x.path}`).sort();
    expect(keys).toEqual(["GET /health", "GET /mcp", "GET /skill.md", "GET /x402", "HEAD /mcp", "POST /mcp"].sort());
  });
});

describe("mcp-call helpers", () => {
  it("listMcpTools returns the 10 tool names", async () => {
    const r = await listMcpTools(`${srv.url}/mcp`);
    expect(r.status).toBe(200);
    expect(r.tools).not.toBeNull();
    expect(r.tools!.sort()).toEqual([...CANONICAL_TOOLS].sort());
  });

  it("callMcpTool returns the SSE-wrapped envelope + extractTextResult parses it", async () => {
    const r = await callMcpTool(`${srv.url}/mcp`, "bulwark_capabilities", {});
    expect(r.status).toBe(200);
    const text = extractTextResult(r.result);
    expect(text).not.toBeNull();
    const obj = JSON.parse(text!);
    expect(obj.tools.sort()).toEqual([...CANONICAL_TOOLS].sort());
  });

  it("extractTextResult returns null for non-envelope shapes", () => {
    expect(extractTextResult(null)).toBeNull();
    expect(extractTextResult({})).toBeNull();
    expect(extractTextResult({ result: { content: [] } })).toBeNull();
  });
});

describe("verify_determinism", () => {
  it("returns deterministic:true for a stable free tool (2× identical)", async () => {
    const r = await verifyDeterminism({ targetUrl: `${srv.url}/mcp`, toolName: "bulwark_capabilities", arguments: {} });
    expect(r.deterministic).toBe(true);
    expect(r.statuses).toEqual([200, 200]);
    expect(r.note).toContain("identical");
  });

  it("reports paid-tool-not-supported when the target returns 402", async () => {
    const paid = await startMockMcp({ paidTool: "scan_prompt_injection" });
    try {
      const r = await verifyDeterminism({ targetUrl: `${paid.url}/mcp`, toolName: "scan_prompt_injection", arguments: {} });
      expect(r.deterministic).toBe(false);
      expect(r.statuses).toContain(402);
      expect(r.note).toContain("manual playbook §3.7");
      expect(r.error).toContain("paid tool not supported");
    } finally {
      paid.close();
    }
  });
});

describe("diff_capabilities (defect #8/#9)", () => {
  it("returns match:true (10/10) when capabilities == tools/list", async () => {
    const r = await diffCapabilities({ targetUrl: `${srv.url}/mcp`, capabilitiesTool: "bulwark_capabilities" });
    expect(r.match).toBe(true);
    expect(r.onlyInToolsList).toHaveLength(0);
    expect(r.onlyInCapabilities).toHaveLength(0);
    expect(r.toolsList.sort()).toEqual([...CANONICAL_TOOLS].sort());
  });

  it("returns match:false + onlyInCapabilities when a tool is missing from capabilities", async () => {
    const r = await diffCapabilities({ targetUrl: `${mismatchSrv.url}/mcp`, capabilitiesTool: "bulwark_capabilities" });
    expect(r.match).toBe(false);
    // tools/list still has all 10; capabilities omits get_artifact → onlyInCapabilities? No:
    // get_artifact IS in tools/list but NOT in capabilities → onlyInToolsList includes it.
    expect(r.onlyInToolsList).toContain("get_artifact");
    expect(r.error).toContain("Mismatch");
  });
});
