#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-job-coverage.bats — Abdeckung der ci.yml-Offline-Gates durch
# .gitlab-ci.yml [T012405]
#
# PRUEFMODUS: Quelltext-Inspektion ueber die geparste YAML-Struktur beider Dateien
# (T002448-M4-Ausnahme fuer CI-Konfiguration, wie in gitlab-mirror-workflow.bats
# begruendet). Beide Seiten werden mit yaml.safe_load gelesen, nicht per grep auf
# Job-Namen: ein Name, der nur im Kommentartext vorkommt, wuerde sonst als Abdeckung
# zaehlen — genau der Fehler, den der Review zu T011790 an einem frueheren Entwurf
# gefunden hat.
#
# Der Guard traegt die Zuordnung GitHub-Job -> GitLab-Job als Tabelle. Sein eigentlicher
# Zweck ist nicht, den heutigen Stand zu bestaetigen, sondern einen KUENFTIG in ci.yml
# hinzugefuegten Offline-Gate-Job auffallen zu lassen: ein Job, der weder zugeordnet
# noch ausdruecklich als ausgelassen deklariert ist, laesst diesen Test scheitern.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CI_YML="${REPO_ROOT}/.github/workflows/ci.yml"
  GL_YML="${REPO_ROOT}/.gitlab-ci.yml"
}

# Job-Schluessel einer GitHub-Workflow-Datei, eine pro Zeile.
_gh_jobs() {
  python3 - "$CI_YML" <<'PY'
import sys, yaml
with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}
for name in (doc.get("jobs") or {}):
    print(name)
PY
}

# Job-Schluessel einer GitLab-Pipeline-Datei. Top-Level-Schluessel, die keine Jobs sind
# (stages, variables, default, workflow, include) und die YAML-Anker-Vorlagen (fuehrender
# Punkt) werden ausgesondert — sonst zaehlte ".node_toolchain" als Gegenstueck.
_gl_jobs() {
  python3 - "$GL_YML" <<'PY'
import sys, yaml
RESERVED = {"stages", "variables", "default", "workflow", "include", "image", "before_script", "after_script"}
with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}
for name, body in doc.items():
    if name in RESERVED or name.startswith("."):
        continue
    if isinstance(body, dict):
        print(name)
PY
}

@test "gitlab-job-coverage: aus beiden Dateien werden ueberhaupt Jobs gelesen" {
  # Positiv-Anker [T002356-M1]: Zwei leere Mengen erfuellen jede Teilmengen-Aussage.
  # Ohne diesen Test waere der gesamte Abgleich vakuos, sobald eine Datei fehlt,
  # umbenannt wird oder ein YAML-Fehler safe_load leer zurueckgeben laesst.
  gh_count="$(_gh_jobs | grep -c .)"
  gl_count="$(_gl_jobs | grep -c .)"
  echo "Anker: gh_jobs=${gh_count} gl_jobs=${gl_count}"
  [ "$gh_count" -gt 0 ]
  [ "$gl_count" -gt 0 ]
}

@test "gitlab-job-coverage: jeder ci.yml-Offline-Gate-Job hat ein GitLab-Gegenstueck" {
  run python3 - "$CI_YML" "$GL_YML" <<'PY'
import sys, yaml

# Zuordnung GitHub-Job -> GitLab-Job. Der Wert None bedeutet "bewusst ausgelassen";
# die Begruendung steht daneben und ist Teil der Zusicherung, nicht Beiwerk.
MAPPING = {
    "test-bats":              "bats-unit",
    "test-manifests":         "manifests",
    "test-factory-openspec":  "factory-openspec",
    "test-factory-shard":     "factory-shard",
    # Aggregator ohne Gegenstueck: test-factory existiert auf GitHub ausschliesslich,
    # weil ein UEBERSPRUNGENER Required Check in der Branch Protection als bestanden
    # zaehlt. GitLab kennt diese Semantik nicht — ein nicht gelaufener Job laesst die
    # Pipeline nicht gruen werden. Den Job zu spiegeln hiesse, eine Plattform-Eigenheit
    # nachzubauen statt ihrer Wirkung. (design.md D3)
    "test-factory":           None,
    "security-scan":          "gitleaks",
    "brett-typescript":       "brett-typescript",
    "vitest-website":         "vitest-website",
    "commit-lint":            "commit-lint",
    "lighthouse":             "lighthouse",
}

with open(sys.argv[1]) as fh:
    gh = yaml.safe_load(fh) or {}
with open(sys.argv[2]) as fh:
    gl = yaml.safe_load(fh) or {}

gh_jobs = set((gh.get("jobs") or {}).keys())
RESERVED = {"stages", "variables", "default", "workflow", "include",
            "image", "before_script", "after_script"}
gl_jobs = {k for k, v in gl.items()
           if k not in RESERVED and not k.startswith(".") and isinstance(v, dict)}

problems = []

# 1) Jeder GitHub-Job ist in der Tabelle erfasst. Ein neu hinzugefuegter ci.yml-Job
#    faellt hier auf, statt die Luecke stillschweigend zu vergroessern.
for job in sorted(gh_jobs):
    if job not in MAPPING:
        problems.append(f"ci.yml-Job '{job}' ist in der Zuordnungstabelle nicht erfasst")

# 2) Jede nicht-ausgelassene Zuordnung zeigt auf einen real existierenden GitLab-Job.
for gh_job, gl_job in sorted(MAPPING.items()):
    if gh_job not in gh_jobs:
        problems.append(f"Tabelle nennt '{gh_job}', der in ci.yml nicht (mehr) existiert")
        continue
    if gl_job is None:
        continue
    if gl_job not in gl_jobs:
        problems.append(f"ci.yml-Job '{gh_job}' hat kein GitLab-Gegenstueck '{gl_job}'")

covered = sum(1 for v in MAPPING.values() if v is not None)
print(f"Anker: ci.yml-Jobs={len(gh_jobs)} gitlab-Jobs={len(gl_jobs)} zugeordnet={covered}")
for p in problems:
    print("FEHLT:", p)
sys.exit(1 if problems else 0)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "gitlab-job-coverage: die Spec-Suite laeuft in vier Partitionen" {
  run python3 - "$GL_YML" <<'PY'
import sys, yaml
with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}
job = doc.get("factory-shard")
if not isinstance(job, dict):
    print("FEHLT: Job 'factory-shard' existiert nicht")
    sys.exit(1)
parallel = job.get("parallel")
print(f"Anker: parallel={parallel!r}")
# parallel kann eine Zahl oder ein matrix-Dict sein; hier ist die Zahl gefordert.
sys.exit(0 if parallel == 4 else 1)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "gitlab-job-coverage: die Shard-Partition wird auf SPEC_SHARD/SPEC_SHARDS abgebildet" {
  # Die Repo-Mechanik (Taskfile.yml, scripts/spec-shard.sh) liest ausschliesslich diese
  # beiden Namen. Ein Job mit parallel: 4, der sie nicht setzt, laeuft viermal dieselbe
  # vollstaendige Suite — vierfache Laufzeit bei unveraenderter Abdeckung, und nichts
  # daran waere rot.
  run python3 - "$GL_YML" <<'PY'
import sys, yaml
with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}
job = doc.get("factory-shard") or {}
blob = yaml.safe_dump(job)
have_shard  = "SPEC_SHARD" in blob and "CI_NODE_INDEX" in blob
have_shards = "SPEC_SHARDS" in blob and "CI_NODE_TOTAL" in blob
print(f"Anker: SPEC_SHARD<-CI_NODE_INDEX={have_shard} SPEC_SHARDS<-CI_NODE_TOTAL={have_shards}")
sys.exit(0 if (have_shard and have_shards) else 1)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "gitlab-job-coverage: die neuen Jobs sind interruptible" {
  # Auf einem Runner, der laut Etappe-2-Messung 2-3x langsamer ist als SaaS, belegt eine
  # ueberholte Pipeline Kapazitaet, die die aktuelle braucht.
  run python3 - "$GL_YML" <<'PY'
import sys, yaml
NEW_JOBS = ["factory-openspec", "factory-shard", "brett-typescript",
            "vitest-website", "commit-lint", "lighthouse"]
with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}
missing = []
checked = 0
for name in NEW_JOBS:
    job = doc.get(name)
    if not isinstance(job, dict):
        missing.append(f"{name} (Job fehlt)")
        continue
    checked += 1
    if job.get("interruptible") is not True:
        missing.append(f"{name} (interruptible nicht gesetzt)")
print(f"Anker: geprueft={checked} von {len(NEW_JOBS)}")
for m in missing:
    print("FEHLT:", m)
sys.exit(1 if missing else 0)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}
