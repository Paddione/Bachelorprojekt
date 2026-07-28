---
title: Merge-Arbitrierung bei N-Wege-Dateikollisionen
date: 2026-07-28
domains: [scripts, ci, tests, factory]
status: draft
tickets: []
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [2026-07-28-pr-conflict-reduction-design]
---

# Merge-Arbitrierung bei N-Wege-Dateikollisionen

## Zweck

Wenn drei oder mehr Branches dieselbe Datei fachlich ändern, existiert heute kein
Mechanismus, der die Divergenz zusammenführt und **eine** Entscheidung für alle Beteiligten
trifft. Die vorhandenen Werkzeuge sind sämtlich paarweise und binär: sie blockieren oder
warnen, sie lösen nicht auf. Dieses Dokument beschreibt die Auflösungsstufe.

## Abgrenzung zu T002413

`2026-07-28-pr-conflict-reduction-design.md` (T002413, approved) behandelt denselben
Problemraum eine Ebene früher. Seine Messung über acht offene PRs zeigt, warum diese
Abgrenzung nötig ist: von vier realen Datei-Clustern waren drei **keine** fachlichen
Kollisionen (zwei generierte Artefakte, ein `.bats`-Append-Konflikt). Nur
`scripts/agent-lock.sh` über drei PRs war echter Overlap.

| | T002413 | dieses Dokument |
|---|---|---|
| Wirkung | präventiv — verhindert gleichzeitigen Dispatch | kurativ — löst bestehende Divergenz auf |
| Zeitpunkt | Dispatch (Teil A), Rebase (Teil B) | Push / offene PRs |
| Ergebnis | Ticket wartet, PR wird rebased | Synthese-PR oder Eskalation |

**Teil A4 aus T002413 ist harte Vorbedingung.** Solange `scout.touched_files` nicht in
`tickets.touched_files` persistiert wird, hat die präventive Stufe kein Gedächtnis, und
jede Kollision landet ungefiltert hier. Dieses Vorhaben wird erst nach A umgesetzt.

`conflict-check.sh` wird hier **nicht** angefasst — jede Änderung daran gehört zu T002413/A.

## Nicht-Ziele

- Kein Ersatz für das präventive Gate. Die Arbitrierung ist das Netz, nicht der Weg.
- Kein Required Check. Der Mechanismus ist strikt additiv und blockiert nie einen PR.
- Keine Auflösung von Konflikten in generierten Artefakten — dafür existiert `merge=ours`
  und `task pr:refresh` (T002413/B).
- Keine Migration der Bestandsdateien in `tests/spec/`.

## Architektur

Drei Komponenten mit scharfen Grenzen. Der Schnitt ist so gewählt, dass jede einzeln
nutzbar und ohne die anderen testbar ist.

| Komponente | Aufgabe | Schreibt | Braucht |
|---|---|---|---|
| `scripts/arbitration/detect.sh` | Cluster-Erkennung über offene PRs, gibt JSON aus | nichts | `gh-axi`, `git` |
| `scripts/arbitration/synthesize.mjs` | JSON rein → `{merged, confidence, rationale, per_pr_notes}` raus | nichts | llm-proxy |
| `scripts/arbitration/apply.sh` | Synthese-PR **oder** Eskalation | GitHub, Ticket-DB | `gh-axi`, `ticket.sh` |

`detect.sh` ist allein wertvoll: manuell aufgerufen zeigt es die aktuellen Kollisionen,
bevor ein LLM beteiligt ist. `synthesize.mjs` ist rein funktional und damit ohne Cluster,
GitHub oder Netzwerk testbar.

### Ausführungsort

Neuer Workflow `.github/workflows/arbitration.yml`, `runs-on: [self-hosted, fleet-gpu]` —
derselbe Pool, den `opencode.yml` bereits nutzt. Trigger: `pull_request`
(`opened`, `synchronize`, `ready_for_review`) plus `schedule` alle 30 Minuten.

Der self-hosted Runner ist nicht Bequemlichkeit, sondern Bedingung: der llm-proxy ist an
`127.0.0.1:18235` gebunden und von einem GitHub-hosted Runner nicht erreichbar.

## Datenfluss

```
gh-axi pr list (open)
   │  pro PR: git diff --name-only origin/main...origin/<head>
   │          + isDraft, statusCheckRollup, labels, Ticket-ID aus Titel
   ▼
Ausschlussfilter (vor der Cluster-Bildung)
   │  - Pfade, die in .gitattributes als merge=ours geführt sind → generiert
   │  - PRs mit Label `arbitration`
   ▼
Cluster: Datei → {stimmberechtigte PRs, stumme PRs}
   │  stimmberechtigt = !draft && CI grün
   ▼
Schwelle: |stimmberechtigt| >= 3
   ▼
Idempotenz-Gate: cluster_key = sha256(sortierte Dateien + PR-Nummern + head-SHAs)
   │  Key bereits in einem offenen Arbitrierungs-PR oder Eskalations-Ticket? → skip
   ▼
synthesize.mjs → {merged, confidence, rationale, per_pr_notes}
   ▼
Syntax-Gate auf `merged` (dateityp-abhängig)
   │
   ├── Pfad auf Risiko-Allowlist ODER confidence < 0.8 ODER Syntax-Gate rot
   │      → ESKALATION: Ticket (type=task) mit N-Wege-Briefing,
   │        Kommentar an jeden beteiligten PR. Kein Code.
   │
   └── sonst
          → Branch chore/merge-arbitration-<ticket>, nur die Cluster-Datei(en),
            PR mit Label `arbitration`, CI normal, Auto-Merge an.
            Nach Merge: Kommentar mit per_pr_note an jede Quell-PR;
            `gh pr update-branch` nur wenn konfliktfrei, sonst nur Anweisung.
```

### Ausschluss generierter Artefakte

Die Ausschlussliste wird nicht neu gepflegt, sondern aus `.gitattributes` gelesen — den
20 Einträgen mit `merge=ours linguist-generated=true`. Das ist bereits die kanonische
Liste der Dateien, die konkurrierend regeneriert werden, und eine zweite Liste würde
garantiert driften.

Ohne diesen Filter wäre der Mechanismus nutzlos: die Messung aus T002413 zeigt
`repo-index.json` in vier und `openspec-status.json` in drei PRs — beide würden dauerhaft
Cluster erzeugen, die keine fachliche Kollision sind.

### Schleifen-Ausschluss

Der Synthese-PR trägt das Label `arbitration` und wird von der Erkennung ausgeschlossen.
Ohne das entsteht eine Endlosschleife: er ändert genau die Datei, die den Cluster
ausgelöst hat, zählte beim nächsten Lauf als vierte Stimme und bildete einen Cluster
über sich selbst.

### Idempotenz

Der `cluster_key` enthält die head-SHAs der beteiligten PRs. Derselbe Cluster wird
dadurch nicht alle 30 Minuten neu arbitriert — sobald aber einer der PRs nachpusht,
ändert sich der Key und die Entscheidung wird neu getroffen. Das ist beabsichtigt: die
vorherige Synthese ist dann inhaltlich veraltet.

## Entscheidungsregel

Der LLM entscheidet im Regelfall. Der Mensch entscheidet in zwei Fällen:

1. **Risiko-Pfade** — geteilter Cluster-, Secret- oder Deploy-State. Die Liste existiert
   heute als `VALUES`-Ausdruck im SQL von `conflict-check.sh` (`k3d/%`, `prod%`,
   `environments/%`, `Taskfile%`). Sie wird als `scripts/factory/shared-state-paths.txt`
   **neu angelegt** (`flux/` kommt hinzu) und in diesem Vorhaben **nur von `apply.sh`
   gelesen**.

   Die naheliegende Vereinheitlichung — `conflict-check.sh` auf dieselbe Datei umstellen —
   gehört ausdrücklich **nicht** hierher, obwohl sie fachlich richtig ist: `conflict-check.sh`
   liegt in T002418 offen, und der Umbau erzeugte genau die Mehrwege-Kollision, die dieses
   Feature auflösen soll. Sie wird als Folge-Ticket nach dem T002418-Merge geführt. Bis dahin
   existiert die Liste bewusst doppelt; der Duplikat-Zustand ist im Kopf der neuen Datei
   vermerkt, damit er nicht als gewachsene Drift missverstanden wird.
2. **Niedrige Confidence** — der LLM meldet selbst, dass die Änderungen semantisch
   unvereinbar sind statt nur textuell zu überlappen (etwa drei verschiedene Signaturen
   derselben Funktion). Schwelle: `confidence < 0.8`.

## Fehlerbehandlung

**Fail-open, ausnahmslos.** Der Arbiter setzt keinen Required Check, blockiert keinen PR
und ändert keinen fremden Branch destruktiv. Fällt der GPU-Runner aus oder antwortet das
LLM nicht, ist der Zustand nachher der Zustand vorher. Ein kaputter Arbiter darf die
Merge-Pipeline nicht anhalten.

**LLM-Ausgabe wird nie roh vertraut.** `synthesize.mjs` erzwingt ein striktes
JSON-Schema. Die `merged`-Version durchläuft eine dateityp-abhängige Syntaxprüfung
(`node --check`, `bats --count` für `.bats` — nicht `bash -n`, siehe T002351-M2,
`kustomize build`, `jq`). Schlägt sie fehl, wird die Synthese verworfen und auf
Eskalation zurückgefallen.

**Kein Force-Push, keine fremden Branches.** Der Arbiter pusht ausschließlich auf seinen
eigenen `chore/merge-arbitration-*`-Branch. An den Quell-PRs ändert er nur Kommentare;
`gh pr update-branch` (ein Merge, kein Rebase) läuft nur, wenn es konfliktfrei durchgeht.

## Testbarkeit

BATS nach der Verzeichniskonvention aus T002416: `tests/spec/merge-arbitration/`, eine
Datei pro Vorgang.

| Datei | Prüft |
|---|---|
| `detect-clustering.bats` | Fixture-Repo mit 4 Branches: 3er-Cluster wird erkannt, Draft-PR und `arbitration`-Label werden ignoriert |
| `detect-threshold.bats` | 2 stimmberechtigte PRs → kein Cluster. **Positiv-Anker im selben Test**: derselbe Aufbau mit 3 PRs feuert (T002356-M1) |
| `detect-generated-exclusion.bats` | `docs/code-quality/repo-index.json` in 3 PRs erzeugt keinen Cluster; Positiv-Anker: dieselben 3 PRs mit einer nicht-generierten Datei erzeugen einen |
| `apply-escalation.bats` | `k3d/foo.yaml` erzwingt Eskalation auch bei `confidence: 0.99`; Positiv-Anker: identischer Lauf mit `website/src/lib/x.ts` erzeugt den PR |
| `apply-idempotency.bats` | Zweiter Lauf ohne Push erzeugt nichts; nach simuliertem head-SHA-Wechsel erzeugt er wieder |
| `synthesize-syntax-gate.bats` | Manipulierte LLM-Antwort mit kaputtem JS führt zu Eskalation statt PR |

Alle Negativtests tragen ihren Positiv-Anker im selben `@test`-Block. Bei
`detect-threshold` ist das nicht formal, sondern notwendig: fehlt die Cluster-Logik
vollständig, ist die Kandidatenliste leer und „kein Cluster bei 2 PRs" gilt trivial.

## Offene Punkte

- Modellwahl für `synthesize.mjs` (Gemma auf `:8091` vs. Bonsai) ist eine
  Qualitätsfrage, die erst an echten Clustern messbar wird. Start mit dem
  Factory-Standardmodell über den Proxy, Wechsel ist eine Konfigurationszeile.
- Die Schwelle `>= 3` folgt der ursprünglichen Anforderung. Ob 2 sinnvoller ist, lässt
  sich erst nach einigen Wochen `detect.sh`-Läufen beantworten — der Detektor sollte
  seine Cluster deshalb auch unterhalb der Schwelle protokollieren.
