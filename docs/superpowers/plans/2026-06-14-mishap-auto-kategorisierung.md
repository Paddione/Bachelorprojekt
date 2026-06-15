---
ticket_id: T000725
spec_ref: docs/superpowers/specs/2026-06-14-mishap-auto-kategorisierung.md
status: completed
date: 2026-06-14
domains: [scripts, database]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Mishap-Tracker Auto-Kategorisierung (T000725)

## Übersicht

Mishap-Tickets erhalten eine automatische `category`-Einstufung (7 Kategorien + "Sonstige") via Keyword-Matching in `mishap-categorize.sh`. Neues Skript, minimaler Wrapper in `ticket.sh`, additive DB-Migration, neuer Taskfile-Task.

## Tasks

- [x] **Task 1 — DB-Migration: `category`-Spalte**

  Prüfe zuerst, ob die Spalte schon existiert:

  ```bash
  PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
  kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- \
    psql -U website -d website -At -c \
    "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='category';"
  ```

  Falls leer (Spalte existiert nicht), Migration auf **beiden** Brand-DBs ausführen (`-d website` für mentolder, `-d website` für korczewski via `workspace-korczewski` namespace):

  ```sql
  ALTER TABLE tickets.tickets
    ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN (
      'CI-Konflikt','Gate-Fehler','API-Fehler',
      'Scout-Qualität','Deploy-Fehler','Spec-Lücke',
      'Test-Lücke','Sonstige'
    ));
  ```

  Bestehende Zeilen bleiben `NULL` — kein Backfill nötig.

- [x] **Task 2 — `scripts/mishap-keywords.json` erstellen**

  Neue Datei: `scripts/mishap-keywords.json` (max. ~60 Zeilen).

  Struktur:
  ```json
  {
    "CI-Konflikt": ["merge conflict", "CONFLICTING", "rebase", "conflict marker", "<<<<<<", "resolve conflict"],
    "Gate-Fehler": ["S1-Gate", "S2-Gate", "S3-Gate", "S4-Gate", "baseline", "ratchet", "line limit", "violation", "freshness:check"],
    "API-Fehler": ["402", "429", "timeout", "rate limit", "connection refused", "ECONNREFUSED", "503", "upstream", "unreachable"],
    "Scout-Qualität": ["touched_files", "scout", "0 files", "no files changed", "low quality", "0 touched", "empty plan"],
    "Deploy-Fehler": ["rollout", "CrashLoopBackOff", "ImagePullBackOff", "deploy", "kubectl", "ErrImagePull", "OOMKilled"],
    "Spec-Lücke": ["spec", "missing requirement", "undefined behavior", "undocumented", "no spec", "unspecified", "assumption"],
    "Test-Lücke": ["test", "BATS", "assertion", "test:all", "coverage", "playwright", "failing test", "no test"]
  }
  ```

  Die Keywords werden case-insensitiv gegen `<title> <description>` gematcht.

- [x] **Task 3 — `scripts/mishap-categorize.sh` erstellen** (max. 200 Zeilen)

  Signatur: `mishap-categorize.sh <external_id> <title> <description>`

  Logik:
  1. Lese `scripts/mishap-keywords.json` via `jq`.
  2. Für jede Kategorie: zähle Keyword-Matches (case-insensitiv `grep -i`) gegen `"$title $description"`.
  3. Kategorie mit den meisten Matches gewinnt. Bei 0 Matches → weiter zu Schritt 4.
  4. DeepSeek-Fallback: `curl` gegen `${DEEPSEEK_BASE_URL:-https://api.deepseek.com/v1}/chat/completions` mit `DEEPSEEK_API_KEY`. Prompt: "Classify this mishap into one of: CI-Konflikt, Gate-Fehler, API-Fehler, Scout-Qualität, Deploy-Fehler, Spec-Lücke, Test-Lücke, Sonstige. Reply with only the category name." — Antwort via `jq -r` extrahieren und gegen gültige Liste validieren.
  5. Fallback: `category="Sonstige"`.
  6. DB-Update: `UPDATE tickets.tickets SET category='<kategorie>' WHERE external_id='<external_id>'` via `kubectl exec` auf shared-db.
  7. Fehler bei DB-Update → `stderr`, exit 0 (best-effort).

- [x] **Task 4 — `scripts/ticket.sh` integrieren** (Netto 0 Zeilen; Budget: 793 Zeilen Baseline)

  In `cmd_create()`, nach dem `_exec_sql`-Block, der `external_id|id` zurückgibt:

  - Die Rückgabe `external_id|id` schon in einer Variablen fangen (falls nicht bereits so).
  - Nach dem INSERT und dem `echo` der external_id: Aufruf von `mishap-categorize.sh` wenn `type == mishap`.
  - Wrapper-Aufruf (~5 Zeilen):
    ```bash
    if [[ "$type" == "mishap" ]] && [[ -n "$ext_id" ]]; then
      local script_dir; script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      "$script_dir/mishap-categorize.sh" "$ext_id" "$title" "$desc" >&2 || true
    fi
    ```
  - Um Netto-Nullbilanz zu halten: entferne äquivalente Leerzeilen oder refaktoriere einen bestehenden Kommentarblock in `cmd_create()`.

  **Budget-Check vor Commit**: `wc -l scripts/ticket.sh` muss ≤793 ergeben.

- [x] **Task 5 — Taskfile-Task `mishap:categorize`** hinzufügen

  In `Taskfile.yml` neuen Task:
  ```yaml
  mishap:categorize:
    desc: "Kategorisiert ein Mishap-Ticket via Keyword-Matching + DeepSeek-Fallback"
    cmds:
      - bash scripts/mishap-categorize.sh {{.CLI_ARGS}}
  ```

  Verwendung: `task mishap:categorize -- <external_id> "<title>" "<description>"`

- [x] **Task 6 — Verifikation**

  ```bash
  # 1. Offline tests
  task test:all

  # 2. Freshness
  task freshness:regenerate
  task freshness:check

  # 3. Manueller Smoke-Test (falls DB erreichbar):
  # Mishap erstellen → category prüfen
  ext=$(bash scripts/ticket.sh create \
    --type mishap \
    --title "CI rebase conflict on main" \
    --description "CONFLICTING state blocked PR merge" \
    | head -1 | cut -d'|' -f1)
  # Erwartet: category = 'CI-Konflikt'
  kubectl exec -n workspace --context fleet \
    $(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1) \
    -c postgres -- psql -U website -d website -At \
    -c "SELECT category FROM tickets.tickets WHERE external_id='$ext';"
  ```

## Reihenfolge & Abhängigkeiten

```
Task 1 (DB-Migration)
  └─ Task 2 (mishap-keywords.json)
       └─ Task 3 (mishap-categorize.sh)  ← braucht JSON-Datei
            └─ Task 4 (ticket.sh)         ← ruft das Script auf
                 └─ Task 5 (Taskfile)
                      └─ Task 6 (Verifikation)
```

## Dateien zusammengefasst

| Datei | Aktion |
|-------|--------|
| `scripts/mishap-keywords.json` | NEU |
| `scripts/mishap-categorize.sh` | NEU, max 200 Zeilen |
| `scripts/ticket.sh` | MODIFY, Netto 0 Zeilen (793 Baseline) |
| `Taskfile.yml` | MODIFY, +~5 Zeilen |
| DB `tickets.tickets` | ADDITIVE: `ALTER TABLE … ADD COLUMN IF NOT EXISTS category TEXT CHECK(…)` — beide Brand-DBs |
