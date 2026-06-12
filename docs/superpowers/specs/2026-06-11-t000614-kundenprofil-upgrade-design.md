# T000614 — Website: Kundenprofil-Seiten Upgrade
## Design-Spec

**Datum:** 2026-06-11  
**Ticket:** T000614  
**Branch:** feature/T000614-kundenprofil-upgrade  
**Status:** staged  

---

## Problemstellung

Die bestehenden Kundenprofil-Seiten sind minimal:
- `KontoSection.astro` zeigt nur Name + E-Mail und verweist auf die Keycloak Account Console
- Die `customers`-Tabelle hat `phone` + `company`-Felder, die nie kundensei­tig editierbar waren
- Es gibt keine CRM-Felder für Kontakthistorie, Projekt-Status oder Kundenpräferenzen
- Das Design ist veraltet und entspricht nicht dem Industrial/Loft-Stil der Factory-UI

---

## Ziele (drei Dimensionen)

### D1 — Datenstruktur: CRM-Erweiterung
Neue Felder und eine neue Tabelle für vollständige CRM-Funktionalität.

### D2 — Design-Überholung
Portal `KontoSection` + Admin `[clientId]`-Seite im Industrial/Loft-Stil (factory-tokens.css).

### D3 — Self-Service
Kunden können ihr eigenes Profil editieren (Kontaktdaten, Präferenzen) — ohne Keycloak-Konsole.

---

## Architektur-Entscheidungen

### Dual-Identity-Modell beibehalten
- **Keycloak** bleibt Source of Truth für Identität (Name, E-Mail, Passwort)
- **`customers`-Tabelle** erhält alle CRM-Felder
- Bei Self-Service-Speicherung: Sync von `phone`/`company` nach Keycloak-Attributen (optional, low-priority)
- Name/E-Mail-Änderung: weiterhin über Keycloak Account Console (Sicherheitsgrenze)

### Neue DB-Felder in `customers`
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'DE';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT DEFAULT 'email';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS communication_frequency TEXT DEFAULT 'monatlich';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_status TEXT DEFAULT 'aktiv';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
```

### Neue Tabelle: `customer_contact_history`
```sql
CREATE TABLE IF NOT EXISTS customer_contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_user_id TEXT NOT NULL,
  contact_type TEXT NOT NULL,      -- 'email' | 'phone' | 'meeting' | 'note' | 'portal_login'
  subject TEXT,
  content TEXT,
  direction TEXT DEFAULT 'outbound', -- 'inbound' | 'outbound'
  admin_id TEXT,                   -- keycloak_user_id of the admin who logged it
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_customer_contact_history_user
  ON customer_contact_history(keycloak_user_id, created_at DESC);
```

### Neuer `customer_status`-Wertesatz
`'aktiv'` | `'inaktiv'` | `'potentiell'` | `'pausiert'` | `'abgeschlossen'`

---

## Feature-Scope

### Scope IN

**D1 — Datenstruktur:**
- `customers`-Tabelle: 11 neue Felder (Adresse, Präferenzen, Status, Tags)
- Neue Tabelle `customer_contact_history`
- DB-Funktionen: `updateCustomerProfile()`, `getCustomerProfile()`, `addContactHistoryEntry()`, `getContactHistory()`

**D2 — Design:**
- Portal `KontoSection.astro`: vollständige Überarbeitung im Industrial/Loft-Stil
  - Profil-Karte mit Basis­daten (nur read-only: Name, E-Mail, Kundennummer)
  - Editierbare Felder: Telefon, Firma, Adresse, Präferenzen (in einem separaten "Meine Daten"-Panel)
  - Kontakt-Kanal-Präferenz (E-Mail / Telefon / Portal-Nachricht)
  - Kommunikationsfrequenz-Präferenz (wöchentlich / zweiwöchentlich / monatlich / bei Bedarf)
  - Letzte Aktivität / Anmeldedatum
- Admin `[clientId].astro`: neuer Tab "Profil" mit CRM-Erweiterungsfeldern + Kontakthistorie-Timeline
  - CRM-Status-Badge (aktiv/inaktiv/potentiell/pausiert/abgeschlossen)
  - Tags-Editor
  - Akquisitionskanal
  - Kontakthistorie-Timeline (chronologisch, neueste zuerst)
  - Schnell-Hinzufügen: neuer Kontaktverlauf-Eintrag (Typ, Betreff, Notiz)

**D3 — Self-Service:**
- API `POST /api/portal/profile/update` — validiert und speichert editierbare Felder
- `KontoSection.astro` inline-Edit (kein Page-Reload): Svelte-Komponente `ProfileEditor.svelte`
- Optimistic UI: sofortiges visuelles Feedback, Fehlerbehandlung
- Keycloak-Attribut-Sync: `phone`-Attribut in KC bei Speicherung mitschreiben (via Admin API)

### Scope OUT
- Name/E-Mail/Passwort-Änderung (bleibt in Keycloak Account Console)
- Profilbild-Upload (eigenes Feature, späterer Sprint)
- Kunden-seitige Einsicht in Rechnungen (besteht bereits via Portal-Sections)
- Kontakthistorie für Kunden einsehbar (nur Admin-Seite)
- Export der Kontakthistorie (DSGVO-Antrag → `meine-daten.astro` ist bereits vorhanden)

---

## User Flows

### Flow A: Kunde editiert sein Profil
1. Kunde loggt sich ein → Portal → "Konto"-Tab
2. Neue Industrial/Loft-Profil-Karte sichtbar: Basis-Daten read-only, darunter "Profil bearbeiten"-Button
3. Click → `ProfileEditor.svelte` öffnet inline (kein Overlay)
4. Felder: Telefon, Firma, Straße/Ort/PLZ, Kontakt-Kanal-Präferenz, Kommunikationsfrequenz, optionale Bio
5. Speichern → `POST /api/portal/profile/update` → KC-Attribut-Sync → Erfolgsmeldung
6. Automatischer Eintrag in `customer_contact_history` mit `contact_type = 'profile_update'` + Timestamp

### Flow B: Admin sieht Kundenprofil-CRM
1. Admin → `/admin/<clientId>` → neuer Tab "Profil"
2. Basis-CRM-Block: Status-Badge, Akquisitionskanal, Tags
3. Timeline-Block: Kontakthistorie (Datum, Typ-Icon, Betreff, Inhalt)
4. Schnell-Formular: neuen Kontaktverlauf-Eintrag hinzufügen (Typ + Betreff + Text)
5. POST → `POST /api/admin/clients/contact-history/create`

### Flow C: Admin ändert Kunden-Status
1. Admin → `/admin/<clientId>` → Tab "Profil"
2. Status-Dropdown: aktiv/inaktiv/potentiell/pausiert/abgeschlossen
3. Speichern → `POST /api/admin/clients/update-crm` → Status + Tags + Akquisitionskanal schreiben
4. Erfolgsbestätigung inline

---

## Design-Spec: Industrial/Loft

### Farb-Token-Mapping (aus `factory-tokens.css` + `global.css`)
```
Hintergrund-Karte:    --factory-surface = #161b22
Border:               border border-[#30363d]
Accent aktiv:         --factory-accent = #f59e0b (amber)
Text primär:          #e6edf3
Text sekundär:        #8b949e
Mono-Font:            JetBrains Mono (für Kundennummern, Status-Codes)
```

### KontoSection — Layout
```
┌─────────────────────────────────────────────────────┐
│  [Avatar-Initiale]  Name                            │
│                     email@domain.de                 │
│                     Kundennummer: M0042  [mono]     │
│                     ● Aktiv seit: Mai 2024          │
├─────────────────────────────────────────────────────┤
│  MEINE KONTAKTDATEN                      [Bearbeiten]│
│  📞 Telefon:   +49 30 1234567                        │
│  🏢 Firma:     Mustermann GmbH                       │
│  📍 Adresse:   Musterstraße 1, 10115 Berlin          │
├─────────────────────────────────────────────────────┤
│  PRÄFERENZEN                                         │
│  Kontaktkanal:     ● E-Mail  ○ Telefon  ○ Portal   │
│  Frequenz:         Monatlich                         │
├─────────────────────────────────────────────────────┤
│  SICHERHEIT & KONTO                                  │
│  [Passwort ändern →]  [DSGVO-Daten →]               │
└─────────────────────────────────────────────────────┘
```

### Admin-Profil-Tab — Layout
```
┌─────────────────────────────────────────────────────┐
│  CRM-STATUS                                          │
│  Status: [AKTIV ▼]   Akquisition: [Weiterempfehlung]│
│  Tags: [website] [coaching] [+ Tag hinzufügen]       │
├─────────────────────────────────────────────────────┤
│  KONTAKTHISTORIE                         [+ Eintrag] │
│  ─────────────────────────────────────────────────  │
│  2026-06-10  📧 E-Mail  "Angebot versendet"          │
│              "Habe das Coaching-Angebot per..."      │
│  2026-06-05  📞 Telefon  "Erstgespräch"              │
│              "Kunde hat Interesse an..."             │
│  2026-05-20  🔑 Portal   "Profil erstellt"           │
└─────────────────────────────────────────────────────┘
```

---

## API-Design

### `POST /api/portal/profile/update`
Auth: session (authenticated customer, not admin)  
Body:
```typescript
{
  phone?: string;          // max 30 chars
  company?: string;        // max 100 chars  
  address?: string;        // max 200 chars
  city?: string;           // max 100 chars
  postal_code?: string;    // max 10 chars
  country?: string;        // ISO 3166-1 alpha-2
  preferred_contact_channel?: 'email' | 'phone' | 'portal';
  communication_frequency?: 'wöchentlich' | 'zweiwöchentlich' | 'monatlich' | 'bei_bedarf';
  bio?: string;            // max 500 chars
}
```
Response: `{ ok: true, updatedAt: string }` | `{ error: string }`  
Side effects:
- Writes to `customers` table
- Syncs `phone` to Keycloak user attribute `phoneNumber`
- Logs `customer_contact_history` entry with `contact_type = 'profile_update'`

### `POST /api/admin/clients/contact-history/create`
Auth: session (admin only)  
Body:
```typescript
{
  keycloak_user_id: string;
  contact_type: 'email' | 'phone' | 'meeting' | 'note';
  subject: string;
  content?: string;
  direction?: 'inbound' | 'outbound';
}
```

### `POST /api/admin/clients/update-crm`
Auth: session (admin only)  
Body:
```typescript
{
  keycloak_user_id: string;
  customer_status?: 'aktiv' | 'inaktiv' | 'potentiell' | 'pausiert' | 'abgeschlossen';
  acquisition_source?: string;
  tags?: string[];
}
```

---

## Komponentenliste

### Neue Svelte-Komponenten
- `website/src/components/portal/ProfileEditor.svelte` — Inline-Formular für Self-Service-Edit
- `website/src/components/admin/ContactHistoryTimeline.svelte` — Admin Kontakthistorie mit Schnell-Hinzufügen
- `website/src/components/admin/CrmStatusPanel.svelte` — Status + Tags + Akquisition (Admin)
- `website/src/components/portal/ProfileCard.svelte` — Read-only Profil-Karte (Industrial/Loft Design)

### Modifizierte Dateien
- `website/src/components/portal/KontoSection.astro` — komplett überarbeitet (nutzt ProfileCard + ProfileEditor)
- `website/src/pages/admin/[clientId].astro` — neuer "Profil"-Tab
- `website/src/lib/website-db.ts` — neue DB-Funktionen + Schema-DDL
- `website/src/lib/keycloak.ts` — `updateUserAttribute()` für Phone-Sync

### Neue API-Files
- `website/src/pages/api/portal/profile/update.ts`
- `website/src/pages/api/admin/clients/contact-history/create.ts`
- `website/src/pages/api/admin/clients/update-crm.ts`

---

## Test-Coverage

### Playwright-Projekt: `mentolder-authenticated`
- Kunde kann Profil öffnen und Felder sehen
- Kunde kann Telefon + Firma editieren + speichern → Erfolgsmeldung
- Ungültige Eingaben (zu lang) → Fehlermeldung

### Playwright-Projekt: `admin`
- Admin sieht neuen "Profil"-Tab auf Kundenseite
- Admin kann Kontakthistorie-Eintrag hinzufügen
- Admin kann CRM-Status ändern

### BATS-Tests (unit)
- `tests/unit/portal-profile-update.bats` — API-Validierung (Feldlängen, erlaubte Enum-Werte)

---

## Nicht-funktionale Anforderungen

- **DSGVO:** Alle neuen Felder sind im `meine-daten.astro`-Export zu berücksichtigen (DSGVO-Daten-Download). Die `customer_contact_history` enthält admin-seitige Notizen — für DSGVO-Anfragen exportierbar machen.
- **Performance:** Kontakthistorie-Abfragen sind durch den Index auf `(keycloak_user_id, created_at DESC)` gecovered. Max. 100 Einträge pro Anfrage (Pagination optional, erst wenn nötig).
- **Sicherheit:** Self-Service-API darf nur die eigene `keycloak_user_id` des eingeloggten Nutzers schreiben — serverseitig aus Session lesen, nie vom Client übergeben.
- **Konsistenz:** Alle neuen API-Endpunkte folgen dem bestehenden Pattern: `getSession()` → Guard → Parse → Validate → DB → `{ ok: true }`.

---

## Offene Fragen (Entscheidung: defer/nicht blockierend)

1. **Bio-Feld anzeigen?** — Feld in DB aufnehmen, aber im ersten Release aus der UI weglassen. Kein User-facing Input für Bio in v1.
2. **Tags in Admin-Ansicht filterbar?** — Nein, v1 zeigt Tags nur als Badges. Filter-Funktion in Clients-Liste ist separates Feature.
3. **Kontakthistorie für Kunden sichtbar?** — Nein. Nur Admin. Kunden sehen nur ihre eigenen Profil-Updates als Bestätigung.

---

## Implementierungs-Reihenfolge (Empfehlung)

1. **Phase A: DB-Migration** — DDL-Änderungen in `website-db.ts` + neue Funktionen
2. **Phase B: API-Layer** — 3 neue Endpoints (`profile/update`, `contact-history/create`, `update-crm`)
3. **Phase C: Admin-UI** — Neuer "Profil"-Tab in `[clientId].astro` + Svelte-Komponenten (CrmStatusPanel, ContactHistoryTimeline)
4. **Phase D: Portal-UI** — `KontoSection.astro` überarbeiten + `ProfileEditor.svelte` + `ProfileCard.svelte`
5. **Phase E: DSGVO-Erweiterung** — `meine-daten.astro` um neue Felder erweitern
6. **Phase F: Tests** — Playwright + BATS
