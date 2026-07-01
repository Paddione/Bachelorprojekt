---
title: "G-CD01: korczewski-Deploy-Lane — stale SealedSecret reparieren + Drift-Prevention"
ticket_id: T001182
domains: [infra, cd, test, website]
status: active
file_locks: [environments/sealed-secrets/korczewski.yaml, environments/sealed-secrets/mentolder.yaml, .github/workflows/build-website-korczewski.yml, .github/workflows/build-website.yml, tests/spec/sealed-secret-cluster-drift.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: g-cd01-korczewski-secret-drift (T001182)

- [ ] Task 0: Failing-Test ist bereits rot im Branch — `tests/spec/sealed-secret-cluster-drift.bats` (RED)
- [x] Task 1: Cluster-Repair — `task env:seal ENV=korczewski && task env:deploy ENV=korczewski` (operational, Gate)
- [x] Task 2: CD-Workflow-Härtung — Pre-Rollout Secret-Check in `build-website-korczewski.yml` + `build-website.yml`
- [x] Task 3: Test-Inventory-Refresh — `task test:inventory` (no-op, siehe Notiz)

> **Notiz:** `scripts/build-test-inventory.sh` scannt nur `tests/local/`, `tests/prod/`, `tests/e2e/specs/` — `tests/spec/<slug>.bats` (per AGENTS.md-Konvention) ist aussen vor. `sealed-secret-cluster-drift.bats` ist im richtigen Pfad, aber für das Inventory unsichtbar. Pre-existing limitation, separat zu fixen (scripts/build-test-inventory.sh erweitern). BATS-Test läuft via `task test:changed` / `task test:unit`.
- [x] Task 4: Verifikation — `task test:changed` + `task freshness:regenerate && task freshness:check` + `task workspace:validate` + `bash scripts/openspec.sh validate`

> **Verifikations-Resultate:**
> - `task freshness:regenerate`: ✓ alle Artefakte aktuell, keine Änderungen
> - `task freshness:check`: ✓ 0 neue Violations, baseline.json sauber, route-manifest OK
> - `task workspace:validate`: ✓ Manifests sind valid
> - `bash scripts/openspec.sh validate g-cd01-korczewski-secret-drift`: ✓ keine Errors
> - `task test:changed`: ✗ `tests/unit/ticket-external-id-sequence.bats` test #2 failt — **PRE-EXISTING**, nicht durch diesen Change verursacht. Branch war vor diesem PR bereits in dem Zustand (T001155 bat die test-Datei, T001160 hat sie auf main gefixt, dieser Branch hat den rebase nicht). Separater Follow-up nötig.
- [ ] Task 5: Commit + Push auf `fix/g-cd01-korczewski-secret-drift` + PR via `gh-axi pr create`

---

# G-CD01 korczewski-Deploy-Lane: stale SealedSecret reparieren + Drift-Prevention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** `Secret/website-secrets -n website-korczewski` auf den aktuellen Stand bringen (6 fehlende Keys ergänzen), sodass G-CD01 von 6.7 % wieder Richtung ≥ 90 % Erfolgsrate klettert. Drift-Prevention: BATS-Test + Workflow-Pre-Rollout-Check fangen das nächste Mal den Fail-closed-Alarm, bevor ein Deploy 120 s in Timeout läuft.

**Architecture:** Drei Layer. (1) Operational: Cluster-Repair mit `env:seal` + `env:deploy` (Cert-validated, server-side apply, idempotent). (2) CI-tauglich: Neuer BATS-Test `tests/spec/sealed-secret-cluster-drift.bats` kombiniert statische Parse von `k3d/website.yaml` mit Live-`kubectl get secret` — skippt ohne Cluster, failt mit Key-Liste bei Drift. (3) Workflow: Pre-Rollout-Check in beiden `build-website-*.yml` läuft als inline-bash-Step vor `kubectl rollout status`, bricht bei Drift nach Sekunden ab.

## File Structure

**Geänderte/neue Dateien:**

- `tests/spec/sealed-secret-cluster-drift.bats` (NEU, ~140 Zeilen) — der Drift-Detector (BATS).
- `.github/workflows/build-website-korczewski.yml` (MODIFY, +~20 Zeilen) — Pre-Rollout-Check.
- `.github/workflows/build-website.yml` (MODIFY, +~20 Zeilen) — Pre-Rollout-Check.
- `website/src/data/test-inventory.json` (REGENERATED via `task test:inventory`, automatisch).

**Unverändert (nur lesend in diesem Change):**

- `k3d/website.yaml` — Source-of-Truth für required Keys.
- `openspec/changes/g-cd01-korczewski-secret-drift/{proposal.md,tasks.md,specs/}` — der Change selbst.
- `docs/superpowers/specs/2026-06-27-g-cd01-korczewski-secret-drift-design.md` — die Design-Spec (separat committed, dokumentiert Root Cause).

## Task 0 — Failing-Test ist bereits rot (RED-Phase abgeschlossen)

**Status:** ✅ Done in diesem Branch (commit-ready).

`tests/spec/sealed-secret-cluster-drift.bats` ist neu im Branch, committed im selben Commit wie der Rest des Changes. Lokal verifiziert:

```
$ ./tests/unit/lib/bats-core/bin/bats tests/spec/sealed-secret-cluster-drift.bats
ok 1 mentolder: cluster website-secrets has every key the website Deployment requires # skip
not ok 2 korczewski: cluster website-secrets has every key the website Deployment requires
# Website Deployment requires these env-from-secret keys (k3d/website.yaml)
# but the cluster Secret website-korczewski/website-secrets is missing them:
#   BRETT_OIDC_SECRET
#   DEEPSEEK_API_KEY
#   DEEPSEEK_API_KEY_PK
#   SEPA_CREDITOR_BIC
#   SEPA_CREDITOR_IBAN
#   SEPA_CREDITOR_ID
```

**Failing-Test-Schritt (RED, reproduzierbar):**

```bash
# 1. Test muss rot sein AUF DEM AKTUELLEN CLUSTER (vor Task 1)
cd /tmp/wt-g-cd01
./tests/unit/lib/bats-core/bin/bats tests/spec/sealed-secret-cluster-drift.bats
# Exit 1, bats-Output wie oben — 6 missing keys für korczewski

# 2. Nach Task 1 (Cluster-Repair) muss der Test grün sein
./tests/unit/lib/bats-core/bin/bats tests/spec/sealed-secret-cluster-drift.bats
# Exit 0, beide Tests pass (oder skip, falls Cluster-Context fehlt)
```

Der Test reproduziert exakt die G-CD01-Root-Cause: 6 required Keys fehlen. Nach dem Cluster-Repair (Task 1) wird der Test grün — das ist die Akzeptanzbedingung dieses Changes.

**Akzeptanz:** bats-Output zeigt 6 missing keys (wie oben) auf dem aktuellen Cluster-State **vor** Task 1 — dies ist die **expected: fail**-Phase des BATS-Tests. Nach Task 1 ist der Test grün (RED → GREEN).

## Task 1 — Cluster-Repair (operational, kein Code-Change)

Auf dem dev-host (mit `kubectl --context fleet`):

```bash
# 1. Force-reseal — env:seal.sh validiert Cert-Fingerprint gegen Live-Cluster
task env:seal ENV=korczewski

# 2. Re-apply — applies den frischen SealedSecret in workspace-korczewski + website-korczewski
task env:deploy ENV=korczewski

# 3. Verifikation — sollte ≥ 25 Keys zeigen, inkl. BRETT_OIDC_SECRET
kubectl --context fleet -n website-korczewski get secret website-secrets \
  -o jsonpath='{.data}' | jq 'keys | length'
# Erwartung: 25 (oder mehr)
kubectl --context fleet -n website-korczewski get secret website-secrets \
  -o jsonpath='{.data}' | jq 'keys' | grep BRETT_OIDC_SECRET
# Erwartung: "BRETT_OIDC_SECRET" (genau 1 Treffer)

# 4. Trigger einen Deploy und beobachte, dass er grün wird
gh workflow run build-website-korczewski.yml
# Erwartung: nach 2–4 Min "completed, success"
```

**Akzeptanz:** bats-Test aus Task 0 ist grün gegen den Live-Cluster; `gh run list --workflow build-website-korczewski.yml --limit 5` zeigt mindestens 1 success.

**Falls Cert-Drift:** `env:seal.sh` bricht ab mit "Cert-Fingerprint NICHT verifiziert" (gemäß `secret-rotation-guards` Requirement "env-seal fail-closed on sealing-cert drift"). Operator-Optionen: (a) `task env:fetch-cert` (frischt den Cert aus dem Cluster), dann retry; (b) `--reuse-cert` Override (wenn Drift bewusst akzeptiert).

**Falls SealedSecret bereits korrekt, aber Cluster-Apply schlägt fehl:** `kubectl get events -n website-korczewski` zeigt Hinweise; meist ServerSideApply-Konflikt. `kubectl apply --server-side --force-conflicts` ist im Workflow bereits drin (siehe `.github/workflows/build-website-korczewski.yml:144-152`).

## Task 2 — CD-Workflow-Härtung

In `.github/workflows/build-website-korczewski.yml` (analog `.github/workflows/build-website.yml`) einen inline-Step vor `kubectl rollout status` einfügen:

```yaml
      - name: Pre-Rollout Secret-Check
        env:
          NAMESPACE: website-korczewski  # build-website.yml: website
        run: |
          MISSING=""
          for KEY in $(python3 -c "
          import yaml
          with open('k3d/website.yaml') as f:
              for doc in yaml.safe_load_all(f):
                  if not doc: continue
                  for c in (doc.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[]) or []):
                      for e in (c.get('env',[]) or []):
                          v = (e.get('valueFrom') or {}).get('secretKeyRef') or {}
                          if v.get('name') == 'website-secrets' and v.get('key'):
                              print(v['key'])
          "); do
            if ! kubectl get secret website-secrets -n "$NAMESPACE" \
                -o jsonpath="{.data.${KEY//_/\_}}" 2>/dev/null | grep -q .; then
              MISSING="$MISSING $KEY"
            fi
          done
          if [[ -n "$MISSING" ]]; then
            echo "::error::website-secrets in $NAMESPACE is missing required keys:$MISSING"
            echo "Fix: task env:seal ENV=korczewski && task env:deploy ENV=korczewski"
            exit 1
          fi
```

**S1-Budget:** `build-website-korczewski.yml` 154 → ~178 Zeilen (Limit 600); `build-website.yml` 156 → ~180. Beide weit unter Limit.

**S3-Hardcoded-Hostnames:** keine neuen Hostnames. Der Pre-Rollout-Check verwendet `k3d/website.yaml` (zentral) und `kubectl` (kein Hostname).

**S2-Import-Zyklen:** N/A (YAML-Workflows, nicht TS).

**S4-Orphans:** keine neuen Manifeste/Skripte.

**Sicherheit:** bash-Snippet escaped Key-Namen korrekt (Underscores in JSONpath escapet). Kein Secret-Value-Print, nur Key-Existenz-Check.

**Akzeptanz:**
- Pre-Rollout-Check ist im Workflow-File sichtbar.
- `gh workflow run build-website-korczewski.yml` läuft weiterhin grün (Pre-Rollout-Check passes, da Cluster jetzt in Sync).
- Manueller Test: temporär ein Cluster ohne required Key → Workflow bricht nach <30 s ab statt 120 s.

## Task 3 — Test-Inventory-Refresh

```bash
task test:inventory
git status website/src/data/test-inventory.json
git add website/src/data/test-inventory.json
```

`test-inventory.json` muss `sealed-secret-cluster-drift.bats` als neuen Eintrag in `tests/spec/` listen.

**Akzeptanz:** `git diff website/src/data/test-inventory.json` zeigt den neuen BATS-Eintrag; `task test:changed` (das `task test:inventory` als Gate enthält) ist grün.

## Task 4 — Verifikation (CI-äquivalent)

```bash
# BATS + Vitest + alle anderen Tests
task test:changed

# Freshness-Gate (test-inventory, route-manifest, etc.)
task freshness:regenerate
task freshness:check

# Kustomize dry-run
task workspace:validate

# OpenSpec-Validate
bash scripts/openspec.sh validate
```

**Akzeptanz:** Alle 4 grün. Falls eine Warnung/Fehler auftaucht: fixen, retry.

**Falls `task test:changed` rot wegen `sealed-secret-cluster-drift.bats`:** im aktuellen Cluster-State ist der Test rot (RED-Phase) — das ist *erwartet* und kein Blocker für den PR. Im PR-Body dokumentieren: "BATS-Test ist rot gegen den Live-Cluster; wird nach Merge+Cluster-Repair grün". Im CI läuft `task test:changed` normalerweise ohne Cluster-Context → der Test skipped → grün.

## Task 5 — Commit + Push + PR

```bash
cd /tmp/wt-g-cd01

# Branch-Status prüfen
git status

# Commit 1: BATS-Test + Workflow-Härtung + Spec/Proposal/Tasks
git add tests/spec/sealed-secret-cluster-drift.bats
git add .github/workflows/build-website-korczewski.yml
git add .github/workflows/build-website.yml
git add openspec/changes/g-cd01-korczewski-secret-drift/
git add docs/superpowers/specs/2026-06-27-g-cd01-korczewski-secret-drift-design.md
git commit -m "fix(cd): re-sync website-secrets in website-korczewski + add cluster-drift guard [T001182]"

# Commit 2: Test-Inventory-Update (falls von Task 3 geändert)
git add website/src/data/test-inventory.json
git commit -m "chore(test): regenerate test-inventory for sealed-secret-cluster-drift.bats [T001182]"

# Push
git push -u origin fix/g-cd01-korczewski-secret-drift

# PR
gh-axi pr create \
  --title "fix(cd): re-sync website-secrets in website-korczewski + add cluster-drift guard [T001182]" \
  --body "$(cat <<'EOF'
## Summary
G-CD01 ist mit 6.7 % (1/15 grün) im freien Fall. Der Cluster-`Secret/website-secrets` im Namespace `website-korczewski` fehlen 6 env-from-secret-Keys (`BRETT_OIDC_SECRET`, `DEEPSEEK_API_KEY*`, `SEPA_CREDITOR_*`), die `k3d/website.yaml` required → `CreateContainerConfigError` → rollout timeout.

## Was dieser PR tut
1. **Cluster-Repair:** `task env:seal ENV=korczewski && task env:deploy ENV=korczewski` bringt den Cluster-Stand auf den aktuellen `environments/sealed-secrets/korczewski.yaml` (25+ Keys).
2. **Drift-Prevention (BATS):** `tests/spec/sealed-secret-cluster-drift.bats` verifiziert für mentolder + korczewski, dass der Cluster alle required Keys hat. Skip ohne Cluster, fail bei Drift. Läuft im `factory:`-Pipeline.
3. **CD-Workflow-Härtung:** Pre-Rollout-Check in `build-website*.yml` erkennt Drift in Sekunden statt 120 s rollout-Timeout.

## Verifikation
- [x] BATS-Test ist rot im Branch (RED-Phase), reproduziert exakt die 6 missing keys.
- [ ] Nach Cluster-Repair (operational, post-merge): BATS-Test wird grün, nächstes `build-website-korczewski.yml` läuft success.
- [ ] `task test:changed`, `task freshness:check`, `task workspace:validate` grün.

## Specs / Doku
- Spec: `docs/superpowers/specs/2026-06-27-g-cd01-korczewski-secret-drift-design.md`
- Proposal: `openspec/changes/g-cd01-korczewski-secret-drift/proposal.md`
- Plan: `openspec/changes/g-cd01-korczewski-secret-drift/tasks.md`

## Out of scope
Root-Cause-Analyse *warum* der Reseal zwischen 2026-05-30 und 2026-06-27 nicht durchlief; folgt separat.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Auto-Merge enablen
gh-axi pr merge --auto --squash
```

**Akzeptanz:** PR offen, Auto-Merge enabled. Nach grünem CI (Vitest + freshness + BATS skip) squasht und merged main. Auto-Deploy via `post-merge.yml` → `build-website-korczewski.yml` triggert → **das ist der eigentliche G-CD01-Erholungs-Test** (Erfolgsrate sollte von 6.7 % auf 90+ % springen).

## Rollback

- **Workflow-Härtung:** Revert der zwei `build-website*.yml`-Commits. BATS-Test bleibt additiv, schadet nie.
- **Cluster-State:** `task env:deploy ENV=korczewski` ist idempotent. Re-Apply mit altem SealedSecret stellt den 20-Key-Stand wieder her.

## Verwandte Specs

- `openspec/specs/secret-rotation-guards.md` — Requirements "env-seal fail-closed on sealing-cert drift" und "Three-way secret consistency" werden durch diesen Change ergänzt (Spec-Merge als Follow-up).
- `openspec/changes/dora-delivery-pipeline` — G-CD01 ist als Goal erfasst; nach Fix automatisch sichtbare Erholung auf `/admin/dora`.
