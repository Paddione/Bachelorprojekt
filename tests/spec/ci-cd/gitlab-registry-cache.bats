#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-registry-cache.bats — Cache an beiden Standorten [T012177]
#
# PRUEFMODUS: gemischt. fleet-Seite per Struktur-Inspektion (kubectl kustomize +
# yaml.safe_load_all, kein Cluster-Zugriff, gleiche Basis wie
# gitlab-runner-fleet-guardrails.bats). Lokale Seite per Output-Verifikation
# (scripts/gitlab-runner-cache.sh wird tatsaechlich mit --dry-run ausgefuehrt und
# $status/$output geprueft — analog tests/spec/ci-cd/gitlab-runner-setup-dryrun.bats,
# T002448-M4). Kein Test ruft echtes `docker run` auf.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK_DIR="${REPO_ROOT}/k3d/gitlab-runner-stack"
  CACHE_SH="${REPO_ROOT}/scripts/gitlab-runner-cache.sh"
  RENDERED_FILE="$(mktemp)"
}

teardown() {
  rm -f "$RENDERED_FILE"
}

_render_to_file() {
  if [ ! -d "$STACK_DIR" ]; then
    echo "erwartetes Verzeichnis fehlt: $STACK_DIR" >&2
    return 1
  fi
  if ! kubectl kustomize "$STACK_DIR" --load-restrictor=LoadRestrictionsNone >"$RENDERED_FILE" 2>/tmp/gitlab-registry-cache.err.$$; then
    echo "kubectl kustomize $STACK_DIR ist fehlgeschlagen:" >&2
    cat /tmp/gitlab-registry-cache.err.$$ >&2
    rm -f /tmp/gitlab-registry-cache.err.$$
    return 1
  fi
  rm -f /tmp/gitlab-registry-cache.err.$$
}

@test "gitlab-registry-cache: registry-cache-Deployment existiert im gerenderten Manifest (Positiv-Anker)" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: erst Existenz belegen, bevor der Env-Inhalt geprueft wird.
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

hit = any(
    d.get("kind") == "Deployment" and (d.get("metadata") or {}).get("name") == "registry-cache"
    for d in docs
)
print("OK" if hit else "MISSING")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: registry-cache-Deployment ist im Proxy-Modus gegen Docker Hub konfiguriert" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

deploys = [
    d for d in docs
    if d.get("kind") == "Deployment" and (d.get("metadata") or {}).get("name") == "registry-cache"
]
if not deploys:
    print("MISSING")
    sys.exit()

containers = ((deploys[0].get("spec") or {}).get("template") or {}).get("spec", {}).get("containers") or []
found = False
for c in containers:
    for env in c.get("env") or []:
        if env.get("name") == "REGISTRY_PROXY_REMOTEURL" and env.get("value") == "https://registry-1.docker.io":
            found = True
print("OK" if found else "MISSING_ENV")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: registry-cache-Service exponiert Port 5000" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

svcs = [
    d for d in docs
    if d.get("kind") == "Service" and (d.get("metadata") or {}).get("name") == "registry-cache"
]
if not svcs:
    print("MISSING")
    sys.exit()

ports = (svcs[0].get("spec") or {}).get("ports") or []
hit = any(p.get("port") == 5000 for p in ports)
print("OK" if hit else "WRONG_PORT")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: registry-cache-data PVC referenziert die longhorn-StorageClass" {
  _render_to_file

  # local-path waere hier bewusst falsch: kein allowVolumeExpansion und
  # node-lokaler hostPath-Speicher, der bei Pod-Umzug auf den anderen Worker
  # nicht mitwandert (p3-cache.md, StorageClass-Entscheidung).
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

pvcs = [
    d for d in docs
    if d.get("kind") == "PersistentVolumeClaim" and (d.get("metadata") or {}).get("name") == "registry-cache-data"
]
if not pvcs:
    print("MISSING")
    sys.exit()

sc = (pvcs[0].get("spec") or {}).get("storageClassName")
print("OK" if sc == "longhorn" else "WRONG_SC:" + str(sc))
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-registry-cache: lokales Cache-Skript existiert und --dry-run gibt den Registry-Container-Befehl aus, Exit 0" {
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi

  run bash "$CACHE_SH" --dry-run
  [ "$status" -eq 0 ]

  # Nur spezifische Cache-Tokens pruefen, kein unqualifizierter $output-Match auf
  # $0/Skriptpfad — der Worktree-Name "gitlab-k8s-runner" darf keinen Treffer
  # erzeugen koennen (Konventionsliste in p4-tests.md).
  echo "$output" | grep -qe 'REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io'
  echo "$output" | grep -qF -- 'registry:2'
}

@test "gitlab-registry-cache: --dry-run beruehrt weder Docker noch Dateisystem und braucht kein installiertes docker" {
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi

  # PATH ohne docker fuer den Skript-internen `command -v docker`-Check. `bash`
  # selbst wird als ABSOLUTER Pfad uebergeben, damit `env` es nicht erst ueber die
  # (leere) neue PATH suchen muss — sonst waere der Testaufbau selbst kaputt,
  # unabhaengig davon, ob das Skript funktioniert.
  real_bash="$(command -v bash)"
  empty_path_dir="$(mktemp -d)"
  run env PATH="$empty_path_dir" "$real_bash" "$CACHE_SH" --dry-run
  rm -rf "$empty_path_dir"
  [ "$status" -eq 0 ]
}

@test "gitlab-registry-cache: Echtlauf ohne installiertes docker bricht ab und benennt die fehlende Voraussetzung" {
  if [ ! -f "$CACHE_SH" ]; then
    echo "erwartete Datei fehlt: $CACHE_SH" >&2
    false
  fi

  real_bash="$(command -v bash)"
  empty_path_dir="$(mktemp -d)"
  run env PATH="$empty_path_dir" "$real_bash" "$CACHE_SH"
  rm -rf "$empty_path_dir"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qe 'docker'
}

# ── T012410: der wertvollste Schritt darf nicht am Docker-Neustart haengen ───
#
# BELEGTER VORFALL (2026-08-18, PK-Desktop/WSL2 mit Docker Desktop):
#   $ bash scripts/gitlab-runner-cache.sh
#   ✓ registry-mirrors in /etc/docker/daemon.json gemerged.
#   Failed to restart docker.service: Unit docker.service not found.
#   $ grep -c pull_policy /etc/gitlab-runner/config.toml
#   0
#
# Das Skript laeuft unter `set -euo pipefail`. Der ungeschuetzte
# `sudo systemctl restart docker` bricht auf jedem Host ohne systemd-docker.service
# ab (Docker Desktop, rootless), und der pull_policy-Schritt steht DAHINTER.
#
# Warum das die teuerste denkbare Reihenfolge ist: pull_policy ist der groesste
# Einzelhebel fuer die Laufzeit UND der einzige Schritt, der den Docker-Daemon gar
# nicht braucht. Er faellt hier als einziger aus — waehrend die beiden Schritte
# durchlaufen, die auf diesem Host ohnehin wirkungslos sind. Der Etappe-2-Befund
# (T012177: self-hosted 2-3x langsamer, Ursache Image-Pull je Job) blieb deshalb
# unbehoben, obwohl das Werkzeug dafuer existierte und ausgefuehrt wurde.

@test "gitlab-runner-cache: pull_policy wird VOR dem Docker-Neustart gesetzt" {
  [ -f "$CACHE_SH" ]

  # Positiv-Anker [T002356-M1]: beide Anker kommen im Skript ueberhaupt vor.
  # Ohne ihn bestuende der Reihenfolge-Vergleich unten ueber zwei leeren Mengen.
  # Kommentar- und echo-Zeilen aussondern. Der Filter muss die Zeilennummer aus
  # `grep -n` VORHER abstreifen — ein Muster wie '^\s*#' gegen "9:# text" trifft
  # nie, und der Test bestuende dann vakuos (beim Schreiben genau so passiert).
  _first_real() {
    grep -n "$1" "$CACHE_SH" \
      | awk -F: '{ n=$1; sub(/^[0-9]+:/, "", $0); if ($0 !~ /^[[:space:]]*#/ && $0 !~ /echo/) { print n; exit } }'
  }
  pp_line="$(_first_real 'pull_policy')"
  rs_line="$(_first_real 'systemctl restart docker')"
  echo "Anker: erste pull_policy-Zeile=${pp_line:-<keine>} erster docker-restart=${rs_line:-<keiner>}"
  [ -n "$pp_line" ]
  [ -n "$rs_line" ]

  if [ "$pp_line" -gt "$rs_line" ]; then
    echo "pull_policy (Zeile $pp_line) steht NACH dem Docker-Neustart (Zeile $rs_line)." >&2
    echo "Auf Hosts ohne systemd-docker.service bricht das Skript dort ab und setzt pull_policy nie." >&2
    false
  fi
}

@test "gitlab-runner-cache: ein fehlgeschlagener Docker-Neustart beendet das Skript nicht" {
  [ -f "$CACHE_SH" ]

  # Der Aufruf muss entweder geguarded sein (Existenzpruefung der Unit davor)
  # oder seinen Fehlschlag abfangen (|| ...). Ein nackter Aufruf unter `set -e`
  # ist der belegte Fehlerfall.
  line="$(grep -n 'systemctl restart docker' "$CACHE_SH" | grep -v '^[0-9]*:[[:space:]]*#' | head -1)"
  echo "Anker: gefundene Aufrufzeile='${line}'"
  [ -n "$line" ]

  body="${line#*:}"
  if printf '%s' "$body" | grep -qE '\|\||if |&&'; then
    return 0
  fi

  # Kein Inline-Guard — dann muss unmittelbar davor eine Existenzpruefung stehen.
  num="${line%%:*}"
  ctx="$(sed -n "$((num > 6 ? num - 6 : 1)),${num}p" "$CACHE_SH")"
  if printf '%s' "$ctx" | grep -qE 'systemctl (is-active|list-unit-files|cat)|docker\.service|command -v systemctl'; then
    return 0
  fi

  echo "sudo systemctl restart docker wird ungeschuetzt aufgerufen (Zeile $num)." >&2
  echo "Unter 'set -euo pipefail' bricht das Skript damit auf Docker-Desktop-/rootless-Hosts ab." >&2
  false
}

@test "gitlab-runner-cache: --dry-run benennt den Docker-Desktop-Fall" {
  # Unter Docker Desktop ist /etc/docker/daemon.json wirkungslos — der Daemon
  # laeuft in der Docker-Desktop-VM, seine Konfiguration liegt auf der
  # Windows-Seite. Das Skript meldete trotzdem "gemerged". Eine Erfolgsmeldung
  # ueber eine wirkungslose Aenderung ist schaedlicher als gar keine: sie beendet
  # die Suche nach der Ursache.
  run bash "$CACHE_SH" --dry-run
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  printf '%s\n' "$output" | grep -qiE 'docker desktop'
}

@test "gitlab-runner-cache: Existenztests auf die Runner-Config laufen privilegiert" {
  # DRITTER, GRUNDLEGENDERER BEFUND (T012410, gemessen 2026-08-18):
  #
  #   $ ls -ld /etc/gitlab-runner
  #   drwx------ 2 root root
  #   $ [ -f /etc/gitlab-runner/config.toml ] && echo wahr || echo falsch
  #   falsch          # obwohl die Datei existiert
  #   $ sudo test -f /etc/gitlab-runner/config.toml && echo wahr
  #   wahr
  #
  # 0700 root ist die STANDARD-Installationsrechte von gitlab-runner. Ein
  # unprivilegierter `[ -f ... ]` auf diese Datei ist daher immer falsch — und
  # das Skript ueberspringt pull_policy still mit der Meldung "Runner noch nicht
  # registriert?". Die Meldung zeigt auf die falsche Ursache und beendet damit
  # die Fehlersuche.
  #
  # Das ist die eigentliche Erklaerung dafuer, dass Etappe 2 (T012177) das
  # Werkzeug lieferte und der lokale Runner trotzdem nie schneller wurde: auf
  # KEINER Standardinstallation konnte der Schritt greifen. Jeder Lese- und
  # Schreibzugriff im Skript nutzt bereits sudo — nur der Existenztest nicht.
  [ -f "$CACHE_SH" ]

  # Alle Existenztests auf die Runner-Config einsammeln.
  hits="$(grep -nE '\[ +-f +"\$\{?RUNNER_CONFIG_TOML\}?" +\]' "$CACHE_SH" || true)"
  sudo_hits="$(grep -cE 'sudo +test +-f +"\$\{?RUNNER_CONFIG_TOML\}?"' "$CACHE_SH" || true)"

  # Positiv-Anker [T002356-M1]: Es gibt ueberhaupt Existenztests auf diese Datei.
  # Ohne ihn bestuende der Test auch, wenn die Pruefung ganz entfiele.
  total="$(printf '%s\n' "$hits" | grep -c . || true)"
  echo "Anker: unprivilegierte -f-Tests=${total} privilegierte sudo-test-Tests=${sudo_hits}"
  [ $((total + sudo_hits)) -gt 0 ]

  if [ "$total" -gt 0 ]; then
    echo "Unprivilegierte Existenztests auf die 0700-root-Runner-Config:" >&2
    printf '%s\n' "$hits" >&2
    echo "Sie sind auf einer Standardinstallation immer falsch — 'sudo test -f' verwenden." >&2
    false
  fi
}

@test "gitlab-runner-cache: pull_policy erreicht JEDEN [runners.docker]-Block" {
  # VIERTER BEFUND (T012410, gemessen 2026-08-18 auf PK-Desktop):
  # Nach einem erfolgreichen Lauf stand pull_policy in Block 1 ("Gitlabrunner") —
  # NICHT in Block 2 ("bachelorprojekt fleet self-hosted"), der die Jobs
  # tatsaechlich faehrt. Das Skript meldete Erfolg.
  #
  # Ursache: das awk-Insert traegt ein globales `!inserted`-Flag und trifft
  # deshalb nur den ERSTEN Block. Ein Host mit mehreren registrierten Runnern —
  # der Normalfall, sobald ein zweiter Runner dazukommt — bekommt die Einstellung
  # am falschen Ort. Das ist schaedlicher als ein Fehlschlag: die Meldung sagt
  # "gesetzt", die Laufzeit aendert sich nicht, und die Ursache steht in einer
  # Datei, die man nur mit sudo liest.
  #
  # Geprueft wird das VERHALTEN: das awk-Programm aus dem Skript laeuft gegen
  # eine Fixture mit zwei Runner-Bloecken (T002448-M4 — kein Quelltext-Grep).
  [ -f "$CACHE_SH" ]

  # Gezielt das INSERT-Programm extrahieren, nicht die Idempotenz-Pruefung: beide
  # beginnen mit `sudo awk '`, und die erste Fundstelle ist die Pruefung. Anker
  # ist deshalb die Zeile, die pull_policy wirklich ausgibt.
  awk_prog="$(awk '
    /sudo awk .$/ { start=NR; buf=""; collecting=1; next }
    collecting && /^[[:space:]]*.[[:space:]]*"\$\{RUNNER_CONFIG_TOML\}"/ {
      if (buf ~ /print "  pull_policy/) { printf "%s", buf; exit }
      collecting=0; buf=""; next
    }
    collecting { buf = buf $0 "\n" }
  ' "$CACHE_SH")"

  # Positiv-Anker [T002356-M1]: das awk-Programm wurde ueberhaupt extrahiert.
  echo "Anker: extrahierte awk-Zeilen=$(printf '%s\n' "$awk_prog" | grep -c .)"
  [ -n "$awk_prog" ]
  # Anker auf den Inhalt, der zaehlt. NICHT auf 'runners\.docker': das awk-Programm
  # traegt dort einen echten Backslash (\[runners\.docker\]), den ein
  # grep-Muster 'runners\.docker' gerade NICHT trifft — beim Schreiben genau in
  # diese Falle getreten.
  printf '%s' "$awk_prog" | grep -qF 'pull_policy'

  fixture="$(mktemp)"
  cat > "$fixture" <<'TOML'
concurrent = 3

[[runners]]
  name = "erster"
  executor = "docker"
  [runners.docker]
    image = "docker:24-git"
  [runners.cache]

[[runners]]
  name = "zweiter"
  executor = "docker"
  [runners.docker]
    image = "docker:24-git"
  [runners.cache]
TOML

  out="$(awk "$awk_prog" "$fixture")"
  count="$(printf '%s\n' "$out" | grep -c 'pull_policy' || true)"

  echo "pull_policy-Zeilen in der Zwei-Runner-Fixture: ${count} (erwartet 2)"
  [ "$count" -eq 2 ]

  # Zweitlauf ueber das EIGENE Ergebnis: das Insert muss konstruktiv idempotent
  # sein. Ein reines "nach dem Header einfuegen" ergaebe hier 4 Zeilen — also
  # einen doppelten Key in derselben TOML-Tabelle. Das ist kein kosmetisches
  # Problem: ein doppelter Key ist ein Parse-Fehler und damit ein kaputter
  # Runner, ausgeloest ausgerechnet durch das Wiederholen eines Reparaturlaufs.
  printf '%s\n' "$out" > "$fixture"
  again="$(awk "$awk_prog" "$fixture" | grep -c 'pull_policy' || true)"
  rm -f "$fixture"
  echo "nach dem Zweitlauf: ${again} (erwartet weiterhin 2)"
  [ "$again" -eq 2 ]
}
