import React from 'react';
import { Icons } from './Icons';

interface Props {
  items: Array<{ id: string; text: string }>;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function ClipboardPanel({ items, onAdd, onRemove }: Props) {
  return (
    <div className="aux-sec">
      <div className="block-head">
        <div className="bl"><span className="bt">Zwischenablage</span></div>
        <span className="kicker">{items.length} · leert n. Senden</span>
      </div>
      <div className="clip">
        {items.length === 0 && (
          <div className="clip-empty">Leer — Notizen sammeln sich hier, bis Sie senden oder die Ebene wechseln</div>
        )}
        {items.map((it) => (
          <div className="clip-item" key={it.id}>
            <span>{it.text}</span>
            <button onClick={() => onRemove(it.id)} aria-label="Aus Zwischenablage entfernen" type="button"><Icons.x /></button>
          </div>
        ))}
        <button className="clip-add" onClick={onAdd} type="button">+ Notiz aus Eingabe ablegen</button>
      </div>
    </div>
  );
}
