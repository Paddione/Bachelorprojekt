// brett/public/assets/coaching/hud.mjs
import { buildHudModel } from './hud-model.mjs';
import { createPhaseState } from './phases.mjs';
import { createPresence } from './presence.mjs';

export function mountCoachingHud({ wire, isAdmin, root = document.body }) {
  const phase = createPhaseState();
  const presence = createPresence();

  const el = document.createElement('div');
  el.id = 'coaching-hud';
  el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:50;' +
    'background:#161b22ee;border:1px solid #2a3340;border-radius:10px;padding:8px 14px;color:#e6edf3;' +
    'font:13px/1.3 system-ui,sans-serif;display:flex;gap:14px;align-items:center;';
  root.appendChild(el);

  const panel = document.createElement('div');
  panel.id = 'coaching-participants';
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:50;background:#161b22ee;' +
    'border:1px solid #2a3340;border-radius:10px;padding:8px 12px;color:#e6edf3;font:13px system-ui;min-width:140px;';
  root.appendChild(panel);

  function render() {
    const m = buildHudModel({ steps: phase.steps(), index: phase.index(), participants: presence.list(), isAdmin });
    el.innerHTML = '';
    const lbl = document.createElement('span');
    lbl.textContent = `Phase: ${m.phaseLabel} (${m.phaseProgress})`;
    el.appendChild(lbl);
    if (m.showControls) {
      const back = document.createElement('button'); back.textContent = '‹'; back.disabled = !m.canBack;
      const fwd = document.createElement('button'); fwd.textContent = '›'; fwd.disabled = !m.canAdvance;
      back.onclick = () => { phase.back(); pushSteps(); render(); };
      fwd.onclick = () => { phase.advance(); pushSteps(); render(); };
      el.appendChild(back); el.appendChild(fwd);
    }
    panel.innerHTML = '<strong>Teilnehmer</strong>';
    for (const p of m.participants) {
      const row = document.createElement('div');
      row.style.cssText = `margin-top:4px;border-left:3px solid ${p.color};padding-left:6px;`;
      row.textContent = p.name;
      panel.appendChild(row);
    }
  }
  function pushSteps() { wire.send('admin_coaching_steps_set', { steps: phase.steps(), index: phase.index() }); }

  wire.on('snapshot', (m) => {
    if (m.coachingSteps?.steps) {
      phase.setSteps(m.coachingSteps.steps);
      phase.setIndex(m.coachingSteps.index | 0);
    }
    for (const p of m.participants || []) presence.join(p);
    render();
  });
  wire.on('coaching_steps_change', (m) => { phase.setSteps(m.steps); phase.setIndex(m.index | 0); render(); });
  wire.on('presence_join', (m) => { presence.join(m); render(); });
  wire.on('presence_leave', (m) => { presence.leave(m.userId); render(); });

  render();
  return { render };
}
