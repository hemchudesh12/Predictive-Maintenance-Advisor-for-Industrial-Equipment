// src/components/CriticalAlertBanner.tsx
// FIX 4 — Pulsing banner for unacknowledged critical alerts.
// Shows one row per machine with an Acknowledge button that silences the voice.

import React from 'react';
import { useApexStore } from '../store/apexStore';

export function CriticalAlertBanner() {
  const activeAlerts = useApexStore(s => s.activeAlerts);
  const acknowledgeAlert = useApexStore(s => s.acknowledgeAlert);

  const unacknowledged = Object.values(activeAlerts).filter(a => !a.acknowledged);
  if (unacknowledged.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(127,29,29,0.92)',
        border: '2px solid #dc2626',
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 12,
        animation: 'pulse-border 1.5s ease-in-out infinite',
      }}
    >
      {unacknowledged.map(alert => (
        <div
          key={alert.machineId}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 0',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18 }}>🚨</span>
            <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CRITICAL
            </span>
            <span style={{ color: '#fef2f2', fontWeight: 600, fontSize: 14 }}>
              {alert.machineName} — {alert.component} failure imminent
            </span>
            <span style={{ color: '#fca5a5', fontSize: 11, opacity: 0.8 }}>
              🔊 Voice repeating every 15s
            </span>
          </div>
          <button
            id={`acknowledge-btn-${alert.machineId}`}
            onClick={() => acknowledgeAlert(alert.machineId)}
            style={{
              background: '#dc2626',
              color: 'white',
              border: '1px solid #ef4444',
              borderRadius: 6,
              padding: '6px 18px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
              transition: 'background 200ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#b91c1c')}
            onMouseLeave={e => (e.currentTarget.style.background = '#dc2626')}
          >
            ✓ Acknowledge
          </button>
        </div>
      ))}
    </div>
  );
}
