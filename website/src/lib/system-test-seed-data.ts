export type TestRole = 'admin' | 'user';

export interface SystemTestStep {
  question_text: string;
  expected_result: string;
  test_function_url: string;
  test_role: TestRole;
  req_ids?: string[];
  /**
   * Hint shown to the browser agent before executing this step.
   * Not stored in DB — surfaced in the test runner UI or conversation context.
   * Only set for steps that require user hand-off (terminal, second browser
   * profile, hardware permissions, or irreversible production actions).
   */
  agent_notes?: string;
}

export interface SystemTestTemplate {
  title: string;
  description: string;
  instructions: string;
  steps: SystemTestStep[];
}

export function resolveDomain(): string {
  const d = process.env.PROD_DOMAIN;
  return d && d.length > 0 ? d : 'localhost';
}

const D = resolveDomain();

export const SYSTEM_TEST_TEMPLATES: SystemTestTemplate[] = [
  {
    title: 'System-Test 1: Authentifizierung & SSO (Keycloak)',
    description: 'End-to-End-Test aller Single-Sign-On-Flows: Admin-Anmeldung, Portal-Anmeldung, Konto-Verwaltung und SSO in alle externen Dienste.',
    instructions: 'Führe die Schritte in zwei separaten Browser-Profilen aus (Admin + Testnutzer). Öffne die verlinkte Seite im jeweiligen Profil. Wähle pro Schritt das Ergebnis und trage Auffälligkeiten in das Detailfeld ein. Browser-Agent: ein Schritt gleichzeitig; bei „→ Nutzer" im Schritt pausieren und übergeben.',
    steps: [
      {
        question_text: 'Öffne die Admin-Oberfläche (Link) — melde dich über den Keycloak-Login-Dialog an und prüfe ob /admin lädt und der Logout-Button im Header sichtbar ist.',
        expected_result: 'Weiterleitung zu /admin nach Keycloak-Authentifizierung; Session-Cookie gesetzt; Logout-Button im Header sichtbar.',
        test_function_url: '/admin', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Keycloak-Kontoverwaltung (Link) — prüfe ob Profildetails, aktive Sitzungen und die Passwort-Änderungsoption zugänglich sind.',
        expected_result: 'Profil-Daten ladbar; Sitzungen-Liste zeigt aktive Sessions; Passwort-Änderung zugänglich.',
        test_function_url: `https://auth.${D}/realms/workspace/account`, test_role: 'admin',
      },
      {
        question_text: 'Öffne das Portal (Link) in einem Browser-Profil ohne aktive Admin-Session — melde den Testnutzer über Keycloak an und prüfe ob Profilname stimmt. → Nutzer: zweites Browser-Profil bedienen.',
        expected_result: 'Login-Flow läuft durch; Weiterleitung zu /portal; Profilname stimmt mit Testnutzer überein.',
        test_function_url: '/portal', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Nutzer informieren, Kontrolle für Login übergeben, danach Ergebnis gemeinsam prüfen.',
      },
      {
        question_text: 'Öffne Nextcloud (Link) während die Testnutzer-Session aktiv ist — automatischer SSO-Login sollte einsetzen und die Dateiansicht laden.',
        expected_result: 'Automatischer Login ohne erneute Eingabe; Dateiansicht lädt vollständig.',
        test_function_url: `https://files.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne Vaultwarden (Link) mit der aktiven Testnutzer-Session — SSO-Login sollte automatisch den Passwort-Tresor öffnen.',
        expected_result: 'Automatischer Login; Passwort-Tresor wird geladen.',
        test_function_url: `https://vault.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne DocuSeal (Link) mit der aktiven Testnutzer-Session — SSO-Login sollte automatisch die Dokumentenliste anzeigen.',
        expected_result: 'Automatischer Login; Dokumentenliste sichtbar.',
        test_function_url: `https://sign.${D}`, test_role: 'user',
      },
    ],
  },
  {
    title: 'System-Test 2: Admin-Verwaltung & CRM',
    description: 'Funktionstest der zentralen Admin-Workflows: Dashboard, Clients, Meetings, Termine, Projekte, Kalender, Inbox und Einstellungen.',
    instructions: 'Alle Schritte mit dem Admin-Browser-Profil. Klicke den Link im jeweiligen Schritt, um direkt zur richtigen Seite zu gelangen. Vorhandene Testdaten dürfen verwendet werden.',
    steps: [
      {
        question_text: 'Öffne das Admin-Dashboard (Link) — prüfe die vier KPI-Karten oben auf der Seite: Clients, offene Bugs, Meetings, Rechnungen.',
        expected_result: 'KPIs (Clients, offene Bugs, Meetings, Rechnungen) laden ohne Fehler und zeigen plausible Werte.',
        test_function_url: '/admin', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Clientliste (Link) → klicke „Neuer Client" → fülle alle Pflichtfelder aus und speichere → lade die Seite neu und prüfe ob der Client noch erscheint.',
        expected_result: 'Client erscheint in der Clientliste; Pflichtfelder werden serverseitig validiert; nach Reload weiterhin sichtbar.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: 'Klicke in der Clientliste (Link) auf einen vorhandenen Client — öffne alle Reiter (Stammdaten, Notizen, Fragebögen, Rechnungen) und prüfe auf Ladefehler.',
        expected_result: 'Reiter Stammdaten, Notizen, Fragebögen, Rechnungen ladbar; keine 500er.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: 'Öffne Meetings (Link) → klicke „Neues Meeting" → trage Datum, Titel und Teilnehmer ein und speichere.',
        expected_result: 'Meeting erscheint in der Meetingliste mit korrekten Datums- und Teilnehmerinfos.',
        test_function_url: '/admin/meetings', test_role: 'admin',
      },
      {
        question_text: 'Öffne Termine (Link) → klicke „Neuer Termin" → fülle das Formular aus und speichere → prüfe ob der Termin auch im Kalender unter /admin/kalender erscheint.',
        expected_result: 'Termin wird gespeichert und ist in /admin/termine sowie im Kalender sichtbar.',
        test_function_url: '/admin/termine', test_role: 'admin',
      },
      {
        question_text: 'Öffne Projekte (Link) → klicke „Neues Projekt" → ordne es über das Client-Feld einem Client zu → prüfe ob das Projekt in der Client-Detailansicht unter Reiter „Projekte" erscheint.',
        expected_result: 'Projekt erscheint in /admin/projekte; Zuordnung zum Client in der Detailansicht sichtbar.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: 'Öffne den Admin-Kalender (Link) — wechsle zwischen Monats- und Wochenansicht und prüfe ob angelegte Termine und Meetings korrekt visualisiert werden.',
        expected_result: 'Kalender lädt; Termine + Meetings korrekt visualisiert (Monats-/Wochenansicht).',
        test_function_url: '/admin/kalender', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Inbox (Link) — klicke das Haken-Symbol oder „Erledigt" neben einem offenen Item und prüfe ob der Inbox-Counter oben sofort sinkt.',
        expected_result: 'Item wechselt den Status sofort; Inbox-Counter aktualisiert sich.',
        test_function_url: '/admin/inbox', test_role: 'admin',
      },
      {
        question_text: 'Öffne Einstellungen (Link) — ändere einen beliebigen Wert (z. B. Kontaktdaten), speichere und lade die Seite neu; der Wert sollte erhalten bleiben.',
        expected_result: 'Einstellung wird persistiert; nach Reload korrekt geladen.',
        test_function_url: '/admin/einstellungen', test_role: 'admin',
      },
      {
        question_text: 'Öffne Einstellungen → Branding (Link) — klicke „Logo hochladen", wähle eine Bilddatei und speichere; Logo sollte im Admin-Header und auf der öffentlichen Website erscheinen. → Nutzer: Testdatei bereitstellen.',
        expected_result: 'Logo erscheint im Admin-Header und auf der öffentlichen Website.',
        test_function_url: '/admin/einstellungen/branding', test_role: 'admin',
        agent_notes: 'File-Upload — Nutzer nach einer Testbild-Datei fragen und dann via Browser-Extension hochladen.',
      },
    ],
  },
  {
    title: 'System-Test 3: Kommunikation — Fragebogen-Widget, Inbox & E-Mail',
    description: 'Test des Fragebogen-Widgets auf der öffentlichen Website, des Admin-Inbox-Workflows sowie E-Mail-Versand und Newsletter-Vorschau.',
    instructions: 'Schritt 1 im Testnutzer-Browser, Schritte 2/3/4 im Admin-Browser. Öffne jeweils den Link im Schritt.',
    steps: [
      {
        question_text: 'Öffne die Website (Link) als angemeldeter Testnutzer — das Fragebogen-Widget (📋-Symbol rechts unten) sollte sichtbar sein; klicke es an und prüfe ob ausstehende Fragebögen in der Liste erscheinen. → Nutzer: im Testnutzer-Browser ausführen.',
        expected_result: 'Fragebogen-Widget ist für eingeloggte Nutzer sichtbar; Klick öffnet das Panel; Fragebögen werden geladen; „Seite in neuem Tab öffnen"-Links funktionieren.',
        test_function_url: `https://web.${D}`, test_role: 'user',
        agent_notes: 'Schritt im Testnutzer-Browser-Profil. Nutzer Kontrolle übergeben, danach Ergebnis gemeinsam bestätigen.',
      },
      {
        question_text: 'Öffne die Admin-Inbox (Link) — verfasse eine Nachricht an den Testnutzer und sende sie ab.',
        expected_result: 'Antwort gesendet; Admin-Inbox zeigt den Nachrichtenverlauf.',
        test_function_url: '/admin/inbox', test_role: 'admin',
      },
      {
        question_text: 'Wechsle in den Testnutzer-Browser — prüfe ob die Admin-Antwort in den Benachrichtigungen oder der Nutzer-Inbox erscheint (ohne Seitenreload). → Nutzer: Testnutzer-Browser zeigen.',
        expected_result: 'Admin-Antwort ist für den Testnutzer sichtbar; Polling oder Websocket-Push funktioniert.',
        test_function_url: `https://web.${D}`, test_role: 'user',
        agent_notes: 'Schritt im Testnutzer-Browser-Profil. Nutzer Kontrolle übergeben und Ergebnis bestätigen lassen.',
      },
      {
        question_text: 'Öffne Termine (Link) — wähle einen bestehenden Termin aus und klicke „Bestätigung senden"; prüfe anschließend in Mailpit ob die E-Mail korrekt angekommen ist.',
        expected_result: 'Mailpit/Postfach zeigt eingehende Mail mit korrektem Branding und Pflichtangaben (Impressum-Link).',
        test_function_url: '/admin/termine', test_role: 'admin',
      },
      {
        question_text: 'Öffne Newsletter (Link) — klicke „Vorschau" und prüfe ob Header/Footer-Branding und Abmelde-Link korrekt dargestellt werden.',
        expected_result: 'HTML-Vorschau lädt; Header/Footer-Branding und Abmelde-Link sichtbar.',
        test_function_url: '/admin/newsletter', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 4: Fragebogen-System (Coaching-Workflow)',
    description: 'Vollständiger End-to-End-Workflow: Template anlegen → veröffentlichen → einem Client zuweisen → Nutzer füllt aus → Admin wertet aus → Test-Results-Panel.',
    instructions: 'Schritte 1, 2, 4, 5 im Admin-Browser, Schritt 3 im Testnutzer-Browser. Verwende ein neu angelegtes Test-Template, um vorhandene Daten nicht zu beeinflussen.',
    steps: [
      {
        question_text: 'Öffne Fragebogen-Verwaltung (Link) → klicke „Neues Template" → trage einen Titel ein, füge mindestens eine Frage hinzu und speichere.',
        expected_result: 'Template wird gespeichert und erscheint in der Template-Liste als Draft.',
        test_function_url: '/admin/fragebogen', test_role: 'admin',
      },
      {
        question_text: 'Klicke im Template auf „Veröffentlichen" — öffne dann einen Client (Link), wechsle zum Reiter „Fragebögen" und klicke „Zuweisen".',
        expected_result: 'Assignment erstellt; Nutzer sieht Fragebogen im Portal-Dashboard (ggf. E-Mail-Benachrichtigung).',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: 'Melde dich als Testnutzer im Portal an (Link) — der neue Fragebogen sollte im Dashboard unter „Ausstehende Fragebögen" sichtbar sein; klicke ihn an und beantworte alle Fragen. → Nutzer: zweites Browser-Profil bedienen.',
        expected_result: 'Fragebogen-Status wechselt auf „submitted"; Bestätigungsseite erscheint.',
        test_function_url: '/portal', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Nutzer Kontrolle übergeben bis Fragebogen abgesendet ist.',
      },
      {
        question_text: 'Öffne die Client-Detailansicht (Link) → wechsle zum Reiter „Fragebögen" → wähle den abgegebenen Fragebogen — prüfe ob Antworten, Scoring-Dimensionen und das Coach-Notiz-Feld korrekt dargestellt werden.',
        expected_result: 'Antworten + Scoring-Dimensionen korrekt dargestellt; Coach-Notizen-Feld editierbar.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) — scrolle zum Abschnitt „Test-Results-Panel" und prüfe ob alle System-Test-Templates mit Last-Result/Last-Success-Status sichtbar sind.',
        expected_result: 'Alle 10 System-Test-Templates sichtbar mit Last-Result/Last-Success-Status.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 5: Dokumente & DocuSeal-Unterschriften',
    description: 'Dokument-Editor, Inhalte-Editor und vollständiger DocuSeal-Signatur-Roundtrip (Versenden → Signieren → Verifizieren).',
    instructions: 'Schritte 1, 2, 3, 5 im Admin-Browser, Schritt 4 im Testnutzer-Browser. Öffne jeweils den Link im Schritt.',
    steps: [
      {
        question_text: 'Öffne Dokumente (Link) → klicke „Neues Dokument" → schreibe einen Beispiel-Inhalt und speichere → lade die Seite neu und prüfe ob der Inhalt erhalten bleibt.',
        expected_result: 'Dokument wird gespeichert; nach Reload weiterhin lesbar; Versionshistorie sichtbar.',
        test_function_url: '/admin/dokumente', test_role: 'admin',
      },
      {
        question_text: 'Öffne Inhalte (Link) → klicke auf einen Startseiten-Block → ändere den Text und speichere → öffne die öffentliche Startseite und prüfe ob die Änderung sichtbar ist.',
        expected_result: 'Änderung wird persistiert und auf der öffentlichen Startseite sichtbar.',
        test_function_url: '/admin/inhalte', test_role: 'admin',
      },
      {
        question_text: 'Öffne Dokumente (Link) → wähle ein Dokument aus → klicke „Zur Unterschrift senden" → wähle den Testnutzer als Empfänger.',
        expected_result: 'Nutzer erhält Mail/Notification mit Signatur-Link.',
        test_function_url: '/admin/dokumente', test_role: 'admin',
      },
      {
        question_text: 'Öffne DocuSeal (Link) als Testnutzer — rufe den Signatur-Link aus der E-Mail auf, unterzeichne das Dokument und schließe den Vorgang ab. → Nutzer: Testnutzer-Browser + tatsächliche Signatur bestätigen.',
        expected_result: 'Signatur wird gespeichert; Dokument-Status wechselt auf „Completed".',
        test_function_url: `https://sign.${D}`, test_role: 'user',
        agent_notes: 'Rechtsverbindliche Signatur — Nutzer muss bewusst bestätigen. Kontrolle für diesen Schritt übergeben.',
      },
      {
        question_text: 'Öffne DocuSeal (Link) als Admin — finde das unterzeichnete Dokument und prüfe ob „Completed" + Audit-Trail (IP, Timestamp) angezeigt werden.',
        expected_result: 'DocuSeal zeigt „Completed" + Audit-Trail (IP, Timestamp).',
        test_function_url: `https://sign.${D}`, test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 6: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring',
    description: 'Vollständiger Test des Subsystems B (§ 19 UStG): Steuer-Modus-Schalter, Schwellenwert-Monitoring (20k/25k/100k €), USt-IdNr.-Pflicht, UStVA-Export, Ist-Versteuerung, Fristen-Dashboard. Bildet alle B-01..B-11-Anforderungen ab.',
    instructions: 'Alle Schritte im Admin-Browser. Öffne jeweils den Link im Schritt. Schritte 4–6 erfordern künstliche Umsatzwerte — vorher mit Nutzer abstimmen ob Testdaten vorliegen.',
    steps: [
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → suche den Dropdown „Steuer-Modus" und wähle „Kleinunternehmer" → speichere [B-01].',
        expected_result: 'site_settings.tax_mode = kleinunternehmer; Hinweis „§ 19 UStG" erscheint auf der nächsten Rechnung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-01'],
      },
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → wechsle den Steuer-Modus auf „Regelbesteuerung" → speichere [B-01/B-05].',
        expected_result: 'Wechsel persistiert; nächste Rechnung wird mit USt (7 %/19 %) ausgewiesen; Rechnungsvorlage schaltet automatisch auf Regelbesteuerer-Template (§ 14 UStG).',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-01', 'B-05'],
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — prüfe das „Jahresumsatz"-Widget: der angezeigte Betrag muss der Summe aller „paid"-Rechnungen im laufenden Jahr entsprechen [B-02].',
        expected_result: 'Kumulierter Netto-Umsatz des laufenden Jahres entspricht der Summe der „paid"-Rechnungen.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-02'],
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — erhöhe den Testumsatz auf ≥ 80 % von 25.000 € und prüfe ob ein gelber Warn-Alert im TaxMonitorWidget erscheint [B-03]. → Nutzer: Testwert via DB oder Test-Modus setzen.',
        expected_result: 'Gelber Warn-Alert sichtbar im TaxMonitorWidget; Hinweis auf §19-Grenze.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-03'],
        agent_notes: 'Testumsatz muss über DB oder Test-Modus gesetzt werden. Nutzer fragen ob Testdaten vorbereitet sind, sonst Schritt überspringen.',
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — überschreite die 25.000 €-Grenze und prüfe ob ein roter Alert und der automatische Switch auf Regelbesteuerung ausgelöst wird [B-03/B-04]. → Nutzer: Testwert setzen.',
        expected_result: 'Roter Alert; Auto-Switch auf Regelbesteuerung; nächste Rechnung mit USt; Switch im Audit-Log.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-03', 'B-04'],
        agent_notes: 'Testumsatz > 25.000 € erforderlich. Nutzer koordinieren; danach UI-Reaktion im Browser prüfen.',
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — überschreite die 100.000 €-Grenze und prüfe ob ein roter „Sofort Regelbesteuerung"-Alert erscheint [B-06]. → Nutzer: Testwert setzen.',
        expected_result: 'Roter „sofort Regelbesteuerung"-Alert; Pflichtwechsel unabhängig vom Vorjahresumsatz.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-06'],
        agent_notes: 'Testumsatz > 100.000 € erforderlich. Nutzer koordinieren.',
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) → scrolle zum Abschnitt „Audit-Log" — prüfe ob der Steuermodus-Wechsel mit Datum, Rechnungsnummer und Begründung eingetragen ist [B-07].',
        expected_result: 'Eintrag mit Datum, auslösender Rechnungsnummer und Begründung sichtbar (revisionssicher).',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-07'],
      },
      {
        question_text: 'Öffne UStVA/ELSTER (Link) → klicke „CSV exportieren" — prüfe ob die Datei Nettoumsätze nach Steuersatz (0 %/7 %/19 %) und USt-Summen enthält [B-08].',
        expected_result: 'CSV enthält Nettoumsätze 0 %/7 %/19 % und USt-Summen je Steuersatz; Werte stimmen mit Buchungen.',
        test_function_url: '/admin/billing/elster', test_role: 'admin', req_ids: ['B-08'],
      },
      {
        question_text: 'Öffne UStVA/ELSTER (Link) → klicke „ELSTER-Vorschau" und prüfe ob die Pflichtfelder (Kennziffern 81/86/35) korrekt befüllt sind [B-08].',
        expected_result: 'Vorschau-Layout mit Pflichtfeldern (Kennziffern 81/86/35) korrekt befüllt.',
        test_function_url: '/admin/billing/elster', test_role: 'admin', req_ids: ['B-08'],
      },
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → aktiviere den Toggle „Ist-Versteuerung" und prüfe ob die UStVA-Logik auf Zahlungseingangsdatum umschaltet [B-09].',
        expected_result: 'UStVA bezieht USt erst bei Zahlungseingang ein, nicht bei Rechnungsstellung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-09'],
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) → scrolle zum Abschnitt „Fristen" — prüfe ob die UStVA-Quartalsfristen (10. März/Juni/September/Dezember) und Jahres-/GewSt-Frist angezeigt werden [B-10].',
        expected_result: 'Termine 10. März/Juni/September/Dezember sowie Jahres-/GewSt-Frist sichtbar.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-10'],
      },
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → versuche auf Regelbesteuerung zu wechseln ohne eine USt-IdNr. einzutragen — Speichern sollte fehlschlagen [B-11].',
        expected_result: 'Speichern ohne USt-IdNr. schlägt fehl; Format DE\\d{9} wird validiert (EU-VIES-konform).',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-11'],
      },
    ],
  },
  {
    title: 'System-Test 7: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung',
    description: 'Vollständiger Test des Subsystems A (Native Invoice Engine): Pflichtangaben Klein/Regel, fortlaufende Nummerierung, SEPA-Daten, ZUGFeRD-Einbettung, Storno, Mahnwesen, Aufbewahrung. Bildet alle A-01..A-15-Anforderungen ab.',
    instructions: 'Alle Schritte im Admin-Browser. Öffne jeweils den Link im Schritt. Schritt 8 (ZUGFeRD) und Schritt 10 (retain_until) erfordern Terminal/DB — → Nutzer-Handoff dort einplanen.',
    steps: [
      {
        question_text: 'Öffne die Rechnungsliste (Link) — prüfe im Browser-Netzwerk-Tab ob die Daten aus PostgreSQL geladen werden (kein Stripe-API-Call sichtbar) [A-01].',
        expected_result: 'Daten werden aus PostgreSQL geladen; im Network-Tab kein Stripe-API-Call; Liste vollständig.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-01'],
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) → klicke „Neue Rechnung" → wähle Steuer-Modus „Kleinunternehmer (§ 19 UStG)" → fülle alle Pflichtfelder aus und speichere [A-02/A-04].',
        expected_result: 'Pflichtangaben (Anschrift Leistender/Empfänger, Steuernummer, Datum, fortlaufende Nr. RE-YYYY-NNNN, Leistungsbeschreibung, Entgelt) + § 19-Hinweis vorhanden.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-02', 'A-04'],
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) → klicke „Neue Rechnung" → wähle Steuer-Modus „Regelbesteuerung" → fülle alle Pflichtfelder inkl. USt-IdNr. aus [A-03].',
        expected_result: 'Pflichtangaben inkl. USt-IdNr., Nettobetrag, Steuersatz (7 %/19 %), Steuerbetrag, Bruttobetrag, Leistungszeitraum.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-03'],
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) — versuche eine Rechnungsnummer manuell zu ändern oder eine finalisierte Rechnung zu löschen; beide Aktionen sollten abgeblockt werden [A-04].',
        expected_result: 'Versuch, Nummer manuell zu ändern oder eine Rechnung zu löschen, schlägt fehl bzw. erzeugt nur eine Stornorechnung.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-04'],
      },
      {
        question_text: 'Öffne eine bestehende Rechnung → klicke „PDF ansehen/drucken" (Link) — prüfe im PDF ob IBAN, BIC, Bankname und Verwendungszweck (= Rechnungsnummer) abgedruckt sind [A-05].',
        expected_result: 'IBAN, BIC, Bankname, Verwendungszweck = Rechnungsnummer auf jeder PDF.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-05'],
      },
      {
        question_text: 'Öffne einen Kunden in der Billing-Kundenliste → scrolle zum Abschnitt „SEPA-Mandat" → lege ein Mandat mit IBAN, BIC, Mandatsreferenz und Unterschriftsdatum an [A-06].',
        expected_result: 'IBAN, BIC, Mandatsreferenz, Datum der Unterschrift, Gläubiger-ID gespeichert und an Rechnungen verknüpfbar.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-06'],
      },
      {
        question_text: 'Öffne eine Rechnung → klicke „PDF herunterladen" — prüfe im Browser-Netzwerk-Tab ob kein externer API-Call ausgelöst wurde und ob die PDF valide ist [A-07].',
        expected_result: 'Download liefert valide PDF; kein externer API-Call im Network-Tab; pdf_path im DB-Eintrag gesetzt (GoBD-Archiv).',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-07'],
      },
      {
        question_text: 'Lade die PDF einer finalisierten Rechnung herunter — prüfe via Terminal ob factur-x.xml eingebettet ist [A-08]. → Nutzer: `qpdf --show-attachments <datei.pdf>` oder `pdftk <datei.pdf> dump_data_fields` ausführen.',
        expected_result: 'qpdf/pdftk zeigt eingebettetes factur-x.xml mit Profil MINIMUM (E-Rechnungspflicht B2B 2025).',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-08'],
        agent_notes: 'Terminal-Schritt — Browser kann PDF nicht lokal prüfen. PDF herunterladen (Browser-Extension), dann Nutzer bitten: `qpdf --show-attachments <pfad>` auszuführen und Ausgabe zu zeigen.',
      },
      {
        question_text: 'Öffne eine offene Rechnung → klicke „Finalisieren/Sperren" — prüfe ob alle Bearbeiten-Buttons deaktiviert sind und API-Bearbeitungsversuche 403 liefern [A-09].',
        expected_result: 'locked = true; Bearbeiten-Buttons disabled; API-Versuche zu editieren liefern 403/Conflict.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-09'],
      },
      {
        question_text: 'Prüfe für eine finalisierte Rechnung ob retain_until = Rechnungsdatum + 10 Jahre gesetzt ist [A-10]. → Nutzer: `SELECT retain_until FROM billing_invoices WHERE id = \'<id>\';` ausführen.',
        expected_result: 'DB-Feld retain_until = Rechnungsdatum + 10 Jahre (§ 147 AO).',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-10'],
        agent_notes: 'DB-Abfrage erforderlich. Rechnungs-ID aus der UI entnehmen und Nutzer bitten: `task workspace:psql -- website` → `SELECT retain_until FROM billing_invoices WHERE id = \'<id>\';`',
      },
      {
        question_text: 'Öffne eine finalisierte Rechnung → klicke „Stornieren" — prüfe ob eine neue Rechnung mit negativem Betrag angelegt wird und auf das Original verweist [A-11].',
        expected_result: 'Neue Rechnung mit negativem Betrag; cancels_invoice_id verweist auf Original; § 14c UStG-Hinweis.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-11'],
      },
      {
        question_text: 'Öffne eine Rechnung → klicke „Per E-Mail versenden" — prüfe in Mailpit ob die Mail mit PDF-Anhang und ZUGFeRD-XML angekommen ist [A-12].',
        expected_result: 'E-Mail mit PDF-Anhang + ZUGFeRD-XML gesendet; Mailpit/Empfangs-Postfach zeigt Mail.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-12'],
      },
      {
        question_text: 'Öffne eine Rechnung → klicke die Status-Buttons der Reihe nach: „Freigeben" (Draft→Open), dann „Zahlung erfassen" (Open→Paid) — prüfe im Buchungsjournal ob jede Transition gebucht wurde [A-13].',
        expected_result: 'Statuswechsel sichtbar; jede Transition triggert eine Buchung im Buchungsjournal.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-13'],
      },
      {
        question_text: 'Öffne eine offene Rechnung → klicke „Zahlungseingang erfassen" → trage Datum, Betrag und Zahlungsreferenz ein — prüfe ob Status auf „paid" wechselt und die Einnahme im Journal erscheint [A-14].',
        expected_result: 'Datum, Betrag, Zahlungsreferenz gespeichert; Status auf „paid"; Einnahme im Journal gebucht.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-14'],
      },
      {
        question_text: 'Öffne eine überfällige Rechnung → klicke „Mahnung senden" — prüfe ob Mahnstufe inkrementiert und die Mahnmail versendet wurde [A-14].',
        expected_result: 'Mahnstufe inkrementiert; Mail mit Mahngebühr versendet; Buchung in Forderungs-Journal.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-14'],
      },
      {
        question_text: 'Öffne Angebote (Link) → klicke „Neues Angebot" → speichere es → klicke „In Rechnung umwandeln" und prüfe ob die Rechnung auf das Angebot verweist [A-15].',
        expected_result: 'Angebot mit Nummer AN-YYYY-NNNN; bei Konvertierung referenziert die Rechnung das Angebot.',
        test_function_url: '/admin/angebote', test_role: 'admin', req_ids: ['A-15'],
      },
    ],
  },
  {
    title: 'System-Test 8: Buchhaltung — EÜR, Belege & Steuerauswertungen',
    description: 'Vollständiger Test des Subsystems C (EÜR-Buchhaltungsmodul) plus DATEV-Export: Buchungsjournal, Auto-Buchung Forderung/Einnahme, Vorsteuer-Trennung, EÜR-Auswertung, § 15a Vorsteuerberichtigung, GWG, GewSt-Kalkulator, ESt-Vorauszahlung, Belegarchiv. Bildet C-01..C-13 ab.',
    instructions: 'Alle Schritte im Admin-Browser. Öffne jeweils den Link im Schritt. Letzter Schritt (Belegarchiv) erfordert eine Testdatei — → Nutzer vorher fragen.',
    steps: [
      {
        question_text: 'Öffne Buchhaltung (Link) — prüfe ob das Buchungsjournal Einträge mit Datum, Betrag, Kategorie und Belegnummer für Einnahmen und Ausgaben zeigt [C-01].',
        expected_result: 'Liste mit Datum, Betrag, Kategorie, Belegnummer für Betriebseinnahmen und Betriebsausgaben (§ 4 Abs. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-01'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — sende eine Rechnung ab und prüfe ob innerhalb weniger Sekunden eine „Forderung"-Buchung im Journal erscheint [C-02].',
        expected_result: 'Buchung mit Kategorie „Forderung" zeitnah (≤ 10 Tage GoBD) im Journal sichtbar.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-02'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — erfasse einen Zahlungseingang für eine offene Rechnung und prüfe ob eine „Betriebseinnahme"-Buchung erscheint und die Forderung ausgeglichen wird [C-02].',
        expected_result: 'Buchung „Betriebseinnahme" mit Verweis auf Rechnung; Forderung wird ausgeglichen.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-02'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — erfasse eine Eingangsrechnung mit Vorsteuer und prüfe ob Vorsteuer als eigene Buchungskategorie getrennt vom Nettobetrag gebucht wird [C-03].',
        expected_result: 'Bei Eingangsrechnung wird Vorsteuer separat vom Nettobetrag gebucht (§ 4 Abs. 3 S. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-03'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → klicke „USt-Zahllast buchen" → trage den Quartalsbetrag ein — prüfe ob die Buchung mit Kategorie „USt-Zahllast" erscheint [C-04].',
        expected_result: 'Quartalszahlung an Finanzamt als Ausgabe-Buchung mit Kategorie „USt-Zahllast"; Erstattungen als Einnahme.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-04'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → scrolle zum Abschnitt „EÜR" → lade PDF und CSV herunter — prüfe ob Einnahmen, Ausgaben und Gewinn mit dem Journal übereinstimmen [C-05].',
        expected_result: 'Beide Exports zeigen Betriebseinnahmen, Ausgaben, Gewinn; Summen stimmen mit Journal überein (Anlage EÜR).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-05'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → klicke „Anlagegut erfassen" → trage AK > 1.000 €, Anschaffungsdatum, AfA-Laufzeit und Vorsteuer ein — prüfe ob § 15a-Berichtigungsbetrag berechnet wird [C-06/C-07].',
        expected_result: 'AK, Anschaffungsdatum, AfA-Laufzeit (Monate), Vorsteuer gespeichert; Berichtigungsbetrag § 15a UStG bei Modus-Wechsel automatisch berechnet (Bagatellgrenze § 44 UStDV).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-06', 'C-07'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — wechsle den Steuer-Modus von Klein- auf Regelbesteuerung und prüfe ob die Vorsteuer auf Warenbestände als Forderung gegen das FA berechnet wird [C-08].',
        expected_result: 'Beim Switch Klein → Regel: volle Vorsteuer auf Bestände als Forderung gegen das FA berechnet (§ 15a Abs. 7).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-08'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → klicke „GWG erfassen" → trage einen Nettobetrag ≤ 800 € ein — prüfe ob Sofortabschreibung angesetzt wird [C-09].',
        expected_result: 'Sofortabschreibung; Sammelposten-Logik für 250–1.000 € über 5 Jahre korrekt (§ 6 Abs. 2/2a EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-09'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → wähle ein Anlagegut aus → aktiviere „Sonderabschreibung § 7g EStG" — prüfe ob 40 % Sonder-AfA angesetzt werden [C-10].',
        expected_result: '40 %-Sonder-AfA bei Gewinn ≤ 200.000 € korrekt angesetzt.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-10'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → scrolle zum „Gewerbesteuer-Kalkulator" → trage einen Gewerbeertrag ein und prüfe ob die Steuerlast korrekt berechnet wird (Hebesatz Lübbecke 417 %) [C-11].',
        expected_result: 'Eingabe Gewerbeertrag → Hinzurechnungen/Kürzungen → Freibetrag 24.500 € → Messbetrag × 3,5 % × Hebesatz Lübbecke 417 % → korrekte Steuerlast.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-11'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → scrolle zum „ESt-Vorauszahlungsrechner" → trage einen Schätzgewinn ein und prüfe ob Quartalsraten korrekt berechnet werden [C-12].',
        expected_result: 'Schätzgewinn → zvE nach GFB 12.096 € (2025) → ESt-Betrag → Quartalsraten korrekt berechnet.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-12'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → wähle eine Buchung aus → klicke „Beleg anhängen" → lade eine PDF oder ein Bild hoch — prüfe ob der Beleg dauerhaft mit der Buchung verknüpft ist [C-13]. → Nutzer: Testdatei bereitstellen.',
        expected_result: 'PDF/Bild-Upload erfolgreich; Beleg unveränderbar mit Buchung verknüpft (GoBD Rn. 85–96).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-13'],
        agent_notes: 'File-Upload — Nutzer nach einer Testdatei (PDF oder Bild) fragen und dann via Browser-Extension hochladen.',
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) → klicke „DATEV-Export" — öffne die CSV und prüfe ob Konten und Buchungsdatum im DATEV-Format vorliegen.',
        expected_result: 'CSV im DATEV-Format mit korrekten Konten und Buchungsdatum; importierbar in DATEV-Tool.',
        test_function_url: '/admin/rechnungen', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 9: Monitoring & Bug-Tracking',
    description: 'Cluster-Monitoring (Pod-Status, Rolling Restart, Staleness), Bug-Ticket-Lifecycle und Test-Results-Panel.',
    instructions: 'Alle Schritte im Admin-Browser. Öffne jeweils den Link im Schritt.',
    steps: [
      {
        question_text: 'Öffne Monitoring (Link) — prüfe die Pod-Statusliste: alle Pods sollten „Running" oder „Healthy" anzeigen; keine dauerhaften CrashLoops.',
        expected_result: 'Alle Pods zeigen „Running" oder „Healthy"; keine dauerhaften CrashLoops.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → wähle ein Deployment aus → klicke „Rolling Restart" — prüfe ob der Pod neu startet und wieder in den „Ready"-Zustand kommt.',
        expected_result: 'Restart-Trigger wird bestätigt; Pod kommt wieder ready.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → scrolle zum „Staleness-Report"-Abschnitt — prüfe ob Empfehlungen oder ein OK-Status je System angezeigt werden.',
        expected_result: 'Bericht lädt; Empfehlungen oder OK-Status je System sichtbar.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → klicke „Bug-Ticket erstellen" → fülle Titel und Beschreibung aus — prüfe ob das Ticket unter /admin/bugs mit dem Format BR-YYYYMMDD-xxxx erscheint.',
        expected_result: 'Ticket mit Format BR-YYYYMMDD-xxxx wird angelegt und unter /admin/bugs sichtbar.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Bug-Tickets (Link) → wähle ein offenes Ticket → klicke „Auflösen" → trage eine Auflösungsnotiz ein — prüfe ob der Status auf „resolved" wechselt.',
        expected_result: 'Status wechselt auf „resolved"; Auflösungsnotiz wird gespeichert.',
        test_function_url: '/admin/bugs', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → scrolle zum „Test-Results-Panel" — prüfe ob alle System-Test-Templates mit last_result und last_success_at sichtbar sind und ein Drilldown auf Question-Level möglich ist.',
        expected_result: 'Alle Templates sichtbar mit last_result/last_success_at; Drilldown auf Question-Level möglich.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 10: Externe Dienste & öffentliche Website',
    description: 'Funktionstest der angebundenen Dienste (Nextcloud, Talk, Whiteboard, Collabora, Vaultwarden, Brett) und der öffentlichen Website inkl. Kontaktformular.',
    instructions: 'Alle Schritte im Testnutzer-Browser, sofern nicht anders angegeben. Klicke den Link im jeweiligen Schritt. Schritt 4 (Talk Audio/Video) erfordert Kamera/Mikrofon-Freigabe im Browser.',
    steps: [
      {
        question_text: 'Öffne Nextcloud (Link) — klicke den Upload-Button (Pfeil nach oben) in der Dateiliste und wähle eine Testdatei aus; prüfe ob die Datei in der Liste erscheint.',
        expected_result: 'Datei erscheint in der Dateiliste; Fortschrittsbalken läuft durch.',
        test_function_url: `https://files.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne den Nextcloud-Kalender (Link) — wechsle zwischen Monats- und Wochenansicht und prüfe ob die App ohne Fehler lädt.',
        expected_result: 'Monats-/Wochenansicht lädt ohne Fehler.',
        test_function_url: `https://files.${D}/apps/calendar`, test_role: 'user',
      },
      {
        question_text: 'Öffne Nextcloud-Kontakte (Link) — prüfe ob die Kontakte-App öffnet und eine Kontaktliste angezeigt wird.',
        expected_result: 'Kontakte-App öffnet; Kontaktliste sichtbar.',
        test_function_url: `https://files.${D}/apps/contacts`, test_role: 'user',
      },
      {
        question_text: 'Öffne Nextcloud Talk (Link) → betrete einen Raum → aktiviere Audio/Video über die Schaltflächen unten — im Browser-Berechtigungsdialog „Zulassen" klicken; prüfe ob das lokale Video im Raum erscheint.',
        expected_result: 'Signaling-Verbindung hergestellt; lokales Video erscheint im Raum.',
        test_function_url: `https://files.${D}/apps/talk`, test_role: 'user',
        agent_notes: 'Browser fragt nach Kamera/Mikrofon — im Berechtigungsdialog „Zulassen" klicken. Kein Nutzer-Handoff nötig, wenn die Extension Berechtigungsdialoge sieht.',
      },
      {
        question_text: 'Öffne Nextcloud Whiteboard (Link) → zeichne etwas → klicke Speichern — lade die Seite neu und prüfe ob die Zeichnung erhalten bleibt.',
        expected_result: 'Whiteboard-App lädt; Speichern/Laden funktioniert.',
        test_function_url: `https://files.${D}/apps/whiteboard`, test_role: 'user',
      },
      {
        question_text: 'Öffne Nextcloud (Link) → wähle eine Office-Datei (DOCX, XLSX oder ODS) aus → klicke darauf — Collabora sollte den Editor inline öffnen; mache eine Änderung und speichere.',
        expected_result: 'Editor öffnet inline; Änderungen werden gespeichert.',
        test_function_url: `https://files.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne Vaultwarden (Link) → klicke „Neues Element" (+ Symbol) → wähle „Login" → fülle Name, Benutzername und Passwort aus und speichere — prüfe ob der Eintrag abrufbar ist.',
        expected_result: 'Eintrag in Tresorübersicht sichtbar; Passwort abrufbar.',
        test_function_url: `https://vault.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne die öffentliche Startseite (Link) — prüfe im Browser-Netzwerk-Tab ob alle Sektionen und Bilder ohne 404-Fehler laden.',
        expected_result: 'Sektionen + Bilder laden; keine 404er im Network-Tab.',
        test_function_url: `https://web.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne die Startseite (Link) → scrolle zum Kontaktformular → fülle alle Felder aus und klicke „Senden" — prüfe ob eine Bestätigung erscheint und der Eintrag in /admin/inbox sichtbar ist.',
        expected_result: 'Validierung serverseitig; Bestätigung erscheint; Admin-Inbox zeigt den Eintrag.',
        test_function_url: `https://web.${D}`, test_role: 'user',
      },
      {
        question_text: 'Öffne Brett / Systembrett (Link) — prüfe ob das 3D-Board lädt, du Elemente verschieben kannst und Speichern funktioniert.',
        expected_result: '3D-Board lädt; Demo-Konstellation manipulierbar; Speichern funktioniert.',
        test_function_url: `https://brett.${D}`, test_role: 'user',
      },
    ],
  },
];
