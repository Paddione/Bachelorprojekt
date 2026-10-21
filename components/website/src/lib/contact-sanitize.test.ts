import { describe, it, expect } from 'vitest';
import { sanitizeContactInput, escapeHtml } from './contact-sanitize';

describe('sanitizeContactInput', () => {
  it('accepts valid contact inputs', () => {
    const res = sanitizeContactInput({
      name: 'Max Mustermann',
      email: 'max@example.com',
      phone: '+49 123 45678',
      type: 'coaching',
      message: 'Guten Tag, ich interessiere mich für Coaching.',
    });
    expect(res.error).toBeUndefined();
    expect(res.data).toEqual({
      name: 'Max Mustermann',
      email: 'max@example.com',
      phone: '+49 123 45678',
      type: 'coaching',
      message: 'Guten Tag, ich interessiere mich für Coaching.',
    });
  });

  it('rejects missing required fields', () => {
    expect(sanitizeContactInput({ name: '', email: 'a@b.com', message: 'Hi' }).error).toBe(
      'Bitte füllen Sie alle Pflichtfelder aus.'
    );
    expect(sanitizeContactInput({ name: 'Max', email: '', message: 'Hi' }).error).toBe(
      'Bitte füllen Sie alle Pflichtfelder aus.'
    );
    expect(sanitizeContactInput({ name: 'Max', email: 'a@b.com', message: '  ' }).error).toBe(
      'Bitte füllen Sie alle Pflichtfelder aus.'
    );
  });

  it('strips newlines from name to prevent SMTP header injection', () => {
    const res = sanitizeContactInput({
      name: 'Max\r\nBcc: evil@attacker.com\nOther',
      email: 'max@example.com',
      message: 'Hello',
    });
    expect(res.error).toBeUndefined();
    expect(res.data?.name).toBe('Max Bcc: evil@attacker.com Other');
    expect(res.data?.name).not.toContain('\r');
    expect(res.data?.name).not.toContain('\n');
  });

  it('rejects email addresses containing newline injection attempts', () => {
    const res = sanitizeContactInput({
      name: 'Max',
      email: 'max@example.com\r\nBcc: evil@attacker.com',
      message: 'Hello',
    });
    expect(res.error).toBe('Bitte geben Sie eine gültige E-Mail-Adresse an.');
  });

  it('enforces maximum character lengths', () => {
    const longName = 'A'.repeat(200);
    const longMessage = 'B'.repeat(6000);
    const res = sanitizeContactInput({
      name: longName,
      email: 'test@example.com',
      message: longMessage,
    });
    expect(res.error).toBeUndefined();
    expect(res.data?.name.length).toBe(100);
    expect(res.data?.message.length).toBe(5000);
  });
});

describe('escapeHtml', () => {
  it('escapes special HTML characters', () => {
    const input = '<script>alert("XSS") & \'test\'</script>';
    const escaped = escapeHtml(input);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;) &amp; &#039;test&#039;&lt;/script&gt;');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });
});
