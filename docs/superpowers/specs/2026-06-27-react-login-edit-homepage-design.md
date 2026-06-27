---
title: react.mentolder.de — Login (Astro-Auth-Reuse) + Edit-Homepage Block-Editor
date: 2026-06-27
slug: react-login-edit-homepage
status: design
domains: [website, mentolder-web, infra, security]
ticket_id: T001160
plan_ref: openspec/changes/react-login-edit-homepage/tasks.md
---

# react.mentolder.de — Login + „Edit Homepage" (Block-Editor)

## Why

`react.mentolder.de` (`mentolder-web/`, Vite/React-19-SPA) ist heute eine rein statische
Marketing-Site: kein Login, kein Admin-Menü, kein Content-Management. Die Homepage rendert aus
einem hartkodierten TS-Seed (`mentolder-web/src/blocks/seed.ts`) über `BlockRenderer`.

Ziel: Auf `react.mentolder.de` soll man sich **genauso wie auf `web.mentolder.de`** einloggen
können, und neben Admin-Menü/User-Profil soll ein **„Edit Homepage"-Eintrag** zu einem echten
Content-Management für die React-Homepage führen. Der Editor setzt auf dem bestehenden
typisierten Block-System auf; die Homepage rendert danach aus einem **gespeicherten, versionierten
Block-Dokument** statt aus dem Seed (Seed bleibt Fallback).

## Decisions (mit User geklärt)

1. **Login**: bestehende Astro-Website-Auth wiederverwenden (Pocket-ID-OIDC). **Kein** neues
   React-Backend.
2. **Edit Homepage**: echten **React-Block-Editor** bauen (kein Link zum Astro-Admin).
3. **Editor-Umfang v1**: **Inhalts-Editor (Felder)** — schema-getriebene Formulare pro Block,
   Live-Vorschau, versioniertes Speichern. **Kein** Hinzufügen/Löschen/Umsortieren von Blöcken.

## Key Insight — kein Cookie-Widening nötig

`react.mentolder.de` und `web.mentolder.de` sind **same-site** (gleiche registrierbare Domain
`mentolder.de`), nur **cross-origin**. Der bestehende host-only Session-Cookie
`workspace_session` (`Path=/; HttpOnly; SameSite=Lax`, gesetzt von `website/src/lib/auth.ts:265`)
wird bei einem **same-site** `fetch` von React → Website **mitgesendet**. Daraus folgt:

- **Keine** Cookie-Domain-Erweiterung auf `.mentolder.de` (die den Session-Token an alle
  `*.mentolder.de`-Dienste wie nextcloud/vaultwarden ausliefern würde — bewusst vermieden).
- **Keine** Änderung der Pocket-ID-`redirect_uri` (Callback landet weiter auf `web.…/api/auth/callback`).
- **Keine** Ingress-Pfad-Proxy-Regel.

Nötig sind nur: **CORS** auf den Website-Endpoints für die React-Origin (credentialed, echte Origin
statt `*`) und eine **returnTo-Allowlist** im Callback, die eine Weiterleitung zurück auf
`react.mentolder.de` erlaubt.

## Login-Flow (end-to-end, ohne Cookie-Änderung)

1. React (Admin klickt „Login") → Top-Level-Navigation zu
   `https://web.mentolder.de/api/auth/login?returnTo=https://react.mentolder.de/admin/homepage`.
2. `login.ts` → `getLoginUrl(state=returnTo)` → Pocket-ID-`authorize`, `redirect_uri=web…/api/auth/callback`.
3. Nutzer authentifiziert sich → Redirect zu `web…/api/auth/callback?code=…&state=https://react.mentolder.de/admin/homepage`.
4. `callback.ts` (auf web): `exchangeCode` → Session anlegen → `Set-Cookie workspace_session`
   (host-only `web.mentolder.de`, `SameSite=Lax`) → **302 auf `state`** (NEU: absolute React-URL
   per Allowlist erlaubt).
5. Browser landet auf `react.mentolder.de/admin/homepage`. React ruft
   `GET https://web.mentolder.de/api/auth/me` mit `credentials:'include'`. Cookie wird gesendet
   (Ziel `web.mentolder.de`, same-site → Lax erlaubt). CORS erlaubt React-Origin + Credentials.
6. Editor lädt; `Save` ruft `POST web…/api/admin/homepage/save` (Cookie + CORS) → versionierter Write.

## Architecture & Components

### A. Website (Server) — `website/`

- **CORS-Helper** `website/src/lib/cors.ts` (neu): für allowlisted Origin (`REACT_APP_ORIGIN`,
  Komma-separierbar) setzt `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Credentials: true`,
  `Vary: Origin`; eigene `OPTIONS`-Preflight-Antwort (`Allow-Methods`, `Allow-Headers: content-type`).
  **Fail-closed**: unbekannte Origin → keine CORS-Header. Angewandt auf `/api/auth/me`,
  `/api/homepage`, `/api/admin/homepage/*`.
- **`callback.ts` returnTo-Allowlist**: bestehende relative-Pfad-Logik bleibt; zusätzlich wird eine
  **absolute URL akzeptiert, deren Origin in der Allowlist** (`SITE_URL`-Origin + `REACT_APP_ORIGIN`)
  liegt. Alles andere → Fallback `/admin`/`/portal` (Open-Redirect-Guard, unit-getestet).
- **Block-Dokument-API** (neu), Brand-scoped (`mentolder`), das vorhandene
  `content_versions`-Pattern wiederverwendend (`writeContent`/`listVersions`/`ContentConflictError`
  aus `website/src/lib/website-db.ts`), via neuem Content-Ref/`contentKey` `homepage-blocks`:
  - `GET /api/homepage` — **public**: liefert `{schemaVersion, blocks}` oder `204`/leer.
  - `POST /api/admin/homepage/save` — **admin** (`getSession`+`isAdmin`): `{baseVersion, payload}`,
    **server-seitige zod-Validierung**, versioniert; `200 {version}` / `409 {currentVersion,currentValue}` / `422 {errors}`.
  - `GET /api/admin/homepage/versions` + `POST /api/admin/homepage/restore` — admin, spiegeln das Content-Versioning.
- **Server-seitiges Block-Schema** `website/src/lib/homepage-blocks-schema.ts` (neu): Kopie der
  zod-Schemas aus `mentolder-web/src/blocks/schema.ts`, plus **Paritäts-Test**, der sicherstellt,
  dass beide Schemas dieselben Block-Typen/Felder akzeptieren. (Shared-Package bewusst NICHT — YAGNI
  bei einem Consumer-Paar; Trade-off dokumentiert.)

### B. React-App — `mentolder-web/`

- **Auth-Context** `mentolder-web/src/auth/useAuth.tsx` (neu): `GET ${VITE_WEBSITE_ORIGIN}/api/auth/me`
  (`credentials:'include'`) bei Mount → `{authenticated, user, isAdmin, loading}`. Provider in `main.tsx`.
- **Navigation** (`mentolder-web/src/components/Navigation.tsx`): User-Bereich rechts.
  - Nicht eingeloggt → **„Login"** (Navigation zu `web…/api/auth/login?returnTo=<react-url>`).
  - Eingeloggt → **User-Profil-Dropdown**: Name/E-Mail · **„Edit Homepage"** (nur `isAdmin`) →
    `/admin/homepage` · **Logout** (`web…/api/auth/logout?returnTo=https://react.mentolder.de/`).
- **Editor-Route** `/admin/homepage` (lazy, Admin-Guard → sonst Login-Redirect) in `App.tsx`:
  - Lädt aktuelles Dokument (`GET /api/homepage`), hält es in lokalem State.
  - **Schema-getriebene Feld-Formulare pro Block** (ein Abschnitt je Block, Felder aus der
    Props-Form abgeleitet: Strings → Text/Textarea, String-Arrays → Listeneditor, verschachtelte
    Objekte/Arrays wie `services.items`/`whyMe.points`/`faq.items` → wiederholbare Unterformulare).
  - **Live-Vorschau** über `BlockRenderer` mit dem in-Bearbeitung-Dokument.
  - **Speichern** → `POST /api/admin/homepage/save` mit `baseVersion`; `409` → Hinweis „anderswo
    geändert, neu laden"; `422` → Feldfehler.
- **HomePage** (`mentolder-web/src/pages/HomePage.tsx`): State init = `homepageSeed`; `GET /api/homepage`;
  gültiges Dokument ersetzt den Seed. `BlockRenderer` validiert ohnehin (zod) und fällt bei
  Fehler/leer auf `homepageSeed` zurück.

### C. Infra / k8s

- **Env**:
  - `VITE_WEBSITE_ORIGIN` (React-Build-Zeit): dev = Website-Dev-Origin, prod = `https://web.mentolder.de`.
    Gesetzt in `build-mentolder-web.yml` (Build-Arg) bzw. `k3d/mentolder-web.yaml`/`environments/*`.
  - `REACT_APP_ORIGIN` (Website-Runtime, CORS-Allowlist): dev = `http://react.localhost`,
    prod = `https://react.mentolder.de`. In `environments/<env>.yaml` + `environments/schema.yaml`
    + envsubst-Listen + Website-Deployment-Env.
- **Keine** Ingress-Änderung, **keine** SealedSecret-Rotation, **keine** Pocket-ID-Client-Änderung.

## Data Flow

- **Render**: Browser → `react.mentolder.de` (Static-SPA) → `GET web…/api/homepage` → DB
  (`content_versions`/Content-Ref) → Dokument → `BlockRenderer`.
- **Edit**: Admin → `/admin/homepage` → Dokument laden → Felder editieren (lokal) → Live-Vorschau →
  `Save` → `POST web…/api/admin/homepage/save` (Session+isAdmin, zod, versioniert) → neue Version.

## Error Handling

- Auth-Fetch-Fehler/offline → gilt als ausgeloggt (kein Editor-Eintrag); HomePage zeigt Seed.
- `409` Conflict → „anderswo geändert, neu laden" inkl. aktueller Version.
- `422` Invalid → Feldfehler; **Server-zod ist Quelle der Wahrheit**.
- returnTo nicht in Allowlist → Callback ignoriert, Fallback `/admin`/`/portal`.
- CORS-Fehlkonfiguration → fail-closed (keine Admin-Aktionen möglich); Env-Anforderung dokumentiert.

## Testing

- **Website (Vitest)**: CORS-Helper (erlaubte/abgelehnte Origin, Preflight); callback returnTo-Allowlist
  (React-URL akzeptiert, evil abgelehnt); homepage save/versions/restore (Auth-Gate, zod-Validierung,
  Versionierung, Conflict); Schema-Parität (Website-Kopie ≡ React-Schema).
- **React (Vitest/RTL)**: `useAuth`-States; Navigation (Login vs. Profil-Dropdown vs. Admin-„Edit
  Homepage"); Editor-Guard (Nicht-Admin → Redirect); Feld-Edit → Save-Payload-Form; HomePage rendert
  gefetchtes Dokument und fällt auf Seed zurück.
- **Manifest/kustomize**-Validierung für Env-Ergänzungen; `task test:changed` + `freshness`-Gates.
- **E2E** (später, `dev-flow-e2e`): Login auf react, „Edit Homepage" sichtbar, Feld editieren,
  speichern, Änderung sichtbar.

## Scope Boundaries (YAGNI)

- v1 nur **Feld-Editing**; kein Block-CRUD/Reorder.
- Nur **mentolder**-Brand (`react.mentolder.de`); korczewski unberührt.
- Kein neues Auth-Backend; kein Cookie-Widening; keine Pocket-ID-Client-Änderung; kein Ingress-Proxy.
- richText/image/spacer-Blöcke existieren im Schema, sind aber nicht im Seed — der Editor behandelt
  generisch alle im Dokument vorhandenen Block-Typen.

## Trade-offs / Risks

- **Schema-Duplizierung** (Website-Kopie vs. Shared-Package): Kopie + Paritäts-Test gewählt (ein
  Consumer-Paar; Shared-Package wäre Overkill).
- **Sicherheits-sensibel**: CORS- + returnTo-Allowlist sind Auth-Surface → strikt env-allowlisted,
  fail-closed, unit-getestet. Security-Review-Flag.
- **Dev-Caveat**: same-site-Cookie-Verhalten auf `*.localhost` ist browserabhängig; Editor-Login ggf.
  gegen Staging/Prod testen statt lokal.
