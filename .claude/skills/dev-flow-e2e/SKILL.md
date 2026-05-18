---
name: dev-flow-e2e
description: Use after dev-flow-execute has merged and deployed a feature or fix — writes and runs Playwright E2E tests for the implementation using the Playwright MCP browser tools against the live environment.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

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

```bash
# Einzelnen Spec gegen die Live-URL ausführen
WEBSITE_URL="$BASE_URL" npx playwright test \
  --config tests/e2e/playwright.config.ts \
  --project website \
  tests/e2e/specs/<neu>.spec.ts

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
# Alle website-Tests gegen Mentolder-Live
WEBSITE_URL=https://web.mentolder.de npx playwright test \
  --config tests/e2e/playwright.config.ts \
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
