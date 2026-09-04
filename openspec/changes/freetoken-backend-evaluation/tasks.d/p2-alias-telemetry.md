---
title: "Alias usage telemetry for the FreeToken plugin"
ticket_id: "T900087"
domains: ["ops", "llm-local-dev"]
status: "draft"
---

# p2 — Alias Usage Telemetry (alias-telemetry)

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `.opencode/plugin/freetoken-active.ts` | 192 | 708 (nicht-baselined, `.ts`-Limit 900) |

Kein Split nötig — der Eingriff bleibt deutlich unter dem freien Budget.

## Problem

`scripts/llm-proxy/` enthält **null** Referenzen auf FreeToken
(`grep -rn -i 'freetoken' scripts/llm-proxy/` → 0 Treffer, Stand
`60620f48d`). `.opencode/agent-models.jsonc:74` verdrahtet den
`freetoken-local`-Provider direkt auf `http://127.0.0.1:1919/v1` — am
mitschneidenden Proxy (`:18235`) vorbei, der `tickets.llm_proxy_request_log`
schreibt. Diese Tabelle enthält seit T014028 keine einzige FreeToken-Zeile.
Es gibt daher weder Nutzungsdaten zu `active-thinking` gegenüber `active-fast`
noch zu realen Prompt-Größen — beide Zahlen trägt P6 in den Messbericht, und
P3–P5 dieses Changes bauen auf ihnen auf.

`.opencode/plugin/freetoken-active.ts` ist der einzige Punkt im System, der
den echten Request-Body noch sieht: der `options.fetch`-Wrapper (Zeilen
120–139) parst `init.body` bereits als JSON und verzweigt in Zeile 128/131
auf `body.model === THINKING_MODEL` / `FAST_MODEL`, um
`chat_template_kwargs.enable_thinking` zu setzen. Genau an dieser Stelle
— nach dem erfolgreichen `JSON.parse`, vor der bestehenden Verzweigung —
entsteht der Telemetrie-Schreibpunkt.

## Design-Entscheidungen

**Ablageort: `%LOCALAPPDATA%\FreeToken\logs\alias-telemetry.jsonl`.**
`scripts/llm/restart-freetoken.ps1:26,46` etabliert `%LOCALAPPDATA%\FreeToken\logs\`
bereits als Log-Konvention für den Poller. Diesen Pfad wiederzuverwenden statt
einen neuen zu erfinden hält Telemetrie und bestehende FreeToken-Logs am
selben Ort — beide liegen außerhalb des Working Tree
(`.opencode/.gitignore`/Repo-Root spielen keine Rolle, der Pfad löst über
`%LOCALAPPDATA%` immer auf ein Benutzerprofilverzeichnis auf, niemals in
`C:\Users\...\Bachelorprojekt\...`). Fehlt `LOCALAPPDATA` (z.B. in einer
Nicht-Windows-CI-Umgebung), wird die Telemetrie ohne Fehler übersprungen —
kein Pfad, kein Schreibversuch, kein Crash.

**Prompt-Größe: Zeichenzahl von `JSON.stringify(body.messages)`, nicht
Token- oder Message-Zahl.** Eine Zeichenzahl ist im Request-Pfad billig zu
berechnen (kein Tokenizer-Import, kein zusätzliches Netzwerk-Roundtrip) und
exakt reproduzierbar — anders als eine geschätzte Tokenzahl, die von der
(unbekannten) Tokenizer-Implementierung des jeweils residenten Modells
abhinge und im Plugin gar nicht verfügbar ist (FreeToken liefert keine
Tokenizer-API). Eine reine Message-Zahl wäre zwar noch billiger, sagt aber
nichts über die tatsächliche Kontext-Auslastung aus — genau die Zahl, die
P3–P5 dieses Changes brauchen, um den Kontextbedarf gegen die 200k/85k-Limits
aus Zeile 159–185 zu bewerten. Zeichenzahl ist die einzige der drei Optionen,
die ohne zusätzliche Abhängigkeit sowohl billig als auch aussagekräftig ist;
sie wird im Messbericht (P6) grob mit dem etablierten Faustwert
`Zeichen / 4 ≈ Tokens` auf die Kontextfenster umgerechnet, nicht bereits hier
im Plugin.

**Append statt Truncate, ein JSON-Objekt pro Zeile.** `node:fs/promises`
`appendFile` mit einem `\n`-terminierten `JSON.stringify(...)`-Satz — Standard-
JSONL, mit `tail`/`jq -c` lesbar, ohne dass die Datei je geparst und neu
geschrieben werden muss.

**Fire-and-forget: die Schreib-Promise wird nicht awaited.** `appendFile(...)`
liefert ein Promise; dieses wird mit `.catch(() => {})` abgefangen, aber
**nicht** `await`et, bevor `upstreamFetch(input, init)` aufgerufen wird. Ein
langsames oder blockiertes Dateisystem verzögert damit die ausgehende
Anfrage nicht, und ein Schreibfehler (Verzeichnis fehlt, Datei gesperrt,
Festplatte voll) landet ausschließlich im verschluckten `.catch` — nie als
geworfener Fehler im äußeren `try`/`catch` der `config`-Hook (Zeilen
110–189), der ohnehin schon jeden Fehler synchron schluckt.

## Implementation Steps

1. **Imports ergänzen (nach Zeile 1, vor den bestehenden Konstanten).**
   ```ts
   import { appendFile } from "node:fs/promises"
   import { join } from "node:path"
   ```

2. **Telemetrie-Konstante und -Helfer neben den bestehenden URL-Konstanten
   einfügen (nach Zeile 31, vor `fetchJson`).**
   ```ts
   const TELEMETRY_PATH = process.env.LOCALAPPDATA
     ? join(process.env.LOCALAPPDATA, "FreeToken", "logs", "alias-telemetry.jsonl")
     : null

   // Fire-and-forget: die appendFile-Promise wird bewusst nicht awaited und
   // ihr Fehlerfall vollstaendig verschluckt. Ein Telemetrie-Ausfall darf den
   // ausgehenden Request weder verzoegern noch veraendern noch nach aussen
   // durchschlagen (Requirement: Alias Usage Telemetry for the FreeToken
   // Plugin, Szenario "A telemetry failure leaves the request untouched").
   const recordAliasUsage = (alias: unknown, promptChars: number) => {
     if (!TELEMETRY_PATH) return
     const record =
       JSON.stringify({
         ts: new Date().toISOString(),
         alias,
         promptChars,
       }) + "\n"
     appendFile(TELEMETRY_PATH, record).catch(() => {
       // Zieldatei/-verzeichnis fehlt, ist gesperrt oder das Volume ist voll:
       // Telemetrie ist best-effort, der Request laeuft unveraendert weiter.
     })
   }
   ```

3. **Aufruf im bestehenden `fetch`-Wrapper einfügen (Zeile 127, direkt nach
   `const body = JSON.parse(init.body)`, vor der bestehenden
   `if (body.model === THINKING_MODEL || ...)`-Verzweigung in Zeile 128).**
   ```ts
   const body = JSON.parse(init.body)
   recordAliasUsage(body.model, JSON.stringify(body.messages ?? []).length)
   if (body.model === THINKING_MODEL || body.model === FAST_MODEL) {
   ```
   Der Aufruf sitzt bewusst **vor** der `enable_thinking`-Mutation, damit
   `alias` exakt das vom Aufrufer gesendete `body.model` ist (`active`,
   `active-thinking` oder `active-fast`) — ungefiltert, unabhängig davon, ob
   die nachfolgende Verzweigung greift. Ein nicht-JSON-Body (bestehender
   `catch`-Block, Zeile 135–137) erzeugt keinen Telemetrie-Satz — es gibt
   dann kein `body.model` zu protokollieren.

## Acceptance Criteria

- [ ] **Alias exakt wie gesendet.** Ein Request mit `model: "active-thinking"`
      erzeugt einen JSONL-Satz mit `alias: "active-thinking"`; ein Request mit
      `model: "active-fast"` erzeugt `alias: "active-fast"` (Requirement-
      Szenarien "A thinking request …" / "A non-thinking request …").
- [ ] **Zeitstempel und Prompt-Größe vorhanden.** Jeder Satz trägt `ts`
      (ISO-8601) und `promptChars` (Zahl ≥ 0).
- [ ] **Pfad außerhalb des Working Tree.** `TELEMETRY_PATH` löst über
      `process.env.LOCALAPPDATA` auf; `join(LOCALAPPDATA, "FreeToken", "logs",
      "alias-telemetry.jsonl")` kann nie unter dem Repo-Root liegen, weil
      `LOCALAPPDATA` per Definition außerhalb des Benutzer-Repos liegt
      (Requirement-Szenario "Telemetry never lives inside the working tree").
- [ ] **Fehler bleiben unsichtbar.** Schlägt `appendFile` fehl (z.B. Zielordner
      fehlt), wirft `recordAliasUsage` nichts, verändert `init`/`body` nicht
      und der `upstreamFetch(input, init)`-Aufruf danach ist identisch mit dem
      Erfolgsfall (Requirement-Szenario "A telemetry failure leaves the
      request untouched").
- [ ] Datei bleibt unter ihrem Budget (Ist nach Änderung geschätzt ~215 LOC,
      Budget 708).

## Not in Scope

- **Der BATS-Guard, der diese vier Szenarien gegen das Plugin verifiziert** —
  das ist P7 (`tests/spec/llm-local-dev/alias-telemetry.bats`,
  `tasks.d/p7-tests.md`). Dieses Partial liefert ausschließlich die
  Plugin-Implementierung; P2 blockiert P7 laut Partial-Manifest.
- **Auswertung/Aggregation der JSONL-Datei** (Verteilung Alias vs. Prompt-
  Größe) — das ist P6 (Messbericht), das die hier erzeugten Rohdaten liest.
- **Rotation/Löschung der Telemetrie-Datei** — außerhalb des Scopes dieses
  Changes; die Datei lebt neben den bestehenden, unrotierten FreeToken-Logs
  in `%LOCALAPPDATA%\FreeToken\logs\`.
