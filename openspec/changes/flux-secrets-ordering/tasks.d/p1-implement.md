# p1 — Implement (Rolle implement)

Frontmatter-Anker: Ticket T900014. Haengt von nichts ab; p2 baut darauf auf.

## Task T1 — dependsOn-Kanten setzen

- [ ] In `flux/clusters/fleet/ks-mentolder.yaml` unter `spec.dependsOn`
      ergaenzen (bestehende `flux-infra-controllers`-Kante bleibt):

```yaml
    - name: flux-sealed-secrets-mentolder
```

- [ ] In `flux/clusters/fleet/ks-korczewski.yaml` analog ergaenzen:

```yaml
    - name: flux-sealed-secrets-korczewski
```

- [ ] In `flux/clusters/fleet/ks-staging.yaml` analog ergaenzen:

```yaml
    - name: flux-sealed-secrets-staging
```

- [ ] Regeln dabei: genau EINE Secrets-Kante je Brand-Stack (die eigene —
      keine fremden `flux-sealed-secrets-*`-Namen), `ks-sealed-secrets.yaml`
      selbst bleibt ohne `dependsOn` (kein Zyklus), Website-Kustomizations
      (`ks-website-*.yaml`) werden NICHT angefasst (Scope-Entscheid).

## Task T2 — GREEN belegen

- [ ] YAML-Parse aller vier Dateien (z. B. `python3 -c "import yaml,..."`).
- [ ] Guard-Suite gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy/flux-secrets-ordering.bats
```
