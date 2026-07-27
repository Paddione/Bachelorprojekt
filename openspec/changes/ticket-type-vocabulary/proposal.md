# Proposal: ticket-type-vocabulary

## Why

`tickets.type` und der Commit-Typ benennen dieselbe Sache verschieden: ein Fehler ist als Ticket
ein `bug`, als Commit ein `fix`. Teil A (T002328) hat die Commit-**Scopes** auf 14 Domänen-Werte
konsolidiert; dieser Change zieht das **Typ**-Vokabular nach, damit Ticket und Commit dieselben
Wörter benutzen.

Der Anlass ist nicht nur Kosmetik. Weil das Vokabular auseinanderläuft, wird der Dispatcher-Filter
in `scripts/factory/queue.sh` als Whitelist gepflegt — und genau dort fehlte ein Wert: **T002333**
(`type=bug` mit `status=plan_staged` ist für den Dispatcher unsichtbar, Bug-Pläne bleiben liegen).
Dieser Change behebt das mit, indem die Lane auf eine Negativliste umgestellt wird, die diesen
Fehler strukturell nicht mehr machen kann.

## What

`tickets.type` erhält das Conventional-Commit-Vokabular mit zehn Werten:

    bug     → fix        feature → feat        task → chore        project bleibt
    neu wählbar: docs, refactor, perf, test, ci, build

**Dual-Vokabular als Übergang.** Der CHECK-Constraint akzeptiert vorübergehend die alten *und*
die neuen Werte; alle lesenden Stellen kennen beide. Damit entfällt die Anforderung, die
abhängigen Views atomar mitzuziehen — sie sind vor und nach der Datenmigration korrekt. Die
Altwerte fallen in Teil D (T002331, Schema-Diät) aus dem Constraint.

**Drei Stellen, die das Ticket nicht nennt** und die still brechen würden:

1. `migrations.ts:11` setzt den CHECK inline via `ADD COLUMN IF NOT EXISTS` — bei bestehender
   Spalte ein No-op. Die Zeile zu ändern bewirkt live *nichts*. Der Constraint muss auf das
   benannte `DROP`/`ADD`-Muster umgestellt werden, das dieselbe Datei für `status` und `effort`
   bereits verwendet.
2. Der Trigger `trg_notify_feature_inserted` feuert `WHEN (NEW.type = 'feature')` und wäre nach
   der Migration dauerhaft stumm.
3. `planning-office.ts:249` (`VALID_TYPES`) und sechs Enum-Stellen in `scripts/ticket-mcp/go/`.

**Nicht in diesem Change:** `/admin/bugs`, `bug-report.ts` und die `scope`-Spalte gehören zu
Teil C (T002330); das Entfernen der Altwerte aus dem CHECK zu Teil D (T002331).

_Ticket: T002329_
