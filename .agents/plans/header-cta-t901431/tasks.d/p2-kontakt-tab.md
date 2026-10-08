# p2-kontakt-tab — Nachrichten-Tab journey-gesteuert umbenennen

## Ziel

Der Nachrichten-Tab der Kontaktseite heißt für die Massage-Brand
`Schriftliche Rückfrage stellen.` statt `Eine Frage stellen.`, die
Panel-Überschrift folgt demselben Wortlaut. Alle anderen Brands sehen den
bisherigen Wortlaut. Test-ID, Aria-Beschriftung und Untertitel bleiben
gleich, sodass FA-10 T5/T6 und der korczewski-Kontaktfall unverändert grün
bleiben.

## Budgets

- `components/website/src/components/ContactHub.svelte`: Ist 625,
  Budget 475. Wachstum null bis eine Zeile (zwei ternäre Ausdrücke in
  bestehenden Zeilen).

Keine Baseline-Einträge hinzufügen. Keine neuen Import-Zyklen (reine
Template-Änderung, keine neuen Modul-Importe). Keine neuen `any`-Typen.
`kontakt.astro` bleibt unverändert — es übergibt bereits
`journeyEnabled={isMassage}`, und `journeyEnabled` ist das etablierte
Massage-Signal (Anfrage-Tab, Nummerierung, Default-Modus).

## Steps

1. In `components/website/src/components/ContactHub.svelte` den
   Nachrichten-Tab-Titel (Zeile 212) journey-gesteuert machen:
   ```svelte
   <span class="ch-mode-title">{journeyEnabled ? 'Schriftliche Rückfrage stellen.' : 'Eine Frage stellen.'}</span>
   ```
   `data-testid="tab-nachricht"`, das `aria-label` und `.ch-mode-sub`
   unverändert lassen.
2. Die Panel-Überschrift für den Nachrichten-Modus (Zeile 241) spiegelt den
   Tab-Titel und folgt derselben Bedingung:
   ```svelte
   <h2>{journeyEnabled ? 'Schriftliche Rückfrage' : 'Eine Frage'} <em>stellen.</em></h2>
   ```
   Die Anfrage-, Termin- und Rückruf-Tabs sowie alle Styles unverändert
   lassen.
3. Verify im Worktree:
   `tests/unit/lib/bats-core/bin/bats tests/spec/massage-header-cta.bats`
   muss jetzt alle vier Fälle grün zeigen.
4. Commit auf dem Partial-Branch-Stand: neuer Stand mit dem Kontakt-Tab.
