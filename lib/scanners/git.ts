// Git history secret scanner + .git toplevel checker.
// defect #1 (leaked keys in history) + defect #16 (wrong repo .git) prevention.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface SecretPattern {
  name: string;
  re: RegExp;
  severity: "critical" | "high" | "medium";
}

// Conservative patterns. EVM 0x64hex catches private keys (commit hashes are 40 hex).
// Mnemonic requires the sequence to BE the trimmed line (avoids prose false positives).
const PATTERNS: SecretPattern[] = [
  { name: "EVM private key (0x + 64 hex)", re: /\b0x[0-9a-fA-F]{64}\b/g, severity: "critical" },
  { name: "GitHub PAT (ghp_)", re: /\bghp_[A-Za-z0-9]{36}\b/g, severity: "critical" },
  { name: "GitHub PAT (github_pat_)", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g, severity: "critical" },
  { name: "PAT embedded in remote URL", re: /https:\/\/(?:ghp_|github_pat_)[A-Za-z0-9_]+@github\.com/g, severity: "critical" },
  { name: "OKX API key assignment", re: /\bOKX_API_KEY=[^\s#]+/g, severity: "high" },
  { name: "OKX secret key assignment", re: /\bOKX_SECRET_KEY=[0-9a-fA-F]+/g, severity: "high" },
  { name: "OKX passphrase assignment", re: /\bOKX_PASSPHRASE=[^\s#]+/g, severity: "high" },
  { name: "Mnemonic (12-word sequence, line-anchored)", re: /^\s*(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\s*$/gm, severity: "high" },
];

export interface GitHit {
  commit: string;
  file: string | null;
  line: string;
  pattern: string;
  severity: "critical" | "high" | "medium";
}

export interface ScanGitHistoryResult {
  ok: boolean;
  hits: GitHit[];
  commitsScanned: number;
  bytesScanned: number;
  error?: string;
}

function runGit(repoPath: string, args: string[]): string {
  const cmd = `git -C ${shellQuote(repoPath)} ${args.map(shellQuote).join(" ")}`;
  // 50 MB max buffer — enough for typical service histories, bounded for safety.
  return execSync(cmd, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 30_000 });
}

function shellQuote(s: string): string {
  // Safe quoting for paths/args: wrap in single quotes, escape embedded quotes.
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

export function scanGitHistory(repoPath: string): ScanGitHistoryResult {
  if (!repoPath || !existsSync(repoPath)) {
    return { ok: false, hits: [], commitsScanned: 0, bytesScanned: 0, error: `repoPath does not exist: ${repoPath}` };
  }
  // Verify it is a git repo.
  try {
    execSync(`git -C ${shellQuote(repoPath)} rev-parse --is-inside-work-tree`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    });
  } catch {
    return {
      ok: false,
      hits: [],
      commitsScanned: 0,
      bytesScanned: 0,
      error: `Not a git repository (no .git): ${repoPath}. Defect #16 note: run \`git init\` before pushing.`,
    };
  }

  let raw: string;
  try {
    // --format with a unique commit sentinel lets us attribute hits to commits.
    raw = runGit(repoPath, [
      "log",
      "-p",
      "--all",
      "--no-color",
      "-U0",
      "--format=__COMMIT__%H",
    ]);
  } catch (e: any) {
    return {
      ok: false,
      hits: [],
      commitsScanned: 0,
      bytesScanned: 0,
      error: `git log failed: ${e.message || e}`,
    };
  }

  const hits: GitHit[] = [];
  const commits = raw.split("__COMMIT__").filter((b) => b.trim().length > 0);
  let commitsScanned = 0;
  for (const block of commits) {
    const hashMatch = block.match(/^([0-9a-f]{40})/);
    const commit = hashMatch ? hashMatch[1] : "unknown";
    commitsScanned++;
    // Track current file via diff headers.
    let currentFile: string | null = null;
    for (const line of block.split(/\r?\n/)) {
      const fm = line.match(/^\+\+\+ b\/(.*)$/);
      if (fm) {
        currentFile = fm[1];
        continue;
      }
      // Scan only added lines (+...) — that's the secret that entered history.
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      const payload = line.slice(1);
      for (const p of PATTERNS) {
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(payload)) !== null) {
          hits.push({
            commit,
            file: currentFile,
            line: payload.length > 240 ? payload.slice(0, 240) + "…" : payload,
            pattern: p.name,
            severity: p.severity,
          });
          if (!p.re.global) break;
        }
      }
    }
  }

  return {
    ok: true,
    hits,
    commitsScanned,
    bytesScanned: raw.length,
  };
}

export interface CheckGitToplevelResult {
  ok: boolean;
  toplevel: string | null;
  expected: string;
  matches: boolean;
  error?: string;
}

/**
 * defect #16: a service folder inside the ops workspace root can inherit the root `.git`
 * (the private ops repo). Pushing then sends ops content to the public service repo.
 * `git rev-parse --show-toplevel` must return the service folder, NOT the ops root.
 */
export function checkGitToplevel(repoPath: string): CheckGitToplevelResult {
  if (!repoPath || !existsSync(repoPath)) {
    return { ok: false, toplevel: null, expected: repoPath, matches: false, error: `repoPath does not exist: ${repoPath}` };
  }
  let toplevel: string;
  try {
    toplevel = execSync(`git -C ${shellQuote(repoPath)} rev-parse --show-toplevel`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    }).trim();
  } catch (e: any) {
    return {
      ok: false,
      toplevel: null,
      expected: repoPath,
      matches: false,
      error: `Not a git repository. Run \`git init\` in ${repoPath} before pushing (defect #16).`,
    };
  }
  // Normalize for comparison (resolve symlinks + trailing slashes).
  const expected = resolve(repoPath);
  const matches = toplevel === expected;
  return {
    ok: matches,
    toplevel,
    expected,
    matches,
    error: matches
      ? undefined
      : `defect #16: show-toplevel (${toplevel}) is NOT the service folder (${expected}). The folder inherited the parent .git. Fix: \`cd ${expected} && rm -rf .git && git init && git add -A && git remote add origin <url>\` then force-push (user approval).`,
  };
}
