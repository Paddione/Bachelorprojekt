# Brand-Separation-Inventar (Stand: Branch feature/brand-trennung, 2026-11-01)

Quelle: `grep -rn` über Repo (ohne `.git/`, ohne `node_modules`), Muster:
`mentolder\.de`, `fleet-mentolder`, `website-mentolder`, `mentolder-web`,
`react\.mentolder`, `ENV=mentolder`, `PROD_DOMAIN.*mentolder`.
Kein Cluster-Kontakt in p1. Sealed-Secrets: nur Key-Namen gezählt, Inhalte NICHT geöffnet.

Baseline-Guards (p7-Rotphase, Ist-Stand vor Abriss):
- `task domains:check` → OK, 19 Domains, Matrix sauber.
- `task domains:probe -- --cluster fleet` → 4 PASS, 1 SKIP (website-korczewski frozen), 0 FAIL.

## (a) Hosts / DNS / Zertifikate

Live-Hosts (Probe-Beleg): `web.mentolder.de` (200), `mentolder.de` (301 → web),
`studio.mentolder.de` (302), `react.mentolder.de` (200, proposal-Anlass #7051).
Kanonik: `environments/mentolder.yaml:6` (`domain: mentolder.de`),
`environments/fleet-mentolder.yaml:7` (`domain: mentolder.de`),
`environments/fleet-mentolder.yaml:12` (`PROD_DOMAIN: mentolder.de`).
Host-Felder `environments/mentolder.yaml:49-68,83-91` (files/auth/vault/traefik/
mail/brett/mediaviewer/videovault/otel/recover/web/react/studio/dev-Hosts).
`environments/dev-cluster.yaml:13-37` (dev.mentolder.de-Stack, PROD_DOMAIN mentolder.de).
`environments/schema.yaml:46,586-593,749-754,1187` (Schema-Defaults auth.mentolder.de, dev.mentolder.de).
`environments/.secrets/.ssh/config:25,124,151-155` (Host dev.mentolder.de, git-crypt-verschlüsselt).
ipv64-Referenzen (DNS-Cutover-Quelle): `scripts/fleet-dns-cutover.sh:10`,
`taskfiles/Taskfile.platform.yml:483-497` (`fleet:dns:cutover`, `fleet:dns:rollback`),
`environments/sealed-secrets/*.yaml` (ipv64-Keys, verschlüsselt — nur Vorkommen gezählt),
`prod/cluster-issuer.yaml`, `prod-fleet/platform/cluster-issuer.yaml`,
`k3d/secrets.yaml`, `k3d/website-dev-secrets.yaml`.
Zertifikate: `korczewski-tls` in `prod-fleet/website-korczewski/` (bleibt);
mentolder-TLS via Cluster-Issuer (s. o.).

## (b) Manifeste / Flux

Zu löschen (p5, je mit Zeilenzahl verifiziert):
- `prod-fleet/website-mentolder/kustomization.yaml:23`
- `prod-fleet/website-mentolder/website-ingress-web.yaml:53`
- `prod-fleet/website-mentolder/website-patch.yaml:15`
- `prod-fleet/website-mentolder/website-security-headers.yaml:19`
- `prod-fleet/mentolder/kustomization.yaml:343`
- `prod-fleet/mentolder/studio-ingress.yaml:23`
- `prod-fleet/mentolder/studio-patch.yaml:27`
- `flux/clusters/fleet/ks-mentolder.yaml:42` (`prune: true`, Zeile 20)
- `flux/clusters/fleet/ks-jobs-mentolder.yaml:19` (`prune: true`, Zeile 17)
- `flux/clusters/fleet/ks-website-mentolder.yaml:18` (`prune: true`, Zeile 17)

Zu ändern (p2, exakte Keys):
- `flux/clusters/fleet/ks-korczewski.yaml:17` (`suspend: true`), `prune: true` (27)
- `flux/clusters/fleet/ks-jobs-korczewski.yaml:14` (`suspend: true`), `prune: true` (22)
- `flux/clusters/fleet/ks-website-korczewski.yaml:14` (`suspend: true`), `prune: true` (24)
- `flux/clusters/fleet/ks-korczewski-auth.yaml:15` (`suspend: true`), `prune: true` (28)
- `ks-korczewski-auth.yaml` hat Cross-Brand-Dep auf `flux-mentolder` (DB-Backend
  zentrale shared-db) — beim mentolder-Abriss (p5) beachten, Unfreeze zuerst (p2).

Bleibt (p4, live-Stand): `prod-fleet/website-korczewski/` mit
`kustomization.yaml`, `website-ingress-web.yaml`, `website-patch.yaml`,
`website-apex.yaml` (Apex-Routing korczewski.de → web, T901440),
`website-security-headers.yaml`, `pocket-id-client-seed-website-rbac.yaml`.
`website-patch.yaml:19` setzt `BRAND_ID` (Wert: massage — Vögelsen-Site, kein neues Content erfinden).

Spiegel/Referenzen (kein Abriss, nur Kenntnis):
- `prod-fleet/website-staging/kustomization.yaml:5`, `website-patch.yaml:14`,
  `website-security-headers.yaml:2` (mirrors website-mentolder; Staging bleibt).
- `prod/ingress.yaml:353-369`, `k3d/mentolder-web.yaml`, `k3d/ingress.yaml:84`,
  `k3d/kustomization.yaml:60`, `k3d/website.yaml:556` (k3d-Lokalstack, kein Fleet-Abriss).
- `docs/handover/mentolder-gekko/` (Handover-Docs an Eigner, bleiben).

## (c) Envs / Secrets

Zu löschen (p5): `environments/fleet-mentolder.yaml:127`,
`environments/mentolder.yaml:139` (Delta: tasks.md nannte 127 für fleet-mentolder
— verifiziert 127; mentolder.yaml ohne Zeilenangabe — verifiziert 139).
Referenzen: `environments/mentolder.yaml:4-5,104` (`secrets_env: fleet-mentolder`,
`secrets_ref: sealed-secrets/fleet-mentolder.yaml`),
`environments/fleet-mentolder.yaml:5,100,109,116,123`,
`environments/staging.yaml:26`, `environments/schema.yaml:962,1817-1819`,
`prod-fleet/mentolder/kustomization.yaml:10,35`.

Zu prüfen (p3): `environments/fleet-korczewski.yaml:125`,
`environments/korczewski-prod.yaml:155`.
Sealed-Secrets (nur Key-Namen gezählt, Inhalte nie geöffnet):
- `environments/sealed-secrets/fleet-mentolder.yaml`: 123 Keys (fällt unter p5-Daten-Grenze: NICHT löschen ohne Eigner-Go — Cluster-Daten-Grenze).
- `environments/sealed-secrets/fleet-korczewski.yaml`: 108 Keys (p3 Re-Seal-Quelle).
- `environments/sealed-secrets/korczewski-prod.yaml`: 73 Keys.
Weitere `environments/korczewski.yaml` (280-Zeilen-Nachbar, kein Plan-Target — unberührt).

## (d) Code / Content / Docs

Zu löschen (p6): `components/mentolder-web/` (Dockerfile, index.html, nginx.conf,
package.json, pnpm-lock.yaml, pnpm-workspace.yaml, public/, src/, tsconfig.app.json)
+ `components/website/content/mentolder/` (13 JSONs, alle vorhanden):
faq, footer, homepage-blocks, homepage, kontakt, kore-flags, leistungen,
navigation, referenzen, seo, services, stammdaten, ueber-mich.
Unberührt: `components/website/content/{korczewski,massage,presentation}/`
(korczewski-Content existiert — p4 baut darauf, nichts erfinden).
`mentolder-web`-Referenzen (vor p6 bereinigen, Trefferliste):
`llms.txt:12`, `commitlint.config.cjs:39`, `environments/mentolder.yaml:28`,
`environments/schema.yaml:176,183,720,859`, `prod/ingress.yaml:353-369`,
`.dockerignore:4`, `k3d/website.yaml:556`, `k3d/kustomization.yaml:59-60`,
`k3d/mentolder-web.yaml`, `k3d/ingress.yaml:84`,
`prod-fleet/components/debug-logging/kustomization.yaml:101`,
`.github/workflows/build-mentolder-web.yml` (Workflow prüfen/löschen in p6),
`tests/e2e/specs/mentolder-web-smoke.spec.ts` + `sa-21-admin-actions.spec.ts:36,71`
(testids `redeploy-website-mentolder`; e2e-Specs prüfen in p6/p7),
`docs/superpowers/specs/2026-06-2*` + `2026-07-02-*` (historische Specs, bleiben),
`docs/agent-guide/gui-audit-evidence-*.md` (Beleg-Docs, bleiben).
Docs mit mentolder-Bezug (bleiben, historisch): `AGENTS.md:43,66` (Topologie —
wird durch Plan-Arbeit überholt, Update in p7/finaler Doku-Runde),
`docs/agent-guide/maps/domains-map.md`, `docs/handover/mentolder-gekko/`,
`docs/adr/ADR-015-website-basis-in-k3d.md`.
Training-Daten `.agents/training/dataset*.jsonl|json` (mentolder-Beispiele —
Modell-Training, kein Abriss-Target).

## (e) CI / Workflows / Skripte

- `.github/workflows/e2e.yml:283` — korczewski-Block auskommentiert (Zeilen 58-75,
  T002602-Einfrierung; Reaktivierung p4), `options: [both, mentolder]` (32),
  Exclude-Filter (193-207). `ENV=mentolder`-Muster in `AGENTS.md:43`,
  `k3d/README.md:54`, Trainingsdaten (bleiben).
- `lighthouserc.json:27` — URL `https://web.mentolder.de` (p4 → web.korczewski.de).
- `.github/workflows/build-mentolder-web.yml` — Deploy `react.mentolder.de` (p6 prüfen).
- `.github/workflows/e2e-pr.yml:60` (`PROD_DOMAIN: mentolder.de` — prüfen in p4/p7).
- `taskfiles/Taskfile.web.yml:15,34,359`, `Taskfile.test.yml:577,633,684`,
  `scripts/systemtest-fanout.sh:37`, `scripts/web-audit.mjs:136`,
  `scripts/register-oidc-client.mjs:46,48` (mentolder-Defaults — kein Abriss, nur Kenntnis).
- `tests/py/spec/test_fleet_operations.py:190,237-240,342,356`,
  `test_website_core.py:49-52`, `test_flux_render_and_security.py:105-110`,
  `monitoring_alerts/test_backup_recipient_daily_repeat.py:8`,
  `native_ported/...` (Tests referenzieren mentolder-Overlays — p7-Regressionstor,
  keine Vorab-Änderung).
- `tests/evals/golden/task-list-all.txt:149-154` (fleet:dns-Task-Doku, bleibt).

## (f) OIDC-Clients (Pocket ID mentolder)

`environments/fleet-mentolder.yaml:73-75` (POCKET_ID_FRONTEND_URL/DOMAIN/URL
auth.mentolder.de), `environments/mentolder.yaml:66-68`, `environments/schema.yaml:749-754`
(Defaults), `environments/dev-cluster.yaml:31-32`. Registry: `studio-mentolder`
(`docs/agent-guide/registry/domains.yaml:87-99`,
Manifest `prod-fleet/mentolder/studio-ingress.yaml`). korczewski-Seite bleibt:
`flux-korczewski-auth` (ns workspace-korczewski, DBs website_massage/
pocket_id_korczewski in zentraler shared-db), `pocket-id-client-seed-website-rbac.yaml`.
Re-Seal nur via `task env:seal ENV=fleet-korczewski` (p3); OIDC-Client-Registrierung
via `scripts/register-oidc-client.mjs` (mentolder-Default — p3 prüfen).

## Delta-Tabelle (verbindlich für p5/p6)

| Plan-Angabe (tasks.md) | Befund | Entscheidung |
|---|---|---|
| p5 = 12 Dateien (4 website-mentolder + 3 mentolder + 3 ks + 2 envs) | alle 12 vorhanden, Zeilenzahlen stimmen (website-mentolder 23/53/15/19, mentolder 343/23/27, ks 42/19/18, fleet-mentolder 127) | p5 löscht exakt diese 12 |
| `environments/mentolder.yaml` ohne Zeilenangabe | 139 Zeilen | in p5-Löschliste enthalten |
| p6 = mentolder-web (3 Repräsentanten) + 13 content-jsons | Verzeichnis + alle 13 JSONs (inkl. navigation/referenzen/seo/services/stammdaten/ueber-mich) vorhanden | p6 löscht Verzeichnis + 13 JSONs |
| `apex-korczewski` (domains.yaml:71-84, Manifest website-apex.yaml) | liegt unter website-korczewski, Host `${PROD_DOMAIN}` | BLEIBT (kein Raten; p7 prüft Zugehörigkeit) |
| `website-staging` (mirrors website-mentolder) | Staging-Overlay, kein mentolder-Prod | BLEIBT |
| `environments/sealed-secrets/fleet-mentolder.yaml` (123 Keys) | nicht in p5-Liste | BLEIBT im Repo (Daten-Grenze; Eigner-Entscheidung) |
| `k3d/mentolder-web.yaml`, `prod/ingress.yaml`-Refs | Lokal-/Alt-Stack | BLEIBT (kein Fleet-Abriss) |
| Registry-IDs `website-mentolder`, `studio-mentolder` (+ `website-staging`? — Staging bleibt) | domains.yaml:29,87 | p7 entfernt website-mentolder + studio-mentolder; website-staging bleibt |

## Zählung

- Dateien mit mentolder-Referenz (Muster oben, ohne `.git/`, ohne node_modules,
  inkl. Trainingsdaten/Archive/Specs): ~120 Fundstellen in ~60 Dateien
  (Voll-Log `/tmp/opencode/p1-grep.txt` im Erstellungs-Workspace, nicht committet).
- Abriss-Targets: p5 = 12 Dateien (688 Zeilen Summe), p6 = Verzeichnis (9 Top-Einträge)
  + 13 JSONs. Sealed-Key-Namen: 123 (fleet-mentolder) / 108 (fleet-korczewski) / 73 (korczewski-prod).
- Registry: 19 Domains (check grün); mentolder-IDs: website-mentolder, studio-mentolder
  (+ D1-Entscheidung); korczewski-IDs: website-korczewski (frozen), apex-korczewski
  (bleibt), korczewski-web/apex/auth-mirror (devmesh-Spiegel, unberührt).
