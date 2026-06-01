# Flux vollständig entfernen — Design-Spec

**Datum:** 2026-06-01
**Branch:** `feature/flux-complete-removal`
**Pfad:** feature (Infra-Refactor + Cleanup mit Verhaltensänderung am Prod-Deploy)

## 1. Ziel

Flux **vollständig** aus dem Repo entfernen — das verbleibende `flux/`-Verzeichnis, alle inerten Flux-Marker, stale Kommentare und das `flux/`-Routing-Token. Die unter `flux/apps/` liegenden **live Website-Overlays** (Ingress/TLS/Security-Headers) sind funktional und werden **nicht gelöscht, sondern verschoben** nach `prod-fleet/website-{mentolder,korczewski}/` und korrekt in `website:deploy` verdrahtet (schließt nebenbei den T000146-Source-of-Truth-Gap).

Vorab abgesichert: das vom User als „Funktionsrisiko" markierte Keycloak-Realm-Import-`$$`-Escaping.

## 2. Schlüssel-Erkenntnis: das `$$`-Escaping bleibt (verifiziert)

Die Annahme „`$$` wird nur von Flux' drone-envsubst gebraucht" ist **falsch**. Der Push-Deploy-Pfad selbst kollabiert `$${` → `${`:

```
kustomize build … | envsubst "$VARS" | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' | kubectl apply
```
— `Taskfile.yml:1724` (Dev/k3d-Pfad) und `Taskfile.yml:1831` (Prod-Overlay-Pfad). Dieser `sed`-Schritt **ist** der drone-envsubst-Ersatz.

**Empirischer Beweis** (Render durch die echte Pipeline):
- `sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' prod/import-entrypoint.sh` ergibt `eval val="\${${var}:-}"`, `sed -i "s|\${${var}}|${val}|g"`, `grep -q '\${[A-Z_]*}'` — **valides single-`$` POSIX-sh**.
- `… | sh -n` → **valides POSIX sh**.
- Substitutions-Kernzeilen **identisch** zum erprobten Dev-Script `k3d/realm-import-entrypoint.sh`.

**Konsequenz (Locked Decision #1):** Das `$$` in `prod/import-entrypoint.sh` und der `sed`-Collapse in `Taskfile.yml:1724/1831` **bleiben unverändert**. Flux entfernen erfordert **kein** Flippen des Escapings. Der „getestete Realm-Import" wird zum **Regressions-Test**, der genau dieses Rendering festnagelt (statt der jetzt veralteten Flux-CLI-Annahme).

## 3. Locked Decisions (mit dem User geklärt)

1. **Escaping behalten**, nur Flux raus. Guard-Test (`tests/unit/keycloak-entrypoint-escaping.bats`): Begründung von „Flux drone-envsubst" auf „Push-`sed`-Collapse" umschreiben, `$$`-Assertion behalten, **Render-durch-Pipeline-Regressionstest** ergänzen.
2. **Relocation:** `flux/apps/website-{brand}/` → `prod-fleet/website-{brand}/`, verdrahtet in `website:deploy` (schließt T000146).
3. **Wiring = Voll-Overlay als Single-Source:** `website:deploy` (prod) appliziert künftig `kustomize build prod-fleet/website-<brand> | envsubst | sed | kubectl apply --server-side --force-conflicts` und **ersetzt** den imperativen `website.yaml`-Apply. Redundante Overlay-Patches entfallen; `environments/<env>.yaml` bleibt Single-Source für Brand-Config/Image/Affinity.

## 4. Redundanz-Befund → Overlay-Form

Brand-spezifische Werte liegen **bereits in `environments/<env>.yaml`** und werden von `k3d/website.yaml` via `${VAR}` substituiert:
- `LEGAL_ZIP`, `SMTP_PORT/SECURE`, `LLM_ENABLED`, `LLM_RERANK_ENABLED`, `SYSTEMTEST_LOOP_ENABLED` → `website-config-patch.yaml` **redundant**.
- `image: ghcr.io/paddione/${WEBSITE_IMAGE}:latest` (`website.yaml:201`), `WEBSITE_IMAGE`=`{brand}-website` → `image-tag.yaml` **redundant**.
- `WEBSITE_NODE_AFFINITY`=`["pk-hetzner-4/6/8"]` (beide Brands), imperativer Patch deckt beide ab → korczewski-Overlay-Affinity-Patch **redundant**.

**Resultierende relocatete Overlays (geslimmt auf das echte additive Delta):**

`prod-fleet/website-mentolder/`:
- `kustomization.yaml` — `namespace: website`; resources: `../../k3d/website.yaml`, `../../k3d/website-seller-config.yaml`, `website-ingress-web.yaml`; **keine** `patches:`.
- `website-ingress-web.yaml` — Ingress (`workspace-wildcard-tls` + workspace-Middlewares). Verbatim verschoben.

`prod-fleet/website-korczewski/`:
- `kustomization.yaml` — `namespace: website-korczewski`; resources: `../../k3d/website.yaml`, `../../k3d/website-seller-config.yaml`, `website-security-headers.yaml`; **eine** `patches:`-Entry = der IngressRoute-TLS/websecure/security-headers-JSON-Patch (das einzige echte Delta, DRY). Image-tag-, config-patch- und node-affinity-Patches **entfernt**.
- `website-security-headers.yaml` — Traefik Middleware in `website-korczewski` ns (allowCrossNamespace=false, SA-01/T000171). Verbatim verschoben.

**Pfad-Fixup:** in beiden `kustomization.yaml` `../../../k3d/` → `../../k3d/` (Tiefe 3 → 2). `$imagepolicy`-Kommentare entfallen mit `image-tag.yaml`.

## 5. website:deploy-Wiring (prod ENVs)

Reihenfolge im Task (ENV != dev):
1. Build/Push/Digest (unverändert).
2. ENV→Overlay-Map: `mentolder|fleet-mentolder` → `website-mentolder`; `korczewski|fleet-korczewski` → `website-korczewski`.
3. `kustomize build prod-fleet/website-<brand> --load-restrictor=LoadRestrictionsNone | envsubst "<website-var-list>" | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' | kubectl ${CTX_ARG} apply --server-side --force-conflicts -f -` — **ersetzt** den bisherigen `envsubst website.yaml | apply` + `envsubst website-seller-config.yaml | apply` (Zeilen 2809-2810).
4. `WEBSITE_NODE_AFFINITY`-Patch (unverändert, env-driven, beide Brands).
5. Digest-Pin / mixed-arch-rollout (unverändert).
6. Kommentar 2840-2842 umschreiben (auf `prod-fleet/website-<brand>`, ohne `flux/apps/`).

`<website-var-list>` = die bestehende `website:deploy`-Liste (Zeile 2809) — deckt `website.yaml` + `website-seller-config.yaml` + die hardcoded-hostname-Ingress/Middleware ab. Der `sed`-Collapse ist hier harmlos (kein `$$` in Website-Manifests) und sorgt für Pipeline-Konsistenz.

**Dev-Pfad (ENV=dev) bleibt unverändert** (web.localhost, kein TLS, kein Overlay).

## 6. Vollständiges Removal/Relocation-Inventar

### 6a. Entfernen (inerte Marker / tote Refs)
- `k3d/brett.yaml:44` — `# {"$imagepolicy": "flux-system:brett"}`-Kommentar strippen (`:latest` bleibt).
- `k3d/docs.yaml:21` — `# {"$imagepolicy": "flux-system:docs"}`-Kommentar strippen.
- `k3d/shared-db.yaml:10-11` — Annotation `kustomize.toolkit.fluxcd.io/reconcile: disabled` entfernen; falls `annotations:` dadurch leer wird, den leeren Key ganz löschen.
- `flux/`-Verzeichnis: nach erfolgreichem Relocate + Build-Verifikation `git rm -r flux/`.

### 6b. Routing-Token `flux/` entfernen (Dir ist weg)
- `CLAUDE.md:11` — `` `flux/`, `` aus der infra-Signals-Zelle (`prod*/` deckt die relocateten Overlays ab).
- `.claude/agents/bachelorprojekt-infra.md:7` — `flux/, ` aus Triggers; **Zeile 28** (`flux/apps/`-Bullet) ganz löschen; optional prod-fleet-Bullet um `website-{brand}/` ergänzen.
- `scripts/plan-frontmatter-hook.sh:25` — `flux/|` aus der `grep -qiE`-Alternation droppen (Rest bleibt).
- `scripts/docs-gen/registry.test.mjs:53` — `flux/`-Token aus der Routing-Tabellen-Fixture-Zelle. **Row-Count-Assertion (6 Zeilen) bleibt grün** (Token ≠ Zeile).

### 6c. Aktualisieren (Kommentare/Wiring)
- `Taskfile.yml:2767-2890` (`website:deploy`) — Voll-Overlay-Wiring (§5).
- `Taskfile.yml:2840-2842` — Kommentar auf `prod-fleet/website-<brand>` umschreiben, `flux/apps/` raus.
- `Taskfile.yml:1557-1558` — „overlays unter flux/apps/ … pending relocation" → „liegen unter `prod-fleet/website-{m,k}/`, appliziert von `website:deploy`; `flux/` ist entfernt". Zeilen 1553-1556 (historische Notiz) bleiben.
- `tests/unit/keycloak-entrypoint-escaping.bats` — siehe §7.
- `tests/unit/manifests.bats:475` — Pfad `flux/apps/website-mentolder` → `prod-fleet/website-mentolder` (Test „website overlay allows egress to workspace-office"; die `allow-egress-to-workspace-office` NetworkPolicy steckt transitiv in `k3d/website.yaml` → bleibt grün).

### 6d. Regenerieren (nicht von Hand editieren)
- `k3d/docs-content-built/agents.html` (infra-Card) — nach `bachelorprojekt-infra.md`-Edit via `node scripts/build-docs.mjs` regenerieren; Diff prüfen (nur das `flux/`-Token-Delta committen).

### 6e. Unangetastet lassen (False-Positives / korrekte Doku / Guards / Historie)
- `prod/import-entrypoint.sh` `$$` + `Taskfile.yml:1724/1831` `sed`-Collapse (Locked #1).
- `CLAUDE.md:167`, `CONTRIBUTING.md:94` (korrekte Push-based-Doku), `GEMINI.md` (analog).
- `tests/unit/discover-versions.bats:57-59,79`, `tests/local/mandatory-sequences.bats:54-55` — **Guards**, die assertieren, dass Flux NICHT (mehr) getrackt wird → schützen vor Re-Add.
- `k3d/website-rbac.yaml` — reines Monitoring-RBAC, kein Flux-CRD-RBAC (bereits in #1282/#1285 entfernt).
- `k3d/cronjob-systemtest-cleanup.yaml:5` („reconciles" = App-Verhalten).
- `website/src/components/kore/KoreHomepage.svelte:212`, `website/src/config/brands/korczewski.ts` (FluxCD als Marketing/Skill-Name), `tests/e2e/specs/nfa-12-brainstorm-tunnel.spec.ts:23` (Live-Cluster-Test-Beschreibung).
- `docs/superpowers/specs/2026-05-19-flux-gitops-design.md`, `docs/systemtest-fragebogen.md`, alle `*CHANGELOG*`, `assets/grilling-brett-admin-panel/*.html` — Historie (Locked #3).
- `k3d/docs-content-built/decisions.html`, `systemtest-fragebogen.html` — aus historischen Quellen generiert, ändern sich hier nicht.

## 7. Test-Plan (inkl. „getesteter Realm-Import")

`tests/unit/keycloak-entrypoint-escaping.bats` umbauen:
1. **Header-Kommentar** (Z.2-23): Flux-Framing → Push-`sed`-Mechanismus (`Taskfile.yml:1724/1831`). PR-#1168-Regression-Kontext als Push-`sed`-Contract reframen.
2. **Test „survives Flux drone-envsubst (flux CLI)"** (Z.29-36): umbenennen zu sed-Collapse-Test; `flux envsubst` → `sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g'`; assertieren: exit 0 + Output enthält `eval val="\${${var}:-}"`. `command -v flux || skip` entfällt (keine Flux-Dependency).
3. **Test (Z.38-43)** — unverändert (greppt die gedoppelte Form `eval val="\$${$${var}:-}"`; schützt vor Re-De-Doubling).
4. **Test (Z.45-49)** — behalten, Kommentar auf „Push-`sed`-`$$`-Collapse" (statt Flux); `sed 's/\$\$/\$/g' | sh -n` bleibt.
5. **NEU — Parity-/„tested realm import"-Regressionstest:** `prod/import-entrypoint.sh` durch den echten Push-`sed`-Collapse rendern, dann (a) `sh -n` → valides POSIX sh, (b) **Parity**: die collabierten Substitutions-Kernzeilen matchen `k3d/realm-import-entrypoint.sh` (`eval val="\${${var}:-}"` + `sed -i "s|\${${var}}|${val}|g"`). Beweist: prods `$$` kollabiert exakt zur erprobten single-`$`-Semantik des Dev-Scripts.

Weitere Gates:
- `kustomize build prod-fleet/website-mentolder/` + `…/website-korczewski/` (`--load-restrictor=LoadRestrictionsNone`) exit 0; mentolder-Output enthält `website-ingress-web` (workspace-wildcard-tls + Middlewares), korczewski-Output die IngressRoute (web+websecure, korczewski-tls) + `website-security-headers` Middleware in `website-korczewski`. Keine `flux-system:`-Marker mehr in den verschobenen Dateien.
- Render-Stream-Check: `kustomize build prod-fleet/website-<brand> | envsubst "<liste>"` enthält **keine** unaufgelösten `${`.
- `bats tests/unit/manifests.bats` (Pfad-Repoint grün).
- `node --test scripts/docs-gen/registry.test.mjs` (6 Zeilen, grün).
- `task test:all` grün; `task test:inventory` → `website/src/data/test-inventory.json` regenerieren + committen (CI failt bei Drift).
- `git diff k3d/docs-content-built/agents.html` zeigt nur das `flux/`-Token-Delta.
- `task workspace:validate` grün.
- **Post-Merge (push-based, kein Reconciler):** `task website:deploy ENV=mentolder` + `ENV=korczewski`; verifizieren, dass `kubectl --context fleet -n website get ingress website-ingress-web` bzw. `… -n website-korczewski get ingressroute,middleware` existieren und `web.<domain>` HTTPS liefert (T000146 geschlossen).

## 8. Risiken & Mitigation

- **Double-Apply / Feld-Konflikt:** durch Voll-Overlay-Ersatz (statt Parallel-Apply) vermieden; `--server-side --force-conflicts` + Digest-Pin **nach** Apply; Node-Affinity bleibt imperativer Single-Owner (Overlay-Affinity-Patch gedroppt).
- **Image-Flip-Flop (:latest vs Digest):** Digest-Pin-/rollout-Logik nach dem Apply re-ausführen (bestehende conditional Logik beibehalten).
- **ENVSUBST_VARS-Coverage:** Render-Stream-Check (kein `${` übrig) vor Apply; Website-Config-Werte aus `environments` decken alle `${VAR}` in `website.yaml` ab.
- **Parity-Test-Annahme:** envsubst ist auf `import-entrypoint.sh` ein No-op (nur gedoppelte `$$`, keine bare `${VAR}` die der Deploy substituiert) — im Test-Kommentar dokumentieren; der Test modelliert gezielt die `sed`-Collapse-Stufe.
- **build-docs-Churn:** `node scripts/build-docs.mjs` ggf. mehr als `agents.html`; Diff prüfen, nur intendiertes Delta committen, sonst auf frischem main rebasen.
- **Shared-Registry-Footgun:** `CLAUDE.md`/`registry.test.mjs`-Edits low-collision (kein neuer Domain/OIDC-Secret); bei Parallel-Branch an der Routing-Tabelle keep-both-Rebase erwarten.
- **korczewski IngressRoute revert:** website.yaml-Base-IngressRoute wird im selben Overlay vom TLS-Patch überschrieben → finaler Zustand = TLS-Route (kein Revert, da im selben Apply).

## 9. Out of Scope / Follow-ups
- Kein Flippen des Escapings, keine `sed`-Collapse-Entfernung (Locked #1).
- Keine Edits an historischen Specs/Plänen/Changelogs.
- `docs:deploy` (Docker-Build + Rollout der regenerierten HTML auf fleet) ist ein **Post-Merge-Deploy-Schritt**, kein Plan-Inhalt.
