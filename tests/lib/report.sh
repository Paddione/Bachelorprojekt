#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# report.sh — JSON finalization + Markdown report generation
# ═══════════════════════════════════════════════════════════════════
# Usage: source this file, then call finalize_json / generate_markdown.
#
# Required env vars:
#   RESULTS_FILE  — path to the JSONL results file
#   RESULTS_DIR   — path to results output directory
# ═══════════════════════════════════════════════════════════════════

# ── Finalize JSONL → proper JSON report ──────────────────────────
# Reads JSONL (one object per line), wraps in {meta, results, summary}
finalize_json() {
  local tier="$1" output_file="$2"

  local total pass fail skip
  total=$(wc -l < "$RESULTS_FILE" | tr -d '[:space:]')
  pass=$(grep -c '"status":"pass"' "$RESULTS_FILE" 2>/dev/null || true)
  fail=$(grep -c '"status":"fail"' "$RESULTS_FILE" 2>/dev/null || true)
  skip=$(grep -c '"status":"skip"' "$RESULTS_FILE" 2>/dev/null || true)
  : "${pass:=0}" "${fail:=0}" "${skip:=0}"

  jq -n \
    --arg tier "$tier" \
    --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg host "$(hostname)" \
    --arg compose "k3d/kustomization.yaml" \
    --argjson total "$total" \
    --argjson pass "$pass" \
    --argjson fail "$fail" \
    --argjson skip "$skip" \
    --slurpfile results "$RESULTS_FILE" \
    '{
      meta: { tier: $tier, date: $date, host: $host, compose_file: $compose },
      results: $results,
      summary: { total: $total, pass: $pass, fail: $fail, skip: $skip }
    }' > "$output_file"

  echo "  JSON report: ${output_file}"
}

# ── Generate Markdown from JSON report ───────────────────────────
generate_markdown() {
  local json_file="$1" md_file="$2"

  local tier date total pass fail skip
  tier=$(jq -r '.meta.tier' "$json_file")
  date=$(jq -r '.meta.date' "$json_file")
  total=$(jq -r '.summary.total' "$json_file")
  pass=$(jq -r '.summary.pass' "$json_file")
  fail=$(jq -r '.summary.fail' "$json_file")
  skip=$(jq -r '.summary.skip' "$json_file")

  {
    echo "# Testergebnis — ${tier^} Tier — ${date%%T*}"
    echo ""
    echo "Host: $(jq -r '.meta.host' "$json_file") | Gesamt: ${total} | Bestanden: ${pass} | Fehlgeschlagen: ${fail} | Übersprungen: ${skip}"
    echo ""
    echo "## Automatisierte Tests"
    echo ""
    echo "| Req | Test | Beschreibung | Status | Dauer |"
    echo "|-----|------|-------------|--------|-------|"

    jq -r '.results[] | "| **\(.req)** | \(.test) | \(.desc) | \(if .status == "pass" then "✅" elif .status == "fail" then "❌" else "⊘" end) | \(.duration_ms)ms |"' "$json_file"

    echo ""
    echo "## Manuelle Prüfungen (AK/L)"
    echo ""
    echo "| Req | Bezeichnung | Geprüft |"
    echo "|-----|------------|---------|"
    echo "| AK-01 | Marktnachweis — Marktanalyse abgegeben, Betreuer bestätigt | [ ] |"
    echo "| AK-02 | Alleinstellungsmerkmale — USP-Tabelle mind. 3 Einträge | [ ] |"
    echo "| AK-05 | Geschäftsmodell — Kostenrechnung nachvollziehbar | [ ] |"
    echo "| AK-06 | Dokumentation — DMS-Checkliste alle Dokumente vorhanden | [ ] |"
    echo "| AK-07 | Präsentation — 40–45 min, alle Mitglieder, Live-Demo | [ ] |"
    echo "| L-01 | Konzept — P1–P5 vollständig im DMS | [ ] |"
    echo "| L-02 | Marktanalyse — mind. 5 Wettbewerber, Quellen zitiert | [ ] |"
    echo "| L-03 | Prototyp — GitHub-Link, Kernfunktionen demonstrierbar | [ ] |"
    echo "| L-04 | Geschäftsmodell — mind. 2 Szenarien | [ ] |"
    echo "| L-05 | Systemarchitektur — Diagramm aktuell, SSO-Fluss erklärt | [ ] |"
    echo "| L-06 | Deploymentanleitung — reproduzierbar, Troubleshooting | [ ] |"
    echo "| L-07 | Endbericht — mind. 6 Seiten/Teilnehmer | [ ] |"
    echo "| L-08 | Abschlusspräsentation — Unterlagen im DMS | [ ] |"
    echo ""

    # Failed tests detail section
    local fail_count
    fail_count=$(jq '[.results[] | select(.status == "fail")] | length' "$json_file")
    if (( fail_count > 0 )); then
      echo "## Fehlgeschlagene Tests — Details"
      echo ""
      jq -r '.results[] | select(.status == "fail") | "### \(.req)/\(.test): \(.desc)\n\n\(.detail)\n"' "$json_file"
    fi

    echo "---"
    echo "*Generiert: ${date} auf $(jq -r '.meta.host' "$json_file")*"
  } > "$md_file"

  echo "  Markdown report: ${md_file}"
}
