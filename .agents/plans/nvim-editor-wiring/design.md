---
ticket_id: T900747
plan_ref: .agents/plans/nvim-editor-wiring/tasks.md
status: active
date: 2026-09-28
---

# Design-Spec: nvim-editor-wiring (T900747)

Zweck: Die in T900656 (done/shipped) erstellten Editor-Faehigkeiten
(Treesitter, LSP, Blink) werden in `init.lua` verdrahtet, sodass lazy.nvim
sie kennt und laedt. Alle Fakten wurden am 2026-09-28 live erhoben.

## Ausgangslage (Evidenz)

- `dotfiles/nvim/init.lua:31` importiert nur `{ import = 'plugins.core' }`.
- `dotfiles/nvim/lua/plugins/editor.lua` (61 Zeilen) definiert drei Lazy-Specs
  (nvim-treesitter v0.9.3, nvim-lspconfig v2.9.0, blink.cmp v1.9.1), deren
  `config`-Funktionen `setup_treesitter` / `setup_lsp` / `setup_blink` aus
  `config.editor-capabilities` aufrufen.
- `M.setup()` wird nirgends aufgerufen; die BATS-Suite prueft das Modul nur
  isoliert (`nvim -l`-Proben, keine Startup-Abdeckung).
- Prior-Art (T002829): `docs/adr/` ohne Treffer; einziger Guard ist
  `tests/spec/neovim-dashboard.bats` (diese Suite wird erweitert).

## Brainstorming-Protokoll (A.4, inline ausgefuehrt)

**F1 — Wiring-Form: nur Import (a) oder zusaetzlich `M.setup()`-Call (b)?**
Evidenz: Die Lazy-Specs rufen pro Faehigkeit bereits die Setup-Funktion beim
Plugin-Load (BufReadPre/VeryLazy). Ein eager `M.setup()` in `init.lua` liefe
vor dem Plugin-Load und wuerde bei jedem Start drei WARN-Notifies erzeugen
(pcall-Guards in `editor-capabilities.lua:55,103` plus LSP-WARNs).
Entscheidung **E1: nur (a)** — eine Zeile `{ import = 'plugins.editor' }`
neben dem Core-Import. Das ist die kanonische lazy.nvim-Form und entspricht
der Ticket-Vorgabe ("oder gleichwertige Verdrahtung" — keine noetig).

**F2 — Test-Form: wie wird die Verdrahtung geprueft?**
Evidenz: Der Suite-Pruefmodus ist Output-Verifikation, kein Source-Grep
(`neovim-dashboard.bats:2-3`). Bestand kennt Headless-Startup-Tests mit
Netzwerk-Guard (`git ls-remote`-Skip, Zeilen 65-103) und `nvim`-Guard in
`setup()` (CI hat kein nvim: kein Treffer in `.github/workflows/`).
Entscheidung **E2: Headless-Probe mit Dateipuffer**, die die Lazy-Registry
in eine Datei dumpt und auf die drei Plugin-Namen assertet; dazu Exit-0,
keine Startup-Errors und `BufWritePre=0` nach Startup. Guards wie Bestand.

**F3 — Scope: was wird angefasst?**
Entscheidung **E3: nur `init.lua` (+1 Zeile) und
`tests/spec/neovim-dashboard.bats` (+Probe + Test)**. Nicht-Ziele:
`plugins/editor.lua`, `config/editor-capabilities.lua` (T900656 shipped,
kein Revert), Runbooks (kein neuer Capability-Step), `lazy-lock.json`.

**F4 — Bleibt `M.setup()` unangetastet?**
Entscheidung **E4: ja** — manueller/Test-Entrypoint, kein Startup-Pfad.

**Lavish-Board (A.3):** entfaellt per Consent-Gate (T002523-M3) —
nicht-interaktive Sitzung, trivialer Scope, keine offenen Fragen.
Brainstorming laeuft als dokumentiertes Inline-Protokoll (s. o.).

## Akzeptanz-Mapping (Ticket → Nachweis)

1. Import in `init.lua` → neuer BATS-Test (Registry enthaelt die drei Namen).
2. Headless Startup mit Dateipuffer, keine Fehler, keine neuen
   BufWritePre-Autocmds → derselbe Test (Exit-0, Log-Grep, Autocmd-Zaehlung).
3. BATS-Abdeckung in `tests/spec/neovim-dashboard.bats` → Probe + `@test`.
4. Kein Revert von T900656 → E3 Nicht-Ziele.

## Offene Punkte

Keine. Keine Fragen an den User.
