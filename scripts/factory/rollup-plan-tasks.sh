#!/usr/bin/env bash
# scripts/factory/rollup-plan-tasks.sh — rendert die Aufgaben-Sektion des
# Mishap-Rollup-Plans aus den Kommentaren des Container-Tickets [T013043].
#
# Warum eigenstaendig: der Generator (mishap-rollup.sh) trug die Sektion bis
# T013043 als festes Heredoc mit genau drei generischen Checkboxen — unabhaengig
# davon, ob der Batch 3 oder 30 Eintraege hatte. Ein Executor-Modell hatte damit
# nichts, woran es Fortschritt pro Eintrag festmachen konnte; Zyklus 08-20/
# T012909 (PR #4884) schloss den Container als done/fixed, nachdem 3 von 10
# Eintraegen erledigt waren, mit 0 abgehakten Boxen.
#
# Zweiter Zweck: Rauschfilter. Die Kommentar-Auswahl des Generators filterte nur
# 'NOT LIKE FACTORY-PLAN-REF%', wodurch Watchdog-Meldungen, Unfactored-Notizen
# und Executor-Kommentare als Batch galten (Container T012445: 16 gezaehlte
# "Batches", real EIN Mishap-Kommentar mit 10 Eintraegen). Hier lebt die
# Filterlogik an genau einer Stelle und ist ueber stdout pruefbar.
#
# Das Eintragsmuster ist dasselbe, das mishap-rollup-artifacts.sh [T005031]
# bereits parst — beide Skripte lesen den Kommentar-Body, den mishap.go:253
# schreibt: "**N. Titel** (typ, komponente)".
#
# Usage: rollup-plan-tasks.sh [--count|--batches] < kommentare
#          --count    Anzahl echter Mishap-Eintraege auf stdout (auch 0), Exit 0
#          --batches  nur die Batch-Kommentare, ohne Automatik-Rauschen
#          ohne Flag: Aufgaben-Sektion auf stdout
# Env: ROLLUP_RECURRENCE_FILE — Ausgabe von rollup-recurrence.sh --all; Eintraege
#          mit Rezurrenz bekommen '×N' plus Vorzyklus-Referenz in den Kopf [T013305]
# Exit: 0 = gerendert bzw. gezaehlt | 2 = Aufruffehler
set -euo pipefail

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^#   \( *--\(count\|batches\).*\)$/  \1/p' "$0"
}

MODE="render"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --count)   MODE="count"; shift ;;
    --batches) MODE="batches"; shift ;;
    --help)  usage; exit 0 ;;
    *) echo "rollup-plan-tasks: unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# ── Batch-Kommentare aus dem Kommentar-Strom herausschneiden ─────────────────
# Nur was der Buffer-Flusher geschrieben hat, zaehlt als Batch: sein Body
# beginnt mit dem Header '### Mishap-Rollup' (einzige Quelle:
# scripts/ticket-mcp/go/internal/tools/mishap.go).
#
# Kommentargrenze: psql reiht die Bodies ohne Trenner aneinander, ein
# Folgekommentar waere sonst nicht vom Ende des Batches zu unterscheiden — die
# Watchdog-Notizen stehen im Strom direkt hinter dem Batch und wurden als
# dessen Fortsetzung gelesen. Der Generator stellt deshalb jedem Body die
# Sentinel-Zeile unten voran. Fehlt sie (Direktaufruf, Alt-Aufrufer), gilt
# zusaetzlich der Schnitt an einer neuen '### '-Ueberschrift.
COMMENT_SENTINEL='<<<ROLLUP-COMMENT>>>'
BATCH_TEXT="$(awk -v sentinel="$COMMENT_SENTINEL" '
  $0 == sentinel        { in_batch = 0; next }
  /^### Mishap-Rollup/  { in_batch = 1; print; next }
  /^### / && in_batch   { in_batch = 0 }
  in_batch              { print }
')"

# Eintraege im Batch: "**N. Titel** (typ, komponente)". Die Tabelle am
# Batch-Kopf wird dabei nicht mitgezaehlt (ihre Zeilen beginnen mit '|').
mapfile -t ENTRIES < <(printf '%s\n' "$BATCH_TEXT" | grep -E '^\*\*[0-9]+\. .+\)$' || true)

if [[ "$MODE" == "count" ]]; then
  printf '%s\n' "${#ENTRIES[@]}"
  exit 0
fi

if [[ "$MODE" == "batches" ]]; then
  printf '%s\n' "$BATCH_TEXT"
  exit 0
fi

# ── Aufgaben-Sektion rendern ────────────────────────────────────────────────
cat <<'HEADEOF'
## Aufgaben — ein Eintrag, eine Entscheidung

So wird dieser Container abgearbeitet: **jeder Eintrag unten bekommt eine Disposition**, und
zwar genau eine der vier folgenden. Erst dann wird seine Box abgehakt.

| Disposition | Wann | Was sie verlangt |
|---|---|---|
| **gefixt** | der Eintrag beschreibt ein Problem, das in diesem Zyklus behoben wird | Code- oder Konfigaenderung **plus** ein Test, der das Fehlverhalten vorher reproduziert |
| **bereits gefixt** | das Problem ist zwischenzeitlich anderswo behoben worden | den Beleg nennen (PR-Nummer oder Commit) und gegenpruefen, dass er auf `main` liegt |
| **kein Repo-Fix** | transientes Laufzeitereignis, Bedienfehler, oder bewusst so gewollt — und NICHT wiederholungsanfaellig | begruenden, warum keine Repo-Aenderung folgt UND warum kein Ablaufdatum noetig ist |
| **beobachten (bis Zyklus <JJJJ-MM-TT>)** | transient, aber wiederholungsanfaellig — der Workaround soll proaktiv im Blick bleiben | ein Ablaufdatum: der Generator fuehrt den Eintrag bis dahin in jedem Zyklus fort, danach wird er in ein eigenes Ticket eskaliert |

Ein Eintrag darf offen bleiben, wenn er den Rahmen dieses Zyklus sprengt — dann bleibt seine
Box leer und der Grund steht dahinter. Was nicht zulaessig ist: eine Box abhaken, ohne die
Disposition hinzuschreiben. Die Dispositionen zusammen sind der Nachweis, dass der Container
abgearbeitet wurde und nicht nur geschlossen.

HEADEOF

# ── Rezurrenz-Karte laden [T013305] ──────────────────────────────────────────
# Format (rollup-recurrence.sh --all): '<count>\t<title>\t<meta>\t<slug,...>'.
# Schluessel ist der normalisierte Titel+Meta; gematcht wird gegen die
# normaliserten Werte des jeweiligen Eintrags.
declare -A REC_N=() REC_SLUGS=()
_norm_key() { printf '%s|%s' "$1" "$2" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' '; }
if [[ -n "${ROLLUP_RECURRENCE_FILE:-}" && -s "$ROLLUP_RECURRENCE_FILE" ]]; then
  while IFS=$'\t' read -r n title meta slugs; do
    [[ -n "${n:-}" && -n "${title:-}" ]] || continue
    k="$(_norm_key "$title" "$meta")"
    REC_N[$k]="$n"
    REC_SLUGS[$k]="${slugs:-}"
  done < "$ROLLUP_RECURRENCE_FILE"
fi

if [[ "${#ENTRIES[@]}" -eq 0 ]]; then
  echo "_Keine Mishap-Eintraege in den Container-Kommentaren gefunden._"
  echo
else
  for entry in "${ENTRIES[@]}"; do
    num="$(printf '%s\n' "$entry"   | sed -E 's/^\*\*([0-9]+)\. .*$/\1/')"
    title="$(printf '%s\n' "$entry" | sed -E 's/^\*\*[0-9]+\. (.*)\*\* \(.*\)$/\1/')"
    meta="$(printf '%s\n' "$entry"  | sed -E 's/^\*\*[0-9]+\. .*\*\* \((.*)\)$/\1/')"
    recur=""
    k="$(_norm_key "$title" "$meta")"
    if [[ -n "${REC_N[$k]:-}" ]]; then
      recur=" **×${REC_N[$k]}** (Rezurrenz: ${REC_SLUGS[$k]})"
    fi
    printf -- '- [ ] **%s. %s** (%s)%s — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung\n' \
      "$num" "$title" "$meta" "$recur"
  done
  echo
fi

cat <<'TAILEOF'
- [ ] **Failing-Test-Step (RED).** Fuer jeden Eintrag, der die Disposition **gefixt** bekommt,
      zuerst einen Test schreiben, der das beschriebene Fehlverhalten reproduziert. Er gehoert
      nach `tests/spec/<spec-slug>/<kurz-slug>.bats` — das Verzeichnis der Spec, die das
      Verhalten abdeckt. Eintraege mit den beiden anderen Dispositionen brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
TAILEOF
