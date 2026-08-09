---
title: "plan-qa-check: Erreichbarkeit gegen /livez statt /health prüfen"
ticket_id: T002641
domains: [scripts, test]
status: plan_staged
---

# plan-qa-livez-probe — Implementation Plan

## File Structure

| Datei | Rolle |
|---|---|
| `scripts/plan-qa-check.sh` | Erreichbarkeits-Probe von `/health` auf `/livez` umstellen |
| `tests/spec/dev-flow-plan/plan-qa-livez-probe.bats` | Nachweis — liegt bereits rot vor |

`scripts/plan-qa-check.sh` steht bei 227 Zeilen und ist nicht gebaselinet; wirksame Schwelle ist
damit das `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`, Budget 573. Die Änderung betrifft
eine Zeile plus Kommentar — kein Split nötig.

## Partials

| Partial | Rolle | target_files |
|---|---|---|
| p1 | Probe umstellen | `scripts/plan-qa-check.sh` |
| p2 | Nachweis und Verifikation | `tests/spec/dev-flow-plan/plan-qa-livez-probe.bats` |

Die `target_files` sind disjunkt.

<!-- vitest: kein neuer Test nötig, weil der Vorgang ausschließlich ein Shell-Skript
     berührt und keine Datei unter website/src/ anfasst. -->

---

## Task 1 (p2): Rot-Stand feststellen

Die Testdatei `tests/spec/dev-flow-plan/plan-qa-livez-probe.bats` ist bereits geschrieben und
liegt im Branch. Sie startet einen Fake-Gateway, der `/livez` mit 200 und `/health` mit 503
beantwortet — also einen lebenden Proxy mit degradierter Readiness — und prüft die Ausgabe des
Skripts.

Der Rot-Stand wird vor der Änderung bestätigt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-livez-probe.bats
# expected: FAIL — Test 1 und Test 3 melden "not reachable", weil die Probe /health prüft
```

Gemessener Ausgangsstand: Test 1 und Test 3 rot, Test 2 grün. Test 2 sichert den Fall ab, der
erhalten bleiben muss — ein tatsächlich gestoppter Proxy wird weiterhin als „not reachable"
gemeldet, und die advisory Stufe liefert dabei Exit 0.

Zwei Eigenheiten sind in der Datei bereits berücksichtigt und dürfen bei Änderungen nicht
verloren gehen:

- Der Port wird vom Kernel zugewiesen statt fest gewählt. Unter WSL2 sind Bereiche wie
  49152–49251 von Hyper-V reserviert und liefern `EADDRINUSE` ohne sichtbaren Lauscher.
- Auf die Bereitschaft des Fake-Gateways wird per Polling gewartet, nicht mit festem `sleep`
  (fixe Wartezeiten auf Test-HTTPServer sind als Flake-Quelle bekannt, siehe T002850).

Syntaxprüfung erfolgt mit `bats --count`, nicht mit `bash -n` — letzteres kann `@test`-Blöcke
nicht parsen und meldet einen irreführenden Fehler:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/dev-flow-plan/plan-qa-livez-probe.bats
```

---

## Task 2 (p1): Probe auf /livez umstellen

In `scripts/plan-qa-check.sh` prüft die Erreichbarkeitsabfrage künftig `/livez` statt `/health`.

Der `-f`-Schalter bleibt erhalten. Er war unter T002595 gesetzt worden, damit ein 503 nicht als
Erfolg durchgeht und der Fehlschlag erst im POST auffällt; gegen `/livez` behält er genau diese
Wirkung und trennt weiterhin „Prozess antwortet" von „niemand da". Was entfällt, ist allein die
Verwechslung der Readiness eines einzelnen Backends mit der Erreichbarkeit des Proxys.

Der vorhandene Kommentar über dem Aufruf beschreibt derzeit die alte Begründung und wird
ersetzt: er hält künftig fest, dass `/livez` Liveness misst, `/health` dagegen Readiness meldet
und bei fehlendem Prio-1-Backend 503 liefert, obwohl der Dienst läuft. Der Verweis auf die
gleichlautende Korrektur in `taskfiles/Taskfile.llm.yml` (T002336) gehört dazu, damit die Lehre
beim nächsten Leser nicht erneut verloren geht.

Die Warnmeldung im Skip-Zweig bleibt unverändert — sie ist nach der Umstellung wieder zutreffend,
weil sie dann nur noch bei einem wirklich nicht antwortenden Gateway erscheint.

Nicht Teil dieses Vorgangs: die nachgelagerte Modellverfügbarkeit. Ist das QA-Modell durch einen
`exclusive_conflict` blockiert, antwortet der Gateway mit HTTP 409 und nennt im Body den nötigen
Stop-Befehl; das Skript gibt diesen Body im bestehenden Zweig bereits aus. Die Diagnose lautet
danach „Gateway returned HTTP 409: …" statt „not reachable", was Test 3 prüft.

---

## Task 3: Grün-Nachweis und Verifikation

Die Tests aus Task 1 laufen jetzt vollständig grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-livez-probe.bats
```

Beide Formen der BATS-Konvention erfassen — Sammeldatei und Verzeichnis sind gleichzeitig
gültig, eine Suche nach nur einer Form findet die Hälfte:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan*
```

Gegenprobe am realen Gateway, sofern der llm-proxy lokal läuft: `/livez` liefert 200 und
`/health` 503, und ein Lauf des Skripts meldet nicht mehr „not reachable".

Test-Inventar regenerieren und mitcommitten, sonst schlägt der CI-Inventar-Check fehl:

```bash
task test:inventory
```

Abschließende Pflicht-Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
