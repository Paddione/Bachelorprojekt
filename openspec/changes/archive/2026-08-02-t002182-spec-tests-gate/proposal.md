# Proposal: t002182-spec-tests-gate

## Why

`.github/workflows/ci.yml` enthält im Job `test-factory` (Required Check
**„Factory + OpenSpec + Guards"**) heute nur vier gezielte
`tests/spec/*.bats`-Aufrufe: `software-factory.bats` (Zeile 177),
`agent-library.bats` (183), `mcp-tooling.bats` (186) und `ci-cd.bats` (200).
Verifiziert per `grep -c` und `ls`: `tests/spec/` enthält **132**
`.bats`-Dateien — die übrigen **128** laufen in keinem Required Check und
enforced damit nichts. Genau dieses Muster ist bereits im eigenen
CI-Kommentar (ci.yml Zeilen 188–194, T002163) dokumentiert: drei
T001994-Assertions in `ci-cd.bats` standen wochenlang rot auf `main`, bis ein
lokaler `task test:changed` auf einem unabhängigen PR sie zufällig aufdeckte.
Guards, die CI nie ausführt, sind Dokumentation, keine Gates.

Ein lokaler Testlauf zur Verifikation (`./tests/unit/lib/bats-core/bin/bats
tests/spec/*.bats`, 1708 Einzel-Assertions über alle 132 Dateien) bestätigt
das Risiko konkret: **`image-drift.bats`** — eine der 128 nicht
scharfgeschalteten Dateien — schlägt bereits auf dem aktuellen Stand fehl
(`G-IMG02: keine curlimages/curl Drift-Tags … in hand-editierten
Manifesten`). Diese Regression ist unentdeckt, weil `image-drift.bats` nie in
einem Required Check läuft.

Der Taskfile-Task `task test:spec` existiert bereits (Zeile 712–716,
`Taskfile.yml`) und führt genau die vollständige Glob-Suite parallelisiert
aus („Live-DB cases skip without a reachable cluster, so this is CI-safe").
Der Job `test-factory` ist bereits als Required Check
(„Factory + OpenSpec + Guards") in der Branch-Protection von `main`
registriert (verifiziert via `gh api repos/Paddione/Bachelorprojekt/branches/
main/protection`) — es muss also **keine neue** Branch-Protection-Regel
angelegt werden, nur der bestehende Job muss die volle Glob-Suite statt der
vier Einzeldateien ausführen.

## What

- `test-factory`-Job in `.github/workflows/ci.yml` so erweitern, dass er
  `tests/spec/*.bats` vollständig (statt der vier gezielten Dateien) über
  `task test:spec` ausführt — die vier bisherigen Einzelschritte werden
  ersetzt/konsolidiert (sie sind Teilmenge der Glob-Suite).
- Portabilitätslücke schließen: `task test:spec:build-mcp-runner` braucht Go
  zum Bauen von `mcp-task-runner`; der `test-factory`-Job installiert aktuell
  kein Go. `tests/spec/mcp-task-runner.bats` hat keinen Skip-Guard, wenn das
  Binary fehlt — auf einem frischen GitHub-Actions-Runner (kein
  vorinstalliertes `/usr/local/bin/mcp-task-runner`) würde das hart
  fehlschlagen. Fix: `actions/setup-go` in den Job aufnehmen (oder
  gleichwertiger Fallback).
- `timeout-minutes` des Jobs (aktuell 10) gegen die tatsächliche Laufzeit der
  vollständigen Suite prüfen und ggf. anheben.
- Regressions-Guard in `tests/spec/ci-cd.bats` ergänzen: eine Assertion, die
  sicherstellt, dass `ci.yml` die Glob-Form `tests/spec/*.bats` (oder
  äquivalent alle 132 Dateien) aufruft — nicht wieder eine enumerierte
  Teilmenge. Das ist der RED-Test dieses Plans (muss vor dem Fix fehlschlagen).
- Vorab-Bug für den bereits entdeckten `image-drift.bats`-Fund
  (`G-IMG02: curlimages/curl`) als eigenes `type=bug`-Ticket erfassen und
  fixen bzw. bewusst quarantänisieren, **bevor** die Datei scharf geschaltet
  wird — sonst blockiert das Öffnen der Gate sofort jeden PR
  (Bug-Triage-Konvention CFR-Gate G-DORA03).
- `task freshness:regenerate` / `task test:inventory` laufen lassen, falls
  sich generierte Artefakte durch die CI-Änderung ändern.

## Non-Goals

- Keine Änderung an `scripts/gh-branch-protection.sh` — der Required-Check-
  Name „Factory + OpenSpec + Guards" existiert bereits in der
  Branch-Protection, das Skript selbst ist ohnehin veraltet (führt andere,
  inzwischen umbenannte Job-Namen), das ist aber ein separates Aufräum-Ticket
  und nicht Teil dieses Scopes.
- Keine inhaltliche Reparatur der 128 bisher nicht-gated Testdateien über den
  einen bestätigten `image-drift.bats`-Fund hinaus. Sollte der volle
  Testlauf beim Implementieren weitere rote Assertions in bisher
  ungegateten Dateien zutage fördern, wird für jede ein eigenes
  `type=bug`-Ticket erstellt statt sie in diesem Plan mitzufixen.

_Ticket: T002182_
