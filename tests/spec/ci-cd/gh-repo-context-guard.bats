#!/usr/bin/env bats
# tests/spec/ci-cd/gh-repo-context-guard.bats — gh-CLI braucht Repo-Kontext [T900810]
#
# Pruefmodus: Quelltext-Inspektion (Ausnahme fuer CI-Konfiguration, T002448-M4).
#
# Hintergrund: `gh run|workflow|pr|issue|api|label|...` loest das Ziel-Repo aus
# dem Git-Checkout auf. Ohne Checkout im SELBEN Job (jeder Job laeuft auf eigenem
# Runner) stirbt der Schritt mit "not a git repository". Zweimal eingetreten:
# failure-Job (naechtlich rot) und post-merge-e2e nach
# Entfernung des nur scheinbar ungenutzten Checkouts (T900810). Alternative zum
# Checkout ist ein explizites `-R/--repo` am Aufruf (auto-enable-automerge,
# release-please).
#
# Der Guard parst Jobs per YAML: ein run-Schritt mit gh-Aufruf ohne -R/--repo
# verlangt actions/checkout im selben Job. Kommentar-Erwaehnungen (`gh pr ...`
# in Prosa) zaehlen nicht — Kommandoposition entscheidet.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "gh-repo-context: jeder gh-Aufruf hat Checkout im Job oder -R/--repo" {
  run python3 - "$REPO_ROOT/.github/workflows" <<'PY'
import glob, os, re, sys, yaml

wf_dir = sys.argv[1]
GH = re.compile(r'(?:^|[\s;&|()])gh (?:run|workflow|pr|issue|api|label|release|search)\b')
REPOFLAG = re.compile(r'(?:^|[\s=])(?:-R|--repo)(?:[\s=]|$)')

def code_lines(run):
    # Shell-Heuristik: alles ab dem ersten # ist Kommentar. (Kein run-Block
    # bettet '#' in Quotes vor einem gh-Aufruf ein.)
    return [ln.split('#', 1)[0] for ln in str(run).splitlines()]

bad = []
checked = 0
for f in sorted(glob.glob(os.path.join(wf_dir, '*.yml'))):
    try:
        doc = yaml.safe_load(open(f, encoding='utf-8')) or {}
    except Exception:
        continue
    for job, spec in (doc.get('jobs') or {}).items():
        steps = spec.get('steps') if isinstance(spec, dict) else None
        if not steps:
            continue
        has_checkout = any('actions/checkout' in str(s.get('uses', '')) for s in steps)
        for s in steps:
            run = s.get('run')
            if not run:
                continue
            for ln in code_lines(run):
                if not GH.search(ln):
                    continue
                checked += 1
                if has_checkout or REPOFLAG.search(ln):
                    continue
                bad.append(f"{os.path.basename(f)} job '{job}': gh ohne Checkout/-R: {ln.strip()[:90]}")

# Positiv-Anker: der Guard sieht ueberhaupt gh-Aufrufe — sonst waere er trivial gruen.
assert checked > 0, 'kein gh-Aufruf gefunden (Guard blind?)'
assert not bad, 'gh ohne Repo-Kontext:\n  ' + '\n  '.join(bad)
print(f'OK - {checked} gh-Aufrufe mit Repo-Kontext')
PY
  [ "$status" -eq 0 ]
}
