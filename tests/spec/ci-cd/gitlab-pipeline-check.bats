#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-pipeline-check.bats
# SSOT: openspec/specs/ci-cd.md
# Ticket: T012267 — der GitLab-Spiegel (Projekt 85496968) läuft als
# Zweitverifikation, aber kein Werkzeug liest den Pipeline-Status. Zwei
# Zustände bleiben unbeantwortbar: (1) Pipelines stehen ohne Runner auf
# `pending` statt `failed` — ein hängender Job sieht nicht aus wie ein Fehler;
# (2) ob die Pipeline überhaupt startete, kann niemand feststellen. "Does even
# run" ist auf der GitLab-Seite unbeantwortbar. Sekundärbefund 4 aus T012239.
#
# PRUEFMODUS: Output-Verifikation. Das neue Skript scripts/gitlab-pipeline-check.sh
# wird mit einem curl-Stub (PATH) als echter Kommandoaufruf durchlaufen;
# geprueft werden Exit-Code und Klassifikations-Meldung.
#
# Positiv-Anker zuerst (T002356-M1): eine abgeschlossene success-Pipeline wird
# als success klassifiziert — beweist, dass der Auswertungspfad ueberhaupt
# erreicht wird.
#
# RED-Erwartung: das Skript existiert noch nicht — beide Tests schlagen vor dem
# Fix fehl (run scheitert), bis das Skript implementiert ist.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/gitlab-pipeline-check.sh"

  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"

  # Marker-Datei: der curl-Stub liefert diesen Body (Roh-JSON der GitLab-API).
  API_BODY="$BATS_TEST_TMPDIR/api-body"
  export API_BODY
  printf '[{"id":1,"ref":"main","status":"success"}]' > "$API_BODY"

  cat > "$STUB_BIN/curl" <<'EOF'
#!/usr/bin/env bash
cat "$API_BODY"
exit 0
EOF
  chmod +x "$STUB_BIN/curl"
}

# ── Positiv-Anker: success-Pipeline wird klassifiziert ───────────────────────#

@test "T012267: success-Pipeline auf main wird als success gemeldet (Positiv-Anker)" {
  printf '[{"id":1,"ref":"main","status":"success","created_at":"2026-08-18T00:00:00Z"}]' > "$API_BODY"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ] \
    || { echo "unerwarteter Exit $status: $output"; false; }
  grep -qi "success" <<<"$output" \
    || { echo "Positiv-Anker verletzt: success-Pipeline nicht als success klassifiziert — Testaufbau kaputt"; echo "$output"; false; }
}

# ── Negativfall / Reproduktion (RED bis zum Fix) ─────────────────────────────#
# expected: FAIL (RED — kein Skript, keine Pending-Klassifikation existiert)

@test "T012267: pending-Pipeline ohne Runner muss als 'kein Runner, kein Urteil' klassifiziert werden" {
  printf '[{"id":1,"ref":"main","status":"pending","created_at":"2026-08-18T00:00:00Z"}]' > "$API_BODY"

  run bash "$SCRIPT"

  # RED phase: Skript fehlt → run scheitert
  # GREEN phase: pending wird explizit als "kein Runner / kein Urteil" gemeldet
  grep -qi "pending" <<<"$output" \
    || { echo "❌ Bug reproduziert: pending-Pipeline wurde nicht als pending klassifiziert"; echo "$output"; false; }
  grep -qi "runner\|urteil\|kein signal" <<<"$output" \
    || { echo "❌ Die Pending-Meldung nennt die Runner-/Urteils-Klassifikation nicht"; echo "$output"; false; }
}

@test "T012267: leere API-Antwort ist kein Urteil — exit != 0" {
  printf '' > "$API_BODY"

  run bash "$SCRIPT"

  [ "$status" -ne 0 ] \
    || { echo "❌ Bug reproduziert: leere API-Antwort wurde als gültiges Urteil behandelt (exit 0)"; echo "$output"; false; }
}

# ── T012405: die abgefragte Projekt-ID ist die des Mirror-Ziels ──────────────

@test "gitlab-pipeline-check: fragt nicht mehr das zur Loeschung vorgemerkte Projekt ab" {
  # Belegter Fehlschlag (T012405): Das Skript fragte 85496968 ab. Dieses Projekt
  # heisst inzwischen 'Paddione/Bachelorprojekt-deletion_scheduled-85496968';
  # gepusht wird laengst nach 85506856 (p.korczewski/Bachelorprojekt).
  #
  # Der Schaden lag nicht darin, dass die Abfrage scheiterte — sie GELANG. Das
  # tote Projekt antwortet weiter mit seinen letzten, gruenen Pipelines. Die
  # Diagnose meldete also "alles gruen" fuer ein Projekt, in das seit dem Umzug
  # nichts mehr gepusht wird. Genau deshalb reicht hier keine Erreichbarkeits-
  # pruefung: eine Antwort ist kein Beleg dafuer, dass sie vom richtigen Ort kommt.
  script="${REPO_ROOT}/scripts/gitlab-pipeline-check.sh"
  [ -f "$script" ]

  # Positiv-Anker [T002356-M1]: Es wird ueberhaupt eine Projekt-ID gesetzt.
  # Ohne ihn bestuende die Abwesenheitspruefung auch bei geloeschter Zeile.
  ids="$(grep -oE 'GITLAB_PROJECT_ID:-[0-9]+' "$script" | grep -oE '[0-9]+')"
  echo "Anker: gefundene Default-Projekt-ID='${ids}'"
  [ -n "$ids" ]

  if grep -q '85496968' "$script"; then
    # Der Kopfkommentar DARF die alte ID nennen (er erklaert den Wechsel) —
    # die API-URL darf sie nicht mehr tragen.
    if grep -E '^[^#]*api/v4/projects' "$script" | grep -q '85496968'; then
      echo "Die API-URL fragt weiterhin das zur Loeschung vorgemerkte Projekt 85496968 ab" >&2
      false
    fi
  fi
}

@test "gitlab-pipeline-check: die Projekt-ID ist ohne Commit ueberschreibbar" {
  # Ein zweiter Kontowechsel soll keine Codeaenderung erzwingen — und vor allem
  # soll die ID EINE Fundstelle haben, damit der naechste Wechsel nicht wieder
  # eine Kopie stehen laesst.
  script="${REPO_ROOT}/scripts/gitlab-pipeline-check.sh"
  run grep -c 'GITLAB_PROJECT_ID' "$script"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}
