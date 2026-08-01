import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + sorted.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify((obj as Record<string, unknown>)[k])).join(",") + "}";
}

export function computeReportDigest(report: Record<string, unknown>): string {
  const { reportDigest, signature, ...rest } = report as Record<string, unknown>;
  const canon = canonicalJsonStringify(rest);
  return "0x" + createHash("sha256").update(canon, "utf8").digest("hex");
}

export function methodologySignerAvailable(): boolean {
  const key = process.env.METHODOLOGY_SIGNER_PRIVATE_KEY?.trim();
  return !!key && /^0x[0-9a-fA-F]{64}$/.test(key);
}

export function getSignerAddress(): string | null {
  const key = process.env.METHODOLOGY_SIGNER_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  try {
    return privateKeyToAccount(key as `0x${string}`).address;
  } catch {
    return null;
  }
}

async function signEip191(digest: string): Promise<{ signature: string; signerAddress: string } | null> {
  const key = process.env.METHODOLOGY_SIGNER_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    const sig = await account.signMessage({ message: { raw: Buffer.from(digest.slice(2), "hex") } });
    return { signature: sig, signerAddress: account.address };
  } catch {
    return null;
  }
}

export interface AttestationReport {
  reportDigest: string;
  verdict: string;
  score: number;
  totalChecks: number;
  passedChecks: number;
  signerAddress: string;
  signature: string;
  timestamp: string;
}

export async function createAttestation(params: {
  verdict: string;
  score: number;
  totalChecks: number;
  passedChecks: number;
  findings: string[];
}): Promise<AttestationReport | null> {
  const signer = getSignerAddress();
  if (!signer) return null;

  const timestamp = new Date().toISOString();
  const reportCore = {
    verdict: params.verdict,
    score: params.score,
    totalChecks: params.totalChecks,
    passedChecks: params.passedChecks,
    findings: params.findings,
    timestamp,
    signerAddress: signer,
  };

  const reportDigest = computeReportDigest(reportCore);
  const signResult = await signEip191(reportDigest);
  if (!signResult) return null;

  return {
    ...reportCore,
    reportDigest,
    signature: signResult.signature,
  };
}
