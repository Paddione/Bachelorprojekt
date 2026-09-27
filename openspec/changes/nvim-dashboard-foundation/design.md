---
ticket_id: T900655
plan_ref: openspec/changes/nvim-dashboard-foundation/tasks.md
status: active
date: 2026-09-27
---

# T900655 — Dashboard-Grundgerüst & Runbook-Index: Design-Spec

**Ticket:** T900655 · **EPIC:** T900654 (Neovimintegration) · **Status:** Brainstorming abgeschlossen, Proposal folgt.

## 1. Ausgangslage (live erhoben 2026-09-27, keine Snapshot-Annahmen)

- Ziel-Neovim WSL: `/usr/local/bin/nvim`, v0.12.5, `stdpath(config)=/home/patrick/.config/nvim`. Nativ-Windows-Neovim separat zu prüfen (Version, stdpath, Shell).
- `~/.config/nvim` ist leer (alter Stand liegt unter `~/.config/nvim.old-20260927`, 471-Zeilen-`init.lua`, Module `comfyui/dashboard/editor/inference_factory/nodectl/opencode_files/opencode_wsl`, `llm/init.lua`, 13 Plugins im `lazy-lock.json`). Headless-Start ohne Config verifiziert (Exit 0).
- Rollback: `mv ~/.config/nvim.old-20260927 ~/.config/nvim`. Alte `~/.config/nvim-backup*`-Verzeichnisse (3) unangetastet, Löschung nur mit Freigabe.
- Windows-Wrapper `%LOCALAPPDATA%\nvim\init.lua` (UNC + robocopy-Cache) unangetastet; lädt die WSL-Config, findet derzeit nichts.
- EPIC-Querschnittsregeln (T900654) gelten: Runbook pro Seite/Unterseite im Master-Index, gleiche Namen/Reihenfolge, Suche springt zur Aktion (Ausführen separat), kein OpenSpec im Dashboard-Plan, Windows/WSL-Routing erhalten, Produktionsaktionen manuell, Plugin-Bestand erhalten (13 aus lazy-lock), kein format-on-save, keine versteckten Deployments/Git-Mutationen, Git-Root immer aus dem aktuellen Buffer.
- T900665 (Factory & Proxy) ist `archived · obsolete` — kein Factory-Kapitel mehr (11 → 10 Kapitel + 2 Querschnitt-Tickets).
- Repo-Befund: `dotfiles/nvim/` existiert nur als **ignorierte, ungetrackte** Ablage im Haupt-Checkout (`.gitignore:179` ignoriert `dotfiles/`, getrackt wird per `git add -f` — Konvention, auch im nodectl-README dokumentiert). Auf `origin/main` gibt es **kein** `dotfiles/nvim/`. Neue Worktrees sehen die ignorierten Kopien nicht.
- Altkonfig-Migrationswert (geprüft, nicht übernommen): Snacks-Dashboard-Seitenmuster (`home → Kategorie → Unterseite → zurück`, `M.show/M.sections`, Tasten-Navigation) und Editor-Defaults sind als Gerüst tauglich. Eine pufferbasierte Git-Root-Funktion existiert **nicht** (nur ein Factory-spezifischer Async-Probe in `inference_factory.lua:59`, plus hartcodierte Pfad-Fallbacks in `nodectl.lua:36`).
- Prior Art: kein Neovim-Spec in `openspec/specs/` (neue Komponente → `archive --create-new`), kein nvim-Guard in `tests/spec/` (`tests/spec/vim-ai-completion/` targetet Classic-Vim/llama-vim, liefert aber das Headless-Output-Verifikationsmuster). S1-Limits enthalten **kein** `.lua`/`.bats` — neue Lua-/BATS-Dateien sind nicht budgetgedeckelt.
- `dotfiles/install.sh` kennt kein nvim (141 Zeilen, nicht gebaselinined, `.sh`-Limit 800 → Budget 659).

## 2. Ziele

1. Neues Grundgerüst: `init.lua`, lazy.nvim-Bootstrap, Modulstruktur unter `lua/` — als Repo-SSOT unter `dotfiles/nvim/`, per `git add -f` getrackt (Ignore bleibt, Konvention wie agy/claude-code/opencode).
2. Git-Root-Funktion: Repo-Wurzel der aktuellen Datei per `git rev-parse --show-toplevel` (Worktrees, unbenannte Buffer, Dateien außerhalb Git abgefangen — kein stiller Fallback auf ein anderes Projekt).
3. Dashboard-Shell: Home/Index, Kategorieseiten, Unterseiten, Zurück-Navigation (Snacks-Bestand, kein neues Plugin).
4. Suche über Kategorien/Aktionen: Auswahl fokussiert die Aktion, Ausführen ist ein zweiter Schritt.
5. Aktionsmodell: Name, Eingaben, Ziel/Wirkung, Arbeitsverzeichnis, Fehlerverhalten — sichtbar und manuell.
6. Runbook-Master-Index mit fester Kapitelreihenfolge + lokalem Inhaltsverzeichnis je Kapitel.
7. Runbook-Vorlage: Voraussetzungen, geordnete Schritte, erwartetes Ergebnis, Troubleshooting, Recovery — plus maschinenlesbarer Kopf, damit Agenten-Runbooks (openclaw) später andocken können.
8. Abdeckungsprüfung: jede Seite/Unterseite hat ein Runbook, Namen/Reihenfolge stimmen überein.
9. Install-Weg (`dotfiles/install.sh` + README), Rollback-Doku, Windows-Wrapper-Test gegen die neue Config.
10. BATS-Headless-Tests (Output-Verifikation, kein Source-Grep) + Test-Inventar-Regeneration.

## 3. Nicht-Ziele (mit Ticket-Referenz)

- Treesitter/LSP/Blink → T900656. Keine neuen Plugins in T900655 (nur die 13 aus lazy-lock verifizieren).
- Kapitel-Inhalte und Kapitel-Runbooks → T900657–T900664, T900666, T900667 (T900655 liefert Vorlage + Index + Home-Runbook + Prüfmechanismus; Kapitel-Runbooks kommen mit ihren Tickets, Index führt sie als Stub).
- nodectl-Verdrahtung → T900664 (Dateien beider Ablagen — ignorierte Kopien, Alt-Backup — bleiben unberührt).
- openclaw-Selbstheilungslogik (Guards, Modellwahl, Staging, Telegram) → T900538. T900655 liefert nur die andockfähige Struktur (User-Entscheid 2026-09-27: Struktur-only).
- Native-Windows-Verifikation ist ein manueller Schritt (kein Windows-Runner in dieser Umgebung).
- Backup-Verzeichnisse werden bewertet, nicht gelöscht.

## 4. Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| SSOT-Ablage | `dotfiles/nvim/` im Repo, `git add -f` (Ignore bleibt) | Einzige testbare/reviewbare Ablage; BATS-Tests brauchen die Config aus dem Repo; Konvention besteht |
| Install | Kopie nach `~/.config/nvim` (Präzedenz nodectl-README), idempotenter `install.sh`-Schritt | Nachvollziehbar, rollbackfähig, kein Symlink-Risiko über die WSL-Grenze |
| Plugin-Manager | lazy.nvim bleibt (stable-Pin wie bisher) | Bestand, kein Migrationsgrund |
| Dashboard-Basis | snacks.nvim, Seitenmodul-Muster aus Alt-Config (`M.show/M.sections`) | Bewährt, keine neue Abhängigkeit |
| Plugin-Set | Exakt die 13 aus `lazy-lock.json`, Ladecheck auf 0.12.5 | EPIC-Regel „Bestand erhalten, Überschneidung prüfen" |
| Runbook-Ablage | `dotfiles/nvim/runbooks/` (mit der Config installiert) | Benutzer-Doku gehört zur Config; `docs/runbooks/` bleibt Agenten-Doku |
| Abdeckungsprüfung | BATS-Test (parst Dashboard-Seiten + Index) | Prüflogik als Test statt Skript: keine S4-Orphan-Frage, CI-fähig |
| nodectl | Unverdrahtet bis T900664, kein Kompat-Shim | Shim wäre ungetesteter Ballast; Kapitel-Ticket migriert sauber |
| Windows-Wrapper | Unverändert, nur Verhalten gegen neue Config testen | EPIC-Regel „Routing erhalten" |
| Staging | `stage-plan --no-hold` | EPIC-Ablauf: „gestagt und zur Ausführung freigegeben (nicht gehalten)" — weicht bewusst von der interaktiven `--hold`-Regel ab |

## 5. Modulstruktur (Ziel-Dateien, alle neu außer vermerkt)

```text
dotfiles/nvim/
  init.lua                    # Bootstrap: leader, lazy.nvim, requires (~120 Zeilen)
  lua/config/editor.lua       # Editier-Defaults (Alt-Verhalten reviewed migriert)
  lua/config/gitroot.lua      # NEU: Git-Root-Funktion (pufferbasiert)
  lua/config/dashboard.lua    # NEU: Shell (home/Kategorie/Unterseite/zurück) + Suche + Aktionsmodell
  lua/plugins/core.lua        # NEU: lazy-Specs der 13 Bestands-Plugins
  runbooks/README.md          # NEU: Master-Index (feste Reihenfolge, Stub-Markierung)
  runbooks/_template.md       # NEU: Vorlage (Abschnitte + Maschinen-Kopf)
  runbooks/home.md            # NEU: Home-Runbook (Referenz-Umsetzung der Vorlage)
  README.md                   # NEU (bestehende ignorierte Kopie ist nodectl-alt, wird ersetzt): Install, Bedienung, Rollback
dotfiles/install.sh           # BESTEHEND (141, Budget 659): idempotenter nvim-Schritt
docs/runbooks/neovim-plugin-scouting.md  # BESTEHEND (62, .md ungedeckelt): dauerhafte Fakten nachziehen
tests/spec/neovim-dashboard.bats         # NEU: Headless-Tests (Startup, gitroot, Seiten, Abdeckung)
components/website/src/data/test-inventory.json  # GENERIERT: via task test:inventory
```

GIVEN a fresh checkout WHEN the plan executes THEN every file above is created or updated in exactly one partial (D1-disjunkt).

## 6. Feste Kapitelreihenfolge (Master-Index + Dashboard-Home)

1. Files & Search (T900657) · 2. JavaScript / Frontend (T900658) · 3. GitHub (T900659) · 4. SDLC (T900660) · 5. Repository & Code Knowledge (T900661) · 6. AI & Agents (T900662) · 7. Models & Inference (T900663) · 8. Infrastructure (T900664) · 9. ComfyUI & Images (T900666) · 10. Settings & Help (T900667). Querschnitt: Grundgerüst (T900655, dieses Ticket), Editor-Fähigkeiten (T900656). Reihenfolge = EPIC-Liste ohne das archivierte Factory-Kapitel.

## 7. Runbook-Vorlage (Abschnitte)

Maschinen-Kopf (`page`, `ticket`, `status: stub|complete`, `actions[]` mit Namen+Reihenfolge) + H2-Abschnitte: Voraussetzungen · Geordnete Schritte · Erwartetes Ergebnis · Troubleshooting · Recovery. Der Abdeckungstest vergleicht `actions[]` mit den Dashboard-Aktionen derselben Seite (Namen + Reihenfolge identisch).

## 8. Teststrategie (STRUCT2-Failing-Test)

BATS unter `tests/spec/neovim-dashboard.bats`, Guard `command -v nvim || skip`, isoliertes `XDG_CONFIG_HOME` mit Repo-Config, `nvim --headless -u … -i NONE`-Assertions: sauberer Startup (Exit 0, kein Error im Log), Git-Root-Funktion (Repo-Datei → Top-Level; Worktree-Datei → Worktree-Root; unbenannter Buffer → abgefangen; Nicht-Git-Datei → abgefangen; Pfad mit Leerzeichen), Dashboard-Seitenliste = Kapitelreihenfolge, Runbook-Abdeckung (Index ↔ Seiten, Stub-Markierung erlaubt). Rotphase zuerst (`expected: FAIL` + echter `bats`-Aufruf), dann grün.

## 9. Verifikation (STRUCT3 + Editor-Szenarien)

Finaler Verify-Task: `task test:changed` + `task freshness:regenerate` + `task freshness:check` (+ `task test:inventory` nach Test-Änderung). Editor-Szenarien headless gegen die neue Config: verschachtelte Datei, Worktree-Datei, Pfad mit Leerzeichen, Quickfix unberührt. Manuell (dokumentiert, nicht automatisiert): nativ-Windows-Neovim (Version/stdpath/Shell), Windows-Wrapper gegen neue Config (Fallback, Cache-Spiegelung), `:Lazy`-Erstinstallation der 13 Plugins.

## 10. Risiken

- `codebase-memory`/LSP/TEI in dieser Umgebung nicht erreichbar → `intel.json`-Sektionen dazu entfallen, stattdessen `risks[]`-Einträge (Generator-Regel).
- nvim 0.12.5 ist neuer als dokumentierte Plugin-Stände → Ladecheck je Plugin ist Plan-Task, kein Vorab-Vertrauen.
- Ignorierte `dotfiles/nvim/`-Kopien im Haupt-Checkout sind in Worktrees unsichtbar → Plan referenziert als Alt-Referenz ausschließlich `~/.config/nvim.old-20260927` (Host-Pfad, dokumentiert) und getrackte Dateien.
- `stage-plan` braucht `--partials N` (1..9) und explizit `--no-hold` (EPIC-Vorgabe); `touched_files`-Ableitung erfordert Commit-vor-Stage (T002673).
