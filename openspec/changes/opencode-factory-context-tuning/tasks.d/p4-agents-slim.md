---
title: "Condense AGENTS.md from 211 to ≤160 lines"
ticket_id: "T900074"
domains: ["llm-local-dev", "opencode-config"]
status: "draft"
---

# p4 — AGENTS.md Slimming (agents-slim)

## File Structure

```
AGENTS.md    # condense 211 → ≤160 lines in place (target ~154, +6 buffer)
```

Single target file, disjoint. No content moves to other files.

## Cut plan (211 → ~154, −57)

1. **Agent-routing table 38 → 21 lines (−17):** merge the 4 local family rows
   (`gptoss`/`devstral`/`gemma`/`gemma12`, same `freetoken-local/active` model)
   into one row; merge the 3 `freetoken-fast-*` rows into one; merge each
   deepseek rail-triple (helper/helper-go/helper-alibaba, pro/pro-direct/
   pro-alibaba, flash/flash-direct) into one row each. Duplicated model
   strings are <20%-info; `agent-models.jsonc` stays SSOT for details.
2. **Dispatch block 7 → 3 lines (−4):** one dense paragraph keeping
   task/delegate routing, `write=deny`, SSOT + mirror + sync + guard
   references; drop ticket-number justifications.
3. **Backend note-down 2 → 1 line (−1):** keep server `:1919` / daemon `:1900`
   + models path; point details at the `freetoken-setup` skill.
4. **Altlasten paragraph: delete (−1):** pure history (loadout bindings,
   exclusiveGroup, slot measurements); fallback info lives in
   `agent-models.jsonc`.
5. **Status footer 12 → 6 lines (−6):** compress the fenced example + rules
   into one dense paragraph; field names are self-explanatory.
6. **Domain-agent `<details>` 20 → 15 lines (−5):** keep the two script
   invocations + fail-closed note + curation/gate + registry split; drop the
   T002322 essay.
7. **Quality-gates `<details>` 11 → 8 lines (−3):** compress ("advisory",
   merged Brett typecheck/build line, `pnpm test:unit --prefix`).
8. **Skill-dispatch `<details>` 8 → 5 lines (−3):** symlinks one-liner,
   agent map one-liner, sdlc-autopilot one-liner.

Untouched: Workflow Rules, Architecture, Critical Footguns, Agent
Coordination, Escalation, Code Discovery, OpenSpec conventions, Dev
experience, Package Managers + Important References `<details>`.

## Acceptance Criteria

- [ ] `wc -l AGENTS.md` ≤ 160 (expected ~154).
- [ ] Must-know preserved: routing table (all agent names), core commands,
      workflow rules, footguns, status protocol, openspec conventions.
- [ ] Git diff touches only `AGENTS.md`.
- [ ] No TBD/TODO/FIXME placeholders.
- [ ] `docs/code-quality/baseline.json` needs no entry (markdown, no cap).

## Not in Scope

- **Tests** — p6 owns the test steps. This partial has **no** Failing-Test-Step
  by design.
- Moving content to other files — explicitly forbidden (no owning partial).
