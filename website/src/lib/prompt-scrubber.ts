export interface ScrubbedPayload { effectiveSystemPrompt: string; anonymizedUserPrompt: string; }

export function scrubPayload(text: string, replacement: string): string {
  let result = text;
  for (const email of extractPIICandidates(text)) {
    const regex = new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, replacement);
  }
  
  for (const nameCandidate of extractPIICandidates(text)) {
    if (nameCandidate.includes('@') || nameCandidate.includes('Klient')) continue;
    const regex = new RegExp(nameCandidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, replacement);
  }
  
  return result;
}

function extractPIICandidates(text: string): Set<string> {
  const candidates = new Set<string>();
  for (const match of text.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)) {
    if (match[1]) candidates.add(match[1]);
  }
  
  const nameMatches = text.match(/([A-Za-zäöüÄÖÜß]+(?:\s+[A-Za-zäöüÄÖÜß]+)?)/g);
  if (nameMatches) {
    for (const m of nameMatches) {
      const clean = m.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
      if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/.test(clean)) {
        candidates.add(m);
      }
    }
  }
  
  return candidates;
}

export function scrubPrompt(systemPrompt: string | null, userPrompt: string, customerNumber: string): ScrubbedPayload {
  const effectiveSystemPrompt = systemPrompt ? scrubPayload(systemPrompt, customerNumber) : '';
  let anonymizedUserPrompt = userPrompt;
  
  if (userPrompt && !userPrompt.includes(customerNumber)) {
    const prefix = `Klient ${customerNumber}:`;
    anonymizedUserPrompt = scrubPayload(userPrompt, customerNumber);
    
    if (anonymizedUserPrompt && !anonymizedUserPrompt.startsWith(prefix)) {
      anonymizedUserPrompt = `${prefix}\n${anonymizedUserPrompt}`;
    } else if (!anonymizedUserPrompt) {
      anonymizedUserPrompt = prefix;
    }
  }
  
  return { effectiveSystemPrompt, anonymizedUserPrompt };
}
