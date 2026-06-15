---
ticket_id: T000724
spec_ref: docs/superpowers/specs/2026-06-14-plan-qualitaets-check.md
status: active
date: 2026-06-14
domains: [skills, scripts]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: T000724 — Plan-Qualitäts-Check: DeepSeek bewertet Plan-Vollständigkeit nach dev-flow-plan

## Ziel

Automatischer DeepSeek-QA-Schritt nach der Plan-Erstellung in `dev-flow-plan`: Das neue
Bash-Skript `scripts/plan-qa-check.sh` lässt DeepSeek den Plan gegen eine 4-Punkte-Checkliste
prüfen und schreibt bei Lücken direkt fehlende Abschnitte in die Plan-Datei (Auto-Fix-Loop,
max. 2 Iterationen). Der Check ist advisory (bei fehlendem API-Key: Warnung + Exit 0).

## Zeilenlimits (S1-Budget)

| Datei | Ist | Geplante Änderung | Nach Änderung | Limit | Budget |
|-------|-----|-------------------|---------------|-------|--------|
| `.claude/skills/dev-flow-plan/SKILL.md` | 258 | +15 (Schritt zw. 3.7 und 4) | ~273 | 500 (`.md` nicht gecheckt) | — |
| `Taskfile.yml` | 4500 | +10 (`plan:qa`-Task) | ~4510 | nicht-baselined `.yml` → kein S1-Gate | — |
| `scripts/plan-qa-check.sh` | **neu** | ~200 Z | ~200 | 500 (`.sh`) — OK | +300 Reserve |

Neue Datei `scripts/plan-qa-check.sh` wird so geschnitten, dass sie deutlich unter 300 Zeilen
bleibt (Kernlogik: curl-Aufruf + Auto-Fix-Loop + Backup/Restore bei kaputtem Frontmatter).

---

## Tasks

### Task A — DeepSeek-Aufrufmechanismus klären [✓]

**Ziel:** Bestätigen, wie das neue Bash-Skript DeepSeek erreicht.

**Recherche (erledigt im Plan-Schritt):**
- `scripts/factory/ci-review.mjs` nutzt `@anthropic-ai/sdk` mit
  `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` + `ANTHROPIC_API_KEY`.
- `environments/.secrets/deepseek.sh` exportiert `ANTHROPIC_AUTH_TOKEN` (= DeepSeek-Key)
  und `ANTHROPIC_BASE_URL`.
- Für ein **Bash-Skript** wird `curl` genutzt (kein npm-Dependency):
  ```
  POST https://api.deepseek.com/anthropic/v1/messages
  Headers: x-api-key: $DEEPSEEK_API_KEY  (oder ANTHROPIC_API_KEY)
           anthropic-version: 2023-06-01
           content-type: application/json
  Body: {"model":"deepseek-chat","max_tokens":2048,"messages":[...]}
  ```
- Fallback bei fehlendem Key: Warnung, Exit 0 (advisory).

**Dateien:** keine Codeänderung — reine Recherche; Ergebnis fließt direkt in Task B ein.

---

### Task B — Qualitätskriterien-Checklist als Prompt definieren [✓]

**Ziel:** Den System-Prompt für DeepSeek als Here-Doc im Skript festlegen.

**Inhalt des Prompts (4 Kriterien):**
1. Konkrete Dateipfade in jedem Task (keine vagen Formulierungen ohne Pfad).
2. Mindestens ein konkreter Testplan-Schritt (BATS/Vitest/Playwright oder Verifikationskommando).
3. Keine offenen Platzhalter: `TODO`, `TBD`, `FIXME`, `???`, `<ausfüllen>`.
4. S1-Budget pro geänderter Datei (Kommentar `Ist X · Baseline Y → Budget Z`) oder
   explizite Markierung als neue Datei.
5. Letzter Task enthält `task test:all`, `task freshness:regenerate`, `task freshness:check`.

**Output-Format:** DeepSeek gibt JSON zurück:
```json
{
  "verdict": "PASS" | "FAIL",
  "missing": ["Beschreibung Lücke 1", "..."],
  "suggestions": "Markdown-Text mit Ergänzungsvorschlägen (bei FAIL)"
}
```

**Dateien:** Prompt wird als eingebettetes Here-Doc in `scripts/plan-qa-check.sh` definiert
(kein separates Prompt-File, da das Skript standalone bleiben soll).

---

### Task C — `scripts/plan-qa-check.sh` schreiben [✓]

**Datei:** `scripts/plan-qa-check.sh` (neu, ~200 Z, Limit 500 — Budget +300)

**Logik:**
```
1. Argument: $1 = Plan-Datei-Pfad (absolut oder relativ zum Repo-Root)
2. Prüfen: Datei existiert, hat >10 Zeilen, hat YAML-Frontmatter (---…---)
3. API-Key prüfen: ANTHROPIC_API_KEY oder DEEPSEEK_API_KEY (beide akzeptieren)
   → kein Key: warn + exit 0 (advisory)
4. Backup der Plan-Datei anlegen (/tmp/plan-qa-backup-<hash>.md)
5. AUTO-FIX-LOOP (max. 2 Iterationen):
   a. curl → DeepSeek → JSON-Response parsen (verdict, missing, suggestions)
   b. Bei PASS: Backup löschen, "PASS" ausgeben, exit 0
   c. Bei FAIL (Iteration < 2):
      - suggestions-Text an Plan-Datei anhängen (als neuer Abschnitt "## QA-Ergänzungen")
      - Frontmatter-Integrität prüfen (grep "^---"); bei Verlust → Backup restore + exit 1
      - Iteration +1, erneuter Check
   d. Bei FAIL nach Iteration 2: Backup wiederherstellen (falls Frontmatter beschädigt),
      "FAIL" + Liste der missing-Punkte ausgeben, exit 1
6. Exit 0 = PASS, Exit 1 = FAIL oder Fehler
```

**Umgebungsvariablen (Priorität):**
- `DEEPSEEK_API_KEY` → direkt als DeepSeek-Key
- `ANTHROPIC_API_KEY` → Fallback (wird auch akzeptiert, wenn ANTHROPIC_BASE_URL gesetzt)
- `DEEPSEEK_BASE_URL` → Default `https://api.deepseek.com/anthropic`

Das Skript sourcet **nicht** `environments/.secrets/deepseek.sh` automatisch (secrets sind
gitignored und nicht in CI verfügbar) — der Aufrufer muss die Variablen setzen.

**Shebang + Permissions:** `#!/usr/bin/env bash`, `set -euo pipefail`, `chmod +x` im selben
Commit.

---

### Task D — `dev-flow-plan/SKILL.md` erweitern [✓]

**Datei:** `.claude/skills/dev-flow-plan/SKILL.md` (258 Z → ~273 Z, kein S1-Gate für .md)

**Änderung:** Zwischen Schritt 3.7 (Plan-Subagent) und Schritt 4 (Plan prüfen & übernehmen)
einen neuen Schritt 3.8 einfügen:

```markdown
### Schritt 3.8: Plan-Qualitäts-Check (DeepSeek QA)

Führe den automatischen QA-Check auf den Plan-Pfad aus, den der Subagent zurückgegeben hat:

```bash
bash scripts/plan-qa-check.sh docs/superpowers/plans/<date>-<slug>.md
```

- **PASS (Exit 0):** Weiter zu Schritt 4.
- **FAIL (Exit 1):** DeepSeek hat bis zu 2 Auto-Fix-Versuche unternommen. Lies die
  Fehlermeldung (konkrete Lücken), delegiere erneut an einen Plan-Subagenten (Schritt 3.7)
  mit den fehlenden Punkten als Korrektur-Hinweis — oder bessere den Plan manuell nach.
- **Kein API-Key (Exit 0 + Warnung):** Advisory — QA wurde übersprungen. Weiter zu Schritt 4,
  aber prüfe den Plan manuell gegen `.claude/skills/references/plan-quality-gates.md`.
```
```

---

### Task E — `task plan:qa` in Taskfile eintragen (S4-Gate) [✓]

**Datei:** `Taskfile.yml` (4500 Z → ~4510 Z, kein S1-Gate für `.yml`)

**Neuer Task** im Bereich der `quality:*`-Tasks (nach `quality:loop:`):

```yaml
  plan:qa:
    desc: "DeepSeek-QA-Check für einen Implementierungsplan (PLAN=<pfad>)"
    vars:
      PLAN: '{{.PLAN | default ""}}'
    cmds:
      - |
        if [[ -z "{{.PLAN}}" ]]; then
          echo "Usage: task plan:qa PLAN=docs/superpowers/plans/<file>.md" >&2
          exit 1
        fi
        bash scripts/plan-qa-check.sh "{{.PLAN}}"
```

Damit ist das Skript über `task plan:qa PLAN=<pfad>` aufrufbar (S4-Gate: Taskfile-Eintrag
als Erreichbarkeitspunkt aus dem Dev-Workflow heraus).

---

### Task F — Verifikation

**Schritte:**

```bash
# 1. Smoke-Test des Skripts mit einem Dummy-Plan (kein API-Key → advisory PASS)
echo "---\nticket_id: T000724\n---\n# Test Plan\n\n## Tasks\n\n### Task 1\nAufgabe ohne Pfad.\n" \
  > /tmp/test-plan-dummy.md
# Ohne Key: soll mit Exit 0 + Warnung laufen
unset DEEPSEEK_API_KEY ANTHROPIC_API_KEY
bash scripts/plan-qa-check.sh /tmp/test-plan-dummy.md

# 2. Lint/Typecheck (Bash-Skript hat kein TS-Check, aber shellcheck falls verfügbar)
shellcheck scripts/plan-qa-check.sh 2>/dev/null || true

# 3. Vollständige CI-Suite
task test:all
task freshness:regenerate
task freshness:check
```

**Dateien:** kein neues Test-File (das Skript ist advisory/external-API-dependent, kein
sinnvoller Offline-Unit-Test); Smoke-Test im Task selbst ausreichend.

---

## Abhängigkeiten zwischen Tasks

```
A (Recherche) → B (Prompt) → C (Skript schreiben)
                              C → D (SKILL.md erweitern)
                              C → E (Taskfile)
                              C, D, E → F (Verifikation)
```

Tasks A und B können inline gelöst werden (Recherche ist in diesem Plan bereits abgeschlossen).
Tasks C, D, E sind parallelisierbar. F erst nach C+D+E.
