import type { APIRoute } from 'astro';
import { getRecordingFile } from '../../../lib/talk';
import { transcribeAudio, formatTranscript } from '../../../lib/whisper';
import { getWhiteboardArtifacts, extractWhiteboardText } from '../../../lib/whiteboard';
import {
  upsertCustomer, createMeeting, updateMeetingStatus,
  saveTranscript, saveArtifact, saveInsight, generateMeetingEmbeddings,
} from '../../../lib/website-db';
import { generateMeetingInsights } from '../../../lib/claude';

// Finalize a meeting: collect artifacts, transcribe, generate AI insights.
// Called directly via API.
//
// Body: {
//   customerName, customerEmail, meetingType,
//   transcript?, artifacts?, roomToken?
// }
export const POST: APIRoute = async ({ request }) => {
  let customerName = '';
  const errors: string[] = [];
  const results: string[] = [];

  try {
    const {
      customerName: _customerName,
      customerEmail,
      meetingType,
      transcript: providedTranscript,
      artifacts: providedArtifacts,
      roomToken,
      projectId,
    } = await request.json();
    customerName = _customerName;

    if (!customerName || !customerEmail) {
      return new Response(
        JSON.stringify({ error: 'customerName and customerEmail required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── 1. Upsert customer in meetings DB ──────────────────────────
    let customer;
    try {
      customer = await upsertCustomer({
        name: customerName,
        email: customerEmail,
      });
      results.push(`DB: Kunde ${customer.name} (${customer.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Kunde anlegen: ${msg}`);
      return new Response(
        JSON.stringify({ success: false, error: 'DB nicht erreichbar', errors, results }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Create meeting record ───────────────────────────────────
    let meeting;
    try {
      meeting = await createMeeting({
        customerId: customer.id,
        meetingType: meetingType || 'Meeting',
        talkRoomToken: roomToken,
        projectId: projectId ?? undefined,
      });
      await updateMeetingStatus(meeting.id, 'ended', { endedAt: new Date() });
      results.push(`DB: Meeting ${meeting.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Meeting anlegen: ${msg}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Meeting-Eintrag fehlgeschlagen', errors, results }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── 3. Download recording + transcribe (if room token given) ───
    let transcriptText = providedTranscript || '';
    let transcriptSegments: Array<{ start: number; end: number; text: string }> = [];

    if (!transcriptText && roomToken) {
      try {
        const recording = await getRecordingFile(roomToken);
        if (recording) {
          results.push(`:microphone: Aufnahme gefunden: ${recording.filename}`);
          await updateMeetingStatus(meeting.id, 'ended', { recordingPath: recording.filename });

          const whisperResult = await transcribeAudio(recording.data, recording.filename, 'de');
          if (whisperResult) {
            transcriptText = formatTranscript(whisperResult);
            transcriptSegments = whisperResult.segments || [];
            results.push(`:page_facing_up: Transkript: ${whisperResult.duration.toFixed(0)}s, ${whisperResult.segments?.length || 0} Segmente`);
          } else {
            errors.push('Whisper: Transkription fehlgeschlagen');
            errors.push('Whisper: kein Ergebnis');
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Recording/Transkription: ${msg}`);
      }
    }

    // ── 4. Save transcript to DB ───────────────────────────────────
    if (transcriptText) {
      try {
        const saved = await saveTranscript({
          meetingId: meeting.id,
          fullText: transcriptText,
          segments: transcriptSegments,
        });
        await updateMeetingStatus(meeting.id, 'transcribed');
        results.push(`DB: Transkript ${saved.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Transkript speichern: ${msg}`);
      }
    }

    // ── 5. Fetch + save whiteboard artifacts ───────────────────────
    let whiteboardArtifacts: Awaited<ReturnType<typeof getWhiteboardArtifacts>> = [];
    try {
      whiteboardArtifacts = await getWhiteboardArtifacts(
        roomToken ? `${meetingType}: ${customerName}` : undefined
      );
      for (const wb of whiteboardArtifacts) {
        const text = extractWhiteboardText(wb.data);
        await saveArtifact({
          meetingId: meeting.id,
          artifactType: 'whiteboard',
          name: wb.name,
          storagePath: wb.path,
          contentText: text || wb.data.substring(0, 5000),
        });
        results.push(`:art: Whiteboard: ${wb.name}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Whiteboard-Artefakte: ${msg}`);
    }

    // Save any additional provided artifacts
    if (providedArtifacts && Array.isArray(providedArtifacts)) {
      for (const artifact of providedArtifacts) {
        try {
          await saveArtifact({
            meetingId: meeting.id,
            artifactType: 'file',
            name: artifact.name || 'Datei',
            storagePath: artifact.url,
            contentText: artifact.description,
          });
        } catch (err) {
          errors.push(`Artefakt "${artifact.name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // ── 6. Generate embeddings (best-effort) ──────────────────────
    try {
      const embeddingCount = await generateMeetingEmbeddings(meeting.id);
      if (embeddingCount > 0) results.push(`Embeddings: ${embeddingCount} Vektoren generiert`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Embeddings: ${msg}`);
    }

    // ── 7b. Generate Claude AI insights (best-effort) ───────────────
    if (transcriptText) {
      try {
        const artifactTexts = whiteboardArtifacts
          .map(wb => {
            const text = extractWhiteboardText(wb.data);
            return text ? `### ${wb.name}\n${text}` : '';
          })
          .filter(Boolean)
          .join('\n\n');

        const insights = await generateMeetingInsights({
          customerName,
          meetingType: meetingType || 'Meeting',
          transcript: transcriptText,
          artifacts: artifactTexts || undefined,
        });

        if (insights) {
          const insightTypes = [
            { type: 'summary' as const, content: insights.summary },
            { type: 'action_items' as const, content: insights.actionItems },
            { type: 'key_topics' as const, content: insights.keyTopics },
            { type: 'sentiment' as const, content: insights.sentiment },
            { type: 'coaching_notes' as const, content: insights.coachingNotes },
          ];

          for (const { type, content } of insightTypes) {
            await saveInsight({
              meetingId: meeting.id,
              insightType: type,
              content,
              generatedBy: 'claude-sonnet-4-20250514',
            });
          }
          results.push(`:brain: Claude-Analyse: ${insightTypes.length} Insights generiert`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Claude-Insights: ${msg}`);
      }
    }

    await updateMeetingStatus(meeting.id, 'finalized');

    results.push(errors.length > 0
      ? `Pipeline: abgeschlossen mit ${errors.length} Fehler(n)`
      : 'Pipeline: vollstaendig abgeschlossen');

    return new Response(
      JSON.stringify({ success: true, results, errors: errors.length > 0 ? errors : undefined }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Finalize meeting error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.', detail: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
