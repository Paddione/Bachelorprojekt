export interface TriageSuggestion {
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  reasoning: string;
  auto_apply: boolean;
  comment_id: string;
}

export function parseTriageComment(body: string): TriageSuggestion | null {
  const match = body.match(/Vorgeschlagene Severity:\s*(critical|high|medium|low)\s*\(Confidence:\s*(\d+)%\)/i);
  if (!match) return null;
  const severity = match[1].toLowerCase() as TriageSuggestion['severity'];
  const confidence = parseInt(match[2], 10) / 100;
  return { severity, confidence, reasoning: '', auto_apply: false, comment_id: '' };
}

export function renderTriageSuggestionHTML(suggestion: TriageSuggestion): string {
  const pct = Math.round(suggestion.confidence * 100);
  return `<div class="triage-suggestion" data-severity="${suggestion.severity}">` +
    `<p>Vorgeschlagene Severity: <strong>${suggestion.severity}</strong> (Confidence: ${pct}%)</p>` +
    `<button type="button" class="triage-confirm-btn" data-severity="${suggestion.severity}">Bestätigen</button>` +
    `</div>`;
}

export function buildConfirmActionPayload(suggestion: TriageSuggestion, ticketId: string) {
  return {
    ticketId,
    severity: suggestion.severity,
    resolveCommentId: suggestion.comment_id,
  };
}
