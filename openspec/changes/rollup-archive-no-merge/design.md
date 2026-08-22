# Design: Rollup-Archivierung und Carry-over bei Rückstau

## Root Cause

Der Finalizer ruft für jeden Change denselben Archivbefehl auf. Mishap-Rollups
sind jedoch Prozessnotizen mit Skeleton-Delta und benötigen den seit T002577
vorhandenen `--no-merge`-Pfad. Der fehlende Modus lässt den Archivierer korrekt
fail-closed abbrechen und erzeugt einen Rückstau offener Changes.

Der Carry-over-Scan setzt gleichzeitig voraus, dass der jüngste Zyklus alle
älteren offenen Einträge bereits enthält. Diese Annahme gilt nur bei lückenlos
abgeschlossenen Archivierungszyklen. Bei Rückstau kann mehr als ein
unarchivierter moderner Plan offene Einträge enthalten.

## Fix Approach

Der Finalizer entscheidet ausschließlich anhand des stabilen
`mishap-incident-rollup-*`-Slug-Präfixes, ob `--no-merge` ergänzt wird. Damit
bleibt der normale Mergepfad für alle übrigen Changes unangetastet.

Der Scan begrenzt seine Kandidaten auf direkte offene Change-Verzeichnisse,
deren Plan im aktuellen Repository-`HEAD` publiziert ist. Das ist der
deterministische Offline-Nachweis für einen abgeschlossenen Zyklus; untracked
oder nur branch-lokale Pläne gelten als laufend. Archivierte Pläne werden nicht
erneut zugestellt.

Alle passenden Zyklen werden chronologisch verarbeitet. Jeder jüngere Plan
erhält die älteren Pläne als Ausschluss-Lineage; Einträge mit identischem
normalisiertem Titel und Metadaten werden dadurch nur aus ihrer ältesten Quelle
übertragen. Die bestehende Idempotenzprüfung verhindert zusätzlich doppelte
Batch-Kommentare je Quellzyklus und Container.

## Boundaries

Alte Pläne ohne nummerierte Checkboxen werden nicht heuristisch interpretiert:
Aus ihnen lässt sich nicht zuverlässig ableiten, welche Einträge erledigt
wurden. Ihre Wiederherstellung bleibt ein separater manueller Recovery-Schritt.
