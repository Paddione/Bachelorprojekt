# Benutzerhandbuch — Workspace

## Willkommen

Der Workspace ist Deine sichere, betriebsinterne Plattform für die tägliche Zusammenarbeit im Team. Alle Daten werden ausschließlich auf eigenen Servern gespeichert — nichts davon gelangt zu externen Anbietern wie Microsoft, Google oder Dropbox. Die Plattform ist DSGVO-konform aufgebaut.

Du brauchst **nur einen einzigen Account**: ein Login öffnet alle Dienste (Single Sign-On).

### Verfügbare Dienste

| Dienst | Beschreibung | Adresse |
|--------|-------------|---------|
| Portal | Persönliche Startseite, Nachrichten, Inbox | `https://web.{DOMAIN}/portal` |
| Nextcloud | Dateien, Kalender, Kontakte | `https://files.{DOMAIN}` |
| Nextcloud Talk | Video-Calls und Team-Chat | in Nextcloud → Talk |
| Collabora Online | Office-Suite im Browser | öffnet aus Nextcloud heraus |
| Whiteboard | Kollaboratives Zeichnen | `https://board.{DOMAIN}` |
| Vaultwarden | Passwort-Safe | `https://vault.{DOMAIN}` |
| DocuSeal | Dokumente unterzeichnen | `https://sign.{DOMAIN}` |
| Livestream | Live-Übertragungen ansehen | `https://web.{DOMAIN}/portal/stream` |
| Brett (Systembrett) | 3D-Systemisches Brett | `https://brett.{DOMAIN}` |
| Dokumentation | Dieses Handbuch | `https://docs.{DOMAIN}` |

`{DOMAIN}` ist die Domain Deiner Umgebung — typischerweise **`mentolder.de`** oder **`korczewski.de`**. Frage Deinen Administrator, falls Du unsicher bist.

---

## Erster Login

### Schritt-für-Schritt

1. Rufe das Portal in Deinem Browser auf: `https://web.{DOMAIN}/portal`
2. Klicke auf **„Anmelden"**
3. Du wirst zur zentralen Login-Seite weitergeleitet (Keycloak)
4. Gib Benutzername und Passwort ein, die Du vom Administrator erhalten hast
5. Beim ersten Login wirst Du aufgefordert, ein neues Passwort zu setzen — mindestens 12 Zeichen, sicher und einzigartig
6. Nach erfolgreichem Login bist Du in allen Diensten automatisch angemeldet

> **Tipp:** Setze ein Lesezeichen auf das Portal — von dort aus erreichst Du alle weiteren Dienste.

### Passwort vergessen

Klicke auf der Login-Seite auf **„Passwort vergessen?"**. Du erhältst eine E-Mail mit einem Reset-Link. Falls keine E-Mail ankommt, prüfe den Spam-Ordner oder wende Dich an den Administrator.

### Passwort ändern

Rufe `https://auth.{DOMAIN}/realms/workspace/account` auf und wähle **„Passwort"**. Das neue Passwort gilt sofort für alle Dienste.

> **Sicherheitshinweis:** Speichere Dein Workspace-Passwort im Vaultwarden-Tresor, nicht im Browser.

---

## Portal — Deine Startseite

Das Portal unter `https://web.{DOMAIN}/portal` ist Dein zentraler Einstiegspunkt. Es bündelt alle tagesrelevanten Informationen:

- **Nachrichten & Chat:** Direktnachrichten mit Kollegen und Admins, Gruppenräume
- **Inbox:** Eingehende Anfragen und Benachrichtigungen
- **Termine:** Buchungen und Kalenderansicht
- **Dokumente & Signaturen:** Hochgeladene Dokumente und zu unterzeichnende Verträge
- **Meetings:** Geplante und zurückliegende Videomeetings mit Transkripten

Das Portal ist responsiv und funktioniert am Desktop, Tablet und Smartphone.

---

## Nachrichten & Chat

Das integrierte Messaging-System ermöglicht direkte Kommunikation mit dem Team und dem Administrator.

### Direktnachrichten

- Im Portal unter **„Nachrichten"**: auf einen Kontakt klicken und schreiben
- Nachrichten werden in Echtzeit zugestellt
- Anhänge (Bilder, Dateien) können direkt im Chat geteilt werden

### Gruppenräume

- Unter **„Räume"** findest Du alle Gruppen, denen Du angehörst
- Räume eignen sich für projektbezogene oder thematische Kommunikation

---

## Nextcloud — Dateien, Kalender & Kontakte

Nextcloud ist Dein persönlicher Cloud-Speicher auf eigenem Server. Aufruf: `https://files.{DOMAIN}`

### Dateien

- **Hochladen:** Dateien per Drag & Drop in den Browser ziehen oder über **„+" → Datei hochladen**
- **Ordner erstellen:** **„+" → „Neuer Ordner"**
- **Teilen:** Rechtsklick auf eine Datei → **„Teilen"** → Empfänger eingeben oder öffentlichen Link erstellen
- **Berechtigungen:** Beim Teilen zwischen „nur lesen" und „bearbeiten" wählen

### Kalender

- **Neuer Termin:** In der Kalender-App auf ein Datum klicken → Termindaten eingeben
- **Kalender teilen:** Kalender-Einstellungen → **„Teilen"** → Empfänger eingeben
- **App-Synchronisation:** Der Kalender lässt sich mit mobilen Geräten per CalDAV synchronisieren

### Kontakte

- **Neuer Kontakt:** In der Kontakte-App auf **„Neuer Kontakt"** klicken
- **vCard-Import:** **„Einstellungen" → „Importieren"**
- **CardDAV-Sync:** Kontakte lassen sich mit dem Smartphone synchronisieren

### Nextcloud-App für iOS und Android

Die offizielle Nextcloud-App ermöglicht Zugriff auf Dateien, Kalender und Talk auch unterwegs.

---

## Talk — Video-Calls & Chat

Nextcloud Talk ist das integrierte System für Video-Meetings und Chat. Aufruf: `https://files.{DOMAIN}` → **Talk** in der Seitenleiste.

### Meeting starten

1. Klicke auf **„+ Neues Gespräch erstellen"**
2. Vergib einen Namen und füge Teilnehmer hinzu
3. Starte den Anruf über das Kamera-Symbol

Der Browser fragt beim ersten Mal nach Zugriff auf Kamera und Mikrofon — bitte **erlauben**.

### Im Meeting

| Aktion | Schaltfläche |
|--------|-------------|
| Mikrofon stummschalten | Mikrofon-Symbol |
| Kamera deaktivieren | Kamera-Symbol |
| Bildschirm teilen | Monitor-Symbol → Fenster oder Bildschirm auswählen |
| Meeting-Chat öffnen | Sprechblasen-Symbol |

### Gäste einladen

Erstelle ein Gespräch → kopiere den Einladungslink → sende ihn an die Person. Gäste benötigen **keinen eigenen Account**.

### Aufzeichnung und Transkription

Falls vom Administrator aktiviert, können Calls aufgezeichnet und automatisch transkribiert werden. Die Aufzeichnung erscheint nach dem Meeting als Datei im Nextcloud-Ordner des Gastgebers.

---

## Collabora Online — Dokumente bearbeiten

Collabora öffnet sich automatisch aus Nextcloud heraus — kein separates Programm notwendig.

Klicke in Nextcloud auf eine Datei; sie öffnet sich im Browser-Editor.

| Format | Anwendung |
|--------|----------|
| `.odt`, `.docx` | Writer (Textdokument) |
| `.ods`, `.xlsx` | Calc (Tabelle) |
| `.odp`, `.pptx` | Impress (Präsentation) |

**Neues Dokument:** In Nextcloud **„+" → „Neues Dokument"** (je nach Typ wählen).

**Gleichzeitig bearbeiten:** Mehrere Personen können parallel am selben Dokument arbeiten — Änderungen sind in Echtzeit sichtbar.

---

## Whiteboard

Das Whiteboard ermöglicht gemeinsames Zeichnen und Visualisieren im Browser.

Aufruf in Nextcloud: **„+" → „Neues Whiteboard"** oder direkt unter `https://board.{DOMAIN}`.

Verfügbare Werkzeuge: Freihand, Formen, Text, Pfeile, Post-its, Bilder einfügen.

**Teilen:** Kopiere den Board-Link und sende ihn an Kolleginnen und Kollegen — alle sehen die Änderungen in Echtzeit.

---

## Vaultwarden — Passwort-Manager

Vaultwarden speichert Passwörter sicher und füllt sie automatisch aus. Es ist kompatibel mit dem Bitwarden-Browser-Plugin und den Bitwarden-Apps für iOS und Android.

### Ersteinrichtung

1. Installiere das **Bitwarden**-Browser-Plugin (Chrome, Firefox, Edge)
2. Öffne die Plugin-Einstellungen → **„Server-URL"**
3. Trage `https://vault.{DOMAIN}` ein und speichere
4. Melde Dich mit Deinem Workspace-Konto an

### Passwörter verwalten

- **Speichern:** Beim Ausfüllen eines Login-Formulars erscheint ein Speichern-Dialog im Plugin
- **Automatisch ausfüllen:** Das Plugin erkennt Login-Formulare und bietet gespeicherte Daten an
- **Teilen:** Geteilte Sammlungen im Vaultwarden-Webinterface für Team-Passwörter

> **Wichtig:** Das Vaultwarden-Master-Passwort ist unabhängig vom Workspace-Passwort. Notiere es sicher auf — ein Verlust bedeutet den Verlust aller gespeicherten Passwörter.

---

## DocuSeal — Dokumente unterzeichnen

DocuSeal ermöglicht das digitale Unterzeichnen von Dokumenten im Browser. Aufruf: `https://sign.{DOMAIN}`

- Erhältst Du eine Unterzeichnungsanfrage, erscheint ein Link im Portal oder per E-Mail
- Öffne das Dokument und unterzeichne es digital mit wenigen Klicks
- Unterzeichnete Dokumente sind im Portal unter **„Signaturen"** abrufbar

---

## Brett — Systemisches Brett (3D)

Das Brett ermöglicht systemische Aufstellungen im Browser — räumlich, interaktiv, dreidimensional. Aufruf: `https://brett.{DOMAIN}`

- Figuren platzieren und im 3D-Raum bewegen
- Räume für Einzel- oder Gruppenarbeit erstellen
- Integration in Nextcloud Talk: Slash-Command `/brett` öffnet direkt eine neue Session

---

## Livestream

Über das Portal kannst Du Live-Übertragungen ansehen. Aufruf: `https://web.{DOMAIN}/portal/stream`

- Der Livestream ist an Deinen Workspace-Login gebunden — nur angemeldete Nutzer können zuschauen
- Eine aktive Übertragung erscheint automatisch auf der Stream-Seite
- Aufzeichnungen vergangener Streams können vom Administrator bereitgestellt werden

---

## Arena — Multiplayer

Arena ist ein browserbasiertes Multiplayer-Erlebnis, das direkt über das Portal zugänglich ist.

- Gemeinsam im Team spielen oder an interaktiven Szenarien teilnehmen
- Kein separates Programm notwendig — funktioniert vollständig im Browser
- Arena läuft zentral und ist von beiden Plattformen (`mentolder.de` und `korczewski.de`) aus erreichbar

---

## Kontakt und Hilfe

### Technisches Problem melden

Nutze das Bug-Report-Formular direkt im Portal — erreichbar über den Hilfe-Button am Bildschirmrand. Tickets gehen automatisch an den Administrator.

Für nicht-technische Fragen: Nachricht an den Administrator im Portal unter **„Nachrichten"** schreiben.

### Dokumentation

Die vollständige Dokumentation findest Du unter `https://docs.{DOMAIN}`. Der Zugriff ist an Deinen Workspace-Login gekoppelt.

---

## Häufige Fragen

### Ich habe mein Passwort vergessen

Klicke auf der Login-Seite auf **„Passwort vergessen?"** und folge den Anweisungen. Falls keine E-Mail ankommt, wende Dich an den Administrator.

### Kann ich die Dienste auf dem Smartphone nutzen?

Ja. Empfohlene Apps:

- **Nextcloud-App** (iOS / Android) — Dateien, Kalender, Kontakte und Talk
- **Bitwarden-App** (iOS / Android) — für Vaultwarden

Portal, Whiteboard und alle anderen Dienste sind außerdem als responsive Website im mobilen Browser nutzbar.

### Wer hat Zugriff auf meine Dateien?

Nur berechtigte Teammitglieder und Administratoren. Die Daten verlassen die eigenen Server nicht. Details in der [DSGVO-Dokumentation](dsgvo.md).

### Darf ich Verträge oder Kundendaten hochladen?

Ja — das ist der Zweck der Plattform. Da alle Daten auf eigenen Servern liegen, ist die Nutzung für personenbezogene und vertrauliche Geschäftsdaten datenschutzrechtlich unbedenklich.

### Warum sehe ich manche Bereiche nicht?

Administrative Bereiche (z. B. `/admin`) sind nur für Konten der Gruppe `workspace-admins` sichtbar. Wende Dich bei Bedarf an den Administrator.

### Die Startseite sieht auf mentolder.de und korczewski.de unterschiedlich aus

Richtig — beide Plattformen haben bewusst unterschiedliche Designs und Funktionsschwerpunkte, teilen sich aber dieselbe Infrastruktur und denselben Login.

### Etwas funktioniert nicht

Schreibe im Portal eine Nachricht an den Administrator oder nutze das Bug-Report-Formular.

---

## Kurzübersicht: Welcher Dienst wofür?

| Ich möchte … | Dienst |
|-------------|--------|
| Einer Person eine Nachricht schicken | Portal — Nachrichten |
| Eine Datei teilen | Nextcloud |
| Gemeinsam ein Dokument bearbeiten | Nextcloud + Collabora |
| Ein Video-Meeting starten | Nextcloud Talk |
| Ideen gemeinsam skizzieren | Whiteboard |
| Eine systemische Aufstellung machen | Brett |
| Passwörter sicher aufbewahren | Vaultwarden |
| Einen Vertrag unterzeichnen | DocuSeal |
| Einen Livestream ansehen | Portal → Stream |
| Multiplayer-Aktivitäten | Portal → Arena |
| Diese Dokumentation lesen | `https://docs.{DOMAIN}` |
