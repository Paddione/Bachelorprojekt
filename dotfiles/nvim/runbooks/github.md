---
page: github
ticket: T900659
status: complete
actions:
  - branch-status
  - diff-view
  - pr-view
  - review-list
  - pr-checks
  - failure-logs
  - release-view
  - pr-merge
  - branch-cleanup
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655) und der GitHub-Seite (T900659 p1).
- **gh** ist installiert (verifiziert: v2.101.0) und authentifiziert (`gh auth status` meldet einen eingeloggten Account). Alle Maschinenlese-Zugriffe (`--json`/`--jq`-Pipelines), alle Status-Abfragen und alle Mutationen laufen direkt ueber `gh` (T004612).
- **gh-axi** ist optional, wird aber fuer die Anzeige bevorzugt, sobald das Binary vorhanden ist (verifiziert: `~/.npm-global/bin/gh-axi`, 16 Kommandos inkl. `pr`, `run`, `release`): `pr-view`, `review-list` und `release-view` rendern dann ueber `gh-axi`, sonst ueber `gh`.
- **Gitsigns** ist in `plugins/core.lua` enthalten (T900655, gepinnt in `lazy-lock.json`) — kein neues Plugin noetig. Die `diff-view`-Aktion liest ihre Hunk-Daten aus Gitsigns; ohne Gitsigns (z. B. headless) faellt sie auf `git diff --stat` zurueck.
- Der aktuelle Buffer muss innerhalb eines Git-Repository liegen: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).
- Netzwerk zur Laufzeit ist nur fuer die `gh`/`gh-axi`-Aufrufe noetig (PRs, Checks, Runs, Releases); `branch-status` und `diff-view` arbeiten rein lokal.

## Geordnete Schritte

Der Runbook-Ablauf folgt dem Kapitel-Fluss: Change vorbereiten (1–2), reviewen (3–4), CI pruefen (5–6), mergen (8), aufraeumen (9); Schritt 7 zeigt begleitend die Releases. Vor jeder Aktion zeigt das Modul das Ziel-Tripel (Repo, Branch, PR-Nummer) per `:notify` an — das Ziel ist immer sichtbar, bevor etwas laeuft.

1. **branch-status**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "GitHub"). Der Fokus auf der Zeile hat keine Nebenwirkung (focus-versus-execute: erst Enter bzw. die gezeigte Taste fuehrt die Aktion aus). Druecken Sie `b`. Die Aktion meldet den aktuellen Branch, den Upstream-Tracking-Stand mit Ahead/Behind-Zaehlern und den Repo-Namen. Lesend, keine Bestaetigung noetig.

2. **diff-view**: Druecken Sie `d` (erst fokussieren, dann Taste druecken). Die Aktion fasst die Gitsigns-Hunks des aktuellen Buffers zusammen (Anzahl, hinzugefuegt/geaendert/entfernt). Ist Gitsigns nicht geladen, zeigt sie stattdessen `git diff --stat`. Lesend, keine Bestaetigung noetig.

3. **pr-view**: Druecken Sie `p`. Die Aktion zeigt den Pull Request des aktuellen Branchs an (Anzeige bevorzugt `gh-axi pr view <n>`, Fallback `gh pr view <n>`). Gibt es keinen PR zum Branch, erscheint eine Warnung statt einer Anzeige. Lesend, keine Bestaetigung noetig.

4. **review-list**: Druecken Sie `r`. Die Aktion zeigt Review-Status und Review-Kommentare des PRs (`gh-axi pr view <n> --reviews`, Fallback `gh pr view <n> --comments`). Lesend, keine Bestaetigung noetig.

5. **pr-checks**: Druecken Sie `c`. Die Aktion zeigt den `gh pr checks`-Status des PRs (direkt ueber `gh`, Status-Plumbing). Lesend, keine Bestaetigung noetig.

6. **failure-logs**: Druecken Sie `l`. Die Aktion ermittelt den neuesten fehlgeschlagenen Run des Branchs (`gh run list --branch <branch> --status failure --limit 1 --json`) und zeigt dessen fehlgeschlagene Job-Logs (`gh run view <id> --log-failed`, direkt ueber `gh`). Gibt es keinen fehlgeschlagenen Run, erscheint eine Warnung. Lesend, keine Bestaetigung noetig.

7. **release-view**: Druecken Sie `v`. Die Aktion loest das neueste Release-Tag per `gh --json` auf und zeigt dessen Notes an (Anzeige bevorzugt `gh-axi release view <tag>`, Fallback `gh release view <tag>`). Gibt es kein Release, erscheint eine Warnung. Lesend, keine Bestaetigung noetig.

8. **pr-merge**: Druecken Sie `m`. **Mutation mit kanonischem Guard.** Die Aktion zeigt Ziel-Tripel und Effekt ("squash-merge PR #N in seinen Base-Branch", exaktes Kommando `gh pr merge <n> --squash`, squash-merge per Repo-Konvention aus dem git-workflow-Skill) und verlangt eine bewusste Bestaetigung per `vim.fn.confirm` (Vorgabe: Nein). Erst bei "Yes" laeuft der Merge; bei "No" bricht die Aktion ab, ohne ein einziges externes Kommando auszufuehren.

9. **branch-cleanup**: Druecken Sie `x`. **Mutation mit kanonischem Guard.** Die Aktion zeigt Ziel-Tripel und Effekt (Branch lokal und auf dem Remote loeschen) und verlangt dieselbe bewusste Bestaetigung. Erst bei "Yes" laufen `git branch -d <branch>` (verweigert ungemergte Branches von sich aus) und `git push origin --delete <branch>`; bei "No" laeuft nichts. Die Branch-Namen folgen den Repo-Praefixen (`feature/*`, `fix/*`, `chore/*`, `docs/*`).

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen, Suchtreffer fokussieren) fuehrt **keine** Aktion aus ("focus-no-side-effect", per headless Probe verifiziert); erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion.

## Erwartetes Ergebnis

- Die Seite "GitHub" zeigt genau neun Aktionen in dieser Reihenfolge: `branch-status`, `diff-view`, `pr-view`, `review-list`, `pr-checks`, `failure-logs`, `release-view`, `pr-merge`, `branch-cleanup` (Tasten `b d p r c l v m x`, alle verschieden).
- Jede Aktion zeigt zuerst das Ziel-Tripel (Repo, Branch, PR-Nummer bzw. "no PR") an, bevor sie etwas ausfuehrt.
- Die sieben lesenden Aktionen laufen direkt durch und brauchen keine Bestaetigung; die zwei Mutationen (`pr-merge`, `branch-cleanup`) verlangen den kanonischen Guard (sichtbarer Ziel-Hinweis plus bewusste Bestaetigung, Vorgabe Nein).
- Anzeigen laufen bevorzugt ueber `gh-axi`, sobald das Binary vorhanden ist; Maschinenlese-Zugriffe und alle Mutationen laufen direkt ueber `gh` (T004612).
- Headless-Start des Moduls (`require('config.github')`) endet mit Exit-Code 0 und definiert genau die neun Aktionen plus `target` und `confirm_or_abort`.
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.
- Die bestehende Gitsigns-Funktion (Hunk-Zeichen, In-Buffer-Diffs) bleibt unveraendert; das Modul definiert keine Mappings und installiert kein neues Plugin.

## Troubleshooting

- **Warnung "no pull request for branch ..."**: Der Branch hat (noch) keinen PR. PR erst mit `gh pr create` anlegen (Titel/Body, Base beachten), dann die Aktion wiederholen.
- **Remote nicht erreichbar / `gh` meldet Auth- oder Netzwerkfehler**: `gh auth status` pruefen (Account eingeloggt?), danach Erreichbarkeit (`git ls-remote origin HEAD`). Alle `gh`/`gh-axi`-Aktionen brauchen einen erreichbaren Remote; `branch-status` und `diff-view` funktionieren offline weiter.
- **"no failed runs" / leere Checks**: `pr-checks` zeigt nur an, was der Remote meldet — ohne Checks bzw. ohne fehlgeschlagene Runs erscheint die Warnung statt einer Anzeige. In `gh-axi run list --branch <branch>` bzw. auf dem PR gegenpruefen, ob Runs existieren.
- **Bestaetigung abgelehnt ("aborted by user")**: Der Guard hat die Mutation verworfen — es lief kein externes Kommando, es gibt nichts zurueckzurollen. Aktion bei Bedarf erneut ausloesen und bestaetigen.
- **`branch-cleanup` meldet "local delete: ..."**: `git branch -d` verweigert ungemergte oder ausgecheckte Branches — zuerst mergen bzw. den Branch wechseln, dann wiederholen. Der Remote-Loeschschritt laeuft unabhaengig davon und meldet sein eigenes Ergebnis.
- **Gitsigns-Daten fehlen in `diff-view`**: Das Plugin wurde nicht geladen (`:Lazy` pruefen, Teil von `plugins/core.lua`). Die Aktion faellt automatisch auf `git diff --stat` zurueck.

## Recovery

- Die sieben lesenden Aktionen schreiben nichts: Es gibt keinen persistenten Zustand zurueckzurollen.
- Einen versehentlichen Merge macht `gh pr revert <n>` rueckgaengig (erzeugt einen Revert-PR auf dem Base-Branch); danach den geloeschten Branch bei Bedarf neu erstellen (`git checkout -b <branch> <base>` bzw. aus dem Remote wiederherstellen) und erneut pushen.
- Einen versehentlich lokal geloeschten Branch stellt `git reflog`/`git checkout -b <branch> <sha>` wieder her; einen versehentlich remote geloeschten Branch durch erneutes Pushen (`git push -u origin <branch>`).
- Seite entfernen = p1-Modul entfernen: `dotfiles/nvim/lua/config/github.lua` loeschen und den `github`-Eintrag in `dotfiles/nvim/lua/config/dashboard.lua` entfernen (der Auto-Stub uebernimmt wieder), dazu `dotfiles/nvim/runbooks/github.md` loeschen.

## Quellen

- Stand 2026-09-28, live verifiziert: `nvim --version` v0.12.5, `gh --version` 2.101.0, `~/.npm-global/bin/gh-axi --help` 16 Kommandos (inkl. `pr view --reviews`, `release view <tag>`, `run view --log-failed`), Gitsigns `plugins/core.lua` Zeile 3 mit Pin in `lazy-lock.json`.
- Repo-Konventionen aus dem git-workflow-Skill (Squash-Merge, Branch-Praefixe `feature/*`, `fix/*`, `chore/*`, `docs/*`) und T004612 (`gh-axi` fuer Anzeige, `gh` direkt fuer Mutationen und maschinenlesbare Ausgabe).
