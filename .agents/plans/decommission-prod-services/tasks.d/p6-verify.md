# p6 — Verify (Tests-Rolle, letzter Task)

Hängt ab von: p1, p2, p3, p4, p5. Schreibt `.agents/plans/decommission-prod-services/verify.log`
(Befehle + Ergebnisse) und danach STOPP.

## RED-Baseline (vor p1 belegt, hier dokumentiert)

`python3 -m pytest tests/py/spec/test_no_prod_services.py -q` → expected: FAIL
(Dutzende Treffer vor p1). Nach p1–p5 muss derselbe Lauf GRÜN sein.

1. Kustomize-Builds grün (keine dangling refs):
   `kustomize build k3d/`, `kustomize build prod/`, `kustomize build prod-fleet/`
   (alternativ Repo-Task, falls vorhanden).
2. Website: `npm run typecheck --prefix components/website` + Vitest der geänderten Bereiche.
3. Repo-Suites zum Diff: `python3 -m pytest tests/py/spec/native_ported/spec/health-goals/ -q`.
4. Grep-Gate (keine dangling Refs):
   `grep -rinE "nextcloud|whiteboard|coturn|janus|nats|nextcloud-redis|talk-hpb" --include='*.yaml' --include='*.ts' --include='*.py' --include='*.sh' .`
   erlaubt nur: `docs/superpowers/specs/archive/`, dieser Plan (`decommission-prod-services`),
   ADR-Kontextzeilen, CHANGELOG-Historie. Jeder andere Treffer → zurück in p1–p5.
5. Repo-Gates in einer Zeile: `task test:changed; task freshness:regenerate; task freshness:check;` (`generated_artifacts: true`).
6. Abwesenheit live: `kubectl get deployments,statefulsets -A` auf devmesh (k3d/k3s-dev stichprobenartig)
   ohne die 6 Dienste.
7. `plan done $(date -u +%FT%TZ) plan-gestagt` in `phase-events.log` — danach STOPP,
   Übergabe an `dev-flow-execute` (führt p1–p6 aus).
