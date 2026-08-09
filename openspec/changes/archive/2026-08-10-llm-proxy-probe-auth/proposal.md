# Proposal: llm-proxy-probe-auth

## Why

Der Health-Probe des Proxy ruft `GET {baseUrl}/models` ohne `Authorization`-Header auf
(`scripts/llm-proxy/discovery.mjs`). Jedes `openai-remote`-Backend mit Pflicht-Auth antwortet
darauf mit 401; `probeBackend` fängt das im `catch {}` ab und meldet `healthy: false`. Das
Backend gilt damit dauerhaft als tot, obwohl Anfragen dorthin funktionieren würden — der
**Weiterleitungspfad** (`server.mjs`) führt das Credential über `resolveApiKey()` korrekt mit.
Probe und Forwarding sprechen dasselbe Backend, aber nur einer der beiden Pfade kennt den Key.

Symptom und Ursache sind getrennt belegt (T002448-M5):

- **Symptom (Fakt, reproduziert):** `/health` listet `deepseek` in `degraded`, obwohl
  `DEEPSEEK_API_KEY` im Prozess-Environment gesetzt ist.
- **Ursache (belegt, nicht angenommen):** `https://api.deepseek.com/v1/models` antwortet ohne
  Auth mit **401**, mit Auth mit **200** (gemessen 2026-08-04). Zusätzlich Rot-Grün-Gegenprobe:
  der neue Test wird gegen die unreparierte Fassung rot und gegen die reparierte grün.

**Folge:** Die Fallback-Kette (lokal → deepseek → opencode-zen) kann nie auf ein Remote-Backend
ausweichen. Das entwertet ein bereits spezifiziertes Verhalten des SSOT-Spec — das Szenario
„Local primary backend is down while a cloud fallback is healthy" unter *Health endpoint reports
readiness, not liveness* ist unter dieser Implementierung nicht erreichbar. Beobachtet als
realer Ausfall am 2026-08-02 (siehe Kopfkommentar in
`tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats`).

Zweiter Befund derselben Untersuchung: `probeBackend` bildet 401, Timeout und DNS-Fehler auf
denselben stummen Zustand ab. Eine Auth-Fehlkonfiguration ist damit von Unerreichbarkeit nicht
unterscheidbar — genau der Grund, warum der Defekt unbemerkt blieb.

Dritter Befund, gleiche Klasse wie T002336: Von neun Testdateien unter `scripts/llm-proxy/`
liefen **drei** (`exclusive-conflict`, `fixups`, `strip-markers`, zusammen 19 Tests) in keinem
Taskfile-Target und keinem CI-Job. Die Dateiliste in `test:llm-proxy` ist handgepflegt und
deshalb strukturell unvollständig. T002336 hat dieses Muster schon einmal repariert, ohne es
gegen Wiederholung abzusichern.

## What

- `probeBackend` führt dasselbe Credential wie der Weiterleitungspfad — `resolveApiKey(backend)`
  als `Authorization: Bearer …`, sofern das Backend ein `apiKeyEnv` deklariert. Backends ohne
  `apiKeyEnv` (lokale llama.cpp-Server) senden weiterhin keinen Header.
- Ein Wechsel nach `unhealthy` wird **einmalig beim Zustandsübergang** mit Grund protokolliert,
  nicht bei jedem Probe-Durchlauf. Damit ist ein 401 von einem Timeout unterscheidbar, ohne dass
  das Intervall-Polling das Journal flutet.
- Ein Guard hält die handgepflegte Testdatei-Liste gegen die tatsächlich vorhandenen Dateien:
  jede `scripts/llm-proxy/*.test.mjs` muss in `Taskfile.yml` **und** `.github/workflows/ci.yml`
  registriert sein. Die drei bisher unregistrierten Dateien werden nachgetragen.

Nicht Teil dieses Change: die Backend-Registry (`tickets.llm_proxy_backends`) selbst, der
`opencode-zen`-Shim auf `:5099` und die veralteten `model_aliases` der Zeile `llamacpp-gemma` —
das sind Datenzustände, keine Codefehler, und sie gehören in eigene Vorgänge.

_Ticket: T002638_
