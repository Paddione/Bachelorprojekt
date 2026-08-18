#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-mirror-workflow.bats — Push-Spiegel-Workflow GitHub -> GitLab [T011790]
#
# PRUEFMODUS: Quelltext-Inspektion (nicht Output-Verifikation), aber ueber die geparste
# YAML-Struktur statt ueber Zeilentext. Begruendung: Gegenstand ist, ob ein
# GitHub-Actions-Workflow bei main-Pushes einen Spiegel-Push ausfuehrt — das
# entscheidet GitHub anhand der Job-/Step-Struktur; es gibt lokal keinen
# Laufzeit-Output ohne einen echten Push und ein GitLab-Zielprojekt (design.md —
# CI-Konfiguration ist die T002448-M4-Ausnahme, wie bereits in
# tests/spec/ci-cd/workflow-self-trigger.bats).
#
# Wichtig — warum YAML-Parsing statt Zeilen-grep (Review-Befund, T011790): ein
# frueherer Entwurf dieser Datei suchte per grep im vollen Dateitext. Damit bestanden
# alle Assertions auch dann noch, wenn der komplette Push-Schritt entfernt wurde,
# weil die Suchbegriffe zufaellig auch in Kommentaren standen. YAML-Parsing meidet das
# strukturell: Kommentare sind fuer den Parser nicht sichtbar, ein gepruefter Wert muss
# also aus einem echten Step-Feld (run:/with:) stammen, nicht aus Prosa daneben.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WF="${REPO_ROOT}/.github/workflows/mirror-to-gitlab.yml"
}

# Gibt die Liste der Steps des Jobs "mirror" als eine Zeile pro Step aus, jeweils
# "<name>|<run-oder-leer>|<uses-oder-leer>|<with-fetch-depth-oder-leer>". Ein
# Pipe-Zeichen im Feldinhalt wird durch ❘ ersetzt, damit die Feldtrennung
# eindeutig bleibt (Step-Namen/Skripte dieses Workflows enthalten keine Pipes,
# das ist eine reine Robustheitsmassnahme).
_mirror_steps_tsv() {
  python3 - "$WF" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}

steps = ((doc.get("jobs") or {}).get("mirror") or {}).get("steps") or []
SEP = "❘"


def flatten(s):
    # Jede Zeile dieses Guards ist EIN Step — eingebettete Newlines aus
    # mehrzeiligen run:-Bloecken wuerden sonst die zeilenbasierte Auswertung
    # in awk/grep kaputt machen (ein Step erschiene als mehrere Zeilen).
    return str(s).replace(SEP, " ").replace("\n", " ⏎ ")


for step in steps:
    if not isinstance(step, dict):
        continue
    name = flatten(step.get("name", ""))
    run = flatten(step.get("run", ""))
    uses = flatten(step.get("uses", ""))
    with_block = step.get("with") or {}
    fetch_depth = flatten(with_block.get("fetch-depth", ""))
    env_block = step.get("env") or {}
    env_str = flatten(";".join(f"{k}={v}" for k, v in env_block.items()))
    print(f"{name}{SEP}{run}{SEP}{uses}{SEP}{fetch_depth}{SEP}{env_str}")
PY
}

# Liefert das on.push-Objekt (roh als YAML-Dump) — behandelt den PyYAML-1.1-Fallstrick,
# dass ein unquotiertes "on:" als boolescher Schluessel True geparst wird.
_push_trigger_yaml() {
  python3 - "$WF" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}

on_block = doc.get("on")
if on_block is None:
    on_block = doc.get(True)
push = (on_block or {}).get("push") if isinstance(on_block, dict) else None
print(yaml.safe_dump(push) if push is not None else "")
PY
}

@test "gitlab-mirror-workflow: Datei existiert, ist gueltiges YAML und Job 'mirror' hat Steps" {
  # Positiv-Anker [T002356-M1] fuer alle folgenden Tests dieser Datei.
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  [ -s "$WF" ]

  rows="$(_mirror_steps_tsv)"
  if [ -z "$rows" ]; then
    echo "Job 'mirror' hat keine (oder keine geparsten) Steps in $WF" >&2
    false
  fi
  [ "$(printf '%s\n' "$rows" | grep -c "$(printf '❘')" )" -gt 0 ]
}

@test "gitlab-mirror-workflow: Trigger enthaelt push auf main" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  push_yaml="$(_push_trigger_yaml)"
  if [ -z "$push_yaml" ]; then
    echo "kein on.push-Block gefunden in $WF" >&2
    false
  fi
  echo "$push_yaml" | grep -qF -- 'main'
}

@test "gitlab-mirror-workflow: ein Step fuehrt den main+tags-Spiegel-Push aus (run:-Block, nicht Kommentartext)" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  rows="$(_mirror_steps_tsv)"

  # Positiv-Anker [T002356-M1] IM SELBEN Test: es gibt ueberhaupt einen Step mit
  # einem run:-Feld, bevor auf dessen Inhalt geprueft wird.
  run_steps="$(printf '%s\n' "$rows" | awk -F"$(printf '❘')" '$2 != "" {print}')"
  if [ -z "$run_steps" ]; then
    echo "kein Step mit run:-Feld im Job 'mirror' gefunden" >&2
    false
  fi

  # Der Push-Step muss BEIDE Refspecs enthalten: main-Branch und Tags. Ein Test,
  # der nur nach einem der beiden Substrings sucht, wuerde auch dann bestehen,
  # wenn nur der halbe Push-Befehl uebrig bliebe.
  push_run="$(printf '%s\n' "$run_steps" | awk -F"$(printf '❘')" '$2 ~ /git push/ {print $2}')"
  if [ -z "$push_run" ]; then
    echo "kein Step mit 'git push' im run:-Feld gefunden — Push-Schritt fehlt oder wurde entfernt" >&2
    false
  fi
  echo "$push_run" | grep -qF -- 'refs/heads/main'
  echo "$push_run" | grep -qe '--tags'
}

@test "gitlab-mirror-workflow: fetch-depth 0 statt flachem Klon" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  rows="$(_mirror_steps_tsv)"

  checkout_rows="$(printf '%s\n' "$rows" | awk -F"$(printf '❘')" '$3 ~ /actions\/checkout/ {print}')"
  if [ -z "$checkout_rows" ]; then
    echo "kein actions/checkout-Step im Job 'mirror' gefunden" >&2
    false
  fi

  fetch_depth="$(printf '%s\n' "$checkout_rows" | awk -F"$(printf '❘')" '{print $4}' | head -1)"
  [ "$fetch_depth" = "0" ]
}

@test "gitlab-mirror-workflow: beide Mirror-Secrets werden referenziert und ihr Fehlen abgefangen" {
  if [ ! -f "$WF" ]; then
    echo "erwartete Datei fehlt: $WF" >&2
    false
  fi
  rows="$(_mirror_steps_tsv)"

  # Positiv-Anker [T002356-M1]: mindestens ein Step referenziert ueberhaupt
  # GITLAB_MIRROR_TOKEN (ueber env: ODER run:) — das schliesst auch den Fall aus,
  # dass der Secret-Name nur in einem Kommentar stuende (Kommentare sind fuer den
  # YAML-Parser unsichtbar).
  token_refs="$(printf '%s\n' "$rows" | grep -cF -- 'GITLAB_MIRROR_TOKEN')"
  url_refs="$(printf '%s\n' "$rows" | grep -cF -- 'GITLAB_MIRROR_URL')"
  [ "$token_refs" -gt 0 ]
  [ "$url_refs" -gt 0 ]

  # Es gibt einen Step, dessen run:-Feld beide Secretnamen UND einen Abbruch bei
  # ihrem Fehlen enthaelt — nicht nur irgendwo in der Datei.
  guard_run="$(printf '%s\n' "$rows" | awk -F"$(printf '❘')" \
    '$2 ~ /GITLAB_MIRROR_TOKEN/ && $2 ~ /GITLAB_MIRROR_URL/ {print $2}')"
  if [ -z "$guard_run" ]; then
    echo "kein Step mit einem run:-Feld gefunden, das beide Secretnamen zusammen prueft" >&2
    false
  fi
  echo "$guard_run" | grep -qe 'exit 1'
}

# ── Etappe 3 (T012405): Branch- und Delete-Spiegelung ────────────────────────
#
# Ohne diese Zusicherungen sieht GitLab nur `main`, also ausschliesslich Staende
# NACH der Merge-Entscheidung — und kann sie damit prinzipiell nicht informieren.

@test "gitlab-mirror-workflow: Trigger deckt die drei Arbeits-Branch-Praefixe ab" {
  push_yaml="$(_push_trigger_yaml)"
  echo "$push_yaml"

  # Positiv-Anker [T002356-M1]: die Trigger-Liste ist ueberhaupt lesbar. Ohne ihn
  # bestuenden die drei Praefix-Pruefungen unten auch bei leerem Ergebnis nicht,
  # sondern schluegen fehl — aber mit einer Meldung, die auf den Praefix zeigt
  # statt auf die unlesbare Datei.
  [ -n "$push_yaml" ]
  echo "$push_yaml" | grep -q 'main'

  echo "$push_yaml" | grep -q 'feature/'
  echo "$push_yaml" | grep -q 'fix/'
  echo "$push_yaml" | grep -q 'chore/'
}

@test "gitlab-mirror-workflow: Bot-Branch-Praefixe werden nicht gespiegelt" {
  # Jeder gespiegelte Branch erzeugt eine volle Pipeline auf dem Engpass-Runner.
  # Renovate und Release-Please erzeugen laufend Branches; sie gehoeren nicht dazu.
  push_yaml="$(_push_trigger_yaml)"
  [ -n "$push_yaml" ]
  run bash -c "printf '%s' \"\$0\" | grep -q 'renovate'" "$push_yaml"
  [ "$status" -ne 0 ]
  run bash -c "printf '%s' \"\$0\" | grep -q 'release-please'" "$push_yaml"
  [ "$status" -ne 0 ]
}

@test "gitlab-mirror-workflow: ein run:-Block behandelt den Loesch-Fall mit leerem Quell-Ref" {
  rows="$(_mirror_steps_tsv)"
  [ -n "$rows" ]

  # Der Push-Step traegt eine Verzweigung auf das Loesch-Event UND den Push mit
  # leerem Quell-Ref. Beides im run:-Feld desselben Steps, nicht irgendwo in der
  # Datei — ein Kommentar ueber Loeschung ist keine Loeschung.
  del_run="$(printf '%s\n' "$rows" | awk -F"$(printf '❘')" \
    '$2 ~ /MIRROR_DELETED/ && $2 ~ /:refs\/heads\// {print $2}')"
  if [ -z "$del_run" ]; then
    echo "kein Step mit run:-Feld gefunden, das den Loesch-Fall behandelt" >&2
    printf '%s\n' "$rows" >&2
    false
  fi
}

@test "gitlab-mirror-workflow: ein run:-Block spiegelt den Arbeits-Branch unter seinem Namen" {
  rows="$(_mirror_steps_tsv)"
  [ -n "$rows" ]

  branch_run="$(printf '%s\n' "$rows" | awk -F"$(printf '❘')" \
    '$2 ~ /HEAD:refs\/heads\/\$\{branch\}/ {print $2}')"
  if [ -z "$branch_run" ]; then
    echo "kein Step mit run:-Feld gefunden, das HEAD nach refs/heads/\${branch} pusht" >&2
    printf '%s\n' "$rows" >&2
    false
  fi
}

@test "gitlab-mirror-workflow: kein git push verwendet --mirror" {
  # Die Zusicherung aus Etappe 1, nachgezogen fuer Etappe 3.
  #
  # Sie haengt bewusst an "git push ... --mirror" und NICHT am blossen Vorkommen der
  # Zeichenkette. Zwei Stellen erwaehnen --mirror legitim in Prosa: der Kopfkommentar
  # der Workflow-Datei und ein Shell-Kommentar im Push-Block, beide begruenden, warum
  # es nicht verwendet wird. Eine Zeichenketten-Suche waere daran dauerhaft rot — und
  # der naheliegende "Fix" waere, die Begruendung zu loeschen. Ein Guard, der die
  # Dokumentation seiner eigenen Regel bestraft, erzieht zum Loeschen der Begruendung.
  #
  # Der YAML-Parser blendet YAML-Kommentare ohnehin aus; Shell-Kommentare INNERHALB
  # eines run:-Blocks sieht er dagegen als Inhalt — genau deshalb reicht das Parsen
  # allein hier nicht.
  rows="$(_mirror_steps_tsv)"
  [ -n "$rows" ]

  # Positiv-Anker [T002356-M1]: Es gibt ueberhaupt run:-Felder MIT einem git-push-Aufruf.
  # Ohne ihn bestuende die Abwesenheitspruefung auch dann, wenn jeder Push entfernt
  # worden waere.
  push_lines="$(printf '%s\n' "$rows" | awk -F"$(printf '❘')" '$2 ~ /git push/ {print $2}')"
  echo "Anker: run-Felder mit git push = $(printf '%s\n' "$push_lines" | grep -c .)"
  [ -n "$push_lines" ]

  # Ein git-push-Aufruf und ein --mirror im selben Kommando: der flatten-Schritt hat
  # Zeilenumbrueche durch ⏎ ersetzt, ein Kommando endet also am naechsten ⏎.
  run bash -c "printf '%s' \"\$0\" | grep -qE 'git push[^⏎]*--mirror'" "$push_lines"
  [ "$status" -ne 0 ]
}
