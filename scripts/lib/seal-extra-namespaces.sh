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
# Sourced from scripts/env-seal.sh. Not executable on its own.
# ═══════════════════════════════════════════════════════════════════
# shellcheck disable=SC2155

# parse_extra_namespace_entries <schema_file>
# Emits one tab-separated line per (src, ns, sec, dest, required) tuple.
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
        print(f"{src}\t{ns}\t{sec}\t{dest}\t{required}")
PY
}

# build_secret_manifest <tmp_manifest> <ns> <sname> <mappings> <secrets_file>
# Writes the input Secret manifest to <tmp_manifest> (or empty string if
# all keys were missing/empty). Honours the per-entry `required` flag:
#   - required: true + empty value → die
#   - required: false + empty value → emit key with ""
# Sets the global DEST_LIST to a space-separated list of emitted keys.
build_secret_manifest() {
  local tmp_manifest="$1"
  local ns="$2"
  local sname="$3"
  local mappings="$4"
  local secrets_file="$5"

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
  {
    echo "apiVersion: v1"
    echo "kind: Secret"
    echo "metadata:"
    echo "  name: ${sname}"
    echo "  namespace: ${ns}"
    echo "type: Opaque"
    echo "stringData:"
    for m in $mappings; do
      local src="${m%%:=:*}"
      local rest="${m#*:=:}"
      local dest="${rest%:=:*}"
      local required="${rest##*:=:}"
      local val="${secret_vals[$src]:-}"

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
    done
  } > "$tmp_manifest"
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

  declare -A ns_map=()
  while IFS=$'\t' read -r src ns sec dest required; do
    [[ -z "$src" ]] && continue
    local pair="${ns}|${sec}"
    local mapping="${src}:=:${dest}:=:${required}"
    if [[ -v ns_map[$pair] ]]; then
      ns_map["$pair"]="${ns_map[$pair]} ${mapping}"
    else
      ns_map["$pair"]="${mapping}"
    fi
  done <<< "$entries"

  for pair in "${!ns_map[@]}"; do
    local ns="${pair%%|*}"
    local sname="${pair##*|}"
    local mappings="${ns_map[$pair]}"

    local tmp_manifest
    tmp_manifest=$(mktemp)

    build_secret_manifest "$tmp_manifest" "$ns" "$sname" "$mappings" "$secrets_file"

    if [[ -z "${DEST_LIST// /}" ]]; then
      echo "INFO: Skipping ${ns}/${sname} — no keys present in secrets file." >&2
      rm -f "$tmp_manifest"
      continue
    fi

    info "Encrypting ${ns}/${sname} (keys:${DEST_LIST}) with kubeseal..."
    {
      echo "---"
      kubeseal --cert "$cert_file" --format yaml < "$tmp_manifest"
    } >> "$output_file" \
      || die "kubeseal encryption failed for ${ns}/${sname}"

    rm -f "$tmp_manifest"
  done
}
