# Pattern: Hybrid-Backend hinter stabilem Interface

Wie eine client-only Fähigkeit server-seitig nachgezogen wird, ohne die UI anzufassen.

## Muster (generisch)

Das in der Entkopplungs-Phase (Phase 1) extrahierte **Interface** zahlt sich hier aus: eine
client-only Implementierung wird durch eine server-resident Implementierung **hinter demselben
Interface** ergänzt — die UI ändert sich nicht. Ein **Selektor** wählt zur Laufzeit die passende
Implementierung anhand eines **Capability-Signals**, das ohnehin im Zustand vorhanden ist — **ohne**
ein neues Typ-Feld am Domänen-Objekt einzuführen.

Das Signal soll aus etwas Bestehendem abgeleitet werden (z.B. „liegt ein File-Handle vor?"), nicht
künstlich an die Datenstruktur angeheftet werden.

## VideoVault-Beispiel

Schnitt-Backend-Wahl per `FileHandleRegistry`: FSAA-Handle vorhanden → WASM-Backend (Browser),
sonst → Server-Backend. Es gab nur **eine** neue `serverSplitterBackend`-Implementierung + einen
`selectSplitterBackend`-Selektor; **kein** neues k8s-Manifest (die gesamte 2b-Infra — Image, PVC,
ffmpeg via APT — wurde wiederverwendet).

## Stolpersteine

- **GPU-Annahme verifizieren, bevor man Infrastruktur plant.** `ffmpeg -c copy` (Stream-Copy) ist
  **I/O-gebunden** — nvenc/GPU bringt messbar null. Die Spec hatte fälschlich einen GPU-Worker
  angenommen; der Befund kam aus **Code-Erkundung beim Planen**, nicht erst beim Bauen. In-Container-
  CPU war leistungsgleich und ersparte ein ganzes GPU-Infra-Teilprojekt.
- Ein optionales echtes Transcode-/GPU-Backend bleibt eine **spätere dritte** Implementierung hinter
  demselben Interface — nicht vorauseilend bauen (YAGNI).
