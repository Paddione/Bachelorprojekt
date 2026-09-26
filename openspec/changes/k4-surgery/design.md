---
ticket_id: T900451
plan_ref: null
status: active
date: 2026-09-26
---

# Design: K4-Surgery — Spiegel entfernen, Kern bleibt im Repo (Change 4/6)

Epic T900447, Change-Ticket T900451, ADR-009 Punkte 3+7. K4 (Brain-Wiki
`Paddione/brain`) war zu 85 % generierter Spec-Spiegel; der Change
entfernt die Cross-Repo-Pipeline, den Spiegel und seine Lesepfade.
Ersatz steht in 2/6 (K1-Embeds über Code+Specs+Docs) und 3/6
(K3-Auto-Refresh) — Reihenfolge: erst Ersatz frisch (Implementierung),
dann Spiegel weg.

Input: K4-Exploration (read-only, Repo-Stand main @ 1e08f6b90),
Referenzliste-vor-Löschung nach T002637-M5 (alle Pfade unten sind
per grep verifiziert, nicht aus CI geerntet).

## Ziele

- Kein Ingest-Job schreibt mehr nach Paddione/brain: Pipeline-Skripte,
  Manifest, Merge-Hook-Workflow und Skill sind weg.
- Kein Lesepfad auf das Wiki mehr: brain-mcp retiriert, Cockpit-Links
  und brain-Site-Deployment entfernt.
- Authored Kern nachweislich im Repo: `docs/adr/`, `docs/runbooks/`,
  Gotchas, Karten — plus Fail-closed-Nachweis, dass keine Wiki-only
  authored Seiten zurückbleiben.
- Keine hängenden Verweise: Guards assertieren Abwesenheit statt
  Anwesenheit; `brain-verify-refs.sh` läuft als Link-Check im Plan.

## Nicht-Ziele

- Paddione/brain-Archiv-Klick (Owner-Akt, außerhalb).
- docs.*.de + Lesedoku-Maschinerie (5/6); K4-Doku-Prosa (docs/brain/k4*,
  Runbook-Prosa, Agent-Guide-Prosa → 5/6-Sweep, hier nur funktionales
  Wiring: Registry + toolset-map-use_when-Zeilen).
- Eval-Runner + Eval-Set (1/6), Verifier-Skripte (T900403), Chunker
  (von Verifier benötigt) — Keeper, s. Proposal.
- K1/K3-Laufzeit (2/6, 3/6), Brand-Laufzeit, DNS.

## Entscheidungen (Brainstorming 2026-09-26)

- E1: brain-mcp wird RETIRIERT, nicht gerepointet. Begründung: K1
  (Embeddings über Code+Specs+Docs aus 2/6) und K3 (Graph aus 3/6)
  ersetzen seinen Recall; auf dieser Maschine existiert ohnehin kein
  Wiki-Checkout (`~/brain/wiki` fehlt, verifiziert 2026-09-11), der
  Server liefe hier ins Leere. Epilog: kein MCP-Suchpfad mehr.
- E2: Manifest wird GELÖSCHT, nicht editiert. Alle Code-Konsumenten
  (worklist, ingest, moc, prune, restamp, group-match) werden im selben
  Change gelöscht (grep-verifiziert); ein um ssot-specs erleichtertes
  Manifest ohne Leser wäre toter Ballast. Ticket-Formulierung
  („ssot-specs entfernen") ist darin enthalten.
- E3: Taskfile.brain.yaml wird EDITIERT (nicht gelöscht): nur
  `brain:chunk` + Hilfetext bleiben (Keeper-Pfad für Verifier);
  `brain:ingest:*`, `brain:expertise:*`, `brain:lifecycle:*`,
  `brain:mcp`, `brain:merge-hook`-Reste entfallen. Alles in EINEM
  Partial (p1), keine Split-Edits derselben Datei.
- E4: G-BRAIN14 (Health-Goal auf worklist --pending) wird MIT entfernt
  (Check-Sektion, goals.md-Eintrag, integrity-Guard) — ein Goal auf
  gelöschte Pipeline wäre Daueralarm. Kleinster konsistenter Schnitt.
- E5: Cockpit-Rückbau ist total (lib + API-Route + Tests + brain.yaml +
  kustomization-Ref + Spec-REQs), weil grep-negativ kein Frontend die
  Route ruft. Kein Stummel, kein Feature-Flag.
- E6: Reihenfolge-Constraint für den Executor: 4/6 erst nach 2/6+3/6
  implementieren (im Plan als depends_on-Notiz + Gate-Task: vor dem
  Löschen prüfen, dass K1-Embeds + K3-Refresh laut deren Done-Kriterien
  live sind — andernfalls STOPP, kein Teillöschen).
- E7: 5/6-Grenze: 4/6 fasst keine Doku-Prosa an (docs/brain/k4*,
  Runbooks außer cbm-stampede-Referenzzeilen, Agent-Guide-Prosa);
  funktionales Wiring (mcp.yaml, capabilities, toolset-map-use_when,
  .mcp.json, opencode.jsonc) gehört zu 4/6, weil sonst dangling Refs
  auf gelöschte Tools stünden.

## Risiken

- R1: Wiki-only authored Seiten (MOCs, handgepflegte Index-Seiten) —
  E3-Task-1 fängt das: `gh`-Diff Wiki vs. Repo-Quellen, Fund wird
  retrahiert, sonst Leermeldung im Protokoll.
- R2: Übersehene Linkziele auf Wiki-Seiten — `brain-verify-refs.sh`
  (Keeper) läuft im Plan als Check; Restrisiko trägt 5/6-Sweep mit.
- R3: Executor-Reihenfolge (E6) — Gate-Task statt Vertrauen.

## Validierung

- `task test:changed` + `freshness:check` grün; Abwesenheits-Guards grün.
- Grep-Nachweise: kein `brain-ingest` (außer Keeper), kein
  `ingest-sources.yaml`, kein `brain_search`/`brain_read` in
  Registry/Docs-Wiring, kein `brain-links`-Import, kein `brain.yaml`-Ref.
- Wiki-Diff-Protokoll liegt vor (R1).

## Spec-Purpose für den Archiv-Merge

`brain-k4-brain-wiki.md` („Purpose fehlt"): „K4 beschreibt den
Rückbau des Brain-Wiki-Spiegels: was entfernt wurde, was als Keeper
bleibt (Chunker, Eval, Verifier) und dass Recall über K1/K3 läuft."
