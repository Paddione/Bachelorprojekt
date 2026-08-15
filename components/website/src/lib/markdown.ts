// Leichtgewichtiger Markdown-Subset-Renderer für die Ticket-UI.
//
// Bewusst KEIN npm-Dependency und KEIN WYSIWYG: Beschreibungen/Kommentare bleiben
// Plaintext-Markdown in der DB, damit Gekko und die Software-Factory den Rohinhalt
// direkt lesen können. Dieses Modul rendert diesen Plaintext sicher zu HTML.
//
// Sicherheit by construction: ALLER text-stammende Inhalt wird ZUERST escaped
// (`escapeHtml`), DANACH werden ausschließlich bekannte, sichere Tags erzeugt.
// Link-URLs werden auf ein Schema-Whitelist (`http:`/`https:`/`mailto:`/relativ)
// geprüft — alles andere (z. B. `javascript:`, `data:`) fällt auf reinen Text
// zurück. Damit ist der `{@html}`/`set:html`-Output an den Anzeigestellen sicher.
//
// S2-rein: importiert nichts aus Komponenten — keine Zyklen. Vitest deckt das
// Verhalten in `markdown.test.ts` ab (inkl. XSS-Fälle).

const CODE_TOKEN = '\u0000';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Liefert die URL zurück, wenn ihr Schema erlaubt ist, sonst null. */
function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (u.startsWith('/') || u.startsWith('#')) return u;
  return null;
}

/** Inline-Formatierung auf einer (bereits NICHT escapeten) Roh-Textzeile. */
function inline(raw: string): string {
  let s = escapeHtml(raw);

  // Code-Spans zuerst aus dem Spiel nehmen, damit darin kein Bold/Italic/Link greift.
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `${CODE_TOKEN}${codes.length - 1}${CODE_TOKEN}`;
  });

  // Links [label](url) — URL whitelisten, externe härten.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return label;
    const external = /^https?:/i.test(safe);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${safe}"${attrs}>${label}</a>`;
  });

  // Bold vor Italic, damit `**` nicht von der Italic-Regel zerlegt wird.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // Code-Spans zurückspielen.
  s = s.replace(new RegExp(`${CODE_TOKEN}(\\d+)${CODE_TOKEN}`, 'g'), (_m, i: string) => codes[Number(i)]);
  return s;
}

/**
 * Rendert einen Markdown-Subset (Überschriften, Listen, nummerierte Listen,
 * Blockquotes, Code-Blöcke, Bold/Italic/Code/Links) zu sicherem HTML.
 * Gibt '' zurück für leere/whitespace-Eingaben oder Nicht-Strings.
 */
export function renderMarkdown(src: string): string {
  if (typeof src !== 'string') return '';
  const text = src.replace(/\r\n?/g, '\n');
  if (!text.trim()) return '';

  const lines = text.split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code-Block (fenced) ```…```
    if (/^```/.test(line.trim())) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++; // schließenden Zaun überspringen
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Überschrift (# → h3, damit kein konkurrierendes h1/h2 entsteht)
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const level = Math.min(h[1].length + 2, 6);
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (zusammenhängende > Zeilen)
    if (/^>\s?/.test(line)) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    // Nummerierte Liste
    if (/^\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    // Ungeordnete Liste
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    // Leerzeile beendet einen Absatz
    if (!line.trim()) { flushPara(); i++; continue; }

    // sonst: Absatz akkumulieren
    para.push(line);
    i++;
  }

  flushPara();
  return out.join('\n');
}
