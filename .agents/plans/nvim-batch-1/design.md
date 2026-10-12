---
title: nvim-batch-1 Designentscheidungen
ticket_id: T901792
plan_ref: .agents/plans/nvim-batch-1/tasks.md
status: decided
---

# Design: nvim-batch-1

## D1 — Partial-Schnitt (8+1 plus separater SSOT-Plan)

p1–p8 je ein Feature-Kind (T901044–T901051), p9 Tests-Rolle. T901212
bekommt ein eigenes Plan-Verzeichnis, weil seine Ziele im Home-Repo
liegen und kein Manifest-Target sein koennen. Der Linter verlangt die
Tests-Rolle als letzte Zeile; ein neuntes Feature-Partial als p9 waere
 regelwidrig.

## D2 — Staging

Jedes Feature-Kind wird mit demselben Index
(`.agents/plans/nvim-batch-1/tasks.md`, Partials 9, Hold) gestagt, damit
der Plan-Runner je Ticket denselben Batch-Stand findet. T901212 wird mit
seinem eigenen Index (Partials 1, Hold) gestagt. Der Batch-Parent bleibt
Planungseinheit ohne eigenes Stage.

## D3 — Abhaengigkeiten

p1 Fundament zuerst (harte Kante zu allen Kapiteln), p2 Editor vor p3
(Picker-Entscheid), p9 Tests nach allen. Keine Zyklen.

## D4 — Verify-first

Der Stand auf main ist weitgehend fertig (EPIC shipped). Jedes Partial
verifiziert zuerst jede Checklisten-Zeile gegen main und baut nur die
belegten Luecken aus dem Proposal. Kein Umbau ohne Beleg.

## D5 — T901212 wird geplant, nicht ausgefuehrt

Der Chore-Eingriff liegt im Home-Repo (eigenes Repo, eigenefernsteuerung,
keine hiesigen Gates). Der Plan beschreibt ihn schrittgenau inklusive
rot-gruen-Test; die Ausfuehrung bleibt beim Operator (Hold).

## D6 — Commit-Scope

`nvim` ist kein gueltiger Scope. Execute-Commits nutzen Ticket-Scopes
(`feat(T901044): …`), Plan-Commits `chore(plans): …`.
