# Proposal: openspec-embed-collection-T002870

## Why

**Symptom (Fakt, wiederholt beobachtet 2026-08-09, siehe T002870/T002877):** Der post-commit-Hook
`openspec-embed` meldet bei praktisch jedem Commit auf einen OpenSpec-Change-Ordner:

```
[openspec-embed] WARN: completeness gate — collection has 4 docs but 55 local active plans (status=planning|plan_staged|active)
```

und später (T002877, gleicher Mechanismus):

```
[openspec-embed] WARN: completeness gate — collection has 12 docs but 57 local active plans
```

Die Warnung erscheint, bricht aber nichts ab — sie geht im Commit-Rauschen unter.

**Ursache (verifiziert, nicht vermutet — Messung siehe Ticket-Kommentar T002870 vom 2026-08-09T11:30):**
`scripts/openspec-embed-local.sh` startet einen eigenen `kubectl --context fleet port-forward
svc/shared-db 15432:5432`, um an die produktive `knowledge.chunks`-Collection zu schreiben. Port
15432 ist auf der Entwicklungsmaschine jedoch dauerhaft von einem verwaisten
`kubectl --context k3d-mentolder-dev port-forward svc/shared-db 15432:5432` belegt (Alltags-
Portforward für lokale DB-Arbeit). Startet `openspec-embed-local.sh` seinen eigenen Forward auf
demselben Port, bindet der neue `kubectl`-Prozess nicht — der alte Forward bleibt der tatsächliche
Listener. Das Skript prüft danach nur per TCP-Connect-Probe (`exec 3<>/dev/tcp/127.0.0.1/$PORT`),
ob **irgendetwas** auf dem Port lauscht — nicht, ob es der selbst gestartete Forward ist. Der
nachfolgende Traffic geht folglich an die **falsche Datenbank** (k3d-Dev-Cluster statt Fleet).

Direkter Vergleich derselben Collection `specs_plans` (2026-08-09):

| Zugang | Dokumente |
|---|---|
| Port 15432 (kollidierender k3d-mentolder-dev-Forward) | 17 |
| echter Fleet-Forward (Port 5432) | 188 |
| lokale aktive Pläne (`node scripts/openspec-embed.mjs --check-coverage`) | 62 |

Das erklärt vollständig, warum die Collection systematisch nur einen Bruchteil der aktiven Pläne
enthält (T002870: 4 statt 55, T002877: 12 statt 57 — beide Beobachtungen desselben Fehlers zu
unterschiedlichen Zeitpunkten).

**Warum die Warnung folgenlos bleibt:** `embedSlug()` in `scripts/openspec-embed.mjs` loggt die
Completeness-Gate-WARN nur über `log()`. `main()` beendet unabhängig vom Ergebnis immer mit
`process.exit(0)` (bewusst best-effort). `scripts/openspec-embed-local.sh` wertet den Node-Exit-
Code ohnehin nicht aus (`... || true`); es prüft nur, ob die Ausgabe die Zeichenkette
`indexed slug='` enthält — und die erscheint auch, wenn das Completeness-Gate parallel eine WARN
ausgibt. `.githooks/post-commit-embed` behandelt jeden Nicht-Null-Exit des Wrappers zusätzlich als
nicht-fatales `echo`. Der einzige Aufrufer mit realer Wirkung bei `exit 1` ist der
`dev-flow-plan`-Schritt C.4 (`bash scripts/openspec-embed-local.sh <slug> ...` — kein `|| true`).
Dieser Aufruf ist der Hebel für eine wirksame Eskalation.

**Folge:** Die semantische Suche über OpenSpec-Changes (`factory-mcp openspec_find_similar`)
arbeitet dauerhaft auf einem Bruchteil des Bestands. Wer sie vor einem neuen Proposal zur
Duplikatsuche nutzt, bekommt falsche Negative — ein leeres/dünnes Ergebnis sieht aus wie „nichts
Ähnliches vorhanden", obwohl der Bestand nur nicht indiziert ist.

**Zusatzbefund (eigenständige Kostenquelle, gehört zum selben Fix-Paket):** `.githooks/post-commit-embed`
läuft synchron bei **jedem** Commit (~2 Minuten pro Aufruf, gemessen) und blockiert dadurch
`git rebase` vollständig — ein Rebase über 17 replayte Commits dauerte deshalb ~35 Minuten,
komplett wirkungslos, weil derselbe Portkonflikt jeden dieser Läufe in die falsche DB schrieb. Der
Hook darf während eines laufenden Rebase nicht feuern; einmal am Ende (regulärer Folge-Commit)
reicht.

**Drittes Muster (Bestätigung, nicht Teil des Fixes hier):** Bei einem unabhängigen Ticket
(T002809, Embedding-Backend-Probe auf Port :8081) versagte dieselbe *Klasse* von Probe —
Erreichbarkeits-Check statt Identitätsprüfung der Gegenstelle — nach demselben Muster. Dieses
Proposal behebt die Instanz für den DB-Port-Forward (15432); die Anforderung „Probe muss Identität
verifizieren, nicht nur Erreichbarkeit" wird hier als Prinzip für `openspec-embed-local.sh`
umgesetzt.

## What

1. **Identitätsprüfung des Port-Forwards** (`scripts/openspec-embed-local.sh`): Nach dem Start
   des eigenen `kubectl port-forward` (PID `$PF_PID`) wird verifiziert, dass der Prozess, der
   tatsächlich auf `127.0.0.1:$PF_PORT` lauscht, `$PF_PID` ist (oder ein Kindprozess davon) —
   nicht nur, dass irgendein Prozess dort lauscht. Bei Mismatch: harter Fehler mit klarer
   Remediation-Meldung (welcher fremde Prozess/PID blockiert, wie er beendet wird) statt Silent-
   Fallback auf die falsche Datenbank.
2. **Erfolgs-Check verschärfen** (`scripts/openspec-embed-local.sh`): Der Wrapper wertet die
   Ausgabe von `openspec-embed.mjs` bereits auf `indexed slug='` aus. Das reicht nicht — eine
   parallele `WARN: completeness gate`-Zeile in derselben Ausgabe muss den Wrapper ebenfalls mit
   `exit 1` beenden. Das macht den `dev-flow-plan` C.4-Aufruf (ohne `|| true`) wirksam, ohne den
   bewusst best-effort arbeitenden `post-commit-embed`-Hook zu verändern (der bleibt non-fatal).
3. **Rebase-Skip** (`.githooks/post-commit-embed`): Der Hook erkennt einen laufenden Rebase
   (`git rev-parse --git-path rebase-merge` / `rebase-apply`) und überspringt sich selbst
   vollständig (`exit 0`, kein Node-Aufruf) — der reguläre Folge-Commit nach Rebase-Ende embedded
   dann normal.
4. **Tests:** BATS-Tests für die Identitätsprüfung (Positiv: eigener Forward wird erkannt;
   Negativ: fremder Prozess auf dem Port wird abgelehnt — mit Positiv-Anker im selben Test), für
   den verschärften Erfolgs-Check (Output mit/ohne `WARN: completeness gate`) und für den
   Rebase-Skip (Hook läuft nicht während `rebase-merge`/`rebase-apply` existiert, läuft aber ohne
   Rebase-Marker normal).

## Non-Goals (Out of Scope)

- **2048-Token-Chunking-Limit** (T002839, eigenes Ticket) — die zwei dauerhaft übersprungenen
  Dokumente wegen Kontextlimit sind ein separater, bereits geticketer Befund und werden hier
  nicht angefasst.
- **Embedding-Backend-Probe-Timeout** (`:8081`, T002659) — bereits eigenständig behoben
  (`openspec/changes/openspec-embed-probe-timeout/`), andere Ursache (Latenz statt Portkollision).
- Kein Wechsel auf einen zufälligen/PID-basierten Standardport für `OPENSPEC_EMBED_PF_PORT` — die
  Identitätsprüfung behebt die Kollision direkt und ist die kleinere, testbarere Änderung; ein
  Port-Wechsel wäre zusätzliche Komplexität ohne zusätzlichen Nutzen (YAGNI).
- Kein rückwirkendes Backfill der bisher in die falsche DB geschriebenen bzw. fehlenden
  Collection-Einträge — das passiert automatisch beim nächsten (jetzt korrekten) Embed-Lauf pro
  Slug; ein einmaliger Full-Reindex ist eine Betriebsaufgabe, kein Code-Fix.

_Ticket: T002870 (führend) · T002877 (relates_to, dieselbe Ursache — beide Symptome desselben
Portkollisions-Bugs zu unterschiedlichen Zeitpunkten)_
