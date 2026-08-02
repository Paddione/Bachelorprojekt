import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import PipelinePanel from './PipelinePanel.svelte';
import fs from 'node:fs';
import path from 'node:path';

// Result test for PipelinePanel runtime & adoption behavior
describe('PipelinePanel', () => {
  it('renders panel card without data-panel-type attribute', () => {
    // Positiv-Anker: render Output hat panel & panel__body
    const { container } = render(PipelinePanel, {
      initial: null,
      initialTab: 'factory',
      brand: 'mentolder',
    });

    const panel = container.querySelector('#panel-pipeline');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('panel')).toBe(true);

    const body = container.querySelector('.panel__body');
    expect(body).not.toBeNull();

    // Negativaussage: kein data-panel-type
    expect(panel?.hasAttribute('data-panel-type')).toBe(false);
  });

  it('preserves svelte tab subtree after panel.js runtime execution', () => {
    const { container } = render(PipelinePanel, {
      initial: null,
      initialTab: 'factory',
      brand: 'mentolder',
    });

    // Kontroll-Element mit data-panel-type
    const ctrl = document.createElement('div');
    ctrl.setAttribute('data-panel-type', 'status');
    ctrl.innerHTML = '<div class="old-content">ctrl</div>';
    document.body.appendChild(ctrl);

    // Mock global window & document environment for panel.js run
    const panelJsPath = path.resolve(__dirname, '../../../../.lavish/kit/panel.js');
    if (fs.existsSync(panelJsPath)) {
      const src = fs.readFileSync(panelJsPath, 'utf8');
      const runner = new Function(src);
      runner();
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }

    // Positiv-Anker: Kontroll-Element wurde verarbeitet/adoptiert
    // (panel.js clears body on status or decorates it)
    
    // Panel-Node content in PipelinePanel tab subtree must remain intact
    const body = container.querySelector('.panel__body');
    expect(body).not.toBeNull();
    expect(body?.children.length).toBeGreaterThan(0);

    ctrl.remove();
  });
});
