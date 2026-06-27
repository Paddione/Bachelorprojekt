---
title: Docker-Build-Beschleunigung (Caching + Website slim/konsolidieren + arm64-Drop)
date: 2026-06-27
status: design
ticket_id: T001229
plan_ref: openspec/changes/docker-build-speedup/tasks.md
domains: [infra, website]
---

# Docker-Build-Beschleunigung

## Problem

Die CI-Build-Zeiten der Docker-Images sind unnötig hoch und das Website-Image ist mit
~1,2 GB stark aufgebläht. Echte GHA-Run-Durations (2026-06-27):

| Image | Build (real) | Hauptursache |
|-------|--------------|--------------|
| transcriber | **~8 min** | Multi-Arch arm64 via QEMU + `playwright install firefox` |
| videovault | ~4–6 min | `npm install --legacy-peer-deps`, kein Cache |
| website (mentolder) | ~3–5 min | `docker build --no-cache`, voller `npm ci`, Astro/Vite |
| website (korczewski) | ~3–5 min | **identischer** zweiter Build desselben Images |
| brett / docs / mediaviewer / mentolder-web / collabora | ~0–1 min | bereits klein bzw. dünn |

## Verifizierte Befunde (Code + CI)

1. **`docker build --no-cache`** in `build-website.yml:62` **und** `build-website-korczewski.yml:62`
   schaltet jegliches Layer-Caching hart ab. Kein `cache-from`/`cache-to` irgendwo (außer
   collabora/transcriber, die buildx nutzen, aber ohne Cache-Konfig).
2. **`setup-node` `cache:'npm'`** (build-website.yml:27 u.a.) ist toter Ballast: `npm ci` läuft
   *im* Docker-Build, nie am Runner — der Runner-npm-Cache wird vom Docker-Build nie berührt.
   (Ausnahme: Workflows, die `freshness:regenerate` o.ä. am Runner mit npm ausführen — dort prüfen.)
3. **Website wird 2× als byte-identisches Image gebaut.** Der `website/Dockerfile` hat **keine
   einzige `ARG`-Zeile**; die ~12 `--build-arg PROD_DOMAIN/BRAND_NAME/LEGAL_*` aus beiden Workflows
   sind **No-Ops**. Die Brand-Werte werden via `process.env.*` in SSR-API-Routes/Server-Pages zur
   **Runtime** gelesen (`api/contact.ts`, `api/booking.ts`, `sitemap.xml.ts`, `drucken.astro`, …),
   nicht beim `astro build`. `astro build` kompiliert beide Brand-Codepfade (`mentolder.ts`,
   `korczewski.ts`, Kore-Komponenten) in dieselbe SSR-Bundle; die Verzweigung passiert zur Runtime
   über die ConfigMap (envsubst im Deploy-Step). `website/CLAUDE.md` ("LEGAL_* gebacken zur
   Build-Zeit") ist **stale** und wird mitkorrigiert.
4. **Runtime-Image ~1,2 GB** mischt drei Anliegen: SSR-Server (das Einzige, was Prod braucht),
   Chromium+Fonts (~300 MB, nur Tests), kubectl (~50 MB, nur Tests), `tests/`-Verzeichnis (nur
   Tests) — plus volles `node_modules` **inkl. devDeps** (`COPY --from=build /app/node_modules`,
   `website/Dockerfile:45`, kein `--omit=dev`). Chromium wird in `website/src` **nie** gelauncht
   (`browser.launch(` = 0 Treffer im Source; nur in `tests/`).
5. **Kein BuildKit-Cache-Mount** (`--mount=type=cache`) in irgendeinem Dockerfile.
6. **arm64**: fleet ist amd64-only (Hetzner x86). `build-transcriber.yml` und `build-collabora.yml`
   bauen dennoch `linux/amd64,linux/arm64` — die arm64-Hälfte läuft via QEMU-Emulation und
   verdoppelt grob die Build-Zeit, ohne im Cluster genutzt zu werden.

## Ziel-Metrik

- Build-Zeit pro Image **bei Cache-Hit** (nur Source-Änderung) drastisch runter:
  Website/VideoVault/Transcriber von ~4–8 min → Ziel ~1–2 min.
- Website-Runtime-Image **~1,2 GB → ~600 MB** (devDeps raus; Chromium/kubectl/tests bleiben
  bewusst drin — Entscheidung „nur abspecken, kein Runtime/Test-Split").
- Website-Build-Last **halbiert** (2 identische Builds → 1).
- Validierung über GHA-Run-Durations vorher/nachher dokumentiert (kein neuer CI-Gate).

## Nicht-Ziele (YAGNI)

- **Kein** Runtime/Test-Image-Split der Website (Chromium/kubectl/`tests/` bleiben im einen Image).
- **Kein** Umbau des In-Cluster-Testrunners.
- **Keine** Migration von npm→pnpm o.ä. an den App-Build-Tools.
- **Keine** Optimierung an Images ohne CI-Build-Workflow (studio-server, einvoice-sidecar,
  mcp-browser) — außerhalb des Scopes.

## Design — 3 Phasen (ein OpenSpec-Change, je Phase mergebar)

### Phase 1 — Cross-cutting Layer-Caching *(größter Hebel, niedrigstes Risiko)*

Einheitliches Pattern auf alle CI-gebauten Images. Zwei Bausteine:

**(a) Dockerfile — BuildKit-Cache-Mounts** auf den Dependency-Layern:
- `# syntax=docker/dockerfile:1` als erste Zeile jedes betroffenen Dockerfiles.
- Node: `RUN --mount=type=cache,target=/root/.npm npm ci` (bzw. `npm install --legacy-peer-deps`
  bei VideoVault/mediaviewer).
- Python (transcriber): `RUN --mount=type=cache,target=/root/.cache/pip pip install …`
  (`--no-cache-dir` entfernen, damit der Cache-Mount greift).

**(b) Workflow — GHA-Layer-Cache** statt nacktem `docker build`:
- `docker/setup-buildx-action` + `docker/build-push-action@v6`.
- `cache-from: type=gha` + `cache-to: type=gha,mode=max` **nur für schwere Images**
  (website, videovault, transcriber); leichte (docs, collabora, brett, mediaviewer, mentolder-web)
  `mode=min` — **GHA-Cache-Budget = 10 GB/Repo**, sonst Evictions, die den Cache wertlos machen.
- `--no-cache` ersatzlos entfernen (Website ×2).
- Totes `setup-node`-`cache:'npm'` entfernen, außer wo der Runner npm tatsächlich nutzt
  (z.B. `freshness:regenerate`-Step) — pro Workflow prüfen, nicht blind löschen.

*Interface-Kontrakt:* Image-Name, Tags (`sha-*` + `:latest`), Build-Args und Deploy-Steps bleiben
unverändert — nur der Build-Mechanismus wechselt. Outputs (`IMAGE`, `SHA_TAG`) identisch, damit die
nachgelagerten Deploy-Steps unberührt bleiben.

*Betroffen:* `build-website.yml`, `build-website-korczewski.yml` (entfällt teils in Phase 2),
`build-brett.yml`, `build-videovault.yml`, `build-mediaviewer-widget.yml`,
`build-mentolder-web.yml`, `build-transcriber.yml`, `build-collabora.yml`, `build-docs.yml`.

### Phase 2 — Website: abspecken + 2→1 konsolidieren

**2a — Slim (devDeps raus).** Im Build-Stage nach `npm run build`:
`RUN npm prune --omit=dev`, dann `COPY --from=build /app/node_modules ./node_modules` kopiert das
geprunte Verzeichnis. Chromium/kubectl/`tests/` bleiben.
- **Guardrail (hart):** Runtime-Image muss booten (`node ./dist/server/entry.mjs`) und einen
  Smoke-Test (HTTP 200 auf `/`) bestehen — manche runtime-nötigen Pakete könnten fälschlich in
  `devDependencies` liegen. Schlägt der Boot fehl → betroffenes Paket nach `dependencies` ziehen,
  nicht den Prune zurücknehmen.

**2b — Konsolidieren 2→1.** Ein Build → ein Push → beide Brand-Deploys pinnen denselben SHA.
- Zielbild: **ein** Image-Name (Vorschlag `ghcr.io/paddione/website`, oder bestehenden
  `mentolder-website` als geteilten Namen weiterführen — im Plan festlegen, Manifest-Repoints
  inklusive). `build-website-korczewski.yml` wird **deploy-only** (kein eigener Build/Push mehr;
  zieht denselben SHA-Tag) — oder beide Deploys wandern in einen Workflow mit zwei Deploy-Steps.
- **Guardrail (hart):** Vor der Umstellung **alle `import.meta.env.*`-Brand-Reads** im
  `website/`-Source greppen. Vite/Astro ersetzt `import.meta.env.FOO` **statisch zur Build-Zeit**,
  *wenn* `FOO` als Build-Env gesetzt ist. Aktuell ist im Build-Step **keine** Brand-Build-Env
  gesetzt (BRAND/BRAND_ID stehen nur im Deploy-Step) → `import.meta.env.BRAND` fällt zur Runtime
  auf `process.env.BRAND` zurück → Images identisch → Konsolidierung sicher. Findet der Grep
  eine zur Build-Zeit gesetzte, brand-differenzierende `import.meta.env`-Konstante, ist 2b
  **nicht** sicher und wird zurückgestellt (2a + Phase 1 bleiben wirksam).
- Manifest-Impact: `WEBSITE_IMAGE`-Env in `build-website*.yml`, `k3d/website.yaml`,
  `prod-fleet/website-mentolder` + `prod-fleet/website-korczewski`-Overlays auf den geteilten
  Image-Namen repointen. Rollout beider Brands nach Umstellung verifizieren.

### Phase 3 — arm64 droppen

`build-transcriber.yml` + `build-collabora.yml`: `platforms: linux/amd64` (arm64 raus).
- **Pre-flight (Safety-Net):** `kubectl --context fleet get nodes -o wide` — bestätigen, dass keine
  arm64-Nodes existieren, bevor arm64 entfällt.
- Halbiert den Transcriber-Build (kein QEMU mehr); collabora ist ohnehin dünn, aber konsistent.

## Verifikation (Plan-Abschluss)

- `task test:changed` grün.
- `task freshness:regenerate` + `task freshness:check` grün.
- `task test:openspec` (bzw. `bash scripts/openspec.sh validate`) grün vor Commit.
- Nach Test-Änderungen: `task test:inventory` + Inventar committen (hier vermutlich n/a, keine
  Testdateien geändert — falls doch, einplanen).
- Website-Runtime-Image lokal bauen, booten (`node ./dist/server/entry.mjs`) + Smoke-Test (HTTP 200).
- CI grün auf dem PR.
- Build-Zeit **vorher/nachher** je Image aus GHA-Run-Durations dokumentieren (Beleg der Ziel-Metrik).

## Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|--------|---------------|
| `--omit=dev` entfernt ein runtime-nötiges Paket | Harter Boot+Smoke-Guardrail in 2a; Paket nach `dependencies` ziehen |
| Versteckte Build-Zeit-Brand-Differenz (`import.meta.env`) | Grep-Guardrail in 2b; bei Fund 2b zurückstellen |
| GHA-Cache-Budget (10 GB) gesprengt → Evictions | `mode=max` nur schwere Images, sonst `mode=min` |
| Konsolidierung bricht Brand-Deploy (falscher Image-Name) | Manifest-Repoints vollständig; Rollout beider Brands verifizieren |
| arm64 doch im Cluster gebraucht | Pre-flight `kubectl get nodes -o wide` vor Drop |
| build-push-action ändert Tag/Output-Semantik | Interface-Kontrakt: gleiche Tags/Outputs, Deploy-Steps unberührt |
