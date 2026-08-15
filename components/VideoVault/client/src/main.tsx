import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/cybervault-videovault.css';
import '@videovault-player/player.css';
import './i18n';

async function enableMswIfRequested() {
  // Enable MSW in the browser when explicitly requested via env
  if (import.meta.env.VITE_E2E_MSW === 'true') {
    try {
      const { worker } = await import('./mocks/browser');
      await worker.start({ onUnhandledRequest: 'bypass' });

      console.log('[MSW] Worker started for E2E tests');
    } catch (err) {
      console.warn('[MSW] Failed to start worker:', err);
    }
  }
}

void enableMswIfRequested().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
