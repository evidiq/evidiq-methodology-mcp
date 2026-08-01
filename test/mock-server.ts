// Hermetic in-process mock MCP server for testing the network-dependent verify helpers.
// Mimics a minimal EVIDIQ service: /health, /x402, /skill.md, /mcp (HEAD/GET/POST SSE).
import http from "node:http";

export interface MockOptions {
  dropCapability?: string; // omit this tool from the *_capabilities response (mismatch test)
  paidTool?: string; // a tool name that returns 402 (paid-tool-not-supported test)
}

const CANONICAL_TOOLS = [
  "scan_prompt_injection",
  "scan_jailbreak_techniques",
  "scan_data_exfiltration",
  "scan_system_leak",
  "attest_prompt_safety",
  "bulwark_capabilities",
  "validate_prompt_input",
  "estimate_cost",
  "verify_bulwark_report",
  "get_artifact",
];

export function startMockMcp(opts: MockOptions = {}): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      const urlPath = (req.url || "/").split("?")[0];

      if (urlPath === "/health") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "mock", paymentGate: "bypassed", signerAvailable: true }));
        return;
      }
      if (urlPath === "/x402") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ x402Version: 2, pricing: CANONICAL_TOOLS.map((t) => ({ tool: t })) }));
        return;
      }
      if (urlPath === "/skill.md") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.end("# mock skill");
        return;
      }

      if (urlPath === "/mcp") {
        if (req.method === "HEAD") {
          res.writeHead(200, { "Content-Type": "application/json", Allow: "POST, OPTIONS, HEAD" });
          res.end();
          return;
        }
        if (req.method === "GET") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, note: "POST JSON-RPC" }));
          return;
        }
        // POST — read body, respond SSE
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          let rpc: any = null;
          try {
            rpc = JSON.parse(body);
          } catch {
            res.statusCode = 400;
            res.end("bad json");
            return;
          }
          // Paid tool → 402
          if (rpc?.method === "tools/call" && rpc?.params?.name === opts.paidTool) {
            res.statusCode = 402;
            res.setHeader("payment-required", Buffer.from(JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", amount: "5000" }] })).toString("base64"));
            res.end(JSON.stringify({ error: "Payment Required" }));
            return;
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream");
          let payload: unknown;
          if (rpc?.method === "tools/list") {
            payload = { jsonrpc: "2.0", id: rpc.id ?? 1, result: { tools: CANONICAL_TOOLS.map((name) => ({ name })) } };
          } else if (rpc?.method === "tools/call" && rpc?.params?.name === "bulwark_capabilities") {
            const tools = opts.dropCapability ? CANONICAL_TOOLS.filter((t) => t !== opts.dropCapability) : CANONICAL_TOOLS;
            payload = {
              jsonrpc: "2.0",
              id: rpc.id ?? 1,
              result: { content: [{ type: "text", text: JSON.stringify({ service: "mock", tools }) }] },
            };
          } else {
            payload = { jsonrpc: "2.0", id: rpc.id ?? 1, result: { content: [{ type: "text", text: "{}" }] } };
          }
          res.end(`data: ${JSON.stringify(payload)}\n\n`);
        });
        return;
      }

      res.statusCode = 404;
      res.end("Not Found");
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

export { CANONICAL_TOOLS };
