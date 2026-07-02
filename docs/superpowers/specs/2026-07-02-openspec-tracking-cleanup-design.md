---
ticket_id: T001452
plan_ref: openspec/changes/openspec-tracking-cleanup/tasks.md
status: active
date: 2026-07-02
---

# OpenSpec Tracking Cleanup — Design

## Purpose

Das OpenSpec-Tracking führt denselben Zustand mehrfach und vermischt dauerhafte
Komponenten-Specs mit Einweg-Ticket-Artefakten. Dieser Change beseitigt die
Wurzelursachen statt weiterer Symptombehandlung:

1. **Shadow State abschaffen:** Die handgepflegte `OpenSpec-Komponenten:`-Liste in
   `openspec/config.yaml` dupliziert `ls openspec/specs/`. Die Eskalationskette
   T001266 (Liste manuell vervollständigt) → T001304 (Drift-Hard-Gate) → T001389
   (Auto-Registrierung) hat die Pflege der Kopie immer weiter automatisiert, statt
   die Kopie zu entfernen. Die Liste wird gestrichen; das Verzeichnis ist SSOT.
2. **SSOT-Namespace entrümpeln:** 36 von 94 Dateien in `openspec/specs/` sind
   ticket-/gate-nummerierte One-offs (`t001363-mishap-bundle`, `g-cq05-todo-cleanup`,
   `pocket-id-client-seed-timeout`, …) — abgeschlossene Changes, keine Komponenten.
   Sie wandern nach `openspec/specs/archive/`; das `--create-new`-Gate verhindert
   künftige One-off-Specs.
3. **Duplikate bereinigen:** `cq05-todo-cleanup`/`g-cq05-todo-cleanup` und
   `g-dep02-major-deps-website`/`t001360-dep02-major-deps` beschreiben jeweils
   dasselbe Ziel mit divergierenden Requirements — alle vier sind historisch und
   werden mitarchiviert (kein Content-Merge nötig, keine aktiven Konsumenten).

## Goals

- `openspec/config.yaml` enthält keine `OpenSpec-Komponenten:`-Aufzählung mehr;
  kein Konsument parst sie.
- `checkConfigDrift()` (Drift-Gate T001304) und `registerComponent()`
  (Auto-Register T001389) sind samt Tests entfernt — der Validator liest
  ausschließlich das Verzeichnis.
- `openspec/specs/` enthält nur noch kanonische Komponenten-Specs; One-offs liegen
  unter `openspec/specs/archive/` (read-only, vom Validator/Kontext-Loader ignoriert).
- `openspec.sh archive --create-new` verweigert One-off-Slug-Muster; Override nur
  über explizites Flag.
- Neu erzeugte SSOT-Stubs tragen keinen Platzhalter-Purpose „SSOT spec." mehr;
  verbleibende kanonische Specs mit Platzhalter-Purpose erhalten einen echten
  deutschen Purpose-Satz.
- `task test:openspec`, `task test:all` und `task freshness:check` sind grün.

## Non-Goals

- Kein Umbau des Status-Trackings (`openspec-status-map.sh` /
  `openspec-status.json` / Ticket-DB) — separater, späterer Change.
- Keine inhaltliche Überarbeitung kanonischer Specs über den Purpose-Satz hinaus.
- Keine Änderung an `component-map.yaml` (enthält keine One-off-Slugs).
- Keine Umbenennung der gleichnamigen One-off-BATS-Dateien in `tests/spec/`
  (`size04-loc-velocity.bats`, `pocket-id-*.bats`, `t001363/408/415/353-*.bats`,
  `repo-health-goals.bats`) — sie bleiben als Regressionstests bestehen.
- Kein Löschen von Historie: One-off-Specs werden per `git mv` verschoben, nicht
  gelöscht.

## Vorentscheidungen (Brainstorming, Board `.lavish/openspec-tracking-cleanup-brainstorm.html`)

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | `checkConfigDrift()` entfernen; Verzeichnis ist SSOT | Gate validiert eine Kopie, die nicht existieren müsste |
| E2 | `OpenSpec-Komponenten:`-Block aus `config.yaml` streichen | Entlastet zudem den `context:`-Prompt jeder Proposal-Phase; keine Upstream-CLI-Abhängigkeit (projekteigenes Feld) |
| E3 | `openspec/specs/archive/` als Ziel für One-offs | Auffindbar, aber aus dem SSOT-Namespace raus; Validator behandelt es nicht als Komponenten |
| E4 | `--create-new` mit Slug-Pattern-Denylist + `--force-new-component`-Override | Deterministisch und agent-tauglich; Escape-Hatch für legitime Sonderfälle |
| E5 | T001389-Mechanismus zurückbauen, Change-Ordner regulär archivieren | Bereits gemergt (#2430, Ticket done); Auto-Register wird durch E1/E2 gegenstandslos |
| E6 | Platzhalter-Purpose nur bei kanonischen Specs nachschärfen | Archivierte One-offs unangetastet lassen (Historie) |
| O1 | Alle 4 Duplikat-Specs mitarchivieren, kein Merge | `health-goals-check.sh` referenziert nur Gate-IDs; keine aktiven Spec-Konsumenten |

## Architektur / Änderungspunkte

Konsumenten-Kartierung (Explore-Agent, 2026-07-02):

### 1. `scripts/openspec-validate.ts` (227 Z.)
- `checkConfigDrift()` (Z. 164–195) **entfernen**, Aufruf in `validateTree()` (Z. 222) entfernen.
- `validateSpecsDir()` (Z. 143–157): `readdirSync` filtert bereits auf `.md`-Dateien;
  sicherstellen, dass das Unterverzeichnis `archive/` nicht als Spec validiert wird
  (nur Top-Level-`.md` zählen).
- Tests: `scripts/openspec-validate.test.ts` Z. 141–159 (checkConfigDrift-Fälle)
  entfernen; `validateTree`-gegen-echtes-Repo-Test (Z. 65–88) bleibt und muss grün sein.

### 2. `scripts/openspec-merge.mjs` (171 Z.)
- `registerComponent()` (Z. 129–155) und Aufruf in `applyDelta()` (Z. 88–92) **entfernen**.
- Skeleton-Template (Z. 85): Platzhalter „SSOT spec." ersetzen durch den deutschen
  Stub-Satz `_Purpose fehlt — beim nächsten inhaltlichen Delta zu <slug> ergänzen._`
  (kein `TODO`-Token — würde den G-CQ05-Grep treffen). Damit ist der Stub als
  unfertig erkennbar, ohne die Purpose-Deutsch-Regel oder das TODO-Gate zu verletzen.
- `applyDelta()` ohne bestehendes SSOT-Ziel: Slug-Denylist
  `^(t[0-9]{6}|g-[a-z]+[0-9]{2})` (One-off-Muster) → Fehler mit Hinweis auf
  `--target-spec <parent>`; Override nur bei explizitem `--force-new-component`.
- Test-Fixture `scripts/openspec-merge.test.ts:11` (config mit Liste) anpassen.

### 3. `scripts/openspec.sh` (208 Z.)
- `cmd_archive()` (Z. 119–150): reicht das neue Override-Flag durch; Fehlermeldung
  des Merge-Denylist-Falls sichtbar machen.

### 4. `openspec/config.yaml` (80 Z.)
- `OpenSpec-Komponenten:`-Block (Z. 14–62) ersatzlos streichen; übriger
  `context:`-Freitext bleibt.

### 5. Spec-Verzeichnis
- `git mv` der ~36 One-off-Specs nach `openspec/specs/archive/` (Liste per Muster
  `^(t[0-9]{6}|g-[a-z]+[0-9]{2}|ci01-|cq05-|size04-|pocket-id-)` plus manuell
  bestätigte Einzelfälle `mentolder-homepage-hifi-redesign`, `ticket-verlauf-anhaenge`,
  `mcp-server-capabilities` — finale Liste erzeugt der Plan deterministisch).
- Verbleibende kanonische Specs mit „SSOT spec."-Purpose: deutschen Purpose-Satz
  ergänzen.

### 6. Vorgelagert: Change `openspec-auto-register` archivieren
- Ticket T001389 ist `done` → `openspec.sh archive openspec-auto-register`
  (Delta zielt auf `openspec-workflow.md`); unser Delta MODIFIED/REMOVED
  anschließend die Auto-Register-Requirement aus `openspec-workflow.md`.

### 7. BATS
- `tests/spec/openspec-workflow.bats` Z. 187–235 (T001389-Registrierungstests)
  entfernen; neue Tests: (a) `config.yaml` enthält keine `OpenSpec-Komponenten:`-
  Zeile, (b) `--create-new` mit One-off-Slug schlägt fehl, (c) mit
  `--force-new-component` gelingt es, (d) `specs/archive/`-Dateien werden vom
  Validator ignoriert.

## Auswirkungen auf Gates/Metriken (geprüft)

- **G-RH03** (`goals-data.ts:109`, BATS/SPECS-Ratio, Richtung „höher"): verbessert
  sich (~46 % → ~75 %) — kein Bruch, aber `current`/`measured_at` im Zuge der
  Umsetzung aktualisieren.
- **coverage-gate.bats** (≥ 23 %): bleibt grün (Ratio steigt).
- **`task freshness:check`**: `openspec-status.json` ändert sich nur durch die
  Archivierung des Change-Ordners `openspec-auto-register` — Regeneration gehört
  in den Verifikations-Task.
- **CI-Trigger**: `task test:changed` aktiviert `test:openspec` bei Änderungen
  unter `openspec/` automatisch.

## Fehlerbehandlung

- Denylist-Verstoß bei `--create-new`: harter Fehler (Exit ≠ 0) mit Meldung, die
  `--target-spec <parent-slug>` und `--force-new-component` als Alternativen nennt.
- `openspec-context.sh` bei Anfrage eines archivierten Slugs: unverändertes
  Verhalten (Datei nicht in `specs/` → bestehender Not-Found-Pfad); kein
  Fallback auf `archive/`.

## Testing

- `task test:openspec` (vitest, validate gegen echtes Repo) — grün nach Umbau.
- `task test:unit:openspec` + `tests/spec/openspec-workflow.bats` — angepasst/erweitert (s. o.).
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` im
  finalen Verifikations-Task; nach BATS-Änderungen `task test:inventory` + Commit.
