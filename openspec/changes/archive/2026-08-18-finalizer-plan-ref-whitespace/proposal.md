# Proposal: finalizer-plan-ref-whitespace

## Why

`json_field()` in `scripts/devflow-post-merge-finalize.sh` entfernt per sed-Zeichenklasse
`[:space:]` **alle** Leerzeichen aus dem extrahierten JSON-Wert. Für `status` und `type` ist
das folgenlos; `plan_ref` trägt aber einen zusammengesetzten Wert:

```
FACTORY-PLAN-REF branch=<branch> plan=<pfad>
```

Ohne Leerzeichen verschmelzen beide Felder. Die nachgelagerte Extraktion
`grep -oE 'branch=[^ ]+'` matcht dann bis Zeilenende und liefert
`<branch>plan=<pfad>` statt `<branch>`.

Mit diesem korrupten Branchnamen findet die branch-exakte Worktree-Auflösung nichts, fällt auf
den Slug-Platzhalter zurück und Schritt 10 meldet „Worktree bereits entfernt" — während
Worktree und Branch liegen bleiben. Schritt 7 und 8 (Plan- und OpenSpec-Archiv) laufen aus
demselben Grund ins Leere. Alle drei Fehlschläge erscheinen als `[skip]`, das Skript endet mit
Exit 0 und meldet „abgeschlossen"; deshalb fiel es nicht auf.

Betroffen ist jeder Aufruf ohne explizites `--branch` — also der Regelpfad, den
`dev-flow-execute` (Schritt 3.9 und 6.4) verwendet:
`bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"`.

Beobachtet an T012240: zwei aufeinanderfolgende Läufe mit Exit 0 ließen Worktree und Branch
stehen; erst ein Lauf mit explizitem `--branch` zeigte den Unterschied.

Abgrenzung: unabhängig von T008014 (Slug-Raten) und T012240 (Slug-Vorrang ohne Branch-Prüfung).
Beide Fixes sind korrekt und isoliert verifiziert — dieser Defekt macht sie im Regelpfad
wirkungslos, weil der Branchname schon vor der Auflösung zerstört ist.

## What

Ein zweiter Extraktor `json_field_raw()` trägt nur die JSON-Syntax um den Wert herum ab
(Feldname, Doppelpunkt, umschließende Quotes) und lässt den Inhalt unangetastet. `plan_ref`
wird darüber gelesen. `json_field()` bleibt für Felder ohne bedeutungstragende Leerzeichen
bestehen und dokumentiert diese Einschränkung.

_Ticket: T012243_
