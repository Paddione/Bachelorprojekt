# .agents/docs/ — Dossier-Konvention

Progressive-Disclosure-Dossiers für Agenten-Arbeit, die `AGENTS.md` sprengen würde.
Abgrenzung: [`docs/`](../../docs/) ist Menschen-Doku (Runbooks, Handbücher, ADRs);
`.agents/docs/` sind Arbeitsdossiers (Pläne, Inventuren, Stale-Listen) mit Verfallslogik.

## Struktur

`.agents/docs/<slug>/` mit:

- `README.md` (Pflicht, ≤ ~80 Zeilen): Kontext, Ziel, Chargen/Status, Entscheidungslage
- Optional: `inventory.md` (Messwerte), `stale-list.md` (Verdicts + Belege),
  `target-tree.md` (Zielbild + Abweichungen) — Muster: [`reorg-phase2/`](reorg-phase2/)

## Regeln

- Messungen immer mit ausführbarem Befehl + Commit-Stand (`PRE=<sha>`) — Mess-Konvention T002717.
- Keine Duplikate: auf `AGENTS.md`, `docs/adr/`, Guards verweisen statt kopieren.
- Nach Abschluss: Ergebnis ins Ticket, gültige Entscheidungen als ADR nach `docs/adr/`;
  das Dossier bleibt als Record stehen (kein Lösch-Zwang, kein Archiv-Ritual).
- Größen-Limit: ein Dossier ist ein Arbeitsmittel, kein Zweit-Repo — was wächst,
  gehört nach `docs/` oder in einen ADR.

## Index

- [`reorg-phase2/`](reorg-phase2/) (T900560) — agentennative Repo-Struktur; Status: C0–C3 gemergt, C6 läuft.
