---
title: opencode agent/model config cleanup — SSOT-Sync, 35B-Limit-Kalibrierung, Config-Viz
ticket_id: T900162
domains: [opencode, llm, config, docs]
status: ready
---

# opencode-agent-model-config-sync — Implementation Plan

## File Structure

| Pfad | Ist | Budget / Ziel |
|---|---|---|
| `.opencode/agent-models.jsonc` | 852 | x JSONC-Änderungen zeilenneutral bzw. netto klein (Limit-Region: `.jsonc` grob 1000+; Ziel: keine Neueinträge ohne Beleg). Erst Messung (Task 1.1), dann je Eintrag Limit+Messdatum-Kommentar — keine Zeilenzahl-Inflation. |
| `.opencode/opencode.jsonc` | 221 | Änderung: Compaction-Werte + Kommentar (zeilenneutral). |
| `scripts/opencode-sync-agents.sh` | 62 | unverändert; nur Verifikationslauf (Idempotenz). |
| `scripts/opencode-config-viz.sh` (neu) | — | neu, unter S1-Limit `.sh`=800; Ziel ≤ 250 Zeilen. |
| `docs/agent-guide/registry/config-overview.md` (neu, generiert) | — | neu, generiertes Artefakt — nie hand-editiert. |
| `AGENTS.md` | 160 | 2 Zeilen (Routing-Tabelle orchestrator + big-pickle) aktualisiert. |
| `docs/agent-guide/registry/agents.yaml` | 198 | Abgleich gegen SSOT, keine neuen Einträge. |
| `tests/spec/opencode-config-ssot.bats` (neu) | — | neu, RED-Test (STRUCT2); unter `.bats`-Limit. |

## 1. Messung & Limit-Kalibrierung (35B-Familie)

- [ ] 1.1 Messung gegen FreeToken-Server: `GET /models` je Variante (`active`/`active-thinking`/`active-fast`) + chat/completions-Langlauf bis 95% der deklarierten Grenze; protokolliere max_model_len und erreichte Ceiling mit Messdatum; Verifikation: Messprotokoll in Task-Antwort, kein `input sequence length exceeds` im Langlauf
- [ ] 1.2 `.opencode/agent-models.jsonc`: `freetoken-local`-Limits auf gemessenen Wert minus 10% Reserve setzen, Messdatum als JSONC-Kommentar; Verifikation: `npx jsonc-parser`-Parse ok, diff zeigt Limit+Kommentar je Eintrag
- [ ] 1.3 `.opencode/agent-models.jsonc`: `opencode-zen/big-pickle` limit.context 1000000 → 260000 korrigieren (Free-Quota, models.dev 256k-Basis) mit Messdatum-Kommentar; Verifikation: `grep -n "big-pickle" .opencode/agent-models.jsonc` zeigt neuen Wert + Kommentar
- [ ] 1.4 `.opencode/opencode.jsonc`: Compaction buffer/keep.tokens so setzen, dass der Trigger unterhalb der gemessenen Ceiling von `freetoken-local/active` feuert; Wert mit Begründung kommentieren; Verifikation: Kommentar + Kalibrierwert in design.md D2 konsistent, JSONC-Parse ok

## 2. RED-Phase: Failing-Test schreiben

- [ ] 2.1 `tests/spec/opencode-config-ssot.bats` anlegen: Test 1 prüft big-pickle limit.context == 260000; Test 2 prüft je `freetoken-local`-Modelleintrag Messdatum-Kommentar (Regex `limit` + `messung`/`2026`); Test 3 prüft Sync-Idempotenz per dry-run (`scripts/opencode-sync-agents.sh --dry-run` diff leer); Test 4 prüft Stale-Marker (`// stale:` existiert für tot verifizierte Provider); Verifikation: `run bats tests/spec/opencode-config-ssot.bats` → `expected: FAIL` (Tests schlagen vor den Fixes fehl, mindestens 1× `not ok`)

## 3. SSOT-Bereinigung: Stale-Modelle & Drifts

- [ ] 3.1 Stale-Sweep: jeden Modelleintrag gegen `scripts/llm/loadouts.json` + Live-Port-Check verifizieren; tote Einträge entfernen oder mit `// stale:<datum>:<beleg>` kommentieren; Verifikation: Liste entfernter/geänderter Einträge mit Port-Check-Beleg als Task-Antwort
- [ ] 3.2 `docs/agent-guide/registry/agents.yaml` gegen SSOT abgleichen; Verifikation: diff zeigt keine Abweichungen mehr (Ausnahme: dokumentierte, bewusst abweichende Zeilen)
- [ ] 3.3 `.claude/agents/*.md`-Frontmatter (model/model_id) gegen SSOT prüfen; Verifikation: grep über alle Frontmatter-Felder zeigt keine unbekannten Model-IDs
- [ ] 3.4 `AGENTS.md`-Routing-Tabelle: orchestrator-Zeile (alibaba-intl/qwen3.8-max → opencode-zen/laguna-s-2.1-free) und big-pickle-Zeile (1M → 260k) korrigieren; Verifikation: diff zeigt genau diese 2 Zeilen, `bash scripts/health-goals-check.sh` unverändert grün
- [ ] 3.5 RED-Test jetzt grün: `bats tests/spec/opencode-config-ssot.bats` läuft ohne `not ok`; Verifikation: Ausgabe `N tests, 0 failures`

## 4. Sync & globale Konsolidierung

- [ ] 4.1 Sync anwenden: `bash scripts/opencode-sync-agents.sh` ausführen, aktualisierte `~/.config/opencode/opencode.jsonc` prüfen; Verifikation: doppelter dry-run liefert leeren diff (Idempotenz), neue Limits/Entfernungen enthalten
- [ ] 4.2 Globale Duplikate: `~/.config/opencode/opencode.json` (reine MCP-Datei, codebase-memory-mcp) in `opencode.jsonc` übernehmen/validieren und die Datei entfernen (Backups existieren); Verifikation: nur noch eine aktive globale Config-Datei; MCP-Tool `codebase-memory-mcp` bleibt erreichbar (list_projects ok)
- [ ] 4.3 Windows-Config-Hinweis dokumentieren (separater Client-Pfad `C:\Users\PatrickKorczewski\.config\opencode\opencode.jsonc`, toter `:18235`-Provider): einmalige manuelle Korrektur als Task-Antwort festhalten, kein automatischer Cross-OS-Schreibzugriff; Verifikation: Hinweis in `docs/agent-guide/registry/config-overview.md`-README-Abschnitt

## 5. Config-Visualisierung

- [ ] 5.1 `scripts/opencode-config-viz.sh` implementieren (bash): liest SSOT + optional `--config <pfad>`, rendert Markdown-Baum Provider→Modelle→Agenten mit Limit/Messdatum/Status (`ok|stale|fehlt|unbelegt`), Option `--check` für Snapshot-Vergleich; Verifikation: zweimaliger Lauf byte-identisch (`--check` exit 0)
- [ ] 5.2 `docs/agent-guide/registry/config-overview.md` generieren und committen; Verifikation: Regeneration ist snapshot-identisch (diff leer), Windows-`:18235`-`llamacpp-local` als `stale` markiert
- [ ] 5.3 nvim-Hinweis im Skript-Header + Referenz: JSONC-Treesitter-Highlighting + `foldmethod=syntax`, Editier-Ziel ist die SSOT (nicht die generierte Übersicht); Verifikation: Hinweis in Skript-Header und Datei referenziert

## 6. Verifikation & Restart

- [ ] 6.1 Gates: `bash scripts/openspec.sh validate` grün, JSONC-Lint aller Configs ok, Sync-dry-run leer; Verifikation: alle drei Befehle exit 0
- [ ] 6.2 Smoke-Tests je verbliebenem Modell gegen live Provider (`freetoken-local` :1919 bzw. `llamacpp` :8094): chat/completions antwortet `OK` mit finish=stop; Verifikation: Smoke-Protokoll je Modell in Task-Antwort
- [ ] 6.3 Finale Gates: `task test:changed`, `task freshness:regenerate`, `task freshness:check` laufen grün; Test-Inventar aktualisiert sofern Tests neu (`task test:inventory` vor Commit neuer BATS-Datei); Verifikation: alle drei Tasks exit 0; danach Meldung an Nutzer: opencode-Neustart erforderlich (Plugin `plugin/freetoken-active.ts` setzt Limit erst beim Start)