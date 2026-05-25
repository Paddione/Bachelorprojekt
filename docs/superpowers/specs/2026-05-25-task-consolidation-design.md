# Admin-Aktionen-Tab — Gekko-Operative-Selbständigkeit — Design

**Date:** 2026-05-25
**Branch:** `feature/task-consolidation`
**Ticket:** `T000272` (Grilling), Plan-Ticket folgt
**Scope:** Admin-only Web-UI (`/admin/platform` → neuer "Aktionen"-Tab) + 4 neue API-Routen-Gruppen + neue Audit-Tabelle
**Deadline:** Vor frischem Deployment ~2026-05-28 (3 Tage)

## Problem

Patrick + AI verbocken regelmäßig `task`-Namen aus ~184 Tasks im Taskfile; das wirkte initial wie der Hauptschmerz. Beim Grilling stellte sich aber heraus: **Gekko nutzt das Web-Dashboard, nicht CLI** — und das vorhandene `/admin/platform` (8 Tabs, 20+ Ops-APIs) ist zwar **observational** stark, aber für **Aktionen** lückenhaft. Konkret muss Gekko Patrick fragen für:

1. **Re-Deploys** (Website / Docs / Brett) — Pull-and-restart neuer Image-Versionen.
2. **Backup erstellen + Restore** — APIs existieren bereits (`/api/admin/ops/backup/{trigger,list}`, `/api/admin/ops/restore.ts`), aber keine UI.
3. **Anwender (Coaches) anlegen** + **AI-Aufgabe Knowledge-Reindex** auslösen.

Der ursprüngliche Auslöser "task consolidation" wird damit Phase 2 (post-Deployment, niedrigere Priorität). Phase 1 = Dashboard-Gap-Fill für Gekko, sodass nach dem frischen Deployment in 3 Tagen der Tagesbetrieb ohne Patrick läuft.

## Non-Goals

- **Kein Taskfile-Refactor.** Die 184 Tasks bleiben unverändert. Patricks CLI-Workflow ändert sich nicht. (Phase 2.)
- **Kein Skill-/Scripts-/CLAUDE.md-Cleanup.** Zu riskant unter 3-Tage-Druck. (Phase 2.)
- **Kein Coaching:classify-Trigger im Dashboard.** Coaching-Klassifikation läuft über OpenClaw auf Patricks WSL (Memory: `reference_local_llm_classify_workflow`) — Cluster-Pods erreichen das nicht direkt. Bleibt Patrick-CLI.
- **Kein Service-Restart-Knopf** (z.B. Nextcloud, Keycloak). Patrick behält das selbst.
- **Kein Secret-Rotation-Knopf**. Patrick behält das selbst.
- **Kein Rollback** zu vorherigen Image-Versionen — komplex, Phase 2.
- **Kein lokaler Image-Build aus Web-UI.** Builds passieren über CI (`build-website*.yml`, `build-brett.yml`, `build-docs.yml`) auf Push zu main. Gekko triggert nur Pull-and-Restart vom Registry.

## Architektur

Drei Bausteine, jeweils isoliert testbar:

```
PlatformHub.svelte (existiert)              Audit-Trail
+------------------------+                  +------------------------+
| Tabs: GitOps | Software|                  | public.admin_actions   |
|       Hardware | Health|     +--logs----->| id, actor, action,     |
|       Dienste | Logs   |     |            | target, cluster, status|
|       Datenbank | DNS  |     |            | payload(jsonb), error  |
|       AKTIONEN (neu) <-+-----+            | created_at             |
+------------------------+                  +------------------------+
       |
       v
+------------------------+                  +------------------------+
| AktionenTab.svelte     |                  | API-Routen (Astro)     |
| Sub-Tabs:              |     POST         | /api/admin/ops/        |
|   Releases             |--JSON----------->|   redeploy/{w|d|b}     |
|   Backups              |                  |   users/{create,list}  |
|   Anwender             |                  |   ai/reindex           |
|   Wissens-Index        |                  |   audit/log            |
|   (Verlauf — global)   |                  +------------------------+
+------------------------+                          |
                                                    v
                                          +------------------------+
                                          | k8s API (createK8sClient)
                                          | Keycloak Admin API     |
                                          | Postgres (admin_actions)
                                          +------------------------+
```

**Eintrag im Dashboard:** Neuer Tab `Aktionen` in `PlatformHub.svelte`, eingefügt **zwischen "Dienste" und "Logs"** in der bestehenden `tabs[]`-Array-Definition (Index 5 nach Insert). Gerendert über neue Komponente `AktionenTab.svelte` (selbst mit 4 inneren Action-Tabs + 1 globaler Verlauf-Tab = 5 Sub-Tabs). Begründung der Position: Aktionen-orientiert vor Read-Only-Logs/DB/DNS.

**Komponenten-Verzeichnis:** Neue Komponenten unter `website/src/components/admin/aktionen/`:
- `AktionenTab.svelte` (Container)
- `ReleasesTab.svelte`, `BackupsTab.svelte`, `UsersTab.svelte`, `KnowledgeTab.svelte`, `AuditLog.svelte`

Folgt dem bestehenden Layout-Pattern (`platform/` für PlatformHub-Tabs, `ops/` für Dienst-/Log-/DB-/DNS-Tabs).

**Auth-Flow:** Bestehendes Pattern: `oauth2-proxy` → `getSession()` → `isAdmin()`. Keycloak-Admin-Token aus SealedSecret `keycloak-admin-credentials` (existiert bereits für `task keycloak:sync`).

**Datenkonsistenz:** Alle Aktionen werden über die zentrale Audit-Tabelle `public.admin_actions` protokolliert. Vor jeder Action wird die Tabelle zur Concurrent-Trigger-Erkennung abgefragt (gleicher action+target innerhalb 10 Min → HTTP 409).

## Komponenten

### Komponente 1: `AktionenTab.svelte` (Container)

Container für 4 Aktions-Sub-Tabs + 1 globaler Verlauf-Tab.

```svelte
<script lang="ts">
  import ReleasesTab from './aktionen/ReleasesTab.svelte';
  import BackupsTab from './aktionen/BackupsTab.svelte';
  import UsersTab from './aktionen/UsersTab.svelte';
  import KnowledgeTab from './aktionen/KnowledgeTab.svelte';
  import AuditLog from './aktionen/AuditLog.svelte';
  export let cluster: string;
  let activeTab: 'releases' | 'backups' | 'users' | 'knowledge' | 'audit' = 'releases';
</script>
```

Konsistent mit existierendem Tabs-Styling aus `PlatformHub.svelte` (admin-Brand-Farben, `min-height: 44px` mobile tap targets).

### Komponente 2: `ReleasesTab.svelte` — Re-Deploys

Pro Service (Website / Docs / Brett) eine Karte mit:
- Pod-Status (gesund/degradiert/gestoppt) — pollt `/api/admin/deployments/[name]` (existiert)
- Aktuelles Image-Tag + Hash (kurz, z.B. `abc123`)
- Letzte Aktualisierung (formatiert in `vor X Std`)
- Pro Cluster (mentolder + korczewski): "Neue Version laden" Button + ℹ️-Help

Layout: Grid 1–3 Spalten responsive (`grid-cols-1 md:grid-cols-3`).

Polling während aktiven Redeploys: alle 5s `readyReplicas/replicas` bis sie übereinstimmen.

Help-Text (Modal/Tooltip): _"Lädt das aktuellste Image-Tag von ghcr.io und startet den Pod neu. Bestehende Anwender-Sitzungen werden ~10 Sekunden unterbrochen. Dauer: 30–90 Sekunden."_

### Komponente 3: `BackupsTab.svelte` — Backup & Restore

Liste der vorhandenen Backups (Tabelle):

| Datum | DB | Größe | Cluster | Status | Aktion |
|---|---|---|---|---|---|
| 2026-05-25 03:30 | website | 45 MB | mentolder | 🟢 | [Wiederherstellen] |

- Header: `[ Neues Backup ] [ DB ▼ ] [ Cluster ▼ ]` mit ℹ️
- API-Quelle: `/api/admin/ops/backup/list.ts` (GET — existiert)
- Trigger: `POST /api/admin/ops/backup/trigger.ts` (existiert)
- Restore: `POST /api/admin/ops/restore.ts` (existiert) — mit Doppel-Confirmation-Modal (Tippe `WIEDERHERSTELLEN` zur Bestätigung)

Help-Text: _"Backup-Erstellung dauert 1–3 Minuten. Wiederherstellung überschreibt die aktuelle Datenbank — nur in Notfällen verwenden! Du musst danach möglicherweise die betroffenen Pods neu starten."_

### Komponente 4: `UsersTab.svelte` — Anwender-Onboarding

Liste der Keycloak-User (Tabelle): Username | Vor-/Nachname | Email | Gruppen | Letzter Login.

- API-Quelle (neu): `GET /api/admin/ops/users/list` — proxiert Keycloak Admin `/users?max=200`
- "+Neuer Anwender" öffnet Modal:
  - Pflichtfelder: Vorname, Nachname, Email
  - Gruppen: Multi-Checkbox aus Keycloak-Gruppen (geladen via separates `GET /api/admin/ops/users/groups`)
  - Optional: ☑ "Einladungs-Email senden" (default an)
- Submit: `POST /api/admin/ops/users/create` (neu) mit Body `{firstName, lastName, email, groups[], sendInvite}`

Help-Text: _"Erstellt einen neuen Account in Keycloak. Bei aktivierter Einladung erhält der Anwender eine Email mit einem Temporär-Passwort, das beim ersten Login geändert werden muss. Der Anwender erscheint sofort in der Liste."_

### Komponente 5: `KnowledgeTab.svelte` — Wissens-Index

Liste aller Collections (Tabelle): Name | Letzter Index | Doc-Count | Embed-Modell.

- API-Quelle: `GET /api/admin/knowledge/collections` (existiert)
- Reindex-Trigger (neu): `POST /api/admin/ops/ai/reindex` mit Body `{collection}` — erzeugt k8s Job aus Template
- Job-Polling: alle 10s `Job.status.{succeeded,failed,active}` für Live-Feedback

Help-Text: _"Reindex liest alle Dokumente erneut, berechnet Embeddings (bge-m3 lokal über GPU-Host, voyage-multilingual über API) und schreibt sie in die Vektor-Datenbank. Dauer 2–10 Minuten je nach Collection-Größe. Während des Reindex sind Suchen ggf. langsamer."_

### Komponente 6: `AuditLog.svelte` — Verlauf (cross-cutting)

Unterhalb jedes Sub-Tabs: ausklappbare "Letzte 10 Aktionen in diesem Bereich".

Plus 5. Sub-Tab `Verlauf` global mit allen Aktionen + Filter (Datum-Range, Actor, Action-Typ).

- API: `GET /api/admin/ops/audit/log?action_filter=...&limit=...`
- Spalten: Datum | Actor | Aktion (deutsch) | Target | Status (🟢/🔴/🟡) | Details (Modal mit `payload` + `error`)

### Backend: Audit-Tabelle (`public.admin_actions`)

```sql
CREATE TABLE public.admin_actions (
  id          serial PRIMARY KEY,
  actor       text NOT NULL,
  action      text NOT NULL,
  target      text,
  cluster     text,
  payload     jsonb,
  status      text NOT NULL CHECK (status IN ('in_progress','success','failed','partial_success')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX admin_actions_created_at_idx ON public.admin_actions (created_at DESC);
CREATE INDEX admin_actions_concurrent_idx ON public.admin_actions (action, target, status)
  WHERE status = 'in_progress';
CREATE INDEX admin_actions_actor_idx ON public.admin_actions (actor, created_at DESC);
```

Migrations-Ort: `database/migrations/` als neue Datei, z.B. `2026-05-25_admin_actions.sql`.

### CronJobs (k8s)

**`admin-actions-cleanup`** — alle 30 Min:
```sql
UPDATE public.admin_actions
SET status = 'failed', error = 'Timeout — Aktion wurde nicht abgeschlossen', completed_at = now()
WHERE status = 'in_progress' AND created_at < now() - interval '30 minutes';
```

**`admin-actions-prune`** — täglich um 04:00:
```sql
DELETE FROM public.admin_actions WHERE created_at < now() - interval '90 days';
```

Beide als k8s CronJob in `k3d/admin-actions.yaml` (neue Datei, in `k3d/kustomization.yaml` aufnehmen).

## Datenfluss

Standard-Action (Re-Deploy als Referenz):

```
1. Gekko klickt "Neue Version laden" auf Website-Card
       ↓
2. Frontend: Button → disabled + spinner; toast.info("Wird ausgelöst...")
       ↓
3. POST /api/admin/ops/redeploy/website  Body: { cluster: 'mentolder' }
       ↓
4. Astro API-Route:
   a) getSession() → isAdmin() → sonst HTTP 401
   b) Validierung (cluster in ['mentolder','korczewski']) → sonst HTTP 400
   c) Concurrent-Check: SELECT FROM admin_actions WHERE …in_progress
      AND created_at > now() - interval '10 min' → bei Hit: HTTP 409
   d) INSERT INTO admin_actions (actor, action='redeploy_website',
      target='mentolder', cluster='mentolder', status='in_progress')
      RETURNING id → action_id
   e) k8s API: PATCH deploy/website -n website
      via annotation kubectl.kubernetes.io/restartedAt=<now>
   f) UPDATE admin_actions SET status='success', completed_at=now()
   g) HTTP 200 { action_id, message: 'Deployment gestartet' }
       ↓
5. Frontend: action_id gespeichert; startet Polling
       ↓
6. GET /api/admin/deployments/website?ns=website (alle 5s)
   → { desired: 2, ready: 1, status: 'rolling' }
   → Card: "Lädt neue Version... (1/2 Pods bereit)"
       ↓
7. ready === desired → stop polling
   → Card: "🟢 2/2 Pods (vor 30 Sek aktualisiert)"
       ↓
8. AuditLog refresht; Eintrag erscheint mit 🟢
```

**Spezielle Flows:**

- **Backup/Restore:** Schritt 4e wird Backup-API-Aufruf. Polling auf `Job.status.succeeded === 1`. Bei Erfolg: Backups-Liste re-fetcht.
- **User-Create:** Synchron, kein Polling (Keycloak antwortet sofort). Bei `sendInvite=true`: zusätzlich Keycloak `execute-actions-email` mit Action `UPDATE_PASSWORD`. Bei Partial-Failure (User angelegt, Mail fehlgeschlagen): `status='partial_success'`.
- **Reindex:** Schritt 4e ist k8s-Job-Create. Polling alle 10s auf Job-Status. Optional Live-Log-Streaming (Pattern aus `LogsTab.svelte`).

## Fehlerbehandlung

**HTTP-Status-Mapping (deutsche User-Messages):**
| Code | Frontend-Anzeige | Wann |
|---|---|---|
| 401 | "Bitte erneut anmelden" → Redirect /login | Session abgelaufen |
| 403 | "Keine Berechtigung für diese Aktion" | nicht-admin User |
| 400 | "Eingabe ungültig: <Feld>" | Validation-Fehler |
| 409 | "Diese Aktion läuft bereits seit X Minuten" | Concurrent-Trigger-Block |
| 500 | "Aktion fehlgeschlagen: <Kurzbeschreibung>" + Link "Verlauf öffnen" | Backend-Fehler |
| 503 | "Cluster nicht erreichbar. Bitte später erneut." | k8s/Keycloak down |

**Backend-Wrapper-Pattern** in jeder API-Route:

```typescript
const actionId = await insertActionRow(...)
try {
  const result = await executeAction(...)
  await updateActionRow(actionId, { status: 'success', payload: result })
  return new Response(JSON.stringify({ action_id: actionId, ...result }), { status: 200 })
} catch (err) {
  await updateActionRow(actionId, {
    status: 'failed',
    error: sanitizeForLog(err.message)  // entfernt Bearer-Tokens, Mail-PII, Secrets
  })
  throw err  // → centralized error → German message + correct HTTP code
}
```

**`sanitizeForLog`** in `website/src/lib/sanitize.ts` (neu): maskiert Bearer-Tokens, Postgres-URLs, Keycloak-Admin-Credentials.

**Frontend-Wrapper** `apiCall<T>()` in `website/src/lib/admin-api.ts` (neu):
- 401 → Redirect /login (preserve return URL)
- Network-Error → 1 Retry nach 3s + Toast "Verbindung verloren..."
- 5xx → roter Toast + Link "Verlauf öffnen" (öffnet AuditLog mit Filter)
- 200 → grüner Toast "Erfolgreich gestartet"

**Partial-Failure (User-Create + Email):**
- Schritt 1 (User) success, Schritt 2 (Mail) failed → `status='partial_success'`, error="User angelegt, Einladung fehlgeschlagen: <Grund>"
- Frontend: 🟡 "Anwender angelegt, aber Einladung konnte nicht gesendet werden. Bitte manuell einladen."

**DSGVO/Audit-Compliance:**
- Jede Action mit Actor (Keycloak-Username) geloggt
- Aufbewahrung 90 Tage (CronJob `admin-actions-prune`)
- Restore + User-Create + Backup zusätzlich als Info-Bug-Eintrag in `/admin/bugs` (Audit-Trail-Sichtbarkeit)

## Testing

### Unit-Tests (Vitest)

Pro neuer API-Endpunkt eine Test-Datei in `website/test/api/ops/` (neue Suite — exakte Position vom writing-plans-Schritt anhand existierender Vitest-Configs verifiziert).

- Mock: `createK8sClient`, Postgres-Pool, Keycloak-Admin-API
- Test-Fälle pro Endpunkt:
  - 200 happy path
  - 401 (keine Session)
  - 403 (nicht-admin)
  - 400 (Validation: ungültiger Cluster, ungültige DB, ungültige Email)
  - 409 (Concurrent-Trigger)
  - 500 (k8s/Keycloak wirft)
  - Sanitize-Test (Bearer-Token in Error wird maskiert)
- Coverage-Ziel: ≥80% Line-Coverage für `/api/admin/ops/**`

### Integration-Tests (BATS)

- `tests/integration/ops-admin-actions.bats`:
  - Insert action → execute mock → assert UPDATE auf success
  - Stale-Cleanup-CronJob entfernt alte `in_progress` Einträge
  - Concurrent-Check liefert 409 bei laufender gleicher Action
- `tests/integration/admin-actions-schema.bats`:
  - Verifiziert dass Migrations-Datei sauber durchläuft
  - Verifiziert dass Constraints (CHECK status) greifen

### E2E-Tests (Playwright)

Spec-Datei: `tests/e2e/specs/sa-21-admin-actions.spec.ts`
Playwright-Projekt: **`mentolder`** (Admin-Login via storageState `.auth/mentolder-website-admin.json`)

Test-Fälle:
1. Login → /admin/platform → "Aktionen"-Tab klicken → 4 Sub-Tabs + Verlauf sichtbar
2. Releases: Website-Card sichtbar, Button "Neue Version laden" enabled, mentolder + korczewski Sektionen
3. Backups: Liste mit ≥1 Eintrag (oder leere-state Anzeige), "Neues Backup"-Modal öffnet, Cluster/DB-Dropdown
4. Anwender: Liste lädt, "+Neuer Anwender"-Modal öffnet, Email-Validation schlägt bei `not-an-email` an
5. Wissens-Index: Collections-Liste lädt, Reindex-Button pro Collection sichtbar (kein tatsächlicher Trigger im E2E)
6. Audit-Log: nach Test-Triggern erscheint Eintrag mit Actor/Action/Status
7. Concurrent-Trigger: 2× hintereinander klicken auf Re-Deploy → 2. Klick zeigt 409-Toast
8. Restore-Confirmation: Modal verlangt Tippen von "WIEDERHERSTELLEN", Submit ohne korrekt eingegebenes Wort failed

**NICHT in CI ausgeführt** (Side-Effects auf live Cluster) — nur als nightly Spec oder gegen Read-Only-Mocking.

### Mandatory-Sequences Regression-Test (BATS)

`tests/integration/mandatory-sequences.bats` (neu):
- `task workspace:deploy` smoke (dry-run)
- `task feature:website:all-prods` adressiert mentolder + korczewski
- Cluster-reset-Sequence-Tasks alle existieren (`sealed-secrets:install`, `env:fetch-cert`, `env:seal`, `cert:install`, `cert:secret`, `workspace:deploy`)
- FluxCD-Sequence-Tasks existieren (`flux:status`, `flux:sync`)
- **Zweck:** verhindert dass spätere Refactors die kritische Reihenfolge brechen.

### Test-Inventory-Update

Nach Hinzufügen SA-21: `task test:inventory` → `website/src/data/test-inventory.json` committen.

## Out-of-Scope (zur Klarheit)

- Taskfile-Konsolidierung (Phase 2)
- Skills-Konsolidierung (Phase 2)
- Scripts-Cleanup (Phase 2)
- CLAUDE.md-Routing-Tightening (Phase 2)
- Re-Deploy-Rollback zu vorheriger Version
- Service-Restart-Knopf (Nextcloud, Keycloak, etc.)
- Secret-Rotation-Knopf
- Coaching:classify-Trigger (bleibt CLI/OpenClaw)
- Lokaler Image-Build aus Web-UI

## Akzeptanzkriterien

- [ ] `/admin/platform` zeigt neuen Tab "Aktionen" zwischen "Dienste" und "Logs"
- [ ] Releases-Tab: 3 Service-Karten (Website/Docs/Brett), pro Cluster je 1 Re-Deploy-Button, Live-Pod-Status während Deployment
- [ ] Backups-Tab: Liste lädt von existierender API, "Neues Backup" und "Wiederherstellen" funktionieren mit Doppel-Confirmation
- [ ] Anwender-Tab: Liste lädt aus Keycloak, "+Neuer Anwender" erstellt funktionierenden Account inkl. Einladungs-Mail
- [ ] Wissens-Index-Tab: Collections-Liste, Reindex-Button erstellt k8s Job, Polling zeigt Fortschritt
- [ ] Audit-Log: Tabelle `public.admin_actions` existiert; jede Action protokolliert; Verlauf-Tab zeigt Filter
- [ ] Concurrent-Check verhindert Doppel-Trigger innerhalb 10 Min (HTTP 409)
- [ ] Stale-Cleanup-CronJob entfernt alte `in_progress` Einträge nach 30 Min
- [ ] Pruning-CronJob entfernt Audit-Einträge älter 90 Tage
- [ ] Alle Aktionen mit ℹ️-Help-Button mit deutschem Erklärungstext
- [ ] Backend ≥80% Line-Coverage via Vitest
- [ ] BATS-Integration + Mandatory-Sequences-Regression grün
- [ ] Playwright SA-21 lokal manuell grün (8 Tests, Nightly-CI)
- [ ] Test-Inventory aktualisiert und committed
- [ ] Manual Smoke vor Merge: Gekko-Test-Login auf mentolder durchklickt alle 4 Tabs
- [ ] Frisches Deployment ~2026-05-28 nutzt das Feature ab Tag 1
