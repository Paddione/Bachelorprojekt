# Proposal: react-login-edit-homepage

_Ticket: T001160_

## Why

`react.mentolder.de` (`mentolder-web/`, Vite/React-19-SPA) ist heute rein statisch: kein Login,
kein Admin-Menü, kein Content-Management. Die Homepage rendert aus einem hartkodierten Seed
(`mentolder-web/src/blocks/seed.ts`). Ziel ist, dass man sich dort **genauso wie auf
`web.mentolder.de`** einloggen kann und neben Admin-Menü/User-Profil einen **„Edit Homepage"**-Eintrag
findet, der zu einem echten React-Content-Management führt. Danach rendert die Homepage aus einem
**gespeicherten, versionierten Block-Dokument** statt aus dem Seed (Seed bleibt Fallback).

## What

- **Login** durch Wiederverwendung der Astro-Website-Auth (Pocket-ID-OIDC). Schlüssel-Erkenntnis:
  `react.` und `web.mentolder.de` sind **same-site**, daher wird der bestehende host-only
  `workspace_session`-Cookie (`SameSite=Lax`) bei einem credentialed `fetch` mitgesendet — **kein**
  Cookie-Widening, **kein** neues Backend, **keine** `redirect_uri`-Änderung. Nötig: **CORS** auf den
  Website-Endpoints für die React-Origin und eine **returnTo-Allowlist** im Callback (zurück auf react).
- **React-Block-Editor** (Feld-Editor v1): schema-getriebene Formulare pro Block, Live-Vorschau via
  `BlockRenderer`, versioniertes Speichern. Kein Add/Remove/Reorder.
- **Block-Dokument-API** auf der Website (public `GET /api/homepage`; admin
  `POST /api/admin/homepage/save` + `versions`/`restore`), das vorhandene `content_versions`-Pattern
  wiederverwendend. **Server-seitige zod-Validierung** als Quelle der Wahrheit.
- **Env-Verdrahtung**: `VITE_WEBSITE_ORIGIN` (React-Build), `REACT_APP_ORIGIN` (Website-CORS-Allowlist).

### Out of scope (YAGNI)

- Kein Block-CRUD/Reorder in v1 (nur Feld-Editing). Nur **mentolder**-Brand (korczewski unberührt).
- Kein Cookie-Widening, kein Ingress-Proxy, keine Pocket-ID-Client-Änderung, keine SealedSecret-Rotation.

### Security note

CORS-Allowlist und returnTo-Allowlist sind Auth-Surface: strikt env-allowlisted, fail-closed,
unit-getestet (Open-Redirect-Guard bleibt erhalten).

Design-SSOT: `docs/superpowers/specs/2026-06-27-react-login-edit-homepage-design.md`.
