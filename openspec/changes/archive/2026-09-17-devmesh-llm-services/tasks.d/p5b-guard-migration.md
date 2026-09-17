<!-- Partial p5b-guard-migration — target_files: tests/spec/software-factory/wsl-exit-nachzug.bats, tests/spec/local-llm-proxy.bats, tests/spec/local-llm-proxy/proxy-env-token-guard.bats, tests/spec/mcp-gateway/bge-host-routing.bats, tests/spec/local-llm-proxy/gateway-consumer-lint.bats, tests/spec/llm-pipeline/bge-usecase-reachability.bats, tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats, tests/spec/local-llm-proxy/bge-role-routes.bats, components/website/src/data/test-inventory.json -->

## Partial P5b: Guard-Migration, Inventar und Abschluss

**Rolle:** tests · **depends_on:** p5a-new-guards

**Ziel:** Jeder bestehende Guard, der eine der in D7 gelöschten WSL-Unit-Dateien voraussetzt, ist
auf das neue Subjekt umgestellt statt entkernt. Danach laufen alle Guards des Changes grün, das
Test-Inventar ist regeneriert und die Pflicht-Gates sind erfüllt. Schnittstellenvertrag zu
P1a/P1b: `tasks.d/p5a-new-guards.md`.

---

### Task P5b.1 — Bestehende Guards auf die gelöschten WSL-Units umstellen (D7)

Jeder Guard unten hängt heute an einer Datei, die mit D7 verschwindet
(`scripts/llm-proxy/{llm-proxy,llm-proxy-lan}.service`, `scripts/bge-mcp/bge-mcp.service`,
`scripts/mcp-gateway/{mcp-postgres-local,k3d-postgres-forward}.service`). Für jeden gilt:
**auf das neue Subjekt umstellen, nicht löschen** — sonst geht die Zusicherung ersatzlos
verloren, die der Guard trägt. Alle Ersatz-Assertions unten rendern gegen das ECHTE
`dev-local/core` (P1b liegt vor P5b), keine synthetische Fixture.

**Files (alle Modify):**
- `tests/spec/software-factory/wsl-exit-nachzug.bats`
- `tests/spec/local-llm-proxy.bats`
- `tests/spec/local-llm-proxy/proxy-env-token-guard.bats`
- `tests/spec/mcp-gateway/bge-host-routing.bats`
- `tests/spec/local-llm-proxy/gateway-consumer-lint.bats`
- `tests/spec/llm-pipeline/bge-usecase-reachability.bats`
- `tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats`
- `tests/spec/local-llm-proxy/bge-role-routes.bats`

Gefunden per (Stand vor diesem Partial, `git rev-parse HEAD` zum Zeitpunkt der Ausführung
festhalten — Mess-Konvention T002717):

```bash
grep -rln -e 'bge-mcp.service' -e 'llm-proxy.service' -e 'llm-proxy-lan' \
  -e 'mcp-postgres-local' -e 'k3d-postgres-forward' -e 'bge-forward-' tests/
```

liefert zusätzlich `tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats`,
`tests/spec/mcp-gateway/mcp-postgres-multistatement.bats` und
`tests/spec/mcp-gateway/native-server-startup-token.bats` — diese drei referenzieren
`scripts/mcp-gateway/mcp-postgres-local.mjs` (den Adapter, der weiterhin existiert, nur nicht
mehr per WSL-Unit gestartet wird) und **nicht** die gelöschte `.service`-Datei; sie bleiben
unverändert.

- [ ] **Schritt 1: `wsl-exit-nachzug.bats` — Test "Die drei behaltenen Units nennen den Grund
      fuer ihr Bleiben" widerspricht D7 direkt.** Der Test behauptet heute, dass
      `scripts/llm-proxy/llm-proxy.service`, `llm-proxy-lan.service` und
      `scripts/mcp-gateway/k3d-postgres-forward.service` **absichtlich** bleiben, weil andere
      Guards (T002277, T002556, T002543) sie voraussetzen. Mit D7 stimmt das nicht mehr — genau
      diese Guards werden in den folgenden Schritten umgestellt. Ersetzen durch die Umkehrung:

```bash
@test "Die WSL-Units von llm-proxy, bge-mcp und der Postgres-Kette sind geloescht (T900191/D7)" {
  for f in \
    "scripts/llm-proxy/llm-proxy.service" \
    "scripts/llm-proxy/llm-proxy-lan.service" \
    "scripts/bge-mcp/bge-mcp.service" \
    "scripts/bge-mcp/bge-forward-embed.service" \
    "scripts/bge-mcp/bge-forward-rerank.service" \
    "scripts/mcp-gateway/mcp-postgres-local.service" \
    "scripts/mcp-gateway/k3d-postgres-forward.service"; do
    [ ! -f "$REPO_ROOT/$f" ]
  done
  # Positiv-Anker: die Nachbardateien, die NICHT zur WSL-Kette gehoeren, bleiben.
  [ -f "$REPO_ROOT/scripts/mcp-gateway/mcp-postgres-local.mjs" ]
  [ -f "$REPO_ROOT/scripts/mcp-gateway/mcp-gateway-watchdog.service" ]
}
```

  Dieser Test ist erst NACH P3b grün (die Dateien existieren bis dahin noch) — er wird hier
  geschrieben, weil er denselben Datei-Kontext wie der Rest dieses Tasks teilt; sein GREEN-Nachweis
  gehört fachlich zu Task P5b.2.

- [ ] **Schritt 2: `local-llm-proxy.bats` — drei `@test`-Blöcke ab "systemd-Unit +
      Registry-Migration" (~Zeile 248–290) hängen an `scripts/llm-proxy/llm-proxy.service`.**
      Ersetzen durch einen Block, der denselben Zweck (Registry-Poll erreicht die devmesh-DB ohne
      kubectl-exec-Umweg, D3) gegen das gerenderte Deployment prüft:

```bash
@test "llm-services-Deployment setzt FACTORY_PG_URL statt kubectl-exec-Pfad (T900191, D3)" {
  # Ersetzt "llm-proxy.service hat kubectl im PATH": der kubectl-exec-Pfad gegen die
  # Registry entfaellt mit devmesh, FACTORY_PG_URL zeigt jetzt direkt auf shared-db.
  local deploy_out
  deploy_out="$(bash "${BATS_TEST_DIRNAME}/../../scripts/devmesh/render-stack.sh" core 2>/dev/null)" || skip "render-stack.sh Vorbedingung fehlt (siehe llm-services.bats)"
  echo "$deploy_out" | grep -qF 'FACTORY_PG_URL'
}
```

  Die beiden anderen ersetzten Tests (`existiert und startet server.mjs`,
  `erkennt eine bereits laufende Instanz`) werden ersatzlos gestrichen — ihr Gegenstand
  (Prozessverwaltung eines systemd-User-Service) hat mit dem Umzug in einen Kubernetes-Pod
  kein Analogon mehr; die Pod-Aufsicht selbst ist bereits Gegenstand von
  `llm-services.bats::"Only the three services start"`.

- [ ] **Schritt 3: `proxy-env-token-guard.bats` (~Zeile 21) — `UNIT` zeigt auf
      `scripts/llm-proxy/llm-proxy.service`, das gelöscht wird.** Die `_guard()`-Fragment-Tests
      (Warnlogik gegen eine präparierte `proxy.env`-Datei) bleiben unverändert lauffähig — reine
      Bash-Funktion ohne Pfadbindung. Nur `setup()` verliert `UNIT`; ein neuer Test prüft, dass
      `dev-local/components/llm-services` denselben Token (`BGE_MCP_TOKEN`, D5) aus dem
      SealedSecret bezieht:

```bash
@test "llm-services-Deployment bezieht BGE_MCP_TOKEN aus dem SealedSecret (T900191, D5)" {
  local deploy_out
  deploy_out="$(bash "${BATS_TEST_DIRNAME}/../../scripts/devmesh/render-stack.sh" core 2>/dev/null)" || skip "render-stack.sh Vorbedingung fehlt"
  echo "$deploy_out" | grep -qF 'BGE_MCP_TOKEN'
}
```

- [ ] **Schritt 4: `bge-host-routing.bats` (~Zeile 23) — `UNIT="$REPO/scripts/bge-mcp/bge-mcp.service"`
      wird gelöscht.** Das Requirement dahinter (`LLM_EMBED_URL`/`LLM_RERANKER_URL` zeigen auf
      den lokalen Proxy) gilt laut D4 unverändert — nur der Ort ändert sich von einer
      WSL-Unit-Environment-Zeile zu Pod-lokalen Env-Vars im `llm-services`-Deployment. Beide
      Werte bleiben `http://127.0.0.1:18235` (P1b hat sie exakt so gerendert — bge-mcp und
      llm-proxy laufen im selben Pod):

```bash
@test "llm-services-Deployment pinnt beide bge-Endpoint-URLs auf den Pod-lokalen llm-proxy (T900191, Nachfolger von T003205)" {
  local deploy_out
  deploy_out="$(bash "${BATS_TEST_DIRNAME}/../../../scripts/devmesh/render-stack.sh" core 2>/dev/null)" || skip "render-stack.sh Vorbedingung fehlt"
  echo "$deploy_out" | grep -qE 'LLM_EMBED_URL[^#]*127\.0\.0\.1:18235'
  echo "$deploy_out" | grep -qE 'LLM_RERANKER_URL[^#]*127\.0\.0\.1:18235'
}
```

  Der bestehende `@test "bge-mcp unit exists"` wird gestrichen (Subjekt gelöscht — bereits durch
  den `MCP_NODE_SERVICES`-Test in `llm-services.bats` abgedeckt, der `bge-mcp` als gestarteten
  Dienst verlangt).

- [ ] **Schritt 5: `gateway-consumer-lint.bats` (~Zeile 38) — `SURFACES` listet
      `scripts/bge-mcp/bge-mcp.service`.** Diesen Eintrag streichen und durch den gerenderten
      `llm-services`-Deployment-Ausschnitt ersetzen — sonst schrumpft die überwachte Fläche des
      Lints ersatzlos, und ein zurückgezogenes Modell könnte künftig unbemerkt im Deployment-Env
      auftauchen:

```bash
# In SURFACES ersetzen:
#   "scripts/bge-mcp/bge-mcp.service"
# durch eine gerenderte Datei, die setup() einmalig erzeugt:
#   RENDERED_LLM_SERVICES="$FIX/llm-services-rendered.yaml"
#   bash "$REPO/scripts/devmesh/render-stack.sh" core > "$RENDERED_LLM_SERVICES" 2>/dev/null || true
#   SURFACES+=("$RENDERED_LLM_SERVICES")
# Die Backend-Port-Pruefschleife iteriert ohnehin ueber SURFACES per Dateiinhalt — kein
# weiterer Code muss angefasst werden, ausser dem Array-Eintrag und dem setup()-Rendering.
```

- [ ] **Schritt 6: `bge-usecase-reachability.bats` (~Zeile 117) — Kommentar-Block "F3: bge-mcp
      Port-Forwards unter systemd-Aufsicht" prüft `scripts/bge-mcp/bge-mcp.service` per grep
      (dokumentierte Quelltext-Ausnahme, bleibt als Modus erhalten).** Ersetzen durch eine
      Prüfung des gerenderten `llm-services`-Deployments, die dasselbe Interesse trägt:

```bash
@test "bge-mcp: laeuft als Supervisor-Kind im llm-services-Deployment, kein Hintergrundjob (T900191, Nachfolger F3)" {
  local deploy_out
  deploy_out="$(kubectl kustomize --load-restrictor=LoadRestrictionsNone "${REPO_ROOT}/dev-local/core" 2>/dev/null)" || skip "kubectl kustomize Vorbedingung fehlt"
  echo "$deploy_out" | grep -qF 'MCP_NODE_SERVICES'
  echo "$deploy_out" | grep -qF 'bge-mcp'
  amp="$(echo "$deploy_out" | grep -cE 'port-forward.*&' || true)"
  [ "$amp" -eq 0 ]
}
```

  Die beiden `@test`-Blöcke, die konkret `scripts/bge-mcp/bge-mcp.service` per Pfad öffnen
  (Port-Forward-Aufsicht, Rollen-Units), werden gestrichen.

- [ ] **Schritt 7: `watchdog-tunnel-liveness.bats` (~Zeile 79–82) — Existenz-Assertions für
      `k3d-postgres-forward.service` und `mcp-postgres-local.service`.** Diese Units gehören zur
      lokalen Postgres-Forward-Kette, die mit dem Umzug nach devmesh entfällt (der Client
      forwardet jetzt direkt `svc/llm-services:13001`). Die beiden `[ -f "${fwd}" ]` /
      `[ -f "${pglocal}" ]`-Zeilen streichen; der Rest (Watchdog prüft `mcp-gateway.service` und
      den echten MCP-`initialize`-Probe) bleibt unverändert. Kommentar "T006996: die lokale
      Postgres-Kette gehoert ebenfalls zum Restart-Scope" durch einen Verweis auf T900191
      ersetzen, der erklärt, warum die Zeilen weg sind.

- [ ] **Schritt 8: `bge-role-routes.bats` — `skip`-Meldung (~Zeile 75) nennt
      `'systemctl --user restart llm-proxy.service'`.** Nach D7 falsch — durch den
      Rollout-Befehl gegen den devmesh-Pod ersetzen:
      `kubectl --context devmesh -n workspace rollout restart deploy/llm-services`. Reine
      Prosa-Änderung, keine strukturelle Test-Anpassung.

- [ ] **Schritt 9: Commit.**

```bash
git add tests/spec/software-factory/wsl-exit-nachzug.bats \
  tests/spec/local-llm-proxy.bats \
  tests/spec/local-llm-proxy/proxy-env-token-guard.bats \
  tests/spec/mcp-gateway/bge-host-routing.bats \
  tests/spec/local-llm-proxy/gateway-consumer-lint.bats \
  tests/spec/llm-pipeline/bge-usecase-reachability.bats \
  tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats \
  tests/spec/local-llm-proxy/bge-role-routes.bats
git commit -m "test(devmesh): bestehende Guards auf devmesh-llm-services umgestellt (D7) [T900191]"
```

### Task P5b.2 — GREEN: alle Guards gegen den fertigen Branch laufen lassen

Läuft, nachdem P1a–P4 und P5a vollständig im Branch liegen.

**Files:**
- Test: alle in P5a und P5b.1 genannten Dateien (nur ausführen; Änderungen nur an P5b-Dateien, wenn
  ein Test nachweislich falsch misst)

- [ ] **Schritt 1: Neue und geänderte Guards grün laufen lassen.**

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/local-dev-mesh/llm-services.bats \
  tests/spec/local-dev-mesh/tailnet-policy.bats \
  tests/spec/mcp-gateway/start-windows-unc.bats \
  tests/spec/dev-pod-mcp-bundle/dev-pod.bats \
  tests/spec/software-factory/wsl-exit-nachzug.bats \
  tests/spec/local-llm-proxy.bats \
  tests/spec/local-llm-proxy/proxy-env-token-guard.bats \
  tests/spec/mcp-gateway/bge-host-routing.bats \
  tests/spec/local-llm-proxy/gateway-consumer-lint.bats \
  tests/spec/llm-pipeline/bge-usecase-reachability.bats \
  tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats \
  tests/spec/local-llm-proxy/bge-role-routes.bats
# erwartet: alle ok
```

- [ ] **Schritt 2: Beide Formen der Spec-Tests erfassen** (Sammeldatei *und* Verzeichnis,
      `tests/CLAUDE.md` T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh* tests/spec/mcp-gateway* \
  tests/spec/local-llm-proxy* tests/spec/llm-pipeline* tests/spec/dev-pod-mcp-bundle* \
  tests/spec/software-factory*
```

- [ ] **Schritt 3: Rot-Gegenprobe des Lösch-Guards.** Eine gelöschte Unit testweise wieder anlegen,
      der Test aus P5b.1 Schritt 1 muss rot werden, danach verwerfen:

```bash
touch scripts/llm-proxy/llm-proxy.service
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-nachzug.bats
# expected: FAIL — "Die WSL-Units von llm-proxy, bge-mcp und der Postgres-Kette sind geloescht" meldet not ok
rm -f scripts/llm-proxy/llm-proxy.service
```

- [ ] **Schritt 4: Commit.**

```bash
git add -A
git commit -m "test(devmesh): migrierte Guards gruen nach P1-P4 [T900191]"
```

---

### Task P5b.3 — Test-Inventar regenerieren

**Files:**
- Modify: `components/website/src/data/test-inventory.json`

- [ ] **Schritt 1:**

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
git commit -m "test(devmesh): Inventar nach llm-services-Guards aktualisiert [T900191]"
```

---

### Task P5b.4 — Manuelle Abnahme gegen den echten devmesh-Cluster (nicht in CI)

Voraussetzung: devmesh-Kernstack ist deployt (`task devmesh:deploy PROFILE=core`) — laut
`proposal.md` Stand 2026-09-16 noch nicht der Fall; dieser Task bleibt bis dahin offen und ist
**kein** CI-Gate.

- [ ] **Stufe 1: Rollout ist grün.**

```bash
kubectl --context devmesh -n workspace rollout status deploy/llm-services
```

- [ ] **Stufe 2: Der Proxy antwortet lokal nach Port-Forward.**

```bash
kubectl --context devmesh -n workspace port-forward svc/llm-services 18235:18235 13001:13001 13005:13005 &
sleep 2
curl -sf 127.0.0.1:18235/livez
```

- [ ] **Stufe 3: MCP `initialize` auf beiden Node-Servern.**

```bash
curl -s -X POST 127.0.0.1:13005/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"acceptance","version":"0"}}}'
curl -s -X POST 127.0.0.1:13001/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"acceptance","version":"0"}}}'
# erwartet: je eine JSON-RPC-Antwort mit "result", kein Verbindungsfehler
```

- [ ] **Stufe 4: Ein Chat-Request gegen ein Windows-GPU-Modell geht über den Tailnet-Pfad.**

```bash
curl -s 127.0.0.1:18235/v1/chat/completions -H 'content-type: application/json' \
  -d '{"model":"qwen38-220k","messages":[{"role":"user","content":"ping"}]}'
# Modell-Alias aus der Migration (P1b, llamacpp-qwen38 -> llm-gateway-host:8094). Erwartet:
# eine Antwort, keine "no_backend"/502 — belegt den Pfad Pod -> llm-gateway-host -> Tailnet ->
# PK-Desktop end-to-end.
```

- [ ] **Ergebnis am Ticket dokumentieren** (Mess-Konvention T002717 — je Stufe Befehl und
      beobachtete Ausgabe):

```bash
bash scripts/ticket.sh add-comment --id T900191 --body "Abnahme devmesh-llm-services: Stufe 1-4 mit Befehl und Ausgabe."
```

---

### Task P5b.5 — Finale Verifikation (Pflicht-Gates)

- [ ] **Schritt 1:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Schritt 2: Regenerierte Artefakte mitcommitten**, falls Schritt 1 etwas verändert hat:

```bash
git status --short
git add -A && git commit -m "chore: freshness-Artefakte nach devmesh-llm-services-Guards [T900191]"
```

> Fällt `task test:changed` mit `Executed 0 instead of expected N` aus, fehlt GNU `parallel`
> (`tests/CLAUDE.md`) — kein Testfehlschlag. Seriell nachfahren:
> `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh* tests/spec/mcp-gateway* tests/spec/local-llm-proxy* tests/spec/llm-pipeline* tests/spec/dev-pod-mcp-bundle* tests/spec/software-factory*`.
