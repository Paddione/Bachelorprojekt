# p1-impl: brain Probe-Target ergaenzen (T900916)

Scope: genau eine Datei, genau eine Zeile. Alle Befehle laufen im
Worktree-Root auf Branch `fix/svc-probe-brain-T900916`.

## Steps

1. Oeffne `k3d/monitoring/blackbox-exporter.yaml`, Probe
   `brand-public-health`, `spec.targets.staticConfig.static`. Ergaenze bei
   den mentolder-Hosts (neben `design`/`studio`):
   `- https://brain.mentolder.de`
   Reihenfolge: alphabetisch nach Label (`brain` vor `design`). Kein
   `relabelingConfigs`-Eintrag (nur `web.*` wird dort umgelabelt, die
   Coverage nutzt nur das Subdomain-Label). Kein korczewski-Target
   (FROZEN per T002479).
2. Pruefe die Messung: `python3 scripts/lib/runtime-health-measure.py
   svc-probe` muss `0` ausgeben.
3. Pruefe den Guard: `tests/unit/lib/bats-core/bin/bats
   tests/spec/health-goals/service-health-goals.bats -f "svc-probe"` muss
   `ok 1` melden.
4. Commit mit explizitem Pathspec, keine Broad-Adds:
   `git add k3d/monitoring/blackbox-exporter.yaml && git commit -m
   "fix(T900916): add brain host to blackbox probe targets [T900916]"`
   und pushen.

## Acceptance

- Diff enthaelt exakt eine hinzugefuegte Zeile in der statischen
  Target-Liste; kein anderer Block der Datei ist angefasst.
- Messung `0`, BATS svc-probe-Test gruen.
- Follow-up (kein Blocker, siehe `design.md` E2): nach dem Merge im
  Monitoring-Dashboard gegenpruefen, ob die Live-Probe gegen den
  SSO-geschuetzten Host gruen wird.
