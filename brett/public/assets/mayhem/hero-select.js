'use strict';
// buildHeroSelectModal — fullscreen hero picker for Duel mode.
// Follows Brett Design System: ink-800 substrate, brass-game highlights, Geist Mono labels.
// Returns { el, destroy } where el is the overlay DOM element.

const FIGURE_PACK_ROOT = 'assets/figure-pack/';

function buildHeroSelectModal({ heroes, heroOrder, isSpectator = false, pvAiAvailable = false, onSelect, onPvAiToggle }) {
  const el = document.createElement('div');
  el.id = 'hero-select-overlay';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 900;
    background: rgba(11,17,28,0.92);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: 'Geist Mono', monospace;
    backdrop-filter: blur(4px);
  `;

  // ── Heading ──────────────────────────────────────────────────────────────
  const heading = document.createElement('div');
  heading.textContent = 'WÄHLE DEINEN HELDEN';
  heading.style.cssText = `
    font-size: 13px; letter-spacing: 0.18em;
    color: #d7b06a; margin-bottom: 32px; text-transform: uppercase;
  `;
  el.appendChild(heading);

  // ── Status line ──────────────────────────────────────────────────────────
  const status = document.createElement('div');
  status.id = 'hero-select-status';
  status.style.cssText = `font-size: 11px; color: #b9bda3; margin-bottom: 24px;`;
  status.textContent = isSpectator ? 'ZUSCHAUER' : 'Warte auf Gegner …';
  el.appendChild(status);

  // ── Card grid ────────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText = `display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;`;
  el.appendChild(grid);

  const cardEls = {};

  for (const heroId of heroOrder) {
    const h = heroes[heroId];
    const card = document.createElement('div');
    card.dataset.heroId = heroId;
    card.style.cssText = `
      background: #17202e; border: 1px solid rgba(215,176,106,0.18);
      border-radius: 14px; padding: 20px 16px; width: 160px;
      cursor: ${isSpectator || !h.unlocked ? 'not-allowed' : 'pointer'};
      opacity: ${h.unlocked ? '1' : '0.4'};
      transition: border-color 120ms, box-shadow 120ms;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    `;

    // Figure preview (stacked PNGs)
    const figWrap = document.createElement('div');
    figWrap.style.cssText = 'position: relative; width: 64px; height: 96px;';

    function addLayer(src, filter) {
      const img = document.createElement('img');
      img.src = FIGURE_PACK_ROOT + src;
      img.style.cssText = `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;`;
      if (filter) img.style.filter = filter;
      figWrap.appendChild(img);
    }

    addLayer('faces/' + h.figure.face + '.png', null);
    if (h.figure.hair) addLayer('accessories/' + h.figure.hair + '.png', h.figure.hairTint);
    if (h.figure.clothing) addLayer('accessories/' + h.figure.clothing + '.png', null);
    card.appendChild(figWrap);

    // Name
    const name = document.createElement('div');
    name.textContent = h.name;
    name.style.cssText = `font-size: 13px; color: #f0d28c; letter-spacing: 0.1em;`;
    card.appendChild(name);

    // Unlocked status
    if (!h.unlocked) {
      const locked = document.createElement('div');
      locked.textContent = 'Bald verfügbar';
      locked.style.cssText = `font-size: 10px; color: #6f8db8; letter-spacing: 0.06em;`;
      card.appendChild(locked);
    } else {
      // Ability list
      const abilityList = document.createElement('div');
      abilityList.style.cssText = `font-size: 10px; color: #b9bda3; line-height: 1.6; text-align: center;`;
      abilityList.textContent = h.description.split(' · ').slice(1).join(' · ');
      card.appendChild(abilityList);
    }

    // Click handler
    if (!isSpectator && h.unlocked) {
      card.addEventListener('click', () => {
        if (card.dataset.locked === 'true') return;
        onSelect(heroId);
        _markSelected(card);
      });
      card.addEventListener('mouseenter', () => {
        if (card.dataset.locked !== 'true' && !card.dataset.selected) {
          card.style.borderColor = 'rgba(215,176,106,0.5)';
        }
      });
      card.addEventListener('mouseleave', () => {
        if (!card.dataset.selected) card.style.borderColor = 'rgba(215,176,106,0.18)';
      });
    }

    grid.appendChild(card);
    cardEls[heroId] = card;
  }

  function _markSelected(selectedCard) {
    for (const c of Object.values(cardEls)) {
      c.dataset.selected = '';
      c.style.borderColor = 'rgba(215,176,106,0.18)';
      c.style.boxShadow   = '';
    }
    selectedCard.dataset.selected = 'true';
    selectedCard.style.borderColor = '#d7b06a';
    selectedCard.style.boxShadow   = '0 0 0 1px #d7b06a, 0 0 24px rgba(200,169,110,0.25)';
  }

  // ── PvAI toggle (only when 1 player in room) ─────────────────────────────
  if (!isSpectator && pvAiAvailable) {
    const pvAiRow = document.createElement('div');
    pvAiRow.style.cssText = `margin-top: 20px; display: flex; align-items: center; gap: 10px;`;
    const pvAiBtn = document.createElement('button');
    pvAiBtn.textContent = 'Gegen KI spielen';
    pvAiBtn.style.cssText = `
      background: transparent; border: 1px solid rgba(215,176,106,0.35);
      border-radius: 8px; padding: 6px 16px; color: #b9bda3;
      font-family: 'Geist Mono', monospace; font-size: 11px; cursor: pointer;
    `;
    pvAiBtn.addEventListener('click', () => {
      const active = pvAiBtn.dataset.active === 'true';
      pvAiBtn.dataset.active = active ? '' : 'true';
      pvAiBtn.style.color = active ? '#b9bda3' : '#d7b06a';
      pvAiBtn.style.borderColor = active ? 'rgba(215,176,106,0.35)' : '#d7b06a';
      if (onPvAiToggle) onPvAiToggle(!active);
    });
    pvAiRow.appendChild(pvAiBtn);
    el.appendChild(pvAiRow);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  // Lock a card (opponent chose this hero)
  function lockCard(heroId) {
    const c = cardEls[heroId];
    if (!c) return;
    c.dataset.locked  = 'true';
    c.style.opacity   = '0.35';
    c.style.cursor    = 'not-allowed';
  }

  // Show waiting / ready status
  function setStatus(text) {
    status.textContent = text;
  }

  // Show "Spielen ›" button
  function showPlayButton(onClick) {
    const btn = document.createElement('button');
    btn.textContent = 'Spielen ›';
    btn.style.cssText = `
      margin-top: 24px; background: transparent;
      border: 1px solid #d7b06a; border-radius: 8px;
      padding: 10px 32px; color: #d7b06a;
      font-family: 'Geist Mono', monospace; font-size: 13px;
      letter-spacing: 0.1em; cursor: pointer;
    `;
    btn.addEventListener('click', onClick);
    el.appendChild(btn);
    return btn;
  }

  function destroy() { el.remove(); }

  return { el, lockCard, setStatus, showPlayButton, destroy };
}

if (typeof window !== 'undefined') {
  window.MayhemHeroSelect = { buildHeroSelectModal };
}
