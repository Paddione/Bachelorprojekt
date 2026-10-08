---
title: "massage-tenant — Design"
ticket_id: T901440
domains: [infra, website, auth, database, flux]
status: active
---

# massage-tenant — Design

## Ziel

Die Massagepraxis Vögelsen (Website-Brand `massage`,
`components/website/src/config/brands/massage.ts`) geht unter `korczewski.de` live:
öffentliche Website mit Anfragen, Terminen, Kunden und Rechnungen sowie ein Inhaber-Login
über eine eigene Pocket ID. Der übrige korczewski-Workspace (Nextcloud, Brett, Collabora,
eigene shared-db, Jobs) bleibt eingefroren (T002479).

## Entscheidungen des Operators (2026-10-08)

- Umfang: Website plus Login/SSO; der Workspace-Stack bleibt aus.
- Domain: `korczewski.de` (Website unter `web.korczewski.de`, Pocket ID unter
  `auth.korczewski.de`); passt zur Kontaktadresse `massage@korczewski.de`.
- Login: eigene Pocket ID für korczewski, nicht die mentolder-Instanz.
- Daten: zentrale `shared-db` im Namespace `workspace` (ADR-012), kein Auftauen der
  korczewski-eigenen shared-db.
- Ansatz: gezielt auftauen (Ansatz 1) statt `flux-korczewski` komplett aufzutauen oder den
  Brand umzubenennen.

## Einordnung

- ADR-003 (Accepted): Markentrennung per Namespace. Dieses Feature bleibt darin
  (`website-korczewski`, `workspace-korczewski`).
- ADR-011 (Accepted): Pocket ID ist einziger IdP, Clients per `pocket-id-client-seed`.
- ADR-012 (Accepted): eine shared-db, Markentrennung per Datenbank. Das korczewski-Overlay
  bringt heute eine eigene shared-db mit; dieses Feature folgt dem ADR und nutzt die zentrale.
- Plattform-Epic T901030 mit Isolations-ADR T901034 (beide triage) bleibt der langfristige
  Weg für echte Mandantenfähigkeit. Dieses Feature ist die Zwischenlösung auf ADR-003-Basis
  und greift T901034 nicht vor.
- Die Massage-Fachfunktionen existieren bereits (T901024 Anfragen, T901026 Kunden,
  T901027 Rechnungen, T901028 Homepage). Hier geht es um Betrieb, nicht um Fachlogik.

## Architektur und Topologie

| Baustein | Namespace | Flux-Kustomization | Zustand |
|---|---|---|---|
| Website (`BRAND=BRAND_ID=massage`) | `website-korczewski` | `flux-website-korczewski` | aufgetaut |
| Pocket ID, Client-Seed, Wildcard-Zertifikat | `workspace-korczewski` | neu: `flux-korczewski-auth`, Pfad `prod-fleet/korczewski-auth` | neu |
| Nextcloud, Brett, Collabora, eigene shared-db, Jobs | `workspace-korczewski` | `flux-korczewski`, `flux-jobs-korczewski` | bleiben `suspend: true` |
| DBs `website_massage`, `pocket_id_korczewski` | `workspace` (zentrale shared-db) | bestehende mentolder-Kustomization | neu im self-healing initdb |

Datenfluss: Website und Pocket ID verbinden sich per TLS mit `shared-db.workspace.svc`.
Eine NetworkPolicy in `workspace` erlaubt Port 5432 zusätzlich nur aus `website-korczewski`
und `workspace-korczewski`. Secrets kommen aus der aktiven `flux-sealed-secrets-korczewski`.

## Login und OIDC

- Der Seed-Job legt den Website- und den `owner`-Client an (Callback
  `web.<domain>/api/owner/callback`); das Website-Secret wird auch in `website-secrets` im
  Website-Namespace geschrieben (T001435). Im Overlay läuft der Seed unverändert mit
  `POCKET_ID_FRONTEND_URL=https://auth.korczewski.de`. Clients für eingefrorene Apps entstehen
  ohne Wirkung mit; eine Seed-Verzweigung wäre unnötige Sonderlogik.
- `owner-guard.ts` lässt nur Sessions mit `OWNER_GROUP` (Default `workspace-owners`) in den
  Owner-Bereich. Unverändert.
- Inbetriebnahme einmalig per Runbook: Pocket-ID-Admin-Bootstrap
  (`docs/runbooks/pocket-id-bootstrap.md`), Konto der Inhaberin, Zuordnung zu
  `workspace-owners`. Der Plan legt keine Konten an.
- Ist Pocket ID nicht erreichbar, bleibt die öffentliche Seite samt Anfrageformular nutzbar;
  nur der Owner-Login schlägt fehl (bestehendes Verhalten).

## Datenschicht

- Neue Rollen und Datenbanken `website_massage` und `pocket_id_korczewski` im self-healing
  initdb (`k3d/shared-db.yaml`, beide Init-Pfade).
- Passwörter liegen im mentolder-`workspace-secrets` (die shared-db liest dieses) und
  identisch in den korczewski-Secrets, aus denen Website und Pocket ID lesen.
- Schutz gegen den Ausfall vom 2026-07-27 (leer substituiertes Passwort sperrte Rollen aus):
  `ALTER USER … PASSWORD` für die neuen Rollen nur bei nicht-leerer Variable. Fehlt der Key,
  bleibt nur die neue Rolle unbenutzbar; bestehende DBs sind nicht betroffen.
- `k3d/website.yaml` verdrahtet DB-Name und -User fest auf `website`. Neu: `WEBSITE_DB_NAME`
  und `WEBSITE_DB_USER` (Default `website`) sowie `WEBSITE_DB_NAMESPACE` für den Host
  (Default `WORKSPACE_NAMESPACE`). mentolder rendert unverändert; das korczewski-Overlay
  setzt `workspace` und `website_massage`.
- Pocket ID im Overlay: Host `shared-db.workspace.svc`, DB `pocket_id_korczewski`.
- Schema: `website_massage` durchläuft den bestehenden Migration-Runner von Grund auf. Eine
  neue Migration nimmt `massage` in die Brand-CHECKs der Tabellen auf, die der Massage-Fluss
  beschreibt (mindestens `free_time_windows`, `legal_pages`, `homepage_block_documents`,
  `homepage_block_versions`; die vollständige Liste kommt aus einem Audit der Schreibpfade
  im Plan). Die mentolder-only-CHECKs auf `billing_*` bleiben; Massage-Rechnungen nutzen
  `massage_invoices`.
- Backup: beide DBs laufen im bestehenden täglichen shared-db-Backup mit.

## Domain, TLS und DNS

- Website unter `web.korczewski.de` (Ingress existiert in `prod-fleet/website-korczewski`).
  Die Apex-Domain folgt dem mentolder-Muster; der Plan prüft es und übernimmt es.
- Pocket ID unter `auth.korczewski.de` (Ingress aus der Pocket-ID-Basis).
- Das Wildcard-Zertifikat (`prod/wildcard-certificate.yaml`, `*.korczewski.de` plus Apex,
  letsencrypt-prod) wandert in `korczewski-auth`; `korczewski-tls` wird nach
  `website-korczewski` gespiegelt, mit demselben Mechanismus wie bei mentolder.
- DNS: Der ipv64-Updater bleibt aus. Die A-Records für `korczewski.de`, `web.` und `auth.`
  müssen auf den fleet-Ingress zeigen. Externer, manueller Schritt mit `dig`-Prüfbefehl im
  Runbook.

## Rollout

1. DB-Schicht: shared-db-Rollen, `WEBSITE_DB_*`-Variablen, Brand-Migration. mentolder erhält
   nur Defaults (Render-Diff und Tests belegen Unverändertheit).
2. Overlay `korczewski-auth`: Pocket ID, Client-Seed, Wildcard-Zertifikat, NetworkPolicy,
   Flux-Kustomization `flux-korczewski-auth`. Neue Secrets als SealedSecrets in
   `sealed-secrets/korczewski`; Erzeugen und Versiegeln braucht Cluster-Zugriff und ist ein
   manueller Operator-Schritt (`env:seal`).
3. Website auftauen: `flux-website-korczewski` auf `suspend: false`, Overlay setzt
   `BRAND=BRAND_ID=massage` und `WEBSITE_DB_*`.
4. Inbetriebnahme per Runbook: DNS prüfen, Admin-Bootstrap, Inhaberin-Konto mit
   `workspace-owners`, Smoke-Test (Anfrage stellen und bestätigen, Rechnung erzeugen).

Manuelle Operator-Schritte, die der Agent nicht ausführt: Secrets versiegeln, DNS bei ipv64,
Konten anlegen.

Rückbau: `flux-website-korczewski` wieder `suspend: true`, `flux-korczewski-auth`
suspendieren. Rollen und Datenbanken bleiben erhalten.

Doku: Die Freeze-Aussagen in `AGENTS.md`, `CLAUDE.md`, `docs/runbooks/credentials-finden.md`
und die T002479-Kommentare in den Flux-Dateien werden präzisiert: „korczewski-Workspace
eingefroren; Website (Massagepraxis) und Pocket ID live seit …".

## Tests

Pytest-Module unter `tests/py/spec/massage-tenant/`:

1. Render: `prod-fleet/website-korczewski` liefert `BRAND=massage`, `BRAND_ID=massage`,
   Host `shared-db.workspace.svc`, DB `website_massage`. mentolder bleibt bei
   `website`/`website` und dem bisherigen Host (Paritäts-Anker).
   `prod-fleet/korczewski-auth` enthält Pocket ID, Client-Seed und Wildcard-Zertifikat und
   keine Nextcloud, Brett, Collabora oder shared-db (Positiv-Anker Pocket ID).
2. Flux: `flux-korczewski` und `flux-jobs-korczewski` bleiben `suspend: true`;
   `flux-website-korczewski` und `flux-korczewski-auth` aktiv mit korrektem Pfad.
3. shared-db-Init: neue Rollen/DBs in beiden Init-Pfaden; der Leerpasswort-Schutz wird
   ausgeführt (Skriptblock mit leerer Variable erzeugt kein `ALTER … PASSWORD ''`).
4. Migration: `massage` in genau den auditierten CHECKs, `billing_*` unverändert. Prüfung
   gegen echtes Postgres nur mit erreichbarer Test-DB, sonst skip.
5. NetworkPolicy: 5432 in `workspace` nur zusätzlich aus `website-korczewski` und
   `workspace-korczewski` erreichbar.
6. Nach dem Deploy: bestehende Massage-E2E-Specs (T901306/T901307) über `dev-flow-e2e`
   gegen `web.korczewski.de`, plus Runbook-Smoke-Test.

Abschluss: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.

## Nicht im Umfang

- Mandantenfähige Plattform (T901030/T901034), RLS, Business-Registry.
- Auftauen von Nextcloud, Brett, Collabora oder Jobs für korczewski.
- Eigene Domain für die Praxis, automatisches DNS-Management.
- Online-Zahlungen (laut Business-Brief ausgeschlossen).
