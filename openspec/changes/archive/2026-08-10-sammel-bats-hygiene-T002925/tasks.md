---
title: "sammel-bats-hygiene-T002925 — Implementation Plan"
ticket_id: T002925
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sammel-bats-hygiene-T002925 — Implementation Plan

_Ticket: T002925_

## File Structure

```
tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats   (bereits committet als RED-Test)
tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats     (bereits committet als RED-Test)
scripts/agent-guide/emit-maps.mjs                            (geändert — Tempdir-Ausgabepfad)
tests/spec/agent-roster.bats                                 (geändert — P4.5 nutzt Tempdir-Vergleich)
tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats       (geändert — aktives Port-Polling statt sleep 1)
docs/superpowers/references/gotchas-footguns.md               (ergänzt — T002878-Notiz, siehe Task 3)
```

## Gemeinsame Wurzel

T002834 und T002850 verletzen dieselbe Erwartung an eine Assertion, die die
Positiv-Anker-Pflicht (T002356-M1) eigentlich absichert: eine Assertion soll ausschließlich
über die geprüfte Sache entscheiden. T002834 lässt einen räumlichen Nebeneffekt zu (mutierter
Arbeitsbaum), T002850 einen zeitlichen (fester Sleep statt Bereitschaftsprüfung). Beide Fixes
entkoppeln den Test von der jeweiligen Fehlerquelle, ohne die eigentliche geprüfte Aussage zu
verändern. Details und Symptom/Hypothese-Trennung: `design.md`.

T002878 ist bereits auf `origin/main` behoben (siehe `proposal.md`) und bekommt hier keinen
eigenen RED-Test — nur die offene Dokumentations-Ergänzung wird als kleine GREEN-Aufgabe ohne
eigenen Test mitgenommen (Task 3).

## Task 1 — T002834: `task agent-guide:maps` schreibt nicht mehr in getrackte Pfade

**RED (bereits erfüllt, Test bereits committet):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats
# expected: FAIL — P4.5 hat getrackte Karten in-place neu geschrieben (mtime geaendert)
```

**GREEN:**

1. `scripts/agent-guide/emit-maps.mjs`: Im CLI-Entrypoint-Block (unterster `if`-Block) den
   `mapsDir`-Wert konfigurierbar machen — Override per Umgebungsvariable
   `AGENT_GUIDE_MAPS_OUT_DIR`, Default bleibt `docs/agent-guide/maps` (unverändert für
   `task agent-guide:maps` im Normalbetrieb; `emitAll()` selbst nimmt `mapsDir` bereits als
   Parameter entgegen und braucht keine Änderung).
2. `tests/spec/agent-roster.bats`, Test „P4.5: agents-map.md ist aktuell" (Zeile 144–149):
   statt `task agent-guide:maps` (schreibt direkt in `docs/agent-guide/maps/`) einen
   temporären Ausgabeordner anlegen (`mktemp -d`), den Emitter mit
   `AGENT_GUIDE_MAPS_OUT_DIR=<tmp> node scripts/agent-guide/emit-maps.mjs` dort hinein laufen
   lassen, und `diff -u` gegen die getrackte `docs/agent-guide/maps/agents-map.md` prüfen statt
   `git diff --exit-code` auf die getrackte Datei. Tempdir am Testende aufräumen (`rm -rf`,
   auch im Fehlerfall — `teardown()` oder `trap`).
3. Freshness-Aussage bleibt erhalten: weicht der Tempdir-Inhalt vom getrackten Stand ab, bleibt
   der Test rot — nur der Seiteneffekt auf den Arbeitsbaum entfällt.

**Nachweis:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats
# expected: PASS — keine mtime-Aenderung auf den vier Karten mehr
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats -f "P4.5"
# expected: PASS — Freshness-Aussage bleibt unveraendert wahr
```

## Task 2 — T002850: `kv-probe-endpoint-guard.bats` wartet aktiv statt fest zu schlafen

**RED (bereits erfüllt, Test bereits committet):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats
# expected: FAIL — wartet noch mit einem festen 'sleep 1' statt aktivem Port-Polling
```

**GREEN:**

1. `tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats`, dritter `@test`-Block (Zeile
   88ff.): das feste `sleep 1` (Zeile 102) durch eine aktive Warteschleife ersetzen, die auf
   beide Ports (`port_ok`, `port_500`) via `/dev/tcp/127.0.0.1/<port>` pollt — kurze
   Schrittweite (z. B. 0.1 s), Obergrenze (z. B. 50 Versuche = 5 s), danach klare
   Timeout-Fehlermeldung statt eines stillen Weiterlaufens in die Probe.
2. Negativfall abfangen: bindet keiner der beiden Ports innerhalb der Obergrenze, schlägt der
   Test mit einer Meldung fehl, die den Timeout benennt — nicht mit der irreführenden
   Positiv-Anker-Meldung „HTTP 200 wurde als nicht verfügbar gewertet".

**Nachweis:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats
# expected: PASS — aktives Port-Polling statt fixem sleep 1 nachgewiesen
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats
# expected: PASS — alle drei Tests der Datei weiterhin gruen
```

## Task 3 — T002878: offene Dokumentations-Ergänzung (kein RED-Test, reine GREEN-Aufgabe)

Der Code-Fix (`return 0` in `_workflows_with_paths()`) ist bereits auf `origin/main`
(`tests/spec/ci-cd/workflow-self-trigger.bats`, PR #3945). Offen ist nur der im Ticket T002878
genannte Dokumentations-Vorschlag: einen kurzen Eintrag in
`docs/superpowers/references/gotchas-footguns.md` ergänzen, der das Muster „Helper-Funktion
ohne explizites `return 0` trägt den Exit-Code des letzten `grep`-Aufrufs nach außen und lässt
den Positiv-Anker aus dem falschen Grund rot werden" benennt — mit Verweis auf T002878 und das
angewandte Fix-Muster (explizites `return 0` mit Kommentar). Keine Testverhaltensänderung,
deshalb kein eigener RED-Test; die Ergänzung ist Prosa und wird im Review gegen die Vorlage der
bestehenden Gotchas-Einträge geprüft.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Beide BATS-Tests wurden bereits geschrieben und laufen rot
      auf dem aktuellen Branch — siehe Task 1 und Task 2 oben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-test-no-tracked-file-mutation.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats
# expected: FAIL (rot — beide Fixes sind noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Task 1, Task 2 und Task 3 implementieren. Beide RED-Tests aus
      Task 1/2 müssen danach grün laufen, ebenso die davon betroffenen Bestandstests
      (`tests/spec/agent-roster.bats -f "P4.5"`,
      `tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats`).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Related / Out of Scope

- **T002878** — Code-Fix bereits auf `origin/main`; nur Task 3 (Dokumentation) bleibt offen,
  ohne eigenen RED-Test.
- **T002922** (CI führt cluster-abhängige `tests/spec/*.bats` nie tatsächlich aus) — verwandter
  Themenkreis, eigener größerer Vorgang, nicht Teil dieses Plans.
- **T002723** (Skip-Guard prüft Kontextnamen statt Erreichbarkeit) — verwandt, eigenes Ticket.
