#!/usr/bin/env bats
# tests/spec/auth-sso.bats
# SSOT: openspec/specs/auth-sso.md
# T001579: oauth2-proxy gate hardening — render-based manifest assertions.
# Render pattern follows tests/spec/brain-quartz-deploy.bats.
load 'test_helper'

setup_file() {
  export RENDERED_MENTOLDER="${BATS_FILE_TMPDIR}/rendered-mentolder.yaml"
  export RENDERED_KORCZEWSKI="${BATS_FILE_TMPDIR}/rendered-korczewski.yaml"
  
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  kubectl kustomize "${repo_root}/prod-fleet/mentolder" --load-restrictor=LoadRestrictionsNone > "$RENDERED_MENTOLDER" 2>/dev/null
  kubectl kustomize "${repo_root}/prod-fleet/korczewski" --load-restrictor=LoadRestrictionsNone > "$RENDERED_KORCZEWSKI" 2>/dev/null
}

_render_mentolder() {
  cat "$RENDERED_MENTOLDER"
}

_render_korczewski() {
  cat "$RENDERED_KORCZEWSKI"
}

@test "prod render (mentolder): no --ssl-insecure-skip-verify anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--ssl-insecure-skip-verify' <<< "$RENDER" || { echo "FAIL: ssl-insecure-skip-verify still rendered"; return 1; }
}

@test "prod render (mentolder): no --insecure-oidc-allow-unverified-email anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--insecure-oidc-allow-unverified-email' <<< "$RENDER" || { echo "FAIL: insecure-oidc-allow-unverified-email still rendered"; return 1; }
}

# T001851 (PRs #2837/#2839) changed the gate posture: oauth2-proxy v7.9.0
# hard-fails startup without --email-domain or --authenticated-emails-file,
# so --email-domain=* is deliberately present on the group-gated services —
# authorization is enforced by --allowed-group (singular; v7.9.0 has no
# --allowed-groups flag). The invariant is therefore no longer "no wildcard
# anywhere" but "every wildcard gate is group-restricted".
@test "prod render (mentolder): every --email-domain=* gate is group-restricted" {
  RENDER="$(_render_mentolder)"
  wildcard="$(grep -c -- '--email-domain=\*' <<< "$RENDER" || true)"
  groups="$(grep -c -- '- --allowed-group=' <<< "$RENDER" || true)"
  [ "$wildcard" -ge 1 ] || { echo "FAIL: expected wildcard email-domain gates (v7.9.0 startup requirement), got 0"; return 1; }
  [ "$wildcard" -eq "$groups" ] || { echo "FAIL: ${wildcard} wildcard gates but ${groups} allowed-group restrictions"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates carry --allowed-group=workspace-users" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --allowed-group=workspace-users' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 allowed-group gates, got ${count}"; return 1; }
}

@test "prod render (mentolder): exactly 9 gates carry --oidc-groups-claim=groups" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --oidc-groups-claim=groups' <<< "$RENDER" || true)"
  [ "$count" -eq 9 ] || { echo "FAIL: expected 9 oidc-groups-claim gates, got ${count}"; return 1; }
}

@test "prod render (mentolder): exactly 9 gates request the groups scope" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --scope=openid email profile groups' <<< "$RENDER" || true)"
  [ "$count" -eq 9 ] || { echo "FAIL: expected 9 gates with groups scope, got ${count}"; return 1; }
}

@test "prod render (mentolder): the 4 allowlist gates keep --authenticated-emails-file" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '- --authenticated-emails-file' <<< "$RENDER" || true)"
  [ "$count" -eq 4 ] || { echo "FAIL: expected 3 authenticated-emails-file gates, got ${count}"; return 1; }
}

@test "prod render (korczewski): no insecure flags anywhere" {
  RENDER="$(_render_korczewski)"
  ! grep -qE -- '--(ssl-insecure-skip-verify|insecure-oidc-allow-unverified-email)' <<< "$RENDER" || { echo "FAIL: insecure flag rendered on korczewski"; return 1; }
  # T001851: --email-domain=* is deliberate (v7.9.0 startup requirement) —
  # assert every wildcard gate is group-restricted instead of absence.
  wildcard="$(grep -c -- '--email-domain=\*' <<< "$RENDER" || true)"
  groups="$(grep -c -- '- --allowed-group=' <<< "$RENDER" || true)"
  [ "$wildcard" -eq "$groups" ] || { echo "FAIL: ${wildcard} wildcard gates but ${groups} allowed-group restrictions on korczewski"; return 1; }
}

@test "pocket-id seed job provisions the workspace-users group idempotently" {
  grep -q 'workspace-users' k3d/pocket-id-client-seed.yaml || { echo "FAIL: workspace-users group missing in seed job"; return 1; }
  grep -q '/api/user-groups' k3d/pocket-id-client-seed.yaml || { echo "FAIL: user-groups API call missing in seed job"; return 1; }
  grep -q 'ensure_group' k3d/pocket-id-client-seed.yaml || { echo "FAIL: ensure_group helper missing in seed job"; return 1; }
}

@test "orphaned templates/brain/prod-korczewski subtree is gone" {
  [ ! -d templates/brain/prod-korczewski ] || { echo "FAIL: templates/brain/prod-korczewski still exists"; return 1; }
}
# T002122: oauth2-proxy v7.9.0 kennt nur --skip-auth-route (Singular). Der
# Plural laesst den Container mit "unknown flag" und der vollen Usage
# aussteigen -> CrashLoopBackOff. In prod stand er im Overlay-Patch
# (prod/patch-oauth2-proxy-brett-deployment.yaml), waehrend die Basis bereits
# korrigiert war - das Patch ueberschreibt den args-Block, also gewann der
# kaputte Flag. Folge: Flux konnte beide Brand-Kustomizations 15h lang nicht
# reconcilen, weil das Deployment nie healthy wurde.
#
# Geprueft wird das GERENDERTE Overlay, nicht die Quelldateien - nur dort
# zeigt sich, welcher Flag nach dem Patch-Merge tatsaechlich in prod landet.
@test "T002122: gerendertes mentolder-Overlay nutzt kein --skip-auth-routes" {
  run _render_mentolder
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q -- '--skip-auth-routes'
}

@test "T002122: gerendertes korczewski-Overlay nutzt kein --skip-auth-routes" {
  run _render_korczewski
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q -- '--skip-auth-routes'
}

@test "T002122: oauth2-proxy-brett behaelt den healthz-Bypass (Singular)" {
  run _render_mentolder
  [ "$status" -eq 0 ]
  echo "$output" | grep -q -- '--skip-auth-route=GET=\^/healthz'
}

# ── T002154: POCKET_ID_URL muss ein cross-namespace auflösbarer FQDN sein ─────
#
# Incident 2026-07-25: Der Website-Login brach auf BEIDEN Brands, obwohl Pocket ID
# den Passkey akzeptierte. Der serverseitige Token-Exchange scheiterte mit
# "TypeError: fetch failed" (undici, Verbindungsebene) — es folgte nie ein
# POST /api/oidc/token. Ursache: POCKET_ID_URL=http://pocket-id:1411 (Kurzname).
# Die Website läuft in ns `website`, Pocket ID in ns `workspace`; der Kurzname
# löst nur INNERHALB von workspace auf. Im Prod-Pod gemessen: Kurzname 5/5
# ENOTFOUND, FQDN HTTP 200.
#
# Geprüft wird der WIRKSAME Fallback-Wert im Taskfile, nicht nur die Existenz
# einer Zeile — damit deckt der Test auch ab, dass der Default bei leerem
# WORKSPACE_NAMESPACE kein kaputtes `pocket-id..svc` erzeugt.

@test "T002154: kein bare Kurzname als POCKET_ID_URL-Fallback im Taskfile" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  run grep -n 'POCKET_ID_URL:-http://pocket-id:1411' "${repo_root}/Taskfile.yml"
  [ "$status" -ne 0 ] || {
    echo "FAIL: bare Kurzname 'pocket-id:1411' als Fallback — cross-namespace nicht auflösbar:"
    echo "$output"
    return 1
  }
}

@test "T002154: jeder POCKET_ID_URL-Fallback rendert zu einem FQDN" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  # Ganze Zuweisung extrahieren (bis zum schließenden "), damit verschachtelte
  # Defaults wie ${WORKSPACE_NAMESPACE:-workspace} nicht mitten drin abgeschnitten werden.
  local assignments; assignments="$(grep -o 'POCKET_ID_URL="[^"]*"' "${repo_root}/Taskfile.yml" | sort -u)"
  [ -n "$assignments" ] || skip "keine POCKET_ID_URL-Zuweisung im Taskfile"

  local a resolved
  while IFS= read -r a; do
    [ -n "$a" ] || continue
    # Zuweisung real auswerten, wie es der Deploy täte: POCKET_ID_URL ungesetzt.
    # WORKSPACE_NAMESPACE bewusst LEER — deckt environments/dev.yaml ab, das die
    # Variable nicht setzt, und erzwingt damit einen inneren Default im Ausdruck.
    resolved="$(unset POCKET_ID_URL; WORKSPACE_NAMESPACE=""; eval "$a"; echo "$POCKET_ID_URL")"
    echo "$resolved" | grep -q '\.svc\.cluster\.local' || {
      echo "FAIL: '$a' rendert zu '$resolved' — kein FQDN, cross-namespace nicht auflösbar"
      return 1
    }
    # Leeres Namespace-Segment (pocket-id..svc) ist genauso kaputt
    ! echo "$resolved" | grep -q 'pocket-id\.\.svc' || {
      echo "FAIL: '$a' rendert zu '$resolved' — leeres Namespace-Segment"
      return 1
    }
  done <<< "$assignments"
}

# Zweite Lücke desselben Incidents: website-config hängt per `envFrom` am
# Deployment. envFrom-Werte werden nur beim Containerstart kopiert (anders als
# gemountete CM-Volumes) — ohne Checksum-Annotation im Pod-Template löst eine
# ConfigMap-Korrektur KEINEN Rollout aus. Live war auf beiden Brands: CM = FQDN
# (korrekt), Pod-Env = Kurzname (kaputt), Pod lief so 37h.
@test "T002154: Website-Pod-Template trägt eine checksum/config-Annotation" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  run grep -q 'checksum/config' "${repo_root}/k3d/website.yaml"
  [ "$status" -eq 0 ] || {
    echo "FAIL: k3d/website.yaml hat keine checksum/config-Annotation im Pod-Template —"
    echo "      ConfigMap-Änderungen erreichen laufende Pods nicht (envFrom friert Werte beim Start ein)."
    return 1
  }
}

# ── T002156: checksum/config muss in ALLEN Render-Pfaden echt gefuellt sein ────
#
# T002154 fuehrte die checksum/config-Annotation ein, deckte aber nur zwei der
# DREI Render-Pfade ab. Der primaere Pfad ist pull-based via Flux:
#   render-fleet-artifact.yml -> task flux:render -> scripts/flux-render-artifact.sh
#   -> OCI-Artefakt -> Flux-Kustomization (interval 10m)
# Der Flux-Renderer leitet seine envsubst-Liste dynamisch ab und substituierte
# WEBSITE_CONFIG_SHA daher mit dem ungesetzten (= leeren) Wert. Live stand auf
# beiden Brands {"checksum/config":""} — wirkungslos, und schlimmer: Flux drehte
# den von build-website.yml gesetzten Hash alle 10 min auf "" zurueck.
#
# Zweiter Defekt: T002154 hashte das GESAMTE Manifest inkl. Image-Tag, der sich
# je Pfad unterscheidet — die Pfade haetten sich gegenseitig ueberschrieben.
# Gehasht wird deshalb nur der data-Block der website-config-ConfigMap.

@test "T002156: website-config-sha Helper existiert und ist ausfuehrbar" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  [ -x "${repo_root}/scripts/website-config-sha.sh" ] || {
    echo "FAIL: scripts/website-config-sha.sh fehlt oder ist nicht ausfuehrbar —"
    echo "      ohne gemeinsamen Helper driftet die Hash-Logik zwischen den 3 Pfaden."
    return 1
  }
}

@test "T002156: Hash ignoriert den Image-Tag (pfadunabhaengig)" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  local helper="${repo_root}/scripts/website-config-sha.sh"
  [ -x "$helper" ] || skip "Helper noch nicht vorhanden"

  local base='apiVersion: v1
kind: ConfigMap
metadata:
  name: website-config
data:
  POCKET_ID_URL: "http://pocket-id.workspace.svc.cluster.local:1411"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
spec:
  template:
    spec:
      containers:
        - name: website
          image: ghcr.io/paddione/website:IMGTAG'

  local a b
  a="$(sed 's/IMGTAG/sha-aaaaaaa/' <<<"$base" | bash "$helper")"
  b="$(sed 's/IMGTAG/sha-bbbbbbb/' <<<"$base" | bash "$helper")"
  [ "$a" = "$b" ] || {
    echo "FAIL: Hash haengt vom Image-Tag ab ($a != $b) — die Render-Pfade wuerden"
    echo "      sich gegenseitig ueberschreiben und Rollouts ausloesen."
    return 1
  }
  [ -n "$a" ] || { echo "FAIL: Hash ist leer"; return 1; }
}

@test "T002156: Hash reagiert auf eine geaenderte Config" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  local helper="${repo_root}/scripts/website-config-sha.sh"
  [ -x "$helper" ] || skip "Helper noch nicht vorhanden"

  local tmpl='apiVersion: v1
kind: ConfigMap
metadata:
  name: website-config
data:
  POCKET_ID_URL: "VALUE"'

  local a b
  a="$(sed 's|VALUE|http://pocket-id:1411|' <<<"$tmpl" | bash "$helper")"
  b="$(sed 's|VALUE|http://pocket-id.workspace.svc.cluster.local:1411|' <<<"$tmpl" | bash "$helper")"
  [ "$a" != "$b" ] || {
    echo "FAIL: Hash aendert sich nicht bei geaenderter Config ($a) — kein Rollout-Trigger."
    return 1
  }
}

@test "T002156: Flux-Renderer setzt checksum/config (primaerer Deploy-Pfad)" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  grep -q 'WEBSITE_CONFIG_SHA' "${repo_root}/scripts/flux-render-artifact.sh" || {
    echo "FAIL: scripts/flux-render-artifact.sh kennt WEBSITE_CONFIG_SHA nicht."
    echo "      Das ist der PRIMAERE (pull-based) Deploy-Pfad — ohne ihn bleibt die"
    echo "      Annotation leer und Flux ueberschreibt die anderen Pfade alle 10 min."
    return 1
  }
}

@test "T002156: Flux-Renderer lehnt eine leer substituierte checksum/config ab" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  grep -qE 'checksum/config: *""|checksum_config_empty|EMPTY_CHECKSUM' "${repo_root}/scripts/flux-render-artifact.sh" || {
    echo "FAIL: Der fail-closed-Check prueft nur auf UEBRIG GEBLIEBENE \${VAR},"
    echo "      nicht auf LEER substituierte — genau dadurch ging T002154 kaputt live."
    return 1
  }
}

@test "T002156: alle drei Render-Pfade nutzen den gemeinsamen Helper" {
  local repo_root; repo_root="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  local missing=""
  grep -q 'website-config-sha.sh' "${repo_root}/scripts/flux-render-artifact.sh"        || missing="$missing flux-render-artifact.sh"
  grep -q 'website-config-sha.sh' "${repo_root}/Taskfile.yml"                            || missing="$missing Taskfile.yml"
  grep -q 'website-config-sha.sh' "${repo_root}/.github/workflows/build-website.yml"     || missing="$missing build-website.yml"
  [ -z "$missing" ] || {
    echo "FAIL: Pfade ohne gemeinsamen Helper:$missing"
    echo "      Duplizierte Hash-Logik driftet (vgl. T001993 envsubst-Allowlist)."
    return 1
  }
}

# ── T002205: Keycloak-Abschaltung vollstaendig ──────────────────────────
# SSOT: openspec/specs/auth-sso.md → "Single-Sign-On für alle Platform-Services"

_repo_root() { cd "${BATS_TEST_DIRNAME}/../.." && pwd; }

@test "T002205: Realm-Import-Skripte und -Helper existieren nicht mehr" {
  local root; root="$(_repo_root)"
  local found="" f
  for f in scripts/import-entrypoint.sh prod/import-entrypoint.sh scripts/lib/keycloak-helpers.sh; do
    [ ! -e "${root}/${f}" ] || found="$found $f"
  done
  [ -z "$found" ] || {
    echo "FAIL: Keycloak-Realm-Import-Artefakte wieder da:$found"
    return 1
  }
}

@test "T002205: deploy.sh legt keine keycloak-import-script ConfigMap an" {
  local root; root="$(_repo_root)"
  ! grep -qE 'keycloak-import-script|import-entrypoint\.sh' "${root}/k3d/deploy.sh" || {
    echo "FAIL: k3d/deploy.sh verdrahtet wieder den Keycloak-Realm-Import."
    return 1
  }
}

@test "T002205: Kustomize-Bases referenzieren keine Keycloak-Generatoren" {
  local root; root="$(_repo_root)"
  local bad=""
  local f
  for f in k3d/kustomization.yaml prod/kustomization.yaml \
           prod-mentolder/kustomization.yaml prod-korczewski/kustomization.yaml \
           prod-fleet/staging/kustomization.yaml; do
    ! grep -qE 'realm-template|keycloak-import-script' "${root}/${f}" || bad="$bad $f"
  done
  [ -z "$bad" ] || { echo "FAIL: Keycloak-Generator-Referenzen in:$bad"; return 1; }
}

@test "T002205: KEYCLOAK_*-Keys sind aus Schema und Secrets entfernt" {
  local root; root="$(_repo_root)"
  local bad=""
  local f
  for f in "${root}/environments/schema.yaml" "${root}"/environments/.secrets/*.yaml; do
    [ -f "$f" ] || continue
    # git-crypt-gesperrte Dateien sind Binaerblobs — nicht auswertbar, ueberspringen
    grep -Iq . "$f" 2>/dev/null || continue
    ! grep -qE '^[[:space:]]*KEYCLOAK_(DB|ADMIN)_PASSWORD:' "$f" || bad="$bad $(basename "$f")"
  done
  [ -z "$bad" ] || {
    echo "FAIL: KEYCLOAK_*_PASSWORD wieder vorhanden in:$bad"
    echo "      Keycloak ist decommissioned — Key nicht re-seeden (siehe environments/schema.yaml)."
    return 1
  }
}

@test "T002205: Backup-Restore kennt kein keycloak-Ziel mehr" {
  local root; root="$(_repo_root)"
  local bad=""
  local f
  for f in scripts/backup-restore-lib.sh scripts/backup-restore-db.sh scripts/backup-restore.sh; do
    ! grep -qi 'keycloak' "${root}/${f}" || bad="$bad $f"
  done
  [ -z "$bad" ] || { echo "FAIL: keycloak-Backup-Ziel noch verdrahtet in:$bad"; return 1; }
}

@test "T002205: shared-db exportiert keinen keycloak-db Alias-Service" {
  local root; root="$(_repo_root)"
  ! grep -qE '^[[:space:]]*name:[[:space:]]*keycloak-db[[:space:]]*$' "${root}/k3d/shared-db.yaml" || {
    echo "FAIL: Alias-Service keycloak-db in k3d/shared-db.yaml wieder vorhanden."
    return 1
  }
}

# ── T002187: pocket-id-client-seed Fix (RC-1 bis RC-4) ────────────────
#
# Diese Tests muessen auf dem UNGEFIXTEN Branch FAILEN (RED) und nach
# Implementierung der Fixes BESTEHEN (GREEN).

@test "T002187: kein nacktes DO \$\$ BLOCK in command:-Block von k3d/pocket-id.yaml" {
  local root; root="$(_repo_root)"
  # Nacktes '$$' in einem YAML-command:-Block führt zu $0-Expansion durch den
  # Container-Shell-Parser. Das SQL nutzte DO $$ BEGIN ... END $$; innerhalb
  # eines <<'EOSQL'-Here-Docs — durch Flux/envsubst-Rendering wird daraus
  # ein einziger $, der PostgreSQL-Syntax-Fehler verursacht (RC-2).
  # Nach dem Fix liegt das SQL in einer ConfigMap (data:-Section ist sicher)
  # und wird via -f /sql/init.sql aufgerufen — der command:-Block von
  # pocket-id.yaml enthält daher kein DO $$ ... mehr.
  # ConfigMap data:-Section ist EXPLIZIT ausgenommen (dort ist $$ sicher).
  local bad=""
  # Prüfe pocket-id.yaml auf DO $$ in command:-Context
  if grep -Eq 'DO \$\$' "${root}/k3d/pocket-id.yaml"; then
    bad="$bad pocket-id.yaml"
  fi
  [ -z "$bad" ] || {
    echo "FAIL: DO \$\$ in command:-Block von:$bad — SQL in ConfigMap auslagern (T002187)."
    return 1
  }
}

@test "T002187: db-init nutzt ON_ERROR_STOP=1 für den DB/Rollen-Block" {
  local root; root="$(_repo_root)"
  local f="${root}/k3d/pocket-id.yaml"
  [ -f "$f" ] || skip "pocket-id.yaml nicht gefunden"

  # Nach dem Fix: db-init-SQL liegt in einer ConfigMap, aufgerufen mit
  # psql -v ON_ERROR_STOP=1 -f /sql/init.sql
  # => kein ON_ERROR_STOP=0 mehr im psql-Aufruf für den init-Block.
  if grep -q 'ON_ERROR_STOP=0' "$f"; then
    echo "FAIL: k3d/pocket-id.yaml enthält ON_ERROR_STOP=0 — SQL-Fehler werden verschluckt (RC-3)."
    return 1
  fi
}

@test "T002187: pocket-id-client-seed Job trägt Flux-force-Annotation" {
  local root; root="$(_repo_root)"
  local f="${root}/k3d/pocket-id-client-seed.yaml"
  [ -f "$f" ] || skip "pocket-id-client-seed.yaml nicht gefunden"

  if ! grep -q 'kustomize.toolkit.fluxcd.io/force:.*enabled' "$f"; then
    echo "FAIL: k3d/pocket-id-client-seed.yaml hat keine kustomize.toolkit.fluxcd.io/force: \"enabled\" Annotation —"
    echo "      Flux scheitert an immutablem Job.spec.template (RC-1)."
    return 1
  fi
}

@test "T002187: Admin-Bootstrap enthält keine hardcodierte UUID a0000000-..." {
  local root; root="$(_repo_root)"
  local files=(
    "${root}/k3d/pocket-id.yaml"
    "${root}/k3d/pocket-id-db-init-sql.yaml"
  )
  local bad=""
  local f
  for f in "${files[@]}"; do
    [ -f "$f" ] || continue
    if grep -q 'a0000000-0000-4000-8000' "$f"; then
      bad="$bad $(basename "$f")"
    fi
  done
  [ -z "$bad" ] || {
    echo "FAIL: hardcodierte Admin-UUID a0000000-... gefunden in:$bad —"
    echo "      gegen SELECT id FROM users WHERE username = :admin_user auflösen (RC-4)."
    return 1
  }
}
