---
title: "Companion prompt-Block: URL-Param-Bypass für headless Zugriff"
ticket_id: T000542
branch: fix/companion-prompt-block
spec: null
status: ready
domains: [scripts]
created: 2026-06-09
---

# Plan: Companion prompt()-Block fix (T000542)

## Problem

`scripts/superpowers-collab/helper-collab.js` feuert beim Laden ein blockierendes
`window.prompt()` wenn `localStorage.brainstorm_who` nicht gesetzt ist. Headless-
Browser (Playwright-MCP) hängen 60 s bis der Dialog bedient wird; automatisches
Screenshotten der Brainstorm-Boards zur Selbstverifikation schlägt damit fehl.

## Fix-Scope

**Eine Datei, zwei Zeilen.** Kein API-Vertrag, kein State-Schema, kein Deployment nötig —
der Fix wird ausschließlich über den Collab-Patch (`superpowers-collab-patch.sh`) ausgeliefert.

## Lösung: `?who=<name>` URL-Parameter

Prüfe `URLSearchParams(location.search).get('who')` **vor** dem `prompt()`-Aufruf.
Wenn vorhanden → Wert nehmen (auf 24 Zeichen trimmen), in localStorage schreiben,
`prompt()` überspringen. `URLSearchParams` ist in allen unterstützten Browsern
verfügbar (Baseline seit 2017).

Playwright-MCP-Aufruf dann z. B.:
```
navigate https://brainstorm.dev.mentolder.de/?who=AutoBot
```

Der localStorage-Cache (bestehende Logik) bleibt unverändert und greift weiterhin
bei nachfolgenden Seitenaufrufen ohne URL-Param.

## Tasks

### T1 — Datei patchen (1 Änderung, ~4 Zeilen)

**Datei:** `scripts/superpowers-collab/helper-collab.js`

Ersetze Zeile 7-8:
```js
// alt:
let who = localStorage.getItem('brainstorm_who');
if (!who) { who = (prompt('Dein Name für diese Session:') || 'Gast').slice(0, 24); localStorage.setItem('brainstorm_who', who); }
```

durch:
```js
// neu:
let who = localStorage.getItem('brainstorm_who');
if (!who) {
  const urlWho = new URLSearchParams(location.search).get('who');
  if (urlWho) {
    who = urlWho.slice(0, 24);
    localStorage.setItem('brainstorm_who', who);
  } else {
    who = (prompt('Dein Name für diese Session:') || 'Gast').slice(0, 24);
    localStorage.setItem('brainstorm_who', who);
  }
}
```

### T2 — Tests grün machen

Lasse `tests/unit/lib/bats-core/bin/bats tests/unit/helper-collab-headless.bats` laufen:
- Alle 4 Tests müssen grün sein (insbesondere Test 1: `?who=AutoBot` → `promptCalled=false`).

### T3 — Skill-Referenz aktualisieren

In `.claude/skills/references/brainstorm-tunnel-setup.md` dokumentieren, dass
Playwright-MCP `?who=AutoBot` anhängen soll um den Dialog zu umgehen.

### T4 — Idempotenz-Check

`bash scripts/superpowers-collab-patch.sh --check` muss 0 zurückgeben (kein Re-Patch
nötig, da `helper-collab.js` die Quelldatei ist, nicht die gepatchte Kopie).

### T5 — PR erstellen & CI grün

Commit, Push, PR. Kein Deploy-Schritt nötig — `helper-collab.js` wird on-demand durch
`superpowers-collab-patch.sh` in aktive Plugin-Instanzen injiziert, nicht deployed.

## Out of Scope (follow-ups)

- Screenshot-Sandbox-FS (MCP speichert Screenshots in isoliertem FS) — separates Ticket.
- Localhost-Erreichbarkeit des MCP-Browsers — separates Ticket.
