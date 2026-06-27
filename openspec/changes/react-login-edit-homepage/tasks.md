---
title: react-login-edit-homepage — Implementation Plan
ticket_id: T001160
domains: [website, mentolder-web, infra, security]
status: plan_staged
---

# react-login-edit-homepage — Implementation Plan

SSOT-Design: `docs/superpowers/specs/2026-06-27-react-login-edit-homepage-design.md`.
Delta-Spec: `openspec/changes/react-login-edit-homepage/specs/react-login-edit-homepage.md`.

Jede Task ist TDD: zuerst ein roter Test (Lauf → expected: FAIL), dann Implementierung bis grün,
dann Commit. Server-Arbeit (Auth/Persistenz) liegt auf der Astro-Website (`website/`, hat Session +
DB); die React-App (`mentolder-web/`) bleibt statisch und ruft die Website cross-origin (same-site).

## File Structure

Neue Dateien:
- `website/src/lib/homepage-blocks-schema.ts` — server-seitige Kopie der Block-zod-Schemas.
- `website/src/lib/homepage-blocks-schema.test.ts` — Paritäts-Test gegen das React-Schema.
- `website/src/lib/cors.ts` — CORS-Allowlist-Helper (env `REACT_APP_ORIGIN`).
- `website/src/lib/cors.test.ts` — Tests für erlaubte/abgelehnte Origin + Preflight.
- `website/src/lib/homepage-blocks-store.ts` — versionierter Store (live + History, optimistic concurrency).
- `website/src/lib/homepage-blocks-store.test.ts` — Store-Tests (save/version/conflict/restore).
- `website/src/pages/api/homepage.ts` — public `GET` (Dokument ausliefern) + `OPTIONS`.
- `website/src/pages/api/homepage.test.ts` — Endpoint-Test (public read, CORS).
- `website/src/pages/api/admin/homepage/save.ts` — admin `POST` save.
- `website/src/pages/api/admin/homepage/versions.ts` — admin `GET` versions.
- `website/src/pages/api/admin/homepage/restore.ts` — admin `POST` restore.
- `website/src/pages/api/admin/homepage/save.test.ts` — admin save Tests (Auth-Gate, zod, 409/422).
- `scripts/migrate-homepage-blocks.mjs` — CREATE-TABLE-Migration (Muster: `scripts/migrate-content-versions.mjs`).
- `mentolder-web/src/auth/useAuth.tsx` — React-Auth-Context (`GET /api/auth/me`, credentials).
- `mentolder-web/src/auth/useAuth.test.tsx` — Auth-Context-Tests.
- `mentolder-web/src/components/UserMenu.tsx` — Login-Button / Profil-Dropdown / „Edit Homepage".
- `mentolder-web/src/components/UserMenu.test.tsx` — UserMenu-Tests (Login vs. Dropdown vs. Admin-Eintrag).
- `mentolder-web/src/lib/homepageApi.ts` — Fetch-Helper (Website-Origin, credentials) für Dokument + save.
- `mentolder-web/src/pages/admin/HomepageEditorPage.tsx` — Editor (Feld-Formulare + Live-Vorschau + Save).
- `mentolder-web/src/pages/admin/HomepageEditorPage.test.tsx` — Editor-Tests (Guard, Feld-Edit → Payload).
- `mentolder-web/src/pages/admin/blockFields.ts` — Ableitung der editierbaren Felder je Block-Typ.

Geänderte Dateien (alle deutlich unter S1-Limit; `.tsx`=400, `.ts`=600 Zeilen):
- `website/src/pages/api/auth/callback.ts` — returnTo-Allowlist (absolute allowlisted Origins).
- `website/src/pages/api/auth/callback.test.ts` — Allowlist-Tests (akzeptiert react, lehnt evil ab).
- `website/src/pages/api/auth/me.ts` — CORS-Header via Helper + `OPTIONS`.
- `mentolder-web/src/main.tsx` — `AuthProvider` einhängen.
- `mentolder-web/src/components/Navigation.tsx` — `UserMenu` einbinden (Menü-Logik bleibt in `UserMenu.tsx`).
- `mentolder-web/src/App.tsx` — Route `/admin/homepage` (lazy, Admin-Guard).
- `mentolder-web/src/pages/HomePage.tsx` — Dokument fetchen, Seed-Fallback.
- `k3d/mentolder-web.yaml` — Build-/Runtime-Env `VITE_WEBSITE_ORIGIN`.
- `.github/workflows/build-mentolder-web.yml` — `VITE_WEBSITE_ORIGIN` als Build-Arg.
- `k3d/website.yaml` — Website-Deployment-Env `REACT_APP_ORIGIN`.
- `environments/mentolder.yaml`, `environments/dev.yaml`, `environments/schema.yaml` — `REACT_APP_ORIGIN`.
- `Taskfile.yml` — `REACT_APP_ORIGIN` in die envsubst-Liste der Website-Manifest-Tasks aufnehmen.

## Pre-flight

Budget-Check (S1): alle zu ändernden Dateien liegen weit unter der wirksamen Schwelle ihres Typs;
die Editor-/Menü-Logik wird bewusst in eigene neue Dateien (`UserMenu.tsx`, `HomepageEditorPage.tsx`,
`blockFields.ts`) gelegt, damit `Navigation.tsx`/`App.tsx` schlank bleiben. Keine Brand-Domain-Literale
im Code — Origins kommen aus Env (`VITE_WEBSITE_ORIGIN`, `REACT_APP_ORIGIN`); kein Import-Zyklus.

## Task 1: Website — server-seitiges Block-Schema + Paritäts-Test

- [x] `website/src/lib/homepage-blocks-schema.test.ts` schreiben: parst den `homepageSeed` und ein
      minimal-gültiges Dokument; assertet Ablehnung bei unbekanntem Block-`type`. Lauf → expected: FAIL.
- [x] `website/src/lib/homepage-blocks-schema.ts` als Kopie der zod-Schemas aus
      `mentolder-web/src/blocks/schema.ts` anlegen (`HomepageBlocksDocument`, `SCHEMA_VERSION`).
- [x] Paritäts-Assertion ergänzen: dieselben Block-`type`-Literale wie das React-Schema. Tests → grün. Commit.

## Task 2: Website — CORS-Allowlist-Helper

- [x] `website/src/lib/cors.test.ts`: erlaubte Origin → echte `Access-Control-Allow-Origin` + `Allow-Credentials: true` + `Vary: Origin`; fremde Origin → keine Header; `OPTIONS` → Preflight-Antwort. Lauf → expected: FAIL.
- [x] `website/src/lib/cors.ts`: `corsHeaders(origin)` + `handlePreflight(request)` gegen `REACT_APP_ORIGIN` (Komma-separierbar), fail-closed.
- [x] Tests → grün. Commit.

## Task 3: Website — `/api/auth/me` CORS + Callback returnTo-Allowlist

- [x] `website/src/pages/api/auth/callback.test.ts` erweitern: `returnTo` = react-Origin-URL → Redirect dorthin; `returnTo` = fremde Domain → Fallback `/admin`/`/portal`; relative Pfade unverändert. Lauf → expected: FAIL.
- [x] `callback.ts`: Allowlist-Check ergänzen — absolute URL erlaubt nur, wenn ihre Origin in (`SITE_URL`-Origin, `REACT_APP_ORIGIN`) liegt; sonst bisheriger Open-Redirect-Guard.
- [x] `me.ts`: CORS-Header via Helper setzen + `OPTIONS`-Handler. Tests → grün. Commit.

## Task 4: Website — Block-Dokument-Store + API

- [ ] `website/src/lib/homepage-blocks-store.test.ts`: erstes Save legt v1 an; zweites Save mit falschem `baseVersion` → Conflict; `restore` setzt alte Version als neue. Lauf → expected: FAIL.
- [ ] `scripts/migrate-homepage-blocks.mjs` nach Muster `scripts/migrate-content-versions.mjs`: Tabellen `homepage_block_documents(brand PK, document JSONB, version INT, updated_at)` + `homepage_block_versions(... snapshot JSONB, editor, created_at)`. Den realen Migrations-Aufrufpfad bestätigen (wie `content_versions` in prod erzeugt wird) und gleich anhängen.
- [ ] `website/src/lib/homepage-blocks-store.ts`: `readCurrent(brand)`, `save(brand, payload, baseVersion, editor)` (zod-validiert via Schema aus Task 1, optimistic concurrency → `ContentConflictError`-analog), `listVersions(brand)`, `restore(brand, versionId, editor)`, History-Pruning (~letzte 20).
- [ ] `website/src/pages/api/homepage.ts`: public `GET` (`readCurrent`, CORS, `OPTIONS`); leer → `204`.
- [ ] `website/src/pages/api/admin/homepage/save.ts`: `getSession`+`isAdmin`-Gate; `{baseVersion,payload}`; `200 {version}` / `409 {currentVersion,currentValue}` / `422 {errors}`; CORS.
- [ ] `website/src/pages/api/admin/homepage/versions.ts` + `restore.ts`: admin-gated, CORS.
- [ ] `website/src/pages/api/homepage.test.ts` + `.../admin/homepage/save.test.ts`: public read, Auth-Gate (401 ohne Session/Nicht-Admin), zod-422, 409-Conflict. Tests → grün. Commit.

## Task 5: React — Auth-Context + API-Helper

- [ ] `mentolder-web/src/auth/useAuth.test.tsx`: gemocktes `/api/auth/me` → `{authenticated, isAdmin}` korrekt; Fetch-Fehler → ausgeloggt. Lauf → expected: FAIL.
- [ ] `mentolder-web/src/lib/homepageApi.ts`: `getMe()`, `getHomepage()`, `saveHomepage()` gegen `import.meta.env.VITE_WEBSITE_ORIGIN`, `credentials:'include'`.
- [ ] `mentolder-web/src/auth/useAuth.tsx`: `AuthProvider` + `useAuth()` (lädt bei Mount, `{authenticated,user,isAdmin,loading}`).
- [ ] `mentolder-web/src/main.tsx`: `AuthProvider` um die App. Tests → grün. Commit.

## Task 6: React — UserMenu + Navigation

- [ ] `mentolder-web/src/components/UserMenu.test.tsx`: ausgeloggt → „Login"-Element mit korrekter Login-URL (`returnTo`); eingeloggter Admin → Dropdown mit „Edit Homepage" (→ `/admin/homepage`) + „Logout"; Nicht-Admin → kein „Edit Homepage". Lauf → expected: FAIL.
- [ ] `mentolder-web/src/components/UserMenu.tsx` implementieren (nutzt `useAuth`); Login/Logout = Top-Level-Navigation zu Website-Origin mit `returnTo`.
- [ ] `mentolder-web/src/components/Navigation.tsx`: `<UserMenu />` rechts einbinden (Desktop + Mobile-Sheet). Tests → grün. Commit.

## Task 7: React — Editor-Route + Feld-Editor

- [ ] `mentolder-web/src/pages/admin/HomepageEditorPage.test.tsx`: Nicht-Admin → Redirect; Admin → lädt Dokument, ändert ein Hero-Textfeld, „Save" ruft `saveHomepage` mit erwartetem Payload + `baseVersion`. Lauf → expected: FAIL.
- [ ] `mentolder-web/src/pages/admin/blockFields.ts`: pro Block-`type` editierbare Felder ableiten (String→Text/Textarea, String-Array→Liste, verschachtelte Arrays `services.items`/`whyMe.points`/`faq.items`→wiederholbare Unterformulare).
- [ ] `mentolder-web/src/pages/admin/HomepageEditorPage.tsx`: Formulare je Block, Live-Vorschau via `BlockRenderer` mit Arbeitsdokument, Save mit `409`/`422`-Handling.
- [ ] `mentolder-web/src/App.tsx`: Route `/admin/homepage` (lazy, Admin-Guard → sonst Login). Tests → grün. Commit.

## Task 8: React — HomePage rendert gespeichertes Dokument

- [ ] `mentolder-web/src/pages/HomePage.test.tsx` (existiert) erweitern: gemocktes `getHomepage()` liefert Dokument → wird gerendert; Fehler/leer → Seed-Fallback. Lauf → expected: FAIL.
- [ ] `mentolder-web/src/pages/HomePage.tsx`: State init `homepageSeed`, `getHomepage()` ersetzt bei gültigem Dokument. Tests → grün. Commit.

## Task 9: Infra — Env-Verdrahtung (k8s + Build)

- [ ] `k3d/mentolder-web.yaml` + `.github/workflows/build-mentolder-web.yml`: `VITE_WEBSITE_ORIGIN` als Build-Arg/Env (prod `https://web.${PROD_DOMAIN}`, dev Website-Dev-Origin).
- [ ] `k3d/website.yaml`: Deployment-Env `REACT_APP_ORIGIN`.
- [ ] `environments/mentolder.yaml`, `environments/dev.yaml`, `environments/schema.yaml`: `REACT_APP_ORIGIN` registrieren; `Taskfile.yml` envsubst-Listen der Website-Manifest-Tasks ergänzen (siehe `docs/superpowers/references/envsubst-variable-management.md`).
- [ ] `task workspace:validate` (Manifeste bauen sauber). Commit.

## Task 10: Verifikation (CI-Äquivalent)

- [ ] `task test:openspec` (bzw. `bash scripts/openspec.sh validate`) → grün.
- [ ] `task test:inventory` ausführen und `website/src/data/test-inventory.json` mitcommitten (Tests wurden ergänzt).
- [ ] `task test:changed` → grün (geänderte Vitest/BATS).
- [ ] `task freshness:regenerate` und danach `task freshness:check` → grün.
- [ ] Editor-Login-Pfad gegen eine prod-ähnliche Origin verifizieren (Dev-`*.localhost`-Caveat aus der Spec beachten).
- [ ] Abschluss-Commit.
