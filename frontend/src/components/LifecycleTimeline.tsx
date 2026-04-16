// src/components/LifecycleTimeline.tsx
// Horizontal progress bar showing where in the engine's lifecycle we are.
// 1 cycle = 1 hour of operation; average FD001 engine lifetime ≈ 206 cycles.

import type { MachineFrame } from '../types/apex';

const TOTAL_LIFECYCLE_HOURS = 206; // average FD001 training engine lifetime

interface Props {
  machine: MachineFrame;
  speedFactor: number;
}

function formatHoursConsumed(hours: number): string {
  if (hours < 24) return `Hour ${Math.round(hours)}`;
  const days = hours / 24;
  if (days < 14) return `Day ${days.toFixed(1)}`;
  return `Day ${Math.round(days)}`;
}

export function LifecycleTimeline({ machine, speedFactor }: Props) {
  // lifecycle_position = 1 - (rul_mean / rul_cap), range 0–1
  const pct = Math.min(100, Math.max(0, machine.lifecycle_position * 100));
  const hoursConsumed = machine.lifecycle_position * TOTAL_LIFECYCLE_HOURS;
  const hoursRemaining = Math.max(0, machine.rul_mean); // rul_mean is in cycles = hours

  const barColor =
    pct > 85 ? 'var(--color-critical)'
    : pct > 65 ? 'var(--color-warning)'
    : pct > 45 ? 'var(--color-monitor)'
    : 'var(--color-healthy)';

  const isCritical = machine.urgency.level === 'CRITICAL';

  // Speed context label
  const cyclesPerSec = speedFactor;
  const hoursPerMin = cyclesPerSec * 60;
  const daysPerMin = hoursPerMin / 24;
  const speedContextLabel =
    daysPerMin >= 30
      ? `${(daysPerMin / 30).toFixed(1)} months/min`
      : daysPerMin >= 1
        ? `${daysPerMin.toFixed(1)} days/min`
        : `${hoursPerMin.toFixed(0)} hours/min`;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Label row */}
      <div className="flex justify-between items-center" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {formatHoursConsumed(hoursConsumed)}
          <span style={{ margin: '0 4px', opacity: 0.5 }}>·</span>
          <span style={{ color: barColor, fontWeight: 600 }}>{pct.toFixed(0)}% life consumed</span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {hoursRemaining.toFixed(0)}h remaining
          {speedFactor > 1 && (
            <span style={{ marginLeft: 6, color: 'var(--accent)', opacity: 0.8 }}>
              ⚡ {speedContextLabel}
            </span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'relative',
        height: 6,
        background: 'var(--apex-surface-2)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${pct}%`,
          background: isCritical
            ? `linear-gradient(90deg, var(--color-healthy) 0%, var(--color-monitor) 40%, var(--color-warning) 70%, var(--color-critical) 100%)`
            : `linear-gradient(90deg, var(--color-healthy) 0%, ${barColor} 100%)`,
          transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
          animation: isCritical ? 'criticalPulse 1.4s ease-in-out infinite' : 'none',
        }} />

        {/* Dot marker at current position */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: barColor,
          border: '2px solid var(--apex-bg)',
          boxShadow: `0 0 6px ${barColor}`,
          transition: 'left 600ms cubic-bezier(0.4,0,0.2,1)',
          zIndex: 2,
        }} />
      </div>

      {/* Axis labels */}
      <div className="flex justify-between" style={{ marginTop: 3 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Hour 0</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Hour {TOTAL_LIFECYCLE_HOURS} (avg. lifespan)
        </span>
      </div>

      <style>{`
        @keyframes criticalPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
