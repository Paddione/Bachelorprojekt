---
title: "fix-penpot-public-uri — Implementation Plan"
ticket_id: T900002
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-penpot-public-uri — Implementation Plan

_Ticket: T900002_

## File Structure

```
tests/spec/fleet-operations/penpot-manifests.bats   # GEÄNDERT: RED-Guard (bereits committed)
environments/schema.yaml                            # GEÄNDERT: PENPOT_PUBLIC_URI registrieren
environments/dev.yaml                               # GEÄNDERT: Dev-Wert
environments/mentolder.yaml                         # GEÄNDERT: Brand-Wert
environments/korczewski.yaml                        # GEÄNDERT: Brand-Wert
environments/fleet-mentolder.yaml                   # GEÄNDERT: Brand-Wert
environments/fleet-korczewski.yaml                  # GEÄNDERT: Brand-Wert
environments/staging.yaml                           # GEÄNDERT: Staging-Wert
k3d/penpot.yaml                                     # GEÄNDERT: Literal → ${PENPOT_PUBLIC_URI} (2×)
Taskfile.yml                                        # GEÄNDERT: beide ENVSUBST_VARS-Listen
openspec/changes/add-penpot-service/specs/fleet-operations.md  # GEÄNDERT: veraltetes Szenario (bereits committed)
```

## S1-Zeilenbudget

S1 gatet die betroffenen Dateien **nicht** — `docs/code-quality/gates.yaml` → `s1.limits`
führt weder `.yaml`/`.yml` noch `.bats`, und keine der Dateien steht in
`docs/code-quality/baseline.json`. Es gibt daher kein Zeilenbudget, das die Änderung
einengt. Nachprüfbar:

```bash
grep -A 15 '^  limits:' docs/code-quality/gates.yaml
for f in k3d/penpot.yaml Taskfile.yml environments/schema.yaml; do
  jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json
done
# → dreimal "nicht-baselined"
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Der Guard
      `T900002: PENPOT_PUBLIC_URI ist envsubst-verdrahtet statt auf die Dev-URL festgenagelt`
      in `tests/spec/fleet-operations/penpot-manifests.bats` schlägt auf dem aktuellen Stand
      fehl (Zeile mit `design.localhost` direkt hinter `name: PENPOT_PUBLIC_URI`). Er sichert
      fünf Zusicherungen ab: kein Dev-Literal, beide Container mit Platzhalter, Eintrag in
      beiden `ENVSUBST_VARS`-Listen, Registry-Eintrag mit Dev-Default, Wert in jeder
      Prod-Umgebung. Die zehn bestehenden Penpot-Tests bleiben grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-manifests.bats
# expected: FAIL — "not ok 11", die übrigen 10 Tests ok
```

- [ ] **Registry-Variable anlegen.** In `environments/schema.yaml` neben den übrigen
      Service-URLs einen Eintrag `PENPOT_PUBLIC_URI` mit `required: true`,
      `default_dev: "http://design.localhost"` und einer Beschreibung ergänzen, die die
      Rolle benennt (öffentliche URI für generierte Links, CORS und OIDC-Redirects). Vorbild
      ist der Block `POCKET_ID_FRONTEND_URL` in derselben Datei — bewusst **nicht** die
      `*_EXTERNAL_URL`-Gruppe, die `required: false` ist und nur Website-Verlinkungen dient.

```bash
grep -A 4 'name: POCKET_ID_FRONTEND_URL' environments/schema.yaml   # Vorbild
grep -A 4 'name: PENPOT_PUBLIC_URI' environments/schema.yaml        # Ergebnis
```

- [ ] **Werte je Umgebung setzen.** In den sechs `environments/*.yaml` unter `env_vars`
      jeweils `PENPOT_PUBLIC_URI` ergänzen, konsistent zum dort bereits vorhandenen
      `PENPOT_DOMAIN` derselben Datei: Dev mit Schema `http`, alle übrigen mit `https`.
      Den Host **nicht** neu erfinden, sondern aus dem `PENPOT_DOMAIN`-Wert derselben Datei
      übernehmen — so bleiben Ingress, ConfigMap und öffentliche URI zwangsläufig identisch.

```bash
for e in dev mentolder korczewski fleet-mentolder fleet-korczewski staging; do
  echo "== $e"; grep -E 'PENPOT_(DOMAIN|PUBLIC_URI)' "environments/$e.yaml"
done
# erwartet: pro Datei zwei Zeilen, Host identisch, Schema http nur in dev.yaml
```

- [ ] **Manifest auf den Platzhalter umstellen.** In `k3d/penpot.yaml` beide Vorkommen
      `value: "http://design.localhost"` unter `name: PENPOT_PUBLIC_URI` durch
      `value: "${PENPOT_PUBLIC_URI}"` ersetzen (Backend- und Frontend-Container).
      `PENPOT_OIDC_AUTH_SERVER_URL` in Zeile 113 bleibt unverändert — siehe Non-Goals im
      Proposal.

```bash
grep -A 1 'name: PENPOT_PUBLIC_URI' k3d/penpot.yaml
# erwartet: zweimal value: "${PENPOT_PUBLIC_URI}", kein design.localhost
```

- [ ] **Beide envsubst-Listen ergänzen.** In `Taskfile.yml` `\$PENPOT_PUBLIC_URI` in die
      `ENVSUBST_VARS`-Zeile von `workspace:deploy` **und** in die spiegelgleiche Zeile von
      `flux:render` aufnehmen — dort, wo bereits `\$BRETT_DOMAIN \$PENPOT_DOMAIN` steht.
      Fehlt einer der beiden Einträge, überlebt der Platzhalter literal im gerenderten
      Manifest; das ist schwerer zu bemerken als der ursprüngliche Fehler, weil es erst zur
      Laufzeit auffällt. Die beiden Listen müssen deckungsgleich bleiben — der Kommentar
      über der zweiten Liste hält das ausdrücklich fest.

```bash
grep -cF '$PENPOT_PUBLIC_URI' Taskfile.yml
# erwartet: 2
```

- [ ] **Prod-Render gegenprüfen (Kern der Verifikation).** Das Manifest beider Brands durch
      den echten envsubst-Vertrag rendern und belegen, dass weder die Dev-URL noch ein
      unaufgelöster Platzhalter übrig bleibt. Dieser Schritt ist das eigentliche
      Gegenstück zum Reproducer aus dem Proposal — der BATS-Guard prüft die Verdrahtung,
      dieser Schritt das Resultat.

```bash
for brand in mentolder korczewski; do
  ( source scripts/env-resolve.sh "$brand" >/dev/null 2>&1
    kubectl kustomize "prod-fleet/$brand" --load-restrictor=LoadRestrictionsNone 2>/dev/null \
      | envsubst "$(sed -n '3340,3372p' Taskfile.yml | grep -o '\\\$[A-Z_]*' | tr -d '\\' | tr '\n' ' ')" \
      | grep -A 1 'name: PENPOT_PUBLIC_URI' )
done
# erwartet: je Brand zweimal https://design.<brand>.de
# verboten:  design.localhost ODER ein literales ${PENPOT_PUBLIC_URI}
```

- [ ] **Guard auf grün.** Derselbe BATS-Lauf wie im RED-Schritt, jetzt vollständig grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/penpot-manifests.bats
# erwartet: 11 Tests, alle ok
```

- [ ] **Manifest-Validierung.** Kustomize muss nach der Änderung weiterhin für alle
      Overlays bauen.

```bash
task workspace:validate
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
