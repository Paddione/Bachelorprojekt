---
ticket_id: T000951
plan_ref: docs/superpowers/plans/2026-06-19-secret-task-mismatch-guards.md
status: draft
domains: [infra, security]
---

# Spec — Secret-Task Mismatch-Guards

**Ticket:** T000951 · **Branch:** `fix/secret-task-mismatch-guards` · **Typ:** Fix/Härtung (bug, major)

## WARUM (Problem)

Secrets in diesem Repo leben in **sechs Konsistenz-Ebenen**, zwischen denen Drift („Mismatch") entstehen kann:

1. **Plaintext** `environments/.secrets/<env>.yaml` (git-crypt, gitignored)
2. **Sealed** `environments/sealed-secrets/<env>.yaml` (committed)
3. **Sealing-Cert** `environments/certs/<env>.pem` (pro-Cluster Public Key)
4. **Live-Secret** `workspace-secrets` (Controller-entschlüsselt im Cluster)
5. **Consumer-Eigenkopie** der Credential: Postgres-Rollen-PW · Keycloak-Realm-Client-Secret · Nextcloud `config.php`-Literal
6. **Laufender Pod** (env-Var beim Pod-Start injiziert)

Eine `task`-Aktion, die Ebene *N* ändert, ohne *N+1…6* nachzuziehen, hinterlässt einen Mismatch. Der häufigste Schaden: Pods/DB driften, „funktionieren" aber so lange beide auf dem **alten** Wert stehen — und brechen erst beim **nächsten Pod-Restart** mit `password authentication failed` / „Invalid client credentials" auf (latente Landmine).

### Audit-Befund: der kanonische Pfad ist bereits robust

`task workspace:deploy ENV=<brand>` verkettet die Reconciler korrekt:
`keycloak:sync` (`Taskfile.yml:2522`) → `workspace:sync-db-passwords` (`Taskfile.yml:2524`) → `coturn:sync-secret` + `talk-setup` (`Taskfile.yml:2533-2544`). `shared-db` postStart self-healt Rollen-PWs aus dem Secret bei jedem Pod-Restart (`k3d/shared-db.yaml:222-227`). Der `$patch: delete`-Guard schützt prod-`workspace-secrets` vor dem Dev-Placeholder in **allen drei** angewendeten Overlays (mentolder/korczewski/staging, per Live-Render bestätigt). **Hier ist kein Handlungsbedarf.**

### Zwei verbleibende Problemklassen

- **(A) Verkettete Reconciler failen OPEN** — ein fehlgeschlagener Abgleich bricht den umschließenden Deploy *nicht* ab; der Deploy meldet „grün", der Mismatch bleibt unsichtbar.
- **(B) Leichtgewichtige Secret-Pfade rufen die Reconciler gar nicht auf** — `secrets:sync`, `db:restore`, `app-install` ändern eine Ebene, ohne die Kette anzustoßen.

## WAS (9 zu härtende Lücken)

| # | Sev | Ort | Mismatch der bleibt | Soll-Verhalten |
|---|-----|-----|---------------------|----------------|
| 1 | HIGH | `Taskfile.yml:2424-2428` (deploy decrypt-wait) | SealedSecret entschlüsselt nie (stale Cert) → `for i in seq 1 30`-Loop läuft **ohne Fehler** durch → ghcr-PAT leer, danach lesen sync-db/keycloak ein leeres Secret und „SKIP"en → Deploy „grün", Cluster ohne Credentials | **fail-closed**: nach Loop `exit 1` mit klarer Diagnose, wenn `workspace-secrets` fehlt. Logik in testbaren Helper `scripts/wait-for-sealed-secret.sh` extrahieren (großzügiges Timeout, `KUBECTL`-Override) |
| 2 | HIGH | `scripts/keycloak-sync.sh:64-73, 93-99, 209` | `exit 0` bei jeder Keycloak-Unreadiness; als Deploy-Step → rotiertes OIDC-Secret in Pod+`workspace-secrets`, Realm-DB bleibt alt → **SSO bricht**, Deploy grün | non-dev **fail-closed** nach Readiness-Wait + Post-PUT-Verify (FAILED>0 → exit≠0); Soft-Override `KEYCLOAK_SYNC_SOFT=1` für Notfälle |
| 3 | MED | `scripts/env-seal.sh:324-334` | Reused `certs/<env>.pem` ohne Live-Abgleich → nach Cluster-Reset versiegelt es **undecryptbar** (speist #1) | Bei erreichbarem Cluster Live-Cert-Fingerprint vs. `CERT_FILE` vergleichen → bei Drift fail-closed (Override `--reuse-cert`); bei nicht erreichbarem Cluster explizite „nicht verifiziert"-Warnung |
| 4 | MED | `scripts/backup-restore.sh:311-315`, `Taskfile.yml:1929-1941` (`workspace:db:restore`) | Restore startet nichts neu → postStart self-heal feuert nicht → Rollen-PW + Nextcloud `config.php` driften ggü. `workspace-secrets` | `workspace:sync-db-passwords` an `db:restore` **ketten** (analog `db:start`@`Taskfile.yml:1906`); Restore-Guidance angleichen; gleiches für `recovery:restore-*` |
| 5 | MED | `scripts/register-secret.mjs`, `scripts/app-install.sh:71, 88-91` | Neuer App-Secret → Plaintext+Schema, aber **nicht** gesealt → fehlt im Cluster bis manuelles `env:seal` | `app-install.sh` nach `process-secrets.mjs` `task env:seal ENV=<env>` **ketten** (bzw. fail-closed-Warnung „sealed mirror stale") |
| 6 | MED | `Taskfile.yml:1365-1380` (`secrets:sync`) | Wendet Sealed an, **ohne** Workload/DB-Reconcile → Pods + Postgres bleiben auf altem PW (latente Landmine) | Nach Apply die Consumer-Deployments auflisten + Hinweis auf `sync-db-passwords`/Restart; optional Companion `secrets:sync:full` (apply + sync-db + rollout restart) |
| 7 | MED | `Taskfile.yml:3502-3529` (`claude-code:rotate-tokens`) | Server akzeptiert nur neuen Token, jede `settings.json` hält alten → 401 bis manuelles Re-Setup pro Maschine | Reminder unmissverständlich/fail-loud machen; Token-Version-Annotation am `mcp-auth-proxy` Deployment, die `claude-code:setup` prüfen kann |
| 8 | LOW | `scripts/ci-dummy-secrets.sh:1-8` | Kein ENV/CI/Context-Guard; schreibt Placeholder-Secret-Files (indirekt über späteren Deploy aus selbem Tree gefährlich) | **fail-closed Precondition**: nur fortfahren wenn `CI=true` ODER `ENV` ∈ {dev, leer}; zusätzlich Refuse wenn aktiver kube-context prod-brand ist (defense-in-depth) |
| 9 | LOW | `scripts/keycloak-sync.sh:130-134` | `WEBSITE_OIDC_SECRET` aus `website-secrets` (andere ns) → `env:seal` von `workspace-secrets` rotiert es nicht mit | `keycloak-sync.sh` warnt laut, wenn website-secrets-Fetch leer ist; Doku/`env:seal`-Hinweis zur Co-Rotation |

## Nicht-Ziele / Leitplanken

- **Kein Silent-Fallback einführen.** Fail-closed bedeutet *lautes Abbrechen mit Diagnose*, nicht stilles Weiterlaufen mit Ersatzwert. (Vgl. die bge-m3/Voyage-„fail closed"-Doktrin im Repo.)
- **Happy-Path nicht verschlechtern.** Timeouts großzügig wählen (ein langsamer-aber-legitimer Cold-Decrypt darf nicht zu hartem Abbruch führen) — lieber Timeout erhöhen als Default senken. Jeder neue Hard-Fail bekommt einen dokumentierten Soft-Override (Env-Flag) für Notfälle.
- **Dev-Ergonomie wahren.** Guards greifen non-dev/prod; `ENV=dev` und lokale k3d-Flows bleiben reibungslos.
- **Idempotenz.** Alle Änderungen müssen bei wiederholtem Lauf stabil sein (kein Doppel-Reseal-Drift, kein wiederholter Restart-Sturm).
- **Agentic-first.** Inline-Taskfile-Logik in sourcebare, testbare Helfer extrahieren (`KUBECTL`/`KUBESEAL`-Override für Fakes) statt opaker Heredocs — Factory-/BATS-observierbar.

## Test-Strategie (TDD pro Finding)

Jedes Finding bekommt einen fehlschlagenden BATS-Test **vor** der Implementierung. Seams:
- **#8** `tests/unit/secret-task-guards.bats` — `ENV=mentolder` (CI unset) → Script muss `exit≠0` und darf **keine** Files schreiben. *(in diesem Commit bereits als roter Test enthalten.)*
- **#1** `scripts/wait-for-sealed-secret.sh` mit `KUBECTL`-Override — Fake-not-found → `exit 1` nach kurzem Timeout; Fake-found → `exit 0`. *(roter Test gegen den noch nicht existierenden Helper in diesem Commit enthalten.)*
- **#3** `env-seal.sh --_test-cert-compare <a.pem> <b.pem>` → mismatch ⇒ `exit≠0` (analog bestehende `--_test-*`-Seams).
- **#2** `keycloak-sync.sh` Readiness-/Verify-Funktionen offline testbar via injizierbare Probe-Hooks; non-dev unready ⇒ `exit≠0`.
- **#4/#5/#6** Taskfile-Dry-Run (`task --dry-run`) + BATS auf die geketteten Helfer; assert, dass die Reconciler-Aufrufe in der Kette stehen.
- **#7/#9** BATS auf die Warn-/Annotation-Ausgabe.

Finaler Verifikations-Task: `task test:changed` + `task freshness:regenerate` + `task freshness:check` (CI-Äquivalent inkl. S1–S4-Ratchet) + `task test:inventory` (nach Test-Änderungen). Neue BATS-Files in `test:unit` verdrahten (sonst Coverage-Guard rot) oder begründet in `tests/unit/.coverage-allowlist`.
