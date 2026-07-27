# p2 — Frontmatter-Pass über die 14 nicht-übergroßen Skills

**Rolle:** impl · **depends_on:** —

**target_files:** `.claude/skills/brain-ingest/SKILL.md`, `.claude/skills/dev-flow-chore/SKILL.md`,
`.claude/skills/dev-flow-e2e/SKILL.md`, `.claude/skills/references/SKILL.md`,
`.claude/skills/repo-hygiene/SKILL.md`, `.claude/skills/incident-response/SKILL.md`,
`.claude/skills/operations-management/SKILL.md`, `.claude/skills/mishap-tracker/SKILL.md`,
`.claude/skills/openspec-propose/SKILL.md`, `.claude/skills/openspec-apply-change/SKILL.md`,
`.claude/skills/openspec-archive-change/SKILL.md`, `.claude/skills/database-specialist/SKILL.md`,
`.claude/skills/security-specialist/SKILL.md`, `.claude/skills/website-specialist/SKILL.md`

Diese 14 Skills liegen alle unter 250 Zeilen; ihr Body bleibt unverändert. Angefasst wird
ausschließlich das Frontmatter. Die sechs übergroßen Skills gehören zu `p3` und werden hier
**nicht** angefasst — auch nicht ihr Frontmatter, damit keine Datei in zwei Partials liegt.

## Eingefrorener Kontrakt — Abgrenzung `repo-hygiene` ↔ `ticket-ops`

Heute feuern beide auf dieselben Phrasen: `repo-hygiene` nennt „clean branches", „merge PRs",
„prune worktrees"; `ticket-ops` nennt „repository hygiene (stale worktrees/branches)",
„stale branches", „merge PRs". Welcher Skill bei diesen Eingaben lädt, ist unbestimmt.

Der Schnitt wird hier festgelegt und gilt für beide Partials — `p3` schreibt die
`ticket-ops`-Seite nach derselben Festlegung:

| Skill | Zuständig für | Nicht zuständig für |
|---|---|---|
| `ticket-ops` | Ticket-Inhalte: Triage auf Vollständigkeit, fehlende Angaben beim Menschen erfragen, Parallelarbeit über Tickets planen | Branches, Worktrees, PRs, Factory-Queue |
| `repo-hygiene` | Repo-Zustand: veraltete Branches und Worktrees, offene PRs mergen und schließen, GitHub-Issue-Intake, Factory-Queue-Status | Ticket-Inhalte und deren Vollständigkeit |

Die `description` von `repo-hygiene` verliert damit keine Trigger, die `ticket-ops` behält, und
umgekehrt: `ticket-ops` gibt „stale branches", „merge PRs" und „repository hygiene" ab,
`repo-hygiene` gibt Ticket-bezogene Formulierungen ab.

## Task 2.1 — `brain-ingest`: Frontmatter erstmals anlegen

Die Datei beginnt heute mit `# brain-ingest — Brain-Wiki Kompilierung` auf Zeile 1; es gibt
keinen Frontmatter-Block. Der Harness fällt auf die H1 zurück, die keinen Trigger-Begriff
enthält — der Skill ist nur per expliziter Namensnennung erreichbar.

Einen Block mit `name: brain-ingest` und einer `description` voranstellen, die die konkreten
Begriffe nennt, auf die er feuern soll. Die Begriffe stehen im Body und müssen von dort
übernommen werden, nicht erfunden:

```bash
sed -n '1,20p' .claude/skills/brain-ingest/SKILL.md
grep -n 'brain\|ingest\|wiki' .claude/skills/brain-ingest/SKILL.md | head -20
```

Mindestens abzudecken: Brain-Wiki, Ingestion, `scripts/brain/ingest-sources.yaml`, das externe
`Paddione/brain`-Repo, Wiki-Seiten aus `openspec/specs`.

**Akzeptanz:** `awk '/^---$/{n++; next} n==1' .claude/skills/brain-ingest/SKILL.md | grep -c '^description:'`
liefert `1`.

## Task 2.2 — `repo-hygiene`: description nach dem Kontrakt schärfen

Nach der Festlegung oben umschreiben: Repo-Zustand behalten, Ticket-Formulierungen abgeben.
Die Trigger-Phrasen „clean branches", „merge PRs", „prune worktrees", „factory queue status"
bleiben; ein Hinweis auf die Abgrenzung zu `ticket-ops` kommt hinzu, damit die Wahl bei
gemischten Anfragen eindeutig ist.

**Akzeptanz:** Die `description` nennt keine Ticket-Triage mehr und verweist auf `ticket-ops` für
Ticket-Inhalte.

## Task 2.3 — Fork-Deklaration für die drei openspec-Skills

`openspec-propose`, `openspec-apply-change` und `openspec-archive-change` tragen heute
`license: MIT`, `metadata.author: openspec`, `metadata.version`, `metadata.generatedBy: "1.3.1"`.
Sie wurden mit T001263 / PR #2188 installiert und seitdem nie gegen Upstream re-synct, aber
projektseitig verändert (Framework-Mapping-Tabelle, PR #2702).

Die Upstream-Metadata durch eine Fork-Deklaration ersetzen, die die Herkunft nennt und
festhält, dass die Datei lokal weiterentwickelt wurde — damit ein späterer Re-Sync-Versuch nicht
stillschweigend lokale Änderungen verwirft. `name` und `description` bleiben Pflichtfelder;
`compatibility: Requires openspec CLI.` bleibt sachlich richtig und wird behalten.

Der vierte openspec-Skill, `openspec-explore`, gehört zu `p3` und wird hier nicht angefasst.

**Akzeptanz:** In den drei Dateien kommt weder `generatedBy` noch `author: openspec` vor, und
jede nennt stattdessen die Upstream-Quelle als Fork-Ursprung.

## Task 2.4 — `category:` aus den drei Specialist-Skills entfernen

`database-specialist`, `security-specialist` und `website-specialist` tragen als einzige
`category: devflow`. Kein Gate, kein Emitter und kein Harness liest das Feld.

```bash
grep -rn '^category:' .claude/skills --include=SKILL.md          # vorher 3 Treffer
grep -rn 'category' scripts/ docs/agent-guide/ .claude/lib/ 2>/dev/null | grep -i skill | head
```

Die zweite Abfrage vor dem Löschen ausführen: Findet sie einen Leser, wird das Feld behalten und
stattdessen bei allen 21 projekteigenen Skills ergänzt. Findet sie keinen — der erwartete Fall —
wird das Feld in den drei Dateien entfernt.

**Akzeptanz:** `grep -rn '^category:' .claude/skills --include=SKILL.md` liefert keine Treffer,
oder das Feld ist bei allen projekteigenen Skills gesetzt.

## Task 2.5 — descriptions der übrigen acht Skills prüfen und schärfen

`dev-flow-chore`, `dev-flow-e2e`, `references`, `incident-response`, `operations-management`,
`mishap-tracker` sowie die drei Specialists aus Task 2.4 (deren description hier mitbehandelt
wird) gegen die drei Kriterien aus `design.md` prüfen:

1. Nennt die konkreten Begriffe, auf die der Skill feuern soll — nicht nur die Kategorie.
2. Sagt, **wann nicht**, wo das relevant ist (Routing-Hubs, explicit-invoke-only Runbooks).
3. Grenzt gegen Nachbarskills ab, wo Verwechslungsgefahr besteht.

Konkret zu erwarten: `mishap-tracker` beschreibt heute nur, *was* er tut („Shared utility —
batches all execution mishaps…"), nicht *wann* er zu verwenden ist — hier fehlt der Auslöser
(Abschluss eines Runbook-Skills). `dev-flow-chore` grenzt sich bereits gegen `dev-flow-execute`
ab und braucht ergänzend die Abgrenzung gegen `dev-flow-plan`.

Wo eine description gestrichene Begriffe verliert, wird der Grund im Commit-Text genannt — ein
verlorener Trigger ist eine Verhaltensänderung, kein Redaktionsdetail.

**Akzeptanz:** Jede der 14 Dateien hat ein `description`-Feld, das mindestens einen konkreten
Pfad, Befehl oder Fachbegriff aus ihrem eigenen Body nennt.

## Task 2.6 — Gates nach dem Frontmatter-Pass

```bash
bash scripts/health-goals-check.sh --only=G-AGENTIC03,G-AGENTIC07,G-AGENTIC08,G-AGENTIC10
```

`G-AGENTIC07` reagiert darauf, wenn ein Skill durch eine neu hinzugefügte `description` erstmals
gemessen wird: `brain-ingest` wird durch Task 2.1 vom ungemessenen zum gemessenen Skill und
braucht ab dann eine Referenz in `CLAUDE.md`, `AGENTS.md`, `OVERVIEW.md` oder einem anderen
`SKILL.md`.

```bash
grep -rl 'brain-ingest' CLAUDE.md AGENTS.md .claude/skills/OVERVIEW.md .claude/skills --include=SKILL.md
```

**Akzeptanz:** Der Gate-Aufruf endet mit Exit 0 und `brain-ingest` wird von mindestens einer
Referenzquelle genannt.
