(function () {
  if (window.__planReviewInit) return;
  window.__planReviewInit = true;

  var isLocal = location.protocol === 'http:' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  var submitPort = window.__BRAINSTORM_SUBMIT_PORT;
  if (!isLocal || !submitPort) return;

  var annotations = [];
  var selFrom = null, selTo = null;
  var root = document.getElementById('plan-review-root');

  function updateSelection() {
    var sel = window.getSelection();
    selFrom = null; selTo = null;
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var start = range.startContainer;
    var end = range.endContainer;
    while (start && start !== root) {
      if (start.dataset && start.dataset.line) { selFrom = Number(start.dataset.line); break; }
      start = start.parentElement || start.parentNode;
    }
    while (end && end !== root) {
      if (end.dataset && end.dataset.line) { selTo = Number(end.dataset.line); break; }
      end = end.parentElement || end.parentNode;
    }
    if (selFrom && selTo && selFrom > selTo) { var t = selFrom; selFrom = selTo; selTo = t; }
    root.querySelectorAll('.ln.selected').forEach(function (el) { el.classList.remove('selected'); });
    if (selFrom) {
      root.querySelectorAll('.ln').forEach(function (el) {
        var n = Number(el.dataset.line);
        if (n >= selFrom && n <= selTo) el.classList.add('selected');
      });
    }
  }
  document.addEventListener('mouseup', updateSelection);
  document.addEventListener('keyup', updateSelection);

  var sidebar = document.createElement('div');
  sidebar.id = 'pr-sidebar';
  sidebar.innerHTML =
    '<div id="pr-sidebar-header"><strong>Annotationen</strong></div>' +
    '<div id="pr-sidebar-list"></div>' +
    '<div id="pr-sidebar-tools">' +
    '  <div class="pr-btn-grp">' +
    '    <button class="pr-btn" data-op="strike">Durchstreichen</button>' +
    '    <button class="pr-btn" data-op="replace">Ersetzen</button>' +
    '    <button class="pr-btn" data-op="insert">Einfügen</button>' +
    '    <button class="pr-btn" data-op="comment">Kommentar</button>' +
    '  </div>' +
    '  <div id="pr-input-area" style="display:none;margin-top:6px">' +
    '    <textarea id="pr-input-text" placeholder="Text …" rows="2"></textarea>' +
    '    <div id="pr-insert-pos" style="display:none;margin-top:4px">' +
    '      <label><input type="radio" name="pr-insert-where" value="before" checked> vor</label>' +
    '      <label><input type="radio" name="pr-insert-where" value="after"> nach</label>' +
    '    </div>' +
    '    <div style="margin-top:4px">' +
    '      <input id="pr-reason" placeholder="Grund (optional)" style="width:100%">' +
    '    </div>' +
    '    <button class="pr-btn pr-btn-primary" id="pr-add-anno" style="margin-top:4px">+ Hinzufügen</button>' +
    '  </div>' +
    '</div>' +
    '<div id="pr-sidebar-footer">' +
    '  <button class="pr-btn pr-btn-approve" id="pr-approve">✓ Approve</button>' +
    '  <button class="pr-btn pr-btn-revision" id="pr-revision">↺ Änderungen anfordern</button>' +
    '</div>' +
    '<div id="pr-feedback" style="display:none;margin-top:6px;font-size:12px"></div>';

  var style = document.createElement('style');
  style.textContent =
    '#pr-sidebar{position:fixed;top:0;right:0;width:320px;height:100vh;background:#16162a;' +
    'border-left:1px solid #333;z-index:99998;display:flex;flex-direction:column;' +
    'font:13px/1.5 system-ui,sans-serif;color:#ccc;overflow-y:auto}' +
    '#pr-sidebar-header{padding:10px;border-bottom:1px solid #333;background:#1e1e36}' +
    '#pr-sidebar-list{flex:1;overflow-y:auto;padding:8px}' +
    '.pr-anno-item{padding:6px 8px;margin-bottom:4px;background:#22223a;border-radius:6px;font-size:12px}' +
    '.pr-anno-item .pr-anno-remove{float:right;cursor:pointer;color:#ff6b6b;font-weight:bold}' +
    '.pr-anno-item .pr-anno-op{font-weight:600;color:#4a90e2}' +
    '.pr-anno-item .pr-anno-reason{color:#888;font-style:italic}' +
    '#pr-sidebar-tools{padding:10px;border-top:1px solid #333;background:#1e1e36}' +
    '.pr-btn-grp{display:flex;gap:4px;flex-wrap:wrap}' +
    '.pr-btn{padding:6px 10px;border:1px solid #444;border-radius:6px;background:#2a2a42;' +
    'color:#ccc;cursor:pointer;font:12px system-ui,sans-serif}' +
    '.pr-btn:hover{background:#3a3a52}' +
    '.pr-btn-primary{background:#4a90e2;color:#fff;border-color:#4a90e2}' +
    '.pr-btn-approve{background:#34c759;color:#fff;border-color:#34c759;flex:1}' +
    '.pr-btn-revision{background:#ff9f0a;color:#fff;border-color:#ff9f0a;flex:1}' +
    '#pr-sidebar-footer{display:flex;gap:6px;padding:10px;border-top:1px solid #333}' +
    '#pr-input-text{width:100%;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;' +
    'border-radius:4px;padding:6px;font:13px system-ui,sans-serif}';

  document.head.appendChild(style);
  document.body.appendChild(sidebar);

  var activeOp = null;
  var sidebarList = document.getElementById('pr-sidebar-list');
  var inputArea = document.getElementById('pr-input-area');
  var inputText = document.getElementById('pr-input-text');
  var insertPos = document.getElementById('pr-insert-pos');
  var reasonInput = document.getElementById('pr-reason');
  var addBtn = document.getElementById('pr-add-anno');
  var feedback = document.getElementById('pr-feedback');

  function showFeedback(msg, ok) {
    feedback.textContent = msg;
    feedback.style.color = ok ? '#34c759' : '#ff9f0a';
    feedback.style.display = 'block';
    setTimeout(function () { feedback.style.display = 'none'; }, 3000);
  }

  document.querySelectorAll('#pr-sidebar-tools .pr-btn[data-op]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeOp = this.dataset.op;
      inputArea.style.display = 'block';
      inputText.value = '';
      reasonInput.value = '';
      insertPos.style.display = activeOp === 'insert' ? 'block' : 'none';
      if (activeOp === 'replace' || activeOp === 'comment') {
        inputText.placeholder = activeOp === 'replace' ? 'Ersatztext …' : 'Kommentar …';
      } else {
        inputText.placeholder = 'Text …';
      }
      addBtn.textContent = '+ ' + activeOp;
    });
  });

  addBtn.addEventListener('click', function () {
    if (!selFrom || !selTo) { showFeedback('Bereich markieren', false); return; }
    if (!activeOp) { showFeedback('Operation wählen', false); return; }
    var text = inputText.value.trim() || null;
    var reason = reasonInput.value.trim() || null;
    var position = null;
    if (activeOp === 'insert') {
      position = document.querySelector('input[name="pr-insert-where"]:checked');
      position = position ? position.value : 'before';
    }
    var anno = {
      op: activeOp, fromLine: selFrom, toLine: selTo,
      text: text, reason: reason
    };
    if (activeOp === 'insert') anno.position = position;
    annotations.push(anno);
    renderAnnotations();
    showFeedback('Annotation hinzugefügt', true);
    inputArea.style.display = 'none';
    activeOp = null;
  });

  function renderAnnotations() {
    sidebarList.innerHTML = '';
    annotations.forEach(function (a, i) {
      var div = document.createElement('div');
      div.className = 'pr-anno-item';
      var remove = document.createElement('span');
      remove.className = 'pr-anno-remove';
      remove.textContent = '✕';
      remove.addEventListener('click', function () { annotations.splice(i, 1); renderAnnotations(); });
      div.appendChild(remove);
      var opSpan = document.createElement('span');
      opSpan.className = 'pr-anno-op';
      opSpan.textContent = a.op === 'strike' ? 'Durchstreichen' :
        a.op === 'replace' ? 'Ersetzen' :
        a.op === 'insert' ? 'Einfügen (' + (a.position || 'before') + ')' :
        a.op === 'comment' ? 'Kommentar' : a.op;
      div.appendChild(opSpan);
      var detail = document.createElement('div');
      detail.textContent = 'Z. ' + a.fromLine + '–' + a.toLine;
      if (a.text) detail.textContent += ': ' + (a.text.length > 60 ? a.text.slice(0, 60) + '…' : a.text);
      div.appendChild(detail);
      if (a.reason) {
        var r = document.createElement('div');
        r.className = 'pr-anno-reason';
        r.textContent = 'Grund: ' + a.reason;
        div.appendChild(r);
      }
      sidebarList.appendChild(div);
    });
  }

  function buildMarkdown(verdict) {
    var lines = ['«PLAN-REVIEW»'];
    if (verdict) lines.push('Verdict: ' + verdict);
    lines.push('Annotationen: ' + annotations.length);
    annotations.forEach(function (a) {
      var l = '- ' + a.op + ' Z.' + a.fromLine + '-' + a.toLine;
      if (a.text) l += ': "' + a.text.replace(/"/g, '\\"') + '"';
      if (a.reason) l += ' (' + a.reason + ')';
      if (a.position) l += ' [' + a.position + ']';
      lines.push(l);
    });
    lines.push('«ENDE»');
    return lines.join('\n');
  }

  function submitVerdict(verdict) {
    var nonce = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6);
    var markdown = buildMarkdown(verdict);
    var planName = document.title;
    fetch('http://localhost:' + submitPort + '/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'plan-review',
        plan: planName,
        verdict: verdict,
        annotations: annotations,
        markdown: markdown,
        nonce: nonce,
        screen: location.pathname
      })
    }).then(function (r) {
      if (r.ok) {
        showFeedback('✓ ' + (verdict === 'approve' ? 'Approve' : 'Änderungen angefordert') +
          ' — Strg+V im Terminal', true);
      } else {
        showFeedback('Fehler beim Senden', false);
      }
    }).catch(function () {
      showFeedback('nur lokal verfügbar', false);
    });
  }

  document.getElementById('pr-approve').addEventListener('click', function () {
    submitVerdict('approve');
  });
  document.getElementById('pr-revision').addEventListener('click', function () {
    submitVerdict('request-changes');
  });
})();
