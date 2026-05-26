// ui_kits/mayhem/LoadoutModal.jsx — pick melee + ranged weapons before round start.

const MELEE  = ['club', 'katana'];
const RANGED = ['handgun', 'rifle', 'fireball'];

function WeaponPick({ name, active, onClick }) {
  return (
    <button className={`weapon-pick ${active ? 'active' : ''}`} onClick={onClick}>
      <img src={`../../assets/icons/icon-${name}.png`} alt={name} />
      <span>{name}</span>
    </button>
  );
}

function LoadoutModal({ initial, onConfirm }) {
  const [loadout, setLoadout] = React.useState(initial ?? { melee: 'club', ranged: 'handgun' });
  return (
    <div className="mode-select-overlay">
      <div className="mode-select-card">
        <h2>Wähle deine Startausrüstung</h2>
        <div className="loadout-cols">
          <div>
            <h3>Nahkampf</h3>
            {MELEE.map(w => (
              <WeaponPick key={w} name={w}
                active={loadout.melee === w}
                onClick={() => setLoadout(l => ({ ...l, melee: w }))} />
            ))}
          </div>
          <div>
            <h3>Fernkampf</h3>
            {RANGED.map(w => (
              <WeaponPick key={w} name={w}
                active={loadout.ranged === w}
                onClick={() => setLoadout(l => ({ ...l, ranged: w }))} />
            ))}
          </div>
        </div>
        <div className="loadout-footer">
          <button className="confirm" onClick={() => onConfirm(loadout)}>Spielen</button>
        </div>
      </div>
    </div>
  );
}

window.LoadoutModal = LoadoutModal;
