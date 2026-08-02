# p4-llmproxy-inflight — per-Backend `max_inflight`-Semaphor (REQ-LLMPROXY-INFLIGHT-001)

Rolle: `impl`. Ersetzt die strikte 1-Request-FIFO-Serialisierung pro Backend im llm-proxy durch
ein per-Backend-Semaphor, dessen Limit aus der neuen Spalte `tickets.llm_proxy_backends.max_inflight`
(integer NOT NULL DEFAULT 1) stammt. **`max_inflight=1` ⇒ byte-identisches Verhalten zu heute**
(genau ein In-Flight-Request pro Backend, strikte FIFO-Ordnung) — das ist die Regressions-Grenze.
Echte Bonsai-Parallelität wird damit ein DB-`UPDATE` + Proxy-Restart, keine Code-Änderung (D4).

**target_files (disjunkt — nichts anderes):**
`scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql` (NEU),
`scripts/llm-proxy/backends.mjs`,
`scripts/llm-proxy/server.mjs`.

`scripts/llm-proxy/discovery.mjs` wird **nicht** angefasst — die `{inflight, max_inflight}`-Anreicherung
von `/admin/state` passiert in `server.mjs` (die Semaphor-State lebt dort), `getState()` bleibt
unverändert. **Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein**
RED-Failing-Test-Step (lebt in `p5-tests`). Jeder Code-Task endet mit einem lokalen
`node --check`-Prüf-Step. `/health` (Z.159) bleibt **unangetastet** — Gang-Gating-Clients nutzen
`/admin/state`, nicht `/health`.

## S1-Zeilenbudgets (wirksame Schwelle; beide `.mjs` unbaselined ⇒ Extension-Limit `.mjs` = 500)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/llm-proxy/server.mjs` | 169 | 331 |
| `scripts/llm-proxy/backends.mjs` | 50 | 450 |

Geschätzter Endstand: `server.mjs` ~200 (Semaphor-Helfer ersetzt die 8-Zeilen-`enqueue`,
`/admin/state`-Anreicherung +~6), `backends.mjs` ~53 — beide mit deutlicher Reserve unter dem
500er-Limit. Die neue Migration ist eine `.sql`-Datei ohne S1-Extension-Limit.

## Reihenfolge innerhalb des Partials

Task 1 (Migration) → Task 2 (`backends.mjs` liefert `maxInflight`) → Task 3 (`server.mjs`-Semaphor
konsumiert `maxInflight`) → Task 4 (`/admin/state`) → Task 5 (Post-Merge-Rollout: Migration auf
beide Brand-DBs, **dann** Restart). Die DB-Migration muss vor dem Proxy-Restart laufen, weil der
neue `backends.mjs`-`SELECT` die Spalte `max_inflight` referenziert (siehe Task 5, Deploy-Ordnung).

---

## Task 1: Migration `2026-07-23-llm-proxy-max-inflight.sql` (NEU)

Neue Datei `scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql`. Fügt die Spalte idempotent
hinzu (`ADD COLUMN IF NOT EXISTS` — Muster analog `2026-07-22-llm-proxy-backends.sql`) und trägt
den Anwendungsweg auf **beide Brand-DBs** im Kopfkommentar (Repo-Konvention: `factory_resolve;
factory_psql < …` je `BRAND`, wie bei `2026-07-21-provider-config-bonsai-only.sql`). Die bestehende
Tabelle hat: `id, name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases,
created_at, updated_at` (verifiziert) — die Spalte wird ans Ende gehängt; Position ist irrelevant.

```sql
-- 2026-07-23-llm-proxy-max-inflight.sql
-- Per-Backend-Concurrency-Limit für die LLM-Proxy-Backend-Registry.
-- Default 1 = heutige strikte Serialisierung (byte-identisch). Pro Backend
-- (z. B. llamacpp-bonsai) hochsetzen erlaubt echte Parallelität OHNE Code-Änderung.
-- Idempotent (ADD COLUMN IF NOT EXISTS). Reversibel: ALTER TABLE … DROP COLUMN max_inflight.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql'
BEGIN;

ALTER TABLE tickets.llm_proxy_backends
  ADD COLUMN IF NOT EXISTS max_inflight integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN tickets.llm_proxy_backends.max_inflight IS
  'Max gleichzeitig in-flight Requests, die der Proxy pro Backend zulaesst (Semaphor-Limit). 1 = strikte FIFO-Serialisierung (Default).';

COMMIT;
```

**Akzeptanz:** Spalte existiert nach Lauf, alle Bestandszeilen tragen `max_inflight=1`, zweiter Lauf
ist ein No-op (kein Fehler). `ADD COLUMN … NOT NULL DEFAULT 1` schreibt den Default in PG 11+ ohne
vollen Table-Rewrite.

**Verify (lokal, gegen die aktuell erreichbare Brand-DB — Read-only-Probe der Idempotenz):**

```bash
# Trockenlauf-Syntaxprüfung ohne Ausführung:
grep -q 'ADD COLUMN IF NOT EXISTS max_inflight' scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql && echo "migration present"
# erwartet: migration present
```

Die tatsächliche Anwendung auf beide DBs ist Task 5 (Post-Merge), nicht dieser Schreib-Task.

---

## Task 2: `backends.mjs` — `max_inflight` im `SELECT` + Backend-Objekt + Typedef

`loadBackendsOnce` lädt die Registry tab-delimited (Z.8-33). Der `SELECT` bekommt eine zusätzliche
Spalte, die Destrukturierung ein zusätzliches Feld, das Backend-Objekt `maxInflight`. Der
`LLM_PROXY_BACKENDS_JSON`-Test-Pfad (Z.14-16) gibt Objekte **verbatim** zurück — ein `maxInflight`-Feld
im JSON fließt damit unverändert an `server.mjs` durch (Test-Seam für p5, ohne neuen Export).

- [ ] Typedef (Z.4-6) um `maxInflight:number` erweitern.
- [ ] `SQL` (Z.8-10) um `||E'\t'||max_inflight` als **letzte** Spalte ergänzen (vor `FROM`).
- [ ] Destrukturierung (Z.23) um `maxInflight` als letztes Feld erweitern; im Rückgabe-Objekt
      `maxInflight: Number(maxInflight) || 1` setzen (Fallback 1, falls Feld leer/undefiniert —
      degradiert auf heutiges Verhalten, nie `NaN`/`0`).

```js
// scripts/llm-proxy/backends.mjs — Ausschnitt (nur die 3 geänderten Stellen)

/** @typedef {{ name:string, kind:'llamacpp'|'lmstudio'|'openai-remote',
 *   baseUrl:string, apiKeyEnv:string|null, enabled:boolean, priority:number,
 *   fixups:string[], modelAliases:Record<string,string>, maxInflight:number }} Backend */

const SQL = `SELECT name||E'\\t'||kind||E'\\t'||base_url||E'\\t'||COALESCE(api_key_env,'')
  ||E'\\t'||enabled||E'\\t'||priority||E'\\t'||fixups::text||E'\\t'||model_aliases::text
  ||E'\\t'||max_inflight
  FROM tickets.llm_proxy_backends WHERE enabled ORDER BY priority ASC;`;

// … in loadBackendsOnce, map-Callback:
const [name, kind, baseUrl, apiKeyEnv, enabled, priority, fixups, aliases, maxInflight] = line.split('\t');
return {
  name, kind, baseUrl,
  apiKeyEnv: apiKeyEnv || null,
  enabled: enabled === 't',
  priority: Number(priority),
  fixups: JSON.parse(fixups || '[]'),
  modelAliases: JSON.parse(aliases || '{}'),
  maxInflight: Number(maxInflight) || 1,
};
```

**Verify:**

```bash
node --check scripts/llm-proxy/backends.mjs
# erwartet: exit 0

# JSON-Test-Pfad trägt maxInflight durch (kein DB-Zugriff):
LLM_PROXY_BACKENDS_JSON='[{"name":"b","kind":"llamacpp","baseUrl":"x","apiKeyEnv":null,"enabled":true,"priority":1,"fixups":[],"modelAliases":{},"maxInflight":4}]' \
node -e "import('./scripts/llm-proxy/backends.mjs').then(m => {
  m.startRegistryPoll(999999);
  console.log('maxInflight:', m.getBackends()[0].maxInflight);
})"
# erwartet: maxInflight: 4
```

---

## Task 3: `server.mjs` — FIFO-Queue → per-Backend-Semaphor (Regressions-Grenze `max_inflight=1`)

Ersetzt die Promise-Ketten-Serialisierung (`queues`-Map + `enqueue`, Z.28-35) durch ein kleines
**pures** per-Backend-Semaphor (S2: keine Rück-Importe auf DB-/API-Schichten, kein neues Modul —
Hilfsstruktur bleibt in `server.mjs`). Bis zu `limit` Requests laufen gleichzeitig; überzählige
warten in **FIFO**-Reihenfolge und übernehmen den Slot per Hand-off beim Release. Der `enqueue`-
Rückgabevertrag `{ run, queuedAt }` bleibt erhalten, damit der Aufruferblock (Z.127-130) inkl.
`[queue] … waited`-Log **byte-identisch** bleibt.

**Äquivalenz-Argument (`limit=1`):** Bei `inflight<1` (also 0) startet ein Request sofort und setzt
`inflight=1`; jeder weitere wird angehängt; beim Release übernimmt exakt der nächste Wartende den
einen Slot → genau ein In-Flight, strikte FIFO — identisch zur bisherigen `prev.then(fn)`-Kette.

- [ ] Den Blockkommentar Z.14-22 präzisieren: aus »pro Backend genau ein Request« wird »pro Backend
      bis zu `max_inflight` Requests (Default 1 = wie bisher genau einer), Rest FIFO«. Der
      KV-Pool-/Crash-Kontext und die `max_tokens`-Deckelung bleiben wörtlich stehen.
- [ ] `const queues = new Map()` + `function enqueue(...)` (Z.28-35) durch die Semaphor-Struktur
      unten ersetzen. Der Aufruf in `proxyV1` (Z.127) übergibt zusätzlich das Limit:
      `enqueue(backend.name, backend.maxInflight ?? 1, () => forwardToBackend(...))`. Z.128-130
      (`waitMs`-Berechnung + Log) bleiben **unverändert**.
- [ ] Stale-Semaphor-Einträge (Backend fällt aus der Registry) sind harmlos: `inflight` läuft auf 0
      aus, keine Waiter — kein aktives Cleanup nötig, im Kommentar vermerken.

```js
// Per-Backend-Semaphor: bis zu `limit` Requests gleichzeitig in-flight, ueberzaehlige warten FIFO.
// limit=1 ist aequivalent zur bisherigen Promise-Ketten-Serialisierung (genau 1 in-flight, strikte
// FIFO) — damit bleibt das Default-Verhalten byte-identisch. Stale Eintraege (Backend faellt aus der
// Registry) laufen auf inflight=0 aus und schaden nicht; kein aktives Cleanup noetig.
const sems = new Map(); // backend.name -> { inflight:number, waiters: Array<() => void> }

function semFor(name) {
  let s = sems.get(name);
  if (!s) { s = { inflight: 0, waiters: [] }; sems.set(name, s); }
  return s;
}

function acquire(name, limit) {
  const s = semFor(name);
  if (s.inflight < limit) { s.inflight++; return Promise.resolve(); }
  return new Promise((resolve) => s.waiters.push(resolve)); // FIFO: hinten anstellen
}

function release(name) {
  const s = semFor(name);
  const next = s.waiters.shift();     // FIFO: vorne entnehmen
  if (next) next();                   // Slot direkt an den naechsten Wartenden weiterreichen (inflight konstant)
  else if (s.inflight > 0) s.inflight--;
}

function enqueue(name, limit, fn) {
  const queuedAt = Date.now();
  const run = acquire(name, limit).then(fn).finally(() => release(name));
  return { run, queuedAt };
}

// exportiert fuer /admin/state (Task 4): aktueller In-Flight-Zaehler eines Backends
function inflightOf(name) { return sems.get(name)?.inflight ?? 0; }
```

**Verify:**

```bash
node --check scripts/llm-proxy/server.mjs
# erwartet: exit 0
wc -l scripts/llm-proxy/server.mjs
# erwartet: deutlich unter 500 (S1 .mjs-Limit; Budget ab 169 = 331)
```

Das echte Semaphor-Verhalten beider Scenarios (limit=1 serialisiert, limit=4 parallel + Ordnung)
wird im **p5-tests**-Partial als bootender BATS/Node-Test gegen einen Mock-Backend über den
`LLM_PROXY_BACKENDS_JSON`-Seam geprüft — nicht hier.

---

## Task 4: `server.mjs` — `/admin/state` um `{inflight, max_inflight}` pro Backend anreichern

Der `/admin/state`-Handler (Z.161) gibt heute `getState(getBackends)` durch. Da die Semaphor-State
in `server.mjs` lebt und `discovery.mjs` disjunkt bleibt, wird die Antwort **hier** angereichert
statt `getState` zu ändern.

- [ ] Handler Z.161 durch eine anreichernde Variante ersetzen: `getState(getBackends)` holen, dann
      pro Backend-Zeile `inflight` (aus `inflightOf(b.name)`) und `max_inflight` (aus dem
      Backend-Objekt via `getBackends()`, Fallback 1) mergen. `/v1/models`, `/admin/reload`,
      `/health`, `/v1/*`-POST bleiben unverändert.

```js
if (path === '/admin/state' && method === 'GET') {
  const state = getState(getBackends);
  const limits = new Map(getBackends().map((b) => [b.name, b.maxInflight ?? 1]));
  state.backends = state.backends.map((b) => ({
    ...b,
    inflight: inflightOf(b.name),
    max_inflight: limits.get(b.name) ?? 1,
  }));
  return sendJson(res, 200, state);
}
```

**Verify:**

```bash
node --check scripts/llm-proxy/server.mjs
# erwartet: exit 0

# Doku (nach Restart mit erreichbarem Backend, Task 5): das Feldpaar erscheint pro Backend.
#   curl -s http://127.0.0.1:18235/admin/state | jq '.backends[] | {name, inflight, max_inflight}'
#     → z. B. {"name":"llamacpp-bonsai","inflight":0,"max_inflight":1}
```

---

## Task 5: Post-Merge-Rollout — Migration auf beide Brand-DBs, dann Proxy manuell neu starten + Frische verifizieren

Der Proxy läuft als **manuell gestarteter Node-Prozess** (`node scripts/llm-proxy/server.mjs`,
Bind `127.0.0.1:18235`) — **keine systemd-Unit** in diesem Repo-Stand, also kein Auto-Reload nach
Merge. Ein stehengebliebener Alt-Prozess würde den neuen Semaphor-Code **still nicht** laden und die
Registry mit dem alten `SELECT` (ohne `max_inflight`) weiter bedienen. Bekannte Falle aus Memory
(`project_t002102-unified-llm-gateway`): nach jeder Proxy-Änderung Prozess-Frische aktiv prüfen.

**Deploy-Ordnung ist zwingend:** erst Migration (neuer `SELECT` referenziert `max_inflight`), dann
Restart. Umgekehrt schlägt `loadBackendsOnce` fehl (Spalte fehlt) → Registry-Poll-`catch` → leerer
Backend-Cache → 503. Migration-first ist beidseitig sicher (alter Code ignoriert die neue Spalte).

- [ ] **(a) Migration auf beide Brand-DBs anwenden** (Konvention aus dem Migrations-Kopfkommentar):

```bash
BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql'
BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql'
# erwartet je Brand: ALTER TABLE / COMMENT / COMMIT ohne Fehler; zweiter Lauf No-op
```

- [ ] **(b) Laufenden Proxy neu starten** (Alt-Prozess beenden, neuen aus dem gemergten `main`-Stand
      starten):

```bash
pkill -f 'llm-proxy/server.mjs' || true
LOGF="$HOME/.local/state/llm-proxy.log"; mkdir -p "$(dirname "$LOGF")"
nohup node scripts/llm-proxy/server.mjs >> "$LOGF" 2>&1 &
```

- [ ] **(c) Prozess-Frische verifizieren** — der neue Prozess muss **nach** dem letzten Speichern von
      `server.mjs` gestartet sein (sonst läuft noch Alt-Code):

```bash
PID="$(pgrep -f 'llm-proxy/server.mjs' | head -1)"
echo "proc start : $(ps -o lstart= -p "$PID")"
echo "file mtime : $(stat -c %y scripts/llm-proxy/server.mjs)"
# erwartet: 'proc start' liegt ZEITLICH NACH 'file mtime' — sonst blieb ein Alt-Prozess stehen: (b) wiederholen.

# Funktions-Smoke: das neue Feldpaar ist da, Default 1 (byte-identisch zu heute):
curl -s http://127.0.0.1:18235/admin/state | jq '.backends[] | {name, inflight, max_inflight}'
# erwartet: jede Zeile trägt inflight (Zahl) und max_inflight (Default 1)
```

- [ ] **(d) Physische Parallelität ist ab jetzt reine Konfiguration (kein Code):** um z. B. die
      Bonsai-Gang wirklich parallel laufen zu lassen, `max_inflight` per DB-`UPDATE` hochsetzen und
      Proxy erneut über (b)+(c) neu starten. **Nicht in diesem PR** — Host läuft `-np 1`, Crash-
      Historie unter 3-4×-Last (D4); das Hochsetzen ist ein separater Cutover-Schritt.

```sql
-- Beispiel (NICHT Teil dieses Merges — nur Doku des späteren Cutover-Wegs):
-- UPDATE tickets.llm_proxy_backends SET max_inflight = 4, updated_at = now() WHERE name = 'llamacpp-bonsai';
```
