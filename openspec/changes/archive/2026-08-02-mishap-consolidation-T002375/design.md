# Design: mishap-consolidation-T002375

_Ticket: T002375 (Epic) · Delta: `specs/active-sessions-hub.md`_

## Zweck

Dieses Dokument hält fest, **warum** die 12 Mishap-Bundles so und nicht anders geschnitten wurden,
und begründet die vier Entscheidungen, die im Brainstorming getroffen wurden. Die Fehleranalyse
selbst steht in `proposal.md`; hier steht der Entwurf.

## Verifizierte Befunde

Jede Zeile wurde am Code geprüft, nicht aus dem Ticket übernommen.

| Befund | Nachweis |
|---|---|
| `_my_sid` liest eine nie gesetzte Variable | `scripts/agent-lock.sh:30` prüft `CLAUDE_SESSION_ID`; `env \| grep -c '^CLAUDE_SESSION_ID='` liefert `0`, während `CLAUDE_CODE_SESSION_ID` gesetzt ist |
| Der Fallback ist pro Call verschieden | `agent-lock.sh:32` — `ps -o sess= -p $$`; zwei aufeinanderfolgende Tool-Calls liefern verschiedene Werte |
| Ticket-Claims tragen kein `branch` | `agent-lock.sh:253` füllt `BRANCH` nur für `SCOPE=branch`; `agent-lock.sh:199` schreibt sonst die leere Zeichenkette |
| Die SSOT schreibt den falschen Namen vor | `openspec/specs/active-sessions-hub.md:37` nennt normativ `CLAUDE_SESSION_ID` |
| `stage-plan` kennt weder `--slug` noch `--plan-file` | `scripts/vda/ticket/stage-plan.sh:9-14` akzeptiert nur `--id --branch --plan --partials --hold` |
| `--partials` ist Pflicht | `stage-plan.sh:19` — `case "$partials" in [1-9]` |
| `archive-plan` nutzt den anderen Namen | `scripts/ticket.sh:146` — `--plan-file` |
| BATS zeigt auf die tote Datei | `tests/spec/software-factory.bats:10,20,95,480` setzen `scripts/factory/pipeline.js` |
| Dispatcht wird die ESM-Datei | `scripts/factory/dispatcher-bridge.sh:98`, `scripts/factory/run-pipeline.mjs:136` |
| Beide Dateien sind sanktioniert | `docs/code-quality/gates.yaml:61-68` — beide auf der `s1.ignore`-Liste |
| `CLAUDE.md` verlangt ein deprecatetes Skript | `CLAUDE.md:49` nennt `scripts/plan-frontmatter-hook.sh`, das Skript meldet sich als deprecated |
| `PreToolUse`-Hooks existieren bereits | `.claude/settings.json` führt `PreToolUse` und `SessionStart` |
| `test:changed` zieht E2E mit | `Taskfile.yml:914` ruft `task test:e2e:services` bei gesetztem `RUN_E2E_SERVICES` |
| `openspec.sh propose` hat keinen Resume-Pfad | `scripts/openspec.sh:47` — `[[ -e "$dir" ]] && die "change … already exists"` |
| `plan-lint` W3 ist der Warntext | `scripts/plan-lint.sh:335-348` |

## Entscheidungen

### E1 — Schnitt nach Datei-Eigentum, nicht nach Thema

`plan-lint` D1 verbietet, dass eine Datei in zwei Partials liegt. Ein rein thematischer Schnitt
hätte `scripts/agent-lock.sh` in mindestens drei Partials gelegt (Session-Identität,
Branch-Feld, Enforcement). Der Schnitt folgt deshalb den Dateien: **p1 besitzt `agent-lock.sh`
allein**, p2 besitzt den neuen Hook und die Harness-Config.

Folge, die bewusst in Kauf genommen wird: p6 ist mit sieben Dateien das breiteste Partial, weil
Doku-Drift naturgemäß über viele Dateien streut. Es ist dafür das risikoärmste — es ändert kein
Laufzeitverhalten außer der commitlint-Allowlist.

### E2 — Der Enforcement-Hook blockiert, er warnt nicht

Gewählt wurde die blockierende Variante. Begründung: die warnende Variante existiert de facto
bereits. `dev-flow-plan` und `CLAUDE.local.md` sagen beide, dass im Hauptcheckout nicht mutiert
wird — T002357-M1 ist trotzdem passiert, und T002355-M3 belegt eine fremde Session, die ohne Claim
in einem geclaimten Worktree schrieb **und pushte**. Eine Warnung mehr hätte daran nichts geändert.

Die Gegenkraft ist das Risiko, legitime Arbeit zu blockieren. Dagegen drei Vorkehrungen:

1. Der Hook greift **nur**, wenn für die Session ein Branch-Claim mit `--worktree` existiert. Ohne
   Claim ändert sich nichts — der bisherige Ablauf bleibt unverändert gültig.
2. Pfade außerhalb des Repo-Roots sind unberührt.
3. Ein Bypass über eine Umgebungsvariable, die in der Ablehnungsmeldung genannt wird. Das folgt
   dem Muster von `SKIP_BRANCH_CHECK` und `SKIP_COMMIT_VS_DIFF` in diesem Repo.

### E3 — T002363 wird absorbiert statt separat gemergt

`origin/chore/agent-lock-claim-strict-args-T002363` trägt einen Commit (`1c26c3d66`), der
`scripts/agent-lock.sh` um Argument-Validierung härtet und dafür 72 Zeilen in
`tests/spec/active-sessions-hub.bats` mitbringt. Der zugehörige Worktree ist verschwunden, der Lock
steht aber weiter auf `live` — der Vorgang ist selbst eine Instanz von T002341-M3.

Beide Dateien gehören zu p1. Ein separater Merge hieße: p1 blockiert bis dahin, und danach ein
Rebase auf genau der Datei, die p1 am stärksten umbaut. Die Absorption vermeidet das. Der Commit
wird per `git cherry-pick` übernommen, damit die Autorschaft erhalten bleibt.

**Reihenfolge in p1:** erst cherry-pick, dann die eigenen Änderungen. Andernfalls kollidiert der
Pick mit dem neu geschriebenen `cmd_claim`.

### E4 — `pipeline.js` wird gelöscht, nicht gespiegelt

Drei Optionen standen im Mishap-Text: löschen, Tests umhängen, oder ein Drift-Test zwischen beiden
Dateien. Gewählt wird **löschen**.

Der Drift-Test ist die schlechteste Option: er zementiert die Dublette und erzeugt laufende Kosten
für eine Datei, die niemand ausführt. Das reine Umhängen der Tests lässt die tote Datei liegen und
damit die nächste Session in dieselbe Falle laufen. Löschen trifft die Ursache.

Einziger echter Abhänger ist `scripts/factory/eval-replay.mjs:87`. Der wird auf `pipeline.mjs`
umgestellt. Beide Einträge fallen aus der `s1.ignore`-Liste in `docs/code-quality/gates.yaml` auf
einen zusammen.

**Risiko:** Wenn ein Kontrakttest nach dem Umhängen rot wird, ist das kein Fehler des Umbaus,
sondern eine **echte, bislang unentdeckte Regression in `pipeline.mjs`**. Der Plan behandelt sie
deshalb als Befund und nicht als Blocker: p7 protokolliert sie, statt den Test anzupassen.

## Rückverfolgbarkeit Mishap → Partial

| Ticket | Mishap | Partial | Kern |
|---|---|---|---|
| T002325 | M3 | p1 | SID-Drift beim `release` |
| T002338 | M3 | p1 | SID-Drift, Subshell-Claim |
| T002372 | M1 | p1 | ticket-Lock ohne `branch` |
| T002341 | M3 | p1 | verwaiste Locks trotz toter PID |
| — | T002363 | p1 | Argument-Validierung in `cmd_claim` (absorbiert) |
| T002355 | M3 | p2 | Worktree-Race ohne Claim |
| T002352 | M1 | p2 | `cd X && cmd \|\| fallback` trifft den Hauptcheckout |
| T002351 | M3 | p2 | Background-Monitor-Verbot wird ignoriert |
| T002372 | M2 | p3 | `--slug` existiert nicht, `--partials` undokumentiert Pflicht |
| T002325 | M2 | p3 | `--plan` gegen `--plan-file` |
| T002371 | M1 | p3 | Port-Forward liefert korrupte Zeilen |
| T002273 | M1 | p4 | `repo-index` braucht zwei Runden |
| T002352 | M3 | p4 | "stale" wo "uncommitted" zutrifft |
| T002364 | M3 | p4 | `test:changed` zieht E2E gegen `localhost:4321` |
| T002356 | M2 | p5 | Status springt auf `in_progress` statt `plan_staged` |
| T002356 | M3 | p5 | `propose` ohne Resume-Pfad |
| T002354 | M1 | p5 | Delta plus SSOT-Direktedit kippt `archive` |
| T002342 | M1 | p6 | `plan-lint` W3 falsch positiv |
| T002342 | M2 | p6 | `CLAUDE.md` verlangt deprecatetes Skript |
| T002342 | M3 | p6 | `chore(batch)` / `chore(ingest)` nie registriert |
| T002355 | M1 | p6 | Branch-Naming-Meldung nennt die Ursache nicht |
| T002355 | M2 | p6 | ticket-ops filtert `is_test_data` nicht |
| T002338 | M1 | p6 | Triage liest Beschreibungen gekürzt |
| T002341 | M2 | p6 | Kollisionswarnung falsch positiv |
| T002372 | M3 | p7 | BATS prüft `pipeline.js`, dispatcht wird `pipeline.mjs` |
| T002364 | M1 | p7 | Scheintest, den ein Kommentar erfüllt |
| T002356 | M1 | p7 | Negativtest ohne Positiv-Anker |
| T002352 | M2 | p7 | Substring-Grep über die ganze SSOT |
| T002338 | M2 | p7 | `$`-Anker scheitert an CRLF |
| T002351 | M2 | p7 | BATS-Dateiende-Kollisionen, `bats --count` |

## Offene Punkte

- **`retry_count`-Spalte:** p5 berührt `reconcile-ticket-status.sh`. T002361 (Factory-Livelock)
  fasst dieselbe Spalte an. Die Zuständigkeitsgrenze: T002361 besitzt den Retry-Zähler,
  p5 besitzt ausschließlich die Statusübergangs-Bedingung. Sollte T002361 vor diesem Change
  mergen, rebased p5 darauf.
- **T002351-M1** bleibt offen und unerklärt (siehe `proposal.md` § Abgrenzung).
