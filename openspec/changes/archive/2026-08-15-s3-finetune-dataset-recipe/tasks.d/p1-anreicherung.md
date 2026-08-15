---
title: "s3-finetune-dataset-recipe — p1-anreicherung (Implementation Plan)"
ticket_id: T006252
domains: [dev-tooling, factory]
status: active
---

# s3-finetune-dataset-recipe — Implementation Plan

## File Structure

| `scripts/finetune/collect_factory_traces.py` | 137 | 663 |
| `taskfiles/Taskfile.finetune.yml` | 99 | n.a. (S1-ungated) |
| `scripts/finetune/README.md` | 94 | n.a. (S1-ungated) |

Budgets gegen die wirksame Schwelle: `collect_factory_traces.py` ist nicht-baselined
(`jq`-Lookup: `nicht-baselined`), wirksame Schwelle = statisches `.py`-Limit 800 →
Budget 663. `Taskfile.finetune.yml` und `README.md` haben keine S1-Limit-Extension und
keine Baseline → keine Budget-Zahl behauptbar (T002265). Der Failing-Test-Step
(STRUCT2) liegt im Tests-Partial (`tests/spec/unsloth-training-env/factory-traces.bats`),
nicht in diesem Partial — die hier genannten Smoke-Tests sind manuelle Gegenproben.

## Task 1 — Collector: Kontext-Anreicherung `--with-context` + `--comments-json` (E7)

Ziel: `scripts/finetune/collect_factory_traces.py` rendert mit `--with-context`
Ticket-Beschreibung und Kommentare als chronologische Turns ins TRL-Chat-Format.
Ohne das Flag bleibt die Ausgabe byte-identisch zum bisherigen Verhalten (Default aus,
Delta-Spec REQ-1). Rollen-Mapping nach E7 (REQ-2), Secret-Redaktion auf allen neuen
Feldern (REQ-3).

### 1.1 Docstring und Zeilenformen erweitern

- Zeilenform-Abschnitt im Docstring: `"description"` als optionales Feld der
  Event-Zeile dokumentieren (stammt aus dem JOIN in der Design-SQL, Schritt 2) und
  die Kommentar-Zeilenform ergänzen:

  ```
  Kommentarzeilen (--comments-json), je Kommentar eine Zeile:
      {"ticket_id": <int>, "author": "...", "body": "...", "created_at": "ISO-8601"}
  ```

- Absatz "Filter und Schutz": ergänzen, dass die Redaktion auch auf
  Beschreibung und Kommentar-Body angewendet wird und dass `--with-context`
  ohne `--comments-json` fail-fast abbricht.

### 1.2 Neue Argumente in `main`

Zu den bestehenden `--fixture`/`--rows-json`/`--out`-Argumenten hinzufügen:

```python
parser.add_argument("--with-context", action="store_true",
                    help="Ticket-Beschreibung und -Kommentare als Turns anreichern (E7)")
parser.add_argument("--comments-json",
                    help="JSON-Datei mit Kommentarzeilen (Pflicht bei --with-context)")
```

Direkt nach `args = parser.parse_args(argv)` fail-fast prüfen:

```python
if args.with_context and not args.comments_json:
    raise SystemExit(
        "FEHLER: --with-context erfordert --comments-json (Kommentarzeilen aus dem "
        "vorgeschalteten mcp-postgres-Aufruf, siehe Docstring)."
    )
```

### 1.3 Laden und Gruppieren der Kommentare

Analog zum `_load_rows`-Muster (liest `--fixture`/`--rows-json`), aber nur für
Kommentare; aufgerufen ausschließlich bei `args.with_context`:

```python
def _load_comments(args: argparse.Namespace) -> list[dict]:
    return json.loads(Path(args.comments_json).read_text(encoding="utf-8"))


def group_comments_by_ticket(comments: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    for c in comments:
        grouped[c["ticket_id"]].append(c)
    for ticket_id in grouped:
        grouped[ticket_id].sort(key=lambda c: c.get("created_at", ""))
    return grouped
```

Die Sortierung nach `created_at` ist die geforderte chronologische Reihenfolge
(stabile Sortierung bei gleichem Zeitstempel). `defaultdict` ist bereits importiert.

### 1.4 Rollen-Mapping nach E7

`assistant` für die Factory-Autoren, alles übrige `user`:

```python
ASSISTANT_AUTHORS = {"claude-code", "factory"}


def role_for_author(author: str) -> str:
    return "assistant" if author in ASSISTANT_AUTHORS else "user"
```

### 1.5 Kontext-Turns rendern (Beschreibung + Kommentare, redigiert)

```python
def render_context_turns(description: str | None, comments: list[dict]) -> list[dict]:
    turns: list[dict] = []
    if description:
        turns.append({"role": "user", "content": redact(description)})
    for c in comments:
        body = str(c.get("body") or "")
        if not body:
            continue
        turns.append({
            "role": role_for_author(str(c.get("author") or "")),
            "content": redact(body),
        })
    return turns
```

- Beschreibung ist der erste User-Turn (zeitlich vor allen Kommentaren), danach
  je Kommentar ein Turn mit Rolle nach E7 — alles vor dem bestehenden
  Assistant-Turn aus den Phase-Event-Zeilen (der Verlauf endet mit dem Abschluss).
- Leere Kommentar-Bodys werden nicht gerendert (kein Lernsignal, kein Rauschen).
- `redact()` auf `description` und `body` erfüllt REQ-3 (Secret-Redaktion auf allen
  angereicherten Feldern).

### 1.6 `render_conversation` erweitern — Default bleibt byte-identisch

Signatur mit `None`-Defaults, damit der bisherige Aufrufpfad unverändert
funktioniert (REQ-1):

```python
def render_conversation(events: list[dict], description: str | None = None,
                        comments: list[dict] | None = None) -> dict:
    title = events[0].get("title", "")
    lines = []
    for e in events:
        detail = redact(str(e.get("detail") or ""))
        lines.append(f"{e['phase']}/{e['state']}: {detail}".strip(": "))
    messages = [
        {
            "role": "system",
            "content": (
                "Du bist der Bachelorprojekt Software-Factory-Treiber. Setze das "
                "Ticket wie im dokumentierten Verlauf beschrieben um."
            ),
        },
        {"role": "user", "content": redact(title)},
    ]
    if comments is not None:
        messages.extend(render_context_turns(description, comments))
    messages.append({"role": "assistant", "content": "\n".join(lines)})
    return {"messages": messages}
```

### 1.7 Verdrahtung in `main`

Nur bei `--with-context` Kommentare laden; die Beschreibung kommt aus den
Event-Zeilen desselben Tickets (`events[0].get("description")`, JOIN-Feld):

```python
comments_by_ticket: dict[int, list[dict]] = {}
if args.with_context:
    comments_by_ticket = group_comments_by_ticket(_load_comments(args))
```

und im Ticket-Loop:

```python
conversation = render_conversation(
    events,
    description=events[0].get("description"),
    comments=comments_by_ticket.get(ticket_id),
)
```

`kept`/`skipped`-Zählung bleibt unverändert (Ticket-Ebene). Tickets ohne
Kommentare bleiben auch mit Flag unverändert — `comments=None` schaltet die
Kontext-Turns nicht an.

### 1.8 Manuelle Gegenprobe (Smoke-Test, nicht BATS)

```bash
# Event-Fixture mit Beschreibung (2 Zeilen) nach /tmp/s3-events.json
cat > /tmp/s3-events.json <<'EOF'
[
  {"ticket_id": 1, "external_id": "T000001", "title": "Beispiel-Ticket",
   "description": "Beschreibung mit api_key=abc123def456ghi789jkl012", 
   "phase": "verify", "state": "done", "detail": "verify/done ok", "at": "2026-08-01T10:00:00Z"},
  {"ticket_id": 1, "external_id": "T000001", "title": "Beispiel-Ticket",
   "description": "Beschreibung mit api_key=abc123def456ghi789jkl012",
   "phase": "implement", "state": "entered", "detail": "begonnen", "at": "2026-08-01T09:00:00Z"}
]
EOF

# Kommentar-Fixture: factory -> assistant, fremder Autor -> user, Secret im body.
# Das Secret-Muster wird zur Laufzeit zusammengesetzt (kein vollstaendiges
# Muster-Literal im Dateitext — gitleaks-sicher, vgl. bestehendes Fixture).
SECRET_SK="sk-$(printf '0123456789abcdefghij')"
cat > /tmp/s3-comments.json <<EOF
[
  {"ticket_id": 1, "author": "factory", "body": "Entscheidung: flag-gesteuert",
   "created_at": "2026-08-01T09:30:00Z"},
  {"ticket_id": 1, "author": "patrick", "body": "Befund: Token ${SECRET_SK}",
   "created_at": "2026-08-01T10:30:00Z"}
]
EOF

python3 scripts/finetune/collect_factory_traces.py \
  --rows-json /tmp/s3-events.json --out /tmp/s3-default.jsonl
# -> 1 Zeile, exakt 3 messages (system/user/assistant), kein Kontext-Turn

python3 scripts/finetune/collect_factory_traces.py \
  --rows-json /tmp/s3-events.json --comments-json /tmp/s3-comments.json \
  --with-context --out /tmp/s3-ctx.jsonl
# -> 1 Zeile; messages-Reihenfolge: system, user(Titel), user(Beschreibung),
#    user(patrick-Kommentar mit "[REDACTED]"), assistant(factory-Kommentar "Entscheidung…"),
#    assistant(Event-Zeilen)

python3 scripts/finetune/collect_factory_traces.py \
  --rows-json /tmp/s3-events.json --with-context --out /tmp/s3-fail.jsonl
# expected: FAIL — Exit != 0 mit "FEHLER: --with-context erfordert --comments-json"
```

Prüfung per Blick auf die JSONL: Rollen nach E7, Redaktion greift im
Kommentar-Body (`sk-…` → `[REDACTED]`) und in der Beschreibung (`api_key=…` →
`[REDACTED]`), Zeilen ohne Flag enthalten keine Kontext-Turns.

### 1.9 Commit

```bash
git add scripts/finetune/collect_factory_traces.py
git commit -m "feat(T006252): collector --with-context reichert Korpus um Ticket-Kontext an"
```

## Task 2 — Taskfile: `finetune:traces` reicht das Flag durch

Ziel: `taskfiles/Taskfile.finetune.yml`, Target `traces` — neue Variablen
`WITH_CONTEXT`/`COMMENTS_JSON`, Precondition, Flag-Durchreichung.

### 2.1 Target `traces` erweitern

- `desc`: `… [COMMENTS_JSON=<json>] [WITH_CONTEXT=1] OUT=<jsonl>` ergänzen.
- Neue Precondition (fail-fast analog Collector):

```yaml
      - sh: '[ -n "{{.WITH_CONTEXT}}" ] && [ -n "{{.COMMENTS_JSON}}" ] || [ -z "{{.WITH_CONTEXT}}" ]'
        msg: "WITH_CONTEXT=1 erfordert COMMENTS_JSON=<json> (Kommentarzeilen aus dem mcp-postgres-Aufruf)."
```

- `cmds` erweitern:

```yaml
        python3 scripts/finetune/collect_factory_traces.py \
          {{if .FIXTURE}}--fixture "{{.FIXTURE}}"{{end}} \
          {{if .ROWS_JSON}}--rows-json "{{.ROWS_JSON}}"{{end}} \
          {{if .COMMENTS_JSON}}--comments-json "{{.COMMENTS_JSON}}"{{end}} \
          {{if .WITH_CONTEXT}}--with-context{{end}} \
          --out "{{.OUT}}"
```

Ohne `WITH_CONTEXT` bleibt der gerenderte Befehl identisch zu vorher (Default aus).

### 2.2 Gegenprobe

```bash
# Dry-Run zeigt den gerenderten Befehl mit beiden neuen Argumenten
task finetune:traces --dry-run \
  ROWS_JSON=/tmp/s3-events.json COMMENTS_JSON=/tmp/s3-comments.json \
  WITH_CONTEXT=1 OUT=/tmp/s3-taskfile.jsonl
# -> Ausgabe enthaelt --comments-json und --with-context

# Echter Lauf
task finetune:traces \
  ROWS_JSON=/tmp/s3-events.json COMMENTS_JSON=/tmp/s3-comments.json \
  WITH_CONTEXT=1 OUT=/tmp/s3-taskfile.jsonl
# -> "Korpus geschrieben: /tmp/s3-taskfile.jsonl (1 erfolgreiche Laeufe, 0 uebersprungen)."
```

### 2.3 Commit

```bash
git add taskfiles/Taskfile.finetune.yml
git commit -m "feat(T006252): finetune:traces reicht WITH_CONTEXT/COMMENTS_JSON durch"
```

## Task 3 — README: Recipe-Tabelle referenziert den angereicherten Weg

Ziel: `scripts/finetune/README.md` dokumentiert den neuen Weg (Design
"Datensatz-Beschaffung" Schritt 3/4, Recipe-Tabelle).

### 3.1 Task-Liste (Abschnitt "Reihenfolge")

Die Zeile `task finetune:traces` (Liste der Taskfile-Tasks) erweitern:

```bash
task finetune:traces   ROWS_JSON=<mcp-postgres-export.json> OUT=<jsonl> [WITH_CONTEXT=1 COMMENTS_JSON=<kommentare.json>]
```

### 3.2 Abschnitt "Factory-Traces als Korpus"

Nach dem bestehenden Absatz über `--rows-json`/`--fixture` einen Absatz ergänzen:

- `--with-context` (+ `--comments-json`) nimmt Ticket-Beschreibung und Kommentare
  als chronologische Turns in den Korpus auf; Autoren `claude-code`/`factory`
  werden `assistant`-Turns, alle übrigen `user`-Turns (E7-Konvention).
- Die Secret-Redaktion gilt auch für Beschreibung und Kommentar-Body.
- Ohne das Flag ist die Ausgabe byte-identisch zum bisherigen Verhalten.
- `--comments-json` ist auch der identische Pfad für Tests (wie `--fixture`).

### 3.3 Abschnitt "Korpusformat"

Einen Satz ergänzen: Mit Kontext-Anreicherung enthält `messages` zusätzlich
`user`/`assistant`-Turns für Beschreibung und Kommentare, chronologisch vor dem
abschließenden Assistant-Turn mit den Phase-Event-Zeilen.

### 3.4 Gegenprobe (Dokumentationskonvention, grep-Anker)

```bash
grep -c -- '--with-context' scripts/finetune/README.md   # Anker: > 0
grep -c -- 'COMMENTS_JSON' scripts/finetune/README.md    # Anker: > 0
```

### 3.5 Commit

```bash
git add scripts/finetune/README.md
git commit -m "docs(T006252): finetune README dokumentiert angereicherten Korpus-Weg"
```

## Task 4 — Finale Verifikation (STRUCT3-Gates)

Keine Test-Datei in diesem Partial geändert (BATS kommt im Tests-Partial), daher
kein `task test:inventory`-Schritt hier nötig.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
