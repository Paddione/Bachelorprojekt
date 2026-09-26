---
ticket_id: T900453
plan_ref: null
status: active
date: 2026-09-26
---

# Design: Agent-Routing-Doku — Schichtwahl K1/K3/K4 + Sweep (Change 6/6)

Epic T900447, Change-Ticket T900453, letzter Epic-Child. 6/6
dokumentiert das neue Recall-Routing für Agenten und fegt die
stalen Verweise, die 4/6 und 5/6 übrig lassen. Reine Doku + Registry
+ Guard — kein Laufzeit-Eingriff.

Input: Routing-Exploration (read-only, `origin/main`-Basis;
lokaler Checkout war 7 Commits zurück — alle Angaben gegen
`origin/main` verifiziert).

## Ziele

- Jeder Agent findet die Schichtwahl in ≤30 s: Kurzform in
  `AGENTS.md`, Tiefe auf der Routing-Seite, `use_when` in der
  Registry, Prompt-Zeilen als Rückenwind.
- Frische-Tabelle mit belegten Werten (keine erfundenen SLAs):
  K1 merge-gekoppelt, K3 ≤~1h, K4 Authoring-Zeitpunkt.
- Kein Dangling: was 4/6/5/6 entfernt haben, steht nirgends mehr
  als Soll-Zustand; der Guard belegt es.
- Generierte Dateien ausschließlich per Keeper-Task regeneriert.

## Nicht-Ziele

- Recall-Verhalten ändern (K1/K3-Laufzeit sind 2/6, 3/6).
- 5/6-Scope anfassen (`CLAUDE.md:128,147`, Lesedoku-Code) — 6/6
  läuft danach (E7-Gate).
- Fix-Lücke aus 5/6-Review (`admin.astro` Brain-Link + Env-Keys):
  eigener Fix-Change, nicht 6/6.
- `k3-code-graph.md` umschreiben (frisch aus 3/6 — wird verlinkt).
- DNS, Secrets, OIDC-Seeds, `docs/legacy-html/`.

## Entscheidungen (Brainstorming 2026-09-26)

- E1: Default-Reihenfolge K1→K3→K4 (Roh-Recall → Präzisions-Check →
  Doktrin) nach Delegations-Vorgabe; Ticket-Rollen
  (Graph=Präzision, Embeddings=Roh-Recall) bleiben als
  Rollenbeschreibung erhalten. Primär gilt der Entscheidungsbaum
  nach Fragetyp (Symbol bekannt → K3; semantisch → K1; Doktrin →
  K4) — die lineare Reihenfolge ist der Fallback, nicht der Regelfall.
- E2: Neue Seite `docs/brain/recall-routing.md` (kein passender Ort
  existiert; Nachbar der frischesten Schicht-Doku). Enthält Baum,
  Tabelle, Ownership — alles andere verlinkt dorthin.
- E3: `Karten` := `docs/agent-guide/maps/` (Annahme, im Plan als
  solche markiert — einzige unbelegte Vokabel der Delegation).
- E4: Ownership = „Epic-owned (T900447), kein Personen-Owner"
  (CODEOWNERS/agent:-Felder existieren nicht — nichts erfinden).
- E5: Frische-Werte aus Quellen: K1 = Merge-Kopplung ohne Zeit-SLA
  (2/6-Design), K3 = Intervall+Dauer ≤~1h (3/6-Design + k3-Doku),
  K4 = Authoring-Zeitpunkt (Epic-Beschluss); K4-R1-Protokoll:
  0 Wiki-only-Seiten (kein `docs/retracted-wiki/`, keine
  Retract-Commits auf `origin/main`).
- E6: Sweep-Grenze: 6/6 fegt nur, was in KEINEM anderen Scope liegt
  (Runbook, skills.yaml, system-audit, deploy-routing, k2/k5,
  gesamtbild, CLAUDE.md:27, k1-addendum). `openspec/archive`,
  Historie, generierte JSONs (außer via Regen) bleiben.
- E7: Reihenfolge-Gate wie 4/6-E6: vor der Umsetzung prüfen, dass
  T900452 auf `origin/main` gemergt ist, sonst STOPP (die Doku
  beschreibt den 5/6-Endzustand).

## Risiken

- R1: Executor-Reihenfolge (E7 fängt das: Gate statt Vertrauen).
- R2: 5/6-Zeilen in CLAUDE.md (128,147) kollidieren mechanisch
  beim Rebase — disjunkte Zeilen, Rebase löst, kein Gate nötig.
- R3: Stale-Annahme E3 (`Karten`) — als Annahme markiert, Review
  kann widersprechen.

## Validierung

- `task test:changed` + `freshness:check` grün; Routing-Guard grün.
- Grep-Nachweise: 0 `brain-ingest`/`brain_search`/`build-docs`/
  `docs-content-built`-Treffer in den gefegten Dateien (History +
  Archive ausgenommen).
- Generierte Dateien per Diff geprüft (nur Registry-Folgen drin).
