# Batch-Spec/Plan-Erstellung — Design

## Ziel

Ein neuer Skill `dev-flow-batch` ermöglicht die parallele Erstellung von Specs und Implementierungsplänen — entweder für mehrere unabhängige Tickets auf einmal (Modus 1) oder für ein einzelnes großes Feature das in mehrere kontext-gerechte Sub-Pläne gesplittet wird (Modus 2). Die Orchestrierung läuft über das `Workflow`-Tool, das parallele Subagenten, Phasen-Splitting und Fehler-Isolation bereits eingebaut hat.

---

## Zwei Modi

### Modus 1 — Batch aus `status=planning` Tickets

Alle Tickets mit `status=planning` werden automatisch abgeholt, auf Informationslücken analysiert, und dann parallel von Subagenten zu Spec+Plan verarbeitet.

### Modus 2 — Großes Feature splitten

Eine große Feature-Beschreibung oder Spec-Datei wird von einem Decompose-Agenten in unabhängige Sub-Features zerlegt. Jedes Sub-Feature bekommt seine eigene Spec+Plan. Der resultierende Dependency-Graph steuert die Ausführungsreihenfolge — parallel wo möglich.

---

## Invokation

```bash
# Modus 1 — alle planning-Tickets
/dev-flow-batch

# Modus 2 — bestehende Spec splitten
/dev-flow-batch docs/superpowers/specs/2026-06-10-big-feature-design.md

# Modus 2 — Feature inline beschreiben
/dev-flow-batch "Baue ein vollständiges Notification-System mit DB, API, UI und Push"
```

---

## Architektur

### Komponenten

| Komponente | Verantwortung |
|---|---|
| `dev-flow-batch` Skill | Entry-Point, Modus-Erkennung, Gap-Analyse orchestrieren, Workflow-Script generieren und starten |
| Gap-Analyse-Agent (pro Ticket, parallel) | Ticket-Beschreibung auf Vollständigkeit prüfen, strukturiertes Gap-JSON zurückgeben |
| Decompose-Agent (Modus 2) | Große Spec in Sub-Features mit Dependency-Graph zerlegen |
| Generiertes Workflow-Script | Dreiphasiger Ablauf: Isolated → Shared → Stage |
| `plan-frontmatter-hook.sh` (erweitert) | Neue Batch-Felder setzen wenn nicht vorhanden |

### Dreiphasiger Workflow

**Phase 1 — Isolated** (parallel, `pipeline()`):
- Jeder Subagent bearbeitet genau ein Ticket / Sub-Feature
- Schreibt Spec-Datei nach `docs/superpowers/specs/`
- Schreibt Plan-Datei nach `docs/superpowers/plans/`
- Legt Worktree an via `scripts/worktree-create.sh`
- Committet und pusht auf Feature-Branch
- Berührt **keine** geteilten Dateien

**Phase 2 — Shared** (serialisiert, `for`-Loop):
- Nur Pläne mit `shared_changes: true` landen hier
- Pro Plan: ein Subagent trägt Einträge in `k3d/configmap-domains.yaml`, `environments/schema.yaml` o.ä. ein
- Serialisiert durch einfaches `await` in Folge — kein paralleles Schreiben auf geteilte Dateien

**Phase 3 — Stage** (parallel, `parallel()`):
- DB-Updates: `ticket.sh stage-plan` pro Ticket
- Ticket-Status auf `plan_staged` setzen
- `batch_id` in Ticket-Kommentar schreiben

---

## Konflikt-Prävention

### file_locks — Feature-eigene Dateien

Jeder Plan deklariert in seinem Frontmatter welche Dateien er exklusiv beschreibt:

```yaml
file_locks:
  - website/src/components/Foo.svelte
  - website/src/pages/foo.astro
```

Der Batch-Orchestrator prüft vor dem Start auf Überschneidungen zwischen Plänen. Bei Konflikt: die betroffenen Pläne werden in der Isolated-Phase **gestaffelt** (nicht abgebrochen) — der zweite startet erst wenn der erste committed hat.

### shared_changes — Globale Dateien

Bekannte globale Shared-Files:
- `k3d/configmap-domains.yaml`
- `environments/schema.yaml`
- `k3d/kustomization.yaml`

Pläne die diese Dateien ändern müssen setzen `shared_changes: true`. Sie erhalten in der Isolated-Phase **keinen** Auftrag diese Dateien zu ändern — das geschieht ausschließlich in der serialisierten Shared-Phase.

---

## Neues Plan-Frontmatter Schema

```yaml
---
title: Feature XY
ticket_id: T000123
domains: [website, db]
status: active
pr_number: null
# Batch-Felder (von plan-frontmatter-hook.sh gesetzt, optional)
file_locks: []                    # Feature-eigene exklusive Dateien
shared_changes: false             # true = braucht Shared-Phase
batch_id: batch-2026-06-10-abc    # Batch-Zugehörigkeit
# Nur Modus 2
parent_feature: null              # Slug des übergeordneten Features
depends_on_plans: []              # Slugs der Vorgänger-Sub-Pläne
---
```

`plan-frontmatter-hook.sh` wird um Case C erweitert: fehlende Batch-Felder werden mit sicheren Defaults ergänzt. Bestehende Pläne ohne diese Felder bleiben unverändert kompatibel.

---

## Gap-Analyse (Modus 1 Detail)

### Gap-Agent pro Ticket

Läuft parallel für alle `status=planning` Tickets. Prüft die Ticket-Beschreibung auf:

- Ziel klar genug für Spec-Schreiben?
- Domains erkennbar (website / db / infra / ops / test / security)?
- Abhängigkeiten zu anderen Tickets?
- Shared-Changes nötig (neue Domain, neues Schema-Var)?
- Akzeptanzkriterien vorhanden?

Gibt zurück: `{ ticket_id, gaps: [{ field, question }], can_proceed: bool }`

### Fragen-Bündelung

Alle Gaps aller Tickets werden zu **einer einzigen konsolidierten Frageliste** zusammengeführt, gruppiert nach Ticket. Der User beantwortet alles auf einmal. Antworten werden als Kontext-Datei `docs/superpowers/specs/.gaps/<ticket_id>.md` gespeichert und dem jeweiligen Subagenten mitgegeben.

Tickets ohne Gaps gehen direkt in den Workflow. Tickets bei denen nach der Q&A-Runde `can_proceed: false` bleibt (Beschreibung noch immer zu vage) werden übersprungen — `log()` im Workflow-Script zeigt sie als `SKIPPED` mit Begründung.

---

## Decompose-Agent (Modus 2 Detail)

### Input

Entweder: Pfad zu einer bestehenden Spec-Datei, oder: freie Feature-Beschreibung als String.

### Output Schema (`DECOMPOSE_SCHEMA`)

```json
{
  "parent_feature": "big-feature-slug",
  "sub_features": [
    {
      "slug": "db-schema",
      "title": "Datenbankschema",
      "description": "...",
      "domains": ["db"],
      "depends_on": [],
      "shared_changes": true,
      "file_locks": []
    }
  ]
}
```

### Dependency-Auflösung

Der Orchestrator topologisch sortiert die Sub-Features. Unabhängige Sub-Features laufen in derselben `pipeline()`-Runde. Sub-Features mit `depends_on` starten erst nachdem alle genannten Vorgänger committed+gepusht sind.

---

## Fehlerbehandlung

- Ein fehlgeschlagener Subagent in der Isolated-Phase gibt `null` zurück — `.filter(Boolean)` überspringt ihn in Shared- und Stage-Phase
- `log()` im Workflow-Script zeigt welche Tickets erfolgreich / übersprungen wurden
- Teilweise abgeschlossene Batches sind kein Problem: die fertigen Pläne liegen in der Kommissionierung, fehlgeschlagene können einzeln nachgeholt werden
- Worktrees fehlgeschlagener Agenten werden von `scripts/agent-lock.sh reap` aufgeräumt

---

## Testing

| Test | Art | Was geprüft wird |
|---|---|---|
| `test/batch/gap-agent.bats` | BATS offline | Gap-Agent gibt korrektes JSON bei lückenhafter Beschreibung |
| `test/batch/frontmatter-batch.bats` | BATS offline | `plan-frontmatter-hook.sh` setzt Batch-Felder korrekt |
| `test/batch/conflict-detection.bats` | BATS offline | Überschneidende `file_locks` werden erkannt und gestaffelt |
| `test/batch/decompose-schema.bats` | BATS offline | Decompose-Schema-Validierung |
| FA-BATCH-01 | BATS offline | Workflow-Script syntaktisch valide (node --check) |

---

## Dateien die neu entstehen

| Datei | Zweck |
|---|---|
| `.claude/skills/dev-flow-batch/SKILL.md` | Neuer Skill (Entry-Point) |
| `scripts/batch-gap-analysis.sh` | Gap-Agent Prompt-Vorlage + Aufruf-Helper |
| `scripts/batch-workflow-gen.sh` | Workflow-Script dynamisch generieren (schreibt nach `/tmp/batch-workflow-<id>.mjs`, wird via `Workflow({scriptPath})` gestartet) |
| `scripts/plan-frontmatter-hook.sh` | Erweitert um Batch-Felder (Case C Erweiterung) |
| `docs/superpowers/specs/.gaps/` | Kontext-Dateien aus Gap-Beantwortung (gitignored via `.gitignore` Eintrag `docs/superpowers/specs/.gaps/`) |
| `tests/batch/` | Neue BATS-Tests |

---

## Abgrenzung

- `dev-flow-batch` **plant** nur (Spec + Plan) — es startet keine Implementierung
- Die fertigen Pläne landen in der Kommissionierung (`status=plan_staged`) und warten auf manuelle Freigabe oder Factory-Übergabe — genau wie bei `dev-flow-plan`
- Die Factory kann Batch-Pläne einzeln oder als Gruppe abarbeiten — `batch_id` macht die Zugehörigkeit sichtbar
- Brainstorming (interaktiver Companion-Dialog) ist **nicht** Teil von `dev-flow-batch` — die Ticket-Beschreibung ist die Spec-Quelle; wer brainstormen will nutzt weiterhin `dev-flow-plan`
