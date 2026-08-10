# Proposal: fix-loadout-model-paths-T002886

## Why

Sechs von elf Loadouts in `scripts/llm/loadouts.json` zeigen auf Modelldateien, die es auf dieser
Maschine nicht gibt — zwei davon nur wegen eines falschen Verzeichnisnamens, drei weil das
Gemma-4-12B auf keinem `modelRoot` mehr liegt. Der Guard, der genau das verhindern soll
(`loadout-model-files-exist.bats`, T002753), ist bereits rot; die Luecke war nicht sein Fehlen,
sondern dass sein Rot niemanden erreichte. Zusaetzlich prueft er nur `model`, nicht die
Nebendateien — dadurch stand in `gemma26-factory` ein `mmprojPath` auf einer Datei, die es nicht
gibt, waehrend der `notes`-Text derselben Zeile bereits „Kein mmproj" sagte.

Unabhaengig davon laeuft `devstral-quality` mit `targetMarginMib: 2400` real bei 8192 Kontext und
19,8 tok/s — ein Drittel des moeglichen Durchsatzes und ein fuer Code-Arbeit unbrauchbares Fenster.
Die Marge allein verdreifacht das Tempo.

Die Ursache ist wiederkehrend, nicht einmalig: die `notes` dokumentieren denselben Vorgang bereits
zweimal woertlich („EXISTIERT NICHT auf Platte — das Loadout war damit nicht startbar").

## What

- Tote Modellpfade richten (`gptoss-context`, `brain-ingest`, `gemma26-factory`), den
  unaufloesbaren `mmprojPath` entfernen.
- Betriebspunkte auf gemessene Werte setzen statt auf uebernommene Vermutungen — Messreihe
  2026-08-09, llama.cpp b10241, jeder Punkt zweimal (Details in `design.md`).
- Familientraeger `gemma4` vom fehlenden 12B auf das vorhandene 26B umhaengen; die beiden
  unaufloesbaren Eval-Loadouts entfernen und ihr Wissen in `design.md` sichern.
- Zwei Loadouts aufnehmen: `gemma26-throughput` (rund 30 % mehr Durchsatz gegen 34 % weniger
  Fenster) und `gemma12-vision` (262144 Kontext, Vision, MTP-Drafter mit +55 % Prosa-Durchsatz).
- Sampling fuer `qwen3-coder-30b` nachtragen — es fuhr stillschweigend auf llama.cpp-Defaults
  statt auf den Werten der Modellkarte.
- Neuen Guard fuer `mmprojPath`/`draftModelPath` einfuehren (heute rot) und die Fehlerliste des
  bestehenden Guards vor seine Assertion ziehen, damit ein Rotlauf sagt, **was** fehlt.

Nicht Teil dieses Changes: MTP fuer das 26B (Loader-Defekt, in allen drei Head/Gewicht-Kombinationen
belegt), ein Vision-Loadout auf dem 26B (nur 8192 Kontext erreichbar), das Nachladen des 12B fuer
das Eval-Paar, und die Umstellung von `chatTemplateKwargs` auf `--reasoning` (abgekuendigt, aber
semantisch nicht deckungsgleich — eigener Vorgang).

_Ticket: T002886_
