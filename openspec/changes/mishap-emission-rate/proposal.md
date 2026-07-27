# Proposal: mishap-emission-rate

## Why

Gemessen am 2026-07-28 über `tickets.tickets` (`title LIKE 'Mishap-Bundle%'`):

| Datum | erzeugt | erledigt |
|---|---|---|
| 15.–25.07. | 3, 4, 9, 10, 6, 7, 1 | jeweils alle |
| 26.07. | 20 | 19 |
| 27.07. | **32** | **13** |

Bis zum 25. Juli war das System im Gleichgewicht. Am 27. Juli blieben 19 Bundles offen; 17 der
29 `triage`-Tickets sind inzwischen Mishap-Bundles.

Der Mechanismus ist selbstverstärkend: Jeder dev-flow-Zyklus endet konventionsgemäß mit einem
`mishap-tracker`-Aufruf. `report_mishap` bündelt bei `MISHAP_TRIGGER = 3`, und
`mishap-tracker` Schritt 3 erzwingt am Session-Ende zusätzlich einen Flush auch bei 1–2
Einträgen. Das entstandene Bundle-Ticket braucht seinerseits einen dev-flow-Zyklus — der wieder
ein Bundle erzeugt.

Liegt die Rate bei ≥ 1 Bundle pro Zyklus, ist der Rückstand per Konstruktion nicht abbaubar.
Eigenmessung einer Session mit zwei Zyklen (T002333, T002345): zwei Bundles erzeugt (T002381
mit 3 Einträgen, T002382 mit einem einzigen — Produkt des erzwungenen Flushes). Verhältnis 1:1,
exakt an der Konvergenzgrenze.

Der erhöhte Durchsatz durch parallele Sessions und die Factory hat den Effekt sichtbar gemacht,
nicht verursacht. Er wird sich mit weiter steigendem Durchsatz verschärfen.

## What

1. `MISHAP_TRIGGER` in `scripts/ticket-mcp/go/internal/tools/mishap.go` von 3 auf 10.
2. Den erzwungenen Session-Ende-Flush aus `mishap-tracker` Schritt 3 entfernen. Das ist
   gefahrlos: Der Buffer liegt in `.git/mishap-buffer.json` und überlebt Sessionwechsel. Die
   bisherige Begründung („damit am Session-Ende nichts verloren geht") ist sachlich falsch und
   muss durch die Tatsache ersetzt werden — sonst stellt der nächste Leser den Flush aus Sorge
   vor Datenverlust wieder her.
3. Einen periodischen Flush vorsehen, damit der Buffer nicht unbegrenzt wächst.

Kein Mishap geht dabei verloren; sie werden nur später und gröber gebündelt.

Nicht Teil dieses Changes: die 19 bereits offenen Bundles konsolidieren — das ist T002375.

_Ticket: T002383_
