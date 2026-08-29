---
name: dev-flow-e2e
description: 'Use AFTER dev-flow-execute has merged and deployed, to write and run Playwright E2E tests against the live brand environments. Triggers on Playwright, E2E test, e2e/, playwright test, npx playwright, browser test against prod, "test the deployed change", nightly e2e workflow, Playwright project assignment. Not for unit or BATS tests during implementation — those belong in dev-flow-execute.'
agent: bachelorprojekt-test
---

# dev-flow-e2e — Playwright E2E Tests schreiben & ausführen

Der test-only Chore folgt dem gemeinsamen [dev-flow-lifecycle](.claude/skills/references/dev-flow-lifecycle.md); diese Skill besitzt die Playwright-spezifischen Entscheidungen und Live-Gates.

## Wann diese Skill greift

`dev-flow-execute` hat fertig implementiert und gemergt. Jetzt soll die implementierte Funktion mit echten Browser-E2E-Tests abgesichert werden. Für die Live-Erkundung werden Standard-Browser/HTTP-Tools oder native Playwright-Mittel eingesetzt.

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
**AUSSTIEG:** E2E-Spec committed + gepusht auf ticketed `chore/*`-Branch, als PR gemergt und bereinigt
> `test/*`-Branches sind nicht erlaubt — `.githooks/pre-commit` (T002093) lässt nur `feature/ fix/ chore/ docs/ feat/batch-*` zu; test-only E2E-Branches nutzen ticketed `chore/`.
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
- **Welches Playwright-Projekt** passt: `website` (web.*), `services` (brett.*, files.*, vault.*)?
- **Ticket-ID** aus dem PR-Titel (Format `T######`)?

---

## Schritt 1: Ziel-URL bestimmen

| Geänderte Dateien | Live-URL | Playwright project |
|---|---|---|
| `components/website/src/**` | `https://web.mentolder.de` | `website` |
| `components/brett/**` | `https://brett.mentolder.de` | `services`, `brett-mentolder` |
| `fleet/nextcloud*.yaml` | `https://files.mentolder.de` | `services` |
| korczewski-spezifisch (fleet cluster) | `https://web.korczewski.de` | `korczewski` *(deaktiviert / frozen per T002602)* |
| Übergreifender Smoke-Test | — | `smoke` |
| System-Test (DB, Config, API) | — | `systemtest` |
| Unit-Tests | — | `unit` |
| Mobile/Responsive | — | `ios`, `android` |

```bash
# Live-URL für spätere Schritte festlegen
BASE_URL="https://web.mentolder.de"   # anpassen falls nötig
```

### Credentials & Brand-Status

Es gibt **kein** separates E2E-Test-Passwort für Korczewski: Der Brand ist
eingefroren (T002602 — Flux-Kustomizations suspendiert, Deployments in
`workspace-korczewski` stehen auf 0/0, `web.korczewski.de` antwortet mit 503),
und der Key `E2E_TEST_ADMIN_PASSWORD` existiert nicht in
`environments/.secrets/korczewski.yaml`. E2E-Tests laufen ausschließlich gegen
Mentolder; das `korczewski`-Playwright-Projekt ist deaktiviert (siehe Kommentar
in `.github/workflows/e2e.yml`).

---

## Schritt 2: Live-Erkundung & Endpunkt-Prüfung

Verschaffe dir ein vollständiges Bild der implementierten Funktion: welche Seiten, welche API-Endpunkte, welche Auth-Anforderungen und DOM-Elemente existieren.

```bash
# HTTP-Erreichbarkeit & Headers prüfen
curl -sI "$BASE_URL/<pfad>"

# Falls nötig HTML-Struktur / Selektoren sichten
curl -sL "$BASE_URL/<pfad>" | head -n 50
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
> - **Playwright-Projekt-Zuordnung:** siehe [dev-flow-gotchas #t000418](.claude/skills/references/dev-flow-gotchas.md#t000418) (Playwright Project Assignment).

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
git diff components/website/src/data/test-inventory.json
```

### Lokaler Lauf für SDLC- und LLM/GPU-Specs (T013329)

Zwei Spec-Klassen laufen bewusst **nicht** im Nightly (`e2e.yml` / `playwright.config.ts`),
sondern nur lokal über `playwright.local.config.ts`:

- **`sdlc-local`** — die 14 `guardSdlc`-Specs (SDLC-Cockpit, dev-status, Factory-Ansichten).
  Die Routen sind im Prod-Build absichtlich entfernt; der Guard skippt dort weiterhin und
  wirft gegen eine Dev-/localhost-Instanz ohne SDLC-Routen einen Fehler (fail-loud).
  Benötigt Admin-Auth (`mentolder-setup` läuft als Dependency mit).
- **`llm-local`** — LLM-Router- (fa-32/33/34/36/37) und GPU-VRAM-Specs (nfa-11). Der Router
  sitzt auf dem GPU-Host im wg-mesh; ohne `LLM_HOST_IP`/`LLM_ROUTER_URL` skippen die Specs
  selbständig.

```bash
cd tests/e2e/ && [[ -x ./node_modules/.bin/playwright ]] || npm ci
# SDLC-Cockpit-Specs gegen eine Dev-Instanz mit SDLC-Build:
SKIP_DB_PURGE=1 WEBSITE_URL=http://localhost:4321 ./node_modules/.bin/playwright test \
  --config playwright.local.config.ts --project sdlc-local
# LLM-Router/GPU-Specs aus dem wg-mesh:
SKIP_DB_PURGE=1 ./node_modules/.bin/playwright test \
  --config playwright.local.config.ts --project llm-local
```

---

## Schritt 7: Commit & Push

Läuft nach **`git-workflow` Schritt 2–4** (SSOT: Conventional Commits, git-crypt-Staging-Guard,
Commit-Verifikation, Scope-Preflight).

E2E-spezifisch — zu stagende Pfade und Titelformat:

```bash
git add tests/e2e/specs/<neu>.spec.ts tests/e2e/playwright.config.ts components/website/src/data/test-inventory.json
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

Die Repository-Änderung folgt anschließend dem test-only Chore/Git-Lifecycle: PR erstellen,
CI abwarten, Merge über `git-workflow` anfordern und erst nach bestätigtem Merge Worktree und
Branch bereinigen. Kein direkter Push auf `main` und kein `feature/*`-Branch für diese reine
Teständerung.

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
3. **Optional — Vision-gestützte Verifikation:** Screenshots aus dem Testlauf an das lokale
   vision-fähige Loadout senden und die Antwort (UI-Elemente, Text, Positionierung korrekt?)
   ins Testergebnis einbetten. Der Weg führt über den **llm-proxy auf `127.0.0.1:18235`** mit
   dem Modellalias **`gemma12-vision`**:
   ```bash
   curl -sf -m 3 http://127.0.0.1:18235/v1/models | grep -q gemma12-vision \
     && echo "Vision verfuegbar" \
     || echo "kein Vision-Endpunkt — Punkt 3 ueberspringen"
   ```
    **Nicht direkt auf Port 8089 prüfen.** Der llama.cpp-Server läuft auf dem Windows-GPU-Host
    und ist nicht direkt vom Entwicklungsrechner aus erreichbar (curl localhost:8089 liefert HTTP-Code 000, der Proxy
    liefert 200). Der Proxy ist zugleich die Stelle, an der `max_inflight=3` durchgesetzt wird.

   > **Bis T012781 stand hier Port 8094 mit 8091 als Rückfall.** Beides war wirkungslos: 8094
   > hat in `scripts/llm/loadouts.json` keinen Eintrag, und das Loadout auf 8091
   > (`gemma26-factory`) trägt in seinen eigenen `notes` den Satz „Kein mmproj". Weil die Stufe
   > Fehler nur als Annotation notiert, ist das jahrelang nicht aufgefallen.

   Ist der Endpunkt nicht erreichbar, überspringe Punkt 3 — die Verifikation bleibt optional und
   blockiert den Ablauf nicht. Unterscheide dabei „Proxy antwortet nicht" (Proxy starten) von
   „Proxy antwortet, Alias fehlt" (Backend-Zeile anlegen:
   `scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql`) — die Abhilfe ist eine andere.

   Für einen **breiten** vision-geurteilten Durchgang über alle Routen statt einer Einzelprüfung:
   `task test:e2e:visual-sweep:vision` (T012781, report-only, kein CI-Gate).
4. **Kein Abbruch bei Fehler:** Diese Stufe informiert den Agenten, blockiert aber nicht den
   Merge- oder Deploy-Flow — sie läuft grundsätzlich erst nach Merge/Deploy (Schritt 8).

Details/Architektur: `openspec/specs/e2e-test-infrastructure.md` (REQ-k8-01…REQ-k8-04).

---

## Schritt 9: Beendigung und Nachbereitung

1. **Mishap Report**: Melde am Ende dieses Skills alle aufgetretenen Frictions über `mishap-tracker`.
2. **Operations & Pipeline-Abschluss**: Fahre danach mit `operations-management` fort, um den Status des zugehörigen PRs / Tests zu überwachen bzw. `agent-lock release ticket <id>` durchzuführen.

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 9 (Endzustand des Skills):**
- E2E-Spec `tests/e2e/specs/<neu>.spec.ts` committed + gepusht
- `components/website/src/data/test-inventory.json` aktualisiert
- Tests laufen lokal grün gegen Live-URL

**Kreislauf zurück zu `main`** via normalem PR-Merge (oder direkter Push wenn Branch-Protection es erlaubt). Nächste Arbeit startet mit `dev-flow-plan`.

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-execute` | **Vorgänger im Kreislauf** — Feature muss deployt sein |
| `git-workflow` | Commit/Push-Konventionen für Schritt 7 (Freshness Guard, Scope-Preflight) |
| `infra-ops` | Querschnitt — Infrastruktur- und Service-Status |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
| `operations-management` | Nachbereitung — PRs/Tickets/Locks aufräumen |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
