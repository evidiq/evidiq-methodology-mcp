import { describe, it, expect } from "vitest";
import { validateX402Challenge } from "../lib/validators/x402.js";

// Frozen §41-C constants.
const ASSET = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const PAY_TO = "0x2a8efe3093278bb4bd3b2d9c7b5ba992ca4fc9b0";

function validChallenge(): Record<string, unknown> {
  return {
    x402Version: 2,
    resource: { url: "https://mcp.evidiq.dev/bulwark/mcp", description: "test", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:196",
        asset: ASSET,
        amount: "5000",
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        extra: { name: "USD₮0", version: "1" },
      },
    ],
  };
}

function enc(o: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(o)).toString("base64");
}

describe("validate_x402_challenge (§41-C)", () => {
  it("accepts a valid §41-C challenge via challengeBase64", () => {
    const r = validateX402Challenge({ challengeBase64: enc(validChallenge()) });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.decoded?.x402Version).toBe(2);
    expect(r.decoded?.accepts?.[0].asset).toBe(ASSET);
    expect(r.wwwAuthenticatePresent).toBe(false);
  });

  it("extracts the challenge from payment-required header + flags WWW-Authenticate (§41-A)", () => {
    const headers = {
      "payment-required": enc(validChallenge()),
      "x-payment-required": enc(validChallenge()),
      "WWW-Authenticate": "Payment something",
    };
    const r = validateX402Challenge({ headers });
    expect(r.wwwAuthenticatePresent).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("WWW-Authenticate"))).toBe(true);
    expect(r.challengeSource).toBe("payment-required header");
  });

  it("rejects `error` field inside the base64 header (§41-A trap)", () => {
    const c = validChallenge();
    c.error = "Payment Required";
    const r = validateX402Challenge({ headers: { "payment-required": enc(c) } });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("`error` field is present"))).toBe(true);
  });

  it("rejects wrong asset", () => {
    const c = validChallenge();
    (c.accepts[0] as any).asset = "0xdeadbeef";
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("asset"))).toBe(true);
  });

  it("rejects wrong network", () => {
    const c = validChallenge();
    (c.accepts[0] as any).network = "eip155:1";
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("network"))).toBe(true);
  });

  it("rejects maxTimeoutSeconds != 300", () => {
    const c = validChallenge();
    (c.accepts[0] as any).maxTimeoutSeconds = 600;
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("maxTimeoutSeconds"))).toBe(true);
  });

  it("rejects USD-string amount (must be atomic AssetAmount)", () => {
    const c = validChallenge();
    (c.accepts[0] as any).amount = "$0.005";
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("amount"))).toBe(true);
  });

  it("rejects wrong extra.name (USD₮0)", () => {
    const c = validChallenge();
    (c.accepts[0] as any).extra = { name: "USDC", version: "1" };
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("extra"))).toBe(true);
  });

  it("rejects x402Version != 2", () => {
    const c = validChallenge();
    c.x402Version = 1 as any;
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("x402Version"))).toBe(true);
  });

  it("returns an error when no challenge provided", () => {
    const r = validateX402Challenge({});
    expect(r.ok).toBe(false);
    expect(r.decoded).toBeNull();
    expect(r.errors.some((e) => e.includes("No challenge provided"))).toBe(true);
  });

  it("handles malformed base64 / non-JSON gracefully", () => {
    const r = validateX402Challenge({ challengeBase64: "!!!not-base64!!!" });
    expect(r.ok).toBe(false);
    expect(r.decoded).toBeNull();
    expect(r.errors.some((e) => e.includes("decode/JSON-parse"))).toBe(true);
  });

  it("warns when resource.url has no /mcp", () => {
    const c = validChallenge();
    // Use a URL that truly lacks a /mcp substring (note: "https://mcp.x.dev/bulwark" still
    // contains "/mcp" via "://mcp").
    (c.resource as any).url = "https://example.com/health";
    const r = validateX402Challenge({ challengeBase64: enc(c) });
    expect(r.warnings.some((w) => w.includes("resource.url"))).toBe(true);
  });
});
