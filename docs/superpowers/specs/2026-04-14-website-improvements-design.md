# Design: Website Verbesserungen aus Bug-Reports

**Datum:** 2026-04-14  
**Betroffene Marke:** mentolder (und korczewski, gleiche Codebasis)  
**Quell-Reports:** BR-3adf, BR-4b91, BR-d624, BR-b576

---

## Überblick

Vier Verbesserungswünsche aus dem Mattermost `bugs`-Kanal werden in einem Sprint implementiert. Alle Änderungen gehen in `website/src/`.

---

## Feature 1 — BR-3adf: Mehrere Screenshots im Bug-Widget

### Ziel
Im `BugReportWidget` können bis zu **3 Screenshots** (je max. 5 MB, PNG/JPEG/WEBP) hochgeladen werden statt nur einem.

### Komponenten-Änderungen

**`BugReportWidget.svelte`**
- `file: File | null` → `files: File[]` (Array, max. 3 Einträge)
- `onFileChange`: Loop über `input.files`, validiere jede Datei (Größe + MIME), füge zum Array hinzu bis max. 3 erreicht
- Jede ausgewählte Datei hat ein "Entfernen"-Link
- `canSubmit`-Logik: `fileError` bleibt, prüft jetzt ob eine der Dateien ungültig ist
- `handleSubmit`: Loop über `files`, je ein `fd.append('screenshot', file, file.name)`
- Label: "Screenshots (optional, bis zu 3, max. 5 MB je Bild)"

**`/api/bug-report.ts`**
- Statt `formData.get('screenshot')` → `formData.getAll('screenshot')`
- Loop: validiere und uploade bis zu 3 Dateien
- Sammle `fileIds: string[]`, übergebe als `fileIds` an `postInteractiveMessage`
- Warnmeldung bei teilweisem Upload-Fehler (einzelne Dateien, nicht alle)

### Fehlerbehandlung
- Mehr als 3 Dateien: vierte wird abgelehnt mit Hinweis "Maximal 3 Screenshots erlaubt"
- Ungültige Datei: wird einzeln zurückgewiesen, andere bleiben

---

## Feature 2 — BR-4b91: Kontakt und Termin zusammenführen

### Ziel
`/kontakt` wird zur einzigen Anlaufstelle für alle Kontaktarten. `/termin` leitet weiter.

### Seitenstruktur

**`/kontakt`** — neue Struktur:
1. Seitenheader (unverändert)
2. **Drei Eingangskacheln** (neue `ContactHub.svelte` Komponente):
   - ✉️ Nachricht schreiben → öffnet `ContactForm`
   - 📅 Termin buchen → öffnet `BookingForm`
   - 📞 Rückruf anfragen → öffnet `BookingForm` mit `bookingType` auf `callback` vorbelegt
3. **Accordion-Bereich**: je nach gewählter Kachel expandiert das entsprechende Formular darunter
4. Rechte Spalte (Kontaktdaten, Sidebar) bleibt unverändert

**URL-Parameter:** `?mode=termin` und `?mode=callback` öffnen die entsprechende Kachel direkt (für Links aus E-Mails, Visitenkarten, etc.)

**`/termin.astro`** — wird umgebaut zu Redirect:
```astro
---
const params = new URLSearchParams(Astro.url.searchParams);
params.set('mode', 'termin');
return Astro.redirect(`/kontakt?${params.toString()}`, 301);
---
```
Damit werden `?date=`, `?start=`, `?end=` automatisch mitgereicht und `/kontakt` öffnet direkt die Termin-Kachel mit vorausgewähltem Datum.

### Neue Komponente: `ContactHub.svelte`

```
Props: initialMode?: 'message' | 'termin' | 'callback'
State: activeMode: 'message' | 'termin' | 'callback' | null

Render:
  - 3 Kacheln als Buttons (grid, responsive)
  - Accordion darunter: {#if activeMode === 'message'} <ContactForm /> ...
```

- `BookingForm` bekommt neues Prop `initialType?: string` um `bookingType` vorzubelegen
- Beim Wechsel der Kachel: vorherige Formulardaten bleiben erhalten (kein Reset)

### Keine Änderungen an
- `ContactForm.svelte` (außer ggf. kleinere Styling-Anpassungen für eingebetteten Kontext)
- `BookingForm.svelte` (bekommt nur `initialType`-Prop)
- Backend-APIs (`contact.ts`, `booking.ts`)

---

## Feature 3 — BR-d624: Bug-Status-Seite

### Ziel
Nutzer können auf `/status` ihren Ticket-Status nachschlagen, ohne sich einloggen zu müssen.

### Datenbankschema

Neue Tabelle `bug_tickets` in der bestehenden Meetings-PostgreSQL-DB (`meetings`-Namespace):

```sql
CREATE TABLE IF NOT EXISTS bug_tickets (
  ticket_id       TEXT PRIMARY KEY,          -- z.B. BR-20260414-9214
  status          TEXT NOT NULL DEFAULT 'open', -- open | resolved | archived
  category        TEXT NOT NULL,             -- fehler | verbesserung | erweiterungswunsch
  reporter_email  TEXT NOT NULL,
  description     TEXT NOT NULL,
  url             TEXT,
  brand           TEXT NOT NULL DEFAULT 'mentolder',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);
```

Migration wird in `meetings-schema.yaml` als SQL-ConfigMap ergänzt (analog zu bestehenden Tabellen).

### API-Änderungen

**`/api/bug-report.ts`** — nach erfolgreichem Mattermost-Post:
```ts
await db.query(
  'INSERT INTO bug_tickets (ticket_id, category, reporter_email, description, url, brand) VALUES ($1,$2,$3,$4,$5,$6)',
  [ticketId, category, email, description, url, BRAND]
);
```

**`/api/mattermost/dialog-submit.ts`** — nach `updatePost`:
```ts
await db.query(
  'UPDATE bug_tickets SET status=$1, resolved_at=NOW(), resolution_note=$2 WHERE ticket_id=$3',
  ['resolved', note, state.ticketId]
);
```

**`/api/mattermost/actions.ts`** — `archive_bug`-Case:
```ts
await db.query(
  "UPDATE bug_tickets SET status='archived' WHERE ticket_id=$1",
  [ticketId]
);
```

**Neuer Endpoint: `/api/status.ts`** (GET `?id=BR-XXXX`):
- Validierung: ID-Format `BR-\d{8}-[0-9a-f]{4}`
- Query: `SELECT status, category, created_at, resolved_at, resolution_note FROM bug_tickets WHERE ticket_id=$1`
- Antwort: `{ ticketId, status, category, createdAt, resolvedAt, resolutionNote }` oder `404`
- Rate-Limiting: max. 10 Anfragen/Minute per IP (einfaches In-Memory-Map)

### Neue Seite: `/status.astro`

- Suchformular: Eingabefeld für Ticket-ID + Button
- Suche via `fetch('/api/status?id=...')` clientseitig (kein Page-Reload)
- Anzeige:
  - **offen**: 🕐 gelb — "Ihr Report wird bearbeitet."
  - **erledigt**: ✅ grün — Datum + Lösungshinweis
  - **archiviert**: 🗂️ grau — "Dieser Report wurde archiviert."
  - **nicht gefunden**: Hinweis dass Ticket-ID geprüft werden soll
- Link im Footer und in der Bug-Erfolgsbestätigung: "Status unter /status prüfen"

### Datenbankverbindung

Wird in `meetings-db.ts` ergänzt (bestehende DB-Helper-Lib). Umgebungsvariable `SESSIONS_DATABASE_URL` ist bereits in `website-config` gesetzt.

---

## Feature 4 — BR-b576: DSGVO-Datenverwaltungsseite

### Ziel
Nutzer können auf `/meine-daten` ihre gespeicherten Daten einsehen und löschen. Seite ist ohne Login zugänglich.

### Neue Seite: `/meine-daten.astro`

Einbettung von `DataManagement.svelte` (Client-seitig, da localStorage-Zugriff).

Verlinkung:
- Footer: Link "Meine Daten" neben "Datenschutz"
- `/datenschutz` — neuer Abschnitt am Ende: "Ihre Rechte — Daten einsehen und löschen" mit Link

### Neue Komponente: `DataManagement.svelte`

Drei Sektionen:

**1. Cookie-Einstellungen**
- Liest `localStorage.getItem('cookie_consent_v1')`
- Zeigt aktuellen Konsens-Status (z.B. "Alle akzeptiert")
- Button "Einstellungen ändern" → `window.dispatchEvent(new Event('cookie-consent-reopen'))`

**2. Anmeldung / Session**
- Ruft `/api/auth/me` auf
- Eingeloggt: zeigt Username/E-Mail + Button "Ausloggen" → `/api/auth/logout`
- Nicht eingeloggt: "Kein Konto angemeldet" + Link zum Login

**3. Daten einsehen und löschen**

*Auskunft anfordern:*
- Button öffnet kleines Inline-Formular (Name + E-Mail)
- Sendet E-Mail an `CONTACT_EMAIL` mit Betreff "DSGVO-Auskunftsanfrage"
- Bestätigung: "Ihre Anfrage wurde übermittelt. Wir melden uns innerhalb von 30 Tagen."

*Löschung beantragen:*
- **Eingeloggt**: direkter Löschvorgang
  1. Dialog: "Sind Sie sicher? Dieser Vorgang kann nicht rückgängig gemacht werden."
  2. POST `/api/auth/delete-account`
  3. API löscht Keycloak-User via Admin-API (`DELETE /admin/realms/{realm}/users/{userId}`)
  4. Antwort: Redirect nach `/` mit Erfolgsmeldung
- **Nicht eingeloggt**: Formular (Name + E-Mail) → sendet Löschungsanfrage-E-Mail an `CONTACT_EMAIL`

### Neuer Endpoint: `/api/auth/delete-account.ts`

- Erfordert gültige Session (prüft `/api/auth/me` intern)
- Holt User-ID aus Session-Token
- Ruft Keycloak Admin-API auf: `DELETE /admin/realms/workspace/users/{userId}`
- Löscht Session-Cookie
- Gibt `{ success: true }` zurück

### Keycloak-Zugriff

Bestehende `keycloak.ts`-Lib hat bereits Admin-Token-Logik. Neue Funktion `deleteUser(userId: string)`:
```ts
export async function deleteUser(userId: string): Promise<boolean> {
  const token = await getAdminToken();
  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok || res.status === 404;
}
```

---

## Implementierungsreihenfolge

1. **BR-3adf** (Multiple Screenshots) — unabhängig, einfachste Änderung, kein Risiko
2. **BR-d624** (Status-DB-Schema) — Schema-Migration zuerst, dann API + Seite
3. **BR-4b91** (ContactHub) — neue Komponente, dann Seitenumbau + Redirect
4. **BR-b576** (DSGVO) — neue Seite + Keycloak-API, zuletzt weil es die meisten Dependencies hat

---

## Nicht im Scope

- Email-Benachrichtigung bei Status-Änderung (BR-d624 Variante B — wurde nicht gewählt)
- Mattermost-basierter Status-Lookup (wurde zugunsten DB verworfen)
- Manuelle DSGVO-Löschung per E-Mail für eingeloggte Nutzer (wird automatisiert)
- Design-Änderungen an bestehenden Formularen über das Notwendige hinaus
