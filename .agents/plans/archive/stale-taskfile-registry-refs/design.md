# Design: stale-taskfile-registry-refs

## Kontext

Zwei belegte Backlog-Befunde aus dem Postgres-Audit-Kreislauf, beide stale
Registry-Verweise in Taskfiles (disjunkte Dateien, ein Theme — deshalb ein
Branch):

- #6810: `task db:migrate` (T901440-Massage-Zweig, `taskfiles/Taskfile.data.yml`)
  hat einen ungeschlossenen `<<'EOSQL'`-Heredoc — der Delimiter steht
  eingerückt, sh meldet `unclosed here-document`. Per YAML-Parse verifiziert.
- #6814: `task registry:migrate` (`taskfiles/Taskfile.devmesh.yml:213`) prüft
  die Registry auf der retirten `tickets.llm_proxy_backends`, seit F2 (#6804)
  ist `LLM_PROXY_BACKENDS_JSON` im Deployment die effektive Registry.

## Entscheide (mit verworfenen Alternativen)

- Heredoc: nur den Delimiter auf die Block-Basis-Einrückung zurücksetzen
  (zeilenneutral, kleinster Diff). Verworfen: auf `<<-` plus Tab-Einrückung des
  ganzen Bodys umstellen — größerer Diff ohne Mehrwert.
- Registry-Check: gleiche Kennzahlen (`aktiv`, `loopback`) aus
  `LLM_PROXY_BACKENDS_JSON` des live Deployments zählen (per
  `kubectl get deploy -o json` plus `python3`, robust gegen
  Container-Umbenennungen — keine jsonpath-Containernamen-Kopplung).
  Verworfen: Check ersatzlos streichen (Seed-Verifikation ginge verloren);
  Tabellen-Query behalten (meldet stale Werte, irreführend).
- Seeden der Tabelle unangetastet: der DB-Fallback in `backends.mjs` lebt,
  frische Seed-Daten schaden nicht — Scope bleibt der Check.
- Brainstorming-Skill in dieser Umgebung nicht verfügbar; Entscheidungen
  stehen hier begründet.
