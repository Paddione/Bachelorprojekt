import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export interface MeetingInsights {
  summary: string;
  actionItems: string;
  keyTopics: string;
  sentiment: string;
  coachingNotes: string;
}

export async function generateMeetingInsights(params: {
  customerName: string;
  meetingType: string;
  transcript: string;
  artifacts?: string;
}): Promise<MeetingInsights | null> {
  if (!ANTHROPIC_API_KEY) {
    console.log('[claude] No API key configured. Skipping insights generation.');
    return null;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const artifactSection = params.artifacts
    ? `\n\n## Whiteboard-Artefakte\n${params.artifacts}`
    : '';

  const prompt = `Du bist ein erfahrener Coaching-Assistent. Analysiere das folgende Meeting-Transkript und erstelle strukturierte Erkenntnisse.

## Kontext
- Kunde: ${params.customerName}
- Typ: ${params.meetingType}

## Transkript
${params.transcript.substring(0, 30000)}${artifactSection}

Erstelle die Analyse im folgenden JSON-Format. Alle Texte auf Deutsch:
{
  "summary": "2-3 Saetze Zusammenfassung des Meetings",
  "actionItems": "Bullet-Liste der naechsten Schritte (Markdown)",
  "keyTopics": "Komma-separierte Liste der Hauptthemen",
  "sentiment": "Kurze Einschaetzung der Stimmung und Dynamik",
  "coachingNotes": "Beobachtungen und Empfehlungen fuer den Coach (Markdown)"
}

Antworte ausschliesslich mit dem JSON-Objekt.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[claude] No JSON found in response');
      return null;
    }

    return JSON.parse(jsonMatch[0]) as MeetingInsights;
  } catch (err) {
    console.error('[claude] Insights generation failed:', err);
    return null;
  }
}
