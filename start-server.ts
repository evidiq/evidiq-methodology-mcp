import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handler } from "./server.js";
import { getCatalog } from "./lib/catalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "3016", 10);
const HOST = process.env.HOSTNAME || "0.0.0.0";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://mcp.evidiq.dev/methodology").replace(/\/$/, "");
const SLUG = "methodology";

// No payment gate, no bypass concept. All 9 tools are free infrastructure.
console.log(`[evidiq-methodology-mcp] infrastructure service — 9 free tools, no payment gate.`);

const gatedHandler = (req: Request) => handler(req);

async function nodeFetchAdapter(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handlerFn: (request: Request) => Promise<Response>
) {
  const protocol = (req.headers["x-forwarded-proto"] as string) || "http";
  const host = req.headers["host"] || `localhost:${PORT}`;
  const fullUrl = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const item of val) headers.append(key, item);
    } else {
      headers.set(key, val);
    }
  }

  let body: Buffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    body = Buffer.concat(chunks);
  }

  const webReq = new Request(fullUrl, {
    method: req.method,
    headers,
    body: body as unknown as BodyInit | undefined,
    // @ts-ignore
    duplex: body ? "half" : undefined,
  });

  const webRes = await handlerFn(webReq);

  res.statusCode = webRes.status;
  webRes.headers.forEach((val, key) => {
    res.setHeader(key, val);
  });

  if (webRes.body) {
    const reader = webRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
  }
  res.end();
}

function isMcpPath(urlPath: string): boolean {
  return urlPath === "/mcp" || urlPath === "/mcp/" || urlPath === `/${SLUG}/mcp` || urlPath === `/${SLUG}/mcp/`;
}

function routeMatch(urlPath: string, names: string[]): boolean {
  return names.some((n) => urlPath === `/${n}` || urlPath === `/${SLUG}/${n}`);
}

const httpServer = http.createServer(async (req, res) => {
  const urlPath = (req.url || "/").split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, payment-signature, PAYMENT-SIGNATURE, x-payment-signature"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "payment-required, x-payment-required, PAYMENT-RESPONSE, payment-response"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // ── /health ──────────────────────────────────────────────────────────────
  if (routeMatch(urlPath, ["health", ""])) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        service: "evidiq-methodology-mcp",
        version: "1.0.0",
        paymentGate: "none",
        signerAvailable: false,
        signerNote: "n/a — infrastructure service, no payment gate, no signer",
        publicBaseUrl: PUBLIC_BASE_URL,
        toolsCount: 9,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // ── /x402 ────────────────────────────────────────────────────────────────
  if (routeMatch(urlPath, ["x402"])) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          x402: "none",
          note: "Infrastructure service — 9 free tools, no payment gate. There is no payment-required header, no 402, no WWW-Authenticate. The validate_x402_challenge tool decodes/validates challenges of OTHER (paid) EVIDIQ services.",
          service: "evidiq-methodology-mcp",
          publicBaseUrl: PUBLIC_BASE_URL,
          allToolsFree: true,
          tools: getCatalog().tools.map((t) => t.name),
        },
        null,
        2
      )
    );
    return;
  }

  // ── /skill.md ────────────────────────────────────────────────────────────
  if (routeMatch(urlPath, ["skill.md"])) {
    const skillPath = path.join(__dirname, "../skill.md");
    if (fs.existsSync(skillPath)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.end(fs.readFileSync(skillPath, "utf-8"));
    } else {
      res.statusCode = 404;
      res.end("skill.md not found");
    }
    return;
  }

  // ── /mcp ─────────────────────────────────────────────────────────────────
  if (isMcpPath(urlPath)) {
    // §26-A-2: answer HEAD explicitly with GET's status and NO body (no hang) — defect #14.
    // No payment gate → HEAD returns 200 (a paid gate-on service would return 402 here).
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Allow: "POST, OPTIONS, HEAD",
      });
      res.end();
      return;
    }

    if (req.method === "GET") {
      // GET /mcp returns a plain 200 note — there is no 402 (no gate).
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          ok: true,
          service: "evidiq-methodology-mcp",
          x402: "none",
          note: "Infrastructure service — no payment gate. POST a JSON-RPC request to this endpoint (tools/list, tools/call). All 9 tools are free and return 200.",
        })
      );
      return;
    }

    try {
      await nodeFetchAdapter(req, res, gatedHandler);
    } catch (err: any) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: err.message || "Internal server error" }));
      }
    }
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[evidiq-methodology-mcp] listening at http://${HOST}:${PORT}`);
  console.log(`[evidiq-methodology-mcp] Payment Gate: NONE (infrastructure — 9 free tools)`);
  console.log(`[evidiq-methodology-mcp] Endpoints: /health, /x402, /skill.md, /mcp`);
});
