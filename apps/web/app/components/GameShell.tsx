'use client';

import OfficeOS from './OfficeOS';

export default function GameShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="game-shell">
      <OfficeOS>{children}</OfficeOS>
    </div>
  );
}
