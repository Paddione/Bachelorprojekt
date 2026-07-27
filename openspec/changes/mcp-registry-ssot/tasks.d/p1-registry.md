# p1 — Registry `mcp.yaml` aus dem Ist-Zustand ableiten

Rolle: `impl`. Keine Abhängigkeit. Erstes Partial.

`target_files`: `docs/agent-guide/registry/mcp.yaml` (neu).

Leitregel: Die Registry wird **aus den drei existierenden Dateien abgeleitet**, nicht neu
erfunden. Jede Abweichung, die dabei auffällt, ist ein Befund und wird notiert — nicht
stillschweigend geglättet. Genau diese Abweichungen sind der Grund für den Change.

## Aufgaben

- [ ] **P1.1 — Die drei Ist-Stände nebeneinanderlegen.**

```bash
jq -r '.mcpServers | keys[]' .mcp.json | sort > /tmp/mcp-claude.txt
jq -r '.mcpServers | keys[]' ~/.gemini/config/mcp_config.json | sort > /tmp/mcp-agy.txt
sed -e 's://.*$::' .opencode/opencode.jsonc | jq -r '.mcp | keys[]' | sort > /tmp/mcp-oc.txt
diff /tmp/mcp-claude.txt /tmp/mcp-agy.txt
diff /tmp/mcp-claude.txt /tmp/mcp-oc.txt
```

      Erwartete Divergenzen laut Recon: opencode führt zusätzlich `github-mcp`, `playwright`,
      `docfork`, `sequential-thinking`, `webresearch` (alle deaktiviert). Findet sich mehr, ist
      das ein neuer Befund für den Ticketkommentar.

- [ ] **P1.2 — `clients:`-Schicht schreiben.** Je Server: Transport (`http` oder `stdio`),
      Endpoint bzw. Kommando samt Argumenten, und drei Harness-Flags. Wo die drei Dateien heute
      unterschiedliche Kommandos führen, gewinnt der **funktionierende** — und die verworfene
      Variante wird als Kommentar mit Begründung vermerkt.

      Bekannter Fall: `task-master-ai` läuft in Claude Code über `npx -y task-master-ai`, in agy
      über `~/.npm-global/bin/task-master-ai`. Ein absoluter Pfad in `$HOME` ist nicht portabel;
      `npx -y` ist die Form, die auf einem frischen Rechner funktioniert.

- [ ] **P1.3 — Absolute Pfade markieren.** `ticket-mcp`, `mcp-task-runner` und
      `codebase-memory-mcp` werden über hartcodierte `/home/patrick/…`-Pfade eingebunden. Diese
      Einträge bekommen ein Feld, das sie als „nicht portabel, wird durch MCPB-Bundle ersetzt"
      kennzeichnet, mit Verweis auf T002301 (K2). Der Pfad bleibt vorerst — K1 macht die
      Registry, nicht die Bundles.

- [ ] **P1.4 — `cluster:`-Schicht schreiben.** Der Monolith mit allen fünf Containern, ihren
      Ports und der Port-forward-Brücke. Ist-Werte erheben, nicht aus dem Manifest abschreiben —
      das Manifest ist nachweislich mit sich selbst inkonsistent (die einkommittete
      `last-applied-configuration`-Annotation sagt `--stateful`, der Spec-Block derselben Datei
      `--stateless --no-sandbox`):

```bash
kubectl get pods -n default --context fleet -l app=claude-code-mcp-monolith \
  -o jsonpath='{range .items[0].spec.containers[*]}{.name}{" "}{.image}{" "}{.ports[0].containerPort}{"\n"}{end}'
```

      Die Brücke mit aufnehmen: `scripts/mcp-gateway/mcp-gateway.service` und
      `Taskfile.agents.yml` → `mcp-gateway:start`, beide
      `kubectl port-forward svc/claude-code-mcp-monolith 18080:8080 13000:3000 13001:3001 13002:3002`.

- [ ] **P1.5 — Bekannte Defekte eintragen.** `keycloak` als defekt markieren mit Verweis auf
      **T002311**; im Kopf der `cluster:`-Sektion auf **T002312** verweisen (der SSOT-Spec
      behauptet, dieser Monolith sei dekommissioniert). Beide werden hier **nicht** repariert.

- [ ] **P1.6 — YAML-Sanity.**

```bash
node -e "import('yaml').then(y=>{const d=y.parse(require('fs').readFileSync('docs/agent-guide/registry/mcp.yaml','utf8'));console.log('clients:',Object.keys(d.clients).length,'cluster:',Object.keys(d.cluster).length)})"
```

- [ ] **P1.7 — Inertheit gegenüber agent-guide bestätigen.** `mcp.yaml` darf die bestehenden
      Emitter nicht beeinflussen:

```bash
grep -n "const FILES" scripts/agent-guide/load.mjs   # 'mcp' darf NICHT auftauchen
task test:agent-guide
```

## Abnahmekriterien

- `mcp.yaml` parst als YAML mit genau den Top-Level-Schlüsseln `clients` und `cluster`.
- Jeder Server aus allen drei Ist-Dateien ist in `clients` vertreten, mit drei Harness-Flags.
- Jede Divergenz zwischen den drei Ist-Dateien ist entweder aufgelöst (mit Begründung im
  Kommentar) oder als Ticketkommentar an T002300 festgehalten.
- `cluster` listet alle fünf Container mit Port und Zustand; `keycloak` trägt die T002311-Referenz.
- `task test:agent-guide` bleibt grün — die neue Datei ist für die Emitter inert.
