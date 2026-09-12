## Context

Siehe proposal.md — Why. Aktuelle Bausteine, auf denen das Design aufsetzt:

- SSOT `.opencode/agent-models.jsonc` (44,5 KB) mit Providern `llamacpp-local`, `freetoken-local` (:1919), `alibaba-intl`, `opencode-go`, `opencode-zen`, `lmstudio`, `deepseek` (direkte API) und 30+ Agenten; deklarierte Limits weichen von gemessenen/advertised Werten ab (z. B. `opencode-zen/big-pickle` limit.context=1.000.000 vs. real ~260k; `freetoken-local/active` 200.000 LADDER_CEILING vs. 262.144 advertised — T014105-Prinzip).
- Repo-Config `.opencode/opencode.jsonc` (221 Zeilen): `model=freetoken-local/active`, Compaction `{auto: true, keep.tokens: 16000, buffer: 96000}` (V2-Target 100K active), Liste von Skill-/Permission-Denys. Provider werden NICHT projekt-lokal definiert — nur via Sync (T002159, `scripts/opencode-sync-agents.sh`, Taskfile.yml).
- Globale Ebene `~/.config/opencode/`: parallele `opencode.json` (nur $schema + mcp codebase-memory-mcp) und `opencode.jsonc` (volle Config) + baks → Duplikat-Risiko.
- Windows-Desktop-App (offizieller Electron-Client, `C:\Users\PatrickKorczewski\AppData\Local\Programs\@opencode-aidesktop\OpenCode.exe`, zusätzlich npm-CLI): gleicher Config-Pfad `C:\Users\PatrickKorczewski\.config\opencode\opencode.jsonc`; dort zeigt `llamacpp-local` auf den **dekommissionierten** `:18235`-Stack (live-Check: 18235/8097 tot, 8094 qwen38-220k lebt, 1919/1234 tot) — konkreter Stale-Drift.
- `AGENTS.md`-Routing-Tabelle weicht von der SSOT ab (orchestrator-Zeile), `docs/agent-guide/registry/agents.yaml` und `.claude/agents/*.md` müssen abgeglichen werden.

## Goals / Non-Goals

**Goals:**

- SSOT bleibt `.opencode/agent-models.jsonc`; alle anderen Ebenen werden daraus abgeleitet oder dagegen validiert.
- Kontext-Limits tragen gemessene Werte mit Messdatum (nicht nur advertised/`LADDER_CEILING`).
- Auto-Compact so kalibriert, dass lange 35B-Sessions ohne Overflow durchlaufen.
- Globale Duplikate konsolidiert; keine Provider-/Modelldefinition zweimal.
- Viz: regenerierbare Markdown-Tree-Übersicht + nvim-Bearbeitungshinweis.

**Non-Goals:**

- Cross-Session-Context-Sharing (260k über mehrere Sessions teilen) — keine native opencode-Fähigkeit; stattdessen deklariertes Limit + Auto-Compact. Sharing-Research nur als separater Track, falls nativ gestützt.
- Änderung an `scripts/llm/loadouts.json`-Betrieb (gemessene Werte werden nur referenziert).
- LM-Studio-9B-Einträge und qwen38-220k-Loadouts: bleiben unangetastet (Nutzer-Klärung: Ziel ist ausschließlich die FreeToken-residente 35B-Familie).
- Umbau des Sync-Skripts zu Cross-Platform-Windows-Sync: Sync bleibt host-lokal; Windows-Config wird nur zur Validierung mitgelesen.

## Decisions

**D1: Messung vor Limit-Edit (Gemessen-vs-Advertised, T014105).** Für `freetoken-local/active`-Familie gegen den laufenden Server messen: `GET /models` (max_model_len) und Langlauf-chat/completions bis zur Decke; deklariertes `limit.context` = gemessener Wert minus Reserve (~10%, konservativ). Alternatives: advertised Wert übernehmen (verworfen: verursacht die beobachteten `input sequence length exceeds`-Drops).

**D2: Compaction-Tuning im Repo-Kontext, nicht global.** `.opencode/opencode.jsonc` targetet 100K active (keep 16000 + buffer 96000); die Windows-Config nutzt `preserve_recent_tokens: 24000, reserved: 24000`. Kalibrierziel: Buffer so wählen, dass der Kompaktierungs-Trigger unter der gemessenen Ceiling feuert; Kennzahl: Fehlerfreier Langlauf bis 95% des deklarierten Limits. Repo-Config bleibt maßgeblich für die Linux-Arbeit; Windows-Werte werden angepasst, falls die Messung sie überschreitet.

**D3: Sync bleibt Einbahn-SSKT → global, host-lokal.** `scripts/opencode-sync-agents.sh` erhält eine dry-run-Vorgabe (Standard) und bestätigt Idempotenz; die Windows-Config wird NICHT automatisch überschrieben (kein Cross-OS-Schreibpfad) — stattdessen muss `opencode-config-viz.sh --config <pfad>` beliebige weitere Configs gegen die SSOT validieren (D4).

**D4: Viz als generiertes Artefakt mit Status-Taxonomie.** Neues Skript `scripts/opencode-config-viz.sh`: liest SSOT (+ optional weitere Configs via `--config`), rendert deterministischen Markdown-Baum (Provider → Modelle → Agenten) mit Limit, Messdatum und Status `ok` | `stale` (Modell existiert nicht/Provider tot) | `fehlt` (SSOT-Eintrag ohne Ziel) | `unbelegt` (Referenz ohne SSOT-Eintrag, z. B. Windows-`:18235`-Provider). Ausgabe nach `docs/agent-guide/registry/config-overview.md`, nie hand-editiert. JSONC-Kommentare (Name/Messdatum) werden als Anmerkungen in den Baum übernommen. Alternatives: parallel gepflegtes Handdokument (verworfen — Doppelpflege = Driftquelle).

**D5: Globale Duplikate konsolidieren.** `~/.config/opencode/opencode.json` (MCP codebase-memory-mcp) wird in `opencode.jsonc` übernommen bzw. der dortige MCP-Block validiert; die reine MCP-Datei wird entfernt (Backups existieren bereits als .bak/.superseded). Kein Merge-Duplikat-Effekt beim Laden beider Dateien.

**D6: nvim-Hinweis.** Regenerations-Skript + README dokumentieren: `nvim ~/.config/opencode/opencode.jsonc` mit JSONC-Treesitter/foldmethod=syntax; die generierte Übersicht dient als Karte, editiert wird die SSOT.

**D7: Restart-Zeitpunkt als Verifikationsschritt.** Alle Edits greifen erst beim opencode-Start (Plugin `plugin/freetoken-active.ts` setzt Limit, Agent-/Provider-Tabellen werden geladen). Nach Anwenden aller Änderungen: Restart + Smoke-Tests (AC-002/AC-003).

## Risks / Trade-offs

- [Konservative Messung zu niedrig → 35B-Kontext wird ungenutzt verschenkt] → Mitigation: Kalibrierung nur ~10% Reserve, Langlauftest protokolliert; nachjustierbar ohne Spec-Änderung.
- [Sync-Skript überschreibt manuell gepflegte globale Einträge] → Mitigation: dry-run-Pflicht, diff vor Anwendung, Idempotenz-Test; Repo-Config-Bereiche (compaction, permission) bleiben außerhalb der synced Sektion.
- [Windows-Desktop-App lädt Config nur beim Start → Drift bleibt sichtbar] → Mitigation: Viz markiert den Windows-`llamacpp-local/:18235`-Eintrag als `stale`; Nutzer editiert/fixed die Windows-Config einmalig nach (Hinweis im Viz-README).
- [Beide globalen Dateien (json+jsonc) geladen → MCP-/Provider-Doppeldefinition] → Mitigation: D5 konsolidiert; danach nur eine globale Config-Datei.
- [Viz-Ausgabe driftet vom SSOT-Stand (veraltete generierte Datei committet)] → Mitigation: CI-ähnlicher Snapshot-Check (Regeneration identisch, Teil der Validierung).

## Migration Plan

1. 35B-Messung gegen :1919 (bei laufendem Server) → Messwert + Datum.
2. `.opencode/agent-models.jsonc` editieren: 35B-Limit + Messdatum, Stale-Einträge (Tote Provider/Modelle) entfernen/kommentieren, big-pickle-Limit korrigieren.
3. `.opencode/opencode.jsonc`: Compaction-Kalibrierung; global `~/.config/opencode/`: Duplikat-Konsolidierung (D5).
4. `scripts/opencode-sync-agents.sh` dry-run → diff prüfen → anwenden → Idempotenz bestätigen.
5. `scripts/opencode-config-viz.sh` bauen, Übersicht generieren, committen.
6. Docs abgleichen: `AGENTS.md`, `agents.yaml`, `.claude/agents/*.md` gegen SSOT (orchestrator-Zeile, big-pickle-Angabe).
7. Windows-Config-Staleness dem Nutzer als `stale` in der Übersicht sichtbar machen; einmalige manuelle Korrektur (Provider-Endpunkt auf :1919/freetoken-local bzw. :8094).

**Rollback:** git revert der Edits; Sync-Skript regeneriert die Global-Config jederzeit idempotent aus der SSOT.

## Open Questions

None — alle ausstehenden Punkte (Messung, Windows-Drift, Duplikate) sind im Design entschieden.
