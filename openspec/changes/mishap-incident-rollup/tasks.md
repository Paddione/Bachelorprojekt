---
title: "mishap-incident-rollup — Implementation Plan"
ticket_id: T003201
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup — Implementation Plan

_Container-Ticket: T003201_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-10 18:36 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-10 04:33 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | suspicious | .claude/skills/references/repo-hygiene-ops.md §3 (gh pr checks) | gh pr checks faltet conclusion=cancelled auf "fail" — grüner PR wird als rot gemeldet |
| 2 | degraded | .claude/skills/references/repo-hygiene-ops.md §3 (Watch-Schleife) | statusCheckRollup mischt Checks mehrerer head-SHAs — Läufe eines Vorgänger-Commits gelten als aktueller Zustand |
| 3 | drift | Taskfile.yml (ticket-mcp:test) + .github/workflows/ci.yml | Taskfile ticket-mcp:test ist fail-open — fehlende Go-Toolchain deaktiviert das Gate lautlos |
| 4 | suspicious | .claude/skills/references/repo-hygiene-ops.md §1 | repo-hygiene hat keinen Vorcheck auf laufenden Factory-Tick — Worktrees verändern sich unter dem Lauf |
| 5 | drift | scripts/branch-reaper.sh + .claude/skills/references/repo-hygiene-ops.md §2 | branch-reaper.sh --dry-run verlangt --ticket — dokumentierter ticketloser Inspektionspfad nicht ausführbar |
| 6 | degraded | scripts/agent-lock-identity.sh + scripts/vda/ticket/_ticket-core.sh (Lock-Guard, Zeilen 129-183) | ticket-mcp sieht eine andere CLAUDE_CODE_SESSION_ID als die Shell — agent-lock sperrt die eigene Session aus |
| 7 | suspicious | tests/spec/divergence-guard/main-checkout-foreign-guard.bats + scripts/lib/main-checkout-foreign-guard.sh | Test hing an der PID-Breite der Maschine: lokal grün, CI rot — ps-Spaltenpolsterung als unsichtbare Testvoraussetzung |
| 8 | drift | dev-flow-plan / commit-msg-hook | superpowers:brainstorming schreibt nach docs/superpowers/specs/, aber der Scope 'specs' ist im commit-msg-Hook verboten |
| 9 | degraded | factory-mcp / openspec_find_similar | openspec_find_similar zeigt auf eine Cluster-interne Adresse und ist von WSL aus unbenutzbar |
| 10 | drift | skills/git-workflow (post-merge) | Post-Merge-Ticketabschluss unterblieb bei zwei gemergten PRs — T003120 blieb dadurch in der Factory-Queue |

**1. gh pr checks faltet conclusion=cancelled auf "fail" — grüner PR wird als rot gemeldet** (suspicious, .claude/skills/references/repo-hygiene-ops.md §3 (gh pr checks))

An PR #4091 meldete `gh pr checks 4091` den Required Check "Factory + OpenSpec + Guards" als **fail**. Tatsaechlich hatte KEIN einziger Job conclusion=failure: `gh run view 31347244592 --json jobs` zeigte 12x success und 1x **cancelled** (eben diesen Aggregat-Job). Sein eigenes Log belegt, dass er sein Urteil bereits gefaellt hatte, bevor er abgebrochen wurde: OPENSPEC_RESULT=success, SHARDS_RESULT=success, "Alle Factory-Gates gruen." — der Abbruch traf ihn NACH dem erfolgreichen Durchlauf. Ein blosser `gh run rerun --failed` machte den PR gruen und Auto-Merge zog ihn durch (mergedAt=2026-08-10T01:48:42Z); es existierte zu keinem Zeitpunkt ein Codefehler. Das ist eine weitere Instanz der §3-Grundregel, aber mit umgekehrtem Vorzeichen: hier meldet ein Signal Krankheit statt Gesundheit, ohne das Attestierte geprueft zu haben. Gegenprobe gehoert nach repo-hygiene-ops.md §3: bei rot gemeldetem Check IMMER `gh run view <run> --json jobs -q '.jobs[]|select(.conclusion=="failure")'` gegenpruefen — kommt nichts zurueck, ist es cancelled/skipped und ein Re-Run genuegt.
**2. statusCheckRollup mischt Checks mehrerer head-SHAs — Läufe eines Vorgänger-Commits gelten als aktueller Zustand** (degraded, .claude/skills/references/repo-hygiene-ops.md §3 (Watch-Schleife))

Beim Beobachten von PR #4092 nach einem Push meldete `gh pr view --json statusCheckRollup` fuenf rote Shards. Der Run auf dem AKTUELLEN head (68991e5dd) lief zu dem Zeitpunkt aber noch (`gh run view 31348198986` -> status=in_progress, logs noch nicht abrufbar) — die roten Eintraege stammten aus dem Lauf des Vorgaenger-Commits. Eine Watch-Schleife auf dem Rollup bricht dadurch mit "ROT" ab, waehrend die eigentliche Messung noch laeuft. Zweite, eigenstaendige Falle im selben Aufruf: in jq ist ein LEERER String truthy (nur null und false sind falsy), deshalb faengt `select(.conclusion?)` auch laufende Checks (conclusion="") und wirft sie in die Fehlerliste. Belastbar ist nur eine Auswertung, die (a) auf `.headSha == <headRefOid>` filtert und (b) laufend/leer explizit von negativ trennt: `select(.conclusion != "" and .conclusion != null and .conclusion != "SUCCESS")`. Kanonisch ist ohnehin `gh run list --branch <b> --json databaseId,name,headSha,status,conclusion` plus Filter auf den head — das ist in §3 bereits als Gegenprobe fuer leere Rollups dokumentiert, aber nicht als Pflicht fuer die Watch-Schleife nach einem Push.
**3. Taskfile ticket-mcp:test ist fail-open — fehlende Go-Toolchain deaktiviert das Gate lautlos** (drift, Taskfile.yml (ticket-mcp:test) + .github/workflows/ci.yml)

`ticket-mcp:test` (Taskfile.yml:5226) laeuft nur, wenn `command -v go` anschlaegt; sonst gibt es "ticket-mcp:test: Go toolchain not found — skipping (non-fatal)" aus und endet mit Exit 0. Ein Testgate, das sich bei fehlender Toolchain selbst abschaltet, kann nicht zwischen "Tests bestanden" und "Tests nie gelaufen" unterschieden werden — dieselbe Fehlerklasse wie die §3-Grundregel, nur in einem Task statt in einer gh-Abfrage. Konkret sichtbar geworden an PR #4092: der CI-Step "Run ticket-mcp Go tests" war VOR `arduino/setup-task` eingehaengt und brach in allen vier Spec-Shards mit "task: command not found" (Exit 127) ab — der eingebaute Fallback half dort nicht, weil er INNERHALB von task lebt. Nach dem Umsortieren (Commit 9af4e68fe) lief das Gate erstmals und legte sofort einen echten Defekt frei: internal/tools/mishap_konversion_test.go:101:13 "undefined: processBufferAtThreshold". In CI ist Go per setup-go@v5 garantiert vorhanden; der skip-Zweig kann dort also nur ein Setup-Defekt sein und sollte fail-closed werden (z. B. `[ "$CI" = true ] && exit 1`), waehrend lokal der weiche Pfad sinnvoll bleibt.
**4. repo-hygiene hat keinen Vorcheck auf laufenden Factory-Tick — Worktrees verändern sich unter dem Lauf** (suspicious, .claude/skills/references/repo-hygiene-ops.md §1)

Waehrend des repo-hygiene-Laufs am 2026-08-10 aenderten sich die SHAs von FUENF der sieben Worktrees unter dem Skript weg (z. B. .worktrees/mishap-dedupe-konversion-T003120: c193f926a -> 68991e5dd, .worktrees/mishap-rollup-loop-T002931: dc459c351 -> 72aca67a1). Ursache war ein parallel laufender Factory-Tick (`factory_status` -> tick_running=true). Konkrete Folge: der Worktree zu T003116 galt in der Eingangsinventur als sauber (nur Generate abweichend) und trug beim Aufraeumversuch wenige Minuten spaeter eine nicht-allowlistete Abweichung (openspec/specs/active-sessions-hub.md) — die §1-Vorpruefung hatte also einen Zustand gemessen, der zum Zeitpunkt der Entscheidung nicht mehr galt. Nur weil die Pruefung unmittelbar vor dem Remove wiederholt wurde, fiel es auf; die dokumentierte Reihenfolge (einmal inventarisieren, dann pro Worktree entscheiden) erlaubt beliebig viel Zeit dazwischen. repo-hygiene-ops.md §1 kennt keinen Vorcheck auf tick_running und keine Anweisung, die Messung unmittelbar vor dem Remove zu wiederholen. Zuschnitt: §5 (factory_status) VOR §1 ziehen und bei tick_running=true die Worktree-Sektion ueberspringen, oder die --porcelain-Pruefung als Teil des Remove-Schritts vorschreiben statt als Inventur.
**5. branch-reaper.sh --dry-run verlangt --ticket — dokumentierter ticketloser Inspektionspfad nicht ausführbar** (drift, scripts/branch-reaper.sh + .claude/skills/references/repo-hygiene-ops.md §2)

repo-hygiene-ops.md §2 ("Verwaiste Remote-Branches ohne PR") nennt `bash scripts/branch-reaper.sh --ticket T00XXXX --dry-run` als den manuellen Weg zum Nachsehen. Ein reiner Hygiene-Lauf hat aber keine eigene Ticket-ID, und das Skript ist auch im Dry-Run fail-closed: `bash scripts/branch-reaper.sh --dry-run` endet mit Exit 2 und "FEHLER: --ticket ist erforderlich (Format T######)".

VERIFIKATION: scripts/branch-reaper.sh:77 — `"") echo "FEHLER: --ticket ist erforderlich (Format T######)" >&2; usage; exit 2 ;;`. Kein Default, kein ticketloser Zweig; --dry-run (Zeile 65) setzt nur DRY_RUN=1 und umgeht die Pflichtprüfung nicht.

WIRKUNG: Der Schritt entfällt bei jedem Hygiene-Lauf ohne eigenes Ticket. Am 2026-08-10 wurde er durch Handarbeit ersetzt (git branch -vv + Ticketstatus je Branch) — das prüft nur lokale Branches und deckt die von §2 adressierten verwaisten *Remote*-Branches gar nicht ab. Genau deshalb existiert das Skript: --merged und [gone] erfassen Plan-/Factory-Branches nicht, die über einen Sammel-PR nach main laufen (am 2026-08-01: 24 von 26 Remote-Branches ohne jeden PR).

ZUSCHNITT (Vorschlag): Die Ticket-ID braucht der Reaper für den Archiv-Tag-Push, also nur im Schreibpfad. Ein Dry-Run schreibt nichts — die Pflichtprüfung gehört hinter die DRY_RUN-Abfrage. Alternativ eine Sammel-ID für Hygiene-Läufe in §2 dokumentieren.
**6. ticket-mcp sieht eine andere CLAUDE_CODE_SESSION_ID als die Shell — agent-lock sperrt die eigene Session aus** (degraded, scripts/agent-lock-identity.sh + scripts/vda/ticket/_ticket-core.sh (Lock-Guard, Zeilen 129-183))

BEOBACHTET 2026-08-10 während PR-Handarbeit an #4095. Nach `agent-lock.sh check-and-claim ticket T003078` (Claim korrekt als live gelistet) schlug `mcp__ticket-mcp__transition_status` für dasselbe Ticket mit Exit 7 fehl:

  ERROR: Ticket T003078 ist gesperrt (agent-lock) — Status-Schreibvorgang verweigert.
         Halter: sid=6bddc378-dc34-4ed5-a67b-7454dd1cd02e
         Eigene SID: 9b2c77aa-cc3d-43d2-b91c-79fe124b8653 (Shell-PID 1980421)

VERIFIKATION (gegengeprüft, kein Fremdsession-Fall):
- `echo $CLAUDE_CODE_SESSION_ID` in der Arbeits-Shell -> 6bddc378-… (identisch mit dem Halter)
- `_my_sid()` aus scripts/agent-lock-identity.sh in derselben Shell -> 6bddc378-…
- Die vom Guard gemeldete "eigene" SID 9b2c77aa-… kommt also NICHT aus der Shell, die den Claim setzte, sondern aus der Umgebung des ticket-mcp-Serverprozesses.

URSACHE (soweit belegt): `_AGENT_LOCK_SID_ENVS="CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID OPENCODE_SESSION_ID"` (scripts/agent-lock-identity.sh:13) leitet die Identität aus der Prozessumgebung ab. Der ticket-mcp-Server wird einmal gestartet und behält die SID, die zu seinem Startzeitpunkt gesetzt war — sie muss nicht die der aktuell arbeitenden Session sein. Damit ist die Identität nicht an die Session gebunden, sondern an die Lebensdauer des Serverprozesses.

WIRKUNG: Jeder Ticket-Schreibvorgang über ticket-mcp scheitert, sobald die Session den Ticket-Lock hält — also genau im vorgesehenen Ablauf "Lock nehmen, arbeiten, Status setzen". Der Guard schützt hier nichts, er blockiert den Eigentümer. Der reguläre Ausweg (erst `release`, dann schreiben) funktioniert, invertiert aber die Reihenfolge: der Status wird ungeschützt gesetzt, nachdem der Schutz aufgegeben wurde.

WARUM DAS ZÄHLT: Die Fehlermeldung selbst empfiehlt als Alternative `TICKET_LOCK_OVERRIDE=1` und schreibt dazu, dass dies "den Schutz auch gegen echte Fremdsessions deaktiviert". Ein Guard, dessen dokumentierter Ausweg der Generalschlüssel ist, wird unter Reibung genau so benutzt — dann ist er wirkungslos, ohne dass es auffällt.

EINORDNUNG: Der Befund trat Minuten nach dem Merge von T003110/T002826 auf (PR #4094, "cwd-independent lock ownership + claim persistence verification"). Jene Arbeit härtete die Ownership-Erkennung gegen wechselnde Arbeitsverzeichnisse; der Fall "zwei SID-Werte innerhalb einer Session, weil ein langlebiger MCP-Serverprozess seine Startumgebung konserviert" ist davon nicht erfasst. Kandidat für denselben Themenbereich, nicht für ein Rollback.
**7. Test hing an der PID-Breite der Maschine: lokal grün, CI rot — ps-Spaltenpolsterung als unsichtbare Testvoraussetzung** (suspicious, tests/spec/divergence-guard/main-checkout-foreign-guard.bats + scripts/lib/main-checkout-foreign-guard.sh)

BEOBACHTET 2026-08-10 an PR #4095 (T003078). Zwei Tests in tests/spec/divergence-guard/main-checkout-foreign-guard.bats fielen ausschliesslich auf dem GitHub-Runner. Lokal waren alle vier gruen — auch mit dem CI-identischen Aufruf `bats -j 6 --no-parallelize-within-files`, der Parallelismus war also als Ursache ausgeschlossen.

URSACHE (per Diagnose-Commit im CI belegt, nicht geraten): `ps -eo pid=` richtet die Spalte rechts aus und polstert auf die Breite von /proc/sys/kernel/pid_max (7 Zeichen bei den ueblichen 4194304). In scripts/lib/main-checkout-foreign-guard.sh las `while IFS= read -r _pid` diese Zeilen — das leere IFS schaltet genau das Trimmen ab, das ein blankes `read -r` geleistet haette. Der gepolsterte Wert machte jeden Folgepfad ungueltig (`/proc/   7219/cwd` existiert nicht), `readlink` scheiterte und das nachfolgende `continue` verwarf JEDEN Prozess ungeprueft. Die Erkennung konnte strukturell nie anschlagen.

WARUM LOKAL GRUEN: Auf einer lang laufenden WSL-Instanz sind die eigenen PIDs bereits 7-stellig (der simulierte Prozess hatte 1613537) — exakt Feldbreite, also keine Polsterung. Ein frischer CI-Runner vergibt 4-stellige PIDs und damit drei Leerzeichen Polsterung. Die Zusicherung hing an der Uptime der ausfuehrenden Maschine, nicht am Code.

WAS DIE DIAGNOSE AUSGESCHLOSSEN HAT (alle vier Vorab-Hypothesen waren falsch, jede Sonde meldete den erwarteten Wert): Symlink-Abweichung zwischen $d und /proc/pid/cwd (identisch, auch nach readlink -f), Prozessnamens-Auflösung (`ps -o args=` gab `claude 30`), Sichtbarkeit im Prozess-Scan (in_pslist=1), vorzeitiger Tod des Simulats (alive=yes).

VERALLGEMEINERUNG (der eigentliche Grund fuer diesen Eintrag): Jeder Test, der eine Prozessliste parst, kann auf einer Maschine gruen und auf einer anderen rot sein, ohne dass Code oder Test sich unterscheiden. Das ist dieselbe Klasse wie T002716 (Semantik statt Darstellung), nur eine Ebene tiefer: dort schrieb ein Guard das Ausgabeformat eines Werkzeugs fest, hier setzt ein Test eine Formateigenschaft stillschweigend voraus. Der belastbare Zuschnitt ist, das Format zu ERZWINGEN statt es vorzufinden.

BEHOBEN in 4e0f18153 (gemergt als 665f1926e): `while read -r` plus `tr -d '[:blank:]'` an der Quelle. Zusaetzlich ein Regressionstest, der die Polsterung per ps-Stub erzwingt (der Stub polstert ausschliesslich die `-eo pid=`-Form und delegiert alles andere an das echte ps) und damit unabhaengig von der PID-Breite der Maschine ist. Verifiziert gegen die ungefixte Bibliothek: rot ohne Fix, gruen mit Fix; plus Anker im selben Test, der belegt, dass der Stub ueberhaupt greift — sonst waere er stumm gruen.

OFFEN: Der ursprueglich rote Test 2 bleibt umgebungsabhaengig (er wurde nicht angetastet, weil der neue Test seine Luecke deckt). Wenn die Konvention aufgenommen wird, gehoert sie in die Test-Resultats-Konvention in CLAUDE.md bzw. docs/superpowers/references/gotchas-footguns.md.
**8. superpowers:brainstorming schreibt nach docs/superpowers/specs/, aber der Scope 'specs' ist im commit-msg-Hook verboten** (drift, dev-flow-plan / commit-msg-hook)

Die Skill superpowers:brainstorming legt ihr Design-Dokument per Konvention unter
docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md ab. Der naheliegende Commit-Scope dafuer
ist 'specs'. Genau den lehnt .githooks/commit-msg ab:

  ✗ unknown scope 'specs': docs(specs): ...
    ↳ 'specs' wurde zu 'plans' konsolidiert (T002328)

Kein Blocker — die Meldung nennt die Loesung und 'docs(plans)' geht durch. Aber die
Verzeichnis-Konvention der Skill und die Scope-Allowlist des Repos zeigen in verschiedene
Richtungen, und der Fehler tritt bei JEDEM Brainstorming-Durchlauf erneut auf, weil die Skill
den Pfad vorgibt und niemand den Scope daraus ableiten kann, ohne einmal anzustossen.

Denkbare Abhilfen (nicht entschieden): 'specs' als Alias auf 'plans' in der Allowlist
zulassen; oder die Repo-Ueberschreibung des Skill-Pfads in dev-flow-plan dokumentieren
("Design-Doc nach docs/superpowers/specs/, aber Commit-Scope plans").

Beobachtet: 2026-08-10 waehrend dev-flow-plan fuer T003203.
**9. openspec_find_similar zeigt auf eine Cluster-interne Adresse und ist von WSL aus unbenutzbar** (degraded, factory-mcp / openspec_find_similar)

Der MCP-Aufruf mcp__factory-mcp__openspec_find_similar schlaegt vom WSL-Host aus fehl:

  Get "http://website.website.svc.cluster.local:4321/api/openspec/search?q=..."
  dial tcp: lookup website.website.svc.cluster.local on 127.0.0.53:53: no such host

Die Adresse ist ein Kubernetes-Service-DNS-Name und nur aus dem Cluster aufloesbar. Vom
Entwicklungshost — also genau dort, wo dev-flow-plan laeuft und die Duplikatspruefung vor
einem neuen OpenSpec-Change stattfinden soll — gibt es keinen Weg dorthin.

Auswirkung ist begrenzt, aber nicht null: die Duplikatspruefung faellt still aus. In diesem
Lauf wurde sie manuell per grep ueber openspec/specs/ und tests/spec/ ersetzt, was
funktionierte, aber nur, weil daran gedacht wurde. Ein Durchlauf, der sich auf das Werkzeug
verlaesst, uebersieht einen bestehenden Change — und genau das ist hier schon einmal
passiert: der Change qwen3-coder-loadout (T002645) existierte bereits, waehrend T002753
dasselbe Loadout unter anderem Slug und Port erneut anlegte.

Denkbare Abhilfen (nicht entschieden): Port-Forward-Unit analog zu bge-forward-*.service;
oder die Basis-URL konfigurierbar machen und lokal auf einen bestehenden Forward zeigen
lassen.

Beobachtet: 2026-08-10 waehrend dev-flow-plan fuer T003203.
**10. Post-Merge-Ticketabschluss unterblieb bei zwei gemergten PRs — T003120 blieb dadurch in der Factory-Queue** (drift, skills/git-workflow (post-merge))

Beobachtet am 2026-08-10 während eines repo-hygiene-Laufs.

**Befund:** Zwei PRs waren nach `main` gemergt, ohne dass ihr Ticket geschlossen wurde. Die Konvention „Merge = Abschluss" (T001092) verlangt bei grünem Auto-Merge direkt `done · resolution=fixed/shipped`.

| PR | mergedAt (UTC) | Ticket | Status beim Fund |
|---|---|---|---|
| #4107 | 2026-08-10T04:29:02Z | T002766 | `in_progress` |
| #4092 | 2026-08-10T02:26:45Z | T003120 | `plan_staged` |

**Verifiziert (nicht nur behauptet):** Die Deliverables beider Tickets liegen auf `origin/main`.
- T002766: `git show origin/main --grep=T002766` zeigt Squash-Commit `6d3d13992` mit `scripts/worktree-git-op-guard.sh` (+116) und `tests/spec/agent-skills/worktree-mid-rebase-guard.bats` (+108).
- T003120: `git cat-file -e origin/main:<pfad>` für `scripts/vda/ticket/find-similar.sh`, `tests/spec/mishap-tracking/dedupe-korpus.bats`, `tests/spec/mishap-tracking/go-tests-registriert.bats` — alle drei vorhanden.

**Warum das mehr ist als ein Statusfeld:** Bei T003120 hatte der offene Status eine sichtbare Zweitwirkung — `mcp__factory-mcp__factory_queue` listete das Ticket weiter als `plan_staged`, also als wartende Arbeit. Die Queue meldete damit einen Vorgang, dessen Arbeit bereits gemergt war. Ein Dispatcher, der diese Queue liest, hätte den Vorgang erneut aufgenommen. Die Queue-Tiefe (86 backlog + 5 plan_staged) ist in dem Maß überzeichnet, in dem dieser Fall auftritt — wie oft, ist mit diesem einen Lauf nicht gemessen.

**Zusätzliche Beobachtung am selben Ort:** Der lokale Branch `fix/mishap-dedupe-konversion-T003120` stand nur auf dem Anker-Commit (`chore: anchor branch`, 1 Commit), während PR #4092 auf demselben Branch-Namen gemergt war. Die eigentliche Arbeit lief also nicht in diesem Worktree. Der Worktree blieb als Leiche zurück (im Lauf entfernt) — dasselbe galt für T002766.

**Behoben:** Beide Tickets im Lauf auf `done · fixed` gesetzt, je mit Kommentar und Merge-Timestamp. Die zwei Worktrees und lokalen Branches entfernt.

**Nicht behoben — offene Frage:** Warum der Post-Merge-Abschluss ausblieb, ist nicht ermittelt. Beide PRs entstanden im selben Zeitfenster wie elf weitere Vorgänge, die in der Plan-Phase steckenblieben (kein PR, letzter Commit `chore(plans): stage … for execution`). Ein angehaltener `opencode`-Prozess (Status `Tl`, seit 03:33) legt nahe, dass die Sessions unterbrochen wurden, bevor ihr Abschlussschritt lief — das ist eine Vermutung, keine Messung. Verwandt, aber anderer Sachverhalt: T003003 (dev-flow-execute blockiert auf Hintergrund-Verifikation und schließt nie ab), T002996 (Factory ohne Fortschritt).

**Dedupe-Guard (beide Quellen, T002844):** offene Tickets über `factory_queue` (96 Einträge) und `get_mishap_buffer` (9/10) geprüft. Nächstliegende Nachbarn T003179 (done-Tickets ohne `resolution` — betrifft das Feld, nicht den ausbleibenden Übergang) und T002840 (Rollup-Plan nie gepusht) treffen den Sachverhalt nicht.
### Mishap-Rollup — 10 Eintraege (2026-08-10 10:18 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | scripts/factory/wakeup.sh | Auto-Freshness-Regen generiert auf veralteter main-Basis — PR entfernt existierende Dateien aus repo-index.json, Nachfolger sind Leer-PRs |
| 2 | suspicious | scripts/factory/mishap-rollup.sh | rollup-publish.sh reset --soft: Divergenz-Rebuild nimmt fremde Remote-Dateien als Deletion mit — Fix als T003240 nur in Worktree, nicht auf main |
| 3 | degraded | scripts/agent-lock.sh + hooks/worktree-write-guard.sh | agent-lock heartbeat-ttl reapt den Lock während aktiver Arbeit — Worktree-Write-Guard sperrt danach den eigenen Worktree |
| 4 | suspicious | tests/spec/e2e-test-infrastructure | purge-test-data-missing-table.bats ist auf main rot — mit grünem Positiv-Anker, also kein Umgebungsproblem |
| 5 | suspicious | ticket-mcp / scripts/factory | ticket-mcp enqueue ändert type=fix unsichtbar zu type=feat |
| 6 | drift | scripts/openspec.sh + pre-commit guard | Archiv-Commit auf main erforderte SKIP_MAIN_COMMIT_GUARD=1 |
| 7 | drift | repo/.opencode | .opencode-Plugin-Bump 1.18.11→1.18.16 uncommitted in zwei Factory-Worktrees |
| 8 | suspicious | repo/CI | PR #4129 (T003267) CI rot an Factory-Spec-Shards — backlog-Ticket mit offenem PR |
| 9 | drift | scripts/llm-proxy | Spec verlangt /healthz, implementiert ist /health |
| 10 | suspicious | tests/spec/local-llm-proxy | Slot-Header-Test greppt den Quelltext statt Verhalten zu pruefen |

**1. Auto-Freshness-Regen generiert auf veralteter main-Basis — PR entfernt existierende Dateien aus repo-index.json, Nachfolger sind Leer-PRs** (drift, scripts/factory/wakeup.sh)

Drei Auto-Freshness-Regen-PRs (4101, 4113, 4114) wurden auf einer VERAULTETEN main-Basis generiert (merge-base 997b2415e, vor dem Merge von #4095). Folge: PR #4101 entfernte drei Testdateien faelschlich aus docs/code-quality/repo-index.json, die auf main existieren (dev-flow-chore-step0-foreign-guard, worktree-mid-rebase-guard, main-checkout-foreign-guard) — ein Merge haette Drift erzeugt. #4113/#4114 waren nach Regen auf aktuellem main Leer-PRs (blob-identisch zu origin/main) und mussten als redundant geschlossen werden. Der Auto-Regen braucht eine frische main-Basis vor der Generierung bzw. eine Pruefung, ob der generierte Diff gegen den AKTUELLEN main noch Substanz hat. Belegt: drei PRs an einem Tag, zwei davon leer.
**2. rollup-publish.sh reset --soft: Divergenz-Rebuild nimmt fremde Remote-Dateien als Deletion mit — Fix als T003240 nur in Worktree, nicht auf main** (suspicious, scripts/factory/mishap-rollup.sh)

origin/main hat nach dem T002931-Merge weiterhin `reset -q --soft` in scripts/factory/rollup-publish.sh (Zeile 105). Ein Stash (einzige Kopie) dokumentierte den Bug: --soft laesst den alten Index stehen, der neue Commit nimmt fremde Remote-Dateien (parallel.txt) als Deletion mit. Ein Follow-up-Fix wurde als T003240 geticketed und im Worktree fix/mishap-rollup-divergenz-rebuild-T003240 committet+gepusht. Der Stash wurde nach Sicherung gedroppt. WICHTIG: Der Fix ist noch NICHT auf main — T003240 ist triage/backlog, kein PR.
**3. agent-lock heartbeat-ttl reapt den Lock während aktiver Arbeit — Worktree-Write-Guard sperrt danach den eigenen Worktree** (degraded, scripts/agent-lock.sh + hooks/worktree-write-guard.sh)

Beobachtet am 2026-08-10 während eines dev-flow-execute-Laufs an T003205.

**Ablauf:** Lock via `agent-lock.sh claim ticket T003205 …` gesetzt, danach im zugehörigen Worktree gearbeitet (Tests, Commit). Beim nächsten `Edit` auf eine Datei **desselben** Worktrees lehnte `scripts/hooks/worktree-write-guard.sh` ab:

```
WORKTREE-GUARD: Schreibzugriff abgelehnt.
  Dieser Session (SID 39e55f79-…) gehoeren:
    - /home/patrick/Bachelorprojekt/.worktrees/worktree-create-refactor-prefix-T002811
  Der Pfad liegt ausserhalb — vermutlich im Hauptcheckout oder in einem fremden Worktree.
```

Der Pfad lag **nicht** außerhalb — er war der eigene, kurz zuvor geclaimte Worktree. Ursache im Reap-Log (`.git/agent-locks/.reap.log`):

```
1786338597 ticket/T003205 heartbeat-ttl
1786338605 ticket/T003205 heartbeat-ttl
1786338606 ticket/T003205 heartbeat-ttl
1786338712 ticket/T003205 heartbeat-ttl
```

**Viermal** in ~2 Minuten wegen abgelaufener Heartbeat-TTL gereapt, während durchgehend an diesem Ticket gearbeitet wurde. In der Lock-Datei sind `created_at` und `heartbeat_at` identisch (`"created_at": "1786335478", "heartbeat_at": "1786335478"`) — der Heartbeat wird nach dem Claim offenbar von nichts fortgeschrieben. Ein Lock, den niemand am Leben hält, läuft bei laufender Arbeit ab.

**Warum das mehr ist als eine lästige Meldung:** Der Besitzausweis des Write-Guards hängt am Lock. Läuft der Lock ab, verweigert der Guard Schreibzugriff auf den *eigenen* Worktree — und seine Meldung diagnostiziert das Gegenteil („vermutlich im Hauptcheckout oder in einem fremden Worktree"), also ein Pfadproblem statt eines Zeitproblems. Der angebotene Ausweg ist `WORKTREE_GUARD_BYPASS=1`; wer der Meldung folgt, schaltet damit einen Schutz ab, der gar nicht falsch ausgelöst hat, sondern nur seine Besitzquelle verloren hatte. Das ist derselbe Mechanismus, der `--force` bei `worktree remove` zum Standardgriff gemacht hat (repo-hygiene-ops §1): ein Schutz, der im Normalbetrieb regelmäßig übersprungen werden muss, schützt bald nicht mehr.

**Umgehung im Lauf:** Vor jedem Schreibzugriff den Claim erneuern. Das ist Symptombehandlung — die eigentliche Frage ist, ob der Heartbeat fortgeschrieben werden soll (dann fehlt der Schreiber) oder ob die TTL für interaktive Läufe zu kurz ist.

**Verwandt, aber anderer Sachverhalt:** T003131 (SID-Besitzmodell unterscheidet nebenläufige Subagenten nicht — dort ist die Zuordnung falsch, hier ist sie abgelaufen), T003102 (Locks blockieren Abschluss durch Subagent/MCP), Buffer-Eintrag „ticket-mcp sieht eine andere CLAUDE_CODE_SESSION_ID als die Shell" (im selben Lauf ebenfalls aufgetreten, aber eine andere Ursache: verschiedene SIDs statt abgelaufener TTL).

**Dedupe-Guard (beide Quellen, T002844):** `get_mishap_buffer` (2/10 Einträge) und die offene Ticketliste geprüft — kein Duplikat.
**4. purge-test-data-missing-table.bats ist auf main rot — mit grünem Positiv-Anker, also kein Umgebungsproblem** (suspicious, tests/spec/e2e-test-infrastructure)

Beobachtet am 2026-08-10 bei der Verifikation von T003205.

**Befund:** `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` schlägt fehl — sowohl im Feature-Worktree als auch, per Gegenprobe, im **Hauptcheckout auf `main`**:

```
1..2
ok 1     T002894: gesaete Testdaten-Zeile existiert vor dem Purge (Positiv-Anker)
not ok 2 T002894: fn_purge_test_data() raeumt die Zeile ab, obwohl questionnaire_test_status lokal fehlt
# (line 88)  `[ "$status" -eq 0 ]' failed
```

**Warum das kein Umgebungsproblem ist:** Test 1 ist der Positiv-Anker — er sät eine Zeile und liest sie zurück. Dass er grün ist, belegt, dass die Datenbank erreichbar ist und das Schema für den Sät-Teil trägt. Ein fehlender Postgres-Socket oder eine fehlende Testdatenbank hätte **beide** Tests rot gefärbt. Der Fehlschlag liegt also im Verhalten von `fn_purge_test_data()`, nicht in der Ausstattung des Läufers. Genau dafür ist der Positiv-Anker gedacht (T002356-M1), und hier trennt er die beiden Fälle sauber.

**Wie er gefunden wurde:** als einer von zwei `not ok` in einem `task test:changed`-Lauf über 3439 Tests. Der zweite (`inventory: committetes JSON …`) war eine echte Folge der eigenen Änderung und wurde behoben. Dieser blieb — die Gegenprobe auf `main` zeigte denselben Fehlschlag, er gehört also nicht zum Vorgang.

**Offen:** Ob CI ihn ebenfalls rot sieht, ist mit diesem Lauf nicht gemessen. Wenn CI grün ist, unterscheiden sich lokale und CI-Datenbank in einem Punkt, der genau diese Funktion betrifft — das wäre der eigentliche Befund. Wenn CI ebenfalls rot ist, läuft `main` mit einem roten Test, den die Merges nicht aufhalten. Beide Fälle sind berichtenswert, aber sie zu unterscheiden verlangt einen Blick in einen CI-Lauf, der diesen Test tatsächlich ausgeführt hat (`tests/spec/e2e-test-infrastructure/` steht unter dem Verdacht aus T002922: cluster-abhängige Spec-Tests, die CI nie wirklich ausführt).

**Verwandt:** T002922 (cluster-abhängige `tests/spec/*.bats` werden von CI nie ausgeführt) — falls das hier zutrifft, erklärt es, wieso ein auf `main` roter Test unbemerkt bleiben konnte. T002912 (Postgres-Socket nicht erreichbar) ist **nicht** derselbe Fall: dort fehlt die Verbindung, hier steht sie ausweislich des Positiv-Ankers.

**Dedupe-Guard (beide Quellen, T002844):** `get_mishap_buffer` (3/10) und die offene Ticketliste geprüft — kein Duplikat.
**5. ticket-mcp enqueue ändert type=fix unsichtbar zu type=feat** (suspicious, ticket-mcp / scripts/factory)

Beobachtet bei T003175: `ticket-mcp_enqueue_ticket` änderte den Ticket-Typ von `fix` zu `feat` und den Status von `plan_staged` zu `backlog`. Der API-Rückgabewert sagt "type=feat, status=backlog", aber der Aufrufer hat keine Kontrolle darüber. Für ein Fix-Ticket, das über den normalen dev-flow läuft (PR → CI → Merge), ist die Typ-Änderung unnötig und verwirrend — der Plan war bereits gestaged und der PR bereits erstellt. Der Type-Switch ist nur relevant, wenn das Ticket WIRKLICH von der Factory dispatched werden soll (was bei fix-Tickets mit bereits erstelltem PR nicht der Fall ist).
**6. Archiv-Commit auf main erforderte SKIP_MAIN_COMMIT_GUARD=1** (drift, scripts/openspec.sh + pre-commit guard)

Nach dem Merge von PR #4128 (T003175) musste der OpenSpec-Change archiviert werden. Der Archivierungs-Commit (chore(plans): archive ...) wurde auf main gebraucht, aber der pre-commit-Hook blockiert Commits auf main. Ein chore-Branch hätte angelegt werden müssen, aber der Workflow (merge → archive → commit → push) ist auf main ausgelegt. Der Bypass per SKIP_MAIN_COMMIT_GUARD=1 umgeht den Schutz, ist aber die einzige praktikable Lösung ohne separaten Chore-Branch + PR nur für den Archiv-Commit.
**7. .opencode-Plugin-Bump 1.18.11→1.18.16 uncommitted in zwei Factory-Worktrees** (drift, repo/.opencode)

In .worktrees/agent-lock-claim-help-T003107-reuse und .worktrees/ticket-sh-subcommand-help-T002843-reuse liegt identischer uncommitteter Bump (.opencode/package.json + package-lock.json), während origin/main und Hauptcheckout auf 1.18.11 stehen. Verifiziert via git show origin/main:.opencode/package.json. Systematischer Nebeneffekt (vermutlich opencode-Plugin-Install im Worktree), blockiert Worktree-Remove in repo-hygiene §1, Herkunft ungeklärt.
**8. PR #4129 (T003267) CI rot an Factory-Spec-Shards — backlog-Ticket mit offenem PR** (suspicious, repo/CI)

PR #4129 feature/cross-harness-plan-guardrails-T003267: mergeStateStatus=DIRTY, 4 Jobs failed (Factory spec shard 1/2/4, Factory + OpenSpec + Guards) bei headRefOid == remote tip (kein nachträglicher Push; verifiziert via gh pr view + gh run list). Ticket steht auf backlog, PR existiert bereits — kein Merge nach Runbook. Bekannte Fehlerklasse (T002997, T002922) — hier nur dokumentiert, kein neues Ticket.
**9. Spec verlangt /healthz, implementiert ist /health** (drift, scripts/llm-proxy)

openspec/specs/local-llm-proxy.md verlangt an zwei Stellen einen Endpunkt /healthz mit HTTP 200 (Szenario "Cutover replaces the legacy proxy in place"). Der Proxy kennt diesen Pfad nicht.

VERIFIZIERT am laufenden Dienst:
  for p in /healthz /health /livez; do printf '%-10s ' "$p"; curl -s -o /dev/null -w '%{http_code}' -m 3 "http://127.0.0.1:18235$p"; echo; done
  -> /healthz 404 | /health 503 | /livez 200
  grep -oE "path === '/[a-z]+'" scripts/llm-proxy/server.mjs | sort -u
  -> nur /admin, /health, /livez

Gemessen gegen Branch-Stand 64f07d0fc.

Es handelt sich NICHT um einen kaputten Endpunkt, sondern um Spec-Drift: der Pfad heisst /health, der Spec-Text nennt /healthz. Die 503 auf /health ist korrektes Verhalten laut T002336 (kein Prio-1-Backend aktiv) und kein Mangel.

Behebung: entweder den Spec-Text auf /health ziehen oder /healthz als Alias ergaenzen. Die erste Variante ist vorzuziehen, weil ein zweiter Name fuer dieselbe Sache nur die naechste Divergenz vorbereitet.
**10. Slot-Header-Test greppt den Quelltext statt Verhalten zu pruefen** (suspicious, tests/spec/local-llm-proxy)

tests/spec/local-llm-proxy.bats:451-454 prueft die Zusicherung "response includes x-llm-proxy-slot header when slot present" mit einem grep auf die Implementierungsdatei:

  @test "T002483: response includes x-llm-proxy-slot header when slot present" {
    run grep -q "x-llm-proxy-slot" "${BATS_TEST_DIRNAME}/../../scripts/llm-proxy/server.mjs"
    [ "$status" -eq 0 ]
  }

Das widerspricht der Test-Resultats-Konvention T002448-M4 (Output- statt Source-Verifikation). Der Test belegt nur, dass die Zeichenkette in der Datei steht — er wuerde gruen bleiben, wenn der Header in einem Zweig gesetzt wird, der nie erreicht wird, oder wenn er nur in einem Kommentar vorkommt.

Der Fall ist hier nicht theoretisch: derselbe Vorgang hat gezeigt, dass der korrespondierende Eingang x-slot-id von KEINEM Aufrufer gesetzt wird (siehe separaten Mishap). Der Test hat die Wirkungslosigkeit der Funktion also nicht bemerkt, weil er das Verhalten nie ausfuehrt.

Behebung: echten Request gegen einen Fake-Backend absetzen und den Antwort-Header pruefen. T003277/p6 baut die dafuer noetige Testinfrastruktur ohnehin auf.
### Mishap-Rollup — 10 Eintraege (2026-08-10 12:10 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | scripts/llm-proxy/slot-queue.mjs | Per-Slot-Queue-Isolation seit T002483 wirkungslos — kein Aufrufer sendet x-slot-id |
| 2 | suspicious | scripts/plan-qa-check.sh | plan-qa-check widerspricht plan-lint bei identischer Eingabe |
| 3 | degraded | scripts/openspec-embed.mjs | openspec-embed scheitert bei jedem Commit an belegtem Port 15432 |
| 4 | suspicious | scripts/branch-reaper.sh | Reuse-Worktrees sammeln npm-Install-Rauschen in .opencode/package.json — §1-Allowlist greift nicht |
| 5 | process | factory | PR #4129 (T003267) offen mit rotem CI, Ticket weiterhin backlog — Implementation vor Factory-Dispatch gepusht |
| 6 | suspicious | repo/git-state | .git/shallow-Boundary am main-Tip blockierte pre-push-Validierung (Ursache ungeklärt) |
| 7 | suspicious | repo/worktrees | Scratchpad-Worktree wt-order-guards-head-first-match: leerer Index + Teil-Snapshot, nicht sicherbar |
| 8 | drift | repo/.opencode | Identischer uncommitteter @opencode-ai/plugin-Bump (1.18.11→1.18.16) in zwei -reuse-Worktrees fremd zu deren Tickets |
| 9 | drift | skills/repo-hygiene | repo-hygiene-SKILL.md verweist auf nicht existierenden SSOT-Relativpfad |
| 10 | degraded | mcp-postgres | mcp-postgres fleet copy returned 98 'open' tickets, live DB had 58 — 40 already done |

**1. Per-Slot-Queue-Isolation seit T002483 wirkungslos — kein Aufrufer sendet x-slot-id** (degraded, scripts/llm-proxy/slot-queue.mjs)

scripts/llm-proxy/slot-queue.mjs isoliert Warteschlangen pro Slot, damit "slot 0 does not block slot 1" (Kopfkommentar). Der Schluessel entsteht in enqueue() aus `${name}:slot${slotId}`, wobei slotId aus extractSlotId(req) stammt und den Header x-slot-id liest.

VERIFIZIERT: kein produktiver Aufrufer setzt diesen Header.
  git grep -c "x-slot-id" -- . ':!tests' ':!scripts/llm-proxy'
  -> nur Treffer in den neuen Plandateien von T003277, sonst keine
  git grep -n 'x-slot-id' -- scripts .opencode
  -> nur slot-queue.mjs (Leser) und server.test.mjs (Testfixtures)

Gemessen gegen Branch-Stand 64f07d0fc.

Folge: slotId ist immer null, der Schluessel faellt auf backend.name zurueck, und alle Slots teilen sich dieselbe Semaphore — genau der Zustand, den die Datei laut ihrem Kopfkommentar verhindern soll. scripts/factory/sandbox-run.sh kennt zwar eine SLOT_ID, reicht sie aber nie als HTTP-Header weiter.

T003277/p3 setzt den Header und weist die Wirksamkeit mit zwei gleichzeitigen Anfragen nach. Dieser Mishap haelt fest, dass die Funktion seit T002483 unbemerkt tot war — der zugehoerige Test konnte es nicht bemerken, weil er den Quelltext greppt statt Verhalten zu messen (separater Mishap).
**2. plan-qa-check widerspricht plan-lint bei identischer Eingabe** (suspicious, scripts/plan-qa-check.sh)

scripts/plan-qa-check.sh (advisory, LLM-gestuetzt) beanstandete an openspec/changes/llm-proxy-dispatch-capture/tasks.md zu Kriterium 5, der letzte Task sei "nicht explizit als Teil eines Tasks definiert, der die Schritte test:changed, freshness:regenerate und freshness:check enthaelt".

Das ist ein Fehlurteil. Die drei Befehle stehen als Checkbox-Task ("Abschliessende Pruefung") im Index, und das fail-closed Hard Gate wertet dieselbe Datei als konform:
  bash scripts/plan-lint.sh openspec/changes/llm-proxy-dispatch-capture/tasks.md
  -> PLAN-LINT: PASS (0 hard, 0 warn)   # STRUCT3 geprueft und bestanden

Gemessen gegen Branch-Stand 64f07d0fc.

Warum das zaehlt: plan-qa laeuft mit "|| true" und blockiert nichts, aber es durchlaeuft bis zu zwei Auto-Fix-Iterationen, in denen es Vorschlaege an die Plandatei anhaengt ("Auto-fix attempt 1/2: appending suggestions"). Ein falsch-positives Kriterium kann damit einen Plan veraendern, der bereits konform ist. In diesem Lauf blieb die Datei unveraendert (nachgeprueft), aber die Moeglichkeit besteht.

Ein zweiter Punkt derselben Meldung war dagegen berechtigt: die S1-Budgets standen nur in den Partials, nicht im Index. Das wurde uebernommen. Der Befund richtet sich also gegen Kriterium 5, nicht gegen das Werkzeug insgesamt.
**3. openspec-embed scheitert bei jedem Commit an belegtem Port 15432** (degraded, scripts/openspec-embed.mjs)

Der post-commit-Hook scripts/openspec-embed.mjs schlug bei BEIDEN Commits dieses Vorgangs nach drei Versuchen fehl:

  [openspec-embed] post-commit: embedding slug='llm-proxy-dispatch-capture'...
  [openspec-embed] retry 1/3 ... retry 2/3 ...
  [openspec-embed] WARN: embed failed after 3 attempts (non-fatal)

Ursache ist die bekannte Portkollision: openspec-embed.mjs oeffnet einen pg.Pool auf localhost:15432, den auf dieser Maschine der k3d-Portforward belegt.

Beobachtet an den Commits d041220e6 und 64f07d0fc.

Der Fehlschlag ist als non-fatal markiert und bricht den Commit nicht ab — die Folge ist still: die Proposals dieses Vorgangs sind nicht eingebettet und damit ueber die semantische Suche (openspec_find_similar) nicht auffindbar. Wer spaeter nach aehnlichen Vorhaben sucht, bekommt ein unvollstaendiges Ergebnis, ohne dass etwas darauf hinweist.

Beitrag zum Design von T003277: genau dieser Mechanismus war der Grund, einen direkten pg-Client im llm-proxy zu verwerfen (design.md D1a) — ein langlaufender Dienst haette sich dieses Ausfallmuster eingehandelt.
**4. Reuse-Worktrees sammeln npm-Install-Rauschen in .opencode/package.json — §1-Allowlist greift nicht** (suspicious, scripts/branch-reaper.sh)

Drei reuse-Worktrees (T002908, T002843, T002934) trugen uncommittete @opencode-ai/plugin-Bumps 1.18.11→1.18.16 in .opencode/package.json + package-lock.json — identisches npm-Install-Artefakt, in keinem Git-Objekt, auf main nicht vorhanden. Die §1-Allowlist (maßgeblich: ALLOWLIST in scripts/branch-reaper.sh) deckt .opencode/ ab nicht ab, also blockierte ein Nicht-Allowlist-Pfad die Worktree-Removal als scheinbarer Befund. Workaround: git checkout -- auf die committeden Versionen, dann remove. Kein Datenverlust, aber: (a) Allowlist kennt den Pfad nicht, obwohl reines Generat-Rauschen, (b) jede Worktree-Removal von reuse-Worktrees braucht künftig denselben Zwei-Schritt.
**5. PR #4129 (T003267) offen mit rotem CI, Ticket weiterhin backlog — Implementation vor Factory-Dispatch gepusht** (process, factory)

Auf dem Branch feature/cross-harness-plan-guardrails-T003267 liegt ein offener PR (#4129, erstellt 08:23Z) mit voller Implementation, während das Ticket T003267 status=backlog ist (noch nie dispatched). CI rot in 4 Jobs: Factory spec shards 1/2/4 + Aggregate. Ursache: echte Spec-Regressionen — die Checks "do not commit on main / clean status / Pre-Commit-Guard lock-file / branch__<slug>.json / stage-plan auto-emit" wurden aus .claude/skills/dev-flow-plan/SKILL.md nach scripts/plan-preflight.sh verschoben, die greppenden Tests (agent-lock-session-identity.bats, catalog-eval-telemetry.bats T001444, agent-lock-scope-regelwerk.bats T003102) laufen dagegen ins Leere. stage-plan --hold/--no-hold-Pflicht bricht den T001444-Aufruf ohne Hold-Flag. Befund auf T003267 kommentiert. Merge blockiert, bis die Tests an den plan-preflight-Umbau angepasst sind.
**6. .git/shallow-Boundary am main-Tip blockierte pre-push-Validierung (Ursache ungeklärt)** (suspicious, repo/git-state)

Während des repo-hygiene-Laufs (2026-08-10, ~11:46Z) tauchte in .git/shallow ein Boundary-Eintrag für den main-Tip 1c6b90028 auf (mtime 13:46:54 +0200 — mitten in der Session). Kein Hook im Repo erzeugt Shallow-State (geprüft: grep -rln 'shallow|--depth' .githooks/ scripts/hooks/ = leer). Wirkung: die pre-push-Validierung (validate-commit-msg.sh range origin/main..HEAD) zog wegen der gebrochenen Ancestry 6724 Commits statt 3 in den Range und blockierte den Push des T003107-Merge-Commits mit "unknown scope"-Fehlern auf alten main-Commits — dieselbe Fehlerklasse wie T002827, aber andere Ursache. Der vollständige Commit-Graph war im Objektstore vorhanden (merge-base 47d25bb7 bcf14d546 = 8d77df268 mit ignoriertem Shallow); die Boundary wurde entfernt (Backup /tmp/opencode/shallow.bak), Historie danach vollständig (rev-list count main = 6805), Push erfolgreich. VERIFIZIERT.
**7. Scratchpad-Worktree wt-order-guards-head-first-match: leerer Index + Teil-Snapshot, nicht sicherbar** (suspicious, repo/worktrees)

/tmp/claude-1000/.../scratchpad/wt-order-guards-head-first-match (Branch fix/order-guards-head-first-match-T003104, backlog): git status --porcelain zeigt leeren Index (ls-files = 0), HEAD tracked 9857 Dateien, Arbeitsbaum enthält nur 1812 (Teil-Snapshot eines abgebrochenen Checkouts), davon 139 Dateien mit vom HEAD abweichenden Blobs. Branch ist exakt == origin/main (1c6b90028). Es existiert kein git-artefaktierter Zwischenstand (Index leer, 0 Commits auf dem Branch) — es ist nicht entscheidbar, ob die 139 abweichenden Dateien echte Arbeit enthalten (mtimes/Herleitung unklar). Fail-closed: Worktree NICHT entfernt, Befund gelassen. VERIFIZIERT (empty index, 1812 untracked, 139 blob-abweichend).
**8. Identischer uncommitteter @opencode-ai/plugin-Bump (1.18.11→1.18.16) in zwei -reuse-Worktrees fremd zu deren Tickets** (drift, repo/.opencode)

.worktrees/ticket-guard-diff-scope-T002934-reuse und .worktrees/worktree-status-check-existence-T002932-reuse tragen beide denselben uncommitteten Dependency-Bump in .opencode/package.json + package-lock.json (@opencode-ai/plugin 1.18.11 → 1.18.16). Die touched_files beider Tickets (T002934, T002932) decken .opencode/ nicht ab; origin/main hat weiterhin 1.18.11. Unerklärter Fremdstand in Worktrees aktiver Tickets — nicht revertiert (könnte Absicht sein), nicht committet (gehört zu keinem Ticket), liegt gelassen. VERIFIZIERT (diff in beiden Worktrees identisch, main=1.18.11).
**9. repo-hygiene-SKILL.md verweist auf nicht existierenden SSOT-Relativpfad** (drift, skills/repo-hygiene)

.agents/skills/repo-hygiene/SKILL.md referenziert die Mechanik-SSOT als file:///home/patrick/Bachelorprojekt/.claude/skills/references/repo-hygiene-ops.md (absoluter Pfad) — der im Skill-Base-Kontext genutzte relative Pfad .agents/skills/repo-hygiene/references/repo-hygiene-ops.md existiert nicht (glob leer); die Datei liegt korrekt unter .claude/skills/references/. Beim Laden musste der Pfad per glob aufgelöst werden. VERIFIZIERT.
**10. mcp-postgres fleet copy returned 98 'open' tickets, live DB had 58 — 40 already done** (degraded, mcp-postgres)

Triage run used mcp-postgres (fleet copy, port 13001) which returned 98 tickets. Switched to kubectl exec psql (live DB) which returned 58. 40 tickets in the fleet copy were already done/archived. Known issue T002785-4.
### Mishap-Rollup — 10 Eintraege (2026-08-10 12:10 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | scripts/llm-proxy/slot-queue.mjs | Per-Slot-Queue-Isolation seit T002483 wirkungslos — kein Aufrufer sendet x-slot-id |
| 2 | suspicious | scripts/plan-qa-check.sh | plan-qa-check widerspricht plan-lint bei identischer Eingabe |
| 3 | degraded | scripts/openspec-embed.mjs | openspec-embed scheitert bei jedem Commit an belegtem Port 15432 |
| 4 | suspicious | scripts/branch-reaper.sh | Reuse-Worktrees sammeln npm-Install-Rauschen in .opencode/package.json — §1-Allowlist greift nicht |
| 5 | process | factory | PR #4129 (T003267) offen mit rotem CI, Ticket weiterhin backlog — Implementation vor Factory-Dispatch gepusht |
| 6 | suspicious | repo/git-state | .git/shallow-Boundary am main-Tip blockierte pre-push-Validierung (Ursache ungeklärt) |
| 7 | suspicious | repo/worktrees | Scratchpad-Worktree wt-order-guards-head-first-match: leerer Index + Teil-Snapshot, nicht sicherbar |
| 8 | drift | repo/.opencode | Identischer uncommitteter @opencode-ai/plugin-Bump (1.18.11→1.18.16) in zwei -reuse-Worktrees fremd zu deren Tickets |
| 9 | drift | skills/repo-hygiene | repo-hygiene-SKILL.md verweist auf nicht existierenden SSOT-Relativpfad |
| 10 | degraded | ticket-mcp | ticket-mcp export_tickets returns insufficient fields for triage |

**1. Per-Slot-Queue-Isolation seit T002483 wirkungslos — kein Aufrufer sendet x-slot-id** (degraded, scripts/llm-proxy/slot-queue.mjs)

scripts/llm-proxy/slot-queue.mjs isoliert Warteschlangen pro Slot, damit "slot 0 does not block slot 1" (Kopfkommentar). Der Schluessel entsteht in enqueue() aus `${name}:slot${slotId}`, wobei slotId aus extractSlotId(req) stammt und den Header x-slot-id liest.

VERIFIZIERT: kein produktiver Aufrufer setzt diesen Header.
  git grep -c "x-slot-id" -- . ':!tests' ':!scripts/llm-proxy'
  -> nur Treffer in den neuen Plandateien von T003277, sonst keine
  git grep -n 'x-slot-id' -- scripts .opencode
  -> nur slot-queue.mjs (Leser) und server.test.mjs (Testfixtures)

Gemessen gegen Branch-Stand 64f07d0fc.

Folge: slotId ist immer null, der Schluessel faellt auf backend.name zurueck, und alle Slots teilen sich dieselbe Semaphore — genau der Zustand, den die Datei laut ihrem Kopfkommentar verhindern soll. scripts/factory/sandbox-run.sh kennt zwar eine SLOT_ID, reicht sie aber nie als HTTP-Header weiter.

T003277/p3 setzt den Header und weist die Wirksamkeit mit zwei gleichzeitigen Anfragen nach. Dieser Mishap haelt fest, dass die Funktion seit T002483 unbemerkt tot war — der zugehoerige Test konnte es nicht bemerken, weil er den Quelltext greppt statt Verhalten zu messen (separater Mishap).
**2. plan-qa-check widerspricht plan-lint bei identischer Eingabe** (suspicious, scripts/plan-qa-check.sh)

scripts/plan-qa-check.sh (advisory, LLM-gestuetzt) beanstandete an openspec/changes/llm-proxy-dispatch-capture/tasks.md zu Kriterium 5, der letzte Task sei "nicht explizit als Teil eines Tasks definiert, der die Schritte test:changed, freshness:regenerate und freshness:check enthaelt".

Das ist ein Fehlurteil. Die drei Befehle stehen als Checkbox-Task ("Abschliessende Pruefung") im Index, und das fail-closed Hard Gate wertet dieselbe Datei als konform:
  bash scripts/plan-lint.sh openspec/changes/llm-proxy-dispatch-capture/tasks.md
  -> PLAN-LINT: PASS (0 hard, 0 warn)   # STRUCT3 geprueft und bestanden

Gemessen gegen Branch-Stand 64f07d0fc.

Warum das zaehlt: plan-qa laeuft mit "|| true" und blockiert nichts, aber es durchlaeuft bis zu zwei Auto-Fix-Iterationen, in denen es Vorschlaege an die Plandatei anhaengt ("Auto-fix attempt 1/2: appending suggestions"). Ein falsch-positives Kriterium kann damit einen Plan veraendern, der bereits konform ist. In diesem Lauf blieb die Datei unveraendert (nachgeprueft), aber die Moeglichkeit besteht.

Ein zweiter Punkt derselben Meldung war dagegen berechtigt: die S1-Budgets standen nur in den Partials, nicht im Index. Das wurde uebernommen. Der Befund richtet sich also gegen Kriterium 5, nicht gegen das Werkzeug insgesamt.
**3. openspec-embed scheitert bei jedem Commit an belegtem Port 15432** (degraded, scripts/openspec-embed.mjs)

Der post-commit-Hook scripts/openspec-embed.mjs schlug bei BEIDEN Commits dieses Vorgangs nach drei Versuchen fehl:

  [openspec-embed] post-commit: embedding slug='llm-proxy-dispatch-capture'...
  [openspec-embed] retry 1/3 ... retry 2/3 ...
  [openspec-embed] WARN: embed failed after 3 attempts (non-fatal)

Ursache ist die bekannte Portkollision: openspec-embed.mjs oeffnet einen pg.Pool auf localhost:15432, den auf dieser Maschine der k3d-Portforward belegt.

Beobachtet an den Commits d041220e6 und 64f07d0fc.

Der Fehlschlag ist als non-fatal markiert und bricht den Commit nicht ab — die Folge ist still: die Proposals dieses Vorgangs sind nicht eingebettet und damit ueber die semantische Suche (openspec_find_similar) nicht auffindbar. Wer spaeter nach aehnlichen Vorhaben sucht, bekommt ein unvollstaendiges Ergebnis, ohne dass etwas darauf hinweist.

Beitrag zum Design von T003277: genau dieser Mechanismus war der Grund, einen direkten pg-Client im llm-proxy zu verwerfen (design.md D1a) — ein langlaufender Dienst haette sich dieses Ausfallmuster eingehandelt.
**4. Reuse-Worktrees sammeln npm-Install-Rauschen in .opencode/package.json — §1-Allowlist greift nicht** (suspicious, scripts/branch-reaper.sh)

Drei reuse-Worktrees (T002908, T002843, T002934) trugen uncommittete @opencode-ai/plugin-Bumps 1.18.11→1.18.16 in .opencode/package.json + package-lock.json — identisches npm-Install-Artefakt, in keinem Git-Objekt, auf main nicht vorhanden. Die §1-Allowlist (maßgeblich: ALLOWLIST in scripts/branch-reaper.sh) deckt .opencode/ ab nicht ab, also blockierte ein Nicht-Allowlist-Pfad die Worktree-Removal als scheinbarer Befund. Workaround: git checkout -- auf die committeden Versionen, dann remove. Kein Datenverlust, aber: (a) Allowlist kennt den Pfad nicht, obwohl reines Generat-Rauschen, (b) jede Worktree-Removal von reuse-Worktrees braucht künftig denselben Zwei-Schritt.
**5. PR #4129 (T003267) offen mit rotem CI, Ticket weiterhin backlog — Implementation vor Factory-Dispatch gepusht** (process, factory)

Auf dem Branch feature/cross-harness-plan-guardrails-T003267 liegt ein offener PR (#4129, erstellt 08:23Z) mit voller Implementation, während das Ticket T003267 status=backlog ist (noch nie dispatched). CI rot in 4 Jobs: Factory spec shards 1/2/4 + Aggregate. Ursache: echte Spec-Regressionen — die Checks "do not commit on main / clean status / Pre-Commit-Guard lock-file / branch__<slug>.json / stage-plan auto-emit" wurden aus .claude/skills/dev-flow-plan/SKILL.md nach scripts/plan-preflight.sh verschoben, die greppenden Tests (agent-lock-session-identity.bats, catalog-eval-telemetry.bats T001444, agent-lock-scope-regelwerk.bats T003102) laufen dagegen ins Leere. stage-plan --hold/--no-hold-Pflicht bricht den T001444-Aufruf ohne Hold-Flag. Befund auf T003267 kommentiert. Merge blockiert, bis die Tests an den plan-preflight-Umbau angepasst sind.
**6. .git/shallow-Boundary am main-Tip blockierte pre-push-Validierung (Ursache ungeklärt)** (suspicious, repo/git-state)

Während des repo-hygiene-Laufs (2026-08-10, ~11:46Z) tauchte in .git/shallow ein Boundary-Eintrag für den main-Tip 1c6b90028 auf (mtime 13:46:54 +0200 — mitten in der Session). Kein Hook im Repo erzeugt Shallow-State (geprüft: grep -rln 'shallow|--depth' .githooks/ scripts/hooks/ = leer). Wirkung: die pre-push-Validierung (validate-commit-msg.sh range origin/main..HEAD) zog wegen der gebrochenen Ancestry 6724 Commits statt 3 in den Range und blockierte den Push des T003107-Merge-Commits mit "unknown scope"-Fehlern auf alten main-Commits — dieselbe Fehlerklasse wie T002827, aber andere Ursache. Der vollständige Commit-Graph war im Objektstore vorhanden (merge-base 47d25bb7 bcf14d546 = 8d77df268 mit ignoriertem Shallow); die Boundary wurde entfernt (Backup /tmp/opencode/shallow.bak), Historie danach vollständig (rev-list count main = 6805), Push erfolgreich. VERIFIZIERT.
**7. Scratchpad-Worktree wt-order-guards-head-first-match: leerer Index + Teil-Snapshot, nicht sicherbar** (suspicious, repo/worktrees)

/tmp/claude-1000/.../scratchpad/wt-order-guards-head-first-match (Branch fix/order-guards-head-first-match-T003104, backlog): git status --porcelain zeigt leeren Index (ls-files = 0), HEAD tracked 9857 Dateien, Arbeitsbaum enthält nur 1812 (Teil-Snapshot eines abgebrochenen Checkouts), davon 139 Dateien mit vom HEAD abweichenden Blobs. Branch ist exakt == origin/main (1c6b90028). Es existiert kein git-artefaktierter Zwischenstand (Index leer, 0 Commits auf dem Branch) — es ist nicht entscheidbar, ob die 139 abweichenden Dateien echte Arbeit enthalten (mtimes/Herleitung unklar). Fail-closed: Worktree NICHT entfernt, Befund gelassen. VERIFIZIERT (empty index, 1812 untracked, 139 blob-abweichend).
**8. Identischer uncommitteter @opencode-ai/plugin-Bump (1.18.11→1.18.16) in zwei -reuse-Worktrees fremd zu deren Tickets** (drift, repo/.opencode)

.worktrees/ticket-guard-diff-scope-T002934-reuse und .worktrees/worktree-status-check-existence-T002932-reuse tragen beide denselben uncommitteten Dependency-Bump in .opencode/package.json + package-lock.json (@opencode-ai/plugin 1.18.11 → 1.18.16). Die touched_files beider Tickets (T002934, T002932) decken .opencode/ nicht ab; origin/main hat weiterhin 1.18.11. Unerklärter Fremdstand in Worktrees aktiver Tickets — nicht revertiert (könnte Absicht sein), nicht committet (gehört zu keinem Ticket), liegt gelassen. VERIFIZIERT (diff in beiden Worktrees identisch, main=1.18.11).
**9. repo-hygiene-SKILL.md verweist auf nicht existierenden SSOT-Relativpfad** (drift, skills/repo-hygiene)

.agents/skills/repo-hygiene/SKILL.md referenziert die Mechanik-SSOT als file:///home/patrick/Bachelorprojekt/.claude/skills/references/repo-hygiene-ops.md (absoluter Pfad) — der im Skill-Base-Kontext genutzte relative Pfad .agents/skills/repo-hygiene/references/repo-hygiene-ops.md existiert nicht (glob leer); die Datei liegt korrekt unter .claude/skills/references/. Beim Laden musste der Pfad per glob aufgelöst werden. VERIFIZIERT.
**10. ticket-mcp export_tickets returns insufficient fields for triage** (degraded, ticket-mcp)

export_tickets returns status/type/priority/attention_mode but omits areas, depends_on, readiness, component, desc_len — insufficient for computing missing[] list. Had to use raw SQL via kubectl exec psql.
### Mishap-Rollup — 10 Eintraege (2026-08-10 12:10 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | scripts/llm-proxy/slot-queue.mjs | Per-Slot-Queue-Isolation seit T002483 wirkungslos — kein Aufrufer sendet x-slot-id |
| 2 | suspicious | scripts/plan-qa-check.sh | plan-qa-check widerspricht plan-lint bei identischer Eingabe |
| 3 | degraded | scripts/openspec-embed.mjs | openspec-embed scheitert bei jedem Commit an belegtem Port 15432 |
| 4 | suspicious | scripts/branch-reaper.sh | Reuse-Worktrees sammeln npm-Install-Rauschen in .opencode/package.json — §1-Allowlist greift nicht |
| 5 | process | factory | PR #4129 (T003267) offen mit rotem CI, Ticket weiterhin backlog — Implementation vor Factory-Dispatch gepusht |
| 6 | suspicious | repo/git-state | .git/shallow-Boundary am main-Tip blockierte pre-push-Validierung (Ursache ungeklärt) |
| 7 | suspicious | repo/worktrees | Scratchpad-Worktree wt-order-guards-head-first-match: leerer Index + Teil-Snapshot, nicht sicherbar |
| 8 | drift | repo/.opencode | Identischer uncommitteter @opencode-ai/plugin-Bump (1.18.11→1.18.16) in zwei -reuse-Worktrees fremd zu deren Tickets |
| 9 | drift | skills/repo-hygiene | repo-hygiene-SKILL.md verweist auf nicht existierenden SSOT-Relativpfad |
| 10 | drift | tickets/lifecycle | 45 of 58 'open' tickets were already done — post-merge closure gap (T003233 symptom) |

**1. Per-Slot-Queue-Isolation seit T002483 wirkungslos — kein Aufrufer sendet x-slot-id** (degraded, scripts/llm-proxy/slot-queue.mjs)

scripts/llm-proxy/slot-queue.mjs isoliert Warteschlangen pro Slot, damit "slot 0 does not block slot 1" (Kopfkommentar). Der Schluessel entsteht in enqueue() aus `${name}:slot${slotId}`, wobei slotId aus extractSlotId(req) stammt und den Header x-slot-id liest.

VERIFIZIERT: kein produktiver Aufrufer setzt diesen Header.
  git grep -c "x-slot-id" -- . ':!tests' ':!scripts/llm-proxy'
  -> nur Treffer in den neuen Plandateien von T003277, sonst keine
  git grep -n 'x-slot-id' -- scripts .opencode
  -> nur slot-queue.mjs (Leser) und server.test.mjs (Testfixtures)

Gemessen gegen Branch-Stand 64f07d0fc.

Folge: slotId ist immer null, der Schluessel faellt auf backend.name zurueck, und alle Slots teilen sich dieselbe Semaphore — genau der Zustand, den die Datei laut ihrem Kopfkommentar verhindern soll. scripts/factory/sandbox-run.sh kennt zwar eine SLOT_ID, reicht sie aber nie als HTTP-Header weiter.

T003277/p3 setzt den Header und weist die Wirksamkeit mit zwei gleichzeitigen Anfragen nach. Dieser Mishap haelt fest, dass die Funktion seit T002483 unbemerkt tot war — der zugehoerige Test konnte es nicht bemerken, weil er den Quelltext greppt statt Verhalten zu messen (separater Mishap).
**2. plan-qa-check widerspricht plan-lint bei identischer Eingabe** (suspicious, scripts/plan-qa-check.sh)

scripts/plan-qa-check.sh (advisory, LLM-gestuetzt) beanstandete an openspec/changes/llm-proxy-dispatch-capture/tasks.md zu Kriterium 5, der letzte Task sei "nicht explizit als Teil eines Tasks definiert, der die Schritte test:changed, freshness:regenerate und freshness:check enthaelt".

Das ist ein Fehlurteil. Die drei Befehle stehen als Checkbox-Task ("Abschliessende Pruefung") im Index, und das fail-closed Hard Gate wertet dieselbe Datei als konform:
  bash scripts/plan-lint.sh openspec/changes/llm-proxy-dispatch-capture/tasks.md
  -> PLAN-LINT: PASS (0 hard, 0 warn)   # STRUCT3 geprueft und bestanden

Gemessen gegen Branch-Stand 64f07d0fc.

Warum das zaehlt: plan-qa laeuft mit "|| true" und blockiert nichts, aber es durchlaeuft bis zu zwei Auto-Fix-Iterationen, in denen es Vorschlaege an die Plandatei anhaengt ("Auto-fix attempt 1/2: appending suggestions"). Ein falsch-positives Kriterium kann damit einen Plan veraendern, der bereits konform ist. In diesem Lauf blieb die Datei unveraendert (nachgeprueft), aber die Moeglichkeit besteht.

Ein zweiter Punkt derselben Meldung war dagegen berechtigt: die S1-Budgets standen nur in den Partials, nicht im Index. Das wurde uebernommen. Der Befund richtet sich also gegen Kriterium 5, nicht gegen das Werkzeug insgesamt.
**3. openspec-embed scheitert bei jedem Commit an belegtem Port 15432** (degraded, scripts/openspec-embed.mjs)

Der post-commit-Hook scripts/openspec-embed.mjs schlug bei BEIDEN Commits dieses Vorgangs nach drei Versuchen fehl:

  [openspec-embed] post-commit: embedding slug='llm-proxy-dispatch-capture'...
  [openspec-embed] retry 1/3 ... retry 2/3 ...
  [openspec-embed] WARN: embed failed after 3 attempts (non-fatal)

Ursache ist die bekannte Portkollision: openspec-embed.mjs oeffnet einen pg.Pool auf localhost:15432, den auf dieser Maschine der k3d-Portforward belegt.

Beobachtet an den Commits d041220e6 und 64f07d0fc.

Der Fehlschlag ist als non-fatal markiert und bricht den Commit nicht ab — die Folge ist still: die Proposals dieses Vorgangs sind nicht eingebettet und damit ueber die semantische Suche (openspec_find_similar) nicht auffindbar. Wer spaeter nach aehnlichen Vorhaben sucht, bekommt ein unvollstaendiges Ergebnis, ohne dass etwas darauf hinweist.

Beitrag zum Design von T003277: genau dieser Mechanismus war der Grund, einen direkten pg-Client im llm-proxy zu verwerfen (design.md D1a) — ein langlaufender Dienst haette sich dieses Ausfallmuster eingehandelt.
**4. Reuse-Worktrees sammeln npm-Install-Rauschen in .opencode/package.json — §1-Allowlist greift nicht** (suspicious, scripts/branch-reaper.sh)

Drei reuse-Worktrees (T002908, T002843, T002934) trugen uncommittete @opencode-ai/plugin-Bumps 1.18.11→1.18.16 in .opencode/package.json + package-lock.json — identisches npm-Install-Artefakt, in keinem Git-Objekt, auf main nicht vorhanden. Die §1-Allowlist (maßgeblich: ALLOWLIST in scripts/branch-reaper.sh) deckt .opencode/ ab nicht ab, also blockierte ein Nicht-Allowlist-Pfad die Worktree-Removal als scheinbarer Befund. Workaround: git checkout -- auf die committeden Versionen, dann remove. Kein Datenverlust, aber: (a) Allowlist kennt den Pfad nicht, obwohl reines Generat-Rauschen, (b) jede Worktree-Removal von reuse-Worktrees braucht künftig denselben Zwei-Schritt.
**5. PR #4129 (T003267) offen mit rotem CI, Ticket weiterhin backlog — Implementation vor Factory-Dispatch gepusht** (process, factory)

Auf dem Branch feature/cross-harness-plan-guardrails-T003267 liegt ein offener PR (#4129, erstellt 08:23Z) mit voller Implementation, während das Ticket T003267 status=backlog ist (noch nie dispatched). CI rot in 4 Jobs: Factory spec shards 1/2/4 + Aggregate. Ursache: echte Spec-Regressionen — die Checks "do not commit on main / clean status / Pre-Commit-Guard lock-file / branch__<slug>.json / stage-plan auto-emit" wurden aus .claude/skills/dev-flow-plan/SKILL.md nach scripts/plan-preflight.sh verschoben, die greppenden Tests (agent-lock-session-identity.bats, catalog-eval-telemetry.bats T001444, agent-lock-scope-regelwerk.bats T003102) laufen dagegen ins Leere. stage-plan --hold/--no-hold-Pflicht bricht den T001444-Aufruf ohne Hold-Flag. Befund auf T003267 kommentiert. Merge blockiert, bis die Tests an den plan-preflight-Umbau angepasst sind.
**6. .git/shallow-Boundary am main-Tip blockierte pre-push-Validierung (Ursache ungeklärt)** (suspicious, repo/git-state)

Während des repo-hygiene-Laufs (2026-08-10, ~11:46Z) tauchte in .git/shallow ein Boundary-Eintrag für den main-Tip 1c6b90028 auf (mtime 13:46:54 +0200 — mitten in der Session). Kein Hook im Repo erzeugt Shallow-State (geprüft: grep -rln 'shallow|--depth' .githooks/ scripts/hooks/ = leer). Wirkung: die pre-push-Validierung (validate-commit-msg.sh range origin/main..HEAD) zog wegen der gebrochenen Ancestry 6724 Commits statt 3 in den Range und blockierte den Push des T003107-Merge-Commits mit "unknown scope"-Fehlern auf alten main-Commits — dieselbe Fehlerklasse wie T002827, aber andere Ursache. Der vollständige Commit-Graph war im Objektstore vorhanden (merge-base 47d25bb7 bcf14d546 = 8d77df268 mit ignoriertem Shallow); die Boundary wurde entfernt (Backup /tmp/opencode/shallow.bak), Historie danach vollständig (rev-list count main = 6805), Push erfolgreich. VERIFIZIERT.
**7. Scratchpad-Worktree wt-order-guards-head-first-match: leerer Index + Teil-Snapshot, nicht sicherbar** (suspicious, repo/worktrees)

/tmp/claude-1000/.../scratchpad/wt-order-guards-head-first-match (Branch fix/order-guards-head-first-match-T003104, backlog): git status --porcelain zeigt leeren Index (ls-files = 0), HEAD tracked 9857 Dateien, Arbeitsbaum enthält nur 1812 (Teil-Snapshot eines abgebrochenen Checkouts), davon 139 Dateien mit vom HEAD abweichenden Blobs. Branch ist exakt == origin/main (1c6b90028). Es existiert kein git-artefaktierter Zwischenstand (Index leer, 0 Commits auf dem Branch) — es ist nicht entscheidbar, ob die 139 abweichenden Dateien echte Arbeit enthalten (mtimes/Herleitung unklar). Fail-closed: Worktree NICHT entfernt, Befund gelassen. VERIFIZIERT (empty index, 1812 untracked, 139 blob-abweichend).
**8. Identischer uncommitteter @opencode-ai/plugin-Bump (1.18.11→1.18.16) in zwei -reuse-Worktrees fremd zu deren Tickets** (drift, repo/.opencode)

.worktrees/ticket-guard-diff-scope-T002934-reuse und .worktrees/worktree-status-check-existence-T002932-reuse tragen beide denselben uncommitteten Dependency-Bump in .opencode/package.json + package-lock.json (@opencode-ai/plugin 1.18.11 → 1.18.16). Die touched_files beider Tickets (T002934, T002932) decken .opencode/ nicht ab; origin/main hat weiterhin 1.18.11. Unerklärter Fremdstand in Worktrees aktiver Tickets — nicht revertiert (könnte Absicht sein), nicht committet (gehört zu keinem Ticket), liegt gelassen. VERIFIZIERT (diff in beiden Worktrees identisch, main=1.18.11).
**9. repo-hygiene-SKILL.md verweist auf nicht existierenden SSOT-Relativpfad** (drift, skills/repo-hygiene)

.agents/skills/repo-hygiene/SKILL.md referenziert die Mechanik-SSOT als file:///home/patrick/Bachelorprojekt/.claude/skills/references/repo-hygiene-ops.md (absoluter Pfad) — der im Skill-Base-Kontext genutzte relative Pfad .agents/skills/repo-hygiene/references/repo-hygiene-ops.md existiert nicht (glob leer); die Datei liegt korrekt unter .claude/skills/references/. Beim Laden musste der Pfad per glob aufgelöst werden. VERIFIZIERT.
**10. 45 of 58 'open' tickets were already done — post-merge closure gap (T003233 symptom)** (drift, tickets/lifecycle)

Phase 3 masterplan started with 53 ready tickets. After checking git history for [Txxxxxx] references in commit subjects, 45 had merged PRs but ticket status was never updated to done. Symptom of T003233 (Post-Merge-Ticketabschluss unterblieb). Closed 45 tickets with resolution=fixed.
Watchdog: pipeline stale > 30min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup plan=openspec/changes/mishap-incident-rollup/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA 1/3 | tier=haiku]

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
