-- ═══════════════════════════════════════════════════════════════════
-- update-descriptions.sql
-- Aktualisiert Beschreibungen, Erfüllungskriterien und Testfälle
-- für alle Anforderungen in der Tracking-Datenbank.
-- ═══════════════════════════════════════════════════════════════════

-- ─── AK: Abnahmekriterien ─────────────────────────────────────────

UPDATE requirements SET
  description = 'Die Marktanalyse (Lieferobjekt L-02) muss einen adressierbaren Markt für self-hosted Kommunikationslösungen in Deutschland nachweisen. Der Nachweis umfasst eine quantifizierte Marktgröße aufgeschlüsselt nach TAM, SAM und SOM, die Identifikation konkreter Zielgruppensegmente mit dokumentiertem Bedarf sowie eine Wettbewerberanalyse, die eine klare Positionierungslücke aufzeigt. Die Abnahme erfolgt durch den Gutachter nach Sichtung des vollständigen Marktanalysedokuments.',
  acceptance_criteria = '1) Die Marktanalyse enthält mindestens fünf namentlich benannte Wettbewerber (z. B. Slack, Microsoft Teams, Zoom, Rocket.Chat, Nextcloud Talk) mit Feature- und Preisvergleich.
2) Die Marktgröße ist quantifiziert und mit mindestens einer zitierfähigen Quelle belegt (z. B. Statistisches Bundesamt, Bitkom-Studien).
3) Die DSGVO-Problematik der analysierten Wettbewerber ist anhand konkreter Beispiele dokumentiert (z. B. US-Serverstandorte, CLOUD Act).
4) Die Relevanz der Zielgruppe (deutsche KMU, Remote-Teams, öffentliche Einrichtungen) ist mit nachvollziehbarer Argumentation begründet.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch den Gutachter anhand des abgegebenen Marktanalyse-Dokuments (Lieferobjekt L-02).'
WHERE id = 'AK-01';

UPDATE requirements SET
  description = 'Es müssen mindestens drei klar formulierte und belegte Alleinstellungsmerkmale (USPs) gegenüber bestehenden Lösungen wie Slack, Microsoft Teams und Zoom dokumentiert werden. Beispiele sind vollständige Datensouveränität durch ausschließlich lokale Datenhaltung in Deutschland, Zero-Vendor-Lock-in durch den Einsatz von ausschließlich Open-Source-Software ohne Lizenzgebühren sowie ein integriertes All-in-One-Paket bestehend aus Chat, Videokonferenz und Dateiablage ohne Cloud-Abhängigkeit. Jeder USP muss technisch und wirtschaftlich begründet sowie direkt gegenüber den genannten Wettbewerbern abgegrenzt sein.',
  acceptance_criteria = '1) Es sind mindestens drei Alleinstellungsmerkmale in einer USP-Tabelle dokumentiert.
2) Jeder USP ist direkt gegenüber Slack, Microsoft Teams und Zoom abgegrenzt, sodass der Unterschied konkret erkennbar ist.
3) Jeder USP ist sowohl technisch als auch wirtschaftlich begründet (z. B. keine Lizenzkosten, keine Datenübermittlung in Drittländer).
4) Die USP-Tabelle ist im Lastenheft und im Endbericht enthalten und wird in der Abschlusspräsentation explizit benannt.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch Sichtung der USP-Tabelle im Lastenheft sowie durch Betreuer-Feedback zur Überzeugungskraft der Alleinstellungsmerkmale.'
WHERE id = 'AK-02';

UPDATE requirements SET
  description = 'Die technische Umsetzbarkeit des Projekts muss durch eine vollständige Systemarchitektur-Dokumentation (Lieferobjekt L-05) und einen lauffähigen Prototyp (Lieferobjekt L-03) nachgewiesen werden. Alle eingesetzten Technologien müssen einen produktionsreifen Reifegrad aufweisen und die Technologiewahl muss gegenüber Alternativen begründet sein. Der Skalierungsnachweis erfolgt durch dokumentierte Testergebnisse mit mindestens zehn simultanen Nutzern ohne Fehler. Die Abnahme erfolgt nach einer Live-Demo und einer Architekturbesprechung mit dem Betreuer.',
  acceptance_criteria = '1) Alle eingesetzten Technologien (Mattermost, Nextcloud (Talk), Keycloak, PostgreSQL, Traefik) sind produktionsreif und als stabile Releases verfügbar.
2) Eine vollständige Architektur-Dokumentation mit Komponenten- und Deployment-Diagramm liegt im Repository vor.
3) Der Prototyp ist lauffähig und demonstriert die technische Umsetzbarkeit aller Kernfunktionen (FA-01 bis FA-08).
4) Es werden keine experimentellen, Alpha- oder Beta-Abhängigkeiten eingesetzt; alle Container-Images verwenden stabile Release-Tags.',
  test_cases = 'Automatisiert in tests/local/AK-03.sh. Der Test prüft: (T1) Ob alle Pods im k3d-Cluster im Status Running sind, (T2) ob alle Container-Images stabile Release-Tags verwenden und kein Image das Tag :latest nutzt (Ausnahme: curlimages). Der Testrunner (tests/runner.sh) führt die Tests aus und übergibt die Ergebnisse an scripts/tracking/ingest-results.sh, welches sie in die Tabellen test_runs und test_results der Tracking-Datenbank schreibt.'
WHERE id = 'AK-03';

UPDATE requirements SET
  description = 'Der Prototyp muss vollständig im k3d-Cluster deployed und über HTTPS erreichbar sein. Alle eingesetzten Komponenten müssen Open-Source-Software sein; proprietäre Abhängigkeiten von Microsoft, Google Cloud, AWS oder Zoom sind ausgeschlossen und müssen nachweislich nicht vorhanden sein. Die Abnahme erfolgt durch eine Live-Demo, in der folgende Aktionen ohne externe Dienste durchgeführt werden: Benutzer-Login, Direktnachricht senden, Videocall starten und Datei hochladen.',
  acceptance_criteria = '1) Der Prototyp startet vollständig im k3d-Cluster und alle Pods erreichen den Status Running.
2) Es bestehen keine proprietären Cloud-Abhängigkeiten; kein Container-Image stammt von Microsoft, Google, Amazon, Zoom oder Slack.
3) Das Setup-Skript (setup.sh --check) besteht ohne Fehler und meldet Exit-Code 0.
4) Alle Kernfunktionen (FA-01 bis FA-07) sind in einer Live-Demo vollständig demonstrierbar.
5) Der Betrieb auf WSL2 (Windows Subsystem for Linux) ist ebenfalls möglich und getestet.',
  test_cases = 'Automatisiert in tests/local/AK-04.sh. Der Test prüft: (T2) Ob setup.sh --check mit Exit-Code 0 besteht, (T3) ob keine proprietären Vendor-Images (Microsoft, Google, Amazon, Zoom, Slack) im Cluster vorhanden sind. Der Testrunner (tests/runner.sh) führt die Tests aus und übergibt die Ergebnisse an scripts/tracking/ingest-results.sh, welches sie in die Tracking-Datenbank schreibt.'
WHERE id = 'AK-04';

UPDATE requirements SET
  description = 'Das Geschäftsmodell (Lieferobjekt L-04) muss vollständig ausgearbeitet und bewertet sein. Es muss ein vollständig ausgefülltes Business-Model-Canvas enthalten, Einnahmequellen müssen mit plausiblen Zahlen hinterlegt sein, eine Break-even-Analyse muss vorhanden und rechnerisch nachvollziehbar sein, und die wirtschaftliche Tragfähigkeit muss begründet argumentiert werden. Die Bewertung erfolgt durch den Gutachter nach Vorlage des Geschäftsmodell-Dokuments.',
  acceptance_criteria = '1) Das Geschäftsmodell-Dokument ist vollständig und enthält ein ausgefülltes Business-Model-Canvas.
2) Es werden mindestens zwei Geschäftsmodell-Szenarien beschrieben (z. B. Managed-Hosting-Service und Einmal-Implementierung).
3) Die Kostenstruktur (Betrieb, Implementierung, Support) ist plausibel kalkuliert und nachvollziehbar aufgeschlüsselt.
4) Die Zielgruppe ist klar definiert und mit Bezug zur Marktanalyse (L-02) begründet.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch den Betreuer anhand des abgegebenen Geschäftsmodell-Dokuments (Lieferobjekt L-04).'
WHERE id = 'AK-05';

UPDATE requirements SET
  description = 'Alle Pflichtlieferobjekte (L-01 bis L-08) müssen vollständig, fristgerecht und in akzeptabler Qualität im Dokumentenmanagementsystem (DMS) eingereicht werden. Die Vollständigkeitsprüfung umfasst: Konzept, Marktanalyse, Prototyp (als GitHub-Repository-Link), Geschäftsmodell, Systemarchitektur, Deploymentanleitung, Endbericht und Abschlusspräsentation. Kein Lieferobjekt darf unvollständig sein oder fehlende Pflichtabschnitte aufweisen.',
  acceptance_criteria = '1) Alle Lieferobjekte (L-01 bis L-08) sind vollständig erstellt und im DMS abgelegt.
2) Alle Dokumente sind vor dem in der Studienordnung festgelegten Abgabedatum eingereicht.
3) Der Endbericht umfasst mindestens sechs Seiten pro Teammitglied.
4) Die Deploymentanleitung ist von einer dritten Person reproduzierbar getestet.
5) Der Betreuer hat die Vollständigkeit aller Lieferobjekte schriftlich bestätigt.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell anhand einer DMS-Checkliste, die das Vorhandensein und die Vollständigkeit aller Lieferobjekte dokumentiert.'
WHERE id = 'AK-06';

UPDATE requirements SET
  description = 'Die Abschlusspräsentation (Lieferobjekt L-08) muss erfolgreich vor dem Bewertungskomitee durchgeführt werden. Der Zeitrahmen von 40 bis 45 Minuten inklusive Fragerunde muss eingehalten werden. Alle Teammitglieder müssen aktiv präsentieren und einen erkennbaren Redeanteil haben. Eine Live-Demo des Prototyps muss fehlerfrei durchgeführt werden, und die Fragen des Komitees müssen kompetent und sachlich beantwortet werden. Die Präsentationsunterlagen müssen fristgerecht im DMS hinterlegt sein.',
  acceptance_criteria = '1) Die Gesamtdauer der Präsentation beträgt zwischen 40 und 45 Minuten (gemessen durch Zeitnahme).
2) Alle definierten Projektziele werden in der Präsentation adressiert und deren Erreichung dargestellt.
3) Eine Live-Demo des Prototyps wird erfolgreich durchgeführt, die Login, Direktnachricht, Videocall und Datei-Upload umfasst.
4) Alle Teammitglieder haben einen aktiven und erkennbaren Redeanteil in der Präsentation.
5) Die Fragen der Prüfer werden sachlich und kompetent beantwortet.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt durch das Bewertungskomitee während der Abschlusspräsentation. Der Betreuer nimmt die Präsentation formal ab.'
WHERE id = 'AK-07';

-- ─── FA: Funktionale Anforderungen ───────────────────────────────

UPDATE requirements SET
  description = 'Das System muss Echtzeit-Kommunikation über das WebSocket-Protokoll bereitstellen. Unterstützt werden müssen 1:1-Direktnachrichten, Gruppen-Direktnachrichten mit bis zu sieben Teilnehmern sowie kanalbasierte Kommunikation in öffentlichen und privaten Channels. Nachrichten müssen Markdown-Formatierung, Emoji-Reaktionen, Dateianhänge und Thread-Antworten unterstützen. Alle Nachrichten werden persistent in der PostgreSQL-Datenbank gespeichert und bleiben auch nach einem Container-Neustart erhalten.',
  acceptance_criteria = '1) Eine gesendete Nachricht erscheint beim Empfänger innerhalb von 500 Millisekunden (gemessen über die WebSocket-Verbindung).
2) Alle drei Nachrichtentypen sind funktionsfähig: 1:1-Direktnachricht, Gruppen-Direktnachricht und Channel-Nachricht.
3) Thread-Antworten und Emoji-Reaktionen auf Nachrichten werden korrekt unterstützt.
4) Nachrichten bleiben nach einem Neustart des Mattermost-Containers vollständig erhalten (Persistenz über PostgreSQL-Volume).
5) Offline-Nachrichten werden nach erneuter Anmeldung des Empfängers korrekt zugestellt.',
  test_cases = 'Automatisiert in tests/local/FA-01.sh. Der Test prüft: (T1) Ob eine Direktnachricht erfolgreich gesendet wird und eine gültige Nachrichten-ID zurückgegeben wird, (T2) ob eine Gruppen-Direktnachricht an drei Benutzer erfolgreich zugestellt wird, (T3) ob eine Channel-Nachricht in einem öffentlichen Kanal erfolgreich gesendet wird, (T4) ob eine zuvor gesendete Nachricht nach dem Senden weiterhin aus der Datenbank abrufbar ist. Der Testrunner (tests/runner.sh) meldet die Ergebnisse über scripts/tracking/ingest-results.sh an die Tracking-Datenbank, wo sie in den Tabellen test_runs und test_results gespeichert und über die View v_latest_tests abrufbar sind.'
WHERE id = 'FA-01';

UPDATE requirements SET
  description = 'Das System muss eine hierarchische Organisationsstruktur mit Teams (Workspaces) als oberster Ebene bereitstellen. Innerhalb eines Teams müssen öffentliche Kanäle (für alle Teammitglieder sichtbar und frei beitretbar) und private Kanäle (nur für explizit eingeladene Mitglieder zugänglich) erstellt werden können. Kanäle müssen konfigurierbare Beschreibungen, Topics und Purpose-Felder unterstützen. Die Archivierung eines Kanals deaktiviert diesen, ohne dass Daten verloren gehen.',
  acceptance_criteria = '1) Öffentliche Kanäle sind für alle Mitglieder des zugehörigen Teams sichtbar und können ohne Einladung beigetreten werden.
2) Private Kanäle sind ausschließlich für explizit eingeladene Mitglieder sichtbar; nicht eingeladene Benutzer erhalten keinen Zugriff (HTTP 403).
3) Es können mindestens zwei unabhängige Teams (Workspaces) erstellt werden, zwischen denen Benutzer wechseln können.
4) Kanal-Name, Beschreibung und Topic sind konfigurierbar; Änderungen werden sofort für alle Mitglieder sichtbar.
5) Archivierte Kanäle sind weiterhin lesbar, es können jedoch keine neuen Nachrichten mehr gesendet werden.',
  test_cases = 'Automatisiert in tests/local/FA-02.sh. Der Test prüft: (T1) Ob ein nicht eingeladener Benutzer einem öffentlichen Kanal ohne Einladung beitreten kann (erwartet HTTP 201), (T2) ob ein nicht eingeladener Benutzer keinen Zugriff auf einen privaten Kanal erhält (erwartet HTTP 403). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'FA-02';

UPDATE requirements SET
  description = 'Das System muss vollständig self-hosted Video- und Audiokonferenzen über Nextcloud Talk bereitstellen, integriert in die Mattermost-Oberfläche. Es müssen mindestens zehn gleichzeitige Teilnehmer mit Kamera- und Mikrofonübertragung sowie Bildschirmfreigabe (gesamter Bildschirm oder einzelne Anwendung) unterstützt werden. Meetinglinks müssen per URL teilbar sein, und der Beitritt muss ohne vorherige Registrierung möglich sein. Es darf keine Abhängigkeit zu externen Diensten wie externe WebRTC-Dienste bestehen.',
  acceptance_criteria = '1) Mindestens zehn gleichzeitige Teilnehmer können an einer Videokonferenz teilnehmen, ohne dass Verbindungsabbrüche auftreten.
2) Die Kamera-Übertragung funktioniert für alle Teilnehmer mit mindestens 720p-Auflösung.
3) Die Mikrofon-Übertragung funktioniert bidirektional ohne relevante Verzögerung.
4) Die Bildschirmfreigabe (gesamter Bildschirm oder einzelnes Fenster) ist für jeden Teilnehmer nutzbar.
5) Das Meeting wird vollständig self-hosted betrieben; ein DNS-Check bestätigt, dass keine Anfragen an externe WebRTC-Dienste oder andere externe Nextcloud Talk-Server gesendet werden.
6) Ein Meeting kann per URL-Link geteilt werden, und der Beitritt ist ohne Benutzeranmeldung möglich.',
  test_cases = 'Kein automatisierter Test vorhanden (FA-03.sh existiert nicht im Repository). Die Prüfung der Videokonferenz-Funktionalität erfordert manuelle Tests mit echten Browser-Instanzen, da WebRTC-Verbindungen nicht über die API simuliert werden können.'
WHERE id = 'FA-03';

UPDATE requirements SET
  description = 'Das System muss den Upload von Dateien direkt in Channels und Direktnachrichten unterstützen. Alle gängigen Dateitypen (PDF, DOCX, XLSX, ZIP, MP4, PNG und weitere) müssen akzeptiert werden, wobei die maximale Dateigröße pro Upload konfigurierbar ist. Die Dateien werden persistent auf gemounteten Kubernetes-Volumes gespeichert. Für Workspaces mit mehr als 10 GB Speicherbedarf steht eine Nextcloud-Integration zur Verfügung, die auch kollaborative Dokumentenbearbeitung ermöglicht. Dateien können per Share-Link geteilt und von berechtigten Nutzern heruntergeladen werden.',
  acceptance_criteria = '1) Der Upload aller gängigen Dateitypen (PDF, DOCX, XLSX, ZIP, MP4, PNG) funktioniert fehlerfrei.
2) Pro Workspace sind mindestens 10 GB Speicher in Nextcloud konfiguriert.
3) Hochgeladene Dateien können per Share-Link mit anderen Nutzern geteilt werden.
4) Berechtigte Benutzer können geteilte Dateien herunterladen.
5) Dateien bleiben nach einem Neustart des Mattermost-Containers vollständig erhalten (Persistenz über Kubernetes-Volumes).
6) Die Nextcloud-Integration steht für die Verwaltung größerer Dateien und kollaborative Bearbeitung zur Verfügung.',
  test_cases = 'Automatisiert in tests/local/FA-04.sh. Der Test prüft: (T1) Ob ein Datei-Upload erfolgreich durchgeführt wird und eine gültige Datei-ID zurückgegeben wird, (T5) ob verschiedene Dateitypen (.pdf, .zip, .png) jeweils erfolgreich hochgeladen werden können (erwartet HTTP 201 für jeden Upload). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'FA-04';

UPDATE requirements SET
  description = 'Das System muss den vollständigen Lebenszyklus von Benutzerkonten abbilden: Anlegen, Bearbeiten von Profildaten, Deaktivieren und Löschen. Es muss ein Rollenmodell mit den Stufen System-Admin (vollständige Kontrolle), Team-Admin (Teamverwaltung), Nutzer (Standardrolle) und Gast (eingeschränkter Zugriff auf explizit zugewiesene Kanäle) umgesetzt sein. Die Benutzerverwaltung erfolgt zentral über Keycloak als Identity Provider, wobei Benutzer per CSV-Import oder manuell angelegt werden können. Die Anmeldung erfolgt per SSO über das OIDC-Protokoll.',
  acceptance_criteria = '1) Ein Administrator kann Benutzer anlegen, deren Profildaten bearbeiten und Konten deaktivieren oder löschen.
2) Die Rollen Admin, User und Gast sind verfügbar und gewähren unterschiedliche Berechtigungen (z. B. darf ein Gast keine Kanäle erstellen).
3) Die Benutzerverwaltung erfolgt zentral in Keycloak; dort angelegte Benutzer können sich per SSO in Mattermost und Nextcloud anmelden.
4) Benutzer können per CSV-Import über das Migrationsskript (migrate.sh) in Keycloak importiert werden.
5) Die Deaktivierung eines Benutzerkontos in Keycloak führt dazu, dass der Login für diesen Benutzer sofort fehlschlägt.',
  test_cases = 'Automatisiert in tests/local/FA-05.sh. Der Test prüft: (T1) Ob ein Administrator einen neuen Benutzer anlegen kann (erwartet HTTP 201) und ob sich dieser Benutzer anschließend einloggen kann (erwartet HTTP 200), (T2) ob einem Gast-Benutzer die Erstellung von Kanälen verweigert wird (erwartet HTTP 403). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'FA-05';

UPDATE requirements SET
  description = 'Das System muss eine kanalübergreifende Benachrichtigungsinfrastruktur bereitstellen, bestehend aus Browser-Push-Benachrichtigungen (Web Notifications API), Desktop-Benachrichtigungen (Mattermost Desktop-App) und Mobile-Push-Benachrichtigungen (über einen eigenen Push-Proxy). Die Benachrichtigungskonfiguration muss pro Kanal granular einstellbar sein: alle Nachrichten, nur @-Mentions oder keine Benachrichtigungen. Ein Bitte-nicht-stören-Modus (DND) sowie konfigurierbare Ruhezeiten müssen verfügbar sein.',
  acceptance_criteria = '1) Bei einer neuen Direktnachricht erscheint eine Web-Push-Benachrichtigung im Browser, wenn der Tab im Hintergrund ist.
2) Die Benachrichtigungseinstellungen sind pro Kanal konfigurierbar (alle Nachrichten, nur Erwähnungen oder stumm).
3) Der Bitte-nicht-stören-Modus (DND) unterdrückt alle Benachrichtigungen für einen konfigurierbaren Zeitraum.
4) Bei einer @-Erwähnung wird auch in einem stummgeschalteten Kanal eine Benachrichtigung ausgelöst.
5) Mobile-Push-Benachrichtigungen werden über die Mattermost Mobile App auf dem Endgerät zugestellt.',
  test_cases = 'Automatisiert in tests/local/FA-06.sh. Der Test prüft: (T2) Ob die Benachrichtigungseinstellungen eines Kanals per API konfigurierbar sind (erwartet HTTP 200), (T3) ob der Do-Not-Disturb-Status eines Benutzers per API gesetzt werden kann (erwartet HTTP 200). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'FA-06';

UPDATE requirements SET
  description = 'Das System muss eine integrierte Volltextsuche über alle für den Benutzer zugänglichen Nachrichten, Dateinamen und Kanalinhalte bereitstellen. Filteroptionen nach Autor, Kanal, Zeitraum und Dateityp müssen verfügbar sein. Suchergebnisse werden nach Relevanz und Datum sortiert. Die Suche respektiert die Zugriffsrechte: Benutzer sehen ausschließlich Inhalte der Kanäle, denen sie angehören. Eine Suchanfrage muss innerhalb von zwei Sekunden ein Ergebnis liefern.',
  acceptance_criteria = '1) Die Volltextsuche findet zuvor gesendete Nachrichten anhand von Suchbegriffen.
2) Die Dateisuche findet hochgeladene Dateien anhand ihres Dateinamens.
3) Die Kanalsuche findet Kanäle anhand ihres Namens und zeigt sie in den Vorschlägen an.
4) Eine Suchanfrage liefert innerhalb von zwei Sekunden ein Ergebnis (gemessen von Absenden bis Antwort).
5) Suchergebnisse können nach Datum gefiltert werden, sodass nur Ergebnisse im gewählten Zeitraum angezeigt werden.',
  test_cases = 'Automatisiert in tests/local/FA-07.sh. Der Test prüft: (T1) Ob eine zuvor gepostete Nachricht mit einem eindeutigen Suchbegriff über die Volltextsuche gefunden wird (Ergebnisanzahl > 0), (T4) ob die Suchanfrage innerhalb von zwei Sekunden eine Antwort liefert, (T3) ob die Kanalsuche einen Kanal anhand seines Namens findet. Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'FA-07';

UPDATE requirements SET
  description = 'Das System muss homeoffice-spezifische Funktionen bereitstellen. Benutzer müssen anpassbare Status-Emojis und Status-Texte setzen können (z. B. Homeoffice, Nicht stören, Mittagspause), wobei eine automatische Ablaufzeit konfigurierbar ist. Eine Kalenderintegration über ein Mattermost-Plugin soll aktive Meetings im Status anzeigen. Die Verfügbarkeit eines Benutzers muss im Profil für andere Teammitglieder einsehbar sein, um die Erreichbarkeitsplanung im Team zu erleichtern.',
  acceptance_criteria = '1) Die Status-Optionen Verfügbar, Beschäftigt, Abwesend und ein benutzerdefinierter Status sind konfigurierbar.
2) Der gesetzte Status ist für andere Benutzer im Profil und neben dem Benutzernamen sichtbar.
3) Benutzerdefinierte Status-Texte mit Emoji und optionaler Ablaufzeit können gesetzt werden.
4) Die Kalenderintegration ist konfiguriert und dokumentiert; Events aus einem .ics-Feed können importiert werden.
5) Status-Emojis können frei konfiguriert werden und erscheinen neben dem Benutzernamen in der Oberfläche.',
  test_cases = 'Automatisiert in tests/local/FA-08.sh. Der Test prüft: (T1) Ob der Benutzerstatus auf „Beschäftigt" gesetzt werden kann (erwartet HTTP 200), (T2) ob ein benutzerdefinierter Status-Text mit Emoji und Ablaufzeit gesetzt werden kann (erwartet HTTP 200), (T3) ob der gesetzte Status für andere Benutzer sichtbar ist (Status „dnd" ist im Profil abrufbar). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'FA-08';

-- ─── L: Lieferobjekte ────────────────────────────────────────────

UPDATE requirements SET
  description = 'Das Projektkonzept-Dokument muss alle fünf Projektphasen (P1 bis P5) abdecken und folgende Inhalte enthalten: Projektidee mit Problemstellung, Zielgruppendefinition, Nutzenversprechen und technischer Lösungsansatz. Darüber hinaus sind eine Executive Summary, eine Scope-Definition mit klarer Abgrenzung, eine Meilensteinplanung sowie eine grobe Ressourcenabschätzung erforderlich. Das Konzept bildet die inhaltliche und strukturelle Grundlage für alle weiteren Lieferobjekte (L-02 bis L-08).',
  acceptance_criteria = '1) Das Lastenheft (P1-Dokument) ist vollständig erstellt und enthält alle Pflichtabschnitte.
2) Das Pflichtenheft (P2-Dokument) ist vollständig und konkretisiert die Anforderungen aus dem Lastenheft.
3) Die Projektplanung (P3-Dokument) enthält einen Zeitplan mit Meilensteinen und Ressourcenzuordnung.
4) Das Realisierungsdokument (P4) beschreibt die technische Umsetzung und Implementierungsentscheidungen.
5) Das Abnahme-/Testdokument (P5) definiert die Abnahmekriterien und Testergebnisse.
6) Alle fünf Dokumente sind im Dokumentenmanagementsystem (DMS) abgelegt und der Link ist gültig.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell anhand einer Dokument-Checkliste (P1 bis P5). Der Betreuer bestätigt die Vollständigkeit aller Konzeptdokumente.'
WHERE id = 'L-01';

UPDATE requirements SET
  description = 'Die Marktanalyse muss eine strukturierte Untersuchung des Zielmarkts enthalten, bestehend aus Marktgröße und Marktwachstum, einer Zielgruppendefinition (KMUs, Remote-Teams und öffentliche Einrichtungen in Deutschland) sowie einer Wettbewerberanalyse mit Feature- und Preisvergleich von mindestens fünf Konkurrenzprodukten (Slack, Microsoft Teams, Zoom, Rocket.Chat, Nextcloud Talk). Eine SWOT-Analyse der eigenen Lösung sowie eine klare Positionierung als self-hosted, DSGVO-konformer Open-Source-Stack müssen enthalten sein.',
  acceptance_criteria = '1) Mindestens fünf konkurrierende Lösungen sind namentlich benannt und hinsichtlich Features und Preismodell analysiert.
2) Eine DSGVO-Bewertung der analysierten Konkurrenten ist enthalten, die Probleme wie US-Serverstandorte und CLOUD Act benennt.
3) Die USP-Abgrenzung gegenüber den Wettbewerbern ist klar herausgearbeitet und in einer Vergleichstabelle dargestellt.
4) Die Marktgröße und Zielgruppengröße sind quantifiziert und mit mindestens einer zitierfähigen Statistik oder Studie belegt.
5) Alle verwendeten Quellen sind vollständig angegeben und für den Gutachter zugänglich.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch Sichtung des Marktanalyse-Dokuments. Der Betreuer prüft die Nachvollziehbarkeit der Quellen und die Plausibilität der Marktgrößen.'
WHERE id = 'L-02';

UPDATE requirements SET
  description = 'Der Prototyp muss eine funktionsfähige Homeoffice-Kommunikationsplattform auf Basis von Mattermost und Nextcloud (Talk) sein, deployed im k3d-Cluster. Alle Kernfunktionen (Messaging, Videokonferenzen, Dateiablage und Nutzerverwaltung) müssen lauffähig und demonstrierbar sein. Der Prototyp muss über HTTPS erreichbar sein und im Abnahmegespräch live vorgeführt werden können. Der gesamte Quellcode (Kubernetes-Manifeste, Helm-Charts und Konfigurationsdateien) muss versioniert im GitHub-Repository vorliegen.',
  acceptance_criteria = '1) Alle Services starten im k3d-Cluster ohne Fehler und erreichen den Status Running.
2) Login ist in Mattermost, Nextcloud und Nextcloud Talk über den SSO-Provider Keycloak möglich.
3) Alle Kernfunktionen (FA-01 bis FA-07) sind im laufenden Prototyp demonstrierbar.
4) Es besteht keine Abhängigkeit zu proprietären Diensten; alle Komponenten sind Open Source.
5) Die Inbetriebnahme des Prototyps ist anhand der README-Dokumentation in unter 30 Minuten nachvollziehbar.',
  test_cases = 'Kein automatisierter Test vorhanden (L-03.sh existiert nicht im Repository). Die Prüfung des Prototyps erfolgt manuell durch eine Live-Demo im Abnahmegespräch. Teilaspekte werden indirekt durch die Tests der funktionalen Anforderungen (FA-01 bis FA-08) abgedeckt.'
WHERE id = 'L-03';

UPDATE requirements SET
  description = 'Das Geschäftsmodell muss nach dem Business-Model-Canvas-Framework ausgearbeitet sein und folgende Bereiche vollständig abdecken: Wertversprechen, Kundensegmente, Kanäle, Kundenbeziehungen, Einnahmequellen (z. B. Managed-Hosting-Abo, On-Premises-Lizenz mit Support-Vertrag, Implementierungsdienstleistungen), Schlüsselressourcen, Schlüsselaktivitäten, Schlüsselpartner sowie Kostenstruktur. Eine Bewertung der wirtschaftlichen Tragfähigkeit inklusive einer nachvollziehbaren Break-even-Analyse muss enthalten sein.',
  acceptance_criteria = '1) Mindestens zwei Geschäftsmodell-Optionen sind ausgearbeitet und beschrieben (z. B. SaaS-Modell und Self-Hosted-Lizenz).
2) Die Kostenstruktur für Betrieb, Implementierung und Support ist plausibel kalkuliert und nachvollziehbar aufgeschlüsselt.
3) Die Zielgruppe ist klar definiert und mit Bezug zur Marktanalyse (L-02) quantifiziert.
4) Die Monetarisierungsstrategie ist erläutert und die Einnahmequellen sind mit plausiblen Zahlen hinterlegt.
5) Eine SWOT-Analyse oder Risikobewertung des gewählten Geschäftsmodells ist enthalten.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch den Betreuer anhand des abgegebenen Geschäftsmodell-Dokuments.'
WHERE id = 'L-04';

UPDATE requirements SET
  description = 'Die technische Architekturdokumentation muss folgende Bestandteile enthalten: ein Komponentendiagramm aller eingesetzten Services (Mattermost, Nextcloud (Talk), Keycloak, PostgreSQL, Traefik), ein Deployment-Diagramm für den k3d-Cluster, eine Netzwerkarchitektur mit Ingress-Routing, interner Service-Kommunikation und TLS-Terminierung, eine Datenbankschema-Übersicht sowie eine Sicherheitsarchitektur mit TLS-Flow, RBAC-Modell und SSO-Flow über Keycloak. Die Diagramme müssen versioniert im Repository vorliegen.',
  acceptance_criteria = '1) Ein Architekturdiagramm mit allen Komponenten und deren Datenflüssen ist vorhanden und aktuell.
2) Alle eingesetzten Services sind im Diagramm dokumentiert und stimmen mit den tatsächlich deployten Kubernetes-Ressourcen überein.
3) Die Netzwerkarchitektur ist vollständig beschrieben, inklusive einer Tabelle mit Port, Protokoll und zugehörigem Dienst.
4) Die Datenspeicherung und Persistenzstrategie (Volumes, PVCs) ist dokumentiert.
5) Die Sicherheitsarchitektur mit TLS-Terminierung, RBAC und dem SSO-Flow (Keycloak → Mattermost/Nextcloud) ist dargestellt.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch Abgleich des Architekturdiagramms mit der tatsächlichen Implementierung im Cluster.'
WHERE id = 'L-05';

UPDATE requirements SET
  description = 'Die Deploymentanleitung muss eine vollständige Schritt-für-Schritt-Installationsanleitung für das Gesamtsystem enthalten. Sie muss folgende Abschnitte umfassen: Voraussetzungen (k3d, kubectl, Helm, DNS-Konfiguration), Konfigurationsanleitung für Secrets und Umgebungsvariablen, den Deployment-Ablauf in der korrekten Reihenfolge der Komponenten, Post-Installation-Checks (Health-Checks, Smoke-Tests), Backup-Einrichtung sowie eine Update- und Rollback-Prozedur. Die Anleitung muss von einem Linux-Administrator ohne Mattermost-Vorkenntnisse nachvollziehbar sein.',
  acceptance_criteria = '1) Die Schritt-für-Schritt-Anleitung deckt sowohl die Installation unter Linux als auch unter WSL2 ab.
2) Alle Voraussetzungen (Docker, k3d, kubectl, benötigte Ports) sind vollständig dokumentiert.
3) Die Konfiguration aller Umgebungsvariablen und Secrets ist erklärt und mit Beispielwerten versehen.
4) Ein Troubleshooting-Abschnitt deckt die drei häufigsten Fehlerfälle ab (z. B. Port-Konflikte, DNS-Probleme, fehlende Berechtigungen).
5) Eine dritte Person ohne Projektvorkenntnisse kann das Deployment anhand der Anleitung erfolgreich reproduzieren.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt durch einen Reproduzierbarkeitstest: Eine dritte Person ohne Vorkenntnis befolgt die Anleitung auf einer frischen Umgebung und dokumentiert, ob das Deployment erfolgreich war.'
WHERE id = 'L-06';

UPDATE requirements SET
  description = 'Der wissenschaftliche Abschlussbericht muss einen Mindestumfang von sechs Seiten pro Teammitglied haben. Die Struktur umfasst: Einleitung und Zielsetzung, technische Umsetzung und Architektur, Marktanalyse-Ergebnisse, Projektverlauf und Lessons Learned, Ausblick und Weiterentwicklungspotenzial sowie Anhänge mit Testergebnissen, Metriken und relevanten Code-Auszügen. Der Bericht muss als PDF fristgerecht im DMS eingereicht werden.',
  acceptance_criteria = '1) Der Endbericht umfasst mindestens sechs Seiten pro Teammitglied (berechnet als Gesamtseitenanzahl geteilt durch Teamgröße).
2) Alle im Lastenheft definierten Projektziele werden im Bericht reflektiert und deren Erreichungsgrad bewertet.
3) Ein Abschnitt zu Lessons Learned dokumentiert die wichtigsten Erkenntnisse aus dem Projektverlauf.
4) Alle technischen Entscheidungen (Technologiewahl, Architekturentscheidungen) sind nachvollziehbar begründet.
5) Das Quellenverzeichnis ist vollständig und alle Verweise im Text sind aufgelöst.
6) Der Bericht wurde fristgerecht vor dem Abgabedatum im DMS eingereicht.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt manuell durch den Betreuer anhand der Seitenanzahl, der inhaltlichen Vollständigkeit und der Einhaltung des Abgabedatums.'
WHERE id = 'L-07';

UPDATE requirements SET
  description = 'Die Abschlusspräsentation muss vor dem Bewertungskomitee in einem Zeitrahmen von 40 bis 45 Minuten inklusive Fragerunde durchgeführt werden. Pflichtinhalte sind: eine Live-Demo des Prototyps, die Marktpositionierung und das Geschäftsmodell, die technische Architektur und Designentscheidungen sowie ein Projektrückblick mit Teamreflexion. Alle Teammitglieder müssen aktiv präsentieren. Die Präsentationsunterlagen (PDF oder PPTX) müssen fristgerecht im DMS hinterlegt werden.',
  acceptance_criteria = '1) Die Gesamtdauer der Präsentation beträgt zwischen 40 und 45 Minuten inklusive Live-Demo und Fragerunde.
2) Alle definierten Projektziele werden in der Präsentation adressiert.
3) Die Live-Demo umfasst erfolgreich: Benutzer-Login, Direktnachricht senden, Videocall starten und Datei hochladen.
4) Alle Teammitglieder haben einen aktiven und erkennbaren Redeanteil.
5) Die Fragen der Prüfer werden sachlich und kompetent beantwortet.',
  test_cases = 'Kein automatisierter Test vorhanden. Die Prüfung erfolgt durch das Bewertungskomitee während der Abschlusspräsentation. Der Betreuer nimmt die Präsentation formal ab.'
WHERE id = 'L-08';

-- ─── NFA: Nicht-funktionale Anforderungen ─────────────────────────

UPDATE requirements SET
  description = 'Alle personenbezogenen Daten (Nachrichten, Dateien, Nutzerprofile und Logs) müssen ausschließlich auf eigenen Servern in Deutschland gespeichert und verarbeitet werden. Es darf keine Übermittlung an Drittanbieter oder Cloud-Dienste außerhalb der EU stattfinden. Ein Verzeichnis der Verarbeitungstätigkeiten (VVT) muss vorhanden sein und ein Löschkonzept muss das Recht auf Löschung gemäß DSGVO Artikel 17 umsetzen. Die Datenbank-Volumes und die Dateiablage müssen verschlüsselt gespeichert werden (Encryption at Rest).',
  acceptance_criteria = '1) Alle Daten werden ausschließlich auf dem eigenen Server gespeichert; kein Cloud-Drittanbieter wird für Datenspeicherung oder -verarbeitung genutzt.
2) Kein Telemetrie-Datenabfluss an US-Dienste (Microsoft, Google, Slack, Zoom) findet statt, nachgewiesen durch Netzwerkanalyse.
3) Die DSGVO-Auskunftspflicht ist erfüllt: Ein Compliance-Export aller Benutzerdaten ist über die Mattermost-Admin-Oberfläche möglich.
4) Das Recht auf Löschung ist umgesetzt: Ein gelöschter Benutzeraccount wird vollständig aus der Datenbank entfernt.
5) Es findet keine Datenübertragung in Drittländer statt, sodass der CLOUD Act keine Anwendung findet.',
  test_cases = 'Kein automatisierter Test vorhanden (NFA-01.sh existiert nicht im Repository). Die Prüfung erfordert manuelle Netzwerkanalyse (tcpdump/nmap) sowie Sichtung der Mattermost-Compliance-Export-Funktion.'
WHERE id = 'NFA-01';

UPDATE requirements SET
  description = 'Die Systemantwortzeit für UI-Interaktionen (Seitenaufbau, Kanalwechsel) muss bei bis zu 100 gleichzeitigen Nutzern unter zwei Sekunden liegen. Die WebSocket-Nachrichtenlatenz vom Absenden bis zum Empfang beim Gegenüber muss unter 500 Millisekunden unter Normallast bleiben. Die API-Response-Zeiten müssen für 95 Prozent aller Requests unter einer Sekunde liegen. Die Messung und das Monitoring dieser Werte erfolgen über Prometheus und Grafana.',
  acceptance_criteria = '1) Die Mattermost-UI-Ladezeit beträgt unter zwei Sekunden beim Cold Start (gemessen mit curl oder Browser DevTools).
2) Die Nachrichtenlatenz vom Senden bis zur Anzeige beim Empfänger beträgt unter 500 Millisekunden.
3) Ein Nextcloud-Upload von 10 MB wird in unter zehn Sekunden abgeschlossen.
4) Ein Nextcloud Talk-Videocall mit 720p-Auflösung ist für mindestens zwei Teilnehmer über fünf Minuten stabil ohne Abbrüche.
5) Die CPU-Auslastung bleibt bei Normallast (fünf aktive Benutzer) unter 80 Prozent.',
  test_cases = 'Kein automatisierter Test vorhanden (NFA-02.sh existiert nicht im Repository). Die Prüfung erfordert manuelle Performance-Messungen mit curl, Browser DevTools und kubectl top.'
WHERE id = 'NFA-02';

UPDATE requirements SET
  description = 'Das System muss eine Verfügbarkeit von mindestens 99,5 Prozent im Jahresdurchschnitt erreichen, was maximal circa 44 Stunden ungeplanter Downtime pro Jahr entspricht. Dies wird durch ein Kubernetes-basiertes Deployment mit automatischem Pod-Neustart, Liveness- und Readiness-Probes sowie Rolling Updates ohne Dienstunterbrechung sichergestellt. Geplante Wartungsfenster werden angekündigt und außerhalb der Kernarbeitszeiten durchgeführt.',
  acceptance_criteria = '1) Alle Container-Pods im Cluster verfügen über eine Restart-Policy, die einen automatischen Neustart nach Absturz sicherstellt.
2) Nach einem ungeplanten Pod-Absturz startet der betroffene Service automatisch neu und ist innerhalb von 60 Sekunden wieder erreichbar.
3) Health-Check-Endpunkte (z. B. /api/v4/system/ping für Mattermost) sind erreichbar und liefern HTTP 200 zurück.
4) Die Datenpersistenz ist nach einem Container-Absturz gewährleistet; zuvor gesendete Nachrichten sind nach dem Neustart weiterhin vorhanden.
5) Bei einem Rolling Update beträgt die Downtime weniger als zwei Minuten.',
  test_cases = 'Automatisiert in tests/local/NFA-03.sh. Der Test prüft: (T1) Ob der Mattermost-Pod nach einem erzwungenen Löschen (kubectl delete pod --force) automatisch neu gestartet wird, (T2) ob Mattermost innerhalb von 60 Sekunden nach dem Neustart wieder erreichbar ist, (T3) ob der Health-Endpunkt HTTP 200 zurückliefert, (T4) ob zuvor gesendete Nachrichten nach einem Pod-Absturz weiterhin aus der Datenbank abrufbar sind (Datenpersistenz). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'NFA-03';

UPDATE requirements SET
  description = 'Das System muss horizontal skalierbar sein. Mattermost-Pods sollen über den Kubernetes Horizontal Pod Autoscaler (HPA) automatisch basierend auf CPU- und RAM-Auslastung skalieren. Die Datenbankschicht (PostgreSQL) soll bei Bedarf über Read-Replicas skaliert werden können. Die Lastverteilung erfolgt über den Kubernetes-internen Service und den Ingress-Controller. Der getestete Bereich umfasst 10 bis 500 gleichzeitige Nutzer ohne Änderung an der Grundarchitektur.',
  acceptance_criteria = '1) Das System läuft stabil mit zehn gleichzeitigen Benutzern ohne HTTP-500-Fehler.
2) Bis zu 50 gleichzeitige Benutzer können ohne Architekturänderung bedient werden.
3) CPU- und RAM-Limits sind über die Kubernetes-Manifeste konfigurierbar und werden beim Neustart angewendet.
4) Skalierungshinweise und -empfehlungen sind in der Dokumentation (README oder Deploymentanleitung) enthalten.
5) Datenbankverbindungsparameter (DB_HOST, DB_PORT) sind über Umgebungsvariablen extern konfigurierbar, ohne dass Codeänderungen nötig sind.',
  test_cases = 'Kein automatisierter Test vorhanden (NFA-04.sh existiert nicht im Repository). Die Prüfung erfordert manuelle Lasttests (z. B. mit Apache Bench oder k6) sowie Überprüfung der Kubernetes-Ressourcenkonfiguration.'
WHERE id = 'NFA-04';

UPDATE requirements SET
  description = 'Die Mattermost-Oberfläche muss vollständig auf Deutsch lokalisiert sein (Sprachpaket „de"). Die Benutzerführung muss intuitiv und an bekannten Kommunikationstools (Slack-ähnliche UX) orientiert sein. Die Einarbeitungszeit für Grundfunktionen (Nachricht senden, Kanal beitreten, Datei hochladen) darf maximal 30 Minuten ohne Vorkenntnisse betragen. Das System muss als Web-UI, Desktop-App (Windows, macOS, Linux) und Mobile-App (iOS, Android) verfügbar sein.',
  acceptance_criteria = '1) Die Mattermost-UI ist standardmäßig auf Deutsch konfiguriert und zeigt alle Menüs und Dialoge in deutscher Sprache an.
2) Eine Testperson ohne Vorkenntnisse kann innerhalb von 30 Minuten eine Direktnachricht senden, einem Kanal beitreten und eine Datei hochladen.
3) Die Navigation (Kanäle, Direktnachrichten, Suche) ist intuitiv und ohne Anleitung bedienbar.
4) Die mobile Browser-Ansicht ist funktionsfähig und ermöglicht Login und Nachrichtenversand.
5) Die wichtigsten Tastaturkürzel (z. B. Strg+K für den Quick Switcher) sind verfügbar und funktionieren.',
  test_cases = 'Kein automatisierter Test vorhanden (NFA-05.sh existiert nicht im Repository). Die Prüfung erfolgt manuell durch einen Usability-Test mit mindestens drei Testpersonen ohne Mattermost-Vorkenntnisse.'
WHERE id = 'NFA-05';

UPDATE requirements SET
  description = 'Das gesamte System muss als Container im Kubernetes-Cluster (k3d) betrieben werden. Updates müssen via Rolling Deployment ohne Unterbrechung des laufenden Betriebs durchgeführt werden können. Die Konfiguration muss vollständig in Kubernetes-Manifesten und Kustomize-Overlays versioniert sein (GitOps über Git-Repository). Monitoring erfolgt über Prometheus und Grafana, Log-Aggregation über kubectl logs. Der Betrieb und die Routinewartung müssen von einem Linux-Administrator ohne Mattermost-Spezialkenntnisse durchführbar sein.',
  acceptance_criteria = '1) Alle Services sind über Kubernetes-Manifeste steuerbar und erreichen nach dem Deployment den Status Running oder Completed.
2) Ein Update (Image-Version ändern, kubectl apply) kann ohne Datenverlust durchgeführt werden; bestehende Daten bleiben erhalten.
3) Logs aller Services sind zentral über kubectl logs abrufbar und enthalten aussagekräftige Einträge.
4) Die gesamte Konfiguration ist in Kubernetes-Manifesten und Kustomize-Dateien im Git-Repository versioniert.
5) Konfigurationsänderungen (z. B. Umgebungsvariablen in ConfigMaps oder Secrets) werden nach einem erneuten Apply sofort wirksam.',
  test_cases = 'Automatisiert in tests/local/NFA-06.sh. Der Test prüft: (T1) Ob alle Pods im Cluster den Status Running oder Completed haben und keine Pods in einem Fehlerzustand sind, (T4) ob kubectl logs für den Mattermost-Pod Ausgaben liefert (Loglänge > 0), (T5) ob ConfigMaps und Secrets für die Konfiguration vorhanden sind (Anzahl > 0). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'NFA-06';

UPDATE requirements SET
  description = 'Alle eingesetzten Softwarekomponenten müssen ausschließlich unter anerkannten Open-Source-Lizenzen stehen. Dies betrifft: Mattermost Team Edition (MIT-Lizenz), Nextcloud Talk (Apache 2.0), Nextcloud (AGPL v3), Keycloak (Apache 2.0), PostgreSQL (PostgreSQL License) und Traefik (MIT-Lizenz). Es dürfen keine proprietären Abhängigkeiten, keine Cloud-Vendor-Bindung und keine laufenden Lizenzgebühren bestehen. Eine Lizenzübersicht muss im Projekt dokumentiert sein.',
  acceptance_criteria = '1) Mattermost wird als Team Edition (MIT-Lizenz) eingesetzt, nicht als Enterprise Edition.
2) Nextcloud wird unter der AGPL v3 eingesetzt und es sind keine proprietären Erweiterungen aktiviert.
3) Nextcloud Talk wird unter Apache 2.0 eingesetzt und ist vollständig self-hosted.
4) Keycloak wird unter Apache 2.0 eingesetzt und dient als zentraler Identity Provider.
5) Traefik wird unter MIT-Lizenz als Ingress-Controller eingesetzt.
6) Eine vollständige Lizenzübersicht aller eingesetzten Komponenten ist im Projekt dokumentiert.',
  test_cases = 'Automatisiert in tests/local/NFA-07.sh. Der Test prüft: (T1) Ob Mattermost als Team Edition betrieben wird und keine Enterprise-Lizenz aktiv ist, (T2) ob die Container-Images für Mattermost Team Edition, Nextcloud, Nextcloud Talk und Keycloak im Cluster vorhanden sind. Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'NFA-07';

-- ─── SA: Sicherheitsanforderungen ─────────────────────────────────

UPDATE requirements SET
  description = 'Alle externen Verbindungen müssen ausschließlich über TLS verschlüsselt sein. HTTPS wird für die Web-UI und die REST-API verwendet, WSS (WebSocket Secure) für die Echtzeit-Kommunikation. Es muss TLS 1.3 bevorzugt werden, mit einem Fallback auf TLS 1.2 unter Verwendung starker Cipher-Suites. Die TLS-Terminierung erfolgt am Ingress-Controller (Traefik). Die automatische Zertifikatsverwaltung erfolgt über cert-manager mit Let''s Encrypt. HSTS (HTTP Strict Transport Security) muss aktiviert sein.',
  acceptance_criteria = '1) Alle HTTP-Verbindungen werden automatisch per 301-Redirect auf HTTPS umgeleitet.
2) Der Server unterstützt mindestens TLS 1.2, wobei TLS 1.3 bevorzugt verwendet wird.
3) Ein gültiges TLS-Zertifikat von Let''s Encrypt ist vorhanden und wird automatisch erneuert.
4) Die WebSocket-Verbindung für Mattermost-Echtzeitkommunikation läuft über WSS (verschlüsselt).
5) Der HSTS-Header (Strict-Transport-Security) ist in den HTTP-Antworten gesetzt.',
  test_cases = 'Kein automatisierter Test vorhanden (SA-01.sh existiert nicht im Repository). Die Prüfung erfordert manuelle TLS-Tests mit curl, nmap (ssl-enum-ciphers) und Browser DevTools zur Überprüfung der WSS-Verbindung und HSTS-Header.'
WHERE id = 'SA-01';

UPDATE requirements SET
  description = 'Die primäre Authentifizierung erfolgt über Benutzername oder E-Mail und Passwort. Ein Rate-Limiting muss zum Schutz vor Brute-Force-Angriffen implementiert sein, mit einer automatischen Kontosperrung nach einer konfigurierbaren Anzahl von Fehlversuchen. Optionale Zwei-Faktor-Authentifizierung (2FA) via TOTP (RFC 6238) muss verfügbar sein, kompatibel mit Google Authenticator, Authy und vergleichbaren Apps. Keycloak dient als zentraler Identity Provider für SSO über das OIDC-Protokoll.',
  acceptance_criteria = '1) Ein Login mit falschem Passwort wird zuverlässig abgelehnt und liefert HTTP 401 zurück.
2) TOTP-basierte Zwei-Faktor-Authentifizierung ist in Keycloak aktivierbar und wird beim Login abgefragt.
3) Fehlgeschlagene Anmeldeversuche werden in den Keycloak-Event-Logs protokolliert.
4) Keycloak ist als zentraler SSO-Identity-Provider konfiguriert und der OIDC-Discovery-Endpunkt ist erreichbar.
5) Ein Brute-Force-Schutz ist in Keycloak konfiguriert und sperrt Konten nach wiederholten Fehlversuchen.',
  test_cases = 'Automatisiert in tests/local/SA-02.sh. Der Test prüft: (T1) Ob ein Login mit falschem Passwort abgelehnt wird (erwartet HTTP 401), (T3) ob nach sechs aufeinanderfolgenden Fehlversuchen ein Rate-Limiting greift (erwartet HTTP 429 oder 401), (T4) ob der Keycloak-OIDC-Discovery-Endpunkt erreichbar ist (erwartet HTTP 200), (T5) ob Login-Events in Keycloak aktiviert sind. Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'SA-02';

UPDATE requirements SET
  description = 'Passwörter dürfen niemals im Klartext gespeichert oder übertragen werden. Das Hashing muss ausschließlich mit bcrypt erfolgen, wobei der Kostenfaktor mindestens 12 betragen muss (entspricht circa 250 Millisekunden Hashzeit auf aktueller Hardware). Die Passwort-Policy muss eine Mindestlänge von zwölf Zeichen vorschreiben. Eine Passwort-Änderung muss die Eingabe des aktuellen Passworts erfordern.',
  acceptance_criteria = '1) Passwörter werden in der Datenbank als bcrypt-Hash gespeichert (erkennbar am Präfix $2b$12$ oder $2a$12$).
2) Der bcrypt-Kostenfaktor beträgt mindestens 12 (konfiguriert in Keycloak Realm Settings).
3) In keinen Container-Logs erscheinen Klartext-Passwörter (geprüft über kubectl logs für alle Pods).
4) Die Passwort-Policy in Keycloak erzwingt eine Mindestlänge von zwölf Zeichen.
5) Die Passwort-Richtlinien (Hashing-Algorithmus, Kostenfaktor, Mindestlänge) sind in den Keycloak Realm Settings konfiguriert.',
  test_cases = 'Automatisiert in tests/local/SA-03.sh. Der Test prüft: (T1) Ob Passwörter in der Datenbank als bcrypt-Hashes gespeichert sind (Muster $2[aby]$ in der Passwort-Spalte), (T2) ob in Keycloak eine Passwort-Policy konfiguriert ist (Policy-String ist nicht leer), (T3) ob in den Logs aller Pods keine Klartext-Passwörter erscheinen. Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'SA-03';

UPDATE requirements SET
  description = 'Sessions müssen serverseitig nach 30 Minuten ohne Nutzeraktivität automatisch invalidiert werden. JWT-Tokens müssen eine kurze Gültigkeitsdauer haben: Access Token maximal 60 Minuten, Refresh Token maximal 30 Tage. Bei Ablauf einer Session muss der Nutzer automatisch auf die Login-Seite weitergeleitet werden. Ein expliziter Logout muss alle aktiven Sessions des Nutzers auf allen Geräten invalidieren.',
  acceptance_criteria = '1) Der Session-Timeout ist auf maximal 60 Minuten Inaktivität konfiguriert; nach Ablauf wird der Benutzer zur Login-Seite weitergeleitet.
2) Die Access Token Lifespan ist in Keycloak auf maximal 60 Minuten konfiguriert.
3) Ein abgelaufener oder ungültiger Token wird bei einem API-Aufruf mit HTTP 401 abgelehnt.
4) Der Mattermost Session-Timeout ist konfiguriert und auf einen Wert größer als null gesetzt.
5) Die Token-Ablaufzeit ist im Browser-Cookie nachvollziehbar und entspricht der Keycloak-Konfiguration.',
  test_cases = 'Automatisiert in tests/local/SA-04.sh. Der Test prüft: (T2) Ob die Access Token Lifespan in Keycloak maximal 60 Minuten beträgt und größer als null ist, (T3) ob ein ungültiger Token bei einem API-Aufruf mit HTTP 401 abgelehnt wird, (T4) ob in Mattermost ein Session-Timeout konfiguriert ist (Wert > 0). Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'SA-04';

UPDATE requirements SET
  description = 'Das System muss ein Audit-Log für alle sicherheitsrelevanten Ereignisse bereitstellen. Protokolliert werden müssen: Login und Logout, fehlgeschlagene Anmeldeversuche, Passwortänderungen, Vergabe und Entzug von Rechten, Kanal-Erstellung und -Löschung, Nutzer-Deaktivierungen sowie alle Admin-Aktionen. Jeder Eintrag muss Zeitstempel (UTC), Nutzer-ID, IP-Adresse, Aktion und betroffenes Objekt enthalten. Die Aufbewahrungsfrist beträgt mindestens 90 Tage und die Logs müssen als CSV oder JSON exportierbar sein.',
  acceptance_criteria = '1) Login-Ereignisse (erfolgreiche und fehlgeschlagene Anmeldungen) werden in den Keycloak-Event-Logs protokolliert.
2) Dateizugriffe und Downloads werden in den Mattermost-Compliance-Logs erfasst.
3) Admin-Aktionen (z. B. Benutzer löschen, Rollen ändern) erscheinen im Audit-Log.
4) Audit-Log-Einträge werden mindestens 30 Tage aufbewahrt und sind nach diesem Zeitraum weiterhin abrufbar.
5) Logs können als CSV oder JSON exportiert werden und sind SIEM-kompatibel.',
  test_cases = 'Automatisiert in tests/local/SA-05.sh. Der Test prüft: (T1) Ob Keycloak-Login-Events vorhanden sind und die Event-Anzahl größer als null ist, (T3) ob das Mattermost-Audit-Log verfügbar ist und Einträge enthält. Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'SA-05';

UPDATE requirements SET
  description = 'Das System muss eine rollenbasierte Zugriffskontrolle (RBAC) auf System-, Team- und Kanalebene umsetzen. Folgende Rollen müssen verfügbar sein: System-Admin (alle Rechte), Team-Admin (Teamverwaltung), Channel-Admin (Kanalmoderation), Member (Standardnutzer) und Guest (eingeschränkt auf explizit zugewiesene Kanäle). Das Prinzip der minimalen Rechtevergabe (Least Privilege) gilt: Neue Nutzer erhalten standardmäßig nur Member-Rechte. Alle Rechteänderungen müssen im Audit-Log erfasst werden.',
  acceptance_criteria = '1) Die Rollen Admin, User und Gast sind verfügbar und gewähren unterschiedliche Berechtigungen.
2) Ein Gast-Benutzer kann keine Kanäle erstellen (die API liefert HTTP 403 zurück).
3) Ein Admin-Benutzer kann alle Systemeinstellungen ändern und Benutzer verwalten.
4) Das Least-Privilege-Prinzip ist umgesetzt: Ein normaler Benutzer sieht nur eigene Direktnachrichten und Kanäle, denen er angehört.
5) Die Rollen in Keycloak und Mattermost sind konsistent und synchron konfiguriert.',
  test_cases = 'Automatisiert in tests/local/SA-06.sh. Der Test prüft: (T1) Ob ein Gast-Benutzer beim Versuch, einen Kanal zu erstellen, HTTP 403 erhält, (T2) ob ein normaler Benutzer keinen Zugriff auf die Mattermost System Console hat. Die Testergebnisse werden vom Testrunner über scripts/tracking/ingest-results.sh in die Tracking-Datenbank geschrieben.'
WHERE id = 'SA-06';

UPDATE requirements SET
  description = 'Das System muss automatisierte tägliche Backups aller kritischen Daten durchführen. Dies umfasst: PostgreSQL-Datenbankdump (pg_dump), Nextcloud-Dateiablage, Mattermost-Konfiguration und Attachments. Die Backup-Rotation sieht tägliche Sicherungen für 30 Tage sowie wöchentliche Sicherungen für drei Monate vor. Die Sicherungen müssen AES-256-verschlüsselt auf einem separaten Storage außerhalb des Kubernetes-Clusters abgelegt werden. Die Wiederherstellungsfähigkeit muss durch einen dokumentierten Restore-Prozess nachgewiesen sein.',
  acceptance_criteria = '1) Ein tägliches Backup wird automatisch um 02:00 UTC ausgeführt und der Backup-Job ist im Containerlog als erfolgreich dokumentiert.
2) Die Backup-Ziele (z. B. Filen.io, SMB/NAS) sind konfigurierbar und die Backup-Dateien sind am Ziel vorhanden.
3) Die Sicherung umfasst Mattermost-Uploads, Nextcloud-Daten und die PostgreSQL-Datenbank.
4) Backup-Dateien werden mindestens 30 Tage aufbewahrt und sind nach diesem Zeitraum weiterhin abrufbar.
5) Der Restore-Prozess ist dokumentiert und nachvollziehbar; eine heruntergeladene Backup-Datei kann entpackt und die Daten daraus wiederhergestellt werden.',
  test_cases = 'Kein automatisierter Test vorhanden (SA-07.sh existiert nicht im Repository). Die Prüfung erfordert manuelle Überprüfung der Backup-Container-Logs, des Backup-Ziels sowie einen Restore-Test auf einer separaten Umgebung.'
WHERE id = 'SA-07';
