# p1 — devmesh-Seite

Target files: `dev-local/components/langfuse/langfuse.yaml`, `dev-local/components/langfuse/kustomization.yaml`,
`dev-local/components/langfuse/ingress-public.yaml`, `dev-local/core/ingress.yaml`, `environments/dev.yaml`,
`environments/schema.yaml`.

Kontext: `design.md` D4, D5.

### Task 1: Env-Var `LANGFUSE_PUBLIC_HOST`

- `environments/dev.yaml` → `env_vars`: `LANGFUSE_PUBLIC_HOST: langfuse-dev.mentolder.de`, Kommentar
  „öffentlich über fleet-Proxy, T900691“.
- `environments/schema.yaml`: Eintrag direkt nach `DEVMESH_DOMAIN`, gleiches Format
  (`required: false`, `default_dev: ""`, `validate: "^[a-z0-9.-]*$"`, `description`).
- Prüfen, dass `scripts/devmesh/render-stack.sh` die Variable an envsubst durchreicht (bei
  explizitem Variablen-Filter dort ergänzen).

### Task 2: Ingress `langfuse-public`

Neue Datei `dev-local/components/langfuse/ingress-public.yaml`: `networking.k8s.io/v1` Ingress
`langfuse-public`, Annotation `traefik.ingress.kubernetes.io/router.entrypoints: web`, kein
`tls`-Block, Host `"${LANGFUSE_PUBLIC_HOST}"`, Pfade `/api/public/otel` → `langfuse-otel-redact:4318`,
`/` → `langfuse-web:3000`. In `kustomization.yaml` unter `resources` eintragen.

### Task 3: Alten Host entfernen, NEXTAUTH_URL

- `dev-local/core/ingress.yaml`: `langfuse.${DEVMESH_DOMAIN}` aus `tls.hosts` und die zugehörige Regel entfernen.
- `langfuse.yaml`: beide `NEXTAUTH_URL` auf `"https://${LANGFUSE_PUBLIC_HOST}"`.
