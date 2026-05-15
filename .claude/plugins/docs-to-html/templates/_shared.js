(function () {
  'use strict';

  // ---- Theme ----
  var THEME_KEY = 'docs-html-theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) btn.textContent = (t === 'dark' ? 'Light' : 'Dark') + ' theme';
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var sys = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    applyTheme(saved || sys);
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
      });
    }
  }

  // ---- Heading anchors ----
  function initAnchors() {
    var heads = document.querySelectorAll('.content h1[id], .content h2[id], .content h3[id], .content h4[id]');
    heads.forEach(function (h) {
      var btn = document.createElement('button');
      btn.className = 'heading-anchor';
      btn.setAttribute('aria-label', 'Copy link to ' + h.textContent);
      btn.textContent = '#';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var url = location.origin + location.pathname + '#' + h.id;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { showToast('Link copied'); });
        } else {
          // Fallback
          var ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); showToast('Link copied'); } catch (e) {}
          document.body.removeChild(ta);
        }
        history.replaceState(null, '', '#' + h.id);
      });
      h.appendChild(btn);
    });
  }

  // ---- Toast ----
  var toastTimer = null;
  function showToast(msg) {
    var t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('visible'); }, 1600);
  }

  // ---- Search ----
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function tokenize(q) {
    return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  var lastQuery = '';
  function runSearch(q) {
    lastQuery = q;
    var idx = window.__DOCS_INDEX__ || [];
    var sections = document.querySelectorAll('[data-section-id]');
    sections.forEach(function (s) { s.removeAttribute('data-hidden-search'); });
    clearMarks();
    if (!q || !q.trim()) {
      updateVisibility();
      return;
    }
    var tokens = tokenize(q);
    var matchIds = new Set();
    idx.forEach(function (entry) {
      var hay = (entry.heading + ' ' + entry.body + ' ' + (entry.tags || []).join(' ')).toLowerCase();
      var hit = tokens.every(function (tok) { return hay.indexOf(tok) !== -1; });
      if (hit) matchIds.add(entry.id);
    });
    sections.forEach(function (s) {
      if (!matchIds.has(s.getAttribute('data-section-id'))) s.setAttribute('data-hidden-search', 'true');
    });
    updateVisibility();
    highlightTokens(tokens);
  }

  function clearMarks() {
    document.querySelectorAll('mark.hit').forEach(function (m) {
      var t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
  }

  function highlightTokens(tokens) {
    if (!tokens.length) return;
    var re = new RegExp('(' + tokens.map(escapeReg).join('|') + ')', 'gi');
    var sections = document.querySelectorAll('[data-section-id]:not([data-hidden-search]):not([data-hidden-tag])');
    sections.forEach(function (s) { walkAndHighlight(s, re); });
  }

  function walkAndHighlight(node, re) {
    if (node.nodeType === 3) {
      if (!re.test(node.nodeValue)) return;
      re.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var last = 0;
      var v = node.nodeValue;
      var m;
      while ((m = re.exec(v)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
        var mk = document.createElement('mark');
        mk.className = 'hit';
        mk.textContent = m[0];
        frag.appendChild(mk);
        last = m.index + m[0].length;
      }
      if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeType === 1 && node.childNodes && !/^(script|style|mark|button)$/i.test(node.nodeName)) {
      for (var i = node.childNodes.length - 1; i >= 0; i--) walkAndHighlight(node.childNodes[i], re);
    }
  }

  // ---- Tag filter ----
  var activeTags = new Set();
  function initTags() {
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var t = chip.getAttribute('data-tag');
        if (activeTags.has(t)) { activeTags.delete(t); chip.setAttribute('aria-pressed', 'false'); }
        else { activeTags.add(t); chip.setAttribute('aria-pressed', 'true'); }
        applyTagFilter();
      });
    });
  }
  function applyTagFilter() {
    document.querySelectorAll('[data-section-id]').forEach(function (s) {
      s.removeAttribute('data-hidden-tag');
    });
    if (activeTags.size === 0) { updateVisibility(); return; }
    document.querySelectorAll('[data-section-id]').forEach(function (s) {
      var tagsAttr = s.getAttribute('data-tags') || '';
      var tags = tagsAttr.split(' ').filter(Boolean);
      var ok = false;
      for (var t of activeTags) { if (tags.indexOf(t) !== -1) { ok = true; break; } }
      if (!ok) s.setAttribute('data-hidden-tag', 'true');
    });
    updateVisibility();
  }

  function updateVisibility() {
    document.querySelectorAll('[data-section-id]').forEach(function (s) {
      var hidden = s.hasAttribute('data-hidden-search') || s.hasAttribute('data-hidden-tag');
      if (hidden) s.setAttribute('data-hidden', 'true');
      else s.removeAttribute('data-hidden');
    });
  }

  // ---- Sidebar / file-nav ----
  function initFileNav() {
    document.querySelectorAll('[data-file-link]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var sel = a.getAttribute('data-file-link');
        var t = document.getElementById(sel);
        if (!t) return;
        e.preventDefault();
        t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + sel);
        // Layout-specific: grid template uses this to switch panes
        document.body.setAttribute('data-grid-active', 'true');
      });
    });
    var back = document.querySelector('[data-grid-back]');
    if (back) {
      back.addEventListener('click', function () {
        document.body.removeAttribute('data-grid-active');
        window.scrollTo({ top: 0 });
      });
    }
  }

  // ---- Search input ----
  function initSearch() {
    var input = document.querySelector('.search-input');
    if (!input) return;
    var debounce;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { runSearch(input.value); }, 80);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        runSearch('');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initAnchors();
    initTags();
    initSearch();
    initFileNav();
  });
})();
