# p1 — Environment und SealedSecrets

## Task 1: Ziel-Umgebung deklarieren

**Files:** `environments/korczewski-prod.yaml`

Lege die Datei nach dem Muster von `environments/dev.yaml` an: Kopf mit
`environment: korczewski-prod`, `context: korczewski-prod`, `domain:
korczewski.de`, `secrets_env: korczewski-prod`, `workspace_namespace:
workspace-korczewski`, `website_namespace: website-korczewski`, `overlay:
korczewski-prod` und `secrets_ref: sealed-secrets/korczewski-prod.yaml`. Ein
`secrets_mode` wird bewusst nicht gesetzt: `environments/schema.yaml` kennt den
Schlüssel nicht, und ohne ihn bleibt in `scripts/env-validate.sh` die
Sealed-Datei-Prüfung aktiv — nur das Literal `plaintext` schaltet sie ab.

Setze unter `env_vars` die Scope-Werte des Features (design.md §1, §6, §7):
`PROD_DOMAIN: korczewski.de`, `CLUSTER_ENV: korczewski-prod`, `BRAND_ID:
massage`, `BRAND_NAME: "Massagepraxis Vögelsen"`, `WEBSITE_HOST:
web.korczewski.de`, `WEBSITE_SITE_URL: "https://web.korczewski.de"`,
`WEBSITE_IMAGE: website`, `WEBSITE_NAMESPACE: website-korczewski`,
`WORKSPACE_NAMESPACE: workspace-korczewski`, `PRIMARY_FRONTEND: astro`,
`TLS_SECRET_NAME: korczewski-prod-wildcard-tls`, die DB-Koordinaten `WEBSITE_DB_NAMESPACE:
workspace-korczewski`, `WEBSITE_DB_NAME: website_massage`, `WEBSITE_DB_USER:
website_massage`, die Pocket-ID-Werte `POCKET_ID_FRONTEND_URL:
"https://auth.korczewski.de"`, `POCKET_ID_DOMAIN: auth.korczewski.de`,
`POCKET_ID_URL: "http://pocket-id.workspace-korczewski.svc.cluster.local:1411"`
sowie `POCKET_ID_FALLBACK_FRONTEND_URL: ""` und `POCKET_ID_FALLBACK_URL: ""`.

`task env:validate:all` prüft jedes `environments/*.yaml` gegen alle 40
Schema-Pflicht-Variablen und wird von `scripts/health-goals-check.sh` als
G-CFG01 gepinnt; die Datei muss sie deshalb vollständig setzen, auch außerhalb
des Website-und-Auth-Scopes. Übernimm Marke, Kontakt und Recht
(`CONTACT_EMAIL: massage@korczewski.de`, `BACKUP_ALERT_EMAIL`, `CONTACT_CITY`,
`CONTACT_NAME`, `LEGAL_*`), SMTP (`SMTP_FROM`, `SMTP_USER`, `SMTP_HOST`,
`SMTP_PORT`), `NEXTCLOUD_DB_HOST`, `BRETT_DOMAIN`, `MEDIAVIEWER_HOST`,
`VIDEOVAULT_DOMAIN`, `STUDIO_DOMAIN`, `STUDIO_IMAGE`, `STUDIO_IMAGE_DIGEST`,
`RECOVER_DOMAIN`, `OTEL_DOMAIN`, `TURN_PUBLIC_IP`, `TURN_NODE`,
`TURN_OVERLAY_IP`, `TERMINAL_OVERLAY_IP` und `INFRA_NAMESPACE:
korczewski-infra` wörtlich aus `environments/korczewski.yaml` — derselbe
Betreiber, dieselben DNS-Namen — und kommentiere sie als „Schema-Pflicht, im
korczewski-prod-Artefakt ungenutzt“. `LLM_ENABLED` und `LLM_RERANK_ENABLED`
stehen auf `"false"`; `LLM_EMBED_URL` bleibt als einzige Pflicht-URL ohne
Cluster-Gegenstück auf `"http://127.0.0.1:18235"` (kein erfundener
Cluster-DNS, im deaktivierten Zustand ungenutzt). `setup_vars` trägt
`KC_USER1_USERNAME: paddione`, `KC_USER1_EMAIL: patrick@korczewski.de` und
`KC_USER1_PASSWORD: SEALED`.

`POD_CIDR` und `SERVICE_CIDR` bleiben als leere Strings mit Kommentar stehen.
Eine Variante: die effektiven Werte des Ziel-Clusters übernehmen — `cluster-cidr`
und `service-cidr` aus der k3s-Konfiguration (`/etc/rancher/k3s/config.yaml`),
und nur wenn dort nicht überschrieben, die k3s-Defaults `10.42.0.0/16` und
`10.43.0.0/16` eintragen. Begründung: die NetworkPolicies hängen daran, ein
geratener Wert wäre fail-open (design.md, Risiko 1). Der folgende Guard bricht
ab, solange die Werte leer sind, statt still auf Defaults zu fallen; `source`
ist Pflicht, weil `scripts/env-resolve.sh` Variablen exportiert.

Verify: `bash -c 'source scripts/env-resolve.sh korczewski-prod; [ "$PROD_DOMAIN" = korczewski.de ] && [ "$WEBSITE_NAMESPACE" = website-korczewski ] && [ "$TLS_SECRET_NAME" = korczewski-prod-wildcard-tls ] && for v in POD_CIDR SERVICE_CIDR; do [ -n "${!v}" ] || { echo "FAIL: $v leer"; exit 1; }; done && echo OK'`

## Task 2: Vier SealedSecrets gegen den Ziel-Cluster versiegeln

**Files:** `environments/sealed-secrets/korczewski-prod.yaml`

Vorbedingung (nicht Teil der Ownership dieses Partials): die Klartext-SSOT
`environments/.secrets/korczewski-prod.yaml`. Erzeuge sie mit `task env:generate
ENV=korczewski-prod` in einem interaktiven Terminal; abgefragt werden nur
`SMTP_PASSWORD` und `OTEL_AUTH_TOKEN`, `SMTP_FROM` und `SMTP_USER` kopiert das
Skript aus `env_vars`. Ersetze danach den aus `setup_vars` kopierten Sentinel
`SEALED` bei `KC_USER1_PASSWORD` durch einen Zufallswert (`openssl rand -hex
24`), damit nicht das Literal in `workspace-secrets` landet, und trage
`IPV64_API_KEY` von Hand ein: im Schema `required: false`, von `env:generate`
also übersprungen, für den DNS-01-Solver aber zwingend. `GITHUB_CONTENT_TOKEN`
ist optional; fehlt es, entsteht `website-content-token` wie im Schema
vorgesehen mit leerem Eintrag. Werte dürfen nicht mit `dev` beginnen und nicht
`_placeholder` enthalten (Dev-Value-Scan in `scripts/env-seal.sh`); `--force`
ist tabu.

Die Datei ist nicht gitignored, sondern über `.gitattributes:78`
(`environments/.secrets/** filter=git-crypt`) verschlüsselt: `git check-ignore`
liefert Exit 1, `git check-attr filter -- environments/.secrets/korczewski-prod.yaml`
zeigt `filter: git-crypt`. Sie bleibt in diesem Partial untracked (Ownership
sind die zwei Manifest-Dateien); niemals `git add -A`.

Prüfe Cluster-Zugang und Controller-Namen mit `kubeseal
--controller-name=sealed-secrets --controller-namespace=sealed-secrets
--context korczewski-prod --fetch-cert >/dev/null`, dann `bash
scripts/env-seal.sh --env korczewski-prod`. Der Lauf schreibt das Basisdokument
`workspace-korczewski/workspace-secrets` plus ein Dokument je Paar aus
`extra_namespaces`, das den `owner_brand`-Filter passiert — sieben weitere,
darunter `monitoring/grafana-oidc`, `monitoring/otel-collector-auth`,
`workspace-office/collabora-secrets` und
`workspace-korczewski/knowledge-secrets`. Erlaubt sind für Website und Auth
genau vier Paare: `cert-manager/ipv64-api-key`,
`workspace-korczewski/workspace-secrets`, `website-korczewski/website-secrets`
und `website-korczewski/website-content-token`. Filtere die Ausgabe und brich
ab, wenn eines davon fehlt:

```bash
python3 - environments/sealed-secrets/korczewski-prod.yaml <<'PY'
import re
import sys

import yaml

path = sys.argv[1]
allowed = {
    ("cert-manager", "ipv64-api-key"),
    ("workspace-korczewski", "workspace-secrets"),
    ("website-korczewski", "website-secrets"),
    ("website-korczewski", "website-content-token"),
}
raw = open(path, encoding="utf-8").read()
kept = []
for block in re.split(r"(?m)^---[ \t]*$", raw):
    if not block.strip():
        continue
    doc = yaml.safe_load(block)
    if doc.get("kind") != "SealedSecret":
        sys.exit(f"FAIL: unerwartetes Dokument kind={doc.get('kind')!r}")
    pair = (doc["metadata"]["namespace"], doc["metadata"]["name"])
    if pair in allowed:
        kept.append((pair, block.strip("\n")))
missing = allowed - {pair for pair, _ in kept}
if missing:
    sys.exit(f"FAIL: fehlende SealedSecrets: {sorted(missing)}")
with open(path, "w", encoding="utf-8") as fh:
    for _, block in kept:
        fh.write("---\n" + block + "\n")
print(f"OK: {len(kept)} SealedSecrets")
PY
```

Der Filter arbeitet auf den Rohtextblöcken, damit die Ciphertexte
byte-identisch bleiben, und prüft `kind: SealedSecret` je Dokument. Entferne
danach das beim Lauf geholte, öffentliche Sealing-Zertifikat wieder (`rm -f
environments/certs/korczewski-prod.pem`): es wird bei jedem Lauf neu geholt und
wäre sonst eine dritte Datei in diesem Partial. Kontrolliere das Ergebnis ohne
Reihenfolgeannahme — die Dokumentfolge stammt aus einer Bash-Hashtable und ist
nicht stabil. Jeder erneute `env-seal`-Lauf fügt die Out-of-Scope-Dokumente
wieder hinzu, der Filter muss danach erneut laufen; dauerhaft gehören
`owner_brand`-Einträge an die betroffenen Schema-Paare, was Folgearbeit
außerhalb dieses Partials ist.

Verify: `bash -c 's=environments/.secrets/korczewski-prod.yaml; f=environments/sealed-secrets/korczewski-prod.yaml; grep -qE "^IPV64_API_KEY: *\"?[^\"[:space:]]" "$s" && bash scripts/env-seal.sh --_test-completeness "$s" --_test-schema environments/schema.yaml --_test-env-file environments/korczewski-prod.yaml >/dev/null && [ "$(grep -c "^kind: SealedSecret" "$f")" -eq 4 ] && ! grep -qE "^kind: Secret$" "$f" && [ "$(grep -c "namespace: cert-manager" "$f")" -eq 1 ] && [ "$(grep -c "namespace: workspace-korczewski" "$f")" -eq 1 ] && [ "$(grep -c "namespace: website-korczewski" "$f")" -eq 2 ] && echo OK'`

## Task 3: Schema-Konsistenz prüfen und committen

**Files:** `environments/korczewski-prod.yaml`, `environments/sealed-secrets/korczewski-prod.yaml`

`bash scripts/env-validate.sh --env korczewski-prod --schema-only` muss
„passed all checks“ melden: 40 Pflicht-`env_vars`, drei Pflicht-`setup_vars` und
alle 28 Pflicht-Secrets im versiegelten Blatt. Das Basisdokument enthält die
gesamte Klartext-SSOT, deshalb deckt es auch die Keys ab, deren Ziel-Namespace
der Filter entfernt hat. Danach `task env:validate:all` laufen lassen: der neue
Eintrag läuft in derselben Schleife wie die bestehenden Envs und darf G-CFG01
nicht rot machen. Stage ausschließlich die zwei Zieldateien und prüfe, dass
`environments/.secrets/korczewski-prod.yaml` untracked bleibt.

Verify: `bash -c 'bash scripts/env-validate.sh --env korczewski-prod --schema-only >/dev/null && task env:validate:all >/dev/null && [ "$(git diff --cached --name-only | sort | tr "\n" " ")" = "environments/korczewski-prod.yaml environments/sealed-secrets/korczewski-prod.yaml " ] && echo OK'`

Commit: `feat(environments): korczewski-prod Umgebung und vier SealedSecrets anlegen`
