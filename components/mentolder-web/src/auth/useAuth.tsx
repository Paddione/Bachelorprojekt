import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, type AuthUser } from '../lib/homepageApi';

export interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
}

const LOGGED_OUT: AuthState = { authenticated: false, user: null, isAdmin: false, loading: false };

const AuthContext = createContext<AuthState>({ ...LOGGED_OUT, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...LOGGED_OUT, loading: true });

  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        if (me.authenticated && me.user) {
          setState({ authenticated: true, user: me.user, isAdmin: !!me.user.isAdmin, loading: false });
        } else {
          setState(LOGGED_OUT);
        }
      })
      .catch(() => {
        if (active) setState(LOGGED_OUT);
      });
    return () => {
      active = false;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
