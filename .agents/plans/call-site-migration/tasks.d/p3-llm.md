# p3 — LLM-Welle (Impl, Re-Baseline-Split, ≤10 Sites)

## Ziel
`llm → website` (74 CALLS) + `llm-proxy → website` (31 CALLS) auf ports
umstellen — aber NUR die P0-bestätigten Prod-Sites; Test-Rauschen bleibt
unangetastet (VANTA). Falls P0 mehr als 10 Prod-Sites findet, in p3a/p3b
splitten (gleiche Gates, eigene Commits, je unabhängig mergbar).

## Schritte
1. P0-Tabelle für `scripts/llm-proxy/*` + `assistant/llm`-Caller öffnen;
   jede Prod-Site genau EINER der folgenden Klassen zuordnen:
   (a) Session/Auth → `ports/session` / `ports/policy`;
   (b) Content/Embedding → `ports/content` (ggf. um P2-Export erweitern —
   Erweiterung als eigener Mini-Commit AUF p1, kein Scope-Creep in p3);
   (c) Test-Only → VANTA bestätigen, Finger weg.
2. Klasse (a) zuerst (auth-adjacent-Prinzip), dann (b). Pro Datei: Import
   umstellen → typecheck → betroffene Tests → Allowlist kürzen.
3. `assistant/llm`-interne Caller (innerhalb `components/website`) NICHT
   anfassen — keine Cross-Boundary, kein Handlungsbedarf (im Log vermerken,
   damit p5 sie nicht als Rest fehlinterpretiert).

## Gates (p3Done)
- `npm run typecheck` grün.
- `task test:changed` grün.
- Boundary-Test grün mit gekürzter Allowlist; `phase-events.log` mit
   Vorher/Nachher pro Klasse (a)/(b)/(c).
- Kein Schritt > 10 Sites: sonst p3b abspalten (Regel, keine Ausnahme).
