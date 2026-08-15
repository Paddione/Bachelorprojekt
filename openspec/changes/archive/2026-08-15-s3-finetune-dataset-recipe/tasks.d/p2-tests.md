---
title: "s3-finetune-dataset-recipe — p2-tests (Tests-Rolle)"
ticket_id: T006252
domains: [test]
status: active
---

# s3-finetune-dataset-recipe — Implementation Plan

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `tests/spec/unsloth-training-env/factory-traces.bats` | 70 | — |

Budgetnotiz: Die Datei ist `nicht-baselined` und `.bats` hat keinen Eintrag unter
`s1.limits` in `docs/code-quality/gates.yaml` — das S1-Ratchet überspringt die Extension
(`scripts/code-quality/gates/s1-filesize.mjs`: `if (extname(file) in limits === false) continue;`).
Es gibt also keine wirksame Zeilenschwelle; die Erweiterung um zwei `@test`-Blöcke an eine
bestehende Bestandsdatei ist ratchet-sicher.

## Task 1 — Tests für `--with-context` schreiben und Rotlauf zeigen (RED)

Der Kollektor `scripts/finetune/collect_factory_traces.py` bekommt in p1 das Flag
`--with-context` (Kontext-Anreicherung). Dieses Partial legt die Assertions dafür in der
Bestandsdatei an — als Output-Verifikation (T002448-M4): das Verhalten wird ausgeführt und
das Ergebnis geprüft, nicht der Quelltext begutachtet.

### Step 1.1 — Bestandsdatei unangetastet lassen

Die drei bestehenden `@test`-Blöcke (`setup()`-Fixture, Default-Lauf ohne Flag) bleiben
**wörtlich unverändert** — sie sind der Positiv-Anker (T002356-M1) für die Anforderung
„Flag ändert den Default nicht" (Spec REQ factory-trace-collector-pass-done: „Default bleibt
unverändert"; Design E3 „bestehender Fixture-Test unverändert"). Der neue Test baut seine
Kontext-Fixture in **eigene Dateien** im Testkörper (`$WORKDIR/fixture-ctx.json`,
`$WORKDIR/fixture-ctx-secret.json`) — `setup()` und die bestehende `$FIXTURE` bleiben so
garantiert unberührt.

Eingabeformat-Konvention (festgelegt durch den Test, vom p1-Kollektor zu verarbeiten, Quelle:
`design.md` „Datensatz-Beschaffung" Schritt 2):

- `description` als zusätzliches Feld in den Phase-Event-Zeilen (Spalte `t.description`).
- Kommentarzeilen als eigene Objekte mit `ticket_id`, `author`, `body`, `created_at`
  (Spalten aus dem Kommentar-SQL `c.ticket_id, c.author, c.body, c.created_at`).

### Step 1.2 — `@test`: Kontext-Turns und E7-Rollen-Mapping

An die Bestandsdatei anhängen:

```bash
@test "factory-traces: --with-context ergaenzt Kontext-Turns mit E7-Rollen" {
  cat > "$WORKDIR/fixture-ctx.json" <<'JSON'
[
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "description": "Beschreibung: Ticket-Kontext fuer das Training", "phase": "implement", "state": "done", "detail": "wrote scripts/foo.sh", "at": "2026-01-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "description": "Beschreibung: Ticket-Kontext fuer das Training", "phase": "verify", "state": "done", "detail": "tests green", "at": "2026-01-01T10:05:00Z"},
  {"ticket_id": 1, "author": "factory", "body": "Entscheidung: LoRA-Rank 16", "created_at": "2026-01-01T11:00:00Z"},
  {"ticket_id": 1, "author": "claude-code", "body": "Befund: Template byte-identisch", "created_at": "2026-01-01T11:05:00Z"},
  {"ticket_id": 1, "author": "patrick", "body": "Freigabe erteilt", "created_at": "2026-01-01T11:10:00Z"}
]
JSON

  # Positiv-Anker (Default unveraendert): derselbe Datensatz ohne Flag liefert den Lauf.
  run python3 "$SCRIPT" --fixture "$WORKDIR/fixture-ctx.json" --out "$OUT"
  [ "$status" -eq 0 ]
  run grep -c "Erfolgreicher Lauf" "$OUT"
  [ "$output" -eq 1 ]
  # Negativ-Aussage: ohne Flag erscheint kein Kontext-Inhalt (Flag steuert, nicht die Daten).
  run grep -c "Entscheidung: LoRA-Rank 16" "$OUT"
  [ "$output" -eq 0 ]

  # Mit Flag: Kontext-Turns kommen hinzu (Positiv-Anker zuerst).
  run python3 "$SCRIPT" --fixture "$WORKDIR/fixture-ctx.json" --with-context --out "$OUT"
  [ "$status" -eq 0 ]
  run grep -c "Entscheidung: LoRA-Rank 16" "$OUT"
  [ "$output" -eq 1 ]
  run grep -c "Beschreibung: Ticket-Kontext" "$OUT"
  [ "$output" -eq 1 ]

  # E7-Rollen-Mapping (semantische Pruefung ueber das gerenderte Chat-Format).
  cat > "$WORKDIR/assert_roles.py" <<'PY'
import json, sys

with open(sys.argv[1]) as fh:
    convo = json.loads(fh.readline())
turns = [(m["role"], m["content"]) for m in convo["messages"]]
assistant = [c for r, c in turns if r == "assistant"]
user = [c for r, c in turns if r == "user"]
assert any("Entscheidung: LoRA-Rank 16" in c for c in assistant), "factory-Kommentar muss assistant-Turn sein"
assert any("Befund: Template byte-identisch" in c for c in assistant), "claude-code-Kommentar muss assistant-Turn sein"
assert any("Freigabe erteilt" in c for c in user), "Fremdautor-Kommentar muss user-Turn sein"
PY
  run python3 "$WORKDIR/assert_roles.py" "$OUT"
  [ "$status" -eq 0 ]
}
```

Assertions-Ableitung aus der Spec (`specs/factory-trace-collector-pass-done.md`):

- „Flag aktiviert die Anreicherung": Beschreibungs- und Kommentar-Inhalte erscheinen nur mit
  `--with-context` (die Negativ-Aussage „ohne Flag fehlt der Kontext" hat mit dem
  Lauf-Präsenz-Check ihren Positiv-Anker).
- „Kommentar-Rollen-Mapping folgt der E7-Konvention": `factory` und `claude-code` →
  `assistant`, Fremdautor (`patrick`) → `user` — geprüft an der Semantik (Turn-Inhalt
  einer Rolle), nicht am JSON-Darstellungsformat (T002716).

### Step 1.3 — `@test`: Secret-Redaktion gilt auch im Kommentar-Body

An die Bestandsdatei anhängen:

```bash
@test "factory-traces: --with-context redigiert Secrets auch im Kommentar-Body" {
  cat > "$WORKDIR/fixture-ctx-secret.json" <<'JSON'
[
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "implement", "state": "done", "detail": "wrote scripts/foo.sh", "at": "2026-01-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T009001", "title": "Erfolgreicher Lauf", "phase": "verify", "state": "done", "detail": "tests green", "at": "2026-01-01T10:05:00Z"},
  {"ticket_id": 1, "author": "factory", "body": "Deploy-Token: ghp_abcdefghijklmnopqrstuvwxyz012345", "created_at": "2026-01-01T11:00:00Z"}
]
JSON

  run python3 "$SCRIPT" --fixture "$WORKDIR/fixture-ctx-secret.json" --with-context --out "$OUT"
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der Kommentar ist im Korpus (sonst waere die Negativ-Aussage vakuos).
  run grep -F -c "Deploy-Token" "$OUT"
  [ "$output" -eq 1 ]

  # Negativ-Aussage: das Secret-Muster erscheint nicht im Klartext.
  run grep -F -c "ghp_abcdefghijklmnopqrstuvwxyz012345" "$OUT"
  [ "$output" -eq 0 ]

  # Redaktion ist nachweislich aktiv.
  run grep -F -c "[REDACTED]" "$OUT"
  [ "$output" -ge 1 ]
}
```

Assertion aus der Spec: „Redaktion greift im Kommentar-Body" — das Secret-Muster
(`ghp_…`, von `SECRET_PATTERNS` in `collect_factory_traces.py` abgedeckt) ist im Body
redigiert, der restliche Kommentar-Inhalt bleibt erhalten.

### Step 1.4 — Rotlauf dokumentieren

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/factory-traces.bats
# expected: FAIL — die zwei neuen @test-Bloecke sind rot (argparse kennt --with-context
# noch nicht: unrecognized arguments, Exit 2), die drei Bestands-@test-Bloecke bleiben gruen
```

Der Rotlauf ist konstruktionsbedingt garantiert: solange p1 das Flag nicht implementiert
hat, bricht der Kollektor beim unbekannten Argument mit Exit 2 ab, und der
`[ "$status" -eq 0 ]`-Check failt. Das ist der STRUCT2-Failing-Test-Step dieses Plans.

## Task 2 — Verify (GREEN nach p1, Pflicht-Gates)

Dieses Partial ist das letzte des Batches; die GREEN-Fahrt setzt die p1-Implementierung
(`--with-context` im Kollektor, `task finetune:traces` reicht das Flag durch) voraus.

### Step 2.1 — GREEN-Lauf nach p1

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/factory-traces.bats
# expected: PASS — alle fuenf @test-Bloecke gruen: 3 Bestands (Default, Redaktion im
# Detail, measure_corpus-Kompatibilitaet) + 2 neue (E7-Rollen, Redaktion im Kommentar-Body)
```

### Step 2.2 — Mandatory Verify-Commands

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` zieht dabei auch das Test-Inventar (`test:inventory`) nach; eine
Änderung an `website/src/data/test-inventory.json` ist nicht zu erwarten, weil das Inventar
Dateien gruppiert (nicht `@test`-Blöcke) und die Bestandsdatei nur erweitert wird — sollte
`freshness:check` trotzdem eine Abweichung melden, die regenerierte JSON-Datei mitcommitten.
