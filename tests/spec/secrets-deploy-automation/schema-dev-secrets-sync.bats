#!/usr/bin/env bats
# tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats — [T003141]
# SSOT: openspec/specs/secrets-deploy-automation.md
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4). Jeder Test fuehrt python3 gegen die
# echten Dateien aus und prueft dessen Exit-Code und Ausgabe — kein grep auf
# Implementierungsquellen. Semantik statt Darstellung (T002716): geprueft wird die
# Anwesenheit/Abwesenheit von SCHLUESSELNAMEN, nicht ein Ausgabeformat.
#
# Sicherheitshinweis: Diese Datei verarbeitet ausschliesslich Schluessel-NAMEN.
# Secret-WERTE werden nie gelesen, verglichen oder ausgegeben.
#
# Hintergrund: tests/unit/secrets-sync.bats meldet die Abweichung zwischen
# environments/schema.yaml und k3d/secrets.yaml erst als grosse Sammelliste. Diese
# Guards machen die zwei Driftrichtungen einzeln und mit Begruendungspflicht sichtbar:
# environments/schema.yaml ist die autoritative Liste (CLAUDE.md), eine bewusste
# Abwesenheit in der Dev-Datei muss dort als `dev_absent: true` + `dev_absent_reason`
# annotiert sein statt stillschweigend geduldet zu werden.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCHEMA="${REPO_ROOT}/environments/schema.yaml"
  DEV_SECRETS="${REPO_ROOT}/k3d/secrets.yaml"
}

# Gibt "<anzahl_secrets> <anzahl_dev_absent>" aus — dient als Positiv-Anker.
_anchor_counts() {
  python3 - "$SCHEMA" <<'PY'
import sys, yaml
s = yaml.safe_load(open(sys.argv[1]))
secs = s.get('secrets', []) or []
print(len(secs), sum(1 for x in secs if x.get('dev_absent') is True))
PY
}

@test "every dev_absent secret carries a non-empty dev_absent_reason and is not required" {
  # Positiv-Anker (T002356-M1): Schema parst, enthaelt Secrets, und mindestens ein
  # Eintrag ist ueberhaupt als dev_absent annotiert. Ohne diesen Anker waere die
  # Negativaussage unten vakuos erfuellt, solange die Annotation fehlt.
  run _anchor_counts
  [ "$status" -eq 0 ]
  local total dev_absent
  total="$(echo "$output" | awk '{print $1}')"
  dev_absent="$(echo "$output" | awk '{print $2}')"
  echo "Anker: secrets=${total} dev_absent=${dev_absent}"
  [ "$total" -gt 0 ]
  [ "$dev_absent" -gt 0 ]

  run python3 - "$SCHEMA" <<'PY'
import sys, yaml
s = yaml.safe_load(open(sys.argv[1]))
bad = []
for x in s.get('secrets', []) or []:
    if x.get('dev_absent') is not True:
        continue
    if not str(x.get('dev_absent_reason', '') or '').strip():
        bad.append(f"{x['name']}: dev_absent without dev_absent_reason")
    if x.get('required') is True:
        bad.append(f"{x['name']}: required:true must not be dev_absent")
for line in bad:
    print(line)
sys.exit(1 if bad else 0)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "no dev_absent secret is present in k3d/secrets.yaml workspace-secrets" {
  run python3 - "$SCHEMA" "$DEV_SECRETS" <<'PY'
import sys, yaml
schema = yaml.safe_load(open(sys.argv[1]))
absent = {x['name'] for x in (schema.get('secrets') or []) if x.get('dev_absent') is True}
dev = set()
for doc in yaml.safe_load_all(open(sys.argv[2])):
    if doc and doc.get('kind') == 'Secret' and doc.get('metadata', {}).get('name') == 'workspace-secrets':
        dev |= set((doc.get('stringData') or doc.get('data') or {}).keys())
# Positiv-Anker: beide Seiten muessen ueberhaupt Eintraege haben, sonst ist die
# Schnittmengen-Aussage bedeutungslos.
print(f"Anker: dev_keys={len(dev)} dev_absent={len(absent)}")
if not dev or not absent:
    sys.exit(2)
stale = sorted(absent & dev)
for k in stale:
    print(f"stale dev_absent annotation (key IS present in dev): {k}")
sys.exit(1 if stale else 0)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "legacy Keycloak-era *_OIDC_SECRET keys are gone from k3d/secrets.yaml workspace-secrets" {
  run python3 - "$SCHEMA" "$DEV_SECRETS" <<'PY'
import sys, yaml
LEGACY = [
    "BRAINSTORM_OIDC_SECRET", "CLAUDE_CODE_OIDC_SECRET", "COMFY_OIDC_SECRET",
    "DOCS_OIDC_SECRET", "MAIL_OIDC_SECRET", "NEXTCLOUD_OIDC_SECRET",
    "RECOVERY_OIDC_SECRET", "TRAEFIK_OIDC_SECRET", "VAULTWARDEN_OIDC_SECRET",
    "WEBSITE_OIDC_SECRET",
]
schema = yaml.safe_load(open(sys.argv[1]))
known = {x['name'] for x in (schema.get('secrets') or [])}
dev = set()
for doc in yaml.safe_load_all(open(sys.argv[2])):
    if doc and doc.get('kind') == 'Secret' and doc.get('metadata', {}).get('name') == 'workspace-secrets':
        dev |= set((doc.get('stringData') or doc.get('data') or {}).keys())
# Positiv-Anker: die Nachfolger-Namensfamilie POCKET_ID_*_SECRET muss im Schema
# existieren UND die Dev-Datei muss Schluessel haben. Sonst wuerde ein leeres
# Parsing-Ergebnis die Negativaussage trivial erfuellen.
successors = sorted(k for k in known if k.startswith("POCKET_ID_") and k.endswith("_SECRET"))
print(f"Anker: dev_keys={len(dev)} pocket_id_successors={len(successors)}")
if not dev or len(successors) < 10:
    sys.exit(2)
found = sorted(k for k in LEGACY if k in dev)
for k in found:
    print(f"legacy Keycloak key still in dev secrets: {k}")
sys.exit(1 if found else 0)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}

@test "POCKET_ID_CLAUDE_CODE_SECRET is declared in environments/schema.yaml" {
  # Der Schluessel wird von k3d/pocket-id-client-seed.yaml konsumiert, fehlt aber
  # im autoritativen Schema — echte Luecke, kein Orphan zum Loeschen.
  run python3 - "$SCHEMA" <<'PY'
import sys, yaml
schema = yaml.safe_load(open(sys.argv[1]))
known = {x['name'] for x in (schema.get('secrets') or [])}
print(f"Anker: schema_secrets={len(known)}")
if not known:
    sys.exit(2)
sys.exit(0 if "POCKET_ID_CLAUDE_CODE_SECRET" in known else 1)
PY
  echo "$output"
  [ "$status" -eq 0 ]
}
