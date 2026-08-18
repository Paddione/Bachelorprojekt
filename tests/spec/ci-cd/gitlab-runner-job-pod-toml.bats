#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-job-pod-toml.bats — Job-Pod-Affinity/Security-Context
# als TOML geparst, nicht als Substring [S4, Code-Review T012177]
#
# PRUEFMODUS: Struktur-Inspektion, aber auf einer ANDEREN Ebene als
# gitlab-runner-fleet-guardrails.bats / gitlab-runner-fleet-rbac.bats: jene parsen
# das gerenderte Kubernetes-YAML (kubectl kustomize + yaml.safe_load_all) und pruefen
# damit nur den Runner-MANAGER-Pod. Die Werte fuer die vom Manager zur Laufzeit
# erzeugten JOB-Pods (build/helper-Container) stecken NICHT im YAML, sondern als
# eingebetteter TOML-Text in der ConfigMap `gitlab-runner`, Key `config.template.toml`
# (`runners.kubernetes.*`) — ein reiner YAML-Parser sieht diesen Text nur als
# Zeichenkette, nicht als Struktur.
#
# Das ist die eigentliche Lehre aus dem Review: ein Guard, der nur das
# Manager-Deployment prueft, haette weder B1 (falscher TOML-Pfad
# [runners.kubernetes.node_affinity] statt [runners.kubernetes.affinity.node_affinity]
# — vom Executor still verworfen, kein Fehler) noch B4 (fehlende
# pod_security_context/build_container_security_context/helper_container_security_context
# fuer Job-Pods unter der restricted-PodSecurity-Policy) gefunden. Dieser Guard
# extrahiert den TOML-Text aus der ConfigMap und parst ihn STRUKTURIERT mit Pythons
# stdlib `tomllib` (verfuegbar ab Python 3.11, hier 3.12 — kein externes pip-Paket
# noetig, dieselbe Kein-Install-Konvention wie bei den bestehenden `yaml`-Guards) —
# nie per grep/Substring-Match auf den TOML-Text (T002716: Semantik statt Darstellung).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK_DIR="${REPO_ROOT}/k3d/gitlab-runner-stack"
  RENDERED_FILE="$(mktemp)"
}

teardown() {
  rm -f "$RENDERED_FILE"
}

_render_to_file() {
  if [ ! -d "$STACK_DIR" ]; then
    echo "erwartetes Verzeichnis fehlt: $STACK_DIR" >&2
    return 1
  fi
  if ! kubectl kustomize "$STACK_DIR" --load-restrictor=LoadRestrictionsNone >"$RENDERED_FILE" 2>/tmp/gitlab-runner-job-pod-toml.err.$$; then
    echo "kubectl kustomize $STACK_DIR ist fehlgeschlagen:" >&2
    cat /tmp/gitlab-runner-job-pod-toml.err.$$ >&2
    rm -f /tmp/gitlab-runner-job-pod-toml.err.$$
    return 1
  fi
  rm -f /tmp/gitlab-runner-job-pod-toml.err.$$
}

# Gemeinsamer Extraktions-/Parse-Helfer: liest die ConfigMap `gitlab-runner`,
# Key `config.template.toml` (das ist das Template, mit dem `gitlab-runner
# register --template-config` tatsaechlich registriert — NICHT `config.toml`,
# das nur shutdown_timeout/concurrent/check_interval/log_level enthaelt), und
# gibt den geparsten [[runners]][0].kubernetes-Block als JSON aus, damit die
# einzelnen @test-Bloecke ohne erneuten YAML+TOML-Doppel-Parse pruefen koennen.
_k8s_toml_json() {
  python3 - "$RENDERED_FILE" <<'PY'
import json
import sys
import tomllib
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

cms = [
    d for d in docs
    if d.get("kind") == "ConfigMap" and (d.get("metadata") or {}).get("name") == "gitlab-runner"
]
if not cms:
    print("")
    sys.exit()

toml_text = (cms[0].get("data") or {}).get("config.template.toml")
if not toml_text:
    print("")
    sys.exit()

try:
    config = tomllib.loads(toml_text)
except tomllib.TOMLDecodeError as exc:
    print(json.dumps({"__parse_error__": str(exc)}))
    sys.exit()

runners = config.get("runners") or []
if not runners or "kubernetes" not in runners[0]:
    print("")
    sys.exit()

print(json.dumps(runners[0]["kubernetes"]))
PY
}

@test "gitlab-runner-job-pod-toml: config.template.toml existiert, ist gueltiges TOML und enthaelt [[runners]].kubernetes (Positiv-Anker)" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: ohne dieses Fundament waeren alle folgenden
  # "Feld X korrekt gesetzt"-Aussagen bei fehlendem/leerem TOML trivial falsch
  # UND ihr Fehlschlagen wuerde faelschlich wie ein Feld-Bug aussehen statt wie
  # ein fehlendes Fundament.
  result="$(_k8s_toml_json)"
  [ -n "$result" ]
  echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); assert '__parse_error__' not in d, d.get('__parse_error__'); print('OK' if isinstance(d, dict) and d else 'EMPTY')"
}

@test "gitlab-runner-job-pod-toml: B1 — Job-Pod-nodeAffinity sitzt unter runners.kubernetes.affinity.node_affinity (NICHT runners.kubernetes.node_affinity)" {
  _render_to_file
  k8s_json="$(_k8s_toml_json)"
  [ -n "$k8s_json" ]

  result="$(echo "$k8s_json" | python3 -c "
import json, sys
k8s = json.load(sys.stdin)

# B1: der korrekte Pfad ist affinity.node_affinity — ein direktes 'node_affinity'
# (ohne 'affinity' dazwischen) ist der ALTE, vom Executor still verworfene Pfad
# und darf NICHT als Ersatz gelten, selbst wenn er zufaellig noch im TOML steht.
affinity = k8s.get('affinity') or {}
node_affinity = affinity.get('node_affinity')
if node_affinity is None:
    print('MISSING_AAFFINITY_NODE_AFFINITY')
    sys.exit()

terms = (
    (node_affinity.get('required_during_scheduling_ignored_during_execution') or {})
    .get('node_selector_terms') or []
)
values = set()
for term in terms:
    for expr in term.get('match_expressions') or []:
        if expr.get('key') == 'kubernetes.io/hostname' and expr.get('operator') == 'In':
            values.update(expr.get('values') or [])

expected = {'gekko-hetzner-3', 'gekko-hetzner-4'}
print('OK' if expected.issubset(values) else 'INCOMPLETE:' + ','.join(sorted(values)))
")"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-job-pod-toml: B1-Regression — der alte Pfad runners.kubernetes.node_affinity (ohne affinity) ist NICHT (mehr) vorhanden" {
  _render_to_file
  k8s_json="$(_k8s_toml_json)"
  [ -n "$k8s_json" ]

  # Negativ-Aussage mit Positiv-Anker aus dem vorherigen Test (affinity.node_affinity
  # existiert bereits nachgewiesen) — belegt zusaetzlich, dass der urspruengliche
  # falsche Pfad nicht als Karteileiche stehen blieb.
  result="$(echo "$k8s_json" | python3 -c "
import json, sys
k8s = json.load(sys.stdin)
print('OK' if 'node_affinity' not in k8s else 'STALE_WRONG_PATH')
")"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-job-pod-toml: priority_class_name ist ci-low" {
  _render_to_file
  k8s_json="$(_k8s_toml_json)"
  [ -n "$k8s_json" ]

  result="$(echo "$k8s_json" | python3 -c "
import json, sys
k8s = json.load(sys.stdin)
print('OK' if k8s.get('priority_class_name') == 'ci-low' else 'MISSING_OR_WRONG')
")"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-job-pod-toml: B4 — pod_security_context erzwingt run_as_non_root und ein explizites seccomp_profile" {
  _render_to_file
  k8s_json="$(_k8s_toml_json)"
  [ -n "$k8s_json" ]

  # Positiv-Anker [T002356-M1]: pod_security_context muss zuerst existieren.
  result="$(echo "$k8s_json" | python3 -c "
import json, sys
k8s = json.load(sys.stdin)
psc = k8s.get('pod_security_context')
if psc is None:
    print('MISSING')
    sys.exit()
ok = (
    psc.get('run_as_non_root') is True
    and (psc.get('seccomp_profile') or {}).get('type') == 'RuntimeDefault'
)
print('OK' if ok else 'INCOMPLETE:' + json.dumps(psc))
")"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-job-pod-toml: B4 — build_container_security_context UND helper_container_security_context sind vollstaendig (restricted-PSA-Pflichtfelder)" {
  _render_to_file
  k8s_json="$(_k8s_toml_json)"
  [ -n "$k8s_json" ]

  # Zwei getrennte Assertions innerhalb desselben Python-Snippets, nicht eine
  # gemeinsame — analog zur RBAC-Konvention in gitlab-runner-fleet-rbac.bats:
  # ein fehlendes Feld an EINEM der beiden Container-Contexts darf nicht durch
  # einen Treffer am anderen verdeckt werden.
  result="$(echo "$k8s_json" | python3 -c "
import json, sys
k8s = json.load(sys.stdin)

def check(ctx_name):
    ctx = k8s.get(ctx_name)
    if ctx is None:
        return f'{ctx_name}:MISSING'
    problems = []
    if ctx.get('run_as_non_root') is not True:
        problems.append('run_as_non_root')
    if ctx.get('allow_privilege_escalation') is not False:
        problems.append('allow_privilege_escalation')
    if (ctx.get('capabilities') or {}).get('drop') != ['ALL']:
        problems.append('capabilities.drop')
    if (ctx.get('seccomp_profile') or {}).get('type') != 'RuntimeDefault':
        problems.append('seccomp_profile')
    if problems:
        return f'{ctx_name}:INCOMPLETE:' + ','.join(problems)
    return f'{ctx_name}:OK'

results = [check('build_container_security_context'), check('helper_container_security_context')]
bad = [r for r in results if not r.endswith(':OK')]
print('OK' if not bad else ';'.join(bad))
")"
  [ "$result" = "OK" ]
}
