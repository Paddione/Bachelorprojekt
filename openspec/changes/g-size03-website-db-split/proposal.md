# Proposal: g-size03-website-db-split

_Ticket: T001293_

## Why

`website/src/lib/website-db.ts` hat eine aktuelle Länge von 4435 Zeilen und ist damit die größte Nicht-Vendored-Quelldatei im gesamten Repo. Die Datei ist ein klassischer God-File: sie bündelt mindestens sechs sachlich unabhängige Domänen (Kundenstamm, Meetings, Buchungen/Termine, Projekte, Billing, CMS-Content) unter einem einzigen Modul-Handle. Dadurch entstehen drei konkrete Probleme:

1. **Merge-Konflikt-Hotspot.** Jeder parallele Branch, der irgendeinen DB-Zugriff hinzufügt, landet zwingend in dieser Datei — unabhängig davon, ob die Änderungen inhaltlich verwandt sind.
2. **Unkontrolliertes Wachstum.** Die Datei steht explizit in `gates.yaml s1.ignore` und wird deshalb weder vom Freeze-Gate noch von G-RH01 überwacht. Sie kann also unbegrenzt wachsen.
3. **Kognitive Last.** Jede Änderung erfordert das mentale Durchsuchen von 4435 Zeilen, um sicherzustellen, dass kein verwandter Code bereits existiert.

Das Split-Pattern ist im Repo bereits erprobt: `tickets-db.ts` (1096 Zeilen) wurde analog ausgelagert, ebenso wurden `newsletter-db.ts` (391 Zeilen) und `coaching-db.ts` (668 Zeilen) in früheren Schritten bereits in separate Module extrahiert. Diese Extraktion ist damit bereits der dritte abgeschlossene Schritt; die aktuelle Baseline von 4435 Zeilen spiegelt den Stand nach diesen vorherigen Auslagerungen wider.

Die verbleibende Lücke zum Ziel (≤ 3000 Zeilen, d. h. 1435 Zeilen müssen noch heraus) wird durch die Extraktion der **Termine/Buchungs-Domäne** in `appointments-db.ts` als primäre Maßnahme adressiert. Falls nach dieser Extraktion der Zielwert noch nicht erreicht ist, benennt der Implementierungsplan eine explizite Prüfstufe, die weitere Kandidaten (z. B. Meetings-Domäne) identifiziert.

## What

1. **`appointments-db.ts` anlegen** — die Terminbuchungs- und Kalender-Logik aus `website-db.ts` extrahieren. Betroffen sind alle Exports rund um `CalendarTask`, `CalendarProject`, `CalendarMeeting`, `BookingInvoiceInfo`, `WhitelistedSlot`, `FreeTimeWindow` sowie die zugehörigen `init*`-Funktionen und alle CRUD-Operationen (ca. Zeilen 2466–2970 in `website-db.ts`).

2. **Import-Umstellung** — alle Aufrufer (API-Routen unter `pages/api/admin/slots/`, `pages/api/booking.ts`, `pages/admin/termine.astro`, `pages/admin/kalender.astro` u. a.) importieren die Symbole künftig aus `appointments-db.ts` statt aus `website-db.ts`.

3. **Restmenge prüfen** — nach der Appointments-Extraktion wird `wc -l < website/src/lib/website-db.ts` erneut ausgeführt. Falls das Ergebnis noch > 3000 ist, wird eine weitere Extraktion (z. B. Meetings-Domäne, Zeilen 251–630) als Folgeschritt durchgeführt, bis der Zielwert erreicht ist.

4. **`s1.ignore`-Eintrag entfernen** — sobald `website-db.ts` dauerhaft ≤ 3000 Zeilen aufweist, wird der Eintrag aus `gates.yaml s1.ignore` gestrichen, sodass das Size-Gate fortan greift.

5. **Maßnahme validieren** — `bash scripts/health-goals-check.sh --only=G-SIZE03` muss grün melden; anschließend vollständige Test- und Freshness-Pipeline.

## Impact

**Neue Dateien:**
- `website/src/lib/appointments-db.ts` — Terminbuchungs- und Kalender-DB-Schicht (neu)

**Geänderte Dateien:**
- `website/src/lib/website-db.ts` — Appointments-Block entfernt; ggf. weitere Domänen-Blöcke entfernt
- `website/src/lib/newsletter-db.ts` — keine inhaltlichen Änderungen erwartet (bereits eigenständig)
- `website/src/lib/coaching-db.ts` — keine inhaltlichen Änderungen erwartet (bereits eigenständig)
- Sämtliche Import-Stellen in `website/src/pages/api/` und `website/src/pages/admin/`, die Appointments-Symbole aus `website-db` importieren

**Risiken:**
- TypeScript-Compiler und `task test:changed` fangen fehlende Re-Exporte zuverlässig ab; das Risiko unentdeckter Import-Brüche ist gering.
- Die `initDb`-Kaskade in `website-db.ts` muss die neue `initAppointmentsDb()`-Funktion aufrufen — sonst fehlen Tabellen zur Laufzeit.

**Out-of-Scope:**
- Änderungen an der Datenbankstruktur oder SQL-Schemas
- Extraktion weiterer Domänen, die nicht zur Appointments/Kalender-Logik gehören (werden nur dann angegangen, wenn sie zur Zielerreichung ≤ 3000 Zeilen zwingend notwendig sind)
- Änderungen am Keycloak-SSO-Flow oder Traefik-Ingress
