---
title: llm-proxy BATS-Suiten lokal rot — Root-Cause & Fix-Ansatz
ticket_id: T002872
domains: [ops]
status: planning
---

# llm-proxy BATS-Suiten lokal rot — Root-Cause & Fix-Ansatz

## Symptom vs. Hypothese (T002448-M5)

Das Ticket nennt zwei rote Tests in einem Satz und verknüpft sie mit der Health-Warnung
G-LLM03 (Konfig-gegen-Laufzeit-Drift). Beide Aussagen wurden getrennt geprüft:

- **Symptom (Fakt, Ticket-Text):** `loadout-model-files-exist.bats` (T002753) und
  `ui-config-seed.bats` schlugen im Checkout des Ticket-Erstellers fehl — "reproduziert".
- **Hypothese (im Ticket, ungeprüft):** beide Fehlschläge sind derselbe echte
  Konfig-gegen-Laufzeit-Drift (G-LLM03).

## Verifikation

### Teil 1: T002753 (loadout-model-files-exist.bats)

Bereits **erledigt** durch T002886 (`status=done, resolution=fixed`, gemerged 2026-08-09,
`c109c461c` "fix(ops): align loadouts registry with model files on disk [T002886] (#3953)",
`touched_files` enthält genau `tests/spec/local-llm-proxy/loadout-model-files-exist.bats` und
`scripts/llm/loadouts.json`). Aktueller Testlauf bestätigt: Test 63 "T002753: jedes Loadout
loest seine Modelldatei auf" und Test 55 "T002886: jede deklarierte mmproj-/draft-Datei loest
auf" sind grün. Dieser Teil des Tickets ist damit vollständig durch T002886 abgedeckt — kein
weiterer Fix-Bedarf, keine Doppelarbeit.

### Teil 2: ui-config-seed.bats

Der Test wurde 5x hintereinander ausgeführt — isoliert (`bats
tests/spec/local-llm-proxy/ui-config-seed.bats`) und im vollen Suite-Kontext (`bats -r
tests/spec/local-llm-proxy*`, beide Konventionsformen erfasst). **Alle 5 Läufe grün.** Ein
echter Konfig-gegen-Laufzeit-Drift ließ sich damit nicht reproduzieren — die G-LLM03-Hypothese
für diesen Teil ist **widerlegt**.

Stattdessen zeigt der Testcode selbst (`tests/spec/local-llm-proxy/ui-config-seed.bats:34-58`)
drei Fragilitätsquellen, die einen einmaligen Fehlschlag ohne echten Konfig-Fehler erklären:

1. **Nichtdeterministische Modellwahl** (Zeile 35): `find ~/models/gguf … -name "*.gguf" |
   head -n 1` nimmt die erste im Dateisystem gefundene GGUF-Datei — aktuell ein 12B-Modell
   (`gemma4-12qat/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf`). Die Ladezeit hängt damit vom
   Dateisystem-Cache-Zustand und der zufällig getroffenen Modellgröße ab, nicht von einer
   bewusst gewählten, kleinen Testfixture.
2. **Festes Zeitbudget ohne Marge** (Zeile 46-52): 40 × 0.25 s = 10 s Health-Wait, unabhängig
   von der Modellgröße. Ein Kaltstart des größten verfügbaren Modells kann dieses Budget
   überschreiten, obwohl der Proxy/Server selbst gesund ist.
3. **Reale Ressourcen-Konkurrenz auf dem Host**: zum Testzeitpunkt liefen bereits zwei
   produktive `llama-server`-Prozesse (`gptoss-context` :8098, `bge-embed-cpu` :8095), die
   CPU/RAM mit dem kurzlebigen Testserver teilen.

Diese drei Faktoren erklären einen plausiblen einmaligen Fehlschlag rein aus Timing/Ressourcen,
ohne dass Konfiguration und Laufzeit auseinanderlaufen. Root Cause dieses Tickets für Teil 2 ist
damit **Testrobustheit**, nicht Konfig-Drift.

### Abgrenzung zu T002663

Die Factory-Auto-Triage meldete am selben Tag 28x "KI-Aufruf fehlgeschlagen". Das ist ein
separater Pfad: `factory-mcp` reicht `apiKeyEnv` nicht durch (Slot-Leak), bereits unter T002663
geplant. Kein gemeinsamer Root Cause mit diesem Ticket — nicht verwechseln, hier nicht
mitgefixt.

## Fix-Ansatz (WAS)

Ziel: `ui-config-seed.bats` deterministisch und robust gegen Host-Ressourcenlast machen, ohne
den Test seiner Aussagekraft zu berauben (er soll weiterhin einen echten `llama-server` mit
Seed-Datei starten und `ui_settings.mcpServers` sowie `cors_proxy_enabled` prüfen).

1. **Deterministische, kleine Modellwahl:** neuer Helper
   `tests/spec/local-llm-proxy/lib/pick-small-model.sh` mit Funktion
   `pick_small_test_model <root...>`, die alle `*.gguf`-Dateien unter den übergebenen
   Modell-Roots sammelt, `mmproj-*`- und `*draft*`-Dateien ausschließt (gleiche Konvention wie
   die bestehende Nebendatei-Erkennung aus T002886) und die **kleinste** Datei per Byte-Größe
   zurückgibt (`stat -c%s` / `wc -c` Fallback). Kleinste Datei = kürzeste, vorhersagbare
   Ladezeit unabhängig vom Cache-Zustand.
2. **Skalierendes Zeitbudget:** die Health-Wait-Schleife in `ui-config-seed.bats` leitet ihr
   Budget aus der Dateigröße des gewählten Modells ab (Basis 10 s + 1 s je angefangene 200 MiB,
   Deckel 60 s) statt eines festen 10-s-Budgets.
3. **Test für den neuen Helper (RED zuerst):** `pick-small-model-deterministic.bats` prüft
   Positiv-Anker (kleinste Nicht-Hilfsdatei wird gewählt) UND Negativ-Anker (mmproj-/draft-
   Dateien werden nie zurückgegeben) in einer temporären Fixture-Verzeichnisstruktur — ohne
   Abhängigkeit von echten Modell-Dateien auf der Platte, damit der Test auch ohne GPU-Host
   deterministisch läuft.
4. `ui-config-seed.bats` wird auf den neuen Helper umgestellt (Ersatz für Zeile 34-52).

Nicht Teil dieses Change: der reale Konfig-Runtime-Pfad des Proxys/der Loadouts (dort besteht
kein belegter Drift), und T002663 (separater Vorgang).

## Betroffene Dateien

- `tests/spec/local-llm-proxy/lib/pick-small-model.sh` (neu)
- `tests/spec/local-llm-proxy/pick-small-model-deterministic.bats` (neu, RED zuerst)
- `tests/spec/local-llm-proxy/ui-config-seed.bats` (Umstellung auf Helper + skalierendes Budget)
- `website/src/data/test-inventory.json` (Regenerierung, CI-Pflicht bei neuen Tests)

_Ticket: T002872_
