---
title: Plan: FE05 Website-Lieferkette korczewski-prod reparieren
ticket_id: null
domains: [website, infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: FE05 Website-Lieferkette korczewski-prod reparieren

Fix zu [#7234](https://github.com/Paddione/Bachelorprojekt/issues/7234).
Trackt das native Goal `goal-01a1b2f1-da8d-7c22-9101-a2a137de30fb` (FE05-Kriterium).

## Ausgangslage (belegt)

- Run 42303956096: `Build Website Image` success, `Re-render fleet artifact` success,
  `Deploy Website (korczewski)` **skipped**.
- `deploy-korczewski` (`build-website.yml:128`): `if: vars.FLUX_ENABLED != 'true'`
  feuert im Flux-Steady-State nie — tot wie ehemals `deploy-mentolder` (T900810).
- `render-korczewski-prod-artifact.yml` triggert nicht auf `components/website/**`
  und nimmt keinen Digest entgegen; `build-website.yml` ruft es nie auf.
- `environments/korczewski-prod.yaml:48` pinnt
  `WEBSITE_IMAGE_DIGEST: sha256:1111…` (Placeholder aus #6924, nie gebumpt).
- Folge: `korczewski-prod-manifests` referenziert dauerhaft einen toten Digest,
  live bleiben alte Assets stehen (WebP-404 als Versionsskew-Symptom).
- Guard-Lage: `test_ci_cd_part1.py::test_g_cd01_deploy_korczewski_needs_build_image_und_nicht_deploy_mentolder`
  pinnt nur Existenz/`needs`, nicht die `if`-Bedingung.

## Ziel

Jeder Website-Image-Build fliesst digest-scharf ins `korczewski-prod-manifests`-Artefakt;
der tote Direkt-Deploy entfällt analog T900810 (nur mit Guard-Update).
Nicht-Ziele: kein WSL-GPU-Fix, kein Prometheus, keine manuellen Deploys.

## Partial P1 — Render-Vertrag korczewski-prod (Digest-Input)

Zieldateien:
- `.github/workflows/render-korczewski-prod-artifact.yml`
- `scripts/korczewski-prod/render-stack.sh`

Aufgaben:
- [ ] `workflow_call`-Trigger mit `website_image_digest`-Input (Pflicht, String) ergänzen,
      analog `render-fleet-artifact.yml:5-9`.
- [ ] Render-Schritt setzt `WEBSITE_IMAGE_DIGEST` aus dem Input (oder löst ihn per
      `scripts/resolve-image-digest.sh` online auf, wenn Input leer — kein Placeholder).
- [ ] `render-stack.sh`: Caller-Wert von `WEBSITE_IMAGE_DIGEST` muss gewinnen
      (erst `env-resolve.sh` prüfen: überschreibt es einen exportierten Wert?
      Falls ja, Export nach dem Sourcing wiederholen). Guard 4 (Digest-Pinning)
      und Render-Gate (`:latest`-Verbot) bleiben scharf.
- [ ] Bestehende `push`-Trigger unverändert lassen (voller Stack-Render bleibt möglich).

Gate: `bash -n` auf Skript-Edit; YAML-Parse per neuem RED-Test (P3).

## Partial P2 — Build-Kette + toten Deploy entfernen

Zieldatei:
- `.github/workflows/build-website.yml`

Aufgaben:
- [ ] Neuen Job `render-korczewski-prod` ergänzen: `needs: [build-image]`,
      `uses: ./.github/workflows/render-korczewski-prod-artifact.yml`,
      `with: website_image_digest: ${{ needs.build-image.outputs.digest }}`,
      kein `if`-Gate (läuft immer nach erfolgreichem Build).
- [ ] Job `deploy-korczewski` entfernen (tot unter FLUX_ENABLED=true, T900810-Präzedenz).
- [ ] T900810-Kommentar aktualisieren: Entfernung + Guard-Update (P3) dokumentieren.

Gate: kein zweiter Edit an Dateien aus P1/P3 in diesem Partial.

## Partial P3 — Guards (RED→GREEN)

Zieldateien (nur Tests):
- `tests/py/spec/native_ported/spec/test_fe05_korczewski_delivery.py` (bereits RED vorhanden)
- `tests/py/spec/native_ported/spec/test_ci_cd_part1.py`

Aufgaben:
- [ ] RED-Test aus diesem Branch übernehmen (unverändert lassen, nur bei
      begründet falscher Erwartung anpassen — dann Begründung im Commit).
- [ ] `test_g_cd01_deploy_korczewski_needs_build_image_und_nicht_deploy_mentolder`
      ersetzen: pinnt jetzt die Kette (Build ruft korczewski-prod-Render mit
      `needs.build-image.outputs.digest` auf) statt der Job-Existenz.
- [ ] `T900810`-Kommentar in `build-website.yml` und Guard-Änderung konsistent halten.

Gate: `python3 -m pytest tests/py/spec/native_ported/spec/test_fe05_korczewski_delivery.py -q` grün
plus betroffene `test_ci_cd_part1.py`-Tests grün.

## Finale Verifikation (dev-flow-execute)

1. `bash scripts/pytest-run.sh` oder gezielt:
   `python3 -m pytest tests/py/spec/native_ported/spec/test_fe05_korczewski_delivery.py tests/py/spec/native_ported/spec/test_ci_cd_part1.py -q`
2. `task test:changed` (Repo-Gate) — Pflicht vor Push.
3. `task freshness:check` (generated_artifacts=true) — keine generierten Artefakte
   angefasst, muss grün bleiben.
4. Commit als `fix(...)` mit Referenz `#7234`; Push des Fix-Branch (kein PR-Zwang,
   squash-merge bei PR). `dev-flow-execute` übernimmt die Umsetzung.
