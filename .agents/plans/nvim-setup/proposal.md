# nvim-setup — Proposal (EPIC T901043 + Kinder T901044–T901058)

## WARUM

Die projektbewusste Neovim-Konfiguration soll von Grund auf neu aufgebaut werden
(Neuaufbau, kein Copy-Paste). Der alte Stand (EPIC T900654, Einzelplaene
`.agents/plans/nvim-*/`) bleibt als Nachschlagequelle erhalten, wird aber nicht
wiederverwendet: Dashboard-Monolith (`lua/config/dashboard.lua`, 989 Zeilen),
doppelte Plugin-Rollen (snacks.picker/telescope, snacks.terminal/toggleterm),
veraltete Server-/Port-Annahmen und zwei getrackte Config-Kopien mit Drift.

## WAS (Scope)

- SSOT: `Bachelorprojekt/dotfiles/nvim`; `install.sh` Paragraph 5 bleibt der
  einzige Weg Repo-nach-live. Home-Dotfiles-Repo: `.config/nvim` aus Whitelist
  in `~/.gitignore` nehmen, aus Index entfernen (ausserhalb dieses Repos,
  im Plan als verifizierbarer Schritt mit `git`-Proben dokumentiert).
- Fundament zuerst (T901044): Bootstrap, Modulstruktur `lua/core`,
  `lua/chapters`, Dashboard-Shell mit Selbstregistrierung, Aktionsmodell,
  Runbook-Master-Index, `gitroot` aus dem aktuellen Buffer, Windows-Wrapper.
- Danach Kapitel T901045–T901058. Ordnung: T901045 (Editor) vor T901046
  (Files & Search, nutzt den dort gewaehlten Picker).
- Querschnitt (alle Kapitel): Runbook im Master-Index mit gleichen
  Namen/Reihenfolge wie Aktionen; Suche fokussiert, Ausfuehren zweiter Schritt;
  kein format-on-save, keine versteckten Deployments/Git-Mutationen/Merges;
  Git-Root aus dem aktuellen Buffer; Live-Fakten (Ports, Units, Contexts) zur
  Laufzeit proben, nie hart codieren; Windows/WSL-Routing erhalten.

## Prior-Art-Suche (Schritt 0.7)

- `docs/adr/`: keine Treffer zu `nvim|neovim` — keine bestehende
  Architekturentscheidung zu ersetzen.
- Guards: `tests/spec/neovim-dashboard.bats` (2614 Zeilen, Output-Verifikation
  ueber headless Proben, `NVIM_DASHBOARD_CONFIG_SRC`-RED-Hook vorhanden).
- Alte Plaene `.agents/plans/nvim-{ai-agents,comfyui-images,editor-capabilities,
  github,infrastructure,js-frontend,models-inference,repo-knowledge,sdlc,
  settings-help}/` (Tickets T900656–T900667, EPIC T900654): Nur Referenz, kein
  Code-Reuse (Epic-Entscheidung Neuaufbau). Aktions- und Runbook-Schnitt der
  alten Plaene dient als Checkliste gegen Vergessen, nicht als Vorlage.
- `.agents/plans/nvim-setup/inventory.md` (in allen 16 Tickets referenziert)
  existiert im Repo NICHT (nie committet oder bereits geraeumt). Ersatz:
  Inventar wird zur Execute-Zeit live erhoben (Proben statt Datei-Annahmen);
  die Befunde aus den Ticket-Beschreibungen (I0–I5, K1–K11) sind in
  `design.md` als Start-Hypothesen mit Verifikationspflicht festgehalten.

## Entscheidungen (Batch-Planung, nicht-interaktiv begruendet)

1. **EINE Plan-Einheit auf Parent T901043** (Auftrag): `tasks.md`-Index mit
   Partial-Manifest, `tasks.d/pX` Disjunkte `target_files`, je eigener
   Pruefbefehl.
2. **15 Kinder → 9 Partials (statt 15).** Grund: `ticket.sh stage-plan`
   validiert `--partials 1..9` (hard cap), `plan-lint.sh` verlangt disjunkte
   Targets und letzte Rolle `tests`. Je Kind ein Partial waere nicht
   stage-faehig. Gruppierung nach Kohäsion (Mapping-Tabelle in `tasks.md`):
   p1 Fundament (T901044); p2 Editor (T901045); p3 Files&Search (T901046,
   `depends_on: p2`); p4 JS-Frontend (T901047); p5 GitHub+SDLC
   (T901048+T901049); p6 Repo-Knowledge+AI-Agents (T901050+T901051);
   p7 Models+ComfyUI (T901052+T901053); p8 Infra+ML+MCP+Settings
   (T901054+T901056+T901057+T901058); p9 Tests/Verify (Rolle `tests`,
   traegt den T901044-Testanteil plus Gesamtverifikation).
   Jedes Partial nennt die abgedeckten Ticket-IDs im Kopf; die
   Ticket-Checklisten bleiben in den Ticket-Beschreibungen, der Plan
   referenziert sie pro Partial als Akzeptanz-Anker.
3. **Keine Plan-Subagenten (Fan-out entfaellt).** Kein Delegations-Tool
   verfuegbar; der Plan wird direkt aus vollem Brainstorming-Kontext
   geschrieben (pre-T002074-Fallback). Partial-Groessen bleiben unter dem
   7000-Token-Limit, `plan-lint.sh` ist das harte Gate.
4. **Commit-Scope-Konvention:** `chore(plans):` fuer Plan-Commits;
   Implementierungs-Commits als `feat(T901043):` (Ticket-Scope, P2-gueltig —
   `nvim` steht NICHT in `validate-commit-msg.sh scopes`, obwohl alte Merges
   `feat(nvim):` nutzten; kein Praezedenz-Risiko eingehen).
5. **S1-Lage:** `.lua`/`.md` sind ungated (kein Limit-Eintrag, keine
   Baseline) — kein Budget-Druck, trotzdem neue Dateien schlank schneiden.
   Einzige gated Datei im Plan: `dotfiles/install.sh` (.sh-Limit 800,
   Ist 169 → Budget 631; Aenderung minimal, dokumentiert). `tests/spec/*.bats`
   steht unter `s1.ignore` — keine Budget-Angabe dafuer im Plan (W4-Falle).
6. **Lavish-Board entfaellt** (nicht-interaktiver Batch, Consent-Gate;
   Brainstorming laeuft ueber Tickets + dieses Proposal als Ersatz).
7. **Kein neues E2E-Projekt** (A.6): Verifikation ueber BATS + headless
   `nvim`-Proben, keine Playwright-Tests.

## Risiken

- Live-Config-Drift (7 Dateien + `user-services.lua` nur live): p1 sichert
  vor Umbau mit Zeitstempel-Pfad ausserhalb aller Config-Verzeichnisse.
- Alte Annahmen (Ports, Units, Loadouts, Komponenten) sind Hypothesen bis zur
  Laufzeit-Probe — jedes Partial beginnt mit Proben-Schritt, hart codierte
  Werte aus Tickets/Inventar gelten als falsch bis bestaetigt.
- Home-Dotfiles-Repo ist ausserhalb dieses Repos: p1 prueft/vermerkt, aendert
  dort aber nichts automatisch (keine versteckten Mutationen).
