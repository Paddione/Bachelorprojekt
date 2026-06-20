import React from 'react';
import { Icons } from './Icons';

interface Props {
  levelNo: string;
  answer: string | null;
  onAddToClipboard: () => void;
}

export function AnswerPanel({ levelNo, answer, onAddToClipboard }: Props) {
  return (
    <section className="block">
      <div className="block-head">
        <div className="bl"><span className="bt">KI-Antwort</span></div>
      </div>
      <div className={'answer' + (answer ? '' : ' empty')}>
        <div className="a-head">
          <span className="lab"><span className="dot dot-aktiv" />Antwort · Ebene {levelNo}</span>
          {answer && (
            <button className="btn btn-quiet btn-sm" onClick={onAddToClipboard} type="button">
              <Icons.copy />In Zwischenablage
            </button>
          )}
        </div>
        <div className="a-body">
          {answer ?? 'Noch keine Antwort — Eingabe senden, um eine Antwort für diese Ebene zu erzeugen.'}
        </div>
      </div>
    </section>
  );
}
