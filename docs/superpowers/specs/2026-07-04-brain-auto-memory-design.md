---
ticket_id: T001567
plan_ref: null
status: active
date: 2026-07-04
---

# brain-auto-memory — Design

_Epic: brain-llm-wiki (T001566), Change 7 · Ticket: T001567 (reaktiviert)_

## Why

Auto-Memory (`~/.claude/projects/<project>/memory/*.md`) sammelt pro-Projekt Wissen
(Nutzerkontext, Feedback-Konventionen, Projektstand, Referenzen), bleibt aber rein
lokal und maschinengebunden — nicht mit dem gemeinsamen brain-Wiki (Paddione/brain)
verknüpft. Erkenntnisse aus Claude-Sessions gehen bei Rechnerwechsel oder für andere
Kollaborateure (Gekko) verloren, obwohl sie oft generisches Projektwissen enthalten,
das im brain-Wiki wertvoll wäre.

## What

Eine client-seitige Bash-Brücke, die Auto-Memory-Dateien **einseitig** (Export, kein
Import) in einer kuratierten, review-gestützten Auswahl ins brain-Repo überführt.

**Nicht-Ziel:** Kein automatischer Blind-Sync, kein bidirektionaler Abgleich, keine
CI-Integration (der bestehende `brain-merge-hook.yml`-Workflow läuft in GitHub Actions
und hat keinen Zugriff auf lokale `~/.claude/projects/`-Dateien — diese Brücke muss
zwingend lokal auf dem Entwickler-Rechner laufen).

## Architektur

Zwei getrennte Bash-Skripte (Konsistenz mit bestehendem `brain-merge-hook.sh` /
`brain-gekko-inbox.sh` — kein neues Sprach-Dependency):

### `scripts/brain-auto-memory-scan.sh` (read-only, cron-tauglich)

- Durchsucht `~/.claude/projects/*/memory/*.md` (Pfad überschreibbar via
  `AUTO_MEMORY_ROOT`-Env-Var für Tests), überspringt `MEMORY.md`-Indexdateien.
- Parst YAML-Frontmatter (`name`, `description`, `metadata.type`) mit einfachem
  Bash-Parsing (kein `pyyaml`, analog zur naiven Split-Logik in `brain-mcp-server.py`).
- Vergleicht `sha256sum` jeder Datei gegen die State-Datei
  `~/.claude/brain-auto-memory-state.json`
  (`{"<project>/<file>": {"hash": "...", "last_export": "<iso-ts>"}}`).
- Überspringt Dateien mit erkennbaren Secret-Mustern (`-----BEGIN`, `api[_-]key`,
  lange Hex/Base64-Blöcke) + Warnung auf stderr — kein automatischer Export.
- Überspringt Dateien ohne parsbares Frontmatter + Warnung auf stderr, kein Crash.
- Schreibt Kandidaten (neu ODER Hash geändert seit letztem Export) als JSON-Array
  nach `~/.claude/brain-auto-memory-candidates.json`:
  `[{project, file, name, description, metadata_type, hash}]`.
- Exit 0 immer, auch bei 0 Kandidaten oder fehlendem `~/.claude/projects/`
  (reines Reporting, kein Fehlerfall).

### `scripts/brain-auto-memory-export.sh` (interaktiv, manuell)

- Liest `~/.claude/brain-auto-memory-candidates.json`; falls Datei fehlt oder leer,
  ruft intern zuerst `brain-auto-memory-scan.sh` auf (Convenience für Direktaufruf
  ohne vorherigen Cron-Lauf).
- Pro Kandidat: zeigt `name` + `description` + `metadata_type`, fragt `[y/n/e]`
  (yes / no / edit-type — bei `e` wird der Ziel-`type` abgefragt und überschreibt
  den Mapping-Default).
- Wendet die Type-Mapping-Tabelle an (siehe unten), schreibt konvertiertes
  Frontmatter (`type`, `tags: [auto-memory, <project>]`, `status: draft`) + Body
  nach `<BRAIN_REPO_PATH>/raw/auto-memory/<project>/<slug>.md`
  (`slug` aus `name`, kebab-case).
- Committed + pusht im lokalen brain-Repo-Checkout (`BRAIN_REPO_PATH`-Env-Var,
  analog zu bestehenden Brain-Skripten).
- Aktualisiert die State-Datei (Hash + Timestamp) **nur** für tatsächlich
  exportierte (`y`) Dateien. Abgelehnte (`n`) bleiben bewusst als Kandidat für den
  nächsten Lauf offen (kein "gesehen aber ignoriert"-Status — YAGNI, bestätigt im
  Brainstorming).

### Type-Mapping (fest im Skript, `case`-Statement)

| Auto-Memory `metadata.type` | Brain `type` | Anmerkung |
|---|---|---|
| `project` | `note` | |
| `reference` | `note` | |
| `feedback` | `decision` | Feedback-Memories sind Arbeitskonventionen — näher an einer Entscheidung als einer reinen Notiz |
| `user` | `note` | Review-Default ist `n` (eher persönlich/Patrick-spezifisch, Gekko-Relevanz fraglich) — überschreibbar per `y` |

## Datenfluss

```
~/.claude/projects/*/memory/*.md
        │  (scan.sh: hash-diff + frontmatter-parse + secret-check)
        ▼
~/.claude/brain-auto-memory-candidates.json
        │  (export.sh: interaktives Review y/n/e)
        ▼
<BRAIN_REPO_PATH>/raw/auto-memory/<project>/<slug>.md
        │  (git commit + push)
        ▼
Paddione/brain (raw/auto-memory/)
        │  (State-Update NUR für exportierte Dateien)
        ▼
~/.claude/brain-auto-memory-state.json
```

## Fehlerbehandlung

- Kein `~/.claude/projects/` vorhanden → Scan liefert leeres Kandidaten-Array,
  kein Fehler (frischer Rechner ohne Memory-Historie ist ein gültiger Zustand).
- Memory-Datei ohne parsbares Frontmatter → übersprungen + Warnung, kein Crash.
- Secret-Muster erkannt → übersprungen + Warnung, kein automatischer Export.
- `BRAIN_REPO_PATH` nicht gesetzt oder kein Git-Checkout → Export bricht **vor**
  jeder State-Datei-Änderung ab (kein Teil-Fortschritt/Inkonsistenz).
- `git push` schlägt fehl (Konflikt etc.) → State-Datei wird NICHT aktualisiert,
  Export bricht ab; nächster Lauf versucht dieselben Dateien erneut (kein stiller
  Datenverlust).

## Nightly-Cron (optional, nicht Teil dieses Change)

Kein neuer GitHub-Actions-Workflow — läuft lokal, nicht in CI (siehe "Nicht-Ziel"
oben). Die Spec dokumentiert nur ein Beispiel für einen lokalen Cron-/systemd-timer-
Eintrag, der `brain-auto-memory-scan.sh` aufruft; keine Auto-Installation durch
dieses Change.

```
# Beispiel (manuell einzurichten, nicht Teil des Plans):
0 3 * * * /home/patrick/Bachelorprojekt/scripts/brain-auto-memory-scan.sh
```

## Testing

`tests/spec/brain-auto-memory.bats` (analog zu `tests/spec/brain-gekko-inbox.bats`):

1. Scan findet neue Memory-Datei (Fixture-Verzeichnis via `AUTO_MEMORY_ROOT`).
2. Scan erkennt unveränderte Datei NICHT erneut als Kandidat (Hash-Vergleich).
3. Scan überspringt Datei ohne Frontmatter + Warnung, kein Crash.
4. Scan erkennt Secret-Muster (Fixture mit `-----BEGIN` im Body) und überspringt sie.
5. Export wendet Mapping-Tabelle korrekt an (`feedback` → `decision`).
6. Export bricht ab wenn `BRAIN_REPO_PATH` fehlt, State-Datei bleibt unverändert.
7. Export aktualisiert State-Datei nur für bestätigte (`y`), nicht für abgelehnte (`n`) Dateien.

## Ticket

Reaktiviert: **T001567** ("Follow-up brain-llm-wiki: Out-of-Scope Sprint 1
(Changes 4-7 + Ideen)", aktuell fälschlich `done` ohne Implementierung) — Titel und
Scope passen exakt auf Change 7. Status wird vor dem Plan-Staging auf `planning`
zurückgesetzt.
