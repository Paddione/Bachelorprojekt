# Benutzerhandbuch — Workspace

## Willkommen

Der Workspace ist Deine sichere, betriebsinterne Plattform für die tägliche Zusammenarbeit im Team. Alle Daten werden ausschließlich auf eigenen Servern in Deutschland gespeichert — nichts davon gelangt zu externen Anbietern wie Microsoft, Google oder Dropbox. Die Plattform ist DSGVO-konform aufgebaut.

Du brauchst **nur einen einzigen Account**: ein Login öffnet alle Dienste (Single Sign-On über Keycloak).

### Verfügbare Dienste

| Dienst | Beschreibung | Adresse |
|--------|-------------|---------|
| Portal / Nachrichten | Persönliche Startseite, Chat, Direktnachrichten, Inbox | `https://web.{DOMAIN}/portal` |
| Nextcloud | Dateien, Kalender, Kontakte | `https://files.{DOMAIN}` |
| Nextcloud Talk | Video-Calls und Meetings | in Nextcloud → Talk |
| Collabora Online | Browser-basiertes Office | öffnet aus Nextcloud |
| Whiteboard | Kollaboratives Whiteboard | `https://board.{DOMAIN}` |
| Vaultwarden | Passwort-Safe | `https://vault.{DOMAIN}` |
| Dokumentation | Dieses Handbuch | `https://docs.{DOMAIN}` |

`{DOMAIN}` ist die Domain Deiner Umgebung — typischerweise **`mentolder.de`** oder **`korczewski.de`**. Beispiel: für mentolder erreichst Du das Portal unter `https://web.mentolder.de/portal`. Frage Deinen Administrator, falls Du unsicher bist, welche Domain für Dich gilt.

---

## Erster Login

### Schritt-für-Schritt

1. Rufe das Portal in Deinem Browser auf — z. B. `https://web.mentolder.de/portal` oder `https://web.korczewski.de/portal`.
2. Klicke oben rechts auf **„Anmelden"**.
3. Du wirst zur zentralen Login-Seite weitergeleitet (Keycloak).
4. Gib Benutzername und Passwort ein, die Du vom Administrator erhalten hast.
5. Nach erfolgreichem Login bist Du in allen Diensten automatisch angemeldet (Single Sign-On).

> **Tipp:** Setze ein Lesezeichen auf das Portal — von dort aus erreichst Du alle weiteren Dienste mit einem Klick.

### Passwort vergessen

Klicke auf der Login-Seite auf **„Passwort vergessen?"**. Du erhältst eine E-Mail mit einem Reset-Link, der nur kurze Zeit gültig ist. Findet sich keine E-Mail im Posteingang, prüfe den Spam-Ordner — andernfalls wende Dich an den Administrator.

### Passwort ändern

Rufe `https://auth.{DOMAIN}/realms/workspace/account` auf, melde Dich an und wähle **„Passwort"**. Das neue Passwort gilt sofort für alle Dienste.

> **Sicherheitshinweis:** Verwende für den Workspace ein einzigartiges, starkes Passwort. Speichere es im Vaultwarden-Tresor (siehe unten), nicht im Browser.

---

## Portal — Deine Startseite

Das Portal unter `web.{DOMAIN}/portal` ist Dein zentraler Einstiegspunkt nach dem Login. Es bündelt alle tagesrelevanten Informationen:

- **Übersicht:** Aktuelle Nachrichten, offene Aufgaben, kommende Termine
- **Nachrichten & Chat:** Direktnachrichten mit Kollegen und Admins, Gruppenräume
- **Dokumente & Signaturen:** Hochgeladene Dokumente und zu unterzeichnende Verträge
- **Meetings & Besprechungen:** Geplante und zurückliegende Videomeetings mit Transkripten
- **Termine:** Buchungen und Kalenderansicht

Das Portal ist responsiv und funktioniert sowohl am Desktop als auch am Smartphone.

---

## Nextcloud — Dateien, Kalender & Kontakte

Nextcloud ist Dein persönlicher Cloud-Speicher auf eigenem Server. Aufruf: `https://files.{DOMAIN}`

### Dateien

- Dateien hochladen: Per Drag & Drop oder über die Schaltfläche **„+"**
- Ordner erstellen: **„+" → „Neuer Ordner"**
- Datei freigeben: Rechtsklick → **„Teilen"** → Name des Empfängers eingeben oder öffentlichen Link erstellen
- Berechtigungen festlegen: nur lesen oder auch bearbeiten

### Kalender

- Kalender anlegen: In der Kalender-App auf **„Neuer Kalender"**
- Termin erstellen: Auf ein Datum klicken → Termindaten eingeben
- Kalender teilen: Kalender-Einstellungen → **„Teilen"** → Empfänger eingeben

### Kontakte

- Kontakt anlegen: In der Kontakte-App auf **„Neuer Kontakt"**
- Gruppen anlegen und Kontakte zuordnen
- vCard-Import: **„Einstellungen" → „Importieren"**

---

## Talk — Video-Calls & Chat

Nextcloud Talk ist das integrierte System für Video-Meetings und Chat. Aufruf: `https://files.{DOMAIN}` → **Talk** (linke Seitenleiste).

### Meeting starten

1. Klicke auf **„+ Neues Gespräch erstellen"**
2. Vergib einen Namen und füge Teilnehmer hinzu
3. Starte den Anruf über das Kamera-Symbol

Der Browser fragt beim ersten Mal nach Zugriff auf Kamera und Mikrofon — bitte **erlauben**.

### Im Meeting

- Mikrofon stummschalten: Mikrofon-Symbol in der Steuerleiste
- Kamera deaktivieren: Kamera-Symbol
- Bildschirm teilen: Monitor-Symbol → Fenster oder Bildschirm auswählen
- Chat: Text-Symbol öffnet den Meeting-Chat

### Gäste einladen

Erstelle ein Gespräch → kopiere den Einladungslink → sende ihn an die Person. Gäste benötigen keinen eigenen Account.

### Aufzeichnung und Transkription

Falls vom Admin aktiviert, können Anrufe aufgezeichnet und automatisch transkribiert werden (Whisper). Die Aufzeichnung erscheint nach Ende des Meetings als Datei im Nextcloud-Ordner des Gastgebers, das Transkript im Admin-Bereich unter **Meetings**.

---

## Collabora Online — Dokumente bearbeiten

Collabora öffnet sich automatisch aus Nextcloud heraus. Klicke in Nextcloud auf eine Datei — sie öffnet sich im Browser-Editor. Kein separates Programm notwendig.

Unterstützte Formate:

| Format | Typ |
|--------|-----|
| `.odt`, `.docx` | Textdokumente (Writer) |
| `.ods`, `.xlsx` | Tabellen (Calc) |
| `.odp`, `.pptx` | Präsentationen (Impress) |

Neues Dokument erstellen: In Nextcloud **„+" → „Neues Dokument"**.

Gemeinsames Bearbeiten: Mehrere Personen können gleichzeitig am selben Dokument arbeiten. Änderungen sind in Echtzeit sichtbar.

---

## Vaultwarden — Passwort-Manager

Vaultwarden ist kompatibel mit dem Bitwarden-Browser-Plugin und den Bitwarden-Apps für iOS und Android.

### Ersteinrichtung

1. Installiere das **Bitwarden**-Browser-Plugin (Chrome, Firefox, Edge)
2. Öffne die Plugin-Einstellungen → **„Server-URL"**
3. Trage `https://vault.{DOMAIN}` ein
4. Erstelle einen Account oder melde Dich mit Deinem Workspace-Konto an

### Passwörter verwalten

- Passwort speichern: Beim Login-Formular erscheint ein Speichern-Dialog im Plugin
- Automatisch ausfüllen: Das Plugin erkennt Login-Formulare und bietet gespeicherte Zugangsdaten an
- Passwörter teilen: Geteilte Sammlungen im Vaultwarden-Webinterface (`vault.{DOMAIN}`)

**Wichtig:** Das Vaultwarden-Master-Passwort ist unabhängig vom Workspace-Passwort. Schreibe es sicher auf und verwahre es gut — ein Verlust bedeutet den Verlust aller gespeicherten Passwörter.

---

## Whiteboard

Das Whiteboard ermöglicht gemeinsames Zeichnen und Visualisieren im Browser. Aufruf: `https://board.{DOMAIN}`

- In Nextcloud öffnen: **„+" → „Neues Whiteboard"**
- Gemeinsam arbeiten: Teile den Board-Link mit Kolleginnen und Kollegen
- Werkzeuge: Freihand, Formen, Text, Pfeile, Post-its

---

## Kontakt und Hilfe

### Technisches Problem melden

Nutze das Bug-Report-Formular direkt im Portal — es ist über den Hilfe-Button am Bildschirmrand erreichbar. Tickets gehen automatisch an den Administrator und werden dort zentral bearbeitet.

Für nicht-technische Fragen: schreibe eine Nachricht an den Administrator im Portal unter **Nachrichten**.

### Dokumentation

Die vollständige Dokumentation findest Du unter `https://docs.{DOMAIN}` (z. B. `https://docs.mentolder.de`). Der Zugriff ist an Deinen Workspace-Login gekoppelt.

---

## Häufige Fragen

### Ich habe mein Passwort vergessen

Klicke auf der Login-Seite auf **„Passwort vergessen"** und folge den Anweisungen. Falls Du keine E-Mail erhältst, wende Dich an den Administrator.

### Kann ich die Dienste auf dem Smartphone nutzen?

Ja. Empfohlene Apps:

- **Nextcloud**: offizielle App für iOS und Android (Dateien, Kalender, Talk)
- **Vaultwarden**: Bitwarden-App für iOS und Android

Das Portal und alle anderen Dienste sind außerdem als responsive Website im mobilen Browser nutzbar.

### Wer hat Zugriff auf meine Dateien?

Nur berechtigte Teammitglieder und Administratoren. Die Daten verlassen die eigenen Server nicht. Die Plattform ist DSGVO-konform gestaltet — Details findest Du in der [DSGVO-Dokumentation](dsgvo.md).

### Darf ich Verträge oder Kundendaten hochladen?

Ja — das ist der Zweck der Plattform. Da alle Daten auf eigenen Servern liegen, ist die Nutzung für personenbezogene und vertrauliche Geschäftsdaten datenschutzrechtlich unbedenklich.

### Warum sehe ich manche Bereiche nicht?

Administrative Bereiche (z. B. `/admin`) sind nur sichtbar, wenn Dein Konto zur Keycloak-Gruppe `workspace-admins` gehört. Frage bei Bedarf den Administrator.

### Etwas funktioniert nicht

Schreibe im Portal-Chat eine Nachricht an den Administrator oder nutze das Bug-Report-Formular im Portal.

---

## Kurzübersicht: Welcher Dienst wofür?

| Ich möchte … | Dienst |
|-------------|--------|
| Nachricht an einen Kollegen schicken | Portal — Nachrichten |
| Eine Datei teilen | Nextcloud |
| Gemeinsam ein Dokument bearbeiten | Nextcloud + Collabora |
| Ein Meeting starten | Nextcloud Talk |
| Ideen gemeinsam aufzeichnen | Whiteboard |
| Passwörter sicher aufbewahren | Vaultwarden |
| Einen Termin mit einem Admin vereinbaren | Portal — Termine |
| Diese Dokumentation lesen | Docs |
