export type TestRole = 'admin' | 'user';

export interface SystemTestStep {
  question_text: string;
  expected_result: string;
  test_function_url: string;
  test_menu_path?: string;
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
    description: 'Prüft den vollständigen Single-Sign-On-Stack auf Basis von Keycloak (OIDC/OAuth2): Admin-Anmeldung am Backend, Nutzer-Anmeldung am Portal sowie automatisches SSO in alle angebundenen Dienste (Nextcloud, Vaultwarden, DocuSeal). Dieser Test verifiziert die Anforderungen FA-09 (Keycloak-Integration) und FA-10 (SSO aller Dienste) sowie SA-02 (Session-Sicherheit). Voraussetzung: Testnutzer-Konto in Keycloak angelegt, beide Cluster aktiv.',
    instructions: 'Führe die Schritte in zwei separaten Browser-Profilen aus — Profil A für den Admin, Profil B für den Testnutzer. Öffne die verlinkte Seite im jeweils angegebenen Profil. Schritte mit „→ Nutzer:" erfordern einen Wechsel in Profil B; der Browser-Agent pausiert und übergibt die Kontrolle. Prüfe nach jedem Login-Schritt aktiv den Session-Cookie im Browser-DevTools (Application → Cookies). Trage Auffälligkeiten in das Detailfeld ein, bevor du zum nächsten Schritt weitergehst.',
    steps: [
      {
        question_text: 'Öffne die Admin-Oberfläche (Link) — melde dich über den Keycloak-Login-Dialog an und prüfe ob /admin lädt und der Logout-Button im Header sichtbar ist.',
        expected_result: 'Weiterleitung zu /admin nach Keycloak-Authentifizierung; Session-Cookie gesetzt; Logout-Button im Header sichtbar.',
        test_function_url: '/admin', test_menu_path: 'Admin-Bereich → Dashboard', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Keycloak-Kontoverwaltung (Link) — prüfe ob Profildetails, aktive Sitzungen und die Passwort-Änderungsoption zugänglich sind.',
        expected_result: 'Profil-Daten ladbar; Sitzungen-Liste zeigt aktive Sessions; Passwort-Änderung zugänglich.',
        test_function_url: `https://auth.${D}/realms/workspace/account`, test_role: 'admin',
      },
      {
        question_text: 'Öffne das Portal (Link) in einem Browser-Profil ohne aktive Admin-Session — melde den Testnutzer über Keycloak an und prüfe ob Profilname stimmt. → Nutzer: zweites Browser-Profil bedienen.',
        expected_result: 'Login-Flow läuft durch; Weiterleitung zu /portal; Profilname stimmt mit Testnutzer überein.',
        test_function_url: '/portal', test_menu_path: 'Portal → Dashboard', test_role: 'user',
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
    description: 'Funktionstest der zentralen Admin-Workflows des CRM-Backends: Dashboard-KPIs, Client-Verwaltung (CRUD + Reiter), Meetings, Termine, Projekte, Kalender, Inbox und Systemeinstellungen inkl. Branding-Upload. Dieser Test verifiziert die Anforderungen FA-01 (Client-Verwaltung), FA-02 (Meetings), FA-03 (Termine & Kalender) und FA-05 (Einstellungen). Voraussetzung: Admin-Account aktiv, mindestens ein vorhandener Testclient in der Datenbank.',
    instructions: 'Alle Schritte mit dem Admin-Browser-Profil (Profil A). Klicke den Link im jeweiligen Schritt, um direkt zur richtigen Seite zu gelangen. Vorhandene Testdaten dürfen verwendet werden; lege für destruktive Schritte (Client anlegen, Logo hochladen) dedizierte Testdaten an. Trage Auffälligkeiten pro Schritt im Detailfeld ein. Schritt „Branding" erfordert eine Testbild-Datei — vorab bereitstellen.',
    steps: [
      {
        question_text: 'Öffne das Admin-Dashboard (Link) — prüfe die vier KPI-Karten oben auf der Seite: Clients, offene Bugs, Meetings, Rechnungen.',
        expected_result: 'KPIs (Clients, offene Bugs, Meetings, Rechnungen) laden ohne Fehler und zeigen plausible Werte.',
        test_function_url: '/admin', test_menu_path: 'Admin-Bereich → Dashboard', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Clientliste (Link) → klicke „Neuer Client" → fülle alle Pflichtfelder aus und speichere → lade die Seite neu und prüfe ob der Client noch erscheint.',
        expected_result: 'Client erscheint in der Clientliste; Pflichtfelder werden serverseitig validiert; nach Reload weiterhin sichtbar.',
        test_function_url: '/admin/clients', test_menu_path: 'Admin-Bereich → Kunden', test_role: 'admin',
      },
      {
        question_text: 'Klicke in der Clientliste (Link) auf einen vorhandenen Client — öffne alle Reiter (Stammdaten, Notizen, Fragebögen, Rechnungen) und prüfe auf Ladefehler.',
        expected_result: 'Reiter Stammdaten, Notizen, Fragebögen, Rechnungen ladbar; keine 500er.',
        test_function_url: '/admin/clients', test_menu_path: 'Admin-Bereich → Kunden', test_role: 'admin',
      },
      {
        question_text: 'Öffne Meetings (Link) → klicke „Neues Meeting" → trage Datum, Titel und Teilnehmer ein und speichere.',
        expected_result: 'Meeting erscheint in der Meetingliste mit korrekten Datums- und Teilnehmerinfos.',
        test_function_url: '/admin/meetings', test_menu_path: 'Admin-Bereich → Meetings', test_role: 'admin',
      },
      {
        question_text: 'Öffne Termine (Link) → klicke „Neuer Termin" → fülle das Formular aus und speichere → prüfe ob der Termin auch im Kalender unter /admin/kalender erscheint.',
        expected_result: 'Termin wird gespeichert und ist in /admin/termine sowie im Kalender sichtbar.',
        test_function_url: '/admin/termine', test_menu_path: 'Admin-Bereich → Termine', test_role: 'admin',
      },
      {
        question_text: 'Öffne Projekte (Link) → klicke „Neues Projekt" → ordne es über das Client-Feld einem Client zu → prüfe ob das Projekt in der Client-Detailansicht unter Reiter „Projekte" erscheint.',
        expected_result: 'Projekt erscheint in /admin/projekte; Tickets-System-Projekt mit Status „Entwurf" angelegt; Zuordnung zum Client sichtbar.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Öffne den Admin-Kalender (Link) — wechsle zwischen Monats- und Wochenansicht und prüfe ob angelegte Termine und Meetings korrekt visualisiert werden.',
        expected_result: 'Kalender lädt; Termine + Meetings korrekt visualisiert (Monats-/Wochenansicht).',
        test_function_url: '/admin/kalender', test_menu_path: 'Admin-Bereich → Kalender', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Inbox (Link) — klicke das Haken-Symbol oder „Erledigt" neben einem offenen Item und prüfe ob der Inbox-Counter oben sofort sinkt.',
        expected_result: 'Item wechselt den Status sofort; Inbox-Counter aktualisiert sich.',
        test_function_url: '/admin/inbox', test_menu_path: 'Admin-Bereich → Postfach', test_role: 'admin',
      },
      {
        question_text: 'Öffne Einstellungen (Link) — ändere einen beliebigen Wert (z. B. Kontaktdaten), speichere und lade die Seite neu; der Wert sollte erhalten bleiben.',
        expected_result: 'Einstellung wird persistiert; nach Reload korrekt geladen.',
        test_function_url: '/admin/einstellungen', test_menu_path: 'Admin-Bereich → Einstellungen', test_role: 'admin',
      },
      {
        question_text: 'Öffne Einstellungen → Branding (Link) — klicke „Logo hochladen", wähle eine Bilddatei und speichere; Logo sollte im Admin-Header und auf der öffentlichen Website erscheinen. → Nutzer: Testdatei bereitstellen.',
        expected_result: 'Logo erscheint im Admin-Header und auf der öffentlichen Website.',
        test_function_url: '/admin/einstellungen/branding', test_menu_path: 'Admin-Bereich → Einstellungen → Branding', test_role: 'admin',
        agent_notes: 'File-Upload — Nutzer nach einer Testbild-Datei fragen und dann via Browser-Extension hochladen.',
      },
    ],
  },
  {
    title: 'System-Test 3: Kommunikation — Chat-Widget, Inbox & E-Mail',
    description: 'Prüft die gesamte Kommunikationsschicht der Plattform: das Fragebogen-Widget auf der öffentlichen Website (Nutzer-seitig), den bidirektionalen Admin-Inbox-Workflow mit Echtzeit-Push, den E-Mail-Versand bei Terminbestätigungen sowie die Newsletter-HTML-Vorschau. Dieser Test verifiziert die Anforderungen FA-06 (Nachrichtenfunktion), FA-07 (E-Mail-Benachrichtigung) und NFA-04 (Reaktionszeit Echtzeit-Kommunikation). Voraussetzung: Testnutzer-Konto angelegt, mindestens ein Termin und eine Fragebogen-Zuweisung vorhanden, Mailpit erreichbar.',
    instructions: 'Schritt 1 und 3 im Testnutzer-Browser (Profil B), Schritte 2, 4 und 5 im Admin-Browser (Profil A). Öffne jeweils den Link im Schritt. Prüfe nach Schritt 2 aktiv ob die Nachricht im Testnutzer-Browser ohne Seitenreload erscheint — das belegt den Echtzeit-Push. Für E-Mail-Schritte Mailpit parallel geöffnet halten. Trage bei jedem Schritt den genauen Zeitstempel und Beobachtungen im Detailfeld ein.',
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
        test_function_url: '/admin/inbox', test_menu_path: 'Admin-Bereich → Postfach', test_role: 'admin',
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
        test_function_url: '/admin/termine', test_menu_path: 'Admin-Bereich → Termine', test_role: 'admin',
      },
      {
        question_text: 'Öffne Newsletter (Link) — klicke „Vorschau" und prüfe ob Header/Footer-Branding und Abmelde-Link korrekt dargestellt werden.',
        expected_result: 'HTML-Vorschau lädt; Header/Footer-Branding und Abmelde-Link sichtbar.',
        test_function_url: '/admin/newsletter', test_menu_path: 'Admin-Bereich → Newsletter', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 4: Fragebogen-System (Coaching-Workflow)',
    description: 'Prüft den vollständigen Coaching-Fragebogen-Workflow von der Template-Erstellung bis zur Auswertung durch den Coach: Template anlegen, veröffentlichen, einem Client zuweisen, als Testnutzer ausfüllen und als Admin Antworten inkl. Scoring-Dimensionen auswerten. Dieser Test verifiziert die Anforderungen FA-04 (Fragebogen-System), FA-08 (Portal-Dashboard) und NFA-02 (Datenpersistenz). Voraussetzung: Admin- und Testnutzer-Konto aktiv, mindestens ein Client in der Datenbank vorhanden.',
    instructions: 'Schritte 1, 2, 4 und 5 im Admin-Browser (Profil A), Schritt 3 im Testnutzer-Browser (Profil B). Lege für diesen Test ein frisches Test-Template an, um vorhandene Produktionsdaten nicht zu verfälschen. Übergib nach Schritt 2 die Kontrolle an den Testnutzer und warte auf dessen Bestätigung vor Schritt 4. Trage Scoring-Werte und Auffälligkeiten im Detailfeld ein.',
    steps: [
      {
        question_text: 'Öffne Fragebogen-Verwaltung (Link) → klicke „Neues Template" → trage einen Titel ein, füge mindestens eine Frage hinzu und speichere.',
        expected_result: 'Template wird gespeichert und erscheint in der Template-Liste als Draft.',
        test_function_url: '/admin/fragebogen', test_menu_path: 'Admin-Bereich → Fragebögen', test_role: 'admin',
      },
      {
        question_text: 'Klicke im Template auf „Veröffentlichen" — öffne dann einen Client (Link), wechsle zum Reiter „Fragebögen" und klicke „Zuweisen".',
        expected_result: 'Assignment erstellt; Nutzer sieht Fragebogen im Portal-Dashboard; verknüpftes Projekt automatisch unter /admin/projekte angelegt.',
        test_function_url: '/admin/clients', test_menu_path: 'Admin-Bereich → Kunden', test_role: 'admin',
      },
      {
        question_text: 'Melde dich als Testnutzer im Portal an (Link) — der neue Fragebogen sollte im Dashboard unter „Ausstehende Fragebögen" sichtbar sein; klicke ihn an und beantworte alle Fragen. → Nutzer: zweites Browser-Profil bedienen.',
        expected_result: 'Fragebogen-Status wechselt auf „submitted"; Bestätigungsseite erscheint.',
        test_function_url: '/portal', test_menu_path: 'Portal → Dashboard', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Nutzer Kontrolle übergeben bis Fragebogen abgesendet ist.',
      },
      {
        question_text: 'Öffne die Client-Detailansicht (Link) → wechsle zum Reiter „Fragebögen" → wähle den abgegebenen Fragebogen — prüfe ob Antworten, Scoring-Dimensionen und das Coach-Notiz-Feld korrekt dargestellt werden.',
        expected_result: 'Antworten + Scoring-Dimensionen korrekt dargestellt; Coach-Notizen-Feld editierbar.',
        test_function_url: '/admin/clients', test_menu_path: 'Admin-Bereich → Kunden', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) — scrolle zum Abschnitt „Test-Results-Panel" und prüfe ob alle System-Test-Templates mit Last-Result/Last-Success-Status sichtbar sind.',
        expected_result: 'Alle 12 System-Test-Templates sichtbar mit Last-Result/Last-Success-Status.',
        test_function_url: '/admin/monitoring', test_menu_path: 'Admin-Bereich → Monitoring', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 5: Dokumente & Signatur-System',
    description: 'Prüft den nativen Dokument-Editor, den CMS-Inhalte-Editor und den vollständigen Signatur-Roundtrip (Versenden → Signieren per Portal → PDF-Download) über das integrierte Signatur-System. Dieser Test verifiziert die Anforderungen FA-11 (Dokumentenverwaltung), FA-12 (Elektronische Signatur) und SA-04 (Audit-Trail rechtsverbindlicher Aktionen). Voraussetzung: Mailpit für E-Mail-Empfang aktiv, Testnutzer als Signatur-Empfänger eingetragen.',
    instructions: 'Schritte 1, 2, 3 und 5 im Admin-Browser (Profil A), Schritt 4 im Testnutzer-Browser (Profil B). Öffne jeweils den Link im Schritt. Der Signaturschritt (4) ist eine rechtsverbindliche Aktion — übergib die Kontrolle bewusst und warte auf explizite Bestätigung durch den Testnutzer.',
    steps: [
      {
        question_text: 'Öffne Dokumente (Link) → klicke „Neues Dokument" → schreibe einen Beispiel-Inhalt und speichere → lade die Seite neu und prüfe ob der Inhalt erhalten bleibt.',
        expected_result: 'Dokument wird gespeichert; nach Reload weiterhin lesbar; Versionshistorie sichtbar.',
        test_function_url: '/admin/dokumente', test_menu_path: 'Admin-Bereich → Dokumente', test_role: 'admin',
      },
      {
        question_text: 'Öffne Inhalte (Link) → klicke auf einen Startseiten-Block → ändere den Text und speichere → öffne die öffentliche Startseite und prüfe ob die Änderung sichtbar ist.',
        expected_result: 'Änderung wird persistiert und auf der öffentlichen Startseite sichtbar.',
        test_function_url: '/admin/inhalte', test_menu_path: 'Admin-Bereich → Inhalte', test_role: 'admin',
      },
      {
        question_text: 'Öffne Dokumente (Link) → wähle ein Dokument aus → klicke „Zur Unterschrift senden" → wähle den Testnutzer als Empfänger.',
        expected_result: 'Nutzer erhält Mail/Notification mit Signatur-Link (URL enthält /portal/sign/[id]).',
        test_function_url: '/admin/dokumente', test_menu_path: 'Admin-Bereich → Dokumente', test_role: 'admin',
      },
      {
        question_text: 'Öffne den Signatur-Link (/portal/sign/[id]) als Testnutzer — unterzeichne das Dokument auf dem Canvas per Maus/Stift und klicke „Unterschrift bestätigen". → Nutzer: Testnutzer-Browser + tatsächliche Signatur bestätigen.',
        expected_result: 'Signatur wird gespeichert; Dokument-Status wechselt auf „completed". PDF-Download-Link wird angezeigt.',
        test_menu_path: 'Portal → Dokument unterschreiben', test_role: 'user',
        agent_notes: 'Rechtsverbindliche Signatur — Nutzer muss bewusst bestätigen. Kontrolle für diesen Schritt übergeben.',
      },
      {
        question_text: 'Öffne Dokumente (Link) als Admin — finde das unterzeichnete Dokument, prüfe auf Status „completed" und lade das signierte PDF herunter.',
        expected_result: 'Dokument-Status = „completed"; signiertes PDF wird heruntergeladen.',
        test_function_url: '/admin/dokumente', test_menu_path: 'Admin-Bereich → Dokumente', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 6: Rechnungswesen — Steuer-Modus & § 19 UStG-Monitoring',
    description: 'Prüft vollständig das Steuer-Subsystem B (§ 19 UStG): Kleinunternehmer/Regelbesteuerung-Schalter, automatisches Schwellenwert-Monitoring bei 80 % von 22.000 €, 25.000 € und 100.000 € Jahresumsatz, USt-IdNr.-Pflichtvalidierung (Format DE\\d{9}), UStVA-CSV/ELSTER-Export mit Pflichtfeldern (Kennziffern 81/86/35), Ist-Versteuerung und das Fristen-Dashboard. Dieser Test deckt alle Anforderungen B-01 bis B-11 vollständig ab. Voraussetzung: Admin-Account aktiv, Steuer-Einstellungen zugänglich, Testdaten für Schwellenwert-Schritte (4–6) über DB oder Test-Modus vorbereitet.',
    instructions: 'Alle Schritte im Admin-Browser (Profil A). Öffne jeweils den Link im Schritt. Schritte 4–6 erfordern künstliche Umsatzwerte — stimme mit dem Testnutzer vorab ab, ob Testdaten via DB oder Test-Modus verfügbar sind; andernfalls diese Schritte als „übersprungen" markieren. Trage bei Alert-Schritten exakt den angezeigten Alert-Text und Betrag im Detailfeld ein.',
    steps: [
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → suche den Dropdown „Steuer-Modus" und wähle „Kleinunternehmer" → speichere [B-01].',
        expected_result: 'site_settings.tax_mode = kleinunternehmer; Hinweis „§ 19 UStG" erscheint auf der nächsten Rechnung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_menu_path: 'Admin-Bereich → Einstellungen → Rechnungen', test_role: 'admin', req_ids: ['B-01'],
      },
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → wechsle den Steuer-Modus auf „Regelbesteuerung" → speichere [B-01/B-05].',
        expected_result: 'Wechsel persistiert; nächste Rechnung wird mit USt (7 %/19 %) ausgewiesen; Rechnungsvorlage schaltet automatisch auf Regelbesteuerer-Template (§ 14 UStG).',
        test_function_url: '/admin/einstellungen/rechnungen', test_menu_path: 'Admin-Bereich → Einstellungen → Rechnungen', test_role: 'admin', req_ids: ['B-01', 'B-05'],
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — prüfe das „Jahresumsatz"-Widget: der angezeigte Betrag muss der Summe aller „paid"-Rechnungen im laufenden Jahr entsprechen [B-02].',
        expected_result: 'Kumulierter Netto-Umsatz des laufenden Jahres entspricht der Summe der „paid"-Rechnungen.',
        test_function_url: '/admin/steuer', test_menu_path: 'Admin-Bereich → Steuer-Dashboard', test_role: 'admin', req_ids: ['B-02'],
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — erhöhe den Testumsatz auf ≥ 80 % von 25.000 € und prüfe ob ein gelber Warn-Alert im TaxMonitorWidget erscheint [B-03]. → Nutzer: Testwert via DB oder Test-Modus setzen.',
        expected_result: 'Gelber Warn-Alert sichtbar im TaxMonitorWidget; Hinweis auf §19-Grenze.',
        test_function_url: '/admin/steuer', test_menu_path: 'Admin-Bereich → Steuer-Dashboard', test_role: 'admin', req_ids: ['B-03'],
        agent_notes: 'Testumsatz muss über DB oder Test-Modus gesetzt werden. Nutzer fragen ob Testdaten vorbereitet sind, sonst Schritt überspringen.',
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — überschreite die 25.000 €-Grenze und prüfe ob ein roter Alert und der automatische Switch auf Regelbesteuerung ausgelöst wird [B-03/B-04]. → Nutzer: Testwert setzen.',
        expected_result: 'Roter Alert; Auto-Switch auf Regelbesteuerung; nächste Rechnung mit USt; Switch im Audit-Log.',
        test_function_url: '/admin/steuer', test_menu_path: 'Admin-Bereich → Steuer-Dashboard', test_role: 'admin', req_ids: ['B-03', 'B-04'],
        agent_notes: 'Testumsatz > 25.000 € erforderlich. Nutzer koordinieren; danach UI-Reaktion im Browser prüfen.',
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) — überschreite die 100.000 €-Grenze und prüfe ob ein roter „Sofort Regelbesteuerung"-Alert erscheint [B-06]. → Nutzer: Testwert setzen.',
        expected_result: 'Roter „sofort Regelbesteuerung"-Alert; Pflichtwechsel unabhängig vom Vorjahresumsatz.',
        test_function_url: '/admin/steuer', test_menu_path: 'Admin-Bereich → Steuer-Dashboard', test_role: 'admin', req_ids: ['B-06'],
        agent_notes: 'Testumsatz > 100.000 € erforderlich. Nutzer koordinieren.',
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) → scrolle zum Abschnitt „Audit-Log" — prüfe ob der Steuermodus-Wechsel mit Datum, Rechnungsnummer und Begründung eingetragen ist [B-07].',
        expected_result: 'Eintrag mit Datum, auslösender Rechnungsnummer und Begründung sichtbar (revisionssicher).',
        test_function_url: '/admin/steuer', test_menu_path: 'Admin-Bereich → Steuer-Dashboard', test_role: 'admin', req_ids: ['B-07'],
      },
      {
        question_text: 'Öffne UStVA/ELSTER (Link) → klicke „CSV exportieren" — prüfe ob die Datei Nettoumsätze nach Steuersatz (0 %/7 %/19 %) und USt-Summen enthält [B-08].',
        expected_result: 'CSV enthält Nettoumsätze 0 %/7 %/19 % und USt-Summen je Steuersatz; Werte stimmen mit Buchungen.',
        test_function_url: '/admin/billing/elster', test_menu_path: 'Admin-Bereich → Rechnungen → UStVA / ELSTER', test_role: 'admin', req_ids: ['B-08'],
      },
      {
        question_text: 'Öffne UStVA/ELSTER (Link) → klicke „ELSTER-Vorschau" und prüfe ob die Pflichtfelder (Kennziffern 81/86/35) korrekt befüllt sind [B-08].',
        expected_result: 'Vorschau-Layout mit Pflichtfeldern (Kennziffern 81/86/35) korrekt befüllt.',
        test_function_url: '/admin/billing/elster', test_menu_path: 'Admin-Bereich → Rechnungen → UStVA / ELSTER', test_role: 'admin', req_ids: ['B-08'],
      },
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → aktiviere den Toggle „Ist-Versteuerung" und prüfe ob die UStVA-Logik auf Zahlungseingangsdatum umschaltet [B-09].',
        expected_result: 'UStVA bezieht USt erst bei Zahlungseingang ein, nicht bei Rechnungsstellung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_menu_path: 'Admin-Bereich → Einstellungen → Rechnungen', test_role: 'admin', req_ids: ['B-09'],
      },
      {
        question_text: 'Öffne das Steuer-Dashboard (Link) → scrolle zum Abschnitt „Fristen" — prüfe ob die UStVA-Quartalsfristen (10. März/Juni/September/Dezember) und Jahres-/GewSt-Frist angezeigt werden [B-10].',
        expected_result: 'Termine 10. März/Juni/September/Dezember sowie Jahres-/GewSt-Frist sichtbar.',
        test_function_url: '/admin/steuer', test_menu_path: 'Admin-Bereich → Steuer-Dashboard', test_role: 'admin', req_ids: ['B-10'],
      },
      {
        question_text: 'Öffne Rechnungs-Einstellungen (Link) → versuche auf Regelbesteuerung zu wechseln ohne eine USt-IdNr. einzutragen — Speichern sollte fehlschlagen [B-11].',
        expected_result: 'Speichern ohne USt-IdNr. schlägt fehl; Format DE\\d{9} wird validiert (EU-VIES-konform).',
        test_function_url: '/admin/einstellungen/rechnungen', test_menu_path: 'Admin-Bereich → Einstellungen → Rechnungen', test_role: 'admin', req_ids: ['B-11'],
      },
    ],
  },
  {
    title: 'System-Test 7: Rechnungswesen — Rechnungserstellung, ZUGFeRD & Archivierung',
    description: 'Prüft vollständig die native Invoice Engine (Subsystem A): Pflichtangaben nach § 14 UStG für Klein- und Regelbesteuerer, fortlaufende GoBD-konforme Nummerierung (RE-YYYY-NNNN), SEPA-Mandatsverwaltung, serverseite PDF-Erzeugung ohne externe API-Abhängigkeit, ZUGFeRD/factur-x.xml-Einbettung (E-Rechnungspflicht B2B 2025), Finalisierungs-Lock (locked=true), 10-Jahres-Archivierungsfrist (§ 147 AO), Stornorechnung, Mahnwesen und Angebots-Konvertierung. Dieser Test deckt alle Anforderungen A-01 bis A-15 vollständig ab. Voraussetzung: Admin-Account aktiv, Mailpit erreichbar, Terminal-Zugriff für ZUGFeRD-Prüfung (qpdf/pdftk) und DB-Zugriff für retain_until-Abfrage vorbereitet.',
    instructions: 'Alle Schritte im Admin-Browser (Profil A). Öffne jeweils den Link im Schritt. Schritt 8 (ZUGFeRD-Prüfung via Terminal) und Schritt 10 (retain_until via DB-Query) erfordern Nutzer-Handoff — übergib dort die Kontrolle und warte auf Terminalausgabe. Öffne den Browser-Netzwerk-Tab in DevTools vor Schritt 1, damit externe API-Calls sofort erkennbar sind. Trage Rechnungsnummern, PDF-Prüfergebnisse und Terminalausgaben vollständig im Detailfeld ein.',
    steps: [
      {
        question_text: 'Öffne die Rechnungsliste (Link) — prüfe im Browser-Netzwerk-Tab ob die Daten aus PostgreSQL geladen werden (kein Stripe-API-Call sichtbar) [A-01].',
        expected_result: 'Daten werden aus PostgreSQL geladen; im Network-Tab kein Stripe-API-Call; Liste vollständig.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-01'],
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) → klicke „Neue Rechnung" → wähle Steuer-Modus „Kleinunternehmer (§ 19 UStG)" → fülle alle Pflichtfelder aus und speichere [A-02/A-04].',
        expected_result: 'Pflichtangaben (Anschrift Leistender/Empfänger, Steuernummer, Datum, fortlaufende Nr. RE-YYYY-NNNN, Leistungsbeschreibung, Entgelt) + § 19-Hinweis vorhanden.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-02', 'A-04'],
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) → klicke „Neue Rechnung" → wähle Steuer-Modus „Regelbesteuerung" → fülle alle Pflichtfelder inkl. USt-IdNr. aus [A-03].',
        expected_result: 'Pflichtangaben inkl. USt-IdNr., Nettobetrag, Steuersatz (7 %/19 %), Steuerbetrag, Bruttobetrag, Leistungszeitraum.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-03'],
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) — versuche eine Rechnungsnummer manuell zu ändern oder eine finalisierte Rechnung zu löschen; beide Aktionen sollten abgeblockt werden [A-04].',
        expected_result: 'Versuch, Nummer manuell zu ändern oder eine Rechnung zu löschen, schlägt fehl bzw. erzeugt nur eine Stornorechnung.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-04'],
      },
      {
        question_text: 'Öffne eine bestehende Rechnung → klicke „PDF ansehen/drucken" (Link) — prüfe im PDF ob IBAN, BIC, Bankname und Verwendungszweck (= Rechnungsnummer) abgedruckt sind [A-05].',
        expected_result: 'IBAN, BIC, Bankname, Verwendungszweck = Rechnungsnummer auf jeder PDF.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-05'],
      },
      {
        question_text: 'Öffne einen Kunden in der Billing-Kundenliste → scrolle zum Abschnitt „SEPA-Mandat" → lege ein Mandat mit IBAN, BIC, Mandatsreferenz und Unterschriftsdatum an [A-06].',
        expected_result: 'IBAN, BIC, Mandatsreferenz, Datum der Unterschrift, Gläubiger-ID gespeichert und an Rechnungen verknüpfbar.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-06'],
      },
      {
        question_text: 'Öffne eine Rechnung → klicke „PDF herunterladen" — prüfe im Browser-Netzwerk-Tab ob kein externer API-Call ausgelöst wurde und ob die PDF valide ist [A-07].',
        expected_result: 'Download liefert valide PDF; kein externer API-Call im Network-Tab; pdf_path im DB-Eintrag gesetzt (GoBD-Archiv).',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-07'],
      },
      {
        question_text: 'Lade die PDF einer finalisierten Rechnung herunter — prüfe via Terminal ob factur-x.xml eingebettet ist [A-08]. → Nutzer: `qpdf --show-attachments <datei.pdf>` oder `pdftk <datei.pdf> dump_data_fields` ausführen.',
        expected_result: 'qpdf/pdftk zeigt eingebettetes factur-x.xml mit Profil MINIMUM (E-Rechnungspflicht B2B 2025).',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-08'],
        agent_notes: 'Terminal-Schritt — Browser kann PDF nicht lokal prüfen. PDF herunterladen (Browser-Extension), dann Nutzer bitten: `qpdf --show-attachments <pfad>` auszuführen und Ausgabe zu zeigen.',
      },
      {
        question_text: 'Öffne eine offene Rechnung → klicke „Finalisieren/Sperren" — prüfe ob alle Bearbeiten-Buttons deaktiviert sind und API-Bearbeitungsversuche 403 liefern [A-09].',
        expected_result: 'locked = true; Bearbeiten-Buttons disabled; API-Versuche zu editieren liefern 403/Conflict.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-09'],
      },
      {
        question_text: 'Prüfe für eine finalisierte Rechnung ob retain_until = Rechnungsdatum + 10 Jahre gesetzt ist [A-10]. → Nutzer: `SELECT retain_until FROM billing_invoices WHERE id = \'<id>\';` ausführen.',
        expected_result: 'DB-Feld retain_until = Rechnungsdatum + 10 Jahre (§ 147 AO).',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-10'],
        agent_notes: 'DB-Abfrage erforderlich. Rechnungs-ID aus der UI entnehmen und Nutzer bitten: `task workspace:psql -- website` → `SELECT retain_until FROM billing_invoices WHERE id = \'<id>\';`',
      },
      {
        question_text: 'Öffne eine finalisierte Rechnung → klicke „Stornieren" — prüfe ob eine neue Rechnung mit negativem Betrag angelegt wird und auf das Original verweist [A-11].',
        expected_result: 'Neue Rechnung mit negativem Betrag; cancels_invoice_id verweist auf Original; § 14c UStG-Hinweis.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-11'],
      },
      {
        question_text: 'Öffne eine Rechnung → klicke „Per E-Mail versenden" — prüfe in Mailpit ob die Mail mit PDF-Anhang und ZUGFeRD-XML angekommen ist [A-12].',
        expected_result: 'E-Mail mit PDF-Anhang + ZUGFeRD-XML gesendet; Mailpit/Empfangs-Postfach zeigt Mail.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-12'],
      },
      {
        question_text: 'Öffne eine Rechnung → klicke die Status-Buttons der Reihe nach: „Freigeben" (Draft→Open), dann „Zahlung erfassen" (Open→Paid) — prüfe im Buchungsjournal ob jede Transition gebucht wurde [A-13].',
        expected_result: 'Statuswechsel sichtbar; jede Transition triggert eine Buchung im Buchungsjournal.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-13'],
      },
      {
        question_text: 'Öffne eine offene Rechnung → klicke „Zahlungseingang erfassen" → trage Datum, Betrag und Zahlungsreferenz ein — prüfe ob Status auf „paid" wechselt und die Einnahme im Journal erscheint [A-14].',
        expected_result: 'Datum, Betrag, Zahlungsreferenz gespeichert; Status auf „paid"; Einnahme im Journal gebucht.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-14'],
      },
      {
        question_text: 'Öffne eine überfällige Rechnung → klicke „Mahnung senden" — prüfe ob Mahnstufe inkrementiert und die Mahnmail versendet wurde [A-14].',
        expected_result: 'Mahnstufe inkrementiert; Mail mit Mahngebühr versendet; Buchung in Forderungs-Journal.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin', req_ids: ['A-14'],
      },
      {
        question_text: 'Öffne Angebote (Link) → klicke „Neues Angebot" → speichere es → klicke „In Rechnung umwandeln" und prüfe ob die Rechnung auf das Angebot verweist [A-15].',
        expected_result: 'Angebot mit Nummer AN-YYYY-NNNN; bei Konvertierung referenziert die Rechnung das Angebot.',
        test_function_url: '/admin/angebote', test_menu_path: 'Admin-Bereich → Angebote', test_role: 'admin', req_ids: ['A-15'],
      },
    ],
  },
  {
    title: 'System-Test 8: Buchhaltung — EÜR, Belege & Steuerauswertungen',
    description: 'Prüft vollständig das EÜR-Buchhaltungsmodul (Subsystem C) inklusive DATEV-Export: Buchungsjournal nach § 4 Abs. 3 EStG, automatische Forderungs-/Einnahme-Buchung bei Rechnungsversand und Zahlungseingang, Vorsteuer-Trennung, Anlage-EÜR-Export (PDF/CSV), § 15a-Vorsteuerberichtigung bei Anlagegütern, GWG-Sofortabschreibung (§ 6 Abs. 2 EStG), Sonder-AfA § 7g, Gewerbesteuer-Kalkulator (Hebesatz Lübbecke 417 %) und ESt-Vorauszahlungsrechner. Dieser Test deckt alle Anforderungen C-01 bis C-13 vollständig ab. Voraussetzung: Admin-Account aktiv, mindestens eine finalisierte Rechnung für Buchungstest vorhanden, Testdatei für Belegarchiv-Schritt bereitgestellt.',
    instructions: 'Alle Schritte im Admin-Browser (Profil A). Öffne jeweils den Link im Schritt. Letzter Schritt (Belegarchiv, C-13) erfordert eine Testdatei (PDF oder Bild) — vorab beim Testnutzer anfragen. Für Schritt 2 (Auto-Buchung) muss unmittelbar nach Rechnungsversand im Journal geprüft werden — Browserfenster nebeneinander öffnen. Trage Buchungsnummern und Beträge zur Nachvollziehbarkeit vollständig im Detailfeld ein.',
    steps: [
      {
        question_text: 'Öffne Buchhaltung (Link) — prüfe ob das Buchungsjournal Einträge mit Datum, Betrag, Kategorie und Belegnummer für Einnahmen und Ausgaben zeigt [C-01].',
        expected_result: 'Liste mit Datum, Betrag, Kategorie, Belegnummer für Betriebseinnahmen und Betriebsausgaben (§ 4 Abs. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-01'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — sende eine Rechnung ab und prüfe ob innerhalb weniger Sekunden eine „Forderung"-Buchung im Journal erscheint [C-02].',
        expected_result: 'Buchung mit Kategorie „Forderung" zeitnah (≤ 10 Tage GoBD) im Journal sichtbar.',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-02'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — erfasse einen Zahlungseingang für eine offene Rechnung und prüfe ob eine „Betriebseinnahme"-Buchung erscheint und die Forderung ausgeglichen wird [C-02].',
        expected_result: 'Buchung „Betriebseinnahme" mit Verweis auf Rechnung; Forderung wird ausgeglichen.',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-02'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — erfasse eine Eingangsrechnung mit Vorsteuer und prüfe ob Vorsteuer als eigene Buchungskategorie getrennt vom Nettobetrag gebucht wird [C-03].',
        expected_result: 'Bei Eingangsrechnung wird Vorsteuer separat vom Nettobetrag gebucht (§ 4 Abs. 3 S. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-03'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → klicke „USt-Zahllast buchen" → trage den Quartalsbetrag ein — prüfe ob die Buchung mit Kategorie „USt-Zahllast" erscheint [C-04].',
        expected_result: 'Quartalszahlung an Finanzamt als Ausgabe-Buchung mit Kategorie „USt-Zahllast"; Erstattungen als Einnahme.',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-04'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → scrolle zum Abschnitt „EÜR" → lade PDF und CSV herunter — prüfe ob Einnahmen, Ausgaben und Gewinn mit dem Journal übereinstimmen [C-05].',
        expected_result: 'Beide Exports zeigen Betriebseinnahmen, Ausgaben, Gewinn; Summen stimmen mit Journal überein (Anlage EÜR).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-05'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → klicke „Anlagegut erfassen" → trage AK > 1.000 €, Anschaffungsdatum, AfA-Laufzeit und Vorsteuer ein — prüfe ob § 15a-Berichtigungsbetrag berechnet wird [C-06/C-07].',
        expected_result: 'AK, Anschaffungsdatum, AfA-Laufzeit (Monate), Vorsteuer gespeichert; Berichtigungsbetrag § 15a UStG bei Modus-Wechsel automatisch berechnet (Bagatellgrenze § 44 UStDV).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-06', 'C-07'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) — wechsle den Steuer-Modus von Klein- auf Regelbesteuerung und prüfe ob die Vorsteuer auf Warenbestände als Forderung gegen das FA berechnet wird [C-08].',
        expected_result: 'Beim Switch Klein → Regel: volle Vorsteuer auf Bestände als Forderung gegen das FA berechnet (§ 15a Abs. 7).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-08'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → klicke „GWG erfassen" → trage einen Nettobetrag ≤ 800 € ein — prüfe ob Sofortabschreibung angesetzt wird [C-09].',
        expected_result: 'Sofortabschreibung; Sammelposten-Logik für 250–1.000 € über 5 Jahre korrekt (§ 6 Abs. 2/2a EStG).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-09'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → wähle ein Anlagegut aus → aktiviere „Sonderabschreibung § 7g EStG" — prüfe ob 40 % Sonder-AfA angesetzt werden [C-10].',
        expected_result: '40 %-Sonder-AfA bei Gewinn ≤ 200.000 € korrekt angesetzt.',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-10'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → scrolle zum „Gewerbesteuer-Kalkulator" → trage einen Gewerbeertrag ein und prüfe ob die Steuerlast korrekt berechnet wird (Hebesatz Lübbecke 417 %) [C-11].',
        expected_result: 'Eingabe Gewerbeertrag → Hinzurechnungen/Kürzungen → Freibetrag 24.500 € → Messbetrag × 3,5 % × Hebesatz Lübbecke 417 % → korrekte Steuerlast.',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-11'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → scrolle zum „ESt-Vorauszahlungsrechner" → trage einen Schätzgewinn ein und prüfe ob Quartalsraten korrekt berechnet werden [C-12].',
        expected_result: 'Schätzgewinn → zvE nach GFB 12.096 € (2025) → ESt-Betrag → Quartalsraten korrekt berechnet.',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-12'],
      },
      {
        question_text: 'Öffne Buchhaltung (Link) → wähle eine Buchung aus → klicke „Beleg anhängen" → lade eine PDF oder ein Bild hoch — prüfe ob der Beleg dauerhaft mit der Buchung verknüpft ist [C-13]. → Nutzer: Testdatei bereitstellen.',
        expected_result: 'PDF/Bild-Upload erfolgreich; Beleg unveränderbar mit Buchung verknüpft (GoBD Rn. 85–96).',
        test_function_url: '/admin/buchhaltung', test_menu_path: 'Admin-Bereich → Buchhaltung', test_role: 'admin', req_ids: ['C-13'],
        agent_notes: 'File-Upload — Nutzer nach einer Testdatei (PDF oder Bild) fragen und dann via Browser-Extension hochladen.',
      },
      {
        question_text: 'Öffne die Rechnungsliste (Link) → klicke „DATEV-Export" — öffne die CSV und prüfe ob Konten und Buchungsdatum im DATEV-Format vorliegen.',
        expected_result: 'CSV im DATEV-Format mit korrekten Konten und Buchungsdatum; importierbar in DATEV-Tool.',
        test_function_url: '/admin/rechnungen', test_menu_path: 'Admin-Bereich → Rechnungen', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 9: Monitoring & Bug-Tracking',
    description: 'Prüft die Infrastruktur-Überwachung und das interne Bug-Tracking-System: Pod-Status-Anzeige für beide Cluster, Rolling-Restart-Funktion ohne Downtime, Bug-Ticket-Lifecycle (Erstellen → Auflösen mit Auflösungsnotiz) sowie das Test-Results-Panel mit Drilldown auf Frage-Ebene. Dieser Test verifiziert die Anforderungen NFA-05 (Monitoring-Dashboard), NFA-06 (Verfügbarkeit Rolling Restart) und FA-13 (Bug-Ticket-System). Voraussetzung: Admin-Account aktiv, beide Cluster erreichbar, mindestens ein offenes Bug-Ticket in der Datenbank vorhanden.',
    instructions: 'Alle Schritte im Admin-Browser (Profil A). Öffne jeweils den Link im Schritt. Beim Rolling-Restart-Schritt (2) im Browser-Tab das Monitoring offen lassen und den Pod-Status in Echtzeit beobachten — Zeitspanne bis „Ready" im Detailfeld notieren. Beim Test-Results-Panel (Schritt 5) jeden Template-Eintrag auf Vollständigkeit prüfen (alle 12 Templates sichtbar).',
    steps: [
      {
        question_text: 'Öffne Monitoring (Link) — prüfe die Pod-Statusliste: alle Pods sollten „Running" oder „Healthy" anzeigen; keine dauerhaften CrashLoops.',
        expected_result: 'Alle Pods zeigen „Running" oder „Healthy"; keine dauerhaften CrashLoops.',
        test_function_url: '/admin/monitoring', test_menu_path: 'Admin-Bereich → Monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → wähle ein Deployment aus → klicke „Rolling Restart" — prüfe ob der Pod neu startet und wieder in den „Ready"-Zustand kommt.',
        expected_result: 'Restart-Trigger wird bestätigt; Pod kommt wieder ready.',
        test_function_url: '/admin/monitoring', test_menu_path: 'Admin-Bereich → Monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → klicke „Bug-Ticket erstellen" → fülle Titel und Beschreibung aus — prüfe ob das Ticket unter /admin/bugs mit dem Format Txxxxxx erscheint.',
        expected_result: 'Ticket mit Format Txxxxxx wird angelegt und unter /admin/bugs sichtbar.',
        test_function_url: '/admin/monitoring', test_menu_path: 'Admin-Bereich → Monitoring', test_role: 'admin',
      },
      {
        question_text: 'Öffne Bug-Tickets (Link) → wähle ein offenes Ticket → klicke „Auflösen" → trage eine Auflösungsnotiz ein — prüfe ob der Status auf „resolved" wechselt.',
        expected_result: 'Status wechselt auf „resolved"; Auflösungsnotiz wird gespeichert.',
        test_function_url: '/admin/bugs', test_menu_path: 'Admin-Bereich → Bug-Tickets', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) → scrolle zum „Test-Results-Panel" — prüfe ob alle System-Test-Templates mit last_result und last_success_at sichtbar sind und ein Drilldown auf Question-Level möglich ist.',
        expected_result: 'Alle 12 Templates sichtbar mit last_result/last_success_at; Drilldown auf Question-Level möglich.',
        test_function_url: '/admin/monitoring', test_menu_path: 'Admin-Bereich → Monitoring', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 10: Externe Dienste & öffentliche Website',
    description: 'Prüft alle via Keycloak-SSO angebundenen externen Dienste auf Funktionsfähigkeit nach dem Login: Nextcloud Dateiupload, Kalender, Kontakte, Talk (Audio/Video via WebRTC-Signaling), Whiteboard, Collabora Online-Editor, Vaultwarden Passwortverwaltung sowie die öffentliche Astro-Website mit Kontaktformular-Submission. Dieser Test verifiziert die Anforderungen FA-14 (Nextcloud-Integration), FA-15 (Vaultwarden-Integration), FA-16 (Collabora-Integration), FA-17 (Brett-Integration) und NFA-01 (öffentliche Website DSGVO-konform). Voraussetzung: Alle Dienste gestartet, Testnutzer-SSO aktiv, Kamera/Mikrofon für Talk-Schritt am Browser freigegeben.',
    instructions: 'Alle Schritte im Testnutzer-Browser (Profil B), sofern nicht anders angegeben. Klicke den Link im jeweiligen Schritt. Schritt 4 (Talk Audio/Video) erfordert Kamera/Mikrofon-Freigabe im Browser — im Berechtigungsdialog aktiv „Zulassen" klicken. Für den Collabora-Schritt muss eine DOCX/XLSX/ODS-Datei in Nextcloud vorhanden sein. Trage bei jedem Schritt den genauen Service-Status (Ladezeit, etwaige Fehlermeldungen) im Detailfeld ein.',
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
  {
    title: 'System-Test 11: LiveKit & Streaming',
    description: 'Prüft den vollständigen LiveKit-WebRTC-Streaming-Stack: Admin-Steuerseite (Stream-Start/Stop, Token-Generierung), Viewer-Portal aus Testnutzer-Sicht, RTMP-Ingress-Status für OBS/externe Quellen, Recordings-Liste im PVC sowie Pod-Stabilität im Kubernetes-Cluster. Dieser Test verifiziert die Anforderungen FA-18 (LiveKit-Streaming), FA-19 (RTMP-Ingress), NFA-07 (Stream-Latenz) und NFA-08 (Recording-Persistenz). Voraussetzung: livekit-server Pod auf gekko-hetzner-3 in Status Running, DNS auf Pin-Node gepinnt (livekit/stream), ufw-Ports 7880/7881/tcp + 50000-60000/udp geöffnet, Testnutzer-Account aktiv.',
    instructions: 'Schritte 1, 2, 4, 5, 6 und 7 im Admin-Browser (Profil A). Schritt 2 startet den Stream — danach sofort Schritt 3 im Testnutzer-Browser (Profil B) ausführen. Schritt 6 beendet den Stream — danach Schritt 3 erneut öffnen um „kein Stream"-Meldung zu verifizieren. Trage bei Schritt 3 die Verbindungszeit (in Sekunden bis Player lädt) im Detailfeld ein.',
    steps: [
      {
        question_text: 'Öffne die Admin-Stream-Seite (Link) — prüfe ob der Stream-Status „offline" angezeigt wird und die Seite ohne Fehler lädt.',
        expected_result: 'Seite lädt; Stream-Status „offline"; keine Fehlermeldungen.',
        test_function_url: '/admin/stream', test_menu_path: 'Admin-Bereich → Stream-Steuerung', test_role: 'admin',
      },
      {
        question_text: 'Klicke auf der Admin-Stream-Seite (Link) den Start-Button — prüfe ob der Status auf „live" wechselt und ein Stream-Token generiert wird.',
        expected_result: 'Status wechselt auf „live"; Stream-Token sichtbar.',
        test_function_url: '/admin/stream', test_menu_path: 'Admin-Bereich → Stream-Steuerung', test_role: 'admin',
      },
      {
        question_text: 'Öffne das Viewer-Portal (Link) im Testnutzer-Browser während der Stream läuft — prüfe ob der Stream-Player sichtbar ist und keine Verbindungsfehler erscheinen. → Nutzer: zweites Browser-Profil.',
        expected_result: 'Stream-Player sichtbar; Verbindung aufgebaut; kein Fehler im Browser.',
        test_function_url: '/portal/stream', test_menu_path: 'Portal → Stream-Ansicht', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Stream muss laufen (Schritt 2 abgeschlossen).',
      },
      {
        question_text: 'Öffne die Admin-Stream-Seite (Link) — prüfe ob der RTMP-Ingress-Status und die RTMP-URL angezeigt werden.',
        expected_result: 'RTMP-URL sichtbar; Ingress-Status angezeigt (aktiv oder bereit).',
        test_function_url: '/admin/stream', test_menu_path: 'Admin-Bereich → Stream-Steuerung', test_role: 'admin',
      },
      {
        question_text: 'Öffne die Admin-Stream-Seite (Link) → klicke „Aufnahmen" oder scrolle zur Recordings-Liste — prüfe ob vorhandene MP4-Dateien aufgelistet werden oder eine leere Liste ohne Fehler erscheint.',
        expected_result: 'Recordings-Liste lädt; MP4-Dateien sichtbar oder leere Liste ohne Fehler.',
        test_function_url: '/admin/stream', test_menu_path: 'Admin-Bereich → Stream-Steuerung', test_role: 'admin',
      },
      {
        question_text: 'Klicke auf der Admin-Stream-Seite (Link) den Stop-Button — prüfe ob der Status auf „offline" wechselt und das Viewer-Portal „kein Stream" anzeigt.',
        expected_result: 'Status wechselt auf „offline"; Viewer-Portal zeigt „kein Stream aktiv".',
        test_function_url: '/admin/stream', test_menu_path: 'Admin-Bereich → Stream-Steuerung', test_role: 'admin',
      },
      {
        question_text: 'Öffne Monitoring (Link) — prüfe ob der `livekit-server` Pod im Status „Running" ist und kein CrashLoop vorliegt.',
        expected_result: '`livekit-server` Pod im Status „Running"; kein CrashLoop.',
        test_function_url: '/admin/monitoring', test_menu_path: 'Admin-Bereich → Monitoring', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test 12: Projektmanagement',
    description: 'Prüft den vollständigen Lebenszyklus des Projektmanagement-Moduls: Projekt anlegen und einem Client zuordnen, Teilprojekte strukturieren, Aufgaben mit Prioritäten und Statustransitionen verwalten, Zeiterfassung pro Projekt führen, Meetings mit Projekten verknüpfen und das Projekt in die Archiv-Ansicht überführen. Dieser Test verifiziert die Anforderungen FA-20 (Projektstruktur), FA-21 (Aufgabenverwaltung), FA-22 (Zeiterfassung) und FA-23 (Meeting-Verknüpfung). Voraussetzung: Admin-Account aktiv, mindestens ein Client und ein Meeting in der Datenbank vorhanden.',
    instructions: 'Alle Schritte im Admin-Browser (Profil A). Öffne jeweils den Link im Schritt. Die Schritte bauen aufeinander auf — in Reihenfolge abarbeiten. Lege für den Test ein dediziertes Testprojekt an (nicht ein Produktionsprojekt verwenden). Notiere Projekt-ID und Counter-Werte nach jedem Schritt im Detailfeld zur Nachvollziehbarkeit.',
    steps: [
      {
        question_text: 'Öffne Projekte (Link) → klicke „Neues Projekt" → fülle Titel und Client aus → speichere — prüfe ob das Projekt in der Liste erscheint.',
        expected_result: 'Projekt erscheint in der Liste; Pflichtfeld-Validierung serverseitig.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Öffne das neu angelegte Projekt (Link) → wechsle zum Reiter „Teilprojekte" → klicke „Neues Teilprojekt" → trage Titel ein und speichere — prüfe ob das Teilprojekt erscheint.',
        expected_result: 'Teilprojekt erscheint unter dem Reiter „Teilprojekte" des Projekts.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → wechsle zum Reiter „Aufgaben" → klicke „Neue Aufgabe" → fülle Titel und Priorität aus → speichere — prüfe ob die Aufgabe mit Status „Entwurf" erscheint.',
        expected_result: 'Aufgabe erscheint in der Liste; Status „Entwurf"; Aufgaben-Counter aktualisiert.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → klicke auf die Aufgabe → ändere den Status auf „Erledigt" → speichere — prüfe ob der Aufgaben-Counter sofort sinkt.',
        expected_result: 'Status wechselt sofort auf „Erledigt"; offene Aufgaben-Counter sinkt.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → wechsle zum Reiter „Zeiterfassung" → klicke „Zeit buchen" → trage Dauer und Beschreibung ein → speichere — prüfe ob der Gesamtzeit-Counter aktualisiert wird.',
        expected_result: 'Zeiteintrag gespeichert; Gesamtzeit-Counter des Projekts erhöht sich.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → ändere den Projekt-Status auf „Aktiv" → speichere — prüfe ob das Status-Badge aktualisiert wird und das Projekt in der aktiven Filter-Ansicht erscheint.',
        expected_result: 'Status-Badge zeigt „Aktiv"; Projekt erscheint in gefilterten „Aktiv"-Ansicht.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → wechsle zum Reiter „Besprechungen" → klicke „Meeting verknüpfen" → wähle ein vorhandenes Meeting aus — prüfe ob es im Reiter erscheint.',
        expected_result: 'Meeting erscheint im Reiter „Besprechungen" des Projekts.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
      {
        question_text: 'Im Projekt-Detail (Link) → ändere den Status auf „Archiviert" → speichere — prüfe ob das Projekt aus der Standard-Liste verschwindet und in der Archiv-Ansicht sichtbar ist.',
        expected_result: 'Projekt verschwindet aus Standard-Liste; in Archiv-Ansicht sichtbar.',
        test_function_url: '/admin/projekte', test_menu_path: 'Admin-Bereich → Projekte', test_role: 'admin',
      },
    ],
  },
  {
    title: 'System-Test Gesamt: Vollständiger End-to-End-Test aller Module',
    description: 'Konsolidierter Gesamttest aller 12 System-Test-Bereiche: Authentifizierung, Admin-CRM, Kommunikation, Fragebogen, Dokumente, Steuer-Modus, Rechnungserstellung, Buchhaltung, Monitoring, Externe Dienste, LiveKit und Projektmanagement. Dieser Test deckt alle Anforderungen in einem einzigen Durchlauf ab.',
    instructions: 'Führe alle Schritte der Reihe nach aus. Verwende zwei Browser-Profile (Admin + Testnutzer) — der jeweilige Schritt gibt an, welches Profil aktiv sein muss. Schritte mit „→ Nutzer:" erfordern einen Wechsel in das Testnutzer-Profil. Terminale Schritte sind als solche markiert. Trage pro Schritt das Ergebnis und Auffälligkeiten in das Detailfeld ein.',
    steps: [
      // ── ST-1: Authentifizierung & SSO ──────────────────────────────────────
      {
        question_text: '[ST-1: Auth] Öffne die Admin-Oberfläche (Link) — melde dich über den Keycloak-Login-Dialog an und prüfe ob /admin lädt und der Logout-Button im Header sichtbar ist.',
        expected_result: 'Weiterleitung zu /admin nach Keycloak-Authentifizierung; Session-Cookie gesetzt; Logout-Button im Header sichtbar.',
        test_function_url: '/admin', test_role: 'admin',
      },
      {
        question_text: '[ST-1: Auth] Öffne die Keycloak-Kontoverwaltung (Link) — prüfe ob Profildetails, aktive Sitzungen und die Passwort-Änderungsoption zugänglich sind.',
        expected_result: 'Profil-Daten ladbar; Sitzungen-Liste zeigt aktive Sessions; Passwort-Änderung zugänglich.',
        test_function_url: `https://auth.${D}/realms/workspace/account`, test_role: 'admin',
      },
      {
        question_text: '[ST-1: Auth] Öffne das Portal (Link) in einem Browser-Profil ohne aktive Admin-Session — melde den Testnutzer über Keycloak an und prüfe ob Profilname stimmt. → Nutzer: zweites Browser-Profil bedienen.',
        expected_result: 'Login-Flow läuft durch; Weiterleitung zu /portal; Profilname stimmt mit Testnutzer überein.',
        test_function_url: '/portal', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Nutzer informieren, Kontrolle für Login übergeben, danach Ergebnis gemeinsam prüfen.',
      },
      {
        question_text: '[ST-1: Auth] Öffne Nextcloud (Link) während die Testnutzer-Session aktiv ist — automatischer SSO-Login sollte einsetzen und die Dateiansicht laden.',
        expected_result: 'Automatischer Login ohne erneute Eingabe; Dateiansicht lädt vollständig.',
        test_function_url: `https://files.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-1: Auth] Öffne Vaultwarden (Link) mit der aktiven Testnutzer-Session — SSO-Login sollte automatisch den Passwort-Tresor öffnen.',
        expected_result: 'Automatischer Login; Passwort-Tresor wird geladen.',
        test_function_url: `https://vault.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-1: Auth] Öffne DocuSeal (Link) mit der aktiven Testnutzer-Session — SSO-Login sollte automatisch die Dokumentenliste anzeigen.',
        expected_result: 'Automatischer Login; Dokumentenliste sichtbar.',
        test_function_url: `https://sign.${D}`, test_role: 'user',
      },
      // ── ST-2: Admin-Verwaltung & CRM ───────────────────────────────────────
      {
        question_text: '[ST-2: CRM] Öffne das Admin-Dashboard (Link) — prüfe die vier KPI-Karten oben auf der Seite: Clients, offene Bugs, Meetings, Rechnungen.',
        expected_result: 'KPIs (Clients, offene Bugs, Meetings, Rechnungen) laden ohne Fehler und zeigen plausible Werte.',
        test_function_url: '/admin', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne die Clientliste (Link) → klicke „Neuer Client" → fülle alle Pflichtfelder aus und speichere → lade die Seite neu und prüfe ob der Client noch erscheint.',
        expected_result: 'Client erscheint in der Clientliste; Pflichtfelder werden serverseitig validiert; nach Reload weiterhin sichtbar.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Klicke in der Clientliste (Link) auf einen vorhandenen Client — öffne alle Reiter (Stammdaten, Notizen, Fragebögen, Rechnungen) und prüfe auf Ladefehler.',
        expected_result: 'Reiter Stammdaten, Notizen, Fragebögen, Rechnungen ladbar; keine 500er.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne Meetings (Link) → klicke „Neues Meeting" → trage Datum, Titel und Teilnehmer ein und speichere.',
        expected_result: 'Meeting erscheint in der Meetingliste mit korrekten Datums- und Teilnehmerinfos.',
        test_function_url: '/admin/meetings', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne Termine (Link) → klicke „Neuer Termin" → fülle das Formular aus und speichere → prüfe ob der Termin auch im Kalender unter /admin/kalender erscheint.',
        expected_result: 'Termin wird gespeichert und ist in /admin/termine sowie im Kalender sichtbar.',
        test_function_url: '/admin/termine', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne Projekte (Link) → klicke „Neues Projekt" → ordne es über das Client-Feld einem Client zu → prüfe ob das Projekt in der Client-Detailansicht unter Reiter „Projekte" erscheint.',
        expected_result: 'Projekt erscheint in /admin/projekte; Tickets-System-Projekt mit Status „Entwurf" angelegt; Zuordnung zum Client sichtbar.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne den Admin-Kalender (Link) — wechsle zwischen Monats- und Wochenansicht und prüfe ob angelegte Termine und Meetings korrekt visualisiert werden.',
        expected_result: 'Kalender lädt; Termine + Meetings korrekt visualisiert (Monats-/Wochenansicht).',
        test_function_url: '/admin/kalender', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne die Inbox (Link) — klicke das Haken-Symbol oder „Erledigt" neben einem offenen Item und prüfe ob der Inbox-Counter oben sofort sinkt.',
        expected_result: 'Item wechselt den Status sofort; Inbox-Counter aktualisiert sich.',
        test_function_url: '/admin/inbox', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne Einstellungen (Link) — ändere einen beliebigen Wert (z. B. Kontaktdaten), speichere und lade die Seite neu; der Wert sollte erhalten bleiben.',
        expected_result: 'Einstellung wird persistiert; nach Reload korrekt geladen.',
        test_function_url: '/admin/einstellungen', test_role: 'admin',
      },
      {
        question_text: '[ST-2: CRM] Öffne Einstellungen → Branding (Link) — klicke „Logo hochladen", wähle eine Bilddatei und speichere; Logo sollte im Admin-Header und auf der öffentlichen Website erscheinen. → Nutzer: Testdatei bereitstellen.',
        expected_result: 'Logo erscheint im Admin-Header und auf der öffentlichen Website.',
        test_function_url: '/admin/einstellungen/branding', test_role: 'admin',
        agent_notes: 'File-Upload — Nutzer nach einer Testbild-Datei fragen und dann via Browser-Extension hochladen.',
      },
      // ── ST-3: Kommunikation ────────────────────────────────────────────────
      {
        question_text: '[ST-3: Kommunikation] Öffne die Website (Link) als angemeldeter Testnutzer — das Fragebogen-Widget (📋-Symbol rechts unten) sollte sichtbar sein; klicke es an und prüfe ob ausstehende Fragebögen in der Liste erscheinen. → Nutzer: im Testnutzer-Browser ausführen.',
        expected_result: 'Fragebogen-Widget ist für eingeloggte Nutzer sichtbar; Klick öffnet das Panel; Fragebögen werden geladen; „Seite in neuem Tab öffnen"-Links funktionieren.',
        test_function_url: `https://web.${D}`, test_role: 'user',
        agent_notes: 'Schritt im Testnutzer-Browser-Profil. Nutzer Kontrolle übergeben, danach Ergebnis gemeinsam bestätigen.',
      },
      {
        question_text: '[ST-3: Kommunikation] Öffne die Admin-Inbox (Link) — verfasse eine Nachricht an den Testnutzer und sende sie ab.',
        expected_result: 'Antwort gesendet; Admin-Inbox zeigt den Nachrichtenverlauf.',
        test_function_url: '/admin/inbox', test_role: 'admin',
      },
      {
        question_text: '[ST-3: Kommunikation] Wechsle in den Testnutzer-Browser — prüfe ob die Admin-Antwort in den Benachrichtigungen oder der Nutzer-Inbox erscheint (ohne Seitenreload). → Nutzer: Testnutzer-Browser zeigen.',
        expected_result: 'Admin-Antwort ist für den Testnutzer sichtbar; Polling oder Websocket-Push funktioniert.',
        test_function_url: `https://web.${D}`, test_role: 'user',
        agent_notes: 'Schritt im Testnutzer-Browser-Profil. Nutzer Kontrolle übergeben und Ergebnis bestätigen lassen.',
      },
      {
        question_text: '[ST-3: Kommunikation] Öffne Termine (Link) — wähle einen bestehenden Termin aus und klicke „Bestätigung senden"; prüfe anschließend in Mailpit ob die E-Mail korrekt angekommen ist.',
        expected_result: 'Mailpit/Postfach zeigt eingehende Mail mit korrektem Branding und Pflichtangaben (Impressum-Link).',
        test_function_url: '/admin/termine', test_role: 'admin',
      },
      {
        question_text: '[ST-3: Kommunikation] Öffne Newsletter (Link) — klicke „Vorschau" und prüfe ob Header/Footer-Branding und Abmelde-Link korrekt dargestellt werden.',
        expected_result: 'HTML-Vorschau lädt; Header/Footer-Branding und Abmelde-Link sichtbar.',
        test_function_url: '/admin/newsletter', test_role: 'admin',
      },
      // ── ST-4: Fragebogen-System ────────────────────────────────────────────
      {
        question_text: '[ST-4: Fragebogen] Öffne Fragebogen-Verwaltung (Link) → klicke „Neues Template" → trage einen Titel ein, füge mindestens eine Frage hinzu und speichere.',
        expected_result: 'Template wird gespeichert und erscheint in der Template-Liste als Draft.',
        test_function_url: '/admin/fragebogen', test_role: 'admin',
      },
      {
        question_text: '[ST-4: Fragebogen] Klicke im Template auf „Veröffentlichen" — öffne dann einen Client (Link), wechsle zum Reiter „Fragebögen" und klicke „Zuweisen".',
        expected_result: 'Assignment erstellt; Nutzer sieht Fragebogen im Portal-Dashboard; verknüpftes Projekt automatisch unter /admin/projekte angelegt.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: '[ST-4: Fragebogen] Melde dich als Testnutzer im Portal an (Link) — der neue Fragebogen sollte im Dashboard unter „Ausstehende Fragebögen" sichtbar sein; klicke ihn an und beantworte alle Fragen. → Nutzer: zweites Browser-Profil bedienen.',
        expected_result: 'Fragebogen-Status wechselt auf „submitted"; Bestätigungsseite erscheint.',
        test_function_url: '/portal', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Nutzer Kontrolle übergeben bis Fragebogen abgesendet ist.',
      },
      {
        question_text: '[ST-4: Fragebogen] Öffne die Client-Detailansicht (Link) → wechsle zum Reiter „Fragebögen" → wähle den abgegebenen Fragebogen — prüfe ob Antworten, Scoring-Dimensionen und das Coach-Notiz-Feld korrekt dargestellt werden.',
        expected_result: 'Antworten + Scoring-Dimensionen korrekt dargestellt; Coach-Notizen-Feld editierbar.',
        test_function_url: '/admin/clients', test_role: 'admin',
      },
      {
        question_text: '[ST-4: Fragebogen] Öffne Monitoring (Link) — scrolle zum Abschnitt „Test-Results-Panel" und prüfe ob alle System-Test-Templates mit Last-Result/Last-Success-Status sichtbar sind.',
        expected_result: 'Alle 12 System-Test-Templates sichtbar mit Last-Result/Last-Success-Status.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      // ── ST-5: Dokumente & Signatur-System ──────────────────────────────────
      {
        question_text: '[ST-5: Dokumente] Öffne Dokumente (Link) → klicke „Neues Dokument" → schreibe einen Beispiel-Inhalt und speichere → lade die Seite neu und prüfe ob der Inhalt erhalten bleibt.',
        expected_result: 'Dokument wird gespeichert; nach Reload weiterhin lesbar; Versionshistorie sichtbar.',
        test_function_url: '/admin/dokumente', test_role: 'admin',
      },
      {
        question_text: '[ST-5: Dokumente] Öffne Inhalte (Link) → klicke auf einen Startseiten-Block → ändere den Text und speichere → öffne die öffentliche Startseite und prüfe ob die Änderung sichtbar ist.',
        expected_result: 'Änderung wird persistiert und auf der öffentlichen Startseite sichtbar.',
        test_function_url: '/admin/inhalte', test_role: 'admin',
      },
      {
        question_text: '[ST-5: Dokumente] Öffne Dokumente (Link) → wähle ein Dokument aus → klicke „Zur Unterschrift senden" → wähle den Testnutzer als Empfänger.',
        expected_result: 'Nutzer erhält Mail/Notification mit Signatur-Link (URL enthält /portal/sign/[id]).',
        test_function_url: '/admin/dokumente', test_role: 'admin',
      },
      {
        question_text: '[ST-5: Dokumente] Öffne den Signatur-Link (/portal/sign/[id]) als Testnutzer — unterzeichne das Dokument auf dem Canvas per Maus/Stift und klicke „Unterschrift bestätigen". → Nutzer: Testnutzer-Browser + tatsächliche Signatur bestätigen.',
        expected_result: 'Signatur wird gespeichert; Dokument-Status wechselt auf „completed". PDF-Download-Link wird angezeigt.',
        test_role: 'user',
        agent_notes: 'Rechtsverbindliche Signatur — Nutzer muss bewusst bestätigen. Kontrolle für diesen Schritt übergeben.',
      },
      {
        question_text: '[ST-5: Dokumente] Öffne Dokumente (Link) als Admin — finde das unterzeichnete Dokument, prüfe auf Status „completed" und lade das signierte PDF herunter.',
        expected_result: 'Dokument-Status = „completed"; signiertes PDF wird heruntergeladen.',
        test_function_url: '/admin/dokumente', test_role: 'admin',
      },
      // ── ST-6: Steuer-Modus & § 19 UStG ────────────────────────────────────
      {
        question_text: '[ST-6: Steuer] Öffne Rechnungs-Einstellungen (Link) → suche den Dropdown „Steuer-Modus" und wähle „Kleinunternehmer" → speichere [B-01].',
        expected_result: 'site_settings.tax_mode = kleinunternehmer; Hinweis „§ 19 UStG" erscheint auf der nächsten Rechnung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-01'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne Rechnungs-Einstellungen (Link) → wechsle den Steuer-Modus auf „Regelbesteuerung" → speichere [B-01/B-05].',
        expected_result: 'Wechsel persistiert; nächste Rechnung wird mit USt (7 %/19 %) ausgewiesen; Rechnungsvorlage schaltet automatisch auf Regelbesteuerer-Template (§ 14 UStG).',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-01', 'B-05'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne das Steuer-Dashboard (Link) — prüfe das „Jahresumsatz"-Widget: der angezeigte Betrag muss der Summe aller „paid"-Rechnungen im laufenden Jahr entsprechen [B-02].',
        expected_result: 'Kumulierter Netto-Umsatz des laufenden Jahres entspricht der Summe der „paid"-Rechnungen.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-02'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne das Steuer-Dashboard (Link) — erhöhe den Testumsatz auf ≥ 80 % von 25.000 € und prüfe ob ein gelber Warn-Alert im TaxMonitorWidget erscheint [B-03]. → Nutzer: Testwert via DB oder Test-Modus setzen.',
        expected_result: 'Gelber Warn-Alert sichtbar im TaxMonitorWidget; Hinweis auf §19-Grenze.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-03'],
        agent_notes: 'Testumsatz muss über DB oder Test-Modus gesetzt werden. Nutzer fragen ob Testdaten vorbereitet sind, sonst Schritt überspringen.',
      },
      {
        question_text: '[ST-6: Steuer] Öffne das Steuer-Dashboard (Link) — überschreite die 25.000 €-Grenze und prüfe ob ein roter Alert und der automatische Switch auf Regelbesteuerung ausgelöst wird [B-03/B-04]. → Nutzer: Testwert setzen.',
        expected_result: 'Roter Alert; Auto-Switch auf Regelbesteuerung; nächste Rechnung mit USt; Switch im Audit-Log.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-03', 'B-04'],
        agent_notes: 'Testumsatz > 25.000 € erforderlich. Nutzer koordinieren; danach UI-Reaktion im Browser prüfen.',
      },
      {
        question_text: '[ST-6: Steuer] Öffne das Steuer-Dashboard (Link) — überschreite die 100.000 €-Grenze und prüfe ob ein roter „Sofort Regelbesteuerung"-Alert erscheint [B-06]. → Nutzer: Testwert setzen.',
        expected_result: 'Roter „sofort Regelbesteuerung"-Alert; Pflichtwechsel unabhängig vom Vorjahresumsatz.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-06'],
        agent_notes: 'Testumsatz > 100.000 € erforderlich. Nutzer koordinieren.',
      },
      {
        question_text: '[ST-6: Steuer] Öffne das Steuer-Dashboard (Link) → scrolle zum Abschnitt „Audit-Log" — prüfe ob der Steuermodus-Wechsel mit Datum, Rechnungsnummer und Begründung eingetragen ist [B-07].',
        expected_result: 'Eintrag mit Datum, auslösender Rechnungsnummer und Begründung sichtbar (revisionssicher).',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-07'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne UStVA/ELSTER (Link) → klicke „CSV exportieren" — prüfe ob die Datei Nettoumsätze nach Steuersatz (0 %/7 %/19 %) und USt-Summen enthält [B-08].',
        expected_result: 'CSV enthält Nettoumsätze 0 %/7 %/19 % und USt-Summen je Steuersatz; Werte stimmen mit Buchungen.',
        test_function_url: '/admin/billing/elster', test_role: 'admin', req_ids: ['B-08'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne UStVA/ELSTER (Link) → klicke „ELSTER-Vorschau" und prüfe ob die Pflichtfelder (Kennziffern 81/86/35) korrekt befüllt sind [B-08].',
        expected_result: 'Vorschau-Layout mit Pflichtfeldern (Kennziffern 81/86/35) korrekt befüllt.',
        test_function_url: '/admin/billing/elster', test_role: 'admin', req_ids: ['B-08'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne Rechnungs-Einstellungen (Link) → aktiviere den Toggle „Ist-Versteuerung" und prüfe ob die UStVA-Logik auf Zahlungseingangsdatum umschaltet [B-09].',
        expected_result: 'UStVA bezieht USt erst bei Zahlungseingang ein, nicht bei Rechnungsstellung.',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-09'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne das Steuer-Dashboard (Link) → scrolle zum Abschnitt „Fristen" — prüfe ob die UStVA-Quartalsfristen (10. März/Juni/September/Dezember) und Jahres-/GewSt-Frist angezeigt werden [B-10].',
        expected_result: 'Termine 10. März/Juni/September/Dezember sowie Jahres-/GewSt-Frist sichtbar.',
        test_function_url: '/admin/steuer', test_role: 'admin', req_ids: ['B-10'],
      },
      {
        question_text: '[ST-6: Steuer] Öffne Rechnungs-Einstellungen (Link) → versuche auf Regelbesteuerung zu wechseln ohne eine USt-IdNr. einzutragen — Speichern sollte fehlschlagen [B-11].',
        expected_result: 'Speichern ohne USt-IdNr. schlägt fehl; Format DE\\d{9} wird validiert (EU-VIES-konform).',
        test_function_url: '/admin/einstellungen/rechnungen', test_role: 'admin', req_ids: ['B-11'],
      },
      // ── ST-7: Rechnungserstellung, ZUGFeRD & Archivierung ──────────────────
      {
        question_text: '[ST-7: Rechnungen] Öffne die Rechnungsliste (Link) — prüfe im Browser-Netzwerk-Tab ob die Daten aus PostgreSQL geladen werden (kein Stripe-API-Call sichtbar) [A-01].',
        expected_result: 'Daten werden aus PostgreSQL geladen; im Network-Tab kein Stripe-API-Call; Liste vollständig.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-01'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne die Rechnungsliste (Link) → klicke „Neue Rechnung" → wähle Steuer-Modus „Kleinunternehmer (§ 19 UStG)" → fülle alle Pflichtfelder aus und speichere [A-02/A-04].',
        expected_result: 'Pflichtangaben (Anschrift Leistender/Empfänger, Steuernummer, Datum, fortlaufende Nr. RE-YYYY-NNNN, Leistungsbeschreibung, Entgelt) + § 19-Hinweis vorhanden.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-02', 'A-04'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne die Rechnungsliste (Link) → klicke „Neue Rechnung" → wähle Steuer-Modus „Regelbesteuerung" → fülle alle Pflichtfelder inkl. USt-IdNr. aus [A-03].',
        expected_result: 'Pflichtangaben inkl. USt-IdNr., Nettobetrag, Steuersatz (7 %/19 %), Steuerbetrag, Bruttobetrag, Leistungszeitraum.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-03'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne die Rechnungsliste (Link) — versuche eine Rechnungsnummer manuell zu ändern oder eine finalisierte Rechnung zu löschen; beide Aktionen sollten abgeblockt werden [A-04].',
        expected_result: 'Versuch, Nummer manuell zu ändern oder eine Rechnung zu löschen, schlägt fehl bzw. erzeugt nur eine Stornorechnung.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-04'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine bestehende Rechnung → klicke „PDF ansehen/drucken" (Link) — prüfe im PDF ob IBAN, BIC, Bankname und Verwendungszweck (= Rechnungsnummer) abgedruckt sind [A-05].',
        expected_result: 'IBAN, BIC, Bankname, Verwendungszweck = Rechnungsnummer auf jeder PDF.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-05'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne einen Kunden in der Billing-Kundenliste → scrolle zum Abschnitt „SEPA-Mandat" → lege ein Mandat mit IBAN, BIC, Mandatsreferenz und Unterschriftsdatum an [A-06].',
        expected_result: 'IBAN, BIC, Mandatsreferenz, Datum der Unterschrift, Gläubiger-ID gespeichert und an Rechnungen verknüpfbar.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-06'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine Rechnung → klicke „PDF herunterladen" — prüfe im Browser-Netzwerk-Tab ob kein externer API-Call ausgelöst wurde und ob die PDF valide ist [A-07].',
        expected_result: 'Download liefert valide PDF; kein externer API-Call im Network-Tab; pdf_path im DB-Eintrag gesetzt (GoBD-Archiv).',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-07'],
      },
      {
        question_text: '[ST-7: Rechnungen] Lade die PDF einer finalisierten Rechnung herunter — prüfe via Terminal ob factur-x.xml eingebettet ist [A-08]. → Nutzer: `qpdf --show-attachments <datei.pdf>` oder `pdftk <datei.pdf> dump_data_fields` ausführen.',
        expected_result: 'qpdf/pdftk zeigt eingebettetes factur-x.xml mit Profil MINIMUM (E-Rechnungspflicht B2B 2025).',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-08'],
        agent_notes: 'Terminal-Schritt — Browser kann PDF nicht lokal prüfen. PDF herunterladen (Browser-Extension), dann Nutzer bitten: `qpdf --show-attachments <pfad>` auszuführen und Ausgabe zu zeigen.',
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine offene Rechnung → klicke „Finalisieren/Sperren" — prüfe ob alle Bearbeiten-Buttons deaktiviert sind und API-Bearbeitungsversuche 403 liefern [A-09].',
        expected_result: 'locked = true; Bearbeiten-Buttons disabled; API-Versuche zu editieren liefern 403/Conflict.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-09'],
      },
      {
        question_text: '[ST-7: Rechnungen] Prüfe für eine finalisierte Rechnung ob retain_until = Rechnungsdatum + 10 Jahre gesetzt ist [A-10]. → Nutzer: `SELECT retain_until FROM billing_invoices WHERE id = \'<id>\';` ausführen.',
        expected_result: 'DB-Feld retain_until = Rechnungsdatum + 10 Jahre (§ 147 AO).',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-10'],
        agent_notes: 'DB-Abfrage erforderlich. Rechnungs-ID aus der UI entnehmen und Nutzer bitten: `task workspace:psql -- website` → `SELECT retain_until FROM billing_invoices WHERE id = \'<id>\';`',
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine finalisierte Rechnung → klicke „Stornieren" — prüfe ob eine neue Rechnung mit negativem Betrag angelegt wird und auf das Original verweist [A-11].',
        expected_result: 'Neue Rechnung mit negativem Betrag; cancels_invoice_id verweist auf Original; § 14c UStG-Hinweis.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-11'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine Rechnung → klicke „Per E-Mail versenden" — prüfe in Mailpit ob die Mail mit PDF-Anhang und ZUGFeRD-XML angekommen ist [A-12].',
        expected_result: 'E-Mail mit PDF-Anhang + ZUGFeRD-XML gesendet; Mailpit/Empfangs-Postfach zeigt Mail.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-12'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine Rechnung → klicke die Status-Buttons der Reihe nach: „Freigeben" (Draft→Open), dann „Zahlung erfassen" (Open→Paid) — prüfe im Buchungsjournal ob jede Transition gebucht wurde [A-13].',
        expected_result: 'Statuswechsel sichtbar; jede Transition triggert eine Buchung im Buchungsjournal.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-13'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine offene Rechnung → klicke „Zahlungseingang erfassen" → trage Datum, Betrag und Zahlungsreferenz ein — prüfe ob Status auf „paid" wechselt und die Einnahme im Journal erscheint [A-14].',
        expected_result: 'Datum, Betrag, Zahlungsreferenz gespeichert; Status auf „paid"; Einnahme im Journal gebucht.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-14'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne eine überfällige Rechnung → klicke „Mahnung senden" — prüfe ob Mahnstufe inkrementiert und die Mahnmail versendet wurde [A-14].',
        expected_result: 'Mahnstufe inkrementiert; Mail mit Mahngebühr versendet; Buchung in Forderungs-Journal.',
        test_function_url: '/admin/rechnungen', test_role: 'admin', req_ids: ['A-14'],
      },
      {
        question_text: '[ST-7: Rechnungen] Öffne Angebote (Link) → klicke „Neues Angebot" → speichere es → klicke „In Rechnung umwandeln" und prüfe ob die Rechnung auf das Angebot verweist [A-15].',
        expected_result: 'Angebot mit Nummer AN-YYYY-NNNN; bei Konvertierung referenziert die Rechnung das Angebot.',
        test_function_url: '/admin/angebote', test_role: 'admin', req_ids: ['A-15'],
      },
      // ── ST-8: Buchhaltung — EÜR, Belege & Steuerauswertungen ──────────────
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) — prüfe ob das Buchungsjournal Einträge mit Datum, Betrag, Kategorie und Belegnummer für Einnahmen und Ausgaben zeigt [C-01].',
        expected_result: 'Liste mit Datum, Betrag, Kategorie, Belegnummer für Betriebseinnahmen und Betriebsausgaben (§ 4 Abs. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-01'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) — sende eine Rechnung ab und prüfe ob innerhalb weniger Sekunden eine „Forderung"-Buchung im Journal erscheint [C-02].',
        expected_result: 'Buchung mit Kategorie „Forderung" zeitnah (≤ 10 Tage GoBD) im Journal sichtbar.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-02'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) — erfasse einen Zahlungseingang für eine offene Rechnung und prüfe ob eine „Betriebseinnahme"-Buchung erscheint und die Forderung ausgeglichen wird [C-02].',
        expected_result: 'Buchung „Betriebseinnahme" mit Verweis auf Rechnung; Forderung wird ausgeglichen.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-02'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) — erfasse eine Eingangsrechnung mit Vorsteuer und prüfe ob Vorsteuer als eigene Buchungskategorie getrennt vom Nettobetrag gebucht wird [C-03].',
        expected_result: 'Bei Eingangsrechnung wird Vorsteuer separat vom Nettobetrag gebucht (§ 4 Abs. 3 S. 3 EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-03'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → klicke „USt-Zahllast buchen" → trage den Quartalsbetrag ein — prüfe ob die Buchung mit Kategorie „USt-Zahllast" erscheint [C-04].',
        expected_result: 'Quartalszahlung an Finanzamt als Ausgabe-Buchung mit Kategorie „USt-Zahllast"; Erstattungen als Einnahme.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-04'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → scrolle zum Abschnitt „EÜR" → lade PDF und CSV herunter — prüfe ob Einnahmen, Ausgaben und Gewinn mit dem Journal übereinstimmen [C-05].',
        expected_result: 'Beide Exports zeigen Betriebseinnahmen, Ausgaben, Gewinn; Summen stimmen mit Journal überein (Anlage EÜR).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-05'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → klicke „Anlagegut erfassen" → trage AK > 1.000 €, Anschaffungsdatum, AfA-Laufzeit und Vorsteuer ein — prüfe ob § 15a-Berichtigungsbetrag berechnet wird [C-06/C-07].',
        expected_result: 'AK, Anschaffungsdatum, AfA-Laufzeit (Monate), Vorsteuer gespeichert; Berichtigungsbetrag § 15a UStG bei Modus-Wechsel automatisch berechnet (Bagatellgrenze § 44 UStDV).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-06', 'C-07'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) — wechsle den Steuer-Modus von Klein- auf Regelbesteuerung und prüfe ob die Vorsteuer auf Warenbestände als Forderung gegen das FA berechnet wird [C-08].',
        expected_result: 'Beim Switch Klein → Regel: volle Vorsteuer auf Bestände als Forderung gegen das FA berechnet (§ 15a Abs. 7).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-08'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → klicke „GWG erfassen" → trage einen Nettobetrag ≤ 800 € ein — prüfe ob Sofortabschreibung angesetzt wird [C-09].',
        expected_result: 'Sofortabschreibung; Sammelposten-Logik für 250–1.000 € über 5 Jahre korrekt (§ 6 Abs. 2/2a EStG).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-09'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → wähle ein Anlagegut aus → aktiviere „Sonderabschreibung § 7g EStG" — prüfe ob 40 % Sonder-AfA angesetzt werden [C-10].',
        expected_result: '40 %-Sonder-AfA bei Gewinn ≤ 200.000 € korrekt angesetzt.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-10'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → scrolle zum „Gewerbesteuer-Kalkulator" → trage einen Gewerbeertrag ein und prüfe ob die Steuerlast korrekt berechnet wird (Hebesatz Lübbecke 417 %) [C-11].',
        expected_result: 'Eingabe Gewerbeertrag → Hinzurechnungen/Kürzungen → Freibetrag 24.500 € → Messbetrag × 3,5 % × Hebesatz Lübbecke 417 % → korrekte Steuerlast.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-11'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → scrolle zum „ESt-Vorauszahlungsrechner" → trage einen Schätzgewinn ein und prüfe ob Quartalsraten korrekt berechnet werden [C-12].',
        expected_result: 'Schätzgewinn → zvE nach GFB 12.096 € (2025) → ESt-Betrag → Quartalsraten korrekt berechnet.',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-12'],
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne Buchhaltung (Link) → wähle eine Buchung aus → klicke „Beleg anhängen" → lade eine PDF oder ein Bild hoch — prüfe ob der Beleg dauerhaft mit der Buchung verknüpft ist [C-13]. → Nutzer: Testdatei bereitstellen.',
        expected_result: 'PDF/Bild-Upload erfolgreich; Beleg unveränderbar mit Buchung verknüpft (GoBD Rn. 85–96).',
        test_function_url: '/admin/buchhaltung', test_role: 'admin', req_ids: ['C-13'],
        agent_notes: 'File-Upload — Nutzer nach einer Testdatei (PDF oder Bild) fragen und dann via Browser-Extension hochladen.',
      },
      {
        question_text: '[ST-8: Buchhaltung] Öffne die Rechnungsliste (Link) → klicke „DATEV-Export" — öffne die CSV und prüfe ob Konten und Buchungsdatum im DATEV-Format vorliegen.',
        expected_result: 'CSV im DATEV-Format mit korrekten Konten und Buchungsdatum; importierbar in DATEV-Tool.',
        test_function_url: '/admin/rechnungen', test_role: 'admin',
      },
      // ── ST-9: Monitoring & Bug-Tracking ───────────────────────────────────
      {
        question_text: '[ST-9: Monitoring] Öffne Monitoring (Link) — prüfe die Pod-Statusliste: alle Pods sollten „Running" oder „Healthy" anzeigen; keine dauerhaften CrashLoops.',
        expected_result: 'Alle Pods zeigen „Running" oder „Healthy"; keine dauerhaften CrashLoops.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: '[ST-9: Monitoring] Öffne Monitoring (Link) → wähle ein Deployment aus → klicke „Rolling Restart" — prüfe ob der Pod neu startet und wieder in den „Ready"-Zustand kommt.',
        expected_result: 'Restart-Trigger wird bestätigt; Pod kommt wieder ready.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: '[ST-9: Monitoring] Öffne Monitoring (Link) → klicke „Bug-Ticket erstellen" → fülle Titel und Beschreibung aus — prüfe ob das Ticket unter /admin/bugs mit dem Format Txxxxxx erscheint.',
        expected_result: 'Ticket mit Format Txxxxxx wird angelegt und unter /admin/bugs sichtbar.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      {
        question_text: '[ST-9: Monitoring] Öffne Bug-Tickets (Link) → wähle ein offenes Ticket → klicke „Auflösen" → trage eine Auflösungsnotiz ein — prüfe ob der Status auf „resolved" wechselt.',
        expected_result: 'Status wechselt auf „resolved"; Auflösungsnotiz wird gespeichert.',
        test_function_url: '/admin/bugs', test_role: 'admin',
      },
      {
        question_text: '[ST-9: Monitoring] Öffne Monitoring (Link) → scrolle zum „Test-Results-Panel" — prüfe ob alle System-Test-Templates mit last_result und last_success_at sichtbar sind und ein Drilldown auf Question-Level möglich ist.',
        expected_result: 'Alle 12 Templates sichtbar mit last_result/last_success_at; Drilldown auf Question-Level möglich.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      // ── ST-10: Externe Dienste & öffentliche Website ───────────────────────
      {
        question_text: '[ST-10: Extern] Öffne Nextcloud (Link) — klicke den Upload-Button (Pfeil nach oben) in der Dateiliste und wähle eine Testdatei aus; prüfe ob die Datei in der Liste erscheint.',
        expected_result: 'Datei erscheint in der Dateiliste; Fortschrittsbalken läuft durch.',
        test_function_url: `https://files.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne den Nextcloud-Kalender (Link) — wechsle zwischen Monats- und Wochenansicht und prüfe ob die App ohne Fehler lädt.',
        expected_result: 'Monats-/Wochenansicht lädt ohne Fehler.',
        test_function_url: `https://files.${D}/apps/calendar`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne Nextcloud-Kontakte (Link) — prüfe ob die Kontakte-App öffnet und eine Kontaktliste angezeigt wird.',
        expected_result: 'Kontakte-App öffnet; Kontaktliste sichtbar.',
        test_function_url: `https://files.${D}/apps/contacts`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne Nextcloud Talk (Link) → betrete einen Raum → aktiviere Audio/Video über die Schaltflächen unten — im Browser-Berechtigungsdialog „Zulassen" klicken; prüfe ob das lokale Video im Raum erscheint.',
        expected_result: 'Signaling-Verbindung hergestellt; lokales Video erscheint im Raum.',
        test_function_url: `https://files.${D}/apps/talk`, test_role: 'user',
        agent_notes: 'Browser fragt nach Kamera/Mikrofon — im Berechtigungsdialog „Zulassen" klicken. Kein Nutzer-Handoff nötig, wenn die Extension Berechtigungsdialoge sieht.',
      },
      {
        question_text: '[ST-10: Extern] Öffne Nextcloud Whiteboard (Link) → zeichne etwas → klicke Speichern — lade die Seite neu und prüfe ob die Zeichnung erhalten bleibt.',
        expected_result: 'Whiteboard-App lädt; Speichern/Laden funktioniert.',
        test_function_url: `https://files.${D}/apps/whiteboard`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne Nextcloud (Link) → wähle eine Office-Datei (DOCX, XLSX oder ODS) aus → klicke darauf — Collabora sollte den Editor inline öffnen; mache eine Änderung und speichere.',
        expected_result: 'Editor öffnet inline; Änderungen werden gespeichert.',
        test_function_url: `https://files.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne Vaultwarden (Link) → klicke „Neues Element" (+ Symbol) → wähle „Login" → fülle Name, Benutzername und Passwort aus und speichere — prüfe ob der Eintrag abrufbar ist.',
        expected_result: 'Eintrag in Tresorübersicht sichtbar; Passwort abrufbar.',
        test_function_url: `https://vault.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne die öffentliche Startseite (Link) — prüfe im Browser-Netzwerk-Tab ob alle Sektionen und Bilder ohne 404-Fehler laden.',
        expected_result: 'Sektionen + Bilder laden; keine 404er im Network-Tab.',
        test_function_url: `https://web.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne die Startseite (Link) → scrolle zum Kontaktformular → fülle alle Felder aus und klicke „Senden" — prüfe ob eine Bestätigung erscheint und der Eintrag in /admin/inbox sichtbar ist.',
        expected_result: 'Validierung serverseitig; Bestätigung erscheint; Admin-Inbox zeigt den Eintrag.',
        test_function_url: `https://web.${D}`, test_role: 'user',
      },
      {
        question_text: '[ST-10: Extern] Öffne Brett / Systembrett (Link) — prüfe ob das 3D-Board lädt, du Elemente verschieben kannst und Speichern funktioniert.',
        expected_result: '3D-Board lädt; Demo-Konstellation manipulierbar; Speichern funktioniert.',
        test_function_url: `https://brett.${D}`, test_role: 'user',
      },
      // ── ST-11: LiveKit & Streaming ─────────────────────────────────────────
      {
        question_text: '[ST-11: LiveKit] Öffne die Admin-Stream-Seite (Link) — prüfe ob der Stream-Status „offline" angezeigt wird und die Seite ohne Fehler lädt.',
        expected_result: 'Seite lädt; Stream-Status „offline"; keine Fehlermeldungen.',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: '[ST-11: LiveKit] Klicke auf der Admin-Stream-Seite (Link) den Start-Button — prüfe ob der Status auf „live" wechselt und ein Stream-Token generiert wird.',
        expected_result: 'Status wechselt auf „live"; Stream-Token sichtbar.',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: '[ST-11: LiveKit] Öffne das Viewer-Portal (Link) im Testnutzer-Browser während der Stream läuft — prüfe ob der Stream-Player sichtbar ist und keine Verbindungsfehler erscheinen. → Nutzer: zweites Browser-Profil.',
        expected_result: 'Stream-Player sichtbar; Verbindung aufgebaut; kein Fehler im Browser.',
        test_function_url: '/portal/stream', test_role: 'user',
        agent_notes: 'Zweites Browser-Profil (Testnutzer) erforderlich. Stream muss laufen (vorheriger Schritt abgeschlossen).',
      },
      {
        question_text: '[ST-11: LiveKit] Öffne die Admin-Stream-Seite (Link) — prüfe ob der RTMP-Ingress-Status und die RTMP-URL angezeigt werden.',
        expected_result: 'RTMP-URL sichtbar; Ingress-Status angezeigt (aktiv oder bereit).',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: '[ST-11: LiveKit] Öffne die Admin-Stream-Seite (Link) → klicke „Aufnahmen" oder scrolle zur Recordings-Liste — prüfe ob vorhandene MP4-Dateien aufgelistet werden oder eine leere Liste ohne Fehler erscheint.',
        expected_result: 'Recordings-Liste lädt; MP4-Dateien sichtbar oder leere Liste ohne Fehler.',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: '[ST-11: LiveKit] Klicke auf der Admin-Stream-Seite (Link) den Stop-Button — prüfe ob der Status auf „offline" wechselt und das Viewer-Portal „kein Stream" anzeigt.',
        expected_result: 'Status wechselt auf „offline"; Viewer-Portal zeigt „kein Stream aktiv".',
        test_function_url: '/admin/stream', test_role: 'admin',
      },
      {
        question_text: '[ST-11: LiveKit] Öffne Monitoring (Link) — prüfe ob der `livekit-server` Pod im Status „Running" ist und kein CrashLoop vorliegt.',
        expected_result: '`livekit-server` Pod im Status „Running"; kein CrashLoop.',
        test_function_url: '/admin/monitoring', test_role: 'admin',
      },
      // ── ST-12: Projektmanagement ───────────────────────────────────────────
      {
        question_text: '[ST-12: Projekte] Öffne Projekte (Link) → klicke „Neues Projekt" → fülle Titel und Client aus → speichere — prüfe ob das Projekt in der Liste erscheint.',
        expected_result: 'Projekt erscheint in der Liste; Pflichtfeld-Validierung serverseitig.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Öffne das neu angelegte Projekt (Link) → wechsle zum Reiter „Teilprojekte" → klicke „Neues Teilprojekt" → trage Titel ein und speichere — prüfe ob das Teilprojekt erscheint.',
        expected_result: 'Teilprojekt erscheint unter dem Reiter „Teilprojekte" des Projekts.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Im Projekt-Detail (Link) → wechsle zum Reiter „Aufgaben" → klicke „Neue Aufgabe" → fülle Titel und Priorität aus → speichere — prüfe ob die Aufgabe mit Status „Entwurf" erscheint.',
        expected_result: 'Aufgabe erscheint in der Liste; Status „Entwurf"; Aufgaben-Counter aktualisiert.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Im Projekt-Detail (Link) → klicke auf die Aufgabe → ändere den Status auf „Erledigt" → speichere — prüfe ob der Aufgaben-Counter sofort sinkt.',
        expected_result: 'Status wechselt sofort auf „Erledigt"; offene Aufgaben-Counter sinkt.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Im Projekt-Detail (Link) → wechsle zum Reiter „Zeiterfassung" → klicke „Zeit buchen" → trage Dauer und Beschreibung ein → speichere — prüfe ob der Gesamtzeit-Counter aktualisiert wird.',
        expected_result: 'Zeiteintrag gespeichert; Gesamtzeit-Counter des Projekts erhöht sich.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Im Projekt-Detail (Link) → ändere den Projekt-Status auf „Aktiv" → speichere — prüfe ob das Status-Badge aktualisiert wird und das Projekt in der aktiven Filter-Ansicht erscheint.',
        expected_result: 'Status-Badge zeigt „Aktiv"; Projekt erscheint in gefilterten „Aktiv"-Ansicht.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Im Projekt-Detail (Link) → wechsle zum Reiter „Besprechungen" → klicke „Meeting verknüpfen" → wähle ein vorhandenes Meeting aus — prüfe ob es im Reiter erscheint.',
        expected_result: 'Meeting erscheint im Reiter „Besprechungen" des Projekts.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
      {
        question_text: '[ST-12: Projekte] Im Projekt-Detail (Link) → ändere den Status auf „Archiviert" → speichere — prüfe ob das Projekt aus der Standard-Liste verschwindet und in der Archiv-Ansicht sichtbar ist.',
        expected_result: 'Projekt verschwindet aus Standard-Liste; in Archiv-Ansicht sichtbar.',
        test_function_url: '/admin/projekte', test_role: 'admin',
      },
    ],
  },
];
