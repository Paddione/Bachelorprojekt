# website/CLAUDE.md

Full standards in `website/WEBSITE-STANDARDS.md`. This file is the quick reference for agents.

> **T001490 (2026-07-02):** Public-Content liest aus dem **git-versionierten Bundle** (`website/content/<brand>/*.json`), nicht aus `site_settings` / `homepage_block_documents`. Admin-Saves gehen über `publishContent()` (Bot-PR + Auto-Merge, ~5-10 min Latenz). SSOT: `openspec/specs/website-interfaces.md`. Standards: `WEBSITE-STANDARDS.md` § 8.

## Dev Quick-Start

### Variante A — Docker-Container (empfohlen, T003055)

```bash
docker compose -f compose.dev.yaml up --build   # aus dem Repo-Root
# http://localhost:4321
```

Nimmt `website/.env` per `env_file` und legt die Werte damit in die **Prozessumgebung**.
Live-Reload läuft über einen Bind-Mount (~2 s Latenz). Stoppen mit `down`, das
`node_modules`-Volume zusätzlich wegräumen mit `down -v`.

### Variante B — direkt auf dem Host

```bash
cd website
pnpm install
set -a; . ./.env; set +a   # PFLICHT — sonst bricht der Start ab, siehe unten
pnpm dev                   # http://localhost:4321
```

> **`pnpm dev` ohne `set -a` scheitert an `src/lib/auth.ts:13`** mit
> `POCKET_ID_WEBSITE_SECRET ... is not set`, obwohl `website/.env` existiert und den
> Schlüssel enthält. Grund: Vite lädt `.env` nach `import.meta.env` (Build-Zeit-Substitution
> fürs Client-Bundle), `auth.ts` liest den Wert aber aus `process.env` — dort ist er nie
> angekommen. `process.env` ist für Server-Code korrekt, denn im Cluster kommt der Wert aus
> einem Secret als Container-Env. `set -a` schaltet Auto-Export ein, sodass die Zuweisungen
> in die Umgebung der Kindprozesse gelangen. Der Fehler feuert auf Modul-Top-Level, also
> beim ersten Import einer auth-nutzenden Route — nicht erst beim Login (T001593).

Beide Varianten brauchen die Backing-Services: Postgres mit der `website`-DB und Pocket ID.
`website/.env` zeigt dafür auf `127.0.0.1`-Ports, die per `kubectl port-forward` bereitstehen.
Im Container ist `127.0.0.1` ein anderer Netzwerk-Namespace — `website/docker-entrypoint.dev.sh`
biegt die **ausgehenden** URLs deshalb zur Laufzeit auf `host.docker.internal` um.
`SITE_URL` bleibt dabei absichtlich auf `localhost`: sie wird an den Browser ausgeliefert
(OIDC-`redirect_uri`), und dort ist `host.docker.internal` nicht auflösbar.

> **Abgrenzung:** `website/Dockerfile` ist das **Produktions**-Image (`pnpm run build` →
> `dist/server/entry.mjs`, Code zur Build-Zeit eingefroren). `website/Dockerfile.dev` ist
> ausschließlich für lokale Entwicklung — kein Build, Quellcode per Bind-Mount. Guards:
> `tests/unit/website-dev-container.bats`.

## Two-Group Content Model

**Group A — Central** (change once, applies everywhere):
- Contact: email, phone, city → Admin → Kontakt-Tab → `site_settings key='kontakt'`
- Footer tagline, copyright → same tab (`kontaktOverride.*`)
- SEO titles + meta-descriptions → Admin → SEO-Tab → `site_settings key='seo_title_*'`
- Footer service order → Admin → Angebote-Tab (arrow order = `getEffectiveServices()`)

**Group B — Page-specific**: each service page has its own Admin tab.

## Data-Flow Priority Chain

```
DB-Override (Admin saved)
  > pageContent in service_config
    > config.services[].pageContent (mentolder.ts static fallback)
```

Kontakt/Footer: `getEffectiveKontakt()` → `site_settings` → `config.contact` fallback.

## Key Files

| Purpose | File |
|---------|------|
| All static fallbacks | `src/config/brands/mentolder.ts` |
| Universal service template | `src/pages/[service].astro` |
| Content merge helpers | `src/lib/content.ts` |
| DB read/write | `src/lib/website-db.ts` |
| Admin tab router | `src/components/admin/InhalteEditor.svelte` |
| Universal service admin | `src/components/admin/inhalte/ServicePageSection.svelte` |
| Universal save API | `src/pages/api/admin/service-page/save.ts` |

## `__introNote__` Pattern

A section with `title: '__introNote__'` renders as an italic personal note block **before** the "Für wen" grid — filtered out of the normal sections list in `[service].astro`.

## Adding a New Service Page

1. Add entry to `services[]` in `mentolder.ts` (slug, title, pageContent with seoTitle/seoDescription)
2. After deploy: Admin → tab → Speichern (creates DB-override)
3. Admin → SEO-Tab: verify title/description
4. Admin → Angebote-Tab: adjust card order (= Footer order)
5. Ensure `hidden !== true`

## Footguns

- **First save after deploy**: new pages in `mentolder.ts` need one Admin save to activate DB-override
- **CONTACT_CITY in workflow**: `.github/workflows/build-website.yml` must have `"Lüneburg, Hamburg und Umgebung"` — not just `"Hamburg"`
- **Brand name**: always `mentolder` (lowercase m), never `Mentolder` except at sentence start
- **Runtime vs admin values**: `CONTACT_EMAIL`, `LEGAL_*` etc. are read at runtime from `process.env` (ConfigMap, envsubst'd in the deploy step) — no *brand* config is baked at build time; `footerCity`, tagline, copyright stay admin-overridable at runtime
- **Build-time exception — `GIT_SHA`/`BUILT_AT`** (T002202): these two ARE baked in, via `ARG`/`ENV` in the Dockerfile's **runtime** stage plus matching `build-args` in `build-website.yml`. They describe the image, not a brand, and `/api/health` serves them so E2E runs can tell code drift from deploy drift. `ARG` is per-stage — declaring it only in the build stage makes the `--build-arg` a silent no-op, which is exactly what this Dockerfile did before T002202. Adding a build-time value means touching **both** files.
- **New image takes ~3-4 min** after merge; check in incognito to avoid cache

## Content Standards

- Location: `Lüneburg, Hamburg und Umgebung` (with `· DE` in header/footer)
- Copyright: `© 2026 mentolder — Alle Rechte vorbehalten`
- Führungserfahrung: **30+ Jahre** (not 40+); IT/Sicherheit: **40 Jahre**
- SEO title: 50–70 chars, format `{Description} | mentolder.de`
- SEO description: 120–160 chars, include location
