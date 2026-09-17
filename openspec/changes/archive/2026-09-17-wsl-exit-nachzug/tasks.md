---
title: "wsl-exit-nachzug — Implementation Plan"
ticket_id: T900054
domains: [docs, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-nachzug — Implementation Plan

_Ticket: T900054_ · Parent-Epic: T016422 · ADR-007

Operator-Entscheidung 2026-09-03: WSL2 wird abgeschaltet, Docker Desktop **deinstalliert**
(nicht auf Hyper-V-Backend umgestellt). Dieser Plan zieht Requirements, Registries und Doku
auf den gemessenen Zustand nach. **Kein Laufzeitverhalten** — der `llm-proxy`-Manifest-Rückbau
ist bewusst ausgeschlossen (eigener infra-Change).

## File Structure

```
tests/spec/software-factory/wsl-exit-nachzug.bats      (neu — Guard für alle Zusicherungen)
openspec/specs/software-factory.md                     (Z. 11-12 Purpose-Prosa — direkter Edit)
openspec/specs/mcp-gateway.md                          (Z. 7, 9 Purpose-Prosa — direkter Edit)
openspec/specs/local-llm-proxy.md                      (Z. 8 Purpose-Prosa — direkter Edit)
docs/agent-guide/registry/capabilities.yaml            (Z. 626)
docs/agent-guide/registry/components.yaml              (Z. 234, 236 — speist generiertes Artefakt)
docs/agent-guide/registry/networks.yaml                (Z. 161-162)
docs/agent-guide/registry/mcp.yaml                     (Z. 59, 131, 165, 183)
environments/dev.yaml                                  (Z. 25)
components/website/docker-entrypoint.dev.sh            (Z. 5)
CLAUDE.md                                              (Z. 99, 101, 165)
docs/adr/ADR-007-wsl-exit-fleet-native.md              (Docker-Beschluss + Präzisierung)
docs/runbooks/remote-docker-context.md                 (neu — Break-Glass-Ersatz)
scripts/llm-proxy/llm-proxy.service                    (gelöscht)
scripts/llm-proxy/llm-proxy-lan.service                (gelöscht)
scripts/dev-host-units/k3d-dev-ingress-bridge@.service (gelöscht)
scripts/mcp-gateway/k3d-postgres-forward.service       (gelöscht — toter k3d-Kontext)
scripts/factory/factory.service                        (Status-Kommentar → Fleet-CronJob)
scripts/factory/factory.timer                          (Status-Kommentar → Fleet-CronJob)
scripts/mcp-gateway/mcp-gateway.service                (Status-Kommentar → start-windows.ps1)
scripts/mcp-gateway/mcp-postgres-local.service         (Status-Kommentar — Pendant-Lücke)
scripts/semantic-code-search/pgvector-forward.service  (Status-Kommentar — Pendant-Lücke)
scripts/bge-mcp/bge-mcp.service                        (Status-Kommentar → start-windows.ps1)
scripts/bge-mcp/bge-forward-embed.service              (Status-Kommentar → start-windows.ps1)
scripts/bge-mcp/bge-forward-rerank.service             (Status-Kommentar → start-windows.ps1)
scripts/wsl-open.sh                                    (eingeordnet: gelöscht oder kommentiert)
openspec/changes/wsl-exit-adr007/tasks.md              (Checkbox-Drift)
openspec/changes/wsl-exit-hetzner2-decommission/tasks.md
openspec/changes/wsl-exit-internal-endpoints/tasks.md
openspec/changes/wsl-exit-sdlc-console-fleet/tasks.md
openspec/changes/wsl-exit-hf-jobs/tasks.md
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Lege `tests/spec/software-factory/wsl-exit-nachzug.bats` an.
      Der Test prüft die Zusicherungen dieses Changes und MUSS auf dem aktuellen Branch
      fehlschlagen, weil keine davon erfüllt ist:
      1. Kein `k3d-mentolder-dev` / `k3d-korczewski-dev` mehr in `CLAUDE.md` — die Kontexte
         existieren nicht (`kubectl config get-contexts -o name` liefert nur `fleet`/`hetzner`).
      2. Keine Zeichenkette `aus WSL bedient` in `docs/agent-guide/registry/capabilities.yaml`.
      3. `docs/agent-guide/registry/components.yaml` enthält kein `WSL GPU host` mehr.
      4. `docs/adr/ADR-007-wsl-exit-fleet-native.md` nennt den Docker-Desktop-Beschluss —
         Suchmuster `Docker Desktop` **und** `Hyper-V`, sonst fehlt die verworfene Alternative.
      5. `docs/runbooks/remote-docker-context.md` existiert.
      6. Die vier toten Units sind weg: `scripts/llm-proxy/llm-proxy.service`,
         `scripts/llm-proxy/llm-proxy-lan.service`,
         `scripts/dev-host-units/k3d-dev-ingress-bridge@.service`,
         `scripts/mcp-gateway/k3d-postgres-forward.service`.
      7. Jede verbliebene `.service`/`.timer` unter `scripts/` trägt in den ersten 15 Zeilen
         eine Kopfzeile `# Status:` — der Status-Kommentar aus der Operator-Entscheidung.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-nachzug.bats
# expected: FAIL (rot — keine der sieben Zusicherungen ist erfüllt)
```

- [x] **Registries nachziehen (GREEN, Teil 1).**
      `capabilities.yaml:626` — die `powershell.exe`-Richtung hat sich umgekehrt: der Windows-Host
      IST jetzt der Host, nicht das Ziel aus WSL heraus.
      `components.yaml:234,236` — "OpenClaw daemon on WSL GPU host" wird zum Windows-GPU-Host.
      **Diese Datei speist `platform-descriptions.generated.json` und damit die Website**; nach der
      Änderung `task freshness:regenerate` laufen lassen und das generierte Artefakt mitcommitten.
      `networks.yaml:161-162` — wg-gpu `.10` trägt nicht mehr "zweimal auf" (wg0 in WSL plus
      gespiegelter Windows-Adapter), sondern nur noch nativ auf Windows.
      `mcp.yaml:59,131,165,183` — die Sätze "In WSL uebernimmt das die …", "das WSL-…" und
      "/home/patrick-Pfade sind WSL (k3d-dev)" auf den Windows-Regelpfad umstellen
      (`task mcp:autostart:register` startet `start-windows.ps1`).

- [x] **Konfiguration und Doku (GREEN, Teil 2).**
      `environments/dev.yaml:25` — "wg-gpu-Adresse des WSL-Hosts" wird zum Windows-Host.
      `components/website/docker-entrypoint.dev.sh:5` — die Port-Forwards kommen nicht mehr
      "von der WSL-Distro".
      `CLAUDE.md:99,101` — die Sätze "Local development runs via k3d on the WSL host (context:
      `k3d-mentolder-dev`)" und "Locally there are additionally the k3d dev contexts …" streichen;
      stattdessen festhalten, dass es **keinen lokalen Dev-Cluster mehr gibt** und `fleet` der
      einzige Kontext ist. `CLAUDE.md:165` — die Überschrift "PowerShell-Skripte aus WSL (.ps1)"
      trägt die Herkunftsannahme im Titel; auf "PowerShell-Skripte (.ps1)" ziehen. Die
      ASCII-/Parser-Regeln dahinter bleiben unverändert gültig.

- [x] **ADR-007 präzisieren (GREEN, Teil 3).**
      Die Aussage "Der Dev-Host verschwindet als Linux-Laufzeitumgebung vollständig
      (`wsl --shutdown`)" war so nie haltbar, solange Docker Desktop selbst auf WSL2 lief —
      `wsl -l -v` zeigte `docker-desktop` als laufende Distro. Den ADR **nicht** widerrufen, er
      bleibt Accepted; ergänzt wird der Beschluss vom 2026-09-03: Docker Desktop wird
      deinstalliert. Die verworfene Hyper-V-Alternative gehört in die bestehende Tabelle
      "Verworfen" — installiert und technisch möglich, aber von Docker seit Jahren als deprecated
      geführt, und der Zweck (lokales k3d) ist entfallen.

- [x] **Break-Glass-Runbook (GREEN, Teil 4).**
      `docs/runbooks/remote-docker-context.md`: Remote-Docker-Context per SSH auf einen
      Fleet-Host als Ersatz für die sechs lokalen Image-Builds (website, docs, brett,
      studio-server, talk-transcriber, einvoice-sidecar), die CI über `build-*.yml` ohnehin baut.
      Enthält den `docker context create --docker host=ssh://…`-Aufruf, die Voraussetzungen
      (SSH-Key, Docker auf dem Zielhost) und den Hinweis, dass `k3d image import` damit
      **entfällt** — lokal gebaute Images gehen über die Registry, nicht über den k3d-Import.

- [x] **systemd-Units einordnen (GREEN, Teil 5).**
      Löschen, weil tot und ohne Nachfolger auf diesem Host: `scripts/llm-proxy/llm-proxy.service`,
      `scripts/llm-proxy/llm-proxy-lan.service`,
      `scripts/dev-host-units/k3d-dev-ingress-bridge@.service` (socat auf den nicht mehr
      existierenden k3d-dev), `scripts/mcp-gateway/k3d-postgres-forward.service` (bindet
      `--context k3d-mentolder-dev`).
      Status-Kommentar mit Nachfolger-Verweis (Kopfzeilen `# Status:` und `# Nachfolger:`):
      `scripts/factory/factory.service` und `factory.timer` → Fleet-CronJob `factory-tick`
      (`*/5 * * * *`, Namespace `workspace-dev`); `scripts/mcp-gateway/mcp-gateway.service` sowie
      `scripts/bge-mcp/bge-mcp.service`, `bge-forward-embed.service`, `bge-forward-rerank.service`
      → `scripts/mcp-gateway/start-windows.ps1` (`task mcp:autostart:register`).
      `scripts/wsl-open.sh` einordnen: vorher `grep -rn 'wsl-open' --exclude-dir=.git .` ausführen
      und das Ergebnis im Commit-Text festhalten; ohne Verweis löschen, sonst kommentieren.

- [x] **Lücke dokumentieren: fleet-Forwards ohne Windows-Pendant.**
      `scripts/mcp-gateway/mcp-postgres-local.service` und
      `scripts/semantic-code-search/pgvector-forward.service` binden beide
      `kubectl --context fleet port-forward`, sind also **nicht tot** — aber `start-windows.ps1`
      deckt sie nicht ab. Sie gehören weder in "löschen" noch in "hat Pendant", sondern in eine
      dritte Kategorie. Status-Kommentar setzen, der die Lücke benennt, und einen Folge-Hinweis
      im Runbook aus Teil 4 hinterlegen. **Kein Windows-Pendant in diesem Change bauen** — das
      wäre neues Laufzeitverhalten und gehört in ein eigenes Ticket.

- [x] **Buchführung: Checkbox-Drift der fünf offenen wsl-exit-Changes.**
      Der Deliverable-Check ist erbracht (M10, T002506): `docs/runbooks/decommission-k3s-node.md`,
      `scripts/factory/verify-decommission.sh`, `docs/windows-dev-setup.md` und
      `docs/adr/ADR-007-wsl-exit-fleet-native.md` liegen alle auf `origin/main`
      (`git cat-file -e origin/main:<pfad>`). Die Tasks in `wsl-exit-adr007`,
      `wsl-exit-hetzner2-decommission`, `wsl-exit-internal-endpoints`,
      `wsl-exit-sdlc-console-fleet` und `wsl-exit-hf-jobs` abhaken — aber **nur, soweit für den
      einzelnen Task ein Deliverable auf `main` nachweisbar ist**. Für jeden Task ohne
      auffindbares Deliverable die Checkbox offen lassen und im jeweiligen `tasks.md` ergänzen,
      was fehlt. Ein pauschales Abhaken wäre genau die Drift, die dieser Change beseitigt.
      Das Archivieren der Changes ist **nicht** Teil dieses Plans.

- [x] **SSOT-Purpose-Prosa direkt nachziehen (Ausnahme, begründet).**
      Die Delta-Mechanik erreicht ausschließlich `### Requirement:`-Sektionen — der Archiver
      ersetzt nichts außerhalb davon. Die schädlichste Drift steht aber genau im Purpose-Text,
      also in dem, was ein Agent als Erstes liest:
      `openspec/specs/software-factory.md:11-12` ("Der Autopilot läuft als systemd-USER-Timer auf
      dem WSL-Host"), `openspec/specs/mcp-gateway.md:7` und `:9` ("lokaler CLI-Prozess auf dem
      WSL-Host"), `openspec/specs/local-llm-proxy.md:8` ("transiente systemd-User-Units").
      Diese drei Stellen werden **direkt im SSOT** editiert. Das ist bewusst die Ausnahme vom
      Archive-Weg (Präzedenz: `05562f82e`), weil es keinen anderen Mechanismus gibt; die
      Requirement-Sektionen selbst bleiben ausschließlich den Delta-Specs vorbehalten.
      Nur die WSL-/systemd-Herkunftsannahme wird korrigiert — keine inhaltliche Umformulierung
      der Purpose-Abschnitte darüber hinaus.

- [x] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

> **Windows-Hinweis:** `task freshness:regenerate` erzeugt hier CRLF-Drift in
> `components/website/src/data/*.json` ohne inhaltlichen Diff. Vor dem Commit prüfen: zeigt
> `git diff --numstat <datei>` keine geänderten Zeilen, die Datei mit `git checkout -- <datei>`
> verwerfen. Das in Teil 1 bewusst regenerierte `platform-descriptions.generated.json` ist davon
> ausgenommen — dort ist der Diff inhaltlich.

## Korrektur waehrend der Umsetzung (2026-09-04)

Der Plan sah oben vor, **vier** tote Units zu loeschen. Drei davon liessen sich nicht loeschen,
ohne bestehende Zusicherungen zu brechen — CI hat das gezeigt, nicht die Planung:

| Unit | Was dagegen stand |
|---|---|
| `scripts/llm-proxy/llm-proxy.service` | `tests/spec/local-llm-proxy.bats` (T002277) und `tests/spec/local-llm-proxy/proxy-env-token-guard.bats` (T002556) setzen die Datei voraus; der SSOT-Spec `local-llm-proxy.md` fuehrt den Proxy weiter als Requirement — dessen Rueckbau ist hier ausdruecklich ausgeschlossen. |
| `scripts/llm-proxy/llm-proxy-lan.service` | dito |
| `scripts/mcp-gateway/k3d-postgres-forward.service` | `scripts/mcp-gateway/watchdog-check.sh:70-71` startet sie als Teil der Postgres-Kette neu, und `tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats` (T002543) prueft genau diese Kette. |

Die Alternative waere gewesen, drei fremde Guards zu entkernen, um eine Datei loszuwerden — also
genau die Drift zu erzeugen, die dieser Change beseitigt. Stattdessen bleiben die drei Dateien
stehen und tragen eine `# Status:`-Kopfzeile, die sagt, dass sie tot sind **und warum sie
trotzdem bleiben**. Geloescht wurde nur `scripts/dev-host-units/k3d-dev-ingress-bridge@.service`,
auf die nichts zeigt. Der Guard dieses Changes prueft beides (Faelle 6 und 6b).

## Bewusst nicht in diesem Change

Bei der Delta-Erstellung sind vier weitere Drift-Stellen aufgefallen. Sie bleiben draußen, weil
für sie kein gemessener Beleg vorliegt — und ein Requirement auf Vermutung umzuschreiben wäre
dieselbe Fehlerklasse, die dieser Change beseitigt.

| Stelle | Warum ausgeschlossen |
|---|---|
| `sdlc-isolation.md:614` und `local-llm-proxy.md:25,109,124,248,255,361,795,815` | Ein sinnvolles Delta müsste sagen, was `sdlc:up`/`sdlc:down` ohne lokalen Cluster und ohne llm-proxy noch tun. Das hängt am ausgeschlossenen llm-proxy-Rückbau. |
| `sdlc-isolation.md:310` (Kubelet-Zertifikats-Drift-Check auf dem lokalen k3d-Dev-Cluster) | Degradiert bereits sauber (Exit 2 bei unerreichbarem Kontext) und widerspricht deshalb nichts — der Check ist auf diesem Host nur dauerhaft unanwendbar. Folge-Change. |
| `sdlc-isolation.md:490` (`SDLC data is local-primary` — "primary on the local PostgreSQL of the Dev-Host") | Gemessen läuft `shared-db-dev` als StatefulSet in `workspace-dev` im Fleet, die Drift ist also real. Der Schreibpfad für Kundendaten-Bugreports und den GitHub-Poller ist aber **nicht verifiziert**. Braucht erst eine Messung, dann ein Delta. |
| `sdlc-isolation.md:445` ("No remote cockpit and no tunnel into the home network") | Formuliert unter der Prämisse "SDLC läuft zuhause". Mit der SDLC-Fläche im Fleet trägt die Zugangskontrolle vermutlich `oauth2-proxy-dev` — vermutlich, nicht verifiziert. Die Requirement bleibt unangetastet. |

Ebenfalls draußen: der `llm-proxy`-Manifest-Rückbau in `workspace-dev` (Deployment steht auf 0/1;
ADR-007 sieht "retire statt portieren" vor) — Manifest-Löschung ist Laufzeitverhalten und gehört
in einen eigenen infra-Change.
