import React from 'react';
import { api } from '../lib/api';

export function ExportView({ sessionId }: { sessionId: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh', background: '#2a2a2a', padding: '40px 0' }}>
      <div style={{ position: 'fixed', top: 18, right: 24, zIndex: 50, display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" onClick={() => window.close()} type="button">Schließen</button>
        <button className="btn btn-primary" onClick={() => window.print()} type="button">Drucken / PDF</button>
      </div>
      <iframe
        title="Session-Export"
        src={api.getSessionExportUrl(sessionId)}
        style={{ display: 'block', width: 820, height: '90vh', margin: '0 auto', border: 'none', background: 'white' }}
      />
    </div>
  );
}
