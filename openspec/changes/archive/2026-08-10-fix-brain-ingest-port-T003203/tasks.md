---
title: "fix-brain-ingest-port-T003203 — Implementation Plan"
ticket_id: T003203
domains: [bachelorprojekt-ops, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-brain-ingest-port-T003203 — Implementation Plan

_Ticket: T003203_

**Goal:** `scripts/brain-ingest.sh` schickt seine Chat-Completions nicht länger an den
bge-Reranker, sondern an das dafür vorgesehene Loadout — und ein Guard verhindert, dass sich
die Portkollision wiederholt.

**Architecture:** Das Loadout `brain-ingest` zieht von Port 8093 auf 8100 um. 8093 bleibt beim
kubectl-Port-Forward `llm-gateway-rerank`, der produktiv läuft und an `bge-mcp` hängt. Drei
Deklarationen des Ports (Loadout, Skript-Default, Proxy-Backend-Migration) werden gleichzeitig
gezogen; ein BATS-Guard sichert danach beide Invarianten ab.

**Tech Stack:** Bash, BATS (vendored), `jq`, PostgreSQL-Migration im Muster von
`scripts/migrations/2026-08-04-llm-proxy-gemma-qwen-families.sql`.

## Global Constraints

- Zielport ist **8100**. Nicht 8097 — dort registriert `scripts/factory/provider-register-gptoss.sh:31`
  einen Provider (`BASE_URL="http://127.0.0.1:8097/v1"`). Der Block 8089–8099 ist bis auf 8097
  vollständig durch Loadouts belegt.
- `llamacpp-bonsai` bleibt **`enabled = false`**. Nur die `base_url` wird gezogen. Grund: der
  llm-proxy meldet bereits dauerhaft `ready: false` (T003202); ein weiteres dauer-degradiertes
  `priority=1`-Backend würde das Signal zusätzlich verwässern.
- Der Guard prüft **Repo-Artefakte**, niemals Laufzeitzustand oder Datenbank. CI hat weder
  laufende Port-Forwards noch eine DB; ein solcher Test würde dort skippen und die Ausstattung
  des Runners messen statt den Zustand des Codes (T002716).
- Nur **lokale** Portansprüche zählen (`127.0.0.1`, `localhost`). `scripts/llm-host-setup.sh`
  nennt 8093 viermal, meint aber `${LLM_HOST_IP:-192.168.100.10}:8093` — den Windows-Host über
  `wg-mesh`. Diese Datei wird **nicht** angefasst.
- Kein Guard der Form „jeder Port genau einmal". Loadouts derselben `exclusiveGroup` dürfen
  Ports teilen; die Begründung steht in `tests/spec/local-llm-proxy/qwen3-coder-loadout.bats`.
- Nach jeder Änderung an `scripts/llm/loadouts.json` läuft `task llm:loadouts:format` — die
  Datei hat eine kanonische Form, die `task llm:loadouts:check` fail-closed erzwingt.

## File Structure

```
scripts/llm/loadouts.json                              (geändert — brain-ingest.port 8093 → 8100)
scripts/brain-ingest.sh                                (geändert — Zeile 43, Default-URL)
scripts/migrations/2026-08-10-brain-ingest-port.sql    (neu — llamacpp-bonsai.base_url)
tests/spec/local-llm-proxy/brain-ingest-port.bats      (neu — zwei Invarianten)
```

### S1-Zeilenbudget

| Datei | Endung | Limit | Ist | Baseline | Budget |
|---|---|---|---|---|---|
| `scripts/brain-ingest.sh` | `.sh` | 800 | 545 | nicht-baselined | **255 Zeilen** |
| `scripts/llm/loadouts.json` | `.json` | kein Limit | 429 | nicht-baselined | — |
| `scripts/migrations/*.sql` | `.sql` | kein Limit | neu | — | — |
| `tests/spec/**/*.bats` | `.bats` | kein Limit | neu | — | — |

`s1.limits` in `docs/code-quality/gates.yaml` führt `.astro .ts .svelte .sh .mjs .mts .py .js
.jsx .tsx .cjs .bash .java .php`. Von den vier Dateien ist nur `brain-ingest.sh` erfasst, und
dort ändert sich **eine** Zeile. Kein Split einzuplanen.

## Kontext für den Implementierer

Der Defekt ist reproduzierbar. Vor der Arbeit einmal selbst ansehen — es macht die Rotphase
verständlich:

```bash
curl -s -X POST http://127.0.0.1:8093/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"x","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
# → {"error":{"code":500,"message":"the current context does not logits computation. skipping"}}
```

Auf 8093 antwortet ein **Reranker**. Der berechnet keine Logits, deshalb die Meldung. Wer
`brain-ingest.sh` ohne gesetztes `LM_STUDIO_URL` aufruft, landet genau dort.

Bemerkenswert: `scripts/brain-ingest-transform.sh` hat seinen Default zu genau diesem Zweck
bereits entfernt (T002533 — `LM_STUDIO_URL` und `LM_MODEL` sind dort Pflicht, weil das Skript
sonst „92-mal einzeln 'LLM failed'" meldete). `brain-ingest.sh:43` trägt den Default noch. Der
Fix zieht die beiden Skripte wieder zusammen.

Die Portlage, gemessen am 2026-08-10:

```
loadouts.json   8089 8090 8091 8092 [8093] 8094 8095 8096 ____ 8098 8099   45013
Forwards        8081                 [8093]
                                      ↑ Kollision        8097 belegt (factory)
```

Zwei `ExecStart`-Zeilen definieren die Forwards, beide in `scripts/bge-mcp/`:

```
bge-forward-rerank.service:21   … port-forward … svc/llm-gateway-rerank 8093:8081
bge-forward-embed.service:26    … port-forward … svc/llm-gateway-embed  8081:8081
```

Der Anker `^ExecStart` ist für den Guard wesentlich: Beide Dateien nennen 8093 **auch** in
Kommentaren (`bge-forward-rerank.service:2,4`, `bge-mcp.service:29`), und
`scripts/factory/provider-register-local.sh:7-8` sowie `scripts/llm-proxy/fixups.mjs:3` halten
den Port in Historien-Kommentaren fest. Würden Kommentare mitzählen, produzierte der Guard
Fehlalarme. `^ExecStart` schließt sie ohne Zusatzlogik aus.

---

## Task 1: Guard schreiben (RED)

**Files:**
- Create: `tests/spec/local-llm-proxy/brain-ingest-port.bats`

**Interfaces:**
- Consumes: `scripts/llm/loadouts.json` (Feld `.loadouts[].port`, `.loadouts[].slug`),
  `scripts/bge-mcp/*.service` (`^ExecStart`-Zeilen mit `port-forward <lokal>:<remote>`)
- Produces: nichts für Folgetasks — der Guard ist Endverbraucher. Task 2 und 3 machen ihn grün.

- [ ] **Step 1: Den Guard schreiben**

Lege `tests/spec/local-llm-proxy/brain-ingest-port.bats` mit exakt diesem Inhalt an:

```bash
#!/usr/bin/env bats
# T003203 — brain-ingest darf keinen Port beanspruchen, auf dem ein Port-Forward lauscht,
# und muss denselben Port in allen drei Deklarationen nennen.
#
# PRUEFMODUS: Querschnitts-Konsistenz zwischen Deklarationen (die in CLAUDE.md benannte
# Ausnahme zu T002448-M4). Die Invariante existiert nicht im Laufzeitverhalten einer
# Komponente, sondern in der Beziehung mehrerer Quellen: loadouts.json sagt, worauf
# llama-server lauscht; die .service-Dateien sagen, welche lokalen Ports kubectl belegt;
# brain-ingest.sh sagt, wohin es sendet. Laufen sie auseinander, spricht der Ingest mit
# dem falschen Dienst — und zwar ohne Fehler an der Stelle, an der man sucht.
#
# KEINE LAUFZEITPRUEFUNG: Es waere naheliegend, die echte Portbelegung per `ss` zu lesen.
# In CI laeuft aber kein kubectl-Forward; der Test wuerde dort skippen und damit die
# Ausstattung des Runners messen statt den Zustand des Codes (T002716).
#
# KEINE EINDEUTIGKEITS-PRUEFUNG AUF LOADOUT-PORTS: Loadouts derselben exclusiveGroup
# duerfen sich einen Port teilen, weil sie nie gleichzeitig laufen. Die Begruendung steht
# in tests/spec/local-llm-proxy/qwen3-coder-loadout.bats. Geprueft wird ausschliesslich
# Loadout GEGEN Port-Forward — die koennen nie koexistieren, weil der Forward permanent
# laeuft.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
  INGEST_SH="${REPO_ROOT}/scripts/brain-ingest.sh"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-10-brain-ingest-port.sql"
  SERVICE_DIR="${REPO_ROOT}/scripts/bge-mcp"
  SLUG="brain-ingest"
  BACKEND="llamacpp-bonsai"
}

# Lokale Seite jedes port-forward aus den Unit-Dateien.
# Der Anker ^ExecStart schliesst Kommentarzeilen aus, die denselben Port nennen.
#
# Kein `tr -d '[:space:]'` zum Trimmen: das loescht auch die Zeilenumbrueche und
# verschmilzt "8081\n8093" zu "80818093" — die Extraktion liefert dann genau eine
# unbrauchbare Zeile statt zwei Ports. Aufgefallen ist das nur, weil der Anker-Test
# unten den bekannten Port 8081 verlangt; die Disjunktheitspruefung selbst war dabei
# gruen, obwohl 8093 doppelt belegt war (leere Menge schneidet sich mit allem zu nichts).
forward_ports() {
  grep -h '^ExecStart.*port-forward' "${SERVICE_DIR}"/*.service 2>/dev/null \
    | grep -oE '[0-9]{4,5}:[0-9]{4,5}' \
    | cut -d: -f1 | sort -u
}

@test "T003203: Extraktion liefert ueberhaupt Ports (Anker fuer beide Invarianten)" {
  [ -f "$LOADOUTS" ]

  # POSITIV-ANKER (T002356-M1): Ohne diesen Test bestuenden beide Negativ-Aussagen unten
  # vakuos, sobald ein grep ins Leere laeuft — eine leere Menge schneidet sich mit allem
  # zu nichts. Vergleiche openspec/specs/divergence-guard.md:141.
  run bash -c "jq -r '.loadouts[].port' '$LOADOUTS' | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  fp="$(forward_ports)"
  [ -n "$fp" ]

  # Der Embed-Forward ist stabil auf 8081 und dient als bekannte Probe: findet die
  # Extraktion ihn nicht, ist das Muster kaputt und nicht die Konfiguration.
  echo "$fp" | grep -qx '8081'
}

@test "T003203: kein Loadout-Port ist zugleich lokale Seite eines Port-Forwards" {
  loadout_ports="$(jq -r '.loadouts[].port' "$LOADOUTS" | sort -u)"
  [ -n "$loadout_ports" ]

  overlap="$(comm -12 <(echo "$loadout_ports") <(forward_ports))"

  # Eigentliche Aussage. Bei Verletzung nennt die Meldung den Port, statt nur zu scheitern.
  [ -z "$overlap" ] || {
    echo "Port(s) doppelt beansprucht — Loadout UND Port-Forward: $overlap" >&2
    echo "Betroffene Loadouts:" >&2
    for p in $overlap; do
      jq -r --argjson p "$p" '.loadouts[] | select(.port == $p) | "  \(.slug) → \(.port)"' "$LOADOUTS" >&2
    done
    false
  }
}

@test "T003203: brain-ingest nennt denselben Port in Loadout, Skript und Migration" {
  [ -f "$INGEST_SH" ]
  [ -f "$MIGRATION" ]

  loadout_port="$(jq -r --arg s "$SLUG" '.loadouts[] | select(.slug == $s) | .port' "$LOADOUTS")"
  [[ "$loadout_port" =~ ^[0-9]+$ ]]

  # POSITIV-ANKER je Quelle, bevor verglichen wird: zwei leere Zeichenketten sind gleich,
  # der Vergleich waere also auch dann gruen, wenn eine Deklaration ganz fehlte.
  script_port="$(grep -E '^LM_URL=' "$INGEST_SH" \
    | grep -oE '(127\.0\.0\.1|localhost):[0-9]+' | grep -oE '[0-9]+$' | head -1)"
  [ -n "$script_port" ]

  migration_port="$(grep -F "'${BACKEND}'" "$MIGRATION" \
    | grep -oE 'http://127\.0\.0\.1:[0-9]+' | grep -oE '[0-9]+$' | head -1)"
  [ -n "$migration_port" ]

  [ "$loadout_port" = "$script_port" ]
  [ "$loadout_port" = "$migration_port" ]
}

@test "T003203: die Migration laesst llamacpp-bonsai deaktiviert" {
  [ -f "$MIGRATION" ]

  # Positiv-Anker: die Backend-Zeile muss ueberhaupt existieren.
  run grep -cF "'${BACKEND}'" "$MIGRATION"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # T003202: solange der Readiness-Widerspruch offen ist, darf kein weiteres
  # priority=1-Backend dauerhaft degraded gemeldet werden.
  run bash -c "grep -F \"'${BACKEND}'\" '$MIGRATION' | grep -c 'true'"
  [ "$output" -eq 0 ]
}
```

- [ ] **Step 2: Rotlauf bestätigen**

Der Guard muss auf dem aktuellen Branch fehlschlagen. Zwei Tests fallen rot: die
Disjunktheit (8093 steht in beiden Quellen) und die Konsistenz (die Migrationsdatei existiert
noch nicht).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/brain-ingest-port.bats
# expected: FAIL — "Port(s) doppelt beansprucht ... 8093" und fehlende Migrationsdatei
```

Der Anker-Test (erster `@test`) muss dabei **grün** sein. Ist er rot, ist das Extraktionsmuster
defekt und nicht die Konfiguration — dann zuerst das reparieren.

- [ ] **Step 3: Registrierung im Runner prüfen**

`tests/spec/local-llm-proxy/proxy-tests-registered.bats` verlangt, dass neue Testdateien in
einem Runner geführt werden. T002657 fiel genau hier: eine lokal grüne Suite, deren Guard erst
in CI rot wurde.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy/
```

Meldet dieser Lauf die neue Datei als nicht registriert, trage sie an der Stelle nach, die die
Fehlermeldung nennt, und wiederhole den Lauf.

- [ ] **Step 4: Commit**

```bash
git add tests/spec/local-llm-proxy/brain-ingest-port.bats
git commit -m "test(ops): Guard fuer brain-ingest-Port — Disjunktheit und Konsistenz [T003203]"
```

---

## Task 2: Port umhängen (GREEN)

**Files:**
- Modify: `scripts/llm/loadouts.json` (Eintrag `brain-ingest`, Feld `port`)
- Modify: `scripts/brain-ingest.sh:43`
- Create: `scripts/migrations/2026-08-10-brain-ingest-port.sql`

**Interfaces:**
- Consumes: den Guard aus Task 1 als Abnahmekriterium.
- Produces: Port **8100** als die eine Zahl, die alle drei Deklarationen nennen.

- [ ] **Step 1: Loadout umhängen**

In `scripts/llm/loadouts.json` beim Eintrag mit `"slug": "brain-ingest"` das Feld `"port"` von
`8093` auf `8100` setzen. Alle übrigen Felder bleiben unverändert — insbesondere
`parallel: 4`, `reasoning: "auto"` und `exclusiveGroup: "chat-gpu"`. Die Modellwahl ist
Gegenstand von T003204 und wird hier **nicht** angefasst.

Die `notes` bekommen den Grund des Umzugs angehängt, damit der nächste Leser die Zahl nicht für
beliebig hält:

```
Serverseite fuer scripts/brain-ingest.sh (T002679). parallel=4, gpt-oss-20b UD-Q4_K_XL. 32.768 ctx je Slot. Port 8100 seit T003203: 8093 belegt der kubectl-Forward auf llm-gateway-rerank (scripts/bge-mcp/bge-forward-rerank.service), 8097 ein Factory-Provider (scripts/factory/provider-register-gptoss.sh).
```

- [ ] **Step 2: Kanonische Form herstellen**

```bash
task llm:loadouts:format
task llm:loadouts:check
```

Der zweite Befehl ist fail-closed und muss mit Status 0 durchlaufen.

- [ ] **Step 3: Skript-Default ziehen**

In `scripts/brain-ingest.sh` Zeile 43:

```bash
LM_URL="${LM_STUDIO_URL:-http://localhost:8100}"
```

Sonst nichts an der Datei ändern.

- [ ] **Step 4: Migration anlegen**

Lege `scripts/migrations/2026-08-10-brain-ingest-port.sql` an:

```sql
-- 2026-08-10-brain-ingest-port.sql
-- Zieht die base_url des Backends llamacpp-bonsai von Port 8093 auf 8100.
--
-- Hintergrund: 8093 wurde von zwei Subsystemen beansprucht. Historisch war es der
-- "Bonsai"-llama-server auf dem Windows-GPU-Host; seit T002551 legt
-- scripts/bge-mcp/bge-forward-rerank.service dort den kubectl-Forward auf
-- svc/llm-gateway-rerank. Folge: scripts/brain-ingest.sh schickte Chat-Completions an
-- einen Reranker und bekam HTTP 500 "the current context does not logits computation".
-- Derselbe Fehler traf schon einmal einen Factory-Provider — siehe den Kommentar in
-- scripts/factory/provider-register-local.sh:7-8.
--
-- 8100 und nicht 8097: auf 8097 registriert scripts/factory/provider-register-gptoss.sh
-- einen Provider. Der Block 8089-8099 ist bis auf 8097 durch Loadouts belegt.
--
-- enabled BLEIBT false. Der llm-proxy meldet bereits dauerhaft ready=false, weil sechs
-- priority=1-Backends derselben exclusiveGroup nie gleichzeitig healthy sein koennen
-- (T003202). Ein weiteres dauer-degradiertes Backend wuerde das Signal nur zusaetzlich
-- verwaessern. brain-ingest.sh spricht den Port ohnehin direkt an und braucht den Proxy
-- nicht. Aktivieren ist eine eigene Entscheidung, sobald T003202 geklaert ist.
--
-- Idempotent (ON CONFLICT DO UPDATE). Reversibel: base_url zurueck auf 8093 setzen.
--
-- Apply (beide Brands — mentolder und korczewski haben getrennte Datenbanken):
--   BRAND=mentolder   bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-brain-ingest-port.sql'
--   BRAND=korczewski  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-08-10-brain-ingest-port.sql'
BEGIN;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases)
VALUES
  ('llamacpp-bonsai', 'llamacpp', 'http://127.0.0.1:8100/v1', NULL, false, 1, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (name) DO UPDATE
  SET kind        = EXCLUDED.kind,
      base_url    = EXCLUDED.base_url,
      api_key_env = EXCLUDED.api_key_env,
      enabled     = EXCLUDED.enabled,
      priority    = EXCLUDED.priority,
      fixups      = EXCLUDED.fixups,
      updated_at  = now();

COMMIT;
```

- [ ] **Step 5: Grünlauf bestätigen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/brain-ingest-port.bats
# expected: PASS — alle vier Tests
```

- [ ] **Step 6: Mutationsprobe**

Ein Guard, der nie rot war, beweist nichts. Setze den Port in `loadouts.json` versuchsweise
zurück auf `8093`, lasse den Test laufen, und stelle 8100 danach wieder her:

```bash
# temporär 8093 eintragen, dann:
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/brain-ingest-port.bats
# erwartet: Test 2 und 3 rot, Test 1 (Anker) gruen
# danach 8100 wiederherstellen und task llm:loadouts:format ausfuehren
```

- [ ] **Step 7: Commit**

```bash
git add scripts/llm/loadouts.json scripts/brain-ingest.sh scripts/migrations/2026-08-10-brain-ingest-port.sql
git commit -m "fix(ops): brain-ingest von Port 8093 auf 8100 — 8093 belegt der bge-Rerank-Forward [T003203]"
```

---

## Task 3: Delta-Spec und Abschluss

**Files:**
- Modify: `openspec/changes/fix-brain-ingest-port-T003203/specs/local-llm-proxy.md`

**Interfaces:**
- Consumes: das Verhalten aus Task 1 und 2.
- Produces: das Requirement, das nach dem Archivieren in den SSOT-Spec einfließt.

- [ ] **Step 1: Delta-Spec füllen**

Trage in `openspec/changes/fix-brain-ingest-port-T003203/specs/local-llm-proxy.md` ein
`ADDED`-Requirement ein:

```markdown
### Requirement: Loadout-Ports und lokale Port-Forwards sind disjunkt

Kein in `scripts/llm/loadouts.json` deklarierter Port SHALL zugleich die lokale Seite eines
`port-forward` aus `scripts/bge-mcp/*.service` sein. Loadouts untereinander duerfen Ports
teilen, solange sie dieselbe `exclusiveGroup` tragen — ein Loadout und ein Port-Forward
koennen dagegen nie koexistieren, weil der Forward permanent laeuft.

Die Pruefung SHALL ausschliesslich Repo-Artefakte lesen und niemals die Laufzeitbelegung,
damit sie in CI den Zustand des Codes misst statt der Ausstattung des Runners. Sie SHALL
zuerst belegen, dass beide Extraktionen nicht leer sind, damit eine ins Leere laufende
Extraktion laut scheitert statt vakuos zu bestehen.

Das Loadout `brain-ingest`, der Default in `scripts/brain-ingest.sh` und die base_url des
Backends `llamacpp-bonsai` SHALL denselben Port nennen.

#### Scenario: Ein Loadout beansprucht einen Forward-Port

- **GIVEN** ein Loadout in `loadouts.json` nennt Port 8093
- **AND** `bge-forward-rerank.service` legt einen `port-forward` auf dieselbe lokale Portnummer
- **WHEN** die Testsuite laeuft
- **THEN** schlaegt die Pruefung fehl und nennt den betroffenen Port samt Loadout-Slug

#### Scenario: brain-ingest nennt ueberall denselben Port

- **GIVEN** `loadouts.json`, `brain-ingest.sh` und die Backend-Migration nennen alle Port 8100
- **WHEN** die Testsuite laeuft
- **THEN** besteht die Pruefung

#### Scenario: Eine Deklaration laeuft weg

- **GIVEN** der Loadout-Port wird geaendert, der Default in `brain-ingest.sh` aber nicht
- **WHEN** die Testsuite laeuft
- **THEN** schlaegt die Pruefung fehl
```

- [ ] **Step 2: OpenSpec validieren**

```bash
task openspec:validate
```

- [ ] **Step 3: Commit**

```bash
git add openspec/changes/fix-brain-ingest-port-T003203/specs/local-llm-proxy.md
git commit -m "docs(plans): Delta-Spec fuer Loadout-Port-Disjunktheit [T003203]"
```

---

## Task 4: Final Verification

**Files:** keine — reiner Prüftask.

- [ ] **Step 1: Die drei verbindlichen Gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Alle drei müssen mit Status 0 durchlaufen. `freshness:regenerate` kann generierte Dateien
verändern; entstehen dabei Änderungen, gehören sie in einen eigenen Commit.

- [ ] **Step 2: Beide Testformen erfassen**

Die BATS-Konvention erlaubt Sammeldatei **und** Verzeichnis. Eine Suche nur nach
`tests/spec/local-llm-proxy.bats` fände die Hälfte:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
```

- [ ] **Step 3: Manuelle Gegenprobe des Ausgangsdefekts**

Diese Prüfung braucht ein laufendes Loadout und gehört deshalb **nicht** in die Testsuite. Sie
belegt, dass der Fix das ursprüngliche Symptom beseitigt:

```bash
# 8093 antwortet weiterhin als Reranker — das ist jetzt korrekt und erwuenscht:
curl -s -X POST http://127.0.0.1:8093/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"x","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
# erwartet: weiterhin HTTP 500 "does not logits computation" — dort steht der Reranker

# brain-ingest.sh zeigt nun auf 8100:
grep -n '^LM_URL=' scripts/brain-ingest.sh
# erwartet: LM_URL="${LM_STUDIO_URL:-http://localhost:8100}"
```

Ein Volllauf des Ingest gegen ein gestartetes `brain-ingest`-Loadout ist **nicht** Teil dieses
Vorgangs: das Loadout liegt in `exclusiveGroup: "chat-gpu"` und würde den laufenden
`gptoss-context` verdrängen. Diese Messung gehört zu T003204.
