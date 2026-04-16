import type { APIRoute } from 'astro';
import {
  getMeetingByRoomToken,
  upsertCustomer,
  createMeeting,
  saveTranscript,
  saveArtifact,
  updateMeetingStatus,
} from '../../../lib/website-db';
import { ensureFolder, uploadFile } from '../../../lib/nextcloud-files';

// Called by talk-transcriber after a Nextcloud Talk call ends.
// Saves the accumulated transcript to the database and as a Markdown file in Nextcloud.
// If no meeting record exists for the roomToken yet, one is auto-created from the
// room metadata passed by the transcriber (roomName + participants from NC DB).
//
// Body: {
//   roomToken: string,
//   transcriptText: string,
//   segments?: Array<{ start: number, end: number, text: string }>,
//   startedAt?: number,                                   // Unix timestamp (seconds)
//   endedAt?: number,                                     // Unix timestamp (seconds)
//   roomName?: string,                                    // NC Talk room name
//   participants?: Array<{ displayName, email, uid }>,    // non-bot room members
//   resources?: Array<{ type, name, storagePath, timestamp }>  // files from meeting window
// }
export const POST: APIRoute = async ({ request }) => {
  let body: {
    roomToken?: string;
    transcriptText?: string;
    segments?: unknown[];
    startedAt?: number;
    endedAt?: number;
    roomName?: string;
    participants?: Array<{ displayName: string; email: string; uid: string }>;
    resources?: Array<{ type: 'whiteboard' | 'document' | 'screenshot' | 'file'; name: string; storagePath: string | null; timestamp: number }>;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const {
    roomToken, transcriptText, segments = [],
    startedAt, endedAt,
    roomName, participants = [], resources = [],
  } = body;

  if (!roomToken || typeof roomToken !== 'string') {
    return json({ error: 'roomToken required' }, 400);
  }
  if (!transcriptText || typeof transcriptText !== 'string') {
    return json({ error: 'transcriptText required' }, 400);
  }

  // ── 1. Look up meeting by room token ──────────────────────────────────────
  let meeting = await getMeetingByRoomToken(roomToken);
  if (!meeting) {
    // Auto-create a meeting from room metadata when no existing record is found.
    // The transcriber bot passes roomName + participants from the Nextcloud DB.
    const firstParticipant = participants.find(p => p.email) ?? participants[0];
    if (!firstParticipant) {
      console.warn(`[save-transcript] no meeting and no participant metadata for roomToken=${roomToken}`);
      return json({ error: 'Meeting not found for this room token' }, 404);
    }

    const customerEmail = firstParticipant.email || `${firstParticipant.uid}@unknown.local`;
    const customerName = firstParticipant.displayName || firstParticipant.uid;
    const meetingTypeName = roomName || 'Talk-Session';

    console.info(`[save-transcript] auto-creating meeting for roomToken=${roomToken}, customer=${customerName}`);
    const customer = await upsertCustomer({ name: customerName, email: customerEmail });
    const created = await createMeeting({
      customerId: customer.id,
      meetingType: meetingTypeName,
      talkRoomToken: roomToken,
    });
    // Re-fetch as MeetingWithCustomer shape
    meeting = await getMeetingByRoomToken(roomToken);
    if (!meeting) {
      return json({ error: 'Failed to create meeting record' }, 500);
    }
    console.info(`[save-transcript] auto-created meeting ${created.id}`);
  }

  if (['transcribed', 'finalized'].includes(meeting.status)) {
    return json({ error: 'Meeting already transcribed', meetingId: meeting.id }, 409);
  }

  const results: string[] = [];
  const errors: string[] = [];

  // ── 2. Mark meeting as ended ──────────────────────────────────────────────
  try {
    await updateMeetingStatus(meeting.id, 'ended', {
      startedAt: startedAt ? new Date(startedAt * 1000) : undefined,
      endedAt:   endedAt   ? new Date(endedAt   * 1000) : new Date(),
    });
    results.push('Meeting status → ended');
  } catch (err) {
    errors.push(`Status update: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Save transcript to DB ──────────────────────────────────────────────
  let transcriptId: string | null = null;
  try {
    const typedSegments = (segments as Array<{ start: number; end: number; text: string }>)
      .filter(s => s && typeof s.start === 'number' && typeof s.end === 'number');

    const saved = await saveTranscript({
      meetingId: meeting.id,
      fullText: transcriptText,
      segments: typedSegments,
    });
    transcriptId = saved.id;
    await updateMeetingStatus(meeting.id, 'transcribed');
    results.push(`DB: Transcript ${saved.id} (${typedSegments.length} segments)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Save transcript to DB: ${msg}`);
  }

  // ── 4. Upload transcript to Nextcloud ─────────────────────────────────────
  if (transcriptId) {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const safeName = meeting.customerName.replace(/[^a-zA-Z0-9äöüÄÖÜß.\-_ ]/g, '_');
      const folderPath = `Meetings/${safeName}`;
      const fileName = `${date}_${meeting.meetingType.replace(/\s+/g, '_')}_Transkript.md`;
      const filePath = `${folderPath}/${fileName}`;

      const markdown = buildMarkdown({
        customerName: meeting.customerName,
        customerEmail: meeting.customerEmail,
        meetingType: meeting.meetingType,
        date,
        transcriptText,
        segments: segments as Array<{ start: number; end: number; text: string }>,
      });

      await ensureFolder(folderPath);
      await uploadFile(filePath, markdown, 'text/markdown; charset=utf-8');

      await saveArtifact({
        meetingId: meeting.id,
        artifactType: 'document',
        name: fileName,
        storagePath: filePath,
        contentText: transcriptText.substring(0, 5000),
      });

      results.push(`Nextcloud: ${filePath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Nextcloud upload: ${msg}`);
    }
  }

  // ── 5. Save detected resources as artifacts ───────────────────────────────
  if (resources.length > 0) {
    for (const res of resources) {
      try {
        await saveArtifact({
          meetingId: meeting.id,
          artifactType: res.type,
          name: res.name,
          storagePath: res.storagePath ?? undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Resource artifact (${res.name}): ${msg}`);
      }
    }
    results.push(`Resources: ${resources.length} artifact(s) saved`);
  }

  return json({
    success: errors.length === 0,
    meetingId: meeting.id,
    results,
    ...(errors.length > 0 ? { errors } : {}),
  }, 200);
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function buildMarkdown(params: {
  customerName: string;
  customerEmail: string;
  meetingType: string;
  date: string;
  transcriptText: string;
  segments: Array<{ start: number; end: number; text: string }>;
}): string {
  const { customerName, customerEmail, meetingType, date, transcriptText, segments } = params;

  let md = `# Transkript: ${meetingType} — ${date}\n\n`;
  md += `**Kunde:** ${customerName} (${customerEmail})\n`;
  md += `**Typ:** ${meetingType}\n`;
  md += `**Datum:** ${date}\n`;
  md += `**Erstellt:** ${new Date().toLocaleString('de-DE')}\n\n---\n\n`;

  if (segments.length > 0) {
    md += `## Transkript mit Zeitstempeln\n\n`;
    for (const seg of segments) {
      md += `**[${formatSeconds(seg.start)}]** ${seg.text}\n\n`;
    }
  } else {
    md += `## Transkript\n\n${transcriptText}\n`;
  }

  md += `\n---\n*Automatisch erstellt durch talk-transcriber + Whisper*\n`;
  return md;
}
