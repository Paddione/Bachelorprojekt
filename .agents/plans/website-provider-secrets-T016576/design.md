---
title: Website-Provider-Secrets an beide Brand-Pods durchreichen
ticket_id: T016576
domains: [infra, secrets, website]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# Website-Provider-Secrets

Beobachtung: website-secrets beider Brands enthält die neuen OPENROUTER_API_KEY und OPENCODE_API_KEY. In beiden Website-Pods fehlen diese Variablen.
Ursache: k3d/website.yaml enthält keine env-Einträge für diese beiden Provider. Beide prod-fleet/website-Brand-Overlays erben dieses Manifest. provider-config.ts liest die Provider-Keys aus process.env.

Bestehendes Muster beibehalten: zwei explizite valueFrom.secretKeyRef-Einträge mit name website-secrets, jeweils identischem key und optional: true ergänzen. Keine Klartext-Credentials, kein envFrom auf das gesamte Secret. Die Änderung kommt in den website-Container des Basismanifests und gilt damit auch in Dev/Staging ohne Pflicht-Credentials.

Teststrategie: bestehendes pytest-Modul test_sealed_secret_cluster_drift.py erweitern. Reales kubectl kustomize rendert beide Produktions-Website-Overlays; pro Brand und Provider müssen genau ein env-Eintrag, der richtige namespace und die optionale Secret-Referenz vorhanden sein. Keine Netzaufrufe oder API-Inferenz im Regressionstest. Vor Fix vier parametrische Fälle rot mit fehlendem env-Eintrag.

Umfang: k3d/website.yaml, bestehendes Testmodul und generiertes Testinventar. Keine Provider-Routing-, Model-ID-, OpenCode-Go/Zen-Endpoint- oder Schema-Änderung. Bereitgestellte Credentials bleiben unverändert.

Abnahme: vier Regressionstests grün; Kubernetes-Render gültig; Required Checks erfolgreich. Nach GitOps-Rollout Lesekontrolle, dass beide neuen Variablen in den Pods vorhanden sind, ohne ihre Werte auszugeben. Ein Vorhandenseinsbeleg beweist keine Provider-Entitlements oder erfolgreiche Inferenz.
