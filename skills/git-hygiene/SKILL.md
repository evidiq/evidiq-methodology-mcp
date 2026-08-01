# git-hygiene

> Service folder owns `.git` (defect #16). Push via `GITHUB_TOKEN` env helper (§3). Force-push when
> purging secrets. Root `.gitignore` excludes service dirs. Adapted from obra/superpowers
> `using-git-worktrees`, specialized for the EVIDIQ multi-repo layout where a service folder sits
> inside a private ops workspace root.

---

## When to use

- Before any `git push` from a service folder (`evidiq-<slug>-mcp/`) or the landing folder
  (`Evidiq/`).
- When creating a new service folder — `git init` it before any push (defect #16).
- After a secret leak — force-push purge + rotate.
- When the root `.gitignore` needs a new service exclusion.

Do **not** push from a service folder without `check_git_toplevel` first (defect #16). Do **not**
embed a PAT in the remote URL (§3 / §25 trap 2). Do **not** force-push without explicit user
approval.

---

## What it does

EVIDIQ's layout: a private ops workspace root (`/home/cucu/Coder/EVIDIQ/`, has its own `.git`,
contains runbooks + logos + .kiro) with N public service folders inside it. The recurring disaster
(defect #16): a service folder without its own `.git` inherits the root `.git`, so `git push` from
inside the service folder pushes **ops content** (runbook, logos) to the **public service repo** —
leaking private ops material. This skill enforces the prevention.

### The rules

1. **Every service folder owns its `.git`.** Before any push from `evidiq-<slug>-mcp/`, verify
   `git rev-parse --show-toplevel` returns the service folder, NOT `/home/cucu/Coder/EVIDIQ`. If no
   `.git` exists, `git init` + `git config user.email/name` + `git branch -m main` + `git add -A` +
   `git remote add origin` + commit **before** pushing. **Call `check_git_toplevel`** to verify.
2. **Root `.gitignore` excludes every service folder.** Add `/evidiq-<slug>-mcp/` to
   `/home/cucu/Coder/EVIDIQ/.gitignore` so the ops repo never tracks service files. (Some entries
   keep `PLAN.md` tracked in ops via `!/evidiq-<slug>-mcp/PLAN.md` — only when the plan phase is
   still in ops; once the service ships, exclude fully.)
3. **Push via the token-helper env pattern, never token-in-URL.** §3:
   ```bash
   token="$(grep '^GITHUB_TOKEN=' /home/cucu/Coder/EVIDIQ/Evidiq/.env.local | cut -d= -f2-)"
   GITHUB_TOKEN="$token" GIT_CONFIG_COUNT=1 \
     GIT_CONFIG_KEY_0=credential.helper \
     GIT_CONFIG_VALUE_0='!f() { echo "username=x-access-token"; echo "password=$GITHUB_TOKEN"; }; f' \
     git push origin main
   ```
   A PAT in the remote URL (`https://ghp_…@github.com/…`) is defect §25 trap 2 — on disk in
   plaintext. If found: `git remote set-url origin <clean-url>`, scan history, rotate the token.
4. **Force-push only when purging secrets** — and only with explicit user approval. `git filter-repo`
   (or BFG) to purge the leaked file across all commits, then `git push --force -u origin main`.
   Playbook §7.4. Rotate the leaked key immediately — assume compromised.
5. **Verify after push** — on GitHub, confirm the file list shows service files (`server.ts`,
   `start-server.ts`, `lib/`, `test/`), NOT ops files (`EVIDIQ-RUNBOOK.md`, `logos/`, `.kiro`). And
   locally: `git log --oneline -1` matches GitHub's latest.
6. **Commit message shape** — match the fleet style:
   ```
   feat: EVIDIQ <Name> MCP #<N> — production release

   <description>. 10 tools (5 paid + 5 free).
   OKX.AI Agent #<ID> under review.
   Proven paid call: <tool> <amount> USDT0 → settle <tx> 0x1.
   ```

---

## EVIDIQ specialization (vs obra/superpowers `using-git-worktrees`)

| obra/superpowers | EVIDIQ git-hygiene |
|---|---|
| Worktrees for parallel work | Not the fleet pattern — one folder per service, own `.git` |
| Generic push | Token-helper env pattern (§3), never token-in-URL |
| No defect-16 concept | `check_git_toplevel` is the dedicated prevention — run before every push |
| Generic ignore | Root `.gitignore` excludes each service folder (`/evidiq-<slug>-mcp/`) |
| Force-push | Only for secret purge, with explicit user approval + rotate |
| Commit shape | Fleet template (feat: …, tools count, agent ID, proven tx) |

---

## Procedure (before a push)

1. `cd /home/cucu/Coder/EVIDIQ/evidiq-<slug>-mcp`.
2. **Call `check_git_toplevel`** → `params: { repoPath: "$(pwd)" }`. If `ok:false` (toplevel is the
   ops root), the folder has no `.git` — run the init sequence:
   ```bash
   git init
   git config user.email "evidiqdev@gmail.com"
   git config user.name "EVIDIQ Dev"
   git branch -m main
   git add -A
   git status --short  # VERIFY: only service files
   git remote add origin https://github.com/evidiq/evidiq-<slug>-mcp.git
   ```
3. Verify `.gitignore` inside the service folder excludes `node_modules/`, `dist/`, `.env*`.
4. Confirm root `.gitignore` excludes `/evidiq-<slug>-mcp/`.
5. Commit with the fleet message shape.
6. Push via the token-helper env pattern.
7. Verify on GitHub: file list = service files, not ops files. Local HEAD == remote HEAD.

### If wrong content was pushed (defect #16 recovery)

```bash
cd /home/cucu/Coder/EVIDIQ/evidiq-<slug>-mcp
rm -rf .git  # remove the inherited root .git
git init
git config user.email "evidiqdev@gmail.com"
git config user.name "EVIDIQ Dev"
git branch -m main
git add -A  # only service files now
git commit -m "feat: EVIDIQ <Name> MCP #<N> — production release"
git remote add origin https://github.com/evidiq/evidiq-<slug>-mcp.git
GITHUB_TOKEN="$token" … git push --force -u origin main  # user approval required
```

### If a secret is in history (defect #1 recovery)

```bash
# Purge with filter-repo (or BFG), then force-push + rotate
git filter-repo --invert-paths --path <leaked-file>  # or --replace-text for inline
git push --force origin main  # user approval required
# Rotate the leaked key immediately
```

---

## MCP tools this skill calls

- **`check_git_toplevel`** — `params: { repoPath }`. Returns `{ toplevel, expected, ok }`. Run
  before EVERY push from a service or landing folder. This is the defect #16 prevention check.

(`scan_git_history` for the secret-leak case is owned by `security-audit`, but `git-hygiene` triggers
it when a leak is suspected.)

---

## Defects this skill specifically prevents

#16 (wrong repo content — `check_git_toplevel` + own `.git` + root `.gitignore`), the PAT-in-URL leak
(§3/§25 trap 2 — token helper), #1 escalation (force-push purge + rotate when a key is in history).

---

## Stop / handoff

- **Stop:** push verified (GitHub file list correct, local == remote), root `.gitignore` updated,
  no token in any remote URL.
- **Handoff to:** `security-audit` runs `scan_git_history` as the final check after all pushes. If a
  leak is found, comes back here for the force-push purge.
- **Do NOT force-push without explicit user approval.** Secret rotation is the user's call.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §7 (GitHub repo creation + push — defect #16), §7.4 (force-push
  fix), §14 (final commit + push all repos), §16 (token helper command reference).
- `../EVIDIQ-RUNBOOK.md` §24 (folder rules), §25 trap 2 (PAT-in-URL), §26 (mistakes).
- `/home/cucu/Coder/EVIDIQ/.gitignore` — the root ignore with each service excluded.
