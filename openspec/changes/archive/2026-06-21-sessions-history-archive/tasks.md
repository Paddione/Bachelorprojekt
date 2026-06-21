---
title: "Sessions: History / Archiv vergangener Sessions"
ticket_id: T000994
domains: [website, ops, infra]
status: active
date: 2026-06-20
spec_ref: docs/superpowers/specs/2026-06-20-sessions-history-archive.md
openspec_ref: openspec/changes/sessions-history-archive/
file_locks: []
shared_changes: true
shared_changes_files:
  - k3d/admin-actions-cronjobs.yaml
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Implementation Plan: sessions-history-archive

> Spec: `docs/superpowers/specs/2026-06-20-sessions-history-archive.md` · Ticket: T000994
> Domains: website (UI + API), ops (Purge-Script + Cronjob), infra (k3d-CronJob-Manifest + Cron-Token-Secret).
> shared_changes: true — `k3d/admin-actions-cronjobs.yaml` wird um einen weiteren CronJob ergänzt. Die bestehenden `admin-actions-cleanup` / `admin-actions-prune` Documents bleiben unangetastet; der neue `sessions-purge` CronJob wird als zusätzlicher `---`-Block ans Ende angehängt.

## File Structure

| Datei | Aktion | Domain | Zweck |
|-------|--------|--------|-------|
| `website/src/lib/sessions/archive.ts` | NEU | website | Purge-Logik, Flat-File-Verwaltung, History-Reader (Admin/Gekko-Filter + Pagination) |
| `website/src/lib/sessions/archive.test.ts` | NEU | website | Vitest-Unit-Tests für purge/list/get |
| `website/src/pages/api/admin/sessions/history/index.ts` | NEU | website | GET — archivierte Sessions auflisten (Admin = alle, Gekko = eigene), Pagination 50 |
| `website/src/pages/api/admin/sessions/history/[id].ts` | NEU | website | GET — Ergebnis-Markdown einer archivierten Session (read-only, 404 wenn nicht verfügbar) |
| `website/src/pages/api/admin/sessions/purge.ts` | NEU | website | POST — triggert `purgeOldSessions` (Admin-Cookie ODER `X-Cron-Token`) |
| `website/src/components/sessions/SessionsHistory.svelte` | NEU | website | Chronologische Listen-UI mit Typ-Filter, Pagination, Markdown-Reader |
| `website/src/components/sessions/SessionsHistory.test.ts` | NEU | website | Vitest-Component-Tests |
| `website/src/components/MediaviewerPanel.svelte` | ÄNDERN | website | History-View/Tab einbinden (ist 166, Limit 500 — Restbudget positiv) |
| `scripts/sessions-purge.sh` | NEU | ops | Host-/Cronjob-Wrapper: curl POST ans Purge-Endpoint mit Cron-Token |
| `tests/unit/sessions-purge.bats` | NEU | ops | BATS-Unit-Tests für den Wrapper (gemockter curl) |
| `k3d/admin-actions-cronjobs.yaml` | ÄNDERN (shared) | infra | Neuer `sessions-purge` CronJob (täglich 04:00), inline-curl ans in-cluster Purge-Endpoint |
| `environments/schema.yaml` | ÄNDERN | infra | Neue Var `SESSIONS_CRON_TOKEN` registrieren |
| `environments/sealed-secrets/<env>.yaml` | ÄNDERN | infra | `SESSIONS_CRON_TOKEN` versiegeln via `task env:seal` |

> Storage-Modell: aktive Registry `~/.local/share/bachelorprojekt/active-sessions.json` (aus T000975); Archiv `~/.local/share/bachelorprojekt/sessions-archive/` als Flat-Files. Jede archivierte Session besteht aus `<id>.md` (Ergebnis-Markdown) und `<id>.meta.json` mit `{id,slug,type,title,date,participants,owner,content_available}`. Pfade sind via `SESSION_HUB_REGISTRY` und `SESSIONS_ARCHIVE_DIR` überschreibbar (Tests nutzen Temp-Dirs). Die Pagination ist in 50er-Steps gesplittet.

---

## Task 1: archive.ts — purgeOldSessions (Failing-Test zuerst)

**Files:**
- Create: `website/src/lib/sessions/archive.ts`
- Create: `website/src/lib/sessions/archive.test.ts`

**Interfaces:**
- Consumes: die aktive Registry aus `SESSION_HUB_REGISTRY` (Default `~/.local/share/bachelorprojekt/active-sessions.json`); `SESSIONS_ARCHIVE_DIR` (Default `~/.local/share/bachelorprojekt/sessions-archive/`); ein Registry-Eintrag-Shape `{slug,type,title,port,public_url,local_url,started_at}` (T000975).
- Produces: archivierte Flat-Files (`<id>.md` + `<id>.meta.json`) und eine bereinigte Registry-JSON. `id` = `${slug}-${startedAtSanitized}`.

- [x] **Step 1: Failing-Test `archive.test.ts` anlegen**

Testfälle für `purgeOldSessions`:
1. Registry mit zwei Entries (einer 31 Tage alt via `started_at`, einer 5 Tage alt) → Purge entfernt den alten Entry aus der JSON, schreibt `<id>.md` + `<id>.meta.json` ins Archiv-Dir, gibt `{purged:1, warnings:[]}` zurück. Der junge Entry bleibt.
2. Korrupte JSON (`}{not json`) → Rückgabe `{purged:0, warnings:['corrupt-registry']}`, Archiv-Dir unverändert, keine Exception.
3. Entry ohne erreichbares Markdown (lokale URL tot) → Meta-Sidecar mit `content_available:false`, `<id>.md` enthält Platzhalter „Inhalt nicht verfügbar", Entry wird dennoch gepurged.

- [x] **Step 2: Test ausführen**

Run: `cd website && npx vitest run src/lib/sessions/archive.test.ts`
Expected: FAIL — Modul `./archive` fehlt.

- [x] **Step 3: `archive.ts` implementieren**

Export `purgeOldSessions({ maxAgeDays = 30 }): Promise<{purged:number, warnings:string[]}>`:
- Registry-Datei atomar lesen (`.tmp`+`mv`-Pattern wie `scripts/session-hub.sh`). Bei Parse-Fehler → Warning `'corrupt-registry'`, Return `{purged:0, warnings:['corrupt-registry']}` ohne Wurf.
- Für jeden Entry mit `started_at` älter als `maxAgeDays` Tage: Markdown-Inhalt beschaffen (Fetch via `local_url` mit 5s-Timeout; bei Fehler/Leerstring → Platzhalter „Inhalt nicht verfügbar", `content_available:false`). Meta-Sidecar bauen (`owner` aus einem optionalen `owner`-Feld des Entry, Default `preferred_username`-unbekannt → `'unknown'`; `participants` analog). `<id>.md` und `<id>.meta.json` ins Archiv-Dir schreiben. Archiv-Dir per `mkdir -p`-Äquivalent anlegen.
- Bereinigte Registry (ohne gepurgte Entries) atomar zurückschreiben.
- Pure Node `fs/promises` + `fetch`; keine Shell-Aufrufe. Keep under ~600 Zeilen.

- [x] **Step 4: Test ausführen — muss PASS sein**

Run: `cd website && npx vitest run src/lib/sessions/archive.test.ts`
Expected: PASS — alle 3 Testfälle grün.

- [x] **Step 5: Zeilen-Budget-Check**

Run: `wc -l website/src/lib/sessions/archive.ts`
Expected: < 600 (Ziel < ~250). Falls darüber, Meta-Sidecar-Logik in `website/src/lib/sessions/archive-meta.ts` auslagern.

- [x] **Step 6: Commit**

```bash
git add website/src/lib/sessions/archive.ts website/src/lib/sessions/archive.test.ts
git commit -m "feat(sessions): add archive.ts purgeOldSessions with flat-file archive [T000994]"
```

---

## Task 2: archive.ts — listArchivedSessions + getArchivedMarkdown

**Files:**
- Modify: `website/src/lib/sessions/archive.ts`
- Modify: `website/src/lib/sessions/archive.test.ts`

**Interfaces:**
- Consumes: das Archiv-Dir aus Task 1 (`SESSIONS_ARCHIVE_DIR`); den aktuellen Nutzer aus `getSession` (`preferred_username`) und `isAdmin`.
- Produces: `listArchivedSessions({ viewer, isAdmin, offset, limit, type? })` → `{items: ArchivedSession[], total, hasMore}`. `getArchivedMarkdown(id)` → `string | null`. `ArchivedSession` = `{id,slug,type,title,date,participants,owner,content_available}`.

- [x] **Step 1: Failing-Tests ergänzen**

1. Drei archivierte Sessions (owner `gekko`, `gekko`, `paddione`) → `listArchivedSessions({viewer:'gekko', isAdmin:false, offset:0, limit:50})` liefert genau die zwei `gekko`-Einträge, `total:2`, `hasMore:false`.
2. Selbes Archiv mit `isAdmin:true` → alle drei, `total:3`.
3. `type:'form'`-Filter → nur Form-Typ, chronologisch absteigend (neueste zuerst).
4. 60 Entries, `limit:50, offset:0` → 50 Items, `hasMore:true`; `offset:50` → 10 Items, `hasMore:false`.
5. `getArchivedMarkdown(id)` liefert den Markdown-String; unbekannte `id` → `null`; nicht lesbare Datei (Permission) → `null`.

- [x] **Step 2: Test ausführen**

Run: `cd website && npx vitest run src/lib/sessions/archive.test.ts`
Expected: FAIL — `listArchivedSessions` / `getArchivedMarkdown` nicht exportiert.

- [x] **Step 3: Implementieren**

- `listArchivedSessions`: Archiv-Dir lesen, alle `*.meta.json` parsen (Parse-Fehler einzelner Sidecars überspringen, nicht abbrechen). Sichtbarkeits-Filter: `isAdmin` → alle; sonst nur `owner === viewer`. Optionalen `type`-Filter anwenden. Nach `date` absteigend sortieren. `offset`/`limit` slicen, `hasMore = offset+limit < total`. Korruptes Sidecar → Eintrag überspringen.
- `getArchivedMarkdown(id)`: `<id>.md` lesen; bei `ENOENT` oder Permission-Fehler → `null`. Pfad-Traversal verhindern (`id` darf nur `[a-z0-9-]`).

- [x] **Step 4: Test ausführen — muss PASS sein**

Run: `cd website && npx vitest run src/lib/sessions/archive.test.ts`
Expected: PASS — alle Task-1- und Task-2-Tests grün.

- [x] **Step 5: Commit**

```bash
git add website/src/lib/sessions/archive.ts website/src/lib/sessions/archive.test.ts
git commit -m "feat(sessions): add listArchivedSessions + getArchivedMarkdown with visibility filter [T000994]"
```

---

## Task 3: API-Endpunkte — history-Liste, Markdown-Abruf, Purge

**Files:**
- Create: `website/src/pages/api/admin/sessions/history/index.ts`
- Create: `website/src/pages/api/admin/sessions/history/[id].ts`
- Create: `website/src/pages/api/admin/sessions/purge.ts`
- Test: `website/src/pages/api/admin/sessions/history/index.test.ts`

**Interfaces:**
- Consumes: `getSession`/`isAdmin` aus `../../../../lib/auth` (Tiefe prüfen: `api/admin/sessions/history/index.ts` → vier `../` nach `src/lib`); `listArchivedSessions`/`getArchivedMarkdown`/`purgeOldSessions` aus `../../../../../lib/sessions/archive`.
- Produces: `GET /api/admin/sessions/history?offset=&limit=&type=` → `{items,total,hasMore}` (401 anon, 403 nur wenn weder Admin noch eigener Nutzer — hier: jeder authentifizierte Nutzer darf seine eigenen sehen, Admin alle); `GET /api/admin/sessions/history/[id]` → `text/markdown` oder 404; `POST /api/admin/sessions/purge` → `{purged, warnings}` (Admin-Cookie ODER `X-Cron-Token === process.env.SESSIONS_CRON_TOKEN`).

- [x] **Step 1: Failing-Test `history/index.test.ts` anlegen**

1. Anon → 401; authentifiziert nicht-Admin (`gekko`) → 200, nur eigene Items; Admin → 200, alle Items.
2. `?offset=0&limit=2` mit 5 Mock-Entries → `items.length===2`, `hasMore===true`, `total===5`.
3. `?type=form` → nur Form-Typ.
4. Registry-/Archiv-Pfad via `SESSIONS_ARCHIVE_DIR` auf Temp-Dir zeigen.

- [x] **Step 2: Test ausführen**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/history/index.test.ts`
Expected: FAIL — Modul `./index` fehlt.

- [x] **Step 3: Endpunkte implementieren**

- `history/index.ts`: `getSession` → 401 wenn null. `viewer = session.preferred_username`. `listArchivedSessions({viewer, isAdmin:isAdmin(session), offset, limit, type})`. Query-Params parseInt mit Defaults `offset=0, limit=50` (`limit` max 50).
- `history/[id].ts`: `id` gegen `^[a-z0-9-]+$` validieren (Traversal-Schutz). `getArchivedMarkdown(id)` → 200 `text/markdown` oder 404. Auth-Guard wie oben (Admin oder Owner — Owner via Meta-Lookup: wenn nicht Admin, nur响应 wenn `meta.owner === viewer`).
- `purge.ts`: Admin-Cookie (`isAdmin`) ODER Header `X-Cron-Token` gleich `process.env.SESSIONS_CRON_TOKEN` (konstanten Vergleich, Token unset → Cron-Pfad deaktiviert, nur Admin). Bei Erfolg `{purged, warnings}` zurück; Fehler → 500 mit `requestLogger.error`.

- [x] **Step 4: Test ausführen — muss PASS sein**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/history/index.test.ts`
Expected: PASS.

- [x] **Step 5: Zeilen-Budget-Check je Endpunkt**

Run: `wc -l website/src/pages/api/admin/sessions/history/index.ts website/src/pages/api/admin/sessions/history/[id].ts website/src/pages/api/admin/sessions/purge.ts`
Expected: jeweils < 600 (Ziel je < ~120).

- [x] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/sessions/history/ website/src/pages/api/admin/sessions/purge.ts
git commit -m "feat(api): add sessions history + purge endpoints [T000994]"
```

---

## Task 4: SessionsHistory.svelte — Listen-UI

**Files:**
- Create: `website/src/components/sessions/SessionsHistory.svelte`
- Create: `website/src/components/sessions/SessionsHistory.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/sessions/history?offset=&limit=&type=` und `GET /api/admin/sessions/history/[id]`.
- Produces: chronologische Kartenliste (Typ-Icon, Titel, Datum, Teilnehmer); Typ-Filter-Dropdown; „Mehr laden"-Button (Pagination 50); Klick öffnet Markdown in einem Read-Only-Panel. Svelte 5 Runes (`$state`, `$effect`).

- [x] **Step 1: Failing-Test `SessionsHistory.test.ts` anlegen**

1. Mock `fetch` liefert 2 Items → Komponente rendert beide Karten mit Titel + Datum.
2. Klick auf eine Karte → `fetch` nach `/api/admin/sessions/history/<id>` wird gerufen und Markdown-Panel zeigt den Inhalt (read-only).
3. Typ-Filter `form` gewählt → Fetch-URL enthält `type=form`.
4. „Mehr laden" mit `hasMore:true` → weiterer Fetch mit `offset=50`.
5. Leere Liste → „Keine vergangenen Sessions" Hinweis.

- [x] **Step 2: Test ausführen**

Run: `cd website && npx vitest run src/components/sessions/SessionsHistory.test.ts`
Expected: FAIL — Komponente `./SessionsHistory.svelte` fehlt.

- [x] **Step 3: Komponente implementieren**

- `$state items, loading, error, offset, hasMore, typeFilter, selectedMarkdown, selectedId`.
- `load(reset=false)`: Fetch `/api/admin/sessions/history?offset=${offset}&limit=50${typeFilter?'&type='+typeFilter:''}`; bei `reset` Items ersetzen, sonst anhängen; `hasMore` aus Response.
- `open(s)`: Fetch `/api/admin/sessions/history/${s.id}` → `selectedMarkdown` setzen; Fehler → Platzhalter „Inhalt nicht verfügbar".
- Typ-Icon-Map: `form → 📋`, `brainstorm → 🎯`, sonst `🧩`.
- Template: Filter-Dropdown, Karten-Liste (`<ul>`), „Mehr laden"-Button (nur wenn `hasMore`), Markdown-Panel (`<pre>`/`<article>` read-only, schließbar).
- `$effect`-Cleanup für Fetch-Abbrüche (AbortController).

- [x] **Step 4: Test ausführen — muss PASS sein**

Run: `cd website && npx vitest run src/components/sessions/SessionsHistory.test.ts`
Expected: PASS — alle 5 Testfälle grün.

- [x] **Step 5: Zeilen-Budget-Check**

Run: `wc -l website/src/components/sessions/SessionsHistory.svelte`
Expected: < 500 (Ziel < ~300).

- [x] **Step 6: Commit**

```bash
git add website/src/components/sessions/SessionsHistory.svelte website/src/components/sessions/SessionsHistory.test.ts
git commit -m "feat(sessions): add SessionsHistory list UI with filter + pagination [T000994]"
```

---

## Task 5: MediaviewerPanel.svelte — History-View einbinden

**Files:**
- Modify: `website/src/components/MediaviewerPanel.svelte` (ist 166, Limit 500 — Restbudget ~334, unkritisch)

**Interfaces:**
- Consumes: `SessionsHistory` aus Task 4.
- Produces: ein Umschalter zwischen „Aktive Sessions" und „History" im Idle-State; bei Auswahl „History" wird `SessionsHistory` gerendert.

- [x] **Step 1: Tab-State + Import ergänzen**

Im `<script lang="ts">`: `import SessionsHistory from './sessions/SessionsHistory.svelte';` (Import-Pfad an die bestehende Struktur anpassen — Komponente liegt unter `sessions/`). Neuer `$state sessionsTab: 'active' | 'history' = 'active'` (oder ein Toggle-Boolean, falls der bestehende Idle-Branch nur eine View kennt).

- [x] **Step 2: Template-Branch erweitern**

Im Idle-Branch (dort wo `SessionsListView` aus T000975 gerendert wird) einen Tab-Umschalter ergänzen und den `{:else if}`-Zweig `sessionsTab === 'history'` → `<SessionsHistory />` hinzufügen. Bestehende Widget/Grilling/Embed-Branches bleiben unangetastet.

- [x] **Step 3: Build/Type-Check-Gate**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -20`
Expected: keine neuen Fehler in `MediaviewerPanel.svelte`. Falls `svelte-check` nicht verdrahtet: `cd website && npm run build` muss kompilieren.

- [x] **Step 4: Zeilen-Budget-Check**

Run: `wc -l website/src/components/MediaviewerPanel.svelte`
Expected: < 500 (≈ 210 nach Ergänzungen).

- [x] **Step 5: Commit**

```bash
git add website/src/components/MediaviewerPanel.svelte
git commit -m "feat(sessions): wire SessionsHistory tab into MediaviewerPanel idle state [T000994]"
```

---

## Task 6: scripts/sessions-purge.sh — Purge-Wrapper + BATS

**Files:**
- Create: `scripts/sessions-purge.sh`
- Create: `tests/unit/sessions-purge.bats`

**Interfaces:**
- Consumes: `SESSIONS_PURGE_URL` (Default `http://website.workspace.svc.cluster.local:80/api/admin/sessions/purge` für in-cluster; host-seitig via `https://dev.<brand-domain>/api/admin/sessions/purge` überschreibbar), `SESSIONS_CRON_TOKEN`.
- Produces: Exit 0 bei HTTP 200, Exit ≠ 0 bei Fehler; stdout gibt `{purged, warnings}` weiter.

> Stil: folgt `scripts/session-hub.sh` — `#!/usr/bin/env bash`, `set -uo pipefail`, Header-Kommentar mit `[T000994]`, `usage()`. Keep < 500 Zeilen.

- [x] **Step 1: BATS-Test anlegen (gemockter curl)**

`tests/unit/sessions-purge.bats`:
- `SESSIONS_CRON_TOKEN` gesetzt, `curl` via `PATH`-Stub auf ein Skript, das HTTP 200 + JSON simuliert → Aufruf Exit 0, stdout enthält `"purged":`.
- Token fehlt → Exit ≠ 0, stderr-Hinweis.
- curl liefert HTTP 500 → Exit ≠ 0.

- [x] **Step 2: Test ausführen**

Run: `bats tests/unit/sessions-purge.bats`
Expected: FAIL — `scripts/sessions-purge.sh` fehlt.

- [x] **Step 3: Script implementieren**

```bash
#!/usr/bin/env bash
# scripts/sessions-purge.sh — triggert den 30-Tage-Sessions-Purge via Website-Endpoint. [T000994]
set -uo pipefail
URL="${SESSIONS_PURGE_URL:-http://website.workspace.svc.cluster.local:80/api/admin/sessions/purge}"
TOKEN="${SESSIONS_CRON_TOKEN:-}"
[ -n "$TOKEN" ] || { echo "sessions-purge: SESSIONS_CRON_TOKEN required" >&2; exit 2; }
resp=$(curl -fsS -X POST "$URL" -H "X-Cron-Token: $TOKEN" --max-time 30) || {
  echo "sessions-purge: purge endpoint failed (HTTP $?)" >&2; exit 1;}
printf '%s\n' "$resp"
```

- [x] **Step 4: Ausführbar machen, Tests ausführen**

```bash
chmod +x scripts/sessions-purge.sh
bats tests/unit/sessions-purge.bats
```
Expected: PASS — alle Tests grün.

- [x] **Step 5: Commit**

```bash
git add scripts/sessions-purge.sh tests/unit/sessions-purge.bats
git commit -m "feat(sessions): add sessions-purge.sh cron wrapper [T000994]"
```

---

## Task 7: SESSIONS_CRON_TOKEN — Schema + SealedSecret

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `environments/.secrets/<env>.yaml` (gitignored, nicht committbar)
- Modify: `environments/sealed-secrets/<env>.yaml` (committet, via `task env:seal`)

**Interfaces:**
- Produces: ein neues SealedSecret-Feld `SESSIONS_CRON_TOKEN`, das vom CronJob (Task 8) und vom Purge-Endpoint (Task 3) konsumiert wird.

- [x] **Step 1: Schema-Eintrag**

In `environments/schema.yaml` einen Eintrag für `SESSIONS_CRON_TOKEN` ergänzen (`secret: true`, Beschreibung: „Shared secret for the sessions-purge cronjob to call POST /api/admin/sessions/purge via X-Cron-Token header."). Schema-Struktur an bestehende Einträge (z.B. `SESSION_HUB_OIDC_SECRET`) anpassen.

- [x] **Step 2: Plaintext-Secret befüllen (je Env)**

Für jedes Env (mentolder, korczewski): `SESSIONS_CRON_TOKEN` in `environments/.secrets/<env>.yaml` setzen — Zufallswert via `openssl rand -hex 32`. Datei ist gitignored.

- [x] **Step 3: Validieren + versiegeln**

```bash
task env:validate ENV=mentolder
task env:seal ENV=mentolder
```
Expected: `env:validate` bestanden; `env:seal` schreibt `environments/sealed-secrets/mentolder.yaml` neu mit `SESSIONS_CRON_TOKEN`. Verifikation:

Run: `grep -c "SESSIONS_CRON_TOKEN" environments/sealed-secrets/mentolder.yaml`
Expected: `1`

Analog für `ENV=korczewski`.

- [x] **Step 4: Commit (nur versiegelte Datei + Schema)**

```bash
git add environments/schema.yaml environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
git commit -m "feat(secrets): add SESSIONS_CRON_TOKEN for sessions-purge cronjob [T000994]"
```

(`environments/.secrets/*.yaml` ist gitignored und wird bewusst nicht gestaged.)

---

## Task 8: k3d/admin-actions-cronjobs.yaml — sessions-purge CronJob (shared_changes)

**Files:**
- Modify: `k3d/admin-actions-cronjobs.yaml` (shared — neuer `---`-Block wird angehängt; bestehende CronJobs unverändert)

**Interfaces:**
- Consumes: `SESSIONS_CRON_TOKEN` aus `workspace-secrets` (Task 7); den in-cluster Website-Service `website.workspace.svc.cluster.local:80`; den Purge-Endpoint aus Task 3.
- Produces: ein `CronJob` `sessions-purge` (Namespace `workspace`, Schedule `0 4 * * *` — täglich 04:00, analog `admin-actions-prune`), der `curl -fsS -X POST` gegen den Purge-Endpoint mit `X-Cron-Token` ausführt.

> S3: im CronJob nur in-cluster Service-Names (`website.workspace.svc.cluster.local`) — keine Brand-Domain-Literale.

- [x] **Step 1: CronJob-Document anhängen**

An das Ende von `k3d/admin-actions-cronjobs.yaml` (nach dem letzten `---`-Block von `admin-actions-prune`) einen weiteren `---`-Block anfügen, der `admin-actions-prune` als Vorlage nutzt und folgende Änderungen vornimmt:
- `metadata.name: sessions-purge`
- `schedule: "0 4 * * *"`
- Container `name: sessions-purge`, Image `curlimages/curl:8.6.0` (oder bestehendes alpine+curl, falls im Repo bereits genutzt — ansonsten `alpine:3.20` mit `apk add --no-cache curl` im command).
- `env`: `SESSIONS_CRON_TOKEN` aus `secretKeyRef: { name: workspace-secrets, key: SESSIONS_CRON_TOKEN }`.
- `command`: `sh -c` mit `curl -fsS -X POST http://website.workspace.svc.cluster.local:80/api/admin/sessions/purge -H "X-Cron-Token: $SESSIONS_CRON_TOKEN" --max-time 30` (plus `set -e` und Hinweis-Log).
- Resources analog den bestehenden CronJobs (`50m/64Mi` requests, `200m/128Mi` limits).

- [x] **Step 2: Kustomize-Build-Gate (S4 — Manifest referenziert & parsebar)**

```bash
kubectl kustomize k3d/ 2>/dev/null | grep -c "sessions-purge"
```
Expected: Zähler > 0 (der neue CronJob rendert). Falls `kubectl kustomize` fehlschlägt (YAML-Parse-Fehler oder nicht referenziert), vor Fortfahren korrigieren — prüfen, dass `k3d/admin-actions-cronjobs.yaml` in der jeweiligen `kustomization.yaml` unter `resources:` gelistet ist (bestehende Einbindung unverändert lassen).

- [x] **Step 3: S3-Self-Check — keine Brand-Domain-Literale**

Run: `grep -nE 'mentolder\.de|korczewski\.de' k3d/admin-actions-cronjobs.yaml | grep -v '^[0-9]*:#' || echo "S3 OK — keine Brand-Literale außerhalb Kommentare"`
Expected: `S3 OK — keine Brand-Literale außerhalb Kommentare`.

- [x] **Step 4: Commit**

```bash
git add k3d/admin-actions-cronjobs.yaml
git commit -m "feat(infra): add sessions-purge cronjob to admin-actions-cronjobs [T000994]"
```

---

## Task 9: Finale Verifikation (PFLICHT)

**Files:** none (verification only).

**Interfaces:** consumes alles oben.

> Zwingendes Schluss-Gate. Jeder Befehl muss grün sein, bevor der PR öffnet.

- [x] **Step 1: Zielgerichtete Tests für die geänderten Domains**

```bash
task test:changed
```
Expected: PASS — Vitest `--changed` (pickt `archive.test.ts`, `history/index.test.ts`, `SessionsHistory.test.ts`), die BATS-Auswahl (`tests/unit/sessions-purge.bats`) und `quality:check`.

- [x] **Step 2: Frische generierte Artefakte aktualisieren**

```bash
task freshness:regenerate
```
Expected: regeneriert `website/src/data/test-inventory.json` (inkl. der neuen Tests) und weitere generierte Artefakte. Geänderte Artefakte stagen.

- [x] **Step 3: Frische- + Qualitäts-Ratchet (CI-Äquivalent — S1–S4 + Baseline-Assertion)**

```bash
task freshness:check
```
Expected: PASS — keine S1-Zeilenlimit-Regressionen, keine S2-Import-Zyklen, keine S3-Brand-Domain-Literale (Task 8 S3-Self-Check nochmal gegen das gebaute Manifest), keine S4-Orphans, `baseline.json`-Key-Count nicht gewachsen. Falls S3 fehlschlägt, Task 8 auf Brand-Literale re-checken. Falls S4 fehlschlägt, `kustomization.yaml`-Referenz re-checken.

- [x] **Step 4: Regenerierte Artefakte committen**

```bash
git add website/src/data/test-inventory.json docs/code-quality/ docs/generated/ 2>/dev/null || true
git status --short
git commit -m "chore: regenerate freshness artifacts for sessions-history-archive [T000994]" || echo "nichts zu regenerieren"
```

---

## Self-Review (gegen die Spec geprüft)

**Spec-Abdeckung — jeder Abschnitt mappt auf einen Task:**
- Kern-Nutzerflow (chronologische Liste, Typ-Icon, Titel, Datum, Teilnehmer, Klick → Markdown read-only) → Task 4 + Task 5.
- 30-Tage-Purge aus JSON, Markdown in `sessions-archive/` Flat-Files → Task 1 (`purgeOldSessions`) + Task 6/8 (Cronjob).
- Sichtbarkeit Admin = alle, Gekko = eigene → Task 2 (`listArchivedSessions` Filter) + Task 3 (API-Guard).
- Keine Volltext-Suche, nur chronologisch + Typ-Filter → Task 4 (Typ-Filter-Dropdown, chronologische Sorte).
- Akzeptanzkriterium 1 (neue View) → Task 4/5; AC2 (Liste) → Task 4; AC3 (Klick → Markdown) → Task 4; AC4 (>30 Tage purgen, Markdown behalten) → Task 1/8; AC5 (Sichtbarkeit) → Task 2/3.
- Edge Cases: korrupte JSON → Task 1 (`corrupt-registry`-Warning); Entry ohne Markdown → Task 1 (Platzhalter, `content_available:false`); >500 archivierte → Task 2/4 (Pagination 50).
- Fehlerfälle: Flat-File nicht lesbar → Task 2 (`getArchivedMarkdown` → null) + Task 4 (UI-Hinweis); Cronjob kaputt → Task 8 (CronJob `failedJobsHistoryLimit:2`) + Task 6 (Exit-Code-Log).
- Erfolgsmetrik: ≤30s Finden → Task 4 (chronologische Liste, ein Klick); täglicher Purge → Task 8 (Schedule `0 4 * * *`).

**Out-of-scope respektiert:** keine Volltext-Suche, keine öffentliche Sichtbarkeit, keine DB-Migration (JSON + Flat-Files bleiben primär).

**Typ-Konsistenz:** `ArchivedSession`-Shape `{id,slug,type,title,date,participants,owner,content_available}` ist identisch in Task 2 (Produzent), Task 3 (API-Durchreichung) und Task 4 (Konsumer). Event-/Endpoint-Namen `/api/admin/sessions/history` und `/api/admin/sessions/purge` sowie `X-Cron-Token`-Header stimmen zwischen Task 3, Task 6 und Task 8 überein.
