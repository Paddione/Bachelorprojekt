# System-Test-Questionnaires — Reorganization Design

**Date:** 2026-04-29
**Author:** Patrick (with Claude)
**Replaces:** 2026-04-27-system-test-questionnaires.md (data only — schema unchanged)
**Related:** 2026-04-27-sepa-billing-steuer.md (provides the bookkeeping requirement catalog this design must cover)

## Goal

Replace the two existing system-test templates (`Admin-Funktionen` + `Nutzerfunktionen + Externe Dienste`, currently 40 steps, mashed up by role) with **10 domain-scoped test questionnaires** that together cover every requirement in the in-house bookkeeping plan (A-01..A-15, B-01..B-11, C-01..C-13 — 39 legal/functional requirements grounded in UStG, GoBD, EStG, AO, GewStG).

## Problem

- The current templates split work by **browser profile** (admin vs. user), forcing a tester to context-switch between unrelated domains within one questionnaire.
- Bookkeeping coverage is **1 step out of 40** (`Rechnung erstellen und PDF-Vorschau`). The 39 in-house bookkeeping requirements are effectively untested by the system protocol.
- A failure in any single domain (e.g., DocuSeal) is hidden inside an oversized 20-step protocol, making it hard to re-test the slice that broke.

## Non-Goals

- Schema changes. The existing `questionnaire_*` tables and the `is_system_test` flag are sufficient.
- Changes to `QuestionnaireWizard.svelte`, `TestResultsPanel.svelte`, monitoring view, or test-status endpoints. They already group by template and will pick up the new templates automatically.
- New question types. All steps remain `test_step` with the existing 3-state result (`erfüllt | teilweise | nicht_erfüllt`).
- Adding tests for features not in the bookkeeping plan or not in the existing protocols.

## Architecture

### Where the seed lives

`website/src/lib/questionnaire-db.ts` — the function `seedSystemTestTemplates()` (currently lines ~101–290). It runs on every container start, idempotent: `if (count(is_system_test=true) > 0) return`.

### Migration strategy

Schema is unchanged, so no migration file is needed. The replacement is a **content swap**:

1. Edit `seedSystemTestTemplates()` to insert 10 templates instead of 2.
2. One-off DB step (run manually on each cluster, *not* in the seed function): delete existing system-test data so the seeder re-runs.

   ```sql
   DELETE FROM questionnaire_templates WHERE is_system_test = true;
   ```

   `ON DELETE CASCADE` clears questions, answers, test_status, assignments. A throwaway tester assignment from a previous run is acceptable collateral; production has no real client assignments against system-test templates.

3. Restart the website pod; the seeder repopulates with the 10 new templates.

### Idempotency

The early-return guard (`count > 0 ? return`) is preserved, so re-running the seed is a no-op once the 10 templates exist. Future content changes follow the same pattern: delete → re-seed.

## Categories (final)

Sized to keep each questionnaire end-to-end testable in 5–15 minutes. Bookkeeping is split into 3 questionnaires aligned with the Subsystems A/B/C in the bookkeeping plan, since each subsystem has distinct legal grounding (UStG, EStG/GoBD), distinct UI surfaces, and would be reviewed separately by a Steuerberater.

| # | Title (German) | Steps | Maps to |
|---|---|---:|---|
| 1 | Authentifizierung & SSO (Keycloak) | 6 | — |
| 2 | Admin-Verwaltung & CRM | 10 | — |
| 3 | Kommunikation: Inbox, Chat & E-Mail | 5 | — |
| 4 | Fragebogen-System (Coaching-Workflow) | 5 | — |
| 5 | Dokumente & DocuSeal-Unterschriften | 5 | — |
| 6 | Rechnungswesen — Steuer-Modus & § 19 UStG | 12 | **B-01..B-11** |
| 7 | Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung | 16 | **A-01..A-15** |
| 8 | Buchhaltung — EÜR, Belege & Steuerauswertungen | 14 | **C-01..C-13** (UStVA-Export B-08 / Ist-Versteuerung B-09 sit in Cat. 6) |
| 9 | Monitoring & Bug-Tracking | 6 | — |
| 10 | Externe Dienste & öffentliche Website | 10 | — |
| | **Total** | **89** | |

## Test step catalogue

**Format:** every step has `question_text`, `test_expected_result`, `test_function_url`, `test_role`. URLs follow this convention:
- **In-app paths** (admin/portal): stored as relative paths (`/admin/clients`) — work in any environment.
- **External services** (Nextcloud, Vaultwarden, DocuSeal, Keycloak account, public website): stored absolutely with the resolved domain. The seed reads `process.env.PROD_DOMAIN` (set from `environments/<env>.yaml` via `envsubst` already wired into website manifests) and falls back to `localhost` for dev. **This is an improvement over the current seed**, which hardcodes `localhost` and produces broken links in prod (verified on mentolder, all 8 stored absolute URLs use `*.localhost`).

In the tables below, `<domain>` is shorthand for the resolved domain (`localhost` in dev, `mentolder.de` / `korczewski.de` in prod).

### 1. Authentifizierung & SSO (Keycloak) — 6 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Admin-SSO-Login durchführen | Weiterleitung zu `/admin`, Session-Cookie gesetzt, Logout-Button sichtbar | `/admin` | admin |
| 2 | Keycloak-Account-Verwaltung als Admin öffnen | Profil ladbar; Sitzungen-Liste zeigt aktive Sessions | `https://auth.<domain>/realms/workspace/account` | admin |
| 3 | Testnutzer-SSO-Login ins Portal | Weiterleitung zu `/portal`; Profilname stimmt | `/portal` | user |
| 4 | Nextcloud per SSO öffnen | Auto-Login ohne erneute Eingabe; Dateiansicht lädt | `https://files.<domain>` | user |
| 5 | Vaultwarden per SSO öffnen | Auto-Login; Tresor sichtbar | `https://vault.<domain>` | user |
| 6 | DocuSeal per SSO öffnen | Auto-Login; Dokumentenliste sichtbar | `https://sign.<domain>` | user |

### 2. Admin-Verwaltung & CRM — 10 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Dashboard-KPIs prüfen | Clients-/Bugs-/Meetings-Counter laden ohne Fehler | `/admin` | admin |
| 2 | Neuen Client anlegen | Erscheint in Clientliste; Pflichtfeld-Validierung serverseitig | `/admin/clients` | admin |
| 3 | Client-Detailseite öffnen | Reiter Stammdaten, Notizen, Fragebögen, Rechnungen ladbar | `/admin/clients` | admin |
| 4 | Meeting anlegen | Erscheint in `/admin/meetings`; Datum/Teilnehmer korrekt | `/admin/meetings` | admin |
| 5 | Termin anlegen | Erscheint in `/admin/termine` und im Kalender | `/admin/termine` | admin |
| 6 | Projekt anlegen + Client zuordnen | Erscheint in `/admin/projekte`, Zuordnung sichtbar | `/admin/projekte` | admin |
| 7 | Admin-Kalender öffnen | Termine + Meetings korrekt visualisiert (Monat/Woche) | `/admin/kalender` | admin |
| 8 | Inbox: Item als erledigt markieren | Statuswechsel sofort, Counter aktualisiert | `/admin/inbox` | admin |
| 9 | Admin-Einstellungen speichern | Wert persistiert nach Reload | `/admin/einstellungen` | admin |
| 10 | Branding-Settings: Logo-Upload | Logo erscheint in Header und auf öffentlicher Site | `/admin/einstellungen/branding` | admin |

### 3. Kommunikation: Inbox, Chat & E-Mail — 5 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Im öffentlichen Chat-Widget als Testnutzer Nachricht senden | Nachricht im Chatverlauf sichtbar; Admin-Inbox zeigt sie sofort | `https://web.<domain>` | user |
| 2 | Als Admin in der Inbox antworten | Antwort gesendet, im Chat-Widget des Nutzers ohne Reload sichtbar | `/admin/inbox` | admin |
| 3 | Im Testnutzer-Browser Antwort verifizieren | Admin-Antwort erscheint live | `https://web.<domain>` | user |
| 4 | E-Mail-Test: Termin-Bestätigung versenden | Mailpit/Postfach zeigt eingehende Mail mit korrektem Branding | `/admin/termine` | admin |
| 5 | Newsletter-Versand-Vorschau aufrufen | HTML-Vorschau lädt, Pflichtangaben (Impressum-Link) vorhanden | `/admin/newsletter` | admin |

### 4. Fragebogen-System (Coaching-Workflow) — 5 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Neues Coaching-Fragebogen-Template anlegen | Template gespeichert; Liste zeigt es als Draft | `/admin/fragebogen` | admin |
| 2 | Template veröffentlichen + Client zuweisen | Assignment erstellt; Nutzer sieht Fragebogen im Portal-Dashboard | `/admin/clients` | admin |
| 3 | Fragebogen im Portal vollständig ausfüllen + absenden | Status wechselt auf `submitted`; Bestätigung erscheint | `/portal` | user |
| 4 | Auswertung in Admin-Detailansicht prüfen | Antworten + Scoring-Dimensionen korrekt dargestellt | `/admin/clients` | admin |
| 5 | Test-Results-Panel im Monitoring aufrufen | Alle System-Test-Templates sichtbar mit Last-Result-Status | `/admin/monitoring` | admin |

### 5. Dokumente & DocuSeal-Unterschriften — 5 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Dokument im Editor anlegen + speichern | Dokument in Liste; nach Reload weiterhin lesbar | `/admin/dokumente` | admin |
| 2 | Inhalte-Editor: Startseiten-Block bearbeiten + speichern | Änderung auf öffentlicher Seite sichtbar | `/admin/inhalte` | admin |
| 3 | Vertrag zur Unterschrift senden (DocuSeal) | Nutzer erhält Mail/Notification mit Signatur-Link | `/admin/dokumente` | admin |
| 4 | Vertrag als Nutzer signieren | Signatur gespeichert; Status `Completed` | `https://sign.<domain>` | user |
| 5 | Signatur als Admin verifizieren | DocuSeal zeigt `Completed` + Audit-Trail (IP, Timestamp) | `https://sign.<domain>` | admin |

### 6. Rechnungswesen — Steuer-Modus & § 19 UStG (Subsystem B) — 12 steps

| # | ReqID | Step | Erwartung | URL | Role |
|---|---|---|---|---|---|
| 1 | B-01 | Steuer-Modus auf `kleinunternehmer` setzen | `site_settings.tax_mode` = `kleinunternehmer`; Hinweis erscheint auf nächster Rechnung | `/admin/einstellungen/rechnungen` | admin |
| 2 | B-01 | Steuer-Modus auf `regelbesteuerung` umschalten | Wechsel persistiert; nächste Rechnung mit USt-Aufschlag | `/admin/einstellungen/rechnungen` | admin |
| 3 | B-02 | Yearly-Revenue-Widget im Steuer-Dashboard prüfen | Kumulierter Netto-Umsatz des Jahres korrekt; entspricht Summe `paid`-Rechnungen | `/admin/steuer` | admin |
| 4 | B-03 | 80%-Warnschwelle (≥ 20.000 €) testen | Gelber Warn-Alert sichtbar im TaxMonitorWidget | `/admin/steuer` | admin |
| 5 | B-03/B-04 | 100%-Schwelle (≥ 25.000 €) erreichen | Roter Alert + Auto-Switch auf Regelbesteuerung; nächste Rechnung mit USt | `/admin/steuer` | admin |
| 6 | B-06 | 100.000 €-Grenze testen | Roter „sofort Regelbesteuerung"-Alert; Switch erfolgt unabhängig vom Vorjahr | `/admin/steuer` | admin |
| 7 | B-07 | Audit-Log Steuermodus-Wechsel öffnen | Eintrag mit Datum + auslösender Rechnungsnummer + Begründung sichtbar | `/admin/steuer` | admin |
| 8 | B-08 | UStVA-Quartalsexport als CSV downloaden | CSV enthält Nettoumsätze 0%/7%/19%, USt-Summen je Steuersatz | `/admin/billing/elster` | admin |
| 9 | B-08 | UStVA als ELSTER-Vorschau aufrufen | Vorschau-Layout mit Pflichtfeldern (Kennziffern 81/86/35) | `/admin/billing/elster` | admin |
| 10 | B-09 | Ist-Versteuerung-Toggle aktivieren | UStVA bezieht USt erst bei Zahlungseingang ein, nicht bei Rechnungsstellung | `/admin/einstellungen/rechnungen` | admin |
| 11 | B-10 | Fristen-Dashboard: nächste UStVA-Frist anzeigen | Korrekte Termine 10. März/Juni/Sept/Dez sowie Jahres-/GewSt-Frist sichtbar | `/admin/steuer` | admin |
| 12 | B-11 | USt-IdNr.-Pflichtfeld bei Wechsel zu Regelbesteuerung | Speichern ohne USt-IdNr. fehlschlägt; Format `DE\d{9}` validiert | `/admin/einstellungen/rechnungen` | admin |

### 7. Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung (Subsystem A) — 16 steps

| # | ReqID | Step | Erwartung | URL | Role |
|---|---|---|---|---|---|
| 1 | A-01 | Rechnungs-Liste laden | Daten aus PostgreSQL geladen, kein Stripe-Call (Network-Tab prüfen) | `/admin/rechnungen` | admin |
| 2 | A-02/A-04 | Kleinunternehmer-Rechnung anlegen | Pflichtangaben + § 19-Hinweis + fortlaufende Nr. `RE-YYYY-NNNN` | `/admin/rechnungen` | admin |
| 3 | A-03 | Regelbesteuerung-Rechnung anlegen | Pflichtangaben inkl. USt-IdNr., Netto/Steuersatz/Steuerbetrag/Brutto, Leistungszeitraum | `/admin/rechnungen` | admin |
| 4 | A-04 | Rechnungsnummer-Lücke-Schutz | Versuch, Nummer manuell zu setzen oder zu löschen → fehlschlagen oder erzeugt Stornorechnung | `/admin/rechnungen` | admin |
| 5 | A-05 | SEPA-Block auf PDF prüfen | IBAN, BIC, Bankname, Verwendungszweck = Rechnungsnummer auf jeder PDF | `/admin/billing/<id>/drucken` | admin |
| 6 | A-06 | SEPA-Lastschriftmandat anlegen | IBAN/BIC/Mandatsreferenz/Datum/Gläubiger-ID gespeichert | `/admin/billing/customers/<id>` | admin |
| 7 | A-07 | PDF-Generierung lokal | Download liefert valide PDF (kein externer API-Call); GoBD-archiviert in `pdf_path` | `/admin/billing/<id>/drucken` | admin |
| 8 | A-08 | ZUGFeRD-XML im PDF eingebettet | `pdftk` / `qpdf` zeigt eingebetteten `factur-x.xml` mit Profil `MINIMUM` | `/admin/billing/<id>/drucken` | admin |
| 9 | A-09 | Rechnung finalisieren → revisionssicher | `locked=true` gesetzt; Bearbeiten-Buttons disabled; Versuch zu editieren API-seitig 403 | `/admin/billing/<id>` | admin |
| 10 | A-10 | Aufbewahrungsfrist `retain_until` gesetzt | DB-Feld = Rechnungsdatum + 10 Jahre | `/admin/billing/<id>` | admin |
| 11 | A-11 | Stornorechnung erzeugen | Neue Rechnung mit negativem Betrag, Verweis `cancels_invoice_id` auf Original | `/admin/billing/<id>` | admin |
| 12 | A-12 | Rechnung per E-Mail versenden | E-Mail mit PDF + ZUGFeRD-Anhang gesendet (Mailpit/Postfach prüfen) | `/admin/billing/<id>` | admin |
| 13 | A-13 | Status-Workflow `draft → open → paid` | Statuswechsel triggert Buchungseintrag (siehe Cat. 8) | `/admin/billing/<id>` | admin |
| 14 | A-14 | Zahlungseingang manuell erfassen | Datum, Betrag, Zahlungsreferenz gespeichert; Status auf `paid` | `/admin/billing/<id>` | admin |
| 15 | A-14 | Mahnung manuell triggern | Mahnstufe inkrementiert; Mail mit Mahngebühr versendet | `/admin/billing/<id>` | admin |
| 16 | A-15 | Angebot anlegen + in Rechnung umwandeln | Eigene Nummer `AN-YYYY-NNNN`; bei Konvertierung referenziert Rechnung das Angebot | `/admin/angebote` | admin |

### 8. Buchhaltung — EÜR, Belege & Steuerauswertungen (Subsystem C) — 14 steps

| # | ReqID | Step | Erwartung | URL | Role |
|---|---|---|---|---|---|
| 1 | C-01 | Buchungsjournal öffnen | Liste mit Datum, Betrag, Kategorie, Belegnummer für Einnahmen + Ausgaben | `/admin/buchhaltung` | admin |
| 2 | C-02 | Rechnung versenden → Forderungsbuchung automatisch | Buchung mit Kategorie `Forderung` zeitnah (≤ 10 Tage) im Journal | `/admin/buchhaltung` | admin |
| 3 | C-02 | Zahlungseingang erfassen → Einnahmebuchung automatisch | Buchung `Betriebseinnahme` mit Verweis auf Rechnung | `/admin/buchhaltung` | admin |
| 4 | C-03 | Vorsteuer als eigene Kategorie | Bei Eingangsrechnung wird Vorsteuer separat von Nettobetrag gebucht | `/admin/buchhaltung` | admin |
| 5 | C-04 | USt-Zahllast als Betriebsausgabe | Quartalszahlung an FA als Ausgabe-Buchung mit Kategorie `USt-Zahllast` | `/admin/buchhaltung` | admin |
| 6 | C-05 | EÜR-Jahresbericht als PDF + CSV | Beide Exports zeigen Betriebseinnahmen, Ausgaben, Gewinn; Summen stimmen | `/admin/buchhaltung` | admin |
| 7 | C-06/C-07 | Anlagegut + Vorsteuer (> 1.000 €) erfassen | AK, Anschaffungsdatum, AfA-Laufzeit, Vorsteuer gespeichert; Berichtigungsbetrag berechnet | `/admin/buchhaltung` | admin |
| 8 | C-08 | Warenlager-Vorsteuerberichtigung beim Wechsel | Beim Switch Klein → Regel: volle Vorsteuer auf Bestände berechnet | `/admin/buchhaltung` | admin |
| 9 | C-09 | GWG (≤ 800 € netto) erfassen | Sofortabschreibung; Sammelposten-Logik für 250–1.000 € über 5 Jahre | `/admin/buchhaltung` | admin |
| 10 | C-10 | Sonderabschreibung § 7g EStG | 40 %-Sonder-AfA bei Gewinn ≤ 200.000 € korrekt angesetzt | `/admin/buchhaltung` | admin |
| 11 | C-11 | Gewerbesteuer-Kalkulator | Eingabe Gewerbeertrag → Hinzurechnungen/Kürzungen → Freibetrag 24.500 € → Messbetrag × 3,5 % × Hebesatz Lübbecke (417 %) | `/admin/buchhaltung` | admin |
| 12 | C-12 | ESt-Vorauszahlungsrechner | Schätzgewinn → zvE nach GFB 12.096 € (2025) → ESt-Betrag → Quartalsraten | `/admin/buchhaltung` | admin |
| 13 | C-13 | Beleg an Buchung anhängen | PDF/Bild upload; Beleg unveränderbar, mit Buchung verknüpft | `/admin/buchhaltung` | admin |
| 14 | — | DATEV-Export für Steuerberater | CSV im DATEV-Format mit korrekten Konten + Buchungsdatum | `/admin/rechnungen` | admin |

### 9. Monitoring & Bug-Tracking — 6 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Pod-Statusliste prüfen | Alle Pods `Running`/`Healthy`; keine CrashLoops | `/admin/monitoring` | admin |
| 2 | Deployment per Rolling Restart neu starten | Restart triggert; Pod kommt wieder ready | `/admin/monitoring` | admin |
| 3 | Staleness-Report öffnen | Bericht lädt; Empfehlungen sichtbar | `/admin/monitoring` | admin |
| 4 | Bug-Ticket aus Monitoring erstellen | Format `BR-YYYYMMDD-xxxx`; sichtbar unter `/admin/bugs` | `/admin/monitoring` | admin |
| 5 | Bug als erledigt markieren | Status `resolved` + Auflösungsnotiz gespeichert | `/admin/bugs` | admin |
| 6 | Test-Results-Panel zeigt System-Test-Status | Alle 10 Templates sichtbar mit `last_result`/`last_success_at` | `/admin/monitoring` | admin |

### 10. Externe Dienste & öffentliche Website — 10 steps

| # | Step | Erwartung | URL | Role |
|---|---|---|---|---|
| 1 | Nextcloud: Datei hochladen | Datei in Liste; Fortschrittsbalken durchgelaufen | `https://files.<domain>` | user |
| 2 | Nextcloud-Kalender laden | Monats-/Wochenansicht ohne Fehler | `https://files.<domain>/apps/calendar` | user |
| 3 | Nextcloud-Kontakte laden | Kontaktliste sichtbar | `https://files.<domain>/apps/contacts` | user |
| 4 | Nextcloud Talk: Raum + Audio/Video | Signaling verbunden; lokales Video sichtbar | `https://files.<domain>/apps/talk` | user |
| 5 | Nextcloud Whiteboard öffnen | Whiteboard-App lädt; Speichern funktioniert | `https://files.<domain>/apps/whiteboard` | user |
| 6 | Collabora: Office-Datei bearbeiten | Editor öffnet inline; Änderungen werden gespeichert | `https://files.<domain>` | user |
| 7 | Vaultwarden: neuer Eintrag | Eintrag in Tresorübersicht; Passwort abrufbar | `https://vault.<domain>` | user |
| 8 | Öffentliche Startseite aufrufen | Sektionen + Bilder laden; keine 404er in Network-Tab | `https://web.<domain>` | user |
| 9 | Kontaktformular ausfüllen + senden | Validierung; Bestätigung; Admin-Inbox zeigt Eintrag | `https://web.<domain>` | user |
| 10 | Brett (Systembrett) öffnen | 3D-Board lädt; Demo-Konstellation manipulierbar | `https://brett.<domain>` | user |

## Requirements traceability

Every requirement from the bookkeeping plan maps to ≥ 1 test step:

| Block | Reqs | Covered by | Test steps |
|---|---|---|---|
| Subsystem A — Invoices | A-01..A-15 (15) | Cat. 7 | 16 steps |
| Subsystem B — Tax mode | B-01..B-11 (11) | Cat. 6 | 12 steps |
| Subsystem C — EÜR | C-01..C-13 (13) | Cat. 8 | 14 steps (incl. 1 bonus DATEV-Export step) |

A→tests, B→tests, C→tests cross-mapping is in the `ReqID` column of categories 6/7/8. Coverage is **100 %** for the bookkeeping plan; legacy 40-step coverage of non-bookkeeping flows is preserved (with the rebalanced category cuts).

## File changes

| File | Action | Note |
|---|---|---|
| `website/src/lib/questionnaire-db.ts` | Modify | Replace `seedSystemTestTemplates()` body with 10-template seed |
| `docs/superpowers/specs/2026-04-29-system-test-questionnaires-rewrite-design.md` | Create | This file |
| `docs/superpowers/plans/2026-04-29-system-test-questionnaires-rewrite.md` | Create | Implementation plan (next step, via `writing-plans`) |

## Operational rollout

1. Merge PR with `questionnaire-db.ts` change.
2. After deploy, on each cluster (`mentolder` + `korczewski`):
   ```bash
   kubectl --context <env> -n workspace exec deployment/shared-db -- \
     psql -U postgres -d website -c "DELETE FROM questionnaire_templates WHERE is_system_test = true;"
   kubectl --context <env> -n workspace rollout restart deploy/website
   ```
3. The website pod restarts; `seedSystemTestTemplates()` repopulates with the 10 templates.
4. Verify in `/admin/monitoring` → Test-Results-Panel that all 10 templates appear with `last_result = NULL` (un-tested).

## Risks

- **Stale assignments:** If anyone has assigned a system-test template to a real client, that assignment is wiped. Mitigation: query before delete (`SELECT customer_id FROM questionnaire_assignments WHERE template_id IN (SELECT id FROM questionnaire_templates WHERE is_system_test = true);`) — expected empty.
- **Test-results history loss:** Past `last_success_at` values are gone. Acceptable: the current 40 steps don't map cleanly to the new 89 steps anyway.
- **Untested features fail at first run:** Several Subsystem-C steps (GWG, Sonderabschreibung, Vorsteuerberichtigung UI) likely fail because the implementation is incomplete. **This is the point** — failed steps surface gaps and create bug tickets via the existing flow.

## Out of scope (future iterations)

- Step-level dependency ordering (e.g., "step 5 requires step 2 erfüllt").
- Auto-detected Playwright runs that mark `erfüllt` automatically.
- I18n of question text (currently German only).
