# Phase C — Ticket + Proposal (Detail)

Detail-Runbook zu Phase C. C0-Worktree-Guard und C1-Dedupe stehen im SKILL.md.

### C2 — Ticket anlegen

```bash
scripts/ticket.sh create --type <t> --title "[SA-XXX-NN] <Befund-Titel>" \
  --description "<Evidence + Vorschlag + Report-Pfad>" --areas <areas> [--severity s] [--priority p]
```

(MCP-first äquivalent: `ticket-mcp_create_ticket`.) Mapping:

| Befund | Ticket-Typ | Severity→Priority |
|---|---|---|
| Etwas ist defekt/falsch | `fix` | Critical→hoch, Warning→mittel |
| Fähigkeit/Absicherung fehlt | `feat` | Critical→hoch, Warning→mittel |
| Hygiene/Doku/Konvention | `chore` | Warning→niedrig |

`component`/`areas` aus dem Zielkatalog: gitops-repo/flux-cluster→`infra`,
website→`website`, repo/toolset→`scripts`, security→`security`, database→`database`,
llm-pipeline→`llm`, brain-wiki→`docs`.

### C3 — DoR-Felder setzen („properly planned")

Ein Ticket ohne Planungs-Metadaten ist nicht factory-reif:

```bash
scripts/ticket.sh plan-meta --id <T-ID> --value-prop "<Nutzen aus dem Evidence>" \
  --effort <klein|mittel|gross> --areas <areas>
```

(MCP-first: `ticket-mcp_set_plan_meta`.) Readiness-Flags via `set_readiness_flag`:
`spec_skizziert=true` (das Proposal IST die Skizze), `aufwand_geschaetzt=true`;
`offene_fragen_geklaert` und `abhaengigkeiten_klar` nur auf `true` setzen, wenn
wirklich nichts offen ist — sonst offen lassen und im Ticket kommentieren, was fehlt.
Feature-Tickets: `prepare_feature` statt Einzelaufrufen.

### C4 — OpenSpec-Proposal anhängen (nur im Worktree, siehe C0)

```bash
bash scripts/openspec.sh propose audit-<ziel>-<stichwort> --ticket <T-ID>
```

Danach die Artefakte füllen (Vollständiges How-to: Skill `openspec-propose`):
`proposal.md` (Why/What aus dem Befund), `design.md`, `tasks.md`, Delta-Spec unter
`openspec/changes/<slug>/specs/<parent-slug>.md` — Parent-SSOT-Slug laut
`openspec/component-map.yaml`, nur bei genuinely new capability der eigene Slug.
Jeder Requirement-Block braucht mindestens ein GIVEN/WHEN/THEN-Scenario. Dann:

```bash
bash scripts/openspec.sh validate
```

Validierung darf nicht rot bleiben: ein rotes Proposal ist kein Proposal. Mehrere
Befunde mit derselben Wurzel (Regel 5) teilen sich ein Ticket **und** ein Proposal.

### C5 — Enqueue + Rückverfolgbarkeit

```bash
scripts/ticket.sh enqueue --id <T-ID>
```

Damit greift die Factory nach dem Pipeline-Prinzip zu. Abschluss je Befund:
Kommentar mit Evidence-Block, Report-Pfad und Proposal-Slug aufs Ticket; Report-Zeile
`(Phase-C: Ticket <T-ID>, Proposal <slug>)` nachtragen.

