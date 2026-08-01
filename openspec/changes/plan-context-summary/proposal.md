# Proposal: plan-context-summary

## Why

`scripts/plan-context.sh` liefert pro Rolle einen fünfstelligen Zeilenoutput. CLAUDE.md
schreibt vor, ihn vor **jedem** Agent-Dispatch als `<active-plans>` zu prependen. Bei dieser
Größe wird der Schritt in der Praxis übersprungen oder von Hand gekürzt — die Kontext-Injektion
findet dann faktisch nicht statt. Ein Mechanismus, den man wegen seiner Kosten umgeht, wirkt
wie ein fehlender.

**Messung am 2026-07-28 (93 aktive Proposals):**

| Rolle | eingeschlossen | Zeilen | pro Proposal |
|---|---|---|---|
| `bachelorprojekt-infra` | 46 | 14711 | ~319 |
| `bachelorprojekt-test` | 45 | 14436 | ~320 |
| `bachelorprojekt-website` | 32 | 10532 | ~329 |
| `bachelorprojekt-db` | 21 | 4079 | ~194 |

Diese Zahlen korrigieren die Ausgangsdiagnose in T002322 in zwei Punkten:

**Der Rollenfilter arbeitet.** `db` bekommt 21 von 93, `infra` 46 — das ist eine echte
Unterscheidung, nicht „im Wesentlichen der gesamte Bestand". Die Allowlist mappt Rollen bereits
auf genau die Kurzformen (`bachelorprojekt-infra` → `infra deploy k3d kustomize prod
environments taskfile`), die in den `tasks.md` stehen.

**Das Frontmatter ist da.** Nicht 85 von 86 Proposals sind unmarkiert, sondern **16 von 93**.
`_parse_yaml_domains` liest `tasks.md` als Fallback, und `plan-lint` erzwingt `domains:` dort
als Hard Rule F1. Ein Backfill (Lösungsrichtung 1 des Tickets) betrifft 16 Dateien, nicht 85 —
und bringt gegenüber der eigentlichen Ursache wenig.

**Die eigentliche Ursache** steht in den Zeilen 101–126: Pro eingeschlossenem Proposal werden
**vier Dateien vollständig** ausgegeben — `proposal.md`, `tasks.md`, jedes `tasks.d/`-Partial
und `design.md`. Das sind ~320 Zeilen pro Stück. Auch bei perfektem Filter blieben 46 × 320 ≈
14 700 Zeilen.

## What

Standardmäßig gibt `plan-context.sh` pro Proposal eine **Zusammenfassung** aus: Slug, Titel,
die Kurzbeschreibung aus `proposal.md` und die Task-Überschriften aus `tasks.md`. Der Volltext
bleibt über ein explizites `--full` erreichbar, damit kein heute genutzter Anwendungsfall
wegbricht.

Nachrangig, aber im selben Change:

- Legacy-Zweig (kein `domains:` auffindbar) auf **fail-closed** umstellen. Betrifft nur noch
  16 Proposals; nach der Zusammenfassung ist der Beitrag zur Größe klein, aber die Semantik
  „unmarkiert = für alle relevant" ist trotzdem falsch herum.
- `--with-openspec` prüfen: Der Flag ändert die Zeilenzahl aktuell **überhaupt nicht**
  (14711 mit und ohne). Entweder lädt er nichts oder nur Dupliziertes.

Nicht Teil dieses Changes: Befund 2 des Tickets (falsches Kurzform-Beispiel in CLAUDE.md) ist
bereits erledigt — CLAUDE.md dokumentiert die Falle inzwischen explizit und verweist auf T002322.

_Ticket: T002322_
