---
name: infra-ops
description: 'Explicit-invoke-only infrastructure runbook — DO NOT auto-trigger. Use when the user explicitly asks for: cluster setup or reset, workspace deploy (task workspace:setup/deploy/post-setup), host node networking (Hetzner, WireGuard wg-fleet, UFW), Pocket ID / SSO / OIDC client seeding, LLM pipeline and GPU host (task llm:*), secret and SealedSecret rotation (task env:seal, env:fetch-cert), or database migrations and backup/restore (task recovery:*). Seven former single-purpose skills are consolidated here; the ordering guards in this body are the reason it exists.'
agent: bachelorprojekt-infra
---

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

# infra-ops — Unified Infrastructure Runbook

Sieben frühere Einzel-Skills sind hier konsolidiert. Nur bei explizitem Bedarf aufrufen — kein
Auto-Trigger.

**Aufbau:** Dieser Body enthält das Routing und **jede verbindliche Invariante** — Reihenfolgen,
Verbote, Zwei-Instanzen-Regeln. Die ausformulierten Befehlsfolgen und Troubleshooting-Tabellen
liegen in zwei Referenzdateien und werden erst gelesen, wenn die Sektion tatsächlich dran ist:

| Datei | Inhalt |
|---|---|
| [`references/runbooks-deploy.md`](references/runbooks-deploy.md) | §1 Cluster Deployment (Phase 0/1/2/5 + Troubleshooting), §2 Workspace Deploy (Phase 1–6, Service Inventory), §3 Host Node Networking (Architektur, UFW-Portliste, Troubleshooting) |
| [`references/runbooks-operations.md`](references/runbooks-operations.md) | §4 Pocket ID (State-Tabelle, Phase 1–5, Troubleshooting), §5 LLM Ops (Host-Matrix, Phase 1–6), §6 Secret Rotation (Typ A–E, Cross-Brand-Checkliste), §7 Database Ops (Migration, Backup-Audit, Browsable Recovery) |

## Schnell-Routing

| Ziel | Abschnitt | Details |
|------|-----------|---------|
| Neuen Cluster aufsetzen / Environment deployen | [§1](#1--cluster-deployment) | `runbooks-deploy.md` |
| Workspace-Platform deployen (alle Services) | [§2](#2--workspace-deploy) | `runbooks-deploy.md` |
| Host-Netzwerk, WireGuard, UFW, OpenClaw | [§3](#3--host-node-networking) | `runbooks-deploy.md` |
| Pocket ID / SSO / OIDC-Clients konfigurieren | [§4](#4--pocket-id-oidc-client-seeding) | `runbooks-operations.md` |
| LLM-Pipeline / GPU-Host / Embeddings | [§5](#5--llm-ops) | `runbooks-operations.md` |
| Secrets rotieren / SealedSecrets | [§6](#6--secret-rotation) | `runbooks-operations.md` |
| DB-Migrationen / Backup / Restore | [§7](#7--database-ops) | `runbooks-operations.md` |

## §1 — Cluster Deployment

Neues Environment aufsetzen, Fresh-Cluster-Bringup, Gap-Analyse, Cross-Brand-Fleet-Operationen.

### ⚠️ Mandatory Ordering for Fresh Clusters

Diese Reihenfolge ist der Grund, warum es diesen Skill gibt. Ein Schritt zu früh, und die
Secrets sind unbrauchbar oder werden von Dev-Platzhaltern überschrieben.

0. **Phase 0: Version Discovery** — vor jedem Install-Schritt.
1. Hetzner-Nodes provisionen (Step 1.0) oder Proxmox (Step 1.0b).
2. **Sealed Secrets controller** muss vor jedem SealedSecret existieren.
3. **Sealing Certificate** (`env:fetch-cert`) — nach Cluster-Reset.
4. **Seal secrets** (`env:seal`) — nach Cert-Fetch.
5. **cert-manager** (`cert:install`) — vor `workspace:deploy`.
6. **DNS API Secret** (`cert:secret`) — in beiden Namespaces vor dem Deploy.
7. **Longhorn** — vor `workspace:deploy`.
8. **CoreDNS scale** — nach Longhorn, vor `workspace:deploy`. ⚠️ k3s re-applies on restart — nach jedem k3s-Upgrade `task coredns:scale` neu ausführen.
9. **Alle Services deployen** — `workspace:deploy` deckt nur die Base-Kustomization; Collabora, CoTURN, Website, Arena brauchen eigene Deploy-Tasks.
10. **Ingress Accessibility Verification** — `task workspace:check-connectivity ENV=<env>`.

Phasen 0, 1, 2 und 5 samt Troubleshooting: [`references/runbooks-deploy.md`](references/runbooks-deploy.md) §1.

## §2 — Workspace Deploy

Detaillierter Sub-Step-Guide für `workspace:setup` und optionale Provisioning-Tasks.

`task workspace:setup ENV=<env>` ist die Klammer und ruft der Reihe nach `workspace:deploy` →
`office:deploy` → `mcp:deploy` → `post-setup` → `talk-setup` → `recording-setup` →
`transcriber-setup`. **Prod-only** danach separat: `workspace:coturn:deploy`, `website:deploy`.

> ⚠️ `task workspace:admin-users-setup` ist **defekt** (T002171): Das Skript nutzt noch
> `KC_*`-Variablen aus der Keycloak-Zeit und kann in dieser Form nicht funktionieren.

Phase 1–6 und das Service-Inventory: [`references/runbooks-deploy.md`](references/runbooks-deploy.md) §2.

## §3 — Host Node Networking

Hetzner-Provisioning, WireGuard-Mesh (`wg-fleet`), UFW-Firewall, OpenClaw.

> **UFW blockiert Flannel, wenn UDP 8472 und 51820 fehlen** — der Cluster meldet dann Nodes als
> Ready, aber Pod-to-Pod-Traffic schlägt fehl. Das ist die häufigste Fehlerursache in dieser
> Sektion.

Netzwerk-Architektur, vollständige Portliste und Troubleshooting:
[`references/runbooks-deploy.md`](references/runbooks-deploy.md) §3.
Provisionierung im Detail: [`references/hetzner-provisioning-network.md`](references/hetzner-provisioning-network.md),
[`references/wsl-openclaw.md`](references/wsl-openclaw.md).

## §4 — Pocket ID OIDC Client Seeding

OIDC-Clients reconcilen — Redirect-URIs, Client-Secrets, SSO-Login-Fehler.

> **Es gibt keine Realm-JSONs und keinen `task keycloak:sync`** (T002169). Die Plattform ist von
> Keycloak auf **Pocket ID** migriert: kein `realm-workspace-*.json` existiert mehr, und kein
> `quay.io/keycloak`-Image wird von einem Manifest referenziert. Wer nach Realm-Dateien sucht oder
> `task keycloak:sync` aufruft, läuft ins Leere.

> **Nie** Clients direkt im Pocket-ID-Admin-UI anlegen oder ändern — der Seed-Job läuft bei
> **jedem** `task workspace:deploy` und überschreibt UI-Änderungen. Änderungen gehören in
> `k3d/pocket-id-client-seed.yaml`.

Der Client-State liegt ausschließlich in der DB (`pocket_id.oidc_clients`), nicht in Git.
State-Tabelle, Phasen und Troubleshooting:
[`references/runbooks-operations.md`](references/runbooks-operations.md) §4.

## §5 — LLM Ops

LLM-Pipeline über alle drei GPU-Host-Kontexte (WSL dev · k3d dev · prod fleet).

> **Kein in-cluster LiteLLM-Router** (seit PR #895). Apps rufen die Gateway-Services direkt:
> `llm-gateway-embed` → TEI bge-m3 (`:8081`); `llm-gateway-lmstudio` → LM Studio (`:1234`).

Host-Matrix, Bootstrap, Deploy, Status, Test, Logs, Model-Management und Troubleshooting:
[`references/runbooks-operations.md`](references/runbooks-operations.md) §5.

## §6 — Secret Rotation

Sichere, geordnete Secret-Rotation auf beiden Brands.

### ⚠️ Critical Ordering

```
sealed-secrets:install → env:fetch-cert → env:generate → env:seal → workspace:deploy
```

**Nie `workspace:deploy` vor `env:seal` ausführen** — das überschreibt Production-Credentials mit
Dev-Platzhaltern.

Die fünf Rotationstypen (A DB-Password-Drift, B neu generieren, C Keypair nach Cluster-Reset,
D Claude-Code-Token, E einzelner Service), die Cross-Brand-Checkliste und die Verifikation:
[`references/runbooks-operations.md`](references/runbooks-operations.md) §6.

## §7 — Database Ops

Schema-Migrationen, Backup/Restore-Audits, Permissions auf beiden Brands.

### ⚠️ Zwei unabhängige shared-db Instanzen

`workspace` (mentolder) und `workspace-korczewski` (korczewski) sind getrennte Instanzen —
Migrationen und Backup-Audits **immer auf beiden** ausführen. Eine einseitig angewandte Migration
fällt erst auf, wenn der andere Brand bricht.

> **Filen 2FA-Invariante:** 2FA muss auf **beiden** Filen-Accounts deaktiviert bleiben.
> Der `filen-upload`-Sidecar sendet keinen TOTP-Code; bei aktiviertem 2FA entsteht ein
> permanenter Login-Fehler, während die lokalen Dumps weiterhin gelingen.

> **Pod-Auswahl:** Beim Ermitteln des `shared-db`-Pods immer
> `--field-selector status.phase=Running` setzen — sonst greift `head -1` nach einem Rollout
> einen `Completed`-Pod und jeder Schreibzugriff schlägt fehl.

Migration, Backup-Audit, Browsable Recovery und Troubleshooting:
[`references/runbooks-operations.md`](references/runbooks-operations.md) §7.

## Post-Execution: Mishap Report

Nach Abschluss aller Schritte `mishap-tracker` mit dem akkumulierten `MISHAP_LOG` aufrufen.

## Aufgegangene Einzel-Skills

Diese sieben Skills wurden in `infra-ops` konsolidiert; ihre Verzeichnisse unter
`.claude/skills/` existieren **nicht mehr**. Die Provisioning-Referenzen leben unter
[`references/`](references/) neben diesem Skill weiter.

| Ehemals | Jetzt |
|---|---|
| `cluster-deployment` | §1 |
| `workspace-deploy` | §2 |
| `host-node-networking` | §3 |
| `keycloak-realm-sync` | §4 (auf Pocket ID migriert, kein Realm-Sync mehr) |
| `llm-ops` | §5 |
| `secret-rotation` | §6 |
| `database-ops` | §7 |

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
