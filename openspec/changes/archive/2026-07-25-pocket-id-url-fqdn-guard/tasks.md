---
title: "pocket-id-url-fqdn-guard — Implementation Plan"
ticket_id: T002154
domains: [infra, website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-url-fqdn-guard — Implementation Plan

_Ticket: T002154_

Schließt die beiden Lücken aus dem Login-Incident vom 2026-07-25 (Design:
`openspec/changes/pocket-id-url-fqdn-guard/design.md`). Der bereits live durchgeführte
`rollout restart` war Symptombehandlung — dieser Plan beseitigt die Ursachen.

## File Structure

```
Taskfile.yml                          (geändert — 5 Fallback-Stellen + Checksum-Injektion)
k3d/website.yaml                      (geändert — checksum/config-Annotation im Pod-Template)
.github/workflows/build-website.yml   (geändert — Checksum-Injektion in beiden Brand-Jobs)
environments/schema.yaml              (geändert — WEBSITE_CONFIG_SHA als optionale Variable)
tests/spec/auth-sso.bats              (geändert — 3 Regressionstests, bereits geschrieben)
```

S1-Budgets: Keine dieser Dateien fällt in den S1-Scope — `.yml`, `.yaml` und `.bats` stehen nicht
in `docs/code-quality/gates.yaml` → `s1.limits`. Keine ist in `docs/code-quality/baseline.json`
gebaselined, keine neue Datei wird angelegt.

Es werden keine Dateien unter `website/src/**` berührt, daher keine Auswirkung auf das
CQ02-`any`-Budget.

<!-- vitest: kein neuer Test nötig, weil ausschließlich die Deploy-Pipeline (Taskfile/Workflow/Manifest) geändert wird, kein Anwendungscode unter website/src -->

## Task 1 — RED-Zustand bestätigen

Die drei Regressionstests liegen bereits in `tests/spec/auth-sso.bats` und müssen vor der
Implementierung fehlschlagen.

```bash
bats tests/spec/auth-sso.bats --filter "T002154"
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

Erwartete Fehlbilder:

1. `kein bare Kurzname als POCKET_ID_URL-Fallback im Taskfile` listet die fünf Fundstellen
   (Zeilen 2647, 2807, 2947, 3638, 3664).
2. `jeder POCKET_ID_URL-Fallback rendert zu einem FQDN` meldet
   `'http://pocket-id:1411' rendert zu 'http://pocket-id:1411' — kein FQDN`.
3. `Website-Pod-Template trägt eine checksum/config-Annotation` meldet die fehlende Annotation
   in `k3d/website.yaml`.

Schlägt einer der Tests bereits grün an, ist die Ausgangslage eine andere als im Design
beschrieben — dann zuerst den Ist-Zustand erneut erheben statt weiterzuimplementieren.

## Task 2 — D1: Kurzname-Fallback durch FQDN ersetzen

In `Taskfile.yml` an allen fünf Stellen (Zeilen 2647, 2807, 2947, 3638, 3664 — Tasks
`workspace:deploy` ×2, `workspace:partial-deploy`, `website:deploy` ×2) den Default umstellen:

```
# vorher
POCKET_ID_URL="${POCKET_ID_URL:-http://pocket-id:1411}"
# nachher
POCKET_ID_URL="${POCKET_ID_URL:-http://pocket-id.${WORKSPACE_NAMESPACE}.svc.cluster.local:1411}"
```

Zwei Stellen nutzen `export`, drei die Inline-Zuweisung vor `envsubst` — die jeweilige Form
beibehalten, nur den Default-Ausdruck tauschen.

Prüfen, dass `WORKSPACE_NAMESPACE` an jeder der fünf Stellen bereits gesetzt ist, bevor der
Ausdruck ausgewertet wird. Ist das an einer Stelle nicht der Fall, dort zusätzlich
`WORKSPACE_NAMESPACE="${WORKSPACE_NAMESPACE:-workspace}"` voranstellen — sonst entsteht
`pocket-id..svc.cluster.local`, was Test 2 aus Task 1 abfängt.

Zwischenprüfung — beide müssen jetzt grün sein:

```bash
bats tests/spec/auth-sso.bats --filter "T002154: kein bare Kurzname"
bats tests/spec/auth-sso.bats --filter "T002154: jeder POCKET_ID_URL-Fallback"
```

## Task 3 — D2a: Checksum-Annotation im Manifest verankern

In `k3d/website.yaml` im **Pod-Template** des `website`-Deployments (nicht in den
Deployment-Metadaten) eine Annotation als envsubst-Platzhalter ergänzen:

```yaml
spec:
  template:
    metadata:
      annotations:
        checksum/config: "${WEBSITE_CONFIG_SHA}"
```

`WEBSITE_CONFIG_SHA` in `environments/schema.yaml` als optionale Variable eintragen
(`required: false`), damit `task env:validate` sie kennt und nicht als unbekannt ablehnt.

Anschließend `WEBSITE_CONFIG_SHA` in **allen** envsubst-Allowlists ergänzen, die
`k3d/website.yaml` rendern — im `website:deploy`-Task betrifft das den Dev-Zweig
(`envsubst < k3d/website.yaml`, Zeile ~3639) **und** den Prod-Overlay-Zweig (~3667), sowie die
Allowlist in `workspace:deploy`. Eine vergessene Allowlist lässt den Platzhalter literal stehen —
exakt die Drift aus T001993.

## Task 4 — D2b: Checksum in beiden Render-Pfaden berechnen

Der Hash muss **nach** `envsubst` gebildet werden, sonst ist er blind für den eingesetzten Wert
(Design D2: der Kustomize-Hash-Suffix liefert für kaputten und richtigen Wert denselben Namen
`website-config-9cc9bh8bmc`).

**(a) `Taskfile.yml`** — in `website:deploy` und `workspace:deploy` vor dem `kubectl apply`:
Das gerenderte Manifest in eine Variable schreiben, aus dem `website-config`-ConfigMap-Block den
Hash bilden, ihn als `WEBSITE_CONFIG_SHA` exportieren und das Manifest damit erneut substituieren.
Reihenfolge zwingend: erst alle übrigen Variablen einsetzen, dann hashen, dann die
Checksum-Annotation einsetzen — sonst hasht man Platzhalter.

**(b) `.github/workflows/build-website.yml`** — dieselbe Berechnung in **beiden** Brand-Jobs
(mentolder ~Zeile 199, korczewski ~Zeile 346), jeweils vor
`kubectl apply --server-side --force-conflicts`. Die Annotation muss im Manifest stehen, bevor
sie appliziert wird, nicht nachträglich gepatcht werden — sonst kollidiert der nächste
server-side apply mit dem Field-Manager.

Nur einen der beiden Brand-Jobs zu ändern reproduziert die Drift aus T001993: Der unveränderte
Job überschreibt beim nächsten Push die Annotation des anderen, und der Rollout entfällt wieder.

Zwischenprüfung — alle drei Tests grün, Manifest-Validierung fehlerfrei:

```bash
bats tests/spec/auth-sso.bats --filter "T002154"
task workspace:validate
```

## Task 5 — Finale Verifikation

```bash
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` regeneriert `website/src/data/test-inventory.json` wegen der drei neuen
BATS-Tests; die Datei gehört mit in den Commit, sonst schlägt der CI-Inventar-Check fehl.

Zusätzlich der Dry-Run-Nachweis, dass der Fallback einen FQDN liefert, ohne etwas zu deployen:

```bash
bash scripts/vda.sh oracle 'deploy website to mentolder brand' --dry-run
```

Nach dem Merge und dem darauf folgenden Deploy live gegenprüfen, dass der Pod den FQDN trägt —
die ConfigMap allein ist kein Nachweis, weil `envFrom` die Werte beim Containerstart einfriert:

```bash
kubectl --context fleet -n website exec deploy/website -- printenv POCKET_ID_URL
```

Erwartung: ein Wert auf `.svc.cluster.local`, kein Kurzname.
