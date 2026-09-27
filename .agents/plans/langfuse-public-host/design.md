# langfuse-public-host — Design (T900691)

## Symptom und Ursache

Symptom: `https://langfuse.devmesh.mentolder.de` liefert von der Workstation ein selbstsigniertes
Zertifikat und 404. Alle vier Agent-Harnesses senden dorthin, Langfuse enthält 0 Observations.

Ursache (belegt):
1. `*.devmesh.mentolder.de` löst per Wildcard auf die fleet-IPs auf. fleet hat für diese Hosts kein
   Ingress → Traefik-Default-Cert + 404. Die devmesh-Nodes haben keine öffentliche IP.
2. `devmesh-wildcard-tls` wird nicht ausgestellt (ipv64 401). Ein Wildcard `*.mentolder.de` deckt
   zweistufige Namen wie `langfuse.devmesh.mentolder.de` nicht ab.

```bash
getent hosts mentolder.de; getent hosts langfuse.devmesh.mentolder.de   # identische IPs
kubectl --context fleet -n default run probe --rm -i --restart=Never --image=curlimages/curl:8.10.1 --command -- \
  curl -sk --resolve langfuse.devmesh.mentolder.de:443:100.115.236.87 https://langfuse.devmesh.mentolder.de/api/public/health
# → {"status":"OK","version":"4.46.0"}: fleet-Pods erreichen devmesh-Traefik ueber Tailscale
```

## Entscheidungen (Operator, 2026-09-27)

- D1 Nur Langfuse wird öffentlich. web (SDLC-Console), auth, site, brett, mail bleiben devmesh-intern.
- D2 Hostname `langfuse-dev.<PROD_DOMAIN>` (einstufig, vom vorhandenen fleet-Wildcard
  `workspace-wildcard-tls` abgedeckt). Kein eigenes devmesh-Zertifikat.
- D3 fleet terminiert TLS und leitet per Service ohne Selector + EndpointSlice auf die
  Tailscale-Adressen der drei devmesh-Nodes (gpu-cluster 100.115.236.87, gpu-cluster2
  100.126.111.105, gpu-metal 100.120.125.39), Port 80, weiter. Der Weg ist Tailscale-verschlüsselt.
- D4 devmesh bekommt ein eigenes Ingress `langfuse-public` am Entrypoint `web` für
  `${LANGFUSE_PUBLIC_HOST}` mit denselben Pfaden (otel → langfuse-otel-redact, / → langfuse-web).
  Der Host `langfuse.${DEVMESH_DOMAIN}` fliegt aus `devmesh-core`.
- D5 Neue Env-Var `LANGFUSE_PUBLIC_HOST` (environments/dev.yaml: `langfuse-dev.mentolder.de`,
  schema.yaml). `NEXTAUTH_URL` und `client-env.sh` nutzen sie.

Sicherheit: Langfuse hat `AUTH_DISABLE_SIGNUP=true`, Ingest nur mit Projekt-Keys. fleet hängt die
Middlewares redirect-https, hsts-headers und security-headers an wie `studio-ingress.yaml`.
