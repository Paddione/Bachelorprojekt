---
title: "mcp-registry-ssot — Design"
ticket_id: "T002300"
plan_ref: openspec/changes/mcp-registry-ssot/tasks.md
domains:
  - "mcp"
  - "agent-config"
status: active
date: 2026-07-27
---

# mcp-registry-ssot — Design

Kind K1 von Epic **T002299**. Dekompositions-Spec:
`docs/superpowers/specs/2026-07-27-agent-resources-rework-design.md`.

## Ist-Zustand (erhoben 2026-07-27)

### Schicht 1 — Client-Registrierung

| Server | `.mcp.json` | agy | opencode |
|---|---|---|---|
| `mcp-kubernetes` | `http` :18080 | `serverUrl` :18080 | `remote` :18080 |
| `mcp-postgres` | `http` :13001 | `serverUrl` :13001 | `remote` :13001 |
| `factory-mcp` | `http` :13003 | `serverUrl` :13003 | `remote` :13003 |
| `ticket-mcp` | stdio, abs. Pfad | stdio, abs. Pfad | `local`, abs. Pfad |
| `mcp-task-runner` | stdio | stdio | `local` |
| `codebase-memory-mcp` | stdio, abs. Pfad | stdio, abs. Pfad | `local`, abs. Pfad |
| `task-master-ai` | `npx -y` | `~/.npm-global/bin/…` | **`enabled: false`** |
| `github-mcp`, `playwright`, `docfork`, `sequential-thinking`, `webresearch` | — | — | deaktiviert, mit Begründung |

### Schicht 2 — In-Cluster-Monolith

`k3d/default/claude-code-mcp-monolith-{deploy,svc}.yaml`, ns `default`, fleet. Service 56 Tage
alt, Pod 18 Tage alt, **5/5 Running**, 55 Restarts.

| Container | Image | Port | Zustand |
|---|---|---|---|
| `kubernetes` | `quay.io/containers/kubernetes_mcp_server@sha256:…` | 8080 → 18080 | live |
| `postgres` | `node:20-alpine` + supergateway | 3001 → 13001 | live |
| `keycloak` | `quay.io/sshaaf/keycloak-mcp-server@sha256:…` | 8081 | **defekt — T002311** |
| `playwright` | `mcr.microsoft.com/playwright:v1.50.1-jammy` | 3000 | live |
| `github` | `node:20-alpine` + supergateway | 3002 | live |

Brücke: `scripts/mcp-gateway/mcp-gateway.service` (systemd user unit) und
`Taskfile.agents.yml` `mcp-gateway:start`, beide
`kubectl port-forward svc/claude-code-mcp-monolith 18080:8080 13000:3000 13001:3001 13002:3002`.

## Entscheidungen

### E1 — Zwei Schichten, aber nur eine wird generiert

`clients:` ist Konfiguration mit einer maschinellen Zielform → generiert. `cluster:` ist eine
Beschreibung des Laufzeit-Substrats → nur dokumentiert. Die `cluster`-Schicht auch generieren zu
wollen hieße, Kustomize-Manifeste aus YAML zu rendern — das macht bereits Kustomize.

Der Wert der `cluster`-Schicht liegt allein darin, den Zusammenhang festzuhalten, dessen Fehlen
T002312 verursacht hat: dass `:18080` kein lokaler Prozess ist.

### E2 — Eigener Reader statt `load.mjs`

`scripts/mcp-sync.sh` parst `mcp.yaml` selbst. Begründung im Proposal. Nebeneffekt: keine
Dateikollision mit T002304 (K5), das `load.mjs`, `validate.mjs` und `emit-maps.mjs` anfasst.
Die ursprünglich angenommene `blocked_by`-Kante K1←K5 ist deshalb auf `relates_to`
zurückgestuft — die beiden Changes können parallel laufen.

**Verworfen:** `mcp.yaml` in `load.mjs`' `FILES` aufnehmen. Das hätte die agent-guide-Emitter
gezwungen, operative Konfiguration (echte Kommandos, Tokens-Referenzen, Ports) in Doku-Flächen
zu tragen, und den Change an K5 gekettet.

### E3 — Die agy-Datei ist conditional, nicht optional

Fail-closed für `.mcp.json` und `.opencode/opencode.jsonc`. Für
`~/.gemini/config/mcp_config.json`: prüfen wenn vorhanden, sonst überspringen **mit Ausgabe**.

Der Unterschied zu „optional" ist wichtig: ein stilles Überspringen würde auf dem
Entwicklungsrechner, wo die Datei existiert, echte Drift verdecken, sobald jemand `check` in
einer Umgebung ohne sie laufen lässt und den grünen Exit als Beweis nimmt.

### E4 — Drift-Gate in `tests/spec/mcp-gateway.bats`

Kein neues Testfile. Die Datei existiert, gehört zum passenden SSOT-Spec und prüft heute schon
`.mcp.json`-Inhalte. Die Repo-Regel lautet „bestehende Tests erweitern statt neue Dateien
anlegen". Damit entfällt auch jede `ci.yml`-Änderung.

### E5 — Server-Defekte nur abbilden, nicht fixen

T002311 (`keycloak`-Sidecar) und T002312 (falscher SSOT-Spec) werden in der `cluster`-Schicht
als bekannter Zustand vermerkt und verlinkt. Ein Generator-Change, der nebenbei ein
Prod-Deployment umbaut, ist nicht mehr reviewbar als das, was er vorgibt zu sein.

## Risiken

| Risiko | Abfederung |
|---|---|
| Der Renderer zerstört handgeschriebene Kommentare in `opencode.jsonc` | Nur der `mcp`-Block wird ersetzt, der Rest der Datei bleibt byteweise erhalten; p3 verifiziert das mit einem Diff, der ausschließlich den `mcp`-Block zeigt |
| `opencode.jsonc` ist JSONC — ein naiver `jq`-Roundtrip verliert alle Kommentare | Blockweises Ersetzen per Textmarker statt JSON-Roundtrip; die Begründungskommentare an den deaktivierten Servern sind inhaltlich wertvoll |
| Der Generator schreibt nach `$HOME` | Nur `~/.gemini/config/mcp_config.json`, nur bei `render`, nie bei `check`. Pfad über `${HOME}` auflösen, nicht hartcodieren |
| S4-Orphan-Violation für das neue Skript | `scripts/mcp-sync.sh` wird in `Taskfile.yml` als `mcp:sync` / `mcp:check` eingehängt — Pflicht, nicht Kür |
| Registry und Realität driften beim ersten Commit auseinander | p1 leitet die Registry **aus** den drei Ist-Dateien ab, p3 rendert zurück und erwartet einen leeren Diff. Ein nicht-leerer Diff ist ein Befund, kein Fehler — er benennt genau die Divergenz, die dieser Change beseitigt |
