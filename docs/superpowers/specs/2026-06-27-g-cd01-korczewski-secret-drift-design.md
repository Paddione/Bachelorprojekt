---
ticket_id: T001182
plan_ref: openspec/changes/g-cd01-korczewski-secret-drift/tasks.md
status: active
date: 2026-06-27
---

# G-CD01 korczewski-Deploy-Lane: stale SealedSecret in `website-korczewski` namespace

**Datum:** 2026-06-27
**Ticket:** T001182 (bug, brand=mentolder, scope cross-brand)
**Branch:** `fix/g-cd01-korczewski-secret-drift`
**Worktree:** `/tmp/wt-g-cd01`
**Spec-Skill-Output:** brainstorming abgeschlossen; root cause & fix-ansatz unten dokumentiert.

## 1. Symptom (live, 2026-06-27)

| # | ID | Kat | Aufwand | Reproduz. | Baseline (live / md) | Target | Titel |
|---|----|-----|---------|---|---|---|---|
| 10 | **G-CD01** ⚠️ | CD | ~1 Debug-Sess | ⚠️ | **6.7 % (1/15)** 🟡 / 27 % | ≥ 90 % | korczewski Website-Deploy-Erfolgsrate |

- `build-website-korczewski.yml` letzte 15 Läufe: **1 grün, 14 rot** (Tendenz fallend: 27 % → 6.7 %)
- Neuester roter Lauf (id 28276478142, 9m alt): Deploy-Phase läuft durch, `kubectl rollout status` blockt 120 s, Exit 1.
- Pod-Event: `Error: couldn't find key BRETT_OIDC_SECRET in Secret website-korczewski/website-secrets` → `CreateContainerConfigError`, "old replicas pending termination", Timeout.

## 2. Root Cause (zweischichtig verifiziert)

### 2.1 Cluster-State vs. on-disk-Truth (die eigentliche Drift)

| Layer | BRETT_OIDC_SECRET? | Quelle |
|---|---|---|
| `environments/.secrets/korczewski.yaml` (plaintext, git-crypt) | ✅ `1598dce179f0168d…` | grep |
| `environments/sealed-secrets/korczewski.yaml` (committed) | ✅ `AgBby61IjeUYB2PL…` | grep |
| Cluster `SealedSecret/website-secrets -n website-korczewski.spec.encryptedData` | ❌ **fehlt** | `kubectl get sealedsecret -o yaml` |
| Cluster `Secret/website-secrets -n website-korczewski.data` (entschlüsselt) | ❌ **fehlt** (20 Keys statt 23) | `kubectl get secret -o jsonpath` |
| Mentolder Cluster `Secret/website-secrets -n website.data` (zum Vergleich) | ✅ vorhanden (23 Keys) | `kubectl get secret -o jsonpath` |

**Die Drift ist zwischen `environments/sealed-secrets/korczewski.yaml` (committed, korrekt) ↔ Cluster-SealedSecret (stale, 2026-05-30 last-applied).** Die on-disk-Dateien sind nicht der Bug — sie sind bereits richtig.

### 2.2 Warum die Drift entstanden ist (plausibelste Erklärung)

Der `environments/sealed-secrets/korczewski.yaml` wurde zu irgendeinem Zeitpunkt (vermutlich nach T000668 — Pocket-ID-Umstellung, wo die OIDC-Keys hinzukamen) lokal aktualisiert und committed, aber `task env:deploy ENV=korczewski` (bzw. das equivalent, das den SealedSecret auf den Cluster bringt) wurde **nicht** im selben Commit / Sprint ausgeführt. Die Korczewski-Brand-Lane lief weiter mit dem alten SealedSecret, bis ein Website-Update eine der hinzugefügten Keys (BRETT_OIDC_SECRET) als env-from-secret-Referenz required — dann Crash.

**Bestätigung:** Die SealedSecret-Annotations auf dem Cluster-Objekt (`kubectl.kubernetes.io/last-applied-configuration`) entsprechen dem alten Stand (20 Keys, ohne BRETT_OIDC_SECRET/DEEPSEEK/KEYCLOAK_ADMIN_PASSWORD/WEBSITE_OIDC_SECRET). Das `BRETT_BOT_SECRET` auf dem Cluster ist z.B. `AgBU8jG+…` (kurz), die on-disk-Version in `korczewski.yaml` ist `AgA4s/DL5…` (lang, post-rotiert). Drei weitere post-rotation-Edits wurden ebenfalls nicht in den Cluster gepusht.

## 3. Fix-Approach (zweistufig)

### 3.1 Cluster-Repair (operational, sofort)

```bash
# Force-reseal + re-deploy des SealedSecret für korczewski
task env:seal ENV=korczewski        # aktualisiert environments/sealed-secrets/korczewski.yaml
task env:deploy ENV=korczewski      # oder: task workspace:deploy ENV=korczewski (legt brand-lokales SealedSecret an)
# Verify: kubectl get secret website-secrets -n website-korczewski -o jsonpath='{.data}' | keys
# Erwartung: 23 Keys, inkl. BRETT_OIDC_SECRET
```

Danach: nächster `build-website-korczewski.yml`-Lauf sollte grün werden → G-CD01 erholt sich organisch.

### 3.2 Drift-Prevention (BATS-Test, CI-tauglich)

**Was fehlt:** Es gibt *keinen* Test, der die "on-disk SealedSecret ↔ cluster SealedSecret"-Konsistenz prüft. Die existierenden `secrets-sync.bats` und `secret-rotation-guards`-Spec decken nur Schema ↔ `k3d/secrets.yaml` (workspace-secrets) ab; die website-secrets-Layer ist eine Black Box.

**Plan:** BATS-Test in `tests/spec/sealed-secret-cluster-drift.bats`, der:
1. Für jeden Brand (`mentolder`, `korczewski`) prüft, ob alle Keys aus `environments/sealed-secrets/<env>.yaml` in `kubectl get sealedsecret website-secrets -n website-<brand> -o jsonpath='{.spec.encryptedData}'` vorhanden sind.
2. **Skip-Verhalten:** wenn kein Cluster erreichbar (kein `kubectl` mit aktivem Context) → `skip` mit Hinweis. Der Test läuft in CI *nur* gegen den Live-Cluster (z.B. via `factory:`-Pipeline oder manuell).
3. **Fail-Verhalten:** bei Drift listet er die fehlenden Keys nach Brand auf und schlägt fehl.

Damit wird der Bug "SealedSecret committed, aber nicht deployt" beim nächsten Mal **CI-detectierbar**, statt erst im Production-Deploy aufzufliegen.

### 3.3 CD-Workflow-Härtung (nice-to-have, in Scope)

Der `build-website-korczewski.yml`-Workflow hat heute **keine** pre-rollout-Validierung des Cluster-Secrets. Bei einem fehlenden Key läuft `kubectl apply` durch, das `set image` durch, und erst `rollout status --timeout=120s` schlägt fehl — das ist 2 Minuten verschwendete CI-Zeit pro Fail.

**Verbesserung:** Ein Pre-Rollout-Step `kubectl get secret website-secrets -n <ns> -o jsonpath` vergleicht mit der Liste der required Keys aus `k3d/website.yaml`. Drift → sofort Exit 1 mit Diagnose.

## 4. Trade-offs & bewusste Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Re-seal + re-deploy vs. nur re-deploy? | **Force-reseal zuerst** (`task env:seal`), dann deploy | Falls Cluster-Cert sich geändert hat, wäre Re-Apply mit altem SealedSecret wirkungslos (Cert-Mismatch). |
| `env:deploy` vs. `workspace:deploy`? | `env:deploy ENV=korczewski` (engerer Scope) | Nur der SealedSecret muss neu; komplettes `workspace:deploy` ist Overkill + Risk für andere Komponenten. |
| BATS-Test cluster-dependent? | Ja, **skip wenn kein Cluster** | Akzeptierte Limitation: ein 100% statischer Test kann Cluster-Drift nicht erkennen (SealedSecrets sind encrypted, der Cluster könnte jeden beliebigen Stand haben). Die Alternative — eine spec-only-Prüfung der on-disk-Konsistenz — existiert bereits in `secrets-sync.bats` und hätte diesen Bug nicht verhindert. |
| CD-Workflow-Härtung in diesem Fix? | **Ja, in Scope** (klein, ~10 Zeilen) | Spart 2 min CI-Zeit pro Fail + macht den Bug frühzeitiger sichtbar (Step 1 statt Step 5 des Workflows). |
| Andere Brands mit gleichem Risiko? | **Ja, der Test deckt mentolder + korczewski ab** | Beide haben `website-secrets`-SealedSecret; mentolder ist aktuell in Sync, aber kein Garant für morgen. |
| Ticket-Brand = "beide"? | Ja, cross-brand | Der Fix-Mechanismus und der Drift-Test sind brand-agnostisch. |

## 5. Out of Scope (bewusst)

- **Komplette root-cause-Analyse, warum der SealedSecret-Deploy seinerzeit nicht durchlief** (Plausibilität: Pocket-ID-Migration T000668 Sprint 2026-W22). Würde zusätzliche Commits/Investigation erfordern — separater Follow-up-Ticket-würdig, aber nicht G-CD01-blockierend.
- **Refactoring von `env:deploy` / `env:seal`** zu einem atomaren "seal-and-deploy"-Task. Besseres Design, aber Streitthema in `secret-rotation-guards` (offene Anforderung dort).
- **Migration von BRETT_OIDC_SECRET-Logik** in einen besseren Auth-Pfad. Hängt mit der Pocket-ID-Migration zusammen; orthogonal.

## 6. Akzeptanzkriterien (vor Merge)

- [ ] `kubectl get secret website-secrets -n website-korczewski -o jsonpath='{.data}'` listet 23 Keys inkl. `BRETT_OIDC_SECRET`.
- [ ] `kubectl rollout status deployment/website -n website-korczewski` ist `Available` (ready 1/1) innerhalb 60 s.
- [ ] Letzter `build-website-korczewski.yml`-Lauf ist `success`.
- [ ] `tests/spec/sealed-secret-cluster-drift.bats` ist neu, committed, im `task test:unit` registriert; lokal mit Cluster grün, lokal ohne Cluster skip; CI-`factory`-Pipeline dokumentiert den Run.
- [ ] `task test:changed` ist grün.
- [ ] `task freshness:regenerate && task freshness:check` ist grün.

## 7. Verwandte Specs / Tests

- `openspec/specs/secret-rotation-guards.md` — Requirement "Three-way secret consistency" deckt Schema ↔ `k3d/secrets.yaml` ↔ SealedSecret (workspace-secrets) ab. Dieser Fix erweitert die Perspektive auf `website-secrets` + Cluster-State.
- `tests/unit/secrets-sync.bats` — bestehender Three-way-Test; unverändert.
- `openspec/changes/dora-delivery-pipeline` — G-CD01 ist hier als Goal erfasst; nach Fix automatisch Erholung sichtbar.

## 8. Spec-Skill-Anmerkung (Meta)

Diese Spec wurde **ohne** separates `superpowers:brainstorming`-Skill-HTML-Board und ohne `lavish`-Canvas erstellt, weil:
1. Root Cause und Fix-Approach sind durch `kubectl`-Live-Inspektion + grep bereits vollständig belegt.
2. Der Fix-Scope ist mit dem User vor dem Worktree-Setup explizit abgeklärt (Frage: "Cluster-Repair + Drift-Prevention" + "cross-brand").
3. Die Spec dient dem Plan-Subagenten als Input — nicht als Diskussionsartefakt.

Falls Reviewer eine formalere Brainstorming-Spur wünschen, kann `.lavish/g-cd01-grilling.html` nachgereicht werden — die Inhalte sind in dieser Spec abgedeckt.
