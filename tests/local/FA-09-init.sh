#!/usr/bin/env bash
# FA-09-init: billing-bot-init-job — Manifest-Validierung und Cluster-Zustand
# Prüft: YAML-Struktur, RBAC-Verben, Kustomize-Einbindung, Idempotenz-Konsistenz,
#        sowie den Live-Zustand des Jobs und des Tokens im Cluster.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"
JOB_MANIFEST="${PROJECT_DIR}/k3d/billing-bot-init-job.yaml"
KUSTOMIZATION="${PROJECT_DIR}/k3d/kustomization.yaml"
SECRETS_MANIFEST="${PROJECT_DIR}/k3d/secrets.yaml"
PLACEHOLDER="devbillingbotmmtoken1234567890abc"

# ── Gruppe A: YAML-Struktur ─────────────────────────────────────

# A1: Datei enthält genau 4 YAML-Dokumente (SA + Role + RoleBinding + Job)
DOC_COUNT=$(python3 -c \
  "import yaml; print(len([d for d in yaml.safe_load_all(open('${JOB_MANIFEST}')) if d]))" \
  2>/dev/null || echo "0")
assert_eq "$DOC_COUNT" "4" "FA-09" "Init-A1" \
  "billing-bot-init-job.yaml hat 4 YAML-Dokumente (SA+Role+RB+Job)"

# A2–A5: Alle 4 Ressourcentypen sind vorhanden
for KIND in ServiceAccount Role RoleBinding Job; do
  FOUND=$(python3 -c \
    "import yaml; docs=list(yaml.safe_load_all(open('${JOB_MANIFEST}'))); \
     print('ok' if any(d.get('kind')=='${KIND}' for d in docs if d) else '')" \
    2>/dev/null || echo "")
  assert_eq "$FOUND" "ok" "FA-09" "Init-A-${KIND}" \
    "${KIND} billing-bot-init in Manifest vorhanden"
done

# ── Gruppe B: RBAC-Verben ───────────────────────────────────────

ROLE_RULES=$(python3 -c "
import yaml, json
docs = list(yaml.safe_load_all(open('${JOB_MANIFEST}')))
role = next((d for d in docs if d and d.get('kind') == 'Role'), None)
print(json.dumps(role.get('rules', []) if role else []))
" 2>/dev/null || echo "[]")

# B1–B2: secrets → get + patch
for VERB in get patch; do
  HAS=$(echo "$ROLE_RULES" | python3 -c "
import sys, json
rules = json.load(sys.stdin)
print('ok' if any('secrets' in r.get('resources',[]) and '${VERB}' in r.get('verbs',[]) for r in rules) else '')
" 2>/dev/null || echo "")
  assert_eq "$HAS" "ok" "FA-09" "Init-B-secrets-${VERB}" \
    "Role: secrets verb '${VERB}' vorhanden"
done

# B3–B4: pods → get + list
for VERB in get list; do
  HAS=$(echo "$ROLE_RULES" | python3 -c "
import sys, json
rules = json.load(sys.stdin)
print('ok' if any('pods' in r.get('resources',[]) and 'pods/exec' not in r.get('resources',[]) and '${VERB}' in r.get('verbs',[]) for r in rules) else '')
" 2>/dev/null || echo "")
  assert_eq "$HAS" "ok" "FA-09" "Init-B-pods-${VERB}" \
    "Role: pods verb '${VERB}' vorhanden"
done

# B5: pods/exec → create
EXEC_OK=$(echo "$ROLE_RULES" | python3 -c "
import sys, json
rules = json.load(sys.stdin)
print('ok' if any('pods/exec' in r.get('resources',[]) and 'create' in r.get('verbs',[]) for r in rules) else '')
" 2>/dev/null || echo "")
assert_eq "$EXEC_OK" "ok" "FA-09" "Init-B-pods-exec-create" \
  "Role: pods/exec verb 'create' vorhanden"

# B6–B7: deployments (apps) → get + patch
for VERB in get patch; do
  HAS=$(echo "$ROLE_RULES" | python3 -c "
import sys, json
rules = json.load(sys.stdin)
print('ok' if any('deployments' in r.get('resources',[]) and '${VERB}' in r.get('verbs',[]) for r in rules) else '')
" 2>/dev/null || echo "")
  assert_eq "$HAS" "ok" "FA-09" "Init-B-deployments-${VERB}" \
    "Role: deployments verb '${VERB}' vorhanden"
done

# ── Gruppe C: Kustomize-Einbindung und Konsistenz ───────────────

# C1: kustomization.yaml referenziert die Job-Datei
KUST_REF=$(grep -c "billing-bot-init-job.yaml" "$KUSTOMIZATION" 2>/dev/null || echo "0")
assert_gt "$KUST_REF" "0" "FA-09" "Init-C1" \
  "kustomization.yaml referenziert billing-bot-init-job.yaml"

# C2: Job-Datei steht nach billing-bot.yaml in kustomization.yaml
KUST_ORDER=$(python3 -c "
lines = open('${KUSTOMIZATION}').readlines()
idxs = {l.strip(): i for i, l in enumerate(lines)}
bot = idxs.get('- billing-bot.yaml', -1)
init = idxs.get('- billing-bot-init-job.yaml', -1)
print('ok' if bot >= 0 and init > bot else '')
" 2>/dev/null || echo "")
assert_eq "$KUST_ORDER" "ok" "FA-09" "Init-C2" \
  "billing-bot-init-job.yaml steht nach billing-bot.yaml in kustomization.yaml"

# C3: Placeholder in secrets.yaml stimmt mit Idempotenz-Check im Job überein
IN_SECRETS=$(grep -c "$PLACEHOLDER" "$SECRETS_MANIFEST" 2>/dev/null || echo "0")
IN_JOB=$(grep -c "$PLACEHOLDER" "$JOB_MANIFEST" 2>/dev/null || echo "0")
assert_gt "$IN_SECRETS" "0" "FA-09" "Init-C3a" \
  "Idempotenz-Placeholder in secrets.yaml vorhanden"
assert_gt "$IN_JOB" "0" "FA-09" "Init-C3b" \
  "Idempotenz-Placeholder in billing-bot-init-job.yaml referenziert"

# C4: autocomplete-Flags sind korrekt (kein 'auto-complete' mit Bindestrich)
HYPHEN_FLAGS=$(grep -c -- "--auto-complete[^D]" "$JOB_MANIFEST" 2>/dev/null; true)
assert_eq "$HYPHEN_FLAGS" "0" "FA-09" "Init-C4" \
  "Keine veralteten --auto-complete-Flags (mmctl nutzt --autocomplete)"

# C5: Token-Parsing-Regex extrahiert erstes Feld (nicht letztes)
# Correct pattern anchors at ^ (extracts token before ':'), not at $ (which extracts description)
SED_PATTERN=$(grep "sed -n" "$JOB_MANIFEST" | head -1 || echo "")
assert_contains "$SED_PATTERN" "s/^" "FA-09" "Init-C5" \
  "Token-Parsing-Regex beginnt am Zeilenanfang (extrahiert Token, nicht Beschreibung)"

# ── Gruppe D: Live-Cluster-Tests (übersprungen ohne Cluster) ─────

SKIP_REASON=""
if ! kubectl cluster-info &>/dev/null 2>&1; then
  SKIP_REASON="Kein Cluster verfügbar"
elif ! kubectl get job billing-bot-init -n "$NAMESPACE" &>/dev/null 2>&1; then
  SKIP_REASON="Job noch nicht deployed (task workspace:deploy noch nicht ausgeführt)"
fi

if [[ -n "$SKIP_REASON" ]]; then
  skip_test "FA-09" "Init-D1" "billing-bot-init-job Job abgeschlossen" "$SKIP_REASON"
  skip_test "FA-09" "Init-D2" "BILLING_BOT_MM_TOKEN != Placeholder" "$SKIP_REASON"
  skip_test "FA-09" "Init-D3" "billing-bot Deployment bereit" "$SKIP_REASON"
else
  # D1: Job hat succeeded
  JOB_SUCCEEDED=$(kubectl get job billing-bot-init -n "$NAMESPACE" \
    -o jsonpath='{.status.succeeded}' 2>/dev/null || echo "0")
  assert_gt "${JOB_SUCCEEDED:-0}" "0" "FA-09" "Init-D1" \
    "billing-bot-init-job erfolgreich abgeschlossen (status.succeeded > 0)"

  # D2: Token ist nicht mehr der Placeholder
  LIVE_TOKEN=$(kubectl get secret workspace-secrets -n "$NAMESPACE" \
    -o jsonpath='{.data.BILLING_BOT_MM_TOKEN}' 2>/dev/null \
    | base64 -d 2>/dev/null || echo "")
  TOKEN_REPLACED="false"
  [[ -n "$LIVE_TOKEN" && "$LIVE_TOKEN" != "$PLACEHOLDER" ]] && TOKEN_REPLACED="true"
  assert_eq "$TOKEN_REPLACED" "true" "FA-09" "Init-D2" \
    "BILLING_BOT_MM_TOKEN wurde durch echten Bot-Token ersetzt"

  # D3: billing-bot Deployment ist ready
  BOT_READY=$(kubectl get deployment billing-bot -n "$NAMESPACE" \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
  assert_gt "${BOT_READY:-0}" "0" "FA-09" "Init-D3" \
    "billing-bot Deployment bereit nach Token-Provisionierung"
fi
