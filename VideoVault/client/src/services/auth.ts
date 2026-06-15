const authServiceUrlRaw = (import.meta as any)?.env?.VITE_AUTH_SERVICE_URL || 'http://localhost:5500';
const authServiceUrl = authServiceUrlRaw.replace(/\/+$/, '');
const AUTH_SERVICE_API_URL = authServiceUrl.endsWith('/api')
  ? authServiceUrl
  : `${authServiceUrl}/api`;

type Listener = (isAdmin: boolean) => void;

export class AuthService {
  private static admin = false;
  private static listeners = new Set<Listener>();

  static subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private static notify() {
    Array.from(this.listeners).forEach((l) => l(this.admin));
  }

  static get cachedIsAdmin() { return this.admin; }

  private static async refreshTokens(): Promise<boolean> {
    try {
      const response = await fetch(`${AUTH_SERVICE_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private static async refreshInternal(allowRefresh: boolean): Promise<boolean> {
    try {
      const response = await fetch(`${AUTH_SERVICE_API_URL}/auth/verify`, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });

      if (!response.ok) {
        if (allowRefresh && response.status === 401) {
          const refreshed = await this.refreshTokens();
          if (refreshed) {
            return this.refreshInternal(false);
          }
        }
        this.admin = false;
        this.notify();
        return this.admin;
      }

      const data = await response.json().catch(() => null);
      this.admin = data?.user?.role === 'ADMIN';
    } catch (e: any) {
      this.admin = false;
    }
    this.notify();
    return this.admin;
  }

  static async refresh(): Promise<boolean> {
    return this.refreshInternal(true);
  }

  static async login(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch(`${AUTH_SERVICE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ usernameOrEmail: username, password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const msg = (error?.message as string) || (error?.error as string) || 'Login failed';
        this.admin = false;
        this.notify();
        return { ok: false, message: msg };
      }

      const data = await response.json().catch(() => null);
      this.admin = data?.user?.role === 'ADMIN';
      this.notify();
      return { ok: true };
    } catch (e: any) {
      this.admin = false;
      this.notify();
      const msg = (e?.body?.message as string) || 'Login failed';
      return { ok: false, message: msg };
    }
  }

  static async logout(): Promise<void> {
    try {
      await fetch(`${AUTH_SERVICE_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
    } catch {}
    this.admin = false;
    this.notify();
  }

  static async promptAndLogin(): Promise<boolean> {
    const u = window.prompt('Admin username:', 'admin');
    if (!u) return false;
    const p = window.prompt('Admin password:', '');
    if (p == null) return false;
    const res = await this.login(u, p);
    if (!res.ok) alert(res.message || 'Login failed');
    return res.ok;
  }
}
