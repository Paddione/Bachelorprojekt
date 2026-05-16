# Session-Management-Erweiterung — Design-Spec

**Datum:** 2026-05-15
**Branch:** feature/session-management-erweiterung
**Betrifft:** Triadisches KI-Coaching Session-System (Admin-Bereich)

---

## Kontext

PR #745 hat das triadische KI-Coaching Session-System eingeführt
(`coaching.sessions`, `coaching.session_steps`, `SessionWizard.svelte`).
Diese Erweiterung fügt Session-Statusverwaltung, Suche/Sortierung,
KI-Provider-Konfiguration, Prompt-Template-Verwaltung und einen
vollständigen Audit-Trail hinzu.

---

## 1. Datenbank-Änderungen

### 1.1 `coaching.sessions` — Erweiterungen

```sql
ALTER TABLE coaching.sessions
  ADD COLUMN client_name TEXT NULL,
  ADD COLUMN archived_at TIMESTAMPTZ NULL;

-- Status-Erweiterung: 'paused' hinzufügen
ALTER TABLE coaching.sessions
  DROP CONSTRAINT sessions_status_check;
ALTER TABLE coaching.sessions
  ADD CONSTRAINT sessions_status_check
    CHECK (status IN ('active','paused','completed','abandoned'));
```

- `client_name`: Klartext-Name für Lesbarkeit ohne JOIN (ergänzt das bestehende `client_id`)
- `archived_at`: Soft-Delete-Flag; NULL = nicht archiviert. Archivierte Sessions werden
  standardmäßig aus der Übersichtsliste ausgeblendet.
- Neuer Status `paused`: Session pausiert, aber noch nicht abgeschlossen.

### 1.2 Neue Tabelle `coaching.session_audit_log`

```sql
CREATE TABLE coaching.session_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL
                REFERENCES coaching.sessions(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
                CHECK (event_type IN
                  ('status_change','field_change','ai_request','notes_change')),
  actor       TEXT NOT NULL,
  step_number INT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_session ON coaching.session_audit_log(session_id, changed_at DESC);
```

Payload-Schemas je Event-Typ:
- `status_change`: `{ "from": "active", "to": "paused" }`
- `field_change`: `{ "field": "title|client_id|client_name", "from": "...", "to": "..." }`
- `ai_request`: `{ "provider": "claude", "model": "...", "prompt": "...", "response": "...", "duration_ms": 800 }`
- `notes_change`: `{ "step": 3, "from": "alte Notiz", "to": "neue Notiz" }`

### 1.3 Neue Tabelle `coaching.ki_config`

```sql
CREATE TABLE coaching.ki_config (
  id           SERIAL PRIMARY KEY,
  brand        TEXT NOT NULL,
  provider     TEXT NOT NULL
                 CHECK (provider IN ('claude','openai','mistral','lumo')),
  is_active    BOOLEAN NOT NULL DEFAULT false,
  model_name   TEXT NULL,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, provider)
);
```

Seed (einmalig, für jede Brand — das Ensure-Script iteriert über bekannte Brands):
```sql
INSERT INTO coaching.ki_config (brand, provider, is_active, model_name, display_name)
VALUES
  ('mentolder',  'claude',  true,  'claude-haiku-4-5-20251001', 'Claude (Anthropic)'),
  ('mentolder',  'openai',  false, 'gpt-4o-mini',               'ChatGPT (OpenAI)'),
  ('mentolder',  'mistral', false, 'mistral-small-latest',       'Mistral'),
  ('mentolder',  'lumo',    false, NULL,                         'Lumo'),
  ('korczewski', 'claude',  true,  'claude-haiku-4-5-20251001', 'Claude (Anthropic)'),
  ('korczewski', 'openai',  false, 'gpt-4o-mini',               'ChatGPT (OpenAI)'),
  ('korczewski', 'mistral', false, 'mistral-small-latest',       'Mistral'),
  ('korczewski', 'lumo',    false, NULL,                         'Lumo')
ON CONFLICT (brand, provider) DO NOTHING;
```

Invariante: Genau ein Eintrag pro Brand hat `is_active = true`.

### 1.4 Neue Tabelle `coaching.step_templates`

```sql
CREATE TABLE coaching.step_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand             TEXT NOT NULL,
  step_number       INT NOT NULL,
  step_name         TEXT NOT NULL,
  phase             TEXT NOT NULL,
  system_prompt     TEXT NOT NULL,
  user_prompt_tpl   TEXT NOT NULL,
  input_schema      JSONB NOT NULL DEFAULT '[]',
  keywords          TEXT[] NOT NULL DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, step_number)
);
```

- `input_schema`: JSON-Array der Eingabefelder `[{ key, label, required, placeholder }]`
- `keywords`: Schlagwörter für Suche/Filter
- `user_prompt_tpl`: Handlebars-ähnliche Template-Syntax `{{field_key}}`

**Migration:** Die 10 bestehenden Step-Definitionen aus `coaching-session-prompts.ts`
werden als Seed-Daten eingefügt. Die TS-Datei bleibt als Fallback bis alle Brands
migriert sind.

---

## 2. Backend-Änderungen

### 2.1 `coaching-session-db.ts`

Neue/geänderte Funktionen:
- `listSessions(pool, brand, opts: ListSessionsOpts)` — server-seitige Paginierung und Filterung:
  ```ts
  interface ListSessionsOpts {
    q?: string;          // Freitext-Suche auf title, client_name
    status?: string[];   // Filter auf Status-Werte
    archived?: boolean;  // true = nur archivierte, false = ohne archivierte (default)
    sort?: 'title' | 'client_name' | 'created_at' | 'status';
    order?: 'asc' | 'desc';
    page?: number;       // 1-basiert
    pageSize?: number;   // Default: 20
  }
  interface ListSessionsResult {
    sessions: Session[];
    total: number;
    page: number;
    pageSize: number;
  }
  ```
- `updateSessionStatus(pool, id, newStatus, actor)` — Status ändern + Audit-Log
- `updateSessionFields(pool, id, fields: Partial<{title, clientId, clientName}>, actor)` — Felder ändern + Audit-Log
- `archiveSession(pool, id, actor)` — setzt `archived_at = now()` + Audit-Log
- `unarchiveSession(pool, id, actor)` — setzt `archived_at = null` + Audit-Log
- `appendAuditLog(pool, entry)` — intern genutzt von allen obigen Funktionen

### 2.2 Neue Datei `coaching-ki-config-db.ts`

```ts
listKiProviders(pool, brand): Promise<KiConfig[]>
getActiveProvider(pool, brand): Promise<KiConfig | null>
setActiveProvider(pool, brand, provider): Promise<void>  // atomares Umschalten
```

### 2.3 Neue Datei `coaching-templates-db.ts`

```ts
listStepTemplates(pool, brand): Promise<StepTemplate[]>
getStepTemplate(pool, brand, stepNumber): Promise<StepTemplate | null>
upsertStepTemplate(pool, template): Promise<StepTemplate>
deleteStepTemplate(pool, id): Promise<void>
```

### 2.4 Anpassung `generate`-Endpunkt

`/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`:
- Liest aktiven Provider aus `coaching.ki_config` statt hardcoded Claude
- Wählt API-Client je Provider (Anthropic / OpenAI / Mistral / Lumo)
- Liest Prompt aus `coaching.step_templates` (DB-first, Fallback auf TS-Konstanten)
- Schreibt `ai_request`-Eintrag in `session_audit_log`

---

## 3. API-Routen

### Session-Management

| Method | Pfad | Beschreibung |
|--------|------|--------------|
| `GET` | `/api/admin/coaching/sessions` | Paginierte Liste (`q`, `sort`, `order`, `page`, `status[]`, `archived`) |
| `PATCH` | `/api/admin/coaching/sessions/[id]` | Titel/Klient ändern |
| `PATCH` | `/api/admin/coaching/sessions/[id]/status` | Status-Wechsel |
| `POST` | `/api/admin/coaching/sessions/[id]/archive` | Archivieren |
| `POST` | `/api/admin/coaching/sessions/[id]/unarchive` | Archivierung rückgängig |
| `GET` | `/api/admin/coaching/sessions/[id]/audit` | Audit-Log (neueste zuerst) |

### KI-Provider

| Method | Pfad | Beschreibung |
|--------|------|--------------|
| `GET` | `/api/admin/coaching/ki-config` | Alle Provider mit Status |
| `PATCH` | `/api/admin/coaching/ki-config/active` | Aktiven Provider wechseln `{ provider }` |

### Prompt-Templates

| Method | Pfad | Beschreibung |
|--------|------|--------------|
| `GET` | `/api/admin/coaching/step-templates` | Alle Templates |
| `POST` | `/api/admin/coaching/step-templates` | Neues Template |
| `PATCH` | `/api/admin/coaching/step-templates/[id]` | Template bearbeiten |
| `DELETE` | `/api/admin/coaching/step-templates/[id]` | Template löschen |

---

## 4. Frontend

### 4.1 Sessions-Übersicht (`/admin/coaching/sessions`)

`index.astro` wird auf eine Svelte-Komponente `SessionsOverview.svelte` umgebaut.
Die Astro-Seite liefert nur initial geladene Daten (erste Seite) und übergibt
`totalCount` — der Rest (Suche, Sortierung, Status-Toggle, Paginierung) passiert
reaktiv via API.

Layout (top-down):
```
[Suche: Titel oder Klient...]       [+ Neue Session]
Status-Filter: [Alle] [Läuft] [Pause] [Abgeschlossen]
[☐ Archivierte anzeigen]

Tabelle:
  Titel↕ | Klient↕ | Datum↕ | Status     | Aktionen
  -------|---------|--------|------------|----------
  Name   | Müller  | 14.05  | [Läuft ▼]  | Öffnen [📦]
  ...
  < 1 2 3 > (Paginierung)
```

- Status-Dropdown je Zeile: `Läuft | Pause | Abgeschlossen` → `PATCH /status`
- `[📦]` Archivieren-Icon mit Inline-Confirm-Dialog
- Archivierte Zeilen: abgedämpft, `[↩]` statt `[📦]`

### 4.2 KI & Templates Settings (`/admin/coaching/settings`)

Neue Astro-Seite mit zwei Tabs (Svelte-Komponente `CoachingSettings.svelte`):

**Tab KI-Provider:**
- 4 Provider-Karten (Claude, ChatGPT, Mistral, Lumo)
- Aktiver Provider hervorgehoben, Klick auf "Aktivieren" wechselt
- Zeigt Env-Key-Status: `ANTHROPIC_API_KEY ✓ / ✗`

**Tab Prompt-Templates:**
- Tabelle der 10 Steps mit Edit-Icon
- Edit-Modal: step_name, phase, system_prompt (Textarea), user_prompt_tpl (Textarea), keywords (Tags)
- Neue Templates per "+ Vorlage" Button

### 4.3 Session-Detail (`/admin/coaching/sessions/[id]`)

Erweiterungen:
- Klienten-Name-Feld direkt editierbar (neben `client_id`)
- Neue Sektion am Ende: **Verlaufsprotokoll** (Audit-Log)
  - Kompakte Timeline (neueste zuerst), max. 50 Einträge
  - Icons je Event-Typ: 🔄 Status | ✏️ Feld | 🤖 KI | 📝 Notiz

---

## 5. Fehlerfälle & Constraints

- **KI nicht konfiguriert:** Wenn kein aktiver Provider `is_active=true` oder der zugehörige
  API-Key-Env fehlt → HTTP 503 mit `{ error: "KI-Provider nicht konfiguriert" }`
- **Status-Constraint:** `completed`-Sessions können nicht zurück auf `active` gesetzt werden
  (nur `abandoned` als Rückweg). Frontend deaktiviert diese Option im Dropdown.
- **Archiv-Guard:** Archivierte Sessions können nicht bearbeitet werden — Detail-Seite
  zeigt Banner und deaktiviert alle Edit-Inputs.
- **Template-Löschen:** Falls nur ein aktives Template für einen Step existiert, kann
  es nicht gelöscht werden (Frontend-Validation + API-Guard).

---

## 6. Testing

- Unit-Tests für alle neuen DB-Funktionen (pg-mem, Vitest — analog zu `coaching-session-db.test.ts`)
- API-Tests: Status-Wechsel-Constraints (completed → active verboten)
- Audit-Log: Jede mutative Operation schreibt einen Eintrag
- Keine E2E-Tests in diesem PR (existierende Session-Playwright-Tests bleiben grün)
