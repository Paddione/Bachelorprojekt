## Task 3: Secrets and backup foundation for the owner workspace (p3-secrets-backup)

**SEALED_PATH=environments/sealed-secrets/dev.yaml** — the requested path environments/sealed-secrets/dev/website-secrets.yaml does not exist (there is no dev/ directory under environments/sealed-secrets/; listing on 2026-10-07 shows only dev.yaml, staging.yaml, and two fleet files). Every sealed-secret change in this partial targets the verified file `environments/sealed-secrets/dev.yaml`, which holds the website-secrets document (namespace website) alongside the workspace-secrets document.

Partial id `p3` · role `impl` · depends_on none. This partial carries no verify task and no red-green test step; the orchestrator owns final verification and the tests partial owns the failing-test step.

Context. This partial builds the secrets and backup foundation for ticket T901022 (design decisions 5 and 6: extend the Pocket-ID seed plus sealed-secret flow for tenant and owner-group use; extend the backup flow with a business scope plus a restore demo over test data). All structure facts below were verified by reading the worktree files on 2026-10-07, because the filtered intel bundle carries no per-file symbols for YAML, shell, or docs. The seed manifest `k3d/pocket-id-client-seed.yaml` is a batch Job (432 lines) registering OIDC clients through SECRET_* env entries (lines 130-169), a ROWS table of id|secretEnv|secretKey|callbackUrl rows (lines 242-262) with every callback built from the SUFFIX template and no literal hostname, an idempotent upsert (lines 350-391) that writes a freshly generated secret back into the workspace secret store on first create only, and a group provisioner that currently ensures workspace-users (line 427). The dev sealed file `environments/sealed-secrets/dev.yaml` (254 lines) holds several SealedSecret documents, including workspace-secrets (namespace workspace, carries the POCKET_ID_* keys) and website-secrets (namespace website). The database helper `scripts/backup-restore-db.sh` (201 lines) is dispatcher-called and implements list, trigger, and restore; restore accepts all (nextcloud, vaultwarden, website, docuseal — line 66) or a single database, guards on an explicit yes confirmation (lines 87-90), and dispatches through the case block at lines 196-201. The runbook `docs/runbooks/business-restore.md` does not exist yet (confirmed by listing). Because intel records that inbox_items carries no tenant column, the restore demo proves the business scope through a self-contained probe table it owns itself instead of depending on application schema.

Target files (only these; S1 computed exactly with wc -l, the baseline lookup, and gates.yaml s1.limits):

- `k3d/pocket-id-client-seed.yaml` Ist 432 · Schwelle: no S1 limit for YAML files (s1.limits lists only .astro, .ts, .svelte, .sh, .mjs, .mts, .py, .js, .jsx, .tsx, .cjs, .bash, .java, .php), baseline lookup nicht-baselined → Budget n/a; planned growth about +6 lines.
- `environments/sealed-secrets/dev.yaml` Ist 254 · Schwelle: no S1 limit for YAML files (same gates.yaml evidence), baseline lookup nicht-baselined → Budget n/a; planned growth +2 lines, one sealed key per document.
- `scripts/backup-restore-db.sh` Ist 201 · Schwelle 800 → Budget 599 (the .sh limit from gates.yaml s1.limits; baseline lookup nicht-baselined). Planned growth about +90 lines to circa 291, keeping a wide margin under the limit.
- `docs/runbooks/business-restore.md` Ist 0 (new file, absent from disk and from the baseline) · Schwelle: no S1 limit for Markdown files (no entry in gates.yaml s1.limits) → Budget n/a; plan target at most 180 lines with reserve.

### Steps

1. Register the owner secret env in `k3d/pocket-id-client-seed.yaml`. Directly after the SECRET_terminal entry (verified lines 168-169), insert the sibling-shaped block with identical indentation and inline-mapping style:
   ```yaml
            - name: SECRET_owner
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_OWNER_SECRET, optional: true } }
   ```
2. Add the owner client row and the owner group to the same manifest. Append after the terminal-sidekick ROWS row (verified line 261), keeping the double-dollar escaping (the deploy renderer collapses $$ to $; a single $ would break the callback) and mirroring the website row shape with the owner callback path:
   ```
   owner|SECRET_owner|POCKET_ID_OWNER_SECRET|$${SCHEME}://web.$${SUFFIX}/api/owner/callback
   ```
   After the `ensure_group "workspace-users" "Workspace Users"` line (verified line 427), add:
   ```
   ensure_group "workspace-owners" "Workspace Owners"
   ```
   Leave patch_secret untouched: it already writes any new key back to the workspace secret store generically, and the website-namespace sync stays scoped to the website key per the no-rotate discipline in the manifest header.
3. Verify the seed manifest parses, stays template-based, and carries the three additions:
   ```bash
   yq eval '.' k3d/pocket-id-client-seed.yaml > /dev/null && echo PARSE-OK
   grep -n 'SECRET_owner|workspace-owners' k3d/pocket-id-client-seed.yaml
   grep -c 'SUFFIX' k3d/pocket-id-client-seed.yaml
   ```
   The parse must succeed, the grep must show the env entry, the ROWS row, and the group line, and the SUFFIX count must be exactly one higher than before the change (one new templated row; every callback keeps the template form with no literal hostname, S3 clean).
4. Seal the two new tenant keys against the dev controller (controller sealed-secrets in namespace sealed-secrets; flag spellings verified against the repo sealing flow):
   ```bash
   CTX="$(kubectl config current-context)"
   kubeseal --controller-name=sealed-secrets --controller-namespace=sealed-secrets --context "$CTX" --fetch-cert > /tmp/dev-cert.pem
   openssl rand -base64 48 > /tmp/owner-secret.txt
   openssl rand -base64 32 > /tmp/tenant-pepper.txt
   OWNER_SEALED="$(kubeseal --raw --cert /tmp/dev-cert.pem --namespace workspace --name workspace-secrets --from-file /tmp/owner-secret.txt)"
   PEPPER_SEALED="$(kubeseal --raw --cert /tmp/dev-cert.pem --namespace website --name website-secrets --from-file /tmp/tenant-pepper.txt)"
   shred -u /tmp/owner-secret.txt /tmp/tenant-pepper.txt
   ```
   Insert `POCKET_ID_OWNER_SECRET: <OWNER_SEALED value>` into the workspace-secrets document of `environments/sealed-secrets/dev.yaml` at the alphabetical slot after POCKET_ID_NEXTCLOUD_SECRET, and `WEBSITE_TENANT_PEPPER: <PEPPER_SEALED value>` into the website-secrets document after WEBSITE_DB_PASSWORD (verified key order). Then confirm structure and that no plaintext leaked:
   ```bash
   yq eval '.spec.encryptedData | keys | .[]' environments/sealed-secrets/dev.yaml | grep -E 'POCKET_ID_OWNER_SECRET|WEBSITE_TENANT_PEPPER'
   git diff -- environments/sealed-secrets/dev.yaml | grep -E '^\+ *(POCKET_ID_OWNER_SECRET|WEBSITE_TENANT_PEPPER):' | wc -l
   ```
   Both keys must list, and the second command must print exactly 2 (two added sealed lines, sealed blobs only).
5. Add the restore demo to `scripts/backup-restore-db.sh`. Implement `cmd_db_demo_business()` with an optional slug argument defaulting to demo-business; reject slugs outside `^[a-z0-9][a-z0-9-]*$` through the existing _die helper. The function builds marker `p3demo-<STAMP>` with STAMP from date +%Y%m%d-%H%M%S, then runs four phases reusing the file's own helpers and Job shape (same securityContext, podAffinity to the shared-db host, pgvector image, SHARED_DB_PASSWORD from the workspace secret store): (a) seed — apply a Job that creates table demo_restore_probe(business_slug TEXT, marker TEXT, created_at TIMESTAMPTZ DEFAULT now()) when missing and inserts the (slug, marker) row into the website database; (b) backup — call the existing cmd_db_trigger; (c) resolve — take TS from the newest timestamp line of cmd_db_list output (grep for `^[0-9]{8}-[0-9]{6}$`, first hit; empty means _die), then restore with confirmations preset (`YES=true cmd_db_restore website "$TS"`, restoring the previous YES value afterwards; default `: "${YES:=false}"` first so a direct call never trips nounset); (d) verify — apply a Job that counts marker rows for the slug and fails closed through _die unless the count is exactly 1, then print `DEMO-OK slug=<slug> marker=<marker> ts=<TS>`. Register the entry in the case block (verified lines 196-201): `demo-business) cmd_db_demo_business "$@" ;;`.
6. Give restore a business scope in the same script. Extend cmd_db_restore with an optional third argument SCOPE: empty keeps current behavior; `business=<slug>` additionally runs the probe-count verification for that slug after a website restore and fails closed on zero rows. Fail closed with _die when a business scope is combined with any database other than website. Update both usage strings to `restore <db> <timestamp> [business=<slug>]` and print the scope in the header block next to the database and timestamp lines.
7. Check the script statically and confirm the S1 margin:
   ```bash
   bash -n scripts/backup-restore-db.sh && echo SYNTAX-OK
   shellcheck -S warning scripts/backup-restore-db.sh
   grep -n 'demo-business\|business=' scripts/backup-restore-db.sh
   wc -l scripts/backup-restore-db.sh
   ```
   Syntax must pass, shellcheck must report no warning or above, the new branch and scope handling must list, and the line count must land near the planned circa 291, far below the 800 limit.
8. Create `docs/runbooks/business-restore.md` (at most 180 lines) with exactly these sections: Purpose (business-scoped website restore and the demo that proves it); Scope and limits (dev website database; destructive full-database restore with business-scoped verification, not a partial-table restore); Prerequisites (kubectl context, namespace selection, backup storage present); Demo procedure (the exact demo-business invocation and the DEMO-OK assertion); Scoped restore procedure (the exact restore invocation with a business slug); Verification queries (probe-table selects for the slug); Failure modes (marker missing fails closed, no backup directory, job timeouts — each with the next command); Warnings (data loss, the yes confirmation, and the follow-up sync plus restart commands the script prints on completion).
9. Prove scope discipline and S4 reachability:
   ```bash
   git status --porcelain
   git diff --stat
   ```
   Only the four target files may appear. S4 note: this partial creates no new script or manifest file — the one changed script keeps its existing invocation path, and the single new file is documentation, which the orphan rule does not cover; the runbook documents the demo invocation, so the new capability stays reachable from docs.
10. Stage exactly the four target files and commit with the ticket scope:
    ```bash
    git add k3d/pocket-id-client-seed.yaml environments/sealed-secrets/dev.yaml scripts/backup-restore-db.sh docs/runbooks/business-restore.md
    git commit -m "feat(T901022): owner seed, tenant secrets, business restore demo [T901022]"
    ```

### Acceptance criteria

- The seed manifest registers the owner OIDC client (env, ROWS row, secret write-back on first create) and ensures the workspace-owners group; every callback still uses the SUFFIX template with no literal hostname.
- The dev sealed file carries POCKET_ID_OWNER_SECRET in workspace-secrets and WEBSITE_TENANT_PEPPER in website-secrets as sealed values only, with no plaintext in the diff.
- The script offers demo-business end to end (seed, backup, restore, marker verification with DEMO-OK output) and a business scope for website restores that fails closed on mismatch; static checks pass and the file stays far below its 800-line limit.
- The runbook documents the demo and the scoped restore with prerequisites, verification, failure modes, and warnings in at most 180 lines.
- The diff touches only the four target files, no new orphan script or manifest exists, and the commit uses the ticket scope with explicit pathspecs.
