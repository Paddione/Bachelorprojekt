import type { APIRoute } from 'astro';
import { postToChannel, notifyPipelineError } from '../../../lib/mattermost';
import { getRecordingFile } from '../../../lib/talk';
import { transcribeAudio, formatTranscript } from '../../../lib/whisper';
import { getWhiteboardArtifacts, extractWhiteboardText } from '../../../lib/whiteboard';
import {
  upsertCustomer, createMeeting, updateMeetingStatus,
  saveTranscript, saveArtifact, saveInsight, generateMeetingEmbeddings,
} from '../../../lib/website-db';
import { generateMeetingInsights } from '../../../lib/claude';

// Finalize a meeting: collect artifacts, trigger Claude Code.
// Called by the Mattermost "Abschliessen" action or directly via API.
//
// Body: {
//   customerName, customerEmail, meetingType, meetingDate,
//   transcript?, artifacts?, channelId?, roomToken?
// }
export const POST: APIRoute = async ({ request }) => {
  let customerName = '';
  let meetingId = '';
  const errors: string[] = [];
  const results: string[] = [];

  try {
    const {
      customerName: _customerName,
      customerEmail,
      meetingType,
      meetingDate,
      transcript: providedTranscript,
      artifacts: providedArtifacts,
      channelId,
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

    const sessionDate = meetingDate || new Date().toLocaleDateString('de-DE');

    // ── 1. Upsert customer in meetings DB ──────────────────────────
    let customer;
    try {
      customer = await upsertCustomer({
        name: customerName,
        email: customerEmail,
        mattermostChannelId: channelId,
      });
      results.push(`DB: Kunde ${customer.name} (${customer.id})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Kunde anlegen: ${msg}`);
      await notifyPipelineError({ step: 'Kunde anlegen (DB)', error: msg, customerName });
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
      meetingId = meeting.id;
      results.push(`DB: Meeting ${meeting.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Meeting anlegen: ${msg}`);
      await notifyPipelineError({ step: 'Meeting anlegen (DB)', error: msg, customerName });
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
            await notifyPipelineError({ step: 'Whisper-Transkription', error: 'Whisper hat kein Ergebnis geliefert', customerName, meetingId });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Recording/Transkription: ${msg}`);
        await notifyPipelineError({ step: 'Recording herunterladen / Transkription', error: msg, customerName, meetingId });
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
        await notifyPipelineError({ step: 'Transkript in DB speichern', error: msg, customerName, meetingId });
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
      await notifyPipelineError({ step: 'Whiteboard-Export', error: msg, customerName, meetingId });
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
      await notifyPipelineError({ step: 'Embedding-Generierung', error: msg, customerName, meetingId });
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
        await notifyPipelineError({ step: 'Claude-Insights generieren', error: msg, customerName, meetingId });
      }
    }

    await updateMeetingStatus(meeting.id, 'finalized');

    // ── 8. Post summary to Mattermost ──────────────────────────────
    if (channelId) {
      const summaryParts = [
        `### ${errors.length > 0 ? ':warning:' : ':white_check_mark:'} Meeting abgeschlossen: ${meetingType || 'Meeting'}`,
        '', `**Kunde:** ${customerName}`, `**Datum:** ${sessionDate}`, '',
      ];
      if (transcriptText) summaryParts.push(':page_facing_up: Transkript gespeichert');
      if (whiteboardArtifacts.length > 0) summaryParts.push(`:art: ${whiteboardArtifacts.length} Whiteboard-Artefakt(e)`);
      summaryParts.push('', ':robot_face: _Daten in meetings-DB gespeichert._');
      if (errors.length > 0) {
        summaryParts.push('', `**:warning: ${errors.length} Fehler:**`);
        for (const e of errors) summaryParts.push(`- ${e}`);
      }
      await postToChannel(channelId, summaryParts.join('\n'));
    }

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
    await notifyPipelineError({ step: 'Gesamte Pipeline (unerwarteter Fehler)', error: msg, customerName, meetingId });
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.', detail: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
