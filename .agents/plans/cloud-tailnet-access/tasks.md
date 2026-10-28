---
title: "cloud-tailnet-access — Implementation Plan"
ticket_id: T-PENDING
domains: [infra, devmesh, security, test]
status: draft
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cloud-tailnet-access — Implementation Plan

Cloud-Sessions (Claude Code on the web) bekommen einen eng begrenzten Tailnet-Zugang zum
devmesh-Cluster: Tag `tag:cloud`, ein ACL-Eintrag auf tcp 6443, ein ServiceAccount mit
Namespace-Role und ein Setup-Skript, das `tailscaled`, `kubectl` und die Port-Forwards startet.
Beleg und Entscheidungen D1–D7: `design.md`.

_Ticket: T-PENDING (Operator legt es vom Desktop an und ersetzt die ID, siehe `design.md`)_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `devmesh/tailnet-policy.hujson` | 30 | n/a (S1-ungated) |
| `tests/spec/local-dev-mesh/tailnet-policy.bats` | 105 | n/a (S1-ungated) |
| `tests/spec/local-dev-mesh/cloud-access.bats` | neu | n/a (S1-ungated) |
| `dev-local/components/cloud-access/rbac.yaml` | neu | n/a (S1-ungated) |
| `dev-local/components/cloud-access/kustomization.yaml` | neu | n/a (S1-ungated) |
| `dev-local/core/kustomization.yaml` | 136 | n/a (S1-ungated) |
| `scripts/cloud/cloud-tailnet.sh` | neu | n/a (neue Datei, Ziel unter 200 Zeilen) |
| `taskfiles/Taskfile.devmesh.yml` | 151 | n/a (S1-ungated) |
| `docs/runbooks/devmesh-tailnet.md` | 203 | n/a (S1-ungated) |
| `docs/adr/ADR-008-local-k3s-dev-mesh.md` | n/a | n/a (S1-ungated) |

Kein Zugriff auf `components/website/src`, daher kein Vitest-Task und keine CQ02-Zählung
<!-- vitest: kein neuer Test nötig, weil weder .ts noch .svelte geändert werden -->.
Keine Brand-Domain-Literale (S3); der Skriptpfad ist neu und wird vom Taskfile referenziert (S4).

## Task 1: Spike — Tailscale-Anmeldung aus der Cloud-Umgebung (Operator-Gate)

Machbarkeit vor dem Bau (D5). Die Endpunkte sind erreichbar; offen ist, ob die Anmeldung mit
Auth-Key und ein direkter oder DERP-Pfad zu `:6443` aus dem Container funktionieren.

- [ ] Operator erzeugt in der Admin-Konsole einen Auth-Key: Tag `tag:cloud`, ephemeral, reusable,
      Ablauf 90 Tage, und trägt ihn als Environment-Secret `TS_AUTHKEY` der Cloud-Umgebung ein
      (Einstellungen der Umgebung, Bereich Network secrets oder Umgebungsvariablen). Der Key steht
      nie im Chat und nie im Repo.
- [ ] In einer neuen Session probieren, ohne Repo-Änderung:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 >/tmp/tailscaled.log 2>&1 &
tailscale up --auth-key="$TS_AUTHKEY" --advertise-tags=tag:cloud --hostname=claude-cloud
tailscale status --json | jq -r .BackendState
tailscale netcheck
```

Erwartet: `Running` und eine DERP-Region. Scheitert das, endet der Plan hier; Befund im Ticket
festhalten, die Tasks 2 bis 7 entfallen. Hinweis: Tasks 2 bis 4 sind unabhängig vom Spike
reviewbar, ihr Merge wartet aber auf dessen Ergebnis.

## Task 2: ACL für tag:cloud (rot, dann grün)

**Dateien:** `tests/spec/local-dev-mesh/tailnet-policy.bats`, `devmesh/tailnet-policy.hujson`

- [ ] Failing Test ergänzen. Vier Tests, jeweils mit `policy_facts`-Muster aus dem bestehenden
      Guard: (a) `tagOwners` enthält `tag:cloud` mit `autogroup:admin`; (b) genau eine Regel mit
      Quelle `tag:cloud`, Ziel ausschließlich `tag:devmesh:6443`; (c) keine Regel mit Quelle
      `tag:cloud` und Ziel `*`, `tag:devclient` oder `gpu-host`; (d) kein Port 22 oder 443 für
      `tag:cloud`. Positiv-Anker: die Regel aus (b) existiert, bevor (c) und (d) etwas verneinen.
- [ ] Rot beweisen:

```bash
bats tests/spec/local-dev-mesh/tailnet-policy.bats
# expected: FAIL — tag:cloud fehlt in tagOwners und acls
```

- [ ] `devmesh/tailnet-policy.hujson` ändern: in `tagOwners` den Eintrag
      `"tag:cloud": ["autogroup:admin"]`, in `acls` die Regel
      `{"action": "accept", "src": ["tag:cloud"], "dst": ["tag:devmesh:6443"]}` mit einer
      ganzzeiligen Kommentarzeile darüber (Format-Regel des Guards: keine grants).
- [ ] Grün: `bats tests/spec/local-dev-mesh/tailnet-policy.bats`. Die bestehenden Tests
      (genau eine Ausnahme von `tag:devmesh`, `bad=0`, `grants=0`) müssen unverändert bestehen.

## Task 3: ServiceAccount mit Namespace-Role (rot, dann grün)

**Dateien:** `tests/spec/local-dev-mesh/cloud-access.bats`,
`dev-local/components/cloud-access/rbac.yaml`,
`dev-local/components/cloud-access/kustomization.yaml`, `dev-local/core/kustomization.yaml`

- [ ] Failing Test: der gerenderte Output von `kubectl kustomize dev-local/core` (Befehlsausgabe,
      nicht Quelltext) enthält ServiceAccount `cloud-session` im Namespace `workspace`, eine Role
      mit ausschließlich `get`/`list` auf `pods`, `pods/log`, `services`, `endpoints` und `create`
      auf `pods/portforward`, ein RoleBinding und ein Secret vom Typ
      `kubernetes.io/service-account-token`. Negativ-Anker nach dem Positiv-Anker: keine
      ClusterRole, kein `*` in `verbs` oder `resources`, kein `secrets`. Skip-Guard:
      `command -v kubectl >/dev/null 2>&1 || skip "kubectl not installed"`.
- [ ] Rot beweisen:

```bash
bats tests/spec/local-dev-mesh/cloud-access.bats
# expected: FAIL — Komponente cloud-access existiert noch nicht
```

- [ ] `rbac.yaml` und `kustomization.yaml` anlegen, die Komponente in
      `dev-local/core/kustomization.yaml` neben `../components/llm-services` einhängen (S4).
- [ ] Grün: `bats tests/spec/local-dev-mesh/cloud-access.bats` und
      `task workspace:validate` für den devmesh-Render, soweit lokal verfügbar.

## Task 4: Setup-Skript `scripts/cloud/cloud-tailnet.sh` (rot, dann grün)

**Dateien:** `tests/spec/local-dev-mesh/cloud-access.bats`, `scripts/cloud/cloud-tailnet.sh`

Unterbefehle: `up` (Eintrag für das Setup script der Umgebung), `forward`, `status`,
`kubeconfig` (nur Operator, schreibt nach stdout bzw. `/dev/shm`, nie ins Repo).

- [ ] Failing Tests ergänzen, jeweils gegen die Befehlsausgabe mit `DRY_RUN=1`:
      (a) `up` ohne `TS_AUTHKEY` endet mit Exit 2 und nennt die Variable beim Namen, aber nie
      ihren Wert; (b) `up` übergibt den Key über `--auth-key=file:` aus einer Datei mit Modus 600
      in `/dev/shm` und löscht sie danach, kein Key in der Kommandozeile; (c) fehlt
      `/dev/net/tun`, wählt `up` `--tun=userspace-networking`; (d) `forward` leitet
      `svc/llm-services` Ports `18235`, `13001`, `13005` mit `--context devmesh` und
      `-n workspace` weiter; (e) der Kontext ist `devmesh`, nie `fleet`.
      Positiv-Anker zuerst: `status` im Dry-Run nennt den Kontext und die drei Ports.
- [ ] Rot beweisen:

```bash
bats tests/spec/local-dev-mesh/cloud-access.bats
# expected: FAIL — scripts/cloud/cloud-tailnet.sh existiert noch nicht
```

- [ ] Skript schreiben: `set -euo pipefail`, Installation von `tailscale` und `kubectl` nur wenn
      nicht im PATH (Version gepinnt, Prüfsumme verifiziert), `tailscaled` im Hintergrund,
      `tailscale up --hostname=claude-cloud --advertise-tags=tag:cloud`, Kubeconfig aus
      `DEVMESH_KUBECONFIG_B64` nach `~/.kube/config` (Modus 600), `forward` als Hintergrundprozess
      mit Neustart-Schleife. Setzt `TICKET_CTX=devmesh` für `ticket.sh` (Fehlerbild:
      `no shared-db pod found in namespace workspace (context fleet)`).
- [ ] Grün: `bats tests/spec/local-dev-mesh/cloud-access.bats`.

## Task 5: Taskfile-Einstieg für den Operator

**Dateien:** `taskfiles/Taskfile.devmesh.yml`, `tests/spec/local-dev-mesh/devmesh-taskfile.bats`

- [ ] Failing Test: `task --list` (Ausgabe) nennt `devmesh:cloud:kubeconfig` und
      `devmesh:cloud:status`; Skip-Guard `command -v task`.
- [ ] Rot beweisen:

```bash
bats tests/spec/local-dev-mesh/devmesh-taskfile.bats
# expected: FAIL — Einträge fehlen
```

- [ ] Zwei Tasks ergänzen: `cloud:kubeconfig` ruft `cloud-tailnet.sh kubeconfig` (erzeugt aus dem
      Token des ServiceAccounts eine base64-Kubeconfig für `DEVMESH_KUBECONFIG_B64`, Ausgabe nur
      nach stdout), `cloud:status` ruft `cloud-tailnet.sh status`. Damit ist das Skript für S4
      erreichbar.
- [ ] Grün: `bats tests/spec/local-dev-mesh/devmesh-taskfile.bats`.

## Task 6: Runbook und ADR-Nachtrag

**Dateien:** `docs/runbooks/devmesh-tailnet.md`, `docs/adr/ADR-008-local-k3s-dev-mesh.md`

- [ ] Runbook: neuer Schritt 8 „Cloud-Session-Zugang" mit Auth-Key-Erzeugung (Tag `tag:cloud`,
      ephemeral, reusable), ACL-Einspielung (Schritt 5 gilt weiter), `task devmesh:cloud:kubeconfig`,
      den beiden Environment-Secrets `TS_AUTHKEY` und `DEVMESH_KUBECONFIG_B64`, dem Setup-Script-
      Eintrag `bash scripts/cloud/cloud-tailnet.sh up` und der Abnahme (`mcp-kubernetes` und
      `ticket-mcp-node` melden sich in einer neuen Session). Rollen-Tabelle um die Zeile
      `tag:cloud` ergänzen; Hinweis, dass der Peer flüchtig ist und nicht im Inventar steht.
- [ ] ADR-008: Nachtrag mit Datum, Entscheidung D1 bis D3 und dem Ausschluss von fleet.
- [ ] Prüfen, dass das Runbook keinen Auth-Key im Klartext enthält:
      `bats tests/spec/local-dev-mesh/tailnet-policy.bats` (Test „kein Tailscale-Auth-Key").

## Task 7: Verifikation und Operator-Abnahme

- [ ] Verify-Befehle:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Operator-Abnahme in einer neuen Cloud-Session (nach Einspielen der ACL und Setzen der
      Secrets): `bash scripts/cloud/cloud-tailnet.sh status` meldet Tailnet `Running` und die drei
      Forwards; `mcp__mcp-kubernetes` verbindet; `ticket-mcp-node` `list_tickets` liefert Zeilen
      statt des `shared-db`-Fehlers. Danach unter Settings → Keys prüfen, dass nur der vorgesehene
      Key aktiv ist.
