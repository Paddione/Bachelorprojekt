# p2-host-rollout — Supervision, Cutover, Modell-ID-Reconciliation & tote Re-Drift-Quelle

Rolle: `impl`. `depends_on: p1-proxy-core`. Nimmt das Gateway auf `:18235` real in Betrieb (D1/D3):
`llm-proxy.service` (systemd user, `Restart=on-failure`), `task llm:proxy:install` + systemd-
bevorzugendes `start`/`stop` mit Fremd-Listener-Guard, `cutover.sh` (6-Schritt-Ablauf mit Quiesce,
Stop+Disable des Alt-Units, Smoke beider Request-Shapes, Rollback). Reconciliert die stale Modell-ID
`ternary-bonsai-27b` → `ternary-bonsai` in DB (Migration, D5) und legt die strukturelle Re-Drift-
Quelle (`provider-register-bonsai.sh` schreibt bei jedem Lauf `:8093`) still, plus `route-provider.sh`
opus-Hardcode + Emergency-Fallback auf das Gateway (D7). Folgt `design.md` (D1, D3, D5, D7,
Risiken & Rollback) verbatim.

Die Cutover-Smoke-Tests und der Parity-Preflight prüfen exakt gegen die p1-Lieferung: `/healthz`
(200 nur bei ≥1 gesundem Backend), strict `resolveModel` (404 `unknown_model`) und die Paritäts-
Fixups (`node --test scripts/llm-proxy/`). Deshalb `depends_on: p1-proxy-core`. **Kein** `task test:*`-
Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step (lebt in `p5-tests`). Jeder
Task endet mit einem lokalen Prüf-Step (`bash -n`, Struktur-Grep, Struktur-Assertion der Unit,
`task -n`, Dry-Apply gegen die Dev-DB mit `ROLLBACK`).

Reihenfolge innerhalb des Partials: Task 1 (`llm-proxy.service`) → Task 2 (`Taskfile.llm.yml`, wrappt
die Unit via `install`/`start`/`stop`/`cutover`) → Task 3 (`cutover.sh`, ruft `task llm:proxy:install`
+ Smoke) → Task 4 (Migration) → Task 5 (`provider-register-bonsai.sh`) → Task 6 (`route-provider.sh`).

## S1-Zeilenbudgets (wirksame Schwelle je Datei; unbaselined ⇒ Extension-Limit `.sh`/`.mjs` = 500)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/provider-register-bonsai.sh` | 32 | 468 |
| `scripts/factory/route-provider.sh` | 77 | 423 |
| `scripts/llm-proxy/cutover.sh` | 0 (neu) | 500 |
| `Taskfile.llm.yml` | 145 | ungated (`.yml`) |
| `scripts/llm-proxy/llm-proxy.service` | 0 (neu) | ungated (`.service`) |
| `scripts/migrations/2026-07-23-unified-llm-gateway.sql` | 0 (neu) | ungated (`.sql`) |

Die beiden `.sh`-Konsumenten ändern nur Literale in-place (netto zeilenneutral: 32 bzw. 77 bleiben).
`cutover.sh` ist neu und wird mit ~70 Zeilen weit unter dem 500er-`.sh`-Limit geschnitten.
`.yml`/`.service`/`.sql` unterliegen keinem S1-Gate.

---

## Task 1: `scripts/llm-proxy/llm-proxy.service` (neu) — systemd USER unit (D3)

Muster: der Alt-Unit `bonsai-msg-fixup-proxy.service` (`Type=simple`, `Restart=on-failure`,
`RestartSec=2`, `WantedBy=default.target`) und der Sibling `scripts/factory/factory.service`
(`WorkingDirectory`, optionaler `EnvironmentFile=-%h/...`). Der Node-Proxy ersetzt den nicht-
versionierten Python-Alt-Proxy als einzige Instanz auf `:18235`. Der Repo-Pfad wird über
`WorkingDirectory=%h/Bachelorprojekt` gelöst — `node` öffnet das Skript relativ zum CWD; das ist
die dokumentierte Annahme (Repo unter `~/Bachelorprojekt`).

- [ ] Datei `scripts/llm-proxy/llm-proxy.service` neu anlegen (ini-Format, drei Sektionen `[Unit]`/`[Service]`/`[Install]`).
- [ ] `[Service]`: `Type=simple`, `WorkingDirectory=%h/Bachelorprojekt`, `ExecStart=/usr/bin/env node scripts/llm-proxy/server.mjs`, `Restart=on-failure`, `RestartSec=2`, optionaler `EnvironmentFile=-%h/.config/llm-proxy/env`.
- [ ] `[Install]`: `WantedBy=default.target`.
- [ ] Kopf-Kommentar: dokumentiert die Repo-Pfad-Annahme (`~/Bachelorprojekt`), dass `node` im PATH des `systemd --user`-Managers auflösbar sein muss (ggf. `Environment=PATH=...` im `EnvironmentFile`), und dass die Unit den Alt-Proxy `bonsai-msg-fixup-proxy.service` ersetzt (Installation via `task llm:proxy:install`).

```ini
# scripts/llm-proxy/llm-proxy.service
# Unified LLM Gateway (scripts/llm-proxy/server.mjs, Port 18235) — systemd USER unit.
# Ersetzt den nicht-versionierten bonsai-msg-fixup-proxy.service als einzige Instanz auf :18235 (D1).
# Installation via `task llm:proxy:install` (kopiert nach ~/.config/systemd/user/, daemon-reload, enable).
# Repo-Pfad-Annahme: das Repo liegt unter %h/Bachelorprojekt — WorkingDirectory löst den relativen
# server.mjs-Pfad auf (node öffnet das Skript relativ zum CWD).
# node muss im PATH des systemd --user Managers liegen; bei nvm/WSL ggf. über den EnvironmentFile
# (~/.config/llm-proxy/env) ein `Environment=PATH=...` setzen.
[Unit]
Description=Unified LLM Gateway (llm-proxy, Port 18235)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/Bachelorprojekt
ExecStart=/usr/bin/env node scripts/llm-proxy/server.mjs
Restart=on-failure
RestartSec=2
EnvironmentFile=-%h/.config/llm-proxy/env

[Install]
WantedBy=default.target
```

**Verify:**

```bash
# Struktur-Assertion (kein systemd nötig): Pflichtdirektiven aus D3 vorhanden.
for d in '^\[Service\]' '^Type=simple' '^ExecStart=/usr/bin/env node scripts/llm-proxy/server\.mjs' \
         '^Restart=on-failure' '^RestartSec=2' '^WantedBy=default\.target'; do
  grep -qE "$d" scripts/llm-proxy/llm-proxy.service || { echo "MISSING: $d"; exit 1; }
done
echo "llm-proxy.service Struktur OK"
# erwartet: llm-proxy.service Struktur OK

# Doku-Step (best-effort, wo ein systemd --user Manager läuft; %h-Specifier-Warnungen sind erwartbar):
systemd-analyze verify scripts/llm-proxy/llm-proxy.service || true
```

---

## Task 2: `Taskfile.llm.yml` (mod) — `install`, systemd-bevorzugendes `start`/`stop`, `cutover` (D3)

Ergänzt/ersetzt vier Tasks unter dem bestehenden `tasks:`-Block. `proxy:install` kopiert die Unit
nach `~/.config/systemd/user/`, `daemon-reload`, `enable` (ohne `--now` — Start bleibt separat, wie
in `cutover.sh` Schritt 4). `proxy:start`/`proxy:stop` bevorzugen systemd, wenn die Unit
installiert/enabled ist (`is-enabled`/`is-active`-Check), sonst der bestehende nohup/PID-File-Pfad.
`proxy:start` verweigert den Start, wenn ein **fremder** Prozess (nicht das eigene PID-File und nicht
die eigene Unit) bereits auf dem Port lauscht (`ss`-Check). `proxy:cutover` ist ein dünner Wrapper
auf `cutover.sh` (Task 3). Muster für den Install-Block: `Taskfile.factory.yml` → `autopilot:install`
(systemd-Manager-Guard, `UNIT_DIR`, `daemon-reload`, `enable`).

- [ ] `proxy:install` neu: `systemd --user`-Manager-Guard (sonst Hinweis auf nohup-Fallback + `exit 1`); `cp` der Unit nach `$HOME/.config/systemd/user/`, `systemctl --user daemon-reload`, `systemctl --user enable llm-proxy.service`.
- [ ] `proxy:start` ersetzen: Fremd-Listener-Guard (PID auf `:$PORT` via `ss`, gegen eigenes PID-File und `is-active llm-proxy.service` abgleichen); danach systemd bevorzugen (`is-enabled --quiet llm-proxy.service` → `systemctl --user start`), sonst der bestehende nohup/PID-File-Zweig.
- [ ] `proxy:stop` ersetzen: systemd bevorzugen (`is-active --quiet` → `systemctl --user stop`), sonst der bestehende PID-File-`kill`-Zweig.
- [ ] `proxy:cutover` neu: `bash scripts/llm-proxy/cutover.sh`.
- [ ] `proxy:status` und `proxy:logs` unverändert lassen.

```yaml
  proxy:install:
    desc: "Install llm-proxy.service (systemd USER unit) → ~/.config/systemd/user/, daemon-reload, enable"
    cmds:
      - |
        set -euo pipefail
        if ! systemctl --user show-environment >/dev/null 2>&1; then
          echo "Kein systemd --user Manager (WSL ohne linger?) — Fallback: task llm:proxy:start nutzt nohup."
          exit 1
        fi
        UNIT_DIR="$HOME/.config/systemd/user"; mkdir -p "$UNIT_DIR"
        cp "$(pwd)/scripts/llm-proxy/llm-proxy.service" "$UNIT_DIR/llm-proxy.service"
        systemctl --user daemon-reload
        systemctl --user enable llm-proxy.service
        echo "✓ llm-proxy.service installiert + enabled"

  proxy:start:
    desc: "Start the local LLM proxy (Port 18235). Bevorzugt systemd wenn llm-proxy.service enabled, sonst nohup-Fallback."
    cmds:
      - |
        set -e
        PORT="${LLM_PROXY_PORT:-18235}"
        DIR="$HOME/.local/state/llm-proxy"; mkdir -p "$DIR"
        PIDF="$DIR/proxy.pid"; LOGF="$DIR/proxy.log"
        OWN_PID="$([ -f "$PIDF" ] && cat "$PIDF" || echo '')"
        # Fremd-Listener-Guard: lauscht ein Prozess auf dem Port, der nicht unser eigener ist? → Abbruch.
        LISTEN_PID="$(ss -ltnHp 2>/dev/null | grep -E "[:.]${PORT}\b" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
        if [ -n "$LISTEN_PID" ] && [ "$LISTEN_PID" != "$OWN_PID" ]; then
          if systemctl --user is-active --quiet llm-proxy.service 2>/dev/null; then
            echo "llm-proxy.service läuft bereits (systemd)"; exit 0
          fi
          echo "FEHLER: fremder Prozess (pid $LISTEN_PID) lauscht auf :$PORT — erst freigeben (cutover.sh stoppt den Alt-Proxy)"
          exit 1
        fi
        if systemctl --user is-enabled --quiet llm-proxy.service 2>/dev/null; then
          systemctl --user start llm-proxy.service
          echo "✓ llm-proxy.service gestartet (systemd)"; exit 0
        fi
        if [ -n "$OWN_PID" ] && kill -0 "$OWN_PID" 2>/dev/null; then
          echo "llm-proxy already running (pid $OWN_PID)"; exit 0
        fi
        nohup node scripts/llm-proxy/server.mjs >> "$LOGF" 2>&1 &
        echo $! > "$PIDF"
        echo "✓ llm-proxy started (pid $(cat "$PIDF"), log $LOGF)"

  proxy:stop:
    desc: "Stop the local LLM proxy (systemd wenn aktiv, sonst PID-File)"
    cmds:
      - |
        if systemctl --user is-active --quiet llm-proxy.service 2>/dev/null; then
          systemctl --user stop llm-proxy.service && echo "✓ stopped (systemd)"; exit 0
        fi
        PIDF="$HOME/.local/state/llm-proxy/proxy.pid"
        [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null && rm -f "$PIDF" && echo "✓ stopped" || echo "not running"

  proxy:cutover:
    desc: "Cutover vom Alt-Proxy auf llm-proxy.service (Quiesce, Stop+Disable Alt-Unit, Smoke, Rollback). Wrapper auf cutover.sh."
    cmds:
      - bash scripts/llm-proxy/cutover.sh
```

**Verify:**

```bash
task --list 2>/dev/null | grep -E 'llm:proxy:(install|start|stop|cutover)'
# erwartet: alle vier Tasks gelistet (Taskfile parst)
task -n llm:proxy:install
# erwartet: Dry-Run druckt cp/daemon-reload/enable ohne Ausführung
```

---

## Task 3: `scripts/llm-proxy/cutover.sh` (neu) — 6-Schritt-Cutover + Rollback (D3)

Idempotenter Cutover exakt nach `design.md` D3: (1) Quiesce (`factory.service` nicht `active`),
(2) Parity-Preflight (`node --test scripts/llm-proxy/` grün — nutzt die p1-Fixups/Health), (3)
Alt-Unit `disable --now` (Datei bleibt als Rollback-Quelle auf dem Host), (4) `task llm:proxy:install`
+ `systemctl --user start llm-proxy.service`, (5) Smoke: `/healthz` 200, `/v1/models` non-empty, je
1 Completion in OpenAI-Shape (`/v1/chat/completions`) und Anthropic-Shape (`/v1/messages`), (6) bei
jedem Fehler ab Schritt 4 Rollback (neuen Proxy stoppen, Alt-Unit `enable --now`) und Exit ≠ 0. Am
Ende druckt das Skript die Host-Checkliste für die nicht-repo-getrackten Dateien — als Text, keine
automatischen Edits.

- [ ] Datei `scripts/llm-proxy/cutover.sh` neu anlegen; `set -euo pipefail`, `cd` ins Repo-Root (relativ zu `BASH_SOURCE`).
- [ ] Helfer `log`, `rollback` (stop neuer Proxy via `systemctl --user stop` + `task llm:proxy:stop`, dann `systemctl --user enable --now bonsai-msg-fixup-proxy.service`) und `fail` (log + rollback + `exit 1`).
- [ ] Schritt 1: `systemctl --user is-active --quiet factory.service` → aktiver Tick ⇒ Abbruch mit `exit 1` **ohne** Rollback (nichts wurde verändert).
- [ ] Schritt 2: `node --test scripts/llm-proxy/` → rot ⇒ Abbruch `exit 1` ohne Rollback.
- [ ] Schritt 3: `systemctl --user disable --now bonsai-msg-fixup-proxy.service` (tolerant).
- [ ] Schritt 4: `task llm:proxy:install || fail …`; `systemctl --user start llm-proxy.service || fail …`.
- [ ] Schritt 5: `/healthz`-Retry-Schleife (bis 200, max ~10 s), `/v1/models`-Länge ≥ 1, je 1 POST auf `/v1/chat/completions` und `/v1/messages` mit `model:"ternary-bonsai"` — jeder Fehler ⇒ `fail`.
- [ ] Schritt 6 (implizit über `fail`) + abschließende Host-Checkliste (`autopilot.env`: `FACTORY_LLM_BASE_URL`/`FACTORY_LLM_MODEL` ergänzen, `ANTHROPIC_*_MODEL` auf `ternary-bonsai`; globale `~/.config/opencode/opencode.jsonc`: Modell-ID `ternary-bonsai`; Migration auf beide Brand-DBs) als `cat <<'CHECKLIST'`-Ausgabe.

```bash
#!/usr/bin/env bash
# scripts/llm-proxy/cutover.sh — idempotenter Cutover vom nicht-versionierten Alt-Proxy
# (bonsai-msg-fixup-proxy.service) auf die repo-verwaltete llm-proxy.service (D1/D3).
# 6-Schritt-Ablauf mit Quiesce-Check, Parity-Preflight, Smoke beider Request-Shapes und
# Rollback-Pfad. Danach: Host-Checkliste für nicht-repo-getrackte Dateien — NUR Ausgabe.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"; cd "$REPO"

PORT="${LLM_PROXY_PORT:-18235}"
BASE="http://127.0.0.1:$PORT"
ALT_UNIT="bonsai-msg-fixup-proxy.service"
NEW_UNIT="llm-proxy.service"

log() { printf '[cutover] %s\n' "$*"; }
rollback() {
  log "ROLLBACK: neuen Proxy stoppen, Alt-Proxy reaktivieren"
  systemctl --user stop "$NEW_UNIT" 2>/dev/null || true
  task llm:proxy:stop 2>/dev/null || true
  systemctl --user enable --now "$ALT_UNIT" 2>/dev/null || true
}
fail() { log "FEHLER: $*"; rollback; exit 1; }

# (1) Quiesce — kein laufender factory-Tick (kein Rollback nötig, nichts verändert)
if systemctl --user is-active --quiet factory.service 2>/dev/null; then
  log "factory.service aktiv (laufender Tick) — Cutover abgebrochen"; exit 1
fi

# (2) Parity-Preflight — Proxy-Tests grün (Golden-Diff-Fixups + strict Routing aus p1/p5)
log "Parity-Preflight: node --test scripts/llm-proxy/"
node --test scripts/llm-proxy/ || { log "Preflight rot — Cutover abgebrochen"; exit 1; }

# (3) Alt-Unit stoppen + disablen (Datei bleibt als Rollback-Quelle auf dem Host)
systemctl --user disable --now "$ALT_UNIT" 2>/dev/null || true

# (4) Neuen Proxy installieren + starten
task llm:proxy:install || fail "task llm:proxy:install fehlgeschlagen"
systemctl --user start "$NEW_UNIT" || fail "Start $NEW_UNIT fehlgeschlagen"

# (5) Smoke — /healthz 200, /v1/models non-empty, je 1 Completion beider Shapes
code=""
for _ in $(seq 1 10); do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$BASE/healthz" 2>/dev/null || true)"
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] || fail "/healthz != 200 (nach 10 s)"
[ "$(curl -fsS "$BASE/v1/models" | jq -r '.data | length')" -ge 1 ] || fail "/v1/models leer"
curl -fsS -X POST "$BASE/v1/chat/completions" -H 'content-type: application/json' \
  -d '{"model":"ternary-bonsai","messages":[{"role":"user","content":"ping"}],"max_tokens":8}' \
  >/dev/null || fail "OpenAI-Shape Completion fehlgeschlagen"
curl -fsS -X POST "$BASE/v1/messages" -H 'content-type: application/json' \
  -d '{"model":"ternary-bonsai","max_tokens":8,"messages":[{"role":"user","content":"ping"}]}' \
  >/dev/null || fail "Anthropic-Shape Completion fehlgeschlagen"
log "Smoke grün — llm-proxy.service aktiv auf :$PORT"

# Host-Checkliste (nicht-repo-getrackte Dateien — nur Ausgabe, keine Edits):
cat <<'CHECKLIST'
──────────────────────────────────────────────────────────────────────
MANUELLE HOST-SCHRITTE (nicht repo-getrackt — bitte selbst editieren):
 1) ~/.config/factory/autopilot.env
      FACTORY_LLM_BASE_URL=http://127.0.0.1:18235   (ergänzen)
      FACTORY_LLM_MODEL=ternary-bonsai              (ergänzen)
      ANTHROPIC_*_MODEL=ternary-bonsai              (von ternary-bonsai-27b umstellen)
 2) ~/.config/opencode/opencode.jsonc (globale Datei)
      Modell-ID auf ternary-bonsai umstellen (Gateway-Alias löst auf)
 3) Migration auf BEIDE Brand-DBs anwenden:
      scripts/migrations/2026-07-23-unified-llm-gateway.sql
──────────────────────────────────────────────────────────────────────
CHECKLIST
```

**Verify:**

```bash
bash -n scripts/llm-proxy/cutover.sh
# erwartet: exit 0 (keine Syntaxfehler)

for needle in 'is-active --quiet factory.service' 'node --test scripts/llm-proxy/' \
              'disable --now' '/healthz' '/v1/chat/completions' '/v1/messages' 'rollback'; do
  grep -q "$needle" scripts/llm-proxy/cutover.sh || { echo "MISSING: $needle"; exit 1; }
done
echo "cutover 6-Schritt-Ablauf + Rollback vollständig"
# erwartet: cutover 6-Schritt-Ablauf + Rollback vollständig
```

---

## Task 4: `scripts/migrations/2026-07-23-unified-llm-gateway.sql` (neu) — Modell-ID-Reconciliation (D5)

Muster: `scripts/migrations/2026-07-22-llm-proxy-backends.sql` (idempotent, `BEGIN`/`COMMIT`,
Apply-Kommentar für **beide** Brand-DBs im Header). Live-DB-Stand (verifiziert 2026-07-23):
`provider_config` hat `model_id='ternary-bonsai-27b'` in mehreren enabled-Zeilen (Tiers
sonnet/haiku/coaching/cheap/flash), teils zusätzlich `provider='ternary-bonsai-27b'`;
`factory_model_slots` hat `model_id='ternary-bonsai-27b'` (Phasen plan/implement/verify), die
plan-Zeile zusätzlich `provider='ternary-bonsai-27b'`; `llm_proxy_backends`-Zeile `llamacpp-bonsai`
hat `model_aliases='{}'`. Alle Renames sind WHERE-gefiltert auf den alten Wert → idempotent.

- [ ] Datei `scripts/migrations/2026-07-23-unified-llm-gateway.sql` neu anlegen.
- [ ] Header-Kommentar mit Apply-Zeile für **beide** Brand-Kontexte (`factory_resolve`+`factory_psql`-Muster).
- [ ] `factory_model_slots`: `UPDATE … SET model_id='ternary-bonsai'` und separat `SET provider='ternary-bonsai'`, jeweils `WHERE <spalte>='ternary-bonsai-27b'`.
- [ ] `provider_config`: dieselben zwei `UPDATE`s (`model_id` **und** `provider`-Spalte), `WHERE <spalte>='ternary-bonsai-27b'` (enabled-Zeilen inklusive).
- [ ] `llm_proxy_backends`: `SET model_aliases = model_aliases || '{"ternary-bonsai":"*"}'::jsonb WHERE name='llamacpp-bonsai'` (jsonb-Merge, idempotent).

```sql
-- 2026-07-23-unified-llm-gateway.sql
-- Modell-ID-Reconciliation (D5): stale 'ternary-bonsai-27b' → logische ID 'ternary-bonsai' in
-- provider_config + factory_model_slots (model_id UND provider-Spalte), plus Wildcard-Alias
-- '{"ternary-bonsai":"*"}' am Backend llamacpp-bonsai in tickets.llm_proxy_backends.
-- Idempotent (WHERE-gefiltert auf den alten Wert; jsonb-Merge). Reversibel: Werte zurücksetzen.
--
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-unified-llm-gateway.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-23-unified-llm-gateway.sql'
BEGIN;

-- (a) factory_model_slots: Modell-ID + (wo gesetzt) Provider-Spalte umbenennen.
UPDATE tickets.factory_model_slots
   SET model_id = 'ternary-bonsai', updated_at = now()
 WHERE model_id = 'ternary-bonsai-27b';
UPDATE tickets.factory_model_slots
   SET provider = 'ternary-bonsai', updated_at = now()
 WHERE provider = 'ternary-bonsai-27b';

-- (b) provider_config: Modell-ID + Provider-Spalte umbenennen (enabled-Zeilen inklusive).
UPDATE tickets.provider_config
   SET model_id = 'ternary-bonsai', updated_at = now()
 WHERE model_id = 'ternary-bonsai-27b';
UPDATE tickets.provider_config
   SET provider = 'ternary-bonsai', updated_at = now()
 WHERE provider = 'ternary-bonsai-27b';

-- (c) Registry: Wildcard-Alias am Bonsai-Backend (erstes verfügbares Modell des Backends, D5).
UPDATE tickets.llm_proxy_backends
   SET model_aliases = model_aliases || '{"ternary-bonsai":"*"}'::jsonb,
       updated_at = now()
 WHERE name = 'llamacpp-bonsai';

COMMIT;
```

**Verify:**

```bash
# Dry-Apply gegen die Dev-DB: COMMIT durch ROLLBACK ersetzen → parst + führt, rollt aber zurück.
BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; \
  sed "s/^COMMIT;/ROLLBACK;/" scripts/migrations/2026-07-23-unified-llm-gateway.sql | factory_psql'
# erwartet: keine ERROR-Zeile (idempotenter Dry-Apply, wird zurückgerollt)
```

---

## Task 5: `scripts/factory/provider-register-bonsai.sh` (mod) — Re-Drift-Quelle tot (D7, Budget 468)

`design.md` D7 / „Re-Drift-Quelle": das Skript schreibt bei jedem idempotenten Lauf `:8093/v1` +
`ternary-bonsai-27b` in `provider_config` und `factory_model_slots` — genau die Drift, die die
Migration korrigiert. Alle Literale `http://127.0.0.1:8093/v1` → `http://127.0.0.1:18235` und
`ternary-bonsai-27b` → `ternary-bonsai` (auch im Kopf-Kommentar, damit der Config-Lint aus D4.3
keinen `:8093`-Rest findet). ON-CONFLICT-Semantik und Slot-Budget bleiben unverändert. Datei nicht
baselined → Budget 468; reine Wertänderung (netto zeilenneutral, bleibt bei 32 Zeilen).

- [ ] Kopf-Kommentar Z.2–3: `:8093` entfernen (Backend jetzt über das Gateway `:18235` registriert) — kein roher `:8093`-Literal mehr.
- [ ] `provider_config`-VALUES (beide Zeilen): `'ternary-bonsai-27b'` → `'ternary-bonsai'`, `'http://127.0.0.1:8093/v1'` → `'http://127.0.0.1:18235'`.
- [ ] `factory_model_slots`-VALUES (beide Zeilen): `'ternary-bonsai-27b'` → `'ternary-bonsai'`, `'http://127.0.0.1:8093/v1'` → `'http://127.0.0.1:18235'`.

```sql
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled)
VALUES
  ('factory-implement', 'sonnet', 0, 'llamacpp', 'ternary-bonsai', 'http://127.0.0.1:18235', 3, true),
  ('factory-review',    'sonnet', 0, 'llamacpp', 'ternary-bonsai', 'http://127.0.0.1:18235', 3, true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, max_concurrent = EXCLUDED.max_concurrent,
      enabled = true, updated_at = now();

INSERT INTO tickets.factory_model_slots (phase, provider, model_id, base_url, set_by)
VALUES
  ('implement', 'llamacpp', 'ternary-bonsai', 'http://127.0.0.1:18235', 'provider-register-bonsai'),
  ('verify',    'llamacpp', 'ternary-bonsai', 'http://127.0.0.1:18235', 'provider-register-bonsai')
ON CONFLICT (phase) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, set_by = EXCLUDED.set_by, updated_at = now();
```

**Verify:**

```bash
bash -n scripts/factory/provider-register-bonsai.sh
# erwartet: exit 0

grep -q 'http://127.0.0.1:18235' scripts/factory/provider-register-bonsai.sh \
  && grep -q "'ternary-bonsai'" scripts/factory/provider-register-bonsai.sh \
  && ! grep -qE '8093|ternary-bonsai-27b' scripts/factory/provider-register-bonsai.sh \
  && echo "provider-register auf Gateway + logische ID umgestellt (Re-Drift-Quelle tot)"
# erwartet: provider-register auf Gateway + logische ID umgestellt (Re-Drift-Quelle tot)
```

---

## Task 6: `scripts/factory/route-provider.sh` (mod) — opus-Hardcode + Emergency-Fallback → Gateway (D7, Budget 423)

`design.md` D7: der opus-Tier-Hardcode (Z.22–26) und der Emergency-Fallback (Z.76–77) sind die
letzten Egress-Pfade, die noch an der DB/am Gateway vorbei zeigen. Opus → `ternary-bonsai` @
`http://127.0.0.1:18235` (Base-URL steht bereits auf `:18235`, nur `OPUS_MODEL` und der `provider`-
String im printf werden gedreht). Emergency-Fallback `lmstudio`/`qwythos-9b-v2` @ `:1234` →
`llamacpp`/`ternary-bonsai` @ `http://127.0.0.1:18235` (killt das letzte `:1234`-Literal, das D4.3
verbietet). Datei nicht baselined → Budget 423; reine Wertänderung (bleibt bei 77 Zeilen).

- [ ] Z.22 `OPUS_MODEL="ternary-bonsai-27b"` → `OPUS_MODEL="ternary-bonsai"`.
- [ ] Z.25 opus-`printf`: `"provider":"ternary-bonsai-27b"` → `"provider":"ternary-bonsai"` (Base-URL `$OPUS_BASE_URL` bleibt `http://127.0.0.1:18235`).
- [ ] Z.77 Emergency-`printf`: `"provider":"lmstudio"` → `"provider":"llamacpp"`, `"modelId":"qwythos-9b-v2"` → `"modelId":"ternary-bonsai"`, `"baseUrl":"http://127.0.0.1:1234"` → `"baseUrl":"http://127.0.0.1:18235"`.

```bash
OPUS_MODEL="ternary-bonsai"
OPUS_BASE_URL="http://127.0.0.1:18235"
if [[ "$TIER" == "opus" ]]; then
  printf '{"provider":"ternary-bonsai","modelId":"%s","baseUrl":"%s","slotId":null,"ctx":0,"emergency":false}\n' "$OPUS_MODEL" "$OPUS_BASE_URL"
  exit 0
fi
```

```bash
# Emergency fallback: lokales Bonsai-Modell über das Gateway, kein Slot beansprucht.
printf '{"provider":"llamacpp","modelId":"ternary-bonsai","baseUrl":"http://127.0.0.1:18235","slotId":null,"ctx":0,"emergency":true}\n'
```

**Verify:**

```bash
bash -n scripts/factory/route-provider.sh
# erwartet: exit 0

! grep -qE '127\.0\.0\.1:1234|ternary-bonsai-27b|qwythos-9b-v2' scripts/factory/route-provider.sh \
  && echo "opus + emergency fallback auf Gateway umgestellt (kein :1234 / stale ID mehr)"
# erwartet: opus + emergency fallback auf Gateway umgestellt (kein :1234 / stale ID mehr)

# Live-Bestätigung (best-effort, wo factory_resolve die Env auflöst — opus-Pfad ist DB-frei):
bash scripts/factory/route-provider.sh factory-implement opus | jq -r '.baseUrl, .provider, .modelId'
# erwartet: http://127.0.0.1:18235 / ternary-bonsai / ternary-bonsai
```
