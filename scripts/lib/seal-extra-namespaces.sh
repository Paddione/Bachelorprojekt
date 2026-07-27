#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# seal-extra-namespaces.sh — Extracted from scripts/env-seal.sh
# ═══════════════════════════════════════════════════════════════════
# Seals SealedSecret resources for entries declared under
# `extra_namespaces` in environments/schema.yaml.
#
# Originally inlined in scripts/env-seal.sh (lines 410–517). Extracted
# to keep the main script under the S1 line-budget while adding the
# required-flag handling for empty values.
#
# Behaviour (T001198, G-CD01 root-cause):
#   - required: true  + empty value → die (fail-closed)
#   - required: false + empty value → emit key with "" (deterministic)
#   - missing required flag         → fail-closed (default true)
#
# Typed secrets, dockerconfigjson and per-entry output files (T002254):
#   - mapping.type        → secret type of the generated manifest (default Opaque)
#   - mapping.registry    + mapping.username_key → build a .dockerconfigjson
#                           blob from username + token instead of a raw value
#   - mapping.output_file → repo-relative file the document is written to
#                           (rewritten in full) instead of the collected
#                           environments/sealed-secrets/<env>.yaml
#
# Sourced from scripts/env-seal.sh. Not executable on its own.
# ═══════════════════════════════════════════════════════════════════
# shellcheck disable=SC2155

# Root that `output_file` paths are resolved against. Overridable so tests
# never write into the real repo tree.
SEAL_OUTPUT_ROOT="${SEAL_OUTPUT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# parse_extra_namespace_entries <schema_file>
# Emits one tab-separated line per tuple:
#   src<TAB>ns<TAB>sec<TAB>dest<TAB>required<TAB>owner_brand_csv<TAB>type
#   <TAB>output_file<TAB>registry<TAB>username_key
# owner_brand_csv is a comma-separated list (e.g. "mentolder" or
# "mentolder,korczewski"); empty when the schema field is absent
# (backwards-compat default = no owner_ownership filter). Absent optional
# fields are emitted as "-" and decoded back to "" by the reader — TAB is IFS
# whitespace, so bash `read` would otherwise collapse consecutive empty fields
# and shift every following column (T002254).
parse_extra_namespace_entries() {
  local schema_file="$1"
  SCHEMA="$schema_file" WORKSPACE_NS="${WORKSPACE_NS:-workspace}" WEBSITE_NS="${WEBSITE_NS:-website}" python3 <<'PY'
import os, sys, yaml
with open(os.environ["SCHEMA"]) as f:
    schema = yaml.safe_load(f) or {}
workspace_ns = os.environ.get("WORKSPACE_NS", "workspace")
website_ns = os.environ.get("WEBSITE_NS", "website")
ns_remap = {"workspace": workspace_ns, "website": website_ns}
for entry in schema.get("secrets") or []:
    src = entry["name"]
    required = entry.get("required", True)
    for mapping in entry.get("extra_namespaces") or []:
        ns = ns_remap.get(mapping["namespace"], mapping["namespace"])
        sec = mapping["secret"]
        dest = mapping.get("dest_key") or src
        owner_brand = mapping.get("owner_brand") or []
        ob_csv = ",".join(str(b) for b in owner_brand) or "-"
        stype = mapping.get("type") or "-"
        out_file = mapping.get("output_file") or "-"
        registry = mapping.get("registry") or "-"
        user_key = mapping.get("username_key") or "-"
        print(f"{src}\t{ns}\t{sec}\t{dest}\t{required}\t{ob_csv}\t"
              f"{stype}\t{out_file}\t{registry}\t{user_key}")
PY
}

# build_dockerconfigjson <registry> <username> <token>
# Emits {"auths":{"<registry>":{"auth":"<base64 of user:token>"}}} on stdout.
# Deliberately silent otherwise — the caller must not log the result.
build_dockerconfigjson() {
  local auth
  auth=$(printf '%s:%s' "$2" "$3" | base64 | tr -d '\n')
  printf '{"auths":{"%s":{"auth":"%s"}}}' "$1" "$auth"
}

# build_secret_manifest <tmp_manifest> <ns> <sname> <mappings> <secrets_file> \
#                       [owner_brand_csv] [secret_type]
# Writes the input Secret manifest to <tmp_manifest> (or empty string if
# all keys were missing/empty). Honours the per-entry `required` flag:
#   - required: true + empty value → die
#   - required: false + empty value → emit key with ""
# Sets the global DEST_LIST to a space-separated list of emitted keys and
# NONEMPTY_COUNT to the number of keys that carried an actual value (T002254 —
# the caller uses it to leave an `output_file` untouched instead of writing a
# document full of empty strings over a live bootstrap ciphertext).
# secret_type defaults to Opaque.
# If owner_brand_csv is non-empty, writes the annotation
# `secrets.bachelorprojekt/owner-brand` on the Secret metadata.
build_secret_manifest() {
  local tmp_manifest="$1"
  local ns="$2"
  local sname="$3"
  local mappings="$4"
  local secrets_file="$5"
  local owner_brand_csv="${6:-}"
  local secret_type="${7:-Opaque}"

  declare -A secret_vals
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    if [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]]; then
      local k="${BASH_REMATCH[1]}" v="${BASH_REMATCH[2]}"
      v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
      secret_vals["$k"]="$v"
    fi
  done < "$secrets_file"

  DEST_LIST=""
  NONEMPTY_COUNT=0
  {
    echo "apiVersion: v1"
    echo "kind: Secret"
    echo "metadata:"
    echo "  name: ${sname}"
    echo "  namespace: ${ns}"
    if [[ -n "$owner_brand_csv" ]]; then
      echo "  annotations:"
      echo "    secrets.bachelorprojekt/owner-brand: \"${owner_brand_csv}\""
    fi
    echo "type: ${secret_type}"
    echo "stringData:"
    for m in $mappings; do
      # Mapping fields are `:=:`-joined and never contain whitespace, so
      # word-splitting is a safe decoder. `-` encodes an empty field. The
      # function's own arguments are already captured in locals above.
      # shellcheck disable=SC2086
      set -- ${m//:=:/ }
      local src="$1" dest="$2" required="$3"
      local registry="$4" user_key="$5"
      [[ "$registry" == "-" ]] && registry=""
      [[ "$user_key" == "-" ]] && user_key=""
      local val="${secret_vals[$src]:-}"

      # dockerconfigjson: assemble from username + token instead of using the
      # raw value. An incomplete pair is treated as an empty value.
      if [[ -n "$registry" && -n "$user_key" ]]; then
        local user_val="${secret_vals[$user_key]:-}"
        if [[ -n "$val" && -n "$user_val" ]]; then
          echo "  ${dest}: '$(build_dockerconfigjson "$registry" "$user_val" "$val")'"
          DEST_LIST="${DEST_LIST} ${dest}"
          NONEMPTY_COUNT=$((NONEMPTY_COUNT + 1))
          continue
        fi
        val=""
      fi

      if [[ -z "$val" ]]; then
        case "${required}" in
          true|True|TRUE|yes|Yes|YES)
            die "ERROR: required key '${src}' is empty in ${secrets_file} — refusing to seal incomplete secret ${ns}/${sname}"
            ;;
          false|False|FALSE|no|No|NO)
            val=""
            ;;
          *)
            die "ERROR: schema flag 'required: ${required}' for key '${src}' is not boolean — refusing to seal"
            ;;
        esac
      fi
      echo "  ${dest}: \"${val}\""
      DEST_LIST="${DEST_LIST} ${dest}"
      if [[ -n "$val" ]]; then NONEMPTY_COUNT=$((NONEMPTY_COUNT + 1)); fi
    done
  } > "$tmp_manifest"
}

# write_generated_file_header <target>
# Truncates <target> and writes the provenance header for an `output_file`
# document. Replaces the manual regeneration runbook of T002251.
write_generated_file_header() {
  cat > "$1" <<EOF
# GENERIERT von \`task env:seal ENV=${ENV_NAME:-<env>}\` — nicht von Hand editieren.
# Plaintext-Quelle: environments/.secrets/${ENV_NAME:-<env>}.yaml (git-crypt),
# Mapping: environments/schema.yaml (extra_namespaces.output_file).
#
# Bis T002251 wurden diese Ciphertexte per Runbook aus dem Cluster
# zurückgelesen und von Hand gesealt; seit T002254 erzeugt sie der Sealer aus
# dem Secret-SSOT. Nach einer Sealing-Key-Rotation neu erzeugen mit:
#   task env:seal ENV=${ENV_NAME:-<env>}
#
# Wird von \`task flux:bootstrap\` imperativ appliziert und muss existieren,
# BEVOR Flux das OCI-Artefakt ziehen kann. [T002251][T002254]
EOF
}

# seal_extra_namespace_secrets <schema_file> <secrets_file> <cert_file> <output_file>
# Public entry point. Appends one SealedSecret document per
# (namespace, secret) pair declared in schema's extra_namespaces to
# <output_file>.
seal_extra_namespace_secrets() {
  local schema_file="$1"
  local secrets_file="$2"
  local cert_file="$3"
  local output_file="$4"

  local entries
  entries=$(parse_extra_namespace_entries "$schema_file")

  if [[ -z "$entries" ]]; then
    return 0
  fi

  # Brand resolution (T001584): owner_brand entries in schema.yaml name a
  # bare brand (e.g. "mentolder"), but ENV_NAME can be a fleet-qualified
  # env (e.g. "fleet-mentolder") since the fleet consolidation. Resolve
  # the brand via env_vars.BRAND_ID from the env file; fall back to
  # ENV_NAME itself when the file/key is absent (legacy/test envs).
  local brand_lc="${ENV_NAME,,}"
  if [[ -f "$ENV_FILE" ]] && command -v yq >/dev/null 2>&1; then
    local resolved_brand
    resolved_brand=$(yq '.env_vars.BRAND_ID // ""' "$ENV_FILE" 2>/dev/null)
    [[ -n "$resolved_brand" ]] && brand_lc="${resolved_brand,,}"
  fi

  declare -A ns_map=()
  declare -A owner_by_pair=()
  declare -A type_by_pair=()
  declare -A outfile_by_pair=()
  declare -A truncated=()
  while IFS=$'\t' read -r src ns sec dest required ob stype out_file registry user_key; do
    [[ -z "$src" ]] && continue
    # "-" is the placeholder for an absent optional field (see parser).
    [[ "$ob" == "-" ]] && ob=""
    [[ "$stype" == "-" ]] && stype=""
    [[ "$out_file" == "-" ]] && out_file=""
    local pair="${ns}|${sec}"
    local mapping="${src}:=:${dest}:=:${required}:=:${registry:--}:=:${user_key:--}"
    # Type and output file are properties of the (ns, secret) pair; entries
    # sharing a pair must agree — last declaration wins, as for owner_brand.
    [[ -n "$stype" ]] && type_by_pair["$pair"]="$stype"
    [[ -n "$out_file" ]] && outfile_by_pair["$pair"]="$out_file"
    if [[ -v ns_map[$pair] ]]; then
      ns_map["$pair"]="${ns_map[$pair]} ${mapping}"
    else
      ns_map["$pair"]="${mapping}"
    fi
    # Last write wins for owner_brand at pair level (entries with the
    # same ns|sec pair should agree on ownership; if they don't, the
    # last declared entry's value is used).
    owner_by_pair["$pair"]="$ob"
  done <<< "$entries"

  for pair in "${!ns_map[@]}"; do
    local ns="${pair%%|*}"
    local sname="${pair##*|}"
    local mappings="${ns_map[$pair]}"
    local owner_brand_csv="${owner_by_pair[$pair]:-}"

    # Owner-brand filter (T001404): if this entry declares an
    # `owner_brand` list and the current ENV_NAME is not in it, skip
    # sealing the document. This prevents a brand-deploy (e.g.
    # korczewski) from overwriting shared-NS SealedSecret documents
    # (rustdesk, coturn) that belong to the other brand (mentolder).
    # When the field is absent (legacy schema), all envs may seal —
    # backwards-compat behaviour is preserved.
    if [[ -n "$owner_brand_csv" ]]; then
      local match=0
      local ob_arr
      IFS=',' read -ra ob_arr <<< "$owner_brand_csv"
      local brand
      for brand in "${ob_arr[@]}"; do
        [[ "${brand,,}" == "$brand_lc" ]] && match=1
      done
      if [[ "$match" -eq 0 ]]; then
        echo "INFO: skipping ${ns}/${sname} (owner_brand=[${owner_brand_csv}], env=${ENV_NAME}, brand=${brand_lc})" >&2
        continue
      fi
    fi

    local tmp_manifest
    tmp_manifest=$(mktemp)

    build_secret_manifest "$tmp_manifest" "$ns" "$sname" "$mappings" \
      "$secrets_file" "$owner_brand_csv" "${type_by_pair[$pair]:-Opaque}"

    if [[ -z "${DEST_LIST// /}" ]]; then
      echo "INFO: Skipping ${ns}/${sname} — no keys present in secrets file." >&2
      rm -f "$tmp_manifest"
      continue
    fi

    # Per-entry output file (T002254): written in full so a removed schema
    # entry cannot leave a stale ciphertext behind. Never written when every
    # source key is empty — that would overwrite a live bootstrap ciphertext
    # with empty strings.
    local target="$output_file"
    local of="${outfile_by_pair[$pair]:-}"
    if [[ -n "$of" ]]; then
      if [[ "$NONEMPTY_COUNT" -eq 0 ]]; then
        echo "WARN: skipping ${ns}/${sname} → ${of} — all source keys are empty in ${secrets_file}; leaving the existing file untouched." >&2
        rm -f "$tmp_manifest"
        continue
      fi
      target="${SEAL_OUTPUT_ROOT}/${of}"
      mkdir -p "$(dirname "$target")"
      if [[ -z "${truncated[$of]:-}" ]]; then
        write_generated_file_header "$target"
        truncated["$of"]=1
      fi
    fi

    info "Encrypting ${ns}/${sname} (keys:${DEST_LIST}) with kubeseal..."
    {
      echo "---"
      kubeseal --cert "$cert_file" --format yaml < "$tmp_manifest"
    } >> "$target" \
      || die "kubeseal encryption failed for ${ns}/${sname}"

    rm -f "$tmp_manifest"
  done
}
