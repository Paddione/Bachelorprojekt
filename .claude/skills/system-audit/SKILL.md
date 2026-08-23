---
name: system-audit
description: "Ein Audit-Einstiegspunkt fuer alle Systeme des Repos: GitOps-Manifeste, Live-Flux-Cluster, Brand-Seiten, Repo-Zustand/Factory-Queue, Tool-Registry, Security & Secrets, Datenbank, LLM-Pipeline, Brain-Wiki. Critical/Warning-Befunde enden als Ticket mit OpenSpec-Proposal in der Factory-Backlog. Triggers on system-audit, Systemaudit, Full-Audit, 'audit all systems', 'audit the cluster/repo/website/security/database/llm pipeline/toolset', 'audit report with tickets'."
---

# system-audit

Ein Einstiegspunkt für Audits über alle Systeme, die das Repo in separaten Skills pflegt.
Der Skill ersetzt die Spezial-Skills nicht — er orchestriert sie und schließt deren
Audit-Lücken. Ein Lauf ist **read-only bis Phase C**: es wird nichts repariert, nichts
deployed, kein PR entschieden. Die Folgearbeit entsteht ausschließlich als Tickets mit
angehängten Proposals.

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

## Zielkatalog

| Ziel | System | Deckung | Modus |
|---|---|---|---|
| `gitops-repo` | Flux-Manifeste dieses Repos (`k3d/`, `prod-fleet/`, `flux/`) | Skill `gitops-repo-audit` | delegiert |
| `flux-cluster` | Live-Fleet-Cluster (ns `workspace`, `workspace-korczewski`) | Checkliste [§1](references/checklists.md#1-flux-cluster-live-sweep) | eigen |
| `website` | Brand-Seiten mentolder + korczewski | Skill `web-audit` | delegiert |
| `repo` | Repo-Zustand, PRs, Factory-Queue | Skill `repo-hygiene` §0–§7 inkl. Runtime-Drift | delegiert |
| `toolset` | Tool-Registry (`capabilities.yaml`) | Skill `toolset-curate` Schritt 1–2 | delegiert |
| `security` | SealedSecrets, OIDC, DSGVO, Secret-Alter | Checkliste [§2](references/checklists.md#2-security-sealedsecrets-oidc-dsgvo) (+ infra-ops §6) | eigen |
| `database` | PostgreSQL (Backups, Schema, Wachstum) | Checkliste [§3](references/checklists.md#3-datenbank-postgresql) (+ infra-ops §7) | eigen |
| `llm-pipeline` | GPU-Host, llm-proxy, Loadouts | Checkliste [§4](references/checklists.md#4-llm-pipeline-gpu-proxy-loadouts) (+ infra-ops §5) | eigen |
| `brain-wiki` | Brain-Wiki-Frische gegen die Quellen | Skill `brain-ingest` Dry-Run | delegiert |
| `all` | alle Ziele oben | sequenziell, ein Sammelreport | — |

## Grundregeln

1. **Read-only bis Phase C.** Kein Fix, kein Deploy, kein Neustart. Diagnose-Kommandos
   mit Schreibpotenzial (Restart, Scale, Delete) sind verboten — gehört zu
   `incident-response` bzw. `infra-ops`.
2. **Evidence-Pflicht.** Jeder Befund trägt seinen Beleg: Befehl + Ausgabe-Auszug oder
   `datei:zeile`. Ein Befund ohne Evidence wird nicht gemeldet.
3. **Severity-Modell** (gilt für alle Ziele):

   | Severity | Bedeutung | Phase-C-Folge |
   |---|---|---|
   | Critical | broken, Sicherheitsrisiko, Datenverlustrisiko, Prod ausgefallen/degradiert | Ticket + Proposal (Pflicht) |
   | Warning | Drift, Verschleiß, fehlende Absicherung, Inkonsistenz | Ticket + Proposal (Pflicht) |
   | Info | Hygiene, Kosmetik, Beobachtung | bleibt im Report |

4. **Kein Merge-Gate.** Der Skill läuft manuell und entscheidet nicht über PRs.
5. **Eine Ursache, ein Ticket.** Mehrere Befunde mit derselben Wurzel werden in Phase C
   zu einem Ticket zusammengefasst — nicht zu fünf Duplikaten.

## Phase A — Audits ausführen

Führe die Prozedur des angefragten Ziels aus. Bei `all`: alle Ziele der Reihe nach;
ein einzelnes fehlgeschlagenes Ziel bricht den Lauf nicht ab — es wird im Report als
`FAILED` markiert (Konvention wie `web-audit`).

### gitops-repo → delegiert an `gitops-repo-audit`

Führe den Analysis-Workflow des Skills auf diesem Repo aus (Discovery → Validation →
API Compliance → Best Practices → Security → Report). Scope: `k3d/`, `prod-fleet/`,
`flux/`. Dessen Report-Sektionen werden 1:1 in den Sammelreport übernommen; jede
Empfehlung wird zu einem normierten Befund nach Phase B.

### flux-cluster → Checkliste §1

Read-only Sweep des Live-Clusters: Flux-Ressourcen-Readiness, suspendierte Ressourcen,
Artefakt-Alter, Pod-Restarts, Node-Pressure. Details: [Checkliste §1](references/checklists.md#1-flux-cluster-live-sweep).
Diagnose-Tiefe und Reparatur gehören zu `gitops-cluster-debug` — hier stoppt der Lauf
bei der Befundliste.

### website → delegiert an `web-audit`

```bash
task web:audit ENV=mentolder
task web:audit ENV=korczewski
```

Beide Brands, Standard-Routen. Die axe/Lighthouse/LLM-Triage-Ergebnisse werden als
Befunde übernommen (Rangliste des Web-Audits ≙ Priorisierung nach Severity-Mapping:
axe critical/Lighthouse <50 ⇒ Critical, sonst Warning, kosmetisch ⇒ Info).

### repo → delegiert an `repo-hygiene`

Führe die acht Abschnitte der `repo-hygiene-ops`-Referenz aus (§0–§7) inklusive
`bash scripts/runtime-drift-check.sh`. Die Top-3-Empfehlungen aus §6 und jeder
Drift-/Aging-Befund werden zu normierten Befunden.

### toolset → delegiert an `toolset-curate`

```bash
node scripts/toolset/collect.mjs --unreviewed
node scripts/toolset/check.mjs
```

Jeder `unreviewed`-Eintrag ist ein Warning-Befund (Kuration fehlt); ein Nicht-null-Exit
von `check.mjs` ist Critical. Die Kuration selbst führt dieser Skill **nicht** aus —
dafür bleibt es bei `toolset-curate`.

### security → Checkliste §2

SealedSecrets-Status und -Alter, OIDC-Clients DB-vs-Manifest-Drift, Plaintext-Secrets
im Git-Baum, DSGVO-Basics der Brand-Seiten. Details: [Checkliste §2](references/checklists.md#2-security-sealedsecrets-oidc-dsgvo).
Rotationsprozeduren selbst: infra-ops §6.

### database → Checkliste §3

Backup-Frische und Restore-Verifikation (infra-ops §7 Audit), plus read-only SQL-Checks
über `mcp-postgres`. Nie `SELECT *` von `tickets.ticket_plans` (Multi-MB-Content).
Details: [Checkliste §3](references/checklists.md#3-datenbank-postgresql).

### llm-pipeline → Checkliste §4

Proxy-Erreichbarkeit, Backend-Gesundheit, Loadout-Konfiguration vs. laufende Realität,
GPU-Speicher. Details: [Checkliste §4](references/checklists.md#4-llm-pipeline-gpu-proxy-loadouts).
Betrieb und Loadout-Wechsel: infra-ops §5.

### brain-wiki → delegiert an `brain-ingest`

Dry-Run der Ingest-Pipeline (`task brain:ingest:dry` bzw. Worklist-Generierung; der Task setzt
LM_MODEL-Default `gemma-4-12b-qat` und den Ingest-Pool `:8093`, überschreibbar via Environment).
Jede
Quelle, die eine Wiki-Seite ändern würde, ist ein Warning-Befund (Wiki driftet); ein
fehlgeschlagener Dry-Run ist Critical.

## Phase B — Befunde normalisieren und Report schreiben

Jeder Befund erhält dieses Format (im Report und später im Ticket):

```
SA-<ZIEL>-<NN> | <severity> | <component>
Evidence: <Befehl + Ausgabe-Auszug ODER datei:zeile>
Vorschlag: <konkrete Änderung, ein Satz>
```

Schreibe den Report nach `tmp/claude-scratch/system-audit-<ziel>-<YYYY-MM-DD>.md`
(bei `all`: `system-audit-all-<datum>.md`) mit diesem Skelett:

```markdown
# System-Audit <ziel> — <datum>
## Zusammenfassung (<n> Critical, <n> Warning, <n> Info)
## Befunde
### SA-XXX-01 | critical | <component>
Evidence / Vorschlag / (Phase-C: Ticket <T-ID>, Proposal <slug>)
## Abgedeckte Quellen (welche Skills/Checklisten gelaufen sind, FAILED-Markierungen)
## Info-Befunde (ohne Ticket)
```

Die Zeile `(Phase-C: …)` wird in Phase C nachgetragen — so ist der Report die
Rückverfolgbarkeit von Befund zu Ticket.

## Phase C — Abschlussphase: jeder Befund wird Ticket + Proposal (Pflicht)

Ein Audit ohne Folge ist ein Bericht, den niemand liest. Deshalb ist diese Phase
**Pflichtbestandteil jedes Laufs**, nicht optionaler Nachklapp. Scope: alle Critical-
und Warning-Befunde. Info-Befunde bleiben im Report.

### C0 — Worktree-Guard

OpenSpec-Proposals erzeugen Dateien unter `openspec/changes/`. Das geschieht nur in
einem Worktree (Fußnote: Archivierung NUR im Worktree — Main-Checkout-Commits leave
orphaned files). Prüfe:

```bash
git rev-parse --git-dir | grep -q 'worktrees/' && echo WORKTREE || echo MAIN
```

- `WORKTREE` → voller Ablauf C1–C5.
- `MAIN` → nur C1–C3 + C5; statt C4 bekommt jedes Ticket einen Kommentar
  „Proposal folgt in dev-flow-plan (Audit lief auf Main-Checkout)". Der Fallback ist
  im Report je Befund zu markieren.

### C1 — Dedupe gegen offene Tickets

Suche je Befund nach einem bereits offenen Ticket (Stichworte aus Titel/Component,
Status ≠ done/archived). Existiert eins: **kein neues Ticket** — stattdessen Kommentar
mit Evidence + aktuellem Datum ans bestehende Ticket. Erst danach zählt der Befund als
abgearbeitet.

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

## Nachbereitung: Mishap Report

Nach allen Phasen `mishap-tracker` mit dem akkumulierten `MISHAP_LOG` aufrufen.
Ausgefallene Ziele (FAILED-Markierungen) sind Mishaps, keine stillen Auslassungen.

## Abgrenzung

- **Kein Ersatz für die Spezial-Skills**: Tiefe (z. B. Flux-Feldindex, Lighthouse-Profile,
  Kurationsentscheidungen) bleibt bei `gitops-repo-audit`, `web-audit`, `toolset-curate`.
- **Kein incident-response**: etwas läuft gerade heiß → `incident-response`, nicht Audit.
- **Kein Auto-Fix**: Umsetzung läuft über die erzeugten Tickets in der normalen Pipeline.
- **Kein CI-Job**: manueller Lauf, kein Merge-Gate.

## Verwandte Skills

| Skill | Beziehung |
|-------|--------------|
| `gitops-repo-audit`, `web-audit`, `repo-hygiene`, `toolset-curate` | delegierte Ziele dieses Skills |
| `openspec-propose` | How-to für die Proposal-Artefakte in C4 |
| `ticket-ops` | Weitertriage der erzeugten Tickets (Vollständigkeit, Klärung) |
| `incident-response` | wenn Befunde akut sind — sofortiger Wechsel erlaubt |
| `infra-ops` §5–§7 | Fachprozeduren hinter den Checklisten security/database/llm-pipeline |
| `mishap-tracker` | Pflicht-Nachbereitung |

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
