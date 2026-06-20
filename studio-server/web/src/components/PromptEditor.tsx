import React from 'react';

interface Props {
  levelNo: string;
  prompt: string;
  isDefault: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}

export function PromptEditor({ levelNo, prompt, isDefault, onChange, onReset }: Props) {
  return (
    <section className="block">
      <div className="block-head">
        <div className="bl"><span className="bt">Prompt · Ebene {levelNo}</span></div>
        <div className="actions">
          <span className="prompt-meta">
            {isDefault ? 'Standard geladen' : <span className="edited-tag">bearbeitet</span>}
          </span>
          <button
            className={'switch' + (isDefault ? ' on' : '')}
            onClick={() => { if (!isDefault) onReset(); }}
            aria-pressed={isDefault}
            title={isDefault ? 'Standard-Prompt aktiv' : 'Auf Standard-Prompt zurücksetzen'}
            type="button"
          >
            <span className="track"><span className="knob" /></span>
            <span>{isDefault ? 'Standard' : 'Zurücksetzen'}</span>
          </button>
        </div>
      </div>
      <div className={'prompt-box' + (isDefault ? '' : ' edited')}>
        <textarea
          className="textarea"
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Prompt für Ebene ${levelNo}`}
          spellCheck={false}
        />
      </div>
    </section>
  );
}
