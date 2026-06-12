# Spec: Website — Zeitgesteuertes Veröffentlichen (T000615)

**Datum:** 2026-06-11  
**Ticket:** T000615  
**Branch:** feature/T000615-scheduled-publish  
**Status:** draft  
**Autor:** dev-flow-plan (autonom)

---

## 1. Problemstellung

Newsletter-Kampagnen werden heute ausschließlich manuell gesendet: der Admin öffnet die Compose-UI, klickt „Senden" und die Kampagne geht sofort raus. Es gibt keine Möglichkeit, eine Kampagne auf einen zukünftigen Zeitpunkt zu planen (z. B. „Dienstag 09:00 Uhr"). Das führt dazu, dass Admins zu bestimmten Uhrzeiten aktiv im System sein müssen, statt Inhalte vorzubereiten und den Versand zu delegieren.

---

## 2. Ziel & Scope

### In Scope
- **Newsletter-Kampagnen** (`newsletter_campaigns`): Kampagnen können mit einem `scheduled_publish_at`-Timestamp versehen werden. Status `scheduled` signalisiert, dass die Kampagne auf ihren Zeitpunkt wartet. Ein Kubernetes CronJob feuert alle 5 Minuten und löst fällige Kampagnen aus.
- **Timezone:** Europe/Berlin für die Admin-UI-Eingabe; intern werden alle Timestamps als `TIMESTAMPTZ` (UTC) gespeichert.
- **Idempotenz:** Jeder CronJob-Lauf führt maximal eine "atomare" Status-Transition pro Kampagne durch (kein Doppelversand).

### Explizit NICHT in Scope
- Coaching-Templates: Haben bereits `published_at`, aber Scheduling ist dort aus Nutzersicht nicht sinnvoll (Templates werden zugewiesen, nicht "veröffentlicht").
- Vertragsvorlagen: Kein Publish-Konzept, nur Zuweisung per `document_assignments`.
- Blog-Posts: Kein Blog-System vorhanden.
- Benachrichtigungen bei Versand (z. B. Admin-E-Mail "Kampagne wurde versendet") — separates Ticket.

---

## 3. User Stories

| ID | Als… | Möchte ich… | Damit… |
|----|------|-------------|--------|
| US-1 | Admin | beim Verfassen einer Newsletter-Kampagne ein Sendedatum/Uhrzeit angeben | die Kampagne automatisch zum richtigen Zeitpunkt versendet wird |
| US-2 | Admin | den geplanten Sendezeitpunkt einer Kampagne sehen und ändern | ich Fehler korrigieren kann ohne die Kampagne zu löschen |
| US-3 | Admin | geplante Kampagnen als "scheduled" in der Kampagnenliste erkennen | ich den Überblick über ausstehende Sendungen behalte |
| US-4 | Admin | eine geplante Kampagne wieder auf "draft" zurücksetzen | ich sie vor dem geplanten Versand noch bearbeiten kann |
| US-5 | System | dass der Scheduler idempotent arbeitet | auch bei CronJob-Restart keine Kampagne doppelt versendet wird |

---

## 4. Funktionale Anforderungen

### 4.1 Datenbankschema-Änderung

Tabelle `newsletter_campaigns` (in `website/src/lib/newsletter-db.ts` via `ensureTables()`):

```sql
-- Idempotente Migration via ensureTables():
ALTER TABLE newsletter_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;
```

Der Status-Check-Constraint ist im ursprünglichen CREATE TABLE **nicht** als `CHECK`-Constraint definiert (die Tabelle hat `status TEXT NOT NULL DEFAULT 'draft'` ohne CHECK). Daher kann `'scheduled'` als neuer Status-Wert ohne DDL-Constraint-Änderung verwendet werden. Die Validierung erfolgt auf Applikationsebene.

Neues TypeScript-Interface:
```typescript
interface NewsletterCampaign {
  id: string;
  subject: string;
  html_body: string;
  status: 'draft' | 'scheduled' | 'sent';
  scheduled_publish_at: Date | null;
  sent_at: Date | null;
  recipient_count: number | null;
  created_at: Date;
  updated_at: Date;
}
```

### 4.2 Send-Logik refactoring

Die bestehende Versand-Logik in `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts` muss in eine wiederverwendbare Funktion in `newsletter-db.ts` (oder `newsletter-send.ts`) extrahiert werden:

```typescript
// Neu: newsletter-send.ts (oder Erweiterung newsletter-db.ts)
export async function sendCampaignById(campaignId: string): Promise<{
  success: boolean;
  recipientCount: number;
  error?: string;
}>;
```

Die HTTP-Route `/api/admin/newsletter/campaigns/[id]/send` ruft dann diese Funktion auf. Der CronJob-Endpunkt ebenfalls.

### 4.3 Atomare Status-Transition (Idempotenz-Garantie)

Vor dem Versand: Status-Lock via atomarer UPDATE + RETURNING:

```sql
-- Nur die Kampagnen holen, die noch nicht gesendet werden (Lock vor Konkurrenz):
UPDATE newsletter_campaigns
SET status = 'sending'   -- temporärer Lock-Status
WHERE id = $1
  AND status = 'scheduled'
  AND scheduled_publish_at <= NOW()
RETURNING id, subject, html_body;
```

Falls `RETURNING` keine Zeile liefert: Kampagne wurde bereits von einem parallelen Lauf verarbeitet → überspringen.

Nach Versand: `UPDATE ... SET status = 'sent', sent_at = NOW()` oder `SET status = 'scheduled'` bei Fehler (Rollback auf scheduled, damit nächster Lauf es erneut versucht).

**Status-Übergänge:**
```
draft → scheduled   (Admin setzt scheduled_publish_at)
scheduled → sending  (CronJob: atomarer Lock)
sending → sent      (CronJob: Versand erfolgreich)
sending → scheduled  (CronJob: Versand fehlgeschlagen, Retry beim nächsten Lauf)
scheduled → draft   (Admin: Abbrechen/Zurücksetzen)
```

**Hinweis:** `'sending'` ist ein interner Lock-Status, der in der UI als `scheduled` angezeigt wird (kurze Übergangsphase, <1 Minute). Die UI-Typen zeigen nur `draft | scheduled | sent`.

### 4.4 Neuer Cron-API-Endpunkt

**Datei:** `website/src/pages/api/cron/scheduled-publish.ts`

```typescript
// GET /api/cron/scheduled-publish
// Auth: Authorization: Bearer $CRON_SECRET
// Verarbeitet alle fälligen scheduled-Kampagnen
```

Logik:
1. Bearer-Token prüfen (analog `notify-unread.ts`)
2. Alle Kampagnen mit `status IN ('scheduled', 'sending') AND scheduled_publish_at <= NOW()` laden
3. Für jede: atomaren Lock (→ `sending`) setzen, dann `sendCampaignById()` aufrufen
4. Erfolg: `status = 'sent'`, Fehler: `status = 'scheduled'` (Retry-Logik)
5. Response: `{ processed: N, sent: M, errors: [...] }`

### 4.5 Kubernetes CronJob

**Datei:** `k3d/cronjob-scheduled-publish.yaml`

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: scheduled-publish
  namespace: workspace
spec:
  schedule: "*/5 * * * *"   # alle 5 Minuten
  timeZone: "Europe/Berlin"  # Kubernetes 1.27+, k3d/k3s unterstützt das
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          securityContext:
            runAsNonRoot: true
            runAsUser: 65534
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: publish
              image: curlimages/curl:8.7.1
              securityContext:
                allowPrivilegeEscalation: false
                runAsNonRoot: true
                runAsUser: 65534
                capabilities:
                  drop: ["ALL"]
              command:
                - sh
                - -c
                - |
                  curl -sf -X GET \
                    -H "Authorization: Bearer $CRON_SECRET" \
                    http://website.website.svc.cluster.local/api/cron/scheduled-publish
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: CRON_SECRET
```

**Kustomization:** Eintrag in `k3d/kustomization.yaml` unter `resources:`.

**Korczewski-URL-Patch:** Eintrag in `prod-korczewski/patch-cronjob-urls.yaml` mit korczewski-spezifischer Service-URL (analog zu `billing-dunning`, `notify-unread`).

### 4.6 Admin-UI — Compose-Tab

In `website/src/components/admin/NewsletterAdmin.svelte`, Compose-Tab:

**Neues UI-Element:** Datetime-Picker ("Geplantes Sendedatum"):
```
[ ] Sofort senden
[x] Geplant senden: [ 2026-06-15 ] [ 09:00 ]   ← datetime-local input
```

**Verhalten:**
- Wenn "Sofort senden" → bisheriges Verhalten (Confirm-Dialog → sofortiger Versand)
- Wenn "Geplant senden" + Datum in der Zukunft → `PUT /api/admin/newsletter/campaigns/[id]` mit `{ scheduled_publish_at, status: 'scheduled' }` → Kampagne landet in Status `scheduled`
- Validation: geplantes Datum muss ≥ jetzt + 5 Minuten (damit der nächste CronJob-Lauf es aufnehmen kann)

**Status-Badge in der Kampagnenliste:**
- `draft` → grau
- `scheduled` → blau (mit relativem Datum: "In 2 Tagen")
- `sent` → grün

**Abbrechen eines geplanten Versands:**
- Button "Planung aufheben" in der Kampagnendetail-Ansicht → `PUT /api/admin/newsletter/campaigns/[id]` mit `{ scheduled_publish_at: null, status: 'draft' }`

### 4.7 Update-API-Endpunkt

**Datei:** `website/src/pages/api/admin/newsletter/campaigns/[id].ts`

PUT-Handler um `scheduled_publish_at` ergänzen:

```typescript
// Erlaubte Body-Felder für PUT:
interface UpdateCampaignBody {
  subject?: string;
  html_body?: string;
  scheduled_publish_at?: string | null;  // ISO 8601
  status?: 'draft' | 'scheduled';        // 'sent' nicht via PUT setzbar
}

// Validierung:
if (body.status === 'scheduled' && !body.scheduled_publish_at) {
  return 400; // scheduled_publish_at muss gesetzt sein
}
if (body.scheduled_publish_at) {
  const dt = new Date(body.scheduled_publish_at);
  if (dt <= new Date()) return 400; // muss in der Zukunft liegen
}
```

---

## 5. Nicht-funktionale Anforderungen

| Anforderung | Wert |
|---|---|
| CronJob-Granularität | 5 Minuten (max. Versatz: 5 min) |
| Idempotenz | Garantiert via atomarem UPDATE ... WHERE status='scheduled' RETURNING |
| Timezone | Europe/Berlin in der UI; UTC in der DB (TIMESTAMPTZ) |
| Doppelversand-Schutz | Status-Lock `sending` verhindert parallele Verarbeitung |
| Skalierung | CronJob `concurrencyPolicy: Forbid` — kein paralleler Job |
| Fehlerbehandlung | Fehlgeschlagene Kampagnen gehen zurück zu `scheduled` (Retry beim nächsten Lauf) |
| Logging | CronJob-Response-Body enthält `{ processed, sent, errors }` |

---

## 6. Technische Entscheidungen (ADR-Style)

### ADR-1: Kein `CRON_SECRET` neu anlegen
**Entscheidung:** Verwende den bestehenden `CRON_SECRET` aus `workspace-secrets`. Dieser existiert bereits (`billing-dunning.yaml`, `notify-unread-cronjob.yaml` nutzen ihn). Kein Schema-Änderung nötig.

### ADR-2: `sending` als temporärer Lock-Status
**Entscheidung:** Statt einer separaten Lock-Tabelle wird der Status `sending` als Mutex verwendet. Der CronJob setzt `status = 'sending'` atomar via `UPDATE ... WHERE status='scheduled' RETURNING`. Falls ein Pod abstürzt, bleibt der Status `sending` stehen — nach `timeoutSeconds` (5 min) greift der nächste Lauf ihn nicht auf. Um Deadlocks zu vermeiden, wird `sending`-Status nach 10 Minuten automatisch auf `scheduled` zurückgesetzt (Cleanup in der CronJob-Logik).

### ADR-3: `timeZone` im CronJob
**Entscheidung:** `spec.timeZone: "Europe/Berlin"` im CronJob-YAML setzen (Kubernetes 1.27+, k3s/k3d unterstützen das). Damit wird das cron-Schedule in Berliner Zeit interpretiert. Das ändert nichts an der UTC-DB-Speicherung, vereinfacht aber die Wartung des Schedules.

### ADR-4: Keine dedizierte `newsletter-send.ts`-Datei
**Entscheidung:** Send-Logik als Funktion in `newsletter-db.ts` (statt separate Datei). Konsistent mit dem Muster im Repo (alle DB-Funktionen in `*-db.ts`). Falls die Datei zu groß wird, kann später extrahiert werden.

### ADR-5: Korczewski-URL-Patch Pflicht
**Entscheidung:** Korczewski-Patch MUSS mitgeliefert werden. Ohne ihn würde der CronJob im `workspace-korczewski` Namespace den mentolder-Service ansprechen (stilles Cross-Brand-Fehlverhalten). Dies ist ein etabliertes Pflichtmuster für alle neuen CronJobs.

---

## 7. Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/lib/newsletter-db.ts` | `ADD COLUMN scheduled_publish_at`, Status-Typ erweitern, `sendCampaignById()` extrahieren, `updateCampaign()` erweitern |
| `website/src/pages/api/admin/newsletter/campaigns/[id].ts` | PUT: `scheduled_publish_at` + Status-Transition-Validation |
| `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts` | Refactoring auf `sendCampaignById()` aus `newsletter-db.ts` |
| `website/src/pages/api/cron/scheduled-publish.ts` | NEU: CronJob-Endpunkt |
| `website/src/components/admin/NewsletterAdmin.svelte` | Datetime-Picker, Status-Badge, "Planung aufheben"-Button |
| `k3d/cronjob-scheduled-publish.yaml` | NEU: CronJob-Manifest |
| `k3d/kustomization.yaml` | `resources:` Eintrag für neues CronJob-YAML |
| `prod-korczewski/patch-cronjob-urls.yaml` | URL-Patch für korczewski Namespace |
| `tests/unit/newsletter-scheduled-publish.bats` | NEU: BATS-Tests für Cron-Endpunkt |

---

## 8. Test-Plan

### Unit-Tests (BATS)
- `newsletter-scheduled-publish.bats`: CronJob-Endpunkt-Tests (offline, curl-Mock)
  - Auth-Check: fehlender Bearer-Token → 401
  - Keine fälligen Kampagnen → 200 `{ processed: 0 }`
  - Eine fällige Kampagne → Status-Transition (mock)
  - Bereits `sending` → kein Doppelversand

### E2E-Tests (Playwright, Projekt: `website-admin`)
- Admin kann Kampagne mit zukünftigem Datum planen
- Kampagne erscheint als "scheduled" in der Liste
- Admin kann Planung aufheben → zurück zu `draft`
- (Zeitablauf-Test via DB-Manipulation + CronJob-API-Aufruf)

### Playwright-Projekt-Zuweisung
Projekt: `website-admin` (bestehend, für Admin-UI-Tests).

---

## 9. Offene Fragen (bewusst als Entscheidungen abgeschlossen)

| Frage | Entscheidung |
|-------|--------------|
| Retry bei Versand-Fehler — wie oft? | Unbegrenzt (alle 5 min), da Versand-Fehler transient sein können (z. B. SMTP kurz down) |
| Max. "sending"-Lock-Dauer? | 10 Minuten — nach 10 min `sending` → zurück zu `scheduled` via Cleanup-Query |
| UI: eigene "Geplante Kampagnen"-Ansicht? | Nein, Badge in bestehender Kampagnenliste reicht |
| Soll der Admin beim Versand benachrichtigt werden? | Nein (separates Ticket) |
| Coaching-Templates scheduling? | Nein (Out of Scope) |
