---
title: "scs-index-silent-skip — Implementation Plan"
ticket_id: T002292
domains: [infra, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# scs-index-silent-skip — Implementation Plan

_Ticket: T002292_

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/index-repo.ts` bricht bei Infrastrukturfehlern hart ab, statt sie als per-Datei-SKIP zu maskieren, und `task scs:index` findet den Embedding-Endpunkt auch vom WSL-Host.

**Architecture:** Drei Eingriffe in `scripts/index-repo.ts` — Erreichbarkeits-Probe bei der Endpunkt-Auflösung, exportierte Fehlerklassifikation mit Rethrow, getrennte Zähler für unverändert vs. fehlgeschlagen — plus eine Retry-Schleife im Taskfile-Task. Der RED-Test liegt bereits vor.

**Tech Stack:** TypeScript (tsx), Vitest, BATS, go-task, PostgreSQL/pgvector, llama.cpp bge-m3.

## Global Constraints

- `scripts/index-repo.ts` ist **nicht** gebaselined; wirksame Schwelle ist das `.ts`-Limit 600.
- `environments/mentolder.yaml` wird **nicht** geändert — der dortige Cluster-URL-Wert ist für den in-cluster-Aufruf korrekt.
- Kein `fuser -k <port>/tcp` in Shell-Code: es signalisiert die eigene Prozessgruppe mit und beendet die aufrufende Shell.
- Kommentare in `scripts/*.ts` folgen der Datei-Konvention: Deutsch, ASCII-Schreibweise (`ueber`, `haelt`).
- Keine neuen Einträge in `docs/code-quality/baseline.json` — CI vergleicht die Key-Anzahl gegen main.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/index-repo.ts` | 408 | 192 |
| `scripts/index-repo.test.ts` | 180 | 420 |
| `Taskfile.yml` | 4788 | n/a (kein S1-Scope für `.yml`) |
| `tests/unit/scs-index.bats` | 62 | n/a (kein S1-Scope für `.bats`) |
| `openspec/changes/scs-index-silent-skip/specs/brett.md` | Delta-Spec | n/a |

Verantwortlichkeiten:

- `scripts/index-repo.ts` — Endpunkt-Auflösung, Fehlerklassifikation, Indexier-Schleife.
- `scripts/index-repo.test.ts` — Unit-Tests der pure functions (kein Netz, keine DB).
- `Taskfile.yml` (Task `scs:index`) — Port-Forward-Orchestrierung und Retry.
- `tests/unit/scs-index.bats` — offline-Struktur-Guards gegen Regression.

---

### Task 1: Fehlerklassifikation und getrennte Zähler

**Files:**
- Modify: `scripts/index-repo.ts` (Zähler-Block und catch in `main()`, ab Zeile 363)
- Test: `scripts/index-repo.test.ts` (RED-Test liegt bereits vor)

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: `export function isInfrastructureError(err: unknown, depth?: number): boolean` — von Task 3 im BATS-Guard per grep referenziert.

- [ ] **Step 1: Den bereits vorhandenen Failing-Test laufen lassen**

```bash
npx vitest run scripts/index-repo.test.ts
# expected: FAIL — "TypeError: isInfrastructureError is not a function", 7 failed | 10 passed
```

- [ ] **Step 2: Klassifikations-Funktion implementieren**

In `scripts/index-repo.ts` direkt nach `function sha256(...)` einfügen:

```ts
// T002292 — Fehler, die niemals datei-spezifisch sein koennen.
//
// main() fing bisher JEDEN Fehler pro Datei und verbuchte ihn als SKIP. Damit
// wurden zwei globale Stoerungen unsichtbar: eine unerreichbare Embed-URL und
// ein abgerissener port-forward auf shared-db. Beide entwerten den GESAMTEN
// Lauf — sie muessen hart abbrechen, nicht 4772-mal still uebersprungen werden.
// Ein HTTP 500 des Embedding-Servers dagegen betrifft genau einen zu langen
// Chunk (T002266) und bleibt zu Recht ein SKIP.
const INFRA_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPIPE',
]);

// undici verpackt Socket-Fehler in ein nacktes "fetch failed"; pg meldet einen
// weggebrochenen Pool als Klartext ohne .code.
const INFRA_ERROR_MESSAGES = [
  'fetch failed',
  'Connection terminated',
  'timeout exceeded when trying to connect',
];

export function isInfrastructureError(err: unknown, depth = 0): boolean {
  // Nicht-Error-Werte (null, Strings) sind nie eine Diagnose — sonst wuerde ein
  // Dateiinhalt, der zufaellig "ECONNREFUSED" enthaelt, den Lauf abbrechen.
  if (depth > 5 || !(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && INFRA_ERROR_CODES.has(code)) return true;
  if (INFRA_ERROR_MESSAGES.some(m => err.message.includes(m))) return true;
  // Der echte Socket-Code steckt bei fetch eine Ebene tiefer in .cause.
  const cause = (err as { cause?: unknown }).cause;
  return cause != null && isInfrastructureError(cause, depth + 1);
}
```

- [ ] **Step 3: Zähler trennen und bei Infrastrukturfehlern abbrechen**

In `main()` den Block ab `let totalChunks = 0;` bis zum Ende der `for`-Schleife ersetzen durch:

```ts
    let totalChunks = 0;
    let indexedFiles = 0;
    let unchangedFiles = 0;
    let failedFiles = 0;

    for (const absPath of files) {
      const relPath = relative(REPO_ROOT, absPath);
      try {
        const chunks = await indexFile(pool, absPath, relPath);
        if (chunks > 0) {
          totalChunks += chunks;
          indexedFiles++;
          if (!singleFile) process.stderr.write(`[SCS] ${relPath}: ${chunks} chunks\n`);
        } else {
          unchangedFiles++;
        }
      } catch (err) {
        if (isInfrastructureError(err)) {
          process.stderr.write(
            `[SCS] FATAL bei ${relPath}: ${err instanceof Error ? err.message : err}\n`
            + `[SCS] embed=${EMBED_URL} pghost=${pool.options.host}:${pool.options.port} — `
            + `Endpunkt nicht erreichbar, Lauf nach ${indexedFiles} indexierten Dateien abgebrochen.\n`,
          );
          throw err;
        }
        process.stderr.write(`[SCS] SKIP ${relPath}: ${err instanceof Error ? err.message : err}\n`);
        failedFiles++;
      }
    }
```

- [ ] **Step 4: Abschluss-JSON um die getrennten Zähler erweitern**

Das `console.log(JSON.stringify({ ... }))` am Ende von `main()` ersetzen durch:

```ts
    console.log(JSON.stringify({
      indexed_files: indexedFiles,
      unchanged_files: unchangedFiles,
      failed_files: failedFiles,
      new_chunks: totalChunks,
      total_rows: countRes.rows[0].n,
    }));
```

- [ ] **Step 5: Test grün fahren**

```bash
npx vitest run scripts/index-repo.test.ts
# erwartet: PASS — 17 passed
```

- [ ] **Step 6: Commit**

```bash
git add scripts/index-repo.ts scripts/index-repo.test.ts
git commit -m "fix(scripts): treat connection failures as fatal instead of per-file SKIP [T002292]"
```

---

### Task 2: Erreichbarkeits-Probe bei der Endpunkt-Auflösung

**Files:**
- Modify: `scripts/index-repo.ts:74-90` (`resolveEmbedConfig`)

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `async function endpointReachable(url: string): Promise<boolean>` (modul-intern, nicht exportiert).

- [ ] **Step 1: Probe-Helfer einfügen**

In `scripts/index-repo.ts` direkt vor `let EMBED_URL: string;` einfügen:

```ts
// T002292 — eine explizit gesetzte LLM_EMBED_URL wurde bisher ungeprueft
// uebernommen ("Explicit env vars always win"). environments/mentolder.yaml
// setzt sie auf den cluster-internen DNS-Namen, der auf dem WSL-Host nicht
// aufloest — dadurch scheiterte JEDER embedTexts()-Aufruf und der Indexer lief
// mit Exit 0 durch, ohne etwas zu schreiben. Jede HTTP-Antwort zaehlt als
// erreichbar; nur Transportfehler und Timeout zaehlen als nicht erreichbar.
async function endpointReachable(url: string): Promise<boolean> {
  try {
    await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: `resolveEmbedConfig()` auf die Probe umstellen**

Den Rumpf von `resolveEmbedConfig()` ersetzen durch:

```ts
async function resolveEmbedConfig(): Promise<void> {
  // T002258: was llm-gateway-lmstudio:1234 (LM Studio). bge-m3 moved to a
  // dedicated llama-server on :8095 with T002110/PR #3150; the Service in
  // k3d/llm-gpu.yaml is `llm-gateway-embed` on port 8095 and LM Studio is gone.
  const clusterHost = 'llm-gateway-embed.workspace.svc.cluster.local';
  const localUrl = 'http://localhost:8095';
  const configured = process.env.LLM_EMBED_URL;

  if (configured && await endpointReachable(configured)) {
    EMBED_URL = configured;
  } else {
    if (configured) {
      process.stderr.write(
        `[SCS] WARN LLM_EMBED_URL=${configured} ist nicht erreichbar — `
        + `faellt auf ${localUrl} zurueck (T002292).\n`,
      );
    }
    EMBED_URL = (await endpointReachable(localUrl))
      ? localUrl
      : (await clusterDnsResolves(clusterHost)) ? `http://${clusterHost}:8095` : localUrl;
  }
  // llama-server serves a single model and ignores the `model` field, so this
  // is cosmetic there — it still matters for any OpenAI-compatible router in
  // front. Keep it aligned with website/src/lib/embeddings.ts ('bge-m3').
  EMBED_MODEL = process.env.LLM_EMBED_MODEL ?? 'bge-m3';
}
```

- [ ] **Step 3: Auflösung gegen den laufenden Embedding-Server prüfen**

```bash
LLM_EMBED_URL=http://llm-gateway-embed.workspace.svc.cluster.local:8095 \
  npx tsx scripts/index-repo.ts --file scripts/index-repo.ts 2>&1 | head -5
# erwartet: eine "[SCS] WARN ... ist nicht erreichbar"-Zeile,
# danach "[SCS] embed=http://localhost:8095"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/index-repo.ts
git commit -m "fix(scripts): probe LLM_EMBED_URL for reachability before trusting it [T002292]"
```

---

### Task 3: Retry-Schleife im Task `scs:index` und BATS-Guards

**Files:**
- Modify: `Taskfile.yml` (Task `scs:index`, ab Zeile 4627)
- Test: `tests/unit/scs-index.bats`

**Interfaces:**
- Consumes: `isInfrastructureError` aus Task 1, `endpointReachable` aus Task 2.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: BATS-Guards ergänzen**

An `tests/unit/scs-index.bats` anhängen:

```bash
@test "SCS-1: index-repo.ts classifies infrastructure errors (T002292)" {
  run grep -c 'isInfrastructureError' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 2 ]]
}

@test "SCS-1: index-repo.ts reports unchanged and failed files separately (T002292)" {
  run grep -c 'unchanged_files' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
  run grep -c 'failed_files' "$PROJECT_DIR/scripts/index-repo.ts"
  [[ "$output" -ge 1 ]]
}

@test "SCS-1: scs:index does not use fuser -k, which kills its own shell (T002292)" {
  # fuser -k signalisiert die eigene Prozessgruppe mit und beendet damit die
  # aufrufende Shell — im Taskfile faellt das nur deshalb nicht auf, weil
  # go-task jeden cmds-Block in einer eigenen Shell startet.
  # Nur ausfuehrbare Zeilen pruefen — der erklaerende Kommentar im Task
  # nennt `fuser -k` selbst und darf den Guard nicht ausloesen.
  run bash -c "sed -n '/^  scs:index:/,/^  scs:search:/p' '$PROJECT_DIR/Taskfile.yml' \
    | grep -v '^[[:space:]]*#' | grep -c 'fuser -k'"
  [[ "$output" -eq 0 ]]
}
```

- [ ] **Step 2: BATS-Guards rot sehen**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scs-index.bats
# expected: FAIL — der fuser-Guard schlaegt fehl, solange der Task ihn enthaelt
```

- [ ] **Step 3: Task `scs:index` auf Retry umbauen**

Den `cmds:`-Block von `scs:index` in `Taskfile.yml` ersetzen durch:

```yaml
  scs:index:
    desc: "Build the semantic code search index (bge-m3 embeddings → pgvector). Requires cluster DB access."
    cmds:
      - |
        source scripts/env-resolve.sh "${ENV:-dev}"
        ctx_flag=""
        [ "${ENV:-dev}" != "dev" ] && ctx_flag="--context $ENV_CONTEXT"
        NS="${WORKSPACE_NAMESPACE:-workspace}"

        # T002292: Der port-forward auf shared-db reisst reproduzierbar ab. Der
        # Indexer bricht deshalb jetzt hart ab statt still weiterzuskippen —
        # hier wird er so oft neu gestartet, bis er durchlaeuft. Das traegt,
        # weil der Hash-Skip in indexFile() Laeufe resumierbar macht: ein
        # abgebrochener Pass hinterlaesst einen konsistenten Teil-Index.
        # Jeder Pass bekommt einen EIGENEN Port — kein `fuser -k`, das wuerde
        # die eigene Prozessgruppe mit abschiessen.
        rc=1
        for pass in 1 2 3 4 5; do
          port=$((15434 + pass))
          kubectl $ctx_flag -n "$NS" port-forward svc/shared-db ${port}:5432 \
            >/tmp/scs-index-pf.log 2>&1 &
          pf=$!
          sleep 4
          if ! nc -z 127.0.0.1 $port 2>/dev/null; then
            echo "→ Pass $pass: port-forward kam nicht hoch, neuer Versuch" >&2
            kill $pf 2>/dev/null || true
            continue
          fi
          PGHOST=localhost PGPORT=$port PGDATABASE=website PGUSER=website \
            npx tsx scripts/index-repo.ts
          rc=$?
          kill $pf 2>/dev/null || true
          [ $rc -eq 0 ] && break
          echo "→ Pass $pass endete mit Exit $rc, setze fort" >&2
        done
        exit $rc
```

- [ ] **Step 4: BATS-Guards grün fahren**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scs-index.bats
# erwartet: PASS
```

- [ ] **Step 5: Test-Inventar regenerieren**

```bash
task test:inventory
```

- [ ] **Step 6: Commit**

```bash
git add Taskfile.yml tests/unit/scs-index.bats website/src/data/test-inventory.json
git commit -m "fix(scripts): retry scs:index across port-forward drops [T002292]"
```

---

### Task 4: Spec-Delta und finale Verifikation

**Files:**
- Modify: `openspec/changes/scs-index-silent-skip/specs/brett.md`

**Interfaces:**
- Consumes: das Verhalten aus Task 1–3.
- Produces: nichts.

- [ ] **Step 1: Delta-Spec befüllen**

`openspec/changes/scs-index-silent-skip/specs/brett.md` erhält:

```markdown
## MODIFIED Requirements

### Requirement: Semantic Code Search — Indexer (SCS-1)
<!-- bats: scs-index.bats -->

The system SHALL maintain a `scripts/index-repo.ts` indexer that creates `code_embeddings` and `file_dependencies` tables with pgvector support, uses the `bge-m3` model (1024 dimensions), supports incremental re-indexing via `--file` flag and SHA-256 hashing, and excludes `node_modules`/`dist`. The indexer SHALL verify that its embedding endpoint is reachable before use, SHALL abort with a non-zero exit code on connection failures instead of recording them as per-file skips, and SHALL report unchanged and failed files as separate counters.

#### Scenario: Verbindungsfehler bricht den Lauf ab *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `isInfrastructureError` durchsucht wird
- **THEN** wird die Klassifikationsfunktion mindestens zweimal gefunden

#### Scenario: Zaehler fuer unveraenderte und fehlgeschlagene Dateien sind getrennt *(BATS)*
- **GIVEN** `scripts/index-repo.ts` ist vorhanden
- **WHEN** die Datei nach `unchanged_files` und `failed_files` durchsucht wird
- **THEN** kommen beide Schluessel in der Abschluss-Ausgabe vor

#### Scenario: `scs:index` verwendet kein `fuser -k` *(BATS)*
- **GIVEN** der Task `scs:index` in `Taskfile.yml`
- **WHEN** sein Block nach `fuser -k` durchsucht wird
- **THEN** wird kein Treffer gefunden
```

- [ ] **Step 2: OpenSpec validieren**

```bash
task openspec:validate
# erwartet: PASS
```

- [ ] **Step 3: Finale Verifikation — die drei CI-Gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/scs-index-silent-skip/
git commit -m "docs(openspec): record SCS-1 delta for indexer error handling [T002292]"
```
