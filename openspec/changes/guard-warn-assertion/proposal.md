# Proposal: guard-warn-assertion

## Purpose (deutsch)

Post-Merge-Review von PR #4497 (T005898): Die WARN-Assertion in
`tests/spec/software-factory/schedule-blocker-gate-hardening.bats` (Z. 97-98) nutzt zwei
getrennte unqualifizierte Greps über das Gesamt-Output — die `$a`-Hälfte ist unabhängig von
der WARN erfüllbar (der Blocker erscheint im Plan-JSON auf stdout), die „WARN"-Hälfte
matcht jede künftige WARN-Zeile. Der Test würde grün, obwohl die Block-WARN fehlt (dieselbe
Klasse wie T002657 — ein fehlendes Feature, das durch einen weiten Match maskiert bleibt).
Zusätzlich ist `_skip_if_pool_busy` fail-open bei einem Fehler von `slots.sh count`.

Dieser Change präzisiert die Assertion auf die spezifische Zeile
(`open blockers:` + Blocker-ID in derselben Zeile) und macht den Pre-Check fail-closed
(nicht-numerisches count → skip).

## Goals

- Guard-Assertion: `echo "$output" | grep "open blockers:" | grep -qF "$a"` — eine
  Zeile, ein Match.
- `_skip_if_pool_busy`: bei nicht-numerischem `slots.sh count`-Ergebnis skip
  (fail-closed), statt still gegen einen unbekannten Pool zu laufen.
- Gegenprobe (RED-Äquivalent, da der präzisierte Test heute grün ist): WARN-Zeile
  temporär aus schedule.sh entfernen → der Test MUSS rot werden (Positiv-Anker-Disziplin);
  der Nachweis wird im GREEN-Lauf dokumentiert.
- Minor-Nit mit aufnehmen: Zeilennummern-Verweise im Guard-Kommentar auf Content-Anker
  umstellen (Zeilendrift).

## Non-Goals

- Keine Änderung an schedule.sh selbst (die WARN-Logik ist korrekt — nur die
  Test-Präzision ändert sich).
- Kein Rate-Limiting der WARN-Emission (Review-Minor 3 — bewusst nicht; das Spec-Mandat
  „never disappears silently" überwiegt).

## Symptom vs. Ursache (T002448-M5)

- **Symptom:** Fragile Assertion — weite Greps können einen fehlenden WARN grün färben.
- **Ursache (belegt im Review):** Zwei getrennte unqualifizierte `grep -q`-Matches über
  `$output` statt einer zeilengebundenen Prüfung; plus fail-open-Zweig im Pre-Check bei
  `count`-Fehlern.
