---
ticket_id: T002159
plan_ref: openspec/changes/opencode-llamacpp-port-drift/tasks.md
status: active
date: 2026-07-25
---

# opencode-Provider `llamacpp-mtp` zeigt auf Bonsai-Port — Design Spec

**Ticket:** T002159
**Date:** 2026-07-25

> **Brainstorming-Hinweis:** Die Root-Cause-Analyse lief interaktiv in der Session
> vom 2026-07-25 (Diagnose → Live-Verifikation → Fix-Richtung, vom User bestätigt).
> Das Lavish-Board wurde bewusst nicht geöffnet: die `lavish`-Skill verlangt vor dem
> Start einer Browser-Session eine explizite Zustimmung, und die Inhalte des Boards
> (Root-Cause, Fix-Ansatz, Subsysteme, Edge-Cases) lagen zum Zeitpunkt der
> Pfad-Entscheidung bereits vollständig vor. Sie sind unten protokolliert.

## Purpose

Der opencode-Provider `llamacpp-mtp` ist in der Projekt-Config auf einen fremden
Port konfiguriert. Sichtbar wird das als „Gemma ist in opencode nicht verfügbar";
gefährlicher ist der stille Fall, in dem derselbe Provider unter dem Label Gemma
Antworten eines völlig anderen Modells liefert. Dieser Change entfernt die
Duplikat-Konfiguration und macht `agent-models.jsonc` zur einzigen Quelle.

## Root cause (live verifiziert 2026-07-25)

### Befund 1 — Port-Drift zwischen zwei Config-Oberflächen

| Datei | `llamacpp-mtp` baseURL | Bewertung |
|---|---|---|
| `.opencode/agent-models.jsonc:7` | `http://127.0.0.1:8091/v1` | korrekt — entspricht dem Startskript |
| `~/.config/opencode/opencode.jsonc:183` | `http://127.0.0.1:8091/v1` | korrekt — aus `agent-models.jsonc` gesynct |
| `.opencode/opencode.jsonc:71` | `http://127.0.0.1:8093/v1` | **falsch** |

Das Startskript `C:\Users\PatrickKorczewski\.lmstudio\start-gemma4-12b-mtp.ps1`
setzt `--port 8091`. Port `8093` ist laut
`.claude/skills/llama-cpp/references/bonsai-server-windows.md` fest dem
Ternary-Bonsai-Server zugewiesen (Factory implement/review-Substrat, T002074).

`agent-models.jsonc` ist die Sync-Quelle: `Taskfile.yml:223` →
`scripts/opencode-sync-agents.sh` → `~/.config/opencode/opencode.jsonc`. Da opencode
die **Projekt-Config über die globale legt**, überschreibt der falsche Wert aus
`.opencode/opencode.jsonc` im Bachelorprojekt-Kontext genau den Wert, den die
Sync-Pipeline korrekt gesetzt hat. Die Sync-Pipeline kann das nicht reparieren —
sie schreibt ausschließlich die globale Datei.

### Befund 2 — Der Fehler ist nicht fail-safe

`llama-server` validiert das `model`-Feld einer Anfrage nicht. Es lädt genau ein
Modell und antwortet damit, unabhängig davon, was der Client anfragt. Verifiziert:

```
POST http://127.0.0.1:8091/v1/chat/completions
     {"model":"Ternary-Bonsai-8B-Q2_0.gguf", ...}
→ HTTP 200, "model": "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
```

Daraus folgen zwei Zustände:

- **Bonsai aus** (heutiger Zustand): Connection refused auf `:8093` → der Provider
  scheitert sichtbar. Das ist der *gutartige* Fall und der, den der User gemeldet hat.
- **Bonsai an**: derselbe Provider wird stillschweigend grün und liefert
  Bonsai-8B-Antworten unter dem Label Gemma4-12B — kein Fehler, kein Log-Eintrag,
  nur ein anderes Modell mit anderem Kontextfenster und anderer Tool-Call-Qualität.

Zusätzlich killen die Bonsai-Startskripte laut Referenz „beim Start alles auf Port
8093". Hätte der Gemma-Server je auf 8093 gelegen, hätte ihn jeder Factory-Lauf
abgeschossen.

### Befund 3 — Kontext-Drift

`.opencode/opencode.jsonc:79` und `.opencode/agent-models.jsonc:13` deklarieren beide
`limit.context: 4096`. Der laufende Server meldet:

```
GET http://127.0.0.1:8091/props → n_ctx: 16384
```

Die 4096 stammen aus der abgelösten `-np 4`-Konfiguration (16384 total ÷ 4 Slots).
Das aktuelle Startskript setzt **kein** `-np`, der volle 16k-Kontext steht einem Slot
zur Verfügung. opencode verschenkt derzeit drei Viertel davon.

Dieselbe Veraltung steckt in den `name`-Beschreibungstexten beider Configs: sie
nennen `-np 4`, `-fit`, Q8_0-KV-Cache, Auto-Sleep und `--spec-draft-n-max 6`. Das
Skript nutzt `--spec-draft-n-max 2`, `-ngl 999`, `-c 16384`, `--jinja` — und keins
der anderen Flags. Der Verweis „start via Desktop\start-gemma4-mtp-server.bat" zeigt
zudem auf einen anderen Pfad als das tatsächlich verwendete Skript.

## Blast radius

`.github/workflows/opencode.yml:47` fährt opencode mit
`model: llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` auf
`runs-on: [self-hosted, fleet-gpu]`. Der Workflow checkt das Repo aus, also greift dort
dieselbe `.opencode/opencode.jsonc` mit dem falschen Port. `tests/spec/opencode-local-model-runner.bats`
pinnt diese Modell-Referenz bereits per `grep`, prüft aber nicht, ob der zugehörige
Provider auf den richtigen Port zeigt — genau die Lücke, die dieser Change schließt.

## Fix approach

**Duplikat entfernen statt Port korrigieren.** Der `llamacpp-mtp`-Block wird ersatzlos
aus `.opencode/opencode.jsonc` gestrichen. Begründung: Ein Provider-Key, der in zwei
Dateien definiert ist, driftet beim nächsten Portwechsel erneut auseinander — eine
reine `8093`→`8091`-Korrektur behebt den heutigen Symptomfall, nicht die Ursache. Nach
dem Entfernen bleibt `agent-models.jsonc` die einzige Definitionsstelle, und die
bestehende Sync-Pipeline versorgt die globale Config.

Zusätzlich in `agent-models.jsonc`:
- `limit.context` von `4096` auf `16384`,
- den `name`-Beschreibungstext an die tatsächlichen Skript-Flags angleichen
  (inkl. korrektem Startskript-Pfad).

**Regressionsschutz:** ein BATS-Test in `tests/spec/llm-local-dev.bats`, der (a) prüft,
dass `.opencode/opencode.jsonc` keinen `llamacpp-mtp`-Provider mehr definiert, und
(b) dass `agent-models.jsonc` den Provider auf `8091` und nicht auf `8093` zeigen lässt.
Der Test ist rein statisch — er braucht keinen laufenden Server und läuft damit im
Offline-CI-Gate (`task test:all`) mit.

## Alternativen (verworfen)

| Ansatz | Verworfen weil |
|---|---|
| Nur `8093` → `8091` in `.opencode/opencode.jsonc` | Behebt das Symptom, lässt die Doppeldefinition bestehen; nächster Portwechsel driftet wieder. |
| Gemma auf `8093` umziehen (Skript ändern) | Kollidiert frontal mit Bonsai; die Bonsai-Startskripte killen alles auf dem Port. |
| Beide Server hinter den llm-proxy (`:18235`) legen | Größerer, eigenständiger Umbau — der Proxy hat eine FIFO-Queue mit einer In-Flight-Anfrage pro Backend (T002102). Gehört zu `central-llm-provider-routing`, nicht in einen Bugfix. |

## Abgrenzung zu bestehenden Changes

`openspec/changes/central-llm-provider-routing` konsolidiert die **Runtime-/Factory**-
Provider-Auswahl (DB `tickets.provider_config` als SSOT, TS-Call-Sites,
`route-provider.sh`, `provider-router.js`). Dieser Change betrifft die **opencode-Client**-
Config (`.opencode/*.jsonc`). Keine gemeinsamen Dateien, keine Abhängigkeit in beide
Richtungen.

## Edge cases

- **Andere Provider-Keys in `.opencode/opencode.jsonc`:** Der `lmstudio`-Block
  (`:1234`, leere `models`) bleibt unangetastet — er ist kein Duplikat aus
  `agent-models.jsonc`. Nur `llamacpp-mtp` wird entfernt.
- **Subagenten-Referenzen:** Die globale Config referenziert
  `llamacpp-mtp/gemma-…` in mehreren Agent-Definitionen. Da der Provider-Key nach dem
  Entfernen weiterhin aus `agent-models.jsonc` stammt, bleiben diese Referenzen gültig.
  Der Test muss das mitprüfen, damit das Entfernen nicht versehentlich den Key
  komplett eliminiert.
- **Server läuft nicht:** Der Fix macht Gemma nicht automatisch verfügbar — das
  Startskript muss laufen. Das ist Betrieb, nicht Config, und bleibt außerhalb des Scopes.
- **JSONC-Kommentare:** Beide Dateien sind JSONC mit Kommentaren. Änderungen müssen
  kommentar-erhaltend erfolgen (kein `jq`-Roundtrip, der Kommentare verwirft).
