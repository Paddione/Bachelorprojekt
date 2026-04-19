<div class="page-hero">
  <span class="page-hero-icon">📖</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Benutzerhandbuch</div>
    <p class="page-hero-desc">Alle Werkzeuge des Workspace auf einen Blick – verständlich erklärt, ohne technisches Vorwissen.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Mitarbeiter</span>
      <span class="page-hero-tag">Einsteiger</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Benutzerhandbuch – Workspace

Willkommen beim Workspace! Dieses Handbuch erklärt, welche Werkzeuge Dir zur Verfügung stehen, wofür Du sie nutzen kannst und wie Du einfache Aufgaben erledigst – ganz ohne technisches Vorwissen.

---

## Was ist der Workspace?

Der Workspace ist eine sichere, betriebsinterne Plattform für die tägliche Zusammenarbeit im Team. Alle Daten werden ausschließlich auf unseren eigenen Servern gespeichert – nichts davon gelangt zu externen Anbietern wie Microsoft, Google oder Dropbox. Du hast damit volle Kontrolle über Deine Daten.

Du brauchst **nur einen einzigen Account** – mit diesem einen Login kommst Du in alle Dienste.

---

## Der gemeinsame Login (Single Sign-On)

Alle Dienste sind über einen zentralen Login verbunden. Das bedeutet:

- Du loggst Dich **einmal** ein – zum Beispiel im Portal auf der Website.
- Wenn Du dann Nextcloud, den Passwort-Safe oder die Dokumentation öffnest, bist Du dort **automatisch** angemeldet, ohne das Passwort erneut eingeben zu müssen.
- Wenn Du Dich **abmeldest**, wirst Du aus allen Diensten gleichzeitig ausgeloggt.

Dieser zentrale Login nennt sich **Single Sign-On (SSO)** und wird durch ein System namens Keycloak bereitgestellt.

---

## Dienstübersicht mit Links

| Dienst | Beschreibung | Link (Entwicklung) |
|--------|-------------|---------------------|
| **Portal / Nachrichten** | Chat, Direktnachrichten, Dokumente | [web.localhost/portal](http://web.localhost/portal) |
| **Dateien & Kalender** | Cloud-Speicher, Kalender, Kontakte | [files.localhost](http://files.localhost) |
| **Videokonferenz** | Meetings & Sprachanrufe (in Nextcloud) | [files.localhost](http://files.localhost) → Talk |
| **Dokumente** | Gemeinsame Office-Bearbeitung | Öffnet sich aus Nextcloud heraus |
| **Whiteboard** | Digitales Whiteboard | [board.localhost](http://board.localhost) |
| **KI-Assistent** | Claude AI-Status & MCP-Dashboard | [ai.localhost](http://ai.localhost) |
| **Passwort-Safe** | Sichere Passwortverwaltung | [vault.localhost](http://vault.localhost) |
| **Dokumentation** | Dieses Handbuch und weitere Docs | [docs.localhost](http://docs.localhost) |

> In der Produktivumgebung ersetze `localhost` durch die Unternehmens-Domain (z. B. `files.meinunternehmen.de`).

---

## Die Dienste im Überblick

### Nachrichten & Chat (Portal)

**Wozu?** Schreiben, Diskutieren, Teamkommunikation – direkt im Benutzerportal der Unternehmenswebsite.

**Zugang:** [web.localhost/portal](http://web.localhost/portal) → Nach dem Login automatisch verfügbar

**Was kannst Du tun?**
- Nachrichten in **Räumen** (themenbasierte Gruppen) schreiben und lesen
- **Direktnachrichten** an einzelne Kollegen oder Kunden senden
- Ungelesene Nachrichten werden automatisch durch Benachrichtigungen markiert
- Eingegangene Anfragen (Kontaktformulare, Buchungen) in der **Inbox** sehen

**Räume:**
1. Klicke im Portal auf **„Nachrichten"**
2. Wähle einen vorhandenen Raum oder erstelle einen neuen
3. Schreibe Deine Nachricht und sende sie ab

---

### Dateien & Kalender (Nextcloud)

**Wozu?** Dein persönlicher Cloud-Speicher im Büro – wie Dropbox, aber sicher auf Deinen eigenen Servern.

**Zugang:** [files.localhost](http://files.localhost)

**Was kannst Du tun?**
- Dateien hochladen, herunterladen und mit Kollegen teilen
- Ordner anlegen und gemeinsam bearbeiten
- Dokumente direkt im Browser öffnen und bearbeiten (Word, Excel, PowerPoint)
- Kalender führen und mit dem Team teilen
- Kontakte verwalten

**Dateien teilen:**
1. Rechtsklick auf eine Datei oder einen Ordner → **„Teilen"**
2. Namen des Kollegen eingeben
3. Berechtigungen festlegen (nur lesen / auch bearbeiten)

---

### Dokumente gemeinsam bearbeiten (Collabora Online Office)

**Wozu?** Word, Excel und PowerPoint direkt im Browser bearbeiten – kein separates Programm nötig.

**Zugang:** Öffnet sich automatisch aus [Nextcloud](http://files.localhost) heraus – keine eigene Adresse nötig.

**Was kannst Du tun?**
- Neue Textdokumente, Tabellen oder Präsentationen erstellen
- Bestehende Dateien (`.docx`, `.xlsx`, `.pptx`) öffnen und bearbeiten
- Gleichzeitig mit Kollegen am selben Dokument arbeiten – Du siehst in Echtzeit, was andere tippen

**So öffnest Du ein Dokument:**
1. Gehe zu **Nextcloud** ([files.localhost](http://files.localhost))
2. Klicke auf eine Datei – sie öffnet sich automatisch im Editor
3. Oder: Klicke auf **„+"** → **„Neues Dokument"**, um von vorne anzufangen

> Collabora ist direkt in Nextcloud eingebettet. Du musst keine separate Webseite öffnen.

---

### Videokonferenz (Nextcloud Talk)

**Wozu?** Video- und Sprachanrufe direkt im Browser – wie Zoom oder Teams, aber auf Deinen eigenen Servern.

**Zugang:** [files.localhost](http://files.localhost) → **Talk** (linke Seitenleiste)

**Was kannst Du tun?**
- Einzelgespräche oder Gruppenmeetings starten
- Video und Mikrofon ein-/ausschalten
- Den eigenen Bildschirm teilen
- Im Chat der Konferenz Nachrichten schreiben

**Meeting starten:**
1. Gehe zu Nextcloud Talk
2. Klicke auf **„+ Neues Gespräch erstellen"**
3. Vergib einen Namen und füge Teilnehmer hinzu
4. Starte den Anruf über das **Kamera-Symbol**

> Der Browser fragt beim ersten Mal nach Zugriff auf Kamera und Mikrofon – bitte **erlauben**.

---

### Whiteboard

**Wozu?** Gemeinsam skizzieren, brainstormen und visualisieren – wie ein digitales Whiteboard in einer Besprechung.

**Zugang:** [board.localhost](http://board.localhost)

**Was kannst Du tun?**
- Freihand zeichnen, Formen und Text einfügen
- Mit Kollegen gleichzeitig auf demselben Board arbeiten
- Ideen festhalten und teilen

---

### KI-Assistent (Claude)

**Wozu?** Ein intelligenter Assistent, der Dir bei Texten, Fragen und Aufgaben hilft.

**Zugang:** [ai.localhost](http://ai.localhost) (Status-Dashboard) – Claude Code wird lokal auf dem Rechner des Administrators ausgeführt.

**Was kannst Du tun?**
- Texte verfassen lassen (E-Mails, Zusammenfassungen, Berichte)
- Fragen stellen und Erklärungen erhalten
- Inhalte übersetzen oder umformulieren
- Daten zusammenfassen

**Beispiel-Fragen:**
- *„Schreibe eine freundliche Absage-E-Mail auf Deutsch."*
- *„Fasse mir diesen Text in drei Sätzen zusammen."*
- *„Was ist der Unterschied zwischen einer GmbH und einer UG?"*

> Der KI-Assistent ist nur für den Einsatz im internen Kontext gedacht. Gib keine sensiblen Kundendaten ein.

---

### Passwort-Safe (Vaultwarden)

**Wozu?** Passwörter sicher speichern und im Team teilen – auf Deinen eigenen Servern, nicht bei einem externen Anbieter.

**Zugang:** [vault.localhost](http://vault.localhost)

**Was kannst Du tun?**
- Passwörter und Zugangsdaten sicher verwahren
- Passwörter mit Kollegen teilen (ohne sie offen zu schreiben)
- Automatisch sichere Passwörter generieren
- Zugangsdaten über einen Browser-Plugin direkt ausfüllen lassen

> Vaultwarden ist kompatibel mit dem **Bitwarden**-Browser-Plugin, das Du Dir kostenlos installieren kannst.

**Wichtig:** Du brauchst ein eigenes **Master-Passwort** für den Passwort-Safe. Dieses ist unabhängig von Deinem normalen Workspace-Passwort und sollte besonders sicher sein – schreib es Dir auf und verwahre es gut.

---

## Häufig gestellte Fragen

### Ich habe mein Passwort vergessen – was nun?

Wende Dich an den Administrator. Das Passwort kann über den zentralen Login zurückgesetzt werden. Dein neues Passwort gilt dann für alle Dienste gleichzeitig.

### Ich sehe eine Sicherheitswarnung im Browser – ist das normal?

Nein. Alle Dienste haben gültige Sicherheitszertifikate. Eine Warnung ist ein Zeichen, dass etwas nicht stimmt. Bitte sofort melden und die Seite **nicht** trotzdem öffnen.

### Kann ich die Dienste auch auf dem Smartphone nutzen?

Ja. Mehrere Dienste haben offizielle Apps:
- **Nextcloud**: App für iOS und Android verfügbar (Dateien, Kalender, Talk)
- **Vaultwarden**: Bitwarden-App für iOS und Android kompatibel

Das Portal und die meisten anderen Dienste sind außerdem als responsive Website im mobilen Browser nutzbar.

### Wer hat Zugriff auf meine Dateien und Nachrichten?

Nur berechtigte Teammitglieder und Administratoren. Die Daten verlassen unsere Server nicht.

### Darf ich berufliche Inhalte (Verträge, Kundendaten) in die Dienste hochladen?

Ja – das ist genau der Zweck. Da alle Daten auf Deinen eigenen Servern liegen und nicht an externe Anbieter weitergegeben werden, ist die Plattform datenschutzkonform (DSGVO-konform).

### Etwas funktioniert nicht – an wen wende ich mich?

Schreibe eine Nachricht im Portal-Chat an den Administrator oder schicke eine E-Mail an den Systemverantwortlichen. In der Produktivumgebung steht auch ein Bug-Report-Formular unter `/admin/bugs` bereit.

---

## Kurzübersicht: Welcher Dienst wofür?

| Ich möchte…                                  | Dienst                    | Link |
|----------------------------------------------|---------------------------|------|
| Eine Nachricht an einen Kollegen schicken     | **Portal – Nachrichten**  | [Portal](http://web.localhost/portal) |
| Eine Datei teilen                             | **Nextcloud**             | [files.localhost](http://files.localhost) |
| Gemeinsam an einem Dokument arbeiten          | **Nextcloud + Collabora** | [files.localhost](http://files.localhost) |
| Ein Meeting starten                           | **Nextcloud Talk**        | [files.localhost](http://files.localhost) |
| Ideen gemeinsam aufzeichnen                   | **Whiteboard**            | [board.localhost](http://board.localhost) |
| Eine KI fragen                                | **Claude**                | [ai.localhost](http://ai.localhost) |
| Ein Passwort sicher aufbewahren               | **Vaultwarden**           | [vault.localhost](http://vault.localhost) |
| Diese Dokumentation lesen                     | **Docs**                  | [docs.localhost](http://docs.localhost) |
