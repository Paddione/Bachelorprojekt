---
title: "admin-fundament-konsolidierung — Implementation Plan"
ticket_id: T001786
domains: [website, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [T001787, T001788, T001789]
---

# admin-fundament-konsolidierung — Implementation Plan

_Ticket: T001786_

> **For agentic workers:** Use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Implement tasks in order; each ends
> with an independently testable deliverable.

**Goal:** Koordination des Admin-Fundament-Epics: 4 Wellen, 3 parallele
Welle-1-Tickets (Token-Reduktion, Redirect-Auflösung, Modal/Drawer-Native),
gefolgt von Guard-, API- und Motion-Layers. Dieser Plan enthält die
Integrations- und Verifikations-Aufgaben, die über die Einzel-Tickets hinausgehen.

**Architecture:** Epic-Plan ohne eigenen Code — Koordination der Sub-Tickets
T001787, T001788, T001789 plus Integrations-Checks nach jeder Welle.

**Tech Stack:** Astro 5, Svelte 5, TypeScript, Tailwind CSS, BATS, Vitest.

## Global Constraints

- Keine Implementierung in diesem Plan — nur Koordination und Verifikation.
- Sub-Tickets werden über ihre eigenen Branches/Plans umgesetzt.
- Nach Abschluss jeder Welle: `task test:changed` + `task workspace:validate` als Integrations-Gate.
- Brand-Domain-Literale (`*.mentolder.de` / `*.korczewski.de`) gehören nicht in Code (S3).

## File Structure

Dieser Plan ändert keine Produktionsdateien. Änderungen erfolgen ausschließlich
in den Sub-Ticket-Branches und werden nach `main` gemergt.

| Datei | Zweck |
|-------|-------|
| `openspec/changes/admin-fundament-konsolidierung/proposal.md` | Epic-Scope |
| `openspec/changes/admin-fundament-konsolidierung/tasks.md` | Koordinationsplan |
| `openspec/changes/admin-fundament-konsolidierung/specs/admin-fundament.md` | Delta-Spec |

---

## Task 1: Welle 1 — Sub-Tickets verifizieren

Verify, dass die drei Welle-1-Sub-Tickets ihre jeweiligen Branches und Plans
korrekt gestaged haben und unabhängig voneinander implementiert werden können.

- [ ] **1.1** Prüfe Status aller drei Sub-Tickets:
  ```bash
  kubectl --context fleet exec -i -n workspace shared-db-74d6b659d-n2d9k \
    -- psql -U website -d website -tAc \
    "SELECT external_id, status, plan_ref FROM tickets.tickets
     WHERE external_id IN ('T001787','T001788','T001789');"
  ```
  Expected: T001787=in_progress, T001789=plan_staged, T001788=in_progress

- [ ] **1.2** Prüfe, dass die drei Branches unabhängig sind (keine gegenseitigen
  Depends-On-Links, die eine parallele Implementierung blockieren):
  ```bash
  git branch -r | grep -E 'admin-(token|redirect|modal)'
  ```

- [ ] **1.3** Erstelle Delta-Spec `openspec/changes/admin-fundament-konsolidierung/specs/admin-fundament.md`
  mit den Integrationsanforderungen (einheitliche Tokens, keine toten Redirects,
  natives Dialog-Muster als Standard).

- [ ] **1.4** Führe einen Pre-Merge-Fehlertest aus — verifiziere, dass die alten
  Muster NOCH existieren (dieser Test muss VOR dem Merge der Sub-Tickets grün sein,
  danach rot — Bestätigung, dass die Konsolidierung greift):
  ```bash
  # Erwartung: factory-tokens.css wird noch importiert (FAIL nach T001787-Merge)
  grep -rl "factory-tokens" website/src/ --include="*.css" --include="*.ts" --include="*.astro" | grep -v node_modules | wc -l
  ```
  expected: FAIL (Anzahl > 0 vor Merge, == 0 nach Merge)

## Task 2: Welle 1 — Integrations-Review nach Merge

Sobald alle drei Welle-1-PRs gemergt sind, führe einen Integrations-Check durch.

- [ ] **2.1** Führe `task test:changed` gegen `main` aus — alle Admin-bezogenen
  Tests müssen grün sein (Vitest-Einheitstests + BATS).

- [ ] **2.2** Führe `task workspace:validate` aus — Kustomize-Manifeste bleiben valide.

- [ ] **2.3** Prüfe, dass kein `factory-tokens.css` mehr importiert wird
  (T001787-Konsequenz):
  ```bash
  grep -r "factory-tokens" website/src/ --include="*.css" --include="*.ts" --include="*.astro" | grep -v node_modules
  ```
  Expected: keine Treffer

- [ ] **2.4** Prüfe, dass die 23 Redirect-Stub-Seiten nicht mehr als physische
  Dateien existieren (T001789-Konsequenz):
  ```bash
  # Die Redirect-Mapping-Datei in middleware.ts sollte die Redirects abdecken
  grep -c "REDIRECT_MAP\|redirect" website/src/middleware.ts
  ```
  Expected: > 0 (Map ist implementiert)

- [ ] **2.5** Prüfe, dass native `<dialog>` in AdminModal/AdminDrawer verwendet wird
  (T001788-Konsequenz):
  ```bash
  grep -l "<dialog\|HTMLDialogElement" website/src/lib/ui/AdminModal.* website/src/lib/ui/AdminDrawer.* 2>/dev/null
  ```
  Expected: Treffer

## Task 3: Welle 2 — Planung (requireAdmin-Guard + AdminTabs)

Erstelle die OpenSpec-Changes für Welle 2, sobald Welle 1 gemergt ist.

- [ ] **3.1** Analysiere die 62 Admin-Seiten für requireAdmin()-Potenzial:
  ```bash
  find website/src/pages/admin -name "*.astro" | wc -l
  grep -rl "isAdmin\|checkAuth\|getSession" website/src/pages/admin/ --include="*.astro" | wc -l
  ```
  Differenz = Ziel-Audience für den Guard.

- [ ] **3.2** Erstelle `openspec/changes/admin-require-guard/` mit proposal.md
  (Scope: 62 Seiten, einheitlicher Guard, Reduktion verteilter Auth-Checks)
  und tasks.md.

- [ ] **3.3** Erstelle `openspec/changes/admin-tabs-consolidation/` mit proposal.md
  (Scope: AdminTabs-Muster in 4 Hubs durchsetzen, bestes Muster als Standard)
  und tasks.md.

## Task 4: Welle 3 — Planung (apiCall + admin-toast)

Erstelle die OpenSpec-Changes für Welle 3, sobald Welle 2 abgeschlossen ist.

- [ ] **4.1** Analysiere die 71 `fetch()`-Aufrufe in Admin-API-Routen:
  ```bash
  grep -rl "fetch(" website/src/pages/api/admin/ --include="*.ts" | wc -l
  ```
  Differenz zum Ziel = Scope der apiCall-Migration.

- [ ] **4.2** Erstelle `openspec/changes/admin-apicall-migration/` mit proposal.md
  und tasks.md.

- [ ] **4.3** Erstelle `openspec/changes/admin-toast-error-handling/` mit proposal.md
  (einheitliche Fehleranzeige über `admin-toast`) und tasks.md.

## Task 5: Welle 4 — Planung (react-bits Islands)

Erstelle den OpenSpec-Change für Welle 4, sobald Welle 3 abgeschlossen ist.

- [ ] **5.1** Prüfe `react-bits`-Kompatibilität mit Astro Islands:
  ```bash
  grep -r "react" website/package.json
  ```
  Verifiziere, dass `@astrojs/react` als Integration vorhanden ist.

- [ ] **5.2** Erstelle `openspec/changes/admin-motion-layer/` mit proposal.md
  (react-bits als React-Islands, Motion-Layer für Admin-GUI).

## Task 6: Epic-Abschluss & Verifikation

Nach Abschluss aller Wellen: finale Validierung und Dokumentation.

- [ ] **6.1** Führe `task test:changed` aus — alle Admin-Tests grün.

- [ ] **6.2** Führe `task test:code-quality` aus — S1-Budgets, Import-Zyklen,
  Hardcoded-Hostnames geprüft.

- [ ] **6.3** Führe `task freshness:regenerate && task freshness:check` aus —
  generierte Artefakte sind aktuell.

- [ ] **6.4** Aktualisiere die Health-Goals-Baseline falls relevant
  (S1-Budget-Änderungen durch Konsolidierung).

- [ ] **6.5** Schließe das Epic-Ticket T001786 als `done` mit `resolution=shipped`.
