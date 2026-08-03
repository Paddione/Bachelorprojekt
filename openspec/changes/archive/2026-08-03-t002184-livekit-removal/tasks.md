---
title: "t002184-livekit-removal — Implementation Plan"
ticket_id: T002184
domains: [infra, website, test, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002184-livekit-removal — Implementation Plan

_Ticket: T002184_

Vollständiger Rückbau von LiveKit aus Cluster und Repo. Die Reihenfolge ist
**sicherheitsgetrieben** und darf nicht umsortiert werden:

```
P1 Cluster (Health-Gate zuerst)  →  P2 Manifeste  →  P3 Env/Secrets/CI-Allowlist
                                 →  P4 Website-UI →  P5 Doku/Specs/Tests  →  P6 Verify
```

**Begründung der Reihenfolge (T002207):** Ein ungesunder Workload friert die gesamte
Flux-Kustomization ein. Solange `livekit-egress` im Cluster steht und nicht startet, wird jede
weitere Manifest-Änderung von Flux nicht mehr ausgerollt. Deshalb erst der Cluster-Rückbau
(P1), dann die Repo-Änderungen. Umgekehrt (erst Manifest löschen, dann Cluster) würde Flux die
Ressource per Prune entfernen wollen, während sie noch im Health-Gate hängt — Race statt
kontrolliertem Rückbau.

## File Structure

```
GELÖSCHT
  k3d/livekit-egress.yaml
  website/src/pages/portal/stream.astro
  website/src/pages/admin/live/index.astro
  website/src/components/live/LiveCockpit.svelte
  website/src/components/live/stream/StreamCockpit.svelte
  website/src/components/LiveStream/StreamPlayer.svelte
  website/src/pages/api/admin/ops/dns/pin.ts

GEÄNDERT — Manifeste/Overlays
  k3d/kustomization.yaml                                  (Resource-Eintrag Zeile 24)
  k3d/namespace.yaml                                      (hostNetwork-Kommentar)
  k3d/README.md
  prod-fleet/components/fleet-common/kustomization.yaml   (Node-Affinity-Pin)
  prod-korczewski/kustomization.yaml                      (patch-livekit.yaml-Verweis)
  prod-korczewski/ddns-updater.yaml                       (livekit-DNS-Record)

GEÄNDERT — Env/CI
  environments/staging.yaml
  environments/korczewski.yaml
  environments/fleet-korczewski.yaml
  environments/mentolder.yaml
  environments/fleet-mentolder.yaml
  environments/schema.yaml                                (STREAM_DOMAIN)
  .github/workflows/build-website.yml                     (envsubst-Allowlist, 2 Stellen)
  Taskfile.yml                                            (envsubst-Listen + livekit:dns-pin)

GEÄNDERT — Website
  website/src/lib/helpContent.ts
  website/src/lib/system-test-seed-data.ts
  website/src/components/admin/ops/DnsZertTab.svelte
  website/vitest.config.ts

GEÄNDERT — Doku/Config/Tests
  CLAUDE.md
  AGENTS.md
  GEMINI.md
  README.md
  renovate.json5
  commitlint.config.cjs
  .claude/agents/bachelorprojekt-ops.md
  .claude/lib/goals.md
  .claude/skills/OVERVIEW.md
  .claude/skills/infra-ops/SKILL.md
  .claude/skills/incident-response/SKILL.md
  .claude/skills/operations-management/SKILL.md
  .claude/skills/dev-flow-e2e/SKILL.md
  docs/superpowers/references/gotchas-footguns.md
  docs/superpowers/references/secrets-architecture.md
  docs/agent-guide/30-bausteine.md
  docs/agent-guide/registry/components.yaml
  docs/diagrams/architecture.md
  docs/bereitstellungsdetails.md
  docs/fleet-stage2-cutover-runbook.md
  openspec/config.yaml
  openspec/component-map.yaml
  tests/spec/workspace-deploy.bats                        (neuer Guard-Test G-LK01)
  tests/spec/health-goals.bats                            (G-OPS01b entfernen)
  tests/unit/fleet-dns-cutover.bats
  tests/spec/ci-cd.bats
  scripts/fleet-dns-cutover.sh
  scripts/check-connectivity.sh
  scripts/systemtest-fanout.sh
  scripts/factory/service-registry.sh
  scripts/trivy-scan.sh
  scripts/plan-context.sh
  scripts/build-graph-shared.mjs
  scripts/vda/oracle.sh
  scripts/triage/few-shot-examples.json
  scripts/hetzner/cloud-init.yaml.tmpl
  scripts/hetzner/cloud-init-server.yaml.tmpl
  templates/brain/wiki/capabilities.md

DELTA-SPECS (dieser Change)
  openspec/changes/t002184-livekit-removal/specs/workspace-deploy.md
  openspec/changes/t002184-livekit-removal/specs/fleet-operations.md
  openspec/changes/t002184-livekit-removal/specs/health-goals.md
  openspec/changes/t002184-livekit-removal/specs/website-interfaces.md

REGENERIERT (nicht von Hand editieren)
  docs/generated/graph.json, docs/generated/blast-radius.md
  docs/code-quality/repo-index.json
  k3d/docs-content-built/**            (node scripts/build-docs.mjs)
  website/src/lib/agent-guide.generated.json
  website/src/lib/platform-descriptions.generated.json
  website/src/data/test-inventory.json
  website/all_files.txt

UNANGETASTET (bewusst)
  openspec/changes/archive/**, openspec/specs/archive/**   (Historie)
  website/CHANGELOG.md, website/src/db/migrations/**       (Historie)
  docs/audits/**, docs/adr/**, docs/superpowers/specs/**   (historische Dokumente)
  docs/legacy-html/**                                      (Legacy-Snapshot)
  scripts/one-shot/archive/**                              (Historie)
  assets/**/topology-12node.svg                            (Design-Asset, separat prüfen)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Neuen Guard-Test `G-LK01` in
      `tests/spec/workspace-deploy.bats` ergänzen: er scheitert, solange
      `k3d/livekit-egress.yaml` existiert, solange `k3d/kustomization.yaml` die Ressource
      referenziert oder solange irgendeine Datei ausserhalb der Archiv-/Historien-Pfade
      `livekit` enthält. Der Test muss auf dem aktuellen Branch FEHLSCHLAGEN.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats -f 'G-LK01'
# expected: FAIL (rot — LiveKit ist noch überall im Repo)
```

- [ ] **Fix-Step (GREEN).** Nach P1–P5 muss derselbe Test grün laufen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats -f 'G-LK01'
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

---

## P1 — Cluster-Rückbau (beide Brands)

> Schreibendes `kubectl` gegen `--context fleet`. Jeder Schritt zuerst mit `--dry-run=server`.

- [ ] **P1.1 Vollständiges Ressourcen-Inventar sichern.** Pro Namespace
      (`workspace`, `workspace-korczewski`) alle LiveKit-Objekte als YAML in
      `tmp/claude-scratch/t002184-livekit-backup/<ns>/` exportieren
      (`deploy`, `svc`, `pvc`, `cm`, `ingress`, `sa`, `secret`, `netpol`). Ohne diesen
      Rollback-Snapshot wird nichts gelöscht.

- [ ] **P1.2 Flux-Kustomizations suspendieren.** `flux suspend kustomization flux-mentolder`
      und `flux-korczewski` (alternativ `kubectl -n flux-system patch … spec.suspend=true`),
      damit der Reconciler während des Rückbaus nicht gegenläuft. Suspend-Zustand
      protokollieren — P1.7 hebt ihn wieder auf.

- [ ] **P1.3 Handverwaltete Deployments löschen.** In beiden Namespaces
      `livekit-server`, `livekit-redis`, `livekit-ingress` löschen. Diese drei haben
      `managedFields.manager=kubectl` und **kein** Repo-Gegenstück — sie verschwinden nur
      durch explizites Löschen.

- [ ] **P1.4 `livekit-egress` löschen.** In beiden Namespaces. Bis P2 gemergt und von Flux
      reconciled ist, würde Flux es wieder anlegen — deshalb bleibt der Suspend aus P1.2
      bis nach dem Merge von P2 bestehen (siehe P1.7).

- [ ] **P1.5 Services, Ingresses, ConfigMaps löschen.** `svc/livekit-server`,
      `svc/livekit-redis`, `svc/livekit-ingress-rtmp` (LoadBalancer — nach dem Löschen
      prüfen, dass die fünf externen IPs in `workspace` und der Node-Port 1935 freigegeben
      sind), `ing/livekit-server-ingress`, `cm/livekit-server-config`.

- [ ] **P1.6 PVC `livekit-recordings-pvc` löschen.** Vorher Inhalt sichten und Patrick
      bestätigen lassen, dass keine Aufnahmen archiviert werden müssen. 20Gi je Brand
      (longhorn in `workspace`, local-path in `workspace-korczewski`); nach dem Löschen
      prüfen, dass das PV nicht in `Released` hängen bleibt.

- [ ] **P1.7 Flux resume und Health-Gate beobachten.** Nach dem Merge von P2 die
      Kustomizations wieder aufnehmen und `kubectl -n flux-system get kustomization` prüfen.
      **Erwartung:** Der LiveKit-Health-Blocker ist weg; `flux-mentolder`/`flux-korczewski`
      bleiben aber wegen `Job/…/pocket-id-client-seed dry-run failed (Invalid)` weiterhin
      `Ready=False`. Diesen Reststand als eigenes Bug-Ticket erfassen, nicht hier fixen.

## P2 — Manifeste und Overlays

- [ ] **P2.1 `k3d/livekit-egress.yaml` löschen** und den Resource-Eintrag in
      `k3d/kustomization.yaml` (Zeile 24) entfernen. `task workspace:validate` muss danach
      für beide Brands durchlaufen.

- [ ] **P2.2 `k3d/namespace.yaml` bereinigen.** Der Kommentar begründet `hostNetwork: true`
      mit `livekit-server` und WebRTC-UDP 50000-60000. Prüfen, ob eine andere Ressource
      (coturn/Janus) dieselbe Begründung braucht — falls ja, Kommentar umschreiben statt
      löschen; falls nein, den zugehörigen PodSecurity-/hostNetwork-Freibrief mit entfernen.

- [ ] **P2.3 Node-Affinity-Pins in `prod-fleet/components/fleet-common/kustomization.yaml`
      entfernen.** Dort steht der Repoint-Kommentar und die Pin-Logik, die `livekit-server`
      auf einen bestimmten Fleet-Knoten bindet. Nach der Änderung
      `kustomize build prod-fleet/mentolder` und `prod-fleet/korczewski` diffen und
      sicherstellen, dass **kein anderer** Workload seinen Node-Pin verliert.

- [ ] **P2.4 `prod-korczewski/kustomization.yaml`:** den Kommentarblock zu
      `patch-livekit.yaml` (hostNetwork + STUN, Pin auf pk-hetzner-6) entfernen. Die
      referenzierte Patch-Datei existiert nicht mehr — der Verweis ist tot.

- [ ] **P2.5 `prod-korczewski/ddns-updater.yaml`:** `set_records "livekit.<domain>"` und den
      zugehörigen Log-/Kommentarblock entfernen. Die TURN-Zeile für pk-hetzner-4 bleibt —
      sie gehört zu Nextcloud Talk. Danach den DDNS-CronJob-Output einmal im Dry-Run prüfen.

- [ ] **P2.6 DNS-Records aufräumen.** Nach dem Merge die A-Records für die `livekit`- und
      `stream`-Subdomains beider Brands bei ipv64 löschen — sonst zeigen sie auf
      Fleet-Knoten ohne Backend.

- [ ] **P2.7 `k3d/README.md`** von den LiveKit-Abschnitten befreien.

## P3 — Environments, Secrets, CI-Allowlist

- [ ] **P3.1 `environments/staging.yaml`:** `LIVEKIT_DOMAIN` und `LIVEKIT_PIN_IP` entfernen.

- [ ] **P3.2 `STREAM_DOMAIN` zurückbauen.** Eintrag aus `environments/schema.yaml`
      (Zeile 310) und aus allen fünf Env-Dateien (`mentolder`, `korczewski`,
      `fleet-mentolder`, `fleet-korczewski`, `staging`) entfernen. `task env:validate` für
      jede Env muss danach grün sein.

- [ ] **P3.3 Kommentar-Referenzen in `environments/korczewski.yaml` und
      `environments/fleet-korczewski.yaml`** umschreiben: die TURN-Pin-Begründung nennt die
      LiveKit-Edge als Gegenstück. TURN bleibt, die LiveKit-Erwähnung muss weg.

- [ ] **P3.4 `.github/workflows/build-website.yml`:** `LIVEKIT_DOMAIN` aus beiden
      envsubst-Allowlisten (Zeile 146 mentolder, Zeile 308 korczewski) entfernen — die
      Allowlist ist seit T001993 fail-closed, ein verwaister Eintrag ist echter Drift.
      `STREAM_DOMAIN` im selben Zug prüfen und mitentfernen.

- [ ] **P3.5 `Taskfile.yml`:** `LIVEKIT_DOMAIN`/`STREAM_DOMAIN` aus allen fünf
      `envsubst`-Variablenlisten entfernen, den `LIVEKIT_PIN_IP`-Fallback für
      `MENTOLDER_TURN_PUBLIC_IP` durch `TURN_PUBLIC_IP` ersetzen, den
      `livekit:dns-pin`-Task und den LiveKit-Eintrag in der Doku-Link-Map löschen. Danach
      müssen `task --list` und der Taskfile-Dry-Run-Test sauber sein.

- [ ] **P3.6 Secret-Rückbau prüfen.** `environments/.secrets/*.yaml` (git-crypt) auf
      `LIVEKIT_*`-Keys prüfen; falls vorhanden, entfernen und `task env:seal ENV=<env>` für
      jede betroffene Env neu ausführen, damit die committeten SealedSecrets konsistent
      bleiben. In `workspace-secrets` selbst wurden **keine** `LIVEKIT_*`-Keys gefunden
      (verifiziert) — hier ist voraussichtlich nichts zu tun, die Prüfung ist trotzdem Pflicht.

- [ ] **P3.7 `k3d/secrets.yaml` (dev)** auf `LIVEKIT_*` prüfen und bei Bedarf bereinigen.

## P4 — Website-UI

- [ ] **P4.1 Bestätigung einholen.** Vor dem Löschen von `/portal/stream` und `/admin/live`
      von Patrick schriftlich bestätigen lassen, dass beide Routen nicht mehr gebraucht
      werden. Sie sind in der Admin-Navigation verlinkt und im route-manifest erfasst.

- [ ] **P4.2 Routen löschen:** `website/src/pages/portal/stream.astro` und
      `website/src/pages/admin/live/index.astro`. Verlinkungen in Navigation und
      Portal-Kacheln mit entfernen, damit keine 404-Links zurückbleiben.

- [ ] **P4.3 Komponenten löschen:** `src/components/live/LiveCockpit.svelte`,
      `src/components/live/stream/StreamCockpit.svelte`,
      `src/components/LiveStream/StreamPlayer.svelte` samt leer werdender Verzeichnisse.

- [ ] **P4.4 DNS-Pin-Feature entfernen:** `src/pages/api/admin/ops/dns/pin.ts` löschen und
      den zugehörigen Tab/Abschnitt in `src/components/admin/ops/DnsZertTab.svelte`
      zurückbauen. Prüfen, ob `DnsZertTab` danach noch andere Funktionen hat — falls die
      Komponente leer wird, ebenfalls löschen und aus dem Ops-Dashboard aushängen.

- [ ] **P4.5 `src/lib/helpContent.ts` und `src/lib/system-test-seed-data.ts`** von
      LiveKit-Einträgen befreien. Beim Seed-Data-File darauf achten, dass die
      Systemtest-Fanout-Erwartungen (`scripts/systemtest-fanout.sh`) konsistent bleiben.

- [ ] **P4.6 `website/vitest.config.ts`** auf LiveKit-Pfad-Ausschlüsse prüfen und bereinigen.

- [ ] **P4.7 Generierte Website-Artefakte regenerieren:** route-manifest,
      `src/lib/agent-guide.generated.json`, `src/lib/platform-descriptions.generated.json`,
      `all_files.txt` — per Generator-Task, nicht per Handedit.

## P5 — Doku, Specs, Tests

- [ ] **P5.1 Delta-Specs schreiben.** Vier Delta-Dateien in
      `openspec/changes/t002184-livekit-removal/specs/` (benannt nach dem Parent-SSOT-Slug):
      `workspace-deploy.md` (Szenario „LiveKit DNS-Pinning auf mentolder" entfernen),
      `fleet-operations.md` (Requirement „Brand-Specific LiveKit/TURN IP Pinning" auf reines
      TURN-Pinning reduzieren, den `livekit`-A-Record aus den DNS-Plan-Szenarien nehmen),
      `health-goals.md` (Requirement zu `livekit-egress`/Recreate entfernen),
      `website-interfaces.md` (LiveKit aus dem Fail-soft-Szenario für `/api/timeline`
      nehmen). Die SSOT-Dateien selbst werden **nicht** von Hand editiert — das erledigt
      `openspec archive` beim Abschluss.

- [ ] **P5.2 `tests/spec/health-goals.bats`:** Test `G-OPS01b` und den zugehörigen
      Kommentarblock entfernen. Der Test prüft die Existenz von `k3d/livekit-egress.yaml`
      und wäre nach P2.1 dauerhaft rot. Die Goal-IDs `G-OPS01-STATIC-001` und
      `G-OPS01-STATIC-002` in `.claude/lib/goals.md` entsprechend zurückziehen.

- [ ] **P5.3 `tests/unit/fleet-dns-cutover.bats`:** `LIVEKIT_PIN_IP`-Fixtures und die
      `A|livekit|…`-Erwartungen entfernen, passend zu den Änderungen an
      `scripts/fleet-dns-cutover.sh`.

- [ ] **P5.4 `tests/spec/workspace-deploy.bats`:** `LIVEKIT_DOMAIN` und `STREAM_DOMAIN` aus
      der envsubst-Leftover-Regex entfernen. Der Guard-Test `G-LK01` liegt ebenfalls hier
      (im RED-Schritt als Erstes geschrieben).

- [ ] **P5.5 `tests/spec/ci-cd.bats`:** die Renovate-Gruppierungs-Erwartung von `livekit`
      befreien, passend zu P5.6.

- [ ] **P5.6 `renovate.json5` und `commitlint.config.cjs`:** die `livekit images`-Gruppe
      (matchPackageNames `/^livekit//`) und den `livekit`-Commit-Scope entfernen.

- [ ] **P5.7 `scripts/` bereinigen (12 Dateien).** `fleet-dns-cutover.sh` (livekit-Record und
      `LIVEKIT_PIN_IP`-Pflichtvariable), `check-connectivity.sh`, `systemtest-fanout.sh`,
      `factory/service-registry.sh`, `trivy-scan.sh`, `plan-context.sh`,
      `build-graph-shared.mjs`, `vda/oracle.sh`, `triage/few-shot-examples.json`,
      `hetzner/cloud-init.yaml.tmpl` und `hetzner/cloud-init-server.yaml.tmpl` (UFW-Regeln
      für UDP 50000-60000 und RTMP 1935 entfernen). `scripts/one-shot/archive/**` bleibt
      unangetastet.

- [ ] **P5.8 Agent- und Skill-Konfiguration (8 Dateien in `.claude/`).** LiveKit aus dem
      Routing-Signal von `bachelorprojekt-ops`, aus `OVERVIEW.md`, `infra-ops/SKILL.md`
      (inkl. `references/wsl-openclaw.md`), `incident-response/SKILL.md`,
      `operations-management/SKILL.md` und `dev-flow-e2e/SKILL.md` entfernen.

- [ ] **P5.9 Root-Doku.** `CLAUDE.md` (Routing-Tabelle, Service-Aufzählung, Gotcha
      „LiveKit node-pin", Staging-Hinweis „LiveKit disabled"), `AGENTS.md` (SSOT der
      Routing-Tabelle — muss mit `CLAUDE.md` deckungsgleich bleiben), `GEMINI.md`,
      `README.md`.

- [ ] **P5.10 `docs/`-Quelldateien.** `superpowers/references/gotchas-footguns.md`,
      `superpowers/references/secrets-architecture.md`, `agent-guide/30-bausteine.md`,
      `agent-guide/registry/components.yaml`, `diagrams/architecture.md`,
      `bereitstellungsdetails.md`, `fleet-stage2-cutover-runbook.md`. **Nicht** anfassen:
      `docs/adr/**`, `docs/audits/**`, `docs/superpowers/specs/**`, `docs/legacy-html/**` —
      das sind datierte historische Dokumente.

- [ ] **P5.11 `openspec/config.yaml` und `openspec/component-map.yaml`:** LiveKit aus der
      Service-Aufzählung im `context:`-Block und aus der Komponenten-Map nehmen.

- [ ] **P5.12 `templates/brain/wiki/capabilities.md`** bereinigen.

- [ ] **P5.13 coturn/Janus/Talk-HPB prüfen (nur Analyse, kein Rückbau).** 33/21/19
      Trefferdateien. Feststellen und im PR-Body dokumentieren, ob sie ausschliesslich an
      Nextcloud Talk hängen oder eine Restkopplung an LiveKit haben. Falls sie ebenfalls
      obsolet sind: **eigenes Ticket** anlegen, hier nichts entfernen.

- [ ] **P5.14 Generierte Doku-Artefakte regenerieren:** `docs/generated/graph.json`,
      `docs/generated/blast-radius.md`, `docs/code-quality/repo-index.json` und
      `k3d/docs-content-built/**` (via `node scripts/build-docs.mjs`). Handedits an diesen
      Dateien werden beim nächsten Lauf überschrieben.

## P6 — Verifikation

- [ ] **P6.1 Cluster leer.** Für beide Namespaces:
      `kubectl --context fleet -n <ns> get all,pvc,cm,ingress | grep -i livekit` liefert
      nichts. Der Flux-Suspend aus P1.2 ist aufgehoben, `flux get kustomizations` ist
      protokolliert.

- [ ] **P6.2 Repo leer.** `grep -ril livekit` über das Repo, ausgenommen `node_modules`,
      `.git`, `openspec/changes/archive`, `openspec/specs/archive`, `docs/adr`,
      `docs/audits`, `docs/superpowers/specs`, `docs/legacy-html`, `website/CHANGELOG.md`,
      `website/src/db/migrations` und `scripts/one-shot/archive` liefert nichts.

- [ ] **P6.3 Manifest-Gates.** `task workspace:validate` für beide Brands,
      `kustomize build prod-fleet/mentolder` und `prod-fleet/korczewski` ohne Fehler,
      `task env:validate` für alle fünf Envs.

- [ ] **P6.4 Test-Suite.** `task test:all` grün, inklusive Test-Inventory-Check. Der neue
      Guard-Test `G-LK01` ist grün, `G-OPS01b` ist entfernt.

- [ ] **P6.5 Abschluss-Gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **P6.6 Rest-Blocker als Ticket.** Den verbleibenden
      `pocket-id-client-seed`-Immutable-Job-Fehler als eigenes `type=bug`-Ticket erfassen
      (Bug-Triage-Konvention G-DORA03) und im PR-Body verlinken.
