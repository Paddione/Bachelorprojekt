# Proposal: fix-factory-readiness-gate

## Why

Der Readiness-Guard `scripts/factory/readiness-check.sh` implementiert das
Requirement „Feature-Branch Readiness-Check" vollständig — inklusive der
Behandlung des Literalstrings `"null"` — hat aber außerhalb seiner eigenen
Testdatei **keinen Aufrufer**. Das Netz ist geschrieben und nirgends aufgehängt;
dritter Fall dieser Klasse nach `routing-check.sh` (T003538) und
`reap-provider-slots.sh` (T002359).

**Symptom (beobachtet, nicht angenommen):** Am 2026-08-11 lagen 111 Tickets in
`backlog` (brand=mentolder), davon nur 8 mit `FACTORY-PLAN-REF`. Die planlosen
wurden trotzdem gelauncht und liefen ins Leere.

**Ursache (belegt):**

1. `scripts/vda/factory-prep.sh:245` setzt bei fehlendem `plan_ref` die
   Bash-Literale `branch=null; plan_path=null`; Zeile 310 reicht sie per
   `jq --arg` weiter — im Prep-JSON steht damit der **String** `"null"`, nicht
   JSON-`null`. Jedes `// ""`-Fallback und jedes `-n`-Guard greift daneben.
2. `scripts/factory/dispatcher-bridge.sh:126` fängt `worktree_path == "null"` ab
   und fällt auf `$REPO` zurück — den **Haupt-Checkout**.
3. `scripts/factory/opencode-exec.sh:14` prüft nur `[[ -n "$BRANCH" ]]`; `"null"`
   passiert den Guard. Der Prompt lautet dann wörtlich `COMMITTED on null`.

**Schaden:** Der T003740-Lauf rebasete im Haupt-Checkout den dort ausgecheckten
Fremd-Branch `fix/sdlc-stack-image-pull-always`, **benannte ihn um** zu
`fix/sdlc-console-imagepull-always-T003740` und committete fremde Änderungen
hinein (`git reflog HEAD@{1}`, 2026-08-11). Nichts ging verloren, aber der
Arbeitsstand einer anderen Session lag danach unter fremdem Namen.

Sekundär staut sich der Backlog: planlose Tickets belegen die drei Slots pro Tick
(`FACTORY_GLOBAL_CAP=3`), enden `implement/blocked`, fallen per Watchdog nach
`backlog` zurück und werden im nächsten Tick erneut gezogen — sie verdrängen die
tatsächlich bearbeitbaren Tickets.

## What

Den bestehenden Guard aufhängen, statt seine Logik ein zweites Mal zu schreiben:

1. **`dispatcher-bridge.sh`** ruft `check_ticket_readiness "$branch" "$plan_path"`
   vor dem Launch auf. Nicht ready → Launch überspringen, Grund auf stderr, Slot
   freigeben. Der Guard behandelt `"null"` bereits selbst (Zeile 11), es braucht
   keine zusätzliche Normalisierung an der Aufrufstelle.
2. **`opencode-exec.sh`** als zweite Verteidigungslinie: `"null"` zu leer
   normalisieren und ohne Branch/Plan mit `implement/blocked`
   (`reason=no_plan`) abbrechen, statt in den Haupt-Checkout auszuweichen.

**Nicht in diesem Change:** der Planweg für die ~103 planlosen Backlog-Tickets.
Ob `pipeline.mjs` (Scout → Design → Plan) für sie wieder greifen soll oder der
Executor pro Ticket gewählt wird, ist eine Architekturentscheidung mit eigenem
Ticket. Dieser Change sorgt nur dafür, dass sie **sichtbar** liegen bleiben,
statt Slots zu verbrennen und fremde Branches umzubenennen.

_Ticket: T003773_
