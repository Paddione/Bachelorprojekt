---
title: "ci-speed: CI-Pipeline-Laufzeit reduzieren (apt-Bloat, npm-Cache, Artifact-Sharing)"
ticket_id: T001216
domains: [ci, perf]
status: completed
file_locks: []
shared_changes: false
---

# Tasks: ci-speed (T001216)

- [x] Task 1: apt-get-Bloat aus `offline-tests` entfernen
- [x] Task 2: Dedizierten npm-Cache-Slot für `scripts/factory` ergänzen
- [x] Task 3: Website-Dist als Artifact zwischen `vitest-website` und `bundle-budget` teilen
- [x] Task 4: Verifikation + Commit

---

# ci-speed — CI-Pipeline-Optimierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Die CI-Pipeline in `.github/workflows/ci.yml` um ~2–3 Minuten beschleunigen durch drei
isolierte Maßnahmen: redundante `apt-get`-Pakete entfernen, einen fehlenden npm-Cache-Slot für
`scripts/factory` ergänzen, und den Website-Build zwischen `vitest-website` und `bundle-budget`
per Artifact teilen statt ihn doppelt zu bauen.

**Architecture:** Alle Änderungen beschränken sich auf eine einzige Datei:
`.github/workflows/ci.yml`. Keine Produktiv-Code-Änderungen, keine neuen Skripte, keine
Kustomize-Manifeste. Task 3 macht `bundle-budget` zu einem sequentiellen Downstream von
`vitest-website` (via `needs:`), eliminiert dabei den doppelten Install+Build. Die
Branch-Protection required checks bleiben vollständig erhalten — kein Path-Filter, kein
Pass-Through-Job.

**Tech Stack:** GitHub Actions (YAML), `actions/cache@v4`, `actions/upload-artifact@v4`,
`actions/download-artifact@v4`, pnpm 10, Node 22.

## Global Constraints

- **Keine Path-Filter** auf required-check-Jobs (`offline-tests`, `vitest-website`,
  `bundle-budget`, `brett-typescript`, `security-scan`): docs-only PRs müssen alle fünf
  required checks reporten; ein `paths-ignore` auf diesen Jobs würde `mergeStateStatus: BLOCKED`
  erzeugen (Mishap T001149-M3). Dies ist bewusst NICHT implementiert.
- **Keine größeren Runner**: `ubuntu-latest-4-core` würde Vitest-Parallelismus verdoppeln,
  erfordert aber ein separates GitHub-Team/Enterprise-Ticket — ist hier NICHT implementiert
  (nur am Ende des Plans dokumentiert).
- **S1 nicht relevant**: `.github/workflows/ci.yml` hat 301 Zeilen, Extension `.yml` — nicht
  in der S1-Limits-Tabelle, kein Ratchet-Problem. Diese Änderungen reduzieren die Zeilenzahl
  netto (≈ −10 Zeilen durch Entfernen von Steps in `bundle-budget`).
- Alle Actions-Versionen müssen auf Commit-Hash gepinnt sein (Convention des Repos — bestehende
  Actions zeigen das Muster: `uses: actions/checkout@93cb6efe...  # v5`). SHA für neue Actions
  via `gh api repos/actions/<name>/git/refs/tags/v4` ermitteln oder Renovate-Bot übernimmt
  nach Merge.

## File Structure

```
.github/workflows/ci.yml    ← MODIFY: 3 unabhängige Änderungen (Tasks 1–3)
```

---

## Task 1 — apt-get-Bloat aus `offline-tests` entfernen

**Dateien:**
- Modify: `.github/workflows/ci.yml` — Step „Install dependencies" im Job `offline-tests`
  (aktuell Zeilen 59–63)

**Kontext:** Der Step installiert `jq`, `curl` und `python3-pip` via apt-get.
Auf `ubuntu-latest` sind `jq` und `curl` bereits vorinstalliert. `python3-pip` wird nirgends
in den CI-Steps genutzt (kein `pip3`, `pip install`, `python3 -m pip` in der Datei). Die
`sudo apt-get update`-Zeile kostet 20–30 s reine Netzwerklatenz ohne Nutzen.

Kein separater Test nötig: CI selbst ist der Acceptance-Test — nach Push prüft der
GitHub-Actions-Run ob `kubectl` korrekt installiert wird und alle nachgelagerten Steps laufen.

- [ ] **Step 1.0: Pre-Check — Voraussetzung für das Entfernen des apt-Blocks verifizieren**

  Bevor der apt-Block entfernt wird, prüfen, dass `jq` und `curl` auf `ubuntu-latest`
  tatsächlich vorinstalliert sind. Falls sie es NICHT wären, würde diese Prüfung fehlschlagen
  und das Entfernen des apt-Blocks wäre falsch — das ist der "failing-test"-Schritt für diese Task.

  ```bash
  # Lokal simulieren: prüfen ob ein ubuntu-24.04-ähnliches System jq + curl hat
  docker run --rm ubuntu:24.04 sh -c "which jq && which curl && jq --version && curl --version"
  ```

  Expected: Exit 0 + Versionsinformationen — beweist Pre-Installation.
  Expected: FAIL (exit 1, „command not found") wenn jq/curl nicht vorinstalliert wären —
  in diesem Fall müsste der apt-Block erhalten bleiben und dieser Plan wäre unvollständig.

- [ ] **Step 1.1: Verifikation dass pip nirgends genutzt wird**

  ```bash
  grep -n "pip3\|pip \|python3 -m pip\|python3-pip" .github/workflows/ci.yml
  ```

  Expected: Nur Zeile 61 (`sudo apt-get ... python3-pip`) — kein weiterer Einsatz.

- [ ] **Step 1.2: Step „Install dependencies" ersetzen**

  Aktueller Block im Job `offline-tests`:

  ```yaml
        - name: Install dependencies
          run: |
            sudo apt-get update && sudo apt-get install -y jq curl python3-pip
            curl --fail -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
              -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
  ```

  Ersetzen durch (apt-Zeile weg, Step umbenannt da kubectl der einzige verbleibende Zweck ist):

  ```yaml
        - name: Install kubectl
          run: |
            curl --fail -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
              -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
  ```

  (`curl` ist auf `ubuntu-latest` vorinstalliert — die kubectl-Download-Zeile bleibt unverändert.)

- [ ] **Step 1.3: YAML-Syntax prüfen**

  ```bash
  python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" \
    && echo "YAML OK" || echo "YAML SYNTAX ERROR"
  ```

  Expected: `YAML OK`

---

## Task 2 — Dedizierten npm-Cache-Slot für `scripts/factory` ergänzen

**Dateien:**
- Modify: `.github/workflows/ci.yml` — Job `offline-tests`, neuer Step vor „Install factory
  MCP dependencies" (aktuell Zeilen 67–69)

**Kontext:** Im Job `offline-tests` gibt es zwei `npm ci`-Aufrufe:
1. `npm ci` für das Root-Package (Zeile 65–66) — gecacht durch `actions/setup-node` auf
   Zeile 49–52 mit `cache: 'npm'`; Cache-Key basiert auf Root-`package-lock.json`.
2. `npm ci --prefix scripts/factory` (Zeile 68–69) — bekommt denselben Cache-Key wie Root,
   weil `scripts/factory/package-lock.json` nie in `hashFiles()` auftaucht → kein Cache-Hit
   möglich, immer Fresh-Install.

Lösung: Unmittelbar **vor** „Install factory MCP dependencies" einen `actions/cache`-Step
einfügen, der `~/.npm` mit einem eigenen Key auf Basis von `scripts/factory/package-lock.json`
cacht.

- [ ] **Step 2.1: Sicherstellen dass `scripts/factory/package-lock.json` existiert**

  ```bash
  ls -la scripts/factory/package-lock.json
  ```

  Expected: Datei existiert (mind. 1 kB).

- [ ] **Step 2.2: Cache-Step vor „Install factory MCP dependencies" einfügen**

  Aktueller Stand (Zeilen 67–69):

  ```yaml
        - name: Install factory MCP dependencies
          run: npm ci --prefix scripts/factory
  ```

  Ersetzen durch:

  ```yaml
        - name: Cache factory npm dependencies
          uses: actions/cache@v4
          with:
            path: ~/.npm
            key: ${{ runner.os }}-npm-factory-${{ hashFiles('scripts/factory/package-lock.json') }}
            restore-keys: |
              ${{ runner.os }}-npm-factory-

        - name: Install factory MCP dependencies
          run: npm ci --prefix scripts/factory
  ```

  > **Pinning:** `actions/cache@v4` auf aktuellen v4-Commit-SHA pinnen — SHA ermitteln via:
  > `gh api repos/actions/cache/git/refs/tags/v4 --jq '.object.sha'`
  > Dann: `uses: actions/cache@<sha>  # v4`

- [ ] **Step 2.3: YAML-Syntax prüfen**

  ```bash
  python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" \
    && echo "YAML OK" || echo "YAML SYNTAX ERROR"
  ```

  Expected: `YAML OK`

---

## Task 3 — Website-Dist als Artifact teilen (`vitest-website` → `bundle-budget`)

**Dateien:**
- Modify: `.github/workflows/ci.yml` — Job `vitest-website` (Build-Step + Upload-Step, Timeout-Erhöhung)
- Modify: `.github/workflows/ci.yml` — Job `bundle-budget` (needs, Download statt Install+Build,
  Timeout-Senkung, pnpm-Steps entfernen)

**Ist-Zustand:**
- `vitest-website` (Zeilen 163–198): Setup pnpm → Setup Node → pnpm install → vitest run.
  **Kein Build.**
- `bundle-budget` (Zeilen 199–224): Setup pnpm → Setup Node (pnpm-Cache) →
  `pnpm install --frozen-lockfile && pnpm build` → `node scripts/check-bundle-size.mjs`.
  **Vollständiger Doppel-Install+Build (~2–3 min extra).**

**Soll-Zustand:**
- `vitest-website`: bestehend (install + test) **+ NEU: pnpm build + upload-artifact**.
  Timeout: 10 → 15 min (Build addiert ~2 min).
- `bundle-budget`: `needs: [vitest-website]` + checkout + setup-node (nur Node, kein pnpm) +
  **download-artifact** + bundle-check. kein pnpm-Setup, kein install, kein build.
  Timeout: 15 → 10 min.

**Wichtiger Nebeneffekt:** `bundle-budget` läuft nun sequentiell nach `vitest-website`. Wenn
`vitest-website` fehlschlägt (Tests oder Build), wird `bundle-budget` übersprungen (`skipped`).
Das ist korrekt: `vitest-website` ist ebenfalls ein required check — der PR ist bei Test-Fehler
bereits durch `vitest-website: failure` blockiert. Ein `skipped` von `bundle-budget` hindert
keinen weiteren Merge-Flow, weil das blockierende Signal von `vitest-website` ausgeht.

- [ ] **Step 3.1: Timeout in `vitest-website` auf 15 min erhöhen**

  Zeile 171 von `timeout-minutes: 10` auf `timeout-minutes: 15` ändern.

- [ ] **Step 3.2: Build-Step + Upload-Artifact-Step in `vitest-website` ergänzen**

  Nach dem Step „Run website unit tests" (aktuell letzter Step in `vitest-website`, Zeilen 193–197)
  folgende zwei Steps **anhängen**:

  ```yaml
        - name: Build website
          run: |
            cd website
            pnpm build

        - name: Upload website dist artifact
          uses: actions/upload-artifact@v4
          with:
            name: website-dist
            path: website/dist
            retention-days: 1
  ```

  > **Pinning:** `actions/upload-artifact@v4` auf aktuellen v4-Commit-SHA pinnen:
  > `gh api repos/actions/upload-artifact/git/refs/tags/v4 --jq '.object.sha'`
  > Dann: `uses: actions/upload-artifact@<sha>  # v4`

  Der vollständige `vitest-website`-Job zur Referenz nach der Änderung:

  ```yaml
    vitest-website:
      # Always runs on every PR (no path filter) so the branch-protection
      # required-check "Vitest (website)" reports on chore / config-only PRs too.
      name: Vitest (website)
      if: github.event.action != 'edited'
      runs-on: ubuntu-latest
      timeout-minutes: 15
      steps:
        - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5

        - name: Set up pnpm
          uses: pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda  # v4.1.0
          with:
            version: 10

        - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444  # v5
          with:
            node-version: '22'
            cache: 'pnpm'
            cache-dependency-path: website/pnpm-lock.yaml

        - name: Install website dependencies
          run: |
            cd website
            pnpm install --frozen-lockfile

        - name: Run website unit tests
          # Default 5s per-test timeout is too tight for DB-heavy tests
          # (e.g. tickets/cockpit-db.test.ts seeds 1005 rows) when vitest
          # runs ~243 files in parallel on shared CI runners.
          run: |
            cd website
            pnpm exec vitest run --testTimeout=30000

        - name: Build website
          run: |
            cd website
            pnpm build

        - name: Upload website dist artifact
          uses: actions/upload-artifact@v4
          with:
            name: website-dist
            path: website/dist
            retention-days: 1
  ```

- [ ] **Step 3.3: `bundle-budget`-Job vollständig umschreiben**

  Den aktuellen `bundle-budget`-Job (Zeilen 199–224) vollständig ersetzen durch:

  ```yaml
    bundle-budget:
      name: Client-JS Bundle Budget
      if: github.event.action != 'edited'
      needs: [vitest-website]
      runs-on: ubuntu-latest
      timeout-minutes: 10
      steps:
        - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5

        - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444  # v5
          with:
            node-version: '22'

        - name: Download website dist artifact
          uses: actions/download-artifact@v4
          with:
            name: website-dist
            path: website/dist

        - name: Check client-JS bundle budget
          run: node scripts/check-bundle-size.mjs --check --fail --threshold=5
  ```

  Entfernt werden gegenüber dem Ist-Stand: pnpm-Setup-Action (`pnpm/action-setup`), `cache: 'pnpm'`
  im setup-node, der „Build website"-Step mit `pnpm install + pnpm build`.
  `check-bundle-size.mjs` benötigt nur Node-Builtins (`node:fs`, `node:path`, `node:zlib`) —
  kein pnpm install nötig.

  > **Pinning:** `actions/download-artifact@v4` auf aktuellen v4-Commit-SHA pinnen:
  > `gh api repos/actions/download-artifact/git/refs/tags/v4 --jq '.object.sha'`
  > Dann: `uses: actions/download-artifact@<sha>  # v4`

- [ ] **Step 3.4: YAML-Syntax prüfen**

  ```bash
  python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" \
    && echo "YAML OK" || echo "YAML SYNTAX ERROR"
  ```

  Expected: `YAML OK`

- [ ] **Step 3.5: Zeilenzahl prüfen (kein S1-Problem erwartet)**

  ```bash
  wc -l .github/workflows/ci.yml
  ```

  Expected: ≤ 301 Zeilen (Netto-Reduktion durch Entfernen der pnpm-Steps in `bundle-budget`).
  Extension `.yml` liegt nicht im S1-Scope — kein Blocking-Gate.

---

## Task 4 — Verifikation + Commit

**Pflicht-Schritte (aus `plan-quality-gates.md` — mandatory für jeden Plan):**

- [ ] **Step 4.1: OpenSpec validieren**

  ```bash
  bash scripts/openspec.sh validate
  ```

  Expected: Exit 0. Alternativ: `task test:openspec`.

- [ ] **Step 4.2: Gezielte Tests**

  ```bash
  task test:changed
  ```

  Expected: Exit 0. Für reine CI-YAML-Änderungen laufen keine domain-spezifischen
  BATS/Vitest-Tests — `test:changed` prüft trotzdem S4-Orphan-Check und Quality-Gates.

- [ ] **Step 4.3: Generierte Artefakte aktualisieren**

  ```bash
  task freshness:regenerate
  ```

  Expected: Exit 0. Aktualisiert `docs/code-quality/repo-index.json` und weitere
  auto-generierte Dateien.

- [ ] **Step 4.4: Freshness + Quality-Check (CI-Äquivalent)**

  ```bash
  task freshness:check
  ```

  Expected: Exit 0. Verifiziert S1–S4-Ratchet, Baseline-Key-Count und Freshness.

- [ ] **Step 4.5: Commit**

  ```bash
  git add .github/workflows/ci.yml
  # falls freshness:regenerate Dateien geändert hat:
  git add docs/code-quality/repo-index.json
  # prüfen ob weitere generierte Dateien geändert wurden und ggf. ebenfalls adden:
  git status
  git commit -m "ci: reduce apt bloat, add factory npm cache, share website dist artifact [T001216]"
  ```

- [ ] **Step 4.6: Push**

  ```bash
  git push -u origin chore/ci-speed
  ```

  PR-Titel: `ci: reduce apt bloat, add factory npm cache, share website dist artifact [T001216]`

---

## Nicht implementierte Maßnahmen (nur Dokumentation)

### Path-Filter auf required-check-Jobs (❌ nicht implementiert — T001149-M3)

Ein `paths-ignore` auf `offline-tests`, `vitest-website`, `bundle-budget`, `brett-typescript`
und `security-scan` würde docs-only PRs blockieren: GitHub Actions baut bei `paths-ignore`
keinen Merge-Ref für die betroffenen Jobs → required checks erscheinen nie mit Status `success`
→ `mergeStateStatus: BLOCKED` → kein Auto-Merge ohne Admin-Override. Nicht umsetzbar ohne
einen Pass-Through-Dummy-Job (mehr Aufwand als Gewinn, bewusst ausgelassen). Constraint: T001149-M3.

### Größere Runner (📄 nur Dokumentation)

`runs-on: ubuntu-latest-4-core` würde den Vitest-Parallelismus bei ~243 Test-Dateien verdoppeln
(~30–50 % Vitest-Speedup). Benötigt GitHub-Team/Enterprise-Plan oder self-hosted Runner-Label.
Separates Infrastruktur-Ticket erforderlich — nicht in diesem Chore implementiert.
