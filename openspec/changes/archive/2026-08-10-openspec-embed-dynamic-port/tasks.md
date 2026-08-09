---
title: openspec-embed-dynamic-port
ticket_id: T003077
domains: [test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# openspec-embed-dynamic-port — Implementation Plan

## File Structure

```
scripts/openspec-embed-lib.sh                              MODIFIED  (+~10 lines, 35 → ~45; Budget 800−45=755)
scripts/openspec-embed-local.sh                             MODIFIED  (+~15/-~10 lines, 114 → ~119; Budget 800−119=681)
tests/spec/openspec-embedding/dynamic-port-T003077.bats     EXISTING  (already added in the RED stage commit — no change here)
openspec/changes/openspec-embed-dynamic-port/specs/openspec-embedding.md  NEW  (Delta-Spec, ADDED Requirement; `.md` trägt kein S1-Zeilenlimit in docs/code-quality/gates.yaml -> S1 nicht anwendbar, kein Budget-Wert)
openspec/changes/openspec-embed-dynamic-port/.ticket                      NEW  (Ticket-Link "T003077")
```

Budget-Notiz (S1, beide Dateien `nicht-baselined` in `docs/code-quality/baseline.json`, wirksame
Schwelle = statisches `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`): beide Dateien liegen
weit unter 800 Zeilen und bleiben es nach der Änderung — kein Split nötig.

## Task 1 — RED: Failing Test bereits geschrieben und verifiziert rot

Bereits erledigt im Stage-Commit dieses Plans (Fix-Pfad Schritt 3):
`tests/spec/openspec-embedding/dynamic-port-T003077.bats` — drei Tests gegen die noch nicht
existierende Funktion `parse_pf_local_port()` in `scripts/openspec-embed-lib.sh`.

Nachweis (bereits ausgeführt, zur Reproduktion):
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/dynamic-port-T003077.bats
```
expected: FAIL — alle drei Tests scheitern mit Exit 127 (`parse_pf_local_port: command not
found`), weil die Funktion noch nicht existiert.

## Task 2 — GREEN: `parse_pf_local_port()` in `scripts/openspec-embed-lib.sh` ergänzen

Reine, testbare Helper-Funktion analog zu `pf_listener_pid()`/`in_rebase()` in derselben Datei —
extrahiert den von `kubectl port-forward svc/x :5432` auf stdout gemeldeten lokalen Port aus der
Zeile `Forwarding from 127.0.0.1:<port> -> 5432`. Muss gezielt die `127.0.0.1`-Zeile treffen
(nicht die parallel gemeldete `[::1]`-Zeile) und bei fehlendem Match leer bleiben (kein
Fehlschlag, Aufrufer entscheidet über Timeout/Fehlerbehandlung).

```bash
# parse_pf_local_port <kubectl-forwarding-stdout> -> stdout: der von kubectl auf
# 127.0.0.1 zugewiesene lokale Port (leer, falls (noch) keine Forwarding-Zeile vorhanden).
parse_pf_local_port() {
  printf '%s' "$1" | grep -oP 'Forwarding from 127\.0\.0\.1:\K[0-9]+' | head -1
}
```

Nachweis (GREEN):
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/dynamic-port-T003077.bats
```
Alle drei Tests müssen jetzt `ok` melden.

Regressionslauf gegen die bestehende Suite derselben Spec (darf nicht rot werden):
```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-embedding tests/spec/openspec-embedding.bats
```

## Task 3 — GREEN: `scripts/openspec-embed-local.sh` auf dynamischen Port umstellen

Ersetze in Abschnitt „2. DB-URL beschaffen" (aktuell Zeilen ~74–95) den festen Default-Port
durch kubectl-seitige Portwahl, **nur wenn `OPENSPEC_EMBED_PF_PORT` nicht explizit gesetzt ist**.
Der explizite Opt-in-Pfad (`OPENSPEC_EMBED_PF_PORT=<n>` gesetzt) bleibt exakt wie bisher — fester
Port, `pf_listener_pid`-Fremdprozess-Erkennung, sofortiger `exit 1` bei Kollision.

Struktur der Änderung (kein wörtlicher Full-Diff — Zeilenzahlen sind Schätzung):

```bash
if [[ -n "${OPENSPEC_EMBED_PF_PORT:-}" ]]; then
  # --- Opt-in: fester Port, bestehendes Verhalten unveraendert -------------
  PF_PORT="$OPENSPEC_EMBED_PF_PORT"
  kubectl --context "$CTX" -n workspace port-forward svc/shared-db "${PF_PORT}:5432" >/dev/null 2>&1 &
  PF_PID=$!
  FOUND=0
  for _ in $(seq 1 10); do
    LISTENER_PID="$(pf_listener_pid "$PF_PORT")"
    if [[ -n "$LISTENER_PID" ]]; then
      if [[ "$LISTENER_PID" == "$PF_PID" ]]; then FOUND=1; break; fi
      FOREIGN_CMD="$(ps -p "$LISTENER_PID" -o cmd= 2>/dev/null || echo unbekannt)"
      echo "[openspec-embed-local] FEHLER: Port ${PF_PORT} wird von einem fremden Prozess (PID ${LISTENER_PID}: ${FOREIGN_CMD}) belegt, nicht vom eigenen Port-Forward (PID ${PF_PID}). Beende den fremden Prozess oder entferne OPENSPEC_EMBED_PF_PORT, um einen freien Port dynamisch zu wählen." >&2
      exit 1
    fi
    sleep 1
  done
  [[ "$FOUND" -eq 1 ]] || { echo "[openspec-embed-local] FEHLER: eigener Port-Forward (PID ${PF_PID}) hat Port ${PF_PORT} nicht innerhalb von 10s gebunden." >&2; exit 1; }
else
  # --- Default: kubectl waehlt einen freien lokalen Port selbst ------------
  # Kein gemeinsamer fester Port mehr noetig -- der Hook braucht ihn nur fuer
  # die Dauer seines eigenen Laufs (T003077).
  PF_LOG="$(mktemp)"
  kubectl --context "$CTX" -n workspace port-forward svc/shared-db :5432 >"$PF_LOG" 2>&1 &
  PF_PID=$!
  PF_PORT=""
  for _ in $(seq 1 10); do
    PF_PORT="$(parse_pf_local_port "$(cat "$PF_LOG")")"
    [[ -n "$PF_PORT" ]] && break
    sleep 1
  done
  rm -f "$PF_LOG"
  [[ -n "$PF_PORT" ]] || { echo "[openspec-embed-local] FEHLER: eigener Port-Forward (PID ${PF_PID}) hat innerhalb von 10s keinen Port gebunden (Cluster --context $CTX erreichbar?)." >&2; exit 1; }
fi
DB_URL="$(printf '%s' "$RAW_URL" | sed -E "s#@[^/]+/#@127.0.0.1:${PF_PORT}/#")"
```

Die `cleanup()`/`trap`-Logik (bestehend, Zeilen 40–42) bleibt unveraendert — sie killt `$PF_PID`
unabhaengig vom gewaehlten Zweig.

Nachweis (GREEN, manuell — erfordert `--context fleet`-Erreichbarkeit, nicht Teil der
automatisierten Suite):
```bash
unset OPENSPEC_EMBED_PF_PORT
bash scripts/openspec-embed-local.sh <bestehender-slug-mit-tasks.md>
```
Erwartung: kein „FEHLER: Port … wird von einem fremden Prozess belegt" mehr, selbst wenn parallel
ein Dev-Port-Forward auf 15432 laeuft.

## Task 4 — Spec-Delta bereits angelegt: `specs/openspec-embedding.md`

Bereits erledigt im Stage-Commit dieses Plans (Delta-Spec-Konvention T001304 — Delta-Datei nach
Parent-SSOT-Slug benannt, in `openspec/changes/openspec-embed-dynamic-port/specs/openspec-
embedding.md`, NICHT direkt in `openspec/specs/openspec-embedding.md` — die Übernahme in den
SSOT-Spec passiert erst beim `/opsx:archive` nach Merge). Inhalt (zur Referenz, bereits committed):

```markdown
### Requirement: Der DB-Port-Forward wird pro Lauf dynamisch gewählt, nicht fest geteilt

The system SHALL, when `OPENSPEC_EMBED_PF_PORT` is not explicitly set, let `kubectl
port-forward` choose a free local port for its `svc/shared-db` forward instead of sharing a
fixed default port across all invocations, so that a permanently running, unrelated port-forward
on the same host does not block every commit's embedding step. When `OPENSPEC_EMBED_PF_PORT` is
explicitly set, the system SHALL retain the existing fixed-port behaviour including foreign-
process detection and fail-fast on collision.

#### Scenario: Kein OPENSPEC_EMBED_PF_PORT gesetzt, Port bereits fremd belegt

- **GIVEN** ein fremder Prozess laeuft dauerhaft auf Port 15432
- **AND** `OPENSPEC_EMBED_PF_PORT` ist nicht gesetzt
- **WHEN** `scripts/openspec-embed-local.sh` einen Commit einbettet
- **THEN** kollidiert der eigene Port-Forward NICHT mit dem Fremdprozess
- **AND** das Embedding schlägt nicht wegen einer Portkollision fehl

#### Scenario: OPENSPEC_EMBED_PF_PORT explizit gesetzt und belegt

- **GIVEN** `OPENSPEC_EMBED_PF_PORT=15432` ist explizit gesetzt
- **AND** ein fremder Prozess belegt Port 15432
- **WHEN** `scripts/openspec-embed-local.sh` läuft
- **THEN** bricht das Skript mit einer Fehlermeldung ab, die den Fremdprozess benennt
```

## Task 5 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
