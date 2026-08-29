# system-audit Checklisten

Fachliche Prozeduren für die Ziele, die keinen delegierten Skill haben. Alle Kommandos
sind **read-only** — jeder schreibende Zugriff gehört zu `incident-response`/`infra-ops`.
Jeder Check liefert entweder „ok" oder einen Befund im Format `SA-<ZIEL>-<NN>` mit
Evidence (Regel 2 des Skills).

## 1. flux-cluster (Live-Sweep)

Kontext `fleet`. MCP-first (`mcp-kubernetes_*`, Flux-MCP), Fallback `kubectl --context fleet`.

1. **Flux-Readiness** — `kubectl get kustomization,helmrelease -A`:
   jede Zeile mit `Ready=False` oder leerem Ready-Status ⇒ Befund (Critical bei
   Prod-Namespaces `workspace*`, sonst Warning). `Suspended=True` ⇒ Warning (stille
   Drift-Ressource; bewusste Ausnahmen dokumentieren).
2. **Artefakt-Alter** — `kubectl get ocirepository,gitrepository -A -o wide`: Artefakt
   älter als das Doppelte seines Intervalls ⇒ Warning (Reconciliation stockt).
3. **Pod-Gesundheit** — Restarts > 5 in 24 h, `CrashLoopBackOff`, `Pending` > 15 min
   in `workspace*` ⇒ Critical bei Kern-Services (website, brett, llm-proxy), sonst Warning.
4. **Node-Pressure** — Node-Stats (Summary API): Memory > 85 % dauerhaft, DiskPressure-
   Events ⇒ Warning.
5. **Events** — Warning/Error-Events der letzten 24 h je Namespace, dedupliziert nach
   Reason+Object; wiederkehrende Muster ⇒ Warning.

## 2. security (SealedSecrets, OIDC, DSGVO)

Fachprozeduren für Rotation/Seeding: infra-ops §6/§4. Hier nur Prüfungen:

1. **Plaintext-Secrets im Git-Baum** — `kind: Secret` ohne `sops:`-Metadaten und ohne
   SealedSecret-Bezug in `fleet/`, `prod-fleet/`, `flux/` ⇒ Critical.
2. **SealedSecrets-Alter** — Erzeugungsdatum der SealedSecret-Manifeste gegen die
   Rotationsrichtlinie (infra-ops §6): überfällig ⇒ Warning, deutlich überfällig (> 2×
   Richtwert) ⇒ Critical.
3. **OIDC-Client-Drift** — Clients in `pocket_id.oidc_clients` (read-only SQL) gegen die
   im Repo dokumentierten/erwarteten Clients (infra-ops §4): fehlende, verwaiste oder
   abweichende Redirect-URIs ⇒ Warning.
4. **DSGVO-Basics der Brand-Seiten** — Impressum + Datenschutzerklärung erreichbar auf
   jeder gerouteten Brand-Domain; Kontaktformulare ohne sichtbare Datenminimierung
   ⇒ Warning. Tiefe (Inhalte) bleibt beim `web-audit`-LLM-Teil.
5. **Zertifikate** — Ablauf < 30 Tage ⇒ Warning, < 7 Tage ⇒ Critical.

## 3. Datenbank (PostgreSQL)

Backup-Audit und Restore-Prozedur: infra-ops §7. Hier nur Prüfungen (read-only,
`mcp-postgres`; nie `SELECT *` von `tickets.ticket_plans`):

1. **Backup-Frische** — letzter erfolgreicher Backup-Lauf je Brand: älter als das
   Backup-Intervall ⇒ Critical. Kein Backup-Nachweis auffindbar ⇒ Critical.
2. **Restore-Verifikation** — letzter verifizierter Restore (infra-ops §7): älter als
   der Richtwert ⇒ Warning (ein Backup ohne Restore-Test ist eine Hypothese).
3. **Schema-Gesundheit** — `invalid` Indizes (`pg_index.indisvalid = false`) ⇒ Warning;
   Tabellen ohne Primärschlüssel in `tickets` ⇒ Warning.
4. **Wachstum/Laufzeit** — DB-Größen-Trend, langlebige Idle-In-Transaction-Verbindungen
   (> 30 min) ⇒ Warning.
5. **Ticket-DB-Hygiene** — verwaiste Plan-Zeilen ohne Ticketbezug ⇒ Info/Warning je
   Ausprägung. Tickets mit dem Titel `Mishap Rollup — fortlaufende Sammlung` sind Altlasten
   des abgebauten Automaten [T014104] und dürfen geschlossen werden.

## 4. llm-pipeline (GPU, Proxy, Loadouts)

Betrieb und Loadout-Wechsel: infra-ops §5. Konfig-SSOT: `scripts/llm/loadouts.json`.

1. **Proxy-Erreichbarkeit** — llm-proxy (:18235) antwortet nicht ⇒ Critical; einzelne
   Backends unhealthy ⇒ Warning (Critical, wenn es der einzige Backend-Pfad einer
   Agenten-Familie ist).
2. **Loadout-Drift** — deklarierte Loadouts in `loadouts.json` vs. tatsächlich geladene
   Modelle am GPU-Host: Abweichung ⇒ Warning (Prozess-Ebene prüft zusätzlich
   `bash scripts/runtime-drift-check.sh` im repo-Ziel).
3. **GPU-Speicher** — belegter VRAM > 90 % im Ruhezustand ⇒ Warning (OOM-Risiko beim
   nächsten Loadout-Wechsel).
4. **Roster-Konsistenz** — `tests/spec/agent-roster.bats` lokal laufen lassen: Fail
   ⇒ Warning (Agent-Registry driftet gegen `.opencode/agent-models.jsonc`).
5. **Gateway-Dienste** — LLM-Gateway-Services im Cluster nicht Ready (Überschneidung mit
   Checkliste §1) ⇒ wie dort, hier nur wenn nicht schon erfasst.
