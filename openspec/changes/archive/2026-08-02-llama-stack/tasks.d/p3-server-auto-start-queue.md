---
title: "llama-stack P3 — server.mjs: Loadout-Start-Extraktion, Auto-Start bei Anfrage, exclusiveGroup-Konflikt"
ticket_id: T002459
domains: [scripts]
status: plan_staged
---

# llama-stack — Implementation Plan

Partial **P3 — Proxy-Routing**. Scope: ausschließlich `scripts/llm-proxy/server.mjs`. Umgesetzt
wird D4 (Konfliktprüfung über `exclusiveGroup`, Auto-Start-Queue) aus
`openspec/changes/llama-stack/design.md` sowie die Log-Mitigation aus dem zweiten Risk-Eintrag
(`-fit`-reduzierter Kontext sichtbar machen).

Nicht in diesem Partial (andere Partials, hier nicht anfassen): `scripts/llm/loadouts.json` (P1),
`scripts/llm-proxy/loadouts.mjs` (P1), `scripts/llm-proxy/runner.mjs` (P2), `scripts/llm/*.ps1`
(P4), Tests (P5).

Erfüllte Requirements aus `openspec/changes/llama-stack/specs/local-llm-proxy.md`:
**"Auto-start and queue for conflict-free loadouts"** (beide Szenarien) und der proxy-seitige
Anteil von **"Gemma single-agent and shared multi-agent loadout profiles"** — die
Port-Exklusivität der beiden Gemma-Profile bleibt der bestehende `portInUse()`-Pfad, der durch
die Extraktion in Task 1 unverändert erhalten bleibt.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/llm-proxy/server.mjs` | 398 | 402 |

<!-- vitest: kein neuer Test nötig, weil server.mjs außerhalb von website/src liegt; die
     rot→grün-Absicherung für dieses Partial fährt das Test-Partial P5 -->

### Budget-Herleitung und Split-Entscheidung

`scripts/llm-proxy/server.mjs` ist **nicht gebaselined**:

```bash
jq -r '."S1:scripts/llm-proxy/server.mjs".metric // "nicht-baselined"' docs/code-quality/baseline.json
# → nicht-baselined
```

Wirksame Schwelle ist daher das statische Extension-Limit. Dieses steht in
`docs/code-quality/gates.yaml` Zeile 62 auf **`.mjs: 800`** — es wurde in T002452 von 500 auf 800
angehoben (Kommentar `# war 500` in derselben Zeile). Budget = 800 − 398 = **402**. Gegengeprüft
mit der Budget-Funktion des Linters selbst:

```bash
bash -c 'REPO_ROOT=$PWD; source <(sed -n "1,110p" scripts/plan-lint.sh); residual_budget scripts/llm-proxy/server.mjs'
# → 402
```

Das ist die für B1a maßgebliche Zahl. Eine gegen das alte 500er-Limit gerechnete Angabe (302)
würde als `B1a: … claims budget 302 but computed effective budget is 402` hart failen — die
Partials P1 und P2 rechnen derzeit noch gegen 500 und sollten vor dem Lint-Lauf auf die
gates.yaml-Werte korrigiert werden (`loadouts.mjs` 100 → Budget 700, `runner.mjs` 110 → Budget
690).

**Entscheidung: kein Split, keine neue Datei.** Begründung:

- Die geplante Änderung wächst netto um **≈ 53 Zeilen** (Aufstellung unten), Zielgröße ≈ 451
  Zeilen = **56 % der wirksamen Schwelle 800**. Die 80-%-Regel aus
  `.claude/skills/references/plan-quality-gates.md` (Schritt 4) greift damit nicht.
- Der Netto-Zuwachs bleibt nur deshalb klein, weil die Start-Logik in Task 1 **extrahiert statt
  dupliziert** wird: der bestehende HTTP-Handler schrumpft dabei um 21 Zeilen und finanziert den
  neuen Auto-Start-Pfad teilweise mit.
- Eine Auslagerung nach `scripts/llm-proxy/loadout-start.mjs` wäre ohne Not: `startLoadout` greift
  auf fünf modulprivate Helfer (`resolveModelPath`, `waitHealthy`, `smokeTestToolCall`,
  `chosenSettings`, `portInUse`) und zwei Modulkonstanten (`LLAMA_BIN`, `HEALTH_TIMEOUT_MS`) sowie
  auf `discovery` zu. Eine Auslagerung müsste all das entweder mitverschieben (dann verliert
  `server.mjs` seine Health-Helfer, die auch `/admin/loadouts/status` nutzt) oder als Parameter
  durchreichen (Signatur mit sieben Argumenten). Beides kostet mehr Klarheit, als es an Metrik
  spart, und bei 56 % Auslastung gibt es nichts zu sparen.

Zeilenbilanz der geplanten Änderung:

| Baustein | Δ Zeilen |
|---|---|
| `LoadoutStartError`-Klasse (Task 1) | +4 |
| `startLoadout(slug)` (Task 1) | +26 |
| HTTP-Handler `startMatch` schrumpft 34 → 13 (Task 1) | −21 |
| `-fit`-Kontext-Warnung in `startLoadout` (Task 2) | +3 |
| Import `planAutoStart` (Task 3) | +1 |
| `ensureLoadoutForModel(model)` + `startsInFlight`-Map, inkl. `activeSlugs`-Aufbau (Task 4) | +25 |
| Auto-Start-Hook in `proxyV1` (Task 5) | +8 |
| **Summe** | **+46** |

(Korrigiert ggü. Erstfassung: `exclusiveConflict` entfällt in `server.mjs`, +6 → −6 Zeilen
gegenüber der ursprünglichen Schätzung; die Entscheidungslogik lebt jetzt in `loadouts.mjs`,
Partial P1, Task 3.)

## Vorbedingung aus P1 (Merge-Reihenfolge, kein Datei-Overlap)

`ensureLoadoutForModel` liest `loadout.exclusiveGroup`. Dieses Feld existiert erst, wenn P1
`LOADOUT_KEYS` in `scripts/llm-proxy/loadouts.mjs` erweitert hat — `validateLoadout` ist
fail-closed und wirft `unbekanntes Feld 'exclusiveGroup'`, solange die Allowlist es nicht kennt.

P3 ist deshalb bewusst **degradationsfest** gebaut: `ensureLoadoutForModel` fängt einen
`readLoadouts`-Fehler ab und gibt `null` zurück (Task 4). Landet P3 vor P1, verhält sich
`proxyV1` exakt wie heute, statt `/v1/*` mit einem 502 aus dem `catch` des Request-Handlers
lahmzulegen. Fehlt `planAutoStart` selbst (P1 noch nicht gemergt), wirft bereits der Import in
Task 3 beim Modul-Laden — das ist ein harter, sofort sichtbarer Fehler statt eines stillen
Teilausfalls, und genau deshalb gehört P3 in der Merge-Reihenfolge NACH P1. Ohne gesetzte
`exclusiveGroup`-Werte liefert `planAutoStart` ohnehin immer `{action:'start', slug}` bei
gestopptem, sonst `{action:'none'}` bei laufendem Loadout — der Auto-Start funktioniert dann
konfliktprüfungsfrei.

## Task 1 — Start-Logik aus dem HTTP-Handler nach `startLoadout(slug)` extrahieren

Reine Refaktorierung, **kein Verhaltenswechsel am HTTP-Endpunkt**: Statuscodes, Fehlercodes,
Meldungstexte und Response-Shape von `POST /admin/loadouts/<slug>/start` bleiben byte-gleich. Der
Grund für die Extraktion ist Task 4 — der Auto-Start-Pfad braucht dieselbe Logik und darf sie
nicht duplizieren.

Die Fehlerfälle tragen ihren HTTP-Status als Feld, damit beide Aufrufer (HTTP-Handler und
`proxyV1`) dieselbe Fallunterscheidung ohne String-Vergleiche treffen können.

Einfügen nach `portInUse` (aktuell Zeile 239-242), vor `const server = http.createServer(...)`:

```js
// Fehler mit HTTP-Semantik: beide Aufrufer von startLoadout() (der /admin-Handler und der
// Auto-Start in proxyV1) sollen denselben Status/Code weiterreichen, ohne Meldungstexte zu
// parsen.
class LoadoutStartError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message); this.status = status; this.code = code; Object.assign(this, extra);
  }
}

/** Startet ein Loadout und kehrt erst zurueck, wenn /health gruen ist.
 *  EINZIGER Startpfad im Prozess — /admin/loadouts/<slug>/start und der Auto-Start in
 *  proxyV1 rufen beide diese Funktion; die Logik existiert bewusst nur einmal.
 *  @returns {Promise<{unit:string, port:number, chosen:{ctx:number|null}, toolCallOk:boolean}>}
 *  @throws {LoadoutStartError} status/code sind direkt als HTTP-Antwort verwendbar */
async function startLoadout(slug) {
  const { doc } = readLoadouts(DEFAULT_PATH);
  const loadout = findLoadout(doc, slug);
  if (!loadout) throw new LoadoutStartError(404, 'not_found', slug);
  if (unitStatus(slug).active === 'active') {
    throw new LoadoutStartError(409, 'already_running', `${slug} laeuft bereits`);
  }
  if (portInUse(doc, loadout.port, slug)) {
    throw new LoadoutStartError(409, 'port_busy', `Port ${loadout.port} belegt`);
  }
  const modelPath = resolveModelPath(doc, loadout);
  if (!modelPath) {
    throw new LoadoutStartError(422, 'model_missing', `${loadout.model} in keiner modelRoot gefunden`);
  }
  startUnit(loadout, modelPath, doc.defaults, LLAMA_BIN);
  if (!await waitHealthy(loadout.port, HEALTH_TIMEOUT_MS)) {
    const logs = recentLogs(slug);
    try { stopUnit(slug); } catch { /* Unit war evtl. schon weg */ }
    throw new LoadoutStartError(502, 'start_failed', 'Server wurde nicht gesund', { logs });
  }
  const chosen = await chosenSettings(loadout.port);
  const toolCallOk = await smokeTestToolCall(loadout.port);
  await discovery.probeNow();
  return { unit: unitName(slug), port: loadout.port, chosen, toolCallOk };
}
```

`await discovery.probeNow()` wandert bewusst **in** `startLoadout`: der frisch gestartete Server
muss in `catalog`/`health` von `discovery.mjs` auftauchen, bevor der Aufrufer weitermacht. Für den
HTTP-Handler ist das unverändert (er rief `probeNow()` an derselben Stelle), für den Auto-Start in
Task 5 ist es die Voraussetzung dafür, dass das anschließende `resolveModel()` überhaupt einen
Backend findet.

Der Handler (aktuell Zeile 332-366) schrumpft auf:

```js
    const startMatch = path.match(/^\/admin\/loadouts\/([a-z0-9-]+)\/start$/);
    if (startMatch && method === 'POST') {
      try {
        const r = await startLoadout(startMatch[1]);
        return sendJson(res, 201, {
          ...r,
          warning: r.toolCallOk ? null : 'Kein tool_calls erzeugt — haeufigste Ursache: args.jinja ist false',
        });
      } catch (err) {
        if (err instanceof LoadoutStartError) {
          return sendJson(res, err.status, { error: {
            code: err.code, message: err.message, ...(err.logs ? { logs: err.logs } : {}),
          } });
        }
        return sendJson(res, 500, { error: { code: 'start_error', message: err.message } });
      }
    }
```

Prüfpunkt beim Umbau: die 502-Antwort trug `logs` **innerhalb** des `error`-Objekts
(`{ error: { code:'start_failed', message:'Server wurde nicht gesund', logs } }`) — der Spread
oben stellt genau das wieder her. Die 404-Meldung war der nackte Slug ohne Zusatztext; auch das
bleibt so.

## Task 2 — `-fit`-reduzierten Kontext beim Start protokollieren

Mitigation zum zweiten Risk-Eintrag in `design.md` ("`-fit on` kann einen kleineren Kontext wählen,
ohne dass ein Aufrufer das bemerkt"). `/admin/loadouts/status` zeigt `chosen.ctx` bereits — was
fehlt, ist eine Spur im Log, die man **nachträglich** lesen kann, ohne im richtigen Moment
abgefragt zu haben.

In `startLoadout`, direkt nach `const chosen = await chosenSettings(loadout.port);`:

```js
  // Ziel-Kontext ist entweder hart gesetzt (args.ctx) oder die -fit-Untergrenze (fit.minCtx).
  // Liegt der tatsaechlich gewaehrte Kontext darunter, ist das eine stille Degradierung —
  // genau die, die Risk 2 in design.md meint. Ein Log-Eintrag statt einer Ablehnung: der
  // Server ist benutzbar, nur kleiner als beabsichtigt.
  const targetCtx = loadout.args?.ctx ?? loadout.fit?.minCtx ?? null;
  if (targetCtx != null && chosen.ctx != null && chosen.ctx < targetCtx) {
    console.log(`[loadout] ${slug}: -fit gewaehrte ctx ${chosen.ctx} < Ziel ${targetCtx}`);
  }
```

## Task 3 — Import von `planAutoStart` aus `loadouts.mjs`

**Cross-Partial-Reconciliation (Orchestrator-Korrektur):** Die ursprüngliche Fassung dieses
Partials definierte die Konfliktprüfung als eigene `exclusiveConflict()`-Funktion direkt in
`server.mjs`. P5 (Test-Partial) braucht dafür eine reine, ohne laufenden Proxy importierbare
Funktion — `server.mjs` ruft beim Import `startRegistryPoll`/`startDiscovery`/`server.listen(...)`
auf Top-Level auf und ist deshalb selbst nicht testbar. Die Entscheidungslogik wandert deshalb
nach `scripts/llm-proxy/loadouts.mjs` (Partial P1, dort bereits als seiteneffektfreies Modul
etabliert) als `planAutoStart({doc, model, activeSlugs})`. Dieses Partial importiert sie nur noch:

```diff
 import { readLoadouts, writeLoadouts, findLoadout, DEFAULT_PATH } from './loadouts.mjs';
+import { planAutoStart } from './loadouts.mjs';
```

(oder in einer Zeile zusammengeführt — beides ist äquivalent, Stilentscheidung beim Umsetzen).

`portInUse` bleibt unverändert bestehen und wird weiterhin ausschließlich vom manuellen
`/admin/loadouts/<slug>/start`-Pfad genutzt (Task 1) — das ist der harte Port-Konflikt-Fall
(zwei Server auf einem Port), unabhängig von `exclusiveGroup`. `planAutoStart` deckt den weicheren
Fall ab: verschiedene Ports, die sich trotzdem ausschließen (`gemma-factory` 8091 vs.
`gptoss-context` 8098, beide Gruppe `"chat-gpu"`).

## Task 4 — `ensureLoadoutForModel()`: Auto-Start mit Deduplizierung gleichzeitiger Starts

Kernstück des Partials. Einfügen nach `portInUse` (Zeile 239-242), vor
`const server = http.createServer(...)`:

```js
// Ein Auto-Start laeuft bis zu HEALTH_TIMEOUT_MS. Treffen in diesem Fenster weitere Requests
// auf dasselbe Loadout, duerfen sie NICHT einen zweiten Start ausloesen und auch nicht
// durchfallen — sie haengen sich an dieselbe Promise und warten mit. Das ist die
// "Warteschlange" aus der Requirement: kein eigener Mechanismus, nur eine geteilte Promise.
// Auf unitStatus() allein kann man sich dafuer nicht verlassen: systemd-run kehrt zurueck,
// sobald die Unit 'active' ist — also lange bevor /health gruen wird.
const startsInFlight = new Map(); // slug -> Promise<{started}|{failed}>

/** Prueft, ob `model` ein bekanntes, gestopptes Loadout benennt, und startet es ggf.
 *  Seiteneffekt-Huelle um die reine Entscheidung planAutoStart() aus loadouts.mjs.
 *  @returns {Promise<null | {conflict:string} | {started:string} | {failed:Error}>}
 *    null      → kein Loadout-Treffer ODER Loadout laeuft bereits: unveraenderter Weg
 *    conflict  → exclusiveGroup belegt: 409, KEIN automatischer Stop (D4)
 *    started   → Loadout gesund, discovery frisch geprobt, Routing kann weitergehen
 *    failed    → Start scheiterte; err traegt status/code aus LoadoutStartError */
async function ensureLoadoutForModel(model) {
  let doc;
  // Eine kaputte oder (vor P1) schema-fremde loadouts.json darf /v1/* nicht lahmlegen:
  // im Zweifel faellt der Proxy auf sein bisheriges Verhalten zurueck.
  try { ({ doc } = readLoadouts(DEFAULT_PATH)); } catch { return null; }
  // activeSlugs wird HIER aus unitStatus() gebaut (Seiteneffekt: liest systemd) und dann an
  // die reine Funktion planAutoStart() gereicht — die kennt weder systemd noch das Dateisystem.
  const activeSlugs = doc.loadouts
    .filter((l) => unitStatus(l.slug).active === 'active')
    .map((l) => l.slug);
  const decision = planAutoStart({ doc, model, activeSlugs });
  if (decision.action === 'none') return null;
  if (decision.action === 'conflict') return { conflict: decision.conflictSlug };
  // decision.action === 'start'
  const pending = startsInFlight.get(decision.slug);
  if (pending) return pending;
  const p = startLoadout(decision.slug)
    .then(() => ({ started: decision.slug }))
    .catch((err) => ({ failed: err }))
    .finally(() => startsInFlight.delete(decision.slug));
  startsInFlight.set(decision.slug, p);
  return p;
}
```

Die Promise wird absichtlich mit `.catch` in einen Wert überführt statt zu rejecten: sie liegt in
einer Map, an der potenziell mehrere Awaiter hängen, und eine rejectete Promise ohne Handler zum
Zeitpunkt des Ablegens erzeugt eine `unhandledRejection`-Warnung. Alle Awaiter bekommen dasselbe
`{failed}` und mappen es in Task 5 identisch.

## Task 5 — Auto-Start-Hook in `proxyV1`

`proxyV1` beginnt heute (Zeile 146-149) mit:

```js
async function proxyV1(req, res, subpath) {
  const body = await readBody(req);
  const routed = resolveModel(body.model, getBackends);
  if (!routed) return sendJson(res, 503, { error: { code: 'no_backend', message: 'no healthy backend' } });
```

Nachher:

```js
async function proxyV1(req, res, subpath) {
  const body = await readBody(req);
  // Der Loadout-Check laeuft VOR resolveModel(), nicht erst im !routed-Zweig. Grund:
  // resolveModel() hat einen gierigen Last-Resort-Fallback (discovery.mjs Zeile 65-68) — "das
  // erste gesunde Backend serviert alles". Eine Anfrage an ein gestopptes Loadout wuerde damit
  // still von einem ANDEREN Modell beantwortet, und der 409-Konfliktfall der Requirement
  // ("gptoss-context angefragt, waehrend gemma-factory laeuft") kaeme nie zustande. Ein
  // Modellname, der zu keinem Loadout gehoert, laeuft unveraendert weiter (ensure gibt null).
  const auto = await ensureLoadoutForModel(body.model);
  if (auto?.conflict) {
    return sendJson(res, 409, { error: { code: 'exclusive_conflict', message:
      `${body.model} teilt exclusiveGroup mit dem laufenden Loadout ${auto.conflict}. `
      + `Zuerst 'curl -XPOST http://127.0.0.1:${PORT}/admin/loadouts/${auto.conflict}/stop' `
      + `ausfuehren, dann die Anfrage wiederholen — der Proxy stoppt nichts von selbst.` } });
  }
  if (auto?.failed) {
    const e = auto.failed;
    return sendJson(res, e.status ?? 502, { error: { code: e.code ?? 'start_error', message: e.message } });
  }
  const routed = resolveModel(body.model, getBackends);
  if (!routed) return sendJson(res, 503, { error: { code: 'no_backend', message: 'no healthy backend' } });
```

Der Rest von `proxyV1` bleibt **unverändert**. Insbesondere:

- Der 503-`no_backend`-Zweig bleibt wortgleich erhalten und greift weiterhin für jedes Modell, das
  zu keinem Loadout gehört (Fall 1c der Aufgabenstellung).
- Das Routing nach dem Auto-Start läuft durch dieselbe Zeile 161
  `enqueue(backend.name, backend.maxInflight ?? 1, () => forwardToBackend(...))` wie bei jedem
  bereits laufenden Backend. Es entsteht **kein zweiter Warteschlangen-Mechanismus**: das Warten
  *auf* Health passiert in `startLoadout` **vor** `enqueue`, das Warten *im* `enqueue` bleibt das
  bestehende Per-Backend-Semaphor für gleichzeitige Requests an denselben Backend.

### Bewusste Verhaltensänderungen

1. **Ein Modellname, der einem gestoppten Loadout entspricht, wird nicht mehr substituiert.**
   Bisher beantwortete das erste gesunde Backend die Anfrage (gieriger Fallback in
   `resolveModel`). Neu: Auto-Start oder 409. Genau das verlangt das Szenario "Conflicting request
   is rejected, not auto-preempted" — eine stille Substitution wäre die schlechtere Antwort,
   weil sie ein anderes Modell als das angefragte liefert, ohne dass der Aufrufer es merkt.
2. **Ein Request kann bis zu `HEALTH_TIMEOUT_MS` (240 s) offen bleiben.** Das ist der Preis des
   "queue until healthy" aus der Requirement. Kein neuer Timeout-Knopf wird eingeführt; es gilt
   das Timeout des Aufrufers. Sichtbar wird der Vorgang über die `startLoadout`-Logzeilen und
   `/admin/loadouts/status`.
3. **`/v1/embeddings` und `/v1/rerank` profitieren mit**, weil `proxyV1` alle `POST /v1/*`
   bedient — damit greift das Requirement-Szenario mit `bge-rerank-batch` ohne Zusatzcode.

## Task 6 — Lokale Verifikation dieses Partials

Diese Schritte gehören zu P3 selbst; die BATS-/Node-Absicherung rot→grün fährt Partial P5, die
Gesamt-Verifikation (`task test:changed`, `task freshness:regenerate`, `task freshness:check`)
steht am Ende des zusammengeführten Plans.

1. Syntax und Modulgraph:
   ```bash
   node --check scripts/llm-proxy/server.mjs
   ```
2. S1-Ratchet für die geänderte Datei:
   ```bash
   wc -l scripts/llm-proxy/server.mjs   # erwartet: < 800
   task quality:check
   ```
3. Live-Verifikation gegen `devstral-quality` (Schritt 4 des Migration Plan in `design.md` —
   aktuell inaktiv, daher ohne Risiko für die laufende Factory). Proxy neu starten, dann:
   ```bash
   # Auto-Start: Loadout ist gestoppt, Anfrage nennt den Slug als model
   curl -s -XPOST http://127.0.0.1:18235/v1/chat/completions \
     -H 'content-type: application/json' \
     -d '{"model":"devstral-quality","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
   # erwartet: 200 mit Antwort; parallel im Proxy-Log ein [loadout]-Eintrag,
   # und `systemctl --user is-active llama-devstral-quality.service` meldet active
   ```
   ```bash
   # Konflikt: solange devstral-quality laeuft, ein Loadout derselben exclusiveGroup anfragen
   curl -s -o /dev/stderr -w '%{http_code}\n' -XPOST http://127.0.0.1:18235/v1/chat/completions \
     -H 'content-type: application/json' \
     -d '{"model":"gptoss-context","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
   # erwartet: 409 mit code exclusive_conflict und dem Slug devstral-quality im Text;
   # `systemctl --user is-active llama-devstral-quality.service` meldet weiterhin active
   ```
4. Regression am unveränderten HTTP-Endpunkt (Task 1 darf ihn nicht verschoben haben):
   ```bash
   curl -s -o /dev/stderr -w '%{http_code}\n' -XPOST http://127.0.0.1:18235/admin/loadouts/devstral-quality/start
   # erwartet: 409 mit code already_running, Meldungstext "devstral-quality laeuft bereits"
   curl -s -o /dev/stderr -w '%{http_code}\n' -XPOST http://127.0.0.1:18235/admin/loadouts/gibt-es-nicht/start
   # erwartet: 404 mit code not_found und dem nackten Slug als message
   ```
5. Aufräumen:
   ```bash
   curl -s -XPOST http://127.0.0.1:18235/admin/loadouts/devstral-quality/stop
   ```
