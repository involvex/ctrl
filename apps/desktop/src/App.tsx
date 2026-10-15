import { useCallback, useEffect, useState } from 'react';
import { streamDemo } from '@involvex/ctrl-i';

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
      getLanUrls: () => Promise<string[]>;
    };
  }
}

export function App() {
  const [gatewayUrl, setGatewayUrl] = useState(
    window.ctrlGatewayUrl ?? 'starting…'
  );
  const [status, setStatus] = useState('starting');
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [streamText, setStreamText] = useState('');
  const [streamState, setStreamState] = useState('idle');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const api = window.ctrlDesktop;
      if (!api) {
        return;
      }
      try {
        const [url, st, lan] = await Promise.all([
          api.getGatewayUrl(),
          api.getGatewayStatus(),
          api.getLanUrls(),
        ]);
        if (cancelled) {
          return;
        }
        setGatewayUrl(url);
        setStatus(st.state);
        setLanUrls(lan);
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

  const runDemo = useCallback(() => {
    if (status !== 'running' || !gatewayUrl.startsWith('http') || busy) {
      return;
    }
    setBusy(true);
    setStreamText('');
    setStreamState('connecting');
    const stop = streamDemo(gatewayUrl, {
      onEvent: (event) => {
        if (event.type === 'run.started') {
          setStreamState('streaming');
          setStreamText('');
        }
        if (event.type === 'message.delta') {
          setStreamText((prev) => prev + event.text);
        }
        if (event.type === 'run.completed') {
          setStreamState('done');
          setBusy(false);
        }
        if (event.type === 'run.failed') {
          setStreamState(`failed: ${event.error.message}`);
          setBusy(false);
        }
      },
      onError: (err) => {
        setStreamState(`error: ${err.message}`);
        setBusy(false);
      },
      onClose: () => {
        setStreamState((s) => (s === 'streaming' ? 'done' : s));
        setBusy(false);
      },
    });
    window.setTimeout(stop, 15_000);
  }, [busy, gatewayUrl, status]);

  return (
    <main className="splash">
      <h1 className="brand">ctrl</h1>
      <p className="tagline">local agent platform</p>
      <p className="meta">
        gateway [{status}] → {gatewayUrl}
      </p>
      {lanUrls.length > 0 ? (
        <p className="meta lan">LAN (Expo): {lanUrls.join(' · ')}</p>
      ) : null}
      <button
        type="button"
        className="demo-btn"
        onClick={runDemo}
        disabled={busy || status !== 'running'}
      >
        {busy ? 'streaming…' : 'run demo stream'}
      </button>
      <p className="meta">
        demo [{streamState}]: {streamText || '…'}
      </p>
    </main>
  );
}
