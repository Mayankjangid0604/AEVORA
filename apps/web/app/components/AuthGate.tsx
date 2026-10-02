'use client';

import { useEffect, useState } from 'react';
import { getToken, login } from '../lib/api';

/** Shows the sign-in screen until a JWT exists; any 401 from the API brings it back. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    setState(getToken() ? 'in' : 'out');
    const onUnauthorized = () => setState('out');
    window.addEventListener('aevora:unauthorized', onUnauthorized);
    return () => window.removeEventListener('aevora:unauthorized', onUnauthorized);
  }, []);

  if (state === 'checking') return null;
  if (state === 'out') return <SignIn onSignedIn={() => {
    setState('in');
    // Came from the office (/?→/os?next=/): go straight back to it, now with the session. Same-site paths only.
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) window.location.href = next; else window.location.reload();
  }} />;
  return <>{children}</>;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await login(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else onSignedIn();
  }

  return (
    <div className="signin">
      <div className="signin-glow" aria-hidden="true" />
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-mark" aria-hidden="true">A</div>
        <h1>AEVORA</h1>
        <p className="signin-sub">Chairman Control Center</p>

        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="signin-error" role="alert">{error}</div>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
