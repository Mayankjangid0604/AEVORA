import { LoginForm } from '@/components/login-form';
import { safeNextPath } from '@/lib/http';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const { next, reason } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold tracking-wide">AEVORA</h1>
        <p className="mb-6 text-sm text-muted">Sign in to the Company OS</p>
        {reason === 'expired' && (
          <p role="status" className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-warn">
            Your session ended. Sign in again.
          </p>
        )}
        <LoginForm next={safeNextPath(next)} />
      </div>
    </main>
  );
}
