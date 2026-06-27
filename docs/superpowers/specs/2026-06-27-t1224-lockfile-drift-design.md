---
ticket_id: T001224
plan_ref: openspec/changes/t1224-lockfile-drift/tasks.md
status: active
date: 2026-06-27
---

# CI-Guard gegen website-Lockfile-Drift + pnpm/npm-Strukturentscheidung

**Datum:** 2026-06-27
**Ticket:** T001224 (chore, brand=mentolder, scope cross-brand)
**Branch:** `feature/t1224-lockfile-drift`
**Worktree:** `/home/patrick/Bachelorprojekt/tmp/wt-t1224-lockfile-drift`

## 1. Context & Brainstorming

Im Projekt gibt es eine Koexistenz verschiedener Paketmanager:
- Das **Root-Projekt** (`/`) und die meisten Skripte/Subprojekte nutzen **npm** (`package-lock.json`).
- Das **Systembrett/Brett** (`/brett/`) nutzt **npm** für Installation und CI, hält aber zusätzlich ein `pnpm-lock.yaml` und `pnpm-workspace.yaml` vor, damit Renovate Dependency-Update-Prüfungen durchführen kann.
- Die **Website** (`/website/`) und **mentolder-web** (`/mentolder-web/`) nutzen ausschließlich **pnpm** (`pnpm-lock.yaml`).

### Das Problem (Lockfile-Drift)
Da Entwickler und Agenten oft im selben Repository arbeiten und eventuell im falschen Unterordner Befehle ausführen, kommt es vor, dass:
1. Im `website/`-Ordner versehentlich `npm install` ausgeführt wird, was eine `website/package-lock.json` erzeugt.
2. Diese `package-lock.json` versehentlich in Git committed wird (sie war bisher nicht ignoriert und ist derzeit sogar in Git getrackt).
3. Dies führt zu Verwirrung bei Werkzeugen, redundanten Abhängigkeiten und potenziellen Build-Fehlern oder Abweichungen in der CI/CD-Pipeline (Lockfile-Drift).

### Strukturentscheidung
Um Klarheit zu schaffen, legen wir die erlaubten und verbotenen Lockfiles pro Subprojekt deklarativ fest:

| Verzeichnis | Erlaubte Lockfiles | Verbotene Lockfiles | Zweck / Bemerkung |
|-------------|--------------------|---------------------|-------------------|
| `/` (Root)  | `package-lock.json` | `pnpm-lock.yaml`    | Root-Tooling (npm) |
| `/website`  | `pnpm-lock.yaml`   | `package-lock.json` | Astro Website (pnpm) |
| `/brett`    | `package-lock.json`, `pnpm-lock.yaml` | (keine) | Systembrett (npm + pnpm für Renovate) |
| `/mentolder-web` | `pnpm-lock.yaml` | `package-lock.json` | Svelte/Astro-Layouts (pnpm) |
| Andere (`tests/e2e`, `/VideoVault`, etc.) | `package-lock.json` | `pnpm-lock.yaml` | Subprojekte (Standard: npm) |

---

## 2. Proposed Solution

### 2.1 Cleanup & Ignore-Regeln
1. **Entfernen:** `website/package-lock.json` wird aus Git entfernt (`git rm --cached website/package-lock.json`) und gelöscht.
2. **Ignorieren:** `package-lock.json` wird in `website/.gitignore` eingetragen.
3. **Zusatz-Schutz:** `pnpm-lock.yaml` wird im Root-Verzeichnis `.gitignore` ignoriert, falls dort versehentlich `pnpm` ausgeführt wird (nicht verpflichtend, aber gute Praxis).

### 2.2 Neuer Code-Quality Gate: S5 (Lockfiles)
Wir implementieren einen neuen automatischen Guard innerhalb der bestehenden `check.mjs`-Code-Quality-Infrastruktur.

1. **Konfiguration in `gates.yaml`:**
   Unter dem Key `s5` definieren wir die Regeln für Lockfiles:
   ```yaml
   s5:
     rules:
       - path: "."
         allowed: ["package-lock.json"]
         forbidden: ["pnpm-lock.yaml"]
       - path: "website"
         allowed: ["pnpm-lock.yaml"]
         forbidden: ["package-lock.json"]
       - path: "brett"
         allowed: ["package-lock.json", "pnpm-lock.yaml"]
         forbidden: []
       - path: "mentolder-web"
         allowed: ["pnpm-lock.yaml"]
         forbidden: ["package-lock.json"]
   ```

2. **Implementierung `s5-lockfiles.mjs`:**
   Ein neues Skript unter `scripts/code-quality/gates/s5-lockfiles.mjs`, das:
   - Die konfigurierten Pfade überprüft.
   - Sowohl auf Git-Ebene (tracked files) als auch auf Filesystem-Ebene (untracked files im lokalen Worktree) prüft, ob verbotene Lockfiles existieren.
   - Bei Verstößen entsprechende Violations mit dem Key `S5:<pfad>` und dem Typ `forbidden_lockfile` zurückgibt.

3. **Verkabelung in `check.mjs` und `validate.mjs`:**
   - `check.mjs` importiert und führt `runS5` aus und fügt die Violations in die Aggregation ein.
   - `validate.mjs` prüft die Struktur von `gates.yaml:s5.rules` (muss Array von Objekten mit `path`, `allowed`, `forbidden` sein).

4. **Unit Tests:**
   Wir schreiben einen Unit Test in `scripts/code-quality/gates/s5-lockfiles.test.mjs`, der die Prüflogik mit Mock-Konfigurationen validiert.

---

## 3. Akzeptanzkriterien (vor Merge)

- [ ] `website/package-lock.json` ist nicht mehr in Git getrackt und lokal gelöscht.
- [ ] `website/.gitignore` enthält `/package-lock.json`.
- [ ] `docs/code-quality/gates.yaml` ist mit `s5` Regeln konfiguriert.
- [ ] `scripts/code-quality/gates/s5-lockfiles.mjs` implementiert die Prüfung korrekt.
- [ ] `scripts/code-quality/gates/s5-lockfiles.test.mjs` deckt die logischen Fälle ab und ist unter `task test:code-quality` registriert.
- [ ] `task test:code-quality` läuft lokal erfolgreich durch.
- [ ] `task freshness:regenerate && task freshness:check` läuft ohne Fehler durch.
- [ ] `task test:changed` ist grün.
