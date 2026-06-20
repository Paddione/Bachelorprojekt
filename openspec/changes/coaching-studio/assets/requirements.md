# Funktionale Anforderungen — Coaching-Sessions Service (T001002)

> **Autoritativ.** Vom User am 2026-06-20 bereinigte und aktualisierte Anforderungsliste.
> Widersprüche aufgelöst, Architektur durch zentrale DB vereinfacht, Audio-Workflow
> auf den Coach zugeschnitten. Diese Liste geht dem Prototyp-Intent vor, wo sie Details
> präzisiert (insb. Nextcloud-Talk-Audio, Speicher-Highlighting).

## 1. Sitzungs- und Kundenverwaltung (Sessions)
- Jede Session wird direkt dem jeweiligen Kundenprofil zugeordnet.
- Es müssen mehrere unabhängige Sessions pro Kunde möglich sein.
- Sessions können jederzeit pausiert und zu einem späteren Zeitpunkt fortgesetzt ("wiederbelebt") werden.
- Eine abgeschlossene oder pausierte Session kann kopiert und als neue, editierbare Vorlage geöffnet werden.
- Bei der Nutzung einer alten Session als Vorlage gibt es eine Vergleichsansicht (Alt vs. Neu), idealerweise in einem neuen Fenster.
- Nach Abschluss einer Session wird der gesamte Verlauf dauerhaft in der Kundenakte gespeichert.

## 2. Profil- und Datenmanagement
- Kundendaten, individuelle KI-Profile und Session-Verläufe werden zentral in einer einzigen Datenbank gespeichert.
- Das System legt für jeden Kunden genau ein individuelles KI-Profil an.
- Die Standardprofilfragen (für das KI-Profil) müssen im Admin-Bereich dynamisch inhaltlich und strukturell erweiterbar sein.
- Profilwerte können über eine Checkbox individuell ausgewählt werden.
- Nur die per Checkbox markierten Profilwerte werden für die jeweilige KI-Anfrage (Session) herangezogen.

## 3. Prompt-Management und Ebenensteuerung
- Das System verfügt über 10 verschiedene Ebenen für den Gesprächsverlauf.
- Jede Ebene besitzt einen definierten Standard-Prompt, der im Admin-Bereich editiert werden kann.
- Der Standard-Prompt wird in der laufenden Session geladen und kann dort für die aktuelle Anfrage individuell angepasst werden.
- Es gibt eine Reset-Funktion ("Schalter"), um einen manuell editierten Prompt jederzeit wieder auf den Standardwert der Ebene zurückzusetzen.

## 4. Zwischenablage und Workflow
- Erstellte Inhalte werden während der Bearbeitung in einer Zwischenablage gehalten.
- Inhalte aus der Zwischenablage können teilweise für die aktuelle Bearbeitung genutzt werden, bis die Anfrage abgeschickt wird.
- Nach dem Abschicken der Anfrage und dem Aufrufen der nächsten Ebene wird die Zwischenablage geleert.

## 5. Speicherung und Export
- Spezifische Speicherzustände müssen im System visuell hervorgehoben werden (Fokus auf "Zielsetzungen" und "Vereinbarungen").
- Am Ende der Session muss der gesamte Verlauf (inklusive der hervorgehobenen Zielsetzungen und Vereinbarungen) exportierbar und ausdruckbar sein.

## 6. Benutzeroberfläche und Präsentationsmodus
- Sessionbezogene Maßnahmen (wie Texteingaben und KI-Antworten) werden in einem separaten Fenster angezeigt.
- Dieses Fenster dient dazu, dem Klienten die Inhalte per Bildschirmfreigabe (via Nextcloud Talk) oder auf einem Zweitmonitor vor Ort zu präsentieren.
- Die Standard-Eingabemethode für alle Formularfelder ist das Tippen per Tastatur.
- Jedes Formularfeld bietet optional die Möglichkeit der Spracheingabe.

## 7. Audioeingabe und Transkription
- Die Kommunikation mit Remote-Klienten läuft extern über Nextcloud Talk; das System selbst benötigt keine Audio-Verbindung zum Klienten.
- Die Spracheingabe- und Aufnahmefunktion des Systems nutzt ausschließlich das Mikrofon des Coaches.
- Der Coach kann die Mikrofonaufnahme bei Bedarf manuell (per Knopfdruck) starten, um eigene Notizen, Prompts oder zusammengefasste Kundenaussagen einzusprechen.
- Die Audio-Aufnahme wird durch die KI in Text transkribiert.
- Die Aufnahme/Transkription muss vor dem Absenden an die KI abhörbar, löschbar oder ersetzbar sein.
- Der transkribierte Text kann im Textfeld gelesen, manuell angepasst und dann abgeschickt werden.

## 8. Übersetzung und Sprachausgabe (Internationalisierung)
- Prompts und KI-Ausgaben können auf Knopfdruck in verschiedene Zielsprachen übersetzt werden.
- Die Übersetzung wird immer parallel zum deutschen Originaltext angezeigt.
- Unterstützte Zielsprachen sind mindestens: Farsi, Arabisch, Türkisch, Englisch und Französisch.
- Das Einsprechen durch den Coach (Transkription) muss auch in diesen Zielsprachen unterstützt werden.
- Texte (Prompts und Ausgaben) können auf Knopfdruck in der jeweiligen Sprache vorgelesen werden (Text-to-Speech), um sie dem Klienten z. B. über den Nextcloud Talk-Audiokanal vorzuspielen.

---

## Architektur-Konsequenzen (abgeleitet)

- **Audio-Stack**: Kein LiveKit für MVP. Nextcloud Talk (bereits im Cluster) übernimmt die Client-Audio-Verbindung extern. Das System nutzt nur das Coach-Mic → faster-whisper-Transkription. Massiv vereinfacht.
- **Präsentationsfenster**: Separate Fenster-Route (wie `Praesentation.html` im Prototyp) für Bildschirmfreigabe via Nextcloud Talk oder Zweitmonitor.
- **Speicher-Highlighting**: Ebene 05 (Zielbild → "Zielsetzungen") und Ebene 09 (Vereinbarungen) erhalten visuelle Hervorhebung als persistente Speicherzustände; der Export inkludiert diese explizit.
- **Zentrale DB**: Eine Datenbank (shared-db), neue `studio.*`-Schema-Familie (oder Erweiterung des bestehenden `coaching.*`-Schemas — im Plan zu entscheiden).
