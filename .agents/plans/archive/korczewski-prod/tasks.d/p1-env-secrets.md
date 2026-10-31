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

**Files:** `environments/sealed-secrets/korczewski-prod.yaml`,
`environments/certs/korczewski-prod.pem`

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

Nicht vom Generator abgedeckt sind drei Keys, die `k3d/website.yaml` und
`k3d/pocket-id.yaml` per `secretKeyRef` **ohne** `optional: true` lesen und die
das Schema weder erzeugt noch als Pflicht führt: `POCKET_ID_ENCRYPTION_KEY`,
`SESSIONS_CRON_TOKEN`, `BRETT_OIDC_SECRET`. Sie bekommen frische
`openssl rand -hex 32`-Werte; ohne sie startet der Ziel-Pod nicht (CrashLoop
wegen fehlendem Secret-Key, nicht wegen fehlender Konfiguration).

Die Datei ist nicht gitignored, sondern über `.gitattributes:78`
(`environments/.secrets/** filter=git-crypt`) verschlüsselt: `git check-ignore`
liefert Exit 1, `git check-attr filter -- environments/.secrets/korczewski-prod.yaml`
zeigt `filter: git-crypt`. Sie bleibt in diesem Partial untracked (Ownership
sind die zwei Manifest-Dateien); niemals `git add -A`.

Prüfe Cluster-Zugang und Controller-Namen mit `kubeseal
--controller-name=sealed-secrets --controller-namespace=sealed-secrets
--context korczewski-prod --fetch-cert >/dev/null` — dieser Check schlägt bei
der Ausführung erwartbar fehl, weil der Cluster noch nicht existiert (design §6,
Abweichung von D5). Statt ihn zu erzwingen, wird das Keypair vorab erzeugt:

```bash
# RSA 4096, leeres Subject/Issuer, 10 Jahre — Profil wie
# environments/certs/fleet-korczewski.pem.
tmp=$(mktemp -d) && chmod 700 "$tmp"
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 3650 -subj "/" \
  -keyout "$tmp/tls.key" -out "$tmp/tls.crt"
cp "$tmp/tls.crt" environments/certs/korczewski-prod.pem
# Kind: List mit einem kubernetes.io/tls-Secret, Name sealed-secrets-key<5 Zeichen>,
# ns sealed-secrets, Label sealedsecrets.bitnami.com/sealed-secrets-key=active,
# data.tls.crt/.tls.key base64 — Muster .secrets/sealed-secrets-key.fleet.yaml.
# Ziel: environments/.secrets/sealed-secrets-key.korczewski-prod.yaml (mode 600),
# private Hälfte verlässt das Repo nicht.
```

Dann `bash scripts/env-seal.sh --env korczewski-prod --reuse-cert`: der Lauf
schreibt das Basisdokument
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
byte-identisch bleiben, und prüft `kind: SealedSecret` je Dokument. Das
öffentliche Sealing-Zertifikat `environments/certs/korczewski-prod.pem` bleibt
in diesem Partial — anders als im Ursprungsplan ist es hier kein Nebenprodukt
eines `--fetch-cert`, sondern der committete Anker der D5-Abweichung
(design §6): es wird zur Bauzeit erzeugt, nicht vom Cluster geholt.
Kontrolliere das Ergebnis ohne Reihenfolgeannahme — die Dokumentfolge stammt
aus einer Bash-Hashtable und ist nicht stabil. Jeder erneute `env-seal`-Lauf
fügt die Out-of-Scope-Dokumente wieder hinzu, der Filter muss danach erneut
laufen; dauerhaft gehören `owner_brand`-Einträge an die betroffenen
Schema-Paare, was Folgearbeit außerhalb dieses Partials ist.

Der Namespace-Zähler unten matcht bewusst nur die Dokumentkopf-Zeile
(`^  namespace: …$`, zwei Leerzeichen). `kubeseal` schreibt denselben Namespace
zusätzlich unter `spec.template.metadata.namespace` (sechs Leerzeichen); ein
namenloser `grep -c "namespace: X"` zählt darum jeden Treffer doppelt und
würde die erwarteten Zahlen 1/1/2 nie erreichen (Ist-Stand der Bestandsdatei
`environments/sealed-secrets/fleet-korczewski.yaml`: 2/6/4).

Verify: `bash -c 's=environments/.secrets/korczewski-prod.yaml; f=environments/sealed-secrets/korczewski-prod.yaml; grep -qE "^IPV64_API_KEY: *\"?[^\"[:space:]]" "$s" && bash scripts/env-seal.sh --_test-completeness "$s" --_test-schema environments/schema.yaml --_test-env-file environments/korczewski-prod.yaml >/dev/null && [ "$(grep -c "^kind: SealedSecret" "$f")" -eq 4 ] && ! grep -qE "^kind: Secret$" "$f" && [ "$(grep -cE "^  namespace: cert-manager$" "$f")" -eq 1 ] && [ "$(grep -cE "^  namespace: workspace-korczewski$" "$f")" -eq 1 ] && [ "$(grep -cE "^  namespace: website-korczewski$" "$f")" -eq 2 ] && echo OK'`

## Task 3: Schema-Konsistenz prüfen und committen

**Files:** `environments/korczewski-prod.yaml`, `environments/sealed-secrets/korczewski-prod.yaml`,
`environments/certs/korczewski-prod.pem`, `environments/.secrets/sealed-secrets-key.korczewski-prod.yaml`

`bash scripts/env-validate.sh --env korczewski-prod --schema-only` muss
„passed all checks“ melden: 40 Pflicht-`env_vars`, drei Pflicht-`setup_vars` und
alle 28 Pflicht-Secrets im versiegelten Blatt. Das Basisdokument enthält die
gesamte Klartext-SSOT, deshalb deckt es auch die Keys ab, deren Ziel-Namespace
der Filter entfernt hat.

Danach `task env:validate:all` laufen lassen: der neue Eintrag läuft in derselben
Schleife wie die bestehenden Envs und darf G-CFG01 nicht rot machen. Der Lauf
ist auf `main` bereits rot, unabhängig von diesem Plan: `environments/korczewski.yaml`
und `environments/mentolder.yaml` setzen `secrets_ref: sealed-secrets/<name>.yaml`,
obwohl Commit `dbaa6436aa` (T900789) ihre Secrets auf `fleet-korczewski` bzw.
`fleet-mentolder` umgestellt hat; die zwei Dateien existieren nicht mehr, die
Env-Einträge sind tote References. Diese Fremdschuld wird hier **nicht**
mitrepariert (fremde Envs, eigener Fix) und **nicht** verdeckt: die Verifikation
fordert, dass `korczewski-prod` in derselben Schleife „passed all checks" meldet
und dass die FAIL-Menge exakt diese zwei Altbestände bleibt. Der Fund geht als
GitHub-Issue raus (Bug-Triage-Konvention, `AGENTS.md`), nicht als stiller
Nebenfix.

Stage ausschließlich die vier Zieldateien (Env-Datei, SealedSecrets-Blatt,
öffentliches Zertifikat aus der D5-Abweichung, git-crypt-verschlüsseltes
Keypair-Backup) und prüfe, dass `environments/.secrets/korczewski-prod.yaml`
untracked bleibt.

Verify: `bash -c 'bash scripts/env-validate.sh --env korczewski-prod --schema-only >/dev/null && out="$(task env:validate:all 2>&1 || true)" && printf "%s\n" "$out" | grep -A3 "^--- Validating: korczewski-prod ---$" | grep -q "passed all checks" && [ "$(printf "%s\n" "$out" | grep -c "^FAIL: Environment ")" -eq 2 ] && printf "%s\n" "$out" | grep "^FAIL: Environment " | grep -qE "Environment .korczewski. has 1 error" && printf "%s\n" "$out" | grep "^FAIL: Environment " | grep -qE "Environment .mentolder. has 1 error" && [ "$(git diff --cached --name-only | sort | tr "\n" " ")" = "environments/.secrets/sealed-secrets-key.korczewski-prod.yaml environments/certs/korczewski-prod.pem environments/korczewski-prod.yaml environments/sealed-secrets/korczewski-prod.yaml " ] && ! git ls-files --error-unmatch environments/.secrets/korczewski-prod.yaml >/dev/null 2>&1 && echo OK'`

Commit: `feat(infra): korczewski-prod Umgebung und vier SealedSecrets anlegen`
