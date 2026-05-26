// ui_kits/mayhem/CombatHUD.jsx — HP bar + 5-slot weapon strip + ammo counter.

const ALL_WEAPONS = [
  { key: '1', name: 'handgun',  ammo: '24 / 90' },
  { key: '2', name: 'rifle',    ammo: '17 / 60' },
  { key: '3', name: 'fireball', ammo: '∞' },
  { key: '4', name: 'club',     ammo: '—' },
  { key: '5', name: 'katana',   ammo: '—' },
];

function CombatHUD({ hp = 84, hpMax = 100, activeKey = '2', mode = 'MAYHEM SOLO', loadout }) {
  // Filter visible slots: melee + ranged from loadout, but also show the standard 5 for clarity.
  const allowedNames = new Set([loadout?.melee ?? 'club', loadout?.ranged ?? 'rifle']);
  const slots = ALL_WEAPONS.map(w => ({ ...w, owned: allowedNames.has(w.name) }));
  const active = slots.find(s => s.key === activeKey) || slots[1];
  const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));

  return (
    <div className="combat-hud">
      <div className="hp-wrap" aria-label="HP">
        <div className="hp-fill" style={{ width: `${hpPct}%` }} />
        <div className="hp-text">{hp} / {hpMax}</div>
      </div>
      <div className="mode-indicator">{mode}</div>
      <div className="ammo">{active.ammo}</div>
      <div className="weapon-slots">
        {slots.map(s => (
          <div key={s.key} className={`slot ${s.key === activeKey ? 'active' : ''} ${s.owned ? '' : 'dimmed'}`}>
            <img src={`../../assets/icons/icon-${s.name}.png`} alt={s.name} />
            <span className="key">{s.key}</span>
          </div>
        ))}
      </div>
      <div className="crosshair" aria-hidden="true">＋</div>
    </div>
  );
}

window.CombatHUD = CombatHUD;
