# Health-Goals: belastbare Messungen (T016657)

Die vorhandenen 122 Ziele bleiben fachlich unverändert. Das Problem ist eine Messpipeline, die Nullziele, steigende Vergleiche und historische Werte falsch grün darstellen kann. Der Fastscan vor Änderungen prüfte 122 Ziele: 55 erreicht, 16 offen, 4 Gate-Verstöße, 47 nicht messbar. Der anschließende Vollscan ergab 74 erreicht, 28 offen, 7 Gate-Verstöße, 13 SKIP. Einzelne CFG01/RH07/KNOW07-Probleme gingen auf fehlende Worktree-Abhängigkeiten zurück; nach Verlinkung sind sie erneut zu prüfen. Das ist ein Diagnosebestand, kein Auftrag, Infrastruktur oder Schwellen pauschal zu ändern.

## Bewertung

Eine reine Bewertungsfunktion entscheidet anhand endlicher Zahlen und Vergleich le/ge/eq. Ziel Null ist ein gültiger Wert. Gespeicherter Status kann numerische Evidenz nicht überstimmen. Fehlen aktuelle Werte oder Ziel, ist das Ergebnis unknown; unbekannt ist weder Null noch erreicht. Ist baseline gleich target und der aktuelle Wert verletzt die Grenze, ist der Status critical und der Fortschritt Null. Ohne baseline kann ein tatsächlich erfülltes Ziel erreicht sein, sonst bleibt die bestehende konservative Zwischenbewertung erhalten. Prozent und Ampel verwenden dieselbe Wahrheit; die alten Testannahmen „achieved ohne Zahlen = 100“ werden bewusst ersetzt.

DB-, generierte und Snapshot-Daten verwenden dieselbe Normalisierung. Datenquelle und ursprüngliches measured_at bleiben sichtbar. Es gibt keine neue pauschale Ablaufzeit: historisch gemessen und aktuell beobachtet müssen unterscheidbar bleiben. Fehler beim Rescan erzeugen keine frische grüne Ersatzmessung.

## Messung und Speicherung

Der Daemon misst standardmäßig alle definierten Ziele statt vier fest codierter Anker. Explizite IDs bleiben möglich. Für nicht messbare Ziele wird kein erfundener numerischer Wert gespeichert; eine unbekannte Messung darf vorhandene historische Evidenz transparent ablösen, wenn der Datenvertrag das erlaubt. Scanner-, JSON- und DB-Fehler ergeben einen fehlerhaften Prozessstatus mit Diagnose. Ein erfolgreicher Insert ist Voraussetzung für eine Erfolgsmeldung.

Die Admin-Rescan-Route validiert und autorisiert wie bisher. Erfolgreiche Ergebnisse werden parametrisiert und atomar gespeichert, bevor HTTP 200 zurückkommt. Ein DB-Fehler führt zu 500. Die Speicherung erhält Vergleichsinformationen, Messzeit und Commitherkunft soweit verfügbar. Ein reiner Bewertungshelper importiert keine DB-Schicht; eine getrennte Persistenzfunktion nutzt den bestehenden Pool.

Seed aktualisiert Definitionen ohne historische Messungen zu NOW umzuetikettieren. Ursprüngliche measured_at-Werte werden erhalten. Erneutes Seed darf identische historische Evidenz nicht vervielfachen oder neuere Live-Evidenz überdecken; idempotente Definitionen und messungsfreie Seeds sind vorzuziehen, wenn keine verlässliche historische Identität vorhanden ist.

## Prüfung und Grenzen

Pytest führt das echte Shell-Daemon-Skript in einem temporären Repo mit Scanner und kubectl als Prozessgrenzen aus. Kein Cluster und keine Produktionsdaten sind betroffen. Vitest testet exportierte Bewertung sowie die echte POST-Route, mit DB und Scanner als äußeren Grenzen. Seed wird mit temporären Dateien und aufgezeichnetem SQL ausgeführt. PostgreSQL-Transaktionssemantik wird zusätzlich mit bestehender DB-Prüfung verifiziert, nicht durch einen SQLite-Ersatz.

Nach der Pipeline-Reparatur werden unveränderte Ziele erneut gemessen. Verbleibende Gate-Verstöße und SKIP-Gründe bekommen ausführbare Belege und werden nach Aufwand und fehlenden Voraussetzungen getrennt. Keine Baseline-Ausnahmen, Gate-Aufweichungen, Produktionsskalierung oder geheimen Ersatzwerte.

## Belegte Fehlmessungen einzelner Ziele

G-AGENTIC10 muss aktuelle Domainrollen messen. G-IF02 darf rethrow nicht als stilles Verschlucken klassifizieren. G-CJ01 bewertet ausgeführte CronJobs und ignoriert suspendierte oder noch nie geplante Jobs. K3-Projektstatus muss das tatsächlich ausgegebene Format verstehen; K3-Freshness bezieht sich auf den kanonischen Checkout. Fehlender systemctl-Userbus liefert bei G-LLM04 unknown. Diese Änderungen korrigieren die Messgegenstände; sie lockern keine Zielschwellen. Gegenbeispiele (stiller catch, real fehlgeschlagener Job, disabled Unit, veralteter Receipt) bleiben Verstöße.
