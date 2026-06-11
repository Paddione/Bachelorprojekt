// brett/src/client/ui/topbar-filter.ts — T000607: Figuren-Filter
// Pure helpers are node-testable (no top-level DOM access).
// DOM lives exclusively inside mountFilterInput().

// ── Module-level filter state ────────────────────────────────────────────────

let _filterQuery = '';

/** Returns the current filter query (lowercased, trimmed). */
export function getFilterQuery(): string {
  return _filterQuery;
}

/** Set programmatically (also used by tests). */
export function setFilterQuery(q: string): void {
  _filterQuery = q.trim().toLowerCase();
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if `label` contains `query` as a case-insensitive substring,
 * or if `query` is empty (no filter active).
 */
export function matchesFigureFilter(label: string | null | undefined, query: string): boolean {
  if (!query) return true;
  const norm = (label ?? '').toLowerCase();
  return norm.includes(query.toLowerCase());
}

// ── DOM mount ────────────────────────────────────────────────────────────────

const FILTER_STYLE_ID = 'brett-topbar-filter';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(FILTER_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = FILTER_STYLE_ID;
  el.textContent = [
    '.brett-filter-wrap{position:relative;display:inline-flex;align-items:center;}',
    '.brett-filter-input{font-family:var(--brett-font-sans,sans-serif);font-size:12px;',
    'background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:5px 24px 5px 8px;',
    'width:140px;outline:none;}',
    '.brett-filter-input:focus{border-color:var(--brett-brass,#c8a96e);}',
    '.brett-filter-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);',
    'background:none;border:none;color:var(--brett-mute,#8a93a3);cursor:pointer;',
    'font-size:13px;line-height:1;padding:0;display:none;}',
    '.brett-filter-clear.visible{display:block;}',
  ].join('');
  doc.head.appendChild(el);
}

export interface FilterMountOptions {
  /** Called whenever the query changes. Receives trimmed lowercase string. */
  onChange: (query: string) => void;
}

/**
 * Mount the filter input into `anchorEl`.
 * Returns `{ destroy }` for cleanup.
 */
export function mountFilterInput(
  anchorEl: HTMLElement,
  opts: FilterMountOptions,
): { destroy: () => void } {
  injectStyles();

  const wrap = document.createElement('div');
  wrap.className = 'brett-filter-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'brett-filter-input';
  input.placeholder = 'Figur suchen …';
  input.maxLength = 40;
  input.setAttribute('aria-label', 'Figur nach Name filtern');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'brett-filter-clear';
  clearBtn.textContent = '×';
  clearBtn.setAttribute('aria-label', 'Filter löschen');

  wrap.appendChild(input);
  wrap.appendChild(clearBtn);
  anchorEl.appendChild(wrap);

  function applyQuery(q: string): void {
    setFilterQuery(q);
    opts.onChange(_filterQuery);
    clearBtn.classList.toggle('visible', _filterQuery.length > 0);
  }

  function onInput(): void {
    applyQuery(input.value);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      input.value = '';
      applyQuery('');
      input.blur();
    }
  }

  function onClear(): void {
    input.value = '';
    applyQuery('');
    input.focus();
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  clearBtn.addEventListener('click', onClear);

  return {
    destroy() {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      clearBtn.removeEventListener('click', onClear);
      wrap.remove();
    },
  };
}

// ── Filter Visuals (T000607) ─────────────────────────────────────────────────
// Lives here (not mannequin.ts) to keep mannequin.ts under the 600-line gate.

const FILTER_DIM_OPACITY = 0.15;

/**
 * Per-frame visual updater. Dims non-matching figures to 0.15 opacity.
 * Called from the board-boot tick loop after updateModerationVisuals.
 */
export function updateFilterVisuals(figures: any[], query: string): void {
  const hasFilter = query.length > 0;

  for (const fig of figures) {
    const matches = !hasFilter || (fig.label ?? '').toLowerCase().includes(query.toLowerCase());

    fig.root.traverse((o: any) => {
      if (!o.isMesh || !o.material) return;
      if (o === fig.ring || o === fig.possessionRing) return;
      if (o.userData?.isContact) return;

      if (!hasFilter) {
        if (o.material._filterDimmed) {
          o.material.opacity = o.material._filterOriginalOpacity ?? 1.0;
          o.material.transparent = o.material._filterOriginalTransparent ?? false;
          o.material._filterDimmed = false;
          o.material.needsUpdate = true;
        }
      } else if (!matches) {
        if (!o.material._filterDimmed) {
          o.material._filterOriginalOpacity = o.material.opacity;
          o.material._filterOriginalTransparent = o.material.transparent;
          o.material._filterDimmed = true;
        }
        o.material.opacity = FILTER_DIM_OPACITY;
        o.material.transparent = true;
        o.material.needsUpdate = true;
      } else {
        if (o.material._filterDimmed) {
          o.material.opacity = o.material._filterOriginalOpacity ?? 1.0;
          o.material.transparent = o.material._filterOriginalTransparent ?? false;
          o.material._filterDimmed = false;
          o.material.needsUpdate = true;
        }
      }
    });
  }
}
