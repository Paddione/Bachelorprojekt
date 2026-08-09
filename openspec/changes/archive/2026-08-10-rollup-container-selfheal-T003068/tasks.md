---
title: "rollup-container: Selbstheilung bei leerer Trefferliste (pipefail-Fix)"
ticket_id: T003068
domains: [scripts, test]
status: plan_staged
---

# rollup-container-selfheal-T003068 — Implementation Plan

## File Structure

| Datei | Rolle |
|---|---|
| `scripts/ticket.sh` | `cmd_rollup_container`-Suchzeile gegen leere Trefferliste absichern (`\|\| true`) |
| `tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats` | Guard-Test — liegt bereits rot vor |

`scripts/ticket.sh` steht auf der `s1.ignore`-Liste in `docs/code-quality/gates.yaml` ("sanctioned
single-file CLI") — kein S1-Budget anwendbar. Die Änderung selbst ist eine Zeichenkette
(`\|\| true`) an einer bestehenden Zeile, kein Zeilenzuwachs, der ein Budget triggern könnte.

<!-- vitest: kein neuer Test nötig, weil der Vorgang ausschließlich ein Shell-Skript berührt und
     keine Datei unter website/src/ anfasst. -->

---

## Task 1: Rot-Stand feststellen

Die Testdatei `tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats` ist bereits
geschrieben und liegt im Branch. Sie mockt `kubectl` (repo-Idiom, siehe
`tests/spec/feature-product-linking.bats`) so, dass die Suchzeile in `cmd_rollup_container` eine
leere Trefferliste liefert — exakt die Bedingung, die T003068 auslöst — und prüft per
Command-Output-Verifikation (T002448-M4: `$status`/`$output`, kein Source-Grep), dass der
Anlege-Pfad (Step 2) erreicht wird.

Der Rot-Stand wird vor der Änderung bestätigt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats
# expected: FAIL — `[ -n "$output" ]` schlägt fehl, weil die Pipeline unter `set -euo pipefail`
# vor jeder Ausgabe abbricht (grep -v liefert Exit 1 bei leerem Input).
```

Gemessener Ausgangsstand (bereits während der Planung verifiziert): Test rot mit exakt dieser
Meldung, gegen den unveränderten `scripts/ticket.sh`.

Randbedingung: T003067 ist der aktuell einzige offene kanonische Rollup-Container und darf durch
diesen Test nicht berührt werden — der Test läuft vollständig gegen den gemockten `kubectl` und
schreibt/liest keine echte Ticket-Zeile.

Syntaxprüfung erfolgt mit `bats --count`, nicht mit `bash -n` — letzteres kann `@test`-Blöcke
nicht parsen:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats
```

---

## Task 2: Suchzeile gegen den Leerfall absichern

In `scripts/ticket.sh`, Funktion `cmd_rollup_container` (aktuell Zeile ~1004-1010), endet die
Suchzeile mit `| grep -v '^$' | head -1)`. Diese Pipeline wird um `|| true` ergänzt:

```bash
ext_id=$(_exec_sql "$pod" -c "
    SELECT external_id FROM tickets.tickets
     WHERE type = 'chore'
       AND title = 'Mishap Rollup — fortlaufende Sammlung'
       AND status IN ('triage','backlog','planning','plan_staged','in_progress')
     ORDER BY created_at ASC LIMIT 1;
  " 2>/dev/null | grep -v '^$' | head -1 || true)
```

Dies ist die im Ticket vorgeschlagene und im Rahmen der Planung bereits gegen den Guard-Test
grün verifizierte Korrektur (siehe `design.md` §Fix-Ansatz für die verworfene Alternative). Der
nachfolgende `if [[ -n "$ext_id" ]]; then … fi`-Zweig bleibt unverändert — er behandelt sowohl
den gefundenen als auch den leeren Fall bereits korrekt, sobald die Pipeline nicht mehr vorzeitig
abbricht.

Keine weitere Zeile in `cmd_rollup_container` ist betroffen: Step 2 (Anlegen über
`bash ticket.sh create …`) existiert bereits und ist ungetestet nur deshalb nie erreicht worden.

Nach der Änderung läuft der Guard-Test grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats
```

---

## Task 3: Regressionsnachweis gegen bestehende rollup-container-Tests

Der Fix darf den Fall "ein offener Container existiert bereits" nicht verändern — dieser Zweig
wird von bestehenden Tests abgedeckt und muss weiterhin grün laufen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup*
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration.bats
```

Beide Formen der BATS-Konvention erfassen (Sammeldatei und Verzeichnis sind gleichzeitig
gültig):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup*
```

Zusätzlich, sofern der lokale Dev-Cluster (`k3d-mentolder-dev`) erreichbar ist, eine manuelle
Gegenprobe gegen den echten Rollup-Container-Zustand — **ohne T003067 zu verändern**: nur ein
Lesevorgang, kein Schreibzugriff.

```bash
kubectl --context k3d-mentolder-dev get nodes >/dev/null 2>&1 && \
  bash scripts/ticket.sh rollup-container --brand mentolder
# erwartungsgemäß: findet T003067 (bereits offen), Exit 0, keine Neuanlage.
```

---

## Task 4: Final Verification

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
