---
title: "mishap-t002523 — Implementation Plan"
ticket_id: T002523
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002523 — Implementation Plan

_Ticket: T002523_

Mishap-Bundle: ci, dev-flow, test, infra, skills/repo-hygiene, skills/references/plan-quality-gates, skills/dev-flow-plan (10 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
scripts/agent-collision.sh                             M2 — eigener Worktree als Identitaetsmerkmal
tests/spec/agent-behavior/collision-own-worktree.bats  M2 — neuer Guard
tests/spec/dev-flow-plan/task-context.bats             M4 — keine Arbeitsbaum-Mutation mehr
.claude/skills/references/repo-hygiene-ops.md          M7, M8 — gh-Exitcode, Batch-Push
.claude/skills/references/plan-quality-gates.md        M9 — veraltete S1-Tabelle entfernt
.claude/skills/references/dev-flow-plan-phases.md      M3, M10 — Lavish-Consent, Hauptcheckout-Mutation
.claude/skills/dev-flow-execute/SKILL.md               M5 — freshness:check-Reihenfolge
website/src/data/test-inventory.json                   generiert
docs/code-quality/repo-index.json                      generiert
```

## Bearbeitungsstand

| Eintrag | Ergebnis |
|---|---|
| M1 CI-Rot durch T002486 | erledigt ohne eigene Aenderung — T002485 und T002486 sind beide `done` |
| M2 Collision-Detector | behoben, Guard in `tests/spec/agent-behavior/collision-own-worktree.bats` |
| M3 Lavish-Widerspruch | behoben — „anbieten" statt „PFLICHT", Consent-Gate ist massgeblich |
| M4 BATS mutiert Arbeitsbaum | behoben — `--out` in Tempdir plus `teardown()`-Klammer |
| M5 freshness-Reihenfolge | behoben — Hinweis in dev-flow-execute Schritt 3 |
| M6 Flux Ready=False | erledigt ohne eigene Aenderung — alle Kustomizations stehen auf `READY=True` |
| M7 gh-Exitcode | behoben — Fehlerfall ist ein eigener Zweig |
| M8 Batch-Push | behoben — Bündelform dokumentiert |
| M9 veraltete S1-Tabelle | behoben — Zahlen durch Lesebefehl ersetzt |
| M10 Hauptcheckout-Mutation | behoben — expliziter `checkout --` nach dem Artefakt-Umzug |

## Mishap-Eintraege

### Mishap 1: #3571 (T002495) 4 CI-Failures = pre-existing main-Rot, PR nicht ursächlich
**Typ:** degraded | **Komponente:** ci

PR #3571 (10 doc/convention fixes für T002495): gh pr checks → 13 passed / 4 failed / 1 pending (arbitrate, Runner down). Failed: Factory spec shard 1, shard 2, shard 4, Factory+OpenSpec+Guards — exakt die in T002486 dokumentierten main-roten Gates (T002448-M*, T002250, T002240, T002470, TCC-gate, countLocalActivePlans), NICHT durch die doc-Fixes der PR verursacht. Der PR bleibt rot, bis die main-CI gefixt ist (T002485/#3557 in_progress + T002486 offen). Konsequenz: jeder PR, der scripts/ o.ä. anfasst, bleibt rot, solange T002486 offen ist. VERIFIED via gh-axi pr checks.

---

### Mishap 2: Collision-Detector meldet die eigene Session als Kollision
**Typ:** process | **Komponente:** dev-flow

Beim Stage-Commit auf fix/portrait-crop-T002507 (T002507) gab der Pre-Commit-Hook fuer alle 7 neu hinzugefuegten Dateien eine COLLISION-Warnung aus — als kollidierende Partei nannte er die EIGENE Session:

  COLLISION: openspec/changes/portrait-derivate-crop/tasks.md — auch in-flight bei
  claude/dev-flow-plan (sid 993b74ea-15b1-4e13-b24a-757012d3dc89,
  worktree /home/patrick/Bachelorprojekt/.worktrees/portrait-crop-T002507)

Die genannte SID und der genannte Worktree sind identisch mit denen des committenden Prozesses. Es gab keine zweite Session an diesen Dateien.

Wirkung: sieben falsch-positive Warnungen verrauschen genau die Ausgabe, in der eine ECHTE Kollision auffallen muesste. Wer das Muster ein paarmal gesehen hat, liest es nicht mehr — dann geht auch die echte Warnung unter. Der Detektor sollte Eintraege mit der eigenen owner_sid ueberspringen, bevor er warnt.

Kein Blocker: der Commit lief durch.

---

### Mishap 3: dev-flow-plan verlangt Lavish-Board, lavish-Skill verlangt vorherige Zustimmung
**Typ:** process | **Komponente:** dev-flow

dev-flow-plan Schritt 2.7 (Fix-Pfad) bzw. A.3 (Feature-Pfad) markiert das Lavish-Board als "PFLICHT — vor Brainstorming", inklusive npx-Aufruf, der eine Browser-Session oeffnet.

Der lavish-Skill selbst traegt in seiner description ein Consent-Gate: "but only after the user has agreed to it; see the consent gate below before opening a browser session."

Die beiden Regeln widersprechen sich direkt: eine unbedingte Pflicht laesst sich nicht mit einem Zustimmungsvorbehalt erfuellen. In dieser Session (T002507) wurde das Board deshalb nicht erstellt; das Brainstorming lief stattdessen ueber AskUserQuestion mit Previews, was fuer die eine offene Entscheidung (Crop-Variante A vs B) inhaltlich ausreichte.

Aufloesung noetig: entweder dev-flow-plan auf "anbieten, nicht erzwingen" abschwaechen, oder explizit festhalten, dass der dev-flow-Aufruf als Zustimmung gilt. Solange beides nebeneinandersteht, entscheidet jede Session neu und unterschiedlich.

---

### Mishap 4: BATS-Lauf schreibt fremdes intel.json in den Arbeitsbaum
**Typ:** suspicious | **Komponente:** test

Ein voller Lauf `tests/unit/lib/bats-core/bin/bats -r tests/spec/` im Hauptcheckout hinterliess eine modifizierte Datei:

  M openspec/changes/task-context-channel/intel.json

Der Checkout war vor dem Lauf nachweislich sauber (`git status --porcelain` leer, vor dem Stage-Commit von T002507 geprueft). Die Datei gehoert zu einem FREMDEN Change (T002420, task-context-channel) — der Testlauf hat also `plan-intel.sh` fuer einen Change ausgefuehrt, mit dem er nichts zu tun hat, und das Ergebnis in den Arbeitsbaum geschrieben. Diff: `generated_from` von main@5601f3300 auf main@71e92b2ff, dazu aktualisierte loc-Zahlen.

Zwei Probleme:

1. Ein Test darf den Arbeitsbaum nicht mutieren. Wer die Suite laeuft und danach `git status` liest, sieht fremde Aenderungen und muss erst herausfinden, ob das eigene Arbeit, fremder WIP oder Testmuell ist. Bei T001880 ist genau aus dieser Unklarheit heraus echter Verlust entstanden.

2. Der Schreibvorgang trifft eine Datei ausserhalb jedes Test-Tempdirs. Waere der Change task-context-channel gerade in aktiver Bearbeitung, haette der Testlauf einer fremden Session ins Arbeitsverzeichnis geschrieben.

Der Test sollte in `$BATS_TEST_TMPDIR` arbeiten oder die Datei nach dem Lauf zuruecksetzen. Verworfen wurde sie hier per `git checkout --`, nachdem der Diff als rein generiert erkannt war.

---

### Mishap 5: dev-flow-execute-Reihenfolge macht den ersten freshness:check zwangsläufig rot
**Typ:** process | **Komponente:** dev-flow

dev-flow-execute ordnet Schritt 3 (Lokale Verifikation, enthaelt `task freshness:regenerate` + `task freshness:check`) VOR Schritt 5 (Commit & Push) an. `freshness:check` prueft aber nicht nur, ob die Artefakte aktuell sind, sondern ob sie COMMITTED sind:

  ✗ website/src/data/test-inventory.json regenerated but not staged — run 'git add ...' and commit
  ✗ docs/code-quality/repo-index.json regenerated but not staged — run 'git add ...' and commit
  ERROR: 2 generated artifact(s) are not committed (see above).

In der vorgegebenen Reihenfolge ist der erste Aufruf damit immer rot: regenerate schreibt die Dateien, check verlangt den Commit, der Commit kommt erst zwei Schritte spaeter. Man muss vorziehen (committen, dann pruefen) — was der Skill so nicht sagt.

Die Meldung selbst ist gut (sie nennt die naechste Aktion und sagt ausdruecklich, dass erneutes regenerate nichts aendert — offenbar Lehre aus T002352-M3). Die Reihenfolge im Skill widerspricht ihr trotzdem.

Vorschlag: in Schritt 3 vermerken, dass `freshness:check` erst nach dem Commit der regenerierten Artefakte gruen werden kann, oder den Commit-Schritt fuer generierte Artefakte in Schritt 3 hochziehen.

Nebenbei, kleiner: `scripts/ticket.sh add-pr` gibt es nicht, der Befehl heisst `add-pr-link`. Die Skill-Referenzen nennen ihn nicht namentlich, sodass man ihn aus der Fehlerausgabe (`Unknown command: add-pr` plus Befehlsliste) rekonstruieren muss.

---

### Mishap 6: flux-mentolder-Kette meldet Ready=False wegen einer Dependency, die selbst grün ist
**Typ:** suspicious | **Komponente:** infra

Beim Live-Verify von T002507 auf fleet gefunden — NICHT abschliessend diagnostiziert, deshalb als Beobachtung und nicht als Ticket.

Vier Kustomizations melden Ready=False:

  flux-dev                False  dependency 'flux-system/flux-infra-controllers' is not ready
  flux-mentolder          False  dependency 'flux-system/flux-infra-controllers' is not ready
  flux-website-mentolder  False  dependency 'flux-system/flux-infra-controllers' is not ready
  flux-mentolder-jobs     False  dependency 'flux-system/flux-mentolder' is not ready

Die genannte Dependency meldet aber selbst gruen:

  $ kubectl --context fleet get kustomization flux-infra-controllers -n flux-system -o jsonpath=...
  Ready=True:   Applied revision: latest@sha256:ffe3ddf...
  Healthy=True: Health check passed in 248ms

Der Ready=False-Zeitstempel ist frisch (17:06:06Z, also aus dem laufenden 10m-Zyklus), nicht veraltet. Kein suspend gesetzt. flux-website-korczewski ist im selben Cluster True — betroffen ist nur die mentolder-Kette.

WARUM ES TROTZDEM NICHT GEBISSEN HAT:
Der Deploy von T002507 lief durch. Das Deployment website/-n website wurde auf das neue Image sha-20260801-165813-e1a5406 gepinnt, der Rollout hat stattgefunden, /api/health liefert jetzt commit=e1a540639, und die neuen Derivate sind live. Der Ready=False-Zustand hat den Apply also nicht verhindert.

WARUM ES TROTZDEM AUFFAELLT:
Genau dieser Zustand ist der Ausloeser von T002207 (Flux-Health-Gate friert Deploys ein: ein kaputter Workload blockiert die ganze Kustomization). Dass es hier nicht eingefroren hat, heisst nicht, dass es beim naechsten Mal nicht friert — und ein Betreiber, der auf `flux get kustomization` schaut, sieht eine rote mentolder-Kette und kann nicht unterscheiden, ob gerade wirklich etwas blockiert ist.

Nicht geklaert: ob flux-infra-controllers zwischen ready und not-ready flappt, oder ob die abhaengigen Kustomizations ihren Dependency-Status nicht neu auswerten. Beide Hypothesen sind ungeprueft.

---

### Mishap 7: gh-Aufruf in repo-hygiene-ops §2 fällt bei API-Fehler still auf "kein PR gefunden" zurück
**Typ:** suspicious | **Komponente:** skills/repo-hygiene

BEOBACHTUNG
Beim Prüfen von 13 [gone]-Branches brach ein `gh pr list --head "$b" --state merged --json number -q '.[0].number'` mitten in der Schleife mit "error connecting to api.github.com / check your internet connection" ab. Der betroffene Branch (chore/mishap-t002424) bekam dadurch merged_pr=NONE zugewiesen und wäre als "unbekannter Status — manuell prüfen" liegengeblieben. Eine Nachprüfung zeigte PR #3583 MERGED.

WARUM DAS ZÄHLT
Das Snippet in .claude/skills/references/repo-hygiene-ops.md §2 unterscheidet nicht zwischen "gh sagt: kein gemergter PR" und "gh konnte nicht antworten" — beide erzeugen eine leere Ausgabe und damit denselben Zweig. Der Fehlerfall sieht aus wie ein gültiger Messwert. Im hier vorliegenden Ablauf war die Folge harmlos (ein Branch mehr in der Prüfliste), die Richtung des Fehlers ist aber nicht garantiert: dieselbe Verwechslung im umgekehrten Sinne würde einen ungemergten Branch als löschbar ausweisen.

VORSCHLAG
Den gh-Aufruf in §2 vom Exit-Code her auswerten statt von der leeren Ausgabe, etwa:
  if ! out=$(gh pr list --head "$b" --state merged --json number -q '.[0].number' 2>&1); then
    echo "SKIP $b — gh-Abfrage fehlgeschlagen: $out"; continue
  fi
Damit wird der Fehlerfall zu einem eigenen, sichtbaren Zweig.

---

### Mishap 8: Sequentielles git push --delete in repo-hygiene-ops §2 läuft bei 20 Branches in den Timeout
**Typ:** degraded | **Komponente:** skills/repo-hygiene

BEOBACHTUNG
Beim Löschen von 20 verwaisten Remote-Branches lief eine Schleife mit je einem `git push origin --delete <branch>` nach 12 Löschungen in das 2-Minuten-Limit des Tool-Aufrufs. Jeder Push ist eine eigene Netzrunde und triggert zusätzlich die lokalen pre-push-Hooks (unter anderem `task quality:check`). Ein einziger Batch-Push für die restlichen 8 Branches (`git push origin :a :b :c ...`) erledigte diese in einem Aufruf innerhalb weniger Sekunden.

WARUM DAS ZÄHLT
Die Mechanik in .claude/skills/references/repo-hygiene-ops.md §2 ist auf einzelne Branches formuliert. Bei der Menge, die sich hier real ansammelt (26 Remote-Branches, davon 20 löschbar), ist die sequentielle Form nicht nur langsam, sondern führt zu einem abgebrochenen Lauf mit teilweise erledigter Arbeit — der Bediener muss dann selbst feststellen, wo die Schleife stehen geblieben ist.

VORSCHLAG
§2 um die Batch-Form ergänzen: Kandidaten erst vollständig sammeln und prüfen, dann in einem einzigen `git push origin` mit mehreren `:<branch>`-Refspecs löschen. Der Prüfteil bleibt pro Branch, nur der Schreibteil wird gebündelt.

---

### Mishap 9: S1-Tabelle in plan-quality-gates.md nennt veraltete Zeilenlimits (.sh 500 statt 800)
**Typ:** drift | **Komponente:** skills/references/plan-quality-gates

BEOBACHTUNG (verifiziert)
.claude/skills/references/plan-quality-gates.md Zeile 25:
  | `.ts` `.js` `.jsx` `.py` | 600 | | `.svelte` `.sh` `.mjs` `.mts` | 500 |
docs/code-quality/gates.yaml Zeile 61:
  .sh: 800      # war 500
Betroffen ist die ganze Tabelle, nicht nur .sh — gates.yaml hob in T002452 alle Werte an (.ts 600->900, .svelte 500->800, .astro 400->600, .tsx 400->600, .mjs/.mts/.py/.js/.jsx analog).

WARUM DAS ZÄHLT
Die Datei kennzeichnet sich selbst als "eine Karte, kein Ersatz" und verweist auf gates.yaml, nennt aber trotzdem konkrete Zahlen mit dem Zusatz "Stand 2026-06, verbindlich ist gates.yaml". Wer die Tabelle liest statt gates.yaml zu öffnen, rechnet mit einem zu knappen Budget und plant unnötige Splits ein — das ist genau die Firefight-Schleife, die derselbe Abschnitt zu verhindern versucht. Eine bereits bekannte Variante dieses Drifts ist für das .mjs-Limit notiert; die Ursache ist dieselbe und betrifft alle Zeilen.

VORSCHLAG
Die Zahlenspalten aus der Tabelle entfernen und durch den Lesebefehl ersetzen, statt sie zu aktualisieren — jede Kopie driftet erneut:
  yq '.s1.limits' docs/code-quality/gates.yaml

---

### Mishap 10: dev-flow-plan Phase A erzeugt eine Mutation im Hauptcheckout, die CLAUDE.local.md untersagt
**Typ:** drift | **Komponente:** skills/dev-flow-plan

BEOBACHTUNG (verifiziert)
dev-flow-plan Phase A schreibt vor, die gesamte Proposal-Phase auf `main` im Hauptcheckout zu fahren ("erst danach wird der Worktree angelegt"). `scripts/openspec.sh propose` ruft dabei `scripts/openspec-status-map.sh` auf (openspec.sh Zeilen 185/204/248), das `website/src/data/openspec-status.json` neu schreibt. Nach dem Umzug der Artefakte in den Worktree blieb die Datei als einzige Änderung im Hauptcheckout zurück und musste per `git checkout --` verworfen werden.

WARUM DAS ZÄHLT
CLAUDE.local.md sagt: "Mutierende Tasks nie im ~/Bachelorprojekt/-Hauptcheckout ausführen ... Der Hauptcheckout sollte nur für Pull/Merge/Read-Operationen genutzt werden." Genau dieser Konflikt hat laut derselben Datei am 2026-07-15 dazu geführt, dass sich rund 26 unkommitierte OpenSpec-Archivierungen auf main ansammelten (T001880). Der Ablauf hier ist harmlos, solange man die Datei bemerkt — sie ist aber leicht zu übersehen, weil sie erst nach dem Worktree-Wechsel sichtbar wird, wenn die Aufmerksamkeit schon im Worktree liegt.

VORSCHLAG
dev-flow-plan Phase A um einen expliziten Schritt nach dem Artefakt-Umzug ergänzen: `git checkout -- website/src/data/openspec-status.json` im Hauptcheckout, mit der Begründung, dass die Datei im Worktree ohnehin neu erzeugt wird. Alternativ `openspec.sh propose` den Status-Map-Aufruf überspringen lassen, wenn ein Ziel-Worktree angegeben ist.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
