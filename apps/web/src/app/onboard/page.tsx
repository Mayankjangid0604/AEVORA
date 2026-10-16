import { OnboardForm } from '@/components/onboard-form';

export const metadata = {
  title: 'Onboard Fresh Business — AEVORA',
  description: 'Register a new company and authorized administrator in AEVORA Company OS.',
};

export default function OnboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-wide">AEVORA</h1>
        <p className="mt-1 text-sm font-medium">Activate a New Business</p>
        <p className="mb-6 text-xs text-muted">Provision your isolated company workspace and primary administrator.</p>
        <OnboardForm />
      </div>
    </main>
  );
}
