# Design: Hybrid GitHub Actions runners

## Context

PR #4779 verschob generische PR-Jobs auf zwei self-hosted Runner. PR #4781 beseitigt die
dabei sichtbar gewordenen Root-, Tool-Paritäts- und Fork-Sicherheitsprobleme. Die verbleibende
Grenze ist Kapazität: Jeder registrierte GitHub-Actions-Runner führt jeweils nur einen Job
aus, während `.github/workflows/ci.yml` mehr als zehn gleichzeitig ausführbare Jobs erzeugt.

Die Jobs unterscheiden sich dabei grundlegend:

- Portable Gates benötigen nur einen sauberen Linux-Runner und öffentlich installierbare
  Werkzeuge.
- Spezialisierte Jobs benötigen lokale GPU-Endpunkte oder ausdrücklich private
  Host-Infrastruktur.

Eine einzelne gemeinsame Runner-Klasse bildet diesen Unterschied nicht ab.

## Goals and non-goals

### Goals

- PR-Gesamtdauer durch zusätzliche GitHub-hosted Parallelität reduzieren.
- Die zwei self-hosted Slots für tatsächlich lokale Workloads freihalten.
- Required Checks, Testumfang, Pins und Fail-closed-Verhalten erhalten.
- Fork-Code nicht unnötig auf eigener Hardware ausführen.
- Runner-Platzierung durch Tests statt Kommentare dauerhaft absichern.

### Non-goals

- Keine zusätzlichen self-hosted Runner-Dienste oder Autoscaling Runner Controller.
- Keine Änderung der GitLab-CI-Runner-Architektur.
- Keine Reduktion der Factory-Shard-Anzahl oder Entfernung bestehender Gates.
- Keine Optimierung der Testimplementierungen innerhalb der Jobs.
- Kein automatisches queue-basiertes Fallback; GitHub Actions unterstützt für `runs-on`
  keine OR-Semantik zwischen hosted und self-hosted Pools.

## Decisions

### D1 — Portable PR jobs use `ubuntu-latest`

Alle Jobs, die auf einem frischen Ubuntu-Runner vollständig reproduzierbar sind, werden
explizit `ubuntu-latest` zugewiesen. Dazu gehören die Jobs in `ci.yml`, die bereits vor
#4779 GitHub-hosted liefen, sowie die portablen PR-Hilfsworkflows. Die statischen Jobnamen
bleiben erhalten, damit Branch Protection keine neuen Check-Kontexte verlangt.

### D2 — Local dependencies require specific self-hosted labels

`opencode.yml` und `arbitration.yml` verbleiben auf `[self-hosted, fleet-gpu]`, weil sie den
lokalen LLM/GPU-Pfad verwenden. Kein spezialisierter Job darf auf dem generischen Labelset
`[self-hosted, linux, x64]` beruhen, wenn seine eigentliche Abhängigkeit spezifischer ist.

### D3 — Fork policy follows the execution boundary

Portable, secret-freie Tests dürfen auf GitHub-hosted Runnern auch für Fork-PRs laufen. Jobs
oder Schritte, die Repository-Secrets benötigen oder Schreiboperationen ausführen, behalten
einen expliziten Same-Repository-Guard beziehungsweise die vorhandenen GitHub-Berechtigungs-
und Eventgrenzen. Die Migration darf Fork-Unterstützung nicht versehentlich in einen
Required-Check-Deadlock verwandeln.

### D4 — Preserve workflow semantics

Die Änderung beschränkt sich auf Runner-Platzierung und dadurch notwendige portable
Installationspfade. Jobnamen, Events, Abhängigkeiten (`needs`), Matrix-Shards,
`cancel-in-progress`, Timeouts und Toolversionen bleiben gleich. Installationen dürfen weder
passwortloses `sudo` noch persistente Hostzustände voraussetzen.

### D5 — Guard the intended topology

Ein BATS-Test liest die betroffenen Workflow-Dateien semantisch ausreichend robust und
prüft zwei Positivmengen:

1. definierte portable Jobs verwenden `ubuntu-latest`;
2. definierte lokale Jobs verwenden `self-hosted` plus ihr spezifisches Label.

Der Test prüft zusätzlich, dass die Required-Check-Jobnamen erhalten bleiben. Ein bloßer
globaler Grep nach `self-hosted` wäre ungeeignet, weil lokale Spezialjobs ausdrücklich
weiterbestehen sollen.

### D6 — Measure end-to-end effect

Als Baseline dient ein vollständiger PR-Lauf vor der Migration, mindestens Lauf
`32179927036`. Nach der Migration wird ein vollständiger Lauf mit vergleichbarem Diff über
die Actions-API ausgewertet. Pro Job werden `created_at`, `started_at`, `completed_at` und
`runner_name` erfasst:

- Queue-Zeit = `started_at - created_at`
- Laufzeit = `completed_at - started_at`
- PR-CI-Gesamtdauer = spätestes `completed_at` minus frühestes `created_at`

Das Ziel sind mindestens 40 % weniger Gesamtdauer. Wird es verfehlt, bleibt die funktional
korrekte hybride Platzierung bestehen, aber die Abweichung und der nächste Engpass werden im
PR dokumentiert.

## Rollout

1. Platzierungs-Guard rot hinzufügen.
2. `ci.yml` und kleine PR-Workflows auf GitHub-hosted umstellen.
3. Fork- und Secret-Grenzen pro betroffenem Workflow prüfen.
4. Lokale und Repository-Gates ausführen.
5. PR-CI beobachten und Vorher-/Nachher-Messung dokumentieren.

Rollback ist eine reine `runs-on`-Rückänderung auf den vorherigen Labelstand. Da Jobnamen und
Abhängigkeiten stabil bleiben, ist keine Branch-Protection-Migration nötig.

## Risks

- GitHub-hosted Images können andere vorinstallierte Toolversionen tragen. Gegenmaßnahme:
  vorhandene Pins und explizite Setup-Schritte beibehalten.
- Secret-abhängige Jobs erhalten bei Fork-PRs keine Secrets. Gegenmaßnahme: Same-Repository-
  Guards nur dort behalten, wo der Job tatsächlich Secrets oder Schreibrechte benötigt.
- `ubuntu-latest` kann künftig auf ein neueres Ubuntu-Image zeigen. Das ist bewusst dieselbe
  Betriebsform wie vor #4779; deterministische Werkzeuge bleiben separat gepinnt.
- Mehr echte Parallelität kann versteckte globale Testressourcen sichtbar machen.
  Gegenmaßnahme: keine festen `/tmp`-Pfade, Ports oder externen Testdaten zwischen Jobs teilen;
  auftretende Kollisionen als Testisolationsfehler beheben, nicht durch Re-Serialisierung.

_Ticket: T012446_
