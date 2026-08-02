// action-policy.js — Bestaetigungs-Abstufung und Aktion-Zustaende (K4, T002463)
//
// Eigene DOM-freie Datei, damit die Abstufung in einem node-Testlauf messbar ist
// (die Tests in tests/unit/cockpit-action-policy.test.ts fuehren diese Quelle
// direkt aus). Klassisches Skript, kein ES-Modul — die Kit-Huellen laden
// Kit-Dateien per <script src>.
//
// SSOT der Abstuftungs-Regeln D4/D5/D6. panel.js konsumiert ausschliesslich
// window.actionPolicy, es dupliziert keine der Regeln.

(function () {
  'use strict';

  // D4: die vier Zustaende einer Aktion.
  const ACTION_STATES = ['available', 'locked', 'confirming', 'running'];

  // D5: Einordnung einer Aktion nach Umkehrbarkeit.
  // Unbekannte Aktionen gelten als NICHT umkehrbar — die sichere Richtung.
  function classify(action) {
    if (['refresh', 'reconcile', 'tick', 'enqueue'].includes(action)) return 'repeatable';
    if (['ticket_status', 'panel_close'].includes(action)) return 'reversible';
    return 'irreversible';
  }

  // D5: Bestaetigungs-Abstufung.
  // - repeatable    → keine Rueckfrage (null)
  // - reversible    → einfache Bestaetigen/Abbrechen-Rueckfrage
  // - irreversible  → Rueckfrage, die das konkrete Ziel nennt (D5)
  function confirmationFor(action, target) {
    const kind = classify(action);
    if (kind === 'repeatable') return null;
    if (kind === 'reversible') return { level: 'simple' };
    // Irreversible Aktionen muessen ihr Ziel nennen koennen. Kann die Rueckfrage
    // das Ziel nicht nennen, erfuellt sie D5 nicht — hart scheitern.
    if (!target) throw new Error(`confirmationFor: irreversible action '${action}' needs a target`);
    return { level: 'named', target };
  }

  // D6: Mobile-Sperre. Nicht umkehrbare Aktionen werden auf kleiner
  // Darstellung gesperrt, bis sie in dieser Sitzung bewusst freigeschaltet
  // wurden. Wiederholbare Aktionen werden nie gesperrt.
  function mobileLock(action, { viewport, unlockedThisSession }) {
    if (classify(action) === 'repeatable') return false;
    const isMobileOrFullscreen = viewport === 'mobile' || viewport === 'fullscreen';
    return isMobileOrFullscreen && !unlockedThisSession;
  }

  window.actionPolicy = {
    ACTION_STATES,
    classify,
    confirmationFor,
    mobileLock,
  };
})();
