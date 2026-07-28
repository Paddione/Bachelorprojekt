---
title: "p3 — CLI-Flag-Drift zwischen stage-plan, archive-plan und ihrer Dokumentation"
ticket_id: T002375
domains: [devtooling, plan-authoring]
status: active
partial_id: p3
role: impl
target_files: ["scripts/vda/ticket/stage-plan.sh", ".claude/skills/references/ticket-stage-procedure.md", ".claude/skills/references/mcp-tool-guide.md", "tests/spec/ticket-system.bats"]
depends_on: []
---

# p3 — CLI-Flag-Drift

_Ticket: T002375 · Partial p3 · Mishaps: T002372-M2, T002325-M2, T002371-M1_

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/vda/ticket/stage-plan.sh` | `--plan-file` als Alias auf `--plan`; die Fehlermeldung nennt die gültigen Flags |
| `.claude/skills/references/ticket-stage-procedure.md` | Flag-Liste gegen das Skript abgeglichen; `--partials` als Pflicht; `--hold` als Warnung; `${PIPESTATUS[0]}`-Hinweis |
| `.claude/skills/references/mcp-tool-guide.md` | Port-Forward-Integritätswarnung |
| `tests/spec/ticket-system.bats` | Alias-Akzeptanz und Fehlermeldungs-Inhalt |

## Kontext

Jede `dev-flow-plan`-Session läuft durch `stage-plan`. Zwei Mishaps aus zwei Sessions beschreiben
denselben Fehlversuch an dieser Stelle.

**Verifizierter Stand** (`scripts/vda/ticket/stage-plan.sh:9-19`):

| Flag | existiert | Pflicht |
|---|---|---|
| `--id` | ja | ja |
| `--branch` | ja | ja |
| `--plan` | ja | ja |
| `--partials` | ja | **ja** (`case "$partials" in [1-9]`) |
| `--hold` | ja | nein |
| `--slug` | **nein** | — |
| `--plan-file` | **nein** | — |

`--plan-file` ist der Name, den `archive-plan` benutzt (`scripts/ticket.sh:146`) — und der
MCP-Wrapper `archive_plan` ebenso. Wer zwischen beiden wechselt, läuft zuverlässig in einen
Fehlversuch. `--slug` steht in der Referenz und hat nie existiert.

Drei Punkte aus T002372-M2, die über die reine Flag-Liste hinausgehen:

1. **`--partials` ist auch für einen einzelnen, nicht aufgeteilten Fix-Plan Pflicht.** Das steht
   nirgends.
2. **`stage-plan.sh:85` startet `factory.service`.** Ohne `--hold` ist das Ticket damit unmittelbar
   factory-greifbar. In der Doku steht das als Randnotiz, nicht als Warnung.
3. **Der Fehlerpfad gibt Exit 0 zurück, wenn er über `timeout … | tail` läuft** — `EXIT=$?` misst
   dann `tail`, nicht das Skript. Ein falsches Flag sieht wie ein Erfolg aus. Korrekt ist
   `${PIPESTATUS[0]}`.

Punkt 3 ist der gefährlichste: er macht die anderen beiden unsichtbar.

## Schritte

- [x] **RED zuerst.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL (rot — stage-plan lehnt --plan-file ab und nennt die gueltigen Flags nicht)
```

- [x] **Schritt 1 — `--plan-file` als Alias.** In der Argument-Schleife von `stage-plan.sh`
      `--plan-file` auf dieselbe Variable wie `--plan` legen. Die Richtung ist bewusst gewählt:
      `archive-plan` bekommt **keinen** `--plan`-Alias, weil `--plan-file` dort der etablierte Name
      ist und der MCP-Wrapper ihn verwendet. Ein Alias in beide Richtungen verdoppelt die
      Oberfläche, ohne das Problem kleiner zu machen; hier reicht der eine Weg, den die Aufrufer
      tatsächlich gehen.

- [x] **Schritt 2 — Fehlermeldung.** `Unknown stage-plan option: $1` (Zeile 14) um die gültige
      Flag-Liste ergänzen. Grund: die Meldung ist der einzige Ort, an dem ein Aufrufer im
      Fehlerfall überhaupt hinsieht.

      **Achtung bei den Tests dazu** (CLAUDE.md, BATS-Konvention): niemals unqualifiziert
      `[[ "$output" == *"<begriff>"* ]]` gegen den vollen stdout+stderr prüfen. Skripte, die `$0`
      in ihrer Usage ausgeben, lassen den Worktree-Verzeichnisnamen — der hier aus dem Change-Slug
      abgeleitet ist — den Match erfüllen. Die Assertion zuerst auf die relevante Ausgabezeile
      einengen.

- [x] **Schritt 3 — Referenz abgleichen.** In `ticket-stage-procedure.md` die Flag-Liste gegen
      `stage-plan.sh` prüfen und `--slug` entfernen. Drei Ergänzungen:
      `--partials` als Pflichtfeld (auch bei einem einzelnen Partial), `--hold` als **Warnung**
      statt Randnotiz (ohne `--hold` ist das Ticket sofort factory-greifbar), und der
      `${PIPESTATUS[0]}`-Hinweis für Aufrufe über eine Pipe.

- [x] **Schritt 4 — Port-Forward-Integrität (T002371-M1).** In `mcp-tool-guide.md` neben den
      bestehenden Portforward-Guard: der `kubectl port-forward` auf `workspace/shared-db` ist
      instabil und hat nachweislich **Zeilen mit falscher `external_id`** geliefert — im
      Ursprungsfall wurde ein UPDATE-Flag auf eine nicht existierende ID gesetzt (T002358 statt
      T002367).

      Die Konsequenz gehört benannt, nicht nur der Befund: **schreibende Operationen laufen nicht
      über den Port-Forward.** Für Writes gilt der bereits dokumentierte kubectl-Pfad. Für Reads,
      deren Ergebnis eine Schreiboperation steuert, wird die gelesene ID gegen eine zweite Quelle
      geprüft, bevor geschrieben wird.

      Kein Skript-Fix: die Ursache liegt in der Port-Forward-Session, nicht im Repo.

- [x] **Schritt 5 — Tests.** Ein `@test` für `--plan-file` als akzeptiertes Alias, eines dafür,
      dass ein wirklich unbekanntes Flag mit Exit 2 abbricht **und** die gültige Liste ausgibt.
      Der zweite Test braucht einen Positiv-Anker (siehe `p7`): erst prüfen, dass ein gültiger
      Aufruf durchläuft, dann die Negativ-Aussage.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
bash -n scripts/vda/ticket/stage-plan.sh
grep -c -- '--slug' .claude/skills/references/ticket-stage-procedure.md   # muss 0 sein
```

## Abgrenzung

- **`scripts/ticket.sh` wird nicht angefasst.** T002325-M1 und T002341-M1 (`stage-plan` hängt in
  `systemctl`) sind bereits durch `600be89a1` [T002366] behoben; dieser Change verifiziert das nur
  (Schritt im Index-Plan) und ändert nichts daran.
- `scripts/factory/reconcile-ticket-status.sh` gehört `p5`.
