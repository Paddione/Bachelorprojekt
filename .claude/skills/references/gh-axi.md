# gh-axi — GitHub CLI Wrapper

`gh-axi` ist ein Ergonomie-Wrapper um die `gh` CLI. **Alle Agents sollen `gh-axi` statt `gh` direkt verwenden**, sofern ein passendes Sub-Kommando existiert. (Framework-agnostisch — funktioniert in Claude Code, opencode und agy gleichermaßen.)

Binary: `~/.npm-global/bin/gh-axi`  
Repo-Kontext: wird automatisch aus dem aktuellen Git-Checkout abgeleitet (kein `-R` nötig).

### Kommando-Referenz

```bash
gh-axi                           # Dashboard — Live-Zustand, keine Args nötig
gh-axi issue list                # Issues im aktuellen Repo auflisten
gh-axi issue subissue list 16    # Sub-Issues für Issue #16
gh-axi pr view 42                # Pull Request #42 ansehen
gh-axi run list -R owner/repo    # Workflow-Runs für ein bestimmtes Repo
gh-axi run view 123456 --job 789012        # Einzelnen Job innerhalb eines Runs inspizieren
gh-axi run view --job 789012 --log-failed  # Fehlgeschlagene Log-Zeilen für einen Job
gh-axi setup hooks               # Optionale Agent-Session-Hooks installieren
```

### Wann `gh` statt `gh-axi`

`gh-axi` deckt die häufigen read/view-Flows ab. Für Operationen ohne `gh-axi`-Pendant (z. B. `gh pr create`, `gh pr merge`, `gh api`) direkt `gh` nutzen — die SessionStart-Hook-Ausgabe zeigt den verfügbaren Befehlssatz.

### Achtung: `gh pr edit --title` — GraphQL-Deprecation [T002042, T002048]

`gh pr edit --title` scheitert an einer Projects-Classic-GraphQL-Deprecation-Warning, die GitHub CLI
unbehandelt durchreicht — der Title-Change wird **silent no-op**.

**Stattdessen die REST API direkt nutzen:**
```bash
# Fehlanfällig (vermeiden):
gh pr edit <N> --title "neuer Titel"

# REST-API-Fallback (immer):
gh api repos/{owner}/{repo}/pulls/<N> -X PATCH -f title="neuer Titel"
```

**Label-Edit (`--add-label`):** nicht betroffen (eigener GraphQL-Endpunkt ohne Deprecation), kann
weiter `gh pr edit` nutzen.
