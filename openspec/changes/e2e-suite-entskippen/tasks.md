# Tasks: e2e-suite-entskippen

## File Structure

- `tests/e2e/lib/agent-guide.ts`
- `tests/e2e/lib/sdlc-guard.ts`
- `tests/e2e/playwright.config.ts`
- `tests/e2e/playwright.local.config.ts`
- `tests/e2e/specs/`
- `.github/workflows/e2e.yml`
- `tests/spec/e2e-test-infrastructure/`

## 1. Helper-Defekt beheben (F1/D5)

- [ ] 1.1 `tests/e2e/lib/agent-guide.ts:182` — Klick auf `button.sk-row` schlägt fehl, weil das
      Element nach `scrollIntoViewIfNeeded()` weiterhin außerhalb des Viewports liegt. Ursache im
      Scroll-Container der Sidebar bestimmen (eigener Scroll-Kontext vs. Seiten-Scroll).
- [ ] 1.2 Fix umsetzen und gegen `web.mentolder.de` verifizieren:
      `npx playwright test specs/agent-guide-walkthrough.spec.ts --project website`.
      Erwartung: 22 Tests grün.

## 2. Gruppen-Modifier auflösen (F2/D1)

Je Datei: die Zeile im `describe`-Body entfernen und den gemeinten Teiltest einzeln markieren.
Existiert der gemeinte Teiltest nicht, entfällt die Zeile ersatzlos.

- [ ] 2.1 `specs/nfa-01-dsgvo.spec.ts:57` — 3 Tests reaktivieren
- [ ] 2.2 `specs/nfa-02-performance.spec.ts:52` — 4 Tests; T4 (Lighthouse) einzeln markieren
- [ ] 2.3 `specs/nfa-03-availability.spec.ts:39` — 4 Tests; T1/T2/T4 einzeln markieren
- [ ] 2.4 `specs/nfa-04-scalability.spec.ts:36` — 2 Tests
- [ ] 2.5 `specs/nfa-06-website-restart.spec.ts:28` — 3 Tests
- [ ] 2.6 `specs/nfa-12-brainstorm-tunnel.spec.ts:23` — 2 Tests
- [ ] 2.7 `specs/ak-03-technical.spec.ts:53` — 5 Tests (Zusammenführung siehe 3.4)
- [ ] 2.8 `specs/nfa-11-gpu-vram.spec.ts:45` — Datei wandert nach 4.2 in den lokalen Lauf;
      Modifier dort korrekt pro Test setzen
- [ ] 2.9 Verbleibende Dateien (`ak-04:76`, `nfa-07:32`, `nfa-08:44`, `nfa-09:31`) werden in
      Task 3 behandelt — keine separate Auflösung nötig
- [ ] 2.10 Vollen Lauf gegen prod fahren, Ergebnis der reaktivierten Tests dokumentieren.
      Rote Tests als `type=bug`-Tickets erfassen (G-DORA03), nicht erneut skippen.

## 3. Repo-Asserts entfernen, E2E-Anteile erhalten (F4/D3)

- [ ] 3.1 `specs/nfa-08-production-deploy.spec.ts` löschen (6 Tests, vollständig Repo-Assert)
- [ ] 3.2 `specs/nfa-09-static-dns.spec.ts` löschen (4 Tests, vollständig Repo-Assert)
- [ ] 3.3 `specs/ak-04-prototype.spec.ts` löschen — 5 Repo-Asserts entfallen; T5a/T5b sind
      Dubletten der DSGVO-Prüfungen in `nfa-01` und dort bereits abgedeckt (nach 2.1 verifizieren,
      bevor gelöscht wird)
- [ ] 3.4 `specs/nfa-07-opensource.spec.ts` — die zwei Datei-Asserts (LICENSE, Copyright in
      Konfigs) entfernen; „Website gibt keine proprietären Lizenzhinweise aus" bleibt
- [ ] 3.5 `specs/ak-03-technical.spec.ts` — T3a/T3b/T3c prüfen dieselben drei Hosts wie `nfa-03`;
      Dubletten auflösen, die Browser-Prüfungen T3d/T3e in `nfa-03` überführen, `ak-03` entfällt
- [ ] 3.6 `playwright.config.ts` — `**/ak-03-*`, `**/ak-04-*`, `**/nfa-08-*`, `**/nfa-09-*` aus
      dem `services`-Projekt entfernen
- [ ] 3.7 `tests/spec/ci-cd/e2e-project-selection.bats` grün halten (prüft, dass jedes Projekt aus
      der Config im Workflow aufgezählt oder bewusst ausgeschlossen ist)

## 4. SDLC- und LLM-Specs in den lokalen Lauf (F3/D2)

- [ ] 4.1 Projekteintrag in `playwright.local.config.ts` für die 14 `guardSdlc`-Specs anlegen:
      `dev-status-tabs`, `fa-42-platform-assets`, `fa-43-ticket-widget`, `fa-48-factory-devflow`,
      `fa-49-factory-observability`, `fa-53-systemtest-failure-loop`, `fa-58-admin-cockpit`,
      `fa-bug-t000368`, `fa-factory-floor`, `fa-factory-injection`, `fa-kommissionierung`,
      `fa-mobile-factory`, `fa-planning-office`, `sa-21-admin-actions`
- [ ] 4.2 Dieselbe Behandlung für die LLM-/GPU-Specs: `fa-32`, `fa-33`, `fa-34`, `fa-36`, `fa-37`,
      `nfa-11`
- [ ] 4.3 `specs/fa-29-cockpit.spec.ts` löschen — trägt „obsolete due to SDLC Cockpit redesign"
      im eigenen `describe`-Titel und prüft eine ersetzte Oberfläche
- [ ] 4.4 `lib/sdlc-guard.ts` fail-loud machen: außerhalb des Nightly ist eine fehlende
      SDLC-Route ein Fehler, kein Skip
- [ ] 4.5 Die verschobenen Specs aus den Nightly-Projekten in `playwright.config.ts` entfernen
- [ ] 4.6 Aufruf des lokalen Laufs in `.claude/skills/dev-flow-e2e/SKILL.md` dokumentieren

## 5. Runner-Auth für Brett vervollständigen (F5/D4)

- [ ] 5.1 `.github/workflows/e2e.yml` — Schritt „Prepare Fleet kubeconfig" aus dem `sso-e2e`-Job
      (Zeile 283–300) in den Matrix-Job übernehmen: kubectl installieren, `umask 077`,
      Kubeconfig aus `secrets.FLEET_KUBECONFIG`, `chmod 600`
- [ ] 5.2 Fehlt das Secret, bleibt das Verhalten unverändert (fail-closed `fixme` in
      `brett-mentolder-auth-setup`) — kein stilles Grün
- [ ] 5.3 Lauf verifizieren: `brett-mentolder-setup` grün, `brett-mentolder` läuft statt zu
      skippen (~30 Tests)
- [ ] 5.4 Prüfen, ob `sso-e2e` nach 5.1 noch einen eigenen Job braucht oder im Matrix-Job aufgeht

## 6. Rückfall verhindern

- [ ] 6.1 BATS-Guard in `tests/spec/e2e-test-infrastructure/`: schlägt fehl, wenn eine Spec-Datei
      `test.skip(true` oder `test.fixme(true` direkt im `describe`-Body trägt.
      Messbefehl: `grep -rnE "^  test\.(skip|fixme)\(true" tests/e2e/specs/*.spec.ts`
- [ ] 6.2 BATS-Guard: keine Spec-Datei löst `repoRoot` über `path.resolve(__dirname, '../../../../')`
      auf
- [ ] 6.3 Delta-Spec nach `openspec/specs/e2e-test-infrastructure.md` mergen (`/opsx:archive`)

## 7. Abschluss

- [ ] 7.1 Nightly-Lauf nach dem Merge auswerten und die Zielzahlen gegen die Ist-Werte stellen
      (~520 Tests, ~65 Skips)
- [ ] 7.2 Verbleibende Skips nach Ursache auflisten — Grundlage für den Folge-Change zu den
      datenabhängigen Skips
