## Task p1: Harness-Block in der Registry und Auflösung des Werkzeugsatzes

Context. Ticket T900791, Plan `harness-specialization`, Spec
`.agents/plans/harness-specialization/design.md` Abschnitt 1. Dieses Partial legt das
Datenmodell an. Es ändert kein Verhalten von `sync.mjs` oder `check.mjs`.

Ist-Stand (2026-09-28): `scripts/toolset/lib/registry.mjs` (88 Zeilen) lädt nur
`capabilities` und gibt `{ capabilities }` zurück. `docs/agent-guide/registry/capabilities.yaml`
(943 Zeilen) hat nur den Top-Level-Key `capabilities:`. Die Wildcard-Semantik steht in
`scripts/toolset-context.sh:27-51`: `all` deckt genau die Rollen
`bachelorprojekt-website`, `-ops`, `-infra`, `-test`, `-db`, `-security`, `orchestrator`,
`big-pickle` ab, nicht `pi`.

Target files:

- `docs/agent-guide/registry/capabilities.yaml` (MODIFY, .yaml nicht S1-gated)
- `scripts/toolset/lib/registry.mjs` (MODIFY, Ist 88, Budget 712)
- `scripts/toolset/lib/resolve.mjs` (NEW)

### Steps

- [ ] Step 1 — In `capabilities.yaml` am Dateiende (nach dem `capabilities:`-Block, gleiche
  Einrückungsebene) zwei Top-Level-Keys anfügen. Im Kopfkommentar eine Zeile ergänzen:
  `# harnesses: Aufgabe/Anbieter/Rollen je Harness (T900791), Messprotokoll: docs/agent-guide/registry/harness-config-targets.md`.
  ```yaml
  harnesses:
    claude:
      job: "Planung und Risikoarbeit: dev-flow-plan, Infra, Security, Cluster-Mutation"
      provider: anthropic
      default_model: opus
      roles: [bachelorprojekt-infra, bachelorprojekt-security, bachelorprojekt-ops, bachelorprojekt-db]
      config: .claude/settings.json
    codex:
      job: "Plaene umsetzen: dev-flow-execute, Tests, CI-Fix-Schleife"
      provider: openai
      default_model: gpt-6-sol
      roles: [bachelorprojekt-test, bachelorprojekt-website]
      config: null
    omp:
      job: "Interaktiver Editor-Agent: LSP-Refactor, Debugging, Review"
      provider: opencode-zen
      default_model: muse-spark-1.3-contributor-free
      roles: [pi]
      config: null
    opencode:
      job: "Orchestrator der lokalen Modellflotte: plan-runner, Eskalation"
      provider: local
      default_model: Qwen3.8-27B
      roles: [orchestrator]
      config: .opencode/opencode.jsonc
    muse:
      job: "Cloud-Ausfuehrung mit grossem Kontext: ganze Plaene, grosse Refactors"
      provider: meta
      default_model: muse-spark-1.3
      roles: [bachelorprojekt-test, bachelorprojekt-website]
      config: null
    agy:
      job: "Website und Frontend: Astro/Svelte, Browser, Screenshots"
      provider: google
      default_model: gemini
      roles: [bachelorprojekt-website]
      config: null
    openclaw:
      job: "Always-on-Assistent auf dem GPU-Host: Modell- und GPU-Betrieb"
      provider: local
      default_model: lmstudio
      roles: [bachelorprojekt-ops]
      config: null
  forbidden_providers: [deepseek]
  ```
- [ ] Step 2 — `scripts/toolset/lib/registry.mjs`: `loadRegistry()` gibt zusätzlich
  `harnesses: data.harnesses ?? {}` und `forbiddenProviders: data.forbidden_providers ?? []`
  zurück. Keine Validierung hier, die gehört in `resolve.mjs`. Bestehende Fehlermeldungen
  bleiben wörtlich gleich.
- [ ] Step 3 — `scripts/toolset/lib/resolve.mjs` neu anlegen, reine Funktionen ohne I/O:
  ```js
  // scripts/toolset/lib/resolve.mjs — Harness-Schema und Werkzeugsatz (T900791).
  // WILDCARD_ROLES spiegelt scripts/toolset-context.sh (WILDCARD_ROLES). `pi` fehlt bewusst.
  export const WILDCARD_ROLES = ['bachelorprojekt-website', 'bachelorprojekt-ops',
    'bachelorprojekt-infra', 'bachelorprojekt-test', 'bachelorprojekt-db',
    'bachelorprojekt-security', 'orchestrator', 'big-pickle'];

  // → Array von Fehlermeldungen (leer = gültig)
  export function validateHarnesses(harnesses, forbiddenProviders, validRoles) { … }

  // → Set der Instanz-Keys (z. B. 'mcp:context7') im Werkzeugsatz der Harness
  export function resolveToolset(capabilities, harness) { … }
  ```
  `validateHarnesses` meldet je Harness: fehlendes oder leeres `job`/`provider`/`default_model`,
  `roles` kein nicht-leeres Array, Rolle nicht in `validRoles`
  (`harness '<h>': unknown role '<r>'`), `config` weder String noch `null`, und
  `forbidden provider <p> in harness <h>`. `resolveToolset` nimmt jede Instanz mit
  `state !== 'suppressed'` und Array `roles`, bei der eine Harness-Rolle in `roles` steht oder
  `roles` `all` enthält und eine Harness-Rolle in `WILDCARD_ROLES` steht.
- [ ] Step 4 — Plausibilitätsprobe gegen die echte Registry:
  ```bash
  node --input-type=module -e "import {loadRegistry} from './scripts/toolset/lib/registry.mjs'; import {resolveToolset} from './scripts/toolset/lib/resolve.mjs'; const r=loadRegistry('docs/agent-guide/registry/capabilities.yaml'); console.log([...resolveToolset(r.capabilities, r.harnesses.claude)].filter(k=>k.startsWith('mcp:')).sort().join(' '))"
  ```
  Erwartet genau: `mcp:codebase-memory-mcp mcp:context7 mcp:mcp-kubernetes mcp:mcp-postgres mcp:ticket-mcp-node mcp:warden`.
  Bestehende Tests bleiben grün: `node --test scripts/toolset/*.test.mjs`.
- [ ] Step 5 — Commit:
  ```bash
  git add docs/agent-guide/registry/capabilities.yaml scripts/toolset/lib/registry.mjs scripts/toolset/lib/resolve.mjs
  git commit -m "feat(T900791): harness block and toolset resolution in registry [T900791]"
  ```

### Acceptance criteria

- [ ] Die Probe aus Step 4 liefert exakt die sechs erwarteten Server.
- [ ] `node --test scripts/toolset/*.test.mjs` grün, `emit-map.mjs` läuft ohne Fehler.
- [ ] Keine anderen Dateien geändert.
