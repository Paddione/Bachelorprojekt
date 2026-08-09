# Proposal: llm-proxy-bats-local-red

## Why

T002872 meldete zwei lokal rote BATS-Tests unter `tests/spec/local-llm-proxy/` und verknüpfte
sie mit der Health-Warnung G-LLM03 (Konfig-gegen-Laufzeit-Drift). Beide Teile wurden getrennt
verifiziert (T002448-M5: Symptom vs. Hypothese):

1. **T002753** (`loadout-model-files-exist.bats`) ist bereits durch T002886
   (`status=done, resolution=fixed`, gemerged `c109c461c`, 2026-08-09) behoben. Aktueller
   Testlauf: grün.
2. **`ui-config-seed.bats`** lief 5/5 mal lokal grün — kein reproduzierbarer
   Konfig-gegen-Laufzeit-Drift. Die G-LLM03-Hypothese ist für diesen Teil widerlegt. Der
   Testcode selbst ist fragil: nichtdeterministische Modellwahl (`find … | head -n1`, aktuell
   ein 12B-Modell), festes 10s-Zeitbudget ohne Marge für Kaltstart, reale
   Ressourcenkonkurrenz mit bereits laufenden `llama-server`-Prozessen auf dem Host. Das
   erklärt einen einmaligen Fehlschlag rein aus Timing, ohne dass Konfiguration und Laufzeit
   auseinanderlaufen.

Root Cause dieses Tickets ist damit **Testrobustheit** von `ui-config-seed.bats`, nicht ein
Konfigurationsfehler im Proxy oder in den Loadouts. Details und Belege:
`openspec/changes/llm-proxy-bats-local-red/design.md`.

## What

- Neuer Helper `tests/spec/local-llm-proxy/lib/pick-small-model.sh` mit
  `pick_small_test_model()`: wählt deterministisch die kleinste `*.gguf`-Datei unter den
  Modell-Roots, schließt `mmproj-*`/`*draft*` aus.
- `ui-config-seed.bats` nutzt den Helper statt `find | head -n1` und skaliert das
  Health-Wait-Budget mit der gewählten Dateigröße statt eines festen 10s-Fensters.
- Neuer Test `pick-small-model-deterministic.bats` (bereits committed, RED — Helper existiert
  noch nicht) sichert die Auswahl-Logik gegen eine Fixture-Verzeichnisstruktur ab, unabhängig
  von echten Modell-Dateien auf der Platte.

Nicht Teil dieses Change: der Konfig-Runtime-Pfad des Proxys/der Loadouts (kein belegter Drift
dort) und T002663 (separater Vorgang, factory-mcp reicht `apiKeyEnv` nicht durch).

_Ticket: T002872_
