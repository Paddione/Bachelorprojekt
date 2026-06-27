import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { loginUrl, logoutUrl } from '../lib/homepageApi';

// User area for the primary navigation: a Login link when logged out, or a
// profile dropdown (name/email · "Edit Homepage" for admins · Logout) when
// logged in. Login/Logout are full-page navigations to the website's auth
// endpoints (cross-origin, same-site) — the React app has no backend.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function UserMenu() {
  const { authenticated, user, isAdmin, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Avoid an auth-state flicker (Login → profile) before /api/auth/me resolves.
  if (loading) return null;

  if (!authenticated || !user) {
    const returnTo = typeof window !== 'undefined' ? window.location.href : '/';
    return (
      <a
        href={loginUrl(returnTo)}
        className="text-[14px] font-medium no-underline transition-colors text-fg-soft hover:text-fg"
      >
        Login
      </a>
    );
  }

  const returnHome = typeof window !== 'undefined' ? `${window.location.origin}/` : '/';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Benutzermenü"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-line-2 px-2.5 py-1.5 text-fg hover:text-fg"
      >
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-ink-900"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%)',
          }}
          aria-hidden="true"
        >
          {initials(user.name)}
        </span>
        <span className="hidden sm:inline text-[13px] font-medium max-w-[140px] truncate">{user.name}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 min-w-[220px] rounded-lg border border-line bg-ink-900/95 backdrop-blur-md p-2 shadow-lg z-50"
        >
          <div className="px-3 py-2 border-b border-line/60">
            <div className="text-[13px] font-medium text-fg truncate">{user.name}</div>
            <div className="text-[12px] text-mute truncate">{user.email}</div>
          </div>
          {isAdmin && (
            <Link
              to="/admin/homepage"
              className="block px-3 py-2 rounded text-[14px] text-fg-soft hover:text-fg no-underline"
              onClick={() => setOpen(false)}
            >
              Edit Homepage
            </Link>
          )}
          <a
            href={logoutUrl(returnHome)}
            className="block px-3 py-2 rounded text-[14px] text-fg-soft hover:text-fg no-underline"
          >
            Logout
          </a>
        </div>
      )}
    </div>
  );
}
