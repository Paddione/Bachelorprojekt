# Proposal: wsl-exit-nachzug

## Why

Der WSL-Exit (Epic T016422, ADR-007) ist fleet-seitig **vollzogen**, aber die SSOT-Requirements
beschreiben weiterhin die WSL-Welt als normativ. Der `software-factory`-Spec widerspricht sich
dabei **selbst**: Zeile 11 f. („Der Autopilot läuft als systemd-USER-Timer auf dem WSL-Host") und
Zeile 28 („GIVEN der systemd-Timer `factory.timer` feuert") stehen gegen die ab Zeile 3665
eingepflegten Fleet-Requirements aus dem bereits archivierten `wsl-exit-fleet-factory`. Ein Agent,
der den Spec als Wahrheit liest, bekommt je nach Fundstelle eine andere Architektur.

Gemessen am 2026-09-03 (Stand `2da8a9a94`):

```bash
# (1) Requirement-Drift: SSOT-Specs mit WSL/systemd als normativer Annahme
for f in $(grep -rlE 'systemd|WSL' openspec/specs/); do \
  printf '%-52s %s\n' "$f" "$(grep -cE 'systemd|WSL' "$f")"; done | sort -k2 -rn | head
# → software-factory.md 14 · local-llm-proxy.md 12 · sdlc-isolation.md 8 · mcp-gateway.md 4

# (2) Realzustand, der software-factory.md:11 widerlegt
kubectl --context fleet get cronjob -n workspace-dev factory-tick
# → factory-tick  */5 * * * *  seit 9d aktiv

# (3) Lokaler k3d-Cluster faktisch tot — Grundlage der Docker-Entscheidung
kubectl config get-contexts -o name          # → nur "fleet" und "hetzner", kein k3d-*
```

Operator-Entscheidung 2026-09-03: **WSL2 wird abgeschaltet, Docker Desktop deinstalliert** — nicht
auf den Hyper-V-Backend umgestellt. Damit fällt auch die letzte Prämisse von
`sdlc-isolation.md:89` („Dev-Host SHALL allocate at least 36 GB of RAM to WSL2").

Zusätzlich publiziert die Drift nach außen: `registry/components.yaml:234` speist
`platform-descriptions.generated.json` und damit die Website — `freshness:regenerate` schreibt die
veraltete Beschreibung bei jedem Lauf brav fort, weil die Quelle schema-konform und nur inhaltlich
überholt ist.

_Ticket: T900054_ · Parent-Epic: T016422 (WSL-Exit) · ADR-007

## What Changes

1. **Delta-Specs auf vier SSOT-Specs** — die WSL-/systemd-Annahmen werden auf den gemessenen
   Zustand gezogen:
   - `software-factory`: Autopilot-Timer → Fleet-CronJob (`factory-tick`, `*/5`); Auflösung des
     Selbstwiderspruchs zu den Zeilen ab 3665; `stage-plan`-Force-Tick ohne `systemctl --user`.
   - `sdlc-isolation`: 36-GB-WSL-Requirement und „served exclusively from the local Dev-Host
     (WSL2)" entfallen bzw. werden auf Windows-nativ + Fleet umgestellt.
   - `mcp-gateway`: die Linux-only-systemd-Units sind auf diesem Host nicht mehr der Normalfall,
     sondern der Sonderfall; Windows-Pendant (`start-windows.ps1` + `register-autostart.ps1`) wird
     der dokumentierte Regelpfad.
   - `local-llm-proxy`: systemd-User-Unit-Annahmen kennzeichnen bzw. auf den ADR-007-Beschluss
     („retire statt portieren") ausrichten.
2. **Registries** (SSOT für Agenten-Kontext): `networks.yaml:161` (wg-gpu `.10` nicht mehr „in
   WSL"), `capabilities.yaml:626` (die `powershell.exe`-Richtung hat sich umgekehrt),
   `components.yaml:234` (→ publiziertes Artefakt).
3. **Konfiguration & Doku**: `environments/dev.yaml:25`,
   `components/website/docker-entrypoint.dev.sh:5`, `CLAUDE.md` (k3d-Dev-Kontexte streichen —
   sie existieren nicht mehr und kommen mit dieser Entscheidung nicht wieder).
4. **ADR-007 präzisieren**: die Aussage „Der Dev-Host verschwindet als Linux-Laufzeitumgebung
   vollständig (`wsl --shutdown`)" war so nie haltbar, solange Docker Desktop selbst auf WSL2 lief.
   Der ADR bleibt Accepted; ergänzt wird der Docker-Desktop-Beschluss samt verworfener
   Hyper-V-Alternative.
5. **systemd-Units unter `scripts/`**: eindeutig tote löschen (`llm-proxy*`,
   `k3d-dev-ingress-bridge@`); die mit Fleet- oder Windows-Pendant behalten und mit einem
   Status-Kommentar versehen, der auf das Pendant zeigt (`factory.timer` → CronJob,
   `mcp-gateway`/`bge-mcp` → `start-windows.ps1`). `scripts/wsl-open.sh` einordnen.
6. **Runbook**: Remote-Docker-Context per SSH auf einen Fleet-Host als Break-Glass-Ersatz für die
   sechs lokalen Image-Builds, die CI ohnehin baut.
7. **Buchführung**: die fünf offenen `wsl-exit-*`-Changes tragen 0 abgehakte Tasks bei belegt
   erledigter Arbeit (`tests/spec/wsl-exit-docs.bats` existiert, zwei Geschwister-Changes sind
   archiviert) — Checkbox-Drift nachziehen, damit sie archivierbar werden.

## Verworfene Alternativen

| Alternative | Grund |
|---|---|
| Docker Desktop auf Hyper-V-Backend umstellen | Hyper-V ist installiert, wäre also möglich — aber Docker führt den Backend seit Jahren als deprecated, und der Zweck (lokales k3d) existiert nicht mehr. Eine Wette auf eine auslaufende Funktion für einen entfallenen Bedarf. |
| Lokales k3d am Leben halten | Die k3d-Kontexte sind bereits weg; die RAM-Begründung von ADR-007 gilt für die Docker-Desktop-WSL-VM genauso wie für die alte Distro. |
| Break-Glass-Builds ersatzlos streichen | Stattdessen Remote-Docker-Context per SSH — behält den Rückfallpfad, ohne eine lokale Linux-VM zu verlangen. |
| Alle systemd-Units löschen | Die Units mit aktivem Pendant sind die beste Referenz für dessen Herkunft; ein Status-Kommentar kostet nichts und erhält die Spur. |
| Nur Doku/Registry ohne Spec-Deltas | Lässt den Selbstwiderspruch im `software-factory`-Spec stehen — genau die Quelle, die Agenten als Wahrheit lesen. |

## Impact

- Affected specs: `software-factory`, `sdlc-isolation`, `mcp-gateway`, `local-llm-proxy`
- Affected code: `docs/agent-guide/registry/{networks,capabilities,components}.yaml`,
  `environments/dev.yaml`, `components/website/docker-entrypoint.dev.sh`, `CLAUDE.md`,
  `docs/adr/ADR-007-wsl-exit-fleet-native.md`, `scripts/**/*.service|*.timer`,
  `scripts/wsl-open.sh`, `docs/runbooks/`, `openspec/changes/wsl-exit-*/tasks.md`, `tests/spec/`
- **Kein Laufzeitverhalten.** Der `llm-proxy`-Manifest-Rückbau in `workspace-dev` (0/1, laut
  ADR-007 „retire") ist bewusst **ausgeschlossen** — Manifest-Löschung ist Laufzeitverhalten und
  gehört in einen eigenen infra-Change.
- Nicht Teil dieses Changes (Operator-Einzelschritte): `git-crypt unlock`, Developer Mode +
  `core.symlinks=true`, `task mcp:autostart:register`, gitleaks-Installation, die
  Docker-Desktop-Deinstallation selbst.
