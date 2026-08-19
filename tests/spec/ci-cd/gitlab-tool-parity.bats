#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-tool-parity.bats — gitleaks-Versions-Paritaet GitHub <-> GitLab [T011790]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation).
# Begruendung: Gegenstand ist, welche gitleaks-Version zwei CI-Konfigurationsdateien pinnen.
# Das manifestiert sich ausschliesslich im Konfigurationstext; ein Lauf beider Pipelines ist
# hier nicht verfuegbar (kein GitLab-Zugang, siehe design.md). Repo-Konvention T002448-M4
# nennt CI-Konfiguration ausdruecklich als Ausnahmefall fuer Quelltext-Pruefung.
#
# Hintergrund (design.md D3): Zwei CI-Systeme, die denselben Arbeitsbaum mit unterschiedlichen
# Scanner-Versionen pruefen, liefern zwei verschiedene Sicherheitsurteile ueber denselben Code.
# Genau diese Asymmetrie hat im Repo schon einmal Schaden angerichtet
# (T002506/T002554: lokal 8.16.0 gegen CI 8.18.2, 85 Fehlalarme).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CI_YML="${REPO_ROOT}/.github/workflows/ci.yml"
  GL_YML="${REPO_ROOT}/.gitlab-ci.yml"
}

# Extrahiert die gitleaks-Version aus dem GitHub-Workflow ueber die
# Release-Download-URL.
#
# [T012414] Vorher las diese Funktion den Cache-Key (gitleaks-vX.Y.Z-linux-amd64).
# Der Cache-Eintrag ist entfallen: er zeigte auf /usr/local/bin und war damit auf
# einem self-hosted Runner ohne root nicht wiederherstellbar. Die URL ist ohnehin
# die Fundstelle, an der der Pin *wirkt* — der Cache-Key war nur eine Kopie davon.
_gh_gitleaks_version() {
  [ -f "$CI_YML" ] || return 0
  grep -oE 'gitleaks/releases/download/v[0-9]+\.[0-9]+\.[0-9]+' "$CI_YML" \
    | head -1 \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'
}

# Extrahiert die gitleaks-Version aus der GitLab-Pipeline ueber die GITLEAKS_VERSION-
# Variable — die vom Plan geforderte einzige Fundstelle (statt der Zeichenkette an
# drei verstreuten Stellen).
_gl_gitleaks_version() {
  [ -f "$GL_YML" ] || return 0
  grep -oE 'GITLEAKS_VERSION:[[:space:]]*"?[0-9]+\.[0-9]+\.[0-9]+"?' "$GL_YML" \
    | head -1 \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'
}

@test "gitlab-tool-parity: aus beiden Dateien wird ueberhaupt eine Version extrahiert" {
  # Positiv-Anker [T002356-M1]: ohne diesen Schritt bestuende der Vergleich vakuos,
  # wenn eine der beiden Dateien fehlt oder umbenannt wurde — zwei leere
  # Zeichenketten sind gleich.
  gh_version="$(_gh_gitleaks_version)"
  gl_version="$(_gl_gitleaks_version)"
  if [ -z "$gh_version" ]; then
    echo "keine gitleaks-Version in $CI_YML gefunden (Datei vorhanden: $([ -f "$CI_YML" ] && echo ja || echo nein))" >&2
  fi
  if [ -z "$gl_version" ]; then
    echo "keine gitleaks-Version in $GL_YML gefunden (Datei vorhanden: $([ -f "$GL_YML" ] && echo ja || echo nein))" >&2
  fi
  [ -n "$gh_version" ]
  [ -n "$gl_version" ]
}

@test "gitlab-tool-parity: beide Seiten pinnen dieselbe gitleaks-Version" {
  gh_version="$(_gh_gitleaks_version)"
  gl_version="$(_gl_gitleaks_version)"
  [ -n "$gh_version" ]
  [ -n "$gl_version" ]

  if [ "$gh_version" != "$gl_version" ]; then
    echo "gitleaks-Version driftet: GitHub=${gh_version:-<leer>} GitLab=${gl_version:-<leer>}" >&2
    false
  fi
}

@test "gitlab-tool-parity: beide Seiten rufen gitleaks mit denselben Argumenten auf" {
  for f in "$CI_YML" "$GL_YML"; do
    if [ ! -f "$f" ]; then
      echo "erwartete Datei fehlt: $f" >&2
      false
    fi
  done

  gh_call="$(grep -E 'gitleaks detect' "$CI_YML" | head -1)"
  gl_call="$(grep -E 'gitleaks detect' "$GL_YML" | head -1)"

  # Positiv-Anker: es gibt ueberhaupt einen gitleaks-detect-Aufruf auf beiden Seiten.
  [ -n "$gh_call" ]
  [ -n "$gl_call" ]

  for arg in '--config .gitleaks.toml' '--no-git' '--redact'; do
    echo "$gh_call" | grep -qF -- "$arg"
    echo "$gl_call" | grep -qF -- "$arg"
  done
}

# ── Etappe 3 (T012405): von einer Version auf eine Werkzeug-Tabelle ──────────
#
# Mit sieben neuen Jobs kommen weitere gepinnte Werkzeuge dazu. Eine Paritaets-
# Zusicherung, die nur gitleaks abdeckt, waere ab jetzt eine Zusicherung ueber
# einen kleinen Ausschnitt — und wuerde als Zusicherung ueber "die Werkzeuge"
# gelesen.
#
# Verglichen werden VERSIONSWERTE an ihren jeweiligen Fundstellen, nicht die
# Zeichenketten drumherum (T002716: Semantik statt Darstellung). Die Fundstellen
# unterscheiden sich zwangslaeufig — GitHub pinnt ueber Action-Inputs, GitLab
# ueber Variablen und Download-URLs.

# Alle Node-Major-Versionen einer GitHub-Workflow-Datei, sortiert und dedupliziert.
_gh_node_majors() {
  grep -oE "node-version:[[:space:]]*'[0-9]+'" "$CI_YML" \
    | grep -oE '[0-9]+' | sort -u
}

# Alle Node-Major-Versionen der GitLab-Pipeline (image: node:NN oder ci-nodeNN).
_gl_node_majors() {
  { grep -oE 'image:[[:space:]]*node:[0-9]+' "$GL_YML" | grep -oE '[0-9]+$'
    grep -oE 'ci-node[0-9]+' "$GL_YML" | grep -oE '[0-9]+$'
  } | sort -u
}

@test "gitlab-tool-parity: die Node-Majors beider Seiten stimmen ueberein" {
  gh="$(_gh_node_majors | tr '\n' ' ')"
  gl="$(_gl_node_majors | tr '\n' ' ')"

  # Positiv-Anker [T002356-M1]: Zwei leere Mengen waeren gleich. Ohne diesen
  # Schritt bestuende der Vergleich, sobald eine Fundstellen-Form sich aendert.
  echo "Anker: GitHub-Node-Majors='${gh}' GitLab-Node-Majors='${gl}'"
  [ -n "$gh" ]
  [ -n "$gl" ]

  if [ "$gh" != "$gl" ]; then
    echo "Node-Majors driften: GitHub='${gh}' GitLab='${gl}'" >&2
    false
  fi
}

@test "gitlab-tool-parity: die pnpm-Major-Version stimmt ueberein" {
  # GitHub pinnt pnpm ueber den version-Input von pnpm/action-setup, GitLab ueber
  # corepack prepare pnpm@NN.
  gh="$(grep -B2 -A2 'pnpm/action-setup' "$CI_YML" | grep -oE 'version:[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | sort -u | head -1)"
  gl="$(grep -oE 'corepack prepare pnpm@[0-9]+' "$GL_YML" | grep -oE '[0-9]+$' | sort -u | head -1)"

  echo "Anker: GitHub-pnpm='${gh}' GitLab-pnpm='${gl}'"
  [ -n "$gh" ]
  [ -n "$gl" ]
  [ "$gh" = "$gl" ]
}

@test "gitlab-tool-parity: die kubectl-Version stimmt ueberein" {
  # GitHub pinnt sie in der Download-URL (dl.k8s.io/release/vX.Y.Z), GitLab in der
  # KUBECTL_VERSION-Variable des manifests-Jobs.
  #
  # [T012414] Vorher der Cache-Key kubectl-vX.Y.Z-linux-amd64 — entfallen, weil er
  # auf /usr/local/bin zeigte und ohne root nicht wiederherstellbar war.
  gh="$(grep -oE 'dl\.k8s\.io/release/v[0-9]+\.[0-9]+\.[0-9]+' "$CI_YML" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  gl="$(grep -oE 'KUBECTL_VERSION:[[:space:]]*"?v?[0-9]+\.[0-9]+\.[0-9]+' "$GL_YML" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

  echo "Anker: GitHub-kubectl='${gh}' GitLab-kubectl='${gl}'"
  [ -n "$gh" ]
  [ -n "$gl" ]
  [ "$gh" = "$gl" ]
}

@test "gitlab-tool-parity: die Werkzeug-Tabelle greift ueberhaupt (Anzahl > 0)" {
  # Der wichtigste Test dieser Gruppe. Eine Tabelle, deren Fundstellen alle ins
  # Leere greifen, waere durchgehend gruen — und zwar genau dann, wenn eine
  # Umstrukturierung einer der beiden Dateien die Extraktion gebrochen hat. Der
  # Test zaehlt die real extrahierten Werte und scheitert bei null.
  found=0
  [ -n "$(_gh_node_majors)" ] && found=$((found + 1))
  [ -n "$(_gl_node_majors)" ] && found=$((found + 1))
  [ -n "$(_gh_gitleaks_version)" ] && found=$((found + 1))
  [ -n "$(_gl_gitleaks_version)" ] && found=$((found + 1))

  echo "Anker: extrahierte Versionswerte = ${found} (erwartet 4)"
  [ "$found" -eq 4 ]
}

@test "gitlab-tool-parity: die GitLab-Go-Version erfuellt die go.mod-Anforderung" {
  # Belegter Fehlschlag (T012405): .gitlab-ci.yml pinnte Go 1.23.4, waehrend
  # scripts/ticket-mcp/go/go.mod bereits 1.26.4 verlangt. Alle vier Shard-Jobs
  # scheiterten daran — und zwar erst auf GitLab, nach dem Push.
  #
  # Die Asymmetrie ist der Grund fuer diesen Guard: GitHub nutzt setup-go mit
  # 'stable' und erfuellt jede go.mod-Anforderung automatisch mit. Ein direkter
  # Download tut das nicht. Es gibt hier also KEINE Versionszahl auf der
  # GitHub-Seite, gegen die sich vergleichen liesse — der Vergleich muss gegen
  # go.mod selbst laufen, nicht gegen die andere Pipeline.
  gomod="${REPO_ROOT}/scripts/ticket-mcp/go/go.mod"
  [ -f "$gomod" ]

  required="$(grep -oE '^go [0-9]+\.[0-9]+(\.[0-9]+)?' "$gomod" | awk '{print $2}')"
  pinned="$(grep -oE 'GO_VERSION:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' "$GL_YML" \
            | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

  # Positiv-Anker [T002356-M1]: beide Werte wurden ueberhaupt extrahiert. Zwei
  # leere Zeichenketten wuerden den sort -V-Vergleich unten klaglos bestehen.
  echo "Anker: go.mod verlangt='${required}' .gitlab-ci.yml pinnt='${pinned}'"
  [ -n "$required" ]
  [ -n "$pinned" ]

  # Der gepinnte Wert muss >= dem geforderten sein. sort -V vergleicht semantisch,
  # nicht lexikografisch — sonst gaelte "1.9" > "1.26".
  lowest="$(printf '%s\n%s\n' "$required" "$pinned" | sort -V | head -1)"
  if [ "$lowest" != "$required" ] && [ "$required" != "$pinned" ]; then
    echo "GO_VERSION ${pinned} ist aelter als die go.mod-Anforderung ${required}" >&2
    false
  fi
}
