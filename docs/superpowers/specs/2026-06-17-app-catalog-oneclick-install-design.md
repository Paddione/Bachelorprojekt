---
title: "Deklarativer App-Katalog mit One-Click-Install"
date: 2026-06-17
status: draft
ticket_id: T000929
plan_ref: null
domains: [infra, website, factory]
---

# Deklarativer App-Katalog mit One-Click-Install

## Problem

Jeder Dienst der Plattform ist heute eine **fest verdrahtete Kustomize-Datei** unter `k3d/`
(Traefik, Keycloak, Nextcloud, Collabora, Vaultwarden, Brett, Docs, …). Eine neue App
aufzunehmen heißt: Manifest von Hand schreiben, Hostname in `k3d/configmap-domains.yaml`
ergänzen, OIDC-Client im Keycloak-Realm anlegen, Secret-Vars in `environments/schema.yaml`
+ jeden `envsubst`-Aufruf nachziehen, und in beiden Brand-Overlays referenzieren. Es gibt
**keinen Katalog, keinen App-Lebenszyklus (install/uninstall/upgrade) und keine Self-Service-
Sicht**. Die Peer-Plattformen (Umbrel 11.4k★ mit 300+ Apps, YunoHost 2.9k★, Sandstorm 7.0k★)
lösen genau das über ein deklaratives App-Manifest + Installer + Katalog-UI.

## Ziel

- **App-Manifest-Format** (`apps/<name>/app.yaml`), das eine App vollständig deklariert:
  Kustomize-Quelle, benötigte Domains, OIDC-Bedarf, Secret-Stubs, Abhängigkeiten, Ressourcen.
- **Installer-Task** (`task app:install -- <name> ENV=<brand>`), der das Manifest validiert,
  die Registry-Einträge (Domain, Schema-Var, OIDC-Client) **idempotent** ergänzt und das
  Overlay anwendet — über das bestehende push-basierte Kustomize-Fundament, ohne neuen
  Paketmanager.
- **Katalog-Sicht im Cockpit** (read-only v1): welche Apps verfügbar/installiert sind, pro Brand.

## Nicht-Ziel

- **Beliebige Dritt-Apps aus dem Internet** (Umbrel-App-Store-Modell). v1 ist ein **kuratierter,
  Admin-only Katalog** vorgeprüfter Apps — passend zu DSGVO-by-design und Small-Team-Scope.
- Eigene Sandboxing-/Grain-Isolation (das ist das separate Sandstorm-Muster, eigenes Ticket).
- Container-Image-Build (Apps bringen ihr Image mit; der Katalog deployt, baut nicht).
- Uninstall/Upgrade-Automatik in v1 (nur install + Status; Lifecycle-Rest in v2).

## Lösung

### Komponente 1 — App-Manifest (`apps/<name>/app.yaml`)

Deklaratives Schema, das die heute über mehrere Dateien verstreuten Fakten an **einem Ort**
bündelt:

```yaml
name: whiteboard
title: "Whiteboard"
description: "Kollaboratives Whiteboard für Teams"
kustomize: k3d/whiteboard          # bestehende Manifest-Quelle (Wiederverwendung!)
domains:                            # → werden in configmap-domains.yaml gemerged
  - key: WHITEBOARD_HOST
    host: "board.${PROD_DOMAIN}"
oidc:                               # optional → Keycloak-Client + Redirect
  client_id: whiteboard
  redirect_uris: ["https://board.${PROD_DOMAIN}/oidc/callback"]
secrets:                            # → environments/schema.yaml + SealedSecret-Stub
  - WHITEBOARD_DB_PASSWORD
requires: [shared-db]               # Abhängigkeiten (andere Katalog-Apps/Basisdienste)
resources: { cpu: "250m", memory: "256Mi" }
```

Ein JSON-Schema (`apps/_schema.json`) validiert jedes Manifest fail-closed.

### Komponente 2 — Installer (`scripts/app-install.sh`, exponiert als `task app:install`)

Idempotenter Ablauf, der die bestehenden Registry-Konventionen **respektiert** statt sie zu
umgehen (siehe CLAUDE.md »Scripts & env«):

1. Manifest gegen `apps/_schema.json` validieren.
2. `requires` prüfen (referenzierte Apps/Basisdienste vorhanden).
3. Domains in `k3d/configmap-domains.yaml` mergen (vorhandene Keys bleiben unangetastet).
4. Secret-Vars in `environments/schema.yaml` registrieren + Stub in `.secrets/<env>.yaml`
   anlegen (→ `task env:seal` durch den User; der Installer sealt nicht selbst).
5. OIDC-Client in den Brand-Realm-JSONs ergänzen (idempotent, kein Dupe).
6. `kubectl apply -k <kustomize>` über den aufgelösten Brand-Kontext (`env-resolve.sh`).
7. App in eine Registry-Datei `apps/installed-<env>.json` schreiben (Quelle für die UI).

Der Installer ist **fail-closed** und `--dry-run`-fähig (zeigt Diff der Registry-Mutationen).

### Komponente 3 — Katalog-UI (Cockpit, read-only v1)

Eine `/admin/app-catalog`-Seite (Astro/Svelte, admin-geschützt analog `/admin/planungsbuero`),
die `apps/*/app.yaml` + `apps/installed-<env>.json` liest und Verfügbar/Installiert je Brand
rendert. Install-Trigger v1 zeigt nur den auszuführenden Task-Befehl (kein direktes Cluster-
Schreiben aus dem Browser — Sicherheits-Default). Direkter Install-Button = v2.

## Offene Entscheidungen (autonom gewählt, hier dokumentiert)

| # | Entscheidung | Gewählt | Alternative |
|---|---|---|---|
| 1 | Reichweite | **Kuratiert, Admin-only** | Beliebige Dritt-Apps (verworfen: DSGVO/Scope) |
| 2 | Packaging | **Bestehendes Kustomize wrappen** | Eigenes Paketformat (verworfen: Doppel-SSOT) |
| 3 | Migration | **Neue Apps zuerst; Bestand schrittweise nach `apps/` migrieren** | Big-Bang-Migration aller k3d/-Dienste (verworfen: Risiko) |
| 4 | Install aus UI | **v1 zeigt Befehl, v2 Cluster-Schreiben** | Sofort Browser→Cluster (verworfen: Sicherheit) |

## Erfolgskriterien

- Ein neuer Dienst kann allein über `apps/<name>/app.yaml` + `task app:install` deployt werden,
  ohne dass eine Registry-Datei manuell editiert wird.
- Mindestens **ein bestehender Dienst** (z. B. Whiteboard) ist als Katalog-App migriert und
  über den Installer reproduzierbar in beide Brands deploybar.
- `app:install --dry-run` zeigt alle Registry-Mutationen vor dem Apply.
- Katalog-UI listet verfügbare + installierte Apps korrekt je Brand.
- Schema-Validierung + Installer als BATS-Tests (offline), in `task test:all` verdrahtet.

## Verwandte Tickets

- T000930 (Eval-Harness) / T000931 (ACI) — Factory-Qualität; orthogonal, aber teilen das
  Cockpit als Sichtfläche.
