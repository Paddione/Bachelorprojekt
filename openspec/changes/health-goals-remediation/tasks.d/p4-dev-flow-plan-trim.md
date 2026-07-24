# p4-dev-flow-plan-trim — `.claude/skills/dev-flow-plan/SKILL.md` unter 500 Zeilen (G-AGENTIC09)

Rolle: `impl`. Kein `depends_on` — `target_files` (`.claude/skills/dev-flow-plan/SKILL.md`) ist
disjunkt von p1 (`scripts/health-goals-check.sh`), p2 (`.claude/skills/OVERVIEW.md`), p3
(`.claude/skills/gitops-repo-audit/SKILL.md`) und p5 (`.github/workflows/e2e.yml`). **Kein**
`task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step (lebt in
`p6-tests`, das gegen REQ-HEALTH-GOALS-012 assertet). Jeder Task endet mit einem lokalen,
werkzeuglosen Struktur-Check (`wc -l`, `grep`), plus einer expliziten Vorher/Nachher-Zeilenrechnung.

`.claude/skills/dev-flow-plan/SKILL.md` ist aktuell **523 Zeilen** — 23 über dem in
`openspec/changes/health-goals-remediation/specs/health-goals.md` REQ-HEALTH-GOALS-012 fixierten
Limit (`<= 500`). Diese Datei war bereits zweimal auf diesem Ziel: T001904 (508→479, 2026-06-xx)
und zuletzt T002094/PR #3133 (526→so laut Proposal, seither wieder auf 523 gewachsen durch
kontinuierliche Schritt-Ergänzungen). Root-Cause laut `proposal.md`: neue Operativ-Blöcke werden
inline ergänzt statt nach `.claude/skills/dev-flow-plan/references/*.md` ausgelagert — genau das
Muster, das die SKILL.md selbst vorschreibt (`.claude/skills/dev-flow-plan/references/`
enthält bereits `plan-batch-status.md` als Präzedenzfall) und das dieser Task fortsetzt: **kein
inhaltlicher Cut**, nur Verschiebung + Pointer.

## Zeilenbudget (Health-Goal G-AGENTIC09 — REQ-HEALTH-GOALS-012, kein S1-Gate: `.md` ist keine
S1-Extension in `docs/code-quality/gates.yaml` → `scripts/plan-lint.sh` B1a/B1b scannen `.md`
grundsätzlich nicht, dieses Budget ist rein health-goal-getrieben)

| Datei | Ist vorher | Ist nachher |
| --- | --- | --- |
| `.claude/skills/dev-flow-plan/SKILL.md` | 523 | **478** |
| `.claude/skills/dev-flow-plan/references/deep-grilling.md` | — (neu) | 38 |
| `.claude/skills/dev-flow-plan/references/feature-ticket-fallback.md` | — (neu) | 37 |

Herleitung 523 → 478: Task 1/2 extrahieren Block A (Schritt −3 „Deep Grilling", Zeilen 23–41 = 19
Zeilen) auf 4 Zeilen (Header + 3-zeiliger Pointer) → **−15 Zeilen**. Task 3/4 extrahieren Block B
(Schritt 4.5 Feature-Pfad Ticket-Fallback-Bash, Zeilen 353–384 = 32 Zeilen) auf 2 Zeilen (1-zeiliger
Pointer über zwei Textzeilen umgebrochen) → **−30 Zeilen**. `523 − 15 − 30 = 478` (verifiziert per
Simulation gegen den Ist-Stand der Datei — siehe Task 5).

**Warum genau diese zwei Blöcke (least-frequently-needed, self-contained):**
- Block A ist per Überschrift selbst als **optional** markiert ("Schritt −3: Deep Grilling
  (optional)") — nur relevant, wenn der User vor dem Brainstorming eine vertiefte Q/A-Session
  braucht. Vollständig in sich geschlossen (Lavish-Board, Ticket-Anlage, Fallback, Attach,
  Q/A-Persistenz) — kein Bezug auf Variablen/Kontext außerhalb des Blocks selbst.
- Block B ist ein reiner **Fallback-Codepfad** ("Fallback (ticket-mcp nicht erreichbar)") — der
  MCP-first-Pfad direkt darüber (`mcp__ticket-mcp__create_ticket` / `stage_plan`) ist der
  Normalfall; der Bash-Block greift nur, wenn `ticket-mcp` down ist. Ebenfalls self-contained
  (kompletter `ticket.sh create`/`stage-plan`-Ablauf in einem Codeblock).
- Beide Blöcke werden **wortwörtlich** (byte-identisch) in die neue Referenzdatei verschoben —
  keine Umformulierung, kein Informationsverlust, nur eine kurze Kontext-Erstzeile ergänzt (analog
  zu `plan-batch-status.md`s Herkunfts-Notiz "Aus `dev-flow-plan` … extrahiert").
- Nicht angetastet: die C.2-Pipeline-Loop-, Race-Condition- und Plan-lint-Hard-Rules-Blöcke — die
  sind laut `proposal.md` und Health-Goal-Kontext die **häufig** gebrauchten Kernschritte jedes
  Plan-Laufs (T002074 Multi-Partial ist inzwischen der Regelfall, kein Rand-Pfad mehr) und werden
  bewusst NICHT verschoben, um die SKILL.md für den Normalfall lesbar zu halten.

**Anchor-Check (kein Bruch externer Referenzen):** `grep -rn "dev-flow-plan/SKILL.md#"` über das
gesamte Repo liefert **0 Treffer** — es existieren keine Fragment-Anchors (`#Schritt...`) auf diese
Datei von außen, nur plain-Datei-Links (`dev-flow-plan/SKILL.md` ohne `#`). Beide extrahierten
Blöcke liegen zudem NICHT unter einer eigenen Zwischenüberschrift, die anderswo verlinkt sein
könnte — Block A behält seine Überschrift `## Schritt −3: Deep Grilling (optional)` unverändert
(nur der Fließtext darunter wird ersetzt), Block B hat gar keine eigene Überschrift (reiner
Fließtext-Absatz innerhalb von Schritt 4.5). Keine Schritt-Nummerierung wird entfernt oder
verschoben.

---

## Task 1: `.claude/skills/dev-flow-plan/references/deep-grilling.md` (neu, 38 Zeilen)

Neue Referenzdatei mit dem **vollständigen, byte-identischen** Inhalt von Block A (aktuelle Zeilen
24–41 der SKILL.md, d.h. alles unterhalb der `## Schritt −3`-Überschrift bis unmittelbar vor
`## Schritt −2: Main-Branch sync (Pull-First)`), plus einer kurzen Herkunfts-/Kontext-Kopfzeile
nach dem Muster von `.claude/skills/dev-flow-plan/references/plan-batch-status.md`.

- [ ] Verzeichnis `.claude/skills/dev-flow-plan/references/` existiert bereits (enthält
      `plan-batch-status.md`) — keine neue Verzeichnisanlage nötig.
- [ ] Datei `.claude/skills/dev-flow-plan/references/deep-grilling.md` neu anlegen mit exakt
      folgendem Inhalt:

````markdown
# Deep Grilling — optionale Vertiefungs-Session (dev-flow-plan Feature-Pfad Schritt −3)

Aus `dev-flow-plan` Feature-Pfad Schritt −3 ausgelagert (G-AGENTIC09 SKILL.md-Zeilenbudget-Trim,
T002148). Nur relevant, wenn der User vor dem Brainstorming eine strukturierte Vertiefungs-Session
braucht — der Kurz-Pointer in der SKILL.md selbst reicht für den Normalfall.

Wenn das Feature komplex oder unklar ist, frage den User nach einer Grilling-Session (siehe
[dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md)
für den Fragenkatalog).

**Nutze `lavish` für die Q/A-Session:** Erstelle `.lavish/<slug>-grilling.html` mit den Fragen als
interaktivem Formular (Input-Playbook), öffne es mit `npx -y lavish-axi .lavish/<slug>-grilling.html`
und poll auf Antworten. So kann der User strukturiert antworten, annotieren und Feedback geben.

Falls durchgeführt, erstelle das Grilling-Ticket — **MCP-first** (`ticket-mcp`; Rückgabe-Parsing
`external_id|uuid`: siehe
[MCP-Tool-Guide](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md)
§ticket-mcp).
> `mcp__ticket-mcp__create_ticket({ type: "task", brand: "mentolder", title: "Grilling: <kurzer-titel>", priority: "mittel", description: "FUNKTIONALE ANFORDERUNGEN:\n<requirements>\n\nASSETS ZU BESCHAFFEN:\n<assets-todo>" })`

Setze `GRILLING_TICKET_EXT_ID` (Feld 1) und `GRILLING_TICKET_UUID` (Feld 2) aus der Rückgabe.

Fallback (ticket-mcp nicht erreichbar):
```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "Grilling: <kurzer-titel>" \
  --priority mittel \
  --description "FUNKTIONALE ANFORDERUNGEN:"$'\n'"$GRILLING_REQUIREMENTS"$'\n\n'"ASSETS ZU BESCHAFFEN:"$'\n'"$GRILLING_ASSETS_TODO")
export GRILLING_TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
export GRILLING_TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```
Hänge Dateien mit `bash scripts/ticket-attach.sh "$GRILLING_TICKET_UUID" <pfade>` an.

> **Strukturierte Q/A persistieren:** Nach dem Deep-Grilling die Antworten zusätzlich ans Ticket
> senden — `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …` (akkumulierend, erscheint
> später im T000737-Panel). Siehe `.claude/skills/references/grilling-to-ticket.md`.
````

**Verify:**

```bash
wc -l .claude/skills/dev-flow-plan/references/deep-grilling.md
# erwartet: 38 .claude/skills/dev-flow-plan/references/deep-grilling.md

grep -q 'lavish-axi .lavish/<slug>-grilling.html' .claude/skills/dev-flow-plan/references/deep-grilling.md \
  && grep -q 'GRILLING_TICKET_EXT_ID' .claude/skills/dev-flow-plan/references/deep-grilling.md \
  && grep -q 'grilling-to-ticket.md' .claude/skills/dev-flow-plan/references/deep-grilling.md \
  && echo "deep-grilling.md: vollständiger Block A-Inhalt vorhanden"
# erwartet: deep-grilling.md: vollständiger Block A-Inhalt vorhanden
```

---

## Task 2: `.claude/skills/dev-flow-plan/SKILL.md` (edit) — Block A durch Pointer ersetzen

Ersetzt den Fließtext unter `## Schritt −3: Deep Grilling (optional)` (aktuelle Zeilen 24–41,
18 Zeilen) durch einen 3-zeiligen Pointer auf die neue Referenzdatei aus Task 1. Die Überschrift
selbst (Zeile 23) bleibt **unverändert** — keine Schritt-Nummerierung geht verloren.

- [ ] In `.claude/skills/dev-flow-plan/SKILL.md`: den Block unmittelbar nach der Überschrift
      `## Schritt −3: Deep Grilling (optional)` bis (exklusive) der nächsten Überschrift
      `## Schritt −2: Main-Branch sync (Pull-First)` ersetzen. Exakter Such-/Ersatz-Textblock
      (old_string enthält die Überschrift zur eindeutigen Verankerung, sie bleibt im new_string
      identisch erhalten):

Alt (alle 19 Zeilen inkl. Überschrift, exakt so im Repo vorhanden — eindeutiger Anker):
````
## Schritt −3: Deep Grilling (optional)
Wenn das Feature komplex oder unklar ist, frage den User nach einer Grilling-Session (siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für den Fragenkatalog).
**Nutze `lavish` für die Q/A-Session:** Erstelle `.lavish/<slug>-grilling.html` mit den Fragen als interaktivem Formular (Input-Playbook), öffne es mit `npx -y lavish-axi .lavish/<slug>-grilling.html` und poll auf Antworten. So kann der User strukturiert antworten, annotieren und Feedback geben.
Falls durchgeführt, erstelle das Grilling-Ticket — **MCP-first** (`ticket-mcp`; Rückgabe-Parsing `external_id|uuid`: siehe [MCP-Tool-Guide](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §ticket-mcp).
> `mcp__ticket-mcp__create_ticket({ type: "task", brand: "mentolder", title: "Grilling: <kurzer-titel>", priority: "mittel", description: "FUNKTIONALE ANFORDERUNGEN:\n<requirements>\n\nASSETS ZU BESCHAFFEN:\n<assets-todo>" })`
Setze `GRILLING_TICKET_EXT_ID` (Feld 1) und `GRILLING_TICKET_UUID` (Feld 2) aus der Rückgabe.
Fallback (ticket-mcp nicht erreichbar):
```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "Grilling: <kurzer-titel>" \
  --priority mittel \
  --description "FUNKTIONALE ANFORDERUNGEN:"$'\n'"$GRILLING_REQUIREMENTS"$'\n\n'"ASSETS ZU BESCHAFFEN:"$'\n'"$GRILLING_ASSETS_TODO")
export GRILLING_TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
export GRILLING_TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```
Hänge Dateien mit `bash scripts/ticket-attach.sh "$GRILLING_TICKET_UUID" <pfade>` an.
> **Strukturierte Q/A persistieren:** Nach dem Deep-Grilling die Antworten zusätzlich ans Ticket senden — `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …` (akkumulierend, erscheint später im T000737-Panel). Siehe `.claude/skills/references/grilling-to-ticket.md`.
````

Neu (4 Zeilen inkl. Überschrift):
```
## Schritt −3: Deep Grilling (optional)
Wenn das Feature komplex oder unklar ist, biete dem User eine Deep-Grilling-Session an —
vollständiger Ablauf (Lavish-Formular, Grilling-Ticket-Anlage MCP-first/Fallback, strukturierte
Q/A-Persistierung): [dev-flow-plan-deep-grilling](file:///home/patrick/Bachelorprojekt/.claude/skills/dev-flow-plan/references/deep-grilling.md).
```

- [ ] Nach dem Edit: die Überschrift `## Schritt −3: Deep Grilling (optional)` ist unverändert an
      derselben Stelle vorhanden, die nächste Überschrift `## Schritt −2: Main-Branch sync
      (Pull-First)` folgt unmittelbar danach (kein Leerraum-Drift, keine verwaisten Zeilen).

**Verify:**

```bash
grep -n '^## Schritt −3: Deep Grilling (optional)$' .claude/skills/dev-flow-plan/SKILL.md
# erwartet: 1 Treffer (Überschrift unverändert vorhanden)

grep -c 'GRILLING_TICKET_EXT_ID' .claude/skills/dev-flow-plan/SKILL.md
# erwartet: 0 (kompletter Fallback-Code jetzt nur noch in der Referenzdatei aus Task 1)

grep -q 'references/deep-grilling.md' .claude/skills/dev-flow-plan/SKILL.md \
  && echo "Pointer auf deep-grilling.md gesetzt"
# erwartet: Pointer auf deep-grilling.md gesetzt
```

---

## Task 3: `.claude/skills/dev-flow-plan/references/feature-ticket-fallback.md` (neu, 37 Zeilen)

Neue Referenzdatei mit dem **vollständigen, byte-identischen** Inhalt von Block B (Feature-Pfad
Schritt 4.5, der `ticket-mcp`-Fallback-Bash-Block inkl. der einleitenden Zeile
`Fallback (ticket-mcp nicht erreichbar):`), plus derselben Herkunfts-Kopfzeilen-Konvention wie
Task 1.

- [ ] Datei `.claude/skills/dev-flow-plan/references/feature-ticket-fallback.md` neu anlegen mit
      exakt folgendem Inhalt:

````markdown
# Feature-Pfad — Ticket-Anlage Fallback (dev-flow-plan Schritt 4.5, ticket-mcp nicht erreichbar)

Aus `dev-flow-plan` Feature-Pfad Schritt 4.5 ausgelagert (G-AGENTIC09 SKILL.md-Zeilenbudget-Trim,
T002148). Der MCP-first-Pfad (`mcp__ticket-mcp__create_ticket` / `mcp__ticket-mcp__stage_plan`)
bleibt SSOT in der SKILL.md selbst — dieser Block greift nur, wenn `ticket-mcp` nicht erreichbar ist.

```bash
# Falls TICKET_EXT_ID bereits gesetzt ist (von feature-intake oder User-Input),
# wiederverwenden — kein neues Ticket erstellen.
if [[ -z "${TICKET_EXT_ID:-}" ]]; then
  # Kein bestehendes Ticket — neues erstellen
  GRILLING_REF=""
  if [[ -n "${GRILLING_TICKET_EXT_ID:-}" ]]; then
    GRILLING_REF=$'\n'"Grilling-Ticket: ${GRILLING_TICKET_EXT_ID}"
  fi

  TICKET_RESULT=$(./scripts/ticket.sh create \
    --type task \
    --brand mentolder \
    --title "Plan: <slug>" \
    --priority mittel \
    --description "Branch: feature/<slug>"$'\n'"Plan: openspec/changes/<slug>/tasks.md"$'\n'"Spec: openspec/changes/<slug>/design.md"$GRILLING_REF)

  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
  TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
else
  # Bestehendes Ticket wiederverwenden — UUID für Attachments holen
  TICKET_UUID=$(./scripts/ticket.sh get --id "$TICKET_EXT_ID" | jq -r '.id')
  echo "✅ Wiederverwende bestehendes Ticket $TICKET_EXT_ID"
fi

# Plan stagen: Branch + Plan-Pfad im Ticket verankern (Single Source of Truth für dev-flow-execute).
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "openspec/changes/<slug>/tasks.md"
```
````

**Verify:**

```bash
wc -l .claude/skills/dev-flow-plan/references/feature-ticket-fallback.md
# erwartet: 37 .claude/skills/dev-flow-plan/references/feature-ticket-fallback.md

grep -q 'TICKET_RESULT=\$(./scripts/ticket.sh create' .claude/skills/dev-flow-plan/references/feature-ticket-fallback.md \
  && grep -q 'stage-plan' .claude/skills/dev-flow-plan/references/feature-ticket-fallback.md \
  && echo "feature-ticket-fallback.md: vollständiger Block B-Inhalt vorhanden"
# erwartet: feature-ticket-fallback.md: vollständiger Block B-Inhalt vorhanden
```

---

## Task 4: `.claude/skills/dev-flow-plan/SKILL.md` (edit) — Block B durch Pointer ersetzen

Ersetzt den kompletten Fallback-Block in Schritt 4.5 (Feature-Pfad, aktuelle Zeilen 353–384 — die
Zeile `Fallback (ticket-mcp nicht erreichbar):` plus den vollständigen ` ```bash … ``` `-Codeblock)
durch einen 2-zeiligen Pointer auf die neue Referenzdatei aus Task 3. Läuft **nach** Task 2 (die
Zeilennummern in dieser Beschreibung beziehen sich auf den Ist-Stand VOR Task 2s Edit; da alte/neue
Textblöcke als alt→neu-Anker statt roher Zeilennummern verwendet werden, ist die Reihenfolge
Task 2 → Task 4 unkritisch für die Korrektheit des Edits selbst).

- [ ] In `.claude/skills/dev-flow-plan/SKILL.md`: den Block direkt nach dem Satz
      `Zeile \`indexed slug='<slug>'\`.)` (Ende des Embedding-Index-Absatzes) und vor
      `Hänge gesammelte Assets mit …` ersetzen. Exakter Such-/Ersatz-Textblock:

Alt (32 Zeilen, exakt so im Repo vorhanden — als Ganzes eindeutiger Anker trotz der Zeile
`Fallback (ticket-mcp nicht erreichbar):`, die als Einzeiler an zwei weiteren Stellen im Fix-Pfad
wiederkehrt; der komplette Block mit `--title "Plan: <slug>"` / `--branch "feature/<slug>"` ist
jedoch einmalig):
````
Fallback (ticket-mcp nicht erreichbar):
```bash
# Falls TICKET_EXT_ID bereits gesetzt ist (von feature-intake oder User-Input),
# wiederverwenden — kein neues Ticket erstellen.
if [[ -z "${TICKET_EXT_ID:-}" ]]; then
  # Kein bestehendes Ticket — neues erstellen
  GRILLING_REF=""
  if [[ -n "${GRILLING_TICKET_EXT_ID:-}" ]]; then
    GRILLING_REF=$'\n'"Grilling-Ticket: ${GRILLING_TICKET_EXT_ID}"
  fi

  TICKET_RESULT=$(./scripts/ticket.sh create \
    --type task \
    --brand mentolder \
    --title "Plan: <slug>" \
    --priority mittel \
    --description "Branch: feature/<slug>"$'\n'"Plan: openspec/changes/<slug>/tasks.md"$'\n'"Spec: openspec/changes/<slug>/design.md"$GRILLING_REF)

  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
  TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
else
  # Bestehendes Ticket wiederverwenden — UUID für Attachments holen
  TICKET_UUID=$(./scripts/ticket.sh get --id "$TICKET_EXT_ID" | jq -r '.id')
  echo "✅ Wiederverwende bestehendes Ticket $TICKET_EXT_ID"
fi

# Plan stagen: Branch + Plan-Pfad im Ticket verankern (Single Source of Truth für dev-flow-execute).
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "openspec/changes/<slug>/tasks.md"
```
````

Neu (2 Zeilen):
```
Fallback (ticket-mcp nicht erreichbar) — vollständiges Bash-Skript (Ticket-Wiederverwendung inkl.
Plan-Stage): [dev-flow-plan-feature-ticket-fallback](file:///home/patrick/Bachelorprojekt/.claude/skills/dev-flow-plan/references/feature-ticket-fallback.md).
```

- [ ] Nach dem Edit: der Satz `Hänge gesammelte Assets mit …` folgt unmittelbar auf den neuen
      2-zeiligen Pointer (kein Leerraum-Drift), der Rest von Schritt 4.5 (Ticket-Claim-Nachholung
      etc.) bleibt unangetastet.

**Verify:**

```bash
grep -q "Hänge gesammelte Assets mit" .claude/skills/dev-flow-plan/SKILL.md \
  && grep -q 'references/feature-ticket-fallback.md' .claude/skills/dev-flow-plan/SKILL.md \
  && echo "Pointer auf feature-ticket-fallback.md gesetzt, Folgezeile intakt"
# erwartet: Pointer auf feature-ticket-fallback.md gesetzt, Folgezeile intakt

grep -c '\-\-title "Plan: <slug>"' .claude/skills/dev-flow-plan/SKILL.md
# erwartet: 0 (kompletter Fallback-Code jetzt nur noch in der Referenzdatei aus Task 3)
```

---

## Task 5: Gesamt-Zeilenbudget + Anchor-Integrität (Abschluss-Check für dieses Partial)

Kein neuer Production-Code — reiner Nachweis, dass Task 1–4 zusammen REQ-HEALTH-GOALS-012 erfüllen
und keine externe Referenz auf diese Datei bricht.

- [ ] `.claude/skills/dev-flow-plan/SKILL.md` ist nach Task 2 + Task 4 auf **478 Zeilen** (≤ 500,
      Marge 22 Zeilen — vergleichbar mit `dev-flow-execute/SKILL.md` bei 485 Zeilen).
- [ ] Alle Schritt-Überschriften (`## Schritt …`, `### Schritt …`, `#### Schritt …`) sind exakt in
      derselben Reihenfolge und mit denselben Nummern vorhanden wie vor dem Edit (keine entfernt,
      keine umnummeriert).
- [ ] Beide neuen Pointer-Links (`references/deep-grilling.md`,
      `references/feature-ticket-fallback.md`) lösen auf existierende Dateien auf.

**Verify:**

```bash
LINES=$(wc -l < .claude/skills/dev-flow-plan/SKILL.md)
echo "SKILL.md: $LINES Zeilen"
[ "$LINES" -le 500 ] && echo "REQ-HEALTH-GOALS-012: PASS ($LINES <= 500)" || { echo "REQ-HEALTH-GOALS-012: FAIL"; exit 1; }
# erwartet: SKILL.md: 478 Zeilen
# erwartet: REQ-HEALTH-GOALS-012: PASS (478 <= 500)

# Schritt-Überschriften vor/nach vergleichen (Anzahl + Wortlaut müssen identisch bleiben).
grep -cE '^#{2,4} +Schritt' .claude/skills/dev-flow-plan/SKILL.md
# erwartet: identische Anzahl wie im Ist-Stand vor diesem Partial (unverändert durch reine
# Fließtext-Ersetzung innerhalb bestehender Schritt-Abschnitte)

for f in deep-grilling.md feature-ticket-fallback.md; do
  [ -f ".claude/skills/dev-flow-plan/references/$f" ] || { echo "MISSING: $f"; exit 1; }
done
echo "beide Referenzdateien vorhanden"
# erwartet: beide Referenzdateien vorhanden

# Kein externer Fragment-Anchor-Bruch (bereits vor diesem Partial mit 0 Treffern verifiziert —
# Wiederholung als Regressionsschutz):
! grep -rn "dev-flow-plan/SKILL.md#" --include='*.md' --include='*.sh' --include='*.mjs' . \
  | grep -v '^\./.claude/skills/dev-flow-plan/SKILL.md' \
  && echo "keine Fragment-Anchors auf dev-flow-plan/SKILL.md im Repo — Umbau bricht nichts"
# erwartet: keine Fragment-Anchors auf dev-flow-plan/SKILL.md im Repo — Umbau bricht nichts
```
