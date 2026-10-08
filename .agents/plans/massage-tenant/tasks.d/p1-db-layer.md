---
title: "massage-tenant — p1 Datenschicht"
ticket_id: T901440
domains: [database, infra, website]
status: active
---

# massage-tenant — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `k3d/shared-db.yaml` | 352 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `k3d/website.yaml` | 852 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `k3d/website-schema.yaml` | 1970 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `k3d/shared-db-endpoint-policy.yaml` | 32 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `k3d/network-policies.yaml` | 629 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `k3d/backup-cronjob.yaml` | 340 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `environments/schema.yaml` | 1759 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `taskfiles/Taskfile.data.yml` | 663 | n/a (YAML ohne S1-Limit; kein Baseline-Eintrag) |
| `migrations/20261008-massage-brand-checks.sql` | 0 (neu) | n/a (SQL ohne S1-Limit) |
| `components/website/src/db/migrations/20261008_massage_brand_checks.sql` | 0 (neu) | n/a (SQL ohne S1-Limit) |

Quellen: Design, Aufgabenmanifest und intel.json; Ist-Werte zusätzlich an den wirklichen
Dateien geprüft. gates.yaml kennt weder YAML- noch SQL-Limits. Keine Baseline-/Ignore-Erweiterung.
Keine Änderung an TypeScript, Svelte oder Astro, daher keine neue Importkante oder any-Verwendung.
<!-- vitest: kein neuer Test nötig, weil nur Manifeste, SQL und bestehende Task-Konfiguration geändert werden; Verhalten wird in p5 durch pytest und PostgreSQL geprüft -->

## Befund und feste Grenzen

Die zentrale DB erhält zwei voneinander getrennte Rollen/Datenbanken: website_massage und
pocket_id_korczewski. Keine Mitgliedschaft in website, keine Rechte auf der mentolder-DB,
kein globales REASSIGN OWNED und kein neuer Datenbankserver. Auf keiner Verbindung darf das
Passwort ausgegeben werden; kein shell xtrace und keine URL mit Passwort als Log-Ausgabe.

Die aktuelle Endpoint-Policy ist eine dokumentierende ConfigMap, keine NetworkPolicy.
Der wirkliche Website-Ingress steht in k3d/network-policies.yaml. Der Backup-CronJob zählt
aktuell nur nextcloud/vaultwarden/website auf; neue Datenbanken werden nicht automatisch erfasst.
Die beiden Migration-Runner haben verschiedene Verzeichnisse und Tracking-Tabellen:
Factory: scripts/migrate-db.mjs → migrations/ → factory_schema_migrations;
Website: pnpm --dir components/website db:migrate → src/db/migrations/ → schema_migrations.
Der Task db:migrate benutzt bisher nur den Factory-Runner und die feste DB website.

Der SQL-Runner allein baut kein vollständiges frisches Website-Schema auf. Vorher ist der
bestehende ensure-meetings-Schema-Block nötig; er und ältere SQL-Dateien benutzen die Rolle
website bei GRANT, SET ROLE und ALTER OWNER. Diese Rolle bleibt in der gemeinsamen Instanz
vorhanden, erhält aber keine dauerhaften Rechte auf website_massage. Bootstrap und spätere
Ownership-Normalisierung laufen ausschließlich auf einer ausdrücklich geprüften Ziel-DB.

Audit der CHECK-Schreibpfade:

| Tabelle | tatsächlicher Pfad / Entscheidung |
|---|---|
| free_time_windows | appointments-db.ts speichert Owner-Zeitfenster; CHECK erweitern |
| legal_pages | website-core-db.ts und content-store-db.ts schreiben Rechtstexte; CHECK erweitern |
| site_settings | Content-Store speichert heutige Homepage hier; Rechnungen lesen creditor_* und tax_mode; CHECK erweitern |
| homepage_block_documents | historische Root-Migration beschränkt Brand; heute legacy, kompatibel erweitern falls vorhanden |
| homepage_block_versions | historische Root-Migration beschränkt Brand; heute legacy, kompatibel erweitern falls vorhanden |
| inbox_items | Anfrage-Payload über Messaging-Inbox; kein restriktiver CHECK aus den auditierten Root-Migrationen |
| customers / business_memberships | Kundendaten und Brand-Zuordnung; brands-FK benötigt Seed massage |
| massage_invoices / massage_invoice_sequences | separate Massage-SQL-Migration und brands-FK; Seed nötig, kein billing-CHECK ändern |
| content_versions / service_page_config | Content-Store-Versionen bzw. Services; kein hier auditiertes restriktives Brand-CHECK erweitern |

Genau die fünf genannten CHECKs werden erweitert. Andere Constraints, insbesondere alle
billing_*, invoice_counters, leistungen_config, service_config und die SDLC/Workspace-Schemas,
bleiben unverändert. Der Massage-Leistungskatalog kommt aus content/massage/leistungen.json;
eine pauschale Freigabe aller historischen Tabellen wäre außerhalb des Betriebsauftrags.

## Task 1: Rote Vertragsprüfungen mit p5 abstimmen

p5 besitzt sämtliche Testdateien und schreibt sie vor der zugehörigen Implementierung.
Vorab neue Rollen, leere/fehlende Secret-Keys, echte gerenderte NetworkPolicy,
Backup-Ziele, Massage-Schreibbarkeit und mentolder-Parität als Contracts übergeben.
Der p5-Agent führt den echten Runner vor Änderungen aus und dokumentiert expected: FAIL:

```bash
bash scripts/pytest-run.sh tests/py/spec/massage-tenant/test_shared_db_roles.py tests/py/spec/massage-tenant/test_brand_migration.py tests/py/spec/massage-tenant/test_db_network_policy.py
```

Rot muss fehlendes Verhalten nachweisen, keinen Import-/Fixture-Fehler. Reale DB-Prüfungen
nur auf explizit bereitgestellter, löschbarer Test-DB; ohne Test-DB sichtbarer skip.
Keine Produktionsdatenbank als Test-Fixture benutzen. p5 passt SA-22 gezielt an: die neue
ADR-012-Ausnahme erlaubt die zentrale DB, der eingefrorene korczewski-eigene Server bleibt
unzugänglich. TCP-Zugriff ist keine Authentisierungs-/Datenisolation; beide getrennt prüfen.

## Task 2: Rollen, Secret-Schema und Website-Verbindung

1. In shared-db.yaml beide neuen Rollen in ConfigMap-initdb und postStart idempotent anlegen,
   die DB-Loops um die passenden gleichnamigen DBs mit gleichnamigem Owner ergänzen.
   Bestehende Rollen und deren Passwort-Synchronisierung nicht umschreiben.
2. Beide neuen Container-Env-Werte aus workspace-secrets einlesen, jeweils optional: true,
   damit ein noch fehlender Key keinen bestehenden shared-db-Pod am Start hindert.
   Vor jedem neuen ALTER PASSWORD auf nicht-leer prüfen. Laufzeitvariablen mit der bestehenden
   Dollar-Escaping-Konvention erhalten; das gerenderte Script muss die echten Werte erst
   im Container lesen. Keine globale Passwortänderung und keine leere Passwort-Zuweisung.
   Passwortübergabe per psql-Variablen und SQL-Literal-Quoting, nicht ungeprüfte Stringinterpolation.
3. Neue Secret-Keys WEBSITE_MASSAGE_DB_PASSWORD und POCKET_ID_KORCZEWSKI_DB_PASSWORD
   im vorhandenen Secret-Schema mit generate/length und optionalem Einführungsstatus aufnehmen.
   Massage-Key zusätzlich für website-secrets exportierbar machen. Die Werte werden in
   zentralem mentolder-workspace-secrets und korczewski-Secrets identisch versiegelt;
   p4 dokumentiert Operator-Kopplung, der Plan erzeugt/versiegelt keine Secrets.
4. WEBSITE_DB_NAME, WEBSITE_DB_USER und WEBSITE_DB_NAMESPACE als nicht-geheime Schema-
   Variablen aufnehmen. Name/User default website; Namespace erhält die bisherige
   WORKSPACE_NAMESPACE-Auflösung. Keine fest geschriebene Brand-Domain.
5. SESSIONS_DATABASE_URL in website.yaml auf diese Variablen umstellen. Kubernetes-
   Expansion $(WEBSITE_DB_PASSWORD) erhalten und Passwort-Env davor belassen.
   p3 setzt den korczewski-Wert/Secret-Key; mentolder und dev behalten bisherigen Host,
   Benutzer, DB und Passwort-Key. URL-SSL-Verhalten nicht beiläufig ändern.

## Task 3: Frischen Schema-Bootstrap und Migration konkret verdrahten

1. Nur die psql-Ziel-DB-Argumente im bestehenden init-meetings/ensure-meetings-Script über
   WEBSITE_SCHEMA_DB mit Laufzeitdefault website parametrieren; das große DDL nicht kopieren.
   Normaler shared-db-postStart bleibt bei website. Kein periodischer Massage-Bootstrap,
   der vorherige Eigentümerzuordnungen wieder zurücksetzt.
2. Im bestehenden db:migrate-Task WEBSITE_DB_NAMESPACE/WEBSITE_DB_NAME aus env-resolve
   verwenden, mit identischen Defaults für bestehende Brands. Namespace für den zentralen
   Service und dessen Secret aus dieser DB-Konfiguration ableiten, nicht aus Website-NS.
   Vor Mutation Ziel-Namespace/DB bestätigen; WEBSITE_SCHEMA_DB wird nur für den expliziten
   Massage-Zweig gesetzt. Fester Massage-Zweig wird bei DB website_massage gewählt.
3. Für website_massage: Deployment im zentralen Namespace bereit abwarten; bestehenden
   ensure-meetings-Block gezielt dort gegen website_massage ausführen, Seed massage ergänzen,
   dann den bestehenden Website-SQL-Runner als privilegierten Migrationsnutzer gegen genau
   website_massage ausführen. Zugang aus zentralem Secret beziehen, ausschließlich intern
   weitergeben, Portforward via trap aufräumen. Der bisherige Factory-Pfad für andere DBs
   bleibt erhalten. Die alte Factory-Migrationshistorie ist auf frisch fehlenden Tabellen
   nicht sicher und wird im Massage-Zweig nicht vollständig wiederholt.
4. Im Bootstrap Seed massage nur für Massage-Ziel-DB einfügen; bestehende mentolder-
   brands-Zeilen und Name-Werte bleiben unverändert. Sicherstellen, dass brands vor den
   Invoice-/Membership-FKs existiert und massage vor ersten Runtime-Schreibzugriffen vorliegt.
5. Nach Bootstrap und Website-Runner DB-lokale Eigentümerrechte anhand pg_namespace,
   pg_class und pg_proc für die erzeugten Anwendungsobjekte normalisieren: Schemas,
   Tabellen, Sequenzen und benötigte Funktionen von postgres/website zu website_massage.
   System-/Extension-Objekte ausschließen; keine clusterweiten Shared-Objects oder globale
   Rollenmitgliedschaften ändern. Nur bei abweichendem Owner ALTER OWNER ausführen.
   Etwaige explizite website-GRANTs auf dieser DB widerrufen, ohne Privilegien auf website
   anzutasten. Die Massage-App muss neue Tabellen und FKs selbst erzeugen dürfen.
6. Zweiter vollständiger Massage-Task-Lauf muss idempotent sein: gleiche Migration-Tracking-
   Einträge, gleicher Owner, erhaltene Testdaten. Errors werden nicht als erfolgreiche
   Bootstrap-/Migrationsschritte verschluckt. Bestehende Runner-Backfill-Logik nicht ausweiten.

## Task 4: Additive Brand-Migration und Datenbankrechte

Neue, lexikalisch nach den bestehenden Tagesmigrationen laufende Dateien anlegen:
Root migrations/20261008-massage-brand-checks.sql für vorhandene Factory-DBs und die
Website-Migration 20261008_massage_brand_checks.sql für den Massage-Runner. Beide enthalten
semantisch dieselbe bounded CHECK-Korrektur, die p5 auf Parität prüft. Historische SQL nicht editieren.

Jede der fünf erlaubten public-Tabellen mit to_regclass() schützen. Nur den bekannten
chk_brand_<table>-CHECK entfernen falls vorhanden und den gleichnamigen CHECK mit
mentolder/korczewski/massage hinzufügen. Bei erneutem Lauf bestehenden neuen CHECK erkennen;
keine anderen CHECKs/FKs entfernen. Fehlende Legacy-Tabellen sind ein erlaubter No-op.
SQL-Literal- und Identifier-Quoting für dynamische DDL benutzen. Unbekannte Brand muss
weiterhin abgewiesen werden. site_settings erhält die drei erlaubten Brands; die frühere
mentolder-Einschränkung anderer Config-Tabellen bleibt bestehen.

Die Website-Migration ist im tatsächlichen Website-Runner-Verzeichnis erreichbar; die
Root-Datei im bestehenden Factory-Verzeichnis. Der Migrationstest beweist die Anwendung,
nicht allein das Vorhandensein eines Dateinamens. Kein neuer Shell-Runner nötig.

## Task 5: Gerenderte Netzwerkfreigabe und Backup

1. In k3d/network-policies.yaml den shared-db-Ingress um genau die beiden Namespace-Peers
   website-korczewski und workspace-korczewski erweitern. Bestehenden WEBSITE_NAMESPACE-
   Peer erhalten. Falls Umgebungsscope eine bedingte Fleet-Erweiterung verlangt, über die
   vorhandene Render-Konfiguration begrenzen, keine leere namespaceSelector:{}-Freigabe.
   Target bleibt app=shared-db, TCP 5432 und Namespace workspace im mentolder-Fleet-Render.
   Base-Policy wird durch existierende kustomization eingebunden; kein neues Orphan-Manifest.
   endpoint-policy.yaml dokumentiert weiterhin ausschließlich no-public-exposure.
2. Backup-CronJob um website_massage und pocket_id_korczewski ergänzen, beide neuen Passwörter
   optional aus zentralem Secret einlesen. Vor Aktivierung ohne diese Werte neue Ziele explizit
   als noch unkonfiguriert überspringen, ohne vorhandene Backups abzubrechen; nach Operator-
   Einrichtung beide verbindlich dumpen. pg_dump verwendet je Ziel seine gleichnamige Rolle,
   bestehende PGDMP/Größenprüfungen, Verschlüsselung, Upload und Retention behalten.
   Fehlgeschlagene konfigurierte Dumps bleiben Fehler. p4 verlangt Nachweis beider Archive,
   damit ein Überspringen nach Inbetriebnahme nicht als erfolgreiche Backup-Abnahme gilt.
3. Netzwerk- und Backup-Vertrag in p5 aufnehmen: positive Website-/Pocket-ID-Peers,
   negative beliebige Namespaces/Ports, vollständige beiden Dump-Ziele und Secret-Key-Zuordnung.

## Task 6: Finale Verifikation

p5 führt denselben Vertragsrunner nach Umsetzung erneut aus, expected: PASS. Dazu optional
reales PostgreSQL: frische DB bootstrap + Migration zweimal, INSERT/UPDATE mit massage für
alle existierenden Audit-Tabellen, unknown-brand Ablehnung, billing-CHECK unverändert,
Runtime-Zugriff als website_massage und verweigerter Zugriff auf mentolder-Tabellen als
neue Rolle. Den bekannten mentolder-Zweig als Positiv-Anker mitmessen.

```bash
bash scripts/pytest-run.sh tests/py/spec/massage-tenant/test_shared_db_roles.py tests/py/spec/massage-tenant/test_brand_migration.py tests/py/spec/massage-tenant/test_db_network_policy.py
task workspace:validate
./tests/runner.sh local SA-22
task test:changed
task freshness:regenerate
task freshness:check
```

SA-22 verlangt explizit verfügbaren Fleet-Kontext; ohne Cluster nicht als bestanden ausgeben.
Renderdiff für mentolder auf die absichtlichen neuen DB-/Backup-/Netzwerkressourcen begrenzen;
Website-Verbindungsdefaults müssen identisch sein. Kein unbeabsichtigter öffentlicher 5432-
Endpoint, keine neue Host-Hardcodierung, keine Baseline-Erweiterung. Test-Inventar-Dateien
und Regeneration der neuen Tests bleiben Verantwortung von p5. Keine Implementierung,
Deploy-Ausführung oder Secret-Aktion im Plan-Autorisierungsschritt.
