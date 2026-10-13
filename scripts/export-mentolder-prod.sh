#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/export-mentolder-prod.sh — Export der Mentolder-Produktions-
# umgebung in einen sauberen Baum fuer das eigenstaendige Gekko-Repo.
# (Chore T016564: Split-Off der Mentolder-Prod in ein eigenes Repo.)
#
# Usage:
#   bash scripts/export-mentolder-prod.sh --out <leeres-verzeichnis> [--ref <git-ref>]
#
# Vertrag:
# - Kopiert den Prod-only-Satz (INVENTORY.md) aus dem current checkout;
#   git-crypt-verwaltete Dateien werden per `git show <ref>:<pfad>` als
#   CIPHERTEXT uebernommen — niemals entschluesselt, egal ob der Checkout
#   entsperrt ist oder nicht.
# - Templates aus docs/handover/mentolder-gekko/templates/ werden darueber
#   gelegt (neue-Repo-Dateien mit __GEKKO_*__-Platzhaltern).
# - Fail-closed: fehlende Quelle oder vorhandene Zieldateien brechen ab.
# - Schreibt MANIFEST.sha256 (SHA256 ueber alle Export-Dateien).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_DIR="${REPO_ROOT}/docs/handover/mentolder-gekko/templates"

OUT=""
REF="HEAD"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    *) echo "Unknown argument: $1 (usage: --out <dir> [--ref <git-ref>])" >&2; exit 1 ;;
  esac
done

if [[ -z "$OUT" ]]; then
  echo "ERROR: --out fehlt." >&2
  exit 1
fi
if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "ERROR: Template-Verzeichnis fehlt: $TEMPLATE_DIR" >&2
  exit 1
fi
if [[ -e "$OUT" ]] && [[ -n "$(ls -A "$OUT" 2>/dev/null)" ]]; then
  echo "ERROR: Zielverzeichnis ist nicht leer: $OUT" >&2
  exit 1
fi
mkdir -p "$OUT"

# ── 1. Verbatim-Dateien und -Verzeichnisse (Prod-only-Satz) ──────────
# Verzeichnisse werden via `git archive` gelesen (ref-fest, reproduzierbar).
VERBATIM_DIRS=(
  prod-fleet/mentolder
  prod-fleet/website-mentolder
  prod-fleet/website-common
  prod-fleet/coturn
  prod-fleet/platform
  prod-fleet/components
  prod-mentolder
  prod
  k3d
)
VERBATIM_FILES=(
  .gitattributes
  flux/clusters/fleet-gekko/ks-prod.yaml
  environments/schema.yaml
  environments/versions.yaml
  environments/fleet-mentolder.yaml
  environments/mentolder.yaml
  environments/sealed-secrets/fleet-mentolder.yaml
  environments/certs/fleet-mentolder.pem
  scripts/env-resolve.sh
  scripts/ci-dummy-secrets.sh
  scripts/render-guard.sh
  scripts/website-config-sha.sh
  scripts/resolve-image-digest.sh
  scripts/env-seal.sh
  scripts/secret-rotate.sh
  scripts/env-generate.sh
  scripts/lib/render-subst-list.sh
  scripts/lib/seal-extra-namespaces.sh
  scripts/lib/secrets-env.sh
  docs/runbooks/git-crypt-key-distribution.md
  docs/runbooks/credentials-finden.md
  docs/runbooks/business-restore.md
  docs/runbooks/gitlab-restore.md
  docs/runbooks/ssh-zugang-fleet.md
  docs/runbooks/pocket-id-bootstrap.md
  docs/fleet-stage2-cutover-runbook.md
  docs/adr/ADR-001-fleet-konsolidierung.md
  docs/adr/ADR-002-push-basiertes-deploy.md
  docs/adr/ADR-003-brand-namespace-split.md
)
# git-crypt-verwaltet: IMMER als Ciphertext aus dem Git-Objektspeicher.
GIT_CRYPT_FILES=(
  environments/.secrets/fleet-mentolder.yaml
  environments/.secrets/sealed-secrets-key.fleet.yaml
)

for d in "${VERBATIM_DIRS[@]}"; do
  if ! git -C "$REPO_ROOT" cat-file -e "${REF}:${d}" 2>/dev/null; then
    echo "ERROR: Quelle fehlt in ${REF}: ${d}" >&2
    exit 1
  fi
done
for f in "${VERBATIM_FILES[@]}" "${GIT_CRYPT_FILES[@]}"; do
  if ! git -C "$REPO_ROOT" cat-file -e "${REF}:${f}" 2>/dev/null; then
    echo "ERROR: Quelle fehlt in ${REF}: ${f}" >&2
    exit 1
  fi
done

git -C "$REPO_ROOT" archive "$REF" "${VERBATIM_DIRS[@]}" "${VERBATIM_FILES[@]}" | tar -x -C "$OUT"
for f in "${GIT_CRYPT_FILES[@]}"; do
  mkdir -p "$OUT/$(dirname "$f")"
  # Ciphertext-Pfad: git show liefert die gespeicherten (verschluesselten)
  # Bytes — unabhaengig vom Entsperr-Zustand dieses Checkouts.
  git -C "$REPO_ROOT" show "${REF}:${f}" > "$OUT/${f}"
done

# ── 2. Templates darueberlegen (neue-Repo-Dateien) ───────────────────
while IFS= read -r -d '' src; do
  rel="${src#$TEMPLATE_DIR/}"
  mkdir -p "$OUT/$(dirname "$rel")"
  cp "$src" "$OUT/$rel"
done < <(find "$TEMPLATE_DIR" -type f -print0)
chmod +x "$OUT/scripts/flux-render-artifact.sh"

# ── 3. Fail-closed-Nachpruefung ──────────────────────────────────────
# Kein Template-Platzhalter darf in verbatim uebernommenen Dateien stehen;
# umgekehrt muss jede Template-Datei mit Platzhalter auch einen enthalten
# (Schutz vor versehentlich aufgeloesten Platzhaltern).
if grep -rl "__GEKKO_" "$OUT/prod-fleet" "$OUT/prod-mentolder" "$OUT/prod" "$OUT/k3d" "$OUT/environments" "$OUT/scripts/env-resolve.sh" 2>/dev/null; then
  echo "ERROR: __GEKKO_-Platzhalter in verbatim Dateien — Export inkonsistent." >&2
  exit 1
fi
for must in flux/clusters/fleet-gekko/flux-instance.yaml \
            flux/clusters/fleet-gekko/source.yaml \
            flux/clusters/fleet-gekko/oci-source.yaml \
            Taskfile.yml \
            .github/workflows/render-fleet-artifact.yml; do
  if ! grep -q "__GEKKO_" "$OUT/$must"; then
    echo "ERROR: Platzhalter fehlt in Template-Datei: $must" >&2
    exit 1
  fi
done
# git-crypt-Filter muss im Export greifen (Schutz der .secrets-Dateien).
if ! grep -q "environments/.secrets" "$OUT/.gitattributes"; then
  echo "ERROR: git-crypt-Filter fehlt in exportierter .gitattributes." >&2
  exit 1
fi

# ── 4. Manifest ──────────────────────────────────────────────────────
(cd "$OUT" && find . -type f -not -name MANIFEST.sha256 | sort | xargs sha256sum > MANIFEST.sha256)
count="$(find "$OUT" -type f | wc -l)"
echo "export-mentolder-prod: $count Dateien nach $OUT (Ref $REF)"
echo "export-mentolder-prod: MANIFEST.sha256 geschrieben."
