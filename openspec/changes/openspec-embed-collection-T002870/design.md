---
title: openspec-embed Portforward-Identität + Gate-Eskalation + Rebase-Skip
ticket_id: T002870
domains: [db]
status: planning
plan_ref: openspec/changes/openspec-embed-collection-T002870/tasks.md
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: openspec-embed Collection-Vollständigkeit (T002870 + T002877)

## Root-Cause (belegt, siehe proposal.md § Why)

Port 15432 ist lokal dauerhaft von einem anderen `kubectl port-forward` (k3d-mentolder-dev)
belegt. `scripts/openspec-embed-local.sh` startet seinen eigenen Forward auf denselben Port,
prüft danach aber nur "lauscht irgendwas auf dem Port" statt "lauscht MEIN Forward auf dem
Port". Traffic geht an die falsche DB. Zusätzlich wertet der Wrapper eine parallele
Completeness-Gate-WARN aus derselben Ausgabe nicht als Fehler, und der post-commit-Hook
blockiert Rebases synchron mit demselben (wirkungslosen) Aufruf.

## Entscheidungen

### 1. Identitätsprüfung des Port-Forwards

**Gewählt: PID-Vergleich über den tatsächlichen Port-Listener.** Nach dem Start von
`kubectl port-forward ... &` (PID in `$PF_PID`) wird ermittelt, welcher PID tatsächlich auf
`127.0.0.1:$PF_PORT` lauscht (`ss -ltnp` bevorzugt, `lsof -iTCP:$PF_PORT -sTCP:LISTEN -t` als
Fallback — beide sind auf der Zielmaschine vorhanden, `ss` ist Teil von `iproute2`). Der
Listener-PID muss `$PF_PID` sein. Ist er es nicht (ein fremder Prozess hält den Port), bricht
das Skript mit `exit 1` und einer Remediation-Meldung ab, die den fremden Prozess benennt
(`ps -p <pid> -o cmd=`) statt an ihn weiterzuverbinden.

Verworfene Alternative: DB-seitige Identitätsabfrage (`SELECT current_database()` o.ä.) nach
Verbindungsaufbau. Verworfen, weil sie einen echten DB-Roundtrip braucht (nicht ohne Cluster-
Zugriff testbar) und weil `current_database()` bei gleichnamigen DBs auf beiden Clustern
(`website`) nichts unterscheidet — der PID-Vergleich ist strenger, lokal ohne Cluster testbar
und behebt exakt das gemessene Symptom (fremder Prozess auf demselben Port).

Verworfen: zufälliger/PID-basierter Port statt fixem `15432`-Default. Würde Kollisionen
strukturell vermeiden, ist aber zusätzliche Komplexität (Port-Discovery, Race beim Binden)
für denselben Effekt, den die Identitätsprüfung bereits liefert — YAGNI (siehe proposal.md
Non-Goals).

### 2. Gate-Eskalation

**Gewählt: Erfolgs-Check im Wrapper verschärfen, `openspec-embed.mjs` unverändert lassen.**
`scripts/openspec-embed-local.sh` prüft aktuell nur `grep -q "indexed slug='"`. Ergänzt wird:
UND KEINE Zeile `WARN: completeness gate` im selben Output → sonst `exit 1`. Das reicht, weil
der einzige Aufrufer mit echter Fehlerwirkung (`dev-flow-plan` Schritt C.4) den Wrapper direkt
ruft und kein `|| true` verwendet — der Fehler wird dort sichtbar und blockiert das
Weiterlaufen des Plans. `.githooks/post-commit-embed` bleibt unverändert non-fatal (`echo`
statt Abbruch) — das ist gewolltes Verhalten für den Safety-Net-Hook, nicht Teil des Bugs.

Verworfen: `main()` in `openspec-embed.mjs` bei Completeness-Gate-WARN mit `exit 1` statt
`exit 0` beenden. Verworfen, weil der Wrapper den Node-Exit-Code ohnehin nicht auswertet
(`... || true`) — die Änderung an `main()` allein hätte keine Wirkung, ohne zusätzlich den
Wrapper zu ändern. Die Wrapper-Änderung allein reicht und ist die kleinere, lokal testbare
Fläche.

### 3. Rebase-Skip

**Gewählt:** `.githooks/post-commit-embed` prüft am Anfang (nach dem bestehenden
`OPENSPEC_EMBED_HOOK_DISABLED`/`CI`-Check) auf einen laufenden Rebase:
```bash
if [[ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ]] || \
   [[ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]]; then
  exit 0
fi
```
Bei Treffer: sofortiger `exit 0`, kein Node-Aufruf, kein Portforward-Versuch — pro replayed
Commit. Der reguläre nächste Commit **nach** Rebase-Ende (kein `rebase-merge`/`rebase-apply`
mehr vorhanden) embedded wie gewohnt; kein zusätzlicher `post-rewrite`-Hook nötig, weil
`git rebase` in der Praxis fast immer von mindestens einem regulären Commit gefolgt wird, bevor
der nächste `dev-flow-plan`-Lauf den expliziten C.4-Aufruf macht (der bleibt die verbindliche
Eskalationsstelle für „muss wirklich embedded sein").

## Testbarkeit (Konsequenz für Schritt 3)

Alle drei Änderungen sind **ohne Cluster-/DB-Zugriff** testbar, wenn sie als eigenständige,
aufrufbare Shell-Funktionen extrahiert werden:

- `pf_listener_pid <port>` — liefert die PID des Prozesses, der auf `<port>` lauscht (oder
  leer). Test: eigenen Decoy-Listener starten (`python3 -m http.server` auf freiem Port im
  Testsetup, oder `bash`-Coprozess mit `nc -l` falls vorhanden), PID vergleichen (Positiv-
  Anker), dann mit falscher erwarteter PID vergleichen (Negativ-Fall).
- `embed_output_is_success <output-text>` — pure Funktion, kapselt den verschärften
  `grep`-Check. Test füttert canned Output-Strings (mit/ohne `indexed slug=`, mit/ohne `WARN:
  completeness gate`) und prüft den Rückgabewert — Output-Verifikation statt Source-Grep
  (CLAUDE.md-Konvention).
- Rebase-Skip: Test legt ein Fake-`.git/rebase-merge`-Verzeichnis an (echtes Git-Repo im
  Testverzeichnis, `git rebase` nicht nötig — nur der Marker-Ordner), ruft den Hook auf, prüft
  per Marker-Datei, dass `openspec-embed-local.sh` NICHT aufgerufen wurde. Positiv-Anker:
  derselbe Test ohne Marker-Ordner prüft, dass der Hook den (gestubbten) Wrapper-Aufruf
  tatsächlich auslöst.

## Out of Scope

Siehe proposal.md § Non-Goals — 2048-Token-Limit (T002839), Probe-Timeout (T002659, bereits
gefixt), kein Port-Wechsel, kein Backfill.
