#!/usr/bin/env bash
# scripts/korczewski-prod/render-stack.sh — rendert korczewski-prod/ offline in
# das viergeteilte OCI-Artefakt (design §2, ADR-016 D3). Zweite Instanz des
# Render-Vertrags neben scripts/devmesh/render-stack.sh; bewusst kopiert, nicht
# verallgemeinert (ein gemeinsamer Kern ist Folgearbeit, nicht Teil dieses Plans).
#
# Aufruf: render-stack.sh [--out <dir>]
#   ohne --out: ein Dokumentstrom auf stdout, jeder Teil mit "# === <teil> ==="
#               eingeleitet (Reihenfolge siehe unten).
#   --out <dir>: cluster-bootstrap/bootstrap.yaml, platform/platform.yaml,
#                apps/apps.yaml, secrets/sealed-secrets.yaml — das Layout, das
#                die vier Kustomizations aus flux/clusters/korczewski-prod
#                erwarten. Vorhandene Dateien werden ueberschrieben.
# Env:   keine Zusatzvariablen. Alle Werte kommen aus
#        environments/korczewski-prod.yaml plus den Schema-Defaults, geladen via
#        scripts/env-resolve.sh (gesourct, nie ausgefuehrt).
# Exit:  0 = Ausgabe erzeugt, 1 = Guard/Validierung, 2 = Vorbedingung fehlt.
#
# Werkzeug: kustomize, nicht kubectl kustomize wie im devmesh-Vorbild. Gruende:
# (a) lokal und CI rendern dieselbe Version statt der kubectl-Client-Version,
# (b) ein Render ohne Cluster-Zugriff braucht keinen Cluster-Client,
# (c) p3/p4 verifizieren bereits mit `kustomize build`, es entsteht also kein
# zweiter Werkzeugbegriff.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

for tool in kustomize envsubst python3 yq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "render-stack: $tool fehlt" >&2; exit 2; }
done

# shellcheck source=scripts/env-resolve.sh
source scripts/env-resolve.sh korczewski-prod

OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      [[ $# -ge 2 ]] || { echo "render-stack: --out erfordert ein Verzeichnis" >&2; exit 2; }
      OUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "render-stack: Argument '$1' unbekannt" >&2
      exit 2
      ;;
  esac
done

# Pflicht-Vorbedingungen (dieselben wie im Verify von p1 Task 1). Ohne sie
# schriebe envsubst `cidr: ""` und die NetworkPolicies waeren fail-open
# (design §9, Risiko 1).
[[ -n "${PROD_DOMAIN:-}" ]] || { echo "render-stack: PROD_DOMAIN leer (environments/korczewski-prod.yaml)" >&2; exit 2; }
[[ -n "${POD_CIDR:-}" ]] || { echo "render-stack: POD_CIDR leer (environments/korczewski-prod.yaml)" >&2; exit 2; }
[[ -n "${SERVICE_CIDR:-}" ]] || { echo "render-stack: SERVICE_CIDR leer (environments/korczewski-prod.yaml)" >&2; exit 2; }
# k3d/network-policies.yaml zieht POD_VTEP_IP; im Vorbild aus dem Pod-CIDR
# abgeleitet statt neu gesetzt.
export POD_VTEP_IP="${POD_VTEP_IP:-${POD_CIDR%%/*}}"

# Ein Ausgabepfad im Code: intern wird immer in ein Staging gerendert, stdout
# und --out unterscheiden sich erst beim Verteilen.
STAGE_ROOT="$(mktemp -d)"
trap 'rm -rf "$STAGE_ROOT"' EXIT
STAGE="$STAGE_ROOT/out"
SCRATCH="$STAGE_ROOT/scratch"
mkdir -p "$STAGE/cluster-bootstrap" "$STAGE/platform" "$STAGE/apps" "$STAGE/secrets" "$SCRATCH"

# Laufzeit-Variablen aus $${...} (Container-Shell), gesammelt ueber alle Teile.
# Sie duerfen nach dem Unwrapping als ${...} im Baum stehen bleiben und werden
# vom Leftover-Guard ausgenommen.
RUNTIME_VARS=""

# render_part <overlay> <ziel>: kustomize build -> Laufzeit-Variablen sammeln ->
# envsubst nur fuer gesetzte Variablen -> $$-Unwrapping.
render_part() {
  local overlay="$1" target="$2" v vars="" raw="$SCRATCH/raw.yaml"

  if ! kustomize build --load-restrictor=LoadRestrictionsNone "$overlay" >"$raw" 2>"$SCRATCH/kustomize.err"; then
    echo "render-stack: kustomize build $overlay fehlgeschlagen" >&2
    sed 's/^/  /' "$SCRATCH/kustomize.err" >&2
    exit 1
  fi
  [[ -s "$raw" ]] || { echo "render-stack: $overlay liefert keine Ressourcen" >&2; exit 1; }

  # 1. Laufzeit-Variablen zuerst und unveraendert einsammeln: k3d/pocket-id-client-seed.yaml
  # enthaelt $${SCHEME}, $${API}, $${page}, $${secret_key} und weitere Shell-Variablen
  # des Seed-Jobs. Ohne diesen Schritt wuerde envsubst sie leeren und das Seed-Skript
  # der Auth-Kette zerstoeren.
  while IFS= read -r v; do
    if [[ -n "$v" ]]; then
      RUNTIME_VARS+="$v "
    fi
  done < <(grep -oE '\$\$(\{)?[A-Za-z_][A-Za-z0-9_]*\}?' "$raw" \
    | sed -E 's/^\$\$\{//; s/^\$\$//; s/\}$//' | sort -u || true)

  # 2. Subst-Liste: nur Namen, die gesetzt sind. Eine gesetzte-aber-leere Variable
  # (etwa POCKET_ID_FALLBACK_URL="") wird zu "", eine gar nicht gesetzte bleibt als
  # ${VAR} stehen und laeuft in den Leftover-Guard — fail-closed statt stiller Leerung.
  # Das fuehrende [^$] haelt $${...} aus der Liste heraus.
  while IFS= read -r v; do
    if [[ -n "$v" ]] && [[ -n "${!v+x}" ]]; then
      vars+="\$$v "
    fi
  done < <(grep -oE '(^|[^$])\$\{[A-Za-z_][A-Za-z0-9_]*\}' "$raw" \
    | sed -E 's/.*\$\{//; s/\}$//' | sort -u || true)

  if [[ -n "$vars" ]]; then
    envsubst "$vars" <"$raw" | sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g' >"$target"
  else
    sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g' "$raw" >"$target"
  fi
}

render_part korczewski-prod/cluster-bootstrap "$STAGE/cluster-bootstrap/bootstrap.yaml"
render_part korczewski-prod/platform "$STAGE/platform/platform.yaml"
render_part korczewski-prod/website "$STAGE/apps/website.yaml"
render_part korczewski-prod/auth "$STAGE/apps/auth.yaml"

# Website und Auth bilden einen Strom: p2 setzt in ks-apps.yaml genau einen Pfad
# ./apps, und eine Meta-Kustomization korczewski-prod/kustomization.yaml gibt es
# bewusst nicht (design §5) — der Renderer ist die einzige Stelle, die alle vier
# Teile zusammenkennt.
{
  printf '# === website ===\n'
  cat "$STAGE/apps/website.yaml"
  printf -- '---\n# === auth ===\n'
  cat "$STAGE/apps/auth.yaml"
} >"$STAGE/apps/apps.yaml"
rm -f "$STAGE/apps/website.yaml" "$STAGE/apps/auth.yaml"

# Secrets sind eine reine Kopie: kein envsubst, kein yq-Roundtrip. Der Ciphertext
# muss byte-identisch bleiben, sonst ist er fuer den Sealed-Secrets-Controller
# nicht mehr pruefbar. In der Datei steht kein ${...}; RUNTIME_VARS/envsubst
# beruehren sie deshalb nicht.
SECRETS_SRC="environments/sealed-secrets/korczewski-prod.yaml"
[[ -f "$SECRETS_SRC" ]] || { echo "render-stack: $SECRETS_SRC fehlt" >&2; exit 1; }
cp "$SECRETS_SRC" "$STAGE/secrets/sealed-secrets.yaml"

# Sechs fail-closed Guards ueber den gerenderten Baum. Jeder Befund beendet den
# Lauf mit Exit 1 und nennt die betroffenen Dateien — nie eine Warnung, nie ein
# stiller Default.
validate_tree() {
  local dir="$1" f bad name
  local -a files=(
    "$dir/cluster-bootstrap/bootstrap.yaml"
    "$dir/platform/platform.yaml"
    "$dir/apps/apps.yaml"
    "$dir/secrets/sealed-secrets.yaml"
  )

  # 1. Leere oder unparsebare Ausgabe. Ein nicht-leerer, aber unparsebarer oder
  # apiVersion-loser Baum ist derselbe Fehler wie eine leere Datei. Dateiweise,
  # damit der Befund die Datei nennt; der Ausdruck endet bewusst auf einem Pfad
  # (.kind) und nicht auf einem String-Literal — Literale wertet yq je Dokument
  # unabhaengig vom select aus und ein Befund entstuende auch ohne Treffer.
  for f in "${files[@]}"; do
    [[ -s "$f" ]] || { echo "render-stack: $f ist leer" >&2; exit 1; }
  done
  for f in "${files[@]}"; do
    if ! bad="$(yq ea 'select((.apiVersion // "") == "") | .kind' "$f" 2>&1)"; then
      echo "render-stack: $f ist nicht parsebar (Guard 1)" >&2
      printf '%s\n' "$bad" | sed 's/^/  /' >&2
      exit 1
    fi
    if [[ -n "$bad" ]]; then
      echo "render-stack: $f enthaelt ein Dokument ohne apiVersion (Guard 1):" >&2
      printf '%s\n' "$bad" | sed 's/^/  /' >&2
      exit 1
    fi
  done

  # 2. ${-Reste. Laufzeit-Variablen ($${...} vor dem Unwrapping) sind die einzige
  # Ausnahme: $${SCHEME} steht absichtlich als ${SCHEME} im Job-Skript.
  bad="$(grep -ohE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' "${files[@]}" | sort -u || true)"
  if [[ -n "$bad" ]]; then
    for name in $RUNTIME_VARS; do
      bad="$(grep -vxF "\${$name}" <<<"$bad" || true)"
    done
  fi
  if [[ -n "$bad" ]]; then
    echo "render-stack: ungesetzte Render-Variablen im Baum (Guard 2):" >&2
    printf '%s\n' "$bad" | sed 's/^/  /' >&2
    exit 1
  fi

  # 3. Fremdreferenzen: derselbe Vertrag, den der Workflow als Render-Gate faehrt.
  bad="$(grep -nHE 'mentolder\.de|fleet-manifests|workspace-dev|devmesh\.korczewski\.de' "${files[@]}" || true)"
  if [[ -n "$bad" ]]; then
    echo "render-stack: Fremdreferenz im gerenderten Baum (Guard 3):" >&2
    printf '%s\n' "$bad" | sed 's/^/  /' >&2
    exit 1
  fi

  # 4. Digest-Pinning: jedes image: endet auf @sha256:<64 Hex>. Faengt auch die
  # leere Substitution von WEBSITE_IMAGE_DIGEST (Wert endet dann auf "@"), die
  # ein reiner Leftover-Check nicht sieht.
  bad="$(grep -hoE '^[[:space:]]*image:[[:space:]]*[^[:space:]]+' "${files[@]}" \
    | sed -E 's/^[[:space:]]*image:[[:space:]]*//; s/^"//; s/"$//' \
    | grep -vE '@sha256:[0-9a-f]{64}$' || true)"
  if [[ -n "$bad" ]]; then
    echo "render-stack: image ohne Digest-Pinning (Guard 4):" >&2
    printf '%s\n' "$bad" | sed 's/^/  /' >&2
    exit 1
  fi

  # 5. Keine breite Cluster-Rolle. Baumweit statt AST-genau: jede Fundstelle steht
  # in einem Rollen-Block, und auch ein Rollen-*Name* mit dieser Zeichenfolge soll
  # verboten sein (design §3, C2).
  bad="$(grep -nHE 'cluster-admin' "${files[@]}" || true)"
  if [[ -n "$bad" ]]; then
    echo "render-stack: breite Cluster-Rolle im Baum (Guard 5; roleRef/subjects pruefen):" >&2
    printf '%s\n' "$bad" | sed 's/^/  /' >&2
    exit 1
  fi

  # 6. Kein Klartext-Secret. Der Grund, warum der Workflow ohne
  # scripts/ci-dummy-secrets.sh auskommt: das Dummy-Skript schriebe k3d/secrets.yaml
  # als Klartext-Secret, das hier korrekt scheitern wuerde.
  for f in "${files[@]}"; do
    bad="$(yq ea 'select(.kind == "Secret") | .metadata.name' "$f" 2>/dev/null || true)"
    if [[ -n "$bad" ]]; then
      echo "render-stack: Klartext-Secret in $f (Guard 6):" >&2
      printf '%s\n' "$bad" | sed 's/^/  /' >&2
      exit 1
    fi
  done
}

validate_tree "$STAGE"

if [[ -n "$OUT_DIR" ]]; then
  mkdir -p "$OUT_DIR/cluster-bootstrap" "$OUT_DIR/platform" "$OUT_DIR/apps" "$OUT_DIR/secrets"
  cp "$STAGE/cluster-bootstrap/bootstrap.yaml" "$OUT_DIR/cluster-bootstrap/bootstrap.yaml"
  cp "$STAGE/platform/platform.yaml" "$OUT_DIR/platform/platform.yaml"
  cp "$STAGE/apps/apps.yaml" "$OUT_DIR/apps/apps.yaml"
  cp "$STAGE/secrets/sealed-secrets.yaml" "$OUT_DIR/secrets/sealed-secrets.yaml"
  exit 0
fi

# stdout-Strom. Die Flux-Reihenfolge ist bootstrap -> platform -> secrets -> apps
# (design §2), aber jeder Teil liegt im Artefakt in einer eigenen Datei; die
# Reihenfolge im Strom hat fuer Flux keine Semantik. Deshalb stehen die Secrets
# hier zuletzt — sonst setzt der Ciphertext eine Trennlinie mitten in die
# Manifeste, ohne dass ein Leser daraus etwas ueber die Sync-Kette lernt.
first=1
for part in cluster-bootstrap platform apps secrets; do
  case "$part" in
    cluster-bootstrap) f="$STAGE/cluster-bootstrap/bootstrap.yaml" ;;
    platform) f="$STAGE/platform/platform.yaml" ;;
    apps) f="$STAGE/apps/apps.yaml" ;;
    secrets) f="$STAGE/secrets/sealed-secrets.yaml" ;;
  esac
  if (( first )); then
    first=0
  else
    printf -- '---\n'
  fi
  printf '# === %s ===\n' "$part"
  cat "$f"
done
