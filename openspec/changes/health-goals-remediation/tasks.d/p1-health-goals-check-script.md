# P1 — health-goals-check.sh Measurement Fixes

Rolle: **impl**. Partial P1 des Change `health-goals-remediation` (T002148), REQ-HEALTH-GOALS-010.
Behebt drei Messfehler in `scripts/health-goals-check.sh` (kein Verhalten der geprüften Systeme
ändert sich — nur wie das Skript sie misst): G-AGENTIC02 (Agent-Routing-Drift-Parser liest die
falsche Quelldatei), G-DB09 (`pg_stat_statements`-Query-Text rollenbasiert maskiert) und G-E2E01
(E2E-Erfolgsrate zählt manuell abgebrochene `workflow_dispatch`-Runs mit).

Disjunkter Scope (einzige Datei dieses Partials): `scripts/health-goals-check.sh`.

> **Wichtiger Hinweis für Reviewer/Orchestrator:** Task 1.1 weicht in der Quelldatei vom Ticket-Text
> ab (Ticket schlägt `AGENTS.md`s `<details>`-Tabelle vor; dieser Plan zeigt per Trockenlauf, dass
> das weiterhin 6 statt 0 Mismatches liefert, und begründet stattdessen `CLAUDE.md` als Quelle —
> siehe Task 1.1 unten für die vollständige Herleitung inkl. Verifikationsdaten).

## S1-Budget

`scripts/health-goals-check.sh` ist **nicht** in `docs/code-quality/baseline.json` gebaselinet
(`jq -r '."S1:scripts/health-goals-check.sh".metric // "not-baselined"' docs/code-quality/baseline.json`
→ `not-baselined`) → wirksame Schwelle ist das statische `.sh`-Extension-Limit aus
`docs/code-quality/gates.yaml` (500). Ist-Zeilen: 471 (`wc -l scripts/health-goals-check.sh`).
**Budget = 500 − 471 = 29 Zeilen.**

| Datei | Ist | Budget |
|-------|-----|--------|
| `scripts/health-goals-check.sh` | 471 | 29 |

Netto-Wachstum durch die drei Tasks unten: **+6 Zeilen** (Task 1.1 fügt 1 neue Kommentarzeile
über dem `row gate G-AGENTIC02`-Aufruf hinzu; Task 1.2 erweitert `db_scalar()` um 5 Netto-Zeilen
für den optionalen Rollen-Parameter; Task 1.3 ist zeilenneutral — reine In-Place-Edits bestehender
Zeilen, keine neuen Zeilen). Restbudget danach: 500 − (471+6) = **23 Zeilen**, klar unter der
500er-Schwelle — kein Split/Shrink nötig.

---

## File: `scripts/health-goals-check.sh`

### Task 1.1 — G-AGENTIC02: falsche Quelldatei, nicht nur falsche Stelle in ihr

**Root Cause (wie im Ticket beschrieben):** Der Python-Inline-Parser (Anker Z202–224, im
`row gate G-AGENTIC02 …`-Block) sucht `^## Agent Routing` in `AGENTS.md` und liest bis zur
nächsten `^## `-Überschrift. Diese Überschrift existiert (Z7: `## Agent Routing (opencode local
LLM)`, `re.match` prüft nur den Präfix, matcht also auch mit dem Klammerzusatz) — aber sie gehört
zur **falschen** Tabelle (dem opencode-Modell-Routing für `bonsai-8b-1..4`/`deepseek-helper`/
`explore`/`general`, keine `bachelorprojekt-*`-Zeile enthalten). Damit bleibt `rows` leer und jeder
Agent mit nicht-leerem Frontmatter-Trigger-Set zählt als "mismatched" (6 falsch-positive
Verstöße).

**Abweichung von der ursprünglichen Ticket-Annahme (empirisch verifiziert, siehe unten):** Das
Ticket schlägt vor, stattdessen direkt die `<details><summary>Claude Code Domain
Agents…</summary>`-Tabelle bei `AGENTS.md:89-96` zu parsen. Ich habe das gegen die echten Dateien
getestet (`python3` Sandbox-Lauf gegen den Worktree-Stand) — mit korrekt lokalisierter
`AGENTS.md`-Tabelle bleiben **weiterhin 6 Mismatches**, nicht 0:

```
bachelorprojekt-infra DIFF: {'workspace:setup', 'environments/', 'prod*/', 'env='}
bachelorprojekt-ops DIFF: {'model', 'why is x failing', 'status', ...}
bachelorprojekt-website DIFF: {'component', 'mentolder brand', 'homepage', 'kore', 'design'}
bachelorprojekt-test DIFF: {'factory:', 'test failing', 'write a test', 'fa-sf', ...}
bachelorprojekt-db DIFF: {'timeline', 'bachelorprojekt.features', 'psql', 'tracking', ...}
bachelorprojekt-security DIFF: {'keycloak', 'secret', 'keycloak realm', 'certificate', 'rotate'}
```

Grund: `AGENTS.md`s `<details>`-Tabelle ist **absichtlich** eine gekürzte Quick-Reference für den
opencode-Kontext (`AGENTS.md:3`: "Goal: Keep this file under 120 lines of must-know content") —
sie war nie als vollständiger Spiegel der Frontmatter-Trigger gedacht, sondern eine bewusst
verkürzte Teilmenge. Das erklärt auch, warum der ursprüngliche Autor nicht einfach auf sie
verweisen konnte: selbst korrekt lokalisiert liefert sie keine 0.

`CLAUDE.md:9-14` dagegen ist **exakt** deckungsgleich mit jedem Frontmatter — verifiziert (0
Mismatches, alle 6 Agenten) und deckt sich mit dem, was REQ-HEALTH-GOALS-010s Akzeptanz-Szenario
tatsächlich verlangt ("reports zero mismatches when **CLAUDE.md's routing table** and … frontmatter
… actually agree"). Das ist auch inhaltlich stimmig: `CLAUDE.md`s eigener Kopf sagt "check these
signals and delegate" — es ist die Tabelle, gegen die Claude Code selbst tatsächlich routet;
`AGENTS.md`s Tabelle ist die abgespeckte opencode-Variante für ein anderes Laufzeit-Setup
(lokale LLM-Subagenten, `.opencode/agent-models.jsonc`, siehe `AGENTS.md:7-9`).

**Fix:** Parser-Quelle von `AGENTS.md` auf `CLAUDE.md` umstellen (unverändert: `^## Agent
Routing`-Heading-Anker + nächste `^## `-Überschrift als Ende — `CLAUDE.md:3` hat exakt EINE
`## Agent Routing`-Überschrift, keine zweite Fehlquelle wie in `AGENTS.md`). Zusätzlich die
Zeilen-Regex anpassen: `CLAUDE.md`s Tabelle hat eine dritte Spalte (`MCP-Primär`), die ursprüngliche
Regex verlangt `\s*$` direkt nach der Agent-Zelle (2-Spalten-Annahme) und würde daher keine Zeile
matchen — die `\s*$`-Endanker-Bedingung entfällt, das Capture endet einfach an der schließenden
Pipe nach dem Agentennamen, unabhängig davon wie viele weitere Spalten folgen.

**Anker Z202–224** — den kompletten `row gate G-AGENTIC02 …`-Block ersetzen:

```bash
# G-AGENTIC02: Quelle ist CLAUDE.md (exakter Frontmatter-Spiegel), nicht AGENTS.md (dessen
# <details>-Tabelle eine absichtlich gekürzte opencode-Quick-Reference ist, siehe Task-Notiz).
row gate G-AGENTIC02 "$(
  python3 - <<'PY'
import re,glob,os
def norm(t):
    t=re.sub(r'\([^)]*\)','',t); t=t.replace('`','').replace('"','').replace("'","")
    return t.strip().rstrip('.').strip().lower()
def toks(s): return {norm(x) for x in s.split(',') if norm(x)}
def fm(p):
    f=re.search(r'^---\n(.*?)\n---',open(p).read(),re.S).group(1)
    d=re.search(r'description:\s*>?\s*(.*?)(?:\n[a-z_]+:|\Z)',f,re.S).group(1)
    d=' '.join(l.strip() for l in d.splitlines())
    m=re.search(r'[Tt]riggers on:\s*(.*)',d); return toks(m.group(1)) if m else set()
rows={}; seg=False
for line in open('CLAUDE.md').read().splitlines():
    if re.match(r'^## Agent Routing',line): seg=True; continue
    if seg and re.match(r'^## ',line): break
    if seg:
        m=re.match(r'\|(.*?)\|\s*`(bachelorprojekt-[a-z]+)`\s*\|',line)
        if m: rows[m.group(2)]=toks(m.group(1))
print(sum(1 for p in glob.glob('.claude/agents/*.md')
          if fm(p).symmetric_difference(rows.get(os.path.basename(p)[:-3],set()))))
PY
)" eq 0 "Agent-Routing-Tabelle ↔ Agent-Frontmatter-Drift"
```

Zeilenbilanz: alter Block 23 Zeilen (Z202–224), neuer Block 24 Zeilen (+1 Kommentarzeile über dem
`row gate`-Aufruf). Die Parser-Loop selbst bleibt exakt **7 Zeilen wie vorher** (`rows={};
seg=False` + `for line…` + zwei `if`-Zeilen für Heading-Erkennung + `if seg:` + `m=re.match(...)` +
`if m: rows[...]=...`) — nur zwei Stellen ändern sich: `open('AGENTS.md')` → `open('CLAUDE.md')` und
die Regex verliert ihren `\s*$`-Endanker (2-Spalten- → N-Spalten-Tabelle). Netto **+1 Zeile** für
diesen Task (die neue Kommentarzeile).

**Verifikation (bereits durchgeführt, s.o. — kein separater Task nötig, da die Wirkung sich exakt
in der Root-Cause-Analyse oben dokumentiert):** `python3`-Trockenlauf gegen den echten Worktree-
Stand liefert mit dem neuen Parser (Quelle `CLAUDE.md`, Regex ohne `\s*$`) **0 Mismatches** über
alle 6 `.claude/agents/bachelorprojekt-*.md` (vorher: 6, sowohl mit dem ursprünglich kaputten
AGENTS.md-Heading-Parser als auch mit einer korrekt lokalisierten, aber weiterhin auf `AGENTS.md`
zeigenden Fassung). Nach dem Fix meldet `bash scripts/health-goals-check.sh --only=G-AGENTIC02`
`0` statt `6` — kein `--fast`/Cluster-Zugriff nötig, rein dateibasiert, damit auch offline/in CI
reproduzierbar.

### Task 1.2 — G-DB09: `db_scalar()` um Rollen-Parameter erweitern (unmaskierter Query-Text)

**Root Cause:** `db_scalar()` (Anker Z99–107) verbindet immer als Rolle `website` (`psql -U website`).
Die G-DB09-Query (Z413) filtert `query NOT ILIKE 'CREATE INDEX%'`, um die bekannte einmalige
`CREATE INDEX chunks_embedding_hnsw …`-DDL (T002095/T001926, dokumentiert in
`.claude/lib/goals.md:65-73`) aus der Slow-Query-Zählung auszuschließen. Postgres maskiert
`pg_stat_statements.query` aber als `<insufficient privilege>` für Zeilen, deren
`pg_stat_statements.userid` (über `pg_roles` aufgelöst) nicht die verbindende Rolle ist — die
`CREATE INDEX`-Zeile wurde von der Rolle `postgres` ausgeführt (Cluster-Init/Migration), nicht von
`website`. Der maskierte Text kann `NOT ILIKE 'CREATE INDEX%'` nie matchen → die Query bleibt in der
Zählung → G-DB09 zeigt fälschlich `1` statt `0`.

**Fix — Option (b) aus der Root-Cause-Analyse (kleine, sichere Verbindungs-Anpassung statt
Text-Heuristik):** `db_scalar()` bekommt einen optionalen zweiten Parameter für die psql-Rolle
(Default: `website`, unverändertes Verhalten für alle bestehenden Aufrufer — G-DB01, G-DB03, G-DB06,
G-DB08, G-DB10, G-DB11, G-E2E02 bleiben exakt gleich). Nur der neue G-DB09-Aufruf übergibt
`postgres`: der `shared-db`-Pod hat `POSTGRES_USER`/`POSTGRES_PASSWORD` bereits als Container-Env
gesetzt (`k3d/shared-db.yaml`, Deployment-`env:`-Block) — `kubectl exec` erbt diese Env-Variablen im
exec'ten Prozess, es ist also **keine neue Secret-Referenz und kein DB-Grant/Migration** nötig, nur
eine Rollen-Umschaltung für genau diesen einen Messwert. Als Superuser ist `pg_stat_statements.query`
nie maskiert → der bestehende `NOT ILIKE 'CREATE INDEX%'`-Filter funktioniert wieder wie ursprünglich
beabsichtigt, ohne auf den maskierten Text angewiesen zu sein. Das behebt die ganze Klasse
Privilege-Masking-Probleme (jede zukünftige einmalige Slow Query einer privilegierten Rolle bleibt
korrekt sichtbar/messbar), nicht nur diesen einen Fall.

**Bewusst abgelehnte Alternative (Option a — Text-Heuristik):** `query = '<insufficient privilege>'
AND calls=1` als Ausschlusskriterium hätte KEINE DB-Verbindungsänderung gebraucht, aber jede
zukünftige einmalige Slow Query *irgendeiner* privilegierten Rolle stillschweigend mitausgeschlossen
— ein neuer, potenziell unbemerkter Messfehler derselben Art wie der, der hier behoben wird. Verworfen
zugunsten von Option (b), die das zugrundeliegende Masking-Problem statt eines Symptoms behebt.

**Anker Z99–107** — `db_scalar()` ersetzen:

```bash
db_scalar() { # $2=psql-Rolle (default website); "postgres" liest pg_stat_statements unmaskiert (G-DB09)
  [ "$FAST" = 1 ] && { echo "-"; return; }
  local pod; pod=$(_db_pod) || { echo "-"; return; }
  local role="${2:-website}" out
  if [ "$role" = postgres ]; then
    out=$(kubectl exec "$pod" -n "$DB_NS" --context "$DB_CTX" --request-timeout=15s -c postgres -- \
            bash -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d website -tAc "$1"' _ "$1" 2>/dev/null) || { echo "-"; return; }
  else
    out=$(kubectl exec "$pod" -n "$DB_NS" --context "$DB_CTX" --request-timeout=15s \
            -c postgres -- psql -U website -d website -tAc "$1" 2>/dev/null) || { echo "-"; return; }
  fi
  out=$(printf '%s' "$out" | tr -d '[:space:]')
  [[ "$out" =~ ^[0-9]+$ ]] && echo "$out" || echo "-"
}
```

Zeilenbilanz: alt 9 Zeilen → neu 14 Zeilen. **Netto +5 Zeilen.**

Die Query selbst (Anker Z413, `row target G-DB09 …`) bleibt SQL-seitig **unverändert** — nur der
Funktionsaufruf bekommt das zusätzliche `postgres`-Argument:

**Anker Z413** — ersetzen:

```bash
row target G-DB09 "$(db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'" postgres)" le 0 "Slow Queries in pg_stat_statements (mean_exec_time > 1s, exkl. Backup-COPY T001926 + einmalige CREATE INDEX-DDL T002095, unmaskiert via Superuser-Query T002148)"
```

(Zeilenneutral — nur die bestehende Zeile editiert, kein Zeilenzuwachs.)

**Residual-Risiko (explizit dokumentieren, kein Blocker):** Sollte der `shared-db`-Pod künftig ohne
`POSTGRES_PASSWORD`-Env laufen (z. B. bei einem Wechsel auf Peer-/Cert-Auth) oder `pg_hba.conf` den
lokalen Socket-Zugriff für `postgres` anders regeln, fällt `db_scalar … postgres` auf `SKIP` (`-`)
zurück statt hart zu failen (`kubectl exec` liefert non-zero → `|| { echo "-"; return; }` greift) —
G-DB09 würde dann als "nicht messbar" statt als falsch-grün/-rot angezeigt, kein stiller Fehlschluss.

### Task 1.3 — G-E2E01: nur `event=schedule`-Runs zählen

**Root Cause:** `e2e_success_rate()` (Anker Z174–183) ruft `gh run list --workflow e2e.yml --limit 14
--json conclusion` ohne Event-Filter auf — die letzten 14 Runs enthalten sowohl nächtliche
`schedule`-Runs als auch manuelle `workflow_dispatch`-Runs, von denen viele `cancelled` sind (kein
echter Testfehlschlag, sondern ein manueller Abbruch). Cancelled/dispatch-Runs verwässern die
Erfolgsrate nach unten, ohne dass die nächtliche E2E-Suite tatsächlich instabiler geworden ist.

**Fix:** `gh run list` serverseitig auf `--event schedule` filtern (`gh run list --help` bestätigt
das `-e, --event`-Flag: "Filter runs by which event triggered the run") — `workflow_dispatch`-Runs
tauchen dann gar nicht erst in der 14er-Stichprobe auf, keine Nachbearbeitung im Python-Teil nötig.

**Anker Z174** — Kommentar präzisieren (zeilenneutral, gleiche Zeile):

```bash
e2e_success_rate() { # G-E2E01 — %-Erfolgsrate der letzten 14 SCHEDULED e2e.yml-Läufe (workflow_dispatch ausgeschlossen, T002148)
```

**Anker Z177** — `gh run list`-Aufruf um `--event schedule` erweitern (zeilenneutral, gleiche Zeile):

```bash
  local out; out=$(gh run list --workflow e2e.yml --event schedule --limit 14 --json conclusion 2>/dev/null)
```

**Anker Z418** — Report-Beschreibung präzisieren (zeilenneutral, gleiche Zeile):

```bash
row target G-E2E01 "$(e2e_success_rate)" ge 90 "Nightly-E2E-Erfolgsrate e2e.yml (%, letzte 14 scheduled Läufe)"
```

Zeilenbilanz: 0 neue Zeilen — alle drei Edits ersetzen bestehende Zeilen 1:1.

<!-- vitest: kein neuer Test nötig, dieser Task ändert kein website/src-File. -->

## Abhängigkeiten & Reihenfolge

- P1 ist zur Compile-/Laufzeit unabhängig von P2–P5 (disjunkte Dateien: `.claude/skills/OVERVIEW.md`,
  `.claude/skills/gitops-repo-audit/SKILL.md`, `.claude/skills/dev-flow-plan/SKILL.md`,
  `.github/workflows/e2e.yml`) und kann parallel gestaged werden.
- Die drei Tasks (1.1/1.2/1.3) sind ihrerseits unabhängig voneinander (verschiedene Funktionen/
  Zeilenbereiche in derselben Datei) — Reihenfolge innerhalb des Partials ist beliebig, hier nach
  Zeilennummer im File sortiert (Task 1.1 vor 1.2 vor 1.3 wäre nach G-DB09-Row-Position eigentlich
  1.1/1.3/1.2; die Reihenfolge oben folgt stattdessen der Ticket-Aufzählung G-AGENTIC02→G-DB09→G-E2E01
  für leichtere Nachverfolgbarkeit gegen die proposal.md).
- P6 (Tests) hängt funktional von P1 ab (BATS-Assertions gegen `--only=G-AGENTIC02`,
  `--only=G-DB09`, `--only=G-E2E01`), ist aber nicht als `depends_on` im Manifest deklariert, da
  P1–P5 laut Partial-Konvention parallel stagebar sind und nur P6 (letzte Rolle `tests`) die
  Gesamt-Verifikation trägt.
- Kein Brand-Domain-Literal, kein neues Manifest/Skript (S3/S4 nicht berührt). Kein `website/src`-
  Code berührt (CQ02/Vitest-Pflicht entfällt, siehe HTML-Kommentar oben).
