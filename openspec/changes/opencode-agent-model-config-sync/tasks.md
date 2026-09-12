## 1. 35B-Messung & Limit-Kalibrierung

- [ ] 1.1 Messung: gegen FreeToken-Server (:1919) `GET /models` für `active`/`active-thinking`/`active-fast` ausführen und max_model_len + KV-Ceiling je Variante protokollieren; Verifikation: Messprotokoll mit Messdatum in der Task-Antwort (chat/completions-Langlauf bis 95% der deklarierten Grenze ohne `input sequence length exceeds`)
- [ ] 1.2 `.opencode/agent-models.jsonc`: `freetoken-local`-Limits auf gemessene Werte minus 10% Reserve setzen und Messdatum als JSONC-Kommentar ergänzen; Verifikation: `npx jsonc-parser`-Parse ok, diff zeigt Limit+Kommentar je Eintrag
- [ ] 1.3 `.opencode/agent-models.jsonc`: `opencode-zen/big-pickle` limit.context von 1000000 auf ~260000 (modelldefiniert, Freemium-Budget) korrigieren, Messdatum kommentieren; Verifikation: grep zeigt neuen Wert + Kommentar
- [ ] 1.4 `.opencode/opencode.jsonc`: Compaction-Parameter (buffer/keep.tokens) so kalibrieren, dass der Compaction-Trigger unterhalb der gemessenen Ceiling von `freetoken-local/active` feuert; Verifikation: kommentierter Kalibrierwert + Tabelle im design.md konsistent

## 2. SSOT-Bereinigung: Stale-Modelle & Drifts

- [ ] 2.1 Stale-Modell-Sweep in `.opencode/agent-models.jsonc`: jeden Modelleintrag gegen loadouts.json + Live-Check (Port getestet) verifizieren; tote Provider/Modelle entfernen oder mit `// stale:`-Kommentar versehen; Verifikation: Liste entfernter/geänderter Einträge mit Beleg (Port-Check-Ergebnis) als Task-Antwort
- [ ] 2.2 `docs/agent-guide/registry/agents.yaml` gegen SSOT abgleichen (Agenten, Modelle, Limits); Verifikation: diff gegen SSOT leer bzw. dokumentierte Abweichung behoben
- [ ] 2.3 `.claude/agents/*.md`-Frontmatter (model/model_id) gegen SSOT prüfen; Verifikation: grep über alle Frontmatter-Felder, keine unbekannten Model-IDs
- [ ] 2.4 `AGENTS.md`-Routing-Tabelle: orchestrator-Zeile (AGENTS.md: alibaba-intl/qwen3.8-max vs. SSOT: opencode-zen/laguna-s-2.1-free) und big-pickle-Zeile (1M vs. 260k) auf SSOT-Stand bringen; Verifikation: `bash scripts/health-goals-check.sh` unverändert + diff zeigt nur SSOT-konforme Zeilen

## 3. Sync-Pfad & globale Konsolidierung

- [ ] 3.1 Sync-Skript-Rückblick: `scripts/opencode-sync-agents.sh` (Taskfile.yml-Ziel) auf Idempotenz prüfen — zweimaliger dry-run → leerer diff; Verifikation: doppelter dry-run liefert identischen, leeren diff
- [ ] 3.2 Sync anwenden: nach SSOT-Edits `scripts/opencode-sync-agents.sh` ausführen, ~/.config/opencode/opencode.jsonc aktualisiert; Verifikation: global Config enthält die neuen Limits/Entfernungen, kein zweiter Provider-Block
- [ ] 3.3 Globale Duplikate konsolidieren: `~/.config/opencode/opencode.json` (MCP codebase-memory-mcp) in opencode.jsonc übernehmen/validieren, reine MCP-Datei entfernen (Backups existieren); Verifikation: nur noch eine aktive globale Config-Datei, MCP-Tool codebase-memory weiter erreichbar
- [ ] 3.4 Global-Config-Validierung: JSONC-Parse + opencode-Config-Lint lauffähig; Verifikation: Parse ok, opencode startet ohne Config-Fehler

## 4. Config-Visualisierung

- [ ] 4.1 `scripts/opencode-config-viz.sh` implementieren: liest SSOT + optionale weitere Configs (`--config`), rendert deterministischen Markdown-Baum (Provider→Modelle→Agenten) mit Limit, Messdatum, Status `ok|stale|fehlt|unbelegt`; Verifikation: zweimaliger Lauf ist byte-identisch
- [ ] 4.2 `docs/agent-guide/registry/config-overview.md` generieren und committen; Verifikation: Regeneration ist snapshot-identisch (diff leer), Windows-`:18235`-`llamacpp-local`-Eintrag als `stale` markiert
- [ ] 4.3 nvim-Hinweis dokumentieren (jsonc-Treesitter-Highlighting + foldmethod=syntax) im Viz-Skript-Header/README; Verifikation: Hinweis liegt im Skript/README und nennt SSOT-Pfad, nicht die generierte Übersicht, als Editier-Ziel

## 5. Verifikation & Restart

- [ ] 5.1 Voller Validierungslauf: `bash scripts/openspec.sh validate` für archive-Reife + JSONC-Lint aller Configs + Sync-dry-run leer; Verifikation: alle drei Gates grün
- [ ] 5.2 Smoke-Tests: verbliebene Modelle per chat/completions gegen die live Provider (freetoken-local :1919, llamacpp :8094) — Antwort `OK` mit finish=stop; Verifikation: ein Smoke-Ergebnis je Modell protokolliert
- [ ] 5.3 Restart-Hinweis: Nutzer informieren, dass opencode neu gestartet werden muss (Plugin plugin/freetoken-active.ts setzt Limit erst beim Start); Verifikation: Meldung an Nutzer + nach Restart ACE-002-Kriterium (kein Overflow im Langlauf) bestätigt