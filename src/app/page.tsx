'use client';

import dynamic from 'next/dynamic';

const GameMount = dynamic(() => import('@/components/GameMount'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Georgia, serif',
        color: '#f6efdd',
        background: '#3a2314',
      }}
    >
      <p>Setting up the shop table…</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', margin: 0 }}>
      <h1 className="sr-only">Tidy Tapes — cozy cassette sorting game</h1>
      <GameMount />
    </main>
  );
}
