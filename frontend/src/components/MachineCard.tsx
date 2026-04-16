// src/components/MachineCard.tsx
// Individual machine card in the sidebar fleet list.
// Shows urgency badge, RUL value, actual cycle, lifecycle bar, mode tag.

import { useApexStore } from '../store/apexStore';
import type { MachineFrame } from '../types/apex';
import { getPumpName, getComponentName } from '../constants/machines';

interface Props {
  machine: MachineFrame;
  index: number;
}

function LifecycleBar({ position }: { position: number }) {
  const pct = Math.round(position * 100);
  const color = position > 0.85 ? 'var(--color-critical)'
    : position > 0.65 ? 'var(--color-warning)'
    : position > 0.45 ? 'var(--color-monitor)'
    : 'var(--color-healthy)';
  return (
    <div className="progress-bar" style={{ marginTop: 7 }}>
      <div
        className="progress-fill"
        style={{ width: `${pct}%`, background: color, transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)' }}
      />
    </div>
  );
}

// Format actual cycle as compact engine time label
function cycleLabel(cycle: number): string {
  if (cycle <= 0) return '';
  if (cycle < 48)           return `${cycle}h`;
  if (cycle < 24 * 14)     return `${Math.round(cycle / 24)}d`;
  if (cycle < 24 * 90)     return `${Math.round(cycle / 168)}w`;
  return `${(cycle / 720).toFixed(1)}mo`;
}

export function MachineCard({ machine, index }: Props) {
  const { selectedMachineId, setSelectedMachine } = useApexStore();
  const isSelected = selectedMachineId === machine.machine_id;
  const { urgency, rul_mean, rul_std, buffer_length, mode, current_cycle } = machine;
  const warming = buffer_length < 30;

  return (
    <div
      id={`machine-card-${index}`}
      className={`card machine-card ${isSelected ? `selected selected-${urgency.level}` : ''}`}
      style={{
        marginBottom: 'var(--gap-card)',
        borderRadius: 'var(--border-radius)',
        padding: '12px 14px',
      }}
      onClick={() => setSelectedMachine(machine.machine_id)}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && setSelectedMachine(machine.machine_id)}
      role="button"
      aria-pressed={isSelected}
      aria-label={`${machine.machine_id}, urgency ${urgency.level}, RUL ${rul_mean.toFixed(0)} cycles`}
    >
      {/* Top row: name + badge */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 14, textAlign: 'right', flexShrink: 0 }}>
            {index + 1}
          </span>
          <span className="section-title" style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {getPumpName(machine.machine_id)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mode !== 'live' && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {mode}
            </span>
          )}
          <span className={`badge badge-${urgency.level}`}>{urgency.level}</span>
        </div>
      </div>

      {/* Attribution component */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 22 }}>
        {getComponentName(machine.machine_id, machine.component_attribution.component)}
      </div>

      {warming ? (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-monitor)' }}>
          ⏳ Warming up ({buffer_length}/30 samples)
          <div className="progress-bar" style={{ marginTop: 5 }}>
            <div className="progress-fill" style={{ width: `${(buffer_length / 30) * 100}%` }} />
          </div>
        </div>
      ) : (
        <>
          {/* RUL + cycle time */}
          <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
            <div className="flex items-center gap-1">
              <span
                className="metric-value"
                style={{ fontSize: 20, color: urgency.color_token, transition: 'color 400ms ease' }}
              >
                {rul_mean.toFixed(1)}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                ±{rul_std.toFixed(1)} cy
              </span>
            </div>
            {current_cycle > 0 && (
              <span
                style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                title={`Cycle ${current_cycle}`}
              >
                {cycleLabel(current_cycle)}
              </span>
            )}
          </div>
          <LifecycleBar position={machine.lifecycle_position} />
        </>
      )}
    </div>
  );
}
