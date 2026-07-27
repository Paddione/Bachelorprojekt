---
title: "mishap-t002262 — Implementation Plan"
ticket_id: T002262
domains: [infra, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002262 — Implementation Plan

_Ticket: T002262 — Mishap-Bundle aus der Session vom 2026-07-27 (zwei Befunde)._

Beide Befunde sind Reibung in der Werkzeugkette: eine fehlende Scope-Erlaubnis
und eine irreführend dokumentierte Befehlsreihenfolge. Beide kosten pro Vorkommen
einen fehlgeschlagenen Versuch, den vorher niemand sehen konnte.

## File Structure

| Datei | Rolle in diesem Plan |
|---|---|
| `scripts/validate-commit-msg.sh` | Befund 1: Scope `llm` in die Allowlist aufnehmen |
| `.claude/skills/references/verification-block.md` | Befund 2: Artefakt-Commit als eigener Schritt zwischen `regenerate` und `check` |
| `tests/spec/t001356-git02-conventional-commit.bats` | Guard für Befund 1 (bestehende Suite zu Conventional Commits) |
| `tests/unit/verification-block-order.bats` | Guard für Befund 2 (neu, nicht ticketnummeriert — siehe BATS-Konvention) |

## Task 1 — RED: Guards schreiben, die auf dem aktuellen Stand fehlschlagen

1. In `tests/spec/t001356-git02-conventional-commit.bats`: ein `@test`, der
   `bash scripts/validate-commit-msg.sh scopes` aufruft und `llm` in der Ausgabe
   erwartet. Zusätzlich positiv prüfen, dass eine Nachricht der Form
   `chore(llm): beispiel [T000000]` akzeptiert wird.
2. Neue Datei `tests/unit/verification-block-order.bats`: ein `@test`, der in
   `.claude/skills/references/verification-block.md` verlangt, dass zwischen
   `task freshness:regenerate` und `task freshness:check` ein Commit-Schritt für
   die generierten Artefakte steht. Prüfbar als Reihenfolge-Vergleich über die
   Zeilennummern der drei Marker.

Beide laufen lassen — sie müssen rot sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats
tests/unit/lib/bats-core/bin/bats tests/unit/verification-block-order.bats
# expected: FAIL — beide Guards sind rot, die Fixes fehlen noch
```

## Task 2 — Befund 1: Commit-Scope `llm` fehlt in der Allowlist

`chore(llm): …` wird vom commit-msg-Hook mit `unknown scope 'llm'` abgelehnt. Die
Allowlist (`bash scripts/validate-commit-msg.sh scopes`) enthält 30 Scopes
inklusive `brain`, `ops`, `infra` und `scripts` — aber kein `llm`.

Das Verzeichnis `scripts/llm/` existiert und beherbergt inzwischen die
Startskripte für Embedding-, Rerank-, Bonsai- und gpt-oss-Server, die
Scheduled-Task-Registrierung und die Äquivalenzmessung. LLM-Infrastruktur ist
damit ein eigener, wachsender Bereich ohne passenden Scope; Commits landen
ersatzweise unter `scripts` oder `infra`, was die Zuordnung verwässert.

Beobachtet am 2026-07-27 bei T002258: der erste Commit-Versuch scheiterte, der
Scope wurde auf `scripts` geändert. Der Hook nennt den Weg zur Scope-Liste erst
**nach** dem Fehlschlag.

Fix: `llm` in die Allowlist aufnehmen.

## Task 3 — Befund 2: `verification-block` legt die falsche Reihenfolge nahe

Der Verify-Block listet die vier Befehle als Sequenz mit
`task freshness:regenerate` direkt vor `task freshness:check`. Genau so
ausgeführt ist `check` **rot**, sobald `regenerate` ein Artefakt geändert hat:
der Check vergleicht gegen `HEAD`, das regenerierte Artefakt liegt aber nur im
Working Tree.

Beobachtet am 2026-07-27 mit `docs/code-quality/repo-index.json` — `file_count`
sank von 548 auf 546, nachdem zwei Dateien gelöscht wurden, und der Check meldete
`docs/code-quality/repo-index.json is stale`. Besonders irritierend ist das Wort
„stale", obwohl das Artefakt auf Platte längst frisch war.

Der Abschnitt „Freshness-Artefakte — git add nach `regenerate`" weiter unten in
derselben Datei beschreibt es korrekt. Die Vier-Befehle-Liste oben widerspricht
dem implizit, und die Liste ist das, was gelesen wird.

Fix: in der Vier-Befehle-Liste einen expliziten Zwischenschritt aufnehmen —
`git add <artefakte>` plus Commit zwischen `regenerate` und `check` — oder `check`
mit dem Hinweis annotieren, dass er nach dem Commit der Artefakte läuft. Der
untere Abschnitt bleibt die ausführliche Referenz und wird verlinkt statt
dupliziert.

## Task 4 — GREEN: Guards müssen jetzt bestehen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats
tests/unit/lib/bats-core/bin/bats tests/unit/verification-block-order.bats
```

Zusätzlich gegenprüfen, dass die Guards nicht trivial grün sind: die jeweilige
Änderung kurz zurückdrehen, den Test rot sehen, wieder herstellen.

## Task 5 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
