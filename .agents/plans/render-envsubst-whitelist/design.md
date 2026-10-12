---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-10
---

# T901791 — Grafana `${datasource}` Leer-Substitution: Root-Cause-Spec

Ticket: T901791 (`fix`, major, mittel). Bereich: monitoring/render.
Strategie-Entscheid D1 (User, 2026-10-10): **(b) Whitelist in vars-Extraktion**.

## Symptom (Fakt)

`kustomize build prod-fleet/mentolder` enthält 500× `"uid":"${datasource}"`
(vendored kube-prometheus-stack-Dashboards via `prod/monitoring` →
`k3d/monitoring`). `render_component` (`scripts/flux-render-artifact.sh`)
extrahiert ALLE `${VAR}` (98 distinkte, darunter 13 fremde/kleingeschriebene:
`datasource cluster namespace code link target db db_user liveCount c d f k`)
und substituiert sie per envsubst. Ungesetzt → leer. Dashboards zeigen
kaputte/leere Datasource-UIDs.

## Ursache (verifiziert)

Extraktions-Regex ohne Whitelist (`grep -oE '\$\{[A-Za-z_]...'`) + envsubst
(`VAR` ungesetzt → `""`, vgl. T002209-Kommentar im Skript) + Fail-Closed-Lücke:
Der Leftover-Check sieht nur ÜBRIGE `${VAR}` — leer Substituiertes hat
stattgefunden und fällt durch. Gleiche Klasse wie T901780 (`${code}` fraß
CronJob-`$$code`, gefixt per #6522 durch Escaping — bei vendored Content keine
Option, daher D1).

## Fix-Ansatz (D1)

Whitelist statt Alles-Extraktion in `render_component`:

- Nur Owned-Vars substituieren (Quelle: `environments/schema.yaml` +
  `env-resolve.sh`-Outputs — Plan ermittelt die Menge empirisch).
- Skip-Liste für bekannte Fremd-Platzhalter (`datasource`, `cluster`,
  `namespace`, `code`, …) — bleiben unangetastet.
- Leftover-Check: Skip-Liste ausnehmen, fehlende Owned-Vars weiter hart
  fehlschlagen lassen (Fail-Closed bleibt).
- Regressionstests mit echtem envsubst (Konvention:
  `tests/py/spec/native_ported/spec/flux-render-security/test_runtime_var_unwrapping.py`):
  Fixture-Overlay mit `${datasource}` + Owned-Var durch `render_component` →
  `${datasource}` überlebt, Owned-Var substituiert.

## Edge-Cases

- Großgeschriebene Unbekannte in den 98 (`ARCH DB BACKUP_DIR` …) — empirisch
  als owned vs. fremd klassifizieren, nicht per Case-Heuristik raten.
- `code` steht weiter in der Liste (weitere Quelle neben T901780) — Whitelist
  deckt mit ab.
- Gleiche Extraktions-Patterns anderswo (`scripts/devmesh/render-stack.sh`,
  `.github/workflows/build-website.yml`) — im Plan als Follow-up-Kandidat
  vermerken, kein Scope-Creep ohne Beleg.
- Kein PR-Blocker; Dashboards separat verifizieren (kein Cluster nötig —
  Fixture-Test).
