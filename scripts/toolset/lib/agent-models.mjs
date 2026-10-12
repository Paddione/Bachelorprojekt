// scripts/toolset/lib/agent-models.mjs — forbidden-provider-Guard für .opencode/agent-models.jsonc (T900792).
// Reine Funktionen, kein I/O. check.mjs ruft checkAgentModels mit dem Dateitext auf.
//
// Die Harness-Prüfung (validateHarnesses) sieht nur den Registry-Wert `harnesses.opencode.provider`;
// die tatsächlichen Modell-Bindungen stehen in agent-models.jsonc. Ohne diesen Guard könnte ein
// verbotener Anbieter (z. B. deepseek, T900751) als Provider oder Agenten-Modell zurückkehren,
// während der Registry-Wert sauber bleibt.
//
// Match-Semantik (fail-closed): case-insensitiver Substring des verbotenen Namens im geprüften
// Wert — trifft `deepseek`, `deepseek-v4-flash` und `opencode-go/deepseek-v4-flash` gleichermaßen.
// Kommentare zählen NICHT: die Datei wird als JSONC geparst (Kommentare + Trailing-Commas
// werden außerhalb von Strings entfernt) und nur die Struktur geprüft — ein Historien-Kommentar,
// der einen verbotenen Namen nennt, bleibt grün.

// Entfernt //- und /* */-Kommentare sowie Trailing-Commas (`,}` / `,]`) außerhalb von
// Strings. Strings werden byte-identisch übernommen (inkl. Escapes); ersetzte Zeichen werden
// zu Spaces, Zeilenumbrüche bleiben erhalten, damit Fehlerpositionen stimmen.
export function stripJsonc(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    // String: byte-identisch übernehmen.
    if (c === '"') {
      out.push(c);
      i++;
      while (i < n) {
        out.push(text[i]);
        if (text[i] === '\\') {
          i++;
          if (i < n) out.push(text[i]);
        } else if (text[i] === '"') {
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    // Zeilenkommentar: bis zum Newline durch Spaces ersetzen.
    if (c === '/' && next === '/') {
      i += 2;
      while (i < n && text[i] !== '\n') {
        out.push(' ');
        i++;
      }
      continue;
    }
    // Blockkommentar: Inhalt durch Spaces ersetzen, Newlines erhalten.
    if (c === '/' && next === '*') {
      i += 2;
      out.push(' ', ' ');
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        out.push(text[i] === '\n' ? '\n' : ' ');
        i++;
      }
      if (i < n) {
        out.push(' ', ' ');
        i += 2;
      }
      continue;
    }
    // Schließende Klammer: vorangehendes Trailing-Comma (über Whitespace hinweg) droppen.
    if (c === '}' || c === ']') {
      let j = out.length - 1;
      while (j >= 0 && (out[j] === ' ' || out[j] === '\t' || out[j] === '\n' || out[j] === '\r')) j--;
      if (j >= 0 && out[j] === ',') out.splice(j, 1);
    }
    out.push(c);
    i++;
  }
  return out.join('');
}

// Prüft agent-models.jsonc-Text gegen die verbotenen Anbieter.
// @param text Dateiinhalt (JSONC)
// @param forbiddenProviders Array verbotener Anbieter-Namen (aus loadRegistry)
// @returns Array von Fehlermeldungen (leer = gültig)
export function checkAgentModels(text, forbiddenProviders) {
  const errors = [];
  const forbidden = (forbiddenProviders ?? []).filter(f => typeof f === 'string' && f.trim() !== '');
  let data;
  try {
    data = JSON.parse(stripJsonc(text));
  } catch (e) {
    return [`agent-models.jsonc: cannot parse (${e.message})`];
  }
  if (!data || typeof data !== 'object') return errors;
  const hit = value => {
    if (typeof value !== 'string') return null;
    const lower = value.toLowerCase();
    return forbidden.find(f => lower.includes(f.toLowerCase())) ?? null;
  };
  const providers = data.provider;
  if (providers && typeof providers === 'object') {
    for (const [name, cfg] of Object.entries(providers)) {
      const fp = hit(name);
      if (fp) errors.push(`forbidden provider ${fp} in agent-models.jsonc provider '${name}'`);
      const models = cfg?.models;
      if (models && typeof models === 'object') {
        for (const model of Object.keys(models)) {
          const mfp = hit(model);
          if (mfp) errors.push(`forbidden provider ${mfp} in agent-models.jsonc model '${name}/${model}'`);
        }
      }
    }
  }
  const agents = data.agent;
  if (agents && typeof agents === 'object') {
    for (const [name, cfg] of Object.entries(agents)) {
      const fp = hit(cfg?.model);
      if (fp) errors.push(`forbidden provider ${fp} in agent-models.jsonc agent '${name}' model '${cfg.model}'`);
    }
  }
  return errors;
}
