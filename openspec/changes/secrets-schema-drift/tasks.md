---
title: "secrets-schema-drift — Implementation Plan"
ticket_id: T003141
domains: [bachelorprojekt-security, bachelorprojekt-infra, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# secrets-schema-drift — Implementation Plan

_Ticket: T003141 — `tests/unit/secrets-sync.bats` rot: Schema-Secrets fehlen in `k3d/secrets.yaml`, Orphans in der Gegenrichtung._

## File Structure

```
environments/schema.yaml                                          (changed)
k3d/secrets.yaml                                                  (changed)
tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats (new, already committed on this branch — RED)
tests/unit/secrets-sync.bats                                      (changed — honours dev_absent)
docs/superpowers/references/secrets-architecture.md               (changed — documents the annotation)
openspec/changes/secrets-schema-drift/specs/secrets-deploy-automation.md (delta spec)
website/src/data/test-inventory.json                              (regenerated)
```

S1-Zeilenlimits greifen für keine dieser Dateien: `docs/code-quality/gates.yaml` → `s1.limits`
kennt Einträge für `.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java .php` —
weder `.yaml` noch `.md` noch `.bats`. Keine der Dateien steht in
`docs/code-quality/baseline.json` (geprüft mit
`jq -r --arg k "S1:environments/schema.yaml" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json`).

<!-- vitest: kein neuer Test nötig, weil dieser Change keine .ts/.svelte-Dateien anfasst — die Verifikation läuft vollständig über BATS. -->

## Sicherheitsrahmen (gilt für jeden Task)

- `k3d/secrets.yaml` enthält ausschließlich **Dev-Platzhalterwerte**. Es wird **kein** Wert aus
  `environments/.secrets/*` oder `environments/sealed-secrets/*` übernommen und **kein** echtes
  Credential eingetragen. Platzhalter sind offensichtlich unecht (Muster: `dev-<key-in-lowercase>`).
- Plan, Tests, Commit-Messages und PR-Beschreibung sprechen ausschließlich über
  Schlüssel-**Namen**, nie über Werte.
- Vor dem Commit: `gitleaks detect --no-git --redact` läuft über den Arbeitsbaum (Pre-Commit-Hook);
  fehlt das Binary lokal, ist es in der CI-Version 8.18.2 nachzuinstallieren (CLAUDE.md).

## MESSUNG (Ausgangslage, Mess-Konvention T002717)

Gemessen gegen Commit `f6f7e7f1996ab6beb33501d78c0de48f417d6a9c` (`origin/main`, 2026-08-10):

```bash
PRE=f6f7e7f1996ab6beb33501d78c0de48f417d6a9c
git stash list >/dev/null   # nur Sanity; kein Zustandswechsel
python3 - <<'PY'
import subprocess, yaml
PRE = "f6f7e7f1996ab6beb33501d78c0de48f417d6a9c"
def show(p):
    return subprocess.run(["git","show",f"{PRE}:{p}"],capture_output=True,text=True,check=True).stdout
schema = yaml.safe_load(show("environments/schema.yaml"))
names = {s["name"] for s in schema.get("secrets", [])}
dev = set()
for doc in yaml.safe_load_all(show("k3d/secrets.yaml")):
    if doc and doc.get("kind") == "Secret" and doc.get("metadata", {}).get("name") == "workspace-secrets":
        dev |= set((doc.get("stringData") or doc.get("data") or {}).keys())
print("schema_secrets =", len(names))          # 88
print("dev_keys       =", len(dev))            # 80
print("missing_in_dev =", len(names - dev))    # 19
print("orphans_in_dev =", len(dev - names))    # 11
for k in sorted(names - dev): print("  MISSING", k)
for k in sorted(dev - names): print("  ORPHAN ", k)
PY
```

Ergebnis: `schema_secrets=88`, `dev_keys=80`, **19 fehlend**, **11 Orphans** — identisch zu den
Zahlen im Ticket vom 2026-08-10. Der rote Lauf, der diese Zahlen erzeugt:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/secrets-sync.bats
# 2 von 4 rot (Tests 1 und 2); die beiden SealedSecret-Tests sind grün.
```

## Je-Eintrag-Urteil

Grundlage der Urteile (jeweils nachrechenbar):

```bash
# a) Wird der Orphan irgendwo als secretKeyRef konsumiert?
grep -rn 'key: *<KEY>' k3d/ prod/ prod-fleet/ prod-mentolder/ prod-korczewski/
# b) Hat das Schema den Namen bewusst zurückgezogen?
grep -n '<KEY>' environments/schema.yaml
# c) Existiert der Dienst im k3d-Base?
ls k3d/ | grep -i <service>
```

### A. 19 fehlende Schema-Secrets

**A1 — Dev-Platzhalter ergänzen (8):** Der Dienst bzw. der Konsument existiert im k3d-Base oder
das Schema deklariert bereits ein `default_dev`.

| Key | Begründung |
|---|---|
| `GRAFANA_ADMIN_PASSWORD` | `required: true` — das Schema fordert ihn selbst; Dev-Platzhalter kostet nichts und hält die Invariante „required ⇒ in Dev vorhanden" prüfbar. |
| `FACTORY_OTLP_TOKEN` | `required: true`, gleiche Begründung. |
| `POCKET_ID_ENCRYPTION_KEY` | Pocket ID läuft im k3d-Base; ohne Key verschlüsselt es lokal anders als in prod. |
| `POCKET_ID_DOWNLOADS_SECRET` | Von `k3d/pocket-id-client-seed.yaml` per `secretKeyRef` konsumiert (Zeile ~131). |
| `POCKET_ID_GRAFANA_SECRET` | Von `k3d/pocket-id-client-seed.yaml` konsumiert (Zeile ~159). |
| `NTFY_TOKEN_OPEncode` | Schema deklariert bereits `default_dev` — der Dev-Wert ist vorgesehen. |
| `NTFY_TOKEN_AGY` | Schema deklariert bereits `default_dev`. |
| `AGENT_PUSH_TOKEN` | Schema deklariert bereits `default_dev`. |

Hinweis zur Schreibweise `NTFY_TOKEN_OPEncode`: die gemischte Groß-/Kleinschreibung ist mit hoher
Wahrscheinlichkeit ein Tippfehler, wird in diesem Change aber **nicht** korrigiert — der Name
steht in mehreren `environments/sealed-secrets/*.yaml`, eine Umbenennung wäre ein eigener Vorgang
mit Reseal-Schritt. Task 5 legt dafür ein Folge-Ticket an.

**A2 — Bewusst dulden, mit `dev_absent: true` + `dev_absent_reason` annotieren (11):**

| Key | Grund der Duldung |
|---|---|
| `RUSTDESK_ID_ED25519` | Host-generiertes Schlüsselmaterial; kein Konsument in `k3d/`, `prod*/`. |
| `RUSTDESK_ID_ED25519_PUB` | dito. |
| `GHCR_USERNAME` | Nur `flux-system` (Secret `ghcr-auth`); k3d-Base hat kein Flux. |
| `FLUX_WEBHOOK_TOKEN` | Nur `flux-system` (Secret `flux-webhook-token`); k3d-Base hat kein Flux. |
| `GITHUB_CONTENT_TOKEN` | Externes GitHub-PAT; kein Dev-Äquivalent, ein Fake-Wert würde einen Konfigurationsfehler maskieren. |
| `OPENROUTER_API_KEY` | Externes Provider-Credential (in `website-secrets` injiziert); Fake-Wert maskiert Fehlkonfiguration. |
| `OPENCODE_API_KEY` | dito. |
| `GEMINI_API_KEY` | dito. |
| `GITHUB_MODELS_TOKEN` | dito. |
| `PUSHOVER_TOKEN` | Das Schema sagt es selbst: „Not deployed to prod (prod overlay deletes the alertmanager-pushover Secret); scripts/lib/notify.sh handles absence gracefully." |
| `PUSHOVER_USER` | dito. |

Alle elf haben `required: false` — die Annotation kollidiert nicht mit der Regel „`required: true`
darf nicht `dev_absent` sein".

### B. 11 Orphans in `k3d/secrets.yaml`

**B1 — Aus `k3d/secrets.yaml` entfernen (10):** `BRAINSTORM_OIDC_SECRET`,
`CLAUDE_CODE_OIDC_SECRET`, `COMFY_OIDC_SECRET`, `DOCS_OIDC_SECRET`, `MAIL_OIDC_SECRET`,
`NEXTCLOUD_OIDC_SECRET`, `RECOVERY_OIDC_SECRET`, `TRAEFIK_OIDC_SECRET`,
`VAULTWARDEN_OIDC_SECRET`, `WEBSITE_OIDC_SECRET`.

Begründung: Das Schema hat diese Namen am 2026-06-22 ausdrücklich zurückgezogen — die Zeilen
558, 701, 711, 750, 927, 937 und 952 in `environments/schema.yaml` tragen jeweils den Kommentar
„… removed — Keycloak decommissioned (pocket-id-migration Welle 3)". Nachfolger sind die
`POCKET_ID_<SERVICE>_SECRET`-Namen. Kein einziger `secretKeyRef` in `k3d/`, `prod/`, `prod-fleet/`,
`prod-mentolder/`, `prod-korczewski/` liest sie (Zählbefehl liefert 0). Restvorkommen und wie
damit umzugehen ist:
- `k3d/website-dev-secrets.yaml` trägt `WEBSITE_OIDC_SECRET` — ein **anderes** Secret-Objekt,
  nicht `workspace-secrets`. Bleibt unangetastet (der Legacy-Fallback in
  `website/docker-entrypoint.dev.sh` liest es weiterhin).
- `k3d/docs-content-built/nextcloud.html` nennt `NEXTCLOUD_OIDC_SECRET` in generierter Doku.
  Wird hier nicht mitgeändert; Task 5 legt dafür ein Doku-Folge-Ticket an.

**B2 — Ins Schema aufnehmen statt löschen (1):** `POCKET_ID_CLAUDE_CODE_SECRET`.

Begründung: Der Schlüssel ist **kein** Legacy-Rest, sondern eine echte Schema-Lücke. Er wird von
`k3d/pocket-id-client-seed.yaml` per `secretKeyRef` konsumiert (Zeile ~153) und liegt bereits in
`environments/sealed-secrets/fleet-mentolder.yaml`, `fleet-korczewski.yaml` und
`mentolder.yaml`. Er wird mit `required: false` ergänzt, damit die bestehenden
SealedSecret-Vollständigkeitstests (die nur `required: true` prüfen) nicht rot werden.

### C. Konfliktregel

Bei Widerspruch gewinnt `environments/schema.yaml` — es ist laut CLAUDE.md die autoritative
Liste. `k3d/secrets.yaml` ist reine Dev-Belegung und wird im `prod/`-Overlay ohnehin per
`$patch: delete` entfernt. Die einzige zulässige Ausnahme ist die dokumentierte Abwesenheit in
Dev via `dev_absent: true` — und die steht selbst im Schema, nicht in der Dev-Datei und nicht als
Allowlist im Test.

## Tasks

- [ ] **1. Failing-Test-Step (RED) — Ausgangslage belegen.**
      Beide Testformen erfassen (Sammeldatei UND Verzeichnis, CLAUDE.md T002696) und den roten
      Lauf festhalten, bevor irgendetwas geändert wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/secrets-sync.bats
# expected: FAIL — Tests 1 und 2 rot (19 missing, 11 orphans)

tests/unit/lib/bats-core/bin/bats -r tests/spec/secrets-deploy-automation*
# expected: FAIL — die vier Guards in
# tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats sind rot
# (dev_absent-Annotation fehlt, Legacy-Keys vorhanden, POCKET_ID_CLAUDE_CODE_SECRET
#  nicht im Schema); die Sammeldatei tests/spec/secrets-deploy-automation.bats bleibt grün.
```

- [ ] **2. Schema erweitern (`environments/schema.yaml`).**
      - `POCKET_ID_CLAUDE_CODE_SECRET` als neuen Eintrag unter `secrets:` ergänzen, direkt nach
        `POCKET_ID_BRETT_SECRET`, mit `required: false`, `generate: true`, `length: 32` und einer
        `description`, die den Konsumenten `k3d/pocket-id-client-seed.yaml` nennt.
      - Die elf Keys aus **A2** je um `dev_absent: true` und `dev_absent_reason: "<Text>"` ergänzen.
        Der Text ist die Spalte „Grund der Duldung" oben, in einer Zeile.
      - Keine bestehenden Namen umbenennen, keine Einträge löschen.
      Prüfen mit:

```bash
python3 -c "
import yaml
s=yaml.safe_load(open('environments/schema.yaml'))
n=[x for x in s['secrets'] if x.get('dev_absent') is True]
print('dev_absent annotiert:', len(n))
print('POCKET_ID_CLAUDE_CODE_SECRET im Schema:', any(x['name']=='POCKET_ID_CLAUDE_CODE_SECRET' for x in s['secrets']))
"
# erwartet: dev_absent annotiert: 11 / POCKET_ID_CLAUDE_CODE_SECRET im Schema: True
```

- [ ] **3. Dev-Secrets angleichen (`k3d/secrets.yaml`).**
      - Unter `workspace-secrets` die zehn **B1**-Keys ersatzlos entfernen.
      - Die acht **A1**-Keys mit offensichtlichen Dev-Platzhaltern ergänzen (Muster
        `dev-<key-in-lowercase>`), alphabetisch in den bestehenden Block einsortiert.
      - Keine echten Credentials, kein Wert aus `environments/.secrets/*`.
      Prüfen mit:

```bash
python3 -c "
import yaml
dev=set()
for d in yaml.safe_load_all(open('k3d/secrets.yaml')):
    if d and d.get('kind')=='Secret' and d.get('metadata',{}).get('name')=='workspace-secrets':
        dev |= set((d.get('stringData') or d.get('data') or {}).keys())
print('dev_keys =', len(dev))
"
# erwartet: dev_keys = 78  (80 − 10 entfernt + 8 ergänzt)
```

- [ ] **4. `tests/unit/secrets-sync.bats` auf die Annotation umstellen.**
      Der Test „every schema secret exists in k3d/secrets.yaml workspace-secrets" überspringt
      künftig Keys mit `dev_absent: true`. Der Header-Kommentar der Datei nennt den Prüfmodus
      (Output-Verifikation) und verweist auf `dev_absent` statt auf eine Allowlist. Die
      Orphan-Richtung bleibt unverändert streng — Orphans werden nicht geduldet.
      Danach müssen alle vier Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/secrets-sync.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/secrets-deploy-automation*
# erwartet: beide Läufe grün
```

- [ ] **5. Dokumentation und Folge-Tickets.**
      - `docs/superpowers/references/secrets-architecture.md` um einen Abschnitt „Schema ↔
        `k3d/secrets.yaml`" erweitern: Schema gewinnt bei Konflikt, Dev-Datei trägt nur
        Platzhalter, bewusste Abwesenheit wird als `dev_absent`/`dev_absent_reason` annotiert.
      - Zwei Folge-Tickets anlegen (Namen, keine Werte in der Beschreibung):

```bash
bash scripts/ticket.sh create --type chore \
  --title "NTFY_TOKEN_OPEncode: Schreibweise vereinheitlichen (inkl. Reseal aller sealed-secrets)"
bash scripts/ticket.sh create --type chore \
  --title "docs-content: NEXTCLOUD_OIDC_SECRET in nextcloud.html auf POCKET_ID_NEXTCLOUD_SECRET umstellen"
```

- [ ] **6. Manifest- und Secret-Sanity.**

```bash
task workspace:validate
gitleaks detect --no-git --redact --verbose
grep -rn 'AKIA\|BEGIN .*PRIVATE KEY' k3d/secrets.yaml || echo "keine Schlüsselmaterial-Muster in der Dev-Datei"
```

- [ ] **7. Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
