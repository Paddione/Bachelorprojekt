// Deterministic keyword search over the static helpContent. Used as a
// no-LLM fallback in lib/assistant/llm.ts so the assistant remains useful
// before any model is wired. Returns the best-matching help section for a
// given query + profile, or null if nothing crosses the score floor.

import { helpContent, type HelpContext, type HelpSection } from '../helpContent';

export interface SearchHit {
  sectionKey: string;
  context: HelpContext;
  section: HelpSection;
  score: number;
  matchedTokens: string[];
}

// Common German stopwords + a few English filler tokens that creep into
// mixed-language input. Intentionally conservative — losing a real keyword
// hurts recall more than keeping a stopword.
const STOPWORDS = new Set([
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer',
  'und','oder','aber','als','wenn','weil','dass','damit','denn',
  'ich','du','er','es','wir','ihr','mich','dich','sich','mir','dir','euch','uns',
  'mein','dein','sein','ihr','unser',
  'in','an','auf','zu','mit','für','von','bei','aus','über','unter','vor','nach','seit','um','durch',
  'wie','was','wo','wer','wann','warum','welche','welcher','welches',
  'kann','soll','will','muss','möchte','möchtest','möchten','könnte','sollte',
  'mache','machst','macht','machen','tut','tun','tue',
  'ist','bin','bist','sind','war','waren','sein',
  'haben','habe','hat','hatte','hatten',
  'nicht','kein','keine','keinen','keiner','nichts','niemand',
  'auch','noch','schon','nur','sehr','mehr','weniger','etwa',
  'ja','nein','doch','vielleicht','bitte','danke',
  // English fillers
  'how','what','where','when','can','do','does','is','are','the','a','an',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// Light German stemmer — trims common plural/verb suffixes so "Rechnungen"
// matches "Rechnung", "buchst" matches "buchen". Intentionally minimal.
function stem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/(ungen|innen|chen|lein)$/, '')
    .replace(/(en|er|es|em|ern|st|et|t|n|s)$/, '')
    .replace(/(ie|ei)$/, '');
}

// Build a search index lazily on first call (modules are cached by node).
type IndexEntry = { tokens: Set<string>; titleTokens: Set<string> };
const indexCache = new Map<HelpContext, Map<string, IndexEntry>>();

function buildIndex(context: HelpContext): Map<string, IndexEntry> {
  const cached = indexCache.get(context);
  if (cached) return cached;

  const index = new Map<string, IndexEntry>();
  const sections = helpContent[context];
  for (const [key, section] of Object.entries(sections)) {
    const haystack = [
      section.title,
      section.description,
      ...section.actions,
      ...section.guides.flatMap((g) => [g.title, ...g.steps]),
    ].join(' ');
    const tokens = new Set(tokenize(haystack).map(stem));
    // Section key itself is a strong signal — add it raw.
    tokens.add(key.toLowerCase());
    const titleTokens = new Set(tokenize(section.title).map(stem));
    index.set(key, { tokens, titleTokens });
  }
  indexCache.set(context, index);
  return index;
}

export function searchHelp(query: string, context: HelpContext): SearchHit | null {
  const queryTokens = tokenize(query).map(stem);
  if (queryTokens.length === 0) return null;

  const index = buildIndex(context);
  let best: SearchHit | null = null;

  for (const [sectionKey, entry] of index) {
    let score = 0;
    const matched: string[] = [];
    for (const qt of queryTokens) {
      if (entry.tokens.has(qt)) {
        // Token-match. Boost if the same token also lives in the title.
        score += entry.titleTokens.has(qt) ? 2 : 1;
        matched.push(qt);
        continue;
      }
      // Prefix match for compound words ("rechnung" ↔ "rechnungsstellung")
      let prefixHit = false;
      for (const ht of entry.tokens) {
        if (ht.length >= 4 && qt.length >= 4 && (ht.startsWith(qt) || qt.startsWith(ht))) {
          score += 0.5;
          matched.push(qt);
          prefixHit = true;
          break;
        }
      }
      if (!prefixHit) continue;
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = {
        sectionKey,
        context,
        section: helpContent[context][sectionKey],
        score,
        matchedTokens: matched,
      };
    }
  }

  // Score floor — avoid returning a near-random hit on a one-token vague query.
  return best && best.score >= 1 ? best : null;
}

// Format a hit as a chat message body. Markdown-light so it renders cleanly
// in the existing AssistantMessage component (plain text with line breaks).
export function formatHit(hit: SearchHit): string {
  const { section } = hit;
  const out: string[] = [];
  out.push(`✦ ${section.title}`);
  out.push('');
  out.push(section.description);

  if (section.actions.length > 0) {
    out.push('');
    out.push('Was du hier tun kannst:');
    for (const a of section.actions) out.push(`• ${a}`);
  }

  if (section.guides.length > 0) {
    out.push('');
    for (const g of section.guides) {
      out.push(`${g.title}:`);
      g.steps.forEach((s, i) => out.push(`  ${i + 1}. ${s}`));
    }
  }

  return out.join('\n');
}

// Fallback message when nothing matches — lists the available section titles
// so the user knows what vocabulary the assistant understands.
export function noMatchReply(context: HelpContext): string {
  const titles = Object.values(helpContent[context]).map((s) => s.title);
  const list = titles.join(', ');
  return `Dazu finde ich keinen passenden Hilfe-Abschnitt. Versuch's mit Stichworten aus diesen Bereichen: ${list}.`;
}
