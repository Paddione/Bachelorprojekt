# p1 — Probe-Script `scripts/domains-probe.mjs`

## Ziel
Neues Node-Script (Stil-Vorbild `scripts/domains-check.mjs`: `node:fs`,
`yaml`-Paket aus Root-`node_modules`, `process.exit(main(...))`).
Budget: ≤ 800 Zeilen (Plan ≈ 300).

## Verhalten
1. Registry laden (`--registry <pfad>`, Default wie domains-check).
2. Je Eintrag mit `status: live`:
   - `${VAR}`-Platzhalter im `host` aus der Cluster-Env-Datei auflösen —
     `fleet` → `environments/fleet-mentolder.yaml`, `devmesh` → `environments/dev.yaml`
     (jeweils `env_vars:`-Sektion, simples `KEY: value`-Parsing, kein Shell-Sourcing).
     Unauflösbarer Platzhalter → FAIL (fail-closed), kein Raten.
   - **DNS**: `dns.resolve4`/`resolve6` (node:dns/promises). ENOTFOUND bei
     `cluster: devmesh` → SKIP mit Grund `no-tailnet`; bei `fleet` → FAIL.
     Sonstiger DNS-Fehler → FAIL.
   - **TLS**: `tls.connect({servername, rejectUnauthorized: true})`, Port 443.
     Zertifikat abgelaufen / Hostname-Mismatch / untrusted → FAIL. Ablaufdatum
     < 14 Tage → WARN (kein FAIL, aber in der Ausgabe).
   - **HTTP**: `fetchhttps://<host>/` (erster Pfad aus `paths`? Nein — immer
     `/`, Redirects NICHT folgen, Timeout 15 s). Tatsächlicher Status muss in
     `expect.status` enthalten sein, sonst FAIL. Bei 3xx: `Location`-Header muss
     `expect.redirect_to_contains` enthalten (wenn gesetzt), sonst FAIL.
3. `status: frozen|retired` → überspringen (Zeile `SKIP <id> (<status>)`).
4. Ausgabe: eine Zeile je Host (`PASS|FAIL|SKIP <host> (<details>)`), am Ende
   `domains-probe: <n> PASS, <m> SKIP, <k> FAIL`. Exit 0 nur bei k = 0.

## Flags
- `--registry <pfad>` — Fixture-Registry (Tests).
- `--cluster <fleet|devmesh|both>` (Default `both`) — für Dispatch-Eingrenzung.
- `--validate-only` — nur Schema + Platzhalter-Auflösung, kein Netzwerk
  (für CI-sichere Offline-Tests).

## Gates
- `node scripts/domains-probe.mjs --validate-only` → Exit 0 nach p2.
- `node --check scripts/domains-probe.mjs` (Syntax) nach jedem Stand.
- Keine Secrets, keine Credentials, keine harten Timeouts > 15 s pro Host.
