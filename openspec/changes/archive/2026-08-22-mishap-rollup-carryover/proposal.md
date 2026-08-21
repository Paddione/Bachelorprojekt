# Proposal: mishap-rollup-carryover

## Why

**Teil 1 — Unerledigtes verfällt mit dem Container.** Ein Rollup-Container schließt per
Merge=Closure, sobald irgendein PR auf seinem Zyklus-Branch merged. Einträge, die dabei ohne
Disposition blieben, sind danach unrettbar: der nächste Flush legt einen frischen Container an,
und die Batch-Kommentare des alten liest niemand mehr.

```bash
# Zyklus 08-20/T012909, PR #4884 — 3 von 10 Einträgen erledigt, Container trotzdem done/fixed
git show --stat c0d881b7b
```

T013043 hat den Plan selbsterklärend gemacht (eine abhakbare Task je Eintrag mit
Pflicht-Disposition). Damit ist Unerledigtes **sichtbar** — weitergetragen wird es noch nicht.
Dieser Change schließt die Lücke.

**Teil 2 — der SSOT-Spec beschreibt den Lebenszyklus, den es nicht mehr gibt.**
`openspec/specs/mishap-rollup.md` trägt das Requirement *Rollup container SHALL be ephemeral* mit
dem Szenario *Generator closes the container after consuming its batches* (`THEN` … `done`,
`resolution=obsolete`). Seit T007056 stimmt das nicht: der Generator staged den Plan per
`stage-plan --no-hold`, die Factory dispatcht, der Post-Merge-Finalizer schließt mit
`resolution=fixed`. Verifiziert gegen den Skriptkopf von `scripts/factory/mishap-rollup.sh`, der
T007056 als Änderung ausdrücklich nennt.

Das trifft, wer den Spec als Wahrheit liest — die Prior-Art-Suche aus `dev-flow-plan` Schritt 0.7
tut genau das. Der Purpose des Specs fehlte zudem und forderte im Platzhalter selbst, ihn beim
nächsten inhaltlichen Delta zu ergänzen.

## What

**Carry-over** in `scripts/factory/rollup-carryover.sh`, zwei per Datei/Verzeichnis testbare Modi:

- `--plan <tasks.md> --slug <quell-slug>` rendert die offenen Eintrags-Tasks eines Zyklus-Plans als
  regulären Batch-Body — Header `### Mishap-Rollup`, Einträge im Flusher-Muster. Der Übertrag geht
  damit durch dieselbe Tür wie ein frischer Flush und wird von `rollup-plan-tasks.sh` mitgezählt.
  Exit 3, wenn nichts offen ist.
- `--scan <repo> --container <id>` listet die übertragbaren Zyklen. Ausgeschlossen sind der
  laufende Zyklus (er würde seine eigenen Einträge verdoppeln) und alle bis auf den jüngsten
  Kandidaten — dessen Plan enthält per Konstruktion bereits die Übernahmen der älteren.

`mishap-rollup.sh` ruft beides vor dem Lesen der Kommentare auf, idempotent über den Quell-Slug im
Kommentar-Header. Ein Fehlschlag bricht den Rollup nicht ab: der Quell-Plan bleibt liegen, der
nächste Lauf holt es nach.

**Keine Rückwirkung:** Zyklen vor T013043 haben keine Eintrags-Checkboxen und liefern keine
Treffer — gegen das aktuelle Repo endet `--scan` mit Exit 3. Der Carry-over greift ab dem ersten
Zyklus, der mit der neuen Plan-Struktur erzeugt wurde.

**Spec:** `MODIFIED`-Delta auf *Rollup container SHALL be ephemeral* (Staged-Lane statt
Generator-Closure), `ADDED`-Requirement für den Carry-over, und der fehlende Purpose direkt im
SSOT.

_Ticket: T013108_
