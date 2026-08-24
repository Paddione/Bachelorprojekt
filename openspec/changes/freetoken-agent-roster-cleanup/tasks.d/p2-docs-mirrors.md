# P2 — Mirrors, Doku, Disk

Rolle: **impl** (Docs/Mirrors/Ops). Disjunkter Partial des Change
`freetoken-agent-roster-cleanup` (T016419). Dieser Partial hält die
Registry-Mirror-Konsistenz (P4.3/P4.3b), trägt den Backend-Note-down in
AGENTS.md, befreit das freetoken-setup-Skill vom toten Dense-Checkpoint und
löscht die 19-GB-Leiche auf der Windows-Platte. `agents-map.md` wird NICHT von
Hand editiert — Regeneration über `task agent-guide:maps` im finalen Verify
(P4.5-Freshness).

Alle Datei-Edits sind netto löschend bzw. prosaneutral; keine Baseline erfasst.

Abhängigkeit: **p1** — die Mirror-Parität (P4.3) ist erst grün, wenn
`agent-models.jsonc` die sieben Klon-Primaries ebenfalls nicht mehr kennt.

---

## File `docs/agent-guide/registry/agents.yaml` (192 Zeilen · nicht baselined)

### Schritt 1.1 — Sieben Runtime-Einträge entfernen

Unter `runtimes:` diese Schlüssel samt Blöcken löschen:

`gemma26-primary` · `gemma26-vision` · `gptoss-primary` · `devstral-primary` ·
`gemma12-primary` · `gemma26-throughput-primary` · `qwen38-primary`

**Behalten:** alle `bachelorprojekt-*`-Rollen, die fünf Familien-Subagenten,
`qwen-cloud`, `deepseek-*`, `orchestrator`, `big-pickle`, `ox-alpha-free`,
`ox-alpha`, `freetoken-primary`, `alibaba-primary`.

Akzeptanz: bidirektionaler Abgleich mit `.opencode/agent-models.jsonc`
(P4.3/P4.3b) — jede hier entfernte Zeile hat dort p1 denselben Agentenblock
entfernt und umgekehrt.

---

## File `AGENTS.md` (192 Zeilen · nicht baselined)

### Schritt 2.1 — Agent-Routing-Tabelle ausdünnen

Die sieben Tabellenzeilen der Klon-Primaries löschen. Die `freetoken-primary`-
Zeile bleibt und wird zur einzigen lokalen Primary-Zeile.

### Schritt 2.2 — Backend-Note-down (Kernauftrag des Tickets)

Die Prosa im Abschnitt „Agent Routing" auf den Ist-Stand heben:

- **Backend:** FreeToken-native auf Windows/pk-desktop — Server `:1919`,
  Daemon `:1900` (`/engine/switch`). Drei viable MoE-FTW-Checkpoints unter
  `C:\Users\PatrickKorczewski\models`: Qwen3.6-35B-A3B-NVFP4, gpt-oss-20b,
  Gemma-4-26B-A4B-NVFP4. Alias `freetoken-local/active` trifft immer das
  residente Modell; Plugin `.opencode/plugin/freetoken-active.ts` setzt Limit
  + Name beim opencode-Start.
- **Constraint (neu, explizit):** dense Modelle passen nicht ins VRAM-Budget —
  Qwen3.6-27B-NVFP4 wurde deshalb T016419 gelöscht (19 GB), nicht deklariert.
- **Altlasten-Prosa korrigieren:** Sätze zu `gemma12-vision` als aktives
  Familienloadout, `qwen38-220k` als exklusives Primary-Loadout, exclusiveGroup-
  Verdrängung und den Messungen in `scripts/llm/measurements/` auf
  Vergangenheit/Fallback umformulieren: „Alle GPU-Chat-Loadouts sind seit dem
  FreeToken-Cutover deaktiviert; drei GGUF-Katalogeinträge bleiben als
  Rückfallebene deklariert."

Akzeptanz: `grep -c 'gemma26-\|throughput-primary\|gptoss-primary\|devstral-primary\|gemma12-primary\|qwen38-primary' AGENTS.md` → 0 Treffer in der Routing-Tabelle; `grep -q 'FreeToken-native' AGENTS.md`.

---

## File `.opencode/skills/freetoken-setup/SKILL.md` (60 Zeilen · nicht baselined)

### Schritt 3.1 — Description-Zeile befreien

In der YAML-Frontmatter-description den vierten Modellnamen
`Qwen3.6-27B-NVFP4` streichen (drei viable bleiben). Body-Tabelle und
`references/model-matrix.md` mit der NOT-VIABLE-Sektion bewusst NICHT
anfassen — sie sind die dokumentierte Begründung (Tombstone), warum das
Modell gelöscht statt deklariert wurde.

---

## Ops-Schritte (keine Repo-Dateien)

### Schritt 4.1 — Global-Config synchronisieren

```bash
bash scripts/opencode-sync-agents.sh
```

Danach Gegenprobe: `jq -r '.agent | keys[]' ~/.config/opencode/opencode.jsonc |
grep -c primary` → nur noch `freetoken-primary`, `big-pickle`,
`ox-alpha-free`, `alibaba-primary` (+ keine `-primary`-Klone).

### Schritt 4.2 — Nicht-viablen Checkpoint löschen

```bash
TARGET="/mnt/c/Users/PatrickKorczewski/models/Qwen3.6-27B-NVFP4"
[ "$(readlink -f "$TARGET")" = "$TARGET" ] || exit 1        # Guard: kein Symlink-Escape
du -sh "$TARGET"                                            # Erwartung: ~19G — bei Abweichung ABBRUCH
rm -rf "$TARGET"
```

Guard-Kette: Pfad muss exakt existieren, Größe in der Größenordnung 15–25G
sein, dann löschen. Dense-Modell, passt nachweislich nicht ins VRAM
(model-matrix: NOT VIABLE) — Operator-Entscheidung 2026-08-24.
