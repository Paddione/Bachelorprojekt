/* eslint-disable */
// Mentolder Coaching Studio — Daten, Platzhalter & geteilte Bausteine.
// Alle Inhalte sind neutrale Platzhalter (Lorem-Art). Struktur ist echt.

// React-Hooks einmal global bereitstellen (jedes Babel-Script hat eigenen Scope).
const { useState, useRef, useEffect, useMemo } = React;
Object.assign(window, { useState, useRef, useEffect, useMemo });

// ---------------------------------------------------------------------
// ICONS — kleine Inline-SVGs (stroke, currentColor). Tool-Kontext.
// ---------------------------------------------------------------------
const Icon = {
  search:  (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  plus:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  arrow:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  check:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" {...p}><path d="M5 12l5 5L20 6"/></svg>,
  mic:     (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  play:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M7 5l12 7-12 7V5z"/></svg>,
  trash:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>,
  replace: (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M4 9a7 7 0 0 1 12-4l2 2M20 15a7 7 0 0 1-12 4l-2-2M16 3v4h-4M8 21v-4h4"/></svg>,
  reset:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4"/></svg>,
  copy:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>,
  speaker: (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8"/></svg>,
  globe:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18A14 14 0 0 1 12 3z"/></svg>,
  info:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>,
  grip:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/></svg>,
  x:       (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>,
  send:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M4 12l16-7-7 16-2-7-7-2z"/></svg>,
  present: (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>,
  printer: (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M6 9V3h12v6M6 18H4v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5h-2M8 14h8v7H8z"/></svg>,
  split:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>,
  back:    (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M19 12H5M11 5l-7 7 7 7"/></svg>,
  rtl:     (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M21 6H9a4 4 0 0 0 0 8h2M13 4v16M17 4v16M7 18l-3-3 3-3" /></svg>,
  doc:     (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M6 2h8l4 4v16H6zM14 2v4h4M9 13h6M9 17h6"/></svg>,
  pause:   (p)=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M8 5v14M16 5v14"/></svg>,
};

// Brand mark (radial-brass square + carved M) — exact DS pattern
const BrandMark = ({size=30})=>(
  <span className="brand-mark dark" style={{width:size,height:size,borderRadius:size*0.27}} aria-hidden="true"/>
);

// ---------------------------------------------------------------------
// LOREM — neutrale Platzhalter
// ---------------------------------------------------------------------
const LOREM = [
  "Dies ist ein Platzhaltertext. Er zeigt die Struktur und den Rhythmus dieses Bereichs, ohne bereits inhaltliche Aussagen zu treffen.",
  "Der eigentliche Inhalt wird zur Laufzeit erzeugt und an dieser Stelle eingesetzt. Form, Länge und Gewichtung bleiben wie hier angedeutet.",
  "Hier steht eine zweite Platzhalterzeile, die zeigt, wie mehrere Absätze nebeneinander wirken und wie der Textfluss gesetzt ist.",
  "Ein ruhiger, sachlicher Ton trägt die Oberfläche. Kein Inhalt ist final; alles dient der Darstellung der Komponenten.",
];
const lorem = (n=1)=> Array.from({length:n}, (_,i)=> LOREM[i % LOREM.length]);

// ---------------------------------------------------------------------
// 10 EBENEN — Gesprächsverlauf (systemischer Coaching-Bogen)
// ---------------------------------------------------------------------
const LEVELS = [
  { no:"01", name:"Ankommen & Rahmen", goal:"Sicheren Raum schaffen, Rollen und Ablauf klären.",
    prompt:"Du bist ein ruhiger, systemischer Coaching-Assistent. Begrüße die Person wertschätzend in der Sie-Form, kläre kurz den Rahmen des Gesprächs und lade dazu ein, anzukommen. Stelle höchstens eine offene Frage. Antworte knapp, warm und ohne Ratschläge." },
  { no:"02", name:"Anliegen klären", goal:"Das eigentliche Thema in eigenen Worten fassen.",
    prompt:"Hilf der Person, ihr Anliegen in eigenen Worten zu fassen. Spiegle das Gehörte neutral zurück und frage nach, was davon heute am wichtigsten ist. Keine Bewertung, keine Lösung." },
  { no:"03", name:"Ist-Situation", goal:"Die aktuelle Lage konkret und ohne Wertung beschreiben.",
    prompt:"Lade dazu ein, die gegenwärtige Situation konkret zu beschreiben: Was passiert, seit wann, wer ist beteiligt? Frage nach Beispielen statt nach Verallgemeinerungen. Bleibe beschreibend." },
  { no:"04", name:"Ressourcen & Stärken", goal:"Vorhandene Kräfte, Erfahrungen und Stützen sichtbar machen.",
    prompt:"Richte die Aufmerksamkeit auf vorhandene Ressourcen: Erfahrungen, Fähigkeiten, Unterstützung im Umfeld. Würdige Bisheriges und frage, was in ähnlichen Lagen schon einmal getragen hat." },
  { no:"05", name:"Zielbild", goal:"Ein erreichbares, positiv formuliertes Ziel entwerfen.",
    prompt:"Unterstütze dabei, ein konkretes, positiv formuliertes Zielbild zu entwickeln. Frage: Woran würden Sie merken, dass es besser ist? Halte das Ziel erreichbar und in der eigenen Einflusssphäre." },
  { no:"06", name:"Hindernisse & Muster", goal:"Wiederkehrende Muster und innere Hürden erkennen.",
    prompt:"Erkunde behutsam wiederkehrende Muster und Hindernisse. Frage nach dem, was bisher im Weg stand, ohne Schuld zuzuweisen. Benenne mögliche Wechselwirkungen neutral." },
  { no:"07", name:"Perspektivwechsel", goal:"Die Lage aus einer anderen Sicht betrachten.",
    prompt:"Biete einen Perspektivwechsel an: Wie würde eine wohlwollende Außenstehende die Lage sehen? Was würde in fünf Jahren zählen? Eine Frage genügt; lass Raum zum Nachdenken." },
  { no:"08", name:"Optionen & Wege", goal:"Mehrere mögliche nächste Schritte sammeln.",
    prompt:"Sammle gemeinsam mehrere mögliche Wege, ohne sofort zu bewerten. Frage nach drei Optionen, auch ungewöhnlichen. Erst danach: Welche fühlt sich stimmig an?" },
  { no:"09", name:"Vereinbarungen", goal:"Einen konkreten, überprüfbaren nächsten Schritt festhalten.",
    prompt:"Hilf, eine konkrete Vereinbarung zu treffen: ein kleiner, überprüfbarer nächster Schritt bis zum nächsten Termin. Frage nach dem Wann und nach möglichen Stolpersteinen." },
  { no:"10", name:"Abschluss & Transfer", goal:"Erkenntnisse sichern und den Transfer in den Alltag stützen.",
    prompt:"Schließe das Gespräch ruhig ab. Fasse in einem Satz zusammen, was hängen bleibt, und frage, was die Person aus dem Gespräch mitnimmt. Kein neuer Inhalt, nur Sicherung." },
];

// ---------------------------------------------------------------------
// PROFILFRAGEN — dynamisch, im Admin erweiterbar.
// ---------------------------------------------------------------------
const PROFILE_FIELDS = [
  { key:"name",      label:"Name / Kürzel",            value:"M. A. (Platzhalter)",                    type:"text", required:true,  active:true },
  { key:"alter",     label:"Altersgruppe",             value:"50–60",                                  type:"text", required:false, active:true },
  { key:"rolle",     label:"Rolle / Kontext",          value:"Platzhalter-Rolle",                      type:"text", required:false, active:true },
  { key:"sprache",   label:"Bevorzugte Sprache",       value:"Deutsch · Farsi (Übersetzung)",          type:"text", required:false, active:true },
  { key:"anliegen",  label:"Anliegen-Kategorie",       value:"Orientierung (Platzhalter)",             type:"text", required:false, active:true },
  { key:"ziel",      label:"Ziel in eigenen Worten",   value:"Neutraler Platzhaltertext für das Ziel.", type:"textarea", required:false, active:true },
  { key:"ressourcen",label:"Verfügbare Ressourcen",    value:"Platzhalter: Erfahrung, Umfeld, Zeit.",  type:"textarea", required:false, active:false },
  { key:"rahmen",    label:"Rahmenbedingungen",        value:"Online · 60 Min · 14-tägig (Platzhalter)", type:"text", required:false, active:false },
  { key:"sensibel",  label:"Nicht ansprechen",         value:"Platzhalter für sensible Themen.",       type:"textarea", required:false, active:false },
  { key:"stil",      label:"Kommunikationsstil",       value:"Ruhig, direkt, auf Augenhöhe.",          type:"text", required:false, active:true },
];

// ---------------------------------------------------------------------
// KUNDEN — Dashboard / Akte
// ---------------------------------------------------------------------
function mkSessions(){
  return [
    { id:"s1", no:"04", title:"Laufende Begleitung", status:"aktiv",  level:6, updated:"vor 2 Tagen", lang:"Farsi" },
    { id:"s2", no:"03", title:"Standortbestimmung",  status:"pausiert", level:3, updated:"vor 3 Wochen", lang:"Farsi" },
    { id:"s3", no:"02", title:"Erstgespräch · Folge", status:"fertig", level:10, updated:"vor 2 Monaten", lang:"Deutsch" },
    { id:"s4", no:"01", title:"Erstgespräch", status:"fertig", level:10, updated:"vor 3 Monaten", lang:"Deutsch" },
  ];
}
const CUSTOMERS = [];
CUSTOMERS.forEach(k=> k.sessions = mkSessions());

// ---------------------------------------------------------------------
// ÜBERSETZUNGEN — DE-Original parallel zur Zielsprache (Platzhalter)
// ---------------------------------------------------------------------
const SOURCE_DE = "Dies ist ein Platzhaltertext, der die Struktur der Übersetzungsansicht zeigt. Der eigentliche Inhalt wird zur Laufzeit erzeugt und parallel zur deutschen Fassung dargestellt.";
const TARGET_LANGS = [
  { code:"fa", label:"Farsi", rtl:true,  sample:"این یک متن نمونه است که ساختار نمای ترجمه را نشان می‌دهد. محتوای واقعی در زمان اجرا تولید و در کنار نسخهٔ آلمانی نمایش داده می‌شود." },
  { code:"ar", label:"Arabisch", rtl:true, sample:"هذا نص نموذجي يوضح بنية واجهة الترجمة. يتم إنشاء المحتوى الفعلي أثناء التشغيل وعرضه بجانب النسخة الألمانية." },
  { code:"tr", label:"Türkisch", rtl:false, sample:"Bu, çeviri görünümünün yapısını gösteren bir yer tutucu metindir. Asıl içerik çalışma zamanında oluşturulur ve Almanca sürümün yanında gösterilir." },
  { code:"en", label:"EN", rtl:false, sample:"This is placeholder text showing the structure of the translation view. The actual content is generated at runtime and shown next to the German version." },
  { code:"fr", label:"FR", rtl:false, sample:"Ceci est un texte de remplacement montrant la structure de la vue de traduction. Le contenu réel est généré à l'exécution, à côté de la version allemande." },
];

// expose
Object.assign(window, { Icon, BrandMark, lorem, LOREM, LEVELS, PROFILE_FIELDS, CUSTOMERS, SOURCE_DE, TARGET_LANGS });
