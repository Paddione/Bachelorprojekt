---
title: "factory-mcp-ask-key-slots — Implementation Plan"
ticket_id: T002663
domains: [bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-mcp-ask-key-slots — Implementation Plan

_Ticket: T002663_

## File Structure

```
scripts/factory/mcp-go/main.go        (changed — resolveLLM + toolFactoryAsk)
scripts/factory/mcp-go/main_test.go   (new, already committed as RED — see Task 1)
```

## S1-Budget

`main.go`: Ist 607 Zeilen, `nicht-baselined`. `.go` ist **nicht** in `docs/code-quality/gates.yaml`
→ `s1.limits` erfasst (nur `.astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php`)
→ das S1-Ratchet-Gate ist auf diese Datei nicht anwendbar, kein Budget zu notieren.
`main_test.go` ist eine neue Datei ohne `.go`-Eintrag im Limit-Katalog — ebenfalls nicht S1-pflichtig.

## Task 1: Failing Test (RED, bereits geschrieben und verifiziert)

`scripts/factory/mcp-go/main_test.go` ist bereits Teil dieses Commits und reproduziert beide
Ursachen aus `design.md` als vier `go test`-Fälle in `package main`:

- `TestFactoryAsk_NullApiKeyEnv_FallsBackToLiteral` — **Positiv-Anker** (T002356-M1): belegt,
  dass der Test-Harness (Stub-`FACTORY_REPO` mit `route-provider.sh`/`release-slot.sh`-Stubs,
  `httptest`-Fake-Backend) korrekt verdrahtet ist. Läuft bereits GRÜN vor dem Fix.
- `TestFactoryAsk_RoutedApiKeyEnv_UsesRoutedSecret` — RED: prüft, dass der `Authorization`-Header
  den über `apiKeyEnv` gerouteten echten Secret-Wert trägt, nicht das hartcodierte Literal
  `"lmstudio"`.
- `TestFactoryAsk_ReleasesSlotAfterSuccess` — RED: prüft, dass `release-slot.sh <slotId> true <ctx>`
  nach einem erfolgreichen LLM-Call aufgerufen wird (Log-Datei des Stub-Skripts enthält die Zeile).
- `TestFactoryAsk_ReleasesSlotAfterFailure` — RED: dieselbe Prüfung für den Fehlerpfad
  (`release-slot.sh <slotId> false <ctx>`).

Verifikation, dass der Test aktuell (vor dem Fix) rot ist:

```bash
cd scripts/factory/mcp-go && go test ./... -run TestFactoryAsk -v
# expected: FAIL — TestFactoryAsk_RoutedApiKeyEnv_UsesRoutedSecret,
# TestFactoryAsk_ReleasesSlotAfterSuccess und TestFactoryAsk_ReleasesSlotAfterFailure schlagen fehl
# (TestFactoryAsk_NullApiKeyEnv_FallsBackToLiteral bleibt PASS als Positiv-Anker)
```

Kein weiterer Schritt in diesem Task — die Datei ist bereits committet, dieser Abschnitt
dokumentiert nur den RED-Zustand für `dev-flow-execute`.

## Task 2: `resolveLLM()` liest `slotId`, `apiKeyEnv`, `ctx` aus der Router-Antwort

Datei: `scripts/factory/mcp-go/main.go`, Funktion `resolveLLM()` (aktuell `func resolveLLM()
(baseURL, model string)`, Zeilen ~40–63).

- Signatur erweitern auf `func resolveLLM() (baseURL, model, slotID, apiKeyEnv string, ctx int)`.
- Das anonyme `route`-Struct um `SlotID *string \`json:"slotId"\``, `ApiKeyEnv *string
  \`json:"apiKeyEnv"\`` und `Ctx int \`json:"ctx"\`` erweitern (Feldnamen exakt wie im
  `route-provider.sh`-Output, siehe `printf '{"provider":...,"slotId":%s,...,"apiKeyEnv":%s,...}'`
  in `scripts/factory/route-provider.sh`).
- Bei beiden bisherigen Fallback-`return`-Pfaden (Skript-Fehler, leere/ungültige `baseUrl`)
  `slotID=""`, `apiKeyEnv=""`, `ctx=0` zurückgeben — kein Slot geclaimt, kein Key geroutet, deckt
  sich mit dem bisherigen Verhalten für diese Pfade.
- Nil-Pointer sauber in leeren String auflösen (`if route.SlotID != nil { slotID =
  *route.SlotID }`, analog für `ApiKeyEnv`), damit `null` im JSON zu `""` in Go wird — Aufrufer
  prüft dann nur noch auf leeren String statt auf `nil`.

## Task 3: `toolFactoryAsk()` nutzt den gerouteten Key und gibt den Slot frei

Datei: `scripts/factory/mcp-go/main.go`, Funktion `toolFactoryAsk(question string) (string, bool,
error)` (aktuell Zeilen ~472ff).

- Aufruf von `resolveLLM()` auf die neue 5-Werte-Signatur anpassen:
  `llmBase, model, slotID, apiKeyEnv, ctx := resolveLLM()`.
- Neue kleine Helper-Funktion `resolveAuthKey(apiKeyEnv string) string`:
  - `apiKeyEnv == ""` → `return llmKey()` (bestehender Fallback, deckt den lokalen
    No-Auth-Provider ab).
  - sonst: `if v := os.Getenv(apiKeyEnv); v != "" { return v }` — sonst ebenfalls
    `return llmKey()` (benannte Variable ist selbst ungesetzt → dokumentierter Fallback statt
    leerer Bearer-Token, siehe design.md Edge-Case).
- `req.Header.Set("Authorization", "Bearer "+llmKey())` ersetzen durch
  `req.Header.Set("Authorization", "Bearer "+resolveAuthKey(apiKeyEnv))`.
- Slot-Freigabe: direkt nach dem erfolgreichen `req, _ := http.NewRequestWithContext(...)`-Setup,
  vor dem `resp, err := http.DefaultClient.Do(req)`, eine lokale `released := false`-Guard-Closure
  vorbereiten und per `defer` registrieren, die bei jedem Verlassen der Funktion **genau einmal**
  `exec.Command("bash", repo()+"/scripts/factory/release-slot.sh", slotID, strconv.FormatBool(success),
  strconv.Itoa(ctx)).Run()` aufruft — `success` wird über eine benannte Closure-Variable gesetzt,
  die an jeder Stelle, an der die Funktion regulär mit einem geparsten Chat-Completion-Ergebnis
  zurückkehrt, auf `true` gesetzt wird, und `false` bleibt (Zero-Value) für jeden vorzeitigen
  `return`-Pfad (Netzwerkfehler, `resp.StatusCode >= 400`, JSON-Parse-Fehler).
- `release-slot.sh` behandelt `slotID == "" || slotID == "null"` bereits als No-Op
  (`[[ "$PROV" == "null" || -z "$PROV" ]] && exit 0`) — kein main.go-seitiger Sonderfall für den
  opus/emergency-Pfad nötig, der `defer`-Aufruf darf unbedingt erfolgen.
- Fehler des `release-slot.sh`-Aufrufs selbst (z. B. `exec.Command(...).Run()` schlägt fehl) NICHT
  an den MCP-Aufrufer durchreichen — `toolFactoryAsk()` gibt weiterhin die LLM-Antwort/den
  LLM-Fehler zurück; ein Freigabe-Fehler wird best-effort mit `log.Printf` geloggt, analog zum
  bestehenden Umgang mit Nebenwirkungen in dieser Datei.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED, Task 1).** `main_test.go` reproduziert beide Ursachen.

```bash
cd scripts/factory/mcp-go && go test ./... -run TestFactoryAsk -v
# expected: FAIL (TestFactoryAsk_RoutedApiKeyEnv_UsesRoutedSecret,
# TestFactoryAsk_ReleasesSlotAfterSuccess, TestFactoryAsk_ReleasesSlotAfterFailure sind rot)
```

- [ ] **Fix-Step (GREEN, Task 2 + 3).** Nach der Implementierung müssen alle vier Fälle grün sein:

```bash
cd scripts/factory/mcp-go && go test ./... -run TestFactoryAsk -v
# expected: PASS (alle vier TestFactoryAsk_* Fälle)
cd scripts/factory/mcp-go && go vet ./... && go build ./...
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
