# okx-registration

> EVIDIQ-specific. Pre-check `canCreate`, upload avatar, `validate-listing` QA gate, `create ASP` +
> 10 services, `activate` → read `submitApproval` (NOT `activate.success`). STOP gate: no poll. No
> equivalent in obra/superpowers — this is the OKX.AI ASP listing flow.

---

## When to use

- `x402-verification` is proven: settle tx `0x1` recorded, `attest_*` 0G anchor real, `payment
  quote` all-green.
- The user says "register on OKX" / "list on OKX.AI" / "create the ASP" / "activate".
- A listing was rejected and you need to resubmit (after fixing the code + re-proving Phase 2).

Do **not** use this before Phase 2 is proven (§24 rule 4, §23 — no listing before a proven paid
call). Do **not** use this to *check* registration status alone — that's a `check_okx_status` tool
call, part of this skill but also callable standalone. Do **not** poll after activate.

---

## What it does

Registers the service as an ASP (Agent Service Provider) on OKX.AI with 10 A2MCP services. The flow
(playbook §6, runbook §38/§42 for the canonical examples):

1. **Pre-flight** — `onchainos preflight --skill-version <version>` → must return `action: null`.
   Also `onchainos agent pre-check --role asp` → confirm `canCreate: true` and note `aspCount`
   (wallet `0x2a8efe30…` holds the agent records). If `canCreate:false`, STOP — the wallet already
   has too many ASP records; clean up duplicates first (§42 stray-duplicate case).
2. **Prepare the 10-service JSON** — `/tmp/<slug>-services.json`. Each service: `serviceName`,
   `serviceDescription` (3 lines: what it does / user provides / returns), `serviceType:"A2MCP"`,
   `fee` (atomic string: "0.005"–"0.03" for paid, "0" for free), `endpoint:
   "https://mcp.evidiq.dev/<slug>/mcp"`. Mirror Aegis/Circuit/Bulwark exactly. Fees MUST match the
   live `/x402` catalog + the §8 PLAN prices (§23 rule 6).
3. **Upload avatar** — `scp logo.png` (440×440 PNG, 1:1) to VPS, `onchainos agent upload --file
   /tmp/logo.png`. Record the CDN URL. **Upload once, create once** — a second upload invalidates
   the first URL (§21/§38).
4. **`validate-listing` (QA gate)** — `onchainos agent validate-listing --role asp --name "EVIDIQ
   <Name>" --description "…" --service "$(cat /tmp/<slug>-services.json)"`. Expect
   `{"pass":true,"findings":[]}`. If findings, fix before create. Common findings: brand name,
   profit guarantees, non-3-line descriptions.
5. **Create ASP + 10 services** — `onchainos agent create --role asp --name … --description …
   --picture <CDN_URL> --service "$(cat /tmp/<slug>-services.json)"`. **Record `newAgentId`** (the
   agent ID — needed for ALL docs) + `txHash` (registration tx). Critical ordering: get the agent ID
   here, BEFORE writing docs (docs need the real ID).
6. **Activate (submit for review)** — `onchainos agent activate --agent-id <ID> --preferred-language
   en-US`. **Read `submitApproval`, NOT `activate.success`**:
   - `submitApproval: [{approvalStatus:2, success:true}]` = submitted, under review. **STOP.**
   - `activate.success:false` alongside the above is NORMAL — the submission itself succeeded via
     `submitApproval`. Do not treat `activate.success:false` as failure.
   - `approvalStatus:2` = "Listing under review". **DO NOT POLL.** §27/§38.
7. **Get communication address** — `onchainos agent get-agents --agent-ids <ID>` → record
   `communicationAddress`, `approvalLabel`. **Call `check_okx_status`** with the agent ID to parse
   this cleanly.
8. **Hand off to `documentation-sync`** — with `newAgentId`, create tx hash, avatar CDN URL,
   `validate-listing` result, communication address. Docs need all of these.

### Resubmitting a rejected listing (§23)

1. `check_okx_status` (or `get-agents`) → `approvalDisplayStatus:5` = rejected; `approvalRemark`
   carries the reason. **Read the reason literally — do not guess.**
2. Fix the code + redeploy + re-prove Phase 2 (the §23 checklist).
3. `onchainos agent activate --agent-id <id> --preferred-language en-US` resubmits. Read
   `submitApproval` again. Follow-up `get-agents` → `approvalDisplayStatus:2` = under review.

---

## EVIDIQ specialization (no obra/superpowers equivalent)

| Concept | EVIDIQ okx-registration |
|---|---|
| Listing | OKX.AI ASP + 10 A2MCP services, USDT0 fees, endpoint `mcp.evidiq.dev/<slug>/mcp` |
| Submit signal | Read `submitApproval` (approvalStatus:2, success:true), NOT `activate.success` |
| Polling | **Never poll.** approvalStatus:2 = under review; wait for OKX. |
| Pre-checks | `canCreate`, `validate-listing`, `onchainos payment quote` all-green, proven paid call |
| Avatar | Upload once, create once (second upload invalidates first URL) |
| Rejection | Read `approvalRemark` literally; fix code, re-prove, resubmit via `activate` |

---

## Procedure

1. Confirm `x402-verification` proven (settle `0x1` + 0G anchor + quote all-green).
2. VPS: `onchainos preflight` → `action:null`. `agent pre-check --role asp` → `canCreate:true`.
3. Write `/tmp/<slug>-services.json` (10 services, fees match `/x402`).
4. `scp logo.png` → `onchainos agent upload --file /tmp/logo.png` → record CDN URL.
5. `onchainos agent validate-listing …` → expect `pass:true`.
6. `onchainos agent create …` → record `newAgentId` + `txHash`.
7. `onchainos agent activate --agent-id <ID> --preferred-language en-US` → read `submitApproval`.
   **STOP. Do not poll.**
8. **Call `check_okx_status`** → `params: { agentId: <ID> }` → record communication address +
   approvalLabel.
9. Hand off to `documentation-sync`.

---

## MCP tools this skill calls

- **`check_okx_status`** — `params: { agentId }`. Runs `onchainos agent get-agents --agent-ids <id>`
  (or instructs the agent to run it on the VPS if onchainos isn't reachable from the MCP container),
  parses `approvalLabel`, `statusLabel`, `communicationAddress`, `approvalDisplayStatus`,
  `approvalRemark`. Use it after activate to confirm "under review" and to read rejection reasons
  later.

`preflight`, `agent pre-check`, `agent upload`, `validate-listing`, `agent create`, `agent activate`
are run as `onchainos` shell commands on the VPS via `ssh hackaton-do 'bash -lc "onchainos …"'`
(runbook §24 rule 3 — `web3.okx.com` is blocked from the workstation).

---

## Defects this skill specifically prevents

#13 (challenge mistakes — caught by `payment quote` before submit), the "read activate.success as
failure" misread (§38/§42 — read `submitApproval`), the "poll after activate" anti-pattern (§27).

---

## Stop / handoff

- **Stop:** `submitApproval` shows `approvalStatus:2, success:true`. Agent is under review. **Do not
  poll.** Record `newAgentId`, create tx hash, communication address, avatar CDN URL,
  `validate-listing` result.
- **Handoff to:** `documentation-sync` — it writes README badge + registration table, landing
  `docs.ts` entry (with `agentId`), runbook §24 row + §NN section + X402-runbook §13 proof row.
- **Do NOT write docs before registration.** Docs need the real agent ID (playbook §1 ordering rule).

---

## References

- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §6 (registration), §15 (defects), §16 (command reference).
- `../EVIDIQ-RUNBOOK.md` §23 (resubmit flow), §24 (rules), §27/§38/§42 (activate/submitApproval
  examples), §41 (challenge format).
- `../evidiq-bulwark-mcp/README.md` — registration table + badge shape.
