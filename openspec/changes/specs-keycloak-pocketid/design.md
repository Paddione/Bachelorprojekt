---
title: openspec/specs von Keycloak auf Pocket ID umstellen — vier Kategorien, kein sed
ticket_id: T002179
domains: [docs, auth]
status: planning
plan_ref: openspec/changes/specs-keycloak-pocketid/tasks.md
---

# Design — specs-keycloak-pocketid

## Purpose

`openspec/specs/` beschreibt in 25 Dateien und 309 Fundstellen einen Identity Provider, den es
nicht mehr gibt. T002169 hat CLAUDE.md, AGENTS.md und den Agent-Kontext bereinigt und
`openspec/specs/` bewusst ausgeklammert — weil diese Dateien **Verhaltens-SSOT** sind und nicht
Prosa-Doku. Eine falsche Formulierung hier wird zur Referenz, gegen die künftig geplant und
implementiert wird.

## Warum kein Suchen-und-Ersetzen

Die Fundstellen zerfallen in **vier** Kategorien mit unterschiedlicher Behandlung. Die vierte
ist bei der Ticket-Erstellung noch nicht erkannt worden und ist genau die, bei der ein `sed`
echten Schaden anrichten würde.

### Kategorie 1 — Reine Umbenennung

„Keycloak" steht als Platzhalter für „der OIDC-Provider". Beispiele aus `auth-sso.md`: „Keycloak
ist der einzige Identity Provider der Plattform" (Z. 7), „der Nutzer sieht das Loginformular"
(Z. 27), „werden `access_token`, `refresh_token` und Nutzerinfos abgerufen" (Z. 79).

Behandlung: Provider-Name ersetzen. Das ist der größte, aber harmloseste Teil.

### Kategorie 2 — Faktisch überholtes Verhalten

Hier beschreibt die Spec eine Mechanik, die Pocket ID nicht hat. Der Textersatz allein erzeugt
eine **falsche** Spec, die schlimmer ist als die veraltete, weil sie plausibel aussieht.

Der schwerste Fall steht in `auth-sso.md` als eigenständiges Requirement:

```
### Requirement: Realm-Import mit Platzhalter-Validierung beim Start
#### Scenario: Erfolgreiches Import beim ersten Cluster-Start
#### Scenario: Fehlschlag bei fehlendem Secret
#### Scenario: Idempotenter Re-Import bei Pod-Neustart
```

mit `import-entrypoint.sh` und `kc.sh import --override false`. Pocket ID kennt **keine Realms
und keinen Realm-Import**. Clients liegen in `pocket_id.oidc_clients` und werden vom
`pocket-id-client-seed`-Job über die Admin-REST-API provisioniert (`k3d/pocket-id-client-seed.yaml`).
Das Requirement muss inhaltlich neu geschrieben werden — es beschreibt heute den Seed-Job.

Weitere Kategorie-2-Stellen in `auth-sso.md`:

| Zeile | Beschreibt | Ist-Zustand zu recherchieren |
|---|---|---|
| 124-126 | Admin REST API mit `admin-cli`-Credentials | `identity.ts` nutzt `X-API-KEY` mit `POCKET_ID_API_KEY` (belegt in T002181) |
| 110, 117 | Brute-Force-Sperre mit `waitIncrementSeconds` | Hat Pocket ID einen äquivalenten Mechanismus? |
| 139 | Passwort-Reset-Mail über SMTP | Pocket ID ist passkey-first — gibt es das noch? |
| 145 | `arena`-Audience-Claim im Access-Token | Wie wird die Audience heute gesetzt? |
| 188-200 | OIDC-Logout mit SSO-Session-Invalidierung | Endpoint-Pfad bei Pocket ID? |

`realm` kommt in 12 Dateien vor, `/admin/realms` in 2, `realm.json` in 2. `kcadm` kommt
**nicht mehr** vor — die Kategorie ist also kleiner als bei der Ticket-Erstellung angenommen,
aber die verbleibenden Stellen sind inhaltlich schwer.

### Kategorie 3 — Historischer Kontext

Migrationsbeschreibungen, in denen Keycloak korrekt als Vorgängerzustand steht. Diese Sätze sind
**richtig** und werden nicht angefasst. Ein Ersetzen würde die Geschichte verfälschen und
Migrationsspecs unlesbar machen.

### Kategorie 4 — Code-Bezeichner mit Realm-/Kc-Präfix (neu erkannt)

`website/src/lib/identity.ts` exportiert gegen **Pocket ID**:

```
export async function listRealmRoles(): Promise<KcRole[]>
export async function getUserRealmRoles(userId: string): Promise<KcRole[]>
export async function assignRealmRole(userId: string, roles: KcRole[]): Promise<boolean>
```

Die Namen tragen `Realm` und `Kc` als Altlast aus der Migration, sprechen aber mit dem aktuellen
Provider — `identity.ts:186` loggt sogar `'Pocket ID assignRealmRole failed'`. Wo eine Spec
diese Bezeichner zitiert, ist der Text **korrekt** und darf nicht geändert werden: sonst
beschreibt die Spec eine API, die es nicht gibt.

Ein `sed 's/Realm/…/'` über `openspec/specs/` würde genau hier Spec und Code auseinanderlaufen
lassen — unbemerkt, weil kein Test das prüft (siehe unten).

## Was die Arbeit erleichtert

Zwei Befunde aus der Planungsphase reduzieren das Risiko erheblich:

**Kein Spec-Test hängt am Spec-Text.** `tests/spec/auth-sso.bats` referenziert die Spec nur im
Kopfkommentar (`# SSOT: openspec/specs/auth-sso.md`) und prüft gerenderte Manifeste.
`tests/spec/pocket-id-migration.bats` prüft Manifeste und Code (`k3d/*.yaml`, `identity.ts`,
`auth.ts`), nicht Spec-Prosa. Textänderungen können also keine Tests brechen.

Die Kehrseite: es gibt auch keinen Test, der eine **falsche** Spec-Änderung auffängt. Die
Qualitätssicherung muss vollständig im Vorgehen liegen — deshalb die Kategorisierungspflicht
pro Fundstelle im Plan.

**`kcadm` ist bereits verschwunden.** Der aufwendigste Kategorie-2-Fall aus dem Ticket
(CLI-Aufrufe umschreiben) entfällt.

## Verteilung als Arbeitsgrundlage

| Datei | Treffer | davon in Überschriften |
|---|---|---|
| `auth-sso.md` | 66 | 22 |
| `secret-rotation.md` | 31 | 11 |
| `software-factory.md` | 24 | 6 |
| `workspace-deploy.md` | 23 | 7 |
| `brett.md` | 22 | 5 |
| `vaultwarden-integration.md` | 19 | 3 |
| `fleet-operations.md` | 15 | 5 |
| `nextcloud-integration.md` | 14 | 4 |
| `security.md` | 12 | 2 |
| `database.md` | 11 | 1 |
| `centralized-logging.md` | 9 | 3 |
| `ticket-system.md` | 8 | 0 |
| 13 weitere | 1-7 | — |

Treffer in Überschriften sind der verlässlichste Indikator für Kategorie 2: wo „Keycloak" oder
„Realm" im Requirement- oder Scenario-Titel steht, beschreibt der Block meist provider-spezifische
Mechanik und nicht nur den Provider-Namen. `auth-sso.md` und `secret-rotation.md` tragen zusammen
33 der 70 Überschriften-Treffer und sind damit der inhaltliche Schwerpunkt.

## Reihenfolge

`auth-sso.md` zuerst — es ist die Provider-Spec selbst, definiert die Begriffe und ist die
Referenz, auf die die übrigen 24 Dateien verweisen. Wer mit `database.md` anfängt, formuliert
gegen einen Sollzustand, den `auth-sso.md` noch nicht festlegt.

## Was NICHT im Scope ist

- Umbenennung der Code-Bezeichner (`listRealmRoles` etc.). Das wäre ein eigenes Refactoring mit
  Aufrufer-Anpassungen und gehört nicht in eine Spec-Bereinigung.
- `openspec/changes/archive/**` — dort ist Keycloak historisch korrekt.
- Das CI-Gate (T002182), das dieser Change mit entblockt.

## Verifikation

`task openspec:validate` ist das einzige maschinelle Gate. Es prüft Struktur, nicht Inhalt —
die inhaltliche Prüfung ist die Kategorisierungstabelle im PR, Datei für Datei.
