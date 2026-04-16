// src/components/ReconnectBanner.tsx
// Amber banner — shown only after 1.5 s of being disconnected (no flicker on brief drops).

import { useEffect, useState } from 'react';
import { useApexStore } from '../store/apexStore';

export function ReconnectBanner() {
  const connectionState = useApexStore(s => s.connectionState);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connectionState === 'connected') {
      setVisible(false);
      return;
    }

    // Only show banner after 1.5 s of non-connected state
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [connectionState]);

  if (!visible) return null;

  const isConnecting = connectionState === 'connecting';
  const label = isConnecting
    ? '🔌 Connecting to APEX backend…'
    : connectionState === 'reconnecting'
      ? '⚡ Reconnecting — last data shown'
      : '🔴 Disconnected — check if backend is running';

  return (
    <div className="reconnect-banner" role="alert" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
