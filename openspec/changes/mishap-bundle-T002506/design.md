# Design: mishap-bundle-T002506

## M2 — agent-lock check-merged false positive

### Fehleranalyse
`scripts/agent-lock-merged.sh:38` führt `git log origin/main --oneline --grep="$ticket_id"` aus.
`--grep` durchsucht den gesamten Commit-Message-Body, nicht nur den Betreff. Ein Commit, der
einen anderen Ticket-Fix enthält und im Fließtext `[[T002494]]` als Wiki-Link referenziert
(`goals.md`-Änderung), matcht die ID. Der zweite Scan (Zeile 47, `--all-match`) durchsucht
ebenfalls den Body und erzeugt dasselbe false positive.

**Exit-Code 1** löst in dev-flow-plan den Pfad "auf main schon gefixt → Ticket done, abbrechen" aus.

### Fix
1. `git log`-Aufruf (Zeile 38) auf den COMMIT-SUBJECT beschränken. `--grep` kennt keinen
   Subject-Only-Modus, aber das Muster kann eingeschränkt werden:
   `"[${ticket_id}]"` — die PR-Commit-Konvention (Conventional Commits mit Ticket-Tag am Ende).
   Dieses Pattern matcht ausschließlich Commits, die das Ticket TATSÄCHLICH gefixt haben.
2. Body-Scan (Zeilen 45–52) ersatzlos streichen — derselbe Defekt, selber Fix.
3. `--format="%H %s"` → `--format="%h %s"` (bzgl. Zeilenlänge, kosmetisch).

Die Meldung soll bei Match die Fundstelle anzeigen: "Commit-Betreff" vs. "Body" — dies ist durch
die Pattern-Einschränkung automatisch gegeben, da Body-Matches nicht mehr möglich sind.

### Dateien
- `scripts/agent-lock-merged.sh`

---

## M7 — post-merge-deploy --merges vs. Squash-Merge

### Fehleranalyse
`scripts/devflow-post-merge-deploy.sh:14`: `git log origin/main --merges -1`. Das `--merges`-Flag
liefert nur Commits mit ≥2 Parents. Alle PRs werden jedoch per **squash-and-merge** (Development
Rule 3, CLAUDE.md) gemergt — ein Squash-Merge-Commit hat genau **einen** Parent. Das Skript
findet deshalb nie einen "Merge-Commit", scheitert mit `rc=3` (`FEHLER: Kein Merge-Commit fuer
Ticket X auf origin/main gefunden`).

### Fix
`--merges` ersatzlos streichen. Der `--grep="\\[${TICKET_ID}\\]"`-Match (Zeile 14) identifiziert
den Squash-Commit bereits eindeutig. `-1` begrenzt auf den jüngsten Treffer (Merge ist immer
der jüngste Commit mit dieser Ticket-ID).

**Nicht Teil dieses Fixes:** Eltern-Zahl-Prüfung — ein zukünftiger realer Merge-Commit (mit 2
Parents) würde vom identischen `--grep` gefunden; der Fix bricht dafür nichts.

### Dateien
- `scripts/devflow-post-merge-deploy.sh`

---

## M3 — agent-collision false-positive COLLISION Warnung

### Fehleranalyse
`scripts/agent-collision.sh`, `--branch`-Modus: Die COLLISION-Warnung meldet neu angelegte
Dateien (die per `git diff --name-only origin/main...HEAD` in `own` gelistet sind) als Kollision
mit einem fremden Worktree, obwohl:
1. Die Datei im fremden Worktree gar nicht existiert (brandneue Datei, nie committed im Peer)
2. Der zitierte Lock auf einen ANDEREN Worktree verweist als der in der Warnung genannte

Der bestehende Guard (Zeile 127: `[ ! -f "$wt/$file" ] && ! git -C "$wt" ls-files`) prüft auf
Existenz, scheint aber in bestimmten Konstellationen zu versagen — vermutlich wenn der Lock
einen stale Worktree-Pfad speichert und der tatsächliche Peer-Worktree nicht korrekt aufgelöst
wird. Der zweite Teil (Lock↔Worktree-Mismatch) deutet auf einen Defekt in der Lock-Metadaten-
Zuordnung hin.

### Fix
1. **Existenz-Check härten** (Zeile 127): `[ ! -f "$wt/$file" ]` → `[ ! -e "$wt/$file" ]` und
   zusätzlich prüfen, ob die Datei im Peer-Worktree tatsächlich von `git status --porcelain` als
   modified/added/untracked gemeldet wird. Nur wenn die Datei im Peer-Worktree REAL dirty ist,
   eine COLLISION melden.
2. **Lock↔Worktree-Zuordnung validieren:** Vor der Iteration über Peer-Locks prüfen, ob der
   Worktree-Pfad aus dem Lock tatsächlich der IST-Zustand des Locks ist (z. B. via
   `git -C "$wt" rev-parse --show-toplevel` und Vergleich mit dem Lock-Pfad).

### Dateien
- `scripts/agent-collision.sh`

---

## M6 — plan-lint W3/G1 H3-Tolerant machen

### Fehleranalyse
`scripts/plan-lint.sh:387-429` (W3 + G1). Beide Check nutzen die Abschnittsgrenze
`/^##[[:space:]]/`, die `## <Text>` (H2) erkennt, aber `### <Text>` (H3) verfehlt — weil
`### ` mit `##` beginnt, dann aber `#` statt Whitespace folgt.

**W3 (File Structure Cross-Check):**
- Zeile 393: Extraktion der File-Structure-Section (von `## File Structure` bis nächstem H2) →
  CORRECT (H3-Sub-Groupings wie `### New files` bleiben Teil der Section)
- Zeile 394: Extraktion des RESTLICHEN Plans (alles AUSSERHALB File Structure). Die Grenze
  `f&&/^##[[:space:]]/{infs=0}` feuert auf das NÄCHSTE H2 — aber wenn Tasks unter `### Task N`
  stehen und KEIN `## Tasks`-Abschnitt davor existiert, bleibt infs=1, und ALLE Task-Inhalte
  werden als "noch innerhalb File Structure" ausgeblendet. W3 findet KEINE Dateireferenzen in
  den Tasks → false negative (keine Warnung, aber auch keine Validierung).

**G1 (Granularity Warning):**
- Zeile 426: `/^#+[[:space:]]+Task /` matcht bereits `### Task ` — G1 funktioniert für H3.
  Allerdings wird G1 erst aktiv, NACHDEM das erste Task-Heading erkannt wurde (`started==1`).
  Wenn das erste Task-Heading H3 ist und der `## File Structure`-Block davor ohne `## `-H2
  Grenze abschließt, zählt G1 die File-Structure-Dateien mit → falsch hohe Dateianzahl.

**Da G1 bereits `#+` verwendet, funktioniert es prinzipiell — der Restfehler liegt im
Zusammenspiel mit dem W3-Bug (File-Structure-Dateien werden in G1 mitgezählt).**

### Fix
Die Grenze `f&&/^##[[:space:]]/{infs=0}` in Zeile 394 so ändern, dass sie NUR H2-NICHT-H3
matcht, NICHT aber `### Task`-Headings innerhalb von File Structure (`### New files` usw.) als
falsche Grenze erkennt. Lösung: `f&&/^##[[:space:]]/ && !/^###[[:space:]]+New |^###[[:space:]]+Changed |^###[[:space:]]+Renamed/{infs=0}`.
Oder einfacher: die Exit-Grenze an `/^##[[:space:]]Task /` binden — explizit "H2 Task-Heading",
weil `### Task` bereits keine H2 ist und die Grenze nicht feuert.

Besser: **Grenze auf `^##[[:space:]]` (H2) belassen, aber H3-Task-Heading als zusätzlichen
Trigger für infs=0 hinzufügen.** Das bedeutet: sowohl `## Task` (H2) als auch `### Task` (H3)
beenden die File-Structure-Region. Das ist korrekt, weil `### New files` / `### Changed files`
Innerhalb der File Structure mit `### ` beginnen und ebenfalls matcht würden — aber sie sind
VOR dem ersten Task-Heading. Mit einem Flag (`seen_first_task=1`) lässt sich unterscheiden.

Einfachste Lösung per Mishap: **awk-Grenze auf `/^#{2,3}[[:space:]]/` ändern** sofern sie nach
dem File-Structure-Block liegt. H3-Heading `### New files` liegt INNERHALB des File-Structure-
Blocks und wird von der ENTER-Grenze (`/^##[[:space:]]+File Structure/`) gestartet → korrekt
eingeschlossen. Die EXIT-Grenze feuert beim ersten H2 ODER H3 AUSSERHALB.

Alternativ (empfohlen, geringstes Risiko): **`## Task`-Heading als explizite Grenze setzen.**
Der awk-Code ändert sich von:
```awk
f&&/^##[[:space:]]/{infs=0}
```
zu:
```awk
f&&/^##[[:space:]]Task /{infs=0}
```
Das beendet die File-Structure-Region am ersten H2, der mit `## Task...` beginnt. Wenn kein
`## Task`-Heading existiert (nur `### Task`), feuert die Grenze nicht — dann muss eine zweite
Klausel hinzu:
```awk
f&&/^###[[:space:]]+Task [0-9]/{infs=0}
```

### Dateien
- `scripts/plan-lint.sh`

---

## M1 — Divergence-Guard-Dokumentation für Hauptcheckout

### Fehleranalyse
`.opencode/skills/opencode-flow-execute/SKILL.md:60` empfiehlt pauschal:
`(cd "$MAIN_REPO" && git fetch origin main:main)` — das funktioniert nur, wenn main NICHT im
Hauptcheckout ausgecheckt ist. Bei ausgechecktem main (Normalfall für `$MAIN_REPO`) gibt git
`fatal: refusing to fetch into branch checked out at ...` (rc=128).

### Fix
Fallunterscheidung bei der Main-Sync-Anweisung ergänzen:
```bash
# Im Worktree (main nicht ausgecheckt):
(cd "$MAIN_REPO" && git fetch origin main:main)

# Im Hauptcheckout (main ausgecheckt):
(cd "$MAIN_REPO" && git pull --ff-only origin main)
```

### Dateien
- `.opencode/skills/opencode-flow-execute/SKILL.md`

---

## M4 — gitleaks-Setup dokumentieren

### Fehleranalyse
Der lokale Pre-Commit-Secret-Scan wird stillschweigend übersprungen, weil `gitleaks` auf der
Entwicklungsmaschine nicht installiert ist. Die Meldung des Hooks ist korrekt, aber die Lücke
ist nicht als bewusste Umgebungs-Entscheidung dokumentiert.

### Fix
In die Entwicklungs-Setup-Dokumentation (`CLAUDE.md` oder `CLAUDE.local.md`) einen Hinweis
aufnehmen, dass `gitleaks` installiert sein sollte (`apt install gitleaks`), und dass der
Secret-Scan ohne es nur in CI fail-closed läuft.

### Dateien
- `CLAUDE.md` (Abschnitt "Critical Footguns" oder neuer "Entwicklungs-Setup"-Abschnitt)

---

## M10 — Ticket-Closure: Deliverable-Check

### Fehleranalyse
T002459 wurde auf done/shipped gesetzt, bevor das P5.5-Deliverable auf main existierte. Die
Merge=closure-Regel (T001092) greift nur bei automatischem Merge — bei manuellem done/shipped
fehlt eine Deliverable-Prüfung.

### Fix
In der Closure-Konvention (CLAUDE.md Rule 7 oder dem dev-flow) einen Schritt ergänzen: Vor
`done` prüfen, ob die im Plan deklarierten Deliverables tatsächlich auf main sind. Empfehlung
als redaktioneller Hinweis (kein automatisierter Guard).

### Dateien
- `CLAUDE.md` (Abschnitt "Workflow Rules" oder "Merge = closure")
