# p1 — Context-Defaults in Skripten und Konfiguration (impl)

_Ticket: T900120_ · Rolle `impl` · keine Abhängigkeit

Regel (Index, Abschnitt „Context-Zuordnung"): Ticket-, Factory- und SDLC-Daten → `fleet`
(ADR-007 A, design.md D2). Dev-Stack `workspace-dev` → `fleet`. Lokale Entwicklungsinstanz und
Rechen-Sandbox → `devmesh`. Alle Ersetzungen sind inhaltsbasiert (SP-3 ändert `scripts/ticket.sh`
und `scripts/factory/lib.sh` vorher, Zeilennummern verschieben sich).

Arbeitsverzeichnis in jedem Bash-Aufruf: `cd <worktree> && ...`.

### Task 1.1 — Factory-Default `FACTORY_CTX` auf fleet (≤30 min)

Dateien: `scripts/factory/lib.sh`, `scripts/factory/conflict-check.sh`

```bash
sed -i 's/^#   FACTORY_CTX         kubectl context (default: k3d-mentolder-dev)$/#   FACTORY_CTX         kubectl context (default: fleet, gleich scripts\/ticket.sh)/' scripts/factory/lib.sh
sed -i 's/^FACTORY_CTX="\${FACTORY_CTX:-k3d-mentolder-dev}"$/FACTORY_CTX="${FACTORY_CTX:-fleet}"/' scripts/factory/lib.sh
sed -i 's/^    k3d-mentolder-dev|k3d-korczewski-dev) : ;;$/    devmesh|k3d-korczewski-dev) : ;;/' scripts/factory/lib.sh
sed -i 's/^#   FACTORY_CTX     kubectl context (default: k3d-mentolder-dev)$/#   FACTORY_CTX     kubectl context (default: fleet)/' scripts/factory/conflict-check.sh
```

Prüfung (Positiv-Anker zuerst, dann leere Restsuche):

```bash
grep -n 'FACTORY_CTX="${FACTORY_CTX:-fleet}"' scripts/factory/lib.sh      # genau 1 Treffer
grep -n 'devmesh|k3d-korczewski-dev' scripts/factory/lib.sh             # genau 1 Treffer
grep -c 'k3d-mentolder-dev' scripts/factory/lib.sh scripts/factory/conflict-check.sh   # je 0
```

### Task 1.2 — Sandbox-Context auf devmesh (≤20 min)

Dateien: `scripts/factory/sandbox-run.sh`, `scripts/factory/wakeup.sh`. Die k8s-Sandbox startet
Jobs im Namespace `${FACTORY_NS:-workspace}`; auf fleet ist das der mentolder-Prod-Namespace.
Deshalb `devmesh`, nicht `fleet`.

```bash
sed -i 's/\${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}/${FACTORY_SANDBOX_CTX:-devmesh}/g' scripts/factory/sandbox-run.sh scripts/factory/wakeup.sh
grep -c 'FACTORY_SANDBOX_CTX:-devmesh' scripts/factory/sandbox-run.sh   # 5
grep -c 'FACTORY_SANDBOX_CTX:-devmesh' scripts/factory/wakeup.sh        # 1
```

### Task 1.3 — Ticket-Tooling-Kommentare und Namespace-Ausnahme (≤30 min)

Datei: `scripts/ticket.sh` (auf `s1.ignore`), `scripts/vda/ticket/_ctx-guard.sh`

`scripts/ticket.sh` — exakte Ersetzungen:

| alt | neu |
|---|---|
| `# mehr; der Default zeigte trotzdem weiter auf k3d-mentolder-dev.` | `# mehr; der Default zeigte trotzdem weiter auf den lokalen k3d-Context.` |
| `# Nebeneffekt des Wechsels: k3d-mentolder-dev ist genau der Context, der die` | `# Nebeneffekt des Wechsels: der lokale k3d-Context (abgebaut mit T900120) war genau der, der die` |
| `  fleet\|k3d-mentolder-dev\|k3d-korczewski-dev) : ;;` | `  fleet\|devmesh\|k3d-korczewski-dev) : ;;` |

```bash
sed -i 's/^# mehr; der Default zeigte trotzdem weiter auf k3d-mentolder-dev\.$/# mehr; der Default zeigte trotzdem weiter auf den lokalen k3d-Context./' scripts/ticket.sh
sed -i 's/^# Nebeneffekt des Wechsels: k3d-mentolder-dev ist genau der Context, der die$/# Nebeneffekt des Wechsels: der lokale k3d-Context (abgebaut mit T900120) war genau der, der die/' scripts/ticket.sh
sed -i 's/^  fleet|k3d-mentolder-dev|k3d-korczewski-dev) : ;;$/  fleet|devmesh|k3d-korczewski-dev) : ;;/' scripts/ticket.sh
sed -i 's/^# Hintergrund: Der Context `k3d-mentolder-dev` loeste nach einem Docker-Restart$/# Hintergrund: Der damalige lokale k3d-Context loeste nach einem Docker-Restart/' scripts/vda/ticket/_ctx-guard.sh
grep -n 'fleet|devmesh|k3d-korczewski-dev' scripts/ticket.sh            # 1 Treffer
grep -c 'k3d-mentolder-dev' scripts/ticket.sh scripts/vda/ticket/_ctx-guard.sh   # je 0
bash -n scripts/ticket.sh && bash -n scripts/vda/ticket/_ctx-guard.sh
```

### Task 1.4 — Datenpfade der Factory- und SDLC-Werkzeuge auf fleet (≤40 min)

Dateien: `scripts/runtime-drift-check.sh`, `scripts/lib/llm-stack-measure.sh`,
`scripts/lib/promote-phases.sh`, `scripts/session-hub.sh`, `scripts/finetune/eval-runner.sh`,
`scripts/finetune/model-registry.sh`, `scripts/finetune/stat-collector.sh`,
`scripts/knowledge/kalibrierung-retrieval.mjs`

```bash
# runtime-drift-check: DB der MCP-Registry-Pruefung = Ticket-DB of record
sed -i 's/RUNTIME_DRIFT_CTX         kubectl-Kontext der DB (default k3d-mentolder-dev)/RUNTIME_DRIFT_CTX         kubectl-Kontext der DB (default fleet)/; s/^DB_CTX="\${RUNTIME_DRIFT_CTX:-k3d-mentolder-dev}"$/DB_CTX="${RUNTIME_DRIFT_CTX:-fleet}"/' scripts/runtime-drift-check.sh
# llm-stack-measure: tickets.llm_proxy_backends liegt in der Ticket-DB
sed -i 's/\${FACTORY_CTX:-k3d-mentolder-dev}/${FACTORY_CTX:-fleet}/g; s/# Default seit E3\/T002626: SDLC-Daten liegen lokal (siehe scripts\/ticket.sh)\./# Default seit ADR-007\/T900120: Ticket-DB of record ist fleet (siehe scripts\/ticket.sh)./' scripts/lib/llm-stack-measure.sh
# promote-phases: der Dev-Stack workspace-dev laeuft auf fleet
sed -i 's/^dev_ctx() { case "\$1" in mentolder) echo "k3d-mentolder-dev" ;; korczewski) echo "k3d-mentolder-dev" ;; esac; }$/dev_ctx() { case "$1" in mentolder) echo "fleet" ;; korczewski) echo "fleet" ;; esac; }/' scripts/lib/promote-phases.sh
# session-hub: Dev-Website-Pod und Prod-Website-Pod liegen beide auf fleet (Kommentar Z. 273 sagt das schon)
sed -i 's|^# The Mediaviewer on k3d-mentolder-dev reads the registry via /api/admin/sessions\.$|# The Mediaviewer on fleet (namespace workspace-dev) reads the registry via /api/admin/sessions.|; s|SESSION_HUB_SYNC_TARGETS:-k3d-mentolder-dev/workspace-dev fleet/workspace|SESSION_HUB_SYNC_TARGETS:-fleet/workspace-dev fleet/workspace|' scripts/session-hub.sh
# finetune: Modell-Registry ist SDLC-Datenbestand -> fleet
for f in scripts/finetune/eval-runner.sh scripts/finetune/model-registry.sh scripts/finetune/stat-collector.sh; do
  sed -i 's/kubectl --context k3d-mentolder-dev exec -i -n workspace deploy\/shared-db -- psql -U website -d website "\$@"/kubectl --context "${MODEL_REGISTRY_CTX:-fleet}" exec -i -n workspace deploy\/shared-db -c postgres -- psql -U website -d website "$@"/; s/# \[T002626\] SDLC-Daten liegen lokal im k3d-Cluster; die fleet-Kopie ist$/# [T900120] SDLC-Daten liegen seit ADR-007 auf fleet (Override: MODEL_REGISTRY_CTX);/; s/# eingefroren\. Ohne --context landen Schreibzugriffe in der falschen DB\.$/# ohne --context landen Schreibzugriffe in der DB des current-context./' "$f"
done
# kalibrierung-retrieval: knowledge/wissen liegt auf fleet (docs/sdlc-stack/README.md, ADR-006 Bezug)
sed -i "s/\['--context', 'k3d-mentolder-dev', '-n', 'workspace'/['--context', process.env.KNOWLEDGE_DB_CTX ?? 'fleet', '-n', 'workspace'/" scripts/knowledge/kalibrierung-retrieval.mjs
```

Prüfung:

```bash
grep -c 'k3d-mentolder-dev' scripts/runtime-drift-check.sh scripts/lib/llm-stack-measure.sh scripts/lib/promote-phases.sh scripts/session-hub.sh scripts/finetune/eval-runner.sh scripts/finetune/model-registry.sh scripts/finetune/stat-collector.sh scripts/knowledge/kalibrierung-retrieval.mjs   # alle 0
grep -c 'MODEL_REGISTRY_CTX:-fleet' scripts/finetune/eval-runner.sh scripts/finetune/model-registry.sh scripts/finetune/stat-collector.sh   # je 1
grep -n "KNOWLEDGE_DB_CTX ?? 'fleet'" scripts/knowledge/kalibrierung-retrieval.mjs   # 1
for f in scripts/runtime-drift-check.sh scripts/lib/llm-stack-measure.sh scripts/lib/promote-phases.sh scripts/session-hub.sh scripts/finetune/*.sh; do bash -n "$f"; done
node --check scripts/knowledge/kalibrierung-retrieval.mjs
```

### Task 1.5 — Lokale Postgres-Kette auf devmesh (≤20 min)

Dateien: `scripts/mcp-gateway/k3d-postgres-forward.service`, `scripts/mcp-gateway/watchdog-check.sh`.
Die Unit bleibt (Guards `watchdog-tunnel-liveness.bats`, `wsl-exit-nachzug.bats` 6b verlangen
Datei, `# Status:`-Kopf in den ersten 15 Zeilen und den Text `NICHT geloescht (T900054)`).

Die ersten zwei Zeilen der Unit ersetzen:

alt:
```text
# Status: Toter Zustand auf diesem Host. Die Unit bindet `--context k3d-mentolder-dev` —
# den lokalen k3d-Dev-Cluster gibt es seit dem WSL-Exit (2026-09-03) nicht mehr.
```
neu:
```text
# Status: Seit T900120 an `--context devmesh` gebunden (Entwicklungsdaten, ADR-008); aktiv nur
# auf Clients, auf denen die Unit installiert ist. Der lokale k3d-Dev-Cluster ist abgebaut.
```

```bash
sed -i 's|^ExecStart=/usr/local/bin/kubectl --context k3d-mentolder-dev port-forward|ExecStart=/usr/local/bin/kubectl --context devmesh port-forward|; s|^Description=Port-forward k3d shared-db → localhost:15432$|Description=Port-forward devmesh shared-db → localhost:15432|' scripts/mcp-gateway/k3d-postgres-forward.service
sed -i 's/phase=\$(kubectl --context k3d-mentolder-dev -n workspace get pod -l app=shared-db/phase=$(kubectl --context devmesh -n workspace get pod -l app=shared-db/' scripts/mcp-gateway/watchdog-check.sh
head -15 scripts/mcp-gateway/k3d-postgres-forward.service | grep -c '# Status:'        # 1
grep -c 'NICHT geloescht (T900054)' scripts/mcp-gateway/k3d-postgres-forward.service  # 1
grep -c 'k3d-mentolder-dev' scripts/mcp-gateway/k3d-postgres-forward.service scripts/mcp-gateway/watchdog-check.sh   # je 0
bash -n scripts/mcp-gateway/watchdog-check.sh
```

### Task 1.6 — CI-Workflow, Compose, Grilling-Option, SSH-Config (≤30 min)

Dateien: `.github/workflows/arbitration.yml`, `compose.dev.yaml`,
`components/website/src/lib/tickets/final-grilling.ts`, `environments/.secrets/.ssh/config`

`arbitration.yml`: Der Context-Name kommt aus der eingespielten Kubeconfig statt aus einem
Literal. Ersetzen:

alt:
```yaml
          echo "TICKET_CTX=k3d-mentolder-dev" >> "$GITHUB_ENV"
```
neu:
```yaml
          echo "TICKET_CTX=$(KUBECONFIG="${RUNNER_TEMP}/arbitration.kubeconfig" kubectl config current-context)" >> "$GITHUB_ENV"
```

```bash
# compose.dev.yaml: die Kommentarzeile nennt einen nicht mehr existierenden Port-Halter
sed -i '/^      # 80\/443 sind ohnehin von k3d-mentolder-dev-serverlb belegt\.$/d' compose.dev.yaml
# final-grilling.ts: Antwortoption der Frage q17
sed -i "s/q17: \['dev (k3d-mentolder-dev)', /q17: ['dev (devmesh)', /" components/website/src/lib/tickets/final-grilling.ts
# SSH-Config (git-crypt, lokal entsperrt): nur die Abschnittsueberschrift
sed -i 's/^# =========================  Dev VM (k3d-mentolder-dev stack)  ================$/# =========================  Dev VM (ehemaliger lokaler k3d-Stack)  ================/' environments/.secrets/.ssh/config
grep -c 'k3d-mentolder-dev' .github/workflows/arbitration.yml compose.dev.yaml components/website/src/lib/tickets/final-grilling.ts environments/.secrets/.ssh/config   # je 0
grep -n "q17: \['dev (devmesh)'" components/website/src/lib/tickets/final-grilling.ts   # 1
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/arbitration.yml'))"
```

<!-- vitest: kein neuer Test nötig, weil final-grilling.ts nur ein String-Literal einer Antwortoption ändert, keine Logik -->

Hinweis `environments/.secrets/.ssh/config`: nur mit entsperrtem git-crypt editieren
(`git-crypt status environments/.secrets/.ssh/config` zeigt `encrypted`). Ist der Checkout
gesperrt, entfällt der Treffer im Guard ohnehin (Chiffretext), der Schritt wird dann im
entsperrten Haupt-Checkout nachgezogen.
