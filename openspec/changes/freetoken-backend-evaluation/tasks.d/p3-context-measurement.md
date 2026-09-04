# p3-context-measurement — Offline-Kontextmessung der Factory-Dispatch-Prompts

Rolle: `impl` (ops). Beantwortet die Zahl, an der die ganze Backend-Entscheidung hängt: wie
gross sind Factory-Prompts tatsächlich? `start-gptoss-server.ps1`/`start-gemma-server.ps1`
behaupten unbelegt „31–37k Tokens pro Prompt" — stimmt das, ist FreeTokens 200k-Pool um Faktor
6 überdimensioniert (Hauptargument gegen FreeToken); liegt der Bedarf nahe 200k, ist die
Migration vom Tisch (Abbruchpunkt 1 aus `proposal.md`/`tasks.md`). **Kein**
`task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step (dieses
Partial hat kein zugeordnetes Test-Target — `tests.d`-Manifest siehe P7 = nur Alias-Telemetrie).

## S1-Zeilenbudget (wirksame Schwelle)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/llm/measure-factory-context.mjs` | 0 | 800 |

Nicht gebaselined (`docs/code-quality/baseline.json` kennt die Datei nicht, sie existiert noch
nicht) → wirksame Schwelle ist das statische `.mjs`-Limit aus `gates.yaml` (800, gegengeprüft
gegen `intel.json:s1_limit`). Das geplante Skript liegt bei ~90–110 Zeilen — weit darunter, keine
Split-Notwendigkeit.

## Vorab-Rechercheergebnis, das dieses Partial bindet (Ehrlichkeitspflicht)

Vor dem Schreiben geprüft, wo der Factory-Dispatch-Prompt tatsächlich zusammengesetzt wird:

- `scripts/factory/eval-context.cjs` (`buildEvalContext`) baut **keinen** Dispatch-Prompt. Es
  liest `docs/factory-eval/latest.json` (Score-Ergebnisse eines bereits gelaufenen Evals) und
  liefert einen ≤220-Zeichen-Score-String **zurück in einen späteren Kontext** — ein
  Nachlauf-Artefakt, kein Prompt-Baustein.
- Die eigentliche Kontext-Komposition ist `contextHints` aus
  `scripts/factory/provision.js:buildContextHints()` (Zeilen 81–96): vier kompakte Hinweis-Labels
  (`Vorhaben pack T000413 (vision + repo conventions + footguns)`, `ticket spec + attachments`,
  `touched_files: N path(s)`, `target-code excerpts`, optional `similar-tickets`). Der
  Docstring ist explizit: das sind Pointer, **nicht** die aufgelösten Payloads — „the Workflow
  caller resolves each hint to a verbatim, trimmed excerpt" (Zeile 82f). Diese Auflösung passiert
  **nicht** in `pipeline.mjs`/`pipeline-runner.js`/`pipeline-decompose.cjs` (grep auf
  `resolveHint`/`contextHints`-Verwendung in diesen Dateien: keine Treffer) — sie geschieht zur
  Laufzeit im Workflow-Orchestrator selbst (nicht-deterministisch, kein fixes Skript zum Messen).
- Die acht Fixtures unter `tests/factory-eval/fixtures/<TICKET>/{ticket.json,expected.json}`
  liefern damit **nur** Rohmaterial für den `ticket spec`-Hint (Titel, Beschreibung, erwartete
  Dateien/Tests) — kein Vorhaben-Pack, keine Footguns, keine target-code-Exzerpte, keine
  Attachments (Fixtures haben keine).

**Konsequenz für dieses Partial:** Die Messung ist eine **Untergrenze** eines einzelnen
Hint-Bausteins, nicht das Vollbild des Dispatch-Prompts. Das Skript deklariert das in seiner
eigenen JSON-Ausgabe (`meta.scope_caveat`), damit P6 es nicht als Vollbild zitiert. Das Korrektiv
für die fehlenden Bausteine ist die Live-Telemetrie aus P2
(`.opencode/plugin/freetoken-active.ts`), die den tatsächlichen Request-Body sieht — P3 liefert
die sofort verfügbare Zahl, P2 die Bestätigung/Korrektur an der Quelle (`proposal.md`, Abschnitt
„Offene Risiken").

## Tokenisierungs-Entscheidung (mit Fehlerbalken, nicht undeklariert)

Geprüft und verworfen:
- Kein `tiktoken`/`gpt-tokenizer`/`@xenova`-Paket in `package.json` oder installiert
  (`find . -iname "*tiktoken*"` → keine Treffer außerhalb `.git`).
- Kein Python-Tokenizer-venv im Repo verdrahtet für diesen Zweck.

Übernommenes Präzedenzmuster aus `scripts/llm-proxy/server.mjs` (`measureTokens`, Zeile ~88–101):
llama.cpp exponiert `POST {host}/tokenize`, das dort bereits für Kontext-Budgetierung genutzt
wird — inklusive dessen dokumentierter Einschränkung (`CTX_MARGIN`-Kommentar, Zeile 60): auch der
exakte `/tokenize`-Zählwert auf dem rohen Content-String sieht **keinen**
Chat-Template-/Tool-Schema-Overhead. Jede Zahl aus diesem Skript — approximiert oder exakt — ist
daher ein Lower-Bound auf den realen Wire-Prompt.

**Entschieden:** Standardmäßig eine deklarierte Näherung `Tokens ≈ chars / 4` (gängiger
Richtwert für gemischten Code+Prosa-Text; **Fehlerbalken ±30%**, explizit in `meta.tokenizer_method`
der Ausgabe benannt — keine unbelegte Präzisionsbehauptung). Optional exakter Abgleich per
`--tokenizer-endpoint <url>`, das denselben `/tokenize`-Aufruf wie `llm-proxy/server.mjs` nutzt,
wenn ein llama.cpp-Server erreichbar ist (kein Hard-Fail, wenn nicht — bleibt offline lauffähig,
wie von der Vorarbeit gefordert: „liefert sofort eine Zahl, ohne auf Live-Verkehr zu warten").

## Task 1: `scripts/llm/measure-factory-context.mjs` — Fixture-Kontextmessung

- [ ] Datei `scripts/llm/measure-factory-context.mjs` neu anlegen (ESM, `#!/usr/bin/env node`).
- [ ] Kopf-Kommentar mit den drei Ehrlichkeitspunkten aus dem Abschnitt oben (eval-context.cjs
      ist kein Prompt-Builder; Fixtures = Untergrenze; Tokenisierung = deklarierte Näherung).
- [ ] `readdirSync(tests/factory-eval/fixtures)` iteriert die acht Ticket-Verzeichnisse; pro
      Verzeichnis `ticket.json` + `expected.json` laden, `promptText = JSON.stringify({ticket,
      expected})`, `charCount = promptText.length`, `approxTokens = Math.ceil(charCount / 4)`.
- [ ] Optionaler `--tokenizer-endpoint <url>`: `POST {url}/tokenize` mit `{content: promptText}`
      (identisches Shape zu `llm-proxy/server.mjs:measureTokens`), `AbortSignal.timeout(5000)`,
      bei Fehler/Nichterreichbarkeit `exact_tokens: null` (kein Crash, kein Hard-Fail).
- [ ] `git rev-parse HEAD` (via `execFileSync`, mit try/catch → `null` bei Fehler) und der volle
      Aufrufbefehl (`process.argv` rekonstruiert) fließen in `meta.commit` /
      `meta.invocation_command` — Mess-Konvention T002717 ist im Skript selbst verankert, nicht
      nur in der Prosa des Reports.
- [ ] Aggregate `min`/`median`/`max` über `approx_tokens` aller Fixtures berechnen.
- [ ] Ausgabe: maschinenlesbares JSON auf `stdout` (optional zusätzlich in `--out <pfad>`
      geschrieben) **und** eine für Menschen lesbare Tabelle (`ticket_id | chars | ~tokens |
      exact`) auf `stderr`, damit `stdout | jq` sauber bleibt und P6 direkt daraus zitieren kann.

```js
#!/usr/bin/env node
// scripts/llm/measure-factory-context.mjs
// Offline-Kontextmessung der Software-Factory-Dispatch-Prompts (P3, T900087).
//
// EHRLICHKEITSPFLICHT: scripts/factory/eval-context.cjs baut KEINEN Dispatch-Prompt — es liest
// docs/factory-eval/latest.json (Score-Ergebnisse eines gelaufenen Evals) zurück. Der reale
// Dispatch-Kontext sind die contextHints aus scripts/factory/provision.js:buildContextHints()
// (Vorhaben-Pack, ticket spec, touched_files, target-code-Exzerpte) — deren Auflösung passiert
// zur Laufzeit im Workflow-Orchestrator, nicht in einem festen Skript. Dieses Skript misst daher
// NUR den "ticket spec"-Baustein aus den acht Fixtures unter tests/factory-eval/fixtures/ — eine
// UNTERGRENZE, kein Vollbild. Korrektiv: Live-Telemetrie aus P2 (.opencode/plugin/freetoken-active.ts).
//
// TOKENISIERUNG: kein Tokenizer-Paket im Repo verdrahtet. Deklarierte Naeherung chars/4
// (Fehlerbalken +-30%, siehe meta.tokenizer_method in der Ausgabe). Optionaler exakter Abgleich
// per --tokenizer-endpoint <url> (POST {url}/tokenize, gleiches Shape wie
// scripts/llm-proxy/server.mjs:measureTokens) — auch dieser Wert sieht keinen
// Chat-Template-/Tool-Schema-Overhead (siehe CTX_MARGIN-Kommentar dort), bleibt also ebenfalls
// ein Lower-Bound.
//
// Mess-Konvention T002717: Aufrufbefehl und Commit-Stand stehen in meta.invocation_command /
// meta.commit der Ausgabe — die Zahl ist damit ohne Rueckfrage nachstellbar.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = resolve(import.meta.dirname, '../..')
const FIXTURES_DIR = resolve(REPO, 'tests/factory-eval/fixtures')
const CHARS_PER_TOKEN = 4 // deklarierte Naeherung, siehe Kopf-Kommentar; Fehlerbalken +-30%

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim() }
  catch { return null }
}

async function tokenizeExact(endpoint, content) {
  try {
    const res = await fetch(`${endpoint}/tokenize`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }), signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body?.tokens) ? body.tokens.length : null
  } catch { return null }
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function main() {
  const args = process.argv.slice(2)
  const endpointIdx = args.indexOf('--tokenizer-endpoint')
  const endpoint = endpointIdx >= 0 ? args[endpointIdx + 1] : null
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null

  const ids = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort()

  const results = []
  for (const id of ids) {
    const dir = join(FIXTURES_DIR, id)
    const ticketPath = join(dir, 'ticket.json')
    const expectedPath = join(dir, 'expected.json')
    if (!existsSync(ticketPath) || !existsSync(expectedPath)) continue
    const ticket = JSON.parse(readFileSync(ticketPath, 'utf8'))
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
    // Nachbau des "ticket spec"-Hints aus provision.js:buildContextHints — das Naechstliegende,
    // was "ticket spec + attachments" offline hergibt (Fixtures haben keine Attachments).
    const promptText = JSON.stringify({ ticket, expected })
    const charCount = promptText.length
    const approxTokens = Math.ceil(charCount / CHARS_PER_TOKEN)
    const exactTokens = endpoint ? await tokenizeExact(endpoint, promptText) : null
    results.push({ ticket_id: id, char_count: charCount, approx_tokens: approxTokens, exact_tokens: exactTokens })
  }

  if (results.length === 0) {
    console.error(`FEHLER: keine Fixtures unter ${FIXTURES_DIR} gefunden`)
    process.exit(1)
  }

  const approxVals = results.map((r) => r.approx_tokens)
  const report = {
    meta: {
      generated_at: new Date().toISOString(),
      commit: gitHead(),
      invocation_command: `node scripts/llm/measure-factory-context.mjs${endpoint ? ` --tokenizer-endpoint ${endpoint}` : ''}`,
      tokenizer_method: endpoint
        ? `exact via POST ${endpoint}/tokenize (llama.cpp API); chars/4-Fallback wo unerreichbar`
        : 'approx chars/4 (deklarierte Naeherung, +-30% Fehlerbalken; kein Tokenizer im Repo verdrahtet)',
      scope_caveat: 'misst NUR den ticket-spec-Hint aus provision.js:buildContextHints() — Vorhaben-Pack/Footguns/target-code-Exzerpte/similar-tickets sind offline nicht rekonstruierbar; Untergrenze, kein Vollbild. Korrektiv: P2-Live-Telemetrie.',
      fixture_count: results.length,
    },
    fixtures: results,
    aggregate: {
      min: Math.min(...approxVals),
      median: median(approxVals),
      max: Math.max(...approxVals),
    },
  }

  const json = JSON.stringify(report, null, 2)
  if (outPath) writeFileSync(outPath, json)
  console.log(json)

  console.error('\nTicket       | chars  | ~tokens | exact')
  console.error('-------------|--------|---------|------')
  for (const r of results) {
    console.error(`${r.ticket_id.padEnd(12)} | ${String(r.char_count).padStart(6)} | ${String(r.approx_tokens).padStart(7)} | ${r.exact_tokens ?? '-'}`)
  }
  console.error(`\nAggregate: min=${report.aggregate.min} median=${report.aggregate.median} max=${report.aggregate.max}`)
}

main()
```

**Verify:**

```bash
node --check scripts/llm/measure-factory-context.mjs
# erwartet: exit 0 (keine Syntaxfehler)

wc -l scripts/llm/measure-factory-context.mjs
# erwartet: deutlich unter 800 (S1-Budget aus obiger Tabelle)

node scripts/llm/measure-factory-context.mjs --out /tmp/freetoken-p3-measurement.json 1>/dev/null
# erwartet: kein Absturz, exit 0

# Positiv-Anker (T002495-M10): beide Zahlen müssen > 0 sein, sonst ist ein leerer Lauf
# fälschlich als Erfolg durchgerutscht.
jq -e '.meta.fixture_count > 0 and .aggregate.max > 0 and (.meta.commit | length) > 0 and (.meta.invocation_command | length) > 0' \
  /tmp/freetoken-p3-measurement.json
echo "Anker: fixture_count=$(jq -r .meta.fixture_count /tmp/freetoken-p3-measurement.json) aggregate_max=$(jq -r .aggregate.max /tmp/freetoken-p3-measurement.json)"
# erwartet: jq -e exit 0; Anker-Zeile zeigt fixture_count=8 (alle acht Fixtures aus proposal.md)
```
