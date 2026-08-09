---
title: llm-proxy-bats-local-red
ticket_id: T002872
domains: [ops]
status: plan_staged
---

# llm-proxy-bats-local-red — Implementation Plan

## File Structure

```
tests/spec/local-llm-proxy/lib/pick-small-model.sh        (neu, ~40 Zeilen, nicht gebaselined)
tests/spec/local-llm-proxy/pick-small-model-deterministic.bats  (bereits committed, RED)
tests/spec/local-llm-proxy/ui-config-seed.bats             (Ist 96 Zeilen, nicht gebaselined -> Budget = Extension-Limit .bats aus gates.yaml minus Ist)
website/src/data/test-inventory.json                       (Regenerierung via task freshness:regenerate)
```

## Kontext (siehe design.md)

Root-Cause-Verifikation (T002448-M5) ist abgeschlossen:

- **T002753-Teil** des Tickets ist bereits durch T002886 (`status=done`, gemerged
  `c109c461c`) behoben — kein weiterer Task hier. Test 63/65 der Suite laufen grün.
- **ui-config-seed.bats-Teil**: 5/5 lokale Läufe grün, kein reproduzierbarer
  Konfig-gegen-Laufzeit-Drift (G-LLM03-Hypothese widerlegt). Root Cause ist Testfragilität:
  nichtdeterministische Modellwahl (`find | head -n1`) + festes 10s-Zeitbudget + reale
  Ressourcenkonkurrenz auf dem Host. Fix-Richtung: Testrobustheit, nicht Konfiguration.

## Task 1 (p1) — Helper `pick-small-model.sh` implementieren (GREEN machen)

Der Failing-Test `tests/spec/local-llm-proxy/pick-small-model-deterministic.bats` ist bereits
im Stage-Commit enthalten und aktuell ROT, weil der Helper fehlt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/pick-small-model-deterministic.bats
# expected: FAIL (2 von 2 Tests: "[ -f "${HELPER}" ]' failed")
```

Implementiere `tests/spec/local-llm-proxy/lib/pick-small-model.sh` mit der Bash-Funktion
`pick_small_test_model <root...>`:
- Sammelt alle `*.gguf` unter den übergebenen Root-Verzeichnissen (rekursiv, `find`).
- Schließt Dateien mit Namensmuster `mmproj-*` oder `*draft*` aus (gleiche Konvention wie die
  bestehende Nebendatei-Erkennung aus T002886, siehe `scripts/llm-proxy/models.mjs`).
- Ermittelt die Dateigröße je Kandidat (`stat -c%s` mit Fallback `wc -c` für Nicht-GNU-Stat)
  und gibt den Pfad der **kleinsten** Datei auf stdout aus.
- Bleiben keine Kandidaten übrig: Exit-Code 1, keine Ausgabe (Test 2 des RED-Files verlangt
  genau dieses Verhalten).

`| \`tests/spec/local-llm-proxy/lib/pick-small-model.sh\` | 0 (neu) | nicht-baselined — Extension-Limit .sh aus gates.yaml |`

Verifikation:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/pick-small-model-deterministic.bats
# expected: beide Tests PASS
```

## Task 2 (p1) — ui-config-seed.bats auf Helper + skalierendes Zeitbudget umstellen

Ersetze in `tests/spec/local-llm-proxy/ui-config-seed.bats` (aktuell 96 Zeilen, nicht
gebaselined -> Budget = Extension-Limit `.bats` aus `gates.yaml` minus 96) die Zeilen 34-52
(nichtdeterministische `find | head -n1`-Modellwahl + festes 10s-Budget):

- `source` den neuen Helper und rufe `pick_small_test_model` mit den bestehenden Modell-Roots
  (`~/models/gguf`, `/mnt/c/Users/PatrickKorczewski/.lmstudio/models`) auf; bei leerer Rückgabe
  wie bisher `skip "No GGUF model file found to launch short-lived llama-server"`.
- Leite das Health-Wait-Budget aus der Dateigröße ab: `loops = 40 + (size_mib / 200)`, Deckel
  240 Loops (entspricht 60s bei 0.25s-Intervall), Rest der Wartelogik (Zeile 44-59) bleibt
  strukturell erhalten.
- Kommentarzeile ergänzen, die auf T002872 und die Root-Cause-Analyse in `design.md` verweist,
  damit ein künftiger Leser nicht erneut vermutet, das feste Budget sei Konfig-Drift.

Verifikation:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
# expected: alle Tests inkl. "Task 8: llama-server liefert ui_settings.mcpServers aus seed" PASS
```

## Task 3 (tests) — Test-Inventar & finale Verifikation

```bash
task test:inventory        # regeneriert website/src/data/test-inventory.json fuer die 3 neuen/geaenderten Testdateien
task test:changed
task freshness:regenerate
task freshness:check
```

Prüfe zusätzlich, dass die ursprünglich im Ticket genannten Tests weiterhin grün sind:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
```
