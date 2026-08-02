# Proposal: mishap-consolidation-T002375

_Ticket: T002375 (Epic)_

## Why

Zum Stichtag 2026-07-27 lagen 19 offene Mishap-Bundles mit rund 45 protokollierten Einzel-Frictions
vor. Sie einzeln abzuarbeiten hätte 19 Vorgänge, 19 Worktrees und 19 PRs bedeutet — bei einer
Fehlerklasse, die sich zu einem großen Teil auf **wenige gemeinsame Wurzeln** zurückführen lässt.

Die Recon hat das belegt. Drei Beispiele, die den Zuschnitt tragen:

1. **Eine falsch benannte Umgebungsvariable erklärt einen ganzen Cluster.**
   `scripts/agent-lock.sh:30` liest `CLAUDE_SESSION_ID`. Die Claude-Code-Harness exportiert
   `CLAUDE_CODE_SESSION_ID`. Die Variable ist damit immer leer, der Code fällt auf
   `ps -o sess= -p $$` durch (Zeile 32) — und *das* ist pro Bash-Tool-Call verschieden. Daraus
   folgen unmittelbar T002325-M3 und T002338-M3 ("Session kann eigenen Lock nicht ohne `--force`
   freigeben") sowie der zweite, verschärfende Effekt von T002372-M1.

2. **Ein Guard, den die eigene Anleitung strukturell unerfüllbar macht.**
   `dev-flow-plan` Schritt 5 vergleicht den HEAD-Branch mit dem `branch`-Feld des ticket-scoped
   Locks. `cmd_claim` füllt dieses Feld aber nur für **branch**-scoped Claims automatisch
   (`agent-lock.sh:253`); für ticket-scoped Claims bleibt es leer, und die Skill dokumentiert den
   Claim ohne `--branch`. Der Guard vergleicht also die leere Zeichenkette gegen den HEAD-Branch
   und schlägt zwangsläufig fehl.

3. **Tests, die grün sind, weil sie ihre eigene Vorbedingung herstellen.**
   `tests/spec/agent-lock-session-identity.bats:32` setzt `CLAUDE_SESSION_ID` selbst und prüft
   dann, dass es verwendet wird. Der Test ist grün und der Mechanismus real kaputt. Dieselbe Klasse
   trifft `tests/spec/software-factory.bats`, das über `PIPELINE_SCRIPT` und `PJS` auf
   `scripts/factory/pipeline.js` zeigt — dispatcht wird ausschließlich `pipeline.mjs`.

Der letzte Punkt ist der teuerste: alle Kontrakttests der Software Factory prüfen seit unbekannter
Zeit eine Datei, die nicht ausgeführt wird. Eine Regression in `pipeline.mjs` bleibt unentdeckt,
und der grüne Testlauf hält die gegenteilige Zusicherung aufrecht.

## What

Ein Epic-Ticket (T002375) mit **sieben Partials**, geschnitten nach Datei-Eigentum, damit
`plan-lint` D1 (keine Datei in zwei Partials) erfüllt ist und die Partials parallel laufen können.

| Partial | Rolle | Thema | Adressierte Mishaps |
|---|---|---|---|
| p1 | impl | Session-Identität in `agent-lock.sh` | T002325-M3, T002338-M3, T002372-M1, T002341-M3, T002363 |
| p2 | impl | Worktree-Schreibschutz als `PreToolUse`-Hook | T002355-M3, T002352-M1, T002351-M3 |
| p3 | impl | CLI-Flag-Drift `stage-plan` / `archive-plan` | T002372-M2, T002325-M2, T002371-M1 |
| p4 | impl | Freshness-Gate und `test:changed` | T002273-M1, T002352-M3, T002364-M3 |
| p5 | impl | OpenSpec-Lifecycle (`propose --resume`, Delta-Disziplin) | T002356-M2, T002356-M3, T002354-M1 |
| p6 | impl | Konventions- und Doku-Drift | T002342-M1/M2/M3, T002355-M1/M2, T002338-M1, T002341-M2 |
| p7 | tests | Test-Substanz, `pipeline.js`-Dublette | T002372-M3, T002364-M1, T002356-M1, T002338-M2, T002351-M2 |

Die drei größten Verhaltensänderungen:

- **`_my_sid` akzeptiert die real exportierte Harness-Variable.** Damit wird `release` ohne
  `--force` wieder der Normalfall. Das ist mehr als Bequemlichkeit: solange der Normalfall
  `--force` erzwingt, gewöhnt sich jeder Aufrufer daran — und räumt irgendwann den Lock einer
  wirklich fremden, lebenden Session ab.
- **Ein `PreToolUse`-Hook macht aus dem kooperativen Lock einen wirksamen.** T002355-M3 belegt eine
  fremde Session, die ohne Claim im geclaimten Worktree schrieb und pushte; entdeckt wurde das nur
  zufällig über einen "File has been modified since read"-Fehler des Write-Tools.
- **`scripts/factory/pipeline.js` wird gelöscht**, `eval-replay.mjs` und die BATS-Kontrakttests
  zeigen auf `pipeline.mjs`. Damit prüfen die Tests wieder den ausgeführten Pfad.

## Abgrenzung

Bewusst **nicht** Teil dieses Changes:

| Ausgeschlossen | Grund |
|---|---|
| T002282, T002307, T002338, T002347, T002250 | Haben bereits `plan_ref`, eigenen Worktree bzw. offenen PR (#3400). Doppelarbeit und Datei-Kollision mit lebenden Sessions. |
| T002357, T002253 | Bereits als fertiger `docs(agents)`-Commit in lebenden `dev-flow-chore`-Worktrees; mergen sich selbst. |
| T002354-M2 (Factory-Livelock) | Läuft als T002361 mit eigenem Plan. |
| T002325-M1, T002341-M1, T002364-M2 | Bereits behoben durch `600be89a1` [T002366] (gemergt und archiviert): `stage-plan` und `release-hold` wecken `factory.service` non-blocking. Dieser Change **verifiziert** den Zustand und schließt die Tickets, baut aber nichts neu. |
| T002351-M1 (sporadische CI-Fehlschläge) | Reine Beobachtung ohne reproduzierbare Ursache; drei Hypothesen wurden bereits geprüft und widerlegt. Die im Ursprungs-Ticket eingebaute Diagnoseausgabe bleibt stehen, bis ein weiteres Auftreten auswertbar ist. |
| `scripts/devflow-ci-watch.sh` | Wird von PR #3400 (T002282) angefasst. Dieser Change berührt die Datei nicht; die Direktive aus T002351-M3 landet ausschließlich in `ci-fix-loop.md`. |
