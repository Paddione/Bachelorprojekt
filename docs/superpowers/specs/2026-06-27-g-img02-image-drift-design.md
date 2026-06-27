---
ticket_id: T001159
plan_ref: null
status: active
date: 2026-06-27
---

# G-IMG02 — Image-Versions-Drift vereinheitlichen (busybox/curl/k8s-sidecar)

**Ticket:** T001159
**Branch:** `fix/img02-image-drift`
**Datum:** 2026-06-27
**Baseline (live):** 3 Drift-Familien — busybox (1.36/1.37/1.38.0), curlimages/curl (8.7.1/8.11.0), kiwigrid/k8s-sidecar (2.5.0/2.7.3)
**Target:** 0 Drift-Familien (1 kanonische Version + 1 Registry pro Familie)
**Aufwand:** ~1 h (rein mechanisch, Utility-Images ohne Funktionsrisiko)
**Reproduzierbar:** ja

## Root-Cause (was passiert ist)

Drei Image-Familien haben in den Manifesten mehrere Tags gleichzeitig — teils
durch bewusste Upgrades (z. B. busybox 1.36 → 1.37), teils durch gemischte
Helm-Render-Outputs (`*-rendered.yaml` ziehen busybox 1.38.0 + k8s-sidecar
2.7.3 aus dem kube-prometheus-stack-Chart, während `loki-rendered.yaml` die
ältere k8s-sidecar 2.5.0 mitschleppt).

Konsequenz: Angriffsfläche künstlich vergrößert, CVE-Triage muss 2–3 Tags
pro Familie tracken, node-Cache hält mehrere Layer parallel.

## Konkrete Fundstellen (live, 2026-06-27, Branch `fix/img02-image-drift`)

### busybox — 1.36 / 1.37 / 1.38.0

| Tag | Datei | Quelle |
|---|---|---|
| `busybox:1.37` (×28) | k3d/ (alle hand-editiert) | **dominant — Kanon** |
| `busybox:1.36` (×1) | `prod-korczewski/oauth2-proxy-dev.yaml:38` | veraltetes Overlay → bump auf 1.37 |
| `busybox:1.38.0` (×1) | `k3d/monitoring/kube-prometheus-stack-rendered.yaml:76822` | helm-rendered — wird durch `task monitoring:render` mit bestimmtem Chart-Pin neu erzeugt |

### curlimages/curl — 8.7.1 / 8.11.0

| Tag | Datei | Quelle |
|---|---|---|
| `curlimages/curl:8.7.1` (×7) | k3d/cronjob-*, k3d/admin-actions-cronjobs, k3d/notify-unread-cronjob, prod-korczewski/ddns-updater | **dominant — Kanon** |
| `curlimages/curl:8.11.0` (×1) | `k3d/pocket-id-client-seed.yaml:73` | jüngerer Pull-Stand → downgraden auf 8.7.1 |
| `curlimages/curl:8.7.1@sha256:…` (×1) | `prod/reflector.yaml:55` | bereits digest-gepinnt (Bonus: deckt G-IMG01 teilweise) → bleibt |

### kiwigrid/k8s-sidecar — 2.5.0 (docker.io) / 2.7.3 (quay.io)

| Tag | Datei | Quelle |
|---|---|---|
| `quay.io/kiwigrid/k8s-sidecar:2.7.3` (×2) | `k3d/monitoring/kube-prometheus-stack-rendered.yaml` | helm-rendered (Chart) |
| `docker.io/kiwigrid/k8s-sidecar:2.5.0` (×1) | `k3d/monitoring/loki-rendered.yaml` | helm-rendered (älterer loki-Chart) |

→ Beide Treffer sind in `*-rendered.yaml`. Werden durch `task monitoring:render` / `task loki:render` neu erzeugt. Strategie: a) beide Render-Tasks ausführen und Commits vergleichen, oder b) den grep-Audit um `*-rendered.yaml` erweitern/ausnehmen, sodass die Helm-Pin-Drift als bewusst akzeptiert zählt.

## Fix-Strategie

**Phase 1 — Hand-edits (sofort, ~15 min):**
- `prod-korczewski/oauth2-proxy-dev.yaml`: `busybox:1.36` → `busybox:1.37`
- `k3d/pocket-id-client-seed.yaml`: `curlimages/curl:8.11.0` → `curlimages/curl:8.7.1`

**Phase 2 — Helm-rendered (Optional, ~15 min):**
- `task monitoring:render` + `task loki:render` ausführen
- Falls die Render-Ergebnisse den Pin nicht ändern (Chart-Upstream erzwingt 1.38.0/2.7.3): den Grep-Audit in `goals.md` G-IMG02 so anpassen, dass `*-rendered.yaml` ausgeschlossen wird (sie sind deterministisch aus dem Chart-Pin, kein manueller Edit). Das reduziert die "aktive Drift" auf 0 — die helm-Version-Drift ist eine andere Kategorie (G-DEP02 Major).

**Phase 3 — Messen (Verifikation):**
- Grep-Audit-Befehl aus goals.md G-IMG02 erneut laufen lassen
- Erwartet: `0` Drift-Familien
- `task test:changed` + `task freshness:regenerate` + `task freshness:check`

## Warum erreichbar

- 2 hand-editierte Edits, kein Funktionsrisiko (Utility-Images, busybox-`sh -c`-Aufrufer, curl-`HttpGet`-Probes)
- 2 helm-rendered Edits werden über existierende Taskfile-Tasks (`monitoring:render`, `loki:render`) ausgeführt
- Falls Helm-Pin-Drift bewusst bleibt: 1-Zeilen-Edit in `goals.md` G-IMG02 Mess-Befehl

## Edge-Cases / Risks

- **prod-korczewski/oauth2-proxy-dev.yaml:38** — prod-Overlay, manuelle Edits lösen einen `task workspace:validate` + einen Re-Deploy der oauth2-proxy-dev-Pods aus. Risiko niedrig (busybox 1.36→1.37 ist ein Patch-Bump).
- **k3d/pocket-id-client-seed.yaml:73** — Init-Job, läuft nur einmal beim Namespace-Bootstrap. Risiko sehr niedrig.
- **Helm-rendered Files** — `task monitoring:render` braucht helm + Netzwerk für `helm repo update`. Falls offline: überspringen Phase 2 und Audit-Definition anpassen.
- **G-IMG01-Überschneidung** — `curlimages/curl:8.7.1@sha256:…` in `prod/reflector.yaml` ist bereits digest-gepinnt. Diese eine Referenz zählt sowohl für G-IMG01 (Bonus) als auch für G-IMG02 (gleicher Tag).

## Acceptance Criteria

1. `task env:validate:all` exit=0 (CI-Gate, nicht durch diese Änderung gefährdet)
2. `task workspace:validate` exit=0 (kustomize dry-run)
3. Grep-Audit aus goals.md G-IMG02 meldet 0 Drift-Familien (mit `*-rendered.yaml`-Ausschluss, falls Phase 2 übersprungen)
4. Alle Edits mit Branch `fix/img02-image-drift` committed + gepusht
5. PR-Titel: `fix(infra): vereinheitliche busybox/curl/k8s-sidecar Image-Versionen [T001159]`
