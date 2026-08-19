---
title: "runner-role-assignment — Implementation Plan"
ticket_id: T012488
domains: [ci-cd, github-actions, test]
status: active
file_locks:
  - scripts/ci/runner-placement-check.sh
  - scripts/ci/runner-inventory-check.sh
  - scripts/ci/provision-gh-runner.sh
  - tests/spec/ci-cd/runner-role-assignment.bats
  - components/website/src/data/test-inventory.json
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# runner-role-assignment — Implementation Plan

_Ticket: T012488_

## File Structure

| Datei | Änderung | S1-Budget |
|---|---|---|
| `scripts/ci/runner-placement-check.sh` | neu — prüft jede Workflow-Datei gegen die Zuordnungsregel, trägt die Capability-Label-Deklaration | neu, Limit `.sh` 800 |
| `scripts/ci/runner-inventory-check.sh` | neu — gleicht registrierte Runner gegen adressierende Jobs ab (GitHub-API, kein CI-Gate) | neu, Limit `.sh` 800 |
| `scripts/ci/provision-gh-runner.sh` | Kopfkommentar auf den neuen Stand bringen | 166/800 — nur Kommentar, kein Wachstum von Belang |
| `tests/spec/ci-cd/runner-role-assignment.bats` | neu — Guard-Verhalten gegen Repo und gegen Verstoß-Fixture | `.bats` hat kein S1-Limit |
| `components/website/src/data/test-inventory.json` | generiertes Testinventar aktualisieren | generiert |

Unverändert und nur als Positivanker gelesen:
`tests/spec/ci-cd/hybrid-runner-placement.bats` (T012446-Guard bleibt bestehen, siehe
design.md D1), `.github/workflows/arbitration.yml` und `.github/workflows/opencode.yml`
(zulässige `[self-hosted, fleet-gpu]`-Platzierung).

## Partials

| Partial | Rolle | Dateien |
|---|---|---|
| p1 | tests | alle oben genannten — ein zusammenhängender Vorgang, Guard und geprüfte Regel sind nicht sinnvoll trennbar |

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/ci-cd/runner-role-assignment.bats` anlegen,
      bevor `scripts/ci/runner-placement-check.sh` existiert.

      Der entscheidende Test ist **nicht**, dass das Repository die Regel erfüllt — das tut es
      im Ausgangszustand bereits, weil alle portablen Jobs seit T012446 GitHub-hosted laufen
      und die zwei self-hosted Jobs `fleet-gpu` adressieren. Ein Guard, der nur das prüft,
      wäre von Anfang an grün und bewiese nichts.

      Der Test muss deshalb belegen, dass der Guard einen Verstoß **findet**: er schreibt in
      `$BATS_TEST_TMPDIR` eine Workflow-Datei mit `runs-on: [self-hosted, linux, x64]`, ruft
      den Guard darauf auf und erwartet Exit ≠ 0 samt Nennung von Datei und Jobnamen. Ein
      zweiter Fall verwendet ein unbekanntes Capability-Label. Der Positivfall über das reale
      Repository kommt hinzu, trägt den Nachweis aber nicht allein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/runner-role-assignment.bats
# expected: FAIL — scripts/ci/runner-placement-check.sh existiert noch nicht
```

- [x] **Fix-Step (GREEN).** Guard und Inventur-Skript implementieren; anschließend besteht die
      BATS-Datei.

## Task 1 — Roten Guard-Test schreiben

- `tests/spec/ci-cd/runner-role-assignment.bats` anlegen.
- Negativfall A: Fixture-Workflow mit `runs-on: [self-hosted, linux, x64]` in
  `$BATS_TEST_TMPDIR`; Guard muss mit Exit ≠ 0 abbrechen und Dateiname plus Jobnamen ausgeben.
  Auf die Ausgabe prüfen (`$output`), nicht auf den Skriptquelltext.
- Negativfall B: Fixture mit `[self-hosted, nicht-deklariert]`; Guard muss das unbekannte
  Label benennen.
- Negativfall C: neu hinzugefügter Job in einer Fixture, der in keiner Jobliste steht — belegt
  die universelle Iteration gegenüber der Allowlist aus T012446.
- Positivfall: Guard über das reale `.github/workflows/` besteht mit Exit 0.
- Positivanker: `arbitration.yml` und `opencode.yml` tragen weiterhin `self-hosted` **und**
  `fleet-gpu` — ohne diesen Anker könnte ein Guard, der alles ablehnt, grün erscheinen.
- Test gegen den unveränderten Stand ausführen und den roten Zustand belegen.

## Task 2 — Zuordnungs-Guard implementieren

`scripts/ci/runner-placement-check.sh` neu anlegen:

- Argument ist ein Workflow-Verzeichnis; Vorgabe `.github/workflows`. Damit ist der Guard
  gegen Fixtures aufrufbar, ohne das Repository zu verändern.
- Über **jede** Datei und darin über `yq '.jobs | keys'` **jeden** Job iterieren. Keine
  Jobliste pflegen — das ist der Unterschied zum T012446-Guard (design.md D1).
- `runs-on` in beiden zulässigen Formen lesen: Skalar (`ubuntu-latest`) und Sequenz
  (`[self-hosted, fleet-gpu]`). Ein Wert mit `${{ … }}`-Ausdruck wird benannt und als nicht
  auswertbar abgelehnt, statt still zu bestehen.
- Enthält der Wert `self-hosted`, muss mindestens ein deklariertes Capability-Label dabei
  sein. `linux`, `x64` und `Linux`/`X64` zählen ausdrücklich **nicht** als Capability.
- Die Capability-Label-Deklaration steht als Tabelle im Skriptkopf: Label, bezeichnete lokale
  Abhängigkeit, adressierende Jobs. Aktuell einziger Eintrag: `fleet-gpu` — lokale GPU auf
  `wsl-gpu-host`, adressiert von `opencode.yml` und `arbitration.yml`.
- Ausgabe nennt bei jedem Verstoß Datei, Jobname und den gefundenen `runs-on`-Wert. Exit 1 bei
  mindestens einem Verstoß, Exit 0 sonst.
- Ohne Netzzugriff lauffähig halten — der Guard läuft in der PR-CI auch für Fork-PRs.

## Task 3 — Inventur-Abgleich als Skript

`scripts/ci/runner-inventory-check.sh` neu anlegen (design.md D4 — bewusst **kein** Required
Check, weil der GitHub-API-Zugriff bei Fork-PRs kein Secret hat):

- Registrierte Runner über `gh api repos/{owner}/{repo}/actions/runners` lesen.
- Je Runner prüfen, ob mindestens ein Job eines seiner Nicht-generischen Labels anfordert.
- Runner ohne adressierenden Job namentlich als unzugewiesen ausweisen, mit seinen Labels.
- Umgekehrt: in Workflows angefordertes Capability-Label, das kein registrierter Runner trägt,
  ebenfalls melden — solche Jobs würden unbegrenzt in der Queue stehen.
- Fehlt `gh` oder die Authentisierung, mit klarer Meldung und eigenem Exit-Code abbrechen,
  statt eine leere Runnerliste als „alles in Ordnung" zu werten.

## Task 4 — Kopfkommentar in provision-gh-runner.sh berichtigen

Der Kopf begründet das Skript mit zwei Runnern unter identischen generischen Labels und der
daraus folgenden zufälligen Zuteilung (T012414). Diese Begründung entfällt mit der
Capability-Label-Regel:

- Beschreiben, dass die Zuteilung jetzt über Capability-Labels bestimmt wird und das Skript
  die **Ausstattung** des jeweiligen Runners sicherstellt, nicht mehr die Gleichheit zweier
  Hosts.
- Auf `scripts/ci/runner-placement-check.sh` und das Requirement in `openspec/specs/ci-cd.md`
  verweisen.
- Keine funktionale Änderung am Skript, nur der Kommentar.

## Task 5 — Guard in die CI einhängen

- `scripts/ci/runner-placement-check.sh` über die bestehende BATS-Spec ausführen lassen; ein
  eigener Workflow-Job ist nicht nötig, weil `tests/spec/` bereits im Gate `test-bats` läuft.
- Prüfen, dass der neue Test tatsächlich vom Gate erfasst wird
  (`task test:inventory` und die erzeugte Inventardatei kontrollieren).
- Keine Required-Check-Namen ändern.

## Task 6 — gekko-hetzner-3 deregistrieren (Nutzer-Gate)

**Nicht ohne ausdrückliche Freigabe ausführen** (design.md D3). Die Deregistrierung ändert die
GitHub-Konfiguration des Repositories und entzieht Kapazität.

- Aktuellen Stand vorlegen: `bash scripts/ci/runner-inventory-check.sh` ausführen und die
  Ausgabe zeigen, die `gekko-hetzner-3` als unzugewiesen ausweist.
- Bestätigen lassen, dass kein PR-Branch mehr offen ist, dessen Workflow-Stand den generischen
  Pool adressiert — solche Branches stammen von vor PR #4785 und würden nach der
  Deregistrierung in der Queue hängen bleiben.
- Erst nach Freigabe: Runner auf dem Host über `config.sh remove` deregistrieren.
- Der Host bleibt unverändert Cluster-Worker und GitLab-Runner-Node
  (`nodeAffinity: gekko-hetzner-3/4`) — daran wird nichts geändert.
- Bleibt die Freigabe aus, wird das im PR-Body festgehalten. Der Workflow-seitige Guard ist
  davon unabhängig wirksam.

**Stand: offen — Freigabe steht aus.** Die Inventur belegt den Befund:

```
$ bash scripts/ci/runner-inventory-check.sh
UNZUGEWIESEN: Runner 'gekko-hetzner-3' (online) — Labels: self-hosted,Linux,X64,gekko
              Kein Job fordert eines seiner Capability-Labels an.
OK: Runner 'wsl-gpu-host' wird ueber 'fleet-gpu' adressiert.
runner-inventory-check: 1 Abweichung(en).   # exit 1
```

Die Deregistrierung selbst ist nicht ausgeführt — sie ändert die GitHub-Konfiguration des
Repositories und entzieht Kapazität. Der Workflow-seitige Guard aus Task 2 wirkt unabhängig
davon: er verhindert, dass ein Job den generischen Pool überhaupt anfordert.

## Task 7 — Abschließende Verifikation

- [x] **Final Verification.** Run the mandatory gates:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/runner-role-assignment.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/hybrid-runner-placement.bats
bash scripts/ci/runner-placement-check.sh
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
```

`components/website/src/data/test-inventory.json` ausdrücklich mitstagen; keine anderen
Freshness-Artefakte blind übernehmen.
