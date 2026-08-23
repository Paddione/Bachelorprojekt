---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-23
---

# Design: runasnonroot-hardening-followup

_Ticket: T015293 · SA-GR-06 Rest-Scope (7 Deployments)_

## Entscheidungen

| # | Frage | Entscheidung | Begründung |
|---|-------|--------------|------------|
| D1 | Alle 7 Deployments erzwingen oder Teilmenge harden? | **Alle 7 adressieren, davon 5 harden + 5 Container als dokumentierte Ausnahme** | Ticket-Klausel „wo die Images es erlauben; Ausnahmen dokumentieren". Stille Ausnahmen wären der Fehlermodus des Audits — daher Marker-Pflicht. |
| D2 | Hardening-vs-Ausnahme-Kriterium? | **Ausnahme bei (a) Runtime-`npm install -g`, (b) Port<1024-Bind, (c) Root-Entrypoint-Design** | monolith postgres/playwright/github schreiben /usr/local (a); sish bindet :80 (b); mentolder-web nginx-Entrypoint mit CHOWN/SETUID/SETGID-Caps (c). Alles manifest-seitig nicht behebbar. |
| D3 | `runAsUser` pinnen oder nur `runAsNonRoot: true` asserten? | **Pin `runAsUser: 1000`** | Images ohne USER-Direktive (janus, monolith/k8s-Container) starten sonst als uid 0 → kubelet wirft das Pod (CreateContainerConfigError). node/website-Images haben uid 1000 (`node`) ohnehin. |
| D4 | Auch `readOnlyRootFilesystem`? | **Nur brett-dev** | Identisches Image wie Prod-Brett (k3d/brett.yaml, RO-proven). Für website/janus nicht bewiesen und nicht Teil des Ticket-Skopes. |
| D5 | Wie verhindern, dass Ausnahmen still regressieren? | **Maschinenlesbarer Marker `# runAsNonRoot-Ausnahme:` im YAML + Guard-Assertion** | Der Test besteht nur mit Marker; ein neuer Root-Container ohne Marker failt. Das Monolith-Manifest ist ein reiner JSON-Export (keine Kommentare möglich) — dort trägt die Pod-Template-Annotation `runasnonroot-exceptions.t015293/security` den selben Marker-Text, den der Guard equally akzeptiert. |
| D6 | janus-Risiko (hostNetwork, Image-Internals)? | **Harden mit Rollout-Verifikation; Kontingenz: Ausnahme-Marker** | Ports >1024, keine Runtime-Writes erkennbar. Falls Runtime-Writes (/var/run/janus) scheitern, Downgrade auf Marker — Delta-Spec bleibt erfüllt. startupProbe tcp/8188 liefert das Execute-Signal. |
| D7 | Test-Placement | `tests/spec/security.bats` (python3+yaml-Stil wie collabora-Guard) | SSOT-Mapping: Delta hängt an openspec/specs/security.md. |
| D8 | Plan-Form & Verifikation | **Single-Partial** (kein tasks.d/); `task workspace:validate` + Rollout-Smoke im Execute | 8 kleine Dateiänderungen, ehrliches Red-Green in einem Executor. |

## Befund-Evidenz

- components/website/Dockerfile:120 `USER node`; components/brett/Dockerfile:24
  `USER node` → website-dev/staging/brett-dev non-root-fähig.
- k3d/default/claude-code-mcp-monolith-deploy.yaml: Startup-Commands von
  postgres/playwright/github beginnen mit `npm install -g …` (brauchen
  root-owned /usr/local); Init github-binary wget't nach emptyDir.
- k3d/dev-stack/sish.yaml args: `--http-address=:80`.
- components/mentolder-web/Dockerfile: Runtime `nginx:1.27-alpine`, kein
  USER; bestehender securityContext mit NET_BIND_SERVICE/CHOWN/SETUID/SETGID
  = Root-Entrypoint-Design.
- k3d/coturn-stack/janus.yaml: hostNetwork:true, containerPort 8188 (>1024),
  command startet janus direkt, keine Runtime-Installationen.
