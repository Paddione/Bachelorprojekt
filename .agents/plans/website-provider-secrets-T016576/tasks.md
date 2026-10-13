---
title: Website-Provider-Secrets an beide Brand-Pods durchreichen
ticket_id: T016576
domains: [infra, secrets, website]
status: planning
---
# website-provider-secrets-T016576 — Implementation Plan

## File Structure

- `k3d/website.yaml`: zwei optionale Provider-Secret-Referenzen im bestehenden Website-Container; beide Produktions-Overlays erben diese Basis.
- `tests/py/spec/native_ported/spec/test_sealed_secret_cluster_drift.py`: bereits ergänzter parametrischer Render-Regressionstest im bestehenden Modul, keine neue Testdatei.
- `components/website/src/data/test-inventory.json`: mit `task test:inventory` generiertes Inventar.
- Weitere von `task freshness:regenerate` tatsächlich erzeugte Änderungen prüfen und mitcommitten; keine manuellen Änderungen an generierten Dateien.

## Umfang und Gates

Source-Reads und echtes `kubectl kustomize` belegen die Ursache; der stale/degraded Graph liefert keine verlässliche Impact-Evidenz. `provider-config.ts` liest beide Schlüssel aus `process.env`; Routing, Endpoints, Modelle, Schemas und Secret-Werte bleiben außerhalb dieses Fixes. Keine Tokens lesen oder ausgeben, kein `envFrom` ergänzen.

S1 gemäß `docs/code-quality/gates.yaml` und `docs/code-quality/baseline.json`: Testmodul Ist 104 Zeilen, nicht baselined, .py-Limit 800 → Budget 696. Das Modul bleibt deutlich unter 80 %; kein Split erforderlich. Basis-YAML Ist 850 und Inventar-JSON Ist 6314 Zeilen, beide nicht baselined und ohne Extension-Limit: kein numerisches S1-Budget. Baseline-/Ignore-Ausnahmen sind ausgeschlossen. S2: keine Importänderungen; S3: keine neuen Hostnamen; S4: bestehendes eingebundenes Manifest, keine neuen Skripte. Keine Änderung an TS-/Svelte-Logik oder `any`-Typen, daher kein Vitest-Task erforderlich.

Alle Befehle im geteilten Orchestrator-Worktree `/home/patrick/.worktrees/Bachelorprojekt-37ac27be/fix/website-provider-secrets-T016576` mit `export AGENT_LOCK_SID=1382911` ausführen.

## Task 1: RED des unveränderten Regressionstests bestätigen

Der bereits ergänzte Test `test_rendered_website_receives_optional_provider_secret` darf vor dem Fix nicht verändert werden. Er rendert beide Produktions-Overlays, prüft genau ein Deployment und dessen tatsächlichen Brand-Namespace sowie genau einen Env-Eintrag je Provider mit vollständiger optionaler Secret-Referenz.

```bash
export AGENT_LOCK_SID=1382911
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/test_sealed_secret_cluster_drift.py -k test_rendered_website_receives_optional_provider_secret
```

RED expected: FAIL — vier Fälle (zwei Brands × zwei Provider) wegen fehlendem Env-Eintrag. Lokal liegen diese vier echten Render-Fehlschläge bereits vor. Ergebnis und Exit-Code festhalten; ein Skip zählt nicht als RED. Repo-CI führt die Spec-Suite aus; der neue Test hat ausschließlich für fehlendes `kubectl` einen Binary-Guard-Skip und benötigt keinen erreichbaren Cluster.

## Task 2: Optionale Referenzen in der gemeinsamen Basis ergänzen

Im `env` des Containers `website` im Deployment `website` in `k3d/website.yaml`, neben den vorhandenen Provider-Referenzen, folgende Einträge jeweils genau einmal ergänzen:

```yaml
- name: OPENROUTER_API_KEY
  valueFrom:
    secretKeyRef:
      name: website-secrets
      key: OPENROUTER_API_KEY
      optional: true
- name: OPENCODE_API_KEY
  valueFrom:
    secretKeyRef:
      name: website-secrets
      key: OPENCODE_API_KEY
      optional: true
```

Keine Brand-Patches oder Secret-Werte ändern. Derselbe gezielte pytest-Aufruf aus Task 1 muss anschließend vier bestandene Fälle liefern. Dies beweist die Vererbung durch beide Overlays sowie die Optionalität für Umgebungen ohne Provider-Credentials; keine Provider-Inferenz ausführen.

## Task 3: Verify und generierte Artefakte sichern

```bash
export AGENT_LOCK_SID=1382911
task workspace:validate
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/test_sealed_secret_cluster_drift.py -k test_rendered_website_receives_optional_provider_secret
task test:inventory
task test:changed
task freshness:regenerate
```

Für dieses Render-Spec gibt es keinen passenden `./tests/runner.sh local <TEST-ID>`: dessen Local-Auswahl findet das native Spec-Unterverzeichnis nicht. Der oben explizite, offline ausgeführte pytest-Test ist die relevante Manifest-Regression; keinen leeren Runner-Lauf als Nachweis werten.

Ausgaben und Exit-Codes aller Checks dokumentieren. Bekannte Selektionsgrenzen von `test:changed`: ein korczewski-Manifestpfad aktiviert Brand-E2E, der Name des geänderten Testmoduls enthält jedoch kein korczewski. Die gemeinsame `k3d/`-Änderung aktiviert Services-E2E; bei fehlendem `localhost:4321` wird dessen sichtbarer Skip als Skip dokumentiert. Die Testmoduländerung aktiviert die gesamte pytest-Suite einschließlich Specs. Ein auftretender Fehler wegen fehlendem `CRON_SECRET` bleibt ausdrücklich ein Fehler; weder Dummy-Wert setzen noch Guard entfernen oder grün behaupten. Infrastruktur-/Umgebungsfehler mit Ursache festhalten und gemäß Repository-Workflow behandeln.

Danach tatsächlichen Diff der generierten Artefakte prüfen und sie einschließlich Testinventar mit Implementierung und Regressionstest committen (Implementer). Erst nach diesem Commit den abschließenden Check ausführen:

```bash
export AGENT_LOCK_SID=1382911
task freshness:check
```

Abnahme: vier gezielte Tests PASS, valide Manifeste und vollständige Check-Evidenz; S1–S4 und Baseline-Key-Anzahl bleiben gültig. Nach GitOps-Rollout beim Orchestrator nur Vorhandensein der zwei Variablennamen in beiden Website-Pods prüfen, niemals deren Werte; das bestätigt keine Provider-Entitlements. Receipt/Delete nach Merge über den bestehenden Plan-Lifecycle des Orchestrators.
