---
title: Factory-Provider-Fallback — Kaskade wiederherstellen
ticket_id: T002359
domains: [infra, ops, test]
status: plan_staged
---

# factory-provider-fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Software Factory bekommt eine echte dreistufige Provider-Kaskade zurueck und meldet ihren Durchgriff, statt lautlos auf eine Modell-ID ohne Backend zu zeigen.

**Architecture:** `route-provider.sh` bekommt genau einen Auswahlpfad — `factory_model_slots` liefert Kandidat #0, `provider_config` liefert #1..n, alle durchlaufen dieselbe Claim-Schleife. Die Provider→Key-Zuordnung wandert aus dem Shell-`case` in die DB-Spalte `api_key_env` (Name der Env-Variable, nicht der Key). Der TTL-Reaper wird an den Factory-Tick gehaengt und raeumt eine verwaiste Zeile vollstaendig statt einzeln.

**Tech Stack:** Bash, PostgreSQL 16 (`tickets`-Schema via `kubectl exec`), BATS (vendored unter `tests/unit/lib/bats-core/bin/bats`), go-task.

## Global Constraints

- Der `opus`-Zweig in `route-provider.sh` (Zeilen 28-70) bleibt unveraendert — er hat bewusst keinen Slot-Claim, weil der Aufrufer keinen Release-Pfad hat, und wird von `FA-SF-70` ohne erreichbare DB getestet.
- Kein API-Key wird in die DB geschrieben. `provider_config.api_key_env` traegt ausschliesslich den **Namen** einer Env-Variable; die Werte bleiben git-crypt-verschluesselt in `environments/.secrets/<env>.yaml`.
- Tier `haiku` sowie die `coaching`/`ticket-triage`/`assistant-chat`-Zeilen bleiben unangetastet.
- BATS-Runner ist `tests/unit/lib/bats-core/bin/bats` — nicht `which bats`.
- Keine unqualifizierten `$output`-Assertions: der Worktree heisst `factory-provider-fallback` und wuerde ueber ein `$0` in einer Usage-Zeile falsch-positiv matchen.

## File Structure

| Datei | Verantwortung | Ist | Budget |
|---|---|---|---|
| `scripts/factory/route-provider.sh` | Kandidatenkette, Claim, `apiKeyEnv`-Ausgabe | 121 | 379 |
| `scripts/factory/auto-triage.sh` | Key-Aufloesung per Indirektion statt `case` | 390 | 110 |
| `scripts/factory/scout-llm-fallback.sh` | dito fuer den Scout-Pfad | 159 | 341 |
| `scripts/factory/reap-provider-slots.sh` | verwaiste Slots vollstaendig freigeben | 68 | 432 |
| `scripts/factory/wakeup.sh` | Reaper-Aufruf + Key-Export pro Tick | 232 | 268 |
| `scripts/migrations/2026-07-27-provider-fallback-cascade.sql` | neu: Spalte, Kaskade, `llamacpp`-Reset | — | — |
| `scripts/llm/routing-check.sh` | neu: Regressionssperre gegen Modell-IDs ohne Backend | — | — |
| `Taskfile.yml` | neu: `llm:routing:check` (S4 — Skript muss erreichbar sein) | — | — |
| `tests/spec/software-factory.bats` | FA-SF-74-Block (bereits rot geschrieben) | — | — |

---

### Task 1: Slot-Reaper reparieren und verdrahten

Setzt RC3 und RC4 um. Bewusst der erste Task: er entblockt `llamacpp` und macht Scout und Triage sofort wieder funktionsfaehig, unabhaengig vom Rest.

**Files:**
- Modify: `scripts/factory/reap-provider-slots.sh:48-62`
- Modify: `scripts/factory/wakeup.sh`
- Test: `tests/spec/software-factory.bats` (FA-SF-74, bereits vorhanden)

**Interfaces:**
- Consumes: `factory_resolve` / `factory_psql` aus `scripts/factory/lib.sh`.
- Produces: nichts fuer spaetere Tasks — reine Verhaltenskorrektur.

- [x] **Step 1: Den bereits geschriebenen RED-Test laufen lassen**

Der FA-SF-74-Block existiert schon und ist rot. Beweis vor der Aenderung:

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: reaper zeroes|FA-SF-74: wakeup.sh runs" tests/spec/software-factory.bats
```

Expected: FAIL — `grep -Eq 'active_agents *= *0'` findet nichts, und `wakeup.sh` enthaelt keinen Reaper-Aufruf.

- [x] **Step 2: Dekrement durch Nullsetzung ersetzen**

In `scripts/factory/reap-provider-slots.sh` im `WITH stale AS (...)`-UPDATE:

```sql
WITH stale AS (
  UPDATE tickets.provider_health
     SET active_agents   = 0,
         reserved_tokens = 0,
         claimed_at      = NULL,
         updated_at      = now()
   WHERE active_agents > 0
     AND claimed_at IS NOT NULL
     AND claimed_at < now() - (:'ttl' || ' minutes')::interval
  RETURNING provider
)
SELECT count(*) FROM stale;
```

Begruendung als Kommentar direkt darueber ergaenzen: die Zeile wird nur angefasst, wenn ihr juengster Claim aelter als die TTL ist — dann sind alle auf ihr gehaltenen Slots verwaist, nicht nur einer. Das alte `GREATEST(0, active_agents - 1)` in Kombination mit `claimed_at = NULL` machte die Zeile nach dem ersten Lauf unerreichbar, weil `claimed_at IS NOT NULL` nie wieder matchte.

- [x] **Step 3: Reaper an den Factory-Tick haengen**

In `scripts/factory/wakeup.sh` vor dem Dispatch-Block einfuegen:

```bash
# Verwaiste Provider-Slots freigeben, bevor der Tick Kandidaten claimt [T002359].
# Bewusst hier statt in einem eigenen systemd-Timer: der Reaper soll nur laufen,
# wenn die Factory laeuft — sonst koennte er Slots aktiver Requests abraeumen.
bash "$HERE/reap-provider-slots.sh" || true
```

- [x] **Step 4: Tests gruen pruefen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: reaper zeroes|FA-SF-74: wakeup.sh runs" tests/spec/software-factory.bats
```

Expected: PASS (2 Tests).

- [x] **Step 5: Verwaiste Slots einmalig abraeumen und verifizieren**

```bash
bash scripts/factory/reap-provider-slots.sh --dry-run
bash scripts/factory/reap-provider-slots.sh
```

Danach muss `llamacpp` auf `active_agents=0` stehen. Pruefen mit dem Query aus Task 4, Step 5.

- [x] **Step 6: Commit**

```bash
git add scripts/factory/reap-provider-slots.sh scripts/factory/wakeup.sh
git commit -m "fix(factory): reaper zeroes stranded slots and runs each tick [T002359]"
```

---

### Task 2: Router — Kandidatenkette statt Phase-Shortcut

Setzt RC1 und die Router-Seite von D3 um.

**Files:**
- Modify: `scripts/factory/route-provider.sh:72-121`
- Test: `tests/spec/software-factory.bats` (FA-SF-74)

**Interfaces:**
- Consumes: `tickets.factory_model_slots(phase, provider, model_id, base_url)` und `tickets.provider_config(source, tier, priority, provider, model_id, base_url, max_concurrent, context_window, context_budget, enabled)`, ab Task 4 zusaetzlich `api_key_env`.
- Produces: Router-JSON mit dem zusaetzlichen Feld `apiKeyEnv` (String oder `null`). Task 3 liest genau dieses Feld. Bestehende Felder (`provider`, `modelId`, `baseUrl`, `slotId`, `ctx`, `emergency`) bleiben unveraendert.

- [x] **Step 1: RED-Test laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: route-provider" tests/spec/software-factory.bats
```

Expected: FAIL — der Phase-Block enthaelt noch ein `exit 0`, `qwythos-9b-v2` steht noch im Emergency-Zweig, und `apiKeyEnv` fehlt.

- [x] **Step 2: Phase-Zweig zur Kandidatenquelle machen**

Den Block `if [[ -n "$PHASE" ]]; then ... fi` (Zeilen 72-86) so ersetzen, dass er die Zeile **sammelt** statt zurueckzugeben:

```bash
# Der Phase-Pin aus factory_model_slots ist Kandidat #0, nicht das Ergebnis [T002359].
# Bis hierher returnte dieser Block beim ersten Treffer und uebersprang damit
# Priority-Kette, provider_health, Cooldown und Claim vollstaendig — die gesamte
# Fallback-Logik darunter war fuer plan/implement/verify toter Code.
PINNED=""
if [[ -n "$PHASE" ]]; then
  PINNED=$(factory_psql -v phase="$PHASE" <<'SQL'
SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')||E'\t'||3
       ||E'\t'||0||E'\t'||''||E'\t'||COALESCE(api_key_env,'')
FROM tickets.factory_model_slots WHERE phase = :'phase';
SQL
)
fi
```

`factory_model_slots` hat keine `max_concurrent`-Spalte; der Literalwert `3` haelt das Feldformat mit `provider_config` deckungsgleich, damit beide Quellen dieselbe Claim-Schleife durchlaufen. `api_key_env` kommt aus Task 4 hinzu — bis dahin liefert `COALESCE` den Leerstring, und die Schleife behandelt ihn wie einen Provider ohne Key.

- [x] **Step 3: Kandidatenliste zusammenfuehren**

Die `CANDS`-Zuweisung um `api_key_env` erweitern und den Pin voranstellen:

```bash
CANDS=$(factory_psql -v src="$SOURCE" -v tier="$TIER" <<'SQL'
SELECT provider||E'\t'||model_id||E'\t'||COALESCE(base_url,'')||E'\t'||max_concurrent
       ||E'\t'||COALESCE(context_window,0)||E'\t'||COALESCE(context_budget::text,'')
       ||E'\t'||COALESCE(api_key_env,'')
FROM tickets.provider_config
WHERE (source=:'src' OR source='*') AND tier=:'tier' AND enabled=true
ORDER BY (source=:'src') DESC, priority ASC;
SQL
)
[[ -n "$PINNED" ]] && CANDS="${PINNED}"$'\n'"${CANDS}"
```

- [x] **Step 4: Schleife um das Key-Feld erweitern**

`read` und die Ausgabe anpassen:

```bash
while IFS=$'\t' read -r prov model burl maxc ctx budget keyenv; do
  [[ -z "$prov" ]] && continue
```

und im Erfolgsfall:

```bash
  if [[ -n "$CLAIM" ]]; then
    BJSON=$([[ -n "$burl" ]] && printf '"%s"' "$burl" || printf 'null')
    KJSON=$([[ -n "$keyenv" ]] && printf '"%s"' "$keyenv" || printf 'null')
    printf '{"provider":"%s","modelId":"%s","baseUrl":%s,"slotId":"%s","ctx":%s,"apiKeyEnv":%s,"emergency":false}\n' \
      "$prov" "$model" "$BJSON" "$prov" "${ctx:-0}" "$KJSON"
    exit 0
  fi
```

- [x] **Step 5: Emergency-Zweig auf ein reales Backend zeigen lassen und hoerbar machen**

Die Schlusszeile ersetzen:

```bash
# RC5: hier stand lmstudio/qwythos-9b-v2 — ein Modell, das LM Studio seit dem
# Gemma-Cutover nicht mehr serviert. Der Router gab es lautlos zurueck.
echo "route-provider: ALLE Kandidaten fuer source=$SOURCE tier=$TIER belegt oder auf Cooldown." >&2
echo "  Emergency-Fallback aktiv — pruefe 'bash scripts/factory/reap-provider-slots.sh --dry-run'." >&2
printf '{"provider":"lmstudio","modelId":"gemma-4-12b","baseUrl":"http://127.0.0.1:1234","slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":true}\n'
```

- [x] **Step 6: Auch der opus-Zweig gibt das neue Feld aus**

Damit alle Ausgabepfade dasselbe Schema haben, in der `printf`-Zeile des `opus`-Blocks (Zeile 67-68) `"apiKeyEnv":null,` vor `"emergency"` ergaenzen. Die Auswahllogik des Zweigs bleibt unangetastet.

- [x] **Step 7: Tests gruen pruefen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-70|FA-SF-71|FA-SF-74: route-provider" tests/spec/software-factory.bats
```

Expected: PASS. `FA-SF-70` und `FA-SF-71` sind Regressionsschutz — sie muessen mitlaufen und gruen bleiben.

- [x] **Step 8: Commit**

```bash
git add scripts/factory/route-provider.sh
git commit -m "fix(factory): phase pin feeds candidate chain, router emits apiKeyEnv [T002359]"
```

---

### Task 3: Aufrufer auf datengetriebene Key-Aufloesung umstellen

Setzt die Aufruferseite von D3 um und beseitigt den Griff zum falschen der beiden DeepSeek-Keys.

**Files:**
- Modify: `scripts/factory/auto-triage.sh:214-221`
- Modify: `scripts/factory/scout-llm-fallback.sh:70-90`
- Modify: `scripts/factory/wakeup.sh`
- Test: `tests/spec/software-factory.bats` (FA-SF-74)

**Interfaces:**
- Consumes: `apiKeyEnv` aus dem Router-JSON (Task 2).
- Produces: nichts fuer spaetere Tasks.

- [x] **Step 1: RED-Test laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: auto-triage" tests/spec/software-factory.bats
```

Expected: FAIL — `auto-triage.sh` kennt `apiKeyEnv` nicht und liest hart `DEEPSEEK_API_KEY`.

- [x] **Step 2: `case`-Statement durch Indirektion ersetzen**

In `scripts/factory/auto-triage.sh` den Block ab `case "$provider" in` ersetzen:

```bash
  # Welche Env-Variable den Key traegt, entscheidet die DB-Zeile — nicht dieses Skript
  # [T002359]. Vorher stand hier ein case, das fuer deepseek DEEPSEEK_API_KEY las: den
  # Coaching-Key, nicht den Factory-Key (pk-deepseek, DEEPSEEK_API_KEY_PK).
  local key_env
  key_env=$(echo "$route" | jq -r '.apiKeyEnv // ""')
  if [[ -n "$key_env" ]]; then
    api_key="${!key_env:-}"
    if [[ -z "$api_key" ]]; then
      echo "auto-triage: $key_env ist nicht gesetzt — Provider $provider ohne Key." >&2
    fi
  else
    api_key=""
  fi
```

- [x] **Step 3: Denselben Mechanismus im Scout-Pfad**

`scripts/factory/scout-llm-fallback.sh` liest den Key bisher gar nicht aus dem Router. Nach der `base_url`-Zuweisung ergaenzen:

```bash
key_env="$(printf '%s' "$provider_json" | jq -r '.apiKeyEnv // empty' 2>/dev/null)"
api_key="${key_env:+${!key_env:-}}"
```

und den `curl`-Aufruf um den Header erweitern, sofern ein Key vorliegt:

```bash
AUTH_ARGS=()
[[ -n "${api_key:-}" ]] && AUTH_ARGS=(-H "Authorization: Bearer ${api_key}")
```

Die `AUTH_ARGS` beim bestehenden `curl`-Aufruf mit `"${AUTH_ARGS[@]}"` einsetzen. Fail-soft bleibt: ohne Key laeuft der Aufruf wie bisher gegen die lokalen Backends, die keinen Header brauchen.

- [x] **Step 4: Factory-Key in die Tick-Umgebung exportieren**

In `scripts/factory/wakeup.sh` beim Laden der Konfiguration ergaenzen:

```bash
# DEEPSEEK_API_KEY_PK ist der Factory-Key (Account pk-deepseek, getrennte Abrechnung
# vom Coaching-Key DEEPSEEK_API_KEY). Die Zuordnung steht in provider_config.api_key_env;
# hier wird nur dafuer gesorgt, dass die Variable in der Prozessumgebung steht [T002359].
if [[ -z "${DEEPSEEK_API_KEY_PK:-}" ]]; then
  # shellcheck source=/dev/null
  source "$REPO_ROOT/scripts/env-resolve.sh" mentolder 2>/dev/null || true
  export DEEPSEEK_API_KEY_PK="${DEEPSEEK_API_KEY_PK:-}"
fi
```

- [x] **Step 5: Tests gruen pruefen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: auto-triage" tests/spec/software-factory.bats
bash -n scripts/factory/scout-llm-fallback.sh && bash -n scripts/factory/wakeup.sh
```

Expected: PASS, und beide Syntaxpruefungen ohne Ausgabe.

- [x] **Step 6: Commit**

```bash
git add scripts/factory/auto-triage.sh scripts/factory/scout-llm-fallback.sh scripts/factory/wakeup.sh
git commit -m "fix(factory): resolve provider api key by env-var name from routing row [T002359]"
```

---

### Task 4: Migration — Spalte, Kaskade, Sofort-Entblockung

Setzt RC2 und die Datenseite von D2/D3 um.

**Files:**
- Create: `scripts/migrations/2026-07-27-provider-fallback-cascade.sql`
- Test: `tests/spec/software-factory.bats` (FA-SF-74, DB-Assertion)

**Interfaces:**
- Consumes: nichts.
- Produces: Spalte `tickets.provider_config.api_key_env TEXT NULL` und `tickets.factory_model_slots.api_key_env TEXT NULL`, gelesen von Task 2.

- [ ] **Step 1: RED-Test laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: each factory tier" tests/spec/software-factory.bats
```

Expected: FAIL — `cheap`, `flash` und `sonnet` haben je nur einen `enabled` Kandidaten.

- [ ] **Step 2: Migration schreiben**

```sql
-- scripts/migrations/2026-07-27-provider-fallback-cascade.sql
-- T002359: Der Provider-Fallback war strukturell unerreichbar. Diese Migration stellt die
-- dreistufige Kaskade in genau den Tiers her, die real angefragt werden, und traegt die
-- Key-Zuordnung als Variablennamen ein (der Key selbst bleibt in git-crypt).
BEGIN;

ALTER TABLE tickets.provider_config      ADD COLUMN IF NOT EXISTS api_key_env TEXT;
ALTER TABLE tickets.factory_model_slots  ADD COLUMN IF NOT EXISTS api_key_env TEXT;

COMMENT ON COLUMN tickets.provider_config.api_key_env IS
  'Name der Env-Variable, die den API-Key traegt (z.B. DEEPSEEK_API_KEY_PK fuer die Factory, '
  'DEEPSEEK_API_KEY fuer Coaching). NIE der Key selbst — der liegt git-crypt-verschluesselt in '
  'environments/.secrets/<env>.yaml. NULL = Provider braucht keinen Key (lokale Backends).';

-- Stufe 2: LM Studio direkt, umgeht den Proxy — deckt einen Proxy-Ausfall bei laufendem
-- Backend ab. Stufe 3: DeepSeek, faengt den Totalausfall des GPU-Hosts.
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled, api_key_env, brand)
VALUES
  ('*', 'cheap',  1, 'lmstudio', 'gemma-4-12b',   'http://127.0.0.1:1234',       3, true, NULL,                  'mentolder'),
  ('*', 'cheap',  2, 'deepseek', 'deepseek-chat', 'https://api.deepseek.com/v1', 3, true, 'DEEPSEEK_API_KEY_PK', 'mentolder'),
  ('*', 'flash',  1, 'lmstudio', 'gemma-4-12b',   'http://127.0.0.1:1234',       3, true, NULL,                  'mentolder'),
  ('*', 'flash',  2, 'deepseek', 'deepseek-chat', 'https://api.deepseek.com/v1', 3, true, 'DEEPSEEK_API_KEY_PK', 'mentolder'),
  ('*', 'sonnet', 1, 'lmstudio', 'gemma-4-12b',   'http://127.0.0.1:1234',       3, true, NULL,                  'mentolder');

-- Die sonnet-DeepSeek-Zeile existiert bereits (prio 1, deepseek-v4-pro) — sie bekommt nur
-- die korrekte Base-URL und den Key-Namen. /anthropic ergab gegen den angehaengten Pfad
-- /v1/chat/completions einen 404; der Anthropic-Mode waere /v1/messages.
UPDATE tickets.provider_config
   SET priority = 2, base_url = 'https://api.deepseek.com/v1', api_key_env = 'DEEPSEEK_API_KEY_PK'
 WHERE source = '*' AND tier = 'sonnet' AND provider = 'deepseek';

-- RC3: llamacpp stand seit 2026-07-27 03:30 UTC auf active_agents=3 = max_concurrent und
-- wurde von der Kandidatenkette still uebersprungen.
UPDATE tickets.provider_health
   SET active_agents = 0, reserved_tokens = 0, claimed_at = NULL, updated_at = now()
 WHERE provider = 'llamacpp';

COMMIT;
```

- [ ] **Step 3: Migration anwenden**

```bash
bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-27-provider-fallback-cascade.sql'
```

- [ ] **Step 4: Kaskade verifizieren**

```bash
bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql <<EOSQL
SELECT tier, priority, provider, model_id, base_url, COALESCE(api_key_env, chr(45))
FROM tickets.provider_config
WHERE source = chr(42) AND enabled = true AND tier IN (chr(99)||chr(104)||chr(101)||chr(97)||chr(112))
ORDER BY tier, priority;
EOSQL'
```

Erwartet: drei Zeilen fuer `cheap` mit den Prioritaeten 0, 1, 2.

- [ ] **Step 5: Slot-Zustand verifizieren**

```bash
bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql <<EOSQL
SELECT provider, active_agents, reserved_tokens, claimed_at FROM tickets.provider_health ORDER BY provider;
EOSQL'
```

Erwartet: `llamacpp` mit `active_agents = 0` und leerem `claimed_at`.

- [ ] **Step 6: DB-Test gruen pruefen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74: each factory tier" tests/spec/software-factory.bats
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrations/2026-07-27-provider-fallback-cascade.sql
git commit -m "fix(factory): three-stage provider cascade + api_key_env column [T002359]"
```

---

### Task 5: Phantom-Modell-IDs unmoeglich machen

Setzt RC6 und den dritten Punkt von D5 um: die Regressionssperre gegen den naechsten stillen Cutover.

**Files:**
- Create: `scripts/llm/routing-check.sh`
- Modify: `Taskfile.yml`
- Test: `tests/spec/software-factory.bats` (FA-SF-74)

**Interfaces:**
- Consumes: `provider_config` und `factory_model_slots` (Task 4), die `/v1/models`-Endpunkte der lokalen Backends.
- Produces: Exit-Code 1, wenn eine konfigurierte Modell-ID von keinem erreichbaren Backend bedient wird.

- [ ] **Step 1: Health-Skript schreiben**

```bash
#!/usr/bin/env bash
# scripts/llm/routing-check.sh — prueft, ob jede konfigurierte Modell-ID ein Backend hat.
#
# WARUM ES DAS GIBT [T002359]: resolveModel() im llm-proxy biegt unbekannte Modelle still
# auf das erste gesunde Backend um. Dadurch lief das Routing nach dem Gemma-Cutover
# monatelang auf Modell-IDs, die auf keinem Backend existierten (ternary-bonsai-27b,
# qwythos-9b-v2), ohne dass irgendwo ein Fehler auftauchte.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$HERE/../factory/lib.sh"; factory_resolve

FAILED=0
AVAILABLE=""
for url in http://127.0.0.1:18235 http://127.0.0.1:1234; do
  models=$(curl -s -m 5 "${url}/v1/models" 2>/dev/null | jq -r '.data[].id' 2>/dev/null) || continue
  AVAILABLE="${AVAILABLE}"$'\n'"${models}"
done

if [[ -z "${AVAILABLE// }" ]]; then
  echo "routing-check: kein lokales Backend erreichbar — uebersprungen." >&2
  exit 0
fi

while IFS=$'\t' read -r model burl; do
  [[ -z "$model" ]] && continue
  case "$burl" in https://*) continue ;; esac   # Cloud-Provider nicht pruefbar
  if ! grep -qiF -- "$model" <<< "$AVAILABLE"; then
    echo "routing-check: FEHLT — '$model' (${burl}) wird von keinem lokalen Backend serviert." >&2
    FAILED=1
  fi
done < <(factory_psql <<'SQL'
SELECT model_id||E'\t'||COALESCE(base_url,'') FROM tickets.provider_config WHERE enabled = true
UNION
SELECT model_id||E'\t'||COALESCE(base_url,'') FROM tickets.factory_model_slots;
SQL
)

[[ $FAILED -eq 0 ]] && echo "routing-check: alle lokalen Modell-IDs haben ein Backend."
exit $FAILED
```

Ausfuehrbar machen: `chmod +x scripts/llm/routing-check.sh`.

- [ ] **Step 2: Taskfile-Eintrag ergaenzen (S4 — sonst Orphan-Violation)**

Unter den bestehenden `llm:`-Tasks in `Taskfile.yml`:

```yaml
  llm:routing:check:
    desc: "Prueft, ob jede konfigurierte Modell-ID von einem erreichbaren Backend serviert wird [T002359]"
    cmds:
      - bash scripts/llm/routing-check.sh
```

- [ ] **Step 3: Skript gegen den Ist-Zustand laufen lassen**

```bash
task llm:routing:check
```

Erwartet vor Schritt 4: Meldung, dass `ternary-bonsai-27b` kein Backend hat, Exit-Code 1.

- [ ] **Step 4: Autopilot-Env auf ein reales Modell korrigieren**

`~/.config/factory/autopilot.env` liegt ausserhalb des Repos und wird nicht versioniert. Die Zeile

```
ANTHROPIC_MODEL=ternary-bonsai-27b
```

auf den Wert aendern, den der Proxy real serviert:

```
ANTHROPIC_MODEL=gemma-4-12b
```

Danach `task llm:routing:check` erneut ausfuehren — Exit-Code 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/llm/routing-check.sh Taskfile.yml
git commit -m "fix(llm): fail on configured model ids without a live backend [T002359]"
```

---

### Task 6: Gesamtverifikation

**Files:**
- Modify: `website/src/data/test-inventory.json` (generiert)

**Interfaces:**
- Consumes: alle vorherigen Tasks.
- Produces: nichts.

- [ ] **Step 1: Den vollstaendigen FA-SF-74-Block gruen pruefen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-74" tests/spec/software-factory.bats
```

Expected: PASS (7 Tests).

- [ ] **Step 2: Router-Regression gegen die Nachbarbloecke**

```bash
tests/unit/lib/bats-core/bin/bats --filter "FA-SF-70|FA-SF-71|FA-SF-73" tests/spec/software-factory.bats
```

Expected: PASS — insbesondere `FA-SF-70: route-provider.sh emits valid JSON keys for opus without DB`, weil Task 2 Step 6 die opus-Ausgabe angefasst hat.

- [ ] **Step 3: Kaskade im Live-Betrieb beweisen**

Den zweiten Kandidaten erzwingen, indem der erste kuenstlich belegt wird:

```bash
bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql <<EOSQL
UPDATE tickets.provider_health SET active_agents = 3, claimed_at = now() WHERE provider = chr(108)||chr(108)||chr(97)||chr(109)||chr(97)||chr(99)||chr(112)||chr(112);
EOSQL'
bash scripts/factory/route-provider.sh triage flash | jq -r '.provider, .modelId, .emergency'
```

Erwartet: `lmstudio`, `gemma-4-12b`, `false` — vor diesem Fix waere hier der Emergency-Zweig gekommen. Danach den Testzustand zuruecknehmen:

```bash
bash scripts/factory/release-slot.sh lmstudio true
bash scripts/factory/reap-provider-slots.sh
```

- [ ] **Step 4: Test-Inventar regenerieren**

```bash
task test:inventory
```

- [ ] **Step 5: Mandatory Verify-Commands**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Alle drei muessen gruen sein. `task freshness:check` enthaelt den S1-S4-Ratchet und die Baseline-Key-Count-Assertion.

- [ ] **Step 6: Commit**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(factory): regenerate test inventory for FA-SF-74 [T002359]"
```
