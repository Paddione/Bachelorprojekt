---
title: "p2 — Gemeinsamer Kontext-Assembler"
ticket_id: T002420
domains: [factory, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# p2 — Gemeinsamer Kontext-Assembler

**Zieldatei:** `scripts/task-context.sh` (neu, Extension-Limit 500 Zeilen — mit Wachstumsreserve
unter 350 schneiden)

## Zweck

Der eine Kanal, den beide Ausführungspfade aufrufen. Gibt einen Markdown-Block auf stdout aus, den
der Aufrufer vor den Agent-Prompt hängt.

## Task 1: CLI-Kontrakt

```
scripts/task-context.sh <slug> [--partial pX] [--plan-base <ref>]
```

- `--partial pX`: schneidet den Kern auf die `target_files` dieses Partials zu (Manifest aus
  `openspec/changes/<slug>/tasks.md`). Ohne das Flag gilt die Union aller Partials.
- `--plan-base <ref>`: Vergleichsbasis für die Drift-Erkennung. Default ist der Merge-Base des
  aktuellen Branches gegen `origin/main`.

## Task 2: Statischer Kern (hart)

Quelle ist `openspec/changes/<slug>/intel.json`, zugeschnitten über das **bestehende**
`scripts/plan-intel-filter.sh` — dieses Skript wird wiederverwendet, nicht neu geschrieben und
nicht verändert.

Beim Aufruf gilt die dort dokumentierte Argument-Falle: `jq --args` verschluckt Dateiargumente als
Positionals, das Intel-JSON muss deshalb über stdin kommen (`< "$src"`). Der bestehende Aufruf im
Filter ist das Vorbild.

Fehlt `intel.json`, oder verletzt es die Vollständigkeitsregel aus p3, bricht der Assembler mit
Exit 1 ab und schreibt eine Diagnose auf stderr, die die fehlende oder unvollständige Sektion
benennt. Es wird **kein** teilweiser Kontextblock ausgegeben. Kein `|| true`.

## Task 3: Frische Signale (weich, aber sichtbar)

Drei Sektionen, jede einzeln mit 5 s Timeout (derselbe Wert wie `plan-context.sh:154`):

1. **Parallele Arbeit** — `bash scripts/agent-lock.sh list`, gefiltert auf Claims, deren Branch
   eine der eigenen `target_files` berührt.
2. **main-Drift** — `git diff --stat <plan-base>..origin/main -- <target_files>`. Leerer Diff
   ergibt eine kurze Zeile „keine Drift", nicht das Weglassen der Sektion.
3. **Ähnliche Changes** — `GET ${OPENSPEC_SEARCH_URL}/api/openspec/search?q=<slug>&limit=3`, exakt
   der Pfad, den `plan-context.sh:152-163` bereits implementiert. Die Query wird aus dem
   Change-Titel gebildet, nicht aus dem Slug allein.

## Task 4: Sichtbare Degradation

Fällt ein Signal aus (Timeout, Exit ungleich 0, leere Antwort), erscheint an seiner Stelle ein
Marker der Form:

```
> WARN: <signal> nicht erreichbar — <was dadurch unbekannt bleibt>
```

Die Sektion wird **nicht** weggelassen. Der Assembler beendet sich mit 0.

Begründung, die im Skript als Kommentar festgehalten wird: ein Agent, der weiß, dass er blind ist,
verhält sich anders als einer, der Blindheit für Abwesenheit von Gefahr hält. Der Gegenbeleg steht
im selben Repo — `_role_allowlist()` in `plan-context.sh` fällt bei unbekannter Rolle still auf
`__ALL__` zurück und ließ den Rollenfilter bei T002322 wirkungslos werden.

## Task 5: Latenzgrenze

Die drei Signale laufen mit je eigenem Timeout. Der Assembler darf einen Dispatch um höchstens die
Summe dieser Timeouts verzögern. Werden die Abfragen nebenläufig ausgeführt, ist die Grenze
entsprechend niedriger — die obere Schranke muss in jedem Fall gelten und im Test geprüft werden.

## Task 6: Ausgabeformat

Ein Markdown-Block mit stabilen H2-Überschriften, damit Konsumenten und Tests dagegen ankern
können. Keine Brand-Domain-Literale (S3). Der Block beginnt mit einer Kennung, die Slug und
gegebenenfalls Partial nennt, damit im Agent-Transkript erkennbar bleibt, welcher Kontext injiziert
wurde.

## Task 7: Erreichbarkeit (S4)

Taskfile-Eintrag anlegen, damit das Skript nicht als Orphan gilt. Die Aufrufe aus Factory und
`dev-flow-execute` folgen in p3.
