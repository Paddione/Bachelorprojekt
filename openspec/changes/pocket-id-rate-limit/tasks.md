---
title: "pocket-id-rate-limit — Implementation Plan"
ticket_id: T001328
domains: [infra, auth]
status: active
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-rate-limit — Implementation Plan

_Ticket: T001328_

**REVISION 2** — siehe `docs/superpowers/specs/2026-06-30-pocket-id-rate-limit-design.md`
für die vollständige Root-Cause-Korrektur. Revision 1 nahm an, dass eine fehlende
`forwardedHeaders`-Konfiguration an der Traefik `IngressRoute`/`Ingress` die Ursache sei;
dieses Feld existiert in Traefiks Schema schlicht nicht (weder auf `IngressRoute.spec` noch
als `Ingress`-Annotation — verifiziert gegen offizielle Traefik-Doku + Go-Source). Live-Logs
auf dem Fleet-Cluster zeigten die echte Ursache: `externalTrafficPolicy: Cluster` (Standard)
auf dem shared `kube-system/traefik`-Service lässt `kube-proxy` die Client-IP beim Forward
vom k3s-ServiceLB-Hop (`svclb-traefik`) SNATen, bevor Traefik sie je sieht.

## File Structure

| Datei | Änderung |
|-------|----------|
| `prod/traefik-values.yaml` | NEU — Helm-Values für den shared `kube-system/traefik`-Service: `deployment.kind: DaemonSet`, Node-Affinity auf die 3 öffentlichen Hetzner-Knoten, `service.spec.externalTrafficPolicy: Local` |
| `prod/cloud-init.yaml` | Traefik-Helm-Install nutzt `-f traefik-values.yaml` (curl-geholt) statt inline `--set`-Flags |
| `prod-korczewski/traefik-values.yaml` | ENTFERNT — totes File (0 Referenzen im Repo), durch `prod/traefik-values.yaml` ersetzt |
| `tests/spec/fleet-operations.bats` | ERWEITERT — Manifest-Struktur-Tests (bestehende Datei, SSOT `fleet-operations`; nicht `tests/spec/pocket-id-rate-limit.bats`, siehe Begründung in Task 1) |
| `openspec/changes/pocket-id-rate-limit/specs/fleet-operations.md` | Delta-Spec umbenannt von `pocket-id-rate-limit.md` → `fleet-operations.md` (Delta-Spec-Konvention: Parent-SSOT-Slug, nicht Change-Slug) |

## Task 1: `prod/traefik-values.yaml` anlegen + BATS-Tests (RED)

Konsolidiert die bislang unbenutzte `prod-korczewski/traefik-values.yaml`
(DaemonSet + Node-Affinity, 0 Referenzen im Repo bestätigt — nie tatsächlich
angewendet) mit den inline-`--set`-Flags aus `prod/cloud-init.yaml` zu einer
einzigen, testbaren Quelle. Neu hinzu: `service.spec.externalTrafficPolicy: Local`.

**Warum `tests/spec/fleet-operations.bats` statt einer neuen
`pocket-id-rate-limit.bats`-Datei:** Der Fix ist kein Pocket-ID-spezifischer
Ingress-Change mehr, sondern eine Fleet-weite Traefik-Service-Topologie-
Eigenschaft (betrifft beide Brands, alle Services hinter Traefik). Die
BATS-Konvention (`tests/spec/<spec-slug>.bats`, ein File pro SSOT-Spec) und
die Delta-Spec-Konvention (Parent-SSOT-Slug) zeigen beide auf `fleet-operations`
als die richtige SSOT-Komponente (vgl. `openspec/specs/fleet-operations.md`,
das bereits Fleet-Netzwerk-Invarianten wie das WireGuard-Mesh beschreibt).

**Wichtig — was hier NICHT testbar ist:** Es gibt keinen Live-Cluster in CI.
Die Tests prüfen ausschließlich die statische Manifest-Struktur (das, was
ein künftiger Full-Cluster-Rebuild installieren würde). Die eigentliche
Live-Verifikation (SNAT-Fix wirkt tatsächlich) erfolgt manuell in Task 4.

**Dateien:**
- `prod/traefik-values.yaml` — neu
- `tests/spec/fleet-operations.bats` — 4 neue `@test`-Blöcke ergänzen

**BATS-Tests (RED — vor Task 1/2 ausführen, `prod/traefik-values.yaml` existiert noch nicht):**

```bash
# In tests/spec/fleet-operations.bats ergänzen:

@test "prod/traefik-values.yaml sets externalTrafficPolicy: Local" {
  if ! command -v yq >/dev/null 2>&1; then skip "yq is not installed"; fi
  run yq eval '.service.spec.externalTrafficPolicy' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "Local" ]
}

@test "prod/traefik-values.yaml runs Traefik as a DaemonSet on exactly the 3 public Hetzner nodes" {
  if ! command -v yq >/dev/null 2>&1; then skip "yq is not installed"; fi
  run yq eval '.deployment.kind' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "DaemonSet" ]
  run yq eval '.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values | sort | join(",")' "${REPO_ROOT}/prod/traefik-values.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "pk-hetzner-4,pk-hetzner-6,pk-hetzner-8" ]
}

@test "prod/cloud-init.yaml installs Traefik from prod/traefik-values.yaml (not inline --set)" {
  run grep -c 'traefik-values.yaml' "${REPO_ROOT}/prod/cloud-init.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c -- '--set deployment.kind=DaemonSet' "${REPO_ROOT}/prod/cloud-init.yaml"
  [ "$output" -eq 0 ]
}

@test "prod-korczewski/traefik-values.yaml (orphaned, superseded by prod/traefik-values.yaml) is gone" {
  [ ! -f "${REPO_ROOT}/prod-korczewski/traefik-values.yaml" ]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
# expected: FAIL — alle 4 neuen Tests rot (prod/traefik-values.yaml fehlt,
# prod/cloud-init.yaml referenziert es nicht, prod-korczewski/traefik-values.yaml existiert noch)
```

## Task 2: `prod/cloud-init.yaml` umstellen + totes File entfernen

`prod/cloud-init.yaml`s Traefik-Helm-Install-Zeile auf `-f traefik-values.yaml`
umstellen (Datei wird wie `install-dev-tools.sh` per `curl` aus dem Repo
geholt — gleiche `su - patrick -c "curl ... -o /home/patrick/..."`-Konvention
zur Vermeidung von Owner-Problemen). `prod-korczewski/traefik-values.yaml`
entfernen (`git rm`).

**Dateien:**
- `prod/cloud-init.yaml` — Helm-Install-Zeile ersetzt
- `prod-korczewski/traefik-values.yaml` — entfernt

## Task 3: Verify (RED → GREEN) + lokale CI-Gates

- [ ] **Failing-Test-Step (RED).** Wie in Task 1 dokumentiert — vor Task 1/2
      müssen alle 4 neuen Tests fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
# expected: FAIL (red — prod/traefik-values.yaml fehlt, cloud-init.yaml unverändert)
```

- [ ] **Fix-Step (GREEN).** Task 1 + Task 2 anwenden, Test erneut ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
# expected: PASS für die 4 neuen Tests (eine vorbestehende, unabhängige
# Test-Failure zu sealed-secrets-Schlüssel-Drift in fleet-mentolder.yaml
# ist bekannt und nicht Teil dieses Tickets — siehe Ticket-Kommentar T001328)
```

- [ ] **Final Verification.** Die drei Pflicht-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Task 4: Manueller Produktions-Rollout (NICHT Teil des automatisierten Merge/Deploy-Pfads)

**Dies ist der eigentliche Fix für den laufenden Bug** — der Service-/Deployment-
Merge dieses PRs ändert das Cluster-Verhalten NICHT automatisch, weil
`kube-system/traefik` Helm-verwaltet ist, nicht Kustomize/GitOps. Task 1–3
bereiten nur das committete Manifest vor; dieser Task wendet es live an.

**Blast Radius:** Cluster-weit, betrifft Ingress für BEIDE Brands
(mentolder + korczewski) und jeden Service hinter Traefik — nicht nur
Pocket ID. Vor Ausführung: ruhige Verkehrsphase wählen, Rollback-Befehl
bereithalten.

**Sequenzierung ist zwingend** (siehe Design-Spec, Abschnitt
„Wichtiger Sequenzierungs-Risk"): Topologie zuerst (DaemonSet auf 3 Knoten),
dann erst `externalTrafficPolicy: Local` — sonst werden ~2/3 des Ingress-
Traffics für beide Brands stillschweigend verworfen (aktuell läuft Traefik
als Single-Replica-`Deployment` auf nur einem der drei öffentlichen Knoten).

```bash
# 0. Aktuelle Helm-Revision für Rollback-Referenz festhalten
kubectl --context fleet -n kube-system get deployment traefik  # vorher: 1/1
helm --kube-context fleet -n kube-system history traefik | tail -5

# 1. Topologie zuerst — funktional neutral unter externalTrafficPolicy: Cluster
#    (Service-Routing balanced weiterhin über alle Pods, kein Verhaltenswechsel
#    erwartet). Mit lokal ausgecheckter prod/traefik-values.yaml, aber NUR die
#    Topologie-relevanten Keys (deployment.kind, affinity, ports, updateStrategy,
#    ingressRoute.dashboard) — service.spec.externalTrafficPolicy bewusst noch
#    NICHT in diesem Schritt:
helm --kube-context fleet -n kube-system upgrade traefik traefik/traefik \
  --reuse-values \
  --set deployment.kind=DaemonSet \
  --set-json 'affinity={"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"In","values":["pk-hetzner-4","pk-hetzner-6","pk-hetzner-8"]}]}]}}}'

# 2. Verifizieren: 3 Traefik-Pods, je einer pro öffentlichem Knoten, beide
#    Brands weiterhin erreichbar (kein Verhaltenswechsel erwartet):
kubectl --context fleet -n kube-system get pods -l app.kubernetes.io/name=traefik -o wide
curl -sI https://auth.korczewski.de/.well-known/openid-configuration
curl -sI https://auth.mentolder.de/.well-known/openid-configuration

# 3. Erst jetzt externalTrafficPolicy umschalten:
helm --kube-context fleet -n kube-system upgrade traefik traefik/traefik \
  --reuse-values --set service.spec.externalTrafficPolicy=Local

# 4. Verifizieren: alle drei öffentlichen IPs weiterhin erreichbar +
#    Pocket-ID sieht echte Client-IPs (nicht mehr svclb-Pod-IPs):
for ip in 204.168.244.104 37.27.251.38 62.238.23.79; do
  curl -sI --resolve auth.korczewski.de:443:"$ip" https://auth.korczewski.de/.well-known/openid-configuration | head -1
done
kubectl --context fleet -n workspace-korczewski logs deploy/pocket-id --tail=20 | grep -oE 'ip=[0-9.]+' | sort -u
# erwartet: KEINE 10.42.x.x-Werte mehr für echte Browser-Requests (Mozilla-UA)

# Rollback (jederzeit, falls ein öffentlicher Endpoint nicht mehr erreichbar ist):
helm --kube-context fleet -n kube-system upgrade traefik traefik/traefik \
  --reuse-values --set service.spec.externalTrafficPolicy=Cluster
# Topologie-Änderung (Schritt 1) muss NICHT zurückgerollt werden — DaemonSet
# auf 3 Knoten ist auch unter Cluster-Policy sicher/neutral.
```

- [ ] Schritt 1 (Topologie) ausgeführt + verifiziert
- [ ] Schritt 3 (externalTrafficPolicy: Local) ausgeführt + verifiziert
- [ ] Pocket-ID-Logs zeigen echte Client-IPs statt `svclb`-Pod-IPs
