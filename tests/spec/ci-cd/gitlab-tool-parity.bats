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

# Extrahiert die gitleaks-Version aus dem GitHub-Workflow ueber den versionierten
# Cache-Key (gitleaks-vX.Y.Z-linux-amd64) — die eine Fundstelle, aus der auch der
# Download-Schritt seine Version bezieht.
_gh_gitleaks_version() {
  [ -f "$CI_YML" ] || return 0
  grep -oE 'gitleaks-v[0-9]+\.[0-9]+\.[0-9]+-linux-amd64' "$CI_YML" \
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
