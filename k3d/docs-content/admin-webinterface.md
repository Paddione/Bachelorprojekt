# Admin-Webinterface — Benutzerhandbuch

Das Admin-Panel ist die zentrale Verwaltungsoberfläche der Website. Es ermöglicht die Verwaltung von Kunden, Projekten, Terminen, Rechnungen, Inhalten und Systeminformationen — alles über den Browser, ohne direkten Serverzugriff.

---

## Zugang

| Umgebung | URL |
|----------|-----|
| mentolder | `https://web.mentolder.de/admin` |
| korczewski | `https://web.korczewski.de/admin` |

> Für Entwicklung steht zusätzlich `http://web.localhost/admin` im lokalen k3d-Cluster zur Verfügung.

**Voraussetzung:** Workspace-Konto mit der Gruppe `workspace-admins`. Ohne Login wirst Du zur zentralen Anmeldeseite (Keycloak SSO) weitergeleitet. Konten ohne Admin-Rechte werden automatisch auf das Kundenportal (`/portal`) gelenkt.

---

## Übersicht aller Bereiche

| Bereich | Pfad | Kurzbeschreibung |
|---------|------|-----------------|
| Inbox | `/admin/inbox` | Eingehende Kontaktanfragen |
| Nachrichten | `/admin/nachrichten` | Kunden-Chats und Direktnachrichten |
| Räume | `/admin/raeume` | Gruppenkanäle verwalten |
| Kunden | `/admin/clients` | Kundenverwaltung und -profile |
| Kundenprofil | `/admin/[clientId]` | Detailansicht eines Kunden |
| Projekte | `/admin/projekte` | Projektmanagement mit Gantt-Diagramm |
| Kalender | `/admin/kalender` | Aufgabenkalender (Monatsansicht) |
| Termine | `/admin/termine` | Buchungsverwaltung und Slot-Konfiguration |
| Follow-ups | `/admin/followups` | Wiedervorlagen und Erinnerungsaufgaben |
| Zeiterfassung | `/admin/zeiterfassung` | Arbeitszeiterfassung und CSV-Export |
| Rechnungen | `/admin/rechnungen` | Rechnungserstellung (ZUGFeRD-PDF, SEPA-Lastschrift) |
| Meetings | `/admin/meetings` | Aufgezeichnete Meetings und Transkripte |
| Monitoring | `/admin/monitoring` | Live-Kubernetes-Cluster-Übersicht |
| Bugs | `/admin/bugs` | Bug-Reports und Ticket-Tracking |
| Startseite | `/admin/startseite` | Inhalte der Startseite bearbeiten |
| Leistungen | `/admin/angebote` | Dienstleistungen und Preise pflegen |
| Über mich | `/admin/uebermich` | „Über mich"-Seite bearbeiten |
| Referenzen | `/admin/referenzen` | Kundennachweise verwalten |
| Kontakt | `/admin/kontakt` | Kontaktseite bearbeiten |
| FAQ | `/admin/faq` | Häufige Fragen bearbeiten |
| Rechtliches | `/admin/rechtliches` | Impressum, Datenschutz, AGB, Barrieref. |

---

## Bereiche im Detail

### Inbox `/admin/inbox`

Zeigt alle eingehenden Kontaktanfragen gruppiert nach Status. Statusübersichten (offen, bearbeitet, archiviert) werden als Zählerkarten dargestellt.

**Aktionen:**
- Nachrichten filtern (nach Typ und Status)
- Einzelne Anfrage aufrufen und beantworten
- Als bearbeitet markieren oder archivieren

---

### Nachrichten `/admin/nachrichten`

Thread-basierte Messaging-Zentrale für die Kundenkommunikation. Zeigt alle laufenden Gespräche mit Kunden.

**Aktionen:**
- Kundenkonversation auswählen und lesen
- Direkt antworten (Admin-Antwort erscheint im Kundenportal)
- Neues Gespräch mit einem Kunden starten

---

### Räume `/admin/raeume`

Verwaltung von Gruppenkanälen (Chat-Räumen), die mehrere Teilnehmer umfassen können.

**Aktionen:**
- Bestehende Räume anzeigen und betreten
- Nachrichten in Gruppenkanälen lesen und senden

---

### Kunden `/admin/clients`

Listet alle Keycloak-Benutzer als Kunden auf. Einstiegspunkt für die Kundendetailansicht.

**Aktionen:**
- Neuen Kunden anlegen (Keycloak-Konto wird erstellt)
- Kundenstatus ein-/ausblenden
- Zum Kundenprofil navigieren

---

### Kundenprofil `/admin/[clientId]`

Detailansicht eines einzelnen Kunden mit Tabs für alle kundenbezogenen Daten.

**Tabs:**
| Tab | Inhalt |
|-----|--------|
| Buchungen | Termine des Kunden; neue Buchung für den Kunden erstellen |
| Rechnungen | Rechnungen des Kunden; Status und Links |
| Notizen | Interne Notizen zu diesem Kunden |
| Dateien | Hochgeladene Dokumente des Kunden |
| Signaturen | Unterzeichnete Dokumente |
| Meetings | Aufgezeichnete Meetings mit diesem Kunden |
| Onboarding | Onboarding-Status und Checkliste |

Zusätzlich: Keycloak-Rollen des Kunden anzeigen und anpassen.

---

### Projekte `/admin/projekte`

Vollständiges Projektmanagementsystem mit Gantt-Diagramm.

**Datenstruktur:**
```
Kunde → Projekt → Teilprojekt → Aufgabe
```

**Aktionen:**
- Projekte anlegen, bearbeiten, löschen
- Teilprojekte und Aufgaben zuordnen
- Status setzen: `entwurf → wartend → geplant → aktiv → erledigt → archiviert`
- Priorität: `hoch | mittel | niedrig`
- Nach Status, Priorität oder Freitext filtern
- Gantt-Diagramm anzeigen (Zeitachse aller terminierten Projekte)
- CSV-Export aller Projekte (`/api/admin/projekte/export`)
- Statistik-Kacheln: Gesamt / Aktiv / Überfällig / Erledigt

Detailseite eines Projekts: `/admin/projekte/[id]`

---

### Kalender `/admin/kalender`

Monatsansicht aller Aufgaben aus dem Projektmanagementsystem.

**Aktionen:**
- Monat vor-/zurückblättern
- Aufgaben nach Priorität und Status farblich differenziert anzeigen
- Auf eine Aufgabe klicken → Weiterleitung zur Projektdetailseite

---

### Termine `/admin/termine`

Verwaltung aller Buchungen (Termine, Beratungsgespräche).

**Aktionen:**
- Alle Buchungen anzeigen (kommende / vergangene)
- Termin bestätigen oder stornieren
- Termin einem Projekt oder einer Leistung zuordnen
- Rechnung mit einem Termin verknüpfen
- Slot-Whitelist verwalten (erlaubte Buchungszeiten konfigurieren)

---

### Follow-ups `/admin/followups`

Wiedervorlagen und Erinnerungsaufgaben mit Kundenbezug.

**Aktionen:**
- Follow-up-Liste einsehen (offen / erledigt / überfällig)
- Neues Follow-up mit Fälligkeitsdatum erstellen
- Als erledigt markieren oder löschen
- Kontaktdaten des zugehörigen Kunden direkt einsehen

---

### Zeiterfassung `/admin/zeiterfassung`

Erfassung und Auswertung von Arbeitszeiten.

**Aktionen:**
- Zeiteintrag hinzufügen (Datum, Dauer, Beschreibung, abrechenbar ja/nein)
- Einträge nach abrechenbar / nicht-abrechenbar filtern
- Zeiteintrag löschen
- CSV-Export aller Einträge
- Stundensatz konfigurieren
- KPI-Kacheln: Gesamtstunden, abrechenbare Stunden, Umsatz

---

### Rechnungen `/admin/rechnungen`

Rechnungserstellung und -verwaltung mit ZUGFeRD-Integration.

**Aktionen:**
- Neue Rechnung als Entwurf erstellen
- Status filtern: offen / bezahlt / überfällig
- ZUGFeRD-konformes PDF herunterladen
- KPI-Kacheln: Offene Forderungen, Einnahmen, überfällige Rechnungen

---

### Meetings `/admin/meetings`

Übersicht aller aufgezeichneten Videokonferenzen.

**Aktionen:**
- Meetings filtern (alle / nicht zugewiesen)
- Status, Transkript-Verfügbarkeit und Artefakte einsehen
- Zur Meeting-Detailseite navigieren (`/admin/meetings/[id]`)
- Transkript lesen oder herunterladen

---

### Monitoring `/admin/monitoring`

Live-Systemübersicht des Kubernetes-Clusters.

**Angezeigt werden:**
- Pod-Status aller Dienste (Running / Pending / Error)
- CPU- und RAM-Auslastung pro Pod
- Kubernetes-Events (Fehler, Warnungen)

Kein direktes Eingreifen möglich — reine Leseansicht. Für Aktionen: CLI-Befehle im [Adminhandbuch](adminhandbuch.md).

---

### Bugs `/admin/bugs`

Ticket-System für eingehende Bug-Reports von Nutzern.

**Aktionen:**
- Tickets nach Status und Kategorie filtern
- Freitextsuche über alle Tickets
- Screenshot in Lightbox anzeigen
- Ticket als gelöst markieren (mit optionaler Notiz)
- Ticket archivieren oder löschen

Tickets werden über das Bug-Report-Formular auf der Website erstellt (Endnutzer-seitig).

---

### Startseite `/admin/startseite`

Inhaltseditor für die öffentliche Startseite.

**Bearbeitbare Bereiche:**
- Hero-Sektion: Tagline, Titel, Untertitel
- Vertrauens-Statistiken (Kennzahlen)
- Leistungs-Sektion
- „Warum ich?"-Punkte
- Portrait-Bild und Initialen-Fallback
- Zitat / Testimonial auf der Startseite

---

### Leistungen `/admin/angebote`

Pflege der angebotenen Dienstleistungen und Preise.

**Aktionen:**
- Leistungskarten bearbeiten (Titel, Icon, Preis, Funktionen)
- Detailseiten-Inhalt pro Leistung anpassen
- Preistabelle (Stundensätze und Pakete) bearbeiten
- URL zur Preisliste konfigurieren

---

### Über mich `/admin/uebermich`

Editor für die „Über mich"-Seite.

**Bearbeitbare Bereiche:**
- Einleitungstexte (mehrere Absätze)
- Inhaltssektionen mit Titel und Fließtext
- Karriere-Meilensteine (Zeitstrahl)
- „Was ich nicht mache"-Liste
- Private Textvorlage (intern, nicht öffentlich)

---

### Referenzen `/admin/referenzen`

Verwaltung öffentlicher Kundenreferenzen.

**Aktionen:**
- Neue Referenz hinzufügen (Name, URL, Logo, Beschreibung)
- Bestehende Referenz bearbeiten oder löschen
- Vorschau-Link zur öffentlichen Referenzseite

---

### Kontakt `/admin/kontakt`

Editor für die Kontaktseite.

**Bearbeitbare Bereiche:**
- Einleitungstext der Kontaktseite
- Sidebar-Box (Titel, Inhalt, Call-to-Action-Button)
- Telefonnummer-Sichtbarkeit ein-/ausschalten

---

### FAQ `/admin/faq`

Verwaltung der häufig gestellten Fragen (wird auf der Startseite angezeigt).

**Aktionen:**
- Neue Frage/Antwort-Paar hinzufügen
- Reihenfolge ändern (nach oben / nach unten verschieben)
- Eintrag löschen (Felder leeren und speichern)

---

### Rechtliches `/admin/rechtliches`

Editor für rechtlich relevante Seiten mit HTML-Eingabefeldern.

**Bearbeitbare Seiten:**
| Seite | Live-Vorschau |
|-------|---------------|
| Impressum (Ergänzung) | `/impressum` |
| Datenschutzerklärung | `/datenschutz` |
| AGB | `/agb` |
| Barrierefreiheitserklärung | `/barrierefreiheit` |

Änderungen werden sofort gespeichert und auf der öffentlichen Seite sichtbar.

---

## Häufige Probleme

### Weiterleitung auf /portal statt /admin

Die Workspace-Gruppe `workspace-admins` fehlt für dieses Konto. Behebung im Keycloak Admin-UI:

1. `https://auth.{DOMAIN}/admin` öffnen (z. B. `https://auth.mentolder.de/admin`)
2. Realm **workspace** wählen
3. **Benutzer** → den betreffenden Benutzer öffnen
4. Reiter **Gruppen** → `workspace-admins` zuweisen
5. Benutzer aus- und wieder einloggen lassen

### Admin-Panel lädt nicht / 500-Fehler

```bash
task workspace:logs -- website
```

Häufige Ursachen: Datenbankverbindung unterbrochen, Keycloak nicht erreichbar.

### Änderungen werden nicht gespeichert

1. Netzwerkfehler im Browser prüfen (F12 → Konsole)
2. Session abgelaufen → neu anmelden
3. Website-Logs prüfen: `task workspace:logs -- website`

### Monitoring zeigt keine Daten

Das Monitoring-Panel benötigt Zugriff auf die Kubernetes-API. Im lokalen k3d-Cluster ist dieser Zugang eingeschränkt. In der Produktion werden Daten über die MCP-Kubernetes-Integration abgerufen.

---

## Weiterführende Dokumentation

| Thema | Dokument |
|-------|----------|
| Benutzerverwaltung (Keycloak) | [Adminhandbuch](adminhandbuch.md#benutzerverwaltung) |
| Projektmanagement (API-Details) | [Projektmanagement-Admin](admin-projekte.md) |
| Monitoring (CLI) | [Adminhandbuch → Monitoring](adminhandbuch.md#monitoring--observability) |
| Fehlerbehebung | [Fehlerbehebung](troubleshooting.md) |
