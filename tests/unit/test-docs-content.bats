#!/usr/bin/env bats
# Lints docs-content/ for forbidden strings + sidebar link integrity + brand-switch presence in shell.

DOCS="$BATS_TEST_DIRNAME/../../k3d/docs-content"
SHELL_HTML="$BATS_TEST_DIRNAME/../../docs-site/index.html"

@test "no Mattermost references in docs (decisions.md exempted)" {
  found=$(grep -ril 'mattermost' "$DOCS" --exclude='decisions.md' || true)
  [ -z "$found" ] || { echo "Forbidden refs: $found"; false; }
}

@test "no InvoiceNinja references in docs (decisions.md exempted)" {
  found=$(grep -ril 'invoiceninja\|invoice ninja' "$DOCS" --exclude='decisions.md' || true)
  [ -z "$found" ] || { echo "Forbidden refs: $found"; false; }
}

@test "no Stripe references in docs (decisions.md exempted)" {
  found=$(grep -ril 'stripe' "$DOCS" --exclude='decisions.md' || true)
  [ -z "$found" ] || { echo "Forbidden refs: $found"; false; }
}

@test "no \"korczewski-Cluster\" or \"separater Cluster\" wording in docs" {
  found=$(grep -riln 'korczewski-Cluster\|separater Cluster\|separates Cluster' "$DOCS" --exclude='decisions.md' || true)
  [ -z "$found" ] || { echo "Stale wording: $found"; false; }
}

@test "every sidebar link has a backing markdown file" {
  while read -r target; do
    f="$DOCS/${target}.md"
    [ -f "$f" ] || { echo "Missing: $f"; false; return; }
  done < <(grep -oE '\]\([a-z][a-z0-9-]*\)' "$DOCS/_sidebar.md" | sed -E 's/[]()]//g')
}

@test "sidebar starts with a Quickstarts group" {
  head -1 "$DOCS/_sidebar.md" | grep -q '\*\*Quickstarts\*\*'
}

@test "sidebar contains all three Quickstart links" {
  grep -q 'quickstart-enduser' "$DOCS/_sidebar.md"
  grep -q 'quickstart-admin' "$DOCS/_sidebar.md"
  grep -q 'quickstart-dev' "$DOCS/_sidebar.md"
}

@test "sidebar entry for MCP-Server uses \"Claude Code\" label" {
  grep -q '\[MCP-Server (Claude Code)\](claude-code)' "$DOCS/_sidebar.md"
}

@test "shell sets data-brand from hostname" {
  grep -q "data-brand" "$SHELL_HTML"
  grep -q "korczewski" "$SHELL_HTML"
  grep -q "mentolder" "$SHELL_HTML"
}

@test "shell defines token blocks for both brands" {
  grep -q ':root\[data-brand="mentolder"\]' "$SHELL_HTML"
  grep -q ':root\[data-brand="korczewski"\]' "$SHELL_HTML"
}

@test "every service page has at least one mermaid block" {
  for p in keycloak nextcloud collabora talk-hpb livestream einvoice claude-code vaultwarden website whiteboard mailpit monitoring shared-db; do
    grep -q '```mermaid' "$DOCS/${p}.md" || { echo "Missing mermaid: ${p}.md"; false; return; }
  done
}

@test "glossary and decisions exist and are non-trivial" {
  [ -s "$DOCS/glossary.md" ]
  [ -s "$DOCS/decisions.md" ]
  [ "$(wc -l < "$DOCS/glossary.md")" -gt 30 ]
  [ "$(wc -l < "$DOCS/decisions.md")" -gt 30 ]
}
