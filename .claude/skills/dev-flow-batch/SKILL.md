---
name: dev-flow-batch
description: >
  Batch-Erstellung von Specs und Implementierungsplänen. Modus 1: alle
  status=planning Tickets parallel verarbeiten. Modus 2: ein großes Feature
  in parallele Sub-Pläne zerlegen. Verwende diesen Skill wenn der User
  mehrere Tickets auf einmal planen will oder ein Feature zu groß für einen
  einzelnen Plan ist.
---

# dev-flow-batch — Batch Spec+Plan-Erstellung

**Sage zu Beginn:** "Ich nutze dev-flow-batch für Batch-Plan-Erstellung."

## Modus-Erkennung

- **Kein Argument** → Modus 1: alle `status=planning` Tickets
- **Pfad zu Spec-Datei** (endet auf `.md`) → Modus 2: Spec splitten
- **Freier Text** (kein `.md`-Pfad) → Modus 2: Feature inline beschreiben

## Schritt −1: Pull-First + Reaper

```bash
git fetch origin main && git pull --rebase origin main
bash scripts/agent-lock.sh reap
```

## Modus 1: Batch aus planning-Tickets

### Schritt 1: Tickets holen

```bash
TICKETS_JSON=$(bash scripts/batch-gap-analysis.sh)
TICKET_COUNT=$(echo "$TICKETS_JSON" | jq 'length')
```

Wenn `TICKET_COUNT == 0`: informiere den User und STOPP.

### Schritt 2: Gap-Analyse (parallel via Agent-Tool)

Spawne für jedes Ticket einen Gap-Analyse-Subagenten parallel. Jeder Subagent bekommt:

**Prompt-Template:**
```
Analysiere dieses Ticket auf Vollständigkeit für das Schreiben einer Spec.

TICKET: <external_id> — <title>
BESCHREIBUNG: <description>

Prüfe ob folgende Informationen vorhanden sind:
1. Ziel klar genug für eine Spec? (ja/nein + was fehlt)
2. Domains erkennbar? (website/db/infra/ops/test/security)
3. Akzeptanzkriterien vorhanden?
4. Abhängigkeiten zu anderen Features?
5. Shared-Changes nötig? (neue Domain, neues Schema-Var, neues ConfigMap-Eintrag)

Gib zurück als JSON:
{
  "ticket_id": "<external_id>",
  "gaps": [{"field": "...", "question": "..."}],
  "can_proceed": true/false,
  "preliminary_domains": ["website"],
  "needs_shared_changes": false
}
```

Schema:
```json
{
  "type": "object",
  "required": ["ticket_id", "gaps", "can_proceed", "preliminary_domains", "needs_shared_changes"],
  "properties": {
    "ticket_id": { "type": "string" },
    "gaps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": { "field": { "type": "string" }, "question": { "type": "string" } }
      }
    },
    "can_proceed": { "type": "boolean" },
    "preliminary_domains": { "type": "array", "items": { "type": "string" } },
    "needs_shared_changes": { "type": "boolean" }
  }
}
```

### Schritt 3: Fragen bündeln und User fragen

Sammle alle Gaps aus allen Ergebnissen. Wenn Gaps vorhanden: präsentiere dem User eine konsolidierte Liste, gruppiert nach Ticket:

```
Ich habe X Tickets mit status=planning gefunden. Bevor ich die Pläne erstelle,
habe ich einige Fragen:

**T000601 — Login-Redesign:**
- Welches Brand ist betroffen? (mentolder / korczewski / beide)
- Wird eine neue Domain benötigt?

**T000602 — Export-Feature:**
- Welches Format: CSV, PDF oder beides?
```

Warte auf Antworten. Speichere Antworten als `docs/superpowers/specs/.gaps/<ticket_id>.md` pro Ticket (erstelle das Verzeichnis falls nötig).

Tickets mit `can_proceed: false` nach der Q&A-Runde (Beschreibung zu vage, keine Antwort gegeben): markiere als SKIPPED — schließe sie aus `TICKETS_JSON` aus.

> **Batch-Klärung:** Pro Ticket die geklärten Q/A mit `scripts/ticket.sh grill --id <ext-id> …`
> ablegen, bevor die Specs/Pläne generiert werden. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.

### Schritt 4: Worktree für Batch anlegen

```bash
BATCH_DATE=$(date +%Y-%m-%d)
BATCH_BRANCH="feature/batch-${BATCH_DATE}-planning"
bash scripts/worktree-create.sh "$BATCH_BRANCH" "/tmp/wt-batch-${BATCH_DATE}"
bash scripts/agent-lock.sh claim branch "$BATCH_BRANCH" \
  --worktree "/tmp/wt-batch-${BATCH_DATE}" --label dev-flow-batch
```

### Schritt 5: Workflow-Script generieren und starten

```bash
SCRIPT_PATH="/tmp/batch-workflow-$(date +%s).mjs"
bash scripts/batch-workflow-gen.sh "$SCRIPT_PATH"
```

Dann starte via Workflow-Tool:
```
Workflow({
  scriptPath: SCRIPT_PATH,
  args: {
    tickets: <TICKETS_JSON als Objekt>,
    gap_context: <Map von ticket_id → Inhalt der .gaps-Datei>,
    repo_root: "/home/patrick/Bachelorprojekt",
    today: <BATCH_DATE>,
    batch_mode: true,                // aktiviert Parallel-Verarbeitung
    apiBalance: 4                    // max. Sub-Features (default 4, max 6)
  }
})
```

### Schritt 6: Ergebnis berichten

Nach Workflow-Abschluss: berichte dem User wie viele Specs+Pläne erfolgreich erstellt wurden, welche übersprungen wurden (SKIPPED), und dass alle fertigen Pläne in der Kommissionierung (`/dev-status`) unter `status=plan_staged` auf Freigabe warten.

---

## Modus 2: Großes Feature splitten

### Schritt 1: Input normalisieren

- Wenn Argument ein `.md`-Pfad: lese Datei ein als `SPEC_CONTENT`
- Wenn freier Text: nutze Text direkt als `FEATURE_DESCRIPTION`

### Schritt 2: Decompose-Subagent

Spawne einen Decompose-Subagenten mit Schema:

```json
{
  "type": "object",
  "required": ["parent_feature", "sub_features"],
  "properties": {
    "parent_feature": { "type": "string" },
    "sub_features": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["slug", "title", "description", "domains", "depends_on", "shared_changes"],
        "properties": {
          "slug":           { "type": "string" },
          "title":          { "type": "string" },
          "description":    { "type": "string" },
          "domains":        { "type": "array", "items": { "type": "string" } },
          "depends_on":     { "type": "array", "items": { "type": "string" } },
          "shared_changes": { "type": "boolean" }
        }
      }
    }
  }
}
```

**Prompt:**
```
Zerlege dieses Feature in unabhängige Sub-Features die parallel implementiert werden können.

FEATURE:
<SPEC_CONTENT oder FEATURE_DESCRIPTION>

Regeln:
- Jedes Sub-Feature muss für sich allein testbar und deploybar sein
- depends_on listet slugs von Sub-Features die zuerst fertig sein müssen
- shared_changes: true wenn das Sub-Feature k3d/configmap-domains.yaml oder
  environments/schema.yaml ändern muss
- Maximal 6 Sub-Features — wenn das Feature größer ist, fasse verwandte Teile zusammen
- Gib einen parent_feature slug (kebab-case, kurz) zurück
```

### Schritt 2.5: (Optional) Nutze pipeline-decompose.js für KI-Zerlegung

Anstatt einen Decompose-Subagenten manuell zu spawne, kann die Factory-Funktion
`decomposeFeature(description, apiBalance)` aus `scripts/factory/pipeline-decompose.cjs`
die Zerlegung plus Datei-Isolierung automatisch durchführen:

```javascript
const D = require('./pipeline-decompose.cjs');
const subFeatures = await D.decomposeFeature(featureDescription, apiBalance);
```

- `apiBalance` (number, default 4, max 6): maximale Anzahl Sub-Features
- Jedes Sub-Feature erhält eine **disjunkte Dateiliste** (kein Overlap)
- Shared files (`configmap-domains.yaml`, `environments/schema.yaml`) werden max. 1 Feature zugewiesen
- Ergibt Zerlegung nur 1 Feature: kein Batch-Modus, direkt single-Feature-Run

### Schritt 3: Sub-Features als Tickets-Array formatieren

Wandle die Sub-Features in das Ticket-Format um das der Workflow erwartet:
```json
[
  {
    "external_id": "sub-<parent>-<slug>",
    "title": "<title>",
    "description": "<description>",
    "brand": "mentolder",
    "priority": "mittel"
  }
]
```

Füge `depends_on` und `parent_feature` in den `gap_context` pro Sub-Feature ein.

### Schritt 4: Workflow starten

Identisch zu Modus 1 Schritt 5 — `batch-workflow-gen.sh` + `Workflow({scriptPath, args})`.

Das `Workflow`-Objekt kann zusätzlich `batch_mode: true` und `apiBalance: <N>` enthalten (siehe Modus 1 Schritt 5). Bei `batch_mode: true` führt `pipeline.js` die Sub-Features parallel aus und überspringt fehlgeschlagene Sub-Features.

---

## Abgrenzung

- Dieser Skill **plant nur** (Spec + Plan) — keine Implementierung, kein Deploy
- Fertige Pläne landen in `status=plan_staged` in der Kommissionierung
- Factory-Übergabe: `/dev-status` → "→ Factory" Knopf, oder:
  `bash scripts/ticket.sh enqueue --id <ext-id> --branch <branch> --plan <plan>`
- **Factory-Integration**: Die Zerlegungs- und Batch-Logik ist in
  `scripts/factory/pipeline-decompose.cjs` (Helper + `assignFiles`) und
  `scripts/factory/pipeline.js` (Batch-Modus) implementiert. Der Skill beschreibt
  das Workflow-Ochestrierungsmuster; die Factory führt es aus.
