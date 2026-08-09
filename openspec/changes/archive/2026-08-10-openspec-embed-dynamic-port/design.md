---
title: openspec-embed wählt den DB-Port-Forward dynamisch statt 15432 fest zu belegen
ticket_id: T003077
domains: [test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# Design: openspec-embed-dynamic-port

## Symptom (Fakt, reproduziert)

`scripts/openspec-embed-local.sh` startet für jeden Commit, der `openspec/changes/<slug>/`
berührt, einen `kubectl --context fleet port-forward -n workspace svc/shared-db 15432:5432`
und bricht mit `FEHLER: Port 15432 wird von einem fremden Prozess … belegt` ab, sobald bereits
ein anderer Prozess auf demselben festen Port lauscht — typischerweise ein dauerhaft laufender
Dev-Port-Forward (`kubectl --context k3d-mentolder-dev port-forward -n workspace svc/shared-db
15432:5432`), den Entwickler für die lokale k3d-DB offen lassen. Beobachtet dreimal in Folge bei
T003045 (Stage-Commit b78616a60) und erneut bei T002807 (T003101, als Dublette geschlossen).

Der `.githooks/post-commit-embed`-Wrapper (T002916) ruft `openspec-embed-local.sh` bei Fehlschlag
bis zu dreimal mit 5s Pause auf (`OPENSPEC_EMBED_HOOK_RETRIES=3`,
`OPENSPEC_EMBED_HOOK_RETRY_DELAY=5`). Diese Retry-Logik ist für **transiente** Fehler gedacht
(Backend startet neu, Connection Refused) — bei einem dauerhaften Fremdprozess auf dem Zielport
ändert sich der Zustand innerhalb von 10s Wartezeit nicht, die Retries verstreichen wirkungslos.

## Ursache (verifiziert)

`scripts/openspec-embed-local.sh:74`:
```bash
PF_PORT="${OPENSPEC_EMBED_PF_PORT:-15432}"
kubectl --context "$CTX" -n workspace port-forward svc/shared-db "${PF_PORT}:5432" >/dev/null 2>&1 &
```
Der lokale Port ist fest auf 15432 codiert (Default), obwohl der Hook den Port nur für die
Dauer seines eigenen, kurzen Laufs braucht — er muss ihn sich mit keinem anderen Prozess teilen.
`pf_listener_pid()` (in `scripts/openspec-embed-lib.sh`, aus T002870) erkennt den Fremdprozess
korrekt und verweigert fail-loud statt fail-silent auf die falsche DB zu schreiben — das ist
bereits die sichere Richtung (dokumentiert in `openspec-embed-port-collision.md`). Offen bleibt
nur, dass ein fester, gemeinsam genutzter Port bei jedem Commit erneut kollidiert, solange der
Fremdprozess lebt.

## Lösung

**Kern: `kubectl port-forward` selbst einen freien Port wählen lassen**, statt einen festen Port
vorzugeben. `kubectl port-forward svc/shared-db :5432` (lokaler Port leer) lässt kubectl einen
beliebigen freien lokalen Port belegen und gibt ihn auf stdout aus:
`Forwarding from 127.0.0.1:<port> -> 5432`. Das entspricht Ticket-Vorschlag (b) und beseitigt
die Portkollision strukturell — der Hook konkurriert dann mit keinem anderen Prozess mehr um
einen gemeinsamen Port.

- **Default-Pfad (kein `OPENSPEC_EMBED_PF_PORT` gesetzt):** `kubectl port-forward svc/shared-db
  :5432` (leerer lokaler Port). Der Wrapper liest den von kubectl zugewiesenen Port aus dessen
  stdout (`grep -oP 'Forwarding from 127\.0\.0\.1:\K[0-9]+'`), mit demselben Poll-Timeout wie
  bisher (10x1s) für den Fall, dass die Forwarding-Zeile verzögert erscheint. Schlägt das Binden
  fehl (z. B. Cluster nicht erreichbar), bleibt die Fehlermeldung inhaltlich wie bisher, nur ohne
  Bezug auf einen bestimmten Port.
- **Explizit gesetzter Port (`OPENSPEC_EMBED_PF_PORT=<n>`):** unverändertes Verhalten — fester
  Port, `pf_listener_pid`-Fremdprozess-Erkennung, sofortiger `exit 1` bei Kollision (dieser Pfad
  ist bereits fail-fast, siehe Code — kein 10x1s-Warten bei erkanntem Fremdprozess, das Ticket
  hat den Ist-Stand hier leicht überzeichnet). Dieser Pfad bleibt für Aufrufer erhalten, die
  bewusst einen stabilen Port brauchen (z. B. CI, falls je genutzt).
- **`pf_listener_pid()` und `embed_output_is_success()` bleiben unverändert** — sie werden im
  expliziten Pfad weiter gebraucht und sind von `tests/spec/openspec-embedding/port-forward-
  identity-T002870.bats` abgedeckt; dieser Fix ändert an ihrem Verhalten nichts.
- **Retry-Verhalten in `.githooks/post-commit-embed` bleibt unverändert** (Ticket-Punkt c): mit
  dem Default-Pfad tritt der deterministische Portkonflikt praktisch nicht mehr auf, wodurch die
  3x5s-Retries wieder ihren eigentlichen Zweck erfüllen (transiente Fehler). Eine zusätzliche
  Unterscheidung „deterministischer vs. transienter Fehlschlag" für den seltenen
  Explizit-Port-Pfad wäre zusätzliche Komplexität ohne proportionalen Nutzen (YAGNI) — dieser Pfad
  wird nicht von der automatischen Pipeline, sondern nur bei bewusster Env-Var-Setzung genutzt.

## Verhältnis zu T002877 (Completeness-Gate, 12/57 Pläne)

**Nicht Teil dieser Änderung.** T002877 beschreibt eine Lücke von 45 fehlenden Dokumenten
(12 von 57 aktiven Plänen embedded). Ein gescheiterter post-commit-Hook lässt pro betroffenem
Commit **ein** Dokument un-embedded — selbst bei täglich mehrfachen Kollisionen erklärt das
bestenfalls einen kleinen einstelligen Anteil der 45 fehlenden Pläne, nicht die Größenordnung der
Lücke. T002877 nennt selbst plausiblere Hauptursachen (nie gelaufener
`task openspec:embed:backfill`, Pläne die außerhalb eines Commits entstanden — z. B. importierte
oder extern erzeugte Changes). Dieser Fix reduziert die Grundrate zukünftiger Hook-Fehlschläge,
schließt die Lücke aber nicht — T002877 bleibt offen und braucht eine eigene Diagnose (Backfill-
Lauf-Historie prüfen).

## Betroffene Subsysteme

- `scripts/openspec-embed-local.sh` (Port-Wahl + Port-Parsing aus kubectl-stdout)
- `scripts/openspec-embed-lib.sh` (unverändert, ggf. neue reine Helper-Funktion für das
  Port-Parsing, damit sie testbar ist ohne echtes `kubectl`)
- `tests/spec/openspec-embedding/` (neuer failing Test für den Port-Parsing-Helper)

## Edge Cases

- kubectl-Ausgabe verzögert (Netzwerklatenz zum Cluster) → bestehender 10x1s-Poll-Loop deckt das ab.
- Zwei parallele `dev-flow-plan`-Sessions committen gleichzeitig auf unterschiedlichen Branches →
  jede bekommt von kubectl einen eigenen freien Port, keine Kollision mehr zwischen ihnen.
- `OPENSPEC_EMBED_PF_PORT` weiterhin explizit auf 15432 gesetzt (z. B. alte Doku/Gewohnheit) →
  unverändertes fail-fast-Verhalten, keine Regression für diesen Opt-in-Pfad.
- kubectl bindet erfolgreich, aber liefert eine stdout-Zeile in unerwartetem Format (z. B. IPv6
  zuerst) → Parsing MUSS gezielt nach der `127.0.0.1:`-Zeile suchen, nicht nach der ersten
  „Forwarding from"-Zeile.

## Entscheidung dokumentiert (kein interaktiver User in diesem headless ticket-ops-Dispatch)

Dieser Plan lief innerhalb eines automatisierten ticket-ops-Welle-1-Dispatches ohne live
antwortenden User. Die Lösungsrichtung (dynamischer Port via `kubectl port-forward svc/x :5432`)
wurde selbst gewählt und hier begründet, statt eine der drei ungewichteten Ticket-Optionen (a/b/c)
per Rückfrage klären zu lassen — Option (b) deckt (a) und (c) strukturell mit ab: kein
gemeinsamer Port mehr nötig (a wird obsolet) und kein Wartezeit-Problem mehr im Default-Pfad
(c wird für den Default-Pfad obsolet, bleibt im Opt-in-Pfad wie beschrieben unverändert).
