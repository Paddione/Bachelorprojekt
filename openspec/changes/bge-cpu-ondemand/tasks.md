---
title: "bge-CPU-Stack on demand — exclusiveGroup aufheben, Flux-Waisen entfernen"
ticket_id: T002729
domains: [ops, infra]
status: plan_staged
---

# bge-CPU-Stack on demand — Implementation Plan [T002729]

Embedding und Reranking sollen lokal in WSL rein CPU-gebunden und strikt auf Abruf gleichzeitig
bereitstehen. Zwei Hindernisse: eine `exclusiveGroup` ohne Sachgrund und zwei verwaiste
Cluster-Objekte, die auf abgeschaltete Windows-Prozesse zeigen.

Design-Spec: `docs/superpowers/specs/2026-08-08-bge-cpu-ondemand-design.md`
SSOT-Spec: `openspec/specs/local-llm-proxy.md`

## File Structure

| Datei | Zeilen jetzt | Wirksame S1-Schwelle | Budget | Änderung |
|---|---|---|---|---|
| `scripts/llm/loadouts.json` | 490 | 500 | 10 | −2 Zeilen (`exclusiveGroup` ×2), `notes`-Text ersetzt |
| `tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats` | 131 | 500 | 369 | Positiv-Anker auf Kontrollgruppe umstellen |
| `tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats` | 93 | 500 | 407 | bereits angelegt (RED), bleibt unverändert |
| `docs/superpowers/references/gotchas-footguns.md` | 212 | 500 | 288 | +Abschnitt zu `suspend: true` bei `ready: True` |

`scripts/llm/loadouts.json` liegt mit 490 von 500 Zeilen nahe der Schwelle. Die Änderung
**entfernt** netto Zeilen (zwei `exclusiveGroup`-Einträge; der `notes`-Text wird ersetzt, nicht
ergänzt). Ein Verkleinerungsschritt ist deshalb nicht nötig — aber jede künftige Loadout-Ergänzung
läuft in das Limit und braucht dann eine Aufteilung der Datei.

## Partials

| Partial | Rolle | Zieldateien |
|---|---|---|
| p1-config | ops | `scripts/llm/loadouts.json`, `docs/superpowers/references/gotchas-footguns.md` |
| p2-tests | tests | `tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats`, `tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats` |

Die Zieldateien sind disjunkt. Die Cluster-Bereinigung in Schritt 4 erzeugt kein Repo-Artefakt und
gehört deshalb keinem Partial an; sie läuft als Ops-Schritt in p1.

## p1-config

### 1. Failing-Test-Nachweis (bereits erbracht, hier zur Reproduktion)

Der RED-Test liegt in `tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats
```

expected: FAIL — `not ok 1 loadouts: die beiden bge-CPU-Loadouts blockieren einander nicht`,
Abbruch an `[ "$output" = "OK" ]`. Der Positiv-Anker im selben Test (Kontrollgruppe
`gptoss-context` gegen `gemma26-factory` muss `CONFLICT` liefern) besteht bereits — damit ist
belegt, dass `findExclusiveConflict` arbeitet und der rote Teil nicht auf einer leeren
Kandidatenliste beruht.

### 2. `exclusiveGroup` aus beiden bge-CPU-Loadouts entfernen

In `scripts/llm/loadouts.json` bei `bge-embed-cpu` und `bge-rerank-cpu` jeweils die Zeile
`"exclusiveGroup": "bge-cpu",` streichen. `args.ngl: 0`, `env.CUDA_VISIBLE_DEVICES: ""`,
`extraArgs` mit `-t 4` und die Ports 8095/8096 bleiben unverändert.

Danach muss die Datei kanonisch serialisiert bleiben:

```bash
task llm:loadouts:check
```

Schlägt der Check fehl, mit `task llm:loadouts:format` normalisieren und erneut prüfen.

### 3. `notes` von `bge-rerank-cpu` auf den tatsächlichen Stand bringen

Der bestehende Text beginnt mit `ACHTUNG PORT-KONFLIKT:` und beschreibt einen Windows-llama-server
auf `:8096` sowie Endpoints in `workspace-korczewski`, die auf ihn zeigen. Beides existiert nicht
mehr. Der Ersatztext hält fest:

- Die vier Windows-Tasks unter `\Llama\` sind deaktiviert (T002729); XML-Backups liegen unter
  `C:\Users\PatrickKorczewski\llama-tasks-backup\`. Reaktivierung mit
  `Enable-ScheduledTask -TaskPath '\Llama\' -TaskName '<name>'` (elevated).
- `:8096` ist damit frei; dieses Loadout ist der reguläre lokale Weg, startet aber weiterhin
  nicht von selbst.
- Args gespiegelt von `k3d/llm-gpu.yaml` (`bge-rerank`) — dieser Satz bleibt erhalten.
- Keine `exclusiveGroup`: die Gruppe modellierte VRAM-Exklusivität, dieses Loadout belegt kein
  VRAM. Verweis auf `tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats`.

### 4. Flux-Waisen in `workspace-korczewski` entfernen (Ops, kein Repo-Artefakt)

Zuerst der Nachweis, dass niemand sie nutzt — die Ausgabe muss leer sein:

```bash
kubectl --context fleet -n workspace-korczewski get deploy -o json \
  | grep -oE 'llm-gateway-[a-z]+:[0-9]+' | sort -u
```

Dann entfernen:

```bash
kubectl --context fleet -n workspace-korczewski delete svc llm-gateway-rerank llm-gateway-embed
kubectl --context fleet -n workspace-korczewski delete endpoints llm-gateway-rerank llm-gateway-embed --ignore-not-found
```

Anschließend prüfen, dass der aktive Pfad in `ns workspace` unberührt ist:

```bash
kubectl --context fleet -n workspace get endpoints llm-gateway-rerank llm-gateway-embed
curl -s -m 5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8093/health
```

Erwartung: beide Endpoints in `workspace` weiterhin mit Pod-IP belegt, Forward antwortet `200`.

`flux-korczewski` bleibt suspendiert — eine Reaktivierung prunet alle seit der Suspendierung
entstandenen Abweichungen auf einmal und ist ein eigener Vorgang.

### 5. Gotcha dokumentieren

In `docs/superpowers/references/gotchas-footguns.md` unter „Ops & Infra" einen Abschnitt
ergänzen: eine suspendierte Flux-Kustomization meldet weiter `ready: True`, während der Cluster
beliebig weit vom Repo abdriftet; ohne Reconciliation läuft auch kein Prune. Belegter Fall:
`llm-gateway-rerank`/`-embed` in `workspace-korczewski` überlebten die Repo-Entfernung durch
T002551 (`20e123b7f`) um Monate und zeigten weiter auf `192.168.100.10`. Zweite Hälfte des
Befunds: ein Service ohne Selector mit handgesetzten Endpoints wird von Kubernetes nie auf
Erreichbarkeit geprüft — der Endpoint bleibt grün, auch wenn dahinter nichts lauscht. Prüfbefehl
`kubectl -n flux-system get kustomization <name> -o jsonpath='{.spec.suspend}'` nennen.

## p2-tests

### 6. Positiv-Anker in `bge-loadout-cpu-bound.bats` auf eine Kontrollgruppe umstellen

Der Test `loadouts: bge-Loadouts stehen nicht in der GPU-Gruppe der Chat-Modelle` (Zeile ~107)
verlangt in Zeile 122 `[ "$output" != "null" ]`. Das macht die bloße Existenz einer Gruppe zur
Anforderung und schlägt nach Schritt 2 fehl.

Ersetzen durch einen Anker auf einer Kontrollgruppe: zuerst nachweisen, dass die Ausleseroutine
bei einem bekannten GPU-Loadout tatsächlich `chat-gpu` liefert, danach für jedes bge-Loadout
`!= chat-gpu` prüfen. Die `!= null`-Zeile entfällt. Der Kommentarblock darüber wird angepasst — er
begründet derzeit genau den Anker, der wegfällt, und muss stattdessen erklären, warum der Anker
auf der Kontrollgruppe liegt (T002356-M1 bleibt erfüllt, ohne eine fremde Eigenschaft
festzuschreiben).

### 7. Beide Testdateien grün, dann Laufzeit-Gegenprobe

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
```

Erwartung: alle Tests bestehen, insbesondere `bge-cpu-parallel-start.bats` (vorher rot) und die
vier Tests aus `bge-loadout-cpu-bound.bats`. Der Glob mit `*` erfasst Sammeldatei **und**
Verzeichnis — eine Suche allein nach `tests/spec/local-llm-proxy.bats` fände nur die Hälfte
(T002696).

Danach die Laufzeit-Gegenprobe: beide Server gleichzeitig. Kein automatisierter Test, sondern
manuelle Bestätigung des eigentlichen Ziels — grüne Unit-Tests belegen nur die Konfiguration,
nicht den tatsächlich gleichzeitigen Betrieb. Der Proxy liest
`loadouts.json` bei jedem Start neu; ein Neustart der Unit ist nicht nötig.

```bash
curl -s -XPOST http://127.0.0.1:18235/admin/loadouts/bge-rerank-cpu/start
curl -s -XPOST http://127.0.0.1:18235/admin/loadouts/bge-embed-cpu/start
curl -s -m 5 -o /dev/null -w 'rerank %{http_code}\n' http://127.0.0.1:8096/health
curl -s -m 5 -o /dev/null -w 'embed  %{http_code}\n' http://127.0.0.1:8095/health
```

Erwartung: kein `exclusive_conflict`, beide `/health` liefern `200`. Danach die GPU prüfen —
sie muss auf Desktop-Niveau bleiben (Referenz 2143 von 16303 MiB):

```bash
powershell.exe -NoProfile -Command "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader"
```

Zum Schluss beide wieder stoppen, damit der Zustand „strikt on demand" auch tatsächlich gilt:

```bash
curl -s -XPOST http://127.0.0.1:18235/admin/loadouts/bge-embed-cpu/stop
curl -s -XPOST http://127.0.0.1:18235/admin/loadouts/bge-rerank-cpu/stop
```

## Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich vor dem PR:

```bash
task llm:loadouts:check
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy*
```

Erwartung: alle Kommandos mit Exit 0. Ändert `freshness:regenerate` Artefakte, gehören sie in
denselben Commit.
