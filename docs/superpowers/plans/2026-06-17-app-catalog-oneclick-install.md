---
title: Plan — T000929: Deklarativer App-Katalog mit One-Click-Install
ticket_id: T000929
domains: [infra, website, factory]
status: active
pr_number: null
file_locks: [Taskfile.yml, website/src/pages/admin/app-catalog.astro, website/src/components/admin/AppCatalog.svelte]
shared_changes: false
batch_id: batch-2026-06-17-planning
parent_feature: null
depends_on_plans: []
---

# Plan — T000929: Deklarativer App-Katalog mit One-Click-Install

**Ticket:** T000929
**Spec:** docs/superpowers/specs/2026-06-17-app-catalog-oneclick-install-design.md
**Branch:** feature/peer-inspired-specs
**Domains:** infra, website, factory

## Ziel

Implementierung eines kuratierten App-Katalogs mit deklarativem Manifestformat (`app.yaml`) und einem CLI-Installer (`task app:install`), um Kustomize-Dienste, Domains und OIDC-Clients idempotent zu registrieren und zu deployen. Dazu gehört auch eine schreibgeschützte Katalog-Sicht im Cockpit.

## Architektur

- **App-Manifest-Format:** `apps/<name>/app.yaml`, validiert über JSON-Schema `apps/_schema.json`.
- **Installer (`scripts/app-install.sh`):** Führt idempotent folgende Schritte aus:
  1. Validiert Manifest gegen das JSON-Schema.
  2. Merged Domains in `k3d/configmap-domains.yaml`.
  3. Registriert Secret-Vars in `environments/schema.yaml` und legt einen verschlüsselten Stub in `.secrets/<env>.yaml` an.
  4. Ergänzt den OIDC-Client in den Realms von Keycloak.
  5. Führt `kubectl apply -k` für die App aus.
  6. Schreibt installierten Status nach `apps/installed-<env>.json`.
- **Katalog-UI (Cockpit):** Astro-Route `/admin/app-catalog` mit der Svelte-Komponente `AppCatalog.svelte`, welche die Manifeste (`apps/*/app.yaml`) liest und den Installationsstatus visualisiert.

## Tech-Stack

Bash, Node.js (`jq`, JSON-Schema-Validierung), Svelte, Astro, Kustomize.

## S1-Zeilenbudget (verbindlich vor Implementierung ermittelt)

| Datei | Ist | Baseline | wirksame Schwelle | Budget | Konsequenz |
|---|---|---|---|---|---|
| `scripts/app-install.sh` | neu | — | 500 (`.sh`) | Ziel < 250 | Einhaltung des limits für neue .sh-Dateien. |
| `website/src/pages/admin/app-catalog.astro` | neu | — | 400 (`.astro`) | Ziel < 100 | Reines Layout, delegiert an Svelte-Komponente. |
| `website/src/components/admin/AppCatalog.svelte` | neu | — | 500 (`.svelte`) | Ziel < 300 | UI für Katalog-Darstellung. |
| `apps/_schema.json` | neu | — | (kein Limit) | n/a | JSON-Schema zur Validierung. |

## S3 / S4 Hinweise

- **S3:** Keine Hardcodierten Hostnamen. Alle Hostnamen werden über das Manifest generiert und verwenden `${PROD_DOMAIN}` bzw. dev-Platzhalter.
- **S4:** `scripts/app-install.sh` wird im `Taskfile.yml` referenziert. `apps/_schema.json` wird zur Validierung verwendet. E2E-Tests werden hinzugefügt, um Orphans zu verhindern.

## Tasks

### Task 1 — App-Schema und Beispiel-Manifest (Whiteboard)
- [ ] `apps/_schema.json` erstellen. Definiert das JSON-Schema für `app.yaml` (Felder: `name`, `title`, `description`, `kustomize`, `domains`, `oidc`, `secrets`, `requires`, `resources`).
- [ ] Ordner `apps/whiteboard/` anlegen und `apps/whiteboard/app.yaml` basierend auf dem bestehenden Whiteboard-Dienst schreiben.
- [ ] BATS-Test oder ein Node-Skript zur Validierung des Schemas hinzufügen.
- **Acceptance:** Schema-Validierung für `apps/whiteboard/app.yaml` läuft erfolgreich durch.

### Task 2 — CLI-Installer (`scripts/app-install.sh`)
- [ ] `scripts/app-install.sh` anlegen. Implementiert:
  - `--dry-run`-Modus zur Simulation aller Änderungen.
  - Validierung des Manifests mittels `apps/_schema.json`.
  - Idempotenten Merge der App-Domains in `k3d/configmap-domains.yaml`.
  - Idempotente Secret-Var-Registrierung in `environments/schema.yaml`.
  - Idempotenten OIDC-Client-Eintrag in Realm-Dateien.
  - `kubectl apply -k <kustomize-path>` über aufgelösten Brand-Kontext.
  - Aktualisierung der `apps/installed-<env>.json` nach erfolgreicher Installation.
- [ ] Registrieren des Installers in `Taskfile.yml` unter `app:install` und `app:validate`.
- **Acceptance:** `task app:install -- whiteboard --dry-run` zeigt alle geplanten Mutationen.

### Task 3 — Astro & Svelte UI im Cockpit
- [ ] Astro-Seite `website/src/pages/admin/app-catalog.astro` anlegen (geschützt analog `/admin/planungsbuero`).
- [ ] Svelte-Komponente `website/src/components/admin/AppCatalog.svelte` anlegen, welche alle Manifeste aus `apps/` scannt, deren Status aus `apps/installed-<env>.json` liest und das Grid anzeigt.
- [ ] Der Install-Button zeigt in v1 eine Anleitung mit dem `task app:install`-Befehl für den Administrator (kein direktes Schreiben aus der UI in v1).
- **Acceptance:** Admin-Bereich `/admin/app-catalog` zeigt das App-Grid und den Installationsstatus der Apps an.

### Task 4 — E2E & Offline-BATS-Tests
- [ ] BATS-Tests für `scripts/app-install.sh` in `tests/local/FA-SF-57-app-catalog.bats` hinzufügen, um Fehlerfälle (ungültiges Manifest, fehlende Abhängigkeiten, dry-run Modifikationen) abzudecken.
- [ ] Playwright E2E-Test `tests/e2e/specs/app-catalog.spec.ts` erstellen, um die UI-Darstellung und Berechtigungsprüfungen abzusichern.
- **Acceptance:** BATS-Tests und Playwright-Tests laufen erfolgreich durch.

### Task 5 — Finale Verifikation (Pflicht-Gate)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- **Acceptance:** Alle Prüfungen grün.

## Verifikation (zusammengefasst)

```bash
task app:validate
task test:changed
task freshness:regenerate
task freshness:check
```
