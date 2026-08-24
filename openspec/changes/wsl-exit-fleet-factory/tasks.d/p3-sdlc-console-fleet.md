# P3 — sdlc-console fleet-nativ

```yaml
title: "P3 sdlc-console-fleet"
ticket_id: T016422
domains: [infra]
status: active
target_files:
  - k3d/dev-stack/sdlc-console.yaml
```

Ziel: sdlc-console läuft im Fleet (namespace workspace-dev) ohne WSL-Abhängigkeit.
Quelle: `k3d/sdlc-stack/sdlc-console.yaml` wird adaptiert — NICHT inkludiert, sondern
als neue Datei nach dev-stack geholt (Design D4).

## Entfernte WSL-Abhängigkeiten

1. `LLM_PROXY_URL: http://llm-proxy-host.workspace.svc.cluster.local:18235` — der
   manuelle Endpoints-Eintrag auf die k3d-Bridge-IP (172.23.0.1) existiert im Fleet
   nicht und ist mit dem llm-proxy-Retire ohnehin hinfällig.
2. `LLM_PROXY_ADMIN_TOKEN` aus workspace-secrets entfällt entsprechend.

## Tasks

- [ ] **T3.0** Vorab verifizieren, welche Env-Vars der Console-Code PFLICHT ist:
      `grep -rn 'LLM_PROXY' components/website/src/ | head`. Fehlt nur der Proxy,
      genügen Streichung + neuer Chat-Endpoint; braucht der Code LLM_PROXY_URL
      zwingend, stattdessen auf den FreeToken-Basis-URL umbauen und Kommentar dazu.

- [ ] **T3.1** Neue Datei `k3d/dev-stack/sdlc-console.yaml` auf Basis der
      sdlc-stack-Version mit diesen Deltas:
      - ConfigMap `CLUSTER_ENV: "sdlc-fleet"`.
      - `SESSIONS_DATABASE_URL` → `postgresql://website:$(WEBSITE_DB_PASSWORD)@shared-db.workspace.svc.cluster.local:5432/website`
        (Tickets-DB of Record liegt im Fleet-workspace — Explore-Fund; Passwort via
        secretKeyRef wie im Original-Muster, kein Inline-Passwort).
      - OIDC-Callback-Vars weiterhin über `${SDLC_CONSOLE_*}` envsubst führen
        (Taskfile.sdlc.yml-Muster bleibt Quelle der Werte; Kommentar aus dem Original
        zur RP-ID/WebAuthn-Begründung übernehmen).
      - Deployment/Service/Probes unverändert vom Original übernehmen (Port 4321!).
      - RBAC: `sdlc-console-rbac.yaml` existiert im sdlc-stack — prüfen ob der
        ServiceAccount für Fleet-Zwecke (flux-Aktionen 503-Pfad) genügt und die
        nötigen Regeln in diese Datei oder als zweite Resource hier übernehmen.

- [ ] **T3.2** Kommentarblock am Dateikopf: Warum keine llm-proxy-host-Endpoints
      mehr (Verweis design.md D4 + ADR-007).

## Verify

```bash
grep -c 'llm-proxy-host' k3d/dev-stack/sdlc-console.yaml   # expect: 0
kustomize build k3d/dev-stack > /dev/null && echo BUILD-OK
task workspace:validate
```

Hinweis: `${SDLC_CONSOLE_*}`-Platzhalter lösen erst beim Deploy mit Env auf;
`task workspace:validate` muss mit diesem Mechanismus umgehen können (wie bei
brett-dev `${DEV_BRETT_HOST}` bereits üblich).
