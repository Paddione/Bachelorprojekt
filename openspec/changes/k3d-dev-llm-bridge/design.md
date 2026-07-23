---
ticket_id: T002109
plan_ref: openspec/changes/k3d-dev-llm-bridge/tasks.md
status: active
date: 2026-07-23
---

# k3d-dev-llm-bridge — Design

## Purpose

Pods im lokalen k3d-Dev-Cluster (`korczewski`) können die LLM-Dienste auf dem WSL-Host nicht
erreichen, weil `environments/dev.yaml` `LLM_HOST_IP` auf die Docker-Bridge `172.17.0.1`
festnagelt. Diese Adresse existiert in dieser Umgebung nirgends: Docker Desktop fährt den Daemon in
einer eigenen `docker-desktop`-WSL-Distro, k3d legt pro Cluster ein zufälliges Netz an (derzeit
`172.21.0.0/16`), und in der Arbeits-Distro gibt es überhaupt kein `docker0`/`br-*`-Interface. Der
Fix richtet `LLM_HOST_IP` im Dev auf dieselbe WireGuard-Mesh-Adresse aus, die Prod bereits nutzt,
und verankert die Invariante in einem Regressionstest.

---

## Root-Cause-Analyse

Die Ausgangsvermutung lautete auf drei unabhängige Defekte. Die Messung hat zwei davon widerlegt;
festgehalten wird hier auch, was *nicht* zu ändern ist, damit spätere Sessions die verworfenen
Pfade nicht erneut aufmachen.

### RC1 — `LLM_HOST_IP` zeigt auf eine nicht existierende Bridge *(einzige Repo-Ursache)*

`environments/dev.yaml:24` setzt `LLM_HOST_IP: "172.17.0.1"`. Über `Taskfile.llm.yml:40`
(`envsubst '$LLM_HOST_IP' < k3d/llm-gpu.yaml`) landet dieser Wert in den `Endpoints`-Objekten von
`llm-gateway-lmstudio` (1234), `llm-gateway-tei-embed` (8081) und `llm-gateway-tei-rerank` (8083).
Alle drei zeigen damit ins Leere.

Messung aus einem Pod heraus — jede Kombination aus `{172.21.0.1, 172.17.0.1}` × `{18235, 9081,
8083}` liefert `unreachable`. `ip -4 -o addr show` in der Arbeits-Distro listet weder `docker0`
noch ein `br-*`-Interface; die Container-Netze leben in der `docker-desktop`-Distro.

### RC2 — NetworkPolicy *(kein Fix nötig — verworfen)*

`allow-llm-gateway-egress` (`k3d/network-policies.yaml:114-140`) erlaubt Egress nach
`192.168.100.0/24` und `10.13.14.0/24` auf den Ports 1234/8081/8083/8189. Für den Cluster-Pfad ist
das **bereits korrekt**, sobald `LLM_HOST_IP` in `192.168.100.0/24` liegt. Eine dev-spezifische
NetworkPolicy nach dem Muster von `k3d/network-policies-dev.yaml` (T001853) ist ausdrücklich
**nicht** erforderlich.

Der Port `18235` gehört bewusst *nicht* in diese Liste — siehe RC3.

### RC3 — Loopback-Bindungen *(kein Fix nötig — verworfen)*

Zwei Host-Dienste binden auf `127.0.0.1`, und das ist in beiden Fällen spezifikationskonform:

- `scripts/llm-proxy/server.mjs:163` (`:18235`) — `openspec/specs/local-llm-proxy.md` definiert den
  Proxy als **Host-internes** Werkzeug für Factory/opencode/`route-provider.sh`; alle Consumer
  adressieren ihn als `http://127.0.0.1:18235`. Er ist kein Cluster-Egress-Ziel. Ihn auf ein
  externes Interface zu binden, würde einen unauthentifizierten LLM-Proxy exponieren — unter WSL
  `networkingMode=mirrored` sogar auf dem Windows-Netzstack.
- `scripts/openspec-embed-local.sh:52` (`-p 127.0.0.1:9081:80`) — TEI-Container für den
  OpenSpec-Embedding-Lauf, ebenfalls nur host-intern konsumiert.

Die vom Cluster tatsächlich adressierten Dienste binden bereits erreichbar: `*:8081` (TEI-Embed,
`/health` → 200) und `0.0.0.0:8083` (TEI-Rerank).

### RC4 — Cluster ist eine Vor-T001853-Instanz *(Betriebszustand)*

Der laufende Cluster nutzt API-Port `46435`; `k3d-config.yaml` pinnt seit T001853
`kubeAPI.hostPort: "6445"`. Der Cluster wurde seit dem Fix nie neu erstellt. Kein Repo-Defekt, aber
der Grund, warum die Verifikation eine Cluster-Neuanlage verlangt.

---

## Gewählter Ansatz: wg-Mesh-Adresse statt Docker-Bridge

`LLM_HOST_IP` im Dev auf **`192.168.100.10`** setzen — die `wg-gpu`-Adresse des WSL-Hosts.

Der Host ist selbst der GPU-Peer im WireGuard-Mesh: `ip addr` zeigt `eth3`/`wg-gpu` mit
`192.168.100.10/32`, und `environments/mentolder.yaml`, `korczewski.yaml`,
`fleet-mentolder.yaml`, `fleet-korczewski.yaml` verwenden exakt diese Adresse als `LLM_HOST_IP`.
Dev erhält damit dieselbe Semantik wie Prod statt einer k3d-Sonderlocke.

**Empirisch verifiziert** (Test-Listener auf `192.168.100.10:19999`):

| Messung | Ergebnis |
|---|---|
| Host-Prozess bindet auf `192.168.100.10` | BIND-OK |
| `docker run --network k3d-korczewski curl http://192.168.100.10:19999/` | **HTTP 200** |
| dieselbe Anfrage gegen `192.168.65.254` (Docker-Desktop-Gateway) | `000` |

### Verworfene Alternativen

| Alternative | Grund für Verwerfung |
|---|---|
| Docker-Subnetz in `k3d-config.yaml` pinnen (`network:` + festes CIDR) | Das Gateway existierte nur in der `docker-desktop`-Distro; ein Host-Prozess könnte nicht darauf binden. Erzwingt zusätzlich eine Cluster-Neuanlage. |
| `LLM_HOST_IP: auto` + Auflösung via `docker network inspect` in `env-resolve.sh` | Koppelt den Deploy an Docker-CLI-Zugriff und ist statisch kaum testbar — der Regressionstest könnte die Invariante nicht mehr prüfen. |
| `host.k3d.internal` + `ExternalName`-Services | `host.k3d.internal` löst im Cluster nicht auf (gemessen). Würde zudem die Service-Topologie zwischen Dev und Prod divergieren lassen. |

### Bewusst nicht Teil dieses Fixes

- **LM Studio auf `:1234` läuft nicht.** Betriebszustand, kein Repo-Defekt. Nach dem Fix greift der
  Endpoint, sobald LM Studio gestartet wird. TEI-Embed (8081) und -Rerank (8083) funktionieren
  sofort.
- **Netpol-Port `18235`**, **Bind-Adressen der Host-Tools** — siehe RC2/RC3.

---

## Risiken

| Risiko | Abschätzung |
|---|---|
| `wg-gpu`-Interface ist beim Deploy nicht oben | Die Endpoints-Objekte werden trotzdem korrekt gerendert; die Verbindung schlägt erst zur Laufzeit fehl — dasselbe Verhalten wie in Prod. Kein Deploy-Blocker. |
| Ein anderer Dev-Host hat nicht `192.168.100.10` | `environments/dev.yaml` beschreibt genau diese Maschine (WSL-Host = GPU-Peer). Weicht ein Setup ab, ist der Wert wie jede andere env-Variable zu überschreiben. |
| Regression durch spätere „Aufräum"-Edits zurück auf eine Bridge-IP | Genau dagegen richtet sich der RED-Test: er verbietet Docker-Bridge-Adressen in `dev.yaml` explizit. |

---

## Verifikation

1. **Statisch (CI):** BATS-Test in `tests/spec/llm-pipeline.bats` — `LLM_HOST_IP` in `dev.yaml`
   liegt in `192.168.100.0/24` und ist keine Docker-Bridge-Adresse; die NetworkPolicy deckt dieses
   CIDR ab.
2. **Gerendert:** `envsubst` über `k3d/llm-gpu.yaml` erzeugt Endpoints mit `192.168.100.10`.
3. **End-to-End (nach Merge, manuell):** `task cluster:create` (nimmt zugleich RC4 mit) +
   `task workspace:deploy ENV=dev`, danach ein Pod gegen `llm-gateway-tei-embed:8081/health`.

## Verwandte Tickets

- **T002109** — dieses Ticket
- **T001853** — k3d-Basis-Drift (done); lieferte `kubeAPI.hostPort`-Pin und `network-policies-dev.yaml`
- **T002102** — Unified LLM Gateway (done); legte `:18235` als host-internen Proxy fest
