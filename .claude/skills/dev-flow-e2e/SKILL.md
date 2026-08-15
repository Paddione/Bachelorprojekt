---
name: dev-flow-e2e
description: 'Use AFTER dev-flow-execute has merged and deployed, to write and run Playwright E2E tests against the live brand environments. Triggers on Playwright, E2E test, e2e/, playwright test, npx playwright, browser test against prod, "test the deployed change", nightly e2e workflow, Playwright project assignment. Not for unit or BATS tests during implementation — those belong in dev-flow-execute.'
agent: bachelorprojekt-test
---

# dev-flow-e2e — Playwright E2E Tests schreiben & ausführen

## Wann diese Skill greift

`dev-flow-execute` hat fertig implementiert und gemergt. Jetzt soll die implementierte Funktion mit echten Browser-E2E-Tests abgesichert werden. Die Live-Erkundung nutzt die `chrome-devtools-axi`-Skill (CLI, kein MCP-Browser-Server).

**Sage zu Beginn:** "Ich nutze dev-flow-e2e für Playwright E2E Tests."

---

## Position im Git-Kreislauf

```
    ┌──────────────────────────────────────────────────────────────────┐
    ▼                                                                  │
[ main ] ←── merge ←── PR ←── implement ←── [plan committed]          │
    │                                                                  │
    └──► [E2E Tests schreiben + committen] ──► [push] ──► AUSSTIEG ───┘
              DIESER SKILL (post-merge)
```

**EINSTIEG:** `main` nach Merge — Feature deployed auf Live-Umgebung  
**AUSSTIEG:** E2E-Spec committed + gepusht auf neuen `feature/*`-Branch oder direkt auf `main`-Nachfolger  
> `test/*`-Branches sind nicht erlaubt — `.githooks/pre-commit` (T002093) lässt nur `feature/ fix/ chore/ docs/ feat/batch-*` zu; E2E-Branches nutzen `feature/`.
**Voraussetzung:** `dev-flow-execute` Schritt 8 (Post-Merge Deploy) abgeschlossen, Live-URL erreichbar

---

## Schritt 0: Kontext ermitteln

Finde heraus, was implementiert wurde:

```bash
# Letzten PR ansehen
gh pr list --state merged --limit 3 --json number,title,headRefName,mergedAt

# Geänderte Dateien des letzten PR
PR_NUM=$(gh pr list --state merged --limit 1 --json number -q '.[0].number')
gh pr view "$PR_NUM" --json files -q '.files[].path' | sort
```

Ermittle daraus:
- **Welche URLs/Endpunkte** wurden neu erstellt oder verändert?
- **Welches Playwright-Projekt** passt: `website` (web.*), `services` (brett.*, files.*, vault.*), `korczewski` (korczewski brand on fleet)?
- **Ticket-ID** aus dem PR-Titel (Format `T######`)?

---

## Schritt 1: Ziel-URL bestimmen

| Geänderte Dateien | Live-URL | Playwright project |
|---|---|---|---|
| `website/src/**` | `https://web.mentolder.de` | `website` |
| `brett/**` | `https://brett.mentolder.de` | `services`, `brett-mentolder` |
| `k3d/nextcloud*.yaml` | `https://files.mentolder.de` | `services` |
# LiveKit removed per T002184
| korczewski-spezifisch (fleet cluster) | `https://web.korczewski.de` | `korczewski` |
| Übergreifender Smoke-Test | — | `smoke` |
| System-Test (DB, Config, API) | — | `systemtest` |
| Unit-Tests | — | `unit` |
| Mobile/Responsive | — | `ios`, `android` |

```bash
# Live-URL für spätere Schritte festlegen
BASE_URL="https://web.mentolder.de"   # anpassen falls nötig
```

### Credentials

Es gibt **kein** separates E2E-Test-Passwort für Korczewski: Der Brand ist
eingefroren (T002602 — Flux-Kustomizations suspendiert, Deployments in
`workspace-korczewski` stehen auf 0/0, `web.korczewski.de` antwortet mit 503),
und der Key `E2E_TEST_ADMIN_PASSWORD` existiert nicht in
`environments/.secrets/korczewski.yaml`. E2E-Tests laufen ausschließlich gegen
Mentolder; das `korczewski`-Playwright-Projekt ist deaktiviert (siehe Kommentar
in `.github/workflows/e2e.yml`).

---

## Schritt 2: Live-Erkundung mit chrome-devtools-axi

Navigiere mit der `chrome-devtools-axi`-Skill zur implementierten Funktion und verschaffe dir ein vollständiges Bild: welche Seiten, welche API-Endpunkte, welche Auth-Anforderungen.

```bash
# Beispiel (chrome-devtools-axi CLI):
chrome-devtools-axi navigate "$BASE_URL/<pfad>"
chrome-devtools-axi snapshot
```

---

## Schritt 3: Test-Spec schreiben

### Dateiname

| Situation | Dateiname |
|---|---|
| Neue Feature-Tests (neuer FA-Block) | `fa-<NN>-<slug>.spec.ts` — nächste freie Nummer aus `tests/e2e/specs/` |
| Bug-Regression | `fa-bug-t<TICKETID>.spec.ts` (z.B. `fa-bug-t000440.spec.ts`) |
| Ergänzung zu bestehendem Spec | In bestehende `fa-<NN>-*.spec.ts` einfügen |

Nächste freie FA-Nummer ermitteln:
```bash
ls tests/e2e/specs/fa-[0-9]*.spec.ts | grep -oP 'fa-\K[0-9]+' | sort -n | tail -1
```

### Test-Vorlage

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// PFLICHT: Tag-Annotation für den PR-E2E-Workflow (e2e-pr.yml).
// Der Tag steuert, welche Tests bei PRs mit diesem Feature-Scope laufen.
// Verfügbare Tags: @smoke @website @content-hub @admin @factory @planungsbuero
//                  @booking @meeting @billing @messaging @brett @fragebogen @crm
// Neue Feature-Tags können ergänzt werden (Branch-Mapping in e2e-pr.yml erweitern).
test.describe('FA-<NN>: <Feature-Name>', { tag: ['@<feature-tag>'] }, () => {
  test('T1: /<pfad> requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/<pfad>`);
    await expect(page).not.toHaveURL(`${BASE}/<pfad>`);
  });
});
```

---

## Schritt 4: Spec registrieren

Trage die neue Datei in `tests/e2e/playwright.config.ts` ein falls nötig:

```typescript
// Im passenden project-Block (z.B. 'website')
testMatch: [
  '**/fa-<NN>-<slug>.spec.ts',
],
```

---

## Schritt 5: Tests ausführen und verifizieren

> **Wichtig — Setup-Details:**
> - **Working directory:** alle Playwright-Aufrufe laufen aus `tests/e2e/` (dort liegen die Configs wie `playwright.config.ts`).
> - **node_modules:** frische Worktrees haben kein `tests/e2e/node_modules` — deshalb `[[ -x ./node_modules/.bin/playwright ]] || npm ci` (siehe [T000245] in dev-flow-gotchas).
> - **`SKIP_DB_PURGE=1`:** überspringt den Prod-DB-Purge im globalen Setup/Teardown (`tests/e2e/specs/global-db-cleanup.ts`) — nötig, wenn `CRON_SECRET` nicht gesetzt ist.
> - **Playwright-Projekt-Zuordnung:** siehe [dev-flow-gotchas #t000418](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md#t000418) (Playwright Project Assignment).

```bash
# E2E Tests ausführen
cd tests/e2e/ && [[ -x ./node_modules/.bin/playwright ]] || npm ci
SKIP_DB_PURGE=1 WEBSITE_URL="$BASE_URL" ./node_modules/.bin/playwright test \
  specs/<neu>.spec.ts \
  --project "$PLAYWRIGHT_PROJECT"
```

---

## Schritt 6: Test-Inventory aktualisieren

Falls neue FA-Tests angelegt wurden:

```bash
task test:inventory
git diff website/src/data/test-inventory.json
```

---

## Schritt 7: Commit & Push

Läuft nach **`git-workflow` Schritt 2–4** (SSOT: Conventional Commits, git-crypt-Staging-Guard,
Commit-Verifikation, Scope-Preflight).

E2E-spezifisch — zu stagende Pfade und Titelformat:

```bash
git add tests/e2e/specs/<neu>.spec.ts tests/e2e/playwright.config.ts website/src/data/test-inventory.json
# Titel: "test(test): add E2E tests for <feature> [$TICKET_ID]"
# Scope 'test' verwenden — 'e2e' lehnt validate-commit-msg ab (seit T002328
# zu 'test' konsolidiert; erlaubte Scopes: bash scripts/validate-commit-msg.sh scopes).
```

---

## Schritt 8: E2E Smoke auf Live optional anstoßen

```bash
cd tests/e2e/ && SKIP_DB_PURGE=1 WEBSITE_URL=https://web.mentolder.de ./node_modules/.bin/playwright test \
  --project website
```

---

## Schritt 8.5: Optionale Stufe `headed-verify` (T002467)

**Explizit optional — kein Pflichtschritt, kein CI-Gate.** Headed-Läufe gegen die Live-Umgebung
sind langsam und flakeanfällig; als Merge-Gate würden sie den Durchsatz senken statt die Qualität
zu heben (siehe `openspec/specs/e2e-test-infrastructure.md`, REQ-k8-02). Diese Stufe läuft **nur
manuell/agentisch**, nie automatisiert in `.github/workflows/ci.yml` oder als required check.

**Trigger:** `--headed` Flag beim Aufruf dieses Skills, oder Env `HEADED_VERIFY=true`.

**Ablauf:**
1. Der Agent parametrisiert `tests/e2e/specs/k8-headed-verify.spec.ts` (Ziel-URL, Selektoren,
   Assertions) passend zur gerade verifizierten Implementierung.
2. Ausführung **headed** (echter, sichtbarer Chrome — kein CI-Runner, kein Xvfb):
   ```bash
   cd tests/e2e/ && SKIP_DB_PURGE=1 WEBSITE_URL="$BASE_URL" ./node_modules/.bin/playwright test \
     specs/k8-headed-verify.spec.ts --headed --project website
   ```
3. **Optional — Vision-gestützte Verifikation:** Screenshots aus dem Testlauf an den bereits
   laufenden mmproj-Vision-Server senden und die Antwort (UI-Elemente, Text, Positionierung
   korrekt?) ins Testergebnis einbetten. Port **8094** ist der bevorzugte dedizierte Endpunkt,
   **8091** der Rückfall (das Loadout `gemma26-factory` führt `mmprojPath`). Wähle den
   verfügbaren Endpunkt mit:
   ```bash
   curl -s -m 3 http://localhost:8094/v1/models >/dev/null && echo "8094 (dediziert)" \
     || { curl -s -m 3 http://localhost:8091/v1/models >/dev/null && echo "8091 (Rueckfall)" \
          || echo "kein Vision-Endpunkt — Punkt 3 ueberspringen"; }
   ```
   Ist kein Endpunkt erreichbar, überspringe Punkt 3 — die Verifikation bleibt optional und
   blockiert den Ablauf nicht.
4. **Kein Abbruch bei Fehler:** Diese Stufe informiert den Agenten, blockiert aber nicht den
   Merge- oder Deploy-Flow — sie läuft grundsätzlich erst nach Merge/Deploy (Schritt 8).

Details/Architektur: `openspec/specs/e2e-test-infrastructure.md` (REQ-k8-01…REQ-k8-04).

---

## Schritt 9: Beendigung und Nachbereitung

1. **Mishap Report**: Melde am Ende dieses Skills alle aufgetretenen Fehler über `mishap-tracker`.
2. **Operations**: Fahre danach mit `operations-management` fort, um den Status des zugehörigen PRs oder Tickets zu überwachen.

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 7:**
- E2E-Spec `tests/e2e/specs/<neu>.spec.ts` committed + gepusht
- `website/src/data/test-inventory.json` aktualisiert
- Tests laufen lokal grün gegen Live-URL

**Kreislauf zurück zu `main`** via normalem PR-Merge (oder direkter Push wenn Branch-Protection es erlaubt). Nächste Arbeit startet mit `dev-flow-plan`.

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-execute` | **Vorgänger im Kreislauf** — Feature muss deployt sein |
| `git-workflow` | Commit/Push-Konventionen für Schritt 7 (Freshness Guard, Scope-Preflight) |
| `cluster-deployment` | Querschnitt — Cross-Brand-Tests |
| `mishap-tracker` | Abschluss — protokolliert Frictions |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

