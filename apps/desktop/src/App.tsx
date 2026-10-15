import { useEffect, useState } from 'react';

declare global {
  interface Window {
    ctrlGatewayUrl?: string;
    ctrlDesktop?: {
      platform: string;
      getGatewayUrl: () => Promise<string>;
      getGatewayStatus: () => Promise<{
        state: string;
        url?: string;
        error?: string;
        attempt?: number;
      }>;
    };
  }
}

export function App() {
  const [gatewayUrl, setGatewayUrl] = useState(
    window.ctrlGatewayUrl ?? 'starting…'
  );
  const [status, setStatus] = useState('starting');

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const api = window.ctrlDesktop;
      if (!api) {
        return;
      }
      try {
        const [url, st] = await Promise.all([
          api.getGatewayUrl(),
          api.getGatewayStatus(),
        ]);
        if (cancelled) {
          return;
        }
        setGatewayUrl(url);
        setStatus(st.state);
      } catch {
        if (!cancelled) {
          setStatus('unavailable');
        }
      }
    }

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <main className="splash">
      <h1 className="brand">ctrl</h1>
      <p className="tagline">local agent platform</p>
      <p className="meta">
        gateway [{status}] → {gatewayUrl}
      </p>
    </main>
  );
}
