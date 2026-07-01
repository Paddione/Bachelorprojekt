# Proposal: img02-image-drift (G-IMG02)

## Why

G-IMG02 im Repository-Health-Katalog misst "Fremd-Image-Versions-Drift" über
alle `k3d/` und `prod*/`-Manifeste. Eine Drift-Familie = dieselbe Image-Familie
in ≥ 2 unterschiedlichen Tags (z. B. `busybox:1.36` neben `busybox:1.37`).
Aktuelle Baseline (live 2026-06-27): **3 Drift-Familien** — busybox, curlimages/curl,
kiwigrid/k8s-sidecar.

Konsequenzen ungelöster Drift:
- Angriffsfläche künstlich vergrößert (mehr Tags → mehr CVEs zu tracken)
- node-Cache hält mehrere Layer parallel → ineffizient
- CVE-Triage muss 2–3 Tags pro Familie prüfen statt 1
- helm-rendered Dateien (`kube-prometheus-stack-rendered.yaml`,
  `loki-rendered.yaml`, `promtail-rendered.yaml`) sind deterministisch aus
  Upstream-Charts und werden deshalb aus dem Audit ausgenommen.

## What

1. `prod-korczewski/oauth2-proxy-dev.yaml:38` — `busybox:1.36` → `busybox:1.37`
   (kanonischer Pin, dominant in 28 hand-editierten Stellen).
2. `k3d/pocket-id-client-seed.yaml:73` — `curlimages/curl:8.11.0` → `curlimages/curl:8.7.1`
   (kanonischer Pin, dominant in 7 hand-editierten Stellen + 1 sha256-Pin in
   `prod/reflector.yaml`).
3. Neue BATS-Spec `tests/spec/image-drift.bats` mit 4 Assertions:
   - Drift-Tag-Counts = 0 für busybox (außer `1.37`) und curl (außer `8.7.1` + sha256)
   - Drift-Familie-Counts ≤ 1 für beide Familien
   - helm-rendered Dateien werden gefiltert (deterministisch aus Chart-Pin).
4. Verifikation: `task env:validate:all` (Exit 0), `task workspace:validate` (Exit 0),
   `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
5. G-IMG02 Audit-Befehl in `.claude/lib/goals.md` (Z. 521–528) bleibt unverändert —
   der bestehende Befehl zählt weiterhin alle Drift-Familien, inkl. helm-rendered.
   Nach diesem Fix: Drift-Familien 0 in hand-editierten Manifesten, 0 in
   helm-rendered (durch `task monitoring:render` + `task loki:render` als Folge-
   Schritt — siehe Folge-Tickets).

## Nicht im Scope (separate Tickets / Goals)

- G-IMG01 (43 unpinned Fremd-Images → 0): `prod/reflector.yaml` hat bereits
  `@sha256`, der Rest ist separates Pinning-Work.
- G-DEP02 (9 Major-Dep-Drift): getrennte Aktualisierung der Major-Versionen.

_Ticket: T001159_
