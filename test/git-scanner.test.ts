import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { scanGitHistory, checkGitToplevel } from "../lib/scanners/git.js";

function shell(c: string) {
  execSync(c, { stdio: ["ignore", "pipe", "pipe"] });
}

let dir: string;
let dir2: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spw-git-"));
  dir2 = mkdtempSync(join(tmpdir(), "spw-git2-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
});

function initRepo(p: string) {
  shell(`git -C ${p} init -q -b main`);
  shell(`git -C ${p} config user.email t@t`);
  shell(`git -C ${p} config user.name t`);
}

describe("scan_git_history (defect #1)", () => {
  it("detects a leaked EVM private key planted in history", () => {
    initRepo(dir);
    writeFileSync(join(dir, "config.ts"), 'const KEY = "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";\n');
    shell(`git -C ${dir} add -A && git -C ${dir} commit -qm leak`);
    const r = scanGitHistory(dir);
    expect(r.ok).toBe(true);
    expect(r.commitsScanned).toBe(1);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.pattern.includes("EVM private key"))).toBe(true);
    expect(r.hits[0].commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("detects a leaked GitHub PAT (ghp_) and PAT-in-URL", () => {
    initRepo(dir);
    writeFileSync(join(dir, ".env"), "GITHUB_TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz\n");
    writeFileSync(join(dir, "remote.txt"), "https://ghp_ABCDEF0123456789ABCDEFGHIJ@github.com/evidiq/x.git\n");
    shell(`git -C ${dir} add -A && git -C ${dir} commit -qm pat`);
    const r = scanGitHistory(dir);
    const names = r.hits.map((h) => h.pattern);
    expect(names.some((n) => n.includes("ghp_"))).toBe(true);
    expect(names.some((n) => n.includes("remote URL"))).toBe(true);
  });

  it("detects OKX credential assignments", () => {
    initRepo(dir);
    writeFileSync(join(dir, ".env"), "OKX_API_KEY=abc-def-123\nOKX_SECRET_KEY=deadbeefcafebabe\nOKX_PASSPHRASE=pass#word1\n");
    shell(`git -C ${dir} add -A && git -C ${dir} commit -qm okx`);
    const r = scanGitHistory(dir);
    const names = r.hits.map((h) => h.pattern);
    expect(names.some((n) => n.includes("OKX API key"))).toBe(true);
    expect(names.some((n) => n.includes("OKX secret"))).toBe(true);
    expect(names.some((n) => n.includes("OKX passphrase"))).toBe(true);
  });

  it("returns no hits on a clean repo", () => {
    initRepo(dir);
    writeFileSync(join(dir, "server.ts"), "export const x = 1;\n");
    shell(`git -C ${dir} add -A && git -C ${dir} commit -qm clean`);
    const r = scanGitHistory(dir);
    expect(r.ok).toBe(true);
    expect(r.hits).toHaveLength(0);
  });

  it("returns a structured error for a non-git directory", () => {
    writeFileSync(join(dir, "file.txt"), "hi");
    const r = scanGitHistory(dir);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Not a git repository");
  });

  it("returns a structured error for a missing path", () => {
    const r = scanGitHistory(join(dir, "does-not-exist"));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("does not exist");
  });
});

describe("check_git_toplevel (defect #16)", () => {
  it("returns ok:true when the folder owns its .git", () => {
    initRepo(dir);
    const r = checkGitToplevel(dir);
    expect(r.ok).toBe(true);
    expect(r.matches).toBe(true);
    expect(r.toplevel).toBe(dir);
    expect(r.error).toBeUndefined();
  });

  it("returns a structured error + git init hint when no .git exists", () => {
    writeFileSync(join(dir, "file.txt"), "hi");
    const r = checkGitToplevel(dir);
    expect(r.ok).toBe(false);
    expect(r.matches).toBe(false);
    expect(r.error).toContain("git init");
    expect(r.error).toContain("defect #16");
  });

  it("returns a structured error for a missing path", () => {
    const r = checkGitToplevel(join(dir, "missing"));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("does not exist");
  });

  it("simulates the inherited-.git case: a subfolder without its own .git resolves to the parent toplevel", () => {
    // Parent dir2 is a repo; a child subdir is NOT a repo → rev-parse returns dir2 (the parent).
    initRepo(dir2);
    mkdirSync(join(dir2, "service-sub"));
    writeFileSync(join(dir2, "service-sub", "file.txt"), "x");
    const r = checkGitToplevel(join(dir2, "service-sub"));
    expect(r.ok).toBe(false);
    expect(r.matches).toBe(false);
    // toplevel resolves to the parent repo (dir2), not the service-sub folder → defect #16 signal.
    expect(r.toplevel).toBe(dir2);
    expect(r.error).toContain("defect #16");
  });
});
