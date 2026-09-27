#!/usr/bin/env bash
# checks/run.sh — Exit 0 = gruen. Nur offline: kein Cluster, kein Netz.
# Der sed-Render ist echte Verhaltenspruefung; kubectl wird bewusst NICHT gerufen
# (kein API-Server). Die Bats-Syntax prueft bats --count.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET="${BENCH_TARGET:-$CASE_DIR/base}"
YAML="$TARGET/k3d/k1-embed-job.yaml"
BATS="$TARGET/tests/spec/plan-partials-embedding/k1-embeds.bats"
fails=0
note() { printf 'FAIL %s\n' "$1" >&2; fails=$((fails + 1)); }
ok()   { printf 'ok   %s\n' "$1"; }

render() {
  sed -e 's/\$JOB_ID/abc1234-999/g' \
      -e 's/\$MERGE_SHA/abc1234def5678/g' \
      -e 's/\$FULL/0/g' \
      -e 's|\$REPO_URL|https://example.invalid/x.git|g' "$YAML"
}

if out="$(render 2>/dev/null)"; then ok 'sed-render laeuft'; else note 'sed-render fehlgeschlagen'; out=""; fi

# Positiv-Anker: ohne sie waeren die Negativpruefungen bei leerer Ausgabe trivial wahr.
for anchor in 'apiVersion: batch/v1' 'kind: Job' 'name: k1-embed-abc1234-999' 'https://example.invalid/x.git'; do
  if printf '%s' "$out" | grep -qF "$anchor"; then ok "anker: $anchor"
  else note "anker fehlt im gerenderten YAML: $anchor"; fi
done

# Negativpruefungen: kein Platzhalter darf uebrig sein.
for ph in '$JOB_ID' '$MERGE_SHA' '$FULL' '$REPO_URL'; do
  if printf '%s' "$out" | grep -qF "$ph"; then note "Platzhalter nicht substituiert: $ph"
  else ok "substituiert: $ph"; fi
done

# Das Manifest behaelt seine Platzhalter — sonst waere es festgebacken (Loesung c).
for ph in '$JOB_ID' '$MERGE_SHA' '$FULL' '$REPO_URL'; do
  if grep -qF "$ph" "$YAML" 2>/dev/null; then ok "manifest behaelt $ph"
  else note "manifest hat $ph nicht mehr — Werte wurden festgebacken (Loesung c)"; fi
done

# Bats-Syntax ist KEIN bash - eine .bats-Datei laesst sich nicht per bash -n pruefen
# (@test "name" { ist syntaktisch ungueltig). Der echte Parser ist bats selbst:
# --count parst die Datei, ohne einen Test auszufuehren.
BATS_BIN="${BENCH_BATS:-}"
if [ -z "$BATS_BIN" ]; then
  probe="$SCRIPT_DIR"
  while [ "$probe" != "/" ]; do
    if [ -x "$probe/tests/unit/lib/bats-core/bin/bats" ]; then
      BATS_BIN="$probe/tests/unit/lib/bats-core/bin/bats"; break
    fi
    probe="$(dirname "$probe")"
  done
fi
if [ ! -s "$BATS" ]; then
  note 'bats-datei fehlt'
elif [ -n "$BATS_BIN" ] && [ -x "$BATS_BIN" ]; then
  count="$("$BATS_BIN" --count "$BATS" 2>/dev/null | head -1)"
  if [ -n "$count" ] && [ "$count" -ge 1 ] 2>/dev/null; then
    ok "bats-datei syntaktisch gueltig (bats --count = $count)"
  else
    note 'bats-Syntax defekt (bats --count schlaegt an)'
  fi
else
  n_test="$(grep -c '^@test ' "$BATS" 2>/dev/null | head -1)"
  n_open="$(tr -cd '{' < "$BATS" | wc -c | tr -d ' ')"
  n_close="$(tr -cd '}' < "$BATS" | wc -c | tr -d ' ')"
  if [ "${n_test:-0}" -ge 1 ] && [ "$n_open" -eq "$n_close" ]; then
    ok 'bats-datei strukturell plausibel (kein bats-Binary)'
  else
    note 'bats-datei fehlt oder strukturell defekt'
  fi
fi

# (5) Beide Fix-Haelften muessen da sein, der Dry-Run aber bleiben.
if grep -qF 'vollstaendig (offline)' "$BATS" 2>/dev/null; then ok 'offline render-test vorhanden'
else note 'offline render-test fehlt (Entweder-oder-Loesung)'; fi
if grep -qF 'kubectl version --request-timeout=3s' "$BATS" 2>/dev/null &&
   grep -qF "skip 'kein Kubernetes-API-Server erreichbar'" "$BATS" 2>/dev/null; then
  ok 'dry-run hat Erreichbarkeits-guard'
else note 'dry-run ohne Erreichbarkeits-guard (pauschales skip)'; fi
if grep -qF 'kubectl apply --dry-run=client' "$BATS" 2>/dev/null; then ok 'dry-run erhalten'
else note 'dry-run geloescht — Manifest-Pruefung faellt still aus'; fi
if grep -qE "^\s*skip 'kein Cluster'" "$BATS" 2>/dev/null; then note 'pauschales skip vorhanden (Loesung b)'
else ok 'kein pauschales skip'; fi

# (6) Reviewer-Artefakte: seeded defect muss beschrieben und in TARGET abwesend sein.
SEEDJ="$SCRIPT_DIR/diffs/seeded-1.json"
SEEDD="$SCRIPT_DIR/diffs/seeded-1.diff"
CLEAND="$SCRIPT_DIR/diffs/clean.diff"
if [ -s "$SEEDJ" ] && grep -q '"file"' "$SEEDJ" && grep -q '"line"' "$SEEDJ" && grep -q '"defect"' "$SEEDJ"; then
  ok 'seeded-1.json hat file/line/defect'
else note 'seeded-1.json unvollstaendig (file/line/defect)'; fi
seedfile="$(sed -n 's/.*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SEEDJ" 2>/dev/null | head -1)"
if [ -n "$seedfile" ] && [ -f "$TARGET/$seedfile" ]; then ok "seeded-1.json file existiert: $seedfile"
else note "seeded-1.json file existiert nicht in TARGET: ${seedfile:-<leer>}"; fi
if [ -n "$seedfile" ] && grep -qF "$seedfile" "$SEEDD" 2>/dev/null; then ok 'seeded-1.diff nennt die Datei'
else note 'seeded-1.diff passt nicht zu seeded-1.json'; fi
[ -s "$CLEAND" ] && ok 'clean.diff vorhanden' || note 'clean.diff fehlt'
# Der seeded defect selbst (fehlender Positiv-Anker) darf in TARGET nicht stehen.
if grep -qF 'apiVersion: batch/v1' "$BATS" 2>/dev/null; then ok 'seeded defect abwesend (Positiv-Anker da)'
else note 'seeded defect aktiv — Positiv-Anker fehlt, Negativpruefung trivial'; fi

[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: alle Invarianten erfuellt\n'
