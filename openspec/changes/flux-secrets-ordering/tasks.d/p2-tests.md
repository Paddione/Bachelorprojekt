# p2 — Tests (Rolle tests, STRUCT2-Traeger)

Frontmatter-Anker: Ticket T900014 · Rolle tests · haengt an p1.

## Task T1 — RED-Beleg (vor p1)

- [ ] Guard gegen den Unveraendert-Stand laufen lassen — Tests 2+3 scheitern,
      weil die dependsOn-Kanten fehlen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy/flux-secrets-ordering.bats
# expected: FAIL (red — keine Brand-Kustomization haengt an ihrer Secrets-Kustomization)
```

## Task T2 — Guard-Datei `tests/spec/workspace-deploy/flux-secrets-ordering.bats`

- [ ] Test 1 (Positiv-Anker): alle drei `flux-sealed-secrets-*`-Kustomizations
      existieren in `flux/clusters/fleet/ks-sealed-secrets.yaml`.
- [ ] Test 2: jede Brand-/Staging-Kustomization deklariert `dependsOn` auf
      `flux-infra-controllers` (bleibt) UND auf ihre eigene
      `flux-sealed-secrets-*`-Kustomization. Pruefung per python3+yaml
      (kein yq — in CI nicht installiert).
- [ ] Test 3: keine fremden `flux-sealed-secrets-*`-Kanten je Stack, und
      `ks-sealed-secrets.yaml` deklariert selbst kein `dependsOn`.
- [ ] Konventionen: eigene Datei unter `tests/spec/workspace-deploy/`
      (T002416, keine ticket-nummerierte Datei), simple `[ ... ]`-Assertions,
      `REPO_ROOT` aus `BATS_TEST_DIRNAME` (kein helper-load noetig).

## Task T3 — GREEN nach p1 + Regression

- [ ] Guard-Suite gruen nach p1.
- [ ] Ordnungsrelevante Bestands-Tests gruen:

```bash
tests/unit/lib/bats-core/bin/bats --filter 'dependsOn|healthChecks|sealed-secrets' tests/spec/workspace-deploy.bats
```
