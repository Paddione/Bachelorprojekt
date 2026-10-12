---
title: nvim-ssot-umzug Designentscheidungen
ticket_id: T901212
plan_ref: .agents/plans/nvim-ssot-umzug/tasks.md
status: decided
---

# Design: nvim-ssot-umzug

## D1 — Getrenntes Plan-Verzeichnis

Die Ziele liegen im Home-Repo und koennen kein Partial des Batch-Plans
sein (kein Manifest-Target, keine Intel-Abdeckung). Eigener Single-Plan,
eigenes Stage auf demselben Batch-Branch.

## D2 — Nur Index-Eingriff

`git rm --cached` plus `.gitignore`-Aenderung. Kein `--force`, kein
Loeschen der Live-Dateien. Der Test prueft beides: Index leer UND live
vorhanden.

## D3 — Dirty-Checkout-Schutz

Der Home-Hauptcheckout ist dirty. Der Eingriff laeuft ausschliesslich im
Worktree `docs/nvim-ssot-T901212`; der Hauptcheckout wird nicht
umgeschaltet, nicht committed, nicht bereinigt.
