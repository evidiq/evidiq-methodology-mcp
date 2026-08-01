# security-audit

> EVIDIQ-specific. Git history scan (private keys, PATs, OKX creds, mnemonics), `.git` toplevel
> check (defect #16), no hardcoded keys, no `WWW-Authenticate` header, no fallback signer string.
> Adapted from the security mindset of EVIDIQ methodology, specialized to catch the 16 fleet defects
> automatically.

---

## When to use

- **Final gate before "Fleet +1"** — after `documentation-sync` has pushed all repos. This is the
  last skill in the session flow.
- Before any public push from a service folder — run `scan_git_history` + `check_git_toplevel`.
- After a secret scare (a key was on disk, a PAT slipped into a remote URL) — scan + purge + rotate.
- When OKX review flags a security/validation issue — re-audit before resubmit.

Do **not** use this as a substitute for `tdd-implementation` (it catches leaks, not logic bugs). Do
**not** run only the local working tree — git **history** is where leaked keys live (defect #1).

---

## What it does

Runs the EVIDIQ-specific security checks the fleet has been burned by. The 16 defects are the
checklist; this skill (with its two MCP tools) automates the automatable parts:

1. **Git history scan** — `scan_git_history` walks every commit's diff for:
   - EVM private keys (`0x` + 64 hex),
   - GitHub PATs (`ghp_`, `github_pat_`),
   - OKX creds (`OKX_API_KEY=`, `OKX_SECRET_KEY=`, `OKX_PASSPHRASE=` with values),
   - mnemonics (12/24-word BIP-39 sequences),
   - embedded PAT-in-URL (`https://ghp_…@github.com/` — runbook §25 trap 2).
   Returns a hit list: commit hash + file + matched line. Any hit is a hard stop.
2. **`.git` toplevel check** — `check_git_toplevel` verifies `git rev-parse --show-toplevel` returns
   the service folder, NOT `/home/cucu/Coder/EVIDIQ` (defect #16). Run on the service folder + the
   landing folder before every push.
3. **No fallback signer string** — defect #1. Grep for `process.env.<…>_SIGNER_PRIVATE_KEY \|\|
   "0x` and any hardcoded `0x` + 64-hex literal in `lib/` + `server.ts` + `start-server.ts`. The
   signer must crash on missing env, never fall back. (Test fixtures are the only exception, and
   they live under `test/`.)
4. **No `WWW-Authenticate` header** — §41-A. Grep `start-server.ts` + `lib/x402/` for
   `WWW-Authenticate`. Must be absent. The 402 uses `payment-required` + `x-payment-required` only.
5. **No hardcoded OKX creds** — grep for literal `OKX_API_KEY`/`OKX_SECRET_KEY`/`OKX_PASSPHRASE`
   assignments with values (not `process.env.` reads).
6. **`error` field not in base64 challenge** — §41-A trap. The encoded challenge header excludes
   `error`; `error` lives only in the JSON body. Check `lib/x402/challenge.ts`
   `encodeChallengeToBase64` strips it.
7. **Free tools never 402** — defects #3, #4. No enum/regex in free-tool zod schemas that would
   reject `{}`. `capabilities`/`validate`/`estimate` accept `{}` or minimal input.
8. **No model/network/random in verdict path** — defect #12. Grep the evaluation pipeline for
   `fetch(`, `Math.random`, `Date.now` (in digest path), LLM imports. Same bytes → same verdict.
9. **Capabilities == tools/list** — defect #8. `diff_capabilities` (already run in
   `phased-deployment`) confirms 10/10.
10. **`deploy/run.sh` has `--env-file`** — defect #15. Grep `run.sh` for `--env-file`.
11. **`.gitignore` excludes the service folder from the ops root** — defect #16. The root
    `.gitignore` has `/evidiq-<slug>-mcp/`.

### If a hit is found (purge + rotate)

- **Leaked key in history:** `git filter-repo` (or BFG) to purge the file across all commits, then
  **force-push** (with explicit user approval). Rotate the key immediately — assume it is
  compromised the moment it touched a public branch. §3 / §25 trap 2.
- **PAT in remote URL:** `git remote set-url origin <clean-url>`, scan tracked files + history,
  rotate the token. It was on disk in plaintext.
- **Wrong `.git` toplevel:** `rm -rf .git` (the inherited root .git), `git init`, `git add -A`,
  commit, `git remote add origin`, **force-push** to overwrite the public repo's wrong content.
  Playbook §7.4.

---

## EVIDIQ specialization (vs a generic security mindset)

| Generic | EVIDIQ security-audit |
|---|---|
| Scan working tree | Scan **git history** (every commit diff) — that's where leaks live |
| Generic secret patterns | EVM 0x64hex, `ghp_`, OKX creds, BIP-39 mnemonics, PAT-in-URL |
| No .git concept | `check_git_toplevel` (defect #16) is a fleet-specific check |
| No x402 headers | `WWW-Authenticate` absence (§41-A), base64 `error` exclusion |
| No signer rules | No fallback signer string (defect #1) — crash on missing env |
| No env-file concept | `deploy/run.sh` must have `--env-file` (defect #15) |
| No determinism | Model/network/random forbidden in verdict path (defect #12) |
| Purge | `git filter-repo` + force-push + rotate (with explicit user approval) |

---

## The 16 defects checklist (run mentally at every step)

```
 1. Fallback signing key in source         9.  Stated capability with no implementation
 2. Claim derived from config, not check    10. Charging then rejecting input
 3. Free tool erroring on {}                11. Detectors tested only in convenient form
 4. Enum/regex in free-tool schema → 402    12. Model in deterministic hot path
 5. "Not found" returned as error           13. x402 header mistakes (WWW-Authenticate, base64 error, GET 200)
 6. Verdict about nothing                   14. HEAD /mcp hang
 7. estimate_cost inventing answers         15. Container without env-file
 8. Capabilities describing half service    16. Wrong repo content on GitHub push (no own .git)
```

This skill automates #1, #12, #13, #15, #16 directly; the others are owned by their skills but
re-checked here as a final sweep.

---

## Procedure

1. **`scan_git_history`** on the service repo → `params: { repoPath }`. Any hit → STOP, purge +
   rotate (with user approval) before continuing.
2. **`check_git_toplevel`** on the service repo + landing repo → both must return their own folder.
3. Grep the service source for: fallback signer strings, `WWW-Authenticate`, hardcoded OKX creds,
   `fetch`/`Math.random`/LLM imports in the verdict path, free-tool enum schemas.
4. Check `deploy/run.sh` has `--env-file`; check root `.gitignore` excludes the service folder.
5. If clean → "Fleet +1". Done.
6. If any hit → fix → purge history if needed → force-push (user approval) → rotate keys → re-audit.

---

## MCP tools this skill calls

- **`scan_git_history`** — `params: { repoPath: "/home/cucu/Coder/EVIDIQ/evidiq-<slug>-mcp" }`. Walks
  `git log -p --all`, regex-scans diffs, returns `{ hits: [{commit, file, line, pattern}], clean }`.
  Catches defect #1 (fallback/leaked signer), PAT-in-URL, OKX creds, mnemonics.
- **`check_git_toplevel`** — `params: { repoPath }`. Returns `{ toplevel, expected, ok }`. Catches
  defect #16 (inherited root .git → wrong push content).

The header/source greps (#3–#8) are shell `rg`/`grep` runs in the service folder; the MCP tools cover
the git-history + toplevel checks that are easy to get wrong by hand.

---

## Defects this skill specifically prevents

#1 (fallback/leaked signer — `scan_git_history`), #12 (model in path — source grep), #13
(WWW-Authenticate + base64 error — source grep), #15 (env-file — `run.sh` grep), #16 (wrong repo —
`check_git_toplevel`). Plus a final sweep of #3, #4, #8.

---

## Stop / handoff

- **Stop:** `scan_git_history` clean, `check_git_toplevel` ok on all repos, source greps clean,
  `run.sh` has `--env-file`, root `.gitignore` excludes the service folder.
- **This is the last skill.** "Fleet +1." Update the runbook §24 status from "under review" →
  "listed" when OKX approves (a later, smaller action — not a full skill run).
- **If a hit is found:** this skill does NOT stop until the purge + rotate + re-audit is clean.
  Force-push requires explicit user approval.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §7 (GitHub push — defect #16), §7.4 (force-push fix), §15
  (the 16 defects), §16 (token helper, OKLink URL).
- `../EVIDIQ-RUNBOOK.md` §23 (payments — no silent downgrade), §26 (mistakes), §41 (WWW-Authenticate
  trap), §25 trap 2 (PAT-in-URL).
- `../evidiq-bulwark-mcp/lib/x402/challenge.ts` — `encodeChallengeToBase64` strips `error` (§41-A).
