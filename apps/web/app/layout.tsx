import './globals.css';
import GameShell from './components/GameShell';

const THEME_SCRIPT = `try{var t=localStorage.getItem('aevora_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export const metadata = {
  title: 'AEVORA — Chairman Control Center',
  description: 'AI Company Command Interface',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (no dark→light flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* The 3D world is always on screen; every other route opens inside OfficeOS (which holds AuthGate). */}
        <GameShell>{children}</GameShell>
      </body>
    </html>
  );
}
