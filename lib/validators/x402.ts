// §41-C x402 v2 challenge decoder + validator. ~pure: base64 decode + JSON parse + field check.
// No @okxweb3 deps — this is a decoder, not a gate/settler. The methodology MCP has no payment
// gate; this tool validates the challenges emitted by OTHER (paid) EVIDIQ services.

// Frozen §41-C constants (EVIDIQ-RUNBOOK.md §41-C).
const X402_VERSION = 2;
const SCHEME = "exact";
const NETWORK = "eip155:196";
const ASSET = "0x779ded0c9e1022225f8e0630b35a9b54be713736";
const PAY_TO = "0x2a8efe3093278bb4bd3b2d9c7b5ba992ca4fc9b0";
const MAX_TIMEOUT_SECONDS = 300;
const EXTRA_NAME = "USD₮0";
const EXTRA_VERSION = "1";

export interface X402AcceptRequirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: { name: string; version: string };
}

export interface X402Challenge {
  x402Version: number;
  resource?: { url?: string; description?: string; mimeType?: string };
  accepts?: X402AcceptRequirement[];
  error?: string;
}

export interface ValidateX402Input {
  /** Base64-encoded x402 v2 challenge (the value of the `payment-required` header). */
  challengeBase64?: string;
  /** Raw response headers (case-insensitive keys). Used to detect WWW-Authenticate + extract the challenge. */
  headers?: Record<string, string | string[] | undefined>;
}

export interface ValidateX402Result {
  ok: boolean;
  errors: string[];
  warnings: string[];
  decoded: X402Challenge | null;
  wwwAuthenticatePresent: boolean;
  challengeSource: string | null;
}

function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return v[0] ?? null;
      if (typeof v === "string") return v;
    }
  }
  return null;
}

function decodeBase64(b64: string): string {
  // Tolerant to URL-safe + whitespace.
  const clean = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

export function validateX402Challenge(input: ValidateX402Input): ValidateX402Result {
  const errors: string[] = [];
  const warnings: string[] = [];
  let wwwAuthenticatePresent = false;
  let challengeSource: string | null = null;

  // 1. Header-derived checks (if headers provided).
  let b64: string | null = null;
  if (input.headers) {
    const www = firstHeader(input.headers, "www-authenticate");
    if (www) {
      wwwAuthenticatePresent = true;
      errors.push(
        "WWW-Authenticate header is PRESENT (§41-A trap). OKX validator fails to parse it. Remove it; use payment-required + x-payment-required only."
      );
    }
    b64 =
      firstHeader(input.headers, "payment-required") ||
      firstHeader(input.headers, "x-payment-required");
    if (b64) challengeSource = "payment-required header";
  }

  // 2. Fall back to explicit challengeBase64.
  if (!b64 && input.challengeBase64) {
    b64 = input.challengeBase64;
    challengeSource = "challengeBase64 param";
  }

  if (!b64) {
    return {
      ok: false,
      errors: [
        ...errors,
        "No challenge provided. Pass challengeBase64, or headers with payment-required/x-payment-required.",
      ],
      warnings,
      decoded: null,
      wwwAuthenticatePresent,
      challengeSource,
    };
  }

  // 3. Decode base64 + JSON parse.
  let decoded: X402Challenge;
  try {
    const json = decodeBase64(b64);
    decoded = JSON.parse(json);
  } catch (e: any) {
    return {
      ok: false,
      errors: [...errors, `Failed to base64-decode/JSON-parse challenge: ${e.message || e}`],
      warnings,
      decoded: null,
      wwwAuthenticatePresent,
      challengeSource,
    };
  }

  // 4. §41-C structure validation.
  if (decoded.x402Version !== X402_VERSION) {
    errors.push(`x402Version: expected ${X402_VERSION}, got ${decoded.x402Version}`);
  }
  if (!decoded.accepts || !Array.isArray(decoded.accepts) || decoded.accepts.length === 0) {
    errors.push("accepts[] missing or empty");
    return { ok: false, errors, warnings, decoded, wwwAuthenticatePresent, challengeSource };
  }
  // Base64 header challenge MUST exclude `error` (§41-A trap: error in base64).
  if (challengeSource === "payment-required header" && decoded.error !== undefined) {
    errors.push(
      "`error` field is present inside the base64 challenge (§41-A trap). The encoded header must exclude `error`; it lives only in the JSON body."
    );
  }
  const a = decoded.accepts[0];
  if (a.scheme !== SCHEME) errors.push(`accepts[0].scheme: expected "${SCHEME}", got "${a.scheme}"`);
  if (a.network !== NETWORK) errors.push(`accepts[0].network: expected "${NETWORK}", got "${a.network}"`);
  if (a.asset !== ASSET) errors.push(`accepts[0].asset: expected "${ASSET}", got "${a.asset}"`);
  if (a.payTo !== PAY_TO) errors.push(`accepts[0].payTo: expected "${PAY_TO}", got "${a.payTo}"`);
  if (a.maxTimeoutSeconds !== MAX_TIMEOUT_SECONDS)
    errors.push(`accepts[0].maxTimeoutSeconds: expected ${MAX_TIMEOUT_SECONDS}, got ${a.maxTimeoutSeconds}`);
  if (!a.amount || !/^\d+$/.test(String(a.amount)))
    errors.push(`accepts[0].amount: expected atomic AssetAmount digit string, got "${a.amount}"`);
  if (!a.extra || a.extra.name !== EXTRA_NAME || a.extra.version !== EXTRA_VERSION) {
    errors.push(
      `accepts[0].extra: expected {name:"${EXTRA_NAME}",version:"${EXTRA_VERSION}"}, got ${JSON.stringify(a.extra)}`
    );
  }
  if (decoded.resource && decoded.resource.url && !decoded.resource.url.includes("/mcp")) {
    warnings.push(`resource.url "${decoded.resource.url}" does not contain /mcp (should be PUBLIC_BASE_URL + /mcp).`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    decoded,
    wwwAuthenticatePresent,
    challengeSource,
  };
}
