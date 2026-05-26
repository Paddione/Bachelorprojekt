// ui_kits/coaching/AppearanceDrawer.jsx — face / body / accessories editor

const FACES = [
  'neutral', 'observing', 'present', 'curious', 'yearning', 'protective',
  'distant', 'withdrawn', 'overwhelmed', 'mourning', 'resolved', 'blocked',
];

const BODIES = [
  { key: 'adult-tall',    label: 'Erwachsen — groß' },
  { key: 'adult-average', label: 'Erwachsen — mittel' },
  { key: 'adult-short',   label: 'Erwachsen — klein' },
  { key: 'adolescent',    label: 'Jugendlich' },
  { key: 'child',         label: 'Kind' },
  { key: 'elder',         label: 'Älter' },
];

const ACC_HEAD  = ['hair-short', 'hair-bun', 'hair-long', 'hair-braid', 'hair-curls', 'cap', 'crown', 'veil', 'blindfold'];
const ACC_UPPER = ['tunic', 'coat', 'apron', 'robe', 'vest', 'shawl', 'satchel', 'cane'];
const ACC_FEET  = ['boots-work', 'shoes-dress', 'sandals', 'barefoot'];

function ThumbItem({ kind, name, active, onClick }) {
  const src = (kind === 'face')
    ? `../../assets/figure-pack/faces/${name}.png`
    : `../../assets/figure-pack/accessories/${name}.png`;
  return (
    <button className={`thumb-item ${active ? 'active' : ''}`} onClick={onClick}>
      <img src={src} alt={name} />
      <span>{name.replace(/-/g, ' ')}</span>
    </button>
  );
}

function NullItem({ active, onClick, label = 'keine' }) {
  return (
    <button className={`thumb-item null-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="thumb-null">∅</div>
      <span>{label}</span>
    </button>
  );
}

function AppearanceDrawer({ open, draft, onChange, onCancel, onApply }) {
  return (
    <aside className={`appearance-drawer ${open ? 'open' : ''}`} aria-modal="true">
      <div className="drawer-header">
        <span>AUSSEHEN</span>
        <button className="drawer-close" onClick={onCancel}>✕</button>
      </div>

      <div className="drawer-section">
        <div className="drawer-section-title">Gesicht</div>
        <div className="thumb-grid">
          <NullItem active={!draft.face} onClick={() => onChange({ face: null })} label="neutral" />
          {FACES.map(f => (
            <ThumbItem
              key={f} kind="face" name={f}
              active={draft.face === f}
              onClick={() => onChange({ face: f })}
            />
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <div className="drawer-section-title">Körpertyp</div>
        <div className="body-grid">
          {BODIES.map(b => (
            <button
              key={b.key}
              className={`body-pick ${draft.body === b.key ? 'active' : ''}`}
              onClick={() => onChange({ body: b.key })}
            >{b.label}</button>
          ))}
        </div>
      </div>

      <div className="drawer-section">
        <div className="drawer-section-title">Accessoires</div>

        <div className="acc-group">
          <div className="acc-group-label">Kopf</div>
          <div className="thumb-grid">
            <NullItem active={!draft.acc.head} onClick={() => onChange({ acc: { ...draft.acc, head: null } })} />
            {ACC_HEAD.map(a => (
              <ThumbItem key={a} kind="acc" name={a}
                active={draft.acc.head === a}
                onClick={() => onChange({ acc: { ...draft.acc, head: a } })} />
            ))}
          </div>
        </div>

        <div className="acc-group">
          <div className="acc-group-label">Oberkörper</div>
          <div className="thumb-grid">
            <NullItem active={!draft.acc.upper} onClick={() => onChange({ acc: { ...draft.acc, upper: null } })} />
            {ACC_UPPER.map(a => (
              <ThumbItem key={a} kind="acc" name={a}
                active={draft.acc.upper === a}
                onClick={() => onChange({ acc: { ...draft.acc, upper: a } })} />
            ))}
          </div>
        </div>

        <div className="acc-group">
          <div className="acc-group-label">Füße</div>
          <div className="thumb-grid">
            <NullItem active={!draft.acc.feet} onClick={() => onChange({ acc: { ...draft.acc, feet: null } })} />
            {ACC_FEET.map(a => (
              <ThumbItem key={a} kind="acc" name={a}
                active={draft.acc.feet === a}
                onClick={() => onChange({ acc: { ...draft.acc, feet: a } })} />
            ))}
          </div>
        </div>
      </div>

      <div className="drawer-footer">
        <button className="drawer-cancel" onClick={onCancel}>Abbrechen</button>
        <button className="drawer-apply" onClick={onApply}>Übernehmen</button>
      </div>
    </aside>
  );
}

window.AppearanceDrawer = AppearanceDrawer;
