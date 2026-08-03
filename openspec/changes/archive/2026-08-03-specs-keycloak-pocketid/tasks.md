---
title: "specs-keycloak-pocketid — Implementation Plan"
ticket_id: T002179
domains: [docs, auth]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# specs-keycloak-pocketid — Implementation Plan

_Ticket: T002179_

## File Structure

```
openspec/specs/auth-sso.md                  geändert   66 Treffer, 22 in Überschriften — Provider-Spec, zuerst
openspec/specs/secret-rotation.md           geändert   31 Treffer, 11 in Überschriften
openspec/specs/software-factory.md          geändert   24 Treffer,  6 in Überschriften
openspec/specs/workspace-deploy.md          geändert   23 Treffer,  7 in Überschriften
openspec/specs/brett.md                     geändert   22 Treffer,  5 in Überschriften
openspec/specs/vaultwarden-integration.md   geändert   19 Treffer,  3 in Überschriften
openspec/specs/fleet-operations.md          geändert   15 Treffer,  5 in Überschriften
openspec/specs/nextcloud-integration.md     geändert   14 Treffer,  4 in Überschriften
openspec/specs/security.md                  geändert   12 Treffer,  2 in Überschriften
openspec/specs/database.md                  geändert   11 Treffer,  1 in Überschrift
openspec/specs/centralized-logging.md       geändert    9 Treffer,  3 in Überschriften
openspec/specs/ticket-system.md             geändert    8 Treffer,  0 in Überschriften
openspec/specs/portal.md                    geändert    7 Treffer
openspec/specs/ci-cd.md                     geändert    6 Treffer
openspec/specs/website-core.md              geändert    5 Treffer
openspec/specs/mediaviewer.md               geändert    5 Treffer
openspec/specs/backup-pipeline.md           geändert    4 Treffer
openspec/specs/admin-cockpit.md             geändert    4 Treffer
openspec/specs/monitoring-alerts.md         geändert    2 Treffer
openspec/specs/chat-inbox.md                geändert    2 Treffer
openspec/specs/secrets-deploy-automation.md geändert    1 Treffer
openspec/specs/questionnaire-system.md      geändert    1 Treffer
openspec/specs/mcp-gateway.md               geändert    1 Treffer
openspec/specs/coaching-sessions-polish-guide.md geändert 1 Treffer
openspec/specs/active-sessions-hub.md       geändert    1 Treffer
```

Kein Code und keine Testdatei wird angefasst. `openspec/changes/archive/**` bleibt unberührt —
dort ist Keycloak historisch korrekt.

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschliesslich Markdown unter
     openspec/specs/ ändert; website/src/lib/identity.ts wird nur gelesen, um den Ist-Zustand
     der Admin-API-Authentifizierung und die Realm-/Kc-Bezeichner zu belegen -->

Die G1-Warnungen zu Task 4 und 5 (zwölf bzw. dreizehn Dateien pro Task) sind bewusst in Kauf
genommen: eine Doku-Bereinigung über 25 Dateien in 25 Tasks zu zerlegen erhöht die Buchführung,
ohne das Risiko zu senken. Die Gruppierung folgt dem strukturellen Gewicht (Treffer in
Überschriften), nicht der Dateizahl.

## Task 1 — Ausgangszustand festhalten und Kategorien-Raster anlegen

```bash
grep -ric keycloak openspec/specs/ | grep -v ':0$' | sort -t: -k2 -rn > /tmp/kc-before.txt
grep -rio keycloak openspec/specs/ | wc -l    # erwartet: 309
```

Zusätzlich der Nachweis, dass keine Testdatei am Spec-Text hängt — das ist die Voraussetzung
dafür, dass dieser Change überhaupt ohne Testnetz gefahren werden darf:

```bash
grep -rln 'openspec/specs' tests/spec/*.bats | while read -r f; do
  grep -Hn 'openspec/specs' "$f" | grep -v '^\s*#' || true
done
# erwartet: nur Kopfkommentare (# SSOT: openspec/specs/<slug>.md), keine Assertion
```

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats tests/spec/pocket-id-migration.bats
# expected: FAIL — auth-sso.bats und pocket-id-migration.bats müssen VOR der Textarbeit
# grün sein; ein Fehlschlag hier bedeutet, dass der Ausgangszustand nicht sauber ist und
# spätere Rot-Meldungen nicht mehr diesem Change zugeordnet werden können
```

Läuft dieser Lauf grün, ist der Ausgangszustand belegt und die Zeile im PR zu vermerken. Läuft er
rot, wird die Ursache zuerst geklärt — nicht überschrieben.

**Akzeptanz:** 309 Treffer über 25 Dateien bestätigt; belegt, dass kein Spec-Test Spec-Prosa
prüft; Ausgangslauf der beiden Auth-Testdateien dokumentiert.

## Task 2 — auth-sso.md: Kategorie 1 und 3 abarbeiten

Die Provider-Spec zuerst, weil sie die Begriffe definiert, auf die die übrigen 24 Dateien
verweisen. In diesem Task nur die unstrittigen Fälle:

- **Kategorie 1** — „Keycloak" als Platzhalter für den OIDC-Provider (Z. 7, 19, 23, 27, 34, 77,
  79, 85, 87, 92, 188, 191, 200, 364, 367 und weitere). Provider-Name ersetzen.
- **Kategorie 3** — Migrationsbeschreibungen, in denen Keycloak korrekt als Vorgängerzustand
  steht. **Unverändert lassen** und im PR als bewusst übersprungen vermerken.
- **Kategorie 4** — Zitate von Code-Bezeichnern. `website/src/lib/identity.ts` exportiert gegen
  Pocket ID `listRealmRoles()`, `getUserRealmRoles()`, `assignRealmRole()` und den Typ `KcRole`.
  Wo die Spec diese Namen nennt, ist der Text **korrekt** und bleibt. Gegenprobe vor jeder
  Änderung an einer Zeile mit `Realm` oder `Kc`:

```bash
grep -n 'listRealmRoles\|getUserRealmRoles\|assignRealmRole\|KcRole' website/src/lib/identity.ts
```

Jede geänderte Zeile wandert mit Kategorie in die PR-Tabelle. Kategorie 2 bleibt in diesem Task
ausgespart.

**Akzeptanz:** alle Kategorie-1-Stellen in `auth-sso.md` umgestellt; Kategorie-3- und
Kategorie-4-Stellen unverändert und begründet aufgelistet; `task openspec:validate` grün.

## Task 3 — auth-sso.md: Kategorie 2 recherchieren und neu formulieren

Hier reicht Textersatz nicht — die Spec beschreibt Mechanik, die Pocket ID nicht hat. Für jede
Position wird der Ist-Zustand **am Code oder Manifest belegt**, bevor formuliert wird.

### 3a — Das Realm-Import-Requirement ersetzen

```
### Requirement: Realm-Import mit Platzhalter-Validierung beim Start
#### Scenario: Erfolgreiches Import beim ersten Cluster-Start
#### Scenario: Fehlschlag bei fehlendem Secret
#### Scenario: Idempotenter Re-Import bei Pod-Neustart
```

beschreibt `import-entrypoint.sh` und `kc.sh import --override false`. Pocket ID kennt weder
Realms noch Realm-Import. Der heutige Vorgang ist der Seed-Job:

```bash
sed -n '1,80p' k3d/pocket-id-client-seed.yaml
grep -n 'oidc_clients' -r scripts/ k3d/ | head
```

Das Requirement wird als Client-Seeding neu geschrieben: Provisionierung über die Admin-REST-API,
Ablage in `pocket_id.oidc_clients`, Rückschreiben der Client-Secrets nach `workspace-secrets`
(und für den Website-Client zusätzlich nach `website-secrets`, siehe
`k3d/pocket-id-client-seed-website-rbac.yaml`). Die drei Szenarien werden auf den Seed-Job
übertragen: Erstprovisionierung, Fehlschlag bei fehlendem API-Key, Idempotenz bei erneutem Deploy.

### 3b — Admin-API-Authentifizierung

Zeilen 124-126 beschreiben die Admin REST API mit `admin-cli`-Credentials. Belegt ist das Gegenteil:

```bash
grep -n 'X-API-KEY\|POCKET_ID_API_KEY' website/src/lib/identity.ts
```

`identity.ts:20-22` nutzt `X-API-KEY` mit dem Kommentar, dass Pocket ID v2.9.0 kein
`Authorization: Bearer` akzeptiert. Der Spec-Text wird darauf umgestellt.

### 3c — Die verbleibenden vier Positionen

| Zeile | Beschreibt | Zu klären |
|---|---|---|
| 110, 117 | Brute-Force-Sperre mit `waitIncrementSeconds` | Gibt es bei Pocket ID einen äquivalenten Schutz? Falls nein, Requirement streichen und im PR begründen — nicht stillschweigend umbenennen |
| 139 | Passwort-Reset-Mail über SMTP | Pocket ID ist passkey-first; prüfen ob der Flow überhaupt existiert |
| 145 | `arena`-Audience-Claim im Access-Token | Wie wird die Audience heute gesetzt? |
| 188-200 | OIDC-Logout mit SSO-Session-Invalidierung | Endpoint-Pfad bei Pocket ID |

Für jede Position gilt dieselbe Regel: **erst belegen, dann formulieren.** Lässt sich der
Ist-Zustand nicht belegen, wird die Stelle als offen markiert und im PR benannt, statt eine
plausibel klingende Beschreibung zu erfinden. Eine falsche Spec ist schlechter als eine
veraltete, weil sie Vertrauen genießt.

**Akzeptanz:** Realm-Import-Requirement durch Client-Seeding ersetzt; Admin-API-Authentifizierung
auf `X-API-KEY` korrigiert; die vier Restpositionen entweder belegt neu formuliert oder als offen
markiert; kein Verweis mehr auf Realms, Realm-Import oder `kc.sh` als aktuelles Verhalten;
`task openspec:validate` grün.

## Task 4 — secret-rotation.md und die übrigen elf Dateien mit Überschriften-Treffern

Reihenfolge nach Gewicht: `secret-rotation.md` (31/11), `software-factory.md` (24/6),
`workspace-deploy.md` (23/7), `brett.md` (22/5), `vaultwarden-integration.md` (19/3),
`fleet-operations.md` (15/5), `nextcloud-integration.md` (14/4), `security.md` (12/2),
`database.md` (11/1), `centralized-logging.md` (9/3).

Treffer in Requirement- oder Scenario-Überschriften sind der verlässlichste Kategorie-2-Indikator
— dort beschreibt der Block meist provider-spezifische Mechanik. Vorgehen je Datei:

```bash
grep -n -i -E '^#+.*(keycloak|realm)' openspec/specs/<datei>.md   # Kategorie-2-Kandidaten
grep -n -i 'keycloak' openspec/specs/<datei>.md                    # alle Treffer
```

`secret-rotation.md` verdient besondere Aufmerksamkeit: Rotation von Client-Secrets funktioniert
bei Pocket ID grundlegend anders (Seed-Job schreibt zurück statt Realm-Export), und die Datei
trägt mit elf Überschriften-Treffern nach `auth-sso.md` das zweitgrößte strukturelle Gewicht.

**Akzeptanz:** alle elf Dateien durchgegangen; jede geänderte Zeile in der PR-Tabelle mit
Kategorie; Kategorie-2-Blöcke belegt neu formuliert; `task openspec:validate` nach jeder Datei grün.

## Task 5 — Die dreizehn Dateien mit wenigen Treffern

`portal.md` (7), `ci-cd.md` (6), `website-core.md` (5), `mediaviewer.md` (5),
`backup-pipeline.md` (4), `admin-cockpit.md` (4), `monitoring-alerts.md` (2), `chat-inbox.md` (2),
`secrets-deploy-automation.md`, `questionnaire-system.md`, `mcp-gateway.md`,
`coaching-sessions-polish-guide.md`, `active-sessions-hub.md` (je 1).

Überwiegend Kategorie 1. Die Kategorie-4-Gegenprobe bleibt Pflicht — gerade bei Einzeltreffern
ist die Versuchung am größten, ohne Kontextprüfung zu ersetzen.

```bash
grep -rn -i 'keycloak' openspec/specs/ | grep -vE 'archive/'
```

**Akzeptanz:** alle dreizehn Dateien durchgegangen; verbleibende Keycloak-Nennungen ausschliesslich
Kategorie 3 oder 4 und im PR einzeln begründet.

## Task 6 — Final Verification

Zuerst der inhaltliche Nachweis: jede verbliebene Nennung ist eine bewusste Entscheidung.

```bash
grep -rn -i 'keycloak' openspec/specs/ | wc -l
# Jede verbleibende Zeile muss in der PR-Tabelle als Kategorie 3 (historisch) oder
# Kategorie 4 (Code-Bezeichner) begründet sein. Eine Zahl allein ist kein Nachweis.

grep -rn -iE 'kc\.sh|import-entrypoint|/admin/realms|realm\.json|admin-cli' openspec/specs/
# erwartet: leer — keine Keycloak-Mechanik mehr als aktuelles Verhalten
```

Gegenprobe, dass Code und Spec nicht auseinandergelaufen sind:

```bash
grep -n 'listRealmRoles\|getUserRealmRoles\|assignRealmRole\|KcRole' website/src/lib/identity.ts
# Diese Bezeichner existieren weiterhin; wo eine Spec sie nennt, muss der Text sie
# unverändert nennen.
```

Dann die drei verpflichtenden Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Und der Beleg, dass die Auth-Tests unverändert grün sind:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats tests/spec/pocket-id-migration.bats
git diff --stat main -- tests/
# erwartet: leer — dieser Change fasst keine Testdatei an
```

**Akzeptanz:** keine Keycloak-Mechanik mehr als aktuelles Verhalten; jede verbliebene Nennung
einzeln als Kategorie 3 oder 4 begründet; `task openspec:validate` grün; die drei Gate-Kommandos
grün; `git diff main -- tests/` leer; PR enthält die vollständige Kategorisierungstabelle.
