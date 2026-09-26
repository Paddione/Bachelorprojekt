---
title: "k4-surgery/p1-pipeline — Partial Plan"
ticket_id: T900451
domains: [scripts, k3d]
status: active
---

# k4-surgery/p1-pipeline — Implementation Plan

_Ticket: T900451 · Change: k4-surgery (4/6) · Partial p1-pipeline (impl, disjoint — nur Pipeline-Löschung, Taskfile-Shrink (beide Taskfiles), G-BRAIN12/13/14)._

Designanker: E2 (Manifest löschen), E3 (Taskfile-Shrink in einem Partial), E4 (G-BRAIN14 mit entfernen), E6 (Reihenfolge-Gate), R1 (Wiki-Diff), R3 (Gate statt Vertrauen). Messung: `bash scripts/plan-intel-filter.sh k4-surgery <targets>` meldete `intel.json not found` — Grep-Fallback, alle Pfade unten per `ls`/`grep`/`wc -l` verifiziert. S4: Die Löschungen entfernen Skripte samt ihren Referenzen (Manifest, Workflow, Skill, Task-Einträge) — es entstehen keine Orphan-Manifeste oder Orphan-Skripte. Keine Baseline-Einträge werden hinzugefügt.

## File Structure

### Deleted (DEL — alle per `ls` verifiziert, Anweisung: `git rm`)

| path | act | lines |
| `scripts/brain-ingest.sh` | DEL | 717 |
| `scripts/brain-ingest-worklist.sh` | DEL | 203 |
| `scripts/brain-ingest-transform.sh` | DEL | 216 |
| `scripts/brain-ingest-moc.sh` | DEL | 256 |
| `scripts/brain-ingest-prune.sh` | DEL | 107 |
| `scripts/brain-ingest-restamp.sh` | DEL | 175 |
| `scripts/brain-ingest-swap.sh` | DEL | 193 |
| `scripts/brain-ingest-reset.sh` | DEL | 78 |
| `scripts/brain-ingest-coverage.sh` | DEL | 136 |
| `scripts/brain-group-match.sh` | DEL | 140 |
| `scripts/brain-source-provenance.sh` | DEL | 28 |
| `scripts/brain-page-metadata.py` | DEL | 136 |
| `scripts/brain-lifecycle-audit.py` | DEL | 282 |
| `scripts/brain-expertise.py` | DEL | 369 |
| `scripts/brain-bootstrap.sh` | DEL | 82 |
| `scripts/brain-merge-hook.sh` | DEL | 16 |
| `.github/workflows/brain-merge-hook.yml` | DEL | 60 |
| `scripts/brain/ingest-sources.yaml` | DEL | 78 |
| `.agents/skills/brain-ingest/SKILL.md` | DEL | 91 |

(18 Pfade + Skill-Verzeichnis `.agents/skills/brain-ingest/` mit genau dieser einen Datei — Verzeichnisliste verifiziert, Anweisung: `git rm -r`.)

### Edited (nur die genannten Abschnitte, Rest byte-identical)

| path | act | ist | rest |
| `taskfiles/Taskfile.brain.yaml` | EDIT | 119 | n/a |
| `scripts/health-goals-check.sh` | EDIT | 592 | 0 (Baseline 592, Edit schrumpft) |
| `.claude/lib/goals.md` | EDIT | 799 | n/a |
| `Taskfile.yml` | EDIT | 5503 | n/a |

- `taskfiles/Taskfile.brain.yaml` Ist 119 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated, `residual_budget` leer) → keine S1-Zahl; Edit ist reiner Shrink (119 → 27 Zeilen), Split-Regel greift nicht.
- `scripts/health-goals-check.sh` Ist 592 · Baseline 592 (`jq` verifiziert) → effektive Schwelle 592, Budget 0: Edit MUSS netto schrumpfen — er entfernt 26 Zeilen (→ 566) und verkleinert die Datei damit echt (B1b: shrink-Schritt vorhanden).
- `.claude/lib/goals.md` Ist 799 · Baseline nicht-baselined · kein `.md`-Eintrag in `s1.limits` (ungated, `residual_budget` leer) → keine S1-Zahl; Edit entfernt 3 Tabellenzeilen plus Aufzählungsnennungen.
- `Taskfile.yml` Ist 5503 · Baseline nicht-baselined · kein `.yml`-Eintrag in `s1.limits` (ungated, `residual_budget` leer) → keine S1-Zahl; Edit entfernt 1 Kommentarblock + 3 Tasks (netto −18 Zeilen).

### Keepers (explizit NICHT anfassen)

| path | act | lines |
| `scripts/brain-chunk.sh` | KEEP | 293 |
| `scripts/brain-verify-refs.sh` | KEEP | 180 |
| `scripts/brain-verify-claims.sh` | KEEP | 157 |
| `scripts/brain-retrieval-eval.py` | KEEP | 170 |

### Task 1: E6-Reihenfolge-Gate + R1-Wiki-Diff (fail-closed, läuft vor jeder Löschung)

**Files:** keine (reine Gate-Task).

(a) E6-Gate — K1 (T900449, 2/6) und K3 (T900450, 3/6) müssen auf `origin/main` live sein:

```bash
git fetch origin main --quiet
k1=$(git log --oneline origin/main --grep=T900449 | tee /tmp/k4-k1.log | wc -l)
k3=$(git log --oneline origin/main --grep=T900450 | tee /tmp/k4-k3.log | wc -l)
echo "K1-Hits: $k1 / K3-Hits: $k3"
[ "$k1" -ge 1 ] && [ "$k3" -ge 1 ] || { echo "STOPP: E6-Gate rot — T900449 (K1) oder T900450 (K3) fehlt auf origin/main; k4-surgery abgebrochen, keine Datei geloescht."; exit 1; }
```

Muss zeigen: je mindestens eine Commit-Zeile mit T900449 bzw. T900450 in `/tmp/k4-k1.log` und `/tmp/k4-k3.log`. Sonst STOPP mit exakt der Meldung oben, keine Teillöschung (R3).

(b) R1-Wiki-Diff — Seiten in `Paddione/brain` auflisten, deren Quelle keine Repo-Datei ist (`gh api`, nur lesend):

```bash
gh api "repos/Paddione/brain/git/trees/main?recursive=1" --paginate \
  -q '.tree[] | select(.type == "blob" and (.path | endswith(".md"))) | .path' > /tmp/k4-wiki-pages.txt
wc -l /tmp/k4-wiki-pages.txt
> /tmp/k4-wiki-only.txt
while IFS= read -r page; do
  [ -n "$page" ] || continue
  src=$(gh api "repos/Paddione/brain/contents/${page}" -q '.content' 2>/dev/null \
    | base64 -d | grep -m1 -oE 'source::[ ]*[^ ]+' | sed 's/^source::[ ]*//' || true)
  if [ -z "$src" ]; then echo "$page :: NO-SOURCE-HEADER" >> /tmp/k4-wiki-only.txt
  elif [ ! -f "$src" ]; then echo "$page :: MISSING-SOURCE $src" >> /tmp/k4-wiki-only.txt
  fi
done < /tmp/k4-wiki-pages.txt
cat /tmp/k4-wiki-only.txt
```

Muss zeigen: jede Wiki-Seite löst auf eine existierende Repo-Datei auf. Falls `/tmp/k4-wiki-only.txt` Treffer enthält, jede gefundene Seite nach `docs/` zurückholen und committen (Schleife über die Trefferdatei, Pfad ist das Feld vor ` :: `):

```bash
mkdir -p docs/retracted-wiki
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  page="${hit%% :: *}"
  slug=$(basename "$page" .md)
  gh api "repos/Paddione/brain/contents/${page}" -q '.content' | base64 -d > "docs/retracted-wiki/${slug}.md"
  git add "docs/retracted-wiki/${slug}.md"
  git commit -m "docs(T900451): retract wiki-only page ${page}"
done < /tmp/k4-wiki-only.txt
git status --porcelain docs/retracted-wiki/ | wc -l
```

Bei leerer Trefferdatei stattdessen protokollieren: `R1 wiki-diff: 0 wiki-only authored pages — alle Wiki-Seiten loesen auf Repo-Dateien auf.`

### Task 2: Pipeline-Löschungen

**Files:** alle 18 DEL-Pfade + `.agents/skills/brain-ingest/` aus `## File Structure`.

```bash
git rm scripts/brain-ingest.sh scripts/brain-ingest-worklist.sh scripts/brain-ingest-transform.sh \
  scripts/brain-ingest-moc.sh scripts/brain-ingest-prune.sh scripts/brain-ingest-restamp.sh \
  scripts/brain-ingest-swap.sh scripts/brain-ingest-reset.sh scripts/brain-ingest-coverage.sh \
  scripts/brain-group-match.sh scripts/brain-source-provenance.sh scripts/brain-page-metadata.py \
  scripts/brain-lifecycle-audit.py scripts/brain-expertise.py scripts/brain-bootstrap.sh \
  scripts/brain-merge-hook.sh .github/workflows/brain-merge-hook.yml scripts/brain/ingest-sources.yaml
git rm -r .agents/skills/brain-ingest
```

Verifikation (Muss-Ergebnisse in Klammern):

```bash
for f in scripts/brain-ingest.sh scripts/brain-ingest-worklist.sh scripts/brain-ingest-transform.sh \
  scripts/brain-ingest-moc.sh scripts/brain-ingest-prune.sh scripts/brain-ingest-restamp.sh \
  scripts/brain-ingest-swap.sh scripts/brain-ingest-reset.sh scripts/brain-ingest-coverage.sh \
  scripts/brain-group-match.sh scripts/brain-source-provenance.sh scripts/brain-page-metadata.py \
  scripts/brain-lifecycle-audit.py scripts/brain-expertise.py scripts/brain-bootstrap.sh \
  scripts/brain-merge-hook.sh .github/workflows/brain-merge-hook.yml scripts/brain/ingest-sources.yaml; do
  test ! -e "$f" || { echo "DEL-REST: $f"; exit 1; }
done
test ! -d .agents/skills/brain-ingest
ls scripts/ | grep brain-ingest && exit 1 || echo "OK: keine brain-ingest-Dateinamen unter scripts/"
for k in scripts/brain-chunk.sh scripts/brain-verify-refs.sh scripts/brain-verify-claims.sh scripts/brain-retrieval-eval.py; do
  test -f "$k" || { echo "KEEPER FEHLT: $k"; exit 1; }
done
echo "OK: 18 Pfade + Skill-Verzeichnis weg, 4 Keeper vorhanden"
```

Verbleibende Textreferenzen auf gelöschte Skripte (G-BRAIN12-Zeilen, Guard-Specs, Doku) gehören den Guards-/Doku-Partials — hier wird nur die Dateiabwesenheit assertiert.

### Task 3: Taskfile-Shrink (Taskfile.brain.yaml + Taskfile.yml)

**Files:** `taskfiles/Taskfile.brain.yaml` (Ist 119, Shrink auf 27 Zeilen), `Taskfile.yml` (Ist 5503, −18 Zeilen).

Exakte Task-Namen aus der gelesenen Datei (Stand 119 Zeilen): `eval`, `lifecycle:audit`, `expertise:fetch`, `expertise:stage`, `expertise:approve`, `ingest`, `ingest:verify`, `ingest:stats`, `ingest:run`, `ingest:pilot`, `brain:chunk`, `brain:mcp`, `brain:mcp:tools`, `chunk`, `mcp`, `mcp:tools`. Davon löschen (13): `ingest`, `ingest:verify`, `ingest:stats`, `ingest:run`, `ingest:pilot`, `expertise:fetch`, `expertise:stage`, `expertise:approve`, `lifecycle:audit`, `mcp`, `mcp:tools`, `brain:mcp`, `brain:mcp:tools`. Behalten (3): `eval` (ruft das Keeper-Eval-Skript, gehört keiner Löschfamilie an), `brain:chunk`, `chunk` (beide rufen den Keeper-Chunker; `chunk` trägt den Hilfe-Summary-Block).

Edits (Rest byte-identical, Blöcke dazwischen auf je eine Leerzeile kollabieren):

1. Kopfzeilen 1–3 alt:
```text
# ────────────────────────────────────────────────────────────────────
# Brain Initial Ingest — Quartz Wiki Kompilierung
# ────────────────────────────────────────────────────────────────────
```
neu:
```text
# ────────────────────────────────────────────────────────────────────
# Brain Chunk-Keeper — Chunker + Eval-Einstiege (Ingest retiriert, T900451)
# ────────────────────────────────────────────────────────────────────
```
2. Task-Blöcke `lifecycle:audit` (13–16), `expertise:fetch`/`expertise:stage`/`expertise:approve` (18–31), `ingest` (33–40), `ingest:verify` (42–46), `ingest:stats` (48–51), T014339-Kommentar (53–60), `ingest:run` (61–67), `ingest:pilot` (69–75), `brain:mcp` (84–87), `brain:mcp:tools` (89–93), `mcp` (107–110), `mcp:tools` (112–119) vollständig entfernen.
3. Kommentar Zeile 95 alt: `# ── T002679: Chunking und Retrieval ──` neu: `# ── T002679: Chunking (Keeper) ──` (Retrieval-Tasks sind weg).

Verifikation:

```bash
yq '.tasks | keys | sort | join(",")' taskfiles/Taskfile.brain.yaml
[ "$(yq '.tasks | keys | sort | join(",")' taskfiles/Taskfile.brain.yaml)" = "brain:chunk,chunk,eval" ]
[ "$(grep -cE '^  (ingest|expertise|lifecycle|mcp|brain:mcp)' taskfiles/Taskfile.brain.yaml)" = "0" ]
[ "$(grep -ci worklist taskfiles/Taskfile.brain.yaml)" = "0" ]
wc -l taskfiles/Taskfile.brain.yaml
```

Muss zeigen: Task-Schlüssel exakt `brain:chunk,chunk,eval`, 0 Treffer für Ingest-/Expertise-/Lifecycle-/MCP-Taskeinträge, 0 Worklist-Treffer, 27 Zeilen.

`Taskfile.yml`: den Block `# Brain-Documentation Generator` (Kommentar + 3 Tasks `brain:ingest-worklist`, `brain:ingest:dry`, `brain:bootstrap`, alle rufen gelöschte Skripte aus Task 2 auf) vollständig entfernen — von der Kommentarzeile `# Brain-Documentation Generator` bis zur `cmds:`-Zeile von `brain:bootstrap`, Rest byte-identical:

```bash
python3 - <<'PY'
p = 'Taskfile.yml'
lines = open(p).read().split('\n')
heads = [i for i, l in enumerate(lines) if '# Brain-Documentation Generator' in l]
tails = [i for i, l in enumerate(lines) if 'brain-bootstrap.sh' in l]
assert len(heads) == 1 and len(tails) == 1, f"Anker nicht eindeutig: header={heads} tail={tails}"
start, end = heads[0] - 1, tails[0]
chunk = lines[start:end + 1]
assert sum(1 for l in chunk if l.startswith('  brain:')) == 3, "genau 3 Tasks erwartet"
assert lines[end + 1] == '', "Leerzeile nach Block erwartet"
del lines[start:end + 2]
open(p, 'w').write('\n'.join(lines))
print(f"entfernt: Zeilen {start + 1}-{end + 2} (Brain-Block)")
PY
grep -cE '^  brain:(ingest|bootstrap)' Taskfile.yml || echo "0 brain:ingest/bootstrap-Tasks (erwartet)"
yq '.tasks | keys | any_c(. == "brain:ingest:dry")' Taskfile.yml
```

Muss zeigen: genau 1 Block entfernt, 0 Treffer für `brain:ingest*`/`brain:bootstrap`-Tasks, `yq`-Check meldet `false`.

### Task 4: G-BRAIN12/13/14-Entfernung (E4)

**Files:** `scripts/health-goals-check.sh`, `.claude/lib/goals.md` (Asserts decken zusätzlich `taskfiles/Taskfile.brain.yaml` aus Task 3 ab).

1. `scripts/health-goals-check.sh` Zeilen 563–564 löschen (exakter Wortlaut):
```text
# [T013916] --pending zaehlt offene Chunks (Hash gegen State), nicht alle Quellen.
want G-BRAIN14 && row gate   G-BRAIN14 "$([ "$FAST" = 1 ] && echo '-' || { [ -f scripts/brain-ingest-worklist.sh ] && timeout 120 bash scripts/brain-ingest-worklist.sh --pending 2>/dev/null || echo '-'; })" eq 0 "Brain-Ingest-Backlog (offene Chunks)"
```
2. `.claude/lib/goals.md` Tabellenzeile 683 löschen (exakter Wortlaut):
```text
| **G-BRAIN14** | Brain-Ingest-Backlog (offene Chunks) | 17 ⚠ | 0 | `bash scripts/brain-ingest-worklist.sh --pending` (Chunk-Hash gegen State-File, dieselbe Semantik wie `brain-ingest.sh process_page`) |
```
3. `.claude/lib/goals.md` Zeile 745: `, G-BRAIN14` aus der Monatlich/Quartal-Aufzählung streichen → `… G-DOC02, G-FE01/02, G-AGENTIC09, G-DB11`.
4. `.claude/lib/goals.md` Muster-Absatz Zeilen 42–44 neu fassen (G-BRAIN14-Satz raus, G-SIZE03-Beispiel bleibt):
```text
3. **Die Messung misst etwas anderes als der Titel behauptet.** `G-SIZE03` maß ein
   „God-File" mit 311 Zeilen gegen eine Schwelle von 3000.
```
5. `.claude/lib/goals.md` Chronik Zeile 765–766: `G-BRAIN14 (Brain-Backlog), ` streichen und `9 Prio-B-Ziele` → `8 Prio-B-Ziele` (Aufzählung bleibt sonst unverändert).

6. `scripts/health-goals-check.sh` Zeilen 280–286 (G-BRAIN12-Block, `want G-BRAIN12 && row gate …` bis `… "Brain-Manifest-Gruppen ohne Treffer (Ingest-Drift)"`) und Zeilen 287–303 (G-BRAIN13-Block, `row gate G-BRAIN13 …` bis `… "Brain-Merge-Hook-Pfad-Parität (Trigger ↔ Handler)"`) vollständig löschen (24 Zeilen; beide Checks rufen gelöschte Dateien aus Task 2 auf). Kopfkommentar Zeile 279 neu fassen: `# ── Brain-Dokumentation — GATES (G-BRAIN15; G-BRAIN12/13/14 mit k4-surgery retiriert) ──`.
7. `.claude/lib/goals.md` Tabellenzeilen G-BRAIN12 (721) und G-BRAIN13 (722) löschen, exakter Wortlaut:
```text
| **G-BRAIN12** | Brain-Manifest-Gruppen ohne Treffer (Ingest-Drift) | 0 ✓ | 0 | `bash scripts/brain-ingest-worklist.sh >/dev/null 2>&1 \| stderr-Warnungen 'hat 0 Treffer' zählen` |
| **G-BRAIN13** | Brain-Merge-Hook-Pfad-Parität (Trigger ↔ Handler) | 0 ✓ | 0 | `paths:-Globs in .github/workflows/brain-merge-hook.yml gegen brain-merge-hook.sh-SRC-Argumente (sym. Diff); .github/-Pfade zählen nicht mit — sie sind Trigger, keine Brain-Quellen` |
```
Wochenliste Zeile 744: `G-BRAIN12, G-BRAIN13, ` streichen (G-BRAIN15 bleibt). Historie bleibt unangetastet: Zeile 25 (Nummerierungsnotiz) und Zeile 771 (Chronik-Fixnotiz zu G-BRAIN13) sind Vergangenheitsbelege, keine lebenden Referenzen.
8. G-BRAIN15 + `templates/brain/` bleiben bewusst bestehen (Seed-Template-Lint läuft weiter grün, kein Pipeline-Bezug) — kein Fund, keine Änderung.

Verifikation:

```bash
grep -rn "G-BRAIN14" taskfiles/Taskfile.brain.yaml scripts/health-goals-check.sh .claude/lib/goals.md && exit 1 || echo "OK: 0 G-BRAIN14-Treffer"
grep -rn -- "--pending" taskfiles/Taskfile.brain.yaml scripts/health-goals-check.sh .claude/lib/goals.md && exit 1 || echo "OK: 0 --pending-Treffer"
grep -n "G-BRAIN12\|G-BRAIN13" scripts/health-goals-check.sh && exit 1 || echo "OK: 0 G-BRAIN12/13-Treffer im Check-Skript"
grep -n "G-BRAIN12\|G-BRAIN13" .claude/lib/goals.md
```

Muss zeigen: erste drei Befehle melden 0 Treffer; der vierte meldet genau die 2 dokumentierten Historie-Zeilen (25, 771) und sonst nichts. `wc -l scripts/health-goals-check.sh` meldet 566 (592 − 26, Budget-0-Shrink erfüllt).

### Task 5: Verifikation — Gates + Keeper-Link-Check

**Files:** keine (reine Verify-Task).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Danach der Keeper-Link-Check (report-only, Exit 0 per Design — dokumentiert Restrisiko R2 für den 5/6-Sweep):

```bash
rm -rf /tmp/k4-brain-wiki
if gh repo clone Paddione/brain /tmp/k4-brain-wiki -- --depth 1 2>/dev/null \
  && [ -d /tmp/k4-brain-wiki/wiki ]; then
  bash scripts/brain-verify-refs.sh --brain-repo /tmp/k4-brain-wiki --root . --all
else
  echo "Link-Check uebersprungen: Wiki-Klon nicht verfuegbar (offline); R2-Rest geht an den 5/6-Sweep."
fi
```
