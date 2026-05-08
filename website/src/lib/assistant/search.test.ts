import { describe, it, expect } from 'vitest';
import { searchHelp, formatHit, noMatchReply } from './search';

describe('searchHelp (portal)', () => {
  it('finds rechnungen by direct keyword', () => {
    const hit = searchHelp('wie bezahle ich eine rechnung?', 'portal');
    expect(hit?.sectionKey).toBe('rechnungen');
  });

  it('finds termine by booking keyword', () => {
    const hit = searchHelp('ich möchte einen neuen termin buchen', 'portal');
    expect(hit?.sectionKey).toBe('termine');
  });

  it('finds dateien when asked about file upload', () => {
    const hit = searchHelp('wo kann ich dateien hochladen?', 'portal');
    expect(hit?.sectionKey).toBe('dateien');
  });

  it('finds unterschriften when asked about signing', () => {
    const hit = searchHelp('wie unterschreibe ich ein dokument?', 'portal');
    expect(hit?.sectionKey).toBe('unterschriften');
  });

  it('finds nachrichten by chat keyword', () => {
    const hit = searchHelp('wie schreibe ich meinem coach eine nachricht?', 'portal');
    expect(hit?.sectionKey).toBe('nachrichten');
  });

  it('returns null when query has no real keywords', () => {
    expect(searchHelp('hallo', 'portal')).toBeNull();
  });
});

describe('searchHelp (admin)', () => {
  it('finds bugs section', () => {
    const hit = searchHelp('wo finde ich offene bugs?', 'admin');
    expect(hit?.sectionKey).toBe('bugs');
  });

  it('finds meetings when asked about transcripts', () => {
    const hit = searchHelp('transkript für ein meeting hochladen', 'admin');
    expect(hit?.sectionKey).toBe('meetings');
  });

  it('finds rechnungen for invoice management', () => {
    const hit = searchHelp('rechnung erstellen', 'admin');
    expect(hit?.sectionKey).toBe('rechnungen');
  });
});

describe('searchHelp scoring', () => {
  it('matches plural/singular variants via stemming', () => {
    const a = searchHelp('rechnung', 'portal');
    const b = searchHelp('rechnungen', 'portal');
    expect(a?.sectionKey).toBe('rechnungen');
    expect(b?.sectionKey).toBe('rechnungen');
  });

  it('returns matchedTokens for transparency', () => {
    const hit = searchHelp('termin buchen', 'portal');
    expect(hit?.matchedTokens.length).toBeGreaterThan(0);
  });
});

describe('formatHit', () => {
  it('includes title, description, actions, and guides', () => {
    const hit = searchHelp('rechnung bezahlen', 'portal');
    expect(hit).not.toBeNull();
    const out = formatHit(hit!);
    expect(out).toMatch(/Rechnungen/);
    expect(out).toMatch(/Was du hier tun kannst/);
  });
});

describe('noMatchReply', () => {
  it('lists portal section titles', () => {
    const r = noMatchReply('portal');
    expect(r).toMatch(/Termine|Rechnungen|Nachrichten/);
  });
});
