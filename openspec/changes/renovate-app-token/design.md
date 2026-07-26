---
ticket_id: T002161
plan_ref: openspec/changes/renovate-app-token/tasks.md
status: active
date: 2026-07-26
---

# Design: Renovate auf GitHub-App-Token umstellen

**Ticket:** T002161
**Typ:** fix (bug)
**SSOT-Spec:** `openspec/specs/ci-cd.md`

## Purpose

Renovate hat seit seiner Einführung (T000898, gemergt 2026-06-17) **nie** funktioniert. Alle
fünf Cron-Läufe (2026-06-22 bis 2026-07-20) brachen nach ~40 s ab. Folge: sämtliche von
Renovate verwalteten Dependencies driften still — nachgewiesen an Vaultwarden, das seit
2026-02-10 auf `1.35.3-alpine` steht, während Upstream bei `1.37.0` ist (2 Minors + 5 Patches,
~5,5 Monate). Dieser Change macht Renovate funktionsfähig und schließt dabei eine zweite
Lücke, die den Fix andernfalls gefährlich machen würde.

## Root-Cause-Analyse

### RC1 — Secret fehlt (unmittelbar)

`RENOVATE_TOKEN` existiert nicht als Repo-Secret. `renovatebot/github-action` startet den
Container, Renovate findet ein leeres Token und bricht bei der Platform-Authentifizierung ab.
Kein Repo-Scan → deshalb auch nie ein Dependency-Dashboard-Issue, das den Ausfall sichtbar
gemacht hätte.

Der Workflow dokumentiert die Voraussetzung selbst (`renovate.yml:6-9`), inklusive
*„First run: trigger manually via workflow_dispatch after setting RENOVATE_TOKEN"*. Dieser
manuelle Post-Merge-Schritt wurde nie ausgeführt. Es gab **keine Regression** — das Feature
war ab Tag eins tot.

### RC2 — Die Anleitung ist strukturell unmöglich (der eigentliche Fix-Grund)

Ein GitHub-App-**Installation**-Token hat **1 Stunde TTL**. Es kann nicht als statisches
Repo-Secret hinterlegt werden. Hätte man die Anleitung 2026-06 wörtlich befolgt, wäre Renovate
genau einen Lauf lang gelaufen und danach wieder still gestorben — mit demselben
`docker … exit code 1`, aber nun mit dem trügerischen Beweis „das Secret ist doch gesetzt".

Erschwerend verweist die T000898-Design-Spec
(`docs/superpowers/specs/2026-06-17-t000898-design.md:30`) auf `opencode.yml` als
App-Auth-Vorbild. Dieses Muster ist **nicht übertragbar**: `opencode.yml:30` nutzt
`id-token: write`, und der OIDC→Installation-Token-Exchange ist ein Feature der Action
`anomalyco/opencode/github`. `renovatebot/github-action` hat keinen solchen Exchange und
erwartet einen fertigen Token.

### RC3 — Automerge-Kollision (beim Brainstorming entdeckt, T002161-Scope)

`auto-enable-automerge.yml` setzt `--auto --squash --delete-branch` auf **jeder** Nicht-Draft-PR
gegen `main`. Branch-Protection auf `main` hat `reviews: null` — keine Review-Pflicht, nur
7 Required Checks.

Renovates `automerge: false` (für `major`, prod-`minor`, kubernetes-`major` in
`renovate.json5:104-108` u. a.) bedeutet ausschließlich *„Renovate selbst merged nicht"*. Es
verhindert nicht, dass ein anderer Workflow das Auto-Merge-Flag setzt. Die gestufte
Automerge-Policy aus T000898 ist damit faktisch außer Kraft.

Konkrete Konsequenz ohne Gegenmaßnahme: Beim ersten erfolgreichen Renovate-Lauf mergt der
Vaultwarden-Bump `1.35.3 → 1.37.0` ohne Review durch und wird via Flux (10-min-Reconcile) auf
**beide** Prod-Brands ausgerollt — bei einem Passwortmanager mit SSO-only/PKCE-Konfiguration.
Genau der Fall, für den die Policy `automerge: false` vorsieht.

## Fix-Ansatz

### Trennung langlebiges Geheimnis ↔ kurzlebiger Token

`actions/create-github-app-token` prägt bei **jedem** Run einen frischen Installation-Token
aus zwei langlebigen Secrets. Der Private Key läuft nie ab, der Token lebt nur für den Job
und wird im Post-Step automatisch revoked.

- **Version:** v3.2.0, SHA-gepinnt auf `bcd2ba49218906704ab6c1aa796996da409d3eb1` — gemäß der
  in `renovate.yml:44` dokumentierten Konvention für secret-tragende Third-Party-Actions
  (*„nie @latest"*).
- **Input `app-id:`** mit dem Secret `RENOVATE_APP_ID`, das die **numerische App ID** hält.
  `app-id` ist in v3 deprecated (`action.yml`: *„Use 'client-id' instead."*), funktioniert aber
  unverändert. Eine Migration auf `client-id` braucht **beides**: den Secret-Wert auf die
  Client ID umstellen *und* den Input umbenennen — deshalb hier bewusst in einem Schritt
  belassen und als Kommentar im Workflow vermerkt.
- **Output:** `steps.app-token.outputs.token`.
- **Kein `owner`/`repositories`-Input** — Default ist das aktuelle Repository, was genau dem
  Installationsumfang entspricht.

### Job-Permissions minimieren

Mit App-Token braucht der Job die Schreibrechte **nicht** mehr über `GITHUB_TOKEN`: sie kommen
aus dem App-Token. `contents: read` genügt für den Checkout. `id-token: write` wird **nicht**
gesetzt — es gibt keinen OIDC-Flow (siehe RC2).

### App-Permissions (beim Anlegen im UI)

| Permission | Level | Warum |
|---|---|---|
| Contents | Read and write | Renovate pusht Update-Branches |
| Pull requests | Read and write | PRs öffnen/aktualisieren, Auto-Merge-Flag setzen |
| **Workflows** | **Read and write** | **Pflicht**, sobald Renovate `.github/workflows/**` anfasst — und das tut es: `renovate.json5` hat einen `github-actions`-Manager mit `pinDigests: true`. Ohne diese Permission verweigert GitHub den Push (`refusing to allow a GitHub App to create or update workflow …`) — ein schwer deutbarer Teilausfall, bei dem npm-/k8s-Bumps funktionieren und nur Actions-Pins scheitern |
| Metadata | Read-only | wird von GitHub automatisch gesetzt |

Webhook deaktiviert (Renovate braucht keinen), Installation *Only on this account* → nur
`Paddione/Bachelorprojekt`.

### Automerge-Kollision auflösen (RC3)

Label-basierte Ausnahme statt Bot-Namens-Prüfung — der App-Slug (und damit
`pull_request.user.login`) hängt am frei gewählten App-Namen und wäre eine stille
Bruchstelle beim Umbenennen:

- `renovate.json5`: `labels: ["dependencies"]` + `platformAutomerge: true`
- `auto-enable-automerge.yml`: überspringt PRs, die das Label `dependencies` tragen

Damit setzt **Renovate selbst** das Auto-Merge-Flag — aber nur für PRs, die seine eigene
Policy erlaubt (`patch` + `devDependencies`). `major`, prod-`minor` und kubernetes-`major`
bleiben als offene Review-PRs stehen, exakt wie T000898 es spezifiziert hat.

## Trade-offs & Abwägungen

**`RENOVATE_TOKEN` env-Variable bleibt zusätzlich zum `token:`-Input gesetzt.** Die Action
mappt `token:` intern auf `RENOVATE_TOKEN`; beides zu setzen ist redundant. Wir behalten es
trotzdem, weil der funktionale Teil des Workflows so unverändert bleibt und nur der
*Token-Wert* wechselt — das minimiert die Zahl der Variablen, an denen der erste
Verifikations-Run scheitern kann. Aufräumen ist ein Chore für später, kein Fix-Scope.

**Scope-Erweiterung auf `auto-enable-automerge.yml` + `renovate.json5` bewusst akzeptiert.**
Alternative wäre gewesen, RC3 als Folgeticket zu führen. Verworfen: zwischen Merge dieses Fixes
und dem Folge-Fix läge ein Fenster, in dem Renovate-PRs ungeprüft durchmergen — der Fix würde
das Risiko erst erzeugen, das er zu vermeiden vorgibt. Beide Dateien sind kleine, klar
abgegrenzte Eingriffe (je ein `if:`-Guard bzw. zwei Config-Keys).

**Renovates `platformAutomerge` mit App-Token nicht vorab verifizierbar.** Der Kommentar in
`auto-enable-automerge.yml:36-37` dokumentiert, dass `GITHUB_TOKEN` `enablePullRequestAutoMerge`
nicht ausführen darf (*„Resource not accessible by integration"*) — daher dort ein PAT. Eine
eigene App mit `pull-requests: write` sollte die Mutation ausführen dürfen. Falls nicht, lässt
Renovate die PR schlicht offen — Komfortverlust, kein Sicherheitsproblem, und im
Verifikations-Run sofort sichtbar. Kein Blocker.

**Der Vaultwarden-Bump gehört nicht in diesen Change.** Er ist der *Beweis*, dass der Fix
greift, und braucht wegen SSO-only/PKCE eine eigene Prüfung der Release Notes auf
OIDC-Breaking-Changes. Als eigenes Ticket nach dem ersten grünen Renovate-Lauf.

## Betroffene Dateien

| Datei | Zeilen | S1-Budget | Änderung |
|---|---|---|---|
| `.github/workflows/renovate.yml` | 55 | **unbegrenzt** (`.yml` hat kein S1-Limit) | Token-Step + permissions + Kommentar-Korrektur |
| `.github/workflows/auto-enable-automerge.yml` | 43 | **unbegrenzt** | `if:`-Guard für `dependencies`-Label |
| `renovate.json5` | 156 | **unbegrenzt** (`.json5` hat kein S1-Limit) | `labels` + `platformAutomerge` |
| `tests/spec/ci-cd.bats` | 740 | **unbegrenzt** (`.bats` hat kein S1-Limit) | 4 neue Assertions |

S1-Limits (`docs/code-quality/gates.yaml:44-58`) gelten ausschließlich für Code-Extensions
(`.ts`, `.sh`, `.py`, `.astro`, …). Keine der vier Dateien fällt darunter, keine ist in
`docs/code-quality/baseline.json` gebaselined → kein Ratchet-Risiko, kein Split nötig.

## Manueller Anteil (nicht automatisierbar)

Patrick legt die GitHub App im UI an (Permissions s. o.), notiert die **App ID**, generiert
den Private Key, installiert die App auf `Paddione/Bachelorprojekt` und setzt:

```bash
gh secret set RENOVATE_APP_ID --body "<app-id>"
gh secret set RENOVATE_APP_PRIVATE_KEY < <pfad>.private-key.pem
```

Der Workflow-Umbau hängt nur an den Secret-**Namen**, nicht an den Werten, und kann unabhängig
davon gemergt werden. Renovate bleibt bis zum Setzen der Secrets schlafend (rote Cron-Läufe wie
bisher) — kein zusätzliches Risiko durch die Reihenfolge.

## Verifikation

1. `tests/spec/ci-cd.bats` — die 4 neuen Assertions gehen von FAIL auf PASS.
2. `task test:all` + `task freshness:check` grün.
3. **Nach Merge und gesetzten Secrets:** `workflow_dispatch` triggern. Akzeptanz: Run grün,
   und Renovate erzeugt das Dependency-Dashboard-Issue bzw. mindestens einen Update-PR — der
   Vaultwarden-Bump `1.35.3 → 1.37.0` muss darunter sein.
4. Gegenprobe zu RC3: die Vaultwarden-PR trägt das Label `dependencies` und hat **kein**
   aktiviertes Auto-Merge (Minor auf eine Prod-Dependency → Review-PR).

## Prozess-Lehre

Die T000898-Abnahmekriterien (Spec-Zeilen 90-99) prüfen ausschließlich Artefakt-Existenz und
Config-Korrektheit. Der manuelle Bootstrap-Schritt kommt in keinem AK vor — deshalb galt das
Ticket bei grünem CI als shipped, obwohl die Funktion nie live war. **Bootstrap-abhängige
Features brauchen ein AK, das Live-Funktion nachweist** (hier: „ein `workflow_dispatch`-Run ist
grün"), nicht nur grünes CI. Genau diesen Nachweis führt Verifikationsschritt 3 ein.
