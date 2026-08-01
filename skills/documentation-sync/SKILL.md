# documentation-sync

> EVIDIQ-specific. README (proven table, OKX badge, architecture mermaid, verification log,
> registration table), landing (`docs.ts` entry, `page.tsx`, hero SVG), runbook (§24 registry row,
> §NN section, X402-runbook §13 proof row). Commit + push (token helper, `.git` check). No
> equivalent in EVIDIQ methodology.

---

## When to use

- `okx-registration` returned `newAgentId` + create tx + communication address. Docs need the real
  ID — never write docs before registration (playbook §1 ordering rule).
- A service shipped and you need to sync README + landing + runbook.
- Post-registration: rebuild + redeploy the landing, commit + push all repos.

Do **not** use this before registration — you'd rewrite docs with the real ID. Do **not** push
without `git-hygiene`'s `.git` toplevel check (defect #16).

---

## What it does

Closes the loop after registration. The service, the landing, and the runbook all get a
registration-aware update, then everything is committed + pushed. Playbook §8–§14:

### Service README (§8)

- **Proven on-chain table** (§8.1) — two rows: cheapest paid tool (0.005 USDT0 → settle tx `0x1`,
  verdict, `reportDigest` reproducible RFC 6979) + `attest_<slug>_safety` (0.03 USDT0 → settle tx
  `0x1`, `zeroGAnchorTx`, `zeroGStorageRoot`). OKLink tx links (`oklink.com/xlayer/tx/<hash>`,
  NEVER `okx.com/explorer/...`).
- **OKX badge** (§8.2) — shields.io badge `OKX.AI Agent #<ID> Under Review`.
- **Launch status** (§8.3) — "live endpoint" banner, endpoint, settle SDK, agent ID under review,
  0G live.
- **Registration table** (§8.4) — agent ID, name, listing status, registration tx, OKX agent URL,
  communication address, services registered (10: 5 gated + 5 ungated, fee range).
- **Verification log** (§8.5) — free→200, paid→402, determinism MATCH, capability diff 10/10,
  on-chain settle hashes, 0G anchor hashes.

### Landing (§9)

- **`docs.ts` entry** (§9.1) — `Evidiq/lib/docs.ts`: `slug`, `name`, `tagline`, `description`,
  `endpoint`, `badge:"Under OKX.AI review"`, `badgeTone:"review"`, `tools[]` (5 paid + 5 free),
  `href:"/docs/<slug>"`, `image:"/docs/<slug>-hero.svg"`, `okxUrl`, `agentId:<ID>`.
- **`page.tsx`** (§9.2) — `Evidiq/app/docs/<slug>/page.tsx`, mirror Bulwark/Circuit: metadata,
  paid/free tools arrays, `OkxAiLiveBlock` (status="review"), quickstart, use-cases, tools list,
  pipeline & invariants, x402 pricing table, "Settled on X Layer" emerald card, "OpenClaw
  Verification Log" violet card, license.
- **Hero SVG** (§9.3) — `Evidiq/public/docs/<slug>-hero.svg` (1200×750), copy Bulwark template,
  change title/gradient/center icon/cards.
- **`npx tsc --noEmit`** in `Evidiq/` — must be clean (§9.4).

### Runbook + X402-runbook (§10)

- **§24 registry row** (§10.1) — `| <N> | <Name> | evidiq-<slug>-mcp/ | <port> | #<ID> | under
  review |`. Update "Next free host port" to `<port+1>`.
- **§NN section** (§10.2) — append a full section: agentId, create tx, avatar CDN URL,
  validate-listing result, 10 services + fees, activate result (`submitApproval` approvalStatus:2
  success:true), pre-submission gate summary, proven paid call (tx + receipt 0x1 + verdict),
  determinism, 0G anchor, design review summary, state line "X Listed, 1 under review (#<ID>
  <Name>)".
- **X402-runbook §13 proof row** (§10.3) — `| <Name> | #<ID> | <paid_tool_1> | 0.005 USDT0 |
  0x<full_hash> | under review |`.

### Architecture mermaid (§11)

Add `## Architecture` to service README (before `## License`). Copy Bulwark template: `POST
/<slug>/mcp`, free tools node, gate description, trust-boundary subgraph, fleet classDef colors
(client purple, payment green, core dark, output violet).

### Verification log (§12)

Capture the terminal output format (free 200, paid 402, scan verdicts, determinism MATCH, capability
diff 10/10, on-chain settle hashes + 0G hashes). Goes into README + landing violet card.

### Landing rebuild + deploy (§13)

`ssh hackaton-do 'cd /root/evidiq-src && git fetch origin main && git reset --hard origin/main'`,
build in background (standalone output, ~40s cached), redeploy, verify page + hero SVG live (restart
`evidiq` container if SVG 404s). Never `docker builder prune -f` casually (clears npm ci cache → 10+
min rebuild).

### Final commit + push all repos (§14)

- **Root ops repo** (local, no remote) — runbook + .gitignore updates.
- **Landing repo** (`Evidiq/`) — `docs.ts` + `page.tsx` + hero SVG. Push via token helper.
- **Service repo** (`evidiq-<slug>-mcp/`) — README + architecture + verification log. **Verify
  `git rev-parse --show-toplevel` is the service folder first** (defect #16 — **call
  `check_git_toplevel`**). Push via token helper.

---

## EVIDIQ specialization (no EVIDIQ methodology equivalent)

| Concept | EVIDIQ documentation-sync |
|---|---|
| Proven table | Two on-chain settle rows (cheap + attest) with OKLink links |
| OKX badge | shields.io `Agent #<ID> Under Review` |
| agentId | Required in `docs.ts`, README registration table, runbook §NN — get it from registration first |
| Runbook loop | §24 row + §NN section + X402 §13 row (§24 rule 6) |
| Push pattern | Token-helper env (`GITHUB_TOKEN` + credential.helper), NEVER token-in-URL (§3) |
| .git check | `check_git_toplevel` before every push (defect #16) |
| OKLink URL | `oklink.com/xlayer/tx/<hash>` — NEVER `okx.com/explorer/...` |

---

## The token-helper push pattern (§3 — never put token in URL/config)

```bash
token="$(grep '^GITHUB_TOKEN=' /home/cucu/Coder/EVIDIQ/Evidiq/.env.local | cut -d= -f2-)"
GITHUB_TOKEN="$token" GIT_CONFIG_COUNT=1 \
  GIT_CONFIG_KEY_0=credential.helper \
  GIT_CONFIG_VALUE_0='!f() { echo "username=x-access-token"; echo "password=$GITHUB_TOKEN"; }; f' \
  git push origin main
```

A PAT embedded in the git remote URL (`https://ghp_…@github.com/…`) is defect (runbook §25 trap 2) —
if found, `git remote set-url` to clean URL, scan history, rotate the token.

---

## Procedure

1. Collect from `okx-registration`: `newAgentId`, create tx hash, avatar CDN URL,
   `validate-listing` result, communication address.
2. Collect from `x402-verification`: both settle tx hashes + 0G anchor proof + determinism result +
   capability diff result.
3. Write service README sections (§8.1–§8.5) + architecture mermaid (§11).
4. Write landing `docs.ts` entry + `page.tsx` + hero SVG (§9). `npx tsc --noEmit` in `Evidiq/`.
5. Update runbook §24 row + §NN section + X402-runbook §13 row (§10).
6. Landing rebuild + deploy on VPS (§13). Verify page + SVG live.
7. **Call `check_git_toplevel`** on the service folder + landing folder. Both must return their own
   folder, NOT the ops root. `git init` if missing (defect #16).
8. Commit + push all three repos via the token helper (§14).
9. Verify each push: local HEAD == remote HEAD.

---

## MCP tools this skill calls

- **`check_git_toplevel`** — `params: { repoPath: "/home/cucu/Coder/EVIDIQ/evidiq-<slug>-mcp" }` (and
  the landing path). Returns the toplevel + whether it equals the expected folder. Defect #16
  prevention — run before EVERY push from a service folder.

---

## Defects this skill specifically prevents

#16 (wrong repo content — `check_git_toplevel` before push), the OKLink URL mistake, the
token-in-URL PAT leak (§3 token helper), the "write docs before registration" rework (playbook §1
ordering rule).

---

## Stop / handoff

- **Stop:** all three repos pushed (local HEAD == remote HEAD), landing live, runbook §24 row +
  §NN + X402 §13 row present.
- **Handoff to:** `security-audit` — final git history scan + `.git` toplevel check across all
  pushed repos. This is the last skill before "Fleet +1".
- **Do NOT skip `security-audit`.** A leaked key in history of a freshly-pushed public repo is the
  worst-case defect #1/#16.

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §8 (README), §9 (landing), §10 (runbook), §11 (mermaid), §12
  (verif log), §13 (landing rebuild), §14 (commit + push), §16 (command reference: token helper,
  OKLink URL, landing deploy).
- `../EVIDIQ-RUNBOOK.md` §24 (registry + rules), §25 (Lineage traps incl. PAT-in-URL).
- `../evidiq-bulwark-mcp/README.md` — canonical README shape (proven table, badge, registration
  table, verification log).
