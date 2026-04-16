// src/components/ReplayControls.tsx
// Speed control: POSTs to /control, simulator polls every 5 cycles and adjusts rate automatically.
// Displays what each speed means in engine operating time per real-world minute.

import { useState } from 'react';
import { useApexStore } from '../store/apexStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const SPEEDS = [1, 2, 5, 10, 25, 50, 100];

// Human-readable labels per speed button
const SPEED_HUMAN_LABELS: Record<number, string> = {
  1:   'Real-time · 1h/sec',
  2:   '2h/sec',
  5:   '5h/sec',
  10:  '~10h/sec',
  25:  '~1 day/sec',
  50:  '~2 days/sec',
  100: '~4 days/sec',
};

// 1 cycle ≈ 1 hour → speedFactor cycles/s → engineHours/s → engineDays per real minute
function speedToTimeRate(speedFactor: number): string {
  const hoursPerRealMin  = speedFactor * 60;          // engine hours per real minute
  const daysPerRealMin   = hoursPerRealMin / 24;      // engine days per real minute
  const monthsPerRealMin = daysPerRealMin / 30;       // engine months per real minute

  if (monthsPerRealMin >= 1)
    return `≈ ${monthsPerRealMin.toFixed(1)} months / min`;
  if (daysPerRealMin >= 1)
    return `≈ ${daysPerRealMin.toFixed(1)} days / min`;
  return `≈ ${hoursPerRealMin.toFixed(0)} hours / min`;
}

export function ReplayControls() {
  const { speedFactor, setSpeedFactor, addToast } = useApexStore();
  const [pending, setPending] = useState(false);

  const changeSpeed = async (val: number) => {
    if (val === speedFactor || pending) return;
    setPending(true);
    setSpeedFactor(val); // optimistic update

    try {
      const res = await fetch(`${API_BASE}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed_factor: val }),
      });
      if (res.ok) {
        const data = await res.json();
        setSpeedFactor(data.speed_factor ?? val);
        addToast({ type: 'success', message: `⚡ Speed → ${val}x  (${speedToTimeRate(val)})` });
      } else {
        addToast({ type: 'warn', message: `Speed change failed (${res.status})` });
        setSpeedFactor(speedFactor); // revert
      }
    } catch {
      addToast({ type: 'warn', message: 'Could not reach backend — speed unchanged' });
      setSpeedFactor(speedFactor);
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Header row */}
      <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
        <span className="sidebar-label">REPLAY SPEED</span>
        <span className="speed-value-display">{speedFactor}x</span>
      </div>

      {/* Speed grid */}
      <div className="speed-grid" style={{ marginBottom: 10 }}>
        {SPEEDS.map(s => (
          <button
            key={s}
            className={`btn ${speedFactor === s ? 'btn-speed-active' : ''}`}
            style={{
              padding: '5px 0',
              fontSize: 12,
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
            }}
            onClick={() => changeSpeed(s)}
            disabled={pending}
            title={SPEED_HUMAN_LABELS[s]}
            aria-label={`Set replay speed to ${s}x — ${SPEED_HUMAN_LABELS[s]}`}
            aria-pressed={speedFactor === s}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Prominent time-rate label */}
      <div style={{
        background: 'var(--apex-surface-2)',
        borderRadius: 8,
        padding: '8px 10px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.02em',
          lineHeight: 1.3,
        }}>
          {pending ? '⏳ Applying…' : SPEED_HUMAN_LABELS[speedFactor] ?? `${speedFactor}x`}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
          {pending ? '' : speedToTimeRate(speedFactor)}
        </div>
      </div>

      <div className="muted" style={{ fontSize: 10, marginTop: 6, textAlign: 'center' }}>
        1 cycle = 1 h engine operation
      </div>
    </div>
  );
}
