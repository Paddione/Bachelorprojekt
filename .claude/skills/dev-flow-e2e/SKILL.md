---
name: dev-flow-e2e
description: Use after dev-flow-execute has merged and deployed a feature or fix — writes and runs Playwright E2E tests for the implementation using the Playwright MCP browser tools against the live environment.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern,
> configuration drift, or **process friction** you notice — even if unrelated
> to the current task — add an entry with:
>   `type` (broken/degraded/suspicious/security/drift/**process**),
>   `title`, `description`, and `component`.
>
> `process` = a step that required a manual workaround, had wrong/missing instructions,
> or caused unexpected friction. `component` MUST use format `skills/<skill-name>`. Example:
>   `{type: process, title: "playwright config missing project entry",
>     description: "new spec was not picked up — playwright.config.ts testMatch needs manual update per spec",
>     component: "skills/dev-flow-e2e"}`
>
> Invoke `mishap-tracker` at the very end.

# dev-flow-e2e — Playwright E2E Tests schreiben & ausführen

## Wann diese Skill greift

`dev-flow-execute` hat fertig implementiert und gemergt. Jetzt soll die implementierte Funktion mit echten Browser-E2E-Tests abgesichert werden. Du brauchst Zugriff auf die Playwright MCP Tools (`mcp__plugin_playwright_playwright__browser_*`).

**Sage zu Beginn:** "Ich nutze dev-flow-e2e für Playwright E2E Tests."

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
- **Welches Playwright-Projekt** passt: `website` (web.*), `services` (brett.*, files.*, vault.*), `korczewski`?
- **Ticket-ID** aus dem PR-Titel (Format `T######`)?

---

## Schritt 1: Ziel-URL bestimmen

| Geänderte Dateien | Live-URL | Playwright project |
|---|---|---|
| `website/src/**` | `https://web.mentolder.de` | `website` |
| `brett/**` | `https://brett.mentolder.de` | `services` |
| `k3d/nextcloud*.yaml` | `https://files.mentolder.de` | `services` |
| `k3d/livekit*.yaml` | `https://livekit.mentolder.de` | `services` |
| korczewski-spezifisch | `https://web.korczewski.de` | `korczewski` |

```bash
# Live-URL für spätere Schritte festlegen
BASE_URL="https://web.mentolder.de"   # anpassen falls nötig
```

### Credentials: korczewski-Projekt

Das `korczewski`-Projekt verwendet einen dedizierten `test-admin`-User auf dem
Korczewski-Keycloak-Cluster. Das Passwort ist in `environments/.secrets/korczewski.yaml`
unter dem Key `E2E_TEST_ADMIN_PASSWORD` gespeichert (nach dem ersten KC Admin-API-Reset
dort eingetragen und via `task env:seal ENV=korczewski` versiegelt).

Falls das Passwort fehlt oder unbekannt ist (Ersteinrichtung / Secret-Rotation):
- Passwortrichtlinie: **mindestens 12 Zeichen, Groß+Klein+Zahl+Sonderzeichen**  
  (z.B. `TestAdmin1!` mit 11 Zeichen schlägt mit HTTP 400 fehl — auf 12+ erhöhen)
- Reset per KC Admin-API:
  ```bash
  # Token holen (Admin-Credentials aus environments/.secrets/korczewski.yaml)
  TOKEN=$(curl -s -X POST https://auth.korczewski.de/realms/master/protocol/openid-connect/token \
    -d "client_id=admin-cli&username=<admin>&password=<pw>&grant_type=password" \
    | jq -r '.access_token')

  # User-ID ermitteln
  USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
    https://auth.korczewski.de/admin/realms/workspace/users?username=test-admin \
    | jq -r '.[0].id')

  # Passwort setzen (12+ Zeichen, upper+lower+digit+special)
  NEW_PASS="<NewPass123!>"
  curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    https://auth.korczewski.de/admin/realms/workspace/users/$USER_ID/reset-password \
    -d "{\"type\":\"password\",\"value\":\"${NEW_PASS}\",\"temporary\":false}"
  ```
- Nach dem Reset: Passwort in `environments/.secrets/korczewski.yaml` als
  `E2E_TEST_ADMIN_PASSWORD: <NewPass123!>` eintragen, dann `task env:seal ENV=korczewski`
  und ins Repo committen — so muss kein destruktiver Reset vor jedem E2E-Lauf gemacht werden.
- Das neue Passwort als `E2E_ADMIN_PASS` exportieren: `export E2E_ADMIN_PASS="$NEW_PASS"` [T000241]

---

## Schritt 2: Live-Erkundung mit Playwright MCP

Navigiere mit den MCP-Browser-Tools zur implementierten Funktion und versch

affe dir ein vollständiges Bild: welche Seiten, welche API-Endpunkte, welche Auth-Anforderungen.

**Navigation & Snapshots:**

```
mcp__plugin_playwright_playwright__browser_navigate → { url: "$BASE_URL/<pfad>" }
mcp__plugin_playwright_playwright__browser_snapshot  → {}    # Accessibility-Baum lesen
mcp__plugin_playwright_playwright__browser_take_screenshot → { filename: "/tmp/e2e-explore-01.png" }
```

**Typische Erkundungsschritte:**

1. Unauthentifiziert die Seite aufrufen → prüfen ob Redirect oder 401/403
2. Öffentliche Endpunkte direkt ansteuern (`/api/…`)
3. Falls UI-Feature: Seite snapshotten, Interaktionsmöglichkeiten identifizieren
4. API-Endpunkte aus dem Code-Diff ableiten und im Browser-DevTools-Netzwerk-Tab beobachten:
   ```
   mcp__plugin_playwright_playwright__browser_network_requests → {}
   ```

Notiere alle gefundenen Pfade und Verhaltensweisen für Schritt 3.

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
# → nächste = letzte + 1
```

### Test-Vorlage

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

test.describe('FA-<NN>: <Feature-Name>', () => {
  // ── Auth-Gating (immer, falls Route geschützt) ─────────────────
  test('T1: /<pfad> requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/<pfad>`);
    await expect(page).not.toHaveURL(`${BASE}/<pfad>`);
  });

  // ── API Auth-Gating ────────────────────────────────────────────
  test('T2: POST /api/<endpunkt> returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/<endpunkt>`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  // ── Funktionale Kernprüfung ────────────────────────────────────
  test('T3: <was-geprüft-wird>', async ({ request }) => {
    const res = await request.get(`${BASE}/api/<endpunkt>`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('<key>');
  });
});
```

**Leitfragen beim Schreiben:**

- Welche Routes/Endpunkte sind NEU? → Je einen Auth-Gating-Test.
- Welches Kernverhalten soll dauerhaft gesichert sein? → 1–3 funktionale Tests.
- Was wäre ein offensichtlicher Regressionsfall? → Expliziter Negativ-Test.
- Bug-Fix: Reproduziert der Test exakt den ursprünglichen Fehler?

---

## Schritt 4: Spec registrieren

Falls eine **neue** `*.spec.ts`-Datei angelegt wurde, trage sie in `tests/e2e/playwright.config.ts` ein:

```typescript
// Im passenden project-Block (z.B. 'website')
testMatch: [
  // ... bestehende Einträge ...
  '**/fa-<NN>-<slug>.spec.ts',  // <Feature-Beschreibung>
],
```

Falls Bug-Spec: in den `website`-Block einfügen (oder `services`, je nach Service):
```typescript
'**/fa-bug-*.spec.ts',   // ist bereits als Wildcard vorhanden — nichts tun!
```

---

## Schritt 5: Tests ausführen und verifizieren

`PLAYWRIGHT_PROJECT` ergibt sich aus Schritt 1 (URL-Mapping-Tabelle).
Für `systemtest` läuft der vollständige Zyklus gegen beide Cluster (via `task systemtest:all:headed:both-prods`).

> **Wichtig — globalSetup/globalTeardown:** `global-db-cleanup.ts` läuft als
> globalSetup/globalTeardown für **alle** Playwright-Projekte (nicht nur systemtest).
> Lokal schlägt der Start sofort fehl, wenn `CRON_SECRET` nicht gesetzt ist.
> Lösung: `SKIP_DB_PURGE=1` setzen (überspringt den DB-Purge, Tests laufen normal).

> **Wichtig — working directory:** Playwright **muss** aus `tests/e2e/` heraus
> gestartet werden. `npx playwright` vom Repo-Root aus findet zwei Versionen von
> `@playwright/test` (Repo-Root + `tests/e2e/node_modules`) und bricht ab.

```bash
# Wähle Ausführungsmodus basierend auf dem Playwright-Projekt

if [[ "$PLAYWRIGHT_PROJECT" == "systemtest" ]]; then
  # systemtest: 4 headed workers, beide Cluster parallel
  # Voraussetzung: E2E_ADMIN_PASS muss gesetzt sein
  if [[ -z "${E2E_ADMIN_PASS:-}" ]]; then
    echo "ERROR: E2E_ADMIN_PASS required for systemtest runs" >&2
    exit 1
  fi
  task systemtest:all:headed:both-prods

else
  # Alle anderen Projekte: 1 Worker headless (Standardpfad)
  # SKIP_DB_PURGE=1 überspringt global-db-cleanup.ts (nötig ohne CRON_SECRET lokal)
  cd tests/e2e/ && SKIP_DB_PURGE=1 WEBSITE_URL="$BASE_URL" npx playwright test \
    --project "$PLAYWRIGHT_PROJECT" \
    specs/<neu>.spec.ts
fi

# Bei Fehlern: Trace und Screenshot ansehen
ls tests/results/playwright-traces/
```

**Ergebnis-Kategorien:**

| Ergebnis | Aktion |
|---|---|
| Alle Tests grün | → Schritt 6 |
| Test schlägt wegen fehlendem Env (E2E_ADMIN_PASS) fehl | `test.skip(!VAR, '…')` ergänzen — das ist korrekt |
| Test schlägt wegen echtem Fehler fehl | Bug untersuchen; Screenshot in `/tmp/` ablegen; MISHAP_LOG Entry |
| Playwright-MCP-Erkundung hat anderes Verhalten gezeigt als erwartet | Test-Erwartung anpassen + Kommentar warum |

---

## Schritt 6: Test-Inventory aktualisieren

Falls neue FA-Tests angelegt wurden:

```bash
task test:inventory
git diff website/src/data/test-inventory.json
```

Falls diff nicht leer: `test-inventory.json` in den Commit aufnehmen.

---

## Schritt 7: Commit & Push

```bash
git add tests/e2e/specs/<neu>.spec.ts
git add tests/e2e/playwright.config.ts    # nur falls geändert
git add website/src/data/test-inventory.json  # nur falls geändert

git commit -m "test(<scope>): add E2E tests for <feature> [$TICKET_ID]"
git push
```

Kein neuer PR nötig — dieser Commit geht direkt auf `main` (sofern kein offener Branch mehr existiert). Falls noch auf einem Feature-Branch: normaler PR-Flow.

---

## Schritt 8: E2E Smoke auf Live optional anstoßen

Falls die Änderung kritisch ist oder neue Service-Endpunkte betrifft:

```bash
# Alle website-Tests gegen Mentolder-Live — aus tests/e2e/ ausführen!
cd tests/e2e/ && SKIP_DB_PURGE=1 WEBSITE_URL=https://web.mentolder.de npx playwright test \
  --project website
```

---

## Agent-Routing

- Tests schreiben/debuggen → `bachelorprojekt-test`
- Bei Fehlern in Live-Cluster → `bachelorprojekt-ops`
- Astro/Svelte/UI-Änderungen verstehen → `bachelorprojekt-website`

**Pflicht vor jedem Sub-Agent-Dispatch:** `bash scripts/plan-context.sh <role>` ausführen und die Ausgabe in `<active-plans>` Tags voranstellen.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."

---

## Schritt 9: Loop-Restart & Skill-Verbesserung

Nach dem Mishap Report: offene Skill-Improvement-Tickets prüfen, triviale Fixes auto-anwenden, dann nächsten Zyklus starten.

### 9a — Triviale Tickets ermitteln

```bash
TRIVIAL_TICKETS=$(bash scripts/e2e-skill-selfpatch.sh --list-trivial)
```

Falls `$TRIVIAL_TICKETS` leer: direkt zu **9c**.

### 9b — Triviale Fixes anwenden

Für jedes Ticket aus `$TRIVIAL_TICKETS` (Format: `EXT_ID|DESCRIPTION`):

```bash
while IFS='|' read -r EXT_ID DESCRIPTION; do
  [[ -z "$EXT_ID" ]] && continue

  echo "Applying fix for $EXT_ID: $DESCRIPTION"

  # 1. Patch anwenden: DESCRIPTION lesen und SKILL.md editieren (Edit-Tool verwenden)
  #    Triviale Fixes: falschen Command korrigieren, fehlenden Schritt ergänzen, Beispiel präzisieren
  #    NIEMALS strukturelle Änderungen hier — nur Zeilen-Level-Korrekturen

  # 2. Nach dem Edit: Branch anlegen und via Script committen + mergen
  BRANCH="chore/e2e-skill-selfpatch-${EXT_ID,,}"
  git checkout -b "$BRANCH"
  bash scripts/e2e-skill-selfpatch.sh --commit "$EXT_ID" "$BRANCH"

done <<< "$TRIVIAL_TICKETS"
```

**Trivial vs. strukturell:**
- **Trivial:** Command korrigieren, Exit-Code-Check ergänzen, fehlendes `bash`-Schritt hinzufügen, Beispiel präzisieren
- **Strukturell:** Nummerierte Schritte umordnen/entfernen, Skill-Aufruf-Zeitpunkt ändern, Routing-Tabelle in CLAUDE.md anpassen

### 9c — Strukturelle Tickets zurückstellen

```bash
bash scripts/e2e-skill-selfpatch.sh --defer-structural
```

### 9d — Loop neu starten

```
Schritt 9 abgeschlossen. Alle skill-improvement Tickets bearbeitet (oder keine vorhanden).
→ Nächsten Zyklus starten: rufe `ticket-management` auf.
```
