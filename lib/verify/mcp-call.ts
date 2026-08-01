// Minimal MCP streamable-http client. Used by verify_determinism + diff_capabilities to call
// OTHER EVIDIQ services' free tools. Handles SSE `data:` unwrapping + 10s timeout.

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

export interface McpCallOptions {
  timeoutMs?: number;
}

function parseSseFirstData(text: string): unknown | null {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      return JSON.parse(data);
    } catch {
      // non-JSON SSE comment — keep going
    }
  }
  return null;
}

async function postJson(targetUrl: string, body: unknown, opts: McpCallOptions = {}): Promise<{ status: number; json: unknown | null; text: string; error?: string }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown | null = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) {
      json = parseSseFirstData(text);
    } else if (ct.includes("application/json")) {
      try {
        json = JSON.parse(text);
      } catch {
        // leave null
      }
    } else {
      // try SSE parse anyway (some servers return text/plain)
      json = parseSseFirstData(text) ?? (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();
    }
    return { status: res.status, json, text };
  } catch (e: any) {
    return { status: 0, json: null, text: "", error: e?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : (e?.message || String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

export interface McpToolCallResult {
  status: number;
  result: unknown | null; // the parsed tools/call envelope ({ result: { content: [{ text }] }})
  error?: string;
}

export async function callMcpTool(targetUrl: string, toolName: string, args: Record<string, unknown> | undefined, opts?: McpCallOptions): Promise<McpToolCallResult> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args ?? {} },
  };
  const { status, json, error } = await postJson(targetUrl, body, opts);
  return { status, result: json, error };
}

export interface McpListResult {
  status: number;
  tools: string[] | null; // tool names from tools/list
  error?: string;
}

export async function listMcpTools(targetUrl: string, opts?: McpCallOptions): Promise<McpListResult> {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const { status, json, error } = await postJson(targetUrl, body, opts);
  if (!json || typeof json !== "object") return { status, tools: null, error: error ?? "no JSON result" };
  const env = json as { result?: { tools?: { name?: string }[] } };
  const tools = env.result?.tools?.map((t) => t.name).filter((n): n is string => typeof n === "string") ?? null;
  return { status, tools, error };
}

/** Extract the text content from a tools/call envelope returned by an EVIDIQ service. */
export function extractTextResult(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== "object") return null;
  const e = envelope as { result?: { content?: { type?: string; text?: string }[] } };
  const content = e.result?.content;
  if (!Array.isArray(content)) return null;
  for (const c of content) {
    if (c && typeof c === "object" && c.type === "text" && typeof c.text === "string") return c.text;
  }
  return null;
}
