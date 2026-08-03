# Eingefrorener Kontrakt — toolset-usage-injection [T002592]

Dieser Kontrakt wurde beim Decompose festgelegt. Alle Partials schreiben gegen **diese**
Feldnamen, Exit-Codes und Ausgabeformate. Kein Partial darf ihn einseitig ändern; eine nötige
Änderung geht an den Orchestrator zurück, bevor irgendein Partial enqueued wird.

## 1. Registry-Schema (`docs/agent-guide/registry/capabilities.yaml`)

```yaml
capabilities:
  <capability-name>:                  # kebab-case, fachlich (nicht der Servername)
    <kind>:<instance-id>:             # kind ∈ mcp | plugin | skill | cli | agent
      state: canonical                # canonical | allowed | suppressed | unreviewed
      reason: "…"                     # PFLICHT wenn state != canonical (Bestandsregel)
      use_when: "…"                   # PFLICHT wenn state == canonical. Eine Zeile, ≤ 120 Zeichen.
      avoid_when: "…"                 # optional. Eine Zeile, ≤ 120 Zeichen.
      fallback: "…"                   # optional. Konkreter Befehl/Pfad, kein Fließtext.
      roles: [<rolle>, …]             # PFLICHT wenn state == canonical. Nicht leer.
      tier: caution                   # optional. safe | caution | assisted | dangerous
      deep_ref: "<pfad>#<anker>"       # optional. Repo-relativer Pfad auf Tiefenreferenz.
```

**Bestehende Felder bleiben unverändert.** `state` und `reason` behalten ihre heutige Semantik;
die Bestandsprüfungen in `check.mjs` (max. 1 canonical je Capability, keine Capability ohne
canonical bei ≥2 Instanzen, `reason` bei non-canonical) bleiben wirksam.

## 2. Rollen-Vokabular (abschließend)

```
bachelorprojekt-website
bachelorprojekt-ops
bachelorprojekt-infra
bachelorprojekt-test
bachelorprojekt-db
bachelorprojekt-security
orchestrator
all                     # Wildcard — Instanz erscheint in JEDEM Rollen-Block
```

Identisch zur Allowlist in `scripts/plan-context.sh` (`_role_allowlist`, Zeilen 43–56), erweitert
um `all`. Kurzformen wie `db` oder `infra` sind **ungültig**.

## 3. `scripts/toolset-context.sh <rolle>`

- **Exit 0** — Block auf stdout; leere Ausgabe ist zulässig, wenn keine Instanz die Rolle führt.
- **Exit ≠ 0** — unbekannte Rolle. Fehlermeldung auf stderr nennt die gültigen Rollen.
  **Kein** Fallback auf „alle Instanzen". Das ist der bewusste Unterschied zu `plan-context.sh`,
  das bei unbekannter Rolle still auf `__ALL__` zurückfällt (T002322) und den Filter damit
  wirkungslos macht.
- `state: suppressed` erscheint **nie** in der Ausgabe.
- Aufnahmekriterium: `roles` enthält `<rolle>` **oder** `all`.

Ausgabeformat (markdown, ohne umschließende `<toolset>`-Tags — die setzt der Aufrufer):

```
## Kuratierte Werkzeuge — Rolle: bachelorprojekt-db

### ticket-lifecycle → `mcp:ticket-mcp` (caution)
- **Wann:** Ticket lesen, anlegen, Status setzen, Plan stagen
- **Nicht:** Bulk-SQL über Nicht-Ticket-Tabellen; stage_plan im Worktree
- **Fallback:** `scripts/ticket.sh`
- **Tiefe:** `.claude/skills/references/mcp-tool-guide.md#ticket-mcp`
```

Zeilen zu nicht gesetzten Feldern entfallen ersatzlos (keine leeren `**Nicht:**`-Zeilen).
Der Tier-Suffix `(caution)` entfällt, wenn `tier` fehlt.

## 4. `scripts/toolset/check.mjs` — neue Prüfungen

| Befund | Exit | Ausgabe nennt |
|---|---|---|
| `canonical` ohne `use_when` | ≠ 0 | Capability + Instanz-Id |
| `canonical` ohne `roles` oder mit leerer Liste | ≠ 0 | Capability + Instanz-Id |
| `roles`-Eintrag außerhalb des Vokabulars (§2) | ≠ 0 | Capability + Instanz-Id + der unbekannte Rollenname |
| `tier` außerhalb des Enums | ≠ 0 | Capability + Instanz-Id + der ungültige Wert |
| Instanz aus `collect.mjs` fehlt in der Registry | **0** | Instanz-Id + das Wort `unreviewed` + `toolset-curate` |

Die letzte Zeile ist bewusst nicht fail-closed — der SSOT-Spec verlangt Quarantäne ohne
CI-Bruch („SHALL still exit zero"). `check.mjs` bleibt offline und schreibt weiterhin nichts.

## 5. `scripts/toolset/collect.mjs` — Erfassungsquellen

| Kind | Quelle | Instanz-Id |
|---|---|---|
| `mcp:` | `mcpServers` in `.mcp.json`, `.opencode/opencode.jsonc`, agy-Config | Servername (Bestand, unverändert) |
| `plugin:` | Schlüssel unter `enabledPlugins` in `.claude/settings.json` | voller Schlüssel inkl. `@marketplace` |
| `skill:` | `name:`-Frontmatter aus `.claude/skills/*/SKILL.md` | der `name`-Wert |
| `cli:` / `agent:` | Einträge in `docs/agent-guide/registry/tools.yaml` mit `kind: cli` bzw. `kind: agent` | das `id`-Feld |

Das bestehende JSON-Ausgabeformat (`{harness, instance, active, source}`) bleibt; hinzu kommt das
Feld `curation` mit dem Wert `unreviewed`, wenn die Instanz in `capabilities.yaml` fehlt,
sonst dem `state` aus der Registry.

## 6. Was NICHT angefasst wird

- `scripts/toolset/sync.mjs` — die Durchsetzung von `suppressed` ist fertig und wird von den
  neuen Feldern nicht berührt.
- `.claude/skills/references/mcp-tool-guide.md` — bleibt handgepflegte Tiefenreferenz, wird
  **nicht** generiert. `deep_ref` verlinkt nur dorthin.
- `tests/spec/mcp-tooling.bats` — unverändert.
- `docs/agent-guide/registry/tools.yaml` — nur Lesequelle für die Befüllung.

## 7. Datei-Eigentum (disjunkt, D1)

| Partial | Rolle | Besitzt ausschließlich |
|---|---|---|
| p1 | infra | `docs/agent-guide/registry/capabilities.yaml` |
| p2 | infra | `scripts/toolset/check.mjs` |
| p3 | infra | `scripts/toolset/collect.mjs` |
| p4 | infra | `scripts/toolset-context.sh`, `scripts/toolset/emit-map.mjs`, `docs/agent-guide/maps/toolset-map.md` |
| p5 | infra | `.claude/skills/toolset-curate/SKILL.md`, `CLAUDE.md`, `AGENTS.md` |
| p6 | test | `tests/spec/toolset-registry/*.bats`, `Taskfile.agents.yml` |
