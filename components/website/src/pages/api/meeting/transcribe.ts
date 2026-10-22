import type { APIRoute } from 'astro';
import { matchesInternalToken, internalUnauthorized } from '../../../lib/internal-auth';
import { transcribeAudio, formatTranscript } from '../../../lib/whisper';


// Upload an audio file for transcription.
// Sends to faster-whisper, posts result to the customer's Mattermost channel.
//
// Multipart form: file (audio), channelId (optional), customerName (optional)
export const POST: APIRoute = async ({ request , locals }) => {
  // F4: internal-only — the talk-transcriber calls with INTERNAL_API_TOKEN.
  // Fail closed (401) so this is not an open Whisper proxy. Checked before
  // parsing the multipart body.
  if (!matchesInternalToken(request, process.env.INTERNAL_API_TOKEN ?? '')) {
    return internalUnauthorized();
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'Keine Audiodatei hochgeladen.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convert File to Buffer for whisper
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Transcribe
    const result = await transcribeAudio(buffer, file.name);

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Transkription fehlgeschlagen. Ist der Whisper-Service erreichbar?' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const formatted = formatTranscript(result);

    return new Response(
      JSON.stringify({
        success: true,
        text: result.text,
        formatted,
        language: result.language,
        duration: result.duration,
        segmentCount: result.segments?.length || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    locals.requestLogger.error({ err }, 'Transcription upload error:');
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
