# P2 — Skill Registry Consistency (`.claude/skills/OVERVIEW.md`)

Rolle: **impl**. Partial P2 des Change `health-goals-remediation` (T002148), Requirement
REQ-HEALTH-GOALS-011. Fixt zwei Root-Causes in einer einzigen Datei,
`.claude/skills/OVERVIEW.md` (234 Zeilen, `.md` — kein S1-Zeilenlimit in
`docs/code-quality/gates.yaml` deckt diese Extension ab, daher kein Budget-Constraint):

1. **G-AGENTIC06** — der Skill-Zähler in Zeile 3 behauptet 36, der Live-Wert
   (`git ls-files -- .claude/skills | grep -c '/SKILL\.md$'`, real gegen den Worktree
   ausgeführt) ist **39**.
2. **G-AGENTIC07** — drei getrackte Skills mit gültigem `description:`-Frontmatter haben
   null Treffer, wenn ihr Verzeichnis-Basename (`gitops-cluster-debug`, `gitops-knowledge`,
   `gitops-repo-audit`) in `CLAUDE.md`, `AGENTS.md`, `OVERVIEW.md` oder einer anderen
   `SKILL.md` gesucht wird (exakte Prüf-Logik: `scripts/health-goals-check.sh` Gate
   `G-AGENTIC07`, Zeilen 252–261 — `grep -rl -- "$base" CLAUDE.md AGENTS.md
   .claude/skills/OVERVIEW.md` + `grep -rl --include=SKILL.md -- "$base" .claude/skills`
   abzüglich der eigenen `SKILL.md`).

Disjunkter Scope (nur diese eine Datei): `.claude/skills/OVERVIEW.md`. Keine der drei
`gitops-*`-`SKILL.md`-Dateien selbst wird verändert — nur referenziert.

## File-Budget (S1)

| Datei | Ist | Budget |
|-------|-----|--------|
| `.claude/skills/OVERVIEW.md` | 234 | n/a — `.md` ist keine S1-gegateste Extension (`docs/code-quality/gates.yaml` → `s1.limits` kennt nur `.ts/.js/.jsx/.py/.svelte/.sh/.mjs/.mts/.astro/.tsx/.java/.php/.bash/.cjs`); die Datei ist auch nicht in `docs/code-quality/baseline.json` gelistet. |

---

## File: `.claude/skills/OVERVIEW.md`

Ist 234 Zeilen. Zwei disjunkte Anker: Zeile 3 (Zähler-Prosa) und die Sektion zwischen der
"Infrastructure & Networking"-Tabelle (endet Zeile 103 mit `---`) und der
"Secret & Auth Management"-Überschrift (Zeile 105).

### Task 2.1 — Skill-Zähler 36 → 39 korrigieren (G-AGENTIC06)

**Anker Zeile 3** — die komplette Zeile ersetzen. Aktuell:

```markdown
36 project-local skills (35 in `.claude/skills/<name>/` + 1 in `.claude/skills/superpowers/using-git-worktrees/`) grouped by domain. Each skill has its own `SKILL.md` with full runbook details. Invoke any skill by its name.
```

Neu:

```markdown
39 project-local skills (38 in `.claude/skills/<name>/` + 1 in `.claude/skills/superpowers/using-git-worktrees/`) grouped by domain. Each skill has its own `SKILL.md` with full runbook details. Invoke any skill by its name.
```

**Warum genau diese Aufteilung (38 + 1):** `git ls-files -- .claude/skills | grep -c
'/SKILL\.md$'` liefert 39 getrackte `SKILL.md`-Dateien. Genau eine liegt tiefer verschachtelt
unter `.claude/skills/superpowers/using-git-worktrees/SKILL.md` (die bereits im
bestehenden Klammer-Text referenzierte Ausnahme); die übrigen 38 liegen jeweils direkt unter
`.claude/skills/<name>/SKILL.md` (Musterprüfung: `git ls-files -- .claude/skills | grep
'/SKILL\.md$' | grep -v '^\.claude/skills/[^/]*/SKILL\.md$'` liefert genau die eine
Ausnahmezeile — alle anderen 38 matchen das flache Muster). Nur die führende Zahl (39) ist
das, was Gate G-AGENTIC06 tatsächlich prüft; die Klammer-Aufteilung wird nicht maschinell
verifiziert, muss aber intern konsistent bleiben (38 + 1 = 39), sonst entsteht ein neuer,
offensichtlicher Lesefehler direkt neben der Korrektur.

Die "Wartung"-Callout-Box in Zeile 7 (`> **Wartung:** Diese Anzahl stimmt mit ...`)
bleibt unverändert — sie beschreibt bereits korrekt die Live-Prüfmethode und muss nicht
angepasst werden.

### Task 2.2 — Neue Sektion „GitOps & Flux CD" mit den 3 verwaisten Skills (G-AGENTIC07)

**Anker: nach Zeile 103** (dem schließenden `---` der bestehenden
„Infrastructure & Networking"-Sektion) und **vor Zeile 105** (`## Secret & Auth Management`)
einen neuen Abschnitt einfügen. Platzierung dort statt in „Infrastructure & Networking"
selbst, weil diese drei Skills domänenscharf Flux-CD/GitOps sind (nicht Host-Netzwerk oder
Cluster-Deployment) und weil dieses Repo seit T002083 pull-based via FluxCD deployt
(`CLAUDE.md` → „Deployment is pull-based via FluxCD") — ein eigener Abschnitt macht die
Flux-Tooling-Oberfläche für Agenten auffindbar, statt sie in einer thematisch nicht
passenden Tabelle zu verstecken. Format identisch zu den bestehenden Domain-Tabellen
(zwei Spalten `Skill | When to use`, gefolgt von einem trennenden `---`).

Exakter einzufügender Block (Beschreibungstext ist die eigene `description:`-Zusammenfassung
jedes Skills, aus dessen Frontmatter übernommen und auf einen Satz verdichtet):

```markdown
## GitOps & Flux CD

| Skill | When to use |
|---|---|
| [`gitops-knowledge`](gitops-knowledge/SKILL.md) | Flux CD / Flux Operator Konzept-Referenz — beantwortet Fragen und generiert schema-validiertes YAML für Flux-CRDs (HelmRelease, Kustomization, GitRepository, OCIRepository, ResourceSet, FluxInstance). Kein Repo-Audit, kein Live-Cluster-Debugging. |
| [`gitops-repo-audit`](gitops-repo-audit/SKILL.md) | Auditiert und validiert dieses GitOps-Repo lokal (Schema-Validierung, deprecated APIs, RBAC/Multi-Tenancy/Secrets-Review) und erzeugt einen priorisierten Report. Arbeitet auf Repo-Dateien, nicht auf einem laufenden Cluster. |
| [`gitops-cluster-debug`](gitops-cluster-debug/SKILL.md) | Debuggt Flux CD auf einem **laufenden** Kubernetes-Cluster (`fleet`) über den Flux-MCP-Server — Resource-Status, Controller-Logs, Dependency-Chains, Installations-Health-Checks. Für gemeldete failing/stuck/not-ready Flux-Resources oder Reconciliation-Fehler. |

---
```

Begründung für die Reihenfolge innerhalb der Tabelle (Knowledge → Repo-Audit →
Cluster-Debug): folgt der natürlichen Eskalationskette eines Flux-Problems — erst
Konzept/Manifest-Referenz nachschlagen, dann das Repo lokal auditieren, erst wenn beide
grün sind aber der Live-Cluster trotzdem abweicht, auf Live-Debugging eskalieren. Keine der
drei Zeilen führt einen `Dispatched as subagent via ...`-Zusatz (wie z. B.
`website-specialist`), weil keiner der drei Skills ein `agent:`-Frontmatter-Feld trägt
(verifiziert: `grep -n '^agent:' .claude/skills/gitops-*/SKILL.md` liefert keinen Treffer)
— sie werden laut dem in Zeile 16 dokumentierten Prinzip inline geladen, nicht als
Subagent dispatcht.

**Selbst-Check für G-AGENTIC07 (informativ, kein Ausführungsschritt):** nach dem Edit
enthält `OVERVIEW.md` die drei Substrings `gitops-cluster-debug`, `gitops-knowledge`,
`gitops-repo-audit` wörtlich (als Linktext in der neuen Tabelle) — das ist exakt das
Muster, das Gate G-AGENTIC07 mit `grep -rl -- "$base" ... .claude/skills/OVERVIEW.md`
sucht.

<!-- vitest: kein neuer Test nötig, weil P2 ausschließlich `.claude/skills/OVERVIEW.md`
     (Markdown-Doku) ändert; kein `website/src/lib/**` oder `website/src/pages/api/**`
     berührt. Die Verifikation dieses Fixes läuft über das BATS-Failing-Test-Partial
     (p6, tests-Rolle: `tests/spec/health-goals-remediation.bats`), das G-AGENTIC06 und
     G-AGENTIC07 gegen die tatsächliche Health-Goals-Ausgabe prüft, nicht über Vitest. -->

## Abhängigkeiten & Reihenfolge

- P2 ist zur Compile-/Edit-Zeit unabhängig von P1, P3, P4, P5 (disjunkte Datei
  `.claude/skills/OVERVIEW.md`, in keinem anderen Partial als Target gelistet) und kann
  parallel gestaged werden.
- P6 (Tests-Partial) hängt laut Manifest von P1–P5 ab und verifiziert diesen Fix zusammen
  mit den anderen fünf Partials in einem gemeinsamen BATS-Lauf gegen
  `bash scripts/health-goals-check.sh` (G-AGENTIC06 und G-AGENTIC07 müssen danach `eq 0`
  liefern).
- Kein Brand-Domain-Literal (S3 nicht berührt), kein neues Manifest/Skript (S4 nicht
  berührt — der neue Tabellen-Block referenziert ausschließlich bereits existierende
  `SKILL.md`-Pfade), keine Import-Zyklen möglich (reine Markdown-Doku, S2 nicht
  anwendbar).
