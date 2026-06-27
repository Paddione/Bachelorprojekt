---
ticket_id: T001276
plan_ref: openspec/changes/g-cd01-korczewski-ci-parity/tasks.md
status: draft
---

# Design: G-CD01 — korczewski CI Build/Deployment Parity (T001276)

**Datum:** 2026-06-28  
**Ticket:** T001276 — korczewski Website-Deploy-Pipeline debuggen (53% Erfolgsrate < 90% Target)

---

## Problem

Die korczewski Website-Deploy-Pipeline hat eine Erfolgsrate von 53% (Ziel: ≥90%). Der
primäre strukturelle Root Cause: `build-website.yml` deployt beide Brands (mentolder + korczewski)
in **einem einzigen, sequentiellen Job**. Schlägt ein mentolder-Deploy-Step fehl (Rollout-Timeout,
Secret-Check-Fail, o.Ä.), wird der korczewski-Deploy-Step komplett übersprungen — ohne
Fehlermeldung für korczewski.

T001182 (`g-cd01-korczewski-secret-drift`) hat bereits den Secret-Drift als einen Root Cause
behoben. T001276 adressiert den verbleibenden strukturellen Root Cause: die sequentielle Kopplung.

**Weitere bekannte Gaps:**
- `openspec/specs/ci-cd.md` referenziert noch `build-website-korczewski.yml` (durch T001229 gelöscht → Spec-Drift)
- `tests/spec/ci-cd.bats` hat G-CD02 + G-CQ03 aber kein G-CD01 für Brand-Parity-Anforderung

---

## Ziel

Parity-sichere CI-Abdeckung: der korczewski-Deploy-Job soll **unabhängig** von mentolder
erfolgreich sein oder scheitern — und der Spec + BATS-Tests soll das absichern.

---

## Design-Entscheidung: Separate parallele Jobs (Option B)

### Gewählte Architektur

```
Job: build-image
  - Baut das shared ghcr.io/paddione/website Docker-Image
  - Pusht SHA_TAG + :latest nach GHCR
  - Exportiert IMAGE + SHA_TAG als job output

  ↓ needs: [build-image]

Job: deploy-mentolder             Job: deploy-korczewski
  - Liest IMAGE + SHA_TAG           - Liest IMAGE + SHA_TAG
  - kustomize build website-mentolder  - kustomize build website-korczewski
  - Pre-Rollout Secret-Check        - Pre-Rollout Secret-Check
  - kubectl set image (-n website)  - kubectl set image (-n website-korczewski)
  - kubectl rollout status          - kubectl rollout status
```

Beide Deploy-Jobs haben `needs: [build-image]` aber **NICHT voneinander**. 
Sie laufen parallel und berichten unabhängig voneinander an GitHub Actions.

### Warum Option B statt Matrix (Option A)

Matrix-Jobs (`strategy.matrix`) erzeugen Job-Namen wie "Build & Deploy (mentolder)" und
"Build & Deploy (korczewski)" — lesbar. Aber Job-Outputs (IMAGE + SHA_TAG) sind über
Matrix-Jobs schwieriger weiterzugeben. Separate, explizit benannte Jobs sind klarer und
einfacher zu debuggen. Außerdem können einzelne Steps (z.B. Pre-Rollout Secret-Check) 
brand-spezifisch ausgesteuert werden.

### Warum nicht `continue-on-error: true` (Option C)

`continue-on-error: true` auf mentolder-Steps würde korczewski-Deploy nicht blockieren,
aber die korczewski-Steps würden weiterhin in demselben Job laufen — sequentiell. GitHub
Actions Job-Status würde "success" zeigen auch wenn mentolder fehlschlug. Das maskiert
Fehler statt sie sichtbar zu machen.

---

## Komponenten-Design

### 1. `.github/workflows/build-website.yml` — Refactoring

**Vorher:** 1 Job `build-and-deploy` mit sequentiellen Steps

**Nachher:** 3 Jobs

#### Job 1: `build-image`
- Name: `"Build Website Image"`
- Gleicher Checkout + Node-Setup + Buildx wie heute
- Berechnet `IMAGE` und `SHA_TAG`
- Baut und pusht Docker-Image
- Exportiert `IMAGE` und `SHA_TAG` als `outputs`

```yaml
outputs:
  image: ${{ steps.compute-tags.outputs.image }}
  sha_tag: ${{ steps.compute-tags.outputs.sha_tag }}
```

#### Job 2: `deploy-mentolder`
- Name: `"Deploy Website (mentolder)"`
- `needs: [build-image]`
- Liest `needs.build-image.outputs.image` und `sha_tag`
- Identisch zum heutigen mentolder-Deploy-Step inkl. Pre-Rollout Secret-Check + Rollout-Wait

#### Job 3: `deploy-korczewski`
- Name: `"Deploy Website (korczewski)"`
- `needs: [build-image]`
- **KEIN** `needs: [deploy-mentolder]`
- Liest `needs.build-image.outputs.image` und `sha_tag`
- Identisch zum heutigen korczewski-Deploy-Step inkl. Pre-Rollout Secret-Check + Rollout-Wait

### 2. `tests/spec/ci-cd.bats` — G-CD01 BATS-Tests

Neue Tests im bestehenden File:

```bash
@test "G-CD01: build-website.yml hat separaten build-image Job" { ... }
@test "G-CD01: deploy-mentolder Job hat needs: [build-image], nicht deploy-korczewski" { ... }
@test "G-CD01: deploy-korczewski Job hat needs: [build-image], nicht deploy-mentolder" { ... }
@test "G-CD01: deploy-korczewski ist unabhängig von deploy-mentolder (kein needs)" { ... }
```

Implementierung: YAML-Parse via `yq` (oder `python3 -c 'import yaml'`) auf `build-website.yml`.

### 3. `tests/unit/website-ci-deploy.bats` — Anpassung

Bestehende Tests prüfen den Job-Inhalt (kubectl-Befehle, rollout-status). Diese müssen
**nicht grundlegend geändert** werden — die `kubectl set image` und `rollout status`-Muster
sind weiterhin in der YAML-Datei vorhanden.

Jedoch müssen Test-Kommentare und ggf. Assertions für die neue Job-Struktur (3 Jobs statt 1)
angepasst werden. Konkret: Der Test auf "2 rollout status Calls" muss zu 1 pro Deploy-Job
werden (oder via gesamt-count auf die ganze Datei).

### 4. `openspec/specs/ci-cd.md` — Spec-Update

Entferne/aktualisiere alle Referenzen auf `build-website-korczewski.yml`:
- Zeile ~668: Scenario "Korczewski build-website-korczewski.yml existiert" → updaten auf neue Struktur
- Ergänze G-CD01 Requirement-Block: "Brand-Parity im Website-Deploy"

---

## Acceptance Criteria

- [ ] `task freshness:regenerate && task freshness:check` ist grün
- [ ] `task test:changed` ist grün
- [ ] `bash scripts/plan-lint.sh` ist grün
- [ ] `bash scripts/openspec.sh validate` ist grün
- [ ] `kustomize build prod-fleet/website-mentolder` + `prod-fleet/website-korczewski` validieren
- [ ] Manueller Test: beide Deploy-Jobs sind im GitHub Actions UI sichtbar und können unabhängig erneut triggert werden
- [ ] `tests/spec/ci-cd.bats` enthält G-CD01-Tests, die grün sind

---

## Out of Scope

- E2E-PR gegen korczewski (nightly-e2e deckt das bereits ab)
- Weitere Failure-Modi jenseits der sequentiellen Kopplung (z.B. Cluster-Netzwerk-Fluktuationen)
- Branch-protection required-checks: keine neuen required-checks nötig
- Renovate-Integration für korczewski-spezifische Dependencies

---

## Risiken

- **Gering:** Die 3-Job-Struktur ist ein reines GitHub Actions YAML-Refactoring ohne Logikänderung.
  Die Deploy-Commands, env-vars und Pre-Rollout-Checks bleiben identisch.
- **Image-Outputs zwischen Jobs:** Job-Outputs müssen explizit als `outputs:` auf dem build-image Job
  definiert werden. Fehler hier: deploy-Jobs bekommen leere IMAGE/SHA_TAG und die `kubectl set image`-
  Befehle fehlschlagen. Mitigation: BATS-Test prüft das `outputs:`-Pattern im build-image Job.
- **T001182 file_lock:** `g-cd01-korczewski-secret-drift` (T001182) hat `.github/workflows/build-website.yml`
  als `file_lock`. Dieser Change ist ein separater Branch, der nach T001182-Merge applied wird.
  Koordination nötig wenn T001182 noch im Merge-Queue ist.
