---
title: "bge-embed-routing — Implementation Plan"
ticket_id: T002570
domains: [infra, ops, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-embed-routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `embedAll()` in `scripts/knowledge/lib-knowledge-pg.mjs` nutzt bge-m3 künftig als primären Embedding-Provider (statt Voyage AI als Default) und fällt nur bei Fehlschlag auf Voyage zurück; zwei weitere Env-Var-Routing-Lücken (`k3d/website.yaml`, `k3d/knowledge-ingest-cronjob.yaml`) und toter `:8095`-Fallback-Code (`scripts/index-repo.ts`) werden korrigiert.

**Architecture:** `embedAll()` versucht zuerst `POST ${LLM_EMBED_URL}/v1/embeddings` (bge-m3, llama.cpp OpenAI-kompatibel); schlägt das fehl, merkt sich eine Modul-Variable `bgeDead` das für den Rest des Prozesslaufs (keine wiederholten Timeouts pro Dokument in einer Schleife) und alle weiteren Aufrufe in diesem Lauf gehen direkt auf Voyage. Der tote `callRouter()`/`LLM_ROUTER_URL`-Pfad (zeigt auf einen nie existierenden Cluster-Service) wird entfernt.

**Tech Stack:** Node.js (ESM, `fetch`), Kubernetes-Manifeste (Kustomize), BATS.

## Global Constraints

- Timeout für den bge-Versuch: `AbortSignal.timeout(10_000)` (10s) — reicht für bge-m3-CPU-Inferenz bei Batch-Größe 64.
- `embedAll()`-Signatur wird zu `embedAll(texts, batch = 128)` vereinfacht (kein `model`-Parameter mehr) — Aufrufer bleiben unverändert (`embedAll(chunks.map(...))`).
- bge-Batch-Größe bleibt 64 (bestehender Wert), Voyage-Batch-Größe bleibt 128 (bestehender Wert).
- Keine Brand-Domain-Literale (`*.mentolder.de`/`*.korczewski.de`) in Code-Snippets — beide Manifest-Änderungen nutzen ausschließlich Cluster-DNS-Namen bzw. bestehende `${VAR}`-Platzhalter.
- Bestehende Tests: `tests/spec/local-llm-proxy/bge-token-ssot.bats` bleibt unverändert (neue Datei statt Anhängen, T002416-Konvention).

---

## File Structure

| Datei | Ist-Zeilen | Wirksames S1-Budget | Änderung |
|---|---:|---:|---|
| `scripts/knowledge/lib-knowledge-pg.mjs` | 153 | 800 (nicht-baselined, `.mjs`-Limit) → Budget 647 | `embedAll()` umbauen, `callRouter`/`getRouterUrl`/`LLM_ROUTER_URL` entfernen |
| `k3d/knowledge-ingest-cronjob.yaml` | 544 | kein S1-Limit für `.yaml` | `LLM_EMBED_URL` in 3 CronJob-env-Blöcke ergänzen |
| `k3d/website.yaml` | 825 | kein S1-Limit für `.yaml` | `LLM_RERANKER_URL`-Zeile ergänzen |
| `scripts/index-repo.ts` | 445 | 900 (nicht-baselined, `.ts`-Limit) → Budget 455 | zwei `:8095`→`:8081`-Korrekturen + Kommentar |
| `tests/spec/local-llm-proxy/embed-bge-fallback.bats` | neu | — | Failing Test (RED vor Task 2, GREEN danach) |

Kein S1-Budget wird durch diese Änderungen überschritten — alle vier Dateien haben nach der Änderung noch deutlich Luft unter ihrer wirksamen Schwelle (Netto-Zeilenänderung pro Datei liegt im niedrigen zweistelligen Bereich).

---

### Task 1: Failing Test schreiben — `embedAll()` muss bge zuerst versuchen und den Fallback loggen

**Files:**
- Create: `tests/spec/local-llm-proxy/embed-bge-fallback.bats`

**Interfaces:**
- Konsumiert: `embedAll` aus `scripts/knowledge/lib-knowledge-pg.mjs` (aktuelle Signatur: `embedAll(texts, model = 'voyage-multilingual-2', batch = 128)`, aufgerufen im Test nur mit `texts`).
- Produziert: nichts für spätere Tasks — dieser Test bleibt bis Task 2 rot.

- [ ] **Step 1: Test-Datei schreiben**

```bash
cat > tests/spec/local-llm-proxy/embed-bge-fallback.bats <<'BATSEOF'
#!/usr/bin/env bats
# T002570 — embedAll() muss bge-m3 zuerst versuchen und bei Fehlschlag mit
# einer geloggten Warnung auf Voyage AI zurueckfallen. Vor dem Fix ging
# embedAll() ohne explizites model='bge-m3' sofort auf Voyage, ohne bge je
# zu versuchen und ohne Fallback-Warnung zu loggen — der Live-Beweis dafuer
# sind die wiederholt fehlgeschlagenen knowledge-ingest-bugs/-prs CronJobs.
#
# Pruefmodus: command output verification [T002448-M4]. Ein Node-Inline-
# Skript mockt fetch (bge unerreichbar, Voyage antwortet), ruft embedAll()
# echt auf und prueft Rueckgabewert UND Log-Ausgabe — kein Source-Grep.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LIB="${REPO_ROOT}/scripts/knowledge/lib-knowledge-pg.mjs"
}

@test "T002570: embedAll() faellt bei unerreichbarem bge auf Voyage zurueck und loggt die Warnung" {
  [ -f "${LIB}" ]

  run node --input-type=module -e "
    process.env.LLM_EMBED_URL = 'http://127.0.0.1:1';
    process.env.VOYAGE_API_KEY = 'fake-key-for-test';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('127.0.0.1:1')) {
        throw new Error('connect ECONNREFUSED (mocked bge failure)');
      }
      if (u.includes('voyageai.com')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ embedding: Array(1024).fill(0.1) }],
            usage: { total_tokens: 3 },
          }),
        };
      }
      return originalFetch(url, opts);
    };

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.join(' ')); originalWarn(...args); };

    const { embedAll } = await import('${LIB}');
    const result = await embedAll(['hallo welt']);

    if (!Array.isArray(result) || result.length !== 1 || result[0].length !== 1024) {
      console.error('UNEXPECTED_RESULT', JSON.stringify(result));
      process.exit(1);
    }
    const sawFallbackWarning = warnings.some(w => /bge/i.test(w) && /voyage/i.test(w));
    if (!sawFallbackWarning) {
      console.error('NO_FALLBACK_WARNING_LOGGED. warnings=' + JSON.stringify(warnings));
      process.exit(1);
    }
    console.log('OK: fallback worked and was logged');
  "
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"OK: fallback worked and was logged"* ]]
}
BATSEOF
```

- [ ] **Step 2: Test ausführen und Fehlschlag bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/embed-bge-fallback.bats`
Expected: FAIL — `embedAll(['hallo welt'])` ruft heute mit nur einem Argument den Voyage-Default-Pfad direkt auf (kein bge-Versuch, keine Fallback-Warnung), daher schlägt die `NO_FALLBACK_WARNING_LOGGED`-Prüfung fehl und der Test-Exit-Code ist ungleich 0.

- [ ] **Step 3: Commit**

```bash
git add tests/spec/local-llm-proxy/embed-bge-fallback.bats
git commit -m "test(knowledge): add failing bge-fallback test for embedAll [T002570]"
```

---

### Task 2: `embedAll()` umbauen — bge-m3 primär, Voyage-Fallback

**Files:**
- Modify: `scripts/knowledge/lib-knowledge-pg.mjs`

**Interfaces:**
- Konsumiert: `process.env.LLM_EMBED_URL`, `process.env.VOYAGE_API_KEY` (bestehend, `callVoyage` unverändert außer Aufrufkontext).
- Produziert: `embedAll(texts: string[], batch?: number): Promise<number[][]>` — neue, vereinfachte Signatur ohne `model`-Parameter. Aufrufer in `ingest-bug-tickets.mjs`, `ingest-prs.mjs`, `ingest-markdown.mjs` bleiben unverändert (`embedAll(chunks.map(c => c.text))`).

- [ ] **Step 1: `callRouter()`/`getRouterUrl()` durch `embedViaBge()` ersetzen**

Ersetze in `scripts/knowledge/lib-knowledge-pg.mjs` den Block:

```js
function getRouterUrl() {
  const u = process.env.LLM_ROUTER_URL;
  try {
    new URL(u);
    return u;
  } catch {
    return 'http://llm-router.workspace.svc.cluster.local:4000';
  }
}

export async function callRouter(texts, model = 'bge-m3') {
  const url = getRouterUrl();
  const r = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!r.ok) throw new Error(`router ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { embeddings: j.data.map(d => d.embedding) };
}
```

durch:

```js
// T002570: LLM_ROUTER_URL/llm-router.workspace.svc.cluster.local:4000 war toter
// Code — dieser Service existiert im Cluster nicht. bge-m3 laeuft ueber
// LLM_EMBED_URL, dieselbe Konvention wie website/src/lib/bge-router.ts
// (http://llm-gateway-embed.workspace.svc.cluster.local:8081, k3d/llm-gpu.yaml).
async function embedViaBge(texts, url) {
  const r = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'bge-m3', input: texts }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`bge ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { embeddings: j.data.map(d => d.embedding) };
}
```

- [ ] **Step 2: `embedAll()` umbauen — bge-primär, Voyage-Fallback, pro-Lauf gemerkt**

Ersetze:

```js
export async function embedAll(texts, model = 'voyage-multilingual-2', batch = 128) {
  const out = [];
  if (model === 'bge-m3') {
    const bgeBatch = 64;
    for (let i = 0; i < texts.length; i += bgeBatch) {
      const r = await callRouter(texts.slice(i, i + bgeBatch), model);
      out.push(...r.embeddings);
    }
    return out;
  }

  for (let i = 0; i < texts.length; i += batch) {
    const r = await callVoyage(texts.slice(i, i + batch), 'document');
    out.push(...r.embeddings);
  }
  return out;
}
```

durch:

```js
// T002570: bge-m3 ist primaer, Voyage AI nur Fallback. bgeDead lebt nur fuer
// den aktuellen Prozesslauf (Modul-Variable, kein persistenter Zustand) —
// die Ingest-Skripte rufen embedAll() pro Dokument in einer Schleife auf;
// ohne diesen Cache wuerde bei totem bge jedes Dokument erneut 10s Timeout
// kosten, bevor auf Voyage ausgewichen wird.
let bgeDead = false;

export async function embedAll(texts, batch = 128) {
  const bgeUrl = process.env.LLM_EMBED_URL;
  if (bgeUrl && !bgeDead) {
    try {
      const out = [];
      const bgeBatch = 64;
      for (let i = 0; i < texts.length; i += bgeBatch) {
        const r = await embedViaBge(texts.slice(i, i + bgeBatch), bgeUrl);
        out.push(...r.embeddings);
      }
      return out;
    } catch (err) {
      console.warn(
        `[embedAll] bge-m3 (${bgeUrl}) fehlgeschlagen — falle fuer den Rest `
        + `dieses Laufs auf Voyage AI zurueck: ${err.message}`,
      );
      bgeDead = true;
    }
  } else if (!bgeUrl) {
    console.warn('[embedAll] LLM_EMBED_URL nicht konfiguriert — falle auf Voyage AI zurueck');
  }

  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const r = await callVoyage(texts.slice(i, i + batch), 'document');
    out.push(...r.embeddings);
  }
  return out;
}
```

- [ ] **Step 3: Test ausführen und Erfolg bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/embed-bge-fallback.bats`
Expected: PASS — `embedAll()` versucht jetzt `embedViaBge()` (mockt fehl), loggt die Fallback-Warnung, fällt auf `callVoyage()` zurück und liefert das erwartete 1024-dim Embedding.

- [ ] **Step 4: Commit**

```bash
git add scripts/knowledge/lib-knowledge-pg.mjs
git commit -m "fix(knowledge): embedAll bge-m3 primary with voyage fallback [T002570]"
```

---

### Task 3: `k3d/knowledge-ingest-cronjob.yaml` — `LLM_EMBED_URL` ergänzen

**Files:**
- Modify: `k3d/knowledge-ingest-cronjob.yaml`

**Interfaces:**
- Konsumiert: nichts Neues aus vorherigen Tasks (reine Manifest-Ergänzung).
- Produziert: `LLM_EMBED_URL` als Env-Var in allen drei CronJob-Containern, gelesen von `embedViaBge()` (Task 2) zur Laufzeit.

- [ ] **Step 1: `LLM_EMBED_URL` in alle drei env-Blöcke ergänzen**

In `k3d/knowledge-ingest-cronjob.yaml` gibt es drei Container-`env`-Blöcke (für `knowledge-ingest-prs`, `knowledge-ingest-markdown`, `knowledge-ingest-bugs`), jeweils mit `PGPASSWORD` (und teils `VOYAGE_API_KEY`/`BRAND`). Ergänze in **jedem** der drei Blöcke direkt nach dem `VOYAGE_API_KEY`-Eintrag (bzw. nach `PGPASSWORD`, falls `VOYAGE_API_KEY` in diesem Block fehlt):

```yaml
                - name: LLM_EMBED_URL
                  value: "http://llm-gateway-embed.workspace.svc.cluster.local:8081"
```

(Einrückung an die jeweils umgebenden `env`-Einträge im selben Block anpassen — alle drei Blöcke nutzen 16 Leerzeichen Einrückung für `- name:`.)

- [ ] **Step 2: Manifest validieren**

Run: `task workspace:validate`
Expected: PASS — Kustomize baut das Manifest ohne YAML-Fehler; kein neuer Kustomization-Eintrag nötig, da `knowledge-ingest-cronjob.yaml` bereits in `k3d/kustomization.yaml` referenziert ist.

- [ ] **Step 3: Commit**

```bash
git add k3d/knowledge-ingest-cronjob.yaml
git commit -m "fix(infra): wire LLM_EMBED_URL into knowledge-ingest CronJobs [T002570]"
```

---

### Task 4: `k3d/website.yaml` — fehlende `LLM_RERANKER_URL` ergänzen

**Files:**
- Modify: `k3d/website.yaml`

**Interfaces:**
- Konsumiert: nichts Neues.
- Produziert: `LLM_RERANKER_URL` als Env-Var im website-Deployment, gelesen von `website/src/lib/bge-router.ts::resolveEndpoint('rerank')` zur Laufzeit.

- [ ] **Step 1: `LLM_RERANKER_URL`-Zeile ergänzen**

In `k3d/website.yaml`, im Kommentarblock `# LLM (local-first pipeline — bge-embed/rerank in-cluster via llm-gateway Services)`, direkt nach der bestehenden Zeile `LLM_EMBED_URL: "${LLM_EMBED_URL}"` ergänzen:

```yaml
  LLM_RERANKER_URL: "${LLM_RERANKER_URL}"
```

- [ ] **Step 2: Manifest validieren**

Run: `task workspace:validate`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add k3d/website.yaml
git commit -m "fix(infra): wire missing LLM_RERANKER_URL into website Deployment [T002570]"
```

---

### Task 5: `scripts/index-repo.ts` — tote `:8095`-Fallbacks korrigieren, Verify, Freshness

**Files:**
- Modify: `scripts/index-repo.ts:73-92` (Funktion `resolveEmbedConfig`)

**Interfaces:**
- Konsumiert: nichts Neues.
- Produziert: nichts für spätere Tasks — letzter Task des Plans.

- [ ] **Step 1: Kommentar und beide `:8095`-Referenzen korrigieren**

Ersetze in `scripts/index-repo.ts` innerhalb `resolveEmbedConfig()`:

```ts
  // T002258: was llm-gateway-lmstudio:1234 (LM Studio). bge-m3 moved to a
  // dedicated llama-server on :8095 with T002110/PR #3150; the Service in
  // k3d/llm-gpu.yaml is `llm-gateway-embed` on port 8095 and LM Studio is gone.
  const clusterHost = 'llm-gateway-embed.workspace.svc.cluster.local';
  const localUrl = 'http://localhost:8095';
```

durch:

```ts
  // T002258: was llm-gateway-lmstudio:1234 (LM Studio). bge-m3 moved to a
  // dedicated llama-server, and LM Studio is gone. T002551: the host-local
  // llama-server (was :8095) is decommissioned; the Service in k3d/llm-gpu.yaml
  // is `llm-gateway-embed` on port 8081 (T002570 corrected the stale :8095
  // fallback references below).
  const clusterHost = 'llm-gateway-embed.workspace.svc.cluster.local';
  const localUrl = 'http://localhost:8081';
```

und weiter unten im selben Funktionsrumpf:

```ts
      : (await clusterDnsResolves(clusterHost)) ? `http://${clusterHost}:8095` : localUrl;
```

durch:

```ts
      : (await clusterDnsResolves(clusterHost)) ? `http://${clusterHost}:8081` : localUrl;
```

- [ ] **Step 2: Finale Verifikation**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: PASS für alle drei Kommandos — `task test:changed` läuft u.a. die neue `embed-bge-fallback.bats` und alle anderen `tests/spec/local-llm-proxy/*.bats`, `task freshness:regenerate` aktualisiert generierte Artefakte (Test-Inventar etc.), `task freshness:check` bestätigt S1–S4-Ratchet und Baseline-Unveränderlichkeit.

- [ ] **Step 3: Commit**

```bash
git add scripts/index-repo.ts
git commit -m "fix(scripts): correct stale :8095 fallback to :8081 in index-repo [T002570]"
```
