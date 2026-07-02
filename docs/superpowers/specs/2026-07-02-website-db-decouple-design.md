---
ticket_id: T001490
plan_ref: openspec/changes/website-db-decouple/tasks.md
status: active
date: 2026-07-02
---

# Design: Website von Postgres entkoppeln (Content-Bundle + Publish-Pipeline)

- Slug: `website-db-decouple`
- Datum: 2026-07-02
- Status: approved (Brainstorming 2026-07-02, alle 4 Abschnitte freigegeben)

## Problem

Die Astro/Svelte-Website (beide Brands) macht bei jedem SSR-Request DB-Reads gegen `shared-db`
mit `.catch(() => config-Default)`-Fallback. Das ist doppelt problematisch:

1. **Trügerische Verfügbarkeit:** `db-pool.ts` hat keine Connection-/Statement-Timeouts — bei
   einem Netzwerk-Blackhole hängt der SSR-Request, statt in den Fallback zu fallen. Zusätzlich
   wirft `GET /api/homepage` (Backend der React-Site) bei DB-Down einen ungefangenen 500.
2. **Zwei Wahrheiten:** Bei DB-Problemen rendert die Seite stillschweigend veraltete
   `config`-Defaults statt der gepflegten Inhalte. Der korczewski-Pod erreicht
   `shared-db.workspace` cross-namespace ohnehin nicht und läuft dauerhaft im Fallback.

Ziel: Public-Seiten beider Brands sind **100 % verfügbar ohne jede Runtime-Abhängigkeit**
(DB, Keycloak, LLM, CalDAV). Admin darf bei Plattform-Ausfall degradieren. React-Site
(`mentolder-web/`, react.mentolder.de) und Astro-Site sind über identische Contracts frei
austauschbar.

## Entscheidungen (Brainstorming)

| Frage | Entscheidung |
|---|---|
| Zuschnitt | Ein OpenSpec-Change, phasiert (kein PRD/Epic) |
| Content-Store | Git-versionierte JSON-Dateien, Build-Zeit-Einbettung |
| Editing | Admin-Panel nach react.mentolder.de-Muster (Block-Schema, Zod, Versionierung) |
| Publish | Bot-PR + Auto-Merge (kein Direct-Push, kein Runtime-Overlay) |
| Widgets (Timeline, CalDAV-Slots) | Client-seitige Islands, fail-soft (Ausblenden bei Fehler) |
| Frontend-Wechsel | Ingress-Umschalter `PRIMARY_FRONTEND: astro\|react` in `environments/<env>.yaml` |
| Content-Scope | ALLE ~13 Content-Domänen (nicht nur Homepage-Blöcke) |
| Verfügbarkeit | Public 100 %; Admin darf bei Keycloak/DB-Ausfall degradieren |
| Verworfen | B: Runtime-Overlay (zwei Wahrheitsquellen); C: Voll-Prerendering (späterer Folge-Change) |

## Architektur

### 1. Content-Modell

- `website/content/<brand>/` (mentolder, korczewski) mit einer JSON-Datei pro Domäne:
  `homepage.json`, `homepage-blocks.json`, `faq.json`, `kontakt.json`, `ueber-mich.json`,
  `leistungen.json`, `services.json`, `stammdaten.json`, `navigation.json`, `footer.json`,
  `referenzen.json`, `seo.json`, `kore-flags.json`.
- Zod-Schemas pro Domäne in neuem Modul `website/src/content-schema/` (mehrere fokussierte
  Dateien, S1-bewusst). Das Homepage-Block-Schema wird aus `mentolder-web/src/blocks/schema.ts`
  als geteilter Contract übernommen — gleiche `SCHEMA_VERSION`-Semantik (fail-closed bei
  Version-Mismatch).
- Build-Zeit-Loader `website/src/lib/content-bundle.ts`: importiert + validiert alle Dateien;
  **Validierungsfehler = Build-Fehler**. Nie kaputter/leerer Content live.
- `website/src/lib/content.ts`: `getEffective*` liest synchron aus dem Bundle. Die
  `.catch(() => null)`-Kaskade und die Content-Reader in `website-db.ts` werden **gelöscht**
  (`website-db.ts` hat S1-Budget −1506 und MUSS netto schrumpfen).
- Seed: `scripts/export-site-content.mjs` exportiert einmalig die heutigen effektiven DB-Werte
  pro Brand in die Content-Dateien (kein Content-Verlust).

### 2. Editing & Publish-Pipeline

- Admin-UIs (Svelte-Editoren + React-Block-Editor) bleiben; die `save.ts`-Endpoints schreiben
  statt in `site_settings`/`homepage_block_documents` über ein neues Modul
  `website/src/lib/content-publish.ts`:
  Zod-validieren → Commit auf Branch `content/<brand>-<domain>-<timestamp>` via GitHub
  Contents-API → PR mit Label `content`, squash + auto-merge.
- Optimistic Concurrency: git-Blob-SHA der Content-Datei ersetzt `baseVersion`; bei Konflikt
  409 (gleiche Semantik wie der heutige React-Editor-Flow).
- Admin-UX: Status-Feedback („PR #… erstellt, live in ~10 min") + localStorage-Draft gegen
  Datenverlust während der Publish-Latenz.
- Credentials: fine-grained GitHub-Token (`contents:write`, idealerweise auf `website/content/**`
  begrenzt) als SealedSecret pro Env.
- Stilllegung nach Migration: `homepage_block_documents`, `homepage_block_versions` und die
  Content-Keys in `site_settings` (Historie übernimmt git).

### 3. Interface-Contracts & Austauschbarkeit

Neue SSOT-Spec `openspec/specs/website-interfaces.md` scoped **alle** Schnittstellen:

- (a) **Content-Contract**: Dateien, Zod-Schemas, `SCHEMA_VERSION`-Regeln.
- (b) **Public-API**: `GET /api/homepage` (liefert Bundle-Dokument, try/catch), `GET /api/timeline`,
  Termin-Slots-Endpoint — alle fail-soft: definierte Fehlerform, Status 200 mit leerem
  Payload statt 500.
- (c) **Admin-API**: Save-Endpoints mit SHA-Concurrency, Auth-Pflicht.
- (d) **Auth-Grenze**: Keycloak/Pocket-ID nur für `/admin` und `/api/admin/**`; Public-Routen
  ohne jede Auth-/DB-Abhängigkeit.
- (e) **Infra**: Namespaces (`website`, `website-korczewski`), Env-Schalter.

Ingress-Umschalter: `PRIMARY_FRONTEND: astro|react` in `environments/<env>.yaml`, ausgewertet
im Website-Overlay — bestimmt, welches Deployment die Apex-Domain bedient. Wechsel =
Ein-Zeilen-Config-Change + Deploy, jederzeit reversibel. Beide Frontends konsumieren identische
Contracts (a)+(b).

### 4. Verfügbarkeit & Error-Handling

- Timeline + CalDAV-Slots: aus dem SSR-Pfad raus, Client-Islands mit Timeout, blenden sich bei
  Fehler aus.
- `db-pool.ts` (bleibt für Admin/Backoffice): `connectionTimeoutMillis: 2000` +
  `statement_timeout` — kein Blackhole-Hang mehr, auch nicht im Admin.
- `GET /api/homepage`: try/catch + Bundle als Quelle.
- Boot-Zeit-Import `initTicketsSchema()` (website-db.ts:35) verlässt den Public-Modulpfad.

## Testing

- BATS `tests/spec/website-interfaces.bats`: Schemas valide, Content-Dateien vollständig pro
  Brand/Domäne.
- Vitest: `content-bundle` (Validierung fail-closed), `content-publish` (409-Konflikt,
  Validierungsfehler, Branch-/PR-Benennung; GitHub-API gemockt).
- Playwright-Smoke: Public-Seiten beider Brands rendern korrekt **mit gestopptem Postgres**
  (k3d: `shared-db` auf 0 skaliert) — der eigentliche Abnahmetest der Entkopplung.

## Phasierung (tasks.md)

1. **P1** Content-Schemas + Export-Skript + Content-Dateien (Seed) + `content-bundle.ts`.
2. **P2** Public-Pfad auf Bundle umstellen; Fallback-Kaskade + DB-Reader löschen; Widgets zu
   Client-Islands; Pool-Timeouts; `/api/homepage` härten.
3. **P3** Publish-Pipeline (`content-publish.ts`) + Admin-Save-Endpoints umbauen + SealedSecret.
4. **P4** React-API-Angleich (Bundle statt DB hinter `/api/homepage`) + `PRIMARY_FRONTEND`-
   Ingress-Schalter + Env-Schema.
5. **P5** DB-Stilllegung, `website-interfaces.md`-Spec, Doku, Verifikation
   (`task test:changed`, `task freshness:regenerate`, `task freshness:check`, Playwright-Smoke).

## Risiken & Grenzen

- Publish-Latenz ~5–10 min (bewusster Trade-off für git-SSOT); localStorage-Draft +
  PR-Status-Feedback mildern.
- GitHub-Erreichbarkeit wird Voraussetzung fürs **Editieren** (nicht fürs Ausliefern) —
  akzeptiert, Admin darf degradieren.
- `website-db.ts` darf nur schrumpfen (S1 −1506); neue Logik ausschließlich in neuen Modulen.
- Keine Brand-Domain-Literale im Code (S3) — Brand-Auflösung über bestehende Config-Mechanik.
