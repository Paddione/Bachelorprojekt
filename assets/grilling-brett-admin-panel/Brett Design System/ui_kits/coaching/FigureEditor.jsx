// ui_kits/coaching/FigureEditor.jsx — figure creation / edit popover.

const FIG_COLORS = [
  { hex: '#b8c0a8', title: 'Standard' },
  { hex: '#e06b6b', title: 'Rot' },
  { hex: '#6ba8e0', title: 'Blau' },
  { hex: '#6be0a0', title: 'Grün' },
  { hex: '#e0c06b', title: 'Gelb' },
  { hex: '#c06be0', title: 'Lila' },
  { hex: '#e0906b', title: 'Orange' },
];

function FigureEditor({
  open,
  onClose,
  mode = 'new',          // 'new' | 'edit'
  color, onColor,
  scale, onScale,
  name, onName,
  onPlace,
}) {
  if (!open) return null;
  const title = mode === 'edit' ? 'FIGUR BEARBEITEN' : 'NEUE FIGUR';

  return (
    <div className="fig-panel" role="dialog" aria-label="Figur-Editor">
      <div className="fig-panel-header">
        <span className="fig-panel-title">{title}</span>
        <button className="fig-panel-close" onClick={onClose} aria-label="Panel schließen">✕</button>
      </div>

      <span className="fig-panel-label">Farbe</span>
      <div className="fig-swatch-row">
        {FIG_COLORS.map(c => (
          <button
            key={c.hex}
            className={`fig-color-swatch ${color === c.hex ? 'active' : ''}`}
            style={{ background: c.hex }}
            title={c.title}
            onClick={() => onColor(c.hex)}
          />
        ))}
      </div>

      <span className="fig-panel-label">Größe</span>
      <div className="fig-scale-row">
        {[
          { key: 'S', value: 0.6 },
          { key: 'M', value: 1.0 },
          { key: 'L', value: 1.5 },
        ].map(s => (
          <button
            key={s.key}
            className={`fig-size-btn ${Math.abs(scale - s.value) < 0.01 ? 'active' : ''}`}
            onClick={() => onScale(s.value)}
          >{s.key}</button>
        ))}
        <input
          type="range" min="0.3" max="2.5" step="0.05"
          value={scale}
          onChange={e => onScale(parseFloat(e.target.value))}
          className="fig-scale-slider"
        />
        <span className="fig-scale-val">{scale.toFixed(2).replace(/\.?0+$/, '')}×</span>
      </div>

      <span className="fig-panel-label">Name</span>
      <input
        type="text"
        className="fig-label-input"
        placeholder="Figur benennen …"
        maxLength={40}
        value={name}
        onChange={e => onName(e.target.value)}
      />

      {mode === 'new' && (
        <button className="fig-panel-add" onClick={onPlace}>
          ＋ Klick auf Brett zum Platzieren
        </button>
      )}
    </div>
  );
}

window.FigureEditor = FigureEditor;
