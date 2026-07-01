# Proposal: g-cd01-korczewski-secret-drift

## Why

G-CD01 ist mit 6.7 % (1/15 grün) im freien Fall: 14 der letzten 15 `build-website-korczewski.yml`-Läufe brechen in der Rollout-Phase ab. Live-Analyse zeigt, dass der Cluster-`Secret website-secrets` im Namespace `website-korczewski` **6 env-from-secret-Keys** fehlen, die der `website`-Deployment (`k3d/website.yaml`) required: `BRETT_OIDC_SECRET`, `DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEY_PK`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_ID`. Symptom in den Pod-Events: `Error: couldn't find key BRETT_OIDC_SECRET in Secret website-korczewski/website-secrets` → `CreateContainerConfigError`, neuer Pod startet nie, `kubectl rollout status` läuft 120 s in Timeout.

Die on-disk-Sealed-Files (`environments/sealed-secrets/korczewski.yaml`) sind im `website-secrets`-Block ebenfalls auf einem veralteten Stand (20 Keys, ohne die 6 neuen). Der Cluster ist seit `2026-05-30` nicht mehr mit dem SealedSecret reconciled — sehr wahrscheinlich seit der Pocket-ID-Migration (T000668), die mehrere `POCKET_ID_*`- und `BRETT_OIDC_SECRET`-Keys hinzugefügt hat, ohne dass der SealedSecret für korczewski (im Gegensatz zu mentolder) nachgepusht wurde.

**Impact:** web.korczewski.de driftet still gegen `main`. Jeder Push auf main triggert einen Build, aber der deploy bleibt wirkungslos — Nutzer sehen weiterhin die alte Website-Version. Vier weitere committete Plan-Stages (G-CQ07, G-CQ10, G-IMG02, G-CQ05) und mehrere Feature-Merges seit 30.05. sind in der Live-Website nicht sichtbar.

## What

Zweistufiger Fix:

1. **Cluster-Repair (operational, sofort):** `task env:seal ENV=korczewski && task env:deploy ENV=korczewski` bringt den `website-korczewski/website-secrets`-Secret auf den aktuellen Stand. Der nächste `build-website-korczewski.yml`-Lauf wird grün → G-CD01 erholt sich organisch (Erfolgsrate steigt Richtung 90 %+).

2. **Drift-Prevention (CI-tauglich):** Neuer BATS-Test `tests/spec/sealed-secret-cluster-drift.bats` verifiziert für mentolder + korczewski, dass der Cluster-`website-secrets` **alle** Keys enthält, die der Website-Deployment required. Test skipped ohne Live-Cluster (für lokale Devs ohne kubectl-Context), failt bei Drift, ist Bestandteil von `task test:unit` und läuft im `factory:`-Pipeline-Gate. Damit fängt der nächste vergessbare Reseal sofort einen Fail-closed-Alarm.

3. **CD-Workflow-Härtung (Bonus, klein):** `build-website-korczewski.yml` und `build-website.yml` bekommen einen Pre-Rollout-Step, der `kubectl get secret website-secrets -n <ns> -o jsonpath` gegen die required-Keys aus `k3d/website.yaml` prüft. Drift → sofort Exit 1, statt 120 s rollout-Timeout zu verschwenden.

Out of scope: (a) Root-Cause-Analyse *warum* der Reseal seinerzeit nicht durchlief (separater Follow-up-Ticket-würdig), (b) Refactoring von `env:deploy` zu einem atomaren "seal-and-deploy"-Task (offene Anforderung in `secret-rotation-guards`), (c) Migration der BRETT-OIDC-Auth-Logik auf einen besseren Pfad (orthogonal).

## Tests

- **Failing test (rot → grün):** `tests/spec/sealed-secret-cluster-drift.bats` — verifiziert die 6 missing keys, die gerade den Live-Bug verursachen. Bereits committed in diesem Branch; läuft rot auf dem aktuellen Cluster-State, wird nach dem Cluster-Repair grün.
- **No regression in mentolder:** der Test deckt mentolder mit (Skip ohne Cluster-Namespace, sonst Pass) ab — mentolder cluster ist aktuell in Sync, der Test bestätigt das.
- **CI-Integration:** `task test:unit` (führt `tests/spec/*.bats` aus) ist der Aufhänger; in CI läuft das im `factory:`-Schritt, mit Live-Cluster-Context.

## Akzeptanzkriterien

- [ ] `task env:deploy ENV=korczewski` ist ausgeführt; `kubectl get secret website-secrets -n website-korczewski -o jsonpath='{.data}' | jq 'keys' | length` zeigt ≥ 25 Keys (genau 25 + ggf. weitere zukünftige).
- [ ] `task test:changed` ist grün (inkl. `secrets-sync.bats` + neuem `sealed-secret-cluster-drift.bats`).
- [ ] `task freshness:regenerate && task freshness:check` ist grün.
- [ ] Manueller Trigger: `gh workflow run build-website-korczewski.yml` → success. G-CD01-Baseline steigt sichtbar.
- [ ] PR-Titel: `fix(cd): re-sync website-secrets in website-korczewski + add cluster-drift guard [T001182]`.

## Risk

- **Gering.** `env:seal` erzeugt einen frischen SealedSecret gegen den aktuellen Cluster-Cert (kein Cert-Drift, da `env:fetch-cert` zuletzt am 2026-06-26 lief). `env:deploy` wendet nur den SealedSecret an; bestehende Pods werden nicht getötet (kubectl server-side apply). Der einzige Live-Risiko ist, dass der resealte SealedSecret ein abweichendes Cert verwendet → würde `DecryptionFailed` werfen. Mitigation: `env:seal.sh` validiert Cert-Fingerprint vor dem Seal (siehe `secret-rotation-guards`-Spec, Requirement "env-seal fail-closed on sealing-cert drift") — wenn das failt, bricht der Workflow ab.
- **Test-only-Risiko:** Der neue BATS-Test ist cluster-dependent und skippt ohne Live-Cluster. Kein Impact auf `task test:all` in PR-CI (kein Cluster); nur `factory:`-Pipeline hat Cluster → das ist genau das gewünschte Layer.

## Sub-spec / Cross-cutting

- `openspec/specs/secret-rotation-guards.md` — Requirement "Three-way secret consistency" deckt Schema ↔ `k3d/secrets.yaml` ↔ SealedSecret (workspace-secrets) ab. Dieser Change erweitert die Perspektive auf den `website-secrets`-Layer und auf den Cluster-State. Spec-Merge als Follow-up nach Implementation empfohlen.
- `openspec/changes/dora-delivery-pipeline` — G-CD01 ist als Goal erfasst; nach Fix automatisch Erholung sichtbar auf `/admin/dora`.

_Ticket: T001182_
