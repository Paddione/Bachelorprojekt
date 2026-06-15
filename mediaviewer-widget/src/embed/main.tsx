import React from 'react';
import ReactDOM from 'react-dom/client';
import { EmbedApp } from './EmbedApp';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <EmbedApp />
    </React.StrictMode>,
  );
}
