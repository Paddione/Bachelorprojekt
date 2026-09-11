---
title: "Per-role tool restrictions for factory agents"
ticket_id: "T900074"
domains: ["config", "llm-local-dev"]
status: "amended"
---

# p2 — Per-Role Tool Restrictions (per-role-tools)

## File Structure

```
.opencode/agent-models.jsonc                    # add reviewer agent; fix qwen38 task
docs/agent-guide/registry/agents.yaml           # add factory_roles section (mirror)
scripts/opencode-sync-agents.sh                 # unchanged (guard-run only)
```

## State-of-the-World (post-read, contradicts p2-erstentwurf)

`.opencode/agent-models.jsonc` enthält **bereits** per-Agent-`permission`-Blöcke
(24 Stück, p.405 ff — das Modell ist modellagnostisch auf `freetoken-local/active`).
Die Rollen sind noch nicht deklariert: es gibt keine `factory_roles`-Sektion in
`agents.yaml` und keinen Reviewer-Agent. zwei konkrete Lücken:

1. **`qwen38` (Planner-Rolle) hat `"task": "deny"` (p.457).** Das ist ein
   **Blocker** für dev-flow: der Planner must `task` nutzen, um
   Plan-Subagenten (`gptoss`/`devstral`/`gemma`/`gemma12`) zu dispatchen.
   Entweder `task` erlauben (falls V2 nur top-level-boolean, kein per-role-
   scope unterstützt), oder den Planner per `freetoken-primary` laufen lassen
   (permits `task: allow`, p.485) und `qwen38` als read-only-Explorer belassen.
   → Entscheidung: `qwen38.task` **korrigieren** ist unbrauchbar (Schema sagt
   `deny` absichtlich — der Agent ist "text-only, sequential"). Stattdessen:
   den Planner über `orchestrator` (die `task` erlaubt für die Family-Namen)
   dispatchen und `qwen38` als Explorer-Nur-Leser belassen. Die Spec-Anforderung
   "no write access" gilt für Reviewer, nicht für Planner — das ist hier
   vertauscht. **Korrektur: Reviewer-Rolle bekommt `edit: deny`.**
2. **Kein Reviewer-Agent / keine `factory_roles`.** Reviewer = Rolle ohne
   Agenten (wie im ersten Entwurf) oder ein neuer minimaler Agent.

## Implementation Steps

### Step 1 — Reviewer-Rolle hinzufügen (neuer Agent `reviewer`)

Neuer Agent-Eintrag in `agent-models.jsonc` (nach `qwen-cloud`, vor
`freetoken-primary`), Reviewer-Rolle, **keine `write`**, **kein `bash`**
(nur read/diff/tests via `read`+`grep`), kein `task` (Reviewer reviewt,
dispatcht nicht):

```jsonc
    "reviewer": {
      "description": "Factory reviewer role — read, grep, glob, tests only; no edit/write/bash/task dispatch (Orchestrator applies edits). Write-capable: deny.",
      "mode": "subagent",
      "model": "freetoken-local/active",
      "prompt": "{file:./prompts/local-subagent.md}",
      "color": "#FBBF24",
      "temperature": 0.4,
      "steps": 50,
      "permission": { "edit": "deny", "write": "deny", "bash": "deny", "task": "deny", "glob": "allow", "grep": "allow", "list": "allow", "read": "allow", "todowrite": "allow", "question": "allow", "skill": "allow", "lsp": "allow" }
    },
```

> ⚠ Reviewer darf `skill` — braucht es für `reviewing-code-review`-Skill-Aufruf
> im Prompt; braucht `todowrite` für eigene Checklisten; darf aber **keine Dateien
> schreiben/editieren** (`edit: deny`, `write: deny`) — Review-Ergebnisse gehen
> per Ticket-Kommentar, der Orchestrator wendet Edits an.

### Step 2 — qwen38.task NOT corrected (Planner lauf über orchestrator)

Die Spec-Anforderung war "Planner: code search, read, ticket operations" —
`qwen38` hat `task: deny` und soll es behalten (explizit für den
Explorer-Einsatz). Der Planner (Plan-Subagent) wird über den
`orchestrator`-Agent dispatcht (der `task` erlaubt, AGENTS.md:39), nicht über
`qwen38`. Damit ist die Spec-Anforderung erfüllt, ohne das bewusste `deny` zu
umkehren.

### Step 3 — agents.yaml `factory_roles` ergänzen

Neuer Top-Level-Abschnitt (nach `runtimes:`) — **Mirror**, nicht SSOT:

```yaml
factory_roles:
  planner:
    description: "Code search, read, ticket operations; dispatched via orchestrator (qwen38 is explorer-only)"
    permission: {read: allow, glob: allow, grep: allow, list: allow, bash: git-only, task: deny, todowrite: allow, question: allow, skill: allow, lsp: allow, edit: deny, write: deny, webfetch: allow}
    agents: [orchestrator]
  implementer:
    description: "Full dev access: read/edit/bash/task; write via orchestrator new-file creation"
    permission: {read: allow, edit: allow, glob: allow, grep: allow, list: allow, bash: allow, task: allow, todowrite: allow, question: allow, webfetch: allow, external_directory: allow, skill: allow, lsp: allow, write: deny}
    agents: [gptoss, devstral, gemma, gemma12, qwen-cloud, deepseek-pro, deepseek-pro-direct, deepseek-pro-alibaba, deepseek-flash, deepseek-flash-direct]
  reviewer:
    description: "Read/diff/tests only; no edit/write/bash/task"
    permission: {read: allow, glob: allow, grep: allow, list: allow, todowrite: allow, question: allow, skill: allow, lsp: allow, edit: deny, write: deny, bash: deny, task: deny}
    agents: [reviewer]
  dispatcher:
    description: "Ticket/session ops only; no code tools"
    permission: {todowrite: allow, question: allow, skill: allow, external_directory: allow, lsp: allow}
    agents: []
```

> `write: deny` für Implementer ist absichtlich (Orchestrator erzeugt neue
> Dateien aus Agent-Output — AGENTS.md:41). Reviewer `edit: deny` — Review
> ist read-only, Orchestrator wendet an.

### Step 4 — Sync guard (unverändertes Skript, nur Verifikation)

`bash scripts/opencode-sync-agents.sh` läuft unverändert (merge nur `agent`
Key, `permission` sitzt innerhalb Agent-Objekte). Nach Step 1–3 laufen
lassen und `echo $? == 0` verifizieren.

## Acceptance Criteria

- [ ] `agent-models.jsonc` enthält einen neuen Agent `reviewer` mit
      `permission.edit: deny`, `permission.write: deny`,
      `permission.bash: deny`, `permission.task: deny`.
- [ ] `agents.yaml` hat Top-Level `factory_roles` mit planner/implementer/
      reviewer/dispatcher (5 Zeilen wie oben).
- [ ] `bash scripts/opencode-sync-agents.sh` durchläuft ohne Fehler.
- [ ] `tests/spec/agent-roster.bats` (P4.3b Modell-Drift) grün — neuer Agent
      `reviewer` ist bekannt, `qwen38` unverändert.
- [ ] Keine V1-permission-Lücke: Reviewer kann nicht schreiben.

## Verification

```bash
bash -n .opencode/agent-models.jsonc 2>&1 || node -e "JSON.parse(require('fs').readFileSync('.opencode/agent-models.jsonc','utf8').replace(/\/\/.*/g,'')); console.log('jsonc-parse-ok')"
grep -n '"reviewer"' .opencode/agent-models.jsonc
grep -n 'factory_roles' docs/agent-guide/registry/agents.yaml
bash scripts/opencode-sync-agents.sh && echo SYNC-OK
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
```

## Risks

- V2 per-Agent-`permission` wird ignoriert (falls opencode-global überschreibt)
  → dokumentiert als `risks[]`, Mirror in `agents.yaml` ist die operative
  Referenz für Prompts.
- Reviewer `task: deny` → Reviewer kann keine Subagenten spawnen (gewollt).

## Not in Scope

- **Tests** — p6. This partial has no Failing-Test-Step.
- opencode.jsonc global permission, prompts, AGENTS.md.
