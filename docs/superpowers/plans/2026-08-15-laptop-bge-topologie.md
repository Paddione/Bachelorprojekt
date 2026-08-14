---
title: Laptop-bge-Topologie (S1) Implementation Plan
ticket_id: T006143
domains: [infra, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Laptop-bge-Topologie (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bge-Rerank wird Erstglied auf dem PK-Tablet (llama-server, Vulkan, via WireGuard), bge-Embedding Erstglied auf PK-L-1 (LM Studio/LM Link) — der Cluster bleibt Zweitglied, der Desktop-CPU-Loadout letzte Instanz.

**Architecture:** Reine Konfigurations- und Betriebsänderung an den bestehenden Rollenketten des llm-proxy (`scripts/llm/loadouts.json` → `roles`), zwei neuen WireGuard-Mesh-Nodes, einem Windows-Scheduled-Task für `llama-server` auf dem Tablet und LM-Studio-Einstellungen. Kein Code-Change an `scripts/llm-proxy/bge-routes.mjs` — Failover-Semantik und Vertrag bleiben unangetastet.

**Tech Stack:** llama.cpp (llama-server, Vulkan, `--reranking`), LM Studio 0.4.21 (LM Link), WireGuard, systemd/WSL (bestehende Forwards), BATS (vendored), PowerShell 5.1 (Windows-Dienst, ASCII-only).

**Spec:** [docs/superpowers/specs/2026-08-15-laptop-bge-topologie-design.md](../specs/2026-08-15-laptop-bge-topologie-design.md) — Ticket T006143, Branch `feature/laptop-bge-topologie-T006143`.

## Global Constraints

- Kein Code-Change an `scripts/llm-proxy/bge-routes.mjs`, `scripts/llm-proxy/loadouts.mjs` oder `scripts/llm-proxy/runner.mjs` (E1). URL-Kettenglieder werden vom Proxy NICHT gestartet — sie müssen laufen (nur `loadout:`-Glieder starten on-demand).
- Ketten-Semantik (unverändert): 2xx → fertig; 4xx → durchreichen ohne Failover; 5xx/timeout/unreachable → nächstes Glied; Kette erschöpft → 503 mit Grund je Glied.
- Cluster: `k3d/llm-gpu.yaml` und die Forward-Units `bge-forward-embed.service`/`bge-forward-rerank.service` bleiben unverändert (E2).
- WG: `pk-l-1` = `192.168.100.11`, `pk-tablet` = `192.168.100.12`; Public Keys in die Registry (nicht sensitiv), Private Keys NUR plaintext in `environments/.secrets/mentolder.yaml` (git-crypt) und danach via `task env:seal ENV=mentolder` in die Sealed Secrets.
- PS1-Dateien: rein ASCII, kein BOM, keine typografischen Zeichen (T002495-M7).
- BATS: vendored Runner `tests/unit/lib/bats-core/bin/bats`; neue `@test`-Blöcke in eigene Dateien (T002416); Prüfmodus im Kopfkommentar dokumentieren (T002448-M4); Negativ-Aussagen brauchen Positiv-Anker im selben Test (T002356-M1); `grep -F` ohne Zeilenanker bei PS1-Dateien (CRLF, T002338-M2).
- Git: Conventional Commits mit `[T006143]`; explizite Pathspecs, NIEMALS `git add -A` (git-crypt); Branch bleibt `feature/laptop-bge-topologie-T006143`.
- `bge-m3` darf in `/v1/models` des Proxys nicht auftauchen (T003203 — bleibt durch die Rollenrouten gewährleistet).
- Task-Kommandos nicht hartkodieren, sondern über den Oracle auflösen: `bash scripts/vda.sh oracle '<goal>'`.

---

### Task 1: Rollenketten-Umbau in loadouts.json + Reihenfolge-Guard

**Files:**
- Modify: `scripts/llm/loadouts.json` (nur der `roles`-Block)
- Test: `tests/spec/local-llm-proxy/bge-chain-order.bats` (neu)

**Interfaces:**
- Consumes: `loadRoles(doc)` aus `scripts/llm-proxy/bge-routes.mjs` (existiert, unverändert) — liefert `Map<role, Array<{kind:'url'|'loadout', baseUrl?, slug?}>>`
- Produces: Ketten-Reihenfolge, auf die sich Task 6 (End-to-End-Smoke) verlässt: embed `[LM Studio :1234, Cluster :8081]`, rerank `[Tablet 192.168.100.12:8080, Cluster :8093, loadout:bge-rerank-cpu]`

- [ ] **Step 1: Schreib den fehlschlagenden Test**

`tests/spec/local-llm-proxy/bge-chain-order.bats` (neu):

```bash
#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-chain-order.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T006143
#
# PRUEFMODUS (T002448-M4): ERGEBNIS-basiert — der Test importiert die ECHTE
# Parser-Funktion loadRoles() aus bge-routes.mjs und prueft, welche Ketten
# sie aus der echten loadouts.json liest. Kein Source-Grep: waere der
# roles-Block syntaktisch kaputt, wuerfe loadRoles beim Start — genau das
# ist die Semantik, die hier gemessen wird.
#
# ZUSICHERUNG: die Reihenfolge der Kettenglieder ist die Topologie-
# Entscheidung E2/E3 des Design-Docs 2026-08-15-laptop-bge-topologie-design.md:
# Laptop/Tablet zuerst (GPU), Cluster zweit (always-on), Desktop-CPU-Loadout
# zuletzt (on-demand).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

@test "T006143: embed-Kette fuehrt LM Studio vor Cluster" {
  run node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    import { loadRoles } from '${REPO_ROOT}/scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    const embed = loadRoles(doc).get('embed');
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(embed.length === 2, 'embed chain must have exactly 2 entries');
    assert(embed[0].kind === 'url' && embed[0].baseUrl === 'http://127.0.0.1:1234', 'embed[0] must be LM Studio :1234');
    assert(embed[1].kind === 'url' && embed[1].baseUrl === 'http://127.0.0.1:8081', 'embed[1] must be cluster :8081');
    console.log('embed chain OK');
  "
  assert_success
  assert_output --partial "embed chain OK"
}

@test "T006143: Tablet-Rerank-Endpoint live erreichbar (Skip wenn offline)" {
  # ERREICHBARKEITS-GUARD wie in bge-role-routes.bats: Laeuft das Tablet
  # nicht (CI, Gerät schlaeft), wird geskippt statt rot (T002716).
  load helpers/llm-endpoint
  local code
  if ! code=$(llm_endpoint_healthy "http://192.168.100.12:8080/health" 5); then
    skip "PK-Tablet nicht erreichbar (HTTP ${code}) — kein Aussagewert"
  fi
  [ "$code" = "200" ]
}

@test "T006143: rerank-Kette fuehrt Tablet vor Cluster vor Desktop-CPU" {
  run node --input-type=module -e "
    import { readFileSync } from 'node:fs';
    import { loadRoles } from '${REPO_ROOT}/scripts/llm-proxy/bge-routes.mjs';
    const doc = JSON.parse(readFileSync('${REPO_ROOT}/scripts/llm/loadouts.json', 'utf8'));
    const rerank = loadRoles(doc).get('rerank');
    const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
    assert(rerank.length === 3, 'rerank chain must have exactly 3 entries');
    assert(rerank[0].kind === 'url' && rerank[0].baseUrl === 'http://192.168.100.12:8080', 'rerank[0] must be tablet 192.168.100.12:8080');
    assert(rerank[1].kind === 'url' && rerank[1].baseUrl === 'http://127.0.0.1:8093', 'rerank[1] must be cluster :8093');
    assert(rerank[2].kind === 'loadout' && rerank[2].slug === 'bge-rerank-cpu', 'rerank[2] must be loadout bge-rerank-cpu');
    console.log('rerank chain OK');
  "
  assert_success
  assert_output --partial "rerank chain OK"
}
```

- [ ] **Step 2: Test laufen lassen — er muss FEHLSCHLAGEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/bge-chain-order.bats`
Expected: FAIL an den beiden Ketten-Tests — heutige Kette hat Cluster zuerst (`embed[0]` ist `http://127.0.0.1:8081`, nicht `:1234`); Ausgabe nennt `embed[0] must be LM Studio :1234`. Der Tablet-Smoke-Test skippt (Tablet noch nicht eingerichtet).

- [ ] **Step 3: roles-Block in loadouts.json umbauen**

In `scripts/llm/loadouts.json` den bestehenden `roles`-Block (Zeilen 433–446) exakt ersetzen durch:

```json
  "roles": {
    "embed": {
      "chain": [
        "http://127.0.0.1:1234",
        "http://127.0.0.1:8081"
      ]
    },
    "rerank": {
      "chain": [
        "http://192.168.100.12:8080",
        "http://127.0.0.1:8093",
        "loadout:bge-rerank-cpu"
      ]
    }
  }
```

Alles andere im Dokument bleibt unverändert (insbesondere `loadouts[]`, `modelRoots`, `defaults`).

- [ ] **Step 4: Test erneut laufen lassen — muss PASSEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/bge-chain-order.bats`
Expected: PASS an beiden Ketten-Tests; der Tablet-Smoke-Test darf PASSEN oder SKIPPEN (Gerät noch nicht am Mesh).

- [ ] **Step 5: Bestands-Tests der bge-Fläche gegenhalten**

Run: `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*`
Expected: PASS — insbesondere `bge-role-routes.bats` (skip, falls kein Proxy läuft, ist OK), `loadouts-format.bats`, `bge-cpu-parallel-start.bats`, `embed-bge-fallback.bats`.

- [ ] **Step 6: Commit**

```bash
git add scripts/llm/loadouts.json tests/spec/local-llm-proxy/bge-chain-order.bats
git commit -m "feat(llm-proxy): bge-Ketten: Laptop/Tablet vor Cluster als Erstglied [T006143]"
```

---

### Task 2: WireGuard-Mesh-Nodes pk-l-1 und pk-tablet

**Files:**
- Modify: `wireguard/wg-mesh-nodes.yaml` (zwei Nodes unter der mentolder-Sektion, neben `gpu_hosts`)
- Modify: `scripts/hetzner/generate-wg-conf.sh` (Kategorie `laptops` in die Iteration aufnehmen)
- Modify: `environments/schema.yaml` (4 neue Einträge)
- Modify: `environments/.secrets/mentolder.yaml` (4 neue Einträge, git-crypt) + `environments/sealed-secrets/mentolder.yaml` (via `task env:seal`)
- Test: `tests/unit/wg-mesh-laptop-nodes.bats` (neu)

**Interfaces:**
- Consumes: Registry-Struktur aus `wireguard/wg-mesh-nodes.yaml` (mentolder-Sektion, Kategorien `nodes`/`gpu_hosts`/`home_workers`), Schema-Muster `WG_MESH_WSL2_GPU_PRIVATE_KEY` in `environments/schema.yaml:1333+`
- Produces: Nodes `pk-l-1` (`192.168.100.11`) und `pk-tablet` (`192.168.100.12`) mit Schema-Keys `WG_MESH_PKL1_PRIVATE_KEY` / `WG_MESH_PKT_PRIVATE_KEY`; deren Public Keys in der Registry; Conf-Generierung listet die Laptops als Peers. Task 5 (Geräte-Einrichtung) konsumiert die generierten Confs und die Registry-Einträge.

- [ ] **Step 1: Schreib den fehlschlagenden Test**

`tests/unit/wg-mesh-laptop-nodes.bats` (neu — Fallback-Location `tests/unit/`, es gibt keinen WG-Spec in `openspec/specs/`):

```bash
#!/usr/bin/env bats
# tests/unit/wg-mesh-laptop-nodes.bats
# Ticket: T006143
#
# PRUEFMODUS: KONFIGURATIONS-Guard (dokumentierte Ausnahme in T002448-M4) —
# das Ergebnis der Registry manifestiert sich ausschliesslich im Quelltext
# (YAML) und in der Conf-Generierung. Geprueft wird daher die GENERIERTE
# Conf (Ausgabe von generate-wg-conf.sh, wie in wg-mesh-fullmesh.bats) plus
# die Registry-Eintraege. Aufbau: erst Positiv-Anker (Generator laeuft und
# findet die Node), dann die Einzelaussagen (T002356-M1).

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/hetzner/generate-wg-conf.sh"
DUMMY_KEY="0000000000000000000000000000000000000000000="
REGISTRY="${PROJECT_DIR}/wireguard/wg-mesh-nodes.yaml"

LAPTOP1_IP="192.168.100.11"
TABLET_IP="192.168.100.12"

@test "T006143: mentolder-Mesh-Confs listen die Laptops als Peers" {
  # Positiv-Anker zuerst: Generator laeuft fuer einen mentolder-Cluster-Node.
  run bash "$SCRIPT" --env mentolder --node-name gekko-hetzner-3 --private-key "$DUMMY_KEY"
  assert_success
  refute_output --partial "# gekko-hetzner-3"
  # Dann die Aussagen: beide Laptops tauchen als Peers auf.
  assert_output --partial "# pk-l-1"
  assert_output --partial "AllowedIPs = ${LAPTOP1_IP}/32"
  assert_output --partial "# pk-tablet"
  assert_output --partial "AllowedIPs = ${TABLET_IP}/32"
}

@test "T006143: Registry fuehrt pk-l-1 und pk-tablet mit festen wg_ips" {
  # Positiv-Anker: die Registry enthaelt die Node-Namen ueberhaupt.
  grep -q 'name: pk-l-1' "$REGISTRY"
  grep -q 'name: pk-tablet' "$REGISTRY"
  # Einzelaussagen: wg_ip, leerer Endpoint (Home-NAT) und Schema-Key.
  grep -A3 'name: pk-l-1' "$REGISTRY" | grep -q 'wg_ip: "192.168.100.11"'
  grep -A3 'name: pk-l-1' "$REGISTRY" | grep -q 'endpoint: ""'
  grep -A4 'name: pk-l-1' "$REGISTRY" | grep -q 'schema_key: WG_MESH_PKL1'
  grep -A3 'name: pk-tablet' "$REGISTRY" | grep -q 'wg_ip: "192.168.100.12"'
  grep -A3 'name: pk-tablet' "$REGISTRY" | grep -q 'endpoint: ""'
  grep -A4 'name: pk-tablet' "$REGISTRY" | grep -q 'schema_key: WG_MESH_PKT'
}

@test "T006143: Schema kennt die neuen WG_MESH_Variablen" {
  grep -q 'WG_MESH_PKL1_PRIVATE_KEY' "${PROJECT_DIR}/environments/schema.yaml"
  grep -q 'WG_MESH_PKT_PRIVATE_KEY' "${PROJECT_DIR}/environments/schema.yaml"
}

# BEWUSST KEIN Test auf environments/.secrets/*: die Datei ist git-crypt-
# verschluesselt und liegt in CI als Binaerblob vor — ein grep darauf wuerde
# dort rot. Plaintext- und Sealed-Praesenz verifiziert Task 2 Step 7 manuell.
```

- [ ] **Step 2: Tests laufen lassen — sie muessen FEHLSCHLAGEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/unit/wg-mesh-laptop-nodes.bats`
Expected: FAIL — Generator kennt keine `laptops`-Kategorie, Registry kennt die Nodes nicht (der Schema-Test scheitert ebenfalls).

- [ ] **Step 3: Keypaare erzeugen**

```bash
for NAME in PKL1 PKT; do
  PRIV=$(wg genkey)
  PUB=$(echo "$PRIV" | wg pubkey)
  echo "WG_MESH_${NAME}: PRIV=$PRIV PUB=$PUB"
done
```

Ausgabe notieren — sie wird in Step 5 und Step 6 gebraucht.

- [ ] **Step 4: Registry-Einträge in wireguard/wg-mesh-nodes.yaml**

Unter der mentolder-Sektion (nach dem `home_workers`-Block, vor der nächsten Sektion) einfügen — Public Keys aus Step 3:

```yaml
  # Laptops/Tablet (Home-NAT, Intel Iris, LM Studio + llama-server) — T006143
  # bringen bge-Embedding (pk-l-1) und bge-Rerank (pk-tablet) als Erstglieder
  # der llm-proxy-Ketten. Endpoint leer: wie dev-vm initiieren sie outbound.
  laptops:
    - name: pk-l-1
      endpoint: ""        # Home-NAT (FritzBox), PersistentKeepalive — initiates outbound
      wg_ip: "192.168.100.11"
      schema_key: WG_MESH_PKL1
      public_key: "<PUB_AUS_STEP_3>"

    - name: pk-tablet
      endpoint: ""        # Home-NAT (FritzBox), PersistentKeepalive — initiates outbound
      wg_ip: "192.168.100.12"
      schema_key: WG_MESH_PKT
      public_key: "<PUB_AUS_STEP_3>"
```

- [ ] **Step 5: generate-wg-conf.sh um die Kategorie erweitern**

In `scripts/hetzner/generate-wg-conf.sh` die Kategorie-Iteration finden und `laptops` ergänzen:

Run: `grep -n "gpu_hosts" scripts/hetzner/generate-wg-conf.sh`
Expected: eine Zeile mit einem Tuple wie `('nodes','gpu_hosts','home_workers')` — dort `'laptops'` in die Liste aufnehmen. Achtung: das Tuple kann pro Env variieren (T000371); nur die mentolder-Instanz betrifft die Laptops — `laptops` gehört in das Tuple der mentolder-Konfiguration.

Danach erneut: `tests/unit/lib/bats-core/bin/bats tests/unit/wg-mesh-laptop-nodes.bats` → der erste Test muss jetzt PASSEN; die Registry-Tests scheitern weiter, bis Steps 6–8 fertig sind.

- [ ] **Step 6: environments/schema.yaml ergänzen**

An die Stelle der bestehenden `WG_MESH_WSL2_GPU_*`-Einträge (Muster ab `environments/schema.yaml:1333`) nach demselben Format vier Einträge anfügen:

```yaml
  - name: WG_MESH_PKL1_PRIVATE_KEY
    description: Private WireGuard key for pk-l-1 (Laptop, bge-Embedding)
    secret: true
  - name: WG_MESH_PKT_PRIVATE_KEY
    description: Private WireGuard key for pk-tablet (bge-Rerank)
    secret: true
```

Hinweis: Das Format der Nachbar-Einträge ist maßgeblich — falls diese andere Felder tragen, exakt deren Felder spiegeln. Public-Key-Variablen existieren im Schema nur, wo sie auch im Plaintext stehen — beide Spiegel wie bei `WG_MESH_WSL2_GPU_*` behandeln.

- [ ] **Step 7: Plaintext-Secrets ergänzen und sealen**

In `environments/.secrets/mentolder.yaml` nach dem Muster der `WG_MESH_WSL2_GPU_*`-Zeilen (86–87):

```yaml
WG_MESH_PKL1_PRIVATE_KEY: "<PRIV_AUS_STEP_3>"
WG_MESH_PKL1_PUBLIC_KEY: "<PUB_AUS_STEP_3>"
WG_MESH_PKT_PRIVATE_KEY: "<PRIV_AUS_STEP_3>"
WG_MESH_PKT_PUBLIC_KEY: "<PUB_AUS_STEP_3>"
```

Dann:

```bash
task env:validate
task env:seal ENV=mentolder
task env:seal ENV=fleet-mentolder || bash scripts/vda.sh oracle 'seal secrets for fleet-mentolder environment'
```

Erwartung: `env:validate` grün. Achtung git-crypt: die Plaintext-Datei ist verschlüsselt getrackt — NICHT manuell umgehen, `task env:seal` liest sie plaintext aus dem Checkout.

Manuelle Präsenz-Verifikation (nur lokal möglich, nicht CI — git-crypt):

```bash
grep -c 'WG_MESH_PKL1_PRIVATE_KEY\|WG_MESH_PKT_PRIVATE_KEY' environments/.secrets/mentolder.yaml
grep -c 'WG_MESH_PKL1_PRIVATE_KEY\|WG_MESH_PKT_PRIVATE_KEY' environments/sealed-secrets/mentolder.yaml
grep -c 'WG_MESH_PKL1_PRIVATE_KEY\|WG_MESH_PKT_PRIVATE_KEY' environments/sealed-secrets/fleet-mentolder.yaml
```

Erwartung: `2` in jeder Zeile (je Datei beide Keys).

- [ ] **Step 8: Tests laufen lassen — alle drei müssen PASSEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/unit/wg-mesh-laptop-nodes.bats tests/unit/wg-mesh-fullmesh.bats`
Expected: PASS — insbesondere bleibt `wg-mesh-fullmesh.bats` grün (fleet-Env unberührt: die Peer-Zählung `-eq 6` dort betrifft nur die fleet-Sektion).

- [ ] **Step 9: Commit**

```bash
git add wireguard/wg-mesh-nodes.yaml scripts/hetzner/generate-wg-conf.sh environments/schema.yaml environments/.secrets/mentolder.yaml environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/fleet-mentolder.yaml tests/unit/wg-mesh-laptop-nodes.bats
git commit -m "feat(wireguard): pk-l-1 und pk-tablet als Mesh-Nodes fuer die bge-Ketten [T006143]"
```

---

### Task 3: Tablet-Startskript für llama-server (Rerank) + PS1-Guard

**Files:**
- Create: `scripts/llm/start-tablet-rerank.ps1`
- Test: `tests/unit/llm-ps1-ascii.bats` (neu, sofern kein bestehender PS1-Guard existiert — Check in Step 1)

**Interfaces:**
- Consumes: Muster `scripts/llm/start-gemma-server.ps1` (Header-/Health-Poll-Konvention, T002277)
- Produces: ausführbares Startskript für den Tablet-Dienst (Task 5 nutzt es); Port **8080**, `--reranking`, Modell aus dem LM-Studio-Modelldir

- [ ] **Step 1: Prüfen, ob bereits ein PS1-ASCII-Guard existiert**

Run: `grep -rln --include='*.bats' -e 'ASCII' -e 'BOM' tests/spec tests/unit`
Ergebnis A: Treffer in `tests/spec` oder `tests/unit` → diesen Guard um die neue Datei erweitern statt neu anzulegen; sein Prüfmuster übernehmen (die Steps 2/5 entsprechend anpassen).
Ergebnis B: keine Treffer → weiter mit Step 2 (neuer Guard).

- [ ] **Step 2: Schreib den fehlschlagenden Guard**

`tests/unit/llm-ps1-ascii.bats` (neu):

```bash
#!/usr/bin/env bats
# tests/unit/llm-ps1-ascii.bats
# Ticket: T006143 (Basis: T002495-M7 — PS1-Dateien aus WSL muessen rein ASCII
# ohne BOM sein; PS 5.1 liest UTF-8 ohne BOM sonst als CP1252).
#
# PRUEFMODUS: KONFIGURATIONS-Guard (T002448-M4-Ausnahme) — kodierung und
# Flag-Pflicht manifestieren sich ausschliesslich im Dateiinhalt. grep -F
# OHNE Zeilenanker, weil die PS1-Dateien CRLF tragen (T002338-M2).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  export REPO_ROOT
  PS1_FILE="${REPO_ROOT}/scripts/llm/start-tablet-rerank.ps1"
}

@test "T006143: start-tablet-rerank.ps1 existiert und ist ASCII ohne BOM" {
  # Positiv-Anker (T002356-M1): die Datei existiert und ist nicht leer.
  [ -s "$PS1_FILE" ]
  # Kein BOM: die ersten drei Bytes sind nicht EF BB BF.
  run head -c 3 "$PS1_FILE" | od -An -tx1 | tr -d ' \n'
  [ "$output" != "efbbbf" ]
  # Rein ASCII: LC_ALL=C meldet jeden Nicht-ASCII-Bereich als Zeile.
  run bash -c "LC_ALL=C grep -nP '[^\\x00-\\x7F]' '$PS1_FILE' || true"
  [ -z "$output" ]
}

@test "T006143: start-tablet-rerank.ps1 traegt die Rerank-Flags" {
  grep -qF -- '--reranking' "$PS1_FILE"
  grep -qF -- '-ngl' "$PS1_FILE"
  grep -qF -- '8080' "$PS1_FILE"
  grep -qF -- 'bge-reranker-v2-m3-Q8_0.gguf' "$PS1_FILE"
  grep -qF -- '.lmstudio\models' "$PS1_FILE"
}
```

- [ ] **Step 3: Guard laufen lassen — muss FEHLSCHLAGEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/unit/llm-ps1-ascii.bats`
Expected: FAIL — Datei existiert nicht.

- [ ] **Step 4: start-tablet-rerank.ps1 schreiben**

`scripts/llm/start-tablet-rerank.ps1` (rein ASCII, CRLF, kein BOM):

```powershell
<#
.SYNOPSIS
  Startet llama-server.exe mit bge-reranker-v2-m3 auf dem PK-Tablet (Port 8080).
.DESCRIPTION
  Rerank-Erstglied der llm-proxy-Kette (T006143, Design-Doc
  docs/superpowers/specs/2026-08-15-laptop-bge-topologie-design.md). Das
  Tablet hat eine Intel-Iris-iGPU (8 GB shared) - Beschleunigung laeuft
  ueber Vulkan (Standard-Build von llama.cpp), NICHT ueber LM Studio: LM
  Studio 0.4.21 hat keinen /v1/rerank-Endpoint. Die Modell-Datei wird von
  LM Studio heruntergeladen (Discover > bge-reranker-v2-m3, GGUF Q8_0) und
  von llama-server aus demselben Verzeichnis gelesen - ein Download, zwei
  Nutzer.

  AUFRUF:
    powershell -ExecutionPolicy Bypass -File C:\...\start-tablet-rerank.ps1

  AUTOSTART (Scheduled Task, AtLogOn, einmalig registrieren):
    Register-ScheduledTask -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank' `
      -Action (New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument '-ExecutionPolicy Bypass -File "<PFAD_ZU_DIESEM_SKRIPT>"') `
      -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Force

  DEAKTIVIEREN/AKTIVIEREN (T002729-Muster, elevated):
    Disable-ScheduledTask -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank'
    Enable-ScheduledTask  -TaskPath '\BgeLaptops\' -TaskName 'TabletRerank'

  FIREWALL (nur WG-Interface, einmalig, elevated):
    New-NetFirewallRule -DisplayName 'llama-server TabletRerank (WG only)' `
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 `
      -InterfaceAlias 'wg-mesh' -ErrorAction SilentlyContinue

  WARUM -np 2: Iris-RAM ist geteilter Systemspeicher; jede Parallelitaet
  kostet direkt Budget. Flags gespiegelt von k3d/llm-gpu.yaml (bge-rerank).
#>

param(
  [int]$Port = 8080,
  [string]$ModelPath = "$env:USERPROFILE\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf"
)

$ErrorActionPreference = 'Stop'

$LlamaServer = Get-Command llama-server.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty Source
if (-not $LlamaServer) {
  throw "llama-server.exe nicht gefunden. Installation: winget install llama.cpp"
}

if (-not (Test-Path -LiteralPath $ModelPath)) {
  throw "Modell fehlt: $ModelPath - in LM Studio herunterladen (bge-reranker-v2-m3 GGUF Q8_0)"
}

$args = @(
  '-m', $ModelPath,
  '--host', '0.0.0.0',
  '--port', $Port,
  '--reranking',
  '-ngl', '99',
  '-b', '8192',
  '-ub', '8192',
  '-np', '2'
)

Write-Host "Starte llama-server fuer bge-reranker-v2-m3 auf Port $Port ..."
Start-Process -FilePath $LlamaServer -ArgumentList $args -NoNewWindow -Wait
```

- [ ] **Step 5: Guard laufen lassen — muss PASSEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/unit/llm-ps1-ascii.bats`
Expected: PASS (beide Tests).

- [ ] **Step 6: PowerShell-Syntax pruefen (T002495-M7)**

Run: `powershell.exe -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('C:\\pfad\\zu\\scripts\\llm\\start-tablet-rerank.ps1', [ref]\$null, [ref]\$null).GetErrors() | ForEach-Object Message"` — WSL-Pfad via `wslpath -w` auflösen.
Expected: leere Ausgabe (keine Parser-Fehler).

- [ ] **Step 7: Commit**

```bash
git add scripts/llm/start-tablet-rerank.ps1 tests/unit/llm-ps1-ascii.bats
git commit -m "feat(llm): Tablet-Rerank-Startskript (llama-server, Vulkan) mit PS1-Guard [T006143]"
```

---

### Task 4: LM-Studio-Autoload fuer die neue Gerätelage anpassen

**Files:**
- Modify: `scripts/lm-studio/lmstudio-bge-autoload.sh`

**Interfaces:**
- Consumes: `lms` CLI (`$HOME/.lmstudio/bin/lms`), API auf `:1234`; bge-m3 existiert potenziell auf mehreren LM-Link-Geräten
- Produces: deterministischer bge-m3-Load auf PK-L-1 (oder dokumentierte Geräte-Neutralität), damit das embed-Erstglied der Kette (Task 1) zuverlässig bedient wird

- [ ] **Step 1: Geräte-Flag des lms-CLI prüfen**

Run: `$HOME/.lmstudio/bin/lms load --help`
Befund A: Es gibt ein Device-Flag (z. B. `--device <id>`): weiter mit Step 2a.
Befund B: Kein Device-Flag: weiter mit Step 2b.

- [ ] **Step 2a (Flag vorhanden): Load auf PK-L-1 pinnen**

Geräte-ID ermitteln: `$HOME/.lmstudio/bin/lms ps --json` (bzw. `lms devices`/`lms link`-Liste — das Kommando der CLI-Hilfe folgen) → ID des PK-L-1-Eintrags notieren. Dann in `scripts/lm-studio/lmstudio-bge-autoload.sh` die Load-Zeile (Zeile ~50) ändern von:

```bash
"$LMS" load -y "$MODEL"
```

zu (Flag-Name aus der Hilfe, ID aus dem Listing):

```bash
"$LMS" load -y --device <PK-L-1-GERAETE-ID> "$MODEL"
```

Den Kopfkommentar der Datei ergänzen:

```bash
# T006143: --device pinnt den Load auf PK-L-1 (bge-m3 traegt das Embed-
# ERSTglied der Kette). Ohne Pin koennte lms load das Modell auf einem
# anderen LM-Link-Geraet (PK-Tablet) hochfahren.
```

- [ ] **Step 2b (kein Flag): Geräte-Neutralität dokumentieren**

Den Kopfkommentar der Datei ergänzen:

```bash
# T006143: bge-m3 ist NUR auf PK-L-1 geladen zu halten — auf dem PK-Tablet
# darf das Modell in LM Studio nicht als geladen erscheinen (sonst laedt
# `lms load -y` ohne Device-Pin ggf. dort). Die llm-proxy-Kette behandelt
# LM Studio als EIN logisches Backend (:1234), egal welches LM-Link-Geraet
# das Modell traegt — die Ladung auf PK-L-1 ist per LM-Studio-UI
# sicherzustellen (Modell dort laden, Tablet-Eintrag fuer bge-m3 entfernen).
```

- [ ] **Step 3: Syntax und Bestand pruefen**

Run: `bash -n scripts/lm-studio/lmstudio-bge-autoload.sh`
Run: `grep -rln 'lmstudio-bge-autoload' tests/` → falls ein Guard existiert: `tests/unit/lib/bats-core/bin/bats <guard-datei>`
Expected: `bash -n` stumm (Exit 0); vorhandener Guard grün.

- [ ] **Step 4: Commit**

```bash
git add scripts/lm-studio/lmstudio-bge-autoload.sh
git commit -m "docs(lm-studio): bge-m3-Autoload auf die Laptop-Topologie festlegen [T006143]"
```

---

### Task 5: Geräte-Einrichtung — Runbook schreiben und auf den Geräten ausführen

**Files:**
- Create: `scripts/llm/README-laptop-bge.md`

**Interfaces:**
- Consumes: Tasks 1–4 (Ketten, WG-Registry/-Confs, Startskript, Autoload-Festlegung)
- Produces: betriebsbereite Geräte — WG-Tunnel zu `.11`/`.12`, Tablet-llama-server auf `192.168.100.12:8080`, LM-Studio-Konfiguration auf beiden Geräten. Task 6 (End-to-End-Smoke) verifiziert das Ergebnis.

> Dieser Task ist ein **User-Task**: Die Schritte auf PK-Tablet und PK-L-1 laufen auf den Geräten, nicht im Checkout. Das Runbook wird im Repo versioniert und Schritt für Schritt ausgeführt; die Verifikationen ab Step 7 laufen wieder in WSL.

- [ ] **Step 1: Runbook-Datei anlegen**

`scripts/llm/README-laptop-bge.md` mit folgendem Inhalt:

````markdown
# Laptop-bge-Betrieb (PK-L-1 + PK-Tablet)

Runbook zum Design-Doc `docs/superpowers/specs/2026-08-15-laptop-bge-topologie-design.md` (T006143).

## Rollen

| Gerät | bge-Rolle | Weg | Unterstützermodell |
|---|---|---|---|
| PK-L-1 | Embedding (bge-m3 Q8_0) | LM Studio (Vulkan) via LM Link → WSL :1234 | Qwen3.5-4B Q6_K |
| PK-Tablet | Rerank (bge-reranker-v2-m3 Q8_0) | llama-server.exe (Vulkan) via WG :8080 | Gemma-4-12B UD-IQ3_XXS |

## Einrichtung PK-Tablet

1. WireGuard: `winget install WireGuard.WireGuard`; Config `pk-tablet.conf` aus dem
   Mesh-Generator importieren (in WSL erzeugen:
   `bash scripts/hetzner/generate-wg-conf.sh --env mentolder --node-name pk-tablet --private-key <PRIV>`),
   Tunnel aktivieren.
2. LM Studio installieren, per LM Link anbinden (Einstellungen → LM Link, Code vom Desktop-WSL übernehmen).
3. Hardware-Settings: Vulkan/iGPU **explizit aktivieren** (seit 0.4.17 default-aus).
4. Modelle laden: bge-reranker-v2-m3 (GGUF Q8_0), Gemma-4-12B (UD-IQ3_XXS).
5. llama-server: `winget install llama.cpp`, dann
   `powershell -ExecutionPolicy Bypass -File scripts/llm/start-tablet-rerank.ps1` (Pfad aufs Gerät kopiert).
6. Scheduled Task registrieren (Befehl im Kopf von `start-tablet-rerank.ps1`).
7. Firewall-Regel fürs WG-Interface (Befehl ebenda).

## Einrichtung PK-L-1

1. WireGuard wie oben, Config `pk-l-1.conf` (`.11`).
2. Hardware-Settings: Vulkan/iGPU explizit aktivieren.
3. Modelle laden: bge-m3 (GGUF Q8_0), Qwen3.5-4B (Q6_K). bge-m3 hier **geladen halten**
   (Autoload-Timer auf dem Desktop-WSL sorgt dafür, dass der Load nach TTL-Ablauf wiederholt wird).

## Verifikation (von WSL)

```bash
# WG-Erreichbarkeit des Tablet-Rerankers
curl -s -m 10 http://192.168.100.12:8080/health
# Rerank-Smoke (Vertrag: {model, query, documents} -> {results:[{index, relevance_score}]})
curl -s -m 15 http://192.168.100.12:8080/v1/rerank \
  -H 'content-type: application/json' \
  -d '{"model":"bge-reranker-v2-m3","query":"test","documents":["alpha","beta"]}'
# Embed-Smoke ueber LM Studio (PK-L-1)
curl -s -m 15 http://127.0.0.1:1234/v1/embeddings \
  -H 'content-type: application/json' \
  -d '{"model":"text-embedding-bge-m3","input":"test"}'
```

## Störungsbilder

- Tablet offline/schlafend → Kette fällt still auf Cluster (:8093); sichtbar über den
  Header `x-llm-proxy-bge-upstream` der Proxy-Antwort.
- LM Studio/PK-L-1 weg → embed fällt auf Cluster (:8081).
- Beide weg + Cluster weg → rerank startet `bge-rerank-cpu` on-demand auf dem Desktop.
````

- [ ] **Step 2: Runbook committen**

```bash
git add scripts/llm/README-laptop-bge.md
git commit -m "docs(llm): Runbook Laptop-bge-Betrieb (PK-L-1/PK-Tablet) [T006143]"
```

- [ ] **Step 3–7: Runbook auf den Geräten ausführen** (User-Schritte, exakte Befehle stehen im Runbook)

PK-Tablet: WG-Config importieren → Tunnel aktivieren → LM Studio + LM Link → Vulkan/iGPU aktivieren → Modelle laden → llama-server installieren + Startskript testen → Scheduled Task registrieren → Firewall-Regel.
PK-L-1: WG-Config importieren → Vulkan/iGPU aktivieren → Modelle laden.
WG-Confs vorab in WSL erzeugen: `bash scripts/hetzner/generate-wg-conf.sh --env mentolder --node-name pk-tablet --private-key <PRIV>` (analog `pk-l-1`) — die Private Keys liegen in `environments/.secrets/mentolder.yaml`.

- [ ] **Step 8: Verifikation aus dem Runbook ausführen**

Erwartung: `/health` → 200 `{"status":"ok"}`; Rerank-Smoke → 200 mit `results[].relevance_score`; Embed-Smoke → 200 mit `data[].embedding`.

---

### Task 6: Inventar, Verify-Block, End-to-End-Smoke, Push

**Files:**
- Modify: `website/src/data/test-inventory.json` (generiert)

**Interfaces:**
- Consumes: Tasks 1–5 (alle Deliverables)
- Produces: grüner Verify-Block und gepushter Branch `feature/laptop-bge-topologie-T006143`

- [ ] **Step 1: Test-Inventar regenerieren (CI-Gate)**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` enthält die drei neuen BATS-Dateien.

- [ ] **Step 2: Neue und betroffene Tests komplett laufen lassen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/bge-chain-order.bats tests/unit/wg-mesh-laptop-nodes.bats tests/unit/wg-mesh-fullmesh.bats tests/unit/llm-ps1-ascii.bats`
Run: `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*`
Expected: PASS (bzw. dokumentierte Skips bei fehlendem Live-Proxy).

- [ ] **Step 3: Freshness regenerieren und prüfen (S1-Ratchet)**

Run: `task freshness:regenerate`
Run: `task freshness:check`
Expected: grün. Falls S1 rot: die beanstandete Datei wirklich verkleinern, nicht kosmetisch zusammenziehen.

- [ ] **Step 4: End-to-End-Smoke über den Proxy (wenn Geräte stehen)**

```bash
curl -s -m 40 -D - http://127.0.0.1:18235/v1/rerank \
  -H 'content-type: application/json' \
  -d '{"model":"bge-reranker-v2-m3","query":"smoke","documents":["a","b"]}'
```

Erwartung: 200 und Header `x-llm-proxy-bge-upstream: http://192.168.100.12:8080`. Falls das Tablet nicht erreichbar ist, zeigt der Header das Cluster-Glied (`http://127.0.0.1:8093`) — die Kette degradiert wie designt; der Smoke ist dann als Skip (Geräteausstattung, T002716) zu werten, nicht als rot. Gleiches Muster für `/v1/embeddings` (Erwartung `x-llm-proxy-bge-upstream: http://127.0.0.1:1234`).

- [ ] **Step 5: Commit + Push**

```bash
git add website/src/data/test-inventory.json
git commit -m "test: Test-Inventar fuer die Laptop-bge-Guards regenerieren [T006143]"
git push origin feature/laptop-bge-topologie-T006143
```

- [ ] **Step 6: Push verifizieren**

Run: `git status --short`
Expected: Working Tree sauber (bis auf dokumentierte skip-worktree-Overrides, die nicht angezeigt werden); `git log origin/feature/laptop-bge-topologie-T006143..HEAD` leer.
