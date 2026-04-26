#!/usr/bin/env bash
# Seed test meetings, transcripts, and artifacts into the website DB.
# Usage:  ./scripts/seed-test-meetings.sh [--clean]
#   --clean  removes test data before inserting (idempotent re-run)
set -euo pipefail

CLEAN=false
[[ "${1:-}" == "--clean" ]] && CLEAN=true

# ── helpers ──────────────────────────────────────────────────────────────────

psql_cmd() {
  kubectl exec -n workspace deploy/shared-db -- \
    psql -U postgres -d website -c "$1" 2>/dev/null
}

psql_file() {
  kubectl exec -n workspace deploy/shared-db -- \
    psql -U postgres -d website 2>/dev/null <<EOF
$1
EOF
}

echo "▶ Seeding test meetings into website DB …"

if $CLEAN; then
  echo "  → Removing existing test data …"
  psql_cmd "DELETE FROM meetings WHERE customer_id IN (
    SELECT id FROM customers WHERE email LIKE '%@test.mentolder.dev'
  );"
  psql_cmd "DELETE FROM customers WHERE email LIKE '%@test.mentolder.dev';"
fi

# ── Insert customers ──────────────────────────────────────────────────────────

psql_file "
INSERT INTO customers (id, name, email, company)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Max Mustermann',  'max@test.mentolder.dev',   'Musterfirma GmbH'),
  ('11111111-0000-0000-0000-000000000002', 'Erika Musterfrau','erika@test.mentolder.dev', 'Startup AG'),
  ('11111111-0000-0000-0000-000000000003', 'Anonym',          'anon@unknown.local',        NULL)
ON CONFLICT (email) DO NOTHING;
"

# ── Insert meetings ───────────────────────────────────────────────────────────

psql_file "
INSERT INTO meetings (id, customer_id, meeting_type, started_at, ended_at, duration_seconds, talk_room_token, status, created_at)
VALUES
  -- finalized meeting with all resources
  ('22222222-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Erstgespräch',
   now() - interval '3 days',
   now() - interval '3 days' + interval '45 minutes',
   2700,
   'test-room-abc123',
   'finalized',
   now() - interval '3 days'),

  -- transcribed meeting (has transcript, no artifacts)
  ('22222222-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000002',
   'Coaching-Session',
   now() - interval '1 day',
   now() - interval '1 day' + interval '60 minutes',
   3600,
   'test-room-xyz789',
   'transcribed',
   now() - interval '1 day'),

  -- ended meeting (no transcript, no artifacts yet)
  ('22222222-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000001',
   'Folgegespräch',
   now() - interval '2 hours',
   now() - interval '1 hour',
   3600,
   'test-room-def456',
   'ended',
   now() - interval '2 hours'),

  -- unassigned Talk-Session
  ('22222222-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000003',
   'Talk-Session',
   now() - interval '30 minutes',
   now() - interval '10 minutes',
   1200,
   NULL,
   'ended',
   now() - interval '30 minutes')
ON CONFLICT (id) DO NOTHING;
"

# ── Insert transcripts ────────────────────────────────────────────────────────

psql_file "
INSERT INTO transcripts (id, meeting_id, full_text, language, whisper_model, duration_seconds)
VALUES
  ('33333333-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   'Patrick: Guten Morgen, schön dass Sie heute Zeit gefunden haben.
Max: Danke, ich freue mich auf das Gespräch.
Patrick: Können Sie kurz beschreiben, welche Ziele Sie mit dem Coaching erreichen möchten?
Max: Ich möchte meine Führungskompetenzen ausbauen und besser mit Stress umgehen.
Patrick: Das ist ein sehr guter Ausgangspunkt. Lassen Sie uns zunächst Ihre aktuelle Situation analysieren.
Max: Ich leite ein Team von 8 Personen und merke, dass Konflikte zunehmen.
Patrick: Welche konkreten Situationen empfinden Sie als besonders herausfordernd?
Max: Vor allem Feedback-Gespräche fallen mir schwer – ich möchte niemanden verletzen.
Patrick: Das ist ein häufiges Thema. Wir werden daran arbeiten, konstruktives Feedback zu geben.
Max: Ich bin gespannt auf die Übungen.
Patrick: Bis nächste Woche haben Sie die Hausaufgabe, drei positive Feedbacks zu geben.
Max: Klingt machbar, ich werde es versuchen.',
   'de', 'Systran/faster-whisper-medium', 2700),

  ('33333333-0000-0000-0000-000000000002',
   '22222222-0000-0000-0000-000000000002',
   'Patrick: Willkommen zur heutigen Coaching-Session, Erika.
Erika: Hallo Patrick! Ich habe letzte Woche Ihre Übungen gemacht.
Patrick: Sehr gut! Wie war die Erfahrung für Sie?
Erika: Überraschend positiv – mein Team hat sehr gut reagiert.
Patrick: Das zeigt, dass Sie die Techniken korrekt angewendet haben.
Erika: Ich habe bemerkt, dass ich viel klarer kommuniziere.
Patrick: Genau das ist das Ziel. Heute möchten wir uns auf Zeitmanagement konzentrieren.
Erika: Das wäre super, ich bin ständig überlastet.
Patrick: Wir werden die Eisenhower-Matrix besprechen und wie Sie Prioritäten setzen.
Erika: Ich kenne das Konzept, aber setze es nicht konsequent um.
Patrick: Lass uns das heute ändern. Bitte listen Sie Ihre Top-10-Aufgaben auf.',
   'de', 'Systran/faster-whisper-medium', 3600)
ON CONFLICT (id) DO NOTHING;
"

# ── Insert artifacts ──────────────────────────────────────────────────────────

# shellcheck disable=SC2140
psql_file "
INSERT INTO meeting_artifacts (id, meeting_id, artifact_type, name, storage_path, content_text)
VALUES
  -- document: transcript uploaded to Nextcloud
  ('44444444-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001',
   'document',
   '2026-04-15_Erstgespräch_Transkript.md',
   'Meetings/Max Mustermann/2026-04-15_Erstgespräch_Transkript.md',
   'Transkript des Erstgesprächs mit Max Mustermann vom 15.04.2026.'),

  -- whiteboard: exported from Nextcloud Whiteboard
  ('44444444-0000-0000-0000-000000000002',
   '22222222-0000-0000-0000-000000000001',
   'whiteboard',
   'Ziele-Whiteboard.excalidraw',
   'Meetings/Max Mustermann/2026-04-15_Whiteboard_Ziele.excalidraw',
   '{"type":"excalidraw","version":2,"elements":[{"type":"text","text":"Führungskompetenz ausbauen"}]}'),

  -- screenshot
  ('44444444-0000-0000-0000-000000000003',
   '22222222-0000-0000-0000-000000000001',
   'screenshot',
   'Screenshot-Ressourcen.png',
   'Meetings/Max Mustermann/2026-04-15_Screenshot.png',
   NULL),

  -- file without Nextcloud path (content only)
  ('44444444-0000-0000-0000-000000000004',
   '22222222-0000-0000-0000-000000000001',
   'file',
   'Hausaufgaben-Checkliste.pdf',
   NULL,
   'Checkliste: 1. Positives Feedback geben 2. Ziele dokumentieren 3. Reflexion schreiben')
ON CONFLICT (id) DO NOTHING;
"

echo ""
echo "✓ Test data inserted:"
echo ""

psql_cmd "
SELECT
  m.id,
  m.meeting_type AS type,
  m.status,
  c.name AS customer,
  EXISTS(SELECT 1 FROM transcripts t WHERE t.meeting_id = m.id) AS has_transcript,
  (SELECT COUNT(*) FROM meeting_artifacts a WHERE a.meeting_id = m.id) AS artifacts
FROM meetings m
JOIN customers c ON m.customer_id = c.id
WHERE c.email LIKE '%@test.mentolder.dev' OR c.email LIKE '%@unknown.local'
ORDER BY m.created_at DESC;
"

echo ""
echo "✓ Done. Open http://web.localhost/admin/meetings to verify."
