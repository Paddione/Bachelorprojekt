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
