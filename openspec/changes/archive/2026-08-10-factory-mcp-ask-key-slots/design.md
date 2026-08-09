---
title: "factory-mcp-ask-key-slots — Design"
ticket_id: T002663
domains: [bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: factory-mcp `factory_ask` — falscher Key + Slot-Leak

## Root-Cause (verifiziert, zweiter Diagnose-Lauf bestätigt den ersten)

Zwei unabhängige, sich verstärkende Defekte in `scripts/factory/mcp-go/main.go`:

1. **`llmKey()` ignoriert `apiKeyEnv`.** `route-provider.sh` liefert pro Provider ein
   `apiKeyEnv`-Feld (Name der Umgebungsvariable mit dem echten Secret, z. B.
   `DEEPSEEK_API_KEY_PK`). `resolveLLM()` liest aus der Router-Antwort nur
   `provider`/`modelId`/`baseUrl` — `apiKeyEnv` und `slotId` werden verworfen.
   `toolFactoryAsk()` authentifiziert stattdessen immer mit
   `llmKey() = envOr("FACTORY_LLM_API_KEY", "lmstudio")`. `FACTORY_LLM_API_KEY` ist nirgends
   gesetzt, also geht das Literal `"lmstudio"` als Bearer-Token raus. Trifft der Request einen
   Provider, der tatsächlich prüft (deepseek), schlägt die Auth fehl — exakt die beobachtete
   Meldung `Your api key ****udio is invalid`.

2. **Kein `release-slot.sh`-Aufruf.** `route-provider.sh` claimt bei jedem Aufruf (außer
   `slotId:null` für opus/emergency) atomar einen Slot in `tickets.provider_health`. Das Gegenstück
   `scripts/factory/release-slot.sh` wird von `main.go` an keiner Stelle aufgerufen. Jeder
   `factory_ask`-Call verbraucht dauerhaft einen Slot, bis `reap-provider-slots.sh` (TTL 30min,
   von `wakeup.sh` bei jedem Tick aufgerufen) ihn zurücksetzt. Bei genug Calls in kurzer Folge
   steht llamacpp (max_concurrent=3, Priorität 0) auf 3/3 — `route-provider.sh` überspringt den
   technisch erreichbaren lokalen Provider und fällt auf deepseek (Priorität 1) zurück, wohin dann
   der kaputte Key aus Punkt 1 geht.

**Symptom vs. Hypothese (T002448-M5):** Symptom = die beiden beobachteten Fehlermeldungen
(`Insufficient Balance`, dann `Invalid Key ****udio`). Ursprüngliche Hypothese (jetzt Fakt, per
Code-Lesen belegt): (1) und (2) oben, beide durch Zitat der exakten Code-Stellen (`llmKey()`,
Absenz jedes `release-slot`-Aufrufs in `main.go`) verifiziert — kein Repro-Lauf gegen ein echtes
Backend nötig, da der Fehler strukturell im Code sichtbar ist (kein Freigabe-Pfad existiert,
keine Verzweigung liest `apiKeyEnv`).

**Explizit ausgeschlossen:** `reap-provider-slots.sh` erweitern oder die TTL verkürzen. Der
Reaper funktioniert wie vorgesehen; er ist bewusst konservativ, um Slots laufender Anfragen nicht
vorzeitig freizugeben. Die TTL-Lücke (bis zu 30 Minuten Blockade pro geleaktem Slot) ist der Preis
des fehlenden `release-slot.sh`-Aufrufs, nicht des Reapers — der Fix gehört ausschließlich in
`main.go`.

## Fix-Ansatz

1. `resolveLLM()` liest zusätzlich `slotId`, `apiKeyEnv`, `ctx` aus der Router-JSON-Antwort und
   gibt sie zurück (Signaturerweiterung, alle bisherigen Aufrufer bleiben durch Rückgabewert-
   Erweiterung kompatibel — `toolFactoryAsk()` ist der einzige Aufrufer).
2. `toolFactoryAsk()` löst den Auth-Header über `os.Getenv(apiKeyEnv)` auf, wenn `apiKeyEnv`
   nicht leer ist; sonst (lokaler Provider ohne Auth, `apiKeyEnv:null`) bleibt der bisherige
   `envOr("FACTORY_LLM_API_KEY", "lmstudio")`-Fallback als letzte Stufe.
3. `toolFactoryAsk()` ruft nach dem Request — per `defer`, unabhängig von Erfolg/Fehler —
   `scripts/factory/release-slot.sh <slotId> <success> <ctx>` auf. `release-slot.sh` behandelt
   `slotId == "null"`/leer bereits als No-Op (`exit 0`), das deckt den opus/emergency-Pfad ab
   ohne main.go-seitige Sonderfälle.

## Betroffene Subsysteme

- `scripts/factory/mcp-go/main.go` (einziger Produktionscode-Change)
- Neu: `scripts/factory/mcp-go/main_test.go` (Go-Test, kein BATS — die Logik lebt in Go, nicht
  in einem Shell-Skript; `httptest.Server` als Fake-Backend prüft den empfangenen
  `Authorization`-Header und einen Fake-`release-slot.sh` im `PATH` protokolliert den Aufruf)
- Kein Manifest-/Deploy-Change nötig — `factory-mcp` läuft als systemd-Unit
  (`scripts/factory/mcp-go/factory-mcp.service`) und wird per Rebuild+Restart aktualisiert,
  außerhalb des Scopes dieses Fixes (Deploy-Schritt gehört zu `dev-flow-execute`, nicht zum Plan).

## Edge-Cases

- `apiKeyEnv` gesetzt, aber die benannte Umgebungsvariable ist selbst leer/ungesetzt: Fällt auf
  `FACTORY_LLM_API_KEY`-Fallback zurück statt mit leerem Bearer-Token zu senden — verhindert eine
  neue Variante desselben Bugs (leerer statt falscher Key).
- `apiKeyEnv:null` (lokaler Provider ohne Auth): No-Auth-Pfad bleibt No-Auth-Pfad, keine
  Verhaltensänderung gegenüber heute.
- Slot-Release bei Netzwerkfehler (kein HTTP-Response überhaupt): `defer` deckt auch frühe
  `return`-Pfade ab (z. B. `http.DefaultClient.Do` Fehler) — Release muss auch dann laufen, sonst
  bleibt der Leak für genau den Fehlerfall bestehen, der am häufigsten den Slot blockiert.
- `slotId == "null"` (opus/emergency, kein Claim erfolgt): `release-slot.sh` ist bereits als No-Op
  für diesen Fall spezifiziert — kein main.go-seitiger Sonderfall nötig, nur der Aufruf selbst.
