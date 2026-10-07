# Business-Brief: Massagepraxis (Arbeitstitel „Massagepraxis Vögelsen“)

**Ticket:** T901018 · **Epic:** T901016 Homepagedesign · **Stand:** 2026-10-07
**Status:** Entwurf zur Abstimmung mit der Inhaberin (kein owner-reviewter Finalstand)
**DoR:** 4/4 bestätigte Entscheidungsblöcke — entblockt die Folge-Tickets unter T901016

Dieses Dokument konsolidiert ausschließlich bestätigte Angaben aus T901018
(Beschreibung + Klärungsrunde 2026-10-07) sowie den bestätigten Scope aus
T901016/T901023. Alles Nicht-Bestätigte steht explizit unter „Offene Punkte“.
Platzhalter sind als solche markiert und keine Festlegung.

## 1. Geschäft und Positionierung

- Selbstständige professionelle Masseurin (Mutter des Auftraggebers).
- Arbeitsname: „Massagepraxis Vögelsen“ — finaler Geschäfts-/Markenname wird
  im Entwurf abgestimmt.
- Standort: In der Twiet 4, Vögelsen bei Lüneburg, Deutschland. Schreibweise
  und postalische Angaben sind vor Veröffentlichung zu bestätigen.
- Die Standortangabe allein ist keine Freigabe zur Veröffentlichung; welche
  Adressdetails öffentlich erscheinen, ist separat zu entscheiden (offen).
- Qualifikation, Leistungspositionierung, Sprachen und Zielgruppe: noch nicht
  dokumentiert (Fragebogen-Antworten ausstehend, siehe Offene Punkte).

## 2. Betriebsmodell (bestätigt 2026-10-04)

- Regulär kommen Kunden zur Behandlungsadresse (Praxis vor Ort).
- Hausbesuche sind ausschließlich Ausnahmen für der Inhaberin bekannte Kunden
  und werden individuell durch sie vereinbart.
- Öffentliche Terminanfragen beziehen sich standardmäßig auf Behandlungen vor
  Ort; Hausbesuche werden nicht als frei buchbare Standardoption angeboten.
- Der Kalender muss solche Ausnahmen manuell mit Ort und gegebenenfalls
  Fahrt-/Zeitpuffer erfassen können.
- Keine automatische Freigabe aufgrund eines Kundeneintrags.

## 3. Leistungskatalog (Vorlage mit Platzhalter-Preisen)

Per Klärungsrunde 2026-10-07 als Standard-Vorlage entworfen — Preise und
Feinschnitt sind Platzhalter zur Abstimmung, keine Festlegung:

| Leistung | Dauer | Preis |
|---|---|---|
| Rückenmassage | 30 Min. | Platzhalter |
| Ganzkörpermassage | 60 Min. | Platzhalter |
| Ganzkörpermassage | 90 Min. | Platzhalter |

Echte Preise, Währung, Kostenbasis (Betriebskosten, Workload der Inhaberin)
und der finale Leistungskatalog sind offen. Die frühere Ketten-Umsatzbeteiligung
ist Nutzer-Kontext, keine verifizierte Rentabilitätsprognose.

## 4. Arbeitszeiten und Verfügbarkeit

- Kernzeiten Montag–Freitag mit flexiblen Slots nach Vereinbarung
  (Klärungsrunde 2026-10-07).
- Konkrete Uhrzeiten, Pausen zwischen Behandlungen, Fahrtpuffer, Kapazität,
  Feiertage und Storno-/No-Show-Regeln sind offen.

## 5. Buchungsregeln — Mindestvorlauf (bestätigt 2026-10-04)

- Terminanfragen müssen spätestens am vorherigen Kalendertag eingehen.
  Keine öffentlichen Anfragen für denselben Tag.
- „Am Tag vorher“ = Vortag in der Zeitzone Europe/Berlin, nicht automatisch
  volle 24 Stunden Abstand. Datumswechsel und Sommer-/Winterzeit anhand
  Europe/Berlin prüfen.
- Eine frühere Annahmeschluss-Uhrzeit am Vortag ist noch nicht festgelegt.
- Die Regel ist der Buchungsvorlauf — getrennt von Pausen zwischen
  Behandlungen oder Fahrtpuffern.
- Die Anfrage bleibt bis zur Annahme durch die Inhaberin unbestätigt.
- Bei der Bestätigung Verfügbarkeit und abgelaufene Termine erneut prüfen;
  der dokumentierte Anfragezeitpunkt dient zur Prüfung des Mindestvorlaufs.
- Manuelle Sondertermine sind dadurch nicht pauschal freigegeben.
- Akzeptanz: Gleich-Tages-Anfrage serverseitig zurückweisen; Anfrage für
  morgen zulassen, sofern sonstige Regeln passen.

## 6. Tagesablauf (Daily Workflow)

Anfrage → Bestätigung → Besuch → Zahlung/Rechnung; Stammkunde kehrt zurück:

1. **Anfrage:** Kunde stellt eine Terminanfrage (online; Telefon/Offline-
   Buchungen trägt die Inhaberin manuell nach). Anfrage ist unbestätigt.
2. **Bestätigung:** Nur die Inhaberin bestätigt — nach Re-Prüfung von
   Verfügbarkeit, Mindestvorlauf und abgelaufenen Terminen.
3. **Besuch:** Behandlung vor Ort (Standard) oder manueller Ausnahme-
   Hausbesuch mit Ort/Puffer im Kalender. Umbuchen/Stornieren und
   Zeitblocken durch die Inhaberin, auch mobil.
4. **Zahlung/Rechnung:** Basis-Kunden-/Rechnungsverwaltung mit einfacher
   Bezahlt-/Unbezahlt-Erfassung ohne Zahlungsabwicklung.
5. **Stammkunde:** Wiederkehrende Kunden fragen erneut an; keine
   automatische Freigabe aus dem Kundeneintrag.

## 7. MVP-Abgrenzung (bestätigt 2026-10-04)

Enthalten: Astro-Website + Terminanfragen + Inhaber-Kalender + Basis-
Kunden-/Rechnungsverwaltung. Anfrage-mit-Bestätigung (kein Sofort-Booking).

Zurückgestellt: Online-Zahlungen und Anzahlungen.

Plattform-Kontext: Astro zuerst; Umfang nicht größer als die bestehende
Mentolder-Website, Geschäftsfunktionen kommen hinzu. Die Massagepraxis ist
der erste neue Mandant der gemeinsamen Plattform; Mentolder migriert danach.
Details (Mandantentrennung, Identitäten, Speicher, Audit, Backup) gehören zu
T901020 und sind hier keine Festlegung.

## 8. Offene Punkte (explizit)

- Finaler Geschäfts-/Markenname.
- Zielgruppe, Qualifikation, Leistungspositionierung, Sprachen.
- Echte Preise/Währung, Kostenbasis, Öffnungszeiten-Details, Pausen, Puffer,
  Kapazität, Feiertage.
- Annahmeschluss-Uhrzeit am Vortag; Storno-/No-Show-Regeln.
- Welche Adressdetails öffentlich erscheinen.
- Externe Kalendersynchronisation (ob/ welche).
- Homepage-Inhalte, Bilder/Stil, Besucher-Journeys (T901021).
- Datenschutz-/Client-Daten-Anforderungen (T901019).
- Fragebogen-Antworten der Inhaberin (59 Fragen, 10 Abschnitte, Stand
  2026-10-04 erstellt) stehen noch aus.

## 9. DoR 4/4 und Entblockung

Bestätigte Entscheidungsblöcke:

1. Bestätigtes Betriebsmodell (2026-10-04).
2. Mindestvorlauf für Terminanfragen (2026-10-04).
3. Bestätigter Scope/MVP (2026-10-04).
4. Klärungsrunde: Arbeitsname, Katalog-Vorlage, Kernzeiten (2026-10-07).

Direkt entblockt: T901019, T901020, T901021, T901023 (Blocks-Kanten an
T901018). Alle übrigen Folge-Tickets unter T901016 bleiben bis zum
Owner-Review dieses Entwurfs und ihrer eigenen DoR zurückgestellt.

## Quellen

- T901018 Beschreibung (Blöcke 2026-10-04) und Timeline-Kommentar
  „Klärungsrunde 2026-10-07“.
- T901016 (Epic, Plattformrichtung, Fragebogen-Notiz) und T901023
  (bestätigte Blöcke, Kalender-Akzeptanz).
