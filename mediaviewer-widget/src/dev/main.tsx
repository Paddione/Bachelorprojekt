import React from 'react';
import ReactDOM from 'react-dom/client';
import '@videovault-player/player.css';
import '../styles/mediaviewer.css';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
