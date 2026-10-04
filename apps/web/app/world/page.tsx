import { WorldViewer } from '../../components/v12-world/WorldViewer';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saahvik Persistent World | Aevora',
  description: 'Aevora V12 3D Spatial Gateway',
};

export default function WorldPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <WorldViewer />
    </main>
  );
}
