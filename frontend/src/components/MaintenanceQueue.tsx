// src/components/MaintenanceQueue.tsx
// Sorted maintenance queue: CRITICAL first, with attribution, counterfactual savings,
// and the cycle-to-time conversion so operators see days/weeks, not raw cycles.

import { useApexStore } from '../store/apexStore';
import type { MachineFrame } from '../types/apex';

const URGENCY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, MONITOR: 2, HEALTHY: 3 };

// Convert cycles to a human-readable time label  (1 cycle ≈ 1 hour)
function rulToTime(rul: number): string {
  if (rul <= 0)    return 'OVERDUE';
  if (rul < 24)    return `${rul.toFixed(0)}h`;
  if (rul < 168)   return `${(rul / 24).toFixed(1)} days`;
  if (rul < 720)   return `${(rul / 168).toFixed(1)} weeks`;
  return `${(rul / 720).toFixed(1)} months`;
}

function QueueRow({ machine, rank, savings }: { machine: MachineFrame; rank: number; savings: number }) {
  const { urgency, component_attribution: attr, rul_mean } = machine;
  const isCritical = urgency.level === 'CRITICAL';
  const isWarning  = urgency.level === 'WARNING';

  return (
    <div
      className="card"
      style={{
        marginBottom: 'var(--gap-card)',
        borderLeft: `3px solid ${urgency.color_token}`,
        transition: 'border-color var(--transition-color), box-shadow var(--transition-color)',
        boxShadow: isCritical ? 'var(--color-critical-glow)' : isWarning ? 'var(--color-warning-glow)' : 'none',
        padding: '14px 16px',
      }}
    >
      {/* Row header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="muted mono" style={{ fontSize: 11 }}>#{rank}</span>
          <span className="section-title" style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {machine.machine_id}
          </span>
          <span className={`badge badge-${urgency.level}`}>{urgency.level}</span>
        </div>
        <div className="text-right">
          <div
            className="metric-value"
            style={{ fontSize: 18, color: urgency.color_token, transition: 'color 400ms ease' }}
          >
            {rul_mean.toFixed(1)} cy
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            ≈ {rulToTime(rul_mean)} remaining
          </div>
        </div>
      </div>

      {/* Component attribution */}
      <div style={{
        marginTop: 10,
        padding: '8px 12px',
        background: 'var(--apex-surface-2)',
        borderRadius: 8,
      }}>
        <div className="flex justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
            🔧 {attr.component}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {Math.round(attr.confidence * 100)}% confidence
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {attr.recommendation}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          Rule: {attr.triggered_rule}
        </div>
      </div>

      {/* Counterfactual savings — CRITICAL and WARNING */}
      {(isCritical || isWarning) && savings > 0 && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(52,199,89,0.07)',
          border: '1px solid rgba(52,199,89,0.2)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <span style={{ color: 'var(--color-healthy)', fontWeight: 600, fontSize: 12 }}>
              💰 Act now → save ${savings.toLocaleString()}
            </span>
            <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              vs. unplanned catastrophic failure
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>window</div>
            <div style={{ fontSize: 11, color: 'var(--color-healthy)', fontFamily: 'var(--font-mono)' }}>
              {rulToTime(rul_mean)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MaintenanceQueue() {
  const { machines, costConfig } = useApexStore();
  const savings = costConfig?.savings_per_prevention ?? 238000;

  const sorted = Object.values(machines)
    .filter(m => m.urgency.level !== 'HEALTHY')
    .sort((a, b) => (URGENCY_ORDER[a.urgency.level] ?? 9) - (URGENCY_ORDER[b.urgency.level] ?? 9));

  if (sorted.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
        <div className="section-title" style={{ fontSize: 15, marginBottom: 6 }}>Fleet is healthy</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          All engines operating within normal parameters.<br />
          No maintenance actions required.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="section-title"
        style={{ marginBottom: 12, fontSize: 12, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase' }}
      >
        Maintenance Queue ({sorted.length})
      </div>
      {sorted.map((m, i) => (
        <QueueRow key={m.machine_id} machine={m} rank={i + 1} savings={savings} />
      ))}
    </div>
  );
}
