# Proposal: Feature Intake + Knowledge-Graph-Anreicherung

_Ticket: NEW_

## Why

Der Feature Intake Skill (`.claude/skills/feature-intake/SKILL.md`) hat zwei schwache Stellen:

1. **Duplikatcheck ist oberflächlich** — Modus B und D vergleichen neue Feature-Ideen nur anhand von
   Titel-Strings gegen die letzten 60 offenen Tickets. Eine Idee die "Chat-Reaktionen" heißt wird
   nicht mit einem bestehenden Ticket "Emoji-Feedback im Messaging" assoziiert.

2. **Feature-Pool ist statisch hardcoded** — Modus D (GekkoMode) zeigt ~60 fest eingebaute
   Feature-Vorschläge als Karten. Diese Liste wächst nicht mit dem Projekt mit und spiegelt nicht
   wider, was bereits als Spec/Plan dokumentiert ist.

Die Plattform betreibt bereits eine pgvector-Wissensbank mit einer `'Specs & Plans'`-Collection
(`knowledge.source = 'specs_plans'`), in der alle OpenSpec-Proposals und CLAUDE.md via
`task knowledge:reindex SOURCE=markdown` indiziert sind. Dieser Datenschatz wird vom Feature Intake
bisher nicht genutzt.

## What

### Verbesserung 1: Semantischer Duplikatcheck

Vor jeder Ticket-Erstellung in Modus B und D wird `task knowledge:search` aufgerufen —
ein neuer Taskfile-Task, der intern `scripts/knowledge/search-similar.mjs` (neues Script) ausführt:
1. Port-forward `svc/shared-db → localhost:5432`
2. `VOYAGE_API_KEY` aus Cluster-Secret lesen
3. Query-Text per Voyage API einbetten (Modell: `voyage-multilingual-2`)
4. pgvector `<=>` Cosine-Similarity gegen `knowledge.chunks` der `specs_plans`-Collection
5. Ausgabe: JSON-Array `[{title, score, snippet, source_uri}]`, Threshold 0.65

Im SKILL.md: Der Check läuft nach dem Titel-Vergleich. Bei Score ≥ 0.80 wird die Erstellung
blockiert ("Duplikat wahrscheinlich — Ticket XYZ zu 85% ähnlich"). Bei 0.65–0.80 erscheint ein
Advisory ("Ähnliche Spec gefunden, trotzdem anlegen?"). Unter 0.65 → kein Hinweis.

### Verbesserung 2: Dynamischer Feature-Pool aus Specs

In Modus D Schritt 1 wird eine zusätzliche SQL-Abfrage gegen `knowledge.documents` ausgeführt
(ohne Embedding, kein API-Call nötig):

```sql
SELECT d.title, left(kc.text, 300), d.source_uri
FROM knowledge.documents d
JOIN knowledge.collections c ON c.id = d.collection_id
JOIN knowledge.chunks kc ON kc.document_id = d.id AND kc.position = 0
WHERE c.source = 'specs_plans'
  AND d.source_uri LIKE 'file:openspec/changes/%/proposal.md'
ORDER BY d.created_at DESC
LIMIT 30;
```

Das erste Chunk jedes Proposal-Dokuments enthält Titel und Kern-Why. Diese werden als
`SPEC_POOL`-Variable in Schritt 2 (Block 1 der HTML-Form) als dritte Karten-Gruppe
"Aus eigenen Specs" eingefügt — zusätzlich zu den ~60 hardcodierten Einträgen, nicht als Ersatz.
Die hardcodierten Einträge bleiben als Baseline für Projekte ohne indizierte Specs.

### Neue Artefakte

- **`scripts/knowledge/search-similar.mjs`** — CLI-Searcher, nutzt `lib-knowledge-pg.mjs`-Stack
- **Taskfile.yml** — `knowledge:search`-Task (parallel zu `knowledge:reindex`-Pattern)
- **`.claude/skills/feature-intake/SKILL.md`** — Modus B + D erweitert

### GIVEN / WHEN / THEN

**GIVEN** eine Feature-Idee "Chat-Benachrichtigungen per Push" wird in Modus D eingegeben  
**WHEN** Schritt 4 der GekkoMode-Verarbeitung läuft  
**THEN** zeigt `task knowledge:search QUERY="Chat Benachrichtigungen Push" SOURCE=specs_plans` an,
ob bereits eine Spec wie "push-notification-pwa" mit Score > 0.65 existiert —
und der Skill schlägt vor, das Ticket mit dem bestehenden Spec zu verknüpfen statt ein Duplikat anzulegen.

**GIVEN** keine Specs sind in der Collection indiziert  
**WHEN** Modus D Schritt 1 läuft  
**THEN** ist `SPEC_POOL` leer, die HTML-Form zeigt nur die 60 hardcodierten Einträge (graceful fallback).

**GIVEN** `VOYAGE_API_KEY` fehlt im Cluster-Secret  
**WHEN** `task knowledge:search` läuft  
**THEN** gibt es einen klaren Fehler mit Hinweis, und der SKILL.md-Schritt fährt ohne
semantischen Check fort (Advisory: "Semantischer Check übersprungen — VOYAGE_API_KEY fehlt").
