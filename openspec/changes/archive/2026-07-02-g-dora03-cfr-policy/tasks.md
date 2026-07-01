---
title: "G-DORA03: Change Failure Rate auf ≤15% bringen (15.9%→≤15%)"
ticket_id: T001300
domains: ["ci","quality","dora"]
status: plan_staged
---

# g-dora03-cfr-policy — Implementation Plan

## File Structure

| Status | Datei | Beschreibung |
|--------|-------|--------------|
| Geändert | `.github/workflows/ci.yml` | `astro check`-Step als required-Gate absichern |
| Geändert | `scripts/vda.sh` | Neues `cfr` Subcommand für den Measure-Command |
| Geändert | `CLAUDE.md` | Bug-Triage-Konvention als Development Rule ergänzen |

## Task 0: Baseline messen (RED)

- [ ] Measure-Command ausführen:
  ```bash
  T=$(git log --since="8 weeks ago" --first-parent --oneline main | wc -l)
  F=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE '^[0-9a-f]+ fix\(')
  python3 -c "print(f'{$F/$T*100:.1f}% breit')"
  ```
  expected: FAIL (aktueller Wert: 15.9% breit — über Target ≤15% Elite-Band)

## Task 1: `astro check`-Step in CI absichern

Prüfen ob der in T001277 hinzugefügte `astro check`-Step korrekt als Pflicht-Gate konfiguriert ist.

- [ ] `ci.yml` lesen: sicherstellen, dass der `astro check`-Step vorhanden ist und bei Fehler den Job mit Exit-Code 1 abbricht.
- [ ] Den Step-Namen notieren (z. B. `Astro Type Check` oder ähnlich). Mit `gh api repos/{owner}/{repo}/branches/main/protection` prüfen, ob er als required status check eingetragen ist.
- [ ] Falls nicht als required check registriert: `gh api --method PUT repos/{owner}/{repo}/branches/main/protection` mit dem korrekten `required_status_checks.contexts`-Array aufrufen, das den `astro check`-Step-Namen enthält (ohne bestehende required checks zu entfernen — vollständige Liste lesen und ergänzen).
- [ ] Gegen `main` testen: `cd website && pnpm astro check` ausführen. Schlägt dieser Befehl fehl, sind die gemeldeten Fehler vor Aktivierung des required-check zu beheben.
- [ ] Ergebnis: `astro check` läuft grün auf `main` und ist als required Status-Check registriert.

## Task 2: `cfr` Subcommand in `scripts/vda.sh` ergänzen

Den Measure-Command als reproduzierbares Subcommand kapseln, sodass er von jedem Entwickler und Agent ohne Memorisierung aufgerufen werden kann.

- [ ] `scripts/vda.sh` lesen: Muster für bestehende Subcommands (z. B. `release-notes`) identifizieren.
- [ ] Neuen `cfr`-Case im Dispatch-Block ergänzen:
  ```bash
  cfr)
    T=$(git log --since="${CFR_WINDOW:-8 weeks ago}" --first-parent --oneline main | wc -l)
    F=$(git log --since="${CFR_WINDOW:-8 weeks ago}" --first-parent --oneline main | grep -ciE '^[0-9a-f]+ fix\(')
    python3 -c "print(f'CFR breit (fix()-Proxy): {$F/$T*100:.1f}% ({$F} fix / {$T} total) — Target: ≤15%')"
    ;;
  ```
- [ ] Hilfe-Text im `usage`/`help`-Block ergänzen: `cfr — misst Change Failure Rate (fix()-Commits/Merges, letzten 8 Wochen, opt. CFR_WINDOW=<date>)`.
- [ ] Manuell testen: `bash scripts/vda.sh cfr` gibt eine Zeile mit Prozentwert, absoluten Zahlen und Target-Hinweis aus. `CFR_WINDOW="4 weeks ago" bash scripts/vda.sh cfr` gibt einen anderen Wert für das kürzere Fenster aus.
- [ ] Sicherstellen, dass `$T = 0` nicht zu Division-by-zero führt: Python gibt in dem Fall `0.0%` aus oder der Bash-Aufruf prüft `[[ $T -eq 0 ]]` und gibt `n/a (keine Merges im Fenster)` aus.

## Task 3: Bug-Triage-Konvention in `CLAUDE.md` dokumentieren

Einen neuen Gotcha-Eintrag ergänzen, der die Konvention festlegt: Bugs, die nach Merge entdeckt werden, werden als `type=bug`-Ticket erfasst und in der nächsten Factory-Runde repariert — nicht als anonymer `fix()`-Commit ohne Ticket-Referenz.

- [ ] `CLAUDE.md` lesen: Abschnitt `## Gotchas & Footguns` finden.
- [ ] Neuen Eintrag `### Bug-Triage-Konvention (CFR-Gate G-DORA03)` anhängen:
  ```markdown
  ### Bug-Triage-Konvention (CFR-Gate G-DORA03)

  **Jeder nach-Merge entdeckte Fehler wird als `type=bug`-Ticket erfasst.**
  Kein stiller `fix()`-Commit ohne Ticket-Referenz. Die Change Failure Rate
  (broad proxy: fix()-Rate) wird mit `bash scripts/vda.sh cfr` gemessen —
  Ziel: ≤ 15 % über 8 Wochen. Ein ungeticketer `fix()`-Commit zählt als
  verschleierter Bug und verschlechtert den Proxy-Wert, ohne dass er in der
  DORA-Auswertung unter `/admin/dora` erscheint.

  Ablauf: Bug entdecken → `bash scripts/ticket.sh create --type bug --title "..."` →
  Branch + PR → nach Merge wird Ticket automatisch `done`.
  ```
- [ ] Sicherstellen, dass der neue Abschnitt keine offenen Platzhalter oder ausstehenden Punkte enthält.

## Task 4 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-DORA03` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
