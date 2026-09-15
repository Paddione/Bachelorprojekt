# p4-guard — devmesh-Write-Guard und Migration aus k3d

Partial von `devmesh-dev-stack` (T900118) · Rolle: impl · depends_on: p5-tests.

**S1-Budget** (`yq '.s1.limits' docs/code-quality/gates.yaml` → `.sh: 800`; Baseline per
`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`):

| Datei | Ist | Budget |
|---|---|---|
| `scripts/vda/ticket/_ticket-core.sh` | 341 | 459 |
| `scripts/factory/lib.sh` | 157 | 643 |

Zuwachs: `_ticket-core.sh` +13, `lib.sh` +12. `scripts/ticket.sh` steht in `s1.ignore`
(gates.yaml Z. 99), Zuwachs +15 — klein halten, keine weitere Logik dort. Neue Dateien:
`_devmesh-guard.sh` ≈ 70, `migrate-from-k3d.sh` ≈ 150 Zeilen.

**Grenze.** Der `FACTORY_CTX`-Default (`k3d-mentolder-dev`) bleibt; der Wechsel auf `fleet`
gehört zu SP-5 (T900120). Hier nur der Guard an den Context-Auflösern (D5, Kommentar T003544).

### Task 1: Guard-Modul (30 min)

**Files:** Create `scripts/vda/ticket/_devmesh-guard.sh`

```bash
#!/usr/bin/env bash
# scripts/vda/ticket/_devmesh-guard.sh — Ticket-Write-Guard gegen devmesh [T900118].
#
# devmesh (ADR-008) traegt eine Entwicklungsinstanz des Stacks. Fuehrende Ticket-DB
# bleibt fleet (design.md, Messung 2026-09-11: 388 Tickets). Ein Write gegen devmesh
# erzeugte eine zweite lebende Ticket-DB — die Split-Brain-Klasse aus T015005/T015008.
#
# devmesh wird an drei Merkmalen erkannt, damit ein umbenannter Context nicht
# durchrutscht (design.md D5):
#   1. Context-Name ist `devmesh`
#   2. der Context zeigt auf denselben API-Server wie der Context `devmesh`
#   3. der Server-Host ist lan_ip, tailnet_name oder tailnet_ip eines Eintrags mit
#      role: server in devmesh/inventory.yaml (Override: DEVMESH_INVENTORY)
# Was ein Write ist, entscheiden die Aufrufer (Befehls-Positivliste, SQL-Klassifikation).
#
# Aufruf:  bash _devmesh-guard.sh <CTX>     Exit 0 frei, 3 verweigert
# Sourcen: devmesh_ctx_is_target <CTX> · devmesh_sql_is_write <SQL> · devmesh_refuse_write <CTX>
# Kein `set` auf Top-Level: ticket-core und factory/lib sourcen diese Datei.

_DEVMESH_GUARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

_devmesh_server_of() {
  local cluster
  command -v kubectl >/dev/null 2>&1 || return 0
  cluster="$(kubectl config view -o jsonpath="{.contexts[?(@.name==\"$1\")].context.cluster}" 2>/dev/null)" || true
  [[ -n "$cluster" ]] || return 0
  kubectl config view -o jsonpath="{.clusters[?(@.name==\"$cluster\")].cluster.server}" 2>/dev/null || true
}

devmesh_ctx_is_target() {
  local ctx="${1:-}" server ref host inv h
  [[ "$ctx" == "devmesh" ]] && return 0
  server="$(_devmesh_server_of "$ctx")"
  [[ -n "$server" ]] || return 1
  ref="$(_devmesh_server_of devmesh)"
  [[ -n "$ref" && "$server" == "$ref" ]] && return 0
  host="${server#*://}"; host="${host%%/*}"; host="${host%:*}"
  inv="${DEVMESH_INVENTORY:-$_DEVMESH_GUARD_DIR/../../../devmesh/inventory.yaml}"
  [[ -f "$inv" ]] || return 1
  if ! command -v yq >/dev/null 2>&1; then
    echo "WARN [T900118] _devmesh-guard: yq fehlt — Inventar-Abgleich fuer Context '$ctx' uebersprungen." >&2
    return 1
  fi
  while IFS= read -r h; do
    [[ -n "$h" ]] || continue
    [[ "$host" == "$h" || "${host%%.*}" == "$h" ]] && return 0
  done < <(yq -r '.. | select(tag == "!!map") | select(.role == "server") | (.lan_ip, .tailnet_name, .tailnet_ip) | select(. != null)' "$inv" 2>/dev/null)
  return 1
}

devmesh_sql_is_write() {
  grep -qiE '\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|setval|nextval)\b' <<<"${1:-}"
}

devmesh_refuse_write() {
  local ctx="${1:-}"
  devmesh_ctx_is_target "$ctx" || return 0
  echo "ERROR [T900118] Ticket-Write gegen devmesh verweigert (Context '$ctx') — fuehrende Ticket-DB ist fleet." >&2
  echo "  devmesh traegt nur Entwicklungsdaten. Writes mit TICKET_CTX=fleet bzw. FACTORY_CTX=fleet ausfuehren." >&2
  return 3
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  devmesh_refuse_write "$@"
  exit $?
fi
```

### Task 2: `scripts/ticket.sh` verdrahten (20 min)

**Files:** Modify `scripts/ticket.sh` — direkt **vor** dem Kommentarblock `# [T015008] Kubeconfig-Context-Drift-Guard` einfügen:

```bash
# [T900118] devmesh-Write-Guard. Anders als der T015008-Guard darunter laeuft er auch
# unter BATS und TICKET_OFFLINE: devmesh ist nie die fuehrende Ticket-DB, kein Testfall
# muss dort schreiben. Lesebefehle stehen in einer Positivliste, alles andere gilt als
# Write (fail-closed). scripts/ticket-mcp-node/runner.mjs ruft dieses Skript und erbt
# den Guard.
case "${1:-} ${2:-}" in
  "get "*|"list "*|"get-attachments "*|"get-ticket-links "*|"get-timeline "*|\
  "get-injections "*|"find-similar "*|"retry-count "*|"dryrun-check "*|"plan-meta get"|\
  "help "*|"-h "*|"--help "*|" ")
    : ;;
  *)
    bash "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/_devmesh-guard.sh" "$CTX" || exit 3 ;;
esac
```

### Task 3: `scripts/vda/ticket/_ticket-core.sh` (30 min)

**Files:** Modify `scripts/vda/ticket/_ticket-core.sh`

- [ ] **Step 1:** Nach der Zeile `USER="website"` (vor dem T015168-Block) einfügen:

```bash
# [T900118] Aufgeloesten Context sichern, BEVOR der BATS-Sentinel (T002224, unten) CTX
# umbiegt: der devmesh-Guard in _exec_sql muss den echten Context sehen.
_TICKET_CTX_RESOLVED="$CTX"
# shellcheck source=scripts/vda/ticket/_devmesh-guard.sh
source "$(dirname "${BASH_SOURCE[0]}")/_devmesh-guard.sh"
```

- [ ] **Step 2:** In `_exec_sql` den Anfang ersetzen. Alt:

```bash
_exec_sql() {
  local pod="$1"; shift
  local stderr_tmp
  stderr_tmp="$(mktemp)"
```

Neu:

```bash
_exec_sql() {
  local pod="$1"; shift
  local stderr_tmp sql
  # [T900118] SQL puffern, damit ein Write gegen devmesh verweigert wird, bevor er den
  # Pod erreicht. kubectl exec -i las stdin bisher direkt; nur der Zeitpunkt aendert sich.
  sql="$(cat)"
  if devmesh_sql_is_write "$sql $*"; then
    devmesh_refuse_write "$_TICKET_CTX_RESOLVED" || exit 3
  fi
  stderr_tmp="$(mktemp)"
```

- [ ] **Step 3:** In derselben Funktion die psql-Zeile ergänzen. Alt:
  `psql -U "${USER:-website}" -d "${DB:-website}" -qtA -v ON_ERROR_STOP=1 "$@" 2>"$stderr_tmp"`
  Neu: `psql -U "${USER:-website}" -d "${DB:-website}" -qtA -v ON_ERROR_STOP=1 "$@" 2>"$stderr_tmp" <<<"$sql"`

### Task 4: `scripts/factory/lib.sh` (20 min)

**Files:** Modify `scripts/factory/lib.sh`

- [ ] **Step 1:** Nach `FACTORY_CTX="${FACTORY_CTX:-k3d-mentolder-dev}"` einfügen:

```bash
# [T900118] devmesh-Write-Guard (gemeinsames Modul mit ticket-core). Der Default oben
# bleibt bis SP-5 (T900120) unveraendert.
# shellcheck source=scripts/vda/ticket/_devmesh-guard.sh
source "$(dirname "${BASH_SOURCE[0]}")/../vda/ticket/_devmesh-guard.sh"
```

- [ ] **Step 2:** In `factory_psql` den kubectl-Pfad ersetzen. Alt:

```bash
  local pod; pod=$(factory_pgpod)
  kubectl exec -i "$pod" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@"
}
```

Neu:

```bash
  local pod sql
  sql="$(cat)"
  # [T900118] Writes gegen devmesh verweigern — nur im kubectl-Pfad; der FACTORY_PG_URL-
  # Pfad oben gehoert dem fleet-nativen factory-runner.
  if devmesh_sql_is_write "$sql $*"; then
    devmesh_refuse_write "$FACTORY_CTX" || return 3
  fi
  pod=$(factory_pgpod)
  kubectl exec -i "$pod" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@" <<<"$sql"
}
```

- [ ] **Step 3 (GREEN):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/ticket-devmesh-guard.bats \
  tests/spec/db-guard/ tests/spec/ticket-system/ tests/spec/ticket-mcp/
```

### Task 5: Migrationsskript (1,5 h)

**Files:** Create `scripts/devmesh/migrate-from-k3d.sh` (aufgerufen von `task devmesh:migrate`, p3)

```bash
#!/usr/bin/env bash
# scripts/devmesh/migrate-from-k3d.sh — T900118, ADR-008 SP-3, design.md D6.
#
# Kopiert pocket_id und website aus k3d-mentolder-dev nach devmesh und vergleicht die
# Zeilenzahl jeder Tabelle. Die Quelle wird nur gelesen: kein Scale, kein Restore,
# kein DDL gegen SRC_CTX. Abbau der Quelle erst in SP-5 nach bestandenem verify.
#
# Unterbefehle:
#   preflight   Contexts vorhanden, Ziel nicht Produktion, POCKET_ID_ENCRYPTION_KEY gleich
#   dump        Zaehlung + pg_dump -Fc je DB aus der Quelle (Port-Forward)
#   restore     Ziel-Schreiber auf 0 Replicas, pg_restore --clean je DB
#   verify      Zeilenzahlen des Ziels gegen die beim Dump erhobene Zaehlung
#   all         preflight, dump, restore, verify, Schreiber wieder auf 1 Replica
# Exit: 0 ok, 1 Befund (Abweichung, verweigertes Ziel), 2 Vorbedingung fehlt
set -euo pipefail

SRC_CTX="${DEVMESH_SRC_CTX:-k3d-mentolder-dev}"
DST_CTX="${DEVMESH_DST_CTX:-devmesh}"
NS="${DEVMESH_NS:-workspace}"
DBS="${DEVMESH_MIGRATE_DBS:-pocket_id website}"
DUMP_DIR="${DEVMESH_DUMP_DIR:-tmp/devmesh-migration}"
DST_WRITERS="pocket-id sdlc-console website"

# Exakte Zeilenzahl je Tabelle in einem Statement — count(*), keine Statistik-Schaetzung.
COUNT_SQL="SELECT table_schema || '.' || table_name || '|' ||
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
     table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1"

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { echo "FEHLT: $*" >&2; exit 2; }

_pod() {
  local pod
  pod="$(kubectl get pod -n "$NS" --context "$1" -l 'app in (shared-db, shared-db-dev)' \
          --field-selector status.phase=Running -o name 2>/dev/null | head -1)"
  [[ -n "$pod" ]] || need "kein laufender shared-db-Pod in $NS (Context $1)"
  echo "$pod"
}

_psql() { # <ctx> <db> <sql>
  local pod; pod="$(_pod "$1")"
  kubectl exec -i "$pod" -n "$NS" --context "$1" -c postgres -- \
    psql -U postgres -d "$2" -qtA -v ON_ERROR_STOP=1 -c "$3"
}

_secret_key() { # <ctx> <key> -> base64
  kubectl get secret workspace-secrets -n "$NS" --context "$1" -o jsonpath="{.data.$2}" 2>/dev/null
}

_guard_dst() {
  case "$DST_CTX" in
    fleet|*prod*|"$SRC_CTX") die "Ziel verweigert: DST_CTX='$DST_CTX' ist Produktion oder die Quelle (restore ersetzt die Ziel-DB)" ;;
  esac
}

_PF_PID=""
_pf_stop() { if [[ -n "$_PF_PID" ]]; then kill "$_PF_PID" 2>/dev/null || true; fi; _PF_PID=""; }
_pf_start() { # <ctx> <port> — Port-Forward statt exec-Streaming (Abbruch bei ~5,8 MB, migrate-tickets.sh)
  local i
  kubectl port-forward -n "$NS" --context "$1" svc/shared-db "$2:5432" >/dev/null 2>&1 &
  _PF_PID=$!
  for i in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/$2") 2>/dev/null && return 0
    sleep 1
  done
  _pf_stop; need "Port-Forward 127.0.0.1:$2 kam nicht hoch ($1)"
}
trap _pf_stop EXIT

cmd_preflight() {
  _guard_dst
  local ctxs c src_key dst_key
  ctxs="$(kubectl config get-contexts -o name 2>/dev/null)"
  for c in "$SRC_CTX" "$DST_CTX"; do grep -qx "$c" <<<"$ctxs" || need "Kubeconfig-Context '$c'"; done
  # pocket_id ist mit POCKET_ID_ENCRYPTION_KEY verschluesselt; ein anderer Key im Ziel
  # macht Passkeys und OIDC-Clients nach dem Restore unlesbar.
  src_key="$(_secret_key "$SRC_CTX" POCKET_ID_ENCRYPTION_KEY)"
  dst_key="$(_secret_key "$DST_CTX" POCKET_ID_ENCRYPTION_KEY)"
  [[ -n "$src_key" && -n "$dst_key" ]] || need "POCKET_ID_ENCRYPTION_KEY in workspace-secrets (Quelle oder Ziel)"
  [[ "$src_key" == "$dst_key" ]] || die "POCKET_ID_ENCRYPTION_KEY weicht zwischen $SRC_CTX und $DST_CTX ab — environments/.secrets/dev.yaml mit dem Quellwert neu versiegeln"
  echo "preflight ok: $SRC_CTX -> $DST_CTX ($NS), DBs: $DBS"
}

cmd_dump() {
  command -v pg_dump >/dev/null && command -v pg_restore >/dev/null || need "pg_dump/pg_restore (PostgreSQL-Client 16)"
  mkdir -p "$DUMP_DIR"
  local db pw
  pw="$(_secret_key "$SRC_CTX" SHARED_DB_PASSWORD | base64 -d)"
  for db in $DBS; do
    _psql "$SRC_CTX" "$db" "$COUNT_SQL" > "$DUMP_DIR/$db.counts"
    _pf_start "$SRC_CTX" 15441
    PGPASSWORD="$pw" pg_dump -h 127.0.0.1 -p 15441 -U postgres -d "$db" -Fc --no-owner --no-privileges > "$DUMP_DIR/$db.dump"
    _pf_stop
    [[ "$(head -c5 "$DUMP_DIR/$db.dump")" == "PGDMP" ]] || die "$db.dump ist kein pg_dump-Archiv"
    pg_restore --data-only -f /dev/null "$DUMP_DIR/$db.dump" || die "$db.dump ist unvollstaendig (Transfer abgebrochen)"
    echo "dump $db: $(stat -c%s "$DUMP_DIR/$db.dump") Bytes, $(grep -c . < "$DUMP_DIR/$db.counts") Tabellen"
  done
}

cmd_restore() {
  _guard_dst
  command -v pg_restore >/dev/null || need "pg_restore (PostgreSQL-Client 16)"
  local db w pw
  pw="$(_secret_key "$DST_CTX" SHARED_DB_PASSWORD | base64 -d)"
  for w in $DST_WRITERS; do kubectl --context "$DST_CTX" -n "$NS" scale "deploy/$w" --replicas=0; done
  for db in $DBS; do
    [[ -f "$DUMP_DIR/$db.dump" ]] || need "$DUMP_DIR/$db.dump — erst dump"
    _pf_start "$DST_CTX" 15442
    # Einzelfehler (Rollen, Extensions) sind tolerierbar; massgeblich ist verify.
    PGPASSWORD="$pw" pg_restore -h 127.0.0.1 -p 15442 -U postgres -d "$db" \
      --clean --if-exists --no-owner --no-privileges "$DUMP_DIR/$db.dump" || true
    _pf_stop
  done
}

cmd_verify() {
  local db t exp act actual diff=0
  for db in $DBS; do
    [[ -f "$DUMP_DIR/$db.counts" ]] || need "$DUMP_DIR/$db.counts — erst dump"
    actual="$(_psql "$DST_CTX" "$db" "$COUNT_SQL")"
    while IFS='|' read -r t exp; do
      [[ -n "$t" ]] || continue
      act="$(awk -F'|' -v t="$t" '$1 == t {print $2}' <<<"$actual")"
      if [[ "${act:-0}" == "$exp" ]]; then
        printf '  ok         %s.%s %s\n' "$db" "$t" "$exp"
      else
        printf '  ABWEICHUNG %s.%s erwartet %s, Ziel %s\n' "$db" "$t" "$exp" "${act:-0}"
        diff=1
      fi
    done < "$DUMP_DIR/$db.counts"
  done
  [[ $diff -eq 0 ]] || die "Zeilenzahlen weichen ab — Quelle unveraendert, Ziel-Schreiber bleiben auf 0"
  echo "verify ok: alle Tabellen stimmen ueberein"
}

case "${1:-}" in
  preflight) cmd_preflight ;;
  dump)      cmd_preflight; cmd_dump ;;
  restore)   cmd_restore ;;
  verify)    cmd_verify ;;
  all)       cmd_preflight; cmd_dump; cmd_restore; cmd_verify
             for w in $DST_WRITERS; do kubectl --context "$DST_CTX" -n "$NS" scale "deploy/$w" --replicas=1; done ;;
  *)         sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
```

- [ ] **GREEN:** `tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/migrate-from-k3d.bats` — 4/4 ok.

### Task L1 (Operator/Live): Migration ausführen (1 h)

Vorbedingung: SP-2 abgenommen; p3 Task L3 (Deploy) grün; `pg_dump --version` meldet 16.x.

```bash
task devmesh:status
bash scripts/devmesh/migrate-from-k3d.sh preflight
task devmesh:migrate                      # = all; letzte Zeile: "verify ok: alle Tabellen stimmen ueberein"
kubectl --context devmesh -n workspace get deploy pocket-id sdlc-console website
```

Nachweis als Ticket-Kommentar an T900118 mit dem Befehl und den `ok`-Zeilen (Mess-Konvention
T002717). Meldet `verify` eine Abweichung in `pocket_id` (Sessions), `task devmesh:migrate`
einmal wiederholen; bleibt sie, Befund ins Ticket, Quelle bleibt stehen.
