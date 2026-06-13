# Platform Control Center: Alle Dienste verknüpfen (Service-Links + vollständige Health-Abdeckung)

**Datum:** 2026-06-12
**Branch:** `feature/pcc-service-links`
**Status:** Entwurf (autonom erstellt, Defaults gemäß Decision-Autonomy-Präferenz)

## Problem

Das Platform Control Center (`/admin/platform`, `website/src/components/admin/PlatformHub.svelte`) inventarisiert bereits 27 Software-Assets in `platform.software_assets`, aber die Assets sind **nicht mit den laufenden Diensten verknüpft**:

1. **Keine Service-Links.** Die Spalte `software_assets.url` existiert im Schema und im CRUD (`platform-db.ts`), wird aber von keiner Seed-Migration befüllt und von `SoftwareTab.svelte` nie als Link gerendert. Ein Admin kann vom PCC aus keinen Dienst öffnen.
2. **Health-Tab probt nur 5 hardcodierte Dienste.** `website/src/pages/api/admin/ops/health.ts` enthält eine statische `SERVICES`-Map (Keycloak, Nextcloud, Collabora, Vaultwarden, Website) pro Brand. Die übrigen ~20 Dienste des Inventars (Brett, Docs, Mailpit, DocuSeal, Whiteboard, LiveKit, Talk-HPB, …) sind unsichtbar für Health-Checks. Jeder neue Dienst erfordert Code-Änderung statt Datenpflege.

## Ziel

`platform.software_assets` wird die **einzige Quelle** für Service-Verknüpfung: Jedes Asset kennt seine öffentliche Subdomain und seine interne Health-Probe-URL. SoftwareTab verlinkt jeden Dienst, der Health-Tab probt alle probebaren Dienste — datengetrieben, brand-aware, ohne Code-Änderung bei neuen Diensten.

## Nicht-Ziele (YAGNI)

- Kein historisches Status-Tracking, keine Zeitreihen, keine Alerts.
- Keine SSO-Token-Weitergabe in Links — die Dienste sind ohnehin Keycloak-geschützt; ein normaler `<a href>` genügt.
- Keine NetworkPolicy-Änderungen (Probes laufen serverseitig über bestehende erlaubte Pfade, identisch zum heutigen `health.ts`).
- Keine Änderung am Hardware-Tab.

## Design

### 1. Schema-Erweiterung (Migration `20260612_add_service_links.sql`)

```sql
ALTER TABLE platform.software_assets
  ADD COLUMN IF NOT EXISTS subdomain  TEXT,   -- z.B. 'auth', 'files'; NULL = kein öffentlicher Endpoint
  ADD COLUMN IF NOT EXISTS health_url TEXT;   -- internes Probe-Template, z.B. 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready'; NULL = nicht probebar
```

Plus Seed-`UPDATE`s pro Slug:

- **`subdomain`** aus `k3d/configmap-domains.yaml` ableiten: keycloak→`auth`, nextcloud→`files`, collabora→`office`, vaultwarden→`vault`, mailpit→`mail`, docs→`docs`, whiteboard→`board`, brett→`brett`, brainstorm→`brainstorm`, livekit→`livekit`, docuseal→`sign` (tatsächlichen Wert aus configmap-domains verifizieren), website→`web`, tracking→`tracking` (verifizieren). Infrastruktur-Assets ohne UI (sealed-secrets, cert-manager, k3s, wireguard, postgresql, traefik→`traefik` falls Dashboard exponiert, tei, whisper, openclaw, livekit-ingress/-egress, talk-transcriber, talk-hpb) → `NULL` bzw. nur setzen, wo configmap-domains einen Host definiert.
- **`health_url`** mit `{ns}`-Platzhalter für alle HTTP-probebaren Dienste. Die 5 bestehenden URLs aus `health.ts` werden 1:1 übernommen; zusätzlich sinnvolle Endpoints für die übrigen Dienste (Brett, Docs, Mailpit, Whiteboard, DocuSeal, Brainstorm, Website, …) — Root-Pfad `/` ist als Default akzeptabel, jeder Statuscode < 500 gilt als ok (bestehende `checkUrl`-Semantik). Nicht-HTTP-Dienste (coturn, wireguard, k3s, sealed-secrets, cert-manager, postgresql) bleiben `NULL`.

Die bestehende `url`-Spalte bleibt als **manueller Override** (Admin-editierbar via CRUD); effektive Link-URL = `url ?? https://<subdomain>.<brand-domain>`.

### 2. Brand-aware URL-Auflösung (Server-seitig)

Neue Helper in `website/src/lib/platform-db.ts` (oder kleinem neuem Modul `platform-links.ts`):

- `resolveServiceUrl(asset, brandDomain)` → `url`-Override oder `https://${subdomain}.${brandDomain}`; `null` wenn beides fehlt.
- `resolveHealthUrl(asset, brand)` → ersetzt `{ns}` im Template: für `korczewski` werden `workspace`→`workspace-korczewski` und `website`→`website-korczewski` gemappt; `workspace-office` bleibt unverändert (Collabora wird geteilt, wie heute in `health.ts`).
- Brand-Domain: dem bestehenden Muster der Codebase folgen (z.B. wie `email.ts` öffentliche URLs baut — exakte Env-Var bei der Implementierung verifizieren, vermutlich `PROD_DOMAIN`/`PUBLIC_SITE_URL`; in dev fällt es auf `localhost`-Hosts aus `configmap-domains` zurück).

Die Auflösung passiert **serverseitig** im API-Response (`/api/admin/platform/software` liefert `serviceUrl` als berechnetes Feld mit) — der Client kennt keine Domain-Logik.

### 3. Health-Tab datengetrieben

`health.ts` wird umgebaut:

- Statische `SERVICES`-Map **entfernen**.
- Stattdessen: `listSoftwareAssets()` laden, auf `health_url IS NOT NULL` und `clusters @> current brand` filtern, `{ns}` auflösen, mit der bestehenden `checkUrl()`-Logik parallel proben (Timeout 5 s, slow > 2 s — unverändert).
- Assets mit `base_status = 'optional'` (whisper, tei, livekit-egress): Fehlschlag wird als Status `optional` (neutral) gemeldet, nicht als `error` — konsistent mit der Software-Tab-Semantik.
- Response-Shape bleibt kompatibel (`{ results: { [brand]: ServiceCheck[] }, checkedAt }`), ergänzt um `slug` und `optional`-Flag pro Eintrag.
- `HealthTab.svelte`: rendert die (jetzt längere) Liste gruppiert nach Kategorie; `optional`-Status bekommt ein graues Badge.

### 4. SoftwareTab: Service-Links

- Jede Asset-Card mit auflösbarer `serviceUrl` bekommt einen **„Öffnen ↗"**-Link (`target="_blank"`, `rel="noopener"`).
- Das Edit-Formular (bestehendes CRUD) bekommt die zwei neuen Felder `subdomain` und `health_url`; `upsertSoftwareAsset()` und die GET/POST-Routen reichen sie durch.
- Quersprung **„Logs"** pro Asset mit `deployment_name`: wechselt auf den Logs-Tab mit vorausgewähltem Deployment — nur umsetzen, falls `PlatformHub.svelte` Tab-Wechsel mit Parameter trivial erlaubt (P2, bei Reibung weglassen).

### 5. Fehlerverhalten

- DB nicht erreichbar → Health-Endpoint antwortet 503 mit Fehlertext (kein leeres „alles ok").
- Asset ohne `health_url` erscheint im Health-Tab gar nicht (nicht als error).
- Probe-Fehler einzelner Dienste blockieren die anderen nicht (`Promise.all` über try/catch pro Dienst, wie heute).

## Tests

- **Unit (Vitest):** `resolveServiceUrl` / `resolveHealthUrl` — Override-Vorrang, NULL-Fälle, korczewski-Namespace-Mapping, `workspace-office`-Ausnahme.
- **Unit (Vitest):** `health.ts`-Filterlogik (nur probebare Assets des aktuellen Brands; optional-Semantik) — mit gemockter Asset-Liste.
- **Migrations-Smoke:** Migration läuft idempotent (zweifacher Lauf), Seed-UPDATEs treffen erwartete Slugs.
- **E2E (Playwright, Projekt gemäß Zuordnungstabelle in `dev-flow-gotchas.md` — Admin-/Website-Projekt):** `/admin/platform` → Software-Tab zeigt „Öffnen"-Link für `keycloak` mit `https://auth.…`; Health-Tab listet > 5 Dienste.
- Test-Inventar regenerieren (`task test:inventory`) und mit committen (CI-Gate).

## Risiken & offene Verifikationspunkte (für den Plan)

1. Exakte Env-Var für die Brand-Domain in der Website-Runtime (Muster aus `email.ts` übernehmen).
2. Tatsächliche Subdomains aus `k3d/configmap-domains.yaml` übernehmen, nicht raten (docuseal/tracking/talk-hpb).
3. Verhalten in dev (k3d, `*.localhost`) — Links dürfen in dev auf `http://<sub>.localhost` zeigen.
4. Korczewski: `BRAND`/`BRAND_ID`-Lesart wie in `health.ts`/`index.astro` (`process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'`).
5. Migrations-Anwendung auf **beide** Brands (separate shared-db pro Brand-Namespace) — Deploy-Hinweis im Plan.
