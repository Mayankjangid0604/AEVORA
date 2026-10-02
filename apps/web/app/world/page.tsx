import { redirect } from 'next/navigation';

// The walkable office is now the app's root; its UI moved to components/GameShell.tsx.
export default function WorldPage() {
  redirect('/');
}
