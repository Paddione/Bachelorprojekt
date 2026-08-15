import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserMenu } from './UserMenu';

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }));
import { useAuth } from '../auth/useAuth';

const renderMenu = () => render(<MemoryRouter><UserMenu /></MemoryRouter>);

const setAuth = (s: Partial<{ authenticated: boolean; user: any; isAdmin: boolean; loading: boolean }>) =>
  (useAuth as any).mockReturnValue({
    authenticated: false,
    user: null,
    isAdmin: false,
    loading: false,
    ...s,
  });

beforeEach(() => (useAuth as any).mockReset());

describe('UserMenu', () => {
  it('renders nothing while auth is loading', () => {
    setAuth({ loading: true });
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a Login link pointing at the website auth endpoint when logged out', () => {
    setAuth({ authenticated: false });
    renderMenu();
    const login = screen.getByRole('link', { name: /login/i });
    expect(login.getAttribute('href')).toContain('/api/auth/login?returnTo=');
  });

  it('admin: opening the profile menu shows Edit Homepage → /admin/homepage and Logout', () => {
    setAuth({
      authenticated: true,
      isAdmin: true,
      user: { name: 'Gerald', email: 'g@mentolder.de', username: 'gekko', isAdmin: true },
    });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /benutzermenü/i }));
    const edit = screen.getByRole('link', { name: /edit homepage/i });
    expect(edit).toHaveAttribute('href', '/admin/homepage');
    const logout = screen.getByRole('link', { name: /logout/i });
    expect(logout.getAttribute('href')).toContain('/api/auth/logout');
  });

  it('non-admin: the profile menu has no Edit Homepage entry but still has Logout', () => {
    setAuth({
      authenticated: true,
      isAdmin: false,
      user: { name: 'User', email: 'u@mentolder.de', username: 'user', isAdmin: false },
    });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /benutzermenü/i }));
    expect(screen.queryByRole('link', { name: /edit homepage/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /logout/i })).toBeInTheDocument();
  });

  it('admin: shows the user name/email in the open menu', () => {
    setAuth({
      authenticated: true,
      isAdmin: true,
      user: { name: 'Gerald', email: 'g@mentolder.de', username: 'gekko', isAdmin: true },
    });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /benutzermenü/i }));
    expect(screen.getByText('g@mentolder.de')).toBeInTheDocument();
  });
});
