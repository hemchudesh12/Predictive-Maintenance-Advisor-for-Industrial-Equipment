import { useState } from 'react';
import { useApexStore } from '../store/apexStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
// Match the exact 7 segments requested:
const SPEEDS = [1, 2, 5, 10, 25, 50, 100];

// Human-readable speed labels to display alongside:
function speedToLabel(speedFactor: number): string {
  const hoursPerMin = speedFactor * 60;
  if (hoursPerMin >= 720) return `≈ ${(hoursPerMin/720).toFixed(1)} months/min`;
  if (hoursPerMin >= 24) return `≈ ${(hoursPerMin/24).toFixed(1)} days/min`;
  return `≈ ${hoursPerMin} hours/min`;
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
      {/* Label Row */}
      <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>Replay speed</span>
        <span className="mono text-micro text-tertiary">
          {speedToLabel(speedFactor)}
        </span>
      </div>

      {/* Pill Container */}
      <div className="pill-container" style={{ marginBottom: 12 }}>
        {SPEEDS.map(s => (
          <div
            key={s}
            className={`pill-segment mono ${speedFactor === s ? 'active' : ''}`}
            onClick={() => changeSpeed(s)}
            style={{ pointerEvents: pending ? 'none' : 'auto' }}
          >
            {s}x
          </div>
        ))}
      </div>
    </div>
  );
}
