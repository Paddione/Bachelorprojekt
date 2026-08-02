# P1 — Loadout-Schema: Gemma-Loadouts + Speculative-/mmproj-Felder

Scope dieses Partials: `scripts/llm/loadouts.json` (neue Einträge) und
`scripts/llm-proxy/loadouts.mjs` (Schema-Erweiterung für die drei neuen Felder). Kein
`runner.mjs`, kein `server.mjs`, keine `.ps1`-Datei, keine Tests — die gehören zu anderen
Partials desselben Plans.

## S1-Budget

| Datei | Ist | Budget |
|-------|-----|--------|
| `scripts/llm-proxy/loadouts.mjs` | 100 | 700 |

Korrektur ggü. Erstfassung: `.mjs`-Limit ist 800, nicht 500 (`docs/code-quality/gates.yaml`
Zeile 62, seit T002452 angehoben — Befund aus Partial P3). Budget also 700, nicht 400.

`scripts/llm/loadouts.json` ist JSON — kein S1-Gate (Tabelle in `docs/code-quality/gates.yaml`
listet keine `.json`-Extension).

## Task 1 — `loadouts.mjs`: Schema um `exclusiveGroup` und `mmprojPath` erweitern

`LOADOUT_KEYS` (Zeile 10-12) validiert die erlaubten Top-Level-Felder eines Loadouts
fail-closed — ein unbekanntes Feld wirft `unbekanntes Feld '<k>'`. `ARG_KEYS` (Zeile 13-20) tut
dasselbe für `args`. Beide MÜSSEN um die neuen Felder erweitert werden, sonst schlägt
`parseLoadouts` beim Einlesen der in Task 2 ergänzten `loadouts.json` sofort fehl.

`speculative.draftModelPath` braucht dagegen **keine** Schema-Änderung: `validateLoadout`
validiert `l.speculative` nirgends gegen eine Key-Whitelist (nur `fit` und `args` haben eine
`for (const k of Object.keys(...))`-Schleife gegen ein `*_KEYS`-Set) — die Funktion ist für
`speculative` bereits permissiv. Kein Code für dieses Teilfeld nötig; dieser Satz dokumentiert
bewusst, warum hier nichts geändert wird (kein künstlicher Code für einen bereits offenen Pfad).

Diff-artiger Vorschlag:

```js
// Zeile 10-12, vorher:
const LOADOUT_KEYS = new Set([
  'slug', 'label', 'model', 'port', 'fit', 'args', 'speculative', 'mcp', 'extraArgs', 'notes',
]);
// nachher (+1 Feld):
const LOADOUT_KEYS = new Set([
  'slug', 'label', 'model', 'port', 'fit', 'args', 'speculative', 'mcp', 'extraArgs', 'notes',
  // D4 (llama-stack/design.md): Konfliktgruppe fuer den Auto-Start-Check in proxyV1 (server.mjs,
  // eigenes Partial). Optional — Loadouts ohne diese Gruppe (z.B. die CPU-gebundenen bge-*-batch)
  // gelten als konfliktfrei.
  'exclusiveGroup',
]);
```

```js
// Zeile 13-20, vorher:
const ARG_KEYS = new Set([
  'ctx', 'ngl', 'parallel', 'cacheTypeK', 'cacheTypeV', 'loadMode',
  'flashAttention', 'jinja', 'metrics', 'reasoning', 'reasoningBudget',
  // T002426: laesst llama-server selbst zum MCP-Server verbinden statt den
  // Browser aus der Web-UI heraus — ohne das Flag scheitert ein lokaler
  // MCP-Server ohne CORS-Header.
  'uiMcpProxy',
]);
// nachher (+1 Feld):
const ARG_KEYS = new Set([
  'ctx', 'ngl', 'parallel', 'cacheTypeK', 'cacheTypeV', 'loadMode',
  'flashAttention', 'jinja', 'metrics', 'reasoning', 'reasoningBudget',
  // T002426: laesst llama-server selbst zum MCP-Server verbinden statt den
  // Browser aus der Web-UI heraus — ohne das Flag scheitert ein lokaler
  // MCP-Server ohne CORS-Header.
  'uiMcpProxy',
  // D2 (llama-stack/design.md): Pfad zum mmproj-Vision-/Audio-Tower, gegen
  // modelRoots aufgeloest wie model. Optional, wirkt nur wenn gesetzt.
  'mmprojPath',
]);
```

Zusätzlich sollte `validateLoadout` (nach der bestehenden `l.model`-Prüfung, Zeile 36-37) analog
prüfen, dass ein gesetztes `args.mmprojPath` ein nicht-leerer String ohne `..` ist — dieselbe
Path-Traversal-Guard-Logik wie für `l.model`, konsequent auf das neue Feld angewendet:

```js
// Nach der bestehenden model-Pruefung (Zeile 36-37) einfuegen:
if (args.mmprojPath != null && (typeof args.mmprojPath !== 'string' || args.mmprojPath.includes('..'))) {
  fail(`${l.slug}: args.mmprojPath muss ein String ohne '..' sein`);
}
```

Zeilenbudget: geschätzt +14 Zeilen (2 Kommentarzeilen + 1 Feld in `LOADOUT_KEYS`, 3
Kommentarzeilen + 1 Feld in `ARG_KEYS`, 3 Zeilen neue Validierung) → Ist danach ca. 114 von 400
Budget-Zeilen, deutlich unter der 80%-Split-Schwelle aus den Plan-Quality-Gates.

## Task 2 — `loadouts.json`: `gemma-factory` + `gemma-multiagent` eintragen, `exclusiveGroup` auf Bestandseinträgen nachziehen

Zwei neue Objekte an das `loadouts`-Array anhängen (nach dem bestehenden `devstral-quality`- und
vor dem `bge-embed-batch`-Eintrag, oder ans Ende — Reihenfolge im Array ist nicht
schema-relevant). `model`, `speculative.draftModelPath` und `args.mmprojPath` sind
`modelRoots`-relative Pfade unter `unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/` — derselbe Ordner, den
`start-gemma-server.ps1` (`$ModelDir`, Zeile 131) referenziert.

```json
{
  "slug": "gemma-factory",
  "label": "Gemma 4 12B · Factory Single-Agent",
  "model": "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf",
  "port": 8091,
  "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 32768 },
  "args": {
    "ctx": null, "ngl": null, "parallel": 1,
    "cacheTypeK": "q4_0", "cacheTypeV": "q4_0", "loadMode": "mmap",
    "flashAttention": true, "jinja": true, "metrics": true,
    "reasoning": "auto", "reasoningBudget": null,
    "mmprojPath": "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/mmproj-F16.gguf"
  },
  "speculative": {
    "draftModelPath": "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/mtp-gemma-4-12B-it-Q4_0.gguf",
    "draftNgl": null
  },
  "mcp": { "serversConfig": null },
  "extraArgs": [],
  "exclusiveGroup": "chat-gpu",
  "notes": "Migriert aus scripts/llm/start-gemma-server.ps1 (Default-Profil, -np 1). -fit ersetzt das bisherige harte -c 65536; minCtx haelt die Untergrenze."
},
{
  "slug": "gemma-multiagent",
  "label": "Gemma 4 12B · Factory Multi-Agent",
  "model": "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf",
  "port": 8091,
  "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 65536 },
  "args": {
    "ctx": null, "ngl": null, "parallel": 5,
    "cacheTypeK": "q4_0", "cacheTypeV": "q4_0", "loadMode": "mmap",
    "flashAttention": true, "jinja": true, "metrics": true,
    "reasoning": "auto", "reasoningBudget": null,
    "mmprojPath": "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/mmproj-F16.gguf"
  },
  "speculative": {
    "draftModelPath": "unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/mtp-gemma-4-12B-it-Q4_0.gguf",
    "draftNgl": null
  },
  "mcp": { "serversConfig": null },
  "extraArgs": ["-kvu"],
  "exclusiveGroup": "chat-gpu",
  "notes": "Migriert aus scripts/llm/start-gemma-server.ps1 (-Slots-Profil, -np 5 -kvu). Gemeinsamer KV-Pool ueber alle Slots (-kvu ist in runner.mjs NICHT automatisch bei parallel>1 -- anders als der llama-server-Kern es fuer -np selbst tut, muss der Proxy-Wrapper es explizit setzen, siehe Korrektur unten); minCtx auf 65536 angehoben (mehr Agenten teilen sich den Kontext)."
}
```

**Korrektur ggü. Erstfassung (Befund aus Partial P5):** `-kvu` fehlte im ersten Entwurf von
`gemma-multiagent`. `runner.mjs`s `buildServerArgv` fügt es NICHT automatisch bei `parallel > 1`
hinzu (geprüft am realen Quelltext, nicht nur am Ticket-Text) — anders als `design.md` D1 es
formuliert. `extraArgs: ["-kvu"]` ist der korrekte Weg, da bestehende Loadouts (`gptoss-context`)
`-kvu`-relevante Flags bereits so setzen, nicht über ein dediziertes Schema-Feld.

Auf den bestehenden Einträgen `gptoss-context` und `devstral-quality` (Zeile 9-42 der
Ausgangsdatei) je ein `"exclusiveGroup": "chat-gpu",` einfügen (z. B. direkt vor `"notes"`) — sie
konkurrieren mit den zwei neuen Gemma-Loadouts um dieselbe GPU. `bge-embed-batch` und
`bge-rerank-batch` (Zeile 43-78) bleiben unverändert: CPU-gebunden (`-ngl 0`), kein
`exclusiveGroup`-Feld, kein Konflikt mit den Chat-Loadouts.

## Task 3 — `loadouts.mjs`: reine Auto-Start-Entscheidungsfunktion `planAutoStart` (Kontrakt zu P3/P5)

**Cross-Partial-Reconciliation (Orchestrator-Korrektur nach Rückmeldung von P3 und P5):** P3
(`server.mjs`) baute die Konfliktprüfung ursprünglich direkt im Proxy ein; P5 (Tests) braucht dafür
eine reine, ohne laufenden Proxy importierbare Funktion. `loadouts.mjs` ist bereits ein
seiteneffektfreies Modul (kein Top-Level-`fetch`/`listen`) — die Entscheidungslogik gehört
deshalb hierher, nicht nach `server.mjs`. P3 ruft diese Funktion nur noch auf und führt den
Seiteneffekt (`startLoadout`) aus; P3s eigener Entwurf einer `exclusiveConflict`-Funktion
**innerhalb** von `server.mjs` entfällt zugunsten dieser Funktion hier.

Verbindlicher Kontrakt (identisch zum Kontrakt, den P5 gegen dieses Modul testet):

```js
/**
 * Reine Entscheidung: darf `model` automatisch gestartet werden? Kein Datei-/Netzwerk-Zugriff,
 * kein Seiteneffekt — `doc` und `activeSlugs` werden vom Aufrufer (server.mjs) bereits geladen.
 * @param {{doc: object, model: string, activeSlugs: string[]}} args
 * @returns {{action:'start', slug:string}
 *         | {action:'conflict', slug:string, conflictSlug:string, group:string}
 *         | {action:'none'}}
 */
export function planAutoStart({ doc, model, activeSlugs }) {
  if (typeof model !== 'string' || !model) return { action: 'none' };
  const loadout = findLoadout(doc, model);
  if (!loadout) return { action: 'none' };
  if (activeSlugs.includes(loadout.slug)) return { action: 'none' };
  const group = loadout.exclusiveGroup;
  if (group) {
    const conflict = doc.loadouts.find((l) => l.slug !== loadout.slug
      && l.exclusiveGroup === group && activeSlugs.includes(l.slug));
    if (conflict) return { action: 'conflict', slug: loadout.slug, conflictSlug: conflict.slug, group };
  }
  return { action: 'start', slug: loadout.slug };
}
```

Einfügen ans Ende von `loadouts.mjs`, neben den bestehenden Exports `readLoadouts`/`writeLoadouts`/
`findLoadout`. Kein neuer Import nötig — `findLoadout` ist bereits im selben Modul definiert.

Zeilenbudget-Update: +20 Zeilen zusätzlich zu Task 1 (~14 Zeilen) → Ist danach ca. 134 von 700
Budget-Zeilen. Deutlich unter der 80 %-Split-Schwelle.

Nach dem Edit `loadouts.json` gegen `parseLoadouts` prüfen (deckt Task 1 UND Task 2 ab, siehe
Verify-Kommandos im letzten Task dieses Plans):

```bash
node -e "import('./scripts/llm-proxy/loadouts.mjs').then(m => { m.readLoadouts(); console.log('loadouts.json: schema OK'); })"
```

`expected: FAIL` vor Abschluss von Task 1 (unbekanntes Feld `exclusiveGroup`/`mmprojPath` lässt
`parseLoadouts` mit `unbekanntes Feld 'exclusiveGroup'` bzw. `'mmprojPath'` werfen, sobald Task 2
die neuen JSON-Einträge enthält aber Task 1 noch nicht gemacht ist) — grün erst nach beiden
Tasks. Der eigentliche Testrunner-Failing-Test-Step (`vitest`/`bats`) für dieses Schema gehört
zum separaten Test-Partial dieses Plans, nicht hierher.
