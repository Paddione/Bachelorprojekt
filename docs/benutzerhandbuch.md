# Benutzerhandbuch – Workspace

Willkommen beim Workspace! Dieses Handbuch erklärt, welche Werkzeuge Dir zur Verfügung stehen, wofür Du sie nutzen kannst und wie Du einfache Aufgaben erledigst – ganz ohne technisches Vorwissen.

---

## Was ist der Workspace?

Der Workspace ist eine sichere, betriebsinterne Plattform für die tägliche Zusammenarbeit im Team. Alle Daten werden ausschließlich auf unseren eigenen Servern gespeichert – nichts davon gelangt zu externen Anbietern wie Microsoft, Google oder Dropbox. Du hast damit volle Kontrolle über Deine Daten.

Du brauchst **nur einen einzigen Account** – mit diesem einen Login kommst Du in alle Dienste.

---

## Der gemeinsame Login (Single Sign-On)

Alle Dienste sind über einen zentralen Login verbunden. Das bedeutet:

- Du loggst Dich **einmal** ein – zum Beispiel in Mattermost.
- Wenn Du dann Nextcloud, das Wiki oder den Passwort-Safe öffnest, bist Du dort **automatisch** angemeldet, ohne das Passwort erneut eingeben zu müssen.
- Wenn Du Dich **abmeldest**, wirst Du aus allen Diensten gleichzeitig ausgeloggt.

Dieser zentrale Login nennt sich **Single Sign-On (SSO)** und wird durch ein System namens Keycloak bereitgestellt.

---

## Die Dienste im Überblick

### Chat (Mattermost)

**Wozu?** Schreiben, Diskutieren, Teamkommunikation – wie WhatsApp, aber für die Arbeit und sicher auf Deinen eigenen Servern.

**Was kannst Du tun?**
- Nachrichten in Kanälen (themenbasierten Gruppen) schreiben
- Private Direktnachrichten an einzelne Kollegen senden
- Dateien direkt in den Chat hochladen und teilen
- Auf Nachrichten mit Emojis reagieren
- Benachrichtigungen erhalten, wenn Dich jemand erwähnt (`@deinname`)

**Tipps:**
- Klicke links auf **"+"** um einem neuen Kanal beizutreten oder einen zu erstellen
- Mit **`/billing`** kannst Du Rechnungen direkt aus dem Chat erstellen (mehr dazu weiter unten)

---

### Dateien & Kalender (Nextcloud)

**Wozu?** Dein persönlicher Cloud-Speicher im Büro – wie Dropbox, aber sicher auf Deinen eigenen Servern.

**Was kannst Du tun?**
- Dateien hochladen, herunterladen und mit Kollegen teilen
- Ordner anlegen und gemeinsam bearbeiten
- Dokumente direkt im Browser öffnen und bearbeiten (Word, Excel, PowerPoint)
- Kalender führen und mit dem Team teilen
- Kontakte verwalten

**Dateien teilen:**
1. Rechtsklick auf eine Datei oder einen Ordner → **"Teilen"**
2. Namen des Kollegen eingeben
3. Berechtigungen festlegen (nur lesen / auch bearbeiten)

---

### Dokumente gemeinsam bearbeiten (Collabora Online Office)

**Wozu?** Word, Excel und PowerPoint direkt im Browser bearbeiten – kein separates Programm nötig.

**Was kannst Du tun?**
- Neue Textdokumente, Tabellen oder Präsentationen erstellen
- Bestehende Dateien (`.docx`, `.xlsx`, `.pptx`) öffnen und bearbeiten
- Gleichzeitig mit Kollegen am selben Dokument arbeiten – Du siehst in Echtzeit, was andere tippen

**So öffnest Du ein Dokument:**
1. Gehe zu **Nextcloud** (Dateien)
2. Klicke auf eine Datei – sie öffnet sich automatisch im Editor
3. Oder: Klicke auf **"+"** → **"Neues Dokument"**, um von vorne anzufangen

> Collabora ist direkt in Nextcloud eingebettet. Du musst keine separate Webseite öffnen.

---

### Videokonferenz (Nextcloud Talk)

**Wozu?** Video- und Sprachanrufe direkt im Browser – wie Zoom oder Teams, aber auf Deinen eigenen Servern.

**Was kannst Du tun?**
- Einzelgespräche oder Gruppenmeetings starten
- Video und Mikrofon ein-/ausschalten
- Den eigenen Bildschirm teilen
- Im Chat der Konferenz Nachrichten schreiben

**Meeting starten:**
1. Gehe zu Nextcloud Talk
2. Klicke auf **"+ Neues Gespräch erstellen"**
3. Vergib einen Namen und füge Teilnehmer hinzu
4. Starte den Anruf über das **Kamera-Symbol**

> Der Browser fragt beim ersten Mal nach Zugriff auf Kamera und Mikrofon – bitte **erlauben**.

---

### Whiteboard

**Wozu?** Gemeinsam skizzieren, brainstormen und visualisieren – wie ein digitales Whiteboard in einer Besprechung.

**Was kannst Du tun?**
- Freihand zeichnen, Formen und Text einfügen
- Mit Kollegen gleichzeitig auf demselben Board arbeiten
- Ideen festhalten und teilen

---

### KI-Assistent (Claude)

**Wozu?** Ein intelligenter Assistent, der Dir bei Texten, Fragen und Aufgaben hilft.

**Was kannst Du tun?**
- Texte verfassen lassen (E-Mails, Zusammenfassungen, Berichte)
- Fragen stellen und Erklärungen erhalten
- Inhalte übersetzen oder umformulieren
- Daten zusammenfassen

**Beispiel-Fragen:**
- *"Schreibe eine freundliche Absage-E-Mail auf Deutsch."*
- *"Fasse mir diesen Text in drei Sätzen zusammen."*
- *"Was ist der Unterschied zwischen einer GmbH und einer UG?"*

> Der KI-Assistent ist nur für den Einsatz im internen Kontext gedacht. Gib keine sensiblen Kundendaten ein.

---

### Wissensdatenbank / Wiki (Outline)

**Wozu?** Das interne Nachschlagewerk des Teams – Anleitungen, Prozesse, Wissen aufschreiben und für alle zugänglich machen.

**Was kannst Du tun?**
- Neue Seiten und Artikel anlegen
- Seiten in Sammlungen (Ordner) organisieren
- Andere Teammitglieder zum gemeinsamen Bearbeiten einladen
- Die Volltextsuche nutzen, um schnell etwas zu finden

**Neue Seite anlegen:**
1. Klicke links auf eine Sammlung oder erstelle eine neue
2. Klicke auf **"Neue Seite"**
3. Schreibe Deinen Inhalt und speichere

---

### Passwort-Safe (Vaultwarden)

**Wozu?** Passwörter sicher speichern und im Team teilen – auf Deinen eigenen Servern, nicht bei einem externen Anbieter.

**Was kannst Du tun?**
- Passwörter und Zugangsdaten sicher verwahren
- Passwörter mit Kollegen teilen (ohne sie offen zu schreiben)
- Automatisch sichere Passwörter generieren
- Zugangsdaten über einen Browser-Plugin direkt ausfüllen lassen

> Vaultwarden ist kompatibel mit dem **Bitwarden**-Browser-Plugin, das Du Dir kostenlos installieren kannst.

**Wichtig:** Du brauchst ein eigenes **Master-Passwort** für den Passwort-Safe. Dieses ist unabhängig von Deinem normalen Workspace-Passwort und sollte besonders sicher sein – schreib es Dir auf und verwahre es gut.

---

### Rechnungen (Invoice Ninja)

**Wozu?** Rechnungen erstellen, Kunden verwalten und Zahlungen nachverfolgen.

**Was kannst Du tun?**
- Neue Kunden anlegen
- Rechnungen erstellen und per E-Mail versenden
- Den Status von Rechnungen einsehen (offen, bezahlt, überfällig)
- Zahlungen per Stripe verarbeiten

**Rechnungen aus dem Chat erstellen:**
Tippe in Mattermost einfach:
```
/billing invoice Kundenname
```
Der Billing-Bot erstellt die Rechnung automatisch und schickt Dir den Link.

---

## Häufig gestellte Fragen

### Ich habe mein Passwort vergessen – was nun?

Wende Dich an den Administrator. Das Passwort kann über den zentralen Login zurückgesetzt werden. Dein neues Passwort gilt dann für alle Dienste gleichzeitig.

### Ich sehe eine Sicherheitswarnung im Browser – ist das normal?

Nein. Alle Dienste haben gültige Sicherheitszertifikate. Eine Warnung ist ein Zeichen, dass etwas nicht stimmt. Bitte sofort melden und die Seite **nicht** trotzdem öffnen.

### Kann ich die Dienste auch auf dem Smartphone nutzen?

Ja. Die meisten Dienste haben Apps:
- **Mattermost**: App für iOS und Android verfügbar
- **Nextcloud**: App für iOS und Android verfügbar (Dateien, Kalender, Talk)
- **Vaultwarden**: Bitwarden-App für iOS und Android kompatibel

### Wer hat Zugriff auf meine Dateien und Nachrichten?

Nur berechtigte Teammitglieder und Administratoren. Die Daten verlassen unsere Server nicht.

### Darf ich berufliche Inhalte (Verträge, Kundendaten) in die Dienste hochladen?

Ja – das ist genau der Zweck. Da alle Daten auf Deinen eigenen Servern liegen und nicht an externe Anbieter weitergegeben werden, ist die Plattform datenschutzkonform (DSGVO-konform).

### Etwas funktioniert nicht – an wen wende ich mich?

Schreibe eine Nachricht im Mattermost-Kanal des Administrators oder schicke eine E-Mail an den Systemverantwortlichen.

---

## Kurzübersicht: Welcher Dienst wofür?

| Ich möchte…                                  | Dienst               |
|----------------------------------------------|----------------------|
| Eine Nachricht an einen Kollegen schicken     | **Mattermost**       |
| Eine Datei teilen                             | **Nextcloud**        |
| Gemeinsam an einem Dokument arbeiten          | **Nextcloud + Collabora** |
| Ein Meeting starten                           | **Nextcloud Talk**   |
| Ideen gemeinsam aufzeichnen                   | **Whiteboard**       |
| Eine KI fragen                                | **Claude**           |
| Wissen im Team festhalten                     | **Outline (Wiki)**   |
| Ein Passwort sicher aufbewahren               | **Vaultwarden**      |
| Eine Rechnung erstellen                       | **Invoice Ninja**    |
