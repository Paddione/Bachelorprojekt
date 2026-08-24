---
title: "dev-secrets-inversion — Implementation Plan"
ticket_id: T014546
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-secrets-inversion — Implementation Plan

## Befund (verifiziert 2026-08-24)

- `prod/kustomization.yaml:7` zieht `- ../k3d` komplett als Base.
- Die einzige Barriere gegen Plaintext-Secrets im Prod-Bundle sind **10 manuelle
  `$patch: delete`-Einträge** in `prod/kustomization.yaml` (Secrets `workspace-secrets`,
  `knowledge-secrets`, `backup-passphrase`, `vaultwarden-seed-credentials`, `ntfy-tokens`
  zzgl. NetworkPolicy/Ingress-Devs).
- `grep -rln '^kind: Secret' k3d/` findet **17 Dateien** — alle nicht gepatchten landen
  per Default im Prod-Render. Neue Secret-Dateien ebenso (Default-allow statt Default-deny).

## Zielbild (Inversion)

Dev-only Secrets wandern in eine eigene Kustomize-**Component** `k3d/components/dev-secrets/`,
die nur der Dev-Pfad inkludiert. Der Base verliert die Secret-Ressourcen; Prod braucht keine
`$patch: delete`-Einträge mehr für sie. Sicherheit wird vom Include-Mechanismus getragen,
nicht von einer Erinnerungsliste.

## File Structure

```
k3d/components/dev-secrets/kustomization.yaml                          (neu) Component mit allen Dev-only Secret-Ressourcen
k3d/components/dev-secrets/*.yaml                                      (verschoben) die als dev-only klassifizierten Secret-Dateien
k3d/kustomization.yaml                                                 Secret-Ressourcen aus resources entfernen, Component für Dev inkludieren
prod/kustomization.yaml                                                überflüssige $patch: delete-Einträge für verschobene Secrets entfernen
tests/spec/secrets-deploy-automation/dev-secrets-inversion.bats        (neu) Prod-Render-Exclusion-Guard
```

## Partial-Manifest

Zwei Partials. P1 ist die strukturelle Inversion (Base/Component/Prod-Patches — diese Dateien
semantisch untrennbar, ein Schnitt liesse ein nicht-renderndes Zwischenstand-Repo zurück).
P2 ist die Tests-Rolle mit dem Render-Guard.

## Tasks

- [ ] **1. Klassifikation: welche Secrets sind dev-only?** Für jede der 17 `kind: Secret`-
      Dateien unter `k3d/` (inkl. Unterverzeichnisse, soweit vom Base-Render erreicht):
      Ist das Secret im Prod-Cluster via SealedSecret (`environments/sealed-secrets/`) vertreten?
      Klassifiziere: (a) dev-only-placeholder → verschieben, (b) prod-nötig-aber-SealedSecret-
      verwaltet → aus dem Base entfernen, (c) bewusst statisch/geteilt → behalten mit
      Begründung im PR. Verifikationsanker:

      ```bash
      kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/prod-before.yaml
      ```

- [ ] **2. Component anlegen und Base invertieren.** `k3d/components/dev-secrets/kustomization.yaml`
      (apiVersion kustomize.config.k8s.io/v1alpha1, kind Component) mit den verschobenen
      Dateien; `k3d/kustomization.yaml` um die Ressourcen erleichtern und die Component nur
      im Dev-Pfad inkludieren. Seed-Daten (`vaultwarden-seed-credentials`) erhalten
      `labels: [{pairs: {seed-type: dev-seed}}]`.

- [ ] **3. Prod-Patches aufräumen.** Die `$patch: delete`-Einträge entfernen, deren Target
      durch die Verschiebung gar nicht mehr im Render liegt. Einträge für (c)-Ressourcen
      bleiben. Danach Render-Diff:

      ```bash
      kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/prod-after.yaml
      diff /tmp/prod-before.yaml /tmp/prod-after.yaml
      ```

      Erwartet: Diff enthält ausschliesslich die intendierten Entfernungen; kein Prod-Ressource
      verliert ihre Spec.

- [ ] **4. Failing test (RED) schreiben.** `tests/spec/secrets-deploy-automation/dev-secrets-inversion.bats`
      rendert das Prod-Overlay und assertiert: keine `kind: Secret`-Ressource im Render
      stammt aus einer Klartext-Datei unter `k3d/` (Erkennung: Secret-Namen ∩ Move-Liste).
      Positiv-Anker: der Render muss überhaupt Secrets enthalten (die SealedSecret-Pflicht),
      sonst wäre die Negativ-Aussage vakuos.

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/secrets-deploy-automation/dev-secrets-inversion.bats
      ```

      expected: FAIL — solange P1 nicht steht, tauchen Dev-Secrets noch im Prod-Render auf.
      (Reihenfolge im Executor: Test zuerst schreiben und rot sehen, dann P1–P3 abschliessen.)

- [ ] **5. Final Verification.**

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/secrets-deploy-automation/
      task test:changed
      task freshness:regenerate
      task freshness:check
      task workspace:validate
      ```

      Erwartet: Guard grün, keine neuen Fehlschläge gegenüber origin/main, Kustomize-Dry-Run
      grün für beide Brands.
