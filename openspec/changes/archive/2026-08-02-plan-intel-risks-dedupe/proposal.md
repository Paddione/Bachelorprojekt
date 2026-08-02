# Proposal: plan-intel-risks-dedupe

## Why

`scripts/plan-intel.sh` haengt bei jedem Lauf denselben generierten `risks[]`-Eintrag erneut an
`openspec/changes/<slug>/intel.json` an. Reproduziert am 2026-08-02: drei Laeufe ergeben drei
identische Eintraege. Weil vier von elf Tests in `tests/spec/dev-flow-plan/task-context.bats` den
Generator aufrufen, hinterlaesst jeder Testlauf eine geaenderte, committbare Datei. Der
Arbeitsbaum erscheint danach "dirty", obwohl niemand etwas bearbeitet hat — das verrauscht den
Vorcheck `git status --porcelain MUSS leer sein` vor jedem Worktree-Remove und verleitet dazu,
echte ungetrackte Arbeit zu uebersehen oder das Rauschen mitzucommitten.

Ursache verifiziert in `scripts/plan-intel.sh:166-169`: Zeile 166 setzt `RISKS` neu auf den
frisch generierten Eintrag, Zeile 169 haengt den kompletten `risks[]`-Block des vorherigen Laufs
an — der denselben Eintrag bereits enthaelt. Fuer die manuell gepflegten Felder `api_contracts`
und `external_types` ist dieses Uebernahme-Muster korrekt; fuer ein Feld, das der Generator jeden
Lauf neu erzeugt, addiert es eine Kopie pro Lauf.

## What

Der Merge dedupliziert `risks[]` nach `(note, severity)`. Manuell nachgetragene Risiken
ueberleben, die Generator-Duplikate verschwinden, und `intel.json` wird ab dem zweiten Lauf
byte-identisch.

Nicht im Scope: `EXISTING_INTEL` (`:47`) ignoriert `--out` und liest damit aus einer anderen
Datei, als geschrieben wird. Eigenstaendiger Defekt mit anderen Reproschritten, erfasst als
T002540; beruehrt dieselbe Datei und darf deshalb nicht parallel eingeplant werden.

_Ticket: T002515_
