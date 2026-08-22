# Proposal: e2e-suite-entskippen

## Why

Der nächtliche E2E-Lauf gibt kein verwertbares Signal mehr. In den letzten 100 Läufen von
`e2e.yml` gab es **keinen einzigen grünen** (91 `failure`, 9 `cancelled`, seit 2026-08-18).
Im Referenzlauf 32549872970 (mentolder gegen `web.mentolder.de`) stehen 669 Tests zu
**395 passed, 243 skipped (36 %), 31 failed**.

Ein Rot, das jede Nacht kommt, wird nicht mehr gelesen. Genau diese Diagnose steht bereits im
Kopf von `e2e.yml` — dort für den eingefrorenen korczewski-Brand formuliert („ein Rot, das
nichts über die Testsuite aussagt und echte Regressionen bei mentolder überdeckt"). Sie gilt
inzwischen für mentolder selbst.

Die Untersuchung hat gezeigt, dass hinter den 243 Skips kein einzelnes Versäumnis steckt,
sondern vier verschiedene Ursachen, die im Report ununterscheidbar aussehen — der JUnit-Reporter
schreibt bei allen 243 eine leere Skip-Message. Zwei davon sind Defekte, zwei sind
Zuschnitt-Entscheidungen.

## What

### F1 — Ein Helper-Defekt erzeugt 22 der 31 Failures

`tests/e2e/lib/agent-guide.ts:182` klickt ein Element, das nach `scrollIntoViewIfNeeded()`
weiterhin `outside of the viewport` liegt. Der Klick läuft in den 10-Sekunden-Timeout, und weil
jeder Test der Datei über denselben Helper einsteigt, fallen alle 22 Tests von
`agent-guide-walkthrough.spec.ts` mit derselben Ursache.

### F2 — Ein Gruppen-Modifier legt 12 Dateien still

Zwölf Spec-Dateien tragen einen Playwright-Modifier **direkt im `describe`-Body**, außerhalb
jedes `test()`:

```js
  // nfa-08-production-deploy.spec.ts:44 — letzte Zeile vor dem schließenden });
  test.fixme(true, 'T4-T5: Manifest-Validierung … erfordern kubectl/task-Zugriff — T000480');
```

Gemeint war die Dokumentation einzelner nicht automatisierbarer Teiltests. Playwright wertet
einen Modifier an dieser Stelle jedoch als Gruppen-Modifier und schaltet **die gesamte Datei**
ab — erkennbar an `time=0` und der fehlenden Skip-Message.

Betroffen sind ~47 Tests, darunter ~23, die einwandfrei gegen prod laufen würden:
DSGVO-Prüfungen auf externe Tracking-Scripts und Google Fonts, Antwortzeiten unter 5 s,
Erreichbarkeit von Website, Pocket ID und Vaultwarden, HTML-Vollständigkeit nach Restart.

### F3 — 14 Specs testen Routen, die im Prod-Build nicht existieren

`tests/e2e/lib/sdlc-guard.ts` prüft `/sdlc/cockpit` und skippt bei 404. Gegen prod trifft das
immer zu, weil die SDLC-Routen im Produktions-Build absichtlich entfernt sind. 14 Spec-Dateien
mit ~79 Tests können im Nightly folglich nie grün werden.

### F4 — Repo-Datei-Asserts prüfen den falschen Pfad

`ak-04`, `nfa-07`, `nfa-08` und `nfa-09` lösen den Repo-Root auf als

```js
const repoRoot = path.resolve(__dirname, '../../../../');
```

`__dirname` ist `tests/e2e/specs`; vier Ebenen aufwärts landet eine Ebene **über** dem
Repo-Root. Jedes `fs.existsSync(path.join(repoRoot, 'prod'))` müsste `false` liefern und den
Test rot färben. Dass das nie aufgefallen ist, liegt am Gruppen-Modifier aus F2 — der Skip
verdeckt den Pfadfehler. Diese Asserts prüfen ohnehin den Zustand des Repositories, nicht den
der laufenden Anwendung, und gehören nicht in eine E2E-Suite.

### F5 — Die Brett-Skips sind ein fehlendes Secret, keine fehlende Mechanik

Der Matrix-Job in `e2e.yml` bekommt kein `FLEET_KUBECONFIG`. Ohne kubectl kann
`tests/e2e/lib/oidc.ts` kein One-Time-Access-Token von Pocket ID erzeugen,
`brett-mentolder-auth-setup` markiert sich fail-closed als `fixme`, und das abhängige Projekt
`brett-mentolder` skippt vollständig (~30 Tests).

Der Weg dorthin existiert bereits: Der `sso-e2e`-Job **derselben Datei** (`e2e.yml:288`) legt
`FLEET_KUBECONFIG` aus den Repo-Secrets ab und fährt genau dieses Muster, wie auch
`build-brett.yml`, `build-docs.yml`, `build-videovault.yml` und `health-goals.yml`. Es fehlt
kein Mechanismus, sondern dessen Anwendung auf den Matrix-Job.

Die ~45 Skips der LLM-Router-Specs sind davon zu trennen: Sie sind kein Auth-, sondern ein
Netzwerkproblem. Der Router sitzt auf dem GPU-Host im `wg-mesh`; kein Secret bringt einen
GitHub-Runner dorthin.

## Impact

| | vorher | nachher |
|---|---|---|
| Tests im Nightly | 669 | ~520 |
| davon skipped | 243 (36 %) | ~65 (13 %) |
| reaktiviert | — | ~53 |
| gelöscht | — | ~25 |
| in den lokalen Lauf verschoben | — | ~124 |

Betroffene Pfade: `tests/e2e/specs/`, `tests/e2e/lib/agent-guide.ts`,
`tests/e2e/lib/sdlc-guard.ts`, `tests/e2e/playwright.config.ts`,
`tests/e2e/playwright.local.config.ts`, `.github/workflows/e2e.yml`.

## Non-Goals

- **Die ~65 datenabhängigen Skips** („kein gestagtes Item vorhanden", „Test user gekko has
  already completed all onboarding nudges") bleiben unangetastet. Sie sind eine eigene Klasse
  mit eigener Ursache — Tests, die sich abschalten, sobald sie Arbeit hätten — und verdienen
  einen eigenen Change.
- **Keine neuen Tests.** Dieser Change repariert, entfernt und verschiebt; er erweitert die
  Abdeckung nicht.
- **Kein neuer Auth-Mechanismus.** F5 wendet ein im Repo etabliertes Muster an.
- **Kein Eingriff in die korczewski-Deaktivierung** (T002602).
