---
title: "p1 — Library: worktree-prune-safe.sh"
status: pending
depends_on: []
---

# p1 — Library: worktree-prune-safe.sh

## Aufgabe

Erstelle `scripts/lib/worktree-prune-safe.sh` mit der Funktion `worktree_prune_safe()`.

## Implementierung

### Plattform-Erkennung

Die Funktion muss zuerst detektieren, ob Git aus WSL läuft:

1. **Primär-Signal:** `git --exec-path` enthält `/wsl` gefolgt von `/` oder End-of-string.
   ```bash
   exec_path="$(git --exec-path 2>/dev/null || true)"
   if [[ "$exec_path" =~ /wsl([./]|$) ]]; then
     in_wsl=true
   fi
   ```

2. **Fallback-Signal:** Falls `git --exec-path` keine WSL-Spur liefert, prüfe
   `/proc/sys/kernel/osrelease` auf `Microsoft` oder `WSL`.
   ```bash
   if ! $in_wsl && [ -r /proc/sys/kernel/osrelease ]; then
     if grep -qE 'Microsoft|WSL' /proc/sys/kernel/osrelease 2>/dev/null; then
       in_wsl=true
     fi
   fi
   ```

### WSL-Modus: Erreichbarkeits-Prüfung

Wenn `in_wsl=true`:

1. Hole alle registrierten Worktree-Paths via `git worktree list --porcelain`
2. Für jeden Worktree:
   a. Lies den `gitdir`-Eintrag aus `.git/worktrees/<name>/gitdir`
   b. Prüfe, ob die `.git`-Datei aus WSL-Sicht lesbar ist:
      - Windows-Pfade (z.B. `C:/Users/...`) müssen über den WSL-Proxy (`/mnt/c/...`)
        erreichbar sein — versuche `cat` oder `readlink` auf den Pfad
      - Falls nicht lesbar: **skip** diesen Worktree vom Prune
      - Falls lesbar: **prune** diesen Worktree
3. Baue eine gefilterte Liste der erreichbaren Worktrees
4. Führe `git worktree prune` nur für die erreichbaren aus

### Nicht-WSL-Modus

Wenn `in_wsl=false`:

- Führe `git worktree prune` direkt aus (kein Cross-Platform-Problem auf nativen Plattformen)

### Nicht-fatal

Die Funktion MUSS immer exit 0 zurückgeben. Alle Fehler werden geloggt (stderr),
aber nicht propagiert.

## Akzeptanzkriterien

- [ ] Funktion `worktree_prune_safe` existiert in `scripts/lib/worktree-prune-safe.sh`
- [ ] WSL-Erkennung funktioniert via `git --exec-path` und `/proc/sys/kernel/osrelease`
- [ ] Im WSL-Modus werden nicht-erreiche Windows-Pfade vom Prune ausgeschlossen
- [ ] Im Nicht-WSL-Modus wird `git worktree prune` unverändert ausgeführt
- [ ] Funktion gibt immer exit 0 zurück
