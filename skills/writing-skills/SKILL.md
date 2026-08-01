# writing-skills

> Create new EVIDIQ skills following the fleet pattern. Test against existing services. Adapted
> from EVIDIQ methodology `writing-skills`, specialized so a new EVIDIQ skill carries the 16 defects,
> references the runbook sections, and calls the 9 MCP tools.

---

## When to use

- The existing 15 skills don't cover a recurring EVIDIQ workflow gap and you want to codify it.
- The user says "write a skill for <EVIDIQ workflow>".
- After a build taught a new lesson worth adding to the framework (e.g. a 17th defect).

Do **not** use this to write a one-off script — skills are reusable methodology, not throwaway
automation. Do **not** use this to duplicate an existing skill — extend the existing one instead.

---

## What it does

Writes a new `skills/<name>/SKILL.md` that follows the EVIDIQ fleet pattern. The pattern (visible in
all 15 existing skills) is:

1. **Frontmatter line** — one-sentence purpose with the EVIDIQ specialization stated up front.
2. **When to use** — concrete triggers + when NOT to use.
3. **What it does** — the methodology, with EVIDIQ-specific gates inline (§ references, defect
   numbers, command patterns).
4. **EVIDIQ specialization table** — vs the EVIDIQ methodology equivalent (or "no equivalent" for the
   fleet-only skills like `phased-deployment`, `okx-registration`, `documentation-sync`,
   `security-audit`).
5. **Procedure** — numbered steps, referencing playbook sections + runbook sections by number.
6. **MCP tools this skill calls** — which of the 9 tools, with `params` shape.
7. **Defects this skill specifically prevents** — defect numbers + how.
8. **Stop / handoff** — explicit stop condition + next skill + "do NOT" boundary.
9. **References** — playbook sections, runbook sections, sibling files.

Every EVIDIQ skill carries the 16 §0 defects (at least the subset it prevents) and points at the
frozen references: `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md`, `../EVIDIQ-RUNBOOK.md` §23/§24/§26/§41,
`../EVIDIQ-X402-RUNBOOK.md`.

---

## EVIDIQ specialization (vs EVIDIQ methodology `writing-skills`)

| EVIDIQ methodology | EVIDIQ writing-skills |
|---|---|
| Follow the skill format | Same, **plus** the 9 EVIDIQ-specific sections above |
| Generic references | Frozen fleet references (playbook + runbook §s) |
| No defect carry | Every skill names the defects it prevents |
| No MCP tools | Every skill names the MCP tools it calls + param shapes |
| Test against a codebase | Test against existing EVIDIQ services (Bulwark/Circuit/Aegis) |

---

## Procedure

1. **Identify the gap** — what recurring workflow isn't covered, or what lesson just got learned.
2. **Name the skill** — kebab-case, verb-noun or gerund (e.g. `spec-brainstorming`,
   `phased-deployment`). Place under `skills/<name>/SKILL.md`.
3. **Draft the 9 sections** above. Cite real runbook sections + real defect numbers + real command
   patterns from the playbook. No generic filler.
4. **Map the MCP tools** — which of the 9 the skill calls, with `params` shape. If the skill needs a
   tool that doesn't exist, either (a) flag it as a future MCP tool, or (b) do it via shell command
   and say so.
5. **Test the skill** — pretend a fresh agent reads only this SKILL.md + the referenced playbook/runbook
   sections. Can it execute the workflow? If not, the skill is under-specified. Iterate.
6. **Test against an existing service** — does the skill's procedure actually work on
   `../evidiq-bulwark-mcp/`? Run the mental walk-through. If it misses a real step the service needed,
   add it.
7. **Update `using-evidiq-methodology`** — add the new skill to the session flow + the "what runs
   next" table + the README skills table.
8. **Update `methodology_capabilities` catalog** — the MCP tool returns the skill list; add the new
   skill to `lib/catalog.ts` in `evidiq-methodology-mcp/`.
9. **Commit** the new SKILL.md + the two updates.

---

## The skill-quality bar

An EVIDIQ skill is good when:
- A fresh agent reading only the SKILL.md + the cited playbook/runbook sections can execute the
  workflow without asking the user "what do you mean by §17" or "which defect is #16".
- It names the defects it prevents by number, with the project-specific consequence.
- It names the MCP tools it calls, with `params` shapes.
- Its stop/handoff is explicit (stop condition + next skill + "do NOT" boundary).
- It has been mentally walked through against a real shipped service (Bulwark/Circuit/Aegis).

If any of those is missing, the skill isn't done.

---

## MCP tools this skill may call

- **`methodology_capabilities`** — to confirm the catalog is updated after adding the skill. The
  tool should list the new skill in its output.
- **`validate_plan_sections`** — not directly, but a skill that touches PLAN.md should reference
  which sections matter.

Most of this skill's work is markdown writing + mental walk-through; the MCP tools are for verifying
the catalog update.

---

## Defects this skill itself must respect

A skill that codifies a bad pattern becomes a recurring bug. So `writing-skills` must:
- not codify skipping Phase 1,
- not codify registering before a proven paid call,
- not codify pushing without `check_git_toplevel`,
- not codify a fallback signer,
- not codify `WWW-Authenticate`,
- carry the 16 defects forward accurately (don't renumber or paraphrase them loosely).

If a new defect is learned (a 17th), add it to: the `using-evidiq-methodology` 16-defects block (now
17), the `security-audit` checklist, the `lib/catalog.ts` defects array, and the PLAN.md §6 list.

---

## Stop / handoff

- **Stop:** SKILL.md written in the 9-section pattern, tested-against-a-service mentally walked
  through, `using-evidiq-methodology` + README + `methodology_capabilities` catalog updated, committed.
- **Handoff to:** `using-evidiq-methodology` (the new skill is now part of the session flow).
- **Do NOT ship a skill untested** — an under-specified skill wastes every future session that loads
  it.

---

## References

- The 15 existing `skills/*/SKILL.md` files in this repo — the pattern to follow.
- `EVIDIQ-MCP-PRODUCTION-PLAYBOOK.md` §15 (the 16 defects — the canonical wording).
- `PLAN.md` (this repo) §3 (the 15-skills table) + §4 (the 9 MCP tools).
