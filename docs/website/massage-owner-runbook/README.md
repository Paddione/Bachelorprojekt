# Massage Owner-Runbook (T901029)

Tagesablauf, Störfälle und Launch-Readiness für die Massage-Praxis.
Platzhalter sind mit `[PLATZHALTER: ID]` markiert und werden beim
Owner-Handover durch echte Inhalte ersetzt.

## 1. Tagesablauf

1. **Anfragen prüfen** (`/owner/anfragen`): offene Anfragen mit
   Service, Slot und Kontakt sichten.
2. **Annehmen oder ablehnen**: Annehmen prüft automatisch erneut
   Verfügbarkeit, Ablauf und Mindestvorlauf (Vortag-Regel); bei Erfolg
   geht die Bestätigung an den Gast. Ablehnen sendet die Notiz mit.
3. **Telefon-Anfragen**: manuell als Anfrage anlegen (selber Flow,
   kein öffentlicher Pfad für Hausbesuche — Ausnahmen trägt die
   Inhaberin mit Ort ein).
4. **Tagesübersicht** (`/owner/kalender`): Termine, Blockerzeiten,
   Erinnerungsstatus.
5. **Versandstatus**: Spalte in `/owner/anfragen`; fehlgeschlagene
   Nachrichten per „Erneut senden" wiederholen (3 Versuche automatisch,
   danach manuell).

## 2. Storno und Umbuchung

- **Gast storniert selbst** per Token-Link aus der Bestätigungsmail:
  möglich aus „angefragt" und „bestätigt"; die Inhaberin erhält
  eine Notiz.
- **Gast will umbuchen**: Token-Link erzeugt eine neue, verknüpfte
  Anfrage; die alte wird geschlossen.
- **Inhaberin storniert**: über `/owner/anfragen` bzw. Kalender mit
  Notiz an den Gast. Stornoregel: `[PLATZHALTER: STORNO-REGEL]`
  (z. B. kostenfrei bis 24 h vorher).
- Nach Storno gehen **keine** Erinnerungen mehr raus.

## 3. Erinnerungen

- Automatisch 24 Stunden vor Terminbeginn per E-Mail, werbefrei.
- Nur an bestätigte Termine; Voraussetzung ist der laufende
  CronJob `appointment-reminders` (stündlich).
- Bei Zustellfehlern: Versandstatus prüfen, erneut senden.

## 4. Kunden

- Verzeichnis unter `/owner/kunden`: Kunden entstehen automatisch
  aus Anfragen (E-Mail als Schlüssel).
- Suche per Name oder E-Mail; Terminhistorie pro Kunde.
- **Dubletten** werden nur vorgeschlagen, nie still vereint;
  Zusammenführung nur nach expliziter Bestätigung beider Einträge.
- **Korrektur, Export (CSV), Löschung** pro Kunde. Löschung beachtet
  Steuerfristen: Rechnungsdaten bleiben bestehen (Aufbewahrung),
  der Rest wird anonymisiert.
- Keine Behandlungsnotizen im System (gesundheitsdatenfrei).

## 5. Rechnungen

- Erstellen aus bestätigtem Termin unter `/owner/rechnungen`
  (eine Rechnung pro Termin; Duplikate werden abgewiesen).
- Nummern fortlaufend pro Jahr; Pflichtangaben nach §14 UStG;
  Kleinunternehmer-Hinweis ist voreingestellt
  (abschaltbar nach Steuerberatung).
- **Zahlungsstatus manuell** pflegen: bezahlt oder offen, Methode
  Bar, Überweisung oder Sonstige.
- **Korrektur** nur per Storno und Neuausstellung (Original bleibt).
- **CSV-Export** über Zeitraum für die Steuerberatung.
- Rechnungssteller-Daten setzen: `[PLATZHALTER: CREDITOR-NAME]`,
  `[PLATZHALTER: CREDITOR-ADRESSE]`,
  `[PLATZHALTER: STEUERNUMMER]`.

## 6. Inhalte pflegen

- Texte, Preise, Profil und FAQs liegen in
  `components/website/content/massage/*.json` und ersetzen die
  Platzhalter-Slots (IDs im Bundle).
- Offene Slots: `[PLATZHALTER: PRAXIS-NAME]`,
  `[PLATZHALTER: PREIS-RUECKEN-30]`,
  `[PLATZHALTER: PREIS-GANZKOERPER-60]`,
  `[PLATZHALTER: PREIS-GANZKOERPER-90]`,
  `[PLATZHALTER: PROFILTEXT]`, `[PLATZHALTER: TELEFON]`,
  Porträt- und Praxis-Fotos (lizensiert).
- Öffentlich steht nur der Ort; die genaue Anfahrt geht erst mit
  der Buchungsbestätigung raus.

## 7. Störfälle

| Symptom | Maßnahme |
|---|---|
| Keine Anfragen sichtbar | `/owner/anfragen` neu laden; Versandstatus prüfen; CronJob-Status prüfen |
| Gast meldet: kein Token-Link | Spam-Ordner; erneut senden; E-Mail-Adresse korrigieren |
| Doppelter Termin | Kalender prüfen; eine Anfrage ablehnen/stornieren; Gast informieren |
| Rechnung falsch | Storno + Neuausstellung (nie überschreiben) |
| Seite nicht erreichbar | Status-Seite prüfen; Deployment-Logs sichten; Rollback per Revert-PR |

## 8. Backup und Recovery

- Datenbank-Backup nach `docs/runbooks/business-restore.md`
  (Restore-Demo dort beschrieben).
- Recovery-Probe vor Launch einmal durchspielen und hier
  abhaken (siehe Checkliste).

## 9. Launch-Readiness-Checkliste

- [ ] Owner-Inhalte gesetzt (alle Platzhalter aus §5–6 ersetzt)
- [ ] Echte Preise und Stornoregel mit Steuerberatung abgestimmt
- [ ] Test-Anfrage Ende-zu-Ende auf Staging gefahren (E2E fa-62 grün)
- [ ] Erinnerungs-CronJob aktiv und verifiziert
- [ ] Backup/Restore-Probe durchgeführt
- [ ] Erreichbarkeit mobil + Tastatur geprüft
- [ ] Live-Smoke mit Owner-Freigabe (Publish nur mit Autorisierung)

## 10. Pilot-Nachweis (Platzhalter-Inhalte)

- E2E-Spec `tests/e2e/specs/fa-62-massage-pilot.spec.ts`: 8/8 grün
  gegen lokale Massage-Instanz (PR #6384).
- Abgedeckt: Homepage/Leistungen/FAQ, Slots, Anfrage + Idempotenz,
  Gleich-Tag-Abweisung, Token-Status, Storno, Cron/Owner-Guards,
  Umbuchung. Owner-Login-Flows brauchen die manuelle Owner-Probe.
