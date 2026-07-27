# p1 — OVERVIEW.md als Projekt/Vendor-SSOT

**Rolle:** impl · **target_files:** `.claude/skills/OVERVIEW.md` · **depends_on:** —

`.claude/skills/OVERVIEW.md` wird von der verrotteten Prosa-Übersicht zur maschinenlesbaren
Quelle dafür, welcher Skill projekteigen ist. `p4` (Gate) und `p5` (Tests) parsen das Ergebnis —
der unten festgelegte Marker-Block und der Extraktionsbefehl sind ein **eingefrorener Kontrakt**
und dürfen nicht abgewandelt werden.

## Eingefrorener Kontrakt

Die Vendor-Sektion wird von zwei HTML-Kommentar-Markern eingefasst. Der Marker-Block, nicht die
Überschrift, ist die parsbare Grenze — eine Überschrift lässt sich umformulieren, ein Marker
nicht versehentlich.

```markdown
<!-- vendor-skills:begin -->
| Skill | Herkunft | Wann verwenden |
|---|---|---|
| `gitops-cluster-debug` | … | … |
<!-- vendor-skills:end -->
```

Extraktionsbefehl (identisch in `p4` und `p5` zu verwenden):

```bash
sed -n '/<!-- vendor-skills:begin -->/,/<!-- vendor-skills:end -->/p' .claude/skills/OVERVIEW.md \
  | grep -oE '^\| `[a-z0-9/-]+`' | tr -d '|` ' | sort -u
```

Der Block MUSS nach Abschluss genau diese sieben Namen liefern:

```
gitops-cluster-debug
gitops-knowledge
gitops-repo-audit
lavish
superpowers/using-git-worktrees
ui-ux-pro-max
vitest
```

Daraus folgt: **21 projekteigene Skills** (28 getrackt minus 7 Vendor). Das sind die 20 aus der
Ticket-Beschreibung **plus `update-dependencies`** — dieser Skill ist projekteigen (kein
Upstream-Autor, repo-spezifischer Runbook-Body), trägt aber `archived: true` ohne `description`.
Er ist damit von der description-Regel ausgenommen und liegt mit 82 Zeilen unter dem
Zeilenbudget; beide Gates bleiben grün, ohne dass er in `p2` oder `p3` angefasst wird.

## Task 1.1 — Vendor-Sektion anlegen und vervollständigen

Die bestehende Sektion „Third-party / UI-Referenz-Skills (kein Projekt-Workflow)" nennt heute nur
`ui-ux-pro-max`. Sie wird zur vollständigen Vendor-Sektion umgebaut:

- Marker-Paar `<!-- vendor-skills:begin -->` / `<!-- vendor-skills:end -->` um die Tabelle legen.
- Alle sieben Namen aus dem Kontrakt oben als Tabellenzeilen führen, jeweils mit Herkunft
  (Upstream-Projekt oder Autor aus dem Frontmatter) und einem Einzeiler „Wann verwenden".
- In den Sektionstext aufnehmen, dass diese Skills upstream-gepflegt sind und deshalb weder vom
  Zeilenbudget noch vom description-Standard erfasst werden — mit der Begründung, dass
  Änderungen daran beim nächsten Sync kollidieren.

Herkunftsangaben aus dem jeweiligen Frontmatter übernehmen, nicht raten:

```bash
for s in gitops-cluster-debug gitops-knowledge gitops-repo-audit lavish vitest ui-ux-pro-max superpowers/using-git-worktrees; do
  echo "--- $s ---"; awk '/^---$/{n++; next} n==1' ".claude/skills/$s/SKILL.md" | head -12
done
```

**Akzeptanz:** Der Extraktionsbefehl aus dem Kontrakt liefert exakt die sieben Namen, je einmal.

## Task 1.2 — Tote Einträge entfernen

Fünf Zeilen nennen Skills, deren Verzeichnis nicht mehr existiert — alle wurden in `infra-ops`
konsolidiert, ihre Zeilen sind stehen geblieben:

`host-node-networking` · `cluster-deployment` · `secret-rotation` · `workspace-deploy` ·
`database-ops`

Jede Zeile entfernen. Wo die Zeile eine Fähigkeit beschreibt, die weiterhin existiert, wird sie
der Sektion von `infra-ops` zugeschlagen, die sie absorbiert hat — die Fähigkeit darf nicht mit
der Zeile verschwinden.

Die Zeile für `/feature-intake` bleibt, wird aber als opencode-Command statt als Skill
gekennzeichnet, damit sie nicht als fehlendes Skill-Verzeichnis gelesen wird.

Nachweis, dass keine tote Referenz übrig ist:

```bash
grep -oE '\[`[a-z0-9/-]+`\]|`[a-z0-9/-]+`' .claude/skills/OVERVIEW.md | tr -d '[]`' | sort -u \
  | while read n; do [ -d ".claude/skills/$n" ] || echo "OHNE VERZEICHNIS: $n"; done
```

Erwartet sind danach nur noch: die sechs `bachelorprojekt-*`-Agentennamen, `react-bits` (der
dokumentierte ungetrackte Skill) sowie gewöhnliche Wörter in Backticks wie `task` oder
`description`. Kein Eintrag aus der Fünferliste oben darf erscheinen.

**Akzeptanz:** Keiner der fünf Namen kommt in `OVERVIEW.md` noch vor.

## Task 1.3 — Links auf Quelldateien umstellen

Der überwiegende Teil der Einträge verlinkt auf
`https://github.com/Paddione/Bachelorprojekt/blob/main/k3d/docs-content-built/skills/<name>.html`
— also auf ein Build-Artefakt des Docs-Containers. Diese Links überleben keine Umbenennung und
sind aus einem Repo-Checkout heraus nicht lesbar.

Jeden Skill-Link auf den relativen Pfad zur Quelle umstellen, im Stil der bereits korrekten
Einträge: `[`git-workflow`](git-workflow/SKILL.md)`.

```bash
grep -c 'docs-content-built' .claude/skills/OVERVIEW.md   # vorher > 0, nachher 0
```

**Akzeptanz:** `grep -c 'docs-content-built' .claude/skills/OVERVIEW.md` liefert `0`.

## Task 1.4 — Zählerzeile und Gates prüfen

`G-AGENTIC06` liest die Zahl per `grep -oE '[0-9]+ project-local skills'` aus Zeile 3. K4 fügt
keinen Skill hinzu und entfernt keinen, also muss die Zahl **28** in genau dieser grep-baren Form
erhalten bleiben — auch wenn der umgebende Satz umformuliert wird.

`G-AGENTIC07` zählt Skills mit `description`, die von keiner Referenzquelle genannt werden.
Beim Entfernen von Zeilen in Task 1.2 und beim Umbau der Tabellen kann die einzige Referenz eines
beibehaltenen Skills wegfallen.

```bash
bash scripts/health-goals-check.sh --only=G-AGENTIC06,G-AGENTIC07
```

**Akzeptanz:** Beide Gates melden `0` und der Aufruf endet mit Exit 0. Wenn `G-AGENTIC07` steigt,
fehlt einem beibehaltenen Skill die Referenz — dann wird sie in `OVERVIEW.md` ergänzt, nicht das
Gate umgangen.
