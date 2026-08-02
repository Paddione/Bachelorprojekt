# Proposal: ticket-sh-brand-derivation

## Why

`scripts/ticket.sh` leitet die Ziel-Brand (und damit die physische Ziel-Datenbank,
`workspace` vs. `workspace-korczewski`) durch Freitext-Scan über **alle**
Argumente ab — inklusive der Werte von `--title` und `--description`. Enthält ein
Titel oder eine Beschreibung zufällig einen Brand-Namen als Substring, schreibt der
Aufruf still in die falsche Brand-DB. `scripts/vda/ticket/create.sh` hat zusätzlich
einen eigenen, unabhängigen `brand`-Spalten-Default (`mentolder`), der mit dem
top-level `NS`-Ziel divergieren kann. Reproduziert am 2026-07-27: ein Titel mit
Brand-Freitext erzeugte zwei Zeilen mit `brand=mentolder`, physisch in der
korczewski-DB, kollidierend mit deren `external_id_seq`. Der Aufrufer sah eine
Erfolgsmeldung — Silent-Failure, kein Fehler.

Da dieselbe `external_id` in beiden brand-getrennten DBs einen völlig anderen
Vorgang bezeichnet (siehe `docs/superpowers/references/gotchas-footguns.md` /
Auto-Memory `reference_ticket-brand-db-split.md`), ist das ein
Datenintegritätsbug, kein Ergonomieproblem.

## What

- Freitext-Argument-Scan zur Brand-Ableitung in `scripts/ticket.sh` ersatzlos
  entfernen. Brand wird nur noch aus (in dieser Priorität) explizitem
  `--brand`-Flag, `BRAND`-Env-Var, oder `TICKET_NS`-Env-Var abgeleitet; fehlt jedes
  Signal, bleibt der bestehende Default `mentolder` erhalten (siehe design.md
  Entscheidung 3 — bewusst kein volles Fail-Closed, da mehrere bestehende
  ID-only-Aufrufer ohne jeden Brand-Kontext operieren; deren Blast-Radius ist in
  design.md dokumentiert).
- `scripts/vda/ticket/create.sh` verliert seinen eigenen unabhängigen
  `brand="mentolder"`-Default; die `brand`-Spalte wird aus dem bereits von
  `ticket.sh` aufgelösten `$BRAND` bezogen (single source of truth für NS **und**
  Spalte). Ein explizites `--brand` auf `create`-Ebene bleibt als Override
  möglich, muss aber mit dem top-level `$BRAND` übereinstimmen — bei Divergenz
  Fehler statt stillem Vorrang.
- Ein ungültiger `--brand`-Wert (weder `mentolder` noch `korczewski`) bricht
  weiterhin mit `exit 2` ab (bestehendes Verhalten, unverändert).
- Test in `tests/spec/ticket-system.bats`, der reproduziert, dass Freitext in
  `--title`/`--description` die NS-Auflösung nicht mehr beeinflusst, und dass
  Flag/Env vs. Spalten-Divergenz einen Fehler statt eines stillen Silent-Failures
  erzeugt.

Root-Cause-Analyse, Blast-Radius-Prüfung bestehender Aufrufer und die
Trade-off-Abwägung (raten vs. fail-closed vs. Default) stehen ausführlich in
`design.md`.

## Abgrenzung

- **T002307** (Mishap-Bundle, Welle 2) ändert denselben File (`_pgpod`-Selektor
  Completed- vs. Running-Pod) — anderer Mangel, nicht Teil dieses Fixes, um
  Merge-Konflikte zu vermeiden.
- **T002278** (mcp-postgres ist brand-blind) ist ein verwandter, aber
  eigenständiger Bug in einem anderen Werkzeug — nicht Teil dieses Fixes.

_Ticket: T002280_
