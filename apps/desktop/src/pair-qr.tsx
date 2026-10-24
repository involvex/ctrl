import { useEffect, useState } from 'react';
import { encodePairPayload } from '@involvex/ctrl-s';
import { toDataURL } from 'qrcode';

type PairQrProps = {
  gatewayUrl: string;
  token: string;
};

/**
 * LAN pair QR for the phone Scan screen (same JSON as ctrl-f5 pair).
 */
export function PairQr({ gatewayUrl, token }: PairQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const payload = encodePairPayload({
    v: 1,
    gatewayUrl,
    token,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 180,
          color: { dark: '#00ff66', light: '#000000' },
        });
        if (!cancelled) {
          setDataUrl(url);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setDataUrl(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="pair-qr">
      <p className="host-title">phone pair QR</p>
      {dataUrl ? (
        <img className="pair-qr-img" src={dataUrl} alt="ctrl pair QR" />
      ) : (
        <p className="meta">{error ?? 'building QR…'}</p>
      )}
      <p className="meta">Scan with mobile → Connect → Scan pair QR</p>
      <div className="host-row">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            void navigator.clipboard.writeText(payload);
          }}
        >
          copy pair payload
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            void navigator.clipboard.writeText(gatewayUrl);
          }}
        >
          copy LAN URL
        </button>
      </div>
    </div>
  );
}
