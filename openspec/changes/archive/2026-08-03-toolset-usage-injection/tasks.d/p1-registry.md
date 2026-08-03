---
title: "p1 registry — capabilities.yaml um Nutzungssemantik erweitern und befüllen"
ticket_id: T002592
domains: [infra]
status: active
---

# p1 registry — capabilities.yaml

**Besitzt ausschließlich:** `docs/agent-guide/registry/capabilities.yaml`

**Kontrakt:** `openspec/changes/toolset-usage-injection/CONTRACT.md` — §1 (Schema), §2 (Rollen).
Feldnamen, Rollen-Vokabular und Tier-Enum sind dort eingefroren und dürfen hier nicht abweichen.

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `docs/agent-guide/registry/capabilities.yaml` | 71 | — (nicht S1-gegatet) |

`docs/` steht nicht unter `scan.code_roots` in `docs/code-quality/gates.yaml`; die Datei liegt
außerhalb der S1-Scan-Universe (belegt durch `grep -c '"docs/agent-guide' repo-index.json` → 0).
Es gibt kein Zeilenbudget. Erwarteter Endumfang ≈ 600–700 Zeilen bei 88 Instanzen.

## Aufgaben

- [ ] **Kopfkommentar erweitern.** Die drei Kommentarzeilen am Dateikopf um eine Kurzfassung des
      Schemas ergänzen: welche Felder es gibt, welche bei `state: canonical` Pflicht sind
      (`use_when`, `roles`), und dass `check.mjs` das erzwingt. Verweis auf CONTRACT.md §1.

- [ ] **Bestandsinstanzen um Nutzungsfelder ergänzen (15 Stück).** Die heute gelisteten Einträge
      behalten `state` und `reason` unverändert. Jede `canonical`-Instanz bekommt `use_when` und
      `roles`; `avoid_when`, `fallback`, `tier`, `deep_ref` wo sinnvoll.

      Quelle für `use_when`/`avoid_when`/`fallback` der MCP-Server ist
      `.claude/skills/references/mcp-tool-guide.md` — pro Server existiert dort ein Abschnitt
      **Tools · Wann bevorzugen · Fallback**, dessen Kernaussage in je eine Zeile ≤ 120 Zeichen
      verdichtet wird. Die Datei wird **nur gelesen**, nicht geändert (CONTRACT §6).

      Rollenzuordnung folgt der Routing-Tabelle in `CLAUDE.md` („Agent Routing"):
      `mcp-kubernetes` → ops + infra, `mcp-postgres` → db, `ticket-mcp` → test + db +
      orchestrator, `factory-mcp` → test + orchestrator, `codebase-memory-mcp` → `all`,
      `bge-mcp` → orchestrator.

      Für `suppressed`-Instanzen ändert sich nichts — sie brauchen weiterhin nur `reason`
      (CONTRACT §1, Spec-Szenario „Suppressed instance needs no usage semantics").

- [ ] **Kind `plugin:` aufnehmen (36 Instanzen).** Die Schlüssel aus `enabledPlugins` in
      `.claude/settings.json` als Instanzen mit voller Id inklusive `@marketplace` aufnehmen
      (CONTRACT §5). Der aktuelle Schaltzustand ist die Kurationsvorlage, nicht das Ergebnis:
      die 22 auf `true` stehenden werden `canonical` oder `allowed`, die 14 auf `false`
      stehenden `suppressed` **mit Grund** — ein `suppressed` ohne `reason` lässt `check.mjs`
      schon heute fallen.

      Capabilities werden fachlich benannt, nicht nach dem Plugin: `frontend-design` und
      `ui-ux-pro-max` gehören unter eine Capability `ui-design`, `code-review` und
      `pr-review-toolkit` unter `code-review`, `typescript-lsp` und `pyright-lsp` unter
      `lsp-symbol-lookup`. Genau diese Bündelung macht die Invariante „max. 1 canonical je
      Capability" nützlich — sie zwingt zur Entscheidung zwischen konkurrierenden Anbietern.

      Wo mehrere Plugins dieselbe Capability liefern und keine Entscheidung getroffen werden
      kann, ohne zu raten: `state: unreviewed` setzen und im `reason` festhalten, was zu klären
      ist. `unreviewed` bricht CI nicht und ist der ehrliche Zustand — ein geratenes `canonical`
      wäre eine Kuration, die nicht stattgefunden hat.

- [ ] **Kind `skill:` aufnehmen (30 Instanzen).** Aus `.claude/skills/*/SKILL.md` (ohne
      `OVERVIEW.md`, das kein Skill ist). `use_when` wird aus dem `description:`-Frontmatter
      verdichtet — dort steht bereits die Trigger-Beschreibung. `avoid_when` aus den
      Abgrenzungssätzen der Beschreibungen, die diese Skills durchgängig führen (Beispiel
      `dev-flow-chore`: „If the change alters what the software does, stop and use
      dev-flow-plan"). `deep_ref` zeigt auf `.claude/skills/<name>/SKILL.md`.

      Rollen: die `dev-flow-*`-Skills und `git-workflow` → `orchestrator`; `website-specialist`
      → website; `database-specialist` → db; `security-specialist` → security; `infra-ops`,
      `gitops-*` → infra; `incident-response`, `repo-hygiene` → ops; `vitest` → test.

- [ ] **Kind `cli:` aufnehmen.** Mindestens `cli:gh-axi` (Bestand, bleibt canonical für
      `github`), `cli:task` (Task-Orakel-Pfad, `bash scripts/vda.sh oracle`), `cli:kubectl`
      (Fallback für alle Cluster-Mutationen, `tier: dangerous`), `cli:psql-via-kubectl`
      (sanktionierter Write-Pfad für DDL/Superuser, `tier: dangerous`) und `cli:ticket.sh`
      (Worktree-tauglicher Fallback zu `ticket-mcp`).

      Für `cli:gh-axi` ist `avoid_when` leer und `use_when` absolut zu formulieren — `gh-axi` ist
      der mandatierte GitHub-Pfad, `gh` selbst wird als konkurrierende Instanz `suppressed` mit
      genau dieser Begründung aufgenommen, damit der injizierte Block die Regel trägt statt sie
      nur in CLAUDE.md stehen zu lassen.

- [ ] **Kind `agent:` aufnehmen (6 Instanzen).** Aus `docs/agent-guide/registry/tools.yaml`
      (`kind: agent`). `use_when` aus `what_for_de`, `tier` aus dem dortigen `danger`-Wert
      (`safe`→`safe`, `caution`→`caution`, `assisted`→`assisted`), `roles` ist jeweils
      `[orchestrator]` — nur der Orchestrator dispatcht Agenten, ein Subagent nicht.

- [ ] **Selbstprüfung.** `node -e "require('js-yaml').load(require('fs').readFileSync('docs/agent-guide/registry/capabilities.yaml','utf8'))"`
      muss fehlerfrei durchlaufen (reine YAML-Wohlgeformtheit; die inhaltliche Prüfung ist p2).
      Danach `node scripts/toolset/check.mjs` — solange p2 noch nicht gemerged ist, prüft es nur
      die Bestandsregeln und muss weiterhin Exit 0 liefern.
