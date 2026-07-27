# Proposal: renovate-repo-changed-hardening

## Why

Renovate hat seit seiner Einführung (T000898, 2026-06-17) **keinen einzigen PR erzeugt**. Die
Dispatch-Läufe brechen reproduzierbar mit `result=repository-changed` ab: Renovate prüft die
Base-Branch-SHA vor dem Schreiben gegen die beim Klonen gelesene und verwirft bei Drift den
gesamten Lauf. Bei 157 s Laufzeit (Run 30238038240) und einer Schreibrate von ~103 Commits
pro Tag auf `main` — `factory-tick` alle 5–6 Minuten, Freshness-Bot-Commits, Auto-Merges —
ist ein driftfreies Zeitfenster während aktiver Stunden praktisch nicht zu erwischen.

Verschärfend: der Abbruch beendet den Prozess mit **Exit-Code 0**. Alle zehn letzten Runs
stehen auf `success`, obwohl nichts verarbeitet wurde. Der Workflow meldet Erfolg genau dann,
wenn er seine Aufgabe verfehlt hat — 47 angehakte Checkboxen im Dependency Dashboard #3219
warten seit Wochen unbemerkt.

## What

Zwei Änderungen an `.github/workflows/renovate.yml`, ergänzt um eine Spec-Präzisierung:

1. **Sichtbarkeit + Retry.** `renovatebot/github-action` weicht einem direkten, digest-gepinnten
   `docker run` in einer Bash-Retry-Schleife: bis zu 3 Versuche ohne Backoff, Erkennung über
   Log-Grep auf `"result": "repository-changed"` (empirisch belegt, im Gegensatz zum ungeprüften
   Report-JSON-Schema). Bleiben alle Versuche erfolglos, endet der Job **rot**.

2. **Laufzeit senken.** `RENOVATE_REPOSITORY_CACHE=enabled` mit `RENOVATE_CACHE_DIR` unter `/tmp`,
   persistiert per `actions/cache` mit Rolling-Key. Das trifft die 127-s-Lookup-Phase und
   verkleinert damit das Kollisionsfenster.

3. **Spec-Präzisierung** in `openspec/specs/ci-cd.md`: Die bestehende Requirement fordert
   Renovate-Läufe, sagt aber nichts über deren Ergebnis. Ergänzt wird die Forderung, dass ein
   Lauf ohne verarbeitetes Repository als Fehlschlag gilt.

**Nicht im Scope** (mit Begründung in `design.md`): `enabledManagers`-Split, `ignorePaths`-
Ergänzungen (nachweislich wirkungslos), gemeinsame `concurrency`-Gruppe mit `freshness-regen.yml`,
`platformCommit`, Rückstufung von `fetch-depth`.

_Ticket: T002249_
