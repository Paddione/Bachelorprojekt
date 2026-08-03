# Proposal: SDLC Cockpit — K1 Lavish Design-Kit & Panel-Kontrakt

**Ticket:** T002460  
**Epic:** T002458 (SDLC Cockpit)  
**Status:** planning  
**Date:** 2026-07-28

## Purpose

K1 liefert das dreischichtige Design-Kit und den Panel-Vertrag. Es ist das **einzige Kind, das alle anderen blockiert** — K2–K9 ohne K1 zu bauen bedeutet, sie zweimal zu bauen.

## What

```
.lavish/kit/
  tokens.css      Schicht 1 — nur CSS-Variablen, keine Selektoren, austauschbar (E11)
  document.css    Schicht 2 — Dokument-Bausteine für handgeschriebene Boards
  panel.css       Schicht 3 — Panel-Rahmen, Kopf, Aktions-Slot, Kontext-Slot
  panel.js        Panel-Laufzeit — vier Typen, drei Größen, Zustände
  adapter.js      Datenschnittstelle (nur Vertrag) + Fixture-Implementierung
```

Dazu **zwei Belegartefakte**, ohne die der Vertrag eine Behauptung bleibt:
1. ein umgebautes Referenz-Board (belegt Schicht 1+2 für handgeschriebene Dateien)
2. eine Cockpit-Hülle mit je einem Panel pro Typ in allen drei Größen (belegt Schicht 3)

## Key Design Decisions

- **Vier Panel-Typen** (E10, E12, E21): Status · Strom · Canvas · Terminal — maschinenlesbar deklariert (`data-panel-type`, D2)
- **Drei Größen** (E4): Rail · Karte · Vollbild. Jedes Panel braucht eine Rail-Darstellung (D3)
- **Adapter-Schnitt** (E1): Panels rufen nie `fetch`, nur `data.*`. `brand` ist Parameter (E16)
- **Build-Grenze** (D1): nur das Terminal-Panel wird gebaut; Kit und übrige Panels bleiben buildfrei
- **Aktions-Slot mit vier Zuständen** (E17, D4): verfügbar · gesperrt · bestätigung offen · läuft
- **Abgestufte Bestätigung** (D5, D6): nach Umkehrbarkeit; mobil gesperrt für nicht umkehrbare Aktionen
- **Fokus-Spalten-Inhalt festgelegt, nicht konfigurierbar** (D7)

## Blockiert

K2, K3, K4, K5, K6, K7, K8, K9

## Tests

Siehe Spec Abschnitt 6. BATS-Strukturtests + Vitest für Panel-Laufzeit. Negativtests mit Positiv-Anker (T002356-M1).

## Spec

Vollständige Design-Spec: `openspec/changes/sdlc-cockpit-design/design.md`  
Epic-weite Entscheidungen E1–E22 im selben Dokument, vorderer Teil.
