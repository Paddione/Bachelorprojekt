# Proposal: rollup-archive-no-merge

## Why

Der Post-Merge-Finalizer archiviert Mishap-Rollup-Changes wie normale OpenSpec-
Changes. Ihre absichtlich nicht mergebaren Skeleton-Deltas laufen dadurch in
den fail-closed Target-Guard und bleiben trotz abgeschlossenem Ticket offen.
Solange mehrere Zyklen offen bleiben, verliert der Carry-over-Scan zusätzlich
ältere unarchivierte Kandidaten, weil er nur den jüngsten Zyklus ausgibt.

Belegt ist die Ursache durch `scripts/devflow-post-merge-finalize.sh`, das den
Archiv-Aufruf ohne `--no-merge` ausführt, während `scripts/openspec.sh` diesen
Modus ausdrücklich für `mishap-*`-Prozessnotizen vorsieht. Der bestehende Scan
filtert offene und archivierte Pläne gemeinsam und reduziert danach mit
`tail -1` auf einen Kandidaten.

## What

- Der Finalizer verwendet für `mishap-incident-rollup-*` den bestehenden
  `--no-merge`-Archivierungspfad; andere Changes bleiben unverändert.
- Die Mishap-Rollup-SSOT korrigiert die veraltete `--create-new`-Aussage auf
  `--no-merge`.
- Der Carry-over-Scan liefert alle unarchivierten Zyklen mit offenen,
  checkbox-basierten Einträgen und ignoriert bereits archivierte Zyklen.
- Regressionstests sichern beide Laufzeitpfade ab.

Historische Pläne vor T013043 besitzen keine Eintrags-Checkboxen. Ihre
Rückwirkung ist nicht Teil dieses Fixes; insbesondere wird T012909 nicht aus
seinem alten Planformat automatisch rekonstruiert.

_Ticket: T013330_
