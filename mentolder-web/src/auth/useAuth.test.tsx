import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';

vi.mock('../lib/homepageApi', () => ({ getMe: vi.fn() }));
import { getMe } from '../lib/homepageApi';

function Probe() {
  const { authenticated, isAdmin, loading, user } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{`auth=${authenticated} admin=${isAdmin} name=${user?.name ?? '-'}`}</div>;
}

beforeEach(() => {
  (getMe as any).mockReset();
});

describe('useAuth', () => {
  it('exposes an authenticated admin from /api/auth/me', async () => {
    (getMe as any).mockResolvedValue({
      authenticated: true,
      user: { name: 'Gerald', email: 'g@m.de', username: 'gekko', isAdmin: true },
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('auth=true admin=true name=Gerald')).toBeInTheDocument());
  });

  it('exposes an authenticated non-admin', async () => {
    (getMe as any).mockResolvedValue({
      authenticated: true,
      user: { name: 'User', email: 'u@m.de', username: 'user', isAdmin: false },
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/auth=true admin=false/)).toBeInTheDocument());
  });

  it('treats an unauthenticated response as logged out', async () => {
    (getMe as any).mockResolvedValue({ authenticated: false });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/auth=false admin=false/)).toBeInTheDocument());
  });

  it('treats a thrown fetch error as logged out', async () => {
    (getMe as any).mockRejectedValue(new Error('network'));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/auth=false admin=false/)).toBeInTheDocument());
  });
});
