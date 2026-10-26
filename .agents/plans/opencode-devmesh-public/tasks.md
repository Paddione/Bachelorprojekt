---
title: "opencode-devmesh-public — Implementation Plan"
domains: [infra, devmesh, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-devmesh-public — Implementation Plan

Implements `.agents/plans/opencode-devmesh-public/design.md`: public opencode
web UI on devmesh at `${OPENCODE_PUBLIC_HOST}`, TLS via `letsencrypt-devmesh`,
Pocket ID SSO via oauth2-proxy + forwardAuth. Decisions D1–D6 stand and are not
renegotiated here.

Live steps (deploy, DNS/NAT, secret rotation) run only after explicit user
approval in the execute session. All other tasks change only the repo.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/components/opencode/kustomization.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/opencode/opencode.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/opencode/certificate.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/opencode/ingressroute.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/opencode/oauth2-proxy-opencode.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/core/kustomization.yaml` | 176 | n/a (YAML ohne S1-Limit) |
| `environments/dev.yaml` | 60+ | n/a (YAML ohne S1-Limit) |
| `tests/py/spec/devmesh/test_opencode_public.py` | neu | Budget 800 (Limit `.py`) |

No brand-domain literals in snippets — `${OPENCODE_PUBLIC_HOST}`,
`${PROD_DOMAIN}` (auth host), `${WORKSPACE_NAMESPACE}` throughout.

## Task 1: Manifeste (P1)

- [ ] `dev-local/components/opencode/kustomization.yaml` (Component, resources:
  `opencode.yaml`, `certificate.yaml`, `ingressroute.yaml`,
  `oauth2-proxy-opencode.yaml`; template:
  `dev-local/components/sessions/kustomization.yaml`).
- [ ] `opencode.yaml`: PVC (workspace data, `local-path`, 5Gi) + Deployment
  (pinned image digest, `serve --hostname 0.0.0.0 --port 4096`, probes on `/`,
  `Recreate`, `runAsNonRoot`) + Service `:80 → :4096`. No env secrets in
  Deployment — auth lives in P1 oauth2-proxy.
- [ ] `certificate.yaml`: `Certificate opencode-public-tls`,
  `issuerRef: letsencrypt-devmesh`, `dnsNames: ["${OPENCODE_PUBLIC_HOST}"]`
  (template: `sessions-ingress.yaml` head / `dev-local/cluster/tls.yaml`).
- [ ] `ingressroute.yaml`: Traefik IngressRoute, entrypoint `websecure`,
  rule `Host(`${OPENCODE_PUBLIC_HOST}`)`, `/oauth2` route → oauth2-proxy
  (priority 20, unauthenticated, for the roundtrip) + main route with
  forwardAuth middleware → opencode Service, `tls.secretName:
  opencode-public-tls` (template: `sessions-ingress.yaml` rules).
- [ ] `oauth2-proxy-opencode.yaml`: Deployment + Service `:4180` mirroring
  `oauth2-proxy-brain` (`dev-local/components/brain/brain.yaml:225-358`):
  `client-id=opencode`,
  `redirect-url=https://${OPENCODE_PUBLIC_HOST}/oauth2/callback`,
  `oidc-issuer-url=https://auth.${PROD_DOMAIN}`, upstream `http://opencode:80`,
  cookie `_oauth2_proxy_opencode`, secret `$(POCKET_ID_OPENCODE_SECRET)` from
  `workspace-secrets`; plus forwardAuth Middleware
  `http://oauth2-proxy-opencode.workspace.svc.cluster.local:4180/oauth2/auth`.
- [ ] Pocket ID wiring: `dev-local/core/kustomization.yaml` patch on Job
  `pocket-id-client-seed` registering client `opencode` with the callback URL
  (pattern: `WEBSITE_EXTRA_CALLBACK` patch); secret key
  `POCKET_ID_OPENCODE_SECRET` added via SealedSecret (`task env:seal ENV=dev)
  — never plaintext in the repo.
- [ ] `dev-local/core/kustomization.yaml` `components:` +=
  `../components/opencode` (alphabetical: after `k1-embed`, before `sessions`
  — current list `dev-local/core/kustomization.yaml:34-40`).
- [ ] `environments/dev.yaml`: `OPENCODE_PUBLIC_HOST` var (pattern:
  `WEBSITE_HOST`); render path (`task devmesh:deploy`) envsubst-covers it —
  verify with `scripts/devmesh/render-stack.sh core --out <tmp>` containing
  `opencode-public-tls` and `Host(${OPENCODE_PUBLIC_HOST})` unexpanded-safe.

## Task 2: Rote Verträge (P2, disjunkt zu P1)

- [ ] RED-Beleg zuerst: `python3 -m pytest
  tests/py/spec/devmesh/test_opencode_public.py -q` → expected FAIL (Datei fehlt
  bzw. Render ohne opencode-Anteil); Beleg (Ausgabe + Exit-Code) ins Task-Log.
- [ ] `tests/py/spec/devmesh/test_opencode_public.py` (Budget 800, Fixture
  `repo_root` wie `tests/py/spec/devmesh/test_devmesh_flux.py`):
  - `test_render_contains_opencode`: `render-stack.sh core --out <tmp>` Baum
    enthält `Certificate/opencode-public-tls` mit
    `dnsNames == ["${OPENCODE_PUBLIC_HOST}"]` nach envsubst, genau ein
    `IngressRoute` mit `Host(`-Match und `tls.secretName: opencode-public-tls`.
  - `test_no_literal_host`: kein Manifest unter `dev-local/components/opencode/`
    enthält ein String-Literal `korczewski.de` (nur `${...}`-Referenzen).
  - `test_oauth2_wiring`: oauth2-proxy Deployment args enthalten
    `client-id=opencode` und `redirect-url` mit `${OPENCODE_PUBLIC_HOST}`;
    Middleware zeigt auf `oauth2-proxy-opencode...:4180/oauth2/auth`.
  - `test_core_hook`: `dev-local/core/kustomization.yaml` listet
    `../components/opencode` genau einmal; keine `tailscale`-Klasse, kein
    `funnel`, kein Ingress mit Klasse `tailscale` für diesen Host.
  - `test_no_prod_touch`: kein Dokument im Diff berührt `prod-*`, `fleet/`,
    `mentolder`, `workspace-korczewski` oder `ks-korczewski`.

## Task 3: Verify + gated live (final)

- [ ] `bash scripts/plan-lint.sh .agents/plans/opencode-devmesh-public/tasks.md`
  → PASS (rot = zurück an Task 1/2, kein Weitergehen).
- [ ] `task test:changed` → grün (P2-Test läuft und ist grün).
- [ ] `task workspace:validate` → grün (kustomize dry-run inkl. Komponente).
- [ ] `task freshness:regenerate && task freshness:check` → grün
  (generated_artifacts=true).
- [ ] Live (NUR nach Freigabe): `dig @ns1.ipv64.net ${OPENCODE_PUBLIC_HOST}
  +short` zeigt WAN-IP; `task devmesh:deploy PROFILE=core`; Pocket ID
  Admin-Check `https://${OPENCODE_PUBLIC_HOST}/oauth2/callback` erreichbar
  (302 → `auth.${PROD_DOMAIN}`); Handy ohne Tailscale lädt Login, nach SSO das
  opencode-Web-UI.
