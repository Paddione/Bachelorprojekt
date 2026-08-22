# p1 — Scan-Wrapper `scripts/health-goals-scan.sh`

_Ticket: T013306 · Rolle: impl · depends_on: p6_

Der Wrapper ist die einzige Stelle, an der die Messung angestoßen wird. Er macht die
„nicht messbar"-Regel aus REQ-HEALTH-GOALS-012 ausführbar und testbar, ohne Browser und ohne
TypeScript-Laufzeit.

## Zieldateien

- `scripts/health-goals-scan.sh` (NEU, ca. 130 Zeilen, S1-Limit `.sh` 800)

## Vertrag

```
Usage: bash scripts/health-goals-scan.sh <GOAL-ID> [<GOAL-ID> ...]

stdout: JSON-Array, ein Objekt je ANGEFORDERTER ID, Reihenfolge wie übergeben:
  [{"id":"G-CQ06","measurable":true,"actual":0,"cmp":"le","target":1},
   {"id":"G-IF01","measurable":false}]
exit 0  Messlauf durchgeführt (auch wenn einzelne Ziele nicht messbar waren)
exit 2  Eingabefehler: unbekannte oder fehlende ID (Meldung auf stderr nennt die ID)
```

## Aufgaben

- [ ] Kopf wie die übrigen Skripte: `set -uo pipefail`, `cd "$(git rev-parse --show-toplevel)"`.
      `set -e` **nicht** setzen — `health-goals-check.sh` endet bei verfehlten Zielen bewusst mit
      Exit ungleich 0, und das ist hier kein Fehler.

- [ ] ID-Validierung gegen das generierte Artefakt (REQ-HEALTH-GOALS-013). Die gültige Menge sind
      die `id`-Felder aus `components/website/src/lib/sdlc/goals-data.generated.json` — dieselbe
      Liste, die das Dashboard anzeigt. Auslesen per `python3`:

```bash
KNOWN=$(python3 -c "
import json
print('\n'.join(g['id'] for g in json.load(open('components/website/src/lib/sdlc/goals-data.generated.json'))))")
```

      Jede übergebene ID muss exakt in dieser Liste stehen. Trifft das nicht zu: Meldung auf
      stderr mit der abgelehnten ID, Exit 2, **kein** Messlauf. Eine reine Zeichen-Whitelist
      genügt nicht — sie ließe wohlgeformte, aber unbekannte IDs an `--only=` durch.

- [ ] Ohne Argumente: Exit 2 mit Usage auf stderr. Ein Lauf ohne IDs würde sonst als `--only=`
      mit leerem Wert alle Ziele messen.

- [ ] Messung anstoßen. `HG_VALUES_FILE` auf eine per `mktemp` erzeugte Datei setzen, mit `trap`
      aufräumen. Der Report-Text von `health-goals-check.sh` gehört nicht auf stdout — dort steht
      ausschließlich das JSON:

```bash
VALUES=$(mktemp); trap 'rm -f "$VALUES"' EXIT
HG_VALUES_FILE="$VALUES" bash scripts/health-goals-check.sh --quiet --only="$IDS_CSV" >&2
```

      `--fast` nur durchreichen, wenn der Aufrufer es anfordert (`--fast` als eigenes Flag). Nicht
      per Vorgabe setzen: `db_scalar()` schaltet im Fast-Modus auf den SKIP-Sentinel und würde
      jedes Datenbank-Ziel still als „nicht messbar" ausweisen (REQ-HEALTH-GOALS-008).

- [ ] Ergebnis zusammensetzen. `HG_VALUES_FILE` enthält Zeilen `<id> <actual> <cmp> <target>` —
      **nur** für tatsächlich gemessene Ziele. Für jede angeforderte ID nachschlagen; fehlt die
      Zeile, ist der Eintrag `{"id":"…","measurable":false}` ohne `actual`-Feld. Der dokumentierte
      Wert darf an dieser Stelle **nicht** eingesetzt werden.

      Das JSON mit `python3 -c` bauen, nicht per String-Konkatenation: Titel und Werte müssen
      korrekt escaped sein, und ein handgebautes JSON bricht beim ersten Sonderzeichen.

- [ ] Kein Schreibzugriff auf `.claude/lib/goals.md` und keine Regeneration des Artefakts
      (REQ-HEALTH-GOALS-011). Insbesondere `scripts/health-goals-update.sh` **nicht** aufrufen.

- [ ] `chmod +x` setzen und den Header-Kommentar im Stil der Nachbarskripte schreiben: Zweck,
      Usage, Exit-Codes, und der Hinweis, warum der Wrapper die SSOT nicht anfasst.

## Abschluss dieses Partials

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/dashboard-rescan.bats
# expected: PASS
```
