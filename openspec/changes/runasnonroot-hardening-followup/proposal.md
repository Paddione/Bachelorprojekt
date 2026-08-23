# Proposal: runasnonroot-hardening-followup

## Why

SA-GR-06 (System-Audit 2026-08-23) fordert `runAsNonRoot` auf allen Deployments.
T014549 deckte das gelockte Lastenheft (sessions-server, llm-gpu, nextcloud,
collabora, rustdesk) ab. Der Repo-weite Scan im Rahmen von T015293 fand **7
weitere Deployments ohne pod-level UND container-level `runAsNonRoot`**, die
bewusst außerhalb dieses Lastenhefts lagen:

- k3d/coturn-stack/janus.yaml :: janus
- k3d/default/claude-code-mcp-monolith-deploy.yaml :: kubernetes, postgres, playwright, github, github-binary (Init)
- k3d/dev-stack/brett-dev.yaml :: brett
- k3d/dev-stack/sish.yaml :: sish
- k3d/dev-stack/website-dev.yaml :: website
- k3d/mentolder-web.yaml :: mentolder-web
- k3d/staging-stack/website-staging.yaml :: website

Befund-Evidenz pro Deployment siehe design.md; Kernaussagen:

- **website-dev / website-staging / brett-dev** — eigene Images mit
  `USER node` (uid 1000, components/website/Dockerfile:120,
  components/brett/Dockerfile:24) bzw. produkt-proven Muster in
  k3d/brett.yaml:24-39 → sauber hardenbar.
- **janus** — Ports >1024 (8188), keine Runtime-Installationen; Image hat
  keine USER-Direktive → hardenbar mit `runAsUser: 1000`, Rollout-Verifikation
  erforderlich (`hostNetwork: true` bleibt unangetastet).
- **claude-code-mcp-monolith** — Container postgres/playwright/github führen
  bei jedem Start `npm install -g` aus und brauchen daher schreibenden Zugang
  zu /usr/local → nur als root lauffähig, solange die Abhängigkeiten nicht ins
  Image gebacken sind. Nur der Container `kubernetes` ist manifest-seitig
  hardenbar.
- **sish** — bindet `--http-address=:80` (Port <1024) als SSH-Server per
  Design als root → dokumentierte Ausnahme.
- **mentolder-web** — nginx:1.27-alpine mit Root-Entrypoint-Design
  (bestehender securityContext trägt CHOWN/SETUID/SETGID-Caps) →
  dokumentierte Ausnahme.

## What

1. **Harden (5 Deployments):** pod-level `runAsNonRoot: true` +
   `seccompProfile: RuntimeDefault`; container-level `runAsNonRoot: true`,
   `runAsUser: 1000`, `allowPrivilegeEscalation: false`. Für brett-dev wird
   zusätzlich `readOnlyRootFilesystem: true` übernommen (identisches Image wie
   das bereits RO-gehardenede Prod-Brett).
2. **Dokumentierte Ausnahmen (5 Container):** monolith/postgres,
   monolith/playwright, monolith/github (+ Init github-binary), sish,
   mentolder-web erhalten einen maschinenlesbaren YAML-Kommentar-Marker
   (`# runAsNonRoot-Ausnahme: …`) mit Begründung — der Guard-Test erzwingt
   die Dokumentation, damit Ausnahmen nicht still regressieren.
3. **Guard-Test** in tests/spec/security.bats (RED-first): assertiert
   `runAsNonRoot` für alle gehardeneden Deployments/Container und den
   Ausnahme-Marker für jeden dokumentierten Fall.
4. **Delta-Spec:** ADD Requirement „Run-as-non-root baseline" im SSOT
   openspec/specs/security.md.

_Ticket: T015293_
