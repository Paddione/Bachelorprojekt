# Softwaretest Workspace – Anleitung für Testerinnen und Tester

Herzlich willkommen und vielen Dank, dass Du Dir Zeit nimmst, die Workspace-Plattform
zu testen. Unten findest Du Deine Zugangsdaten, eine Übersicht der Services und
eine Schritt-für-Schritt-Anleitung für die wichtigsten Funktionen.

> Bitte halte Dich beim Testen möglichst an die Reihenfolge in **Teil B**, damit Du
> einmal durch alle Hauptfunktionen kommst. Du brauchst **keinen** technischen
> Hintergrund – wenn etwas nicht funktioniert oder verwirrend ist, ist **genau das**
> die wertvollste Rückmeldung.

---

## Teil A – Deine Zugangsdaten

Alle drei Test-Accounts liegen im selben Realm und dürfen sich gegenseitig Nachrichten
schreiben, Dateien teilen und gemeinsam an Dokumenten arbeiten.

| Name             | Benutzername       | E-Mail                         | Start-Passwort           |
|------------------|--------------------|--------------------------------|--------------------------|
| Martina Semmler  | `martina.semmler`  | martina.semmler@outlook.com    | *per E-Mail zugestellt*  |
| Oskar Berger     | `oskar.berger`     | oskarberger@gmx.de             | *per E-Mail zugestellt*  |
| Christina Wolf   | `christina.wolf`   | tina-merlin@web.de             | *per E-Mail zugestellt*  |

**Wichtig zum Passwort:** Das Passwort wird jeder Testerin / jedem Tester
persönlich per E-Mail zugestellt und ist ein *Einmalpasswort*. Beim
allerersten Login wirst Du aufgefordert, ein eigenes, neues Passwort zu setzen.
Mindestens 8 Zeichen, bitte nicht `123456` o. Ä. – der Account bleibt danach
dauerhaft Dein Test-Account.

Du kannst Dich überall entweder mit dem **Benutzernamen** oder mit Deiner
**E-Mail-Adresse** einloggen.

---

## Teil B – Die Services im Überblick

Es gibt **einen zentralen Login** (Keycloak/SSO). Sobald Du in einem der Dienste
eingeloggt bist, wirst Du in den anderen automatisch erkannt.

| Was?                                 | URL                              |
|--------------------------------------|----------------------------------|
| Zentraler Login (SSO)                | [auth.korczewski.de](https://auth.korczewski.de) |
| **Chat** (Mattermost)                | [chat.korczewski.de](https://chat.korczewski.de) |
| **Dateien & Kalender** (Nextcloud)   | [files.korczewski.de](https://files.korczewski.de) |
| **Video­konferenz** (Nextcloud Talk) | [meet.korczewski.de](https://meet.korczewski.de) |
| **Office** (Word/Excel/PowerPoint)   | öffnet sich aus Nextcloud heraus |
| **Whiteboard**                       | [board.korczewski.de](https://board.korczewski.de) |
| **KI-Assistent** (Claude Code)       | [ai.korczewski.de](https://ai.korczewski.de) |
| **Wissensdatenbank** (Outline)       | [wiki.korczewski.de](https://wiki.korczewski.de) |
| **Passwort-Safe** (Vaultwarden)      | [vault.korczewski.de](https://vault.korczewski.de) |
| **Dokumentation** (Handbuch)         | [docs.korczewski.de](https://docs.korczewski.de) |
| **Bug-Meldung** (Fehler melden)      | [bug.korczewski.de](https://bug.korczewski.de) |

Alle Dienste sind per HTTPS erreichbar und haben ein gültiges Zertifikat – Dein
Browser sollte **keine** Sicherheitswarnung anzeigen. Falls doch: bitte
Screenshot machen und zurückmelden.

---

## Teil C – Der Testablauf

Plane bitte etwa **45–60 Minuten** ein. Notiere Dir beim Durchgehen bei jedem
Schritt:

* ✅ Hat funktioniert
* ⚠️ Hat funktioniert, aber war umständlich / verwirrend
* ❌ Hat nicht funktioniert – was hast Du gemacht, was wurde angezeigt?

Am Ende dieser Anleitung findest Du einen **Rückmelde-Block** zum Ausfüllen.

### 1. Erster Login & Passwort ändern

1. Öffne [https://chat.korczewski.de](https://chat.korczewski.de)
2. Klicke auf **"Anmelden mit Keycloak"**.
3. Gib Deinen Benutzernamen (z. B. `martina.semmler`) und das Start-Passwort ein.
4. Du wirst automatisch auf eine Seite geleitet, die Dich bittet, ein **neues
   Passwort** zu setzen. Bitte merk es Dir gut – es gilt für alle Dienste.
5. Nach dem Passwortwechsel landest Du direkt in Mattermost.

➡️ **Fragestellung für Dich:** War der Login-Prozess verständlich? Gab es
Momente, in denen Du nicht wusstest, wohin klicken?

### 2. Chat (Mattermost)

1. Du bist im "Town Square"-Channel oder einem ähnlichen Standard-Channel.
2. Schreibe eine kurze Begrüßung, z. B. `Hallo, ich bin Martina und teste gerade`.
3. Probiere folgende Dinge aus:
   * Einen **neuen Channel** anlegen (oben links "+" → "Kanal erstellen").
     Nenne ihn z. B. `test-anleitung-<deinname>`.
   * Einem der anderen Testnutzer eine **Direktnachricht** schicken
     (linke Seitenleiste → "Direktnachrichten" → "+").
   * Eine **Datei** (z. B. ein Foto vom Handy) per Drag-&-Drop in einen Chat
     ziehen.
   * Einen **Emoji/Reaktion** auf eine Nachricht setzen (Maus über die Nachricht
     → Smiley-Icon).
4. Logge Dich **nicht aus** – wir brauchen den Single-Sign-On gleich noch.

➡️ Achte darauf: Kommt die Datei beim Gegenüber an? Wie schnell tauchen neue
Nachrichten auf?

### 3. Dateien (Nextcloud)

1. Öffne in einem **neuen Tab** [https://files.korczewski.de](https://files.korczewski.de)
2. Du solltest **ohne erneute Passwort-Eingabe** direkt in Nextcloud landen. Das
   ist das "Single Sign-On" in Aktion. Falls Du doch nochmal klicken musst:
   ganz normal, aber bitte kurz notieren.
3. Probiere:
   * Eine Datei (PDF, Bild, beliebig) **hochladen** per Drag-&-Drop.
   * Einen **Ordner** anlegen (oben "+" → "Neuer Ordner"), Name z. B.
     `Testordner-Oskar`.
   * Den Ordner mit einem der anderen Testnutzer **teilen**: Rechtsklick auf
     den Ordner → "Teilen" → rechts Benutzernamen eingeben (z. B.
     `christina.wolf`) → Bearbeiten erlauben.
   * Schau in der linken Spalte nach: Unter **"Mit Dir geteilt"** müsstest Du die
     Freigaben sehen, die andere Dir gegeben haben.

### 4. Office-Dokumente (Collabora)

1. Klicke in Nextcloud oben rechts auf **"+"** → **"Neues Dokument"**.
2. Wähle **"Leeres Word-Dokument"** (oder Tabelle / Präsentation) und gib einen
   Namen ein.
3. Das Dokument öffnet sich direkt im Browser. Schreibe ein paar Zeilen Text,
   ändere Formatierungen, speichere.
4. **Kollaboratives Arbeiten**: Teile das Dokument mit einem der anderen
   Testnutzer (wie bei Ordnern oben). Bittet diese Person, das Dokument
   **gleichzeitig** zu öffnen – Ihr solltet beide Cursor sehen und live sehen,
   was der andere tippt.

➡️ **Das ist einer der wichtigsten Tests.** Falls das Dokument nicht aufgeht
oder Ihr Euch nicht gleichzeitig sehen könnt, bitte melden.

### 5. Videokonferenz (Nextcloud Talk)

1. Öffne [https://meet.korczewski.de](https://meet.korczewski.de)
2. Klicke auf **"+ Neues Gespräch erstellen"**, vergib einen Namen
   (z. B. `Testmeeting`), und füge die beiden anderen Testnutzer als Teilnehmer
   hinzu.
3. Starte den Anruf über das **Kamera-Symbol** oben rechts.
4. Der Browser fragt nach Mikrofon- und Kamerazugriff – bitte **erlauben**.
5. Probiere im Call:
   * Video an/aus
   * Mikrofon an/aus
   * **Bildschirm teilen** (Monitor-Symbol unten)
   * Im Chat der Konferenz eine Nachricht schreiben

➡️ Wichtig: Hört Ihr Euch gegenseitig? Ist das Bild flüssig? Gibt es Echo?

### 6. Whiteboard

1. Öffne [https://board.korczewski.de](https://board.korczewski.de)
2. Erstelle ein neues Board und male / schreibe ein bisschen.
3. Teile den Board-Link (oder lade einen der anderen Tester ein, wenn die
   Oberfläche es anbietet) und schaut, ob Ihr gleichzeitig zeichnen könnt.

### 7. KI-Assistent (Claude Code)

1. Öffne [https://ai.korczewski.de](https://ai.korczewski.de)
2. Logge Dich mit Deinem SSO-Account ein.
3. Stelle eine einfache Frage, z. B.:
   * *"Fasse mir in drei Sätzen zusammen, was Nextcloud Talk ist."*
   * *"Gib mir ein Beispiel für einen freundlichen Begrüßungstext auf Deutsch."*
4. Achte darauf: Antwortet die KI sinnvoll? Wie lange dauert die Antwort?

### 8. Wiki / Wissensdatenbank (Outline)

1. Öffne [https://wiki.korczewski.de](https://wiki.korczewski.de)
2. Lege eine neue Seite an und schreibe 2–3 Sätze Testtext.
3. Prüfe, ob die Seite für die anderen Tester sichtbar ist.

### 9. Dokumentation (Docs)

1. Öffne [https://docs.korczewski.de](https://docs.korczewski.de)
2. Du wirst zur Keycloak-Anmeldeseite weitergeleitet – melde Dich mit Deinem SSO-Konto an.
3. Nach dem Login siehst Du das interne Handbuch des Workspace.

➡️ **Fragestellung:** Hat der SSO-Login funktioniert, ohne dass Du ein separates Passwort eingeben musstest?

### 10. Passwort-Safe (Vaultwarden)

1. Öffne [https://vault.korczewski.de](https://vault.korczewski.de)
2. Registriere Dich **mit Deiner Test-E-Mail-Adresse** (Vaultwarden hat einen
   eigenen Master-Passwort-Flow – dieses Master-Passwort ist **nicht** dasselbe
   wie Dein SSO-Passwort, bitte extra notieren).
3. Lege einen Test-Eintrag an, z. B. *"Test-Login für Beispielseite"*.

### 11. Logout-Test

1. Melde Dich in **einem** der Dienste ab (oben rechts auf Deinen Namen →
   "Abmelden").
2. Versuche danach, einen **anderen** der Dienste zu öffnen. Du solltest dann
   wieder zur Login-Seite weitergeleitet werden.

---

## Teil D – Rückmeldung

Bitte schicke Deine Rückmeldung formlos per E-Mail an **info@korczewski.de**
(oder direkt per Chat an mich in Mattermost). Besonders hilfreich sind:

1. **Was war einfach und angenehm?**
   – Welche Funktionen haben sich gut angefühlt?

2. **Was war kompliziert oder unklar?**
   – Wo hast Du gestockt, zurückgeklickt, vermutet statt gewusst?

3. **Was hat nicht funktioniert?**
   – Bitte so genau wie möglich: *"Ich war auf Seite X, habe Y geklickt und
   dann kam Z statt W."* Ein Screenshot hilft enorm.

4. **Geschwindigkeit**
   – Hat sich irgendwas "hakelig" oder langsam angefühlt?

5. **Vertrauen**
   – Würdest Du die Plattform beruflich nutzen? Was würde Dich davon abhalten?
   Was würde Dich überzeugen?

---

## Teil E – Häufige Fragen

**Ich bekomme eine "Zertifikat ungültig"-Warnung.**
Bitte Screenshot machen und zurückmelden – das darf nicht passieren.

**Ich habe mein neues Passwort vergessen.**
Kein Problem, kurz melden, dann wird es zurückgesetzt. In der Beta ist es **nicht
gefährlich**, das Passwort mehrfach neu zu vergeben.

**Die Seite lädt gar nicht / Browser sagt "Verbindung nicht möglich".**
Bitte die genaue URL und ungefähr die Uhrzeit notieren – das hilft, das Problem
im Serverlog wiederzufinden.

**Darf ich "kaputte" Dinge ausprobieren (falsche Passwörter, Sonderzeichen,
absichtlich komische Dateinamen)?**
**Ja, unbedingt!** Das ist das Ziel eines Softwaretests. Alles, was einen normalen
Nutzer verwirren könnte, darfst Du provozieren.

**Bleiben meine Testdateien erhalten?**
Während der Testphase: ja. Nach dem Abschluss des Tests werden die Accounts und
deren Daten gelöscht.

---

Vielen Dank! 🙏 Dein Feedback fließt direkt in die Weiterentwicklung ein.
