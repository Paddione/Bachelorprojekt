import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Portrait from './Portrait.svelte';

describe('Portrait.svelte', () => {
  it('renders with the image src and an accessible role when avatarType is image', () => {
    const { container } = render(Portrait, {
      props: {
        avatarType: 'image',
        avatarSrc: '/gerald.jpg',
        name: 'Gerald Korczewski',
        role: 'Coach & digitaler Begleiter',
      },
    });
    const wrap = container.querySelector('[role="img"]') as HTMLElement | null;
    expect(wrap).toBeTruthy();
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/gerald.jpg');
  });

  // T002507: Die reservierte Layout-Flaeche muss dem echten Bild entsprechen.
  // Zuvor deklarierte die Komponente 600x600 — passend zu den quadratischen
  // Derivaten, die den Oberkopf abgeschnitten hatten. Beim Umstellen auf 4:5
  // muessen beide Seiten mitwandern, sonst reserviert der Browser die falsche
  // Box und die width/height-Attribute verursachen genau den Layout-Shift, den
  // sie verhindern sollen.
  it('declares the 4:5 intrinsic dimensions of the portrait derivatives', () => {
    const { container } = render(Portrait, {
      props: {
        avatarType: 'image',
        avatarSrc: '/gerald.webp',
        name: 'Gerald Korczewski',
        role: 'Coach & digitaler Begleiter',
      },
    });
    const img = container.querySelector('img') as HTMLImageElement | null;
    const width = Number(img?.getAttribute('width'));
    const height = Number(img?.getAttribute('height'));
    expect(width).toBe(600);
    expect(height).toBe(750);
    expect(width * 5).toBe(height * 4);
  });

  it('renders initials placeholder when avatarType is initials', () => {
    const { container } = render(Portrait, {
      props: {
        avatarType: 'initials',
        avatarInitials: 'GK',
        name: 'Gerald Korczewski',
        role: 'Coach & digitaler Begleiter',
      },
    });
    const initialsText = container.querySelector('.initials-text');
    expect(initialsText?.textContent).toBe('GK');
  });

  it('renders caption name and role', () => {
    const { container } = render(Portrait, {
      props: {
        avatarType: 'initials',
        avatarInitials: 'GK',
        name: 'Gerald Korczewski',
        role: 'Coach & digitaler Begleiter',
      },
    });
    expect(container.querySelector('.caption-name')?.textContent).toContain('Gerald Korczewski');
    expect(container.querySelector('.caption-role')?.textContent).toContain('Coach & digitaler Begleiter');
  });
});
