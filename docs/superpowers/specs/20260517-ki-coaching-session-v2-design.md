# KI-Coaching Session v2 — Design-Spec

**Datum:** 2026-05-17  
**Branch:** feature/ki-coaching-session-v2  
**Status:** approved

## Überblick

Vier zusammenhängende Verbesserungen am KI-Coaching-Modul:

1. Session-Übersicht zeigt Vor-/Nachname + Kundennummer statt UUID
2. Neues Projektkonzept — ein Projekt pro Klient, identifiziert durch Kundennummer
3. Mehrere Sessions pro Projekt (Klient) mit dauerhaftem KI-Kontext
4. KI-Anonymisierung — Klarname erscheint nie im KI-Prompt, nur Kundennummer

---

## 1. Datenbankschema

### Neue Tabelle `coaching.projects`

```sql
CREATE TABLE coaching.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT NOT NULL,
  client_id       UUID REFERENCES customers(id),
  customer_number TEXT NOT NULL,
  display_alias   TEXT,
  ki_context      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX coaching_projects_brand_client_id_idx
  ON coaching.projects (brand, client_id);
```

- `customer_number`: aus `customers.customer_number` übernommen — dient als anonymisierte KI-Kennung
- `display_alias`: optionaler interner Kurzname für den Coach (z.B. "Firma Müller"), nie an KI übergeben
- `ki_context`: dauerhafter, anonym formulierter Kontext, der jedem KI-Prompt für diesen Klienten vorangestellt wird
- `notes`: private Coach-Notizen, **nie** an KI übergeben
- Unique-Constraint `(brand, client_id)`: ein Projekt pro Klient pro Brand

### Änderung `coaching.sessions`

```sql
ALTER TABLE coaching.sessions
  ADD COLUMN project_id UUID REFERENCES coaching.projects(id);
```

- Bestehende Sessions ohne Klient (`client_id IS NULL`) behalten `project_id = NULL`
- Migration: bestehende Sessions mit `client_id` bekommen nachträglich ein Projekt zugewiesen

---

## 2. Backend — neue Dateien & Änderungen

### `website/src/lib/coaching-project-db.ts` (neu)

Funktionen:
- `findOrCreateProject(pool, brand, clientId)` — sucht bestehendes Projekt für `(brand, client_id)`, legt es bei Erstbesuch an (customer_number aus customers-Tabelle)
- `getProject(pool, id)` — Projekt inkl. aller Sessions
- `listProjects(pool, brand, opts)` — paginierte Liste mit Sessionzähler + letztem Kontakt
- `updateProject(pool, id, fields)` — `ki_context` + `notes` + `display_alias` aktualisieren

### `website/src/lib/coaching-session-db.ts` (geändert)

- `CreateSessionArgs` bekommt `projectId?: string | null`
- `createSession` speichert `project_id`
- `listSessions` JOIN auf `coaching.projects` → liefert `customer_number` + `projectId` pro Session
- `Session`-Interface bekommt `customerNumber: string | null` + `projectId: string | null`

### `website/src/pages/api/admin/coaching/sessions/index.ts` (geändert)

- `POST`: wenn `clientId` mitgegeben → `findOrCreateProject` aufrufen → `projectId` in Session speichern

### `website/src/pages/api/admin/coaching/projects/index.ts` (neu)
- `GET` — Projektliste
- `POST` — Projekt anlegen (manuell, für Edge Cases)

### `website/src/pages/api/admin/coaching/projects/[id].ts` (neu)
- `GET` — Projektdetail mit allen zugehörigen Sessions
- `PATCH` — `ki_context`, `notes`, `display_alias` aktualisieren

### `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` (geändert)

Anonymisierungsfluss:
1. Session laden → `projectId` auslesen
2. Falls `projectId`: Projekt laden → `customer_number` + `ki_context`
3. Effektiver System-Prompt: `[ki_context]\n\n[Template-System-Prompt]`
4. `{{KLIENT_ID}}` im System-Prompt wird mit `customer_number` ersetzt
5. User-Prompt: Coaching-Eingaben mit `"Klient [customer_number]: ..."` präfixiert
6. Klarname erscheint **nicht** im KI-Request

---

## 3. Frontend — neue Seiten & Komponenten

### Session-Übersicht-Fix

`SessionsOverview.svelte` Klient-Spalte:
- Vorher: `s.clientName ?? s.clientId ?? '—'`
- Nachher: `s.clientName ? `${s.clientName} (${s.customerNumber})` : '—'`

### Neue Seiten

```
/admin/coaching/projekte/index.astro       — Projektliste
/admin/coaching/projekte/[id].astro        — Projektdetail
```

### `ProjectsOverview.svelte` (neu)

Tabelle mit Spalten:
- Kundennummer (sortierbar)
- Name (Coach-intern, sortierbar)
- Sessions (Anzahl)
- Letzter Kontakt (Datum letzter Session)

Suche nach Kundennummer oder Name. Link zur Projektseite.

### `ProjectDetail.svelte` (neu)

Layout:
```
Projekt K-4711
Mustermann, Max  •  3 Sessions

[ KI-Kontext (an KI übergeben) ]
  Textfeld — anonym formuliert
  [Speichern]

[ Coach-Notizen (privat, nie an KI) ]
  Textfeld
  [Speichern]

Sessions
  Session 17.05.2026  Läuft   [Öffnen]
  Session 10.05.2026  Abges.  [Öffnen]
  [+ Neue Session für diesen Klienten]
```

### Navigation

`CoachingSection.svelte` oder das Admin-Coaching-Nav bekommt Eintrag **"Projekte"** neben "Sessions".

---

## 4. KI-Anonymisierung

### Invarianten

- `customer_number` ist die einzige klientenbezogene Information, die die KI sieht
- `ki_context` darf keine Klarnamen enthalten (Verantwortung des Coaches — UI-Hinweis)
- `coaching.projects.notes` wird **nie** an die KI übergeben
- Kein Cross-Projekt-Kontext: jeder KI-Request enthält nur Daten des eigenen Projekts

### System-Prompt-Variable

In Step-Templates wird `{{KLIENT_ID}}` als Platzhalter für die Kundennummer verwendet. `buildPromptFromTemplate` ersetzt diese Variable vor dem API-Call.

### Claude API

- Provider "claude" in `/admin/coaching/settings` → Feld `api_key` trägt den persönlichen Anthropic-API-Key
- Standard-Modell: `claude-haiku-4-5-20251001`
- Bereits implementiert in `ki_config`; kein neuer Code nötig — nur sicherstellen, dass der Key korrekt gespeichert und verwendet wird

---

## 5. Datenmigration

```sql
-- Bestehende Sessions mit client_id → Projekt anlegen und verknüpfen
INSERT INTO coaching.projects (brand, client_id, customer_number)
SELECT DISTINCT s.brand, s.client_id, COALESCE(c.customer_number, s.client_id::text)
FROM coaching.sessions s
JOIN customers c ON c.id = s.client_id
WHERE s.client_id IS NOT NULL
ON CONFLICT (brand, client_id) DO NOTHING;

UPDATE coaching.sessions s
SET project_id = p.id
FROM coaching.projects p
WHERE s.client_id = p.client_id
  AND s.brand = p.brand
  AND s.project_id IS NULL;
```

---

## 6. Nicht im Scope

- RAG über mehrere Sessions (cross-Session-Wissensbasis) — Phase 2
- Automatische Kontext-Einspeisung aus früheren Sessions — nur manuell via `ki_context`-Feld
- Lösch-Kaskade Projekt → Sessions (Sessions bleiben beim Projekt-Delete erhalten)
- Lumo-Provider-Integration
