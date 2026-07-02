# Proposal: website-db-decouple

## Why

Die Astro/Svelte-Website liest bei jedem SSR-Request Content aus Postgres (`shared-db`) und
fällt bei Verbindungsfehlern still auf `config`-Defaults zurück. Das ist doppelt kaputt:
(1) `db-pool.ts` hat keine Timeouts — bei Netzwerk-Blackhole hängt der Request, statt in den
Fallback zu fallen; `GET /api/homepage` wirft bei DB-Down ungefangen 500. (2) Bei DB-Problemen
rendert die Seite veraltete Defaults statt der gepflegten Inhalte — der korczewski-Pod erreicht
`shared-db.workspace` cross-namespace ohnehin nie und läuft dauerhaft im Fallback. Die
öffentliche Website soll 100 % verfügbar bleiben, wenn der Rest der Plattform (Postgres,
Keycloak, LLM) ausfällt, und React- und Astro-Frontend sollen über identische Contracts frei
austauschbar sein.

## What

- **Content-Bundle:** Alle ~13 Content-Domänen (Homepage, Homepage-Blöcke, FAQ, Kontakt,
  Über-mich, Leistungen, Services, Stammdaten, Navigation, Footer, Referenzen, SEO, Kore-Flags)
  werden Zod-validierte JSON-Dateien unter `website/content/<brand>/`, zur Build-Zeit via
  `content-bundle.ts` eingebacken (Validierungsfehler = Build-Fehler). Seed via einmaligem
  DB-Export-Skript. `getEffective*` liest synchron aus dem Bundle; Fallback-Kaskade und
  Content-Reader in `website-db.ts` werden gelöscht (S1: Datei muss netto schrumpfen).
- **Publish-Pipeline:** Admin-Save-Endpoints validieren mit Zod und erzeugen Bot-PR
  (GitHub Contents-API, Branch `content/<brand>-<domain>-<ts>`, squash + auto-merge);
  Optimistic Concurrency via git-Blob-SHA (409 bei Konflikt); localStorage-Draft +
  PR-Status-Feedback im Admin. Fine-grained GitHub-Token als SealedSecret.
- **Widgets fail-soft:** Timeline + CalDAV-Slots verlassen den SSR-Pfad → Client-Islands mit
  Timeout, blenden sich bei Fehler aus. `db-pool.ts` (bleibt für Admin/Backoffice) bekommt
  `connectionTimeoutMillis` + `statement_timeout`. `GET /api/homepage` liefert das
  Bundle-Dokument mit try/catch — die React-Site (`mentolder-web/`) läuft unverändert weiter,
  wird aber DB-unabhängig.
- **Contracts + Umschalter:** Neue SSOT-Spec `website-interfaces` (Content-Contract, Public-API
  fail-soft, Admin-API, Auth-Grenze, Infra) — beim Archive via `--create-new` anlegen.
  `PRIMARY_FRONTEND: astro|react` in `environments/<env>.yaml` steuert, welches Deployment die
  Apex-Domain bedient (Ein-Zeilen-Wechsel, reversibel).
- **Stilllegung:** `homepage_block_documents`, `homepage_block_versions` und Content-Keys in
  `site_settings` nach Migration außer Betrieb (Historie übernimmt git).

Design-Spec: `docs/superpowers/specs/2026-07-02-website-db-decouple-design.md`
(Brainstorming 2026-07-02, alle Abschnitte freigegeben; verworfen: Runtime-Overlay,
Voll-Prerendering).

_Ticket: T001490_
