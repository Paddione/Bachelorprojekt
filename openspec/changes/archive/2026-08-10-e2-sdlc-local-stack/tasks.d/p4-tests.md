# Partial p4 — Tests: BATS-Guard + DoD-Nachweis

> **Agent:** deepseek | **Files:** tests/spec/sdlc-isolation/e2-local-stack.bats | **Steps:** 3
> **Verify:** `tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e2-local-stack.bats` — RED vor p1–p3, GREEN danach

## Scope

Der Struktur-/DoD-Guard der Etappe (STRUCT2-Rolle, letztes Partial). Er schreibt den
Nachweis fest, dass die lokale SDLC-Laufzeit existiert und die DoD-Punkte erfüllbar sind:
Console erreichbar, `/api/health` nennt das sdlc-Target, lokale DB bootstrappt `tickets`,
bge-Paar antwortet, Anmeldung mit und ohne Mesh, fail-closed-Auth-Test existiert,
WSL-Speicher dokumentiert. Zuerst **rot** (alle neuen Dateien fehlen), nach p1–p3 **grün**.

Guard-Konvention (wie `build-target-split.bats` / `adr006-topologie.bats`):
`tests/spec/<ssot-slug>/<vorgang>.bats`, REPO_ROOT aus `BATS_TEST_FILENAME` abgeleitet,
Struktur-Anker per grep + Positiv-Anker gegen vakuose Guards.

## Task List

### 1. `tests/spec/sdlc-isolation/e2-local-stack.bats` anlegen

- [ ] **1.1** Header-Kommentar: SSOT `openspec/changes/e2-sdlc-local-stack/specs/sdlc-isolation.md`,
      Ticket T002625. `setup()`: `REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.."
      && pwd)"`, Pfad-Variablen für `k3d/sdlc-stack/`, `website/src/lib/auth/provider.ts`,
      `provider.test.ts`, `docs/sdlc-stack/README.md`.
- [ ] **1.2** Struktur-Anker (rot vor p1–p3):
      - Overlay existiert: `k3d/sdlc-stack/kustomization.yaml` vorhanden UND referenziert
        `../llm-gpu.yaml`, `../shared-db.yaml`, `../pocket-id.yaml`, `sdlc-console.yaml`
        (grep — Positiv-Anker, dass das Overlay den SDLC-Bedarf wirklich trägt).
      - Cluster-Config: `k3d/sdlc-stack/k3d-config.yaml` enthält `name: mentolder-dev`.
      - Console: `k3d/sdlc-stack/sdlc-console.yaml` referenziert
        `ghcr.io/paddione/website-sdlc` UND enthält `POCKET_ID_FALLBACK_FRONTEND_URL`
        (Positiv-Anker, dass der Fallback verdrahtet ist).
      - Auth: `website/src/lib/auth/provider.ts` existiert UND `provider.test.ts` existiert
        (der Pflicht-Fail-closed-Test) UND `provider.test.ts` enthält einen
        beide-Provider-down-Fall (grep nach z.B. `deny`/`fail`/`unavailable` — beim
        Implementieren die tatsächliche Testbeschreibung matchen).
      - Runbook: `docs/sdlc-stack/README.md` existiert UND enthält die WSL-Baseline
        (`40 GB`/`39 GB`- oder `memory`-Erwähnung).
- [ ] **1.3** DoD-Verifikations-Block (als dokumentierte, lauffähige Kommandos im BATS —
      bedingt, mit Skip-Guard wenn Cluster nicht läuft):
      - `kubectl get deploy sdlc-console -n workspace` → Ready (wenn Cluster läuft)
      - `curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost` → 200
      - `curl -sS http://sdlc.localhost/api/health` → nennt sdlc-Target
      - `kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -tAc
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='tickets'"` → > 0
      - bge: `kubectl port-forward -n workspace svc/llm-gateway-embed 8081:8081 &` +
        `curl -sS localhost:8081/health` → 200 (analog rerank)
      - Auth ohne Mesh: `curl -sS -o /dev/null -w '%{http_code}'
        'http://auth.localhost/authorize?client_id=website&response_type=code&scope=openid'`
        → 302 (Redirect zur lokalen Pocket-ID-Login-Seite)
- [ ] **1.4** Bedingte Ausführung: `kubectl config current-context | grep -q k3d-mentolder-dev`
      als Skip-Guard (Testfile mit `skip` wenn Cluster nicht läuft — CI bleibt grün ohne
      lokalen Cluster, der Struktur-Teil läuft immer).

### 2. Guard-Lauf: RED → GREEN

- [ ] **2.1** `tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e2-local-stack.bats`
      — **expected: FAIL** vor p1–p3 (alle Struktur-Tests schlagen fehl, die Dateien
      existieren nicht); nach p1–p3: **GREEN**.
- [ ] **2.2** Testdatei-Namenskonvention beachten: `task test:inventory` erfasst die neue
      Datei — `website/src/data/test-inventory.json` regenerieren und mitcommitten
      (`task freshness:regenerate`).

### 3. Abschluss-Verifikation (final gate)

- [ ] **3.1** `bash scripts/openspec.sh validate` → OK.
- [ ] **3.2** `bash scripts/plan-lint.sh openspec/changes/e2-sdlc-local-stack/tasks.md` → 0.
- [ ] **3.3** `task test:changed` grün; `task freshness:regenerate` +
      `task freshness:check` grün; `task workspace:validate` grün (Kustomize-Dry-Run des
      Overlays ohne envsubst-Fehler).

## Verify

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/e2-local-stack.bats
# expected: FAIL vor p1-p3 (Dateien fehlen), GREEN nach p1-p3
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/e2-sdlc-local-stack/tasks.md
task test:changed
```
