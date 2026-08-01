// curl_sweep: HEAD/GET/POST sweep of a service's endpoints with a 10s timeout per request.
// defect #14 (HEAD /mcp hang) detection. Uses fetch + AbortController (no curl binary needed).

const TIMEOUT_MS = 10_000;

export interface CurlSweepInput {
  baseUrl: string; // e.g. https://mcp.evidiq.dev/methodology  (no trailing slash; /mcp etc appended)
}

export interface SweepEntry {
  method: "HEAD" | "GET" | "POST";
  path: string;
  url: string;
  status: number;
  timeMs: number;
  hang: boolean;
  error?: string;
}

export interface CurlSweepResult {
  ok: boolean; // true iff no hang AND no error AND no 5xx across the sweep
  baseUrl: string;
  results: SweepEntry[];
  summary: string;
  defects: string[];
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

async function req(
  method: "HEAD" | "GET" | "POST",
  url: string,
  body?: unknown
): Promise<{ status: number; timeMs: number; hang: boolean; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const init: RequestInit = { method, signal: ctrl.signal, headers: body ? { "Content-Type": "application/json", Accept: "application/json, text/event-stream" } : { Accept: "application/json, text/event-stream" } };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    // Drain the body so the connection closes cleanly.
    if (res.body) await res.text().catch(() => undefined);
    return { status: res.status, timeMs: Date.now() - start, hang: false };
  } catch (e: any) {
    const elapsed = Date.now() - start;
    if (e?.name === "AbortError") {
      return { status: 0, timeMs: elapsed, hang: true, error: `hang (no response within ${TIMEOUT_MS}ms) — defect #14` };
    }
    return { status: 0, timeMs: elapsed, hang: false, error: e?.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function curlSweep(input: CurlSweepInput): Promise<CurlSweepResult> {
  const base = normalizeBase(input.baseUrl);
  const listBody = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const plan: Array<{ method: "HEAD" | "GET" | "POST"; path: string; body?: unknown }> = [
    { method: "GET", path: "/health" },
    { method: "GET", path: "/x402" },
    { method: "GET", path: "/skill.md" },
    { method: "HEAD", path: "/mcp" },
    { method: "GET", path: "/mcp" },
    { method: "POST", path: "/mcp", body: listBody },
  ];

  const results: SweepEntry[] = [];
  const defects: string[] = [];
  for (const p of plan) {
    const url = base + p.path;
    const r = await req(p.method, url, p.body);
    results.push({ method: p.method, path: p.path, url, status: r.status, timeMs: r.timeMs, hang: r.hang, error: r.error });
    // defect #14: HEAD /mcp hang is the one that rejected 3 EVIDIQ listings.
    if (p.method === "HEAD" && p.path === "/mcp" && (r.hang || r.status === 0)) {
      defects.push("defect #14: HEAD /mcp hung or returned no status — the MCP transport didn't answer HEAD explicitly. Fix: answer HEAD before the MCP handler with GET's status and no body.");
    }
    if (r.hang) defects.push(`${p.method} ${p.path} hung (defect #14 risk).`);
    if (r.status >= 500) defects.push(`${p.method} ${p.path} returned ${r.status} (5xx).`);
  }

  const ok = defects.length === 0 && results.every((r) => !r.hang && r.status > 0 && r.status < 500);
  const summary = `Swept ${results.length} requests. ${results.filter((r) => r.status >= 200 && r.status < 400).length} 2xx/3xx, ${results.filter((r) => r.status >= 400).length} 4xx, ${results.filter((r) => r.status === 0).length} hang/error. HEAD /mcp: ${results.find((r) => r.method === "HEAD" && r.path === "/mcp")?.status ?? "?"} in ${results.find((r) => r.method === "HEAD" && r.path === "/mcp")?.timeMs ?? "?"}ms.`;

  return { ok, baseUrl: base, results, summary, defects };
}
