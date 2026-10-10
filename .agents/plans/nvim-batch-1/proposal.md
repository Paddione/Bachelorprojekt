# Proposal: nvim-batch-1 (T901792)

Batch-Parent T901792, Welle 1, Masterplan 10.10. Acht Feature-Kinder
T901044–T901051 plus T901212 (SSOT-Umzug, eigenes Plan-Verzeichnis
`.agents/plans/nvim-ssot-umzug/`).

## Befund auf main (24eda4aeb, verifiziert 2026-10-11)

EPIC T901043 ist shipped (PR #6348). Die Batch-1-Checklisten sind auf main
weitgehend umgesetzt:

- Fundament: `init.lua` (20 Zeilen), lazy-Bootstrap, `core/dashboard.lua`
  (276 Zeilen, Selbstregistrierung), `core/actions.lua` (Zwei-Schritt),
  `core/gitroot.lua` (Buffer-Root, klare Meldungen), Runbook-Master-Index
  mit Vorlage, Windows-Wrapper (46 Zeilen, Struktur-Selbsttest),
  `install.sh` Paragraph 5 (einziger Weg Repo nach live, mit Backup).
- Editor: 11 Server in `SERVERS`, Mason-Wege, blink.cmp, snacks-Picker und
  snacks-Terminal als einzige Plugins mit schriftlicher Begruendung,
  fd-Probe mit rg-Fallback, `M.checkhealth`.
- Kapitel files-search, js-frontend, github, sdlc, repo-knowledge,
  ai-agents existieren mit Aktionen, Tasten, Runbooks.
- Tests: `tests/spec/neovim-dashboard.bats` existiert nicht mehr, ist aber
  nativ portiert nach `tests/py/spec/native_ported/spec/test_neovim_dashboard.py`
  (713 Zeilen, 25 Tests, headless Proben, Runbook-Vertrag maschinell).
- Live-Drift: nur `runbooks/models-inference.md` (ausserhalb Batch-1).

## Echte Luecken (jeweils mit Prüfort)

1. T901045: kein Go-Server und kein SQL-Server in `SERVERS`
   (`lua/chapters/editor.lua`), obwohl die Checkliste Go und SQL nennt.
   Treesitter-Pin v0.9.3 gegen nvim v0.12.5 nie verifiziert.
2. T901047: Task-Befehle hart kodiert (`M.command`), kein
   `vda.sh oracle` (Oracle braucht laufenden Daemon — Plan: Oracle zuerst,
   dokumentierter Fallback bei totem Daemon).
3. T901049: keine Plan-Review-Aktion (`scripts/plan-review/plan-review.sh`
   existiert, ist aber aus keiner Aktion erreichbar).
4. T901050: `repo-knowledge.lua` behauptet, es gebe kein Shell-CLI —
   `codebase-memory-mcp cli <tool>` (v0.11.0) existiert live. Aufrufform
   umstellen. Brain-Pfad `docs/brain/k3-code-graph.md` existiert (verifiziert).
5. T901051: `selection-context` ist nur ein Hinweis, keine Umsetzung.
6. T901044: Modulstruktur weicht ab (`core/dashboard.lua` statt eigenem
   `lua/dashboard/`-Verzeichnis) — Abweichung begruenden, nicht umbauen.
   Live-Sicherung und T901212-Abhaengigkeit als Execute-Schritte.
7. T901212: Home-Repo trackt `.config/nvim` weiter (50 Dateien,
   Whitelist `.gitignore` Zeilen 24–26). Voraussetzung PR #6348 erfuellt.

## Was der Plan tut

Neun Partials mit disjunkten `target_files`: p1–p8 je ein Feature-Kind
(verifizieren plus Luecke schliessen), p9 Tests-Rolle (portierte pytest
erweitern, Inventar regenerieren). T901212 als eigener Single-Plan mit
eigenem bats-Test (rot vor, gruen nach dem Austragen).

## Nicht-Ziele

Kapitel T901052 und folgende, `core/tooling.lua`, `plugins/workflows.lua`,
`plugins/local-models.lua`, Ausfuehrung (alle Stages mit Hold).
