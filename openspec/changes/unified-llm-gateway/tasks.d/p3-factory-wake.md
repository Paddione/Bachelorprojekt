# p3-factory-wake — Factory-Wake, Pre-Dispatch-Gate & Single-Egress

Rolle: `impl`. Verdrahtet die Factory-Aufwach- und Schutz-Pfade rund um das Gateway `:18235`
(design.md §D4.2, §D6, §D7). `stage-plan.sh` weckt die Factory sofort statt bis ~5,5 min auf
`factory.timer` zu warten; `dispatcher-bridge.sh` bekommt ein Pre-Dispatch-`/healthz`-Gate, damit
ein toter Gateway keinen Gang-Slot verbrennt; `pipeline.mjs` bekommt einen env-getriebenen
`FACTORY_MODEL` (Split-Brain gegen `:1234` beseitigt); ein 30s-`factory-forcetick`-Poller macht den
Admin-Force-Tick-Button real (der Website-Pod kann kein `systemctl`).

**Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step (lebt
in `p5-tests`). Jeder Task endet mit einem konkreten lokalen Prüf-Step. `wakeup.sh` bleibt
unangetastet — der Flag-Konsum (Löschen) dort ist Audit und gehört nicht in diese Partial.

## S1-Zeilenbudgets (wirksame Schwelle je Datei, unbaselined ⇒ Extension-Limit)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/vda/ticket/stage-plan.sh` | 53 | 447 |
| `scripts/factory/dispatcher-bridge.sh` | 135 | 365 |
| `scripts/factory/forcetick-poll.sh` | 0 | 500 |

`scripts/factory/pipeline.mjs` steht auf der `s1.ignore`-Liste (sanktionierter Monolith, T000460) —
kein Zeilenbudget wird behauptet; der Diff bleibt trotzdem strikt auf den `FACTORY_MODEL`-
Konstantenblock (Z.16–24) begrenzt. `.service`/`.timer` sind S1-ungated (ini). Die neue
`forcetick-poll.sh` bleibt mit großer Reserve unter dem 500er-`.sh`-Limit.

---

## Task 1: `stage-plan.sh` — Force-Tick-Flag-Upsert + `factory.service`-Kick (D6-Writer)

Nach den drei erfolgreichen DB-Writes (der `factory_phase_events`-INSERT endet an Z.47 mit dem
`EOF`) und **vor** dem finalen `echo` (Z.48) zwei non-fatale Wake-Trigger einfügen. Das Flag folgt
exakt der `writeControl`-Semantik aus `website/src/pages/api/factory/force-tick.ts` bzw.
`website/src/lib/factory-floor.ts:79-86` (`INSERT … ON CONFLICT (key, brand) DO UPDATE`, `brand`
`NULL`). Der DB-Write nutzt das bestehende `_exec_sql "$pod" -v … <<'EOF'`-Muster (wie Z.24/37);
der `systemctl`-Kick ist fire-and-forget und darf ohne `--user`-Manager nicht abbrechen.

- [ ] Nach Z.47 (`EOF` des `factory_phase_events`-INSERT), vor `echo "Ticket $id staged …"` (Z.48)
      den Force-Tick-Upsert via `_exec_sql "$pod" -v setby='dev-flow-plan'` einfügen, non-fatal
      (`>/dev/null 2>&1 || true`).
- [ ] Danach `systemctl --user start factory.service 2>/dev/null || true` (fire-and-forget,
      non-fatal ohne systemd).
- [ ] Kommentar: Beide Trigger sind Best-Effort — ohne DB/systemd kommt der Tick weiterhin über
      `factory.timer`.

```bash
  # D6 wake: request a force-tick and kick a dispatcher tick now instead of
  # waiting up to ~5.5 min for factory.timer. Both non-fatal — no DB / no systemd
  # ⇒ the tick still arrives on the normal timer. Flag mirrors writeControl()
  # (website/src/lib/factory-floor.ts): key='force-tick-requested', brand IS NULL.
  _exec_sql "$pod" -v setby='dev-flow-plan' <<'EOF' >/dev/null 2>&1 || true
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES ('force-tick-requested', NULL, now()::text, :'setby', now())
ON CONFLICT (key, brand) DO UPDATE
  SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, updated_at = now();
EOF
  systemctl --user start factory.service 2>/dev/null || true
```

**Verify:**

```bash
bash -n scripts/vda/ticket/stage-plan.sh
# erwartet: exit 0 (keine Syntaxfehler)
grep -n "force-tick-requested" scripts/vda/ticket/stage-plan.sh
# erwartet: genau eine Trefferzeile im Upsert
```

---

## Task 2: `dispatcher-bridge.sh` — Pre-Dispatch-`/healthz`-Gate vor `budget-guard.sh` (D4.2)

Im Per-Ticket-Loop **unmittelbar vor** dem `budget-guard.sh`-Aufruf (Z.56–61) ein Health-Gate
gegen das Gateway einfügen. Ein toter Gateway darf keinen Gang-Slot verbrennen: bei Fehler eine
Log-Zeile schreiben und `continue` — das Ticket bleibt völlig unberührt (kein Status-Write, kein
`claude -p`-Spawn). Die Gateway-URL kommt aus `ANTHROPIC_BASE_URL` (Default `http://localhost:18235`,
identisch zur autopilot.env-Route). Einfügepunkt: nach der `dry_run_val`-Zuweisung (Z.53–54, direkt
vor dem `# Budget guard`-Kommentar). Budget 365 ist reichlich (reiner Einschub weniger Zeilen).

- [ ] Health-Gate-Block direkt vor dem `# Budget guard`-Kommentar (Z.56) einfügen.
- [ ] `GATEWAY="${ANTHROPIC_BASE_URL:-http://localhost:18235}"`; `curl -sf --max-time 3
      "${GATEWAY%/}/healthz"`; bei Fehler `echo …` + `continue` (kein `update-status`, kein Launch).
- [ ] Kommentar: Probe **vor** `budget-guard.sh`, damit ein Skip den Slot nicht anfasst.

```bash
  # Pre-dispatch health gate (D4): a dead gateway must not burn the single gang
  # slot. Probe BEFORE budget-guard so a skip leaves the ticket completely
  # untouched — no status write, no claude -p spawn. URL from autopilot.env's
  # ANTHROPIC_BASE_URL (default matches the outer-orchestrator route).
  GATEWAY="${ANTHROPIC_BASE_URL:-http://localhost:18235}"
  if ! curl -sf --max-time 3 "${GATEWAY%/}/healthz" >/dev/null 2>&1; then
    echo "dispatcher-bridge: gateway ${GATEWAY} /healthz down — skipping $ext_id ($brand), no slot burn" >&2
    continue
  fi

  # Budget guard
```

**Verify:**

```bash
bash -n scripts/factory/dispatcher-bridge.sh
# erwartet: exit 0
grep -nA2 "Pre-dispatch health gate" scripts/factory/dispatcher-bridge.sh
# erwartet: der Gate-Block steht vor dem "# Budget guard"-Kommentar
```

---

## Task 3: `pipeline.mjs` — `FACTORY_MODEL` env-getrieben (Split-Brain-Fix, D7)

Der hartkodierte `FACTORY_MODEL` (Z.20–24) zeigt heute auf `http://127.0.0.1:1234` (LM Studio,
`qwythos-9b-v2`) und umgeht damit das Gateway — Split-Brain gegenüber dem äußeren Orchestrator auf
`:18235`. Umstellung auf env-getriebene Defaults, sodass die ~25 `{model: FACTORY_MODEL}`-Call-Sites
**unangetastet** bleiben. `pipeline.mjs` steht auf `s1.ignore` (kein Zeilenbudget) — der Diff bleibt
dennoch strikt auf den Konstantenblock Z.16–24 (Kommentar + `const`) begrenzt; kein anderer Teil der
Datei wird angefasst. Das entfernt zugleich das `:1234`-Literal (Config-Lint-Surface aus §D4.3).

- [ ] Nur den Block Z.16–24 ersetzen: Kommentar auf Gateway-Routing aktualisieren; `provider` ⇐
      `process.env.FACTORY_LLM_PROVIDER || 'llamacpp'`, `modelId` ⇐ `process.env.FACTORY_LLM_MODEL
      || 'ternary-bonsai'`, `baseUrl` ⇐ `process.env.FACTORY_LLM_BASE_URL || 'http://127.0.0.1:18235'`.
- [ ] Keine Call-Site (`{ model: FACTORY_MODEL }`) und keine andere Zeile berühren.

```js
// Factory egress — single health-checked gateway (unified-llm-gateway, T002102).
// Env-driven so the ~25 { model: FACTORY_MODEL } call sites stay untouched; the
// defaults hit the proxy on :18235, where the logical model id resolves via the
// tickets.llm_proxy_backends alias. Overridable per host via FACTORY_LLM_* env.
const FACTORY_MODEL = {
  provider: process.env.FACTORY_LLM_PROVIDER || 'llamacpp',
  modelId: process.env.FACTORY_LLM_MODEL || 'ternary-bonsai',
  baseUrl: process.env.FACTORY_LLM_BASE_URL || 'http://127.0.0.1:18235',
}
```

**Verify:**

```bash
node --check scripts/factory/pipeline.mjs
# erwartet: exit 0 (Syntax ok; kein Server-Start)
grep -c "127.0.0.1:1234" scripts/factory/pipeline.mjs
# erwartet: 0 (Split-Brain-Literal entfernt)
```

---

## Task 4: `forcetick-poll.sh` (neu) — read-only Flag-Poller → `factory.service`

Neues Oneshot-Skript, das die 30s-`factory-forcetick`-Timer-Aktivierung ausführt. Genau **ein**
read-only `SELECT` auf `tickets.factory_control` über das bestehende `factory_psql`-Muster
(`source scripts/factory/lib.sh; factory_resolve; factory_psql`, vgl. `scripts/factory/lib.sh:10-44`).
Ist das `force-tick-requested`-Flag (`brand IS NULL`) gesetzt, `systemctl --user start factory.service`.
Das Flag wird hier **nicht** gelöscht — der Konsum passiert weiterhin in `wakeup.sh:73-83` (Audit-Log
+ `DELETE`). DB-Zugriff läuft in einer `set +e`-Subshell (Muster `_control_psql` aus `wakeup.sh:64-68`),
damit `factory_resolve`/`factory_psql`-Fehler den Poller nie abbrechen. REPO wird aus `BASH_SOURCE`
abgeleitet (Muster `dispatcher-bridge.sh:11-12`).

- [ ] Datei `scripts/factory/forcetick-poll.sh` neu anlegen, `#!/usr/bin/env bash`, `set -uo pipefail`,
      Shebang + ausführbar (`chmod +x`).
- [ ] `HERE`/`REPO` aus `BASH_SOURCE` ableiten und nach `$REPO` `cd`en (Best-Effort, `|| exit 0`).
- [ ] Genau ein `SELECT value … WHERE key='force-tick-requested' AND brand IS NULL LIMIT 1` in einer
      `set +e`-Subshell via `factory_psql`; Ergebnis in `flag`.
- [ ] Bei nicht-leerem `flag` (Whitespace-getrimmt) `systemctl --user start factory.service 2>/dev/null
      || true` plus eine Log-Zeile nach stderr. Kein `DELETE`.

```bash
#!/usr/bin/env bash
# scripts/factory/forcetick-poll.sh — activated every 30s by factory-forcetick.timer.
# ONE read-only SELECT on the force-tick flag; if set, kick a factory tick. The flag
# is consumed (deleted) by wakeup.sh, NOT here — so a set flag reliably fires exactly
# one tick even if this poller and the timer race. Best-effort: DB/systemd errors are
# swallowed so the poller never wedges the timer.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO" || exit 0

flag="$(
  ( set +e
    source "$REPO/scripts/factory/lib.sh"
    factory_resolve
    printf '%s' "SELECT value FROM tickets.factory_control WHERE key='force-tick-requested' AND brand IS NULL LIMIT 1;" \
      | factory_psql
  ) 2>/dev/null || true
)"

if [[ -n "${flag//[[:space:]]/}" ]]; then
  echo "forcetick-poll: force-tick flag set (@ ${flag}) — starting factory.service" >&2
  systemctl --user start factory.service 2>/dev/null || true
fi
```

**Verify:**

```bash
bash -n scripts/factory/forcetick-poll.sh
# erwartet: exit 0
test -x scripts/factory/forcetick-poll.sh && echo executable
# erwartet: "executable" (chmod +x gesetzt)
```

---

## Task 5: `factory-forcetick.service` + `.timer` (neu) + Host-Install (D6-Poller)

Zwei neue systemd-**user**-Units nach dem Muster von `scripts/factory/factory.service` /
`factory.timer`: eine Oneshot-`.service`, die `forcetick-poll.sh` ausführt, und eine `.timer`, die
sie alle 30s aktiviert (`OnUnitActiveSec=30s`, plus `OnBootSec=30s` zum Bootstrappen des Zyklus).
Absolute Pfade und `EnvironmentFile=-%h/.config/factory/autopilot.env` wie in `factory.service:11-24`
(die Env-Datei liefert `kubectl`-Kontext/Creds für den DB-Read). Damit wirkt der Admin-Force-Tick-
Button in ≤30 s, ohne dass der Website-Pod `systemctl` braucht.

Der Install-Weg spiegelt den bestehenden `factory:autopilot:install`-Mechanismus
(`Taskfile.factory.yml:60-84`: symlink nach `~/.config/systemd/user/`, `daemon-reload`,
`enable --now`). Weil `Taskfile.factory.yml` nicht zum `target_files`-Satz dieser Partial gehört,
wird die Aktivierung als **Host-Runbook-Schritt** ausgeführt (analog zu den host-seitigen
Cutover-/`autopilot.env`-Schritten der Change) — identische Symlink-/`enable`-Kette, nur manuell für
die zwei neuen Units. Werden die zwei `ln -sf`-Zeilen später in `factory:autopilot:install` gefaltet,
gehören sie neben die bestehenden `factory.service`/`factory.timer`-Symlinks.

- [ ] `scripts/factory/factory-forcetick.service` neu anlegen: `[Unit] Description=…`,
      `After=network-online.target`; `[Service] Type=oneshot`,
      `WorkingDirectory=/home/patrick/Bachelorprojekt`,
      `ExecStart=/home/patrick/Bachelorprojekt/scripts/factory/forcetick-poll.sh`,
      `EnvironmentFile=-%h/.config/factory/autopilot.env`, `TimeoutStartSec=30`.
- [ ] `scripts/factory/factory-forcetick.timer` neu anlegen: `[Timer] Unit=factory-forcetick.service`,
      `OnBootSec=30s`, `OnUnitActiveSec=30s`, `Persistent=false`; `[Install] WantedBy=timers.target`.

```ini
# scripts/factory/factory-forcetick.service
# Software Factory — force-tick poller (oneshot). Fired every 30s by
# factory-forcetick.timer; runs forcetick-poll.sh, which SELECTs the force-tick
# flag and (if set) starts factory.service. Makes the admin "Force next tick"
# button effective in <=30s (the website pod cannot run systemctl).
[Unit]
Description=Software Factory force-tick poller (factory_control flag -> factory.service)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/home/patrick/Bachelorprojekt
ExecStart=/home/patrick/Bachelorprojekt/scripts/factory/forcetick-poll.sh
EnvironmentFile=-%h/.config/factory/autopilot.env
TimeoutStartSec=30
```

```ini
# scripts/factory/factory-forcetick.timer
# Software Factory — 30s poll timer for the admin force-tick flag. Paired with
# factory-forcetick.service. Enable via the factory autopilot symlink runbook
# (mirrors Taskfile factory:autopilot:install).
[Unit]
Description=Software Factory force-tick poll (30s)

[Timer]
Unit=factory-forcetick.service
OnBootSec=30s
OnUnitActiveSec=30s
Persistent=false

[Install]
WantedBy=timers.target
```

Host-Install-Runbook (spiegelt `factory:autopilot:install`, nur für die zwei neuen Units):

```bash
UNIT_DIR="${HOME}/.config/systemd/user"; SRC="$(pwd)/scripts/factory"
ln -sf "${SRC}/factory-forcetick.service" "${UNIT_DIR}/factory-forcetick.service"
ln -sf "${SRC}/factory-forcetick.timer"   "${UNIT_DIR}/factory-forcetick.timer"
systemctl --user daemon-reload
systemctl --user enable --now factory-forcetick.timer
systemctl --user list-timers factory-forcetick.timer --no-pager
```

**Verify:**

```bash
# Statischer Unit-Parse als Doku-Step (advisory-Warnungen bei user-Units sind ok):
systemd-analyze verify scripts/factory/factory-forcetick.service scripts/factory/factory-forcetick.timer || true
# erwartet: keine "Failed to parse"-Fehler; nur ggf. advisory-Hinweise
grep -q "OnUnitActiveSec=30s" scripts/factory/factory-forcetick.timer && echo "30s-poll ok"
# erwartet: "30s-poll ok"
```
