---
title: "k3d-Dev-Cluster erreicht Host-LLM: LLM_HOST_IP auf wg-Mesh-Adresse umstellen"
ticket_id: T002109
domains: [infra, test]
status: plan_staged
---

# k3d-dev-llm-bridge — Implementation Plan

Pods im lokalen k3d-Dev-Cluster erreichen die LLM-Dienste auf dem WSL-Host nicht, weil
`environments/dev.yaml` `LLM_HOST_IP` auf die Docker-Bridge `172.17.0.1` festnagelt — eine Adresse,
die in dieser Umgebung nirgends existiert. Der Fix richtet den Wert auf die `wg-gpu`-Adresse
`192.168.100.10` aus, die Prod bereits nutzt. Root-Cause-Analyse, Messwerte und die verworfenen
Alternativen stehen in `openspec/changes/k3d-dev-llm-bridge/design.md`.

Der Eingriff ist bewusst minimal: die NetworkPolicy deckt `192.168.100.0/24` bereits ab, und die
Loopback-Bindungen von `llm-proxy` (`:18235`) und `tei-embed` (`:9081`) sind laut
`openspec/specs/local-llm-proxy.md` beabsichtigt — beide bleiben unangetastet.

<!-- vitest: kein neuer Test nötig, weil ausschließlich Config-/Manifest-Dateien und BATS
     geändert werden — kein `.ts`/`.svelte`-Code im Scope. -->

## File Structure

| Datei | Art | S1 |
|---|---|---|
| `environments/dev.yaml` | geändert — `LLM_HOST_IP` auf wg-Mesh-Adresse | `.yaml`: kein S1-Limit in `gates.yaml` |
| `environments/schema.yaml` | geändert — veraltete Beschreibung „Empty in dev" | `.yaml`: kein S1-Limit in `gates.yaml` |
| `k3d/llm-gpu.yaml` | geändert — Kommentar-Doku nennt die falsche Dev-Adresse | `.yaml`: kein S1-Limit in `gates.yaml` |
| `tests/spec/llm-pipeline.bats` | geändert — 4 Regressionstests (bereits im RED-Commit) | `.bats`: kein S1-Limit in `gates.yaml` |
| `website/src/data/test-inventory.json` | generiert — via `task test:inventory` | generiert |

Keine der Dateien ist in `docs/code-quality/baseline.json` gebaselined, und `gates.yaml → s1.limits`
führt weder `.yaml` noch `.bats` — es gibt für diesen Plan folglich keine S1-Zeilenbudgets.

---

## Task 1 — RED-Zustand verifizieren

Der Regressionstest liegt bereits im Stage-Commit (Fix-Pfad Schritt 3). Vor jeder Änderung muss er
nachweislich aus dem richtigen Grund fehlschlagen.

```bash
npx --yes bats tests/spec/llm-pipeline.bats
```

**expected: FAIL** — genau diese drei Tests müssen rot sein:

- `dev LLM_HOST_IP is not a Docker bridge address` → Meldung `LLM_HOST_IP=172.17.0.1 is a Docker
  bridge address — unreachable from k3d pods`
- `dev LLM_HOST_IP is inside the wg-mesh CIDR 192.168.100.0/24`
- `dev LLM_HOST_IP matches the GPU-host address used by prod envs`

Grün sein muss bereits `allow-llm-gateway-egress covers the CIDR that dev LLM_HOST_IP lives in` —
das belegt, dass die NetworkPolicy nicht angefasst werden darf. Schlägt dieser vierte Test fehl,
stimmt die Analyse nicht und der Plan ist zu stoppen.

## Task 2 — `LLM_HOST_IP` in `environments/dev.yaml` korrigieren

In `environments/dev.yaml` den Wert von `LLM_HOST_IP` von `"172.17.0.1"` auf `"192.168.100.10"`
ändern und den Grund als Kommentar verankern, damit die Adresse nicht als versehentlich aus Prod
kopiert gelesen wird:

```yaml
  # wg-gpu-Adresse des WSL-Hosts — derselbe GPU-Peer, den die Prod-Envs adressieren.
  # Docker-Bridge-Adressen funktionieren hier nicht: Docker Desktop fährt den Daemon in
  # einer eigenen Distro, k3d vergibt pro Cluster ein zufälliges Subnetz. [T002109]
  LLM_HOST_IP: "192.168.100.10"
```

`TURN_OVERLAY_IP` und `TERMINAL_OVERLAY_IP` stehen in derselben Datei ebenfalls auf `172.17.0.1`.
Sie gehören **nicht** in diesen Fix — sie adressieren coturn/Terminal, nicht den LLM-Pfad, sind
nicht durch die Messung abgedeckt und würden den Scope unbelegt ausweiten. Wer sie prüfen will,
braucht ein eigenes Ticket.

## Task 3 — Veraltete Doku-Stellen zur Dev-Adresse korrigieren

Zwei Stellen behaupten weiterhin die falsche Dev-Adresse und würden den Fix bei der nächsten
Änderung wieder einkassieren:

1. `k3d/llm-gpu.yaml` — der Kopfkommentar sagt `K8s-Pods erreichen den Host direkt via wg-mesh IP
   (prod) oder Docker-Bridge 172.17.0.1 (dev k3d)` sowie `${LLM_HOST_IP}: 172.17.0.1 (dev k3d) |
   wg-mesh IP (prod fleet)`. Beide Stellen auf die wg-Mesh-Adresse für **beide** Umgebungen
   umschreiben.
2. `environments/schema.yaml` — der `LLM_HOST_IP`-Eintrag beschreibt den Wert als `Empty in dev.`
   Das trifft nicht mehr zu, da `dev.yaml` `LLM_ENABLED: "true"` setzt und damit eine erreichbare
   Adresse braucht. Beschreibung entsprechend anpassen; `default_dev: ""` bleibt unverändert, weil
   `dev.yaml` den Wert explizit setzt.

Keine Brand-Domain-Literale einführen (S3) — es geht ausschließlich um IP-Adressen und Prosa.

## Task 4 — Gerendertes Manifest prüfen

Nachweisen, dass die Endpoints tatsächlich mit der neuen Adresse gerendert werden — die Änderung
wirkt über `Taskfile.llm.yml:40` (`envsubst '$LLM_HOST_IP' < k3d/llm-gpu.yaml`), nicht direkt:

```bash
set -a && source <(bash scripts/env-resolve.sh dev) && set +a
envsubst '$LLM_HOST_IP' < k3d/llm-gpu.yaml | grep -A2 'kind: Endpoints' | grep 'ip:'
```

Erwartung: **drei** `ip: 192.168.100.10`-Zeilen (lmstudio, tei-embed, tei-rerank) und keine
verbliebene `172.`-Adresse. Zusätzlich `task workspace:validate` ausführen, da eine
Manifest-Eingangsgröße geändert wurde.

## Task 5 — Verifikation

```bash
npx --yes bats tests/spec/llm-pipeline.bats   # jetzt 10/10 grün
task test:inventory                            # Test-Inventar nach BATS-Änderung regenerieren
task test:changed
task freshness:regenerate
task freshness:check
```

`website/src/data/test-inventory.json` mitcommitten — der CI-Inventar-Check vergleicht gegen die
committete Fassung und failt sonst.

**End-to-End nach dem Merge** (nicht Teil der PR-Verifikation, da eine Cluster-Neuanlage nötig
ist): `task cluster:create` — das nimmt zugleich RC4 mit, denn der laufende Cluster stammt noch aus
der Zeit vor dem `kubeAPI.hostPort`-Pin aus T001853 — danach `task workspace:deploy ENV=dev` und
ein Pod gegen `llm-gateway-tei-embed:8081/health`. Ein Treffer dort beweist die Kette
Pod → NetworkPolicy → Endpoint → Host-TEI. Der `llm-gateway-lmstudio`-Endpoint bleibt so lange
tot, bis LM Studio auf `:1234` gestartet wird — das ist Betriebszustand, kein Defekt dieses Fixes.
