/* Datamodel × Workflow — page interactivity.
 * Scope: hover-highlight, cell click → drilldown, filter buttons, Ctrl+K.
 * Namespaced under window.dm to avoid colliding with docs frame JS.
 */
(function () {
  const dm = window.dm = window.dm || {};

  // ── Hover-highlight: step ↔ domain ─────────────────────────────────────
  document.querySelectorAll('[data-step]').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      const id = el.getAttribute('data-step');
      document.querySelectorAll('[data-step="' + id + '"], [data-step-card="' + id + '"]')
        .forEach(function (n) { n.classList.add('is-highlight'); });
      document.querySelectorAll('[data-from="' + id + '"]').forEach(function (line) {
        line.classList.add('is-highlight');
        const dom = line.getAttribute('data-to');
        document.querySelectorAll('[data-domain="' + dom + '"]').forEach(function (n) {
          n.classList.add('is-highlight');
        });
      });
    });
    el.addEventListener('mouseleave', function () {
      document.querySelectorAll('.is-highlight').forEach(function (n) {
        n.classList.remove('is-highlight');
      });
    });
  });

  // ── Matrix cell click → drilldown ──────────────────────────────────────
  dm.cellClick = function (td) {
    const step = td.getAttribute('data-step');
    const domain = td.getAttribute('data-domain');
    const kind = td.classList.contains('cell-w') ? 'writes' :
                 td.classList.contains('cell-r') ? 'reads' :
                 td.classList.contains('cell-g') ? 'gap' : 'partial';
    const stepCard = document.querySelector('[data-step-card="' + step + '"]');
    const summary = stepCard ? stepCard.innerHTML : '<i>No card for ' + step + '</i>';
    const dd = document.querySelector('.cell-drilldown');
    if (!dd) return;
    dd.innerHTML = '<h4>' + step + ' × ' + domain + ' (' + kind + ')</h4>' + summary;
    dd.classList.remove('is-empty');
    dd.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  };

  // ── Filter buttons ─────────────────────────────────────────────────────
  dm.filter = function (mode) {
    document.body.classList.remove('filter-gaps', 'filter-writes', 'filter-reads');
    if (mode) document.body.classList.add('filter-' + mode);
  };

  // ── Ctrl+K search ──────────────────────────────────────────────────────
  const idx = [];
  document.querySelectorAll('[data-step], [data-domain], [data-step-card]')
    .forEach(function (el) {
      const kind = el.getAttribute('data-step') ? 'step' :
                   el.getAttribute('data-step-card') ? 'step' : 'domain';
      const id = el.getAttribute('data-step') || el.getAttribute('data-step-card') ||
                 el.getAttribute('data-domain');
      const label = el.textContent.trim().slice(0, 60);
      if (id && !idx.find(function (e) { return e.id === id; })) {
        idx.push({id: id, kind: kind, label: label, el: el});
      }
    });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const term = prompt('Jump to step / domain / table:');
      if (!term) return;
      const hit = idx.find(function (e) {
        return e.id.indexOf(term) >= 0 || e.label.indexOf(term) >= 0;
      });
      if (hit) hit.el.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  });
})();
