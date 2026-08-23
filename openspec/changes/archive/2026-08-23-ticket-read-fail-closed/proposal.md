# Proposal: ticket-read-fail-closed

## Why

Die Lesepfade von `scripts/ticket.sh` unterscheiden nicht zwischen *kein Treffer* und
*falsche Frage*. Beides ergibt eine leere Antwort mit Exit 0:

```bash
bash scripts/ticket.sh list --status open       # -> []  rc=0   ('open' ist kein gueltiger Status)
bash scripts/ticket.sh list --status bogusxyz   # -> []  rc=0
bash scripts/ticket.sh get  --id T999999        # -> ''  rc=0   (Ticket existiert nicht)
```

Ein Agent, der „gibt es offene Tickets?" fragt, bekommt damit eine Antwort, die wie **nein**
aussieht und **falsche Frage** bedeutet. Beobachtet wurde das zweimal im Diagnoseweg von T014104.

**Die Asymmetrie ist der Kern:** `openspec/specs/ticket-system.md` → Requirement
„Status-Lifecycle-Enforcement" validiert Status-*Übergänge* streng gegen die 11 definierten Werte
und lehnt unbekannte ab. Die *Lesepfade* validieren gar nicht.

Verschärfend nennt `scripts/vda/ticket/list.sh` im Kommentar zur Komma-Liste ausgerechnet
`"open,triage"` als Beispiel (T012972) — `open` existiert im Enum nicht. Der Code selbst lehrt
den falschen Wert.

## What

Die Lesepfade werden fail-closed:

- `--status`, `--type` und `--attention-mode` werden gegen die definierten Wertemengen validiert.
  Ein unbekannter Wert endet mit **Exit 2** (wie die übrigen Bedienfehler in `list.sh`); die
  Meldung nennt den abgelehnten Wert **und** die gültigen. Eine Komma-Liste wird als Ganzes
  abgelehnt, sobald ein Glied ungültig ist.
- `get --id` auf ein nicht existierendes Ticket endet mit **Exit 4** und einer Meldung, die die
  gesuchte ID nennt. Exit 4 trennt „gibt es nicht" von Bedienfehler (2) und Offline-Refusal (9).
- Die Wertemengen kommen aus **einer** Quelle in `scripts/vda/ticket/_ticket-core.sh`, statt in
  `list.sh` dupliziert zu werden.
- Der irreführende `"open,triage"`-Kommentar wird korrigiert.

## Entwurfsregel: Validierung vor Verbindungsaufbau

Die Filter-Validierung läuft **vor** `_pgpod`, also vor jedem Datenbankzugriff. Das ist kein
Detail, sondern die Bedingung dafür, dass der Guard überhaupt wirkt:

```bash
grep -c 'shared-db' .github/workflows/ci.yml   # 0 — CI hat keine Ticket-DB
```

Ein Guard hinter dem Verbindungsaufbau wäre in CI dauerhaft übersprungen statt wirksam — genau
die Maskierung, die als T014384 offen ist (dort verbirgt ein `skip` bei knappem Slot-Pool einen
roten Test, der als `ok` gezählt wird). Die bestehenden `list-status-comma-list.bats`-Fälle
hängen aus demselben Grund an `_skip_if_no_db` und laufen in CI nie.

Deshalb sind 12 der 15 Fälle in `tests/spec/ticket-system/read-path-fail-closed.bats` **ohne
Datenbank** lauffähig. Nur die drei `get`-Fälle brauchen eine DB und skippen ehrlich mit
sichtbarem Grund.

## Verworfene Alternativen

- **Nur eine Warnung auf stderr, Exit 0 beibehalten** — ändert nichts für maschinelle Aufrufer,
  und genau die sind die Betroffenen. Eine Warnung, die den Exit-Code nicht ändert, wird von
  einem Agenten nicht gelesen.
- **`get` bei Nichtexistenz weiterhin Exit 0** — dann bliebe die Krücke bestehen, die drei
  Aufrufer bereits gebaut haben (`ticket-reclaim.sh:50`, `devflow-post-merge-finalize.sh:107`,
  `scout-drift.sh:40` prüfen alle auf leere Ausgabe, weil der Exit-Code nichts sagt).
- **Das Enum in `list.sh` hartkodieren** — es steht bereits im SSOT-Spec und in der
  Transition-Validierung; eine dritte Kopie driftet.

## Risiko und seine Messung

Ein geänderter Exit-Code von `get` könnte Aufrufer brechen, die ihn bisher ignorierten. Gemessen
gegen `origin/main`:

```bash
# 20 Aufrufer von 'ticket.sh get'; geprueft wurde, ob einer davon unter 'set -e'
# ungeschuetzt zuweist (nur dann bricht ein Exit != 0 den Lauf)
for f in $(grep -rln 'ticket\.sh" get \|ticket\.sh get ' --include='*.sh' . | grep -v node_modules | grep -v '^./tests/'); do
  head -25 "$f" | grep -qE '^set -e' || continue
  grep -nE '^[[:space:]]*(local )?[A-Za-z_]+=\$\(' "$f" | grep 'ticket.sh' | grep ' get '
done
```

Ergebnis: kein ungeschützter Fall. Der einzige Treffer (`scripts/pr-scope-check.sh:50`) setzt
kein `set -e` und leitet in eine Pipeline, deren letztes Glied (`python3`) den Fehler abfängt.

_Ticket: T014386_
