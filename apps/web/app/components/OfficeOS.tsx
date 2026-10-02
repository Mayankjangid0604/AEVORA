'use client';

// OfficeOS: the desk computer. A window over the 3D world that hosts the existing pages unchanged.
// Sign-in happens here (AuthGate), not before the world. Esc or "Back to office" returns to "/".

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ArrowLeft, SignOut, SquaresFour } from '@phosphor-icons/react';
import { clearToken } from '../lib/api';
import AuthGate from './AuthGate';
import VoiceButton from './VoiceButton';
import RealtimeToasts from './RealtimeToasts';
import CeoQuestionDialog from './CeoQuestionDialog';
import { appFor } from './os-apps';

export default function OfficeOS({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const onDesktop = pathname === '/os';
  const title = onDesktop ? 'OfficeOS' : appFor(pathname)?.label ?? 'OfficeOS';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A page's own dialog (e.g. the CEO question) gets Esc first; everything else, sign-in included, leaves.
      if (document.querySelector('.os-overlay [role="dialog"], .os-overlay [aria-modal="true"]')) return;
      router.push('/');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <div className="os-overlay" role="dialog" aria-label="OfficeOS">
      <div className="os-window">
        <header className="os-titlebar">
          {!onDesktop && (
            <Link href="/os" className="btn btn-secondary os-btn"><SquaresFour size={14} aria-hidden="true" /> Desktop</Link>
          )}
          <span className="os-title">{title}</span>
          <button type="button" className="btn btn-secondary os-btn" onClick={() => { clearToken(); window.location.href = '/'; }}>
            <SignOut size={14} aria-hidden="true" /> Sign out
          </button>
          <Link href="/" className="btn btn-primary os-btn"><ArrowLeft size={14} aria-hidden="true" /> Back to office <kbd>Esc</kbd></Link>
        </header>
        <main className="main-content os-body">
          <AuthGate>
            {children}
            <VoiceButton />
            <RealtimeToasts />
            <CeoQuestionDialog />
          </AuthGate>
        </main>
      </div>
    </div>
  );
}
