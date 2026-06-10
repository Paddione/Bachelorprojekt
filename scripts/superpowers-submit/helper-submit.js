(function () {
  if (window.__brainstormSubmit) return;
  window.__brainstormSubmit = true;

  // Local-owner-only gate: render ONLY on the loopback http board. The public
  // funnel page is https://<magicdns> -> button never appears; a fetch from
  // https -> http://localhost would be mixed-content-blocked anyway.
  var isLocal = location.protocol === 'http:' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  var submitPort = window.__BRAINSTORM_SUBMIT_PORT;
  if (!isLocal || !submitPort) return;

  function gatherSelection() {
    var selected = [];
    document.querySelectorAll('.options .selected, .cards .selected').forEach(function (el) {
      var h3 = el.querySelector('h3');
      var label = (h3 ? h3.textContent : el.textContent) || '';
      selected.push({ choice: el.dataset.choice || null, label: label.trim().slice(0, 200) });
    });
    var fields = {};
    document.querySelectorAll('input, textarea, select').forEach(function (f) {
      var key = f.name || f.id;
      if (!key) return;
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.checked) fields[key] = f.value || true; }
      else if (f.value) fields[key] = f.value;
    });
    var q = document.querySelector('h2') || document.querySelector('h1');
    var question = (q ? q.textContent : document.title || '').trim();
    return { question: question, selected: selected, fields: fields };
  }

  function renderMarkdown(sel) {
    var lines = ['«BRAINSTORM-AUSWAHL»'];
    if (sel.question) lines.push('Frage: ' + sel.question);
    sel.selected.forEach(function (s) {
      lines.push('- Auswahl: ' + (s.choice ? s.choice + ' — ' : '') + '"' + s.label + '"');
    });
    Object.keys(sel.fields).forEach(function (k) {
      lines.push('- Feld[' + k + ']: ' + sel.fields[k]);
    });
    lines.push('«ENDE»');
    return lines.join('\n');
  }

  function makeButton() {
    if (document.getElementById('bs-submit') || !document.body) return;
    var note = document.createElement('div');
    note.id = 'bs-submit-note';
    note.style.cssText = 'position:fixed;left:12px;bottom:52px;z-index:99999;' +
      'font:12px system-ui,sans-serif;background:rgba(0,0,0,.7);padding:4px 8px;' +
      'border-radius:6px;display:none';
    function feedback(msg, ok) {
      note.textContent = msg;
      note.style.color = ok ? '#34c759' : '#ff9f0a';
      note.style.display = 'block';
    }
    var btn = document.createElement('button');
    btn.id = 'bs-submit';
    btn.type = 'button';
    btn.textContent = '✓ Auswahl ans Terminal';
    btn.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;' +
      'background:#0a84ff;color:#fff;border:0;border-radius:10px;padding:10px 16px;' +
      'font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    btn.addEventListener('click', function () {
      var sel = gatherSelection();
      if (!sel.selected.length && !Object.keys(sel.fields).length) {
        feedback('Nichts ausgewählt', false);
        return;
      }
      var markdown = renderMarkdown(sel);
      var nonce = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6);
      btn.disabled = true;
      setTimeout(function () { btn.disabled = false; }, 1500);
      fetch('http://localhost:' + submitPort + '/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: sel.question, selected: sel.selected, fields: sel.fields,
          markdown: markdown, nonce: nonce, screen: location.pathname
        })
      }).then(function (r) {
        feedback(r.ok ? '✓ kopiert — jetzt Strg+V im Terminal' : 'Fehler beim Senden', r.ok);
      }).catch(function () {
        feedback('nur lokal verfügbar', false);
      });
    });
    document.body.appendChild(note);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', makeButton);
  } else {
    makeButton();
  }

  window.brainstorm = Object.assign(window.brainstorm || {}, {
    submit: function () { var b = document.getElementById('bs-submit'); if (b) b.click(); }
  });
})();
